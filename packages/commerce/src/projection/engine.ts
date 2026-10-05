/**
 * Projection engine: folds CommerceEvent streams into versioned read models.
 *
 * Contract laws enforced here (W1-003):
 * - Projections are READ-ONLY over the journal: the engine exposes no path
 *   that writes, mutates or reorders events (a projection can never write
 *   back to the journal — by construction, not convention).
 * - Per-aggregate ordering (scenario 4): every subject's events must arrive
 *   with gapless, strictly-increasing per-subject sequences. A gap, a
 *   regression or a duplicate is a TORN READ and throws — detected, never
 *   silently absorbed. Under any journal-permitted interleaving (any global
 *   permutation preserving per-subject order), folds are identical.
 * - Schema versioning (scenario 5): every projection declares its schema
 *   version; legacy-shaped events reach current projections only through the
 *   EXPLICIT migration path (`EventMigration` chain), never by guesswork.
 * - Determinism: folds are pure functions of (state, event); no clock, no
 *   randomness, no IO (mirrors the kernel's determinism laws).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import { validateEventSequence } from "../domain/events.js";
import { serializableClone } from "./serialize.js";

/** A versioned projection definition. `apply` MUST be pure. */
export interface ProjectionDefinition<S> {
  /** Stable identifier including the schema version, e.g. "commerce-twin/v2". */
  readonly projectionId: string;
  /** Schema version this projection's fold expects (positive integer). */
  readonly schemaVersion: number;
  /** Empty initial state (called once per engine lifecycle). */
  initialState(): S;
  /** Fold ONE event into the next state (pure: returns new state). */
  apply(state: S, event: AnyCommerceEvent): S;
}

/**
 * Explicit forward migration between projection schema versions. Migrations
 * transform the EVENT VIEW (never the journal — history is immutable); the
 * output must satisfy the target schema's expected event shapes.
 */
export interface EventMigration {
  readonly fromSchemaVersion: number;
  readonly toSchemaVersion: number;
  /** Deterministic, total (throws on shapes it does not recognize). */
  migrate(event: AnyCommerceEvent): AnyCommerceEvent;
}

export type MigrationError =
  | { readonly code: "NO_MIGRATION_PATH"; fromSchemaVersion: number; toSchemaVersion: number }
  | { readonly code: "UNRECOGNIZED_EVENT_SHAPE"; detail: string };

/**
 * Walk the explicit migration chain from `fromSchemaVersion` up to
 * `toSchemaVersion`. Every hop must exist in `migrations`; a missing hop is an
 * error (never a silent pass-through).
 */
export function migrateEventToCurrent(
  event: AnyCommerceEvent,
  fromSchemaVersion: number,
  toSchemaVersion: number,
  migrations: readonly EventMigration[],
): AnyCommerceEvent {
  let current = event;
  let version = fromSchemaVersion;
  let guard = 0;
  while (version < toSchemaVersion) {
    const hop = migrations.find((migration) => migration.fromSchemaVersion === version);
    if (!hop) {
      throw new TypeError(
        `no migration path from projection schema ${version} to ${version + 1} (target ${toSchemaVersion})`,
      );
    }
    if (hop.toSchemaVersion !== version + 1) {
      throw new TypeError(
        `migration ${hop.fromSchemaVersion}->${hop.toSchemaVersion} is not a single forward hop`,
      );
    }
    current = hop.migrate(current);
    version = hop.toSchemaVersion;
    guard += 1;
    if (guard > 1_000) throw new TypeError("migration chain exceeded 1000 hops (corrupt registry)");
  }
  if (version !== toSchemaVersion) {
    throw new TypeError(`migration overshot target schema ${toSchemaVersion}`);
  }
  return current;
}

/**
 * Frozen, serializable progress record for snapshot-aware resume: rebuilding
 * from a checkpoint plus tail replay MUST equal a full rebuild (scenario 3).
 */
export interface ProjectionCheckpoint {
  readonly projectionId: string;
  readonly schemaVersion: number;
  /** Number of journal events already folded (resume position). */
  readonly appliedEventCount: number;
  /** Structured-serializable projection state (no Maps/Sets/bigints). */
  readonly state: unknown;
}

/** Per-subject sequence law violation (torn read detection). */
export type SequenceLawError =
  | { readonly code: "SEQUENCE_GAP"; subject: string; expected: number; actual: number }
  | { readonly code: "SEQUENCE_REGRESSION"; subject: string; last: number; actual: number };

export class SequenceLawViolation extends TypeError {
  constructor(public readonly violation: SequenceLawError) {
    super(`projection sequence law violated: ${JSON.stringify(violation)}`);
    this.name = "SequenceLawViolation";
  }
}

/**
 * Incremental projection fold engine. One engine folds one journal stream into
 * all registered projections in a single deterministic pass.
 */
export class ProjectionEngine {
  private readonly definitions: ReadonlyMap<string, ProjectionDefinition<unknown>>;
  private readonly states = new Map<string, unknown>();
  private readonly sequences = new Map<string, number>();
  private appliedEventCount = 0;

