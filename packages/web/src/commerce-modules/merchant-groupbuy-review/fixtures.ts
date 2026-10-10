/**
 * merchant-groupbuy-review deterministic DEMO fixtures (J5 merchant side).
 *
 * Committed, synthetic, single-currency (USD), single-merchant (Harbor Lane
 * Print Studio — the host demo firm). These are the INCOMING latent-demand
 * group-buy proposals on the merchant's desk: participant pools (consenting
 * studios only), proposed terms, thresholds and deadlines.
 *
 * Namespacing law: every fixture id below is namespaced to this module
 * (w3gr-). The buyer side of the SAME synthetic scenario space is W2-012's
 * (buyer-groupbuy, w2ld- fixtures) — mirrored READ-ONLY here for coherence
 * (the same three consenting studios, the same Oct 20 pool close); that
 * directory is never edited by this lane.
 *
 * The deterministic commerce kernel has no group-buy aggregate yet, so these
 * proposals are fixture records (DEMO-labelled on the surface) and every
 * merchant decision lands in LOCAL DEMO STATE ONLY — no binding effect. The
 * exact-money math the surface shows (pool value, savings) flows through the
 * public `@unicom/commerce` entrypoint.
 */

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const GROUPBUY_REVIEW_FIXTURES_ID = "w3-015-groupbuy-review-fixtures@1";

/**
 * The fixed demo clock this surface renders against (matches W2-012's
 * DEMO_NOW so both sides of the shared scenario space age identically).
 */
export const GROUPBUY_REVIEW_NOW = "2026-10-12T09:00:00Z";

/** The fixed demo clock as a display label. */
export const GROUPBUY_REVIEW_NOW_LABEL = "Oct 12, 09:00 UTC";

/** One consenting participant studio of a proposal pool (units = boxes). */
export interface DemoParticipant {
  readonly name: string;
  readonly units: number;
  readonly consentNote: string;
}

/** One deterministic counter option a merchant can send (terms shown pre-commit). */
export interface DemoCounterOption {
  readonly counterId: string;
  readonly unitPriceMinor: string;
  readonly minimumBoxes: number;
  readonly note: string;
}

/** The honest review states a proposal can be in. */
export type DemoProposalStatus = "PENDING" | "ACCEPTED" | "COUNTERED" | "REJECTED" | "EXPIRED";

/** One incoming latent-demand group-buy proposal (a committed DEMO fixture). */
export interface DemoProposal {
  readonly proposalId: string;
  readonly status: DemoProposalStatus;
  readonly productSkuId: string;
  readonly productTitle: string;
  readonly unitPriceMinor: string;
  readonly listPriceMinor: string;
  readonly participants: readonly DemoParticipant[];
  readonly thresholdStudios: number;
  readonly thresholdBoxes: number;
  readonly deadlineIso: string;
  readonly counterOptions: readonly DemoCounterOption[];
  readonly openedAtLabel: string;
  /** Seeded decision context (absent while PENDING). */
  readonly counteredWith?: DemoCounterOption;
  readonly counteredAtLabel?: string;
  readonly rejectedReason?: string;
  readonly rejectedAtLabel?: string;
  readonly acceptedAtLabel?: string;
  /** Read-only mirror note tying this fixture to W2's w2ld- scenario space. */
  readonly mirrorNote?: string;
  /** A studio that declined to join — excluded from the pool, never enrolled. */
  readonly excludedStudio?: string;
}

