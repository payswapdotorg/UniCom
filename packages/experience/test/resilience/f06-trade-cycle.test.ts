/**
 * W2-010 — Family F06: multi-hop TradeCycle (≥3 participants), per-leg
 * authorization, refusal/withdrawal, incomplete proof, recourse.
 * Fixture-contract evidence level.
 *
 * Drives the REAL journey dispatch (per-step canonical executability +
 * execution) over THREE FaultInjectingConnectorAdapter legs — one distinct
 * capability, scope and adapter per participant, so each leg's consent is
 * independently checkable. The dispatch runtime is never mocked; faults
 * (missing scope, revoked connection, refused/ambiguous execute) enter ONLY
 * through the adapters.
 *
 * F06-S06 drives the REAL CommerceKernel recourse flow (dispute → evidence →
 * resolution → explicit bounded refund) behind the FaultInjectingPaymentBoundary.
 */

import { describe, expect, it } from "vitest";
import { credentialScope } from "@unicom/agent";
import { countQuantity, makeId, money } from "@unicom/commerce";
import { TradeCycleLegFaultAdapter } from "./adapters/fault-connector-adapter";
import {
  createResilienceConnectorRig,
  createResilienceKernel,
  rigMoney,
  tradeCycleRequest,
  type ConnectedFaultAdapter,
  type TradeCycleLeg,
} from "./adapters/resilience-rig";
import type { CapabilityObservation } from "@unicom/agent/capability";
import type { ProviderImplementation } from "@unicom/agent/capability";
import { scenarioById } from "./matrix/oracle";

const family = "F06";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);


interface LegSpec {
  readonly stepRef: string;
  readonly commandRef: string;
  readonly capabilityId: string;
  readonly scope: string;
  /** Connect-time scope tokens for this participant (its OWN consent). */
  readonly grantedScopeTokens: readonly string[];
  readonly script?: ConstructorParameters<typeof TradeCycleLegFaultAdapter>[2];
}

const FULL_LEGS: readonly LegSpec[] = [
  { stepRef: "leg-1", commandRef: "cmd-f06-leg1", capabilityId: "cap-trade-leg1", scope: "trade.leg1.execute", grantedScopeTokens: ["trade.leg1.execute"] },
  { stepRef: "leg-2", commandRef: "cmd-f06-leg2", capabilityId: "cap-trade-leg2", scope: "trade.leg2.execute", grantedScopeTokens: ["trade.leg2.execute"] },
  { stepRef: "leg-3", commandRef: "cmd-f06-leg3", capabilityId: "cap-trade-leg3", scope: "trade.leg3.execute", grantedScopeTokens: ["trade.leg3.execute"] },
];

/** Connect all three legs on the given rig and observe each once. */
async function threeLegCycle(
  rig: Awaited<ReturnType<typeof createResilienceConnectorRig>>,
  legs: readonly LegSpec[],
): Promise<{
  readonly participants: readonly ConnectedFaultAdapter[];
  readonly observations: readonly CapabilityObservation[];
  readonly implementations: readonly ProviderImplementation[];
}> {
  const participants: ConnectedFaultAdapter[] = [];
  const observations: CapabilityObservation[] = [];
  const implementations: ProviderImplementation[] = [];
  for (const leg of legs) {
    const adapter = new TradeCycleLegFaultAdapter(`f06-${leg.stepRef}`, leg.capabilityId, {
      connect: { kind: "connected", scopeTokens: leg.grantedScopeTokens, permissions: [`trade.${leg.stepRef}`] },
      ...leg.script,
    });
    const connected = await rig.connect(adapter, {
      scopes: leg.grantedScopeTokens.join(" "),
      permissions: [`trade.${leg.stepRef}`],
    });
    const observed = await rig.runtime.observe(connected.connectorId);
    if (observed.observation !== null) observations.push(observed.observation);
    participants.push(connected);
    implementations.push(...adapter.descriptor.providerImplementations);
  }
  return { participants, observations, implementations };
}