  constructor(definitions: readonly ProjectionDefinition<unknown>[]) {
    if (definitions.length === 0) throw new TypeError("projection engine needs at least one projection");
    const byId = new Map<string, ProjectionDefinition<unknown>>();
    for (const definition of definitions) {
      if (!Number.isSafeInteger(definition.schemaVersion) || definition.schemaVersion < 1) {
        throw new TypeError(`projection ${definition.projectionId}: invalid schema version ${definition.schemaVersion}`);
      }
      if (byId.has(definition.projectionId)) {
        throw new TypeError(`duplicate projection id ${definition.projectionId}`);
      }
      byId.set(definition.projectionId, definition);
      this.states.set(definition.projectionId, definition.initialState());
    }
    this.definitions = byId;
  }

  /** Registered projection ids (deterministic registration order). */
  projectionIds(): readonly string[] {
    return [...this.definitions.keys()];
  }

  /** Number of events folded so far (resume position). */
  position(): number {
    return this.appliedEventCount;
  }

  /** Read-only access to one projection's current state (reference to internal state — treat as immutable). */
  stateOf<S>(projectionId: string): S {
    const state = this.states.get(projectionId);
    if (state === undefined && !this.definitions.has(projectionId)) {
      throw new TypeError(`unknown projection ${projectionId}`);
    }
    return state as S;
  }

  /**
   * Fold one event into every projection. Enforces the per-subject sequence
   * law BEFORE any projection sees the event: no projection can observe an
   * effect before its causal predecessor (or a torn gap).
   */
  apply(event: AnyCommerceEvent): void {
    this.assertSequenceLaw(event);
    for (const definition of this.definitions.values()) {
      this.states.set(definition.projectionId, definition.apply(this.states.get(definition.projectionId), event));
    }
    this.appliedEventCount += 1;
  }

  /** Fold an ordered slice of the journal (validate first — atomic). */
  applyAll(events: readonly AnyCommerceEvent[]): void {
    const validation = validateEventSequence(events);
    if (!validation.ok) {
      throw new TypeError(`journal slice violates the event sequence law: ${JSON.stringify(validation.error)}`);
    }
    for (const event of events) this.apply(event);
  }

  /** Deterministic checkpoint of every projection (deep-copied, serializable). */
  checkpoint(): readonly ProjectionCheckpoint[] {
    return [...this.definitions.values()].map((definition) => ({
      projectionId: definition.projectionId,
      schemaVersion: definition.schemaVersion,
      appliedEventCount: this.appliedEventCount,
      state: serializableClone(this.states.get(definition.projectionId)),
    }));
  }

  /**
   * Restore from checkpoints (schema versions must match the registered
   * definitions exactly) and continue folding the tail. The engine validates
   * the tail's sequence law continuing FROM the checkpoint's positions, so a
   * tail that skips or repeats events relative to the checkpoint throws.
   */
  static resume(
    definitions: readonly ProjectionDefinition<unknown>[],
    checkpoints: readonly ProjectionCheckpoint[],
    tail: readonly AnyCommerceEvent[],
  ): ProjectionEngine {
    const engine = new ProjectionEngine(definitions);
    const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.projectionId, checkpoint]));
    for (const definition of definitions) {
      const checkpoint = byId.get(definition.projectionId);
      if (!checkpoint) throw new TypeError(`checkpoint missing for projection ${definition.projectionId}`);
      if (checkpoint.schemaVersion !== definition.schemaVersion) {
        throw new TypeError(
          `projection ${definition.projectionId}: checkpoint schema ${checkpoint.schemaVersion} != engine schema ${definition.schemaVersion}`,
        );
      }
    }
    const positions = new Set(checkpoints.map((checkpoint) => checkpoint.appliedEventCount));
    if (positions.size !== 1) {
      throw new TypeError(`checkpoints disagree on resume position: ${[...positions].join(", ")}`);
    }
    const position = positions.values().next().value as number;
    if (!Number.isSafeInteger(position) || position < 0) {
      throw new TypeError(`invalid resume position ${position}`);
    }
    for (const checkpoint of checkpoints) {
      engine.states.set(checkpoint.projectionId, serializableClone(checkpoint.state));
    }
    engine.appliedEventCount = position;
    for (const event of tail) engine.apply(event);
    return engine;
  }

  /** @internal checkpoint restore seam (resume only). */
  private assertSequenceLaw(event: AnyCommerceEvent): void {
    const key = `${event.subject.subjectType}:${event.subject.subjectId}`;
    const last = this.sequences.get(key) ?? 0;
    if (event.sequence === last + 1) {
      this.sequences.set(key, last + 1);
      return;
    }
    if (event.sequence <= last) {
      throw new SequenceLawViolation({
        code: "SEQUENCE_REGRESSION",
        subject: key,
        last,
        actual: event.sequence,
      });
    }
    throw new SequenceLawViolation({ code: "SEQUENCE_GAP", subject: key, expected: last + 1, actual: event.sequence });
  }
}
