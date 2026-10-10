/**
 * buyer-groupbuy fixture data + kernel-truth view models (J4 + J5 buyer side,
 * W2-013).
 *
 * Everything synthetic stays a deterministic committed DEMO fixture
 * namespaced to this lane (w2gb-): the studios, the merchants, the pools,
 * the shares and the consent notes. FORMATION is no longer local screen
 * state: every pool opens through the kernel's command path as a
 * `GroupBuyAggregate` of the commerce kernel and every interest / withdrawal
 * / decision / formation travels as a typed kernel command through
 * ./kernel.ts. Threshold MONITORING, HELD pools and FORMED final terms render
 * from kernel truth.
 *
 * The J5 latent-demand fixture space is the certified one: three consenting
 * studios (Ferry Road Press 16, Two Harbors Design 12, Quayside Studio 8 —
 * 36 boxes), Northlight Atelier DECLINED and visibly excluded (never recorded
 * in the kernel), the Oct 20, 18:00 pool close, 11.20 USD per box proposed
 * against the 12.75 list. Your studio's 4-box share completes the 40-box /
 * 4-studio threshold (40 × 11.20 = the certified 448.00 USD reference cost).
 */
import {
  countQuantity,
  makeId,
  principalRefEquals,
} from "@unicom/commerce";
import type {
  CommandExecution,
  GroupBuyAggregate,
  GroupBuyCounterTerms,
  GroupBuyFormationState,
  GroupBuyId,
  GroupBuyInterestRecord,
  GroupBuyThreshold,
  Money,
  PrincipalRef,
} from "@unicom/commerce";
import { usdMinor } from "../buyer-support/demo-data.js";
import { GROUPBUY_DEMO_EPOCH, GroupBuyKernel } from "./kernel.js";

/** One synthetic studio participant (the demo buyer plus peers). */
export interface DemoGroupBuyStudio {
  readonly id: string;
  readonly name: string;
}

export const DEMO_GROUPBUY_STUDIOS: readonly DemoGroupBuyStudio[] = [
  { id: "harbor-lane", name: "Harbor Lane Print Studio (you, demo buyer)" },
  { id: "ferry-road", name: "Ferry Road Press" },
  { id: "two-harbors", name: "Two Harbors Design" },
  { id: "quayside", name: "Quayside Studio" },
  { id: "northlight", name: "Northlight Atelier" },
];

/** One synthetic merchant organizer (fixture identities, DEMO-labelled). */
export interface DemoGroupBuyMerchant {
  readonly id: string;
  readonly name: string;
}

export const DEMO_GROUPBUY_MERCHANTS: readonly DemoGroupBuyMerchant[] = [
  { id: "meridian", name: "Meridian Office Supply" },
  { id: "cascade", name: "Cascade Foods Wholesale" },
  { id: "paper-trail", name: "Paper Trail Co-op" },
];

/** The demo studios + merchants as kernel principals (DEMO fixture identities). */
export const DEMO_GROUPBUY_PRINCIPALS: Readonly<Record<string, PrincipalRef>> = Object.fromEntries([
  ...DEMO_GROUPBUY_STUDIOS.map(
    (studio): [string, PrincipalRef] => [
      studio.id,
      { kind: "CUSTOMER", customerId: makeId<"CustomerId">(`w2gb-${studio.id}`) } as PrincipalRef,
    ],
  ),
  ...DEMO_GROUPBUY_MERCHANTS.map(
    (merchant): [string, PrincipalRef] => [
      merchant.id,
      { kind: "MERCHANT", merchantId: makeId<"MerchantId">(`w2gb-${merchant.id}`) } as PrincipalRef,
    ],
  ),
]);

/** The demo buyer principal (the J5 proposal initiator, the J4 joining studio). */
export const DEMO_GROUPBUY_BUYER: PrincipalRef = DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!;

/** Human name of a fixture principal (or "unknown participant"). */
export function participantName(principal: PrincipalRef): string {
  const entry = Object.entries(DEMO_GROUPBUY_PRINCIPALS).find(([, ref]) => principalRefEquals(ref, principal));
  return entry
    ? (DEMO_GROUPBUY_STUDIOS.find((one) => one.id === entry[0])?.name ??
      DEMO_GROUPBUY_MERCHANTS.find((one) => one.id === entry[0])?.name ??
      "unknown participant")
    : "unknown participant";
}

/** The fixture participant id behind a kernel principal (or null). */
export function participantIdOf(principal: PrincipalRef): string | null {
  const entry = Object.entries(DEMO_GROUPBUY_PRINCIPALS).find(([, ref]) => principalRefEquals(ref, principal));
  return entry ? entry[0] : null;
}

