/**
 * @unicom/experience/runtime-browser — the browser-safe runtime facts sub-
 * entrypoint (W3-018, Option A — TL decision §7).
 *
 * PURE projection helpers + a typed `RuntimeFacts` interface the Node side
 * serializes, so the J15 web module can render LIVE connector-runtime facts
 * in a real browser — while the real adapter/vault stay Node-only and the
 * committed SAFE_EXERCISE_RECORD remains the fallback.
 *
 * BROWSER-CLEAN BY CONSTRUCTION:
 * - zero `node:` specifiers anywhere in this module's graph;
 * - zero imports of adapter/vault implementation modules (those live under
 *   `../runtime/connector/adapter.ts`, `../runtime/connector/vault.ts` and
 *   are NEVER imported here — only their TYPE-only signatures appear, which
 *   erase at compile time and do not pull runtime code into the bundle);
 * - only CONTRACT types from `@unicom/experience` (the `.` entrypoint — pure
 *   types/registries, no runtime code) and `@unicom/agent/capability` (the
 *   capability taxonomy — pure types, no Node deps);
 * - the runtime VALUE imports are limited to `../runtime/ids` (pure branded-
 *   ref constructors, no Node deps), `../runtime/connector/health.js`
 *   (pure: imports only `../ids` at runtime; `./adapter` is type-only),
 *   and `../runtime/surfaces/connector-health.js` (pure: imports only
 *   `../ids` at runtime; `../connector/telemetry` is type-only).
 * - a module-graph purity test (static analysis from this entrypoint) enforces
 *   the boundary CI-fast.
 *
 * PARITY:
 * - the projection helpers here are the SAME pure code the Node lane uses
 *   (shared via the contract-level types); the Node lane publishes serialized
 *   `RuntimeFacts` through the existing telemetry/health-surface contracts;
 *   the parity test asserts fixture equivalence between the Node projection
 *   and the browser-renderable facts.
 *
 * NO SECRETS CROSS THE BOUNDARY:
 * - browser code receives only serialized facts (health snapshots, telemetry
 *   counters, capability declarations, journey outcomes);
 * - the vault's real type stays Node-side; browser sees opaque ids only;
 * - zero credential material, zero secret refs.
 *
 * KILL SWITCH:
 * - this sub-entrypoint is ADDITIVE; J15 falls back to the committed
 *   SAFE_EXERCISE_RECORD if the facts provider is absent (zero errors).
 */

// Re-export the contract-level types the browser needs (pure types, no runtime).
// These come from `@unicom/experience` (the `.` entrypoint) — the frozen public
// contract surface. The browser-safe sub-entrypoint adds NO new contract types.
export type {
  ConnectorHealthSnapshot,
  ConnectorHealthStatus,
  ConnectorExecutionOutcome,
  ConnectorExecutionEvidence,
  ObservationFreshnessView,
} from "../connector/observability.js";
export type {
  ConnectorHealthSurfaceEntry,
  ConnectorHealthSurfaceView,
  ConnectorJourneyHealthSummary,
  ConnectorLastContactView,
  ConnectorRecoveryAction,
  ConnectorRecoveryPlan,
  ConnectorErrorView,
} from "../connector/health-surface.js";

// Re-export the capability taxonomy types (pure types from @unicom/agent).
export type {
  CapabilityDefinition,
  ProviderImplementation,
  ExecutionMode,
} from "@unicom/agent/capability";

// Re-export the health-surface projection helper (PURE — no Node deps).
// This is the SAME projection code the Node lane uses (single source, two
// entrypoints). The parity test asserts fixture equivalence.
export { buildConnectorHealthSurface } from "../runtime/surfaces/connector-health.js";

// Re-export the health snapshot constructors (PURE — no Node deps).
export { healthSnapshotFromProbe, unknownHealthSnapshot } from "../runtime/connector/health.js";

/**
 * A browser-safe telemetry rollup (per execution mode). Mirrors the Node-side
 * `ExecutionModeTelemetry` shape but defined here as a serialized fact — the
 * browser never imports the runtime telemetry registry, only receives the
 * serialized counters.
 */
export interface RuntimeFactsModeTelemetry {
  readonly mode: string;
  readonly journeys: number;
  readonly succeeded: number;
  readonly failedRecoverable: number;
  readonly failedTerminal: number;
  readonly awaitingCustomerAction: number;
  readonly unknown: number;
}

