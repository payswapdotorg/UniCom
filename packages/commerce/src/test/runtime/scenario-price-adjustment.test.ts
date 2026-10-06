/**
 * W1-005 acceptance scenario 3 — in-policy price adjustments.
 *
 * Policy-band-legal adjustments apply + journal + project with full
 * before/after trails; out-of-band adjustments (below the margin floor,
 * beyond the approval threshold without an override, missing price record)
 * are JOURNALED policy rejections — the price book never moves. A human
 * override may force an out-of-band adjustment (authority-backed, journaled
 * principal transition with the override reference on the trail).
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

const store = "store-pricing";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");
const skuUnknown = makeId<"SkuId">("sku-unknown");

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor = storeActor) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  return outcome.status === "REJECTED" ? outcome.reason : { code: "?", detail: "?" };
}

describe("W1-005 acceptance scenario 3 — in-policy price adjustment (apply + journal + project; out-of-band journaled rejections)", () => {
  it("an in-band adjustment applies with a before/after trail, journals its policy application and projects", async () => {
    const kernel = new CommerceKernel();
    // margin floor 10% over a $10.00 cost → $11.00; approval threshold $5.00.
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    // $19.99 → $18.99: |Δ| $1.00 < $5.00, above the floor → ALLOW.
    await mustExecute(kernel, env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      newPrice: money("1899", usd),
      reason: "competitor match",
    }, storeActor));
    const record = kernel.view().autonomousOps().priceRecord(store, skuTote)!;
    expect(record.unitPrice.amountMinor).toBe("1899");
    expect(record.costBasis.amountMinor).toBe("1000");
    expect(record.revision).toBe(2);
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(true);
    expect(adjustment.before.amountMinor).toBe("1999");
    expect(adjustment.after.amountMinor).toBe("1899");
    expect(adjustment.decision).toBe("ALLOW");
    const application = kernel.view().autonomousOps().allPolicyApplications()[0]!;
    expect(application.actionKind).toBe("PRICE_ADJUSTMENT");
    expect(application.decision).toBe("ALLOW");
    expect(application.effectRef).toBe(`SKU_PRICE:${store}|${skuTote}`);
    // Projection-visible trail through the twin facts.
    const twin = twinOf(kernel);
    const facts = twin.facts().autonomousStore;
    expect(facts.skuPrice(store, skuTote)!.unitPrice.amountMinor).toBe("1899");
    expect(facts.adjustmentsForSku(store, skuTote)).toHaveLength(1);
    expect(facts.adjustmentsForSku(store, skuTote)[0]!.before.amountMinor).toBe("1999");
  });

  it("below the margin floor → journaled DENY rejection + escalation; the price never moves", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    await mustExecute(kernel, env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      newPrice: money("1050", usd),
      reason: "undercut",
    }, storeActor));
    // The price book is untouched; the rejection is journaled state.
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("1999");
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(false);
    expect(adjustment.decision).toBe("DENY");
    expect(adjustment.reasons).toEqual(["BELOW_MARGIN_FLOOR"]);
    expect(adjustment.before.amountMinor).toBe("1999");
    expect(adjustment.after.amountMinor).toBe("1050");
    const application = kernel.view().autonomousOps().allPolicyApplications()[0]!;
    expect(application.decision).toBe("DENY");
    const escalation = kernel.view().autonomousOps().allEscalations()[0]!;
    expect(escalation.kind).toBe("POLICY_VIOLATION");
    expect(escalation.evidence.kind).toBe("POLICY_VIOLATION");
    twinOf(kernel);
  });

  it("beyond the approval threshold → journaled REQUIRE_APPROVAL rejection (the human gate holds, no escalation)", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    // $19.99 → $25.99: |Δ| $6.00 ≥ $5.00 → REQUIRE_APPROVAL (no override).
    await mustExecute(kernel, env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      newPrice: money("2599", usd),
    }, storeActor));
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("1999");
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(false);
    expect(adjustment.decision).toBe("REQUIRE_APPROVAL");
    expect(adjustment.reasons).toEqual(["APPROVAL_THRESHOLD"]);
    expect(kernel.view().autonomousOps().allEscalations()).toHaveLength(0);
    twinOf(kernel);
  });

  it("a missing price record is a journaled NO_PRICE_RECORD rejection; an unmanaged store rejects autonomy outright", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    await mustExecute(kernel, env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuUnknown,
      newPrice: money("1500", usd),
    }, storeActor));
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(false);
    expect(adjustment.reasons).toEqual(["NO_PRICE_RECORD"]);
    // Autonomy without a registered policy is a deterministic refusal.
    const unmanaged = await kernel.execute(env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf("store-unmanaged"),
      skuId: skuTote,
      newPrice: money("1500", usd),
    }, storeActorOf("store-unmanaged")));
    expect(unmanaged.status).toBe("REJECTED");
    expect(kernel.view().autonomousOps().allPriceRecords()).toHaveLength(1);
    twinOf(kernel);
  });

  it("the owner may force an out-of-band adjustment via override (journaled principal transition + OVERRIDE trail)", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    await mustExecute(kernel, env({
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuTote, newPrice: money("2500", usd), reason: "clearance decision" },
      justification: "seasonal clearance",
    }, ownerRef));
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.unitPrice.amountMinor).toBe("2500");
    const override = kernel.view().autonomousOps().allOverrides()[0]!;
    expect(override.exercisedBy).toEqual(ownerRef);
    expect(override.justification).toBe("seasonal clearance");
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(true);
    expect(adjustment.decision).toBe("OVERRIDE");
    expect(adjustment.overrideRef).toBe(override.overrideId);
    expect(adjustment.before.amountMinor).toBe("1999");
    expect(adjustment.after.amountMinor).toBe("2500");
    const application = kernel.view().autonomousOps().allPolicyApplications()[0]!;
    expect(application.decision).toBe("OVERRIDE");
    // An override against a missing price record is a deterministic refusal (zero events).
    const before = kernel.events().length;
    await rejected(kernel, {
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "PRICE_ADJUSTMENT", skuId: skuUnknown, newPrice: money("900", usd), reason: "x" },
      justification: "nothing to adjust",
    }, ownerRef);
    expect(kernel.events().length).toBe(before);
    twinOf(kernel);
  });

  it("price-book declaration is authority-gated: a non-owner merchant is rejected at the boundary with zero events", async () => {
    const kernel = new CommerceKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    const before = kernel.events().length;
    const outcome = await kernel.execute(env({
      type: "SET_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      unitPrice: money("1000", usd),
      costBasis: money("500", usd),
    }, otherMerchant));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") {
      expect(outcome.reason.code).toBe("POLICY_DENIED");
      expect(outcome.reason.detail).toContain("NOT_AUTHORIZED");
    }
    expect(kernel.events().length).toBe(before);
    // The owner may re-declare the price book (revision bumps).
    await mustExecute(kernel, env({
      type: "SET_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      unitPrice: money("2100", usd),
      costBasis: money("1100", usd),
    }, ownerRef));
    expect(kernel.view().autonomousOps().priceRecord(store, skuTote)!.revision).toBe(2);
    twinOf(kernel);
  });
});