export function participant(id: string): string {
  return (
    DEMO_GROUPBUY_STUDIOS.find((one) => one.id === id)?.name ??
    DEMO_GROUPBUY_MERCHANTS.find((one) => one.id === id)?.name ??
    id
  );
}

/** One discovered open group-buy pool (the J4 surface fixture). */
export interface DemoGroupBuyPool {
  readonly poolId: string;
  readonly title: string;
  readonly productTitle: string;
  /** Singular unit noun ("box") — see unitPlural for counts ≠ 1. */
  readonly unitNoun: string;
  /** Plural unit noun ("boxes") — counts render through unitsLabel(). */
  readonly unitPlural: string;
  readonly organizerId: string;
  readonly initiatorId: string;
  readonly proposedUnitPrice: Money;
  readonly listUnitPrice: Money;
  readonly threshold: GroupBuyThreshold;
  readonly deadlineLabel: string;
  readonly windowClosesAt: string;
  readonly eligibility: string;
  readonly consentTerms: string;
  readonly commitmentTerms: string;
  readonly organizerNote: string;
  /** Shares already on record when the buyer discovers the pool. */
  readonly seededShares: readonly { readonly participantId: string; readonly units: number }[];
  /** Your studio's fixture share (a join records exactly this many units). */
  readonly yourShareUnits: number;
}

export const DEMO_GROUP_BUY_POOLS: readonly DemoGroupBuyPool[] = [
  {
    poolId: "w2gb-01",
    title: "A3 recycled card — studio pool",
    productTitle: "A3 recycled card",
    unitNoun: "box",
    unitPlural: "boxes",
    organizerId: "meridian",
    initiatorId: "ferry-road",
    proposedUnitPrice: usdMinor("1120"),
    listUnitPrice: usdMinor("1275"),
    threshold: { minimumParticipants: 4, minimumUnits: 60 },
    deadlineLabel: "Oct 15, 18:00 (demo clock)",
    windowClosesAt: "2026-10-15T18:00:00Z",
    eligibility: "Studios inside Meridian's delivery area; one participation per studio.",
    consentTerms:
      "Your interest is shared with the organizer only. It is NOT a commitment: nothing is owed, charged or ordered while you are merely interested.",
    commitmentTerms:
      "A commitment would exist only after the threshold is met AND you confirm a second time against the formed deal's final terms. Payment-on-formation is the organizer's rule; you may withdraw interest any time before that second confirmation.",
    organizerNote: "48 of 60 boxes spoken for (demo participants).",
    seededShares: [
      { participantId: "ferry-road", units: 20 },
      { participantId: "two-harbors", units: 16 },
      { participantId: "quayside", units: 12 },
    ],
    yourShareUnits: 12,
  },
  {
    poolId: "w2gb-02",
    title: "Pigment ink set — print co-op",
    productTitle: "Pigment ink set",
    unitNoun: "set",
    unitPlural: "sets",
    organizerId: "paper-trail",
    initiatorId: "two-harbors",
    proposedUnitPrice: usdMinor("4100"),
    listUnitPrice: usdMinor("4900"),
    threshold: { minimumParticipants: 2, minimumUnits: 24 },
    deadlineLabel: "Oct 13, 12:00 (demo clock)",
    windowClosesAt: "2026-10-13T12:00:00Z",
    eligibility: "Co-op members who have completed a previous group buy.",
    consentTerms:
      "Threshold already met — the pool is awaiting the organizer's formation step. Your interest still commits you to nothing.",
    commitmentTerms:
      "If you express interest now, you join the waiting list for the formed deal's final terms — the deal is NOT formed yet, and no money moves in demo mode.",
    organizerNote: "Threshold reached (24/24). Formation pending organizer authorization — not automatic.",
    seededShares: [
      { participantId: "two-harbors", units: 12 },
      { participantId: "quayside", units: 12 },
    ],
    yourShareUnits: 4,
  },
];

export function poolOf(poolId: string): DemoGroupBuyPool | null {
  return DEMO_GROUP_BUY_POOLS.find((pool) => pool.poolId === poolId) ?? null;
}

/** The typed kernel id of a fixture group buy (payloads carry the branded id). */
export function groupBuyIdOf(poolId: string): GroupBuyId {
  return makeId<"GroupBuyId">(poolId);
}

/** Honest unit count label ("1 box" / "12 boxes" / "4 sets"). */
export function unitsLabel(pool: DemoGroupBuyPool, count: number): string {
  return `${count} ${count === 1 ? pool.unitNoun : pool.unitPlural}`;
}