/**
 * A browser-safe adapter telemetry rollup. Mirrors the Node-side
 * `AdapterTelemetry` shape as a serialized fact.
 */
export interface RuntimeFactsAdapterTelemetry {
  readonly adapterId: string;
  readonly journeys: number;
  readonly lastOutcome?: string;
  readonly lastJourneyAt?: string;
}

/**
 * A browser-safe capability declaration (the shape the browser renders).
 * Mirrors `CapabilityDefinition` but carries only the display fields — no
 * execution-mode plumbing, no provider-native optimization flags.
 */
export interface RuntimeFactsCapability {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modes: readonly string[];
}

/**
 * A browser-safe journey outcome (the safe exercise's evidence record as a
 * serialized fact). Mirrors the Node-side `JourneyEvidenceRecord` display shape.
 */
export interface RuntimeFactsJourneyOutcome {
  readonly journeyRef: string;
  readonly mode: string;
  readonly outcome: string;
  readonly stepOutcomes: readonly {
    readonly stepRef: string;
    readonly outcome: string;
    readonly note?: string;
  }[];
  readonly evidenceSummaries: readonly string[];
  readonly correlationId: string;
}

/**
 * The serialized runtime facts the Node lane publishes and the browser
 * renders. ALL existing contract types — no credential material, no secret
 * refs, no adapter/vault implementation types. The browser receives this as
 * a plain serializable object (JSON-safe).
 *
 * Provenance: every fact carries its source (which connector, which adapter,
 * when observed). The honest boundary text is NEVER removed — live-facts mode
 * ADDS a clearly-labelled live section to the existing SAFE_EXERCISE_RECORD.
 */
export interface RuntimeFacts {
  /** The connector instance id (opaque — never a credential ref). */
  readonly connectorId: string;
  /** The adapter id (the provider's canonical descriptor id). */
  readonly adapterId: string;
  /** The human-readable adapter label. */
  readonly userLabel: string;
  /** The transport id (from the CONTRACT registry — pure data). */
  readonly transportId: string;
  /** The connector lifecycle ("registered" — never "connected" in the safe exercise). */
  readonly lifecycle: string;
  /** The number of connected instances (0 — the safe exercise never connects). */
  readonly connectedInstanceCount: number;
  /** The adapter's canonical capability declarations (display shape). */
  readonly capabilities: readonly RuntimeFactsCapability[];
  /** The health snapshot (from the runtime's own healthReport — UNKNOWN, never down). */
  readonly health: import("../connector/observability.js").ConnectorHealthSnapshot;
  /** The latest canonical observation (UNKNOWN — nothing is connected). */
  readonly observation: {
    readonly status: string;
    readonly freshness: string;
    readonly detail: string;
  } | null;
  /** The safe journey attempt: the canonical gate's honest refusal. */
  readonly journey: RuntimeFactsJourneyOutcome;
  /** Execution-mode telemetry rollup (serialized counters, not the registry). */
  readonly modeTelemetry: readonly RuntimeFactsModeTelemetry[];
  /** Per-adapter telemetry rollup (serialized counters). */
  readonly adapterTelemetry: readonly RuntimeFactsAdapterTelemetry[];
  /** The W3-005 health surface projection (last contact, last error, recovery). */
  readonly healthSurface: readonly import("../connector/health-surface.js").ConnectorHealthSurfaceEntry[];
  /** Vault audit: credentials sealed inside the runtime (0 — none exist). */
  readonly sealedCredentialCount: number;
  /** HTTP port calls made during the exercise (0 — the tripwire proves it). */
  readonly providerHttpCalls: number;
  /** When the facts were observed (the fixed demo clock). */
  readonly observedAt: string;
  /**
   * Provenance label — how these facts were produced. "node-runtime-projection"
   * means the real Node runtime projection produced them (the parity test pins
   * this against the real runtime's output); "committed-fixture" means a
   * committed, test-pinned facts fixture produced BY the real Node runtime
   * projection (acceptable for the lane — must be labelled as such).
   */
  readonly provenance: "node-runtime-projection" | "committed-fixture";
}

/**
 * Project a `ConnectorRuntimeSpace` (the Node-side runtime exercise output)
 * into browser-safe `RuntimeFacts`. PURE: no Node deps, no side effects —
 * just a shape projection. The Node lane calls this to serialize the facts
 * for the browser; the browser receives the JSON-safe result.
 *
 * This is the SAME projection the parity test exercises against the real
 * Node runtime's output — single source, two entrypoints.
 */
