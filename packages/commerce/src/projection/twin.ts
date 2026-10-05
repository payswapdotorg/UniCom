/**
 * CommerceTwin — the queryable full mirror of authoritative operational state.
 *
 * Truth distinctions (FROZEN-ARCHITECTURE §3.E): the twin is DERIVED state, a
 * projection/simulation model — NEVER a second source of truth and never
 * production operational truth. It is built ONLY from the immutable event
 * journal; it cannot write to the journal (read-only by construction) and it
 * holds no in-process kernel references (enforced structurally by the layer
 * order: this module imports domain + projection only).
 *
 * Determinism: identical journals fold to identical twins — byte-identical
 * under canonical JSON (full rebuild, scenario 2) — and a mid-journal
 * checkpoint plus tail replay equals a full rebuild (snapshot resume,
 * scenario 3). No clock, no randomness, no environment dependence.
 */
import { validateEventSequence, type AnyCommerceEvent } from "../domain/events.js";
import { ProjectionEngine, type ProjectionCheckpoint, type ProjectionDefinition } from "./engine.js";
import { COMMERCE_PROJECTION_SCHEMA_VERSION } from "./migrations.js";
import { canonicalJson } from "./serialize.js";
import { TwinState, type TwinSerializableState } from "./twin-state.js";
import { snapshotOfTwin, type TwinStateSnapshot } from "./twin-snapshot.js";
import { catalogReadModel, type CatalogReadModelState, type SkuFact } from "./catalog-projection.js";
import {
  inventoryReadModel,
  type CountObservationState,
  type InventoryReadModelState,
} from "./inventory-projection.js";
import { orderReadModel, type OrderReadModelState } from "./order-projection.js";
import { transferReadModel, type TransferReadModelState } from "./transfer-projection.js";
import {
  receivingReadModel,
  type ReceivingReadModelState,
} from "./receiving-projection.js";
import { returnsReadModel, type ReturnsReadModelState } from "./returns-projection.js";
import {
  reconciliationReadModel,
  type ReconciliationReadModelState,
} from "./reconciliation-projection.js";
import { commerceFacts, type CommerceFactsV1 } from "./queries.js";

export const TWIN_PROJECTION_ID = "commerce-twin/v2";

/** The twin mirror expressed as a schema-versioned projection definition. */
export const twinProjection: ProjectionDefinition<TwinState> = {
  projectionId: TWIN_PROJECTION_ID,
  schemaVersion: COMMERCE_PROJECTION_SCHEMA_VERSION,
  initialState: () => TwinState.empty(),
  apply: (state, event) => TwinState.apply(state, event),
  toSerializable: (state) => state.toSerializable(),
  fromSerializable: (serialized) => TwinState.fromSerializable(serialized as TwinSerializableState),
};

/** The standard projection set the Commerce Twin folds in one pass. */
export function standardProjectionSet(): readonly ProjectionDefinition<unknown>[] {
  return [
    twinProjection,
    catalogReadModel,
    inventoryReadModel,
    orderReadModel,
    transferReadModel,
    receivingReadModel,
    returnsReadModel,
    reconciliationReadModel,
  ] as readonly ProjectionDefinition<unknown>[];
}

/** Frozen twin progress record (serializable; resumes from mid-journal). */
export interface TwinCheckpoint {
  readonly projectionId: typeof TWIN_PROJECTION_ID;
  readonly schemaVersion: number;
  readonly appliedEventCount: number;
  readonly subjectSequences: readonly (readonly [string, number])[];
  readonly projections: readonly ProjectionCheckpoint[];
}

export class CommerceTwin {
  private readonly engine: ProjectionEngine;

  private constructor(engine: ProjectionEngine) {
    this.engine = engine;
  }

  /** Full rebuild from a journal (validated: corruption throws, never silent). */
  static fromEvents(events: readonly AnyCommerceEvent[]): CommerceTwin {
    const validation = validateEventSequence(events);
    if (!validation.ok) {
      throw new TypeError(`twin rebuild: journal violates the event sequence law: ${JSON.stringify(validation.error)}`);
    }
    const twin = new CommerceTwin(new ProjectionEngine(standardProjectionSet()));
    for (const event of events) twin.engine.apply(event);
    return twin;
  }

  /** Empty twin (zero events folded). */
  static empty(): CommerceTwin {
    return new CommerceTwin(new ProjectionEngine(standardProjectionSet()));
  }