/** The recorded reasons a merchant can reject with (deterministic set). */
export const REJECT_REASONS: readonly string[] = [
  "Below our minimum margin at the proposed price",
  "Capacity is full for this production cycle",
  "Terms outside our group-buy policy",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Deterministic UTC display label for an ISO instant (fixed demo clock). */
export function clockLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${hours}:${minutes} UTC`;
}

/** Whether a pool's deadline is still in the future at the fixed demo clock. */
export function poolStillOpen(deadlineIso: string): boolean {
  return Date.parse(deadlineIso) > Date.parse(GROUPBUY_REVIEW_NOW);
}

function consented(name: string, units: number): DemoParticipant {
  return {
    name,
    units,
    consentNote: `Explicitly agreed (demo fixture) to appear in this proposal with a ${units}-box share.`,
  };
}

/**
 * The incoming queue. prop-1 mirrors the w2ld buyer-side fixture space
 * read-only; the products come from the J10 storefront catalog so the two
 * merchant surfaces describe one store.
 */
export const DEMO_PROPOSALS: readonly DemoProposal[] = [
  {
    proposalId: "w3gr-prop-1",
    status: "PENDING",
    productSkuId: "sku-demo-cards",
    productTitle: "Studio Greeting Card Set (8 cards)",
    unitPriceMinor: "1080",
    listPriceMinor: "1200",
    participants: [
      consented("Ferry Road Press", 16),
      consented("Two Harbors Design", 12),
      consented("Quayside Studio", 8),
    ],
    thresholdStudios: 4,
    thresholdBoxes: 40,
    deadlineIso: "2026-10-20T18:00:00Z",
    counterOptions: [
      {
        counterId: "w3gr-ctr-1a",
        unitPriceMinor: "1160",
        minimumBoxes: 36,
        note: "Match the price this pool saw elsewhere: USD 11.60 per box at the full 36 boxes (mirrors the w2ld Meridian counter).",
      },
      {
        counterId: "w3gr-ctr-1b",
        unitPriceMinor: "1120",
        minimumBoxes: 40,
        note: "Meet them near their price but lift the minimum to your 40-box threshold.",
      },
    ],
    openedAtLabel: "Oct 10, 08:20 UTC",
    mirrorNote:
      "Mirrors the w2ld- buyer-side fixture space (buyer-groupbuy, W2-012): the same three consenting studios and the same Oct 20, 18:00 pool close, this round addressed to your storefront — buyer-side fixtures are W2's and are never edited here.",
    excludedStudio: "Northlight Atelier",
  },
  {
    proposalId: "w3gr-prop-2",
    status: "PENDING",
    productSkuId: "sku-demo-poster",
    productTitle: "Large-Format Poster Print",
    unitPriceMinor: "2950",
    listPriceMinor: "3400",
    participants: [
      consented("Beacon Hill Framers", 12),
      consented("Old Mill Interiors", 10),
      consented("Juniper Gallery", 10),
      consented("Copperline Studios", 9),
      consented("Saltmarsh Press", 7),
    ],
    thresholdStudios: 4,
    thresholdBoxes: 40,
    deadlineIso: "2026-10-22T17:00:00Z",
    counterOptions: [
      {
        counterId: "w3gr-ctr-2a",
        unitPriceMinor: "3080",
        minimumBoxes: 48,
        note: "A small uplift at the full 48 rolls.",
      },
      {
        counterId: "w3gr-ctr-2b",
        unitPriceMinor: "3250",
        minimumBoxes: 44,
        note: "A larger uplift for a smaller commitment.",
      },
    ],
    openedAtLabel: "Oct 11, 10:05 UTC",
  },
  {
    proposalId: "w3gr-prop-3",
    status: "COUNTERED",
    productSkuId: "sku-demo-a3print",
    productTitle: "A3 Recycled Print — Unframed",
    unitPriceMinor: "1550",
    listPriceMinor: "1850",
    participants: [
      consented("Ridgeline Co-op", 12),
      consented("Alder & Ash Press", 10),
      consented("Lantern Row Studios", 8),
    ],
    thresholdStudios: 3,
    thresholdBoxes: 30,
    deadlineIso: "2026-10-18T18:00:00Z",
    counterOptions: [],
    openedAtLabel: "Oct 8, 09:40 UTC",
    counteredWith: {
      counterId: "w3gr-ctr-3",
      unitPriceMinor: "1690",
      minimumBoxes: 24,
      note: "Counter sent Oct 9: USD 16.90 per print at a 24-print minimum, delivered.",
    },
    counteredAtLabel: "Oct 9, 15:30 UTC",
  },
  {
    proposalId: "w3gr-prop-4",
    status: "EXPIRED",
    productSkuId: "sku-demo-cards",
    productTitle: "Studio Greeting Card Set (8 cards)",
    unitPriceMinor: "1060",
    listPriceMinor: "1200",
    participants: [consented("Riverside Makers", 12), consented("Foxglove Press", 8)],
    thresholdStudios: 3,
    thresholdBoxes: 24,
    deadlineIso: "2026-10-11T18:00:00Z",
    counterOptions: [],
    openedAtLabel: "Oct 5, 11:15 UTC",
  },
  {
    proposalId: "w3gr-prop-5",
    status: "REJECTED",
    productSkuId: "sku-demo-poster",
    productTitle: "Large-Format Poster Print",
    unitPriceMinor: "2600",
    listPriceMinor: "3400",
    participants: [
      consented("Granite Yard Arts", 14),
      consented("Willowbrook Guild", 12),
      consented("Tidewater Print Lab", 10),
      consented("Cedar Coast Collective", 8),
    ],
    thresholdStudios: 4,
    thresholdBoxes: 40,
    deadlineIso: "2026-10-25T17:00:00Z",
    counterOptions: [],
    openedAtLabel: "Oct 6, 13:50 UTC",
    rejectedReason: REJECT_REASONS[2],
    rejectedAtLabel: "Oct 7, 16:30 UTC",
  },
  {
    proposalId: "w3gr-prop-6",
    status: "ACCEPTED",
    productSkuId: "sku-demo-a3print",
    productTitle: "A3 Recycled Print — Unframed",
    unitPriceMinor: "1650",
    listPriceMinor: "1850",
    participants: [
      consented("Fog Harbor Studios", 12),
      consented("Marigold Press", 11),
      consented("Ironworks Artists", 10),
      consented("Blue Heron Paper", 9),
    ],
    thresholdStudios: 4,
    thresholdBoxes: 40,
    deadlineIso: "2026-10-24T18:00:00Z",
    counterOptions: [],
    openedAtLabel: "Oct 7, 10:25 UTC",
    acceptedAtLabel: "Oct 8, 14:00 UTC",
  },
];

/** Pool units of a proposal (derived from its consenting participants). */
export function poolUnitsOf(proposal: DemoProposal): number {
  return proposal.participants.reduce((total, participant) => total + participant.units, 0);
}

/** Whether a pool meets BOTH the studio-count and box thresholds. */
export function thresholdMet(proposal: DemoProposal): boolean {
  return (
    proposal.participants.length >= proposal.thresholdStudios &&
    poolUnitsOf(proposal) >= proposal.thresholdBoxes
  );
}

/** "3 studios vs threshold 4 · 36 boxes vs threshold 40" summary line. */
export function thresholdSummary(proposal: DemoProposal): string {
  return `${proposal.participants.length} studios vs threshold ${proposal.thresholdStudios} · ${poolUnitsOf(proposal)} boxes vs threshold ${proposal.thresholdBoxes}`;
}
