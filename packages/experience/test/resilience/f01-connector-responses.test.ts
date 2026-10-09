/**
 * W2-010 — Family F01: connector/provider response integrity
 * (stale / slow / unavailable / contradictory; UNKNOWN never silently
 * FAILED or success). Fixture-contract evidence level.
 *
 * Every scenario drives the REAL ConnectorRuntime through the
 * FaultInjectingConnectorAdapter double (the only injection seam) and
 * asserts the VISIBLE dimension: health snapshots, executability reasons,
 * step/journey outcomes and the checkout view projection — not just "an
 * error banner appeared".
 */

import { describe, expect, it } from "vitest";
import { credentialScope } from "@unicom/agent";
import { ExecutionMode } from "@unicom/agent/capability";
import { FaultInjectingConnectorAdapter } from "./adapters/fault-connector-adapter";
import { availabilityViewOf, checkoutStatusView, createResilienceConnectorRig } from "./adapters/resilience-rig";
import { expectResultClass, scenarioById } from "./matrix/oracle";

const family = "F01";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

async function oneLegJourney(
  connected: { readonly instance: { readonly connectedInstanceId: string } },
  adapter: FaultInjectingConnectorAdapter,
  observation: { readonly connectedInstanceId: string } | null,
  commandRef = "cmd-f01",
) {
  const request = {
    journeyRef: "journey-f01",
    mode: ExecutionMode.COMPOSED,
    steps: [
      {
        stepRef: "step-1",
        capabilityDefinitionId: (adapter.descriptor.capabilityDefinitions[0]?.capabilityDefinitionId ?? "cap-f01") as never,
        preconditions: {
          requiresConnectedInstance: true,
          requiredCredentialScope: credentialScope("orders.read"),
          requiredPermissions: [],
          requiresCommercialTermsAccepted: true,
          requiresCurrentObservation: true,
        },
        commandRef,
        payloadRef: `payload:${commandRef}`,
      },
    ],
    instances: [connected.instance as never],
    observations: observation === null ? [] : [observation as never],
    implementations: [...adapter.descriptor.providerImplementations] as never,
    idempotencySeed: "f01-seed",
    authorization: "authorization:f01" as never,
    requestedAt: "2026-10-10T09:00:00Z",
  };
  return request;
}

