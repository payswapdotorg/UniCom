/**
 * W1-005 acceptance scenario 4 — variance + anomaly paths.
 *
 * Cash variance at close and count mismatches land as EXPLICIT JOURNALED
 * ESCALATION states with reconciliation events — nothing is swallowed.
 * Below-threshold variances are journaled variance facts WITHOUT escalation
 * (the threshold is policy); beyond-tolerance counts hold as DISCREPANCY and
 * never silently overwrite canonical stock (INVARIANT 47). Escalation
 * advancement is authority-gated (owner/controller).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  makeId,
  money,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";
import { autonomousPolicy, bootstrapAutonomousStore, otherMerchant, ownerRef, storeActorOf, storeIdOf, usd } from "./support/autonomous-store.js";

const store = "store-anomaly";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");
const locStore = makeId<"LocationId">("loc-store");

function newKernel() {
  return new CommerceKernel();
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

async function openTill(kernel: CommerceKernel, till: string, floatMinor: string) {
  await mustExecute(kernel, env({
    type: "AUTONOMOUS_OPEN_TILL",
    autonomousStoreId: storeIdOf(store),
    tillId: makeId<"TillId">(till),
    openingCount: money(floatMinor, usd),
  }, storeActor));
  return kernel.view().allStoreSessions().find((session) => session.state === "OPEN" && session.autonomousStoreId === store)!;
}

describe("W1-005 acceptance scenario 4 — variance + anomaly land as explicit journaled escalation states", () => {
  it("a below-threshold cash variance at close journals the variance fact WITHOUT escalation; beyond the threshold it escalates", async () => {
    const kernel = newKernel(); // variance threshold $5.00
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1), { withPriceRecord: false });
    // Day 1 till: expected $110.00, counted $107.50 → SHORT $2.50 < $5.00 → no escalation.
    let session = await openTill(kernel, "till-small", "10000");
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("1000", usd) } }, storeActor));
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_CLOSE_TILL",
      autonomousStoreId: storeIdOf(store),
      sessionId: session.sessionId,
      closingCount: money("10750", usd),
    }, storeActor));
    let variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("SHORT");
    expect(variance.varianceAmount.amountMinor).toBe("250");
    expect(kernel.view().autonomousOps().allEscalations()).toHaveLength(0);
    // The close still journaled its policy application (action executed).
    expect(kernel.view().autonomousOps().allPolicyApplications().at(-1)!.actionKind).toBe("TILL_CLOSE");

    // Day 2 till: expected $60.00, counted $66.50 → OVER $6.50 ≥ $5.00 → escalation.
    session = await openTill(kernel, "till-big", "5500");
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("500", usd) } }, storeActor));
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_CLOSE_TILL",
      autonomousStoreId: storeIdOf(store),
      sessionId: session.sessionId,
      closingCount: money("6650", usd),
    }, storeActor));
    variance = kernel.view().allCashVariances().at(-1)!;
    expect(variance.kind).toBe("OVER");
    expect(variance.varianceAmount.amountMinor).toBe("650");
    const escalation = kernel.view().autonomousOps().allEscalations()[0]!;
    expect(escalation.kind).toBe("CASH_VARIANCE");
    expect(escalation.state).toBe("OPEN");
    if (escalation.evidence.kind === "CASH_VARIANCE") {
      expect(escalation.evidence.variance.varianceId).toBe(variance.varianceId);
      expect(escalation.evidence.variance.sessionId).toBe(session.sessionId);
    }
    // Both variance facts survive in the fold (nothing swallowed).
    expect(kernel.view().allCashVariances()).toHaveLength(2);
    twinOf(kernel);
  });

  it("a count mismatch beyond tolerance holds as DISCREPANCY + escalation and never overwrites canonical stock", async () => {
    const kernel = newKernel(); // count tolerance / escalation: 3 units
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1), { withPriceRecord: false });
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 20, reason: "RECEIVING" }));
    // Observed 25: |+5| > 3 → DISCREPANCY_HOLD + escalation, canonical level unchanged.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_RECONCILE_COUNT",
      autonomousStoreId: storeIdOf(store),
      observation: {
        observationId: makeId<"ObservationId">("obs-mismatch"),
        kind: "CYCLE_COUNT",
        skuId: skuTote,
        locationId: locStore,
        observedAt: "2026-01-05T10:00:00Z",
        source: { sourceType: "SCANNER", sourceRef: "scanner-back" },
        resolution: { resolved: "OBSERVED", value: 25 },
      },
    }, storeActor));
    expect(kernel.view().level(skuTote, locStore)!.onHand).toBe(20);
    const record = kernel.view().allReconciliationRecords()[0]!;
    expect(record.disposition).toBe("DISCREPANCY_HOLD");
    expect(record.varianceUnits).toBe(5);
    const escalation = kernel.view().autonomousOps().allEscalations()[0]!;
    expect(escalation.kind).toBe("COUNT_MISMATCH");
    if (escalation.evidence.kind === "COUNT_MISMATCH") {
      expect(escalation.evidence.observationId).toBe(makeId<"ObservationId">("obs-mismatch"));
      expect(escalation.evidence.varianceUnits).toBe(5);
      expect(escalation.evidence.disposition).toBe("DISCREPANCY_HOLD");
    }
    // Within tolerance: observed 18 (|−2| ≤ 3) → PROMOTED deterministically.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_RECONCILE_COUNT",
      autonomousStoreId: storeIdOf(store),
      observation: {
        observationId: makeId<"ObservationId">("obs-ok"),
        kind: "EMPLOYEE_COUNT",
        skuId: skuTote,
        locationId: locStore,
        observedAt: "2026-01-05T11:00:00Z",
        source: { sourceType: "SCANNER", sourceRef: "scanner-back" },
        resolution: { resolved: "OBSERVED", value: 18 },
      },
    }, storeActor));
    expect(kernel.view().level(skuTote, locStore)!.onHand).toBe(18);
    expect(kernel.view().allReconciliationRecords().at(-1)!.disposition).toBe("PROMOTED");
    expect(kernel.view().autonomousOps().allEscalations()).toHaveLength(1);
    // UNKNOWN observations are rejected by the autonomous path (use the
    // W1-004 reconcile command for tri-state observations).
    const unknown = await kernel.execute(env({
      type: "AUTONOMOUS_RECONCILE_COUNT",
      autonomousStoreId: storeIdOf(store),
      observation: {
        observationId: makeId<"ObservationId">("obs-unknown"),
        kind: "CYCLE_COUNT",
        skuId: skuTote,
        locationId: locStore,
        observedAt: "2026-01-05T12:00:00Z",
        source: { sourceType: "SCANNER", sourceRef: "scanner-back" },
        resolution: { resolved: "UNKNOWN", reason: "AMBIGUOUS", providerNativeStatus: "SCAN_UNCLEAR" },
      },
    }, storeActor));
    expect(unknown.status).toBe("REJECTED");
    twinOf(kernel);
  });

  it("escalation advancement is authority-gated: owner acknowledges/resolves; a bystander is boundary-rejected", async () => {
    const kernel = newKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1), { withPriceRecord: false });
    const session = await openTill(kernel, "till-esc", "8000");
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("700", usd) } }, storeActor));
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_CLOSE_TILL",
      autonomousStoreId: storeIdOf(store),
      sessionId: session.sessionId,
      closingCount: money("8000", usd), // SHORT $7.00 ≥ $5.00 → escalation
    }, storeActor));
    const escalation = kernel.view().autonomousOps().allEscalations()[0]!;
    expect(escalation.state).toBe("OPEN");
    // A bystander merchant cannot advance the escalation (boundary rejection).
    const before = kernel.events().length;
    const denied = await kernel.execute(env({ type: "ADVANCE_STORE_ESCALATION", escalationId: escalation.escalationId, trigger: "ACKNOWLEDGE" }, otherMerchant));
    expect(denied.status).toBe("REJECTED");
    if (denied.status === "REJECTED") {
      expect(denied.reason.code).toBe("POLICY_DENIED");
      expect(denied.reason.policyDecision?.reasons).toContain("NOT_AUTHORIZED");
    }
    expect(kernel.events().length).toBe(before);
    // The owner acknowledges, then resolves; terminal escalations reject further advances.
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_ESCALATION", escalationId: escalation.escalationId, trigger: "ACKNOWLEDGE" }, ownerRef));
    expect(kernel.view().autonomousOps().escalation(escalation.escalationId)!.state).toBe("ACKNOWLEDGED");
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_ESCALATION", escalationId: escalation.escalationId, trigger: "RESOLVE" }, ownerRef));
    expect(kernel.view().autonomousOps().escalation(escalation.escalationId)!.state).toBe("RESOLVED");
    const terminal = await kernel.execute(env({ type: "ADVANCE_STORE_ESCALATION", escalationId: escalation.escalationId, trigger: "ACKNOWLEDGE" }, ownerRef));
    expect(terminal.status).toBe("REJECTED");
    // An out-of-band till float (below the $10.00 minimum) is ALSO a journaled
    // violation + escalation — never a silent drop.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_OPEN_TILL",
      autonomousStoreId: storeIdOf(store),
      tillId: makeId<"TillId">("till-float"),
      openingCount: money("500", usd),
    }, storeActor));
    const floatViolation = kernel.view().autonomousOps().allEscalations().find((item) => item.kind === "POLICY_VIOLATION")!;
    expect(floatViolation.kind).toBe("POLICY_VIOLATION");
    expect(kernel.view().openStoreSessionFor(storeIdOf(store), makeId<"TillId">("till-float"))).toBeUndefined();
    twinOf(kernel);
  });
});