/** Build the kernel aggregate for a discovered pool (opens PENDING). */
export function kernelPoolAggregateOf(pool: DemoGroupBuyPool): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(pool.poolId),
    initiatorRef: DEMO_GROUPBUY_PRINCIPALS[pool.initiatorId]!,
    organizerRef: DEMO_GROUPBUY_PRINCIPALS[pool.organizerId]!,
    terms: {
      skuRef: makeId<"SkuId">(`w2gb-sku-${pool.poolId}`),
      proposedUnitPrice: pool.proposedUnitPrice,
      listUnitPrice: pool.listUnitPrice,
      threshold: pool.threshold,
      windowClosesAt: pool.windowClosesAt,
      eligibilityNote: pool.eligibility,
    },
    state: "PENDING",
    openedAt: GROUPBUY_DEMO_EPOCH,
    participants: [],
    revision: 1,
  };
}

/**
 * Seed the J4 demo kernel: every discovered pool opens through the kernel
 * command path (OPEN by its initiator, ACCEPT by its organizer — the pools on
 * this surface are already under review — then the seeded shares record as
 * live interest). The kernel itself reconciles the derived threshold states,
 * so w2gb-01 lands in MONITORING (48/60) and w2gb-02 in HELD (24/24) —
 * anything else fails the seed honestly.
 */
export function seedGroupbuyDemo(): GroupBuyKernel {
  const kernel = new GroupBuyKernel();
  for (const pool of DEMO_GROUP_BUY_POOLS) {
    const opened = kernel.apply(DEMO_GROUPBUY_PRINCIPALS[pool.initiatorId]!, {
      type: "OPEN_GROUP_BUY_PROPOSAL",
      groupBuy: kernelPoolAggregateOf(pool),
    });
    if (opened.status !== "EXECUTED") throw seedError("open", pool.poolId, opened);
    const accepted = kernel.apply(DEMO_GROUPBUY_PRINCIPALS[pool.organizerId]!, {
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: groupBuyIdOf(pool.poolId),
      trigger: "ACCEPT",
    });
    if (accepted.status !== "EXECUTED") throw seedError("accept", pool.poolId, accepted);
    for (const share of pool.seededShares) {
      const recorded = kernel.apply(DEMO_GROUPBUY_PRINCIPALS[share.participantId]!, {
        type: "RECORD_GROUP_BUY_INTEREST",
        groupBuyId: groupBuyIdOf(pool.poolId),
        participantRef: DEMO_GROUPBUY_PRINCIPALS[share.participantId]!,
        quantity: countQuantity(share.units),
        consentTerms: pool.consentTerms,
      });
      if (recorded.status !== "EXECUTED") throw seedError("seed share", pool.poolId, recorded);
    }
  }
  return kernel;
}

function seedError(
  step: string,
  poolId: string,
  outcome: Exclude<CommandExecution, { readonly status: "EXECUTED" }>,
): Error {
  return new Error(
    `demo seed failed honestly at ${step} of ${poolId}: ${
      outcome.status === "REJECTED" ? outcome.reason.detail : outcome.status
    }`,
  );
}

// --- The J5 latent-demand fixture space (the certified w2ld- scenario) ---

export const LATENT_DEMAND_PROPOSAL_ID = "w2ld-prop-1";

/** One consenting participant of the latent-demand proposal (units = boxes). */
export interface DemoLatentDemandShare {
  readonly participantId: string;
  readonly units: number;
  readonly consentNote: string;
}

export const LATENT_DEMAND_CONSENTING_SHARES: readonly DemoLatentDemandShare[] = [
  {
    participantId: "ferry-road",
    units: 16,
    consentNote: "Explicitly agreed (demo fixture) to appear in this proposal with a 16-box share.",
  },
  {
    participantId: "two-harbors",
    units: 12,
    consentNote: "Explicitly agreed (demo fixture) to a 12-box share.",
  },
  {
    participantId: "quayside",
    units: 8,
    consentNote: "Explicitly agreed (demo fixture) to an 8-box share.",
  },
];

/** The studio that DECLINED — excluded from the proposal, never enrolled. */
export const LATENT_DEMAND_EXCLUDED = {
  participantId: "northlight",
  consentNote:
    "Declined (demo fixture) — EXCLUDED from the proposal. Non-consenting studios are never silently enrolled.",
} as const;

/** Total consenting units carried by the proposal (the fixture roster). */
export const LATENT_DEMAND_UNITS = LATENT_DEMAND_CONSENTING_SHARES.reduce((total, share) => total + share.units, 0);

/** Your studio's share of the proposal (completes the 40-box threshold). */
export const LATENT_DEMAND_YOUR_SHARE_UNITS = 4;

