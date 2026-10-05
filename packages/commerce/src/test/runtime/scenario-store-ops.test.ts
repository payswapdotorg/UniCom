/**
 * W1-004 acceptance scenario 6 — autonomous-store primitives.
 *
 * opening count → till operations → staff handover (principal transition) →
 * closing count → reconciliation events fold deterministically; a cash
 * variance at close (or handover) is an EXPLICIT JOURNALED STATE
 * (BALANCED / OVER / SHORT — never an error swallowed). Guards: one OPEN
 * session per till, negative-till rejection, currency match, handover by
 * the CURRENT staff only, operations on terminal sessions rejected.
 * Reconstruction from the journal reproduces the exact same store state.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  currency,
  makeId,
  money,
  reconstructKernel,
  type CommandExecution,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const store = makeId<"AutonomousStoreId">("store-downtown");
const till = makeId<"TillId">("till-front");
const staffAlice = { kind: "MERCHANT" as const, merchantId: makeId<"MerchantId">("merchant-alice") };
const staffBob = { kind: "CUSTOMER" as const, customerId: makeId<"CustomerId">("customer-bob") };

function newKernel() {
  return new CommerceKernel();
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0]): Promise<CommandExecution> {
  const outcome = await kernel.execute(env(payload));
  expect(outcome.status).toBe("REJECTED");
  return outcome;
}

describe("W1-004 acceptance scenario 6 — autonomous-store cash sessions (opening → till → handover → close → reconciliation)", () => {
  it("walks the full deterministic custody chain with exact cash math and explicit variance facts", async () => {
    const kernel = newKernel();
    // Opening count: $50.00 float.
    await mustExecute(kernel, env({
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: till,
      openingCount: money("5000", usd),
      staff: staffAlice,
    }));
    const session = kernel.view().allStoreSessions()[0]!;
    expect(session.state).toBe("OPEN");
    expect(session.staffRef).toEqual(staffAlice);
    expect(session.expectedCash.amountMinor).toBe("5000");

    // Till operations: +12.00 sale, −5.00 cash out, −3.00 refund tender, +1.00 cash in.
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("1200", usd) } }));
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "CASH_OUT", amount: money("500", usd), note: "safe drop" } }));
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "REFUND_TENDER", amount: money("300", usd) } }));
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "CASH_IN", amount: money("100", usd) } }));
    const afterOps = kernel.view().storeSession(session.sessionId)!;
    expect(afterOps.expectedCash.amountMinor).toBe("5500");
    expect(afterOps.revision).toBe(5);

    // Handover: Alice counts exactly $55.00 → successor session opens for Bob with BALANCED variance.
    await mustExecute(kernel, env({
      type: "HANDOVER_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      fromStaff: staffAlice,
      toStaff: staffBob,
      countedCash: money("5500", usd),
    }));
    expect(kernel.view().storeSession(session.sessionId)?.state).toBe("HANDED_OVER");
    const successor = kernel.view().allStoreSessions().find((item) => item.sessionId !== session.sessionId)!;
    expect(successor.state).toBe("OPEN");
    expect(successor.staffRef).toEqual(staffBob);
    expect(successor.openingCount.amountMinor).toBe("5500");
    expect(successor.sessionId).not.toBe(session.sessionId);
    const variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("BALANCED");
    expect(variance.varianceAmount.amountMinor).toBe("0");
    expect(variance.occasion).toBe("HANDOVER");

    // Bob tenders a $9.00 sale → expected $64.00; close counts $62.00 → SHORT $2.00.
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: successor.sessionId, operation: { kind: "TENDER_SALE", amount: money("900", usd) } }));
    await mustExecute(kernel, env({ type: "CLOSE_STORE_CASH_SESSION", sessionId: successor.sessionId, closingCount: money("6200", usd) }));
    expect(kernel.view().storeSession(successor.sessionId)?.state).toBe("CLOSED");
    const closingVariance = kernel.view().allCashVariances().find((item) => item.occasion === "CLOSE")!;
    expect(closingVariance.kind).toBe("SHORT");
    expect(closingVariance.varianceAmount.amountMinor).toBe("200");
    expect(closingVariance.expected.amountMinor).toBe("6400");
    expect(closingVariance.counted.amountMinor).toBe("6200");
    expect(closingVariance.occasion).toBe("CLOSE");

    // Journal observability: every operation/reconciliation is an immutable fact.
    expect(kernel.events().filter((event) => event.kind === "TILL_OPERATION_RECORDED")).toHaveLength(5);
    expect(kernel.events().filter((event) => event.kind === "CASH_VARIANCE_RECORDED")).toHaveLength(2);
    expect(kernel.events().filter((event) => event.kind === "STORE_SESSION_STATE_CHANGED")).toHaveLength(2);

    // Twin projection: sessions, variances and custody agree.
    const twin = twinOf(kernel);
    expect(twin.facts().storeOperations.storeSessions()).toHaveLength(2);
    expect(twin.facts().storeOperations.cashVariances().map((item) => item.kind)).toEqual(["BALANCED", "SHORT"]);
    expect(twin.facts().storeOperations.openSessionFor(store, till)).toBeUndefined();
    expect(twin.storeOps.storeSessions.size).toBe(2);
    expect(twin.storeOps.cashVariances.size).toBe(2);

    // Replay determinism: reconstruction from the journal reproduces the state exactly.
    const reconstructed = reconstructKernel(kernel.persistentState());
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
  });

  it("an OVER variance at close is explicit journaled state (counted above expected — never an error swallowed)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: makeId<"TillId">("till-express"),
      openingCount: money("1000", usd),
      staff: staffBob,
    }));
    const session = kernel.view().allStoreSessions()[0]!;
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("250", usd) } }));
    // Counted $13.00 vs expected $12.50 → OVER by $0.50.
    await mustExecute(kernel, env({ type: "CLOSE_STORE_CASH_SESSION", sessionId: session.sessionId, closingCount: money("1300", usd) }));
    const variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("OVER");
    expect(variance.varianceAmount.amountMinor).toBe("50");
    twinOf(kernel);
  });

  it("guards: exclusive OPEN session per till, negative till rejected, currency mismatch rejected, terminal sessions reject operations", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: till,
      openingCount: money("2000", usd),
      staff: staffAlice,
    }));
    const session = kernel.view().allStoreSessions()[0]!;
    // Second OPEN on the same till is a deterministic rejection.
    await rejected(kernel, {
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: till,
      openingCount: money("1000", usd),
      staff: staffBob,
    });
    // A different till may open concurrently.
    await mustExecute(kernel, env({
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: makeId<"TillId">("till-back"),
      openingCount: money("500", usd),
      staff: staffBob,
    }));
    // Negative opening count rejected.
    await rejected(kernel, {
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: makeId<"TillId">("till-neg"),
      openingCount: money("-1", usd),
      staff: staffBob,
    });
    // CASH_OUT larger than the drawer would go negative → rejected.
    await rejected(kernel, {
      type: "RECORD_TILL_OPERATION",
      sessionId: session.sessionId,
      operation: { kind: "CASH_OUT", amount: money("2001", usd) },
    });
    // Currency mismatch rejected.
    await rejected(kernel, {
      type: "RECORD_TILL_OPERATION",
      sessionId: session.sessionId,
      operation: { kind: "TENDER_SALE", amount: money("100", currency("EUR")) },
    });
    await rejected(kernel, {
      type: "CLOSE_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      closingCount: money("100", currency("EUR")),
    });
    expect(kernel.view().storeSession(session.sessionId)?.state).toBe("OPEN");
    // Close, then terminal guards: operations and close/handover all reject.
    await mustExecute(kernel, env({ type: "CLOSE_STORE_CASH_SESSION", sessionId: session.sessionId, closingCount: money("2000", usd) }));
    await rejected(kernel, {
      type: "RECORD_TILL_OPERATION",
      sessionId: session.sessionId,
      operation: { kind: "CASH_IN", amount: money("100", usd) },
    });
    await rejected(kernel, {
      type: "HANDOVER_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      fromStaff: staffAlice,
      toStaff: staffBob,
      countedCash: money("2000", usd),
    });
    await rejected(kernel, { type: "CLOSE_STORE_CASH_SESSION", sessionId: session.sessionId, closingCount: money("2000", usd) });
    twinOf(kernel);
  });

  it("handover is a principal transition: only the CURRENT staff can hand custody over", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "OPEN_STORE_CASH_SESSION",
      autonomousStoreId: store,
      tillId: makeId<"TillId">("till-night"),
      openingCount: money("800", usd),
      staff: staffAlice,
    }));
    const session = kernel.view().allStoreSessions()[0]!;
    // Bob cannot hand over Alice's session.
    const wrong = await rejected(kernel, {
      type: "HANDOVER_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      fromStaff: staffBob,
      toStaff: staffAlice,
      countedCash: money("800", usd),
    });
    if (wrong.status === "REJECTED") expect(wrong.reason.detail).toContain("current staff");
    expect(kernel.view().allStoreSessions()).toHaveLength(1);
    // Alice can.
    await mustExecute(kernel, env({
      type: "HANDOVER_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      fromStaff: staffAlice,
      toStaff: staffBob,
      countedCash: money("700", usd),
    }));
    // The $1.00 handover variance is journaled (SHORT at the principal boundary).
    const variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("SHORT");
    expect(variance.occasion).toBe("HANDOVER");
    expect(variance.varianceId).toBeDefined();
    // Bob's successor session continues with the counted cash as opening.
    const successor = kernel.view().allStoreSessions().find((item) => item.sessionId !== session.sessionId)!;
    expect(successor.openingCount.amountMinor).toBe("700");
    expect(successor.expectedCash.amountMinor).toBe("700");
    twinOf(kernel);
  });
});