describe("W2-010 F01 — connector/provider response integrity (fixture-contract)", () => {
  it("F01-S01: an incomplete health probe is UNKNOWN, never down", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s01-provider", {
      probes: [{ kind: "throw", error: new Error("PROBE_TIMEOUT: provider did not answer") }],
    });
    const connected = await connect(adapter);
    const observed = await runtime.observe(connected.connectorId);
    // VISIBLE: status is unknown — not "down", not "healthy"; the probe
    // error text is carried as evidence.
    expect(observed.health.status).toBe("unknown");
    expect(JSON.stringify(observed.health)).toContain("PROBE_TIMEOUT");
    // The connector is not failed: a later successful probe recovers it.
    adapter.updateScript({ probes: [{ kind: "healthy" }] });
    const recovered = await runtime.observe(connected.connectorId);
    expect(recovered.health.status).toBe("healthy");
  });

  it("F01-S02: a stale observation blocks execution as UNKNOWN (not failure)", async () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s02-provider", {
      observations: [{ status: "NOMINAL", freshness: "STALE" }],
    });
    const connected = await connect(adapter);
    const observed = await runtime.observe(connected.connectorId);
    expect(observed.observation?.freshness).toBe("STALE");
    const dispatch = await runtime.dispatch(await oneLegJourney(connected, adapter, observed.observation));
    // VISIBLE: executability UNKNOWN with STALE_OBSERVATION; step outcome
    // unknown; provider state unknown — never failed, never succeeded.
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("UNKNOWN");
    if (planned?.executability.status === "UNKNOWN") {
      expect(planned.executability.cause).toBe("STALE_OBSERVATION");
    }
    expect(dispatch.stepOutcomes[0]?.outcome).toBe("unknown");
    expect(dispatch.stepOutcomes[0]?.providerStatePreserved).toBe("unknown");
    expect(dispatch.journeyOutcome).toBe("unknown");
    // The provider was never invoked on stale data.
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
    // Checkout view projection: UNKNOWN is a first-class step — never done.
    const view = checkoutStatusView("checkout:f01-s02", "unknown", "observation is stale — must refresh before action");
    expect(view.currentStep).toBe("unknown");
    expect(view.currentStep).not.toBe("done");
    // Recovery: a fresh observation makes the same leg executable.
    adapter.updateScript({ observations: [{ status: "NOMINAL", freshness: "CURRENT" }] });
    const fresh = await runtime.observe(connected.connectorId);
    const retried = await runtime.dispatch(await oneLegJourney(connected, adapter, fresh.observation, "cmd-f01-retry"));
    expect(retried.journeyOutcome).toBe("succeeded");
    expect(adapter.recordedCalls().executeInputs).toHaveLength(1);
  });

  it("F01-S03: contradictory probe responses surface as degraded + UNKNOWN freshness, never averaged", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-block");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s03-provider", {
      probes: [{ kind: "healthy" }, { kind: "degraded", reasons: ["FLAPPING: probes disagree"] }],
      observations: [{ status: "NOMINAL", freshness: "CURRENT" }, { status: "DEGRADED", freshness: "UNKNOWN" }],
    });
    const connected = await connect(adapter);
    const first = await runtime.observe(connected.connectorId);
    expect(first.health.status).toBe("healthy");
    const second = await runtime.observe(connected.connectorId);
    // VISIBLE: latest snapshot is deterministic (arrival order) with the
    // contradiction carried as degraded reasons + freshness UNKNOWN.
    expect(second.health.status).toBe("degraded");
    expect(second.health.degradedReasons).toContain("FLAPPING: probes disagree");
    const dispatch = await runtime.dispatch(await oneLegJourney(connected, adapter, second.observation));
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("UNKNOWN");
    expect(dispatch.journeyOutcome).toBe("unknown");
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
  });

  it("F01-S04: provider unavailable at execution → failed-recoverable, retry recovers exactly once", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-success");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s04-provider", {
      executeByCommandRefPrefix: { "cmd-f01-s04-first": { kind: "failed-recoverable", note: "provider 503 — retry available" } },
    });
    const connected = await connect(adapter);
    const observed = await runtime.observe(connected.connectorId);
    const first = await runtime.dispatch(await oneLegJourney(connected, adapter, observed.observation, "cmd-f01-s04-first"));
    expect(first.stepOutcomes[0]?.outcome).toBe("failed-recoverable");
    expect(first.stepOutcomes[0]?.note).toContain("retry available");
    expect(first.journeyOutcome).toBe("failed-recoverable");
    // Provider recovers; the retry (same idempotency seed + step) succeeds.
    adapter.updateScript({ executeByCommandRefPrefix: {} });
    const retry = await runtime.dispatch(await oneLegJourney(connected, adapter, observed.observation, "cmd-f01-s04-first"));
    expect(retry.journeyOutcome).toBe("succeeded");
    expect(adapter.recordedCalls().executeInputs).toHaveLength(2);
    // Same idempotency key on both attempts (dispatch derives it from seed+step).
    const inputs = adapter.recordedCalls().executeInputs;
    expect(inputs[0]?.idempotencyKey).toBe(inputs[1]?.idempotencyKey);
  });

  it("F01-S05: an ambiguous execute outcome stays UNKNOWN end-to-end (never done, never failed)", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s05-provider", {
      executeDefault: { kind: "unknown", note: "provider timeout — state unclear" },
    });
    const connected = await connect(adapter);
    const observed = await runtime.observe(connected.connectorId);
    const dispatch = await runtime.dispatch(await oneLegJourney(connected, adapter, observed.observation, "cmd-f01-s05"));
    expect(dispatch.stepOutcomes[0]?.outcome).toBe("unknown");
    expect(dispatch.journeyOutcome).toBe("unknown");
    // VISIBLE: the checkout view holds UNKNOWN with a blocker note — it is
    // never rendered done or failed while the provider state is unclear.
    const view = checkoutStatusView("checkout:f01-s05", "unknown", "payment/provider state could not be confirmed — nothing is settled");
    expect(view.currentStep).toBe("unknown");
    expect(view.blockerNote).toContain("nothing is settled");
  });

  it("F01-S06: connect() UNKNOWN → lifecycle unknown; execute refused deterministically", async () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-block");
    const { runtime, connect } = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f01-s06-provider", {
      connect: { kind: "unknown", note: "auth provider unreachable — connection state unknown" },
    });
    const registered = runtime.register(adapter);
    const connected = await runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "account-1",
      credential: {
        kind: "api-secret",
        material: "resilience-material-f01-s06",
        forAdapterId: "f01-s06-provider",
        forAccountRef: "account-1",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read",
    });
    // VISIBLE: lifecycle is unknown — not connected, not failed.
    expect(connected.lifecycle).toBe("unknown");
    const registeredAfter = runtime.connector(registered.connectorId);
    expect(registeredAfter?.lifecycle).toBe("unknown");
    // Execute is refused deterministically (never silently attempted).
    await expect(
      runtime.execute(
        {
          requestId: "req-f01-s06",
          connectorId: registered.connectorId,
          capabilityInstanceRef: "instance:none" as never,
          transportId: "rest",
          commandRef: "cmd-f01-s06",
          idempotencyKey: "f01-s06-key" as never,
          authorization: "authorization:f01-s06" as never,
          requestedAt: "2026-10-10T09:00:00Z",
        } as never,
        { requestedBy: "principal:e2e" as never, payloadRef: "payload:f01-s06" },
      ),
    ).rejects.toThrow(/is unknown, not connected/);
    // Recovery: provider auth recovers → connect succeeds.
    adapter.updateScript({ connect: { kind: "connected", scopeTokens: ["orders.read"], permissions: ["orders.read"] } });
    const recovered = await connect(adapter);
    expect(recovered.instance.connectionStatus).toBe("CONNECTED");
  });

  it("F01 matrix oracle: availability projection never invents stock from UNKNOWN", () => {
    // Companion visible-dimension check: an UNKNOWN observation must not
    // render as out-of-stock (zero) — the canonical level is unchanged.
    const level = { skuId: "sku-x" as never, locationId: "loc-x" as never, onHand: 10, reserved: 0, revision: 3, updatedAt: "2026-10-10T09:00:00Z" };
    expect(availabilityViewOf(level).displayStatus).toBe("in-stock");
    expect(availabilityViewOf(undefined).displayStatus).toBe("unknown");
    expect(availabilityViewOf(undefined).displayStatus).not.toBe("out-of-stock");
    expect(expectResultClass("W2-010-F01-S05")).toBe("expected-block");
  });
});