/** The proposed terms of the latent-demand proposal (exact money, demo fixtures). */
export const LATENT_DEMAND_TERMS = {
  productTitle: "A3 recycled card",
  proposedUnitPrice: usdMinor("1120"),
  listUnitPrice: usdMinor("1275"),
  threshold: { minimumParticipants: 4, minimumUnits: 40 } as GroupBuyThreshold,
  windowClosesAt: "2026-10-20T18:00:00Z",
  windowClosesLabel: "Oct 20, 18:00 (demo clock)",
};

/** Deterministic demo merchant review behaviors (fixture-scripted organizers). */
export interface DemoMerchantTarget {
  readonly id: string;
  readonly name: string;
  readonly behavior: "accepts" | "counters" | "rejects";
  readonly replyNote: string;
  /** Present when the fixture behavior counters (the kernel counter terms). */
  readonly counterTerms?: GroupBuyCounterTerms;
  /** Present when the fixture behavior rejects (the kernel-required reason). */
  readonly rejectionReason?: string;
}

export const MERCHANT_TARGETS: readonly DemoMerchantTarget[] = [
  {
    id: "meridian",
    name: "Meridian Office Supply",
    behavior: "counters",
    replyNote:
      "Counter (demo): we can do 11.60 USD per box at 36 boxes, delivered, if the pool closes by Oct 20.",
    counterTerms: {
      unitPrice: usdMinor("1160"),
      minimumUnits: 36,
      note: "11.60 USD per box at a 36-box minimum, delivered, if the pool closes by Oct 20.",
    },
  },
  {
    id: "cascade",
    name: "Cascade Foods Wholesale",
    behavior: "accepts",
    replyNote:
      "Accepted (demo): 11.20 USD per box at 36 boxes, payment-on-formation — final formation still needs every participant's second confirmation.",
  },
  {
    id: "paper-trail",
    name: "Paper Trail Co-op",
    behavior: "rejects",
    replyNote:
      "Declined (demo): the co-op cannot honor group pricing this quarter. A rejection ends the proposal; nothing was ever committed.",
    rejectionReason: "Cannot honor group pricing this quarter (demo fixture reason).",
  },
];

export function merchantTargetOf(name: string): DemoMerchantTarget | null {
  return MERCHANT_TARGETS.find((target) => target.name === name) ?? null;
}

/** Build the kernel aggregate for the latent-demand proposal (opens PENDING). */
export function kernelProposalOf(target: DemoMerchantTarget): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(LATENT_DEMAND_PROPOSAL_ID),
    initiatorRef: DEMO_GROUPBUY_BUYER,
    organizerRef: DEMO_GROUPBUY_PRINCIPALS[target.id]!,
    terms: {
      skuRef: makeId<"SkuId">("w2gb-sku-a3-card"),
      proposedUnitPrice: LATENT_DEMAND_TERMS.proposedUnitPrice,
      listUnitPrice: LATENT_DEMAND_TERMS.listUnitPrice,
      threshold: LATENT_DEMAND_TERMS.threshold,
      windowClosesAt: LATENT_DEMAND_TERMS.windowClosesAt,
      eligibilityNote: "Studios inside the organizer's delivery area; consenting participants only.",
    },
    state: "PENDING",
    openedAt: GROUPBUY_DEMO_EPOCH,
    participants: [],
    revision: 1,
  };
}

/** Human label for a kernel formation state (kernel vocabulary, spelled out). */
export const GROUPBUY_STATE_LABELS: Readonly<Record<GroupBuyFormationState, string>> = {
  PENDING: "PENDING — on the organizer's desk, not yet reviewed",
  COUNTERED: "COUNTERED — the organizer's counter is on record; your call as initiator",
  REJECTED: "REJECTED — terminal; nothing was ever committed",
  EXPIRED: "EXPIRED — the window closed before formation",
  MONITORING: "MONITORING — threshold watching; nothing is formed yet",
  HELD: "HELD — threshold met, awaiting the organizer's EXPLICIT formation",
  FORMED: "FORMED — final terms frozen (the second confirmation)",
  CLOSED: "CLOSED — terminal",
};

/** May interest be recorded or withdrawn in this kernel state (formation law)? */
export function openForInterest(state: GroupBuyFormationState): boolean {
  return state === "PENDING" || state === "MONITORING" || state === "HELD";
}

/** The buyer's live (non-withdrawn) interest record of one pool, or null. */
export function yourInterestOf(kernel: GroupBuyKernel, groupBuyId: string): GroupBuyInterestRecord | null {
  return (
    kernel
      .interestsOf(groupBuyId)
      .find((record) => principalRefEquals(record.participantRef, DEMO_GROUPBUY_BUYER) && record.state === "EXPRESSED") ??
    null
  );
}
