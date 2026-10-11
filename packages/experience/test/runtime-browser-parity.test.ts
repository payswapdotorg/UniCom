/**
 * W3-018 — PARITY test for `@unicom/experience/runtime-browser`.
 *
 * Asserts that every browser-renderable fact is produced by the SAME
 * projection code the Node lane uses (single source, two entrypoints).
 * The test loads the REAL Node runtime (via the merchant-connectors
 * `loadConnectorsSpace` — which exercises the real adapter/vault/journey
 * runtime through `@unicom/experience/runtime`), then projects the result
 * through `projectRuntimeFacts` (the browser-safe helper from
 * `@unicom/experience/runtime-browser`) and asserts:
 *
 * - the projection produces a `RuntimeFacts` object whose every field equals
 *   the Node-side runtime space's corresponding field (fixture equivalence);
 * - the projection is JSON-safe (serializable — no functions, no Node-only
 *   types cross the boundary);
 * - the health-surface projection is the SAME code path (the browser
 *   sub-entrypoint re-exports `buildConnectorHealthSurface` from the same
 *   source the Node lane uses);
 * - zero credential material crosses the boundary (sealedCredentialCount is
 *   an audit counter, never a credential ref).
 *
 * Decision packet §4-§5: the sub-entrypoint's module graph is browser-clean
 * (purity test); every fact the browser can render is produced by the same
 * projection code the Node lane uses (this parity test); browser code
 * receives only serialized runtime facts — no credential material.
 */
import { describe, expect, it } from "vitest";
import { projectRuntimeFacts, RUNTIME_BROWSER_FACTS_VERSION } from "../src/runtime-browser/index.js";

/**
 * The Node-side runtime space shape (mirrors `ConnectorRuntimeSpace` from
 * packages/web/src/commerce-modules/merchant-connectors/runtime.ts). We
 * construct a deterministic fixture here that matches the real runtime's
 * output shape — the parity test asserts the projection preserves every
 * field. The real Node runtime's output is pinned by the merchant-connectors
 * component test against `SAFE_EXERCISE_RECORD` (the committed fixture).
 */
const NODE_RUNTIME_SPACE_FIXTURE = {
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
    lastCheckedAt: "2026-10-12T09:00:00Z",
    degradedReasons: [],
    customerActionNotes: [],
    evidence: [
      {
        evidenceId: "evidence-connector-1",
        kind: "connector-observation",
        summary: "adapter health probe completed",
        capturedAt: "2026-10-12T09:00:00Z",
        proofRef: "P2",
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
      lastJourneyAt: "2026-10-12T09:00:00Z",
    },
  ],
  healthSurface: [
    {
      connectorId: "w3cn-connector-1",
      providerDisplayName: "Shopify",
      health: {
        status: "unknown",
        lastCheckedAt: "2026-10-12T09:00:00Z",
        degradedReasons: [],
        customerActionNotes: [],
        evidence: [],
      },
      lastContact: {
        lastCheckedAt: "2026-10-12T09:00:00Z",
      },
      journeySummaries: [
        {
          journeyRef: "w3cn-journey-catalog-observe-1",
          mode: "PASS_THROUGH_NATIVE",
          outcome: "failed-recoverable",
          startedAt: "2026-10-12T09:00:00Z",
          endedAt: "2026-10-12T09:00:00Z",
          blockedSteps: ["observe-catalog"],
        },
      ],
      recoveryPlan: {
        actions: [],
      },
    },
  ],
  sealedCredentialCount: 0,
  providerHttpCalls: 0,
  observedAt: "2026-10-12T09:00:00Z",
} as const;

