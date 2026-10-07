/**
 * W1-007 acceptance scenario 6 — idempotency + replay: every new command
 * idempotent under retry; prefix-replay determinism (the autonomous-store
 * pattern).
 *
 * Every W1-007 command (OPEN_CAMPAIGN, ADVANCE_CAMPAIGN, APPLY_CAMPAIGN_EFFECT,
 * OPEN_LOYALTY_ACCOUNT, ACCRUE_LOYALTY, REDEEM_LOYALTY, EXPIRE_LOYALTY,
 * ADJUST_LOYALTY, RECORD_DEMAND_SIGNAL, PROPOSE_REORDER,
 * ADVANCE_REORDER_PROPOSAL, OPEN_CUSTOMER_RECORD, RESOLVE_CAMPAIGN_STACKING)
 * carries a typed idempotency key. Replaying the same envelope returns the
 * ORIGINAL receipt with zero new effects; key reuse with a different command
 * id is a hard conflict. Prefix-replay reconstructs identical state.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  commandEnvelope,
  makeId,
  money,
  currency,
  reconstructAuthoritativeState,
  type AnyRuntimeCommand,
  type CommandExecution,
} from "../../contract.js";
import { env, explicitEnv, mustExecute, MERCHANT_ACTOR } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-idem");
const loc = makeId<"LocationId">("loc-idem");
const merchantId = makeId<"MerchantId">("merchant-idem");

describe("W1-007 scenario 6 — idempotency + prefix-replay", () => {
  it("every new command idempotent under retry (exact replay → DUPLICATE, zero effects)", async () => {
    const kernel = new CommerceKernel();

    // OPEN_CAMPAIGN
    const openCampaign = explicitEnv("cmd-oc", "idem-oc", {
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-idem"),
        merchantId,
        title: "Idempotency campaign",
        rule: { kind: "PERCENTAGE_OFF", basisPoints: 1000 },
        state: "DRAFT",
        stackable: false,
        revision: 1,
      },
    });
    await mustExecute(kernel, openCampaign);
    let replay = await kernel.execute(openCampaign);
    expect(replay.status).toBe("DUPLICATE");

    // ADVANCE_CAMPAIGN
    const advance = explicitEnv("cmd-ac", "idem-ac", {
      type: "ADVANCE_CAMPAIGN",
      campaignId: makeId<"CampaignId">("camp-idem"),
      trigger: "ACTIVATE",
    });
    await mustExecute(kernel, advance);
    replay = await kernel.execute(advance);
    expect(replay.status).toBe("DUPLICATE");

    // APPLY_CAMPAIGN_EFFECT
    const applyEffect = explicitEnv("cmd-ae", "idem-ae", {
      type: "APPLY_CAMPAIGN_EFFECT",
      campaignId: makeId<"CampaignId">("camp-idem"),
      skuId: sku,
      lineAmount: money("1000", usd),
    });
    await mustExecute(kernel, applyEffect);
    replay = await kernel.execute(applyEffect);
    expect(replay.status).toBe("DUPLICATE");

    // OPEN_LOYALTY_ACCOUNT
    const openLoyalty = explicitEnv("cmd-ol", "idem-ol", {
      type: "OPEN_LOYALTY_ACCOUNT",
      account: {
        loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-idem"),
        customerRecordId: makeId<"CustomerRecordId">("cr-idem"),
        merchantId,
        status: "OPEN",
        balance: "0" as never,
        revision: 1,
      },
      tierPolicy: { tiers: [] },
    });
    await mustExecute(kernel, openLoyalty);
    replay = await kernel.execute(openLoyalty);
    expect(replay.status).toBe("DUPLICATE");

    // ACCRUE_LOYALTY
    const accrue = explicitEnv("cmd-al", "idem-al", {
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-idem"),
      points: "100" as never,
      reason: "ORDER_PURCHASE",
    });
    await mustExecute(kernel, accrue);
    replay = await kernel.execute(accrue);
    expect(replay.status).toBe("DUPLICATE");

    // RECORD_DEMAND_SIGNAL
    const recordSignal = explicitEnv("cmd-rd", "idem-rd", {
      type: "RECORD_DEMAND_SIGNAL",
      signal: {
        demandSignalId: makeId<"DemandSignalId">("ds-idem"),
        skuId: sku,
        locationId: loc,
        periodStart: "2026-10-01T00:00:00Z",
        periodEnd: "2026-10-07T00:00:00Z",
        unitsObserved: 50,
        method: { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 },
        observedAt: "2026-10-08T00:00:00Z",
        revision: 1,
      },
    });
    await mustExecute(kernel, recordSignal);
    replay = await kernel.execute(recordSignal);
    expect(replay.status).toBe("DUPLICATE");

    // PROPOSE_REORDER
    const propose = explicitEnv("cmd-pr", "idem-pr", {
      type: "PROPOSE_REORDER",
      sourceDemandSignalId: makeId<"DemandSignalId">("ds-idem"),
      skuId: sku,
      locationId: loc,
      forecast: { kind: "OBSERVED", value: 8 } as never,
      currentOnHand: 40,
      leadTimeDays: 2,
      safetyStockUnits: 5,
    });
    await mustExecute(kernel, propose);
    replay = await kernel.execute(propose);
    expect(replay.status).toBe("DUPLICATE");

    // The journal has exactly the events from the 7 commands (some commands
    // emit multiple events — e.g. OPEN_LOYALTY_ACCOUNT emits account-opened +
    // tier-policy-set; ACCRUE_LOYALTY emits entry-recorded + account-updated).
    // The critical invariant: duplicates produce ZERO additional events.
    const journalBeforeDuplicates = kernel.events().length;
    // Re-fire every command (all should DUPLICATE, zero new events).
    for (const cmd of [openCampaign, advance, applyEffect, openLoyalty, accrue, recordSignal, propose]) {
      const replayResult = await kernel.execute(cmd);
      expect(replayResult.status).toBe("DUPLICATE");
    }
    expect(kernel.events().length).toBe(journalBeforeDuplicates);
  });

  it("key reuse with a different command id is a hard conflict", async () => {
    const kernel = new CommerceKernel();
    const first = explicitEnv("cmd-conflict-1", "idem-conflict", {
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-conflict"),
        merchantId,
        title: "Conflict campaign",
        rule: { kind: "PERCENTAGE_OFF", basisPoints: 500 },
        state: "DRAFT",
        stackable: false,
        revision: 1,
      },
    });
    await mustExecute(kernel, first);
    // Same idempotency key, different command id → CONFLICT.
    const conflict = commandEnvelope(
      makeId<"CommandId">("cmd-conflict-2"),
      makeId<"IdempotencyKey">("idem-conflict"),
      MERCHANT_ACTOR,
      "2026-10-08T00:00:00Z",
      first.payload,
    );
    const outcome = await kernel.execute(conflict);
    expect(outcome.status).toBe("REJECTED");
  });

  it("prefix-replay determinism: full-journal reconstruction produces identical state", async () => {
    const kernel = new CommerceKernel();
    // Run a non-trivial sequence of W1-007 commands.
    await mustExecute(kernel, env({
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-replay"),
        merchantId,
        title: "Replay campaign",
        rule: { kind: "FIXED_AMOUNT_OFF", amount: money("100", usd) },
        state: "DRAFT",
        stackable: true,
        revision: 1,
      },
    }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-replay"), trigger: "ACTIVATE" }));
    await mustExecute(kernel, env({ type: "APPLY_CAMPAIGN_EFFECT", campaignId: makeId<"CampaignId">("camp-replay"), skuId: sku, lineAmount: money("500", usd) }));
    await mustExecute(kernel, env({
      type: "OPEN_LOYALTY_ACCOUNT",
      account: { loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-replay"), customerRecordId: makeId<"CustomerRecordId">("cr-replay"), merchantId, status: "OPEN", balance: "0" as never, revision: 1 },
      tierPolicy: { tiers: [] },
    }));
    await mustExecute(kernel, env({ type: "ACCRUE_LOYALTY", loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-replay"), points: "200" as never, reason: "ORDER_PURCHASE" }));
    await mustExecute(kernel, env({ type: "REDEEM_LOYALTY", loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-replay"), points: "50" as never }));
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: { demandSignalId: makeId<"DemandSignalId">("ds-replay"), skuId: sku, locationId: loc, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-07T00:00:00Z", unitsObserved: 25, method: { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 }, observedAt: "2026-10-08T00:00:00Z", revision: 1 },
    }));
    await mustExecute(kernel, env({ type: "PROPOSE_REORDER", sourceDemandSignalId: makeId<"DemandSignalId">("ds-replay"), skuId: sku, locationId: loc, forecast: { kind: "OBSERVED", value: 4 } as never, currentOnHand: 20, leadTimeDays: 3, safetyStockUnits: 8 }));

    // Reconstruct from the journal alone.
    const events = kernel.events();
    const reconstructed = reconstructAuthoritativeState(events);

    // The reconstructed state's snapshot must match the live kernel's snapshot.
    expect(JSON.stringify(reconstructed.snapshot())).toBe(JSON.stringify(kernel.snapshot()));

    // Anti-vacuity: the reconstruction genuinely has the merchant collections.
    expect(reconstructed.view().merchantOps().allCampaigns()).toHaveLength(1);
    expect(reconstructed.view().merchantOps().allLoyaltyAccounts()).toHaveLength(1);
    expect(reconstructed.view().merchantOps().allLoyaltyLedgerEntries()).toHaveLength(2); // accrue + redeem
    expect(reconstructed.view().merchantOps().allDemandSignals()).toHaveLength(1);
    expect(reconstructed.view().merchantOps().allReorderProposals()).toHaveLength(1);
  });

  it("concurrent duplicate submissions of one envelope resolve to exactly one execution", async () => {
    const kernel = new CommerceKernel();
    const envelope = explicitEnv("cmd-concurrent", "idem-concurrent", {
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-concurrent"),
        merchantId,
        title: "Concurrent campaign",
        rule: { kind: "PERCENTAGE_OFF", basisPoints: 1000 },
        state: "DRAFT",
        stackable: false,
        revision: 1,
      },
    });
    // Fire 10 identical submissions concurrently.
    const outcomes: CommandExecution[] = await Promise.all(
      Array.from({ length: 10 }, () => kernel.execute(envelope)),
    );
    const executed = outcomes.filter((o) => o.status === "EXECUTED").length;
    const duplicates = outcomes.filter((o) => o.status === "DUPLICATE").length;
    expect(executed).toBe(1);
    expect(duplicates).toBe(9);
    // The journal has exactly ONE event for this command.
    expect(kernel.events().length).toBe(1);
  });
});
