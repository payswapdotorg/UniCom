/**
 * buyer-opportunities fixture data (J8) — the committed DEMO inbox items
 * (namespaced w2o-*), shaped as the TYPED OpportunityInboxView contract
 * from @unicom/experience. The demand-forecast suggestion's predictive basis
 * is computed by the REAL commerce runtime (computeDemandForecast via the
 * public @unicom/commerce entrypoint) — deterministic on every render.
 */
import { computeDemandForecast } from "@unicom/commerce";
import type { OpportunityInboxItem, OpportunityInboxView, TransactionProofRef } from "@unicom/experience";
import { demoRef, utc } from "../buyer-support/demo-data.js";

/** The demo buyer's committed weekly ink-consumption history (units/week). */
const INK_WEEKLY_UNITS: readonly number[] = [3, 4, 2, 3, 5, 3];

/**
 * The real runtime forecast behind the price-timing suggestion
 * (SIMPLE_MOVING_AVERAGE, 4-week window — deterministic pure function).
 */
export function inkDemandForecast(): { readonly weeklyUnits: number; readonly note: string } {
  const resolution = computeDemandForecast(INK_WEEKLY_UNITS, {
    kind: "SIMPLE_MOVING_AVERAGE",
    windowDays: 4,
  });
  if (resolution.kind === "OBSERVED") {
    return {
      weeklyUnits: resolution.value,
      note: `your studio burns ~${resolution.value} boxes/week (SIMPLE_MOVING_AVERAGE over your committed demo purchase history, computed by the commerce runtime)`,
    };
  }
  return {
    weeklyUnits: 0,
    note: `demand forecast UNKNOWN (${resolution.reason}) — the runtime refused to guess`,
  };
}

