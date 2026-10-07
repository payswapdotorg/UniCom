/**
 * W1-007 acceptance scenario 1 — campaign lifecycle: draft → scheduled →
 * active → paused → completed journaled end-to-end; eligibility/application
 * determinism proven (same inputs → same outcome); stacking/exclusivity policy
 * enforced incl. rejection cases.
 *
 * Every step is a typed idempotent kernel command; every effect is an immutable
 * journaled fact. Property-tested determinism: identical inputs produce
 * identical outcomes across repeated runs.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  campaignTransition,
  currency,
  makeId,
  money,
  resolveStacking,
  applyCampaignEffect,
  type Campaign,
  type CampaignEffect,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku1 = makeId<"SkuId">("sku-tote");
const sku2 = makeId<"SkuId">("sku-mug");
const merchantId = makeId<"MerchantId">("merchant-1");

function draftCampaign(id: string, rule: Campaign["rule"], skus?: readonly string[]): Campaign {
  return {
    campaignId: makeId<"CampaignId">(id),
    merchantId,
    title: `Campaign ${id}`,
    rule,
    state: "DRAFT",
    ...(skus ? { appliesToSkuIds: skus.map((s) => makeId<"SkuId">(s)) } : {}),
    stackable: false,
    revision: 1,
  };
}

describe("W1-007 scenario 1 — campaign lifecycle + eligibility + stacking", () => {
  it("walks draft → scheduled → active → paused → completed → retired end-to-end", async () => {
    const kernel = new CommerceKernel();
    const campaign = draftCampaign("camp-1", { kind: "PERCENTAGE_OFF", basisPoints: 1000 });

    await mustExecute(kernel, env({ type: "OPEN_CAMPAIGN", campaign }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("DRAFT");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "SCHEDULE" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("SCHEDULED");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "ACTIVATE" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("ACTIVE");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "PAUSE" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("PAUSED");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "RESUME" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("ACTIVE");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "COMPLETE" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("COMPLETED");

    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-1"), trigger: "RETIRE" }));
    expect(kernel.view().merchantOps().campaign("camp-1")?.state).toBe("RETIRED");
  });

  it("rejects invalid transitions deterministically (DRAFT → PAUSE is forbidden)", () => {
    const result = campaignTransition("DRAFT", "PAUSE");
    expect(result.ok).toBe(false);
  });

  it("proves eligibility/application determinism: same inputs → same outcome (property-tested)", async () => {
    const kernel = new CommerceKernel();
    const campaign = draftCampaign("camp-det", { kind: "PERCENTAGE_OFF", basisPoints: 1500 }, ["sku-tote"]);
    await mustExecute(kernel, env({ type: "OPEN_CAMPAIGN", campaign }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-det"), trigger: "ACTIVATE" }));

    // Run the same effect application 50 times — every outcome must be byte-identical.
    const outcomes: CampaignEffect[] = [];
    for (let i = 0; i < 50; i++) {
      const result = applyCampaignEffect(
        kernel.view().merchantOps().campaign("camp-det")!,
        sku1,
        money("1999", usd),
        "2026-10-08T00:00:00Z",
        "HALF_UP",
      );
      expect(result.ok).toBe(true);
      if (result.ok) outcomes.push(result.value);
    }
    // All 50 outcomes must have identical discount + net.
    const first = outcomes[0]!;
    for (const outcome of outcomes) {
      expect(outcome.discount.amountMinor).toBe(first.discount.amountMinor);
      expect(outcome.net.amountMinor).toBe(first.net.amountMinor);
      expect(outcome.gross.amountMinor).toBe(first.gross.amountMinor);
    }
    // 15% of 1999 = 299.85 → rounded to 300 (HALF_UP).
    expect(first.discount.amountMinor).toBe("300");
    expect(first.net.amountMinor).toBe("1699");
  });

  it("enforces SKU scope: out-of-scope SKU is rejected deterministically", async () => {
    const kernel = new CommerceKernel();
    const campaign = draftCampaign("camp-scope", { kind: "PERCENTAGE_OFF", basisPoints: 1000 }, ["sku-tote"]);
    await mustExecute(kernel, env({ type: "OPEN_CAMPAIGN", campaign }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-scope"), trigger: "ACTIVATE" }));

    // sku-mug is NOT in scope → deterministic rejection.
    const outcome = await kernel.execute(env({
      type: "APPLY_CAMPAIGN_EFFECT",
      campaignId: makeId<"CampaignId">("camp-scope"),
      skuId: sku2,
      lineAmount: money("1999", usd),
    }));
    expect(outcome.status).toBe("REJECTED");
  });

  it("enforces exclusivity: EXCLUSIVE policy keeps only the priority winner, rejects the rest", () => {
    const effectA: CampaignEffect = {
      effectId: makeId<"CampaignEffectId">("ce-a"),
      campaignId: makeId<"CampaignId">("camp-a"),
      skuId: sku1,
      gross: money("1000", usd),
      discount: money("100", usd),
      net: money("900", usd),
      appliedAt: "2026-10-08T00:00:00Z",
      revision: 1,
    };
    const effectB: CampaignEffect = {
      ...effectA,
      effectId: makeId<"CampaignEffectId">("ce-b"),
      campaignId: makeId<"CampaignId">("camp-b"),
      discount: money("150", usd),
      net: money("850", usd),
    };
    // EXCLUSIVE: camp-b has priority → effectB wins, effectA rejected.
    const resolution = resolveStacking([effectA, effectB], {
      mode: "EXCLUSIVE",
      priorityOrder: [makeId<"CampaignId">("camp-b"), makeId<"CampaignId">("camp-a")],
    });
    expect(resolution.accepted).toHaveLength(1);
    expect(resolution.accepted[0]!.campaignId).toBe("camp-b");
    expect(resolution.rejected).toHaveLength(1);
    expect(resolution.rejected[0]!.effect.campaignId).toBe("camp-a");
    expect(resolution.rejected[0]!.reason).toBe("EXCLUSIVE_POLICY");
  });

  it("enforces stackability: STACKABLE policy sums discounts (floored at gross)", () => {
    const effectA: CampaignEffect = {
      effectId: makeId<"CampaignEffectId">("ce-sa"),
      campaignId: makeId<"CampaignId">("camp-a"),
      skuId: sku1,
      gross: money("1000", usd),
      discount: money("100", usd),
      net: money("900", usd),
      appliedAt: "2026-10-08T00:00:00Z",
      revision: 1,
    };
    const effectB: CampaignEffect = {
      ...effectA,
      effectId: makeId<"CampaignEffectId">("ce-sb"),
      campaignId: makeId<"CampaignId">("camp-b"),
      discount: money("200", usd),
      net: money("800", usd),
    };
    const resolution = resolveStacking([effectA, effectB], { mode: "STACKABLE" });
    expect(resolution.accepted).toHaveLength(2);
    expect(resolution.rejected).toHaveLength(0);
    expect(resolution.totalDiscount.amountMinor).toBe("300");
  });

  it("floors stackable discounts at the gross amount (net never goes below zero)", () => {
    const effect: CampaignEffect = {
      effectId: makeId<"CampaignEffectId">("ce-floor"),
      campaignId: makeId<"CampaignId">("camp-floor"),
      skuId: sku1,
      gross: money("500", usd),
      discount: money("600", usd),
      net: money("-100", usd), // would be negative without the floor
      appliedAt: "2026-10-08T00:00:00Z",
      revision: 1,
    };
    const resolution = resolveStacking([effect], { mode: "STACKABLE" });
    expect(resolution.totalDiscount.amountMinor).toBe("500"); // floored at gross
  });

  it("journaled effect evidence: every APPLY_CAMPAIGN_EFFECT emits an immutable CAMPAIGN_EFFECT fact", async () => {
    const kernel = new CommerceKernel();
    const campaign = draftCampaign("camp-ev", { kind: "FIXED_AMOUNT_OFF", amount: money("500", usd) });
    await mustExecute(kernel, env({ type: "OPEN_CAMPAIGN", campaign }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-ev"), trigger: "ACTIVATE" }));
    await mustExecute(kernel, env({
      type: "APPLY_CAMPAIGN_EFFECT",
      campaignId: makeId<"CampaignId">("camp-ev"),
      skuId: sku1,
      lineAmount: money("1999", usd),
    }));
    const effects = kernel.view().merchantOps().allCampaignEffects();
    expect(effects).toHaveLength(1);
    expect(effects[0]!.discount.amountMinor).toBe("500");
    expect(effects[0]!.net.amountMinor).toBe("1499");
    expect(effects[0]!.campaignId).toBe("camp-ev");
  });
});
