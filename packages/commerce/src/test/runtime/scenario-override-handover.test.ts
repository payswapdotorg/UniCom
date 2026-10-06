/**
 * W1-005 acceptance scenario 5 — human override + authority handover.
 *
 * Override and handover are JOURNALED PRINCIPAL TRANSITIONS with enforced
 * authority boundaries: an override by the registered owner executes and
 * journals the transition (exercisedBy → on-behalf-of the store principal);
 * an override outside the actor's authority is REJECTED BY THE POLICY GATE
 * at the kernel boundary (zero journal entries). Authority handover passes
 * control between principals (AUTONOMOUS ↔ HUMAN_SUPERVISED) — performed by
 * the CURRENT controller only. The W1-004 till handover composes as the
 * custody-level principal transition.
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
import { autonomousPolicy, bootstrapAutonomousStore, otherMerchant, ownerRef, storeActorOf, storeIdOf, supervisor, usd } from "./support/autonomous-store.js";

const store = "store-control";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor = ownerRef) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  return outcome.status === "REJECTED" ? outcome.reason : { code: "?", detail: "?" };
}

describe("W1-005 acceptance scenario 5 — human override + authority handover (journaled principal transitions, enforced authority)", () => {
  it("the owner's override executes as a journaled principal transition; a non-owner is rejected by the policy gate (both paths)", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));

    // PATH 1 — authorized: the owner forces an out-of-band price adjustment.
    await mustExecute(kernel, env({
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("999", usd), reason: "loss-leader decision" },
      justification: "marketing campaign",
    }, ownerRef));
    const override = kernel.view().autonomousOps().allOverrides()[0]!;
    expect(override.exercisedBy).toEqual(ownerRef);
    expect(override.onBehalfOf).toEqual(storeActor);
    expect(override.action).toEqual({ kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("999", usd), reason: "loss-leader decision" });
    expect(override.occurredAt).toBe("2026-01-01T00:00:00Z");
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("999");
    const application = kernel.view().autonomousOps().allPolicyApplications().at(-1)!;
    expect(application.decision).toBe("OVERRIDE");
    expect(application.overrideRef).toBe(override.overrideId);
    expect(kernel.events().filter((event) => event.kind === "AUTONOMOUS_OVERRIDE_RECORDED")).toHaveLength(1);

    // PATH 2 — unauthorized: a bystander merchant is rejected at the kernel
    // boundary with ZERO journal entries.
    const before = kernel.events().length;
    const reason = await rejected(kernel, {
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("888", usd), reason: "nope" },
      justification: "not my store",
    }, otherMerchant);
    expect(reason.code).toBe("POLICY_DENIED");
    expect(reason.detail).toContain("NOT_AUTHORIZED");
    expect(kernel.events().length).toBe(before);
    expect(kernel.view().autonomousOps().allOverrides()).toHaveLength(1);
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("999");

    // An override against an UNREGISTERED store fails closed.
    const unregistered = await rejected(kernel, {
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf("store-ghost"),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("888", usd), reason: "nope" },
      justification: "ghost store",
    }, ownerRef);
    expect(unregistered.code).toBe("POLICY_DENIED");
    twinOf(kernel);
  });

  it("authority handover passes control between principals (journaled); unauthorized issuers and wrong holders are rejected", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    const initial = kernel.view().autonomousOps().controlFor(store)!;
    expect(initial.ownerRef).toEqual(ownerRef);
    expect(initial.controllingPrincipal).toEqual(storeActor);
    expect(initial.mode).toBe("AUTONOMOUS");

    // A bystander cannot hand over control (boundary rejection, zero events).
    const before = kernel.events().length;
    await rejected(kernel, {
      type: "HANDOVER_STORE_AUTHORITY",
      autonomousStoreId: storeIdOf(store),
      fromPrincipal: storeActor,
      toPrincipal: supervisor,
      toMode: "HUMAN_SUPERVISED",
    }, otherMerchant);
    expect(kernel.events().length).toBe(before);

    // The owner hands control to the human supervisor (journaled principal transition).
    await mustExecute(kernel, env({
      type: "HANDOVER_STORE_AUTHORITY",
      autonomousStoreId: storeIdOf(store),
      fromPrincipal: storeActor,
      toPrincipal: supervisor,
      toMode: "HUMAN_SUPERVISED",
    }, ownerRef));
    const supervised = kernel.view().autonomousOps().controlFor(store)!;
    expect(supervised.controllingPrincipal).toEqual(supervisor);
    expect(supervised.mode).toBe("HUMAN_SUPERVISED");
    expect(supervised.revision).toBe(2);
    const transitions = kernel.events().filter((event) => event.kind === "STORE_AUTHORITY_CHANGED");
    expect(transitions).toHaveLength(1);

    // Handover must be performed by the CURRENT controller: the owner naming
    // the OLD controller no longer matches (the supervisor holds control).
    const stale = await rejected(kernel, {
      type: "HANDOVER_STORE_AUTHORITY",
      autonomousStoreId: storeIdOf(store),
      fromPrincipal: storeActor,
      toPrincipal: ownerRef,
      toMode: "AUTONOMOUS",
    }, ownerRef);
    expect(stale.detail).toContain("current controlling principal");

    // The supervisor (now controller) can override autonomously-forced decisions.
    await mustExecute(kernel, env({
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("1500", usd), reason: "supervisor call" },
      justification: "supervised correction",
    }, supervisor));
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("1500");

    // Control hands back to the autonomous principal (restoring autonomy).
    await mustExecute(kernel, env({
      type: "HANDOVER_STORE_AUTHORITY",
      autonomousStoreId: storeIdOf(store),
      fromPrincipal: supervisor,
      toPrincipal: storeActor,
      toMode: "AUTONOMOUS",
    }, supervisor));
    const restored = kernel.view().autonomousOps().controlFor(store)!;
    expect(restored.controllingPrincipal).toEqual(storeActor);
    expect(restored.mode).toBe("AUTONOMOUS");
    expect(kernel.events().filter((event) => event.kind === "STORE_AUTHORITY_CHANGED")).toHaveLength(2);
    expect(kernel.view().autonomousOps().allOverrides()).toHaveLength(1);
    twinOf(kernel);
  });

  it("till custody handover composes: the autonomous principal hands the drawer to a human (W1-004 vocabulary, journaled transition)", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1), { withPriceRecord: false });
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_OPEN_TILL",
      autonomousStoreId: storeIdOf(store),
      tillId: makeId<"TillId">("till-front"),
      openingCount: money("6000", usd),
    }, storeActor));
    const session = kernel.view().allStoreSessions().find((item) => item.state === "OPEN")!;
    expect(session.staffRef).toEqual(storeActor);
    // The autonomous store principal hands custody to the human supervisor.
    await mustExecute(kernel, env({
      type: "HANDOVER_STORE_CASH_SESSION",
      sessionId: session.sessionId,
      fromStaff: storeActor,
      toStaff: supervisor,
      countedCash: money("5900", usd),
    }, ownerRef));
    expect(kernel.view().storeSession(session.sessionId)!.state).toBe("HANDED_OVER");
    const successor = kernel.view().allStoreSessions().find((item) => item.sessionId !== session.sessionId)!;
    expect(successor.staffRef).toEqual(supervisor);
    expect(successor.openingCount.amountMinor).toBe("5900");
    const variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("SHORT");
    expect(variance.occasion).toBe("HANDOVER");
    // A human (not the store principal) closes the successor session via the
    // W1-004 vocabulary — composition across the whole custody chain.
    await mustExecute(kernel, env({ type: "CLOSE_STORE_CASH_SESSION", sessionId: successor.sessionId, closingCount: money("5900", usd) }, supervisor));
    expect(kernel.view().storeSession(successor.sessionId)!.state).toBe("CLOSED");
    twinOf(kernel);
  });
});