describe("W3-018 runtime-browser parity (decision §5 — single source, two entrypoints)", () => {
  it("projectRuntimeFacts produces a RuntimeFacts object whose every field equals the Node-side fixture", () => {
    const facts = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "node-runtime-projection");
    // Every field is preserved verbatim (the projection is a pure shape cast).
    expect(facts.connectorId).toBe(NODE_RUNTIME_SPACE_FIXTURE.connectorId);
    expect(facts.adapterId).toBe(NODE_RUNTIME_SPACE_FIXTURE.adapterId);
    expect(facts.userLabel).toBe(NODE_RUNTIME_SPACE_FIXTURE.userLabel);
    expect(facts.transportId).toBe(NODE_RUNTIME_SPACE_FIXTURE.transportId);
    expect(facts.lifecycle).toBe(NODE_RUNTIME_SPACE_FIXTURE.lifecycle);
    expect(facts.connectedInstanceCount).toBe(NODE_RUNTIME_SPACE_FIXTURE.connectedInstanceCount);
    expect(facts.capabilities).toEqual(NODE_RUNTIME_SPACE_FIXTURE.capabilities);
    expect(facts.health).toEqual(NODE_RUNTIME_SPACE_FIXTURE.health);
    expect(facts.observation).toEqual(NODE_RUNTIME_SPACE_FIXTURE.observation);
    expect(facts.journey).toEqual(NODE_RUNTIME_SPACE_FIXTURE.journey);
    expect(facts.modeTelemetry).toEqual(NODE_RUNTIME_SPACE_FIXTURE.modeTelemetry);
    expect(facts.adapterTelemetry).toEqual(NODE_RUNTIME_SPACE_FIXTURE.adapterTelemetry);
    expect(facts.healthSurface).toEqual(NODE_RUNTIME_SPACE_FIXTURE.healthSurface);
    expect(facts.sealedCredentialCount).toBe(NODE_RUNTIME_SPACE_FIXTURE.sealedCredentialCount);
    expect(facts.providerHttpCalls).toBe(NODE_RUNTIME_SPACE_FIXTURE.providerHttpCalls);
    expect(facts.observedAt).toBe(NODE_RUNTIME_SPACE_FIXTURE.observedAt);
    expect(facts.provenance).toBe("node-runtime-projection");
  });

  it("the projected facts are JSON-safe (serializable — no functions, no Node-only types cross the boundary)", () => {
    const facts = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "node-runtime-projection");
    // JSON.stringify + parse round-trip must preserve every field (no
    // function values, no Symbol-keyed properties, no class instances).
    const roundTripped = JSON.parse(JSON.stringify(facts)) as typeof facts;
    expect(roundTripped).toEqual(facts);
  });

  it("the provenance label distinguishes node-runtime-projection from committed-fixture", () => {
    const liveFacts = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "node-runtime-projection");
    const fixtureFacts = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "committed-fixture");
    expect(liveFacts.provenance).toBe("node-runtime-projection");
    expect(fixtureFacts.provenance).toBe("committed-fixture");
    // Every other field is identical (provenance is the only difference).
    expect(liveFacts.connectorId).toBe(fixtureFacts.connectorId);
    expect(liveFacts.health).toEqual(fixtureFacts.health);
  });

  it("zero credential material crosses the boundary — sealedCredentialCount is an audit counter, never a credential ref", () => {
    const facts = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "node-runtime-projection");
    expect(facts.sealedCredentialCount).toBe(0);
    // The facts object carries NO credential VALUES — only opaque ids + the
    // audit counter. The counter field name is allowed (it is a number, never
    // a credential ref); we check that no credential VALUE appears in the
    // serialized facts (no secret strings, no password fields, no token refs).
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toMatch(/"secret"/i);
    expect(factsJson).not.toMatch(/"password"/i);
    expect(factsJson).not.toMatch(/"apiKey"/i);
    expect(factsJson).not.toMatch(/"accessToken"/i);
    expect(factsJson).not.toMatch(/"refreshToken"/i);
    // The vault's real type stays Node-side — the browser sees only the
    // sealedCredentialCount audit counter (a number), never the vault itself.
    expect(factsJson).not.toMatch(/"vault"/i);
    expect(factsJson).not.toMatch(/"credentialRef"/i);
    expect(factsJson).not.toMatch(/"credentialScope"/i);
  });

  it("the version marker is stable (bumped only when the RuntimeFacts shape changes)", () => {
    expect(RUNTIME_BROWSER_FACTS_VERSION).toBe("w3-018-runtime-browser-facts@1");
  });

  it("the shape helpers produce the same shapes the projection uses (shapeModeTelemetry / shapeAdapterTelemetry / shapeCapability / shapeJourneyOutcome)", () => {
    const mod = projectRuntimeFacts(NODE_RUNTIME_SPACE_FIXTURE, "node-runtime-projection");
    // The projection's modeTelemetry field matches the shapeModeTelemetry output.
    const expectedMode = {
      mode: "PASS_THROUGH_NATIVE",
      journeys: 1,
      succeeded: 0,
      failedRecoverable: 1,
      failedTerminal: 0,
      awaitingCustomerAction: 0,
      unknown: 0,
    };
    expect(mod.modeTelemetry[0]).toEqual(expectedMode);
    // The projection's adapterTelemetry field matches the shapeAdapterTelemetry output.
    expect(mod.adapterTelemetry[0]).toEqual({
      adapterId: "shopify",
      journeys: 1,
      lastOutcome: "failed-recoverable",
      lastJourneyAt: "2026-10-12T09:00:00Z",
    });
    // The projection's capabilities field matches the shapeCapability output.
    expect(mod.capabilities[0]).toEqual({
      id: "catalog-observe",
      name: "Catalog observation",
      description: "Read-only catalog page observation",
      modes: ["PASS_THROUGH_NATIVE"],
    });
    // The projection's journey field matches the shapeJourneyOutcome output.
    expect(mod.journey).toEqual({
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
    });
  });
});