export function opportunitiesView(): OpportunityInboxView {
  const ink = inkDemandForecast();
  const items: readonly OpportunityInboxItem[] = [
    {
      itemId: "w2o-01",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-01"),
      category: "price-timing",
      title: "Pigment ink set: buy now or wait?",
      summary:
        "The co-op price held at 41.00 USD for three weeks; your usage suggests a decision window before your shelf runs dry.",
      disclosure: {
        observation:
          "Current verified price 41.00 USD per set (co-op feed, checked 2026-10-12T08:00Z, demo clock). You hold 2 sets on the shelf.",
        inference: `Past co-op promos ran on ~3-week cycles (committed demo history). ${ink.note}.`,
        prediction: {
          summary:
            "At ~3 boxes/week you need the next set within 2–3 weeks; waiting for a promo may or may not line up with that.",
          truthClass: "predictive",
          confidenceNote:
            "Predictive only — computed by the deterministic forecasting runtime from your demo history; never operational truth, never a price promise.",
        },
        recommendation:
          "Safe next action: set a price alert — you decide later, nothing is ordered or reserved by acting on this.",
      },
      status: "new",
      estimatedValueNote: "If a 4.00 USD promo lands in time: ~12.00 USD saved on 3 sets (demo arithmetic).",
      requiresAuthorization: false,
      evidence: [
        {
          evidenceId: "w2o-01-e1",
          kind: "connector-observation",
          summary: "Co-op price feed: 41.00 USD/set verified at 2026-10-12T08:00Z (demo clock).",
          capturedAt: utc("2026-10-12T08:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-01-price-feed"),
          sourceArtifactRefs: ["demo-feed/co-op-prices"],
        },
        {
          evidenceId: "w2o-01-e2",
          kind: "account-history",
          summary: "Your purchase history: weekly ink units [3, 4, 2, 3, 5, 3] (committed demo fixture).",
          capturedAt: utc("2026-10-11T20:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-01-history"),
          sourceArtifactRefs: ["demo-account/harbor-lane-purchases"],
        },
      ],
      surfacedAt: utc("2026-10-12T08:30:00Z"),
    },
    {
      itemId: "w2o-02",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-02"),
      category: "group-deal",
      title: "A3 recycled card pool needs 12 more boxes",
      summary:
        "The studio pool you watched is 48/60 toward its threshold; the deadline is Oct 15, 18:00 (demo clock).",
      disclosure: {
        observation: "48 of 60 boxes spoken for; threshold price 11.20 USD/box vs 12.75 list (demo pool state).",
        inference: "Pools this close to threshold usually form — but formation is the organizer's call, not yours.",
        recommendation:
          "Safe next action: view the pool on the group-buy surface. Expressing interest is never a commitment there either.",
      },
      status: "new",
      estimatedValueNote: "1.55 USD/box below list at the threshold price (exact demo fixture values).",
      requiresAuthorization: false,
      evidence: [
        {
          evidenceId: "w2o-02-e1",
          kind: "agent-certification",
          summary: "Pool progress snapshot 48/60, taken 2026-10-12T07:00Z (demo clock).",
          capturedAt: utc("2026-10-12T07:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-02-pool"),
          sourceArtifactRefs: ["demo-groupbuy/w2gb-01"],
        },
      ],
      surfacedAt: utc("2026-10-12T07:05:00Z"),
    },
    {
      itemId: "w2o-03",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-03"),
      category: "resale",
      title: "Your idle plotter could list at ~780.00 USD",
      summary:
        "The vinyl plotter has not run in 6 weeks; comparable sales support an ask near 780.00 USD.",
      disclosure: {
        observation:
          "Two comparable sales: 810.00 USD (verified 2026-10-11) and 765.00 USD (stale, 2026-10-08) — demo comparables.",
        inference: "An ask of 780.00 USD sits between the comps; net ~741.00 USD after the 500 bps marketplace fee.",
        recommendation:
          "Safe next action: review the resale surface — listing there always takes your explicit action, never this inbox's.",
      },
      status: "new",
      estimatedValueNote: "Estimated net 741.00 USD at ask (exact fee math on the resale surface).",
      requiresAuthorization: false,
      evidence: [
        {
          evidenceId: "w2o-03-e1",
          kind: "independent-observation",
          summary: "Comparable resale sales with freshness classes (peer-resale demo fixtures).",
          capturedAt: utc("2026-10-11T15:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-03-comps"),
          sourceArtifactRefs: ["demo-resale/w2s-01-comparables"],
        },
      ],
      surfacedAt: utc("2026-10-12T06:40:00Z"),
    },
    {
      itemId: "w2o-04",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-04"),
      category: "warranty-recovery",
      title: "Press warranty covers the feed-roller fix until Nov 2",
      summary:
        "Your press account shows a feed-roller replacement covered under warranty expiring Nov 2, 2026 (demo clock).",
      disclosure: {
        observation: "Warranty term on the press account: feed-roller parts+labor covered to 2026-11-02 (demo record).",
        inference: "The roller shows early wear per the last service note; a claim now is likely in-window.",
        recommendation:
          "Safe next action: review the claim details — filing goes through support with your confirmation, not from here.",
      },
      status: "new",
      estimatedValueNote: "Covered fix vs ~180.00 USD out-of-warranty (demo service quote).",
      requiresAuthorization: true,
      evidence: [
        {
          evidenceId: "w2o-04-e1",
          kind: "receipt",
          summary: "Warranty term record + last service note (demo account history).",
          capturedAt: utc("2026-10-10T16:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-04-warranty"),
          sourceArtifactRefs: ["demo-account/harbor-lane-press-warranty"],
        },
      ],
      surfacedAt: utc("2026-10-11T09:00:00Z"),
    },
    {
      itemId: "w2o-05",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-05"),
      category: "unused-subscription",
      title: "Design-software seat unused for 60 days — suggestion EXPIRED",
      summary:
        "This suggested downgrading one design seat; the downgrade window closed Oct 11 (demo clock) with the billing cycle.",
      disclosure: {
        observation: "Seat usage: 0 logins in 60 days (demo account history); the billing-cycle change window closed 2026-10-11.",
        recommendation:
          "No safe next action — the suggestion expired. It will return at the next billing window if the seat stays unused.",
      },
      status: "expired",
      requiresAuthorization: false,
      evidence: [
        {
          evidenceId: "w2o-05-e1",
          kind: "account-history",
          summary: "Seat login history: 0 sessions in 60 days (demo fixture).",
          capturedAt: utc("2026-10-09T10:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-05-seat"),
          sourceArtifactRefs: ["demo-account/harbor-lane-seats"],
        },
      ],
      surfacedAt: utc("2026-10-09T10:05:00Z"),
    },
    {
      itemId: "w2o-06",
      opportunityRef: demoRef<OpportunityInboxItem["opportunityRef"]>("opportunity/w2o-06"),
      category: "local-logistics",
      title: "Thursday route could carry both your deliveries",
      summary:
        "Two of your inbound deliveries land in the same neighborhood Thursday; a shared route could split the leg cost.",
      disclosure: {
        observation: "Delivery A (paper) and Delivery B (binding wire) both route through Meridian on Thursday (demo manifests).",
        inference: "Shared-leg pricing historically split the leg cost ~50/50 on that route (committed demo history).",
        recommendation:
          "Safe next action: review the shared-logistics option — capacity could not be confirmed, so treat the split as UNKNOWN, not promised.",
      },
      status: "unknown",
      estimatedValueNote: "UNKNOWN — the carrier feed never answered the capacity check; no estimate is shown as fact.",
      requiresAuthorization: false,
      evidence: [
        {
          evidenceId: "w2o-06-e1",
          kind: "document",
          summary: "Two delivery manifests routing through Meridian, Thursday (demo fixtures).",
          capturedAt: utc("2026-10-11T12:00:00Z"),
          proofRef: demoRef<TransactionProofRef>("proof/w2o-06-manifests"),
          sourceArtifactRefs: ["demo-logistics/thursday-route"],
        },
      ],
      surfacedAt: utc("2026-10-11T12:10:00Z"),
    },
  ];
  return {
    items,
    viewer: demoRef<OpportunityInboxView["viewer"]>("demo-principal/harbor-lane"),
    categoryFilters: ["price-timing", "group-deal", "resale", "warranty-recovery", "local-logistics", "unused-subscription"],
    contextualHints: [
      {
        hintId: "w2o-hint-1",
        message:
          "Suggestions here never act on your behalf: every next action is safe (view, alert, review) or takes your explicit confirmation elsewhere.",
        relatedItemIds: ["w2o-01", "w2o-02", "w2o-03", "w2o-04", "w2o-06"],
      },
    ],
  };
}

/** Expiry instants shown per item (visible, demo clock). */
export const ITEM_EXPIRY: Readonly<Record<string, string>> = {
  "w2o-01": "2026-10-19T09:00:00Z",
  "w2o-02": "2026-10-15T18:00:00Z",
  "w2o-03": "2026-10-26T09:00:00Z",
  "w2o-04": "2026-11-02T23:59:00Z",
  "w2o-05": "2026-10-11T23:59:00Z",
  "w2o-06": "2026-10-13T09:00:00Z",
};

/** Where each item's safe next action navigates (null ⇒ stay here). */
export const ITEM_NEXT_PATH: Readonly<Record<string, string | null>> = {
  "w2o-01": null,
  "w2o-02": "/commerce/buyer/group-buy",
  "w2o-03": "/commerce/resale",
  "w2o-04": null,
  "w2o-05": null,
  "w2o-06": null,
};