  /**
   * Snapshot-aware resume: continue from a mid-journal checkpoint by folding
   * only the tail. The resumed twin equals a full rebuild over
   * checkpoint.events ++ tail (scenario 3). The tail's per-subject sequences
   * must CONTINUE the checkpoint exactly — a skip or replay throws.
   */
  static resume(checkpoint: TwinCheckpoint, tail: readonly AnyCommerceEvent[]): CommerceTwin {
    return new CommerceTwin(
      ProjectionEngine.resume(
        standardProjectionSet(),
        {
          appliedEventCount: checkpoint.appliedEventCount,
          subjectSequences: checkpoint.subjectSequences,
          projections: checkpoint.projections,
        },
        tail,
      ),
    );
  }

  /** Incremental update: fold events already durably appended to the journal. */
  apply(event: AnyCommerceEvent): void {
    this.engine.apply(event);
  }

  /** Incremental update: fold an ordered slice of newly appended events. */
  applyAll(events: readonly AnyCommerceEvent[]): void {
    this.engine.applyAll(events);
  }

  /** Number of journal events folded so far. */
  position(): number {
    return this.engine.position();
  }

  /** The full mirror state (read-only use; snapshot() is the comparable form). */
  state(): TwinState {
    return this.engine.stateOf<TwinState>(TWIN_PROJECTION_ID);
  }

  /** Deterministic structural snapshot (deep-comparable, canonical-serializable). */
  snapshot(): TwinStateSnapshot {
    return snapshotOfTwin(this.state());
  }

  /** Typed, versioned demand-side query interface over commerce FACTS. */
  facts(): CommerceFactsV1 {
    return commerceFacts(this.state(), this.catalog);
  }

  /** A named read model's current state (catalog/inventory/order/…/v2). */
  readModel<S>(projectionId: string): S {
    return this.engine.stateOf<S>(projectionId);
  }

  /** Read-model accessors for the standard set (typed convenience). */
  get catalog(): CatalogReadModelState {
    return this.engine.stateOf<CatalogReadModelState>(catalogReadModel.projectionId);
  }
  get inventory(): InventoryReadModelState {
    return this.engine.stateOf<InventoryReadModelState>(inventoryReadModel.projectionId);
  }
  get orderModel(): OrderReadModelState {
    return this.engine.stateOf<OrderReadModelState>(orderReadModel.projectionId);
  }
  get transferModel(): TransferReadModelState {
    return this.engine.stateOf<TransferReadModelState>(transferReadModel.projectionId);
  }
  get receiving(): ReceivingReadModelState {
    return this.engine.stateOf<ReceivingReadModelState>(receivingReadModel.projectionId);
  }
  get returnModel(): ReturnsReadModelState {
    return this.engine.stateOf<ReturnsReadModelState>(returnsReadModel.projectionId);
  }
  get reconciliation(): ReconciliationReadModelState {
    return this.engine.stateOf<ReconciliationReadModelState>(reconciliationReadModel.projectionId);
  }

  /** Deterministic checkpoint (frozen, structured-serializable, resumable). */
  checkpoint(): TwinCheckpoint {
    const engineCheckpoint = this.engine.checkpoint();
    return {
      projectionId: TWIN_PROJECTION_ID,
      schemaVersion: COMMERCE_PROJECTION_SCHEMA_VERSION,
      appliedEventCount: engineCheckpoint.appliedEventCount,
      subjectSequences: engineCheckpoint.subjectSequences,
      projections: engineCheckpoint.projections,
    };
  }

  /** Canonical serialization of the snapshot (byte-stable proof surface). */
  canonical(): string {
    return canonicalOfTwin(this);
  }

  /** SKU catalog fact lookup convenience. */
  skuFact(skuId: string): SkuFact | undefined {
    return this.catalog.skus.get(skuId);
  }

  /** Tri-state count-observation fact for a stock level (UNKNOWN survives). */
  countObservation(skuId: string, locationId: string): CountObservationState | undefined {
    return this.state().collections().countObservations.get(`${skuId}|${locationId}`);
  }
}

/** Canonical JSON of a twin's snapshot (deterministic byte comparison). */
export function canonicalOfTwin(twin: CommerceTwin): string {
  return canonicalJson(twin.snapshot());
}