export function projectRuntimeFacts(
  space: {
    readonly connectorId: string;
    readonly adapterId: string;
    readonly userLabel: string;
    readonly transportId: string;
    readonly lifecycle: string;
    readonly connectedInstanceCount: number;
    readonly capabilities: readonly {
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly modes: readonly string[];
    }[];
    readonly health: import("../connector/observability.js").ConnectorHealthSnapshot;
    readonly observation: { readonly status: string; readonly freshness: string; readonly detail: string } | null;
    readonly journey: {
      readonly journeyRef: string;
      readonly mode: string;
      readonly outcome: string;
      readonly stepOutcomes: readonly { readonly stepRef: string; readonly outcome: string; readonly note?: string }[];
      readonly evidenceSummaries: readonly string[];
      readonly correlationId: string;
    };
    readonly modeTelemetry: readonly {
      readonly mode: string;
      readonly journeys: number;
      readonly succeeded: number;
      readonly failedRecoverable: number;
      readonly failedTerminal: number;
      readonly awaitingCustomerAction: number;
      readonly unknown: number;
    }[];
    readonly adapterTelemetry: readonly {
      readonly adapterId: string;
      readonly journeys: number;
      readonly lastOutcome?: string;
      readonly lastJourneyAt?: string;
    }[];
    readonly healthSurface: readonly import("../connector/health-surface.js").ConnectorHealthSurfaceEntry[];
    readonly sealedCredentialCount: number;
    readonly providerHttpCalls: number;
    readonly observedAt: string;
  },
  provenance: RuntimeFacts["provenance"],
): RuntimeFacts {
  return {
    connectorId: space.connectorId,
    adapterId: space.adapterId,
    userLabel: space.userLabel,
    transportId: space.transportId,
    lifecycle: space.lifecycle,
    connectedInstanceCount: space.connectedInstanceCount,
    capabilities: space.capabilities,
    health: space.health,
    observation: space.observation,
    journey: space.journey,
    modeTelemetry: space.modeTelemetry,
    adapterTelemetry: space.adapterTelemetry,
    healthSurface: space.healthSurface,
    sealedCredentialCount: space.sealedCredentialCount,
    providerHttpCalls: space.providerHttpCalls,
    observedAt: space.observedAt,
    provenance,
  };
}

/**
 * Shape a telemetry rollup from raw counters (PURE — no registry access).
 * The Node lane uses this to produce the serialized `RuntimeFactsModeTelemetry`
 * from the runtime's telemetry registry; the browser receives the result.
 */
export function shapeModeTelemetry(
  mode: string,
  journeys: number,
  succeeded: number,
  failedRecoverable: number,
  failedTerminal: number,
  awaitingCustomerAction: number,
  unknown: number,
): RuntimeFactsModeTelemetry {
  return { mode, journeys, succeeded, failedRecoverable, failedTerminal, awaitingCustomerAction, unknown };
}

/**
 * Shape an adapter telemetry rollup from raw counters (PURE).
 */
export function shapeAdapterTelemetry(
  adapterId: string,
  journeys: number,
  lastOutcome?: string,
  lastJourneyAt?: string,
): RuntimeFactsAdapterTelemetry {
  return { adapterId, journeys, lastOutcome, lastJourneyAt };
}

/**
 * Shape a capability declaration for the browser (PURE — display shape only).
 */
export function shapeCapability(
  id: string,
  name: string,
  description: string,
  modes: readonly string[],
): RuntimeFactsCapability {
  return { id, name, description, modes };
}

/**
 * Shape a journey outcome for the browser (PURE — display shape only).
 */
export function shapeJourneyOutcome(
  journeyRef: string,
  mode: string,
  outcome: string,
  stepOutcomes: readonly { readonly stepRef: string; readonly outcome: string; readonly note?: string }[],
  evidenceSummaries: readonly string[],
  correlationId: string,
): RuntimeFactsJourneyOutcome {
  return { journeyRef, mode, outcome, stepOutcomes, evidenceSummaries, correlationId };
}

/**
 * The sub-entrypoint's version marker (for the parity test + provenance).
 * Bumped when the RuntimeFacts shape changes.
 */
export const RUNTIME_BROWSER_FACTS_VERSION = "w3-018-runtime-browser-facts@1";