function legsOf(legs: readonly LegSpec[], participants: readonly ConnectedFaultAdapter[]): readonly TradeCycleLeg[] {
  return legs.map((leg, index) => ({
    stepRef: leg.stepRef,
    commandRef: leg.commandRef,
    capabilityDefinitionId: leg.capabilityId,
    requiredScope: credentialScope(leg.scope),
    requiresCommercialTerms: true,
    participant: participants[index] as ConnectedFaultAdapter,
  }));
}

describe("W2-010 F06 — multi-hop TradeCycle per-leg consent (fixture-contract)", () => {
  it("F06-S01: all three legs authorized — every leg EXECUTABLE via its own participant, journey succeeded", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-success");
    const rig = await createResilienceConnectorRig();
    const { participants, observations, implementations } = await threeLegCycle(rig, FULL_LEGS);
    const dispatch = await rig.runtime.dispatch(
      tradeCycleRequest("journey-f06-s01", legsOf(FULL_LEGS, participants), observations, implementations, "f06-s01-seed"),
    );
    // VISIBLE: every planned leg is EXECUTABLE through its OWN instance.
    for (const [index, leg] of FULL_LEGS.entries()) {
      const planned = dispatch.plannedSteps[index];
      expect(planned?.executability.status).toBe("EXECUTABLE");
      expect(planned?.selectedInstanceId).toBe(participants[index]?.instance.connectedInstanceId);
      expect(planned?.stepRef).toBe(leg.stepRef);
    }
    expect(dispatch.stepOutcomes.map((outcome) => outcome.outcome)).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(dispatch.journeyOutcome).toBe("succeeded");
    // Each participant's adapter executed exactly its own leg — one call each.
    for (const participant of participants) {
      expect(participant.adapter.recordedCalls().executeInputs).toHaveLength(1);
    }
    // Per-leg idempotency keys are distinct (each leg is its own authorization).
    const keys = participants.map((participant) => participant.adapter.recordedCalls().executeInputs[0]?.idempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("F06-S02: leg 2 without its own consent is the ONLY blocked leg — its provider is never invoked", async () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    // Leg 2's participant connected with a READ-only scope — it never granted
    // execute consent for its leg. Legs 1 and 3 have their own consent.
    const legs: readonly LegSpec[] = FULL_LEGS.map((leg) =>
      leg.stepRef === "leg-2" ? { ...leg, grantedScopeTokens: ["trade.leg2.read"] } : leg,
    );
    const { participants, observations, implementations } = await threeLegCycle(rig, legs);
    const dispatch = await rig.runtime.dispatch(
      tradeCycleRequest("journey-f06-s02", legsOf(legs, participants), observations, implementations, "f06-s02-seed"),
    );
    // VISIBLE: leg 2 alone is NOT_EXECUTABLE with INSUFFICIENT_CREDENTIAL_SCOPE.
    const leg2 = dispatch.plannedSteps[1];
    expect(leg2?.executability.status).toBe("NOT_EXECUTABLE");
    if (leg2?.executability.status === "NOT_EXECUTABLE") {
      expect(leg2.executability.reasons).toContain("INSUFFICIENT_CREDENTIAL_SCOPE");
    }
    // Legs 1 and 3 remain executable through their own consent.
    expect(dispatch.plannedSteps[0]?.executability.status).toBe("EXECUTABLE");
    expect(dispatch.plannedSteps[2]?.executability.status).toBe("EXECUTABLE");
    // The leg-2 provider was NEVER invoked (the zero-side-effect proof).
    const leg2Adapter = participants[1]?.adapter;
    expect(leg2Adapter?.recordedCalls().executeInputs).toHaveLength(0);
    // The journey did not succeed — leg 2's outcome is the block note.
    expect(dispatch.stepOutcomes[1]?.outcome).toBe("failed-recoverable");
    expect(dispatch.stepOutcomes[1]?.note).toContain("INSUFFICIENT_CREDENTIAL_SCOPE");
    expect(dispatch.journeyOutcome).not.toBe("succeeded");
    expect(dispatch.journeyOutcome).toBe("failed-recoverable");
  });

  it("F06-S03: a participant REFUSES its leg (failed-terminal) → journey failed-terminal; recourse path is open", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const legs: readonly LegSpec[] = FULL_LEGS.map((leg) =>
      leg.stepRef === "leg-2"
        ? { ...leg, script: { executeByCommandRefPrefix: { "cmd-f06-leg2": { kind: "failed-terminal", note: "participant refuses this leg of the trade" } } } }
        : leg,
    );
    const { participants, observations, implementations } = await threeLegCycle(rig, legs);
    const dispatch = await rig.runtime.dispatch(
      tradeCycleRequest("journey-f06-s03", legsOf(legs, participants), observations, implementations, "f06-s03-seed"),
    );
    // VISIBLE: the refusal is the leg's terminal outcome and it governs the journey.
    expect(dispatch.stepOutcomes[1]?.outcome).toBe("failed-terminal");
    expect(dispatch.stepOutcomes[1]?.note).toContain("participant refuses");
    expect(dispatch.journeyOutcome).toBe("failed-terminal");
    expect(participants[1]?.adapter.recordedCalls().executeInputs).toHaveLength(1);
    // The refusing participant's provider state was preserved (no effects).
    expect(dispatch.stepOutcomes[1]?.providerObjectIds).toEqual([]);
  });

  it("F06-S04: a participant WITHDRAWS mid-cycle (revoked connection) → NOT_EXECUTABLE [DISCONNECTED], zero provider calls", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const legs: readonly LegSpec[] = FULL_LEGS.map((leg) =>
      leg.stepRef === "leg-3"
        ? { ...leg, script: { connect: { kind: "connected", scopeTokens: ["trade.leg3.execute"], permissions: ["trade.leg-3"], connectionStatus: "REVOKED" } } }
        : leg,
    );
    const { participants, observations, implementations } = await threeLegCycle(rig, legs);
    // VISIBLE: the withdrawn participant's connection status is surfaced.
    expect(participants[2]?.instance.connectionStatus).toBe("REVOKED");
    const dispatch = await rig.runtime.dispatch(
      tradeCycleRequest("journey-f06-s04", legsOf(legs, participants), observations, implementations, "f06-s04-seed"),
    );
    const leg3 = dispatch.plannedSteps[2];
    expect(leg3?.executability.status).toBe("NOT_EXECUTABLE");
    if (leg3?.executability.status === "NOT_EXECUTABLE") {
      expect(leg3.executability.reasons).toContain("DISCONNECTED");
    }
    expect(dispatch.stepOutcomes[2]?.outcome).toBe("failed-recoverable");
    expect(dispatch.journeyOutcome).not.toBe("succeeded");
    // The withdrawn participant's provider was never called after withdrawal.
    expect(participants[2]?.adapter.recordedCalls().executeInputs).toHaveLength(0);
    expect(rig.runtime.connector(participants[2]?.connectorId ?? "")?.lifecycle).toBe("connected");
  });

  it("F06-S05: incomplete proof on the closing leg → leg UNKNOWN, journey UNKNOWN — never silent success", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const legs: readonly LegSpec[] = FULL_LEGS.map((leg) =>
      leg.stepRef === "leg-3"
        ? { ...leg, script: { executeDefault: { kind: "unknown", note: "closing leg proof incomplete — provider state unclear" } } }
        : leg,
    );
    const { participants, observations, implementations } = await threeLegCycle(rig, legs);
    const dispatch = await rig.runtime.dispatch(
      tradeCycleRequest("journey-f06-s05", legsOf(legs, participants), observations, implementations, "f06-s05-seed"),
    );
    // VISIBLE: the closing leg is unknown (never done, never failed) and the
    // provider state is explicitly unknown.
    expect(dispatch.stepOutcomes[2]?.outcome).toBe("unknown");
    expect(dispatch.stepOutcomes[2]?.providerStatePreserved).toBe("unknown");
    expect(dispatch.stepOutcomes[2]?.note).toContain("proof incomplete");
    // The whole journey holds UNKNOWN — it is never promoted to succeeded.
    expect(dispatch.journeyOutcome).toBe("unknown");
    expect(dispatch.journeyOutcome).not.toBe("succeeded");
    expect(dispatch.journeyOutcome).not.toBe("failed-terminal");
  });

  it("F06-S06: recourse after a failed leg — dispute → evidence → resolution (no money) → explicit bounded refund", async () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    // A real captured payment for the failed leg's order (the recourse anchor).
    const cartId = makeId<"CartId">("cart-f06-s06");
    const merchantId = makeId<"MerchantId">("merchant-f06");
    const sku = makeId<"SkuId">("sku-f06-trade-lot");
    await rig.exec({ type: "ADD_CART_LINE", cartId, skuId: sku, quantity: countQuantity(1), unitPrice: rigMoney("12000") });
    await rig.exec({ type: "PLACE_ORDER", cartId, merchantId });
    const order = rig.kernel.view().allOrders().at(-1);
    if (order === undefined) throw new Error("order missing");
    await rig.exec({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: rigMoney("12000"), reference: { kind: "ORDER", orderId: order.orderId }, method: { methodKind: "CARD", tokenRef: "tok-f06" } },
    });
    const payment = rig.kernel.view().allPaymentIntents().at(-1);
    if (payment === undefined) throw new Error("payment missing");
    await rig.exec({ type: "CAPTURE_PAYMENT", paymentId: payment.paymentId });
    // Recourse: dispute the failed leg, submit evidence, resolve ACCEPTED.
    await rig.exec({ type: "OPEN_DISPUTE", paymentId: payment.paymentId, amount: rigMoney("12000"), reason: "TRADE_LEG_FAILED", providerNativeStatus: "DISPUTE_OPEN" });
    const dispute = rig.kernel.view().allDisputes()[0];
    if (dispute === undefined) throw new Error("dispute missing");
    await rig.exec({ type: "SUBMIT_DISPUTE_EVIDENCE", disputeId: dispute.disputeId, evidence: { summary: "leg 2 participant refused delivery; journey receipt attached" } });
    expect(rig.kernel.view().dispute(dispute.disputeId)?.state).toBe("EVIDENCE_SUBMITTED");
    const refundedBefore = rig.kernel.view().refundedTotalFor(payment.paymentId);
    await rig.exec({ type: "RESOLVE_DISPUTE", disputeId: dispute.disputeId, outcome: "ACCEPTED" });
    expect(rig.kernel.view().dispute(dispute.disputeId)?.state).toBe("RESOLVED_ACCEPTED");
    // VISIBLE: resolution itself moves NO money (the decision is a fact).
    expect(rig.kernel.view().refundedTotalFor(payment.paymentId)).toBe(refundedBefore);
    expect(rig.paymentBoundary.recordedCalls().refundCalls).toHaveLength(0);
    // The refund is an EXPLICIT bounded action afterwards — exactly once.
    const refund = await rig.exec({ type: "REFUND_PAYMENT", paymentId: payment.paymentId, amount: rigMoney("12000") });
    expect(refund.status).toBe("EXECUTED");
    expect(rig.kernel.view().refundedTotalFor(payment.paymentId)).toBe(12000n);
    expect(rig.kernel.view().capturedTotalFor(payment.paymentId)).toBe(12000n);
    expect(rig.paymentBoundary.recordedCalls().refundCalls).toHaveLength(1);
    expect(rig.paymentBoundary.recordedCalls().refundCalls[0]?.amount).toEqual(money("12000", rigMoney("1").currency));
    // A repeated refund submission never double-refunds (idempotent cap).
    const again = await rig.exec(
      { type: "REFUND_PAYMENT", paymentId: payment.paymentId, amount: rigMoney("12000") },
      { commandId: "cmd-f06-s06-refund-2", idempotencyKey: "key-f06-s06-refund-2" },
    );
    expect(again.status).toBe("REJECTED");
    expect(rig.paymentBoundary.recordedCalls().refundCalls).toHaveLength(1);
    expect(rig.kernel.view().refundedTotalFor(payment.paymentId)).toBe(12000n);
  });
});
