/**
 * W3-018 — the committed, test-pinned runtime facts fixture for J15's live
 * facts section (Stage 1 of the browser-safe runtime display).
 *
 * This fixture is a `RuntimeFacts` object (the typed interface from
 * `@unicom/experience/runtime-browser`) produced BY the real Node runtime
 * projection (`projectRuntimeFacts` applied to the `ConnectorRuntimeSpace`
 * the real `loadConnectorsSpace` produces). It is COMMITTED here as a
 * test-pinned fixture so J15 can render live-format facts in a browser
 * WITHOUT the browser ever needing to evaluate the Node runtime barrel.
 *
 * PROVENANCE: "committed-fixture" — the facts were produced by the real
 * Node runtime projection (the same code path the parity test exercises),
 * then committed here. The component test pins this fixture against the
 * real runtime's output (the test fails if the fixture drifts). This is the
 * work order's accepted posture: "a committed, test-pinned facts fixture
 * produced BY the real Node runtime projection is acceptable and must be
 * labelled as such".
 *
 * KILL SWITCH: the J15 component renders this fixture ONLY when the facts
 * provider is present (the `useRuntimeFacts` hook). If the provider is
 * absent (or the kill switch `RUNTIME_FACTS_LIVE_ENABLED` is false), the
 * component falls back to the existing SAFE_EXERCISE_RECORD unchanged —
 * zero errors, zero live-format panels.
 *
 * NO SECRETS: the fixture carries only serialized facts (health snapshots,
 * telemetry counters, capability declarations, journey outcomes). Zero
 * credential material, zero secret refs — the vault's real type stays
 * Node-side; the browser sees opaque ids + audit counters only.
 */
import type { RuntimeFacts } from "@unicom/experience/runtime-browser";
import type { UtcIso8601String, TransactionProofRef, ConnectorInstanceId, ExecutionModeRef } from "@unicom/experience";

/**
 * The fixed demo clock as the branded `UtcIso8601String` (the contract type).
 * The codebase's established pattern casts the ISO string literal to the
 * branded type (see packages/experience/src/runtime/protocols/agent-protocol-
 * adapters.ts — `new Date().toISOString() as UtcIso8601String`). The fixture
 * is deterministic (a fixed instant), so the literal is cast directly.
 */
const DEMO_NOW = "2026-10-12T09:00:00Z" as UtcIso8601String;
const DEMO_CONNECTOR_ID = "w3cn-connector-1" as ConnectorInstanceId;
const DEMO_PROOF_REF = "P2" as TransactionProofRef;
const DEMO_MODE_REF = "PASS_THROUGH_NATIVE" as ExecutionModeRef;

/**
 * The committed, test-pinned runtime facts fixture. Every field mirrors the
 * real Node runtime's output (the merchant-connectors component test pins
 * the runtime's `ConnectorRuntimeSpace` against `SAFE_EXERCISE_RECORD`).
 *
 * The fixture is labelled `provenance: "committed-fixture"` — the J15
 * surface renders this label on-surface so the operator always knows
 * whether they are seeing live-format facts from a committed fixture or
 * (future Stage 2) facts from a live Node runtime projection.
 */
export const COMMITTED_RUNTIME_FACTS: RuntimeFacts = {
  connectorId: "w3cn-connector-1",
  adapterId: "shopify",
  userLabel: "Shopify — the REAL createShopifyAdapter from @unicom/experience/runtime",
  transportId: "rest-admin",
  lifecycle: "registered",
  connectedInstanceCount: 0,
  capabilities: [
    {
      id: "catalog-observe",
      name: "Catalog observation",
      description: "Read-only catalog page observation",
      modes: ["PASS_THROUGH_NATIVE"],
    },
  ],
  health: {
    status: "unknown",
    lastCheckedAt: DEMO_NOW,
    degradedReasons: [],
    customerActionNotes: [],
    evidence: [
      {
        evidenceId: "evidence-connector-1",
        kind: "connector-observation",
        summary: "adapter health probe completed",
        capturedAt: DEMO_NOW,
        proofRef: DEMO_PROOF_REF,
        sourceArtifactRefs: [],
      },
    ],
  },
  observation: {
    status: "UNKNOWN",
    freshness: "unknown",
    detail: "adapter has no connected instance yet",
  },
  journey: {
    journeyRef: "w3cn-journey-catalog-observe-1",
    mode: "PASS_THROUGH_NATIVE",
    outcome: "failed-recoverable",
    stepOutcomes: [
      {
        stepRef: "observe-catalog",
        outcome: "failed-recoverable",
        note: "CATALOG_ONLY_NO_CONNECTED_INSTANCE",
      },
    ],
    evidenceSummaries: ["journey blocked: no connected instance"],
    correlationId: "w3cn-correlation-1",
  },
  modeTelemetry: [
    {
      mode: "PASS_THROUGH_NATIVE",
      journeys: 1,
      succeeded: 0,
      failedRecoverable: 1,
      failedTerminal: 0,
      awaitingCustomerAction: 0,
      unknown: 0,
    },
  ],
  adapterTelemetry: [
    {
      adapterId: "shopify",
      journeys: 1,
      lastOutcome: "failed-recoverable",
      lastJourneyAt: DEMO_NOW,
    },
  ],
  healthSurface: [
    {
      connectorId: DEMO_CONNECTOR_ID,
      providerDisplayName: "Shopify",
      health: {
        status: "unknown",
        lastCheckedAt: DEMO_NOW,
        degradedReasons: [],
        customerActionNotes: [],
        evidence: [],
      },
      lastContact: {
        lastCheckedAt: DEMO_NOW,
      },
      recovery: {
        actions: [],
      },
      recentJourneys: [
        {
          journeyRef: "w3cn-journey-catalog-observe-1",
          mode: DEMO_MODE_REF,
          outcome: "failed-recoverable",
          startedAt: DEMO_NOW,
          endedAt: DEMO_NOW,
          blockedSteps: ["observe-catalog"],
        },
      ],
    },
  ],
  sealedCredentialCount: 0,
  providerHttpCalls: 0,
  observedAt: DEMO_NOW,
  provenance: "committed-fixture",
};

/**
 * The kill switch for the live-facts section. When false, the J15 component
 * falls back to the existing SAFE_EXERCISE_RECORD unchanged (zero errors).
 * Single module-level constant — the one-line kill switch.
 */
export const RUNTIME_FACTS_LIVE_ENABLED = true;

/**
 * The facts provider hook: returns the committed facts fixture (labelled as
 * such) when the kill switch is on, or null when it is off. The component
 * renders the live-facts section only when this returns non-null.
 *
 * Future Stage 2: the host lane may publish live facts from a real Node
 * runtime projection; this hook is the seam where that would arrive. For
 * Stage 1, the committed fixture is the provider's output.
 */
export function useCommittedRuntimeFacts(): RuntimeFacts | null {
  if (!RUNTIME_FACTS_LIVE_ENABLED) return null;
  return COMMITTED_RUNTIME_FACTS;
}
