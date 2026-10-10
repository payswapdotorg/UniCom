/**
 * merchant-groupbuy-review display catalog (J5 merchant side, W3-016).
 *
 * The KERNEL SPACE (aggregates, interests, thresholds, lifecycle states)
 * lives in seed.ts — it is built by the REAL W1-012 GroupBuy formation
 * machine from `@unicom/commerce`. This file carries only the DISPLAY layer
 * of the same synthetic scenario space: human labels for the opaque ids the
 * kernel uses, the deterministic counter options, the recorded rejection
 * reasons and the fixed demo clock. Every id stays namespaced w3gr-.
 *
 * The buyer side of the SAME scenario space is W2-012/W2-013's
 * (buyer-groupbuy, w2ld- fixtures) — mirrored READ-ONLY here for coherence
 * (prop-1 mirrors the same three consenting studios and the same Oct 20
 * pool close); that directory is never edited by this lane.
 */

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const GROUPBUY_REVIEW_FIXTURES_ID = "w3-016-groupbuy-review-fixtures@1";

/**
 * The fixed demo clock this surface renders against (matches W2's DEMO_NOW
 * so both sides of the shared scenario space age identically). Kernel
 * transitions driven from this desk are stamped with it deterministically.
 */
export const GROUPBUY_REVIEW_NOW = "2026-10-12T09:00:00Z";

/** The fixed demo clock as a display label. */
export const GROUPBUY_REVIEW_NOW_LABEL = "Oct 12, 09:00 UTC";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Deterministic UTC display label for an ISO instant (fixed demo clock). */
export function clockLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${hours}:${minutes} UTC`;
}

/** Whether a pool's window is still open at the fixed demo clock. */
export function poolStillOpen(windowClosesAt: string): boolean {
  return Date.parse(windowClosesAt) > Date.parse(GROUPBUY_REVIEW_NOW);
}

/** Product catalog display data (opaque sku ids → human titles). */
export const PRODUCT_TITLES: Readonly<Record<string, string>> = {
  "sku-demo-cards": "Studio Greeting Card Set (8 cards)",
  "sku-demo-poster": "Large-Format Poster Print",
  "sku-demo-a3print": "A3 Recycled Print — Unframed",
};

/** Product title of a sku (the id itself when unknown — never invented). */
export function productTitleOf(skuRef: string): string {
  return PRODUCT_TITLES[skuRef] ?? skuRef;
}

/** Participant studio display data (opaque customer ids → studio names). */
export const STUDIO_NAMES: Readonly<Record<string, string>> = {
  "w3gr-studio-ferry-road": "Ferry Road Press",
  "w3gr-studio-two-harbors": "Two Harbors Design",
  "w3gr-studio-quayside": "Quayside Studio",
  "w3gr-studio-northlight": "Northlight Atelier",
  "w3gr-studio-beacon-hill": "Beacon Hill Framers",
  "w3gr-studio-old-mill": "Old Mill Interiors",
  "w3gr-studio-juniper": "Juniper Gallery",
  "w3gr-studio-copperline": "Copperline Studios",
  "w3gr-studio-saltmarsh": "Saltmarsh Press",
  "w3gr-studio-ridgeline": "Ridgeline Co-op",
  "w3gr-studio-alder-ash": "Alder & Ash Press",
  "w3gr-studio-lantern-row": "Lantern Row Studios",
  "w3gr-studio-riverside": "Riverside Makers",
  "w3gr-studio-foxglove": "Foxglove Press",
  "w3gr-studio-granite-yard": "Granite Yard Arts",
  "w3gr-studio-willowbrook": "Willowbrook Guild",
  "w3gr-studio-tidewater": "Tidewater Print Lab",
  "w3gr-studio-cedar-coast": "Cedar Coast Collective",
  "w3gr-studio-fog-harbor": "Fog Harbor Studios",
  "w3gr-studio-marigold": "Marigold Press",
  "w3gr-studio-ironworks": "Ironworks Artists",
};

/** Studio display name of an opaque participant ref id (never invented). */
export function studioNameOf(participantId: string): string {
  return STUDIO_NAMES[participantId] ?? participantId;
}

/** The recorded reasons a merchant can reject with (deterministic set). */
export const REJECT_REASONS: readonly string[] = [
  "Below our minimum margin at the proposed price",
  "Capacity is full for this production cycle",
  "Terms outside our group-buy policy",
];

/**
 * One deterministic counter option a merchant can send (full terms shown
 * pre-commit; prices are exact minor-unit strings).
 */
export interface DemoCounterOption {
  readonly counterId: string;
  readonly unitPriceMinor: string;
  readonly minimumBoxes: number;
  readonly note: string;
}

/** Counter options per proposal id (empty when none are offered). */
export const COUNTER_OPTIONS: Readonly<Record<string, readonly DemoCounterOption[]>> = {
  "w3gr-prop-1": [
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
};

/** Read-only mirror notes tying fixtures to W2's w2ld- scenario space. */
export const MIRROR_NOTES: Readonly<Record<string, string>> = {
  "w3gr-prop-1":
    "Mirrors the w2ld- buyer-side fixture space (buyer-groupbuy, W2's lane): the same three consenting studios and the same Oct 20, 18:00 pool close, this round addressed to your storefront — buyer-side fixtures are W2's and are never edited here.",
};

/** Studios that declined to join a pool — excluded, never enrolled. */
export const EXCLUDED_STUDIOS: Readonly<Record<string, { readonly name: string; readonly note: string }>> = {
  "w3gr-prop-1": {
    name: "Northlight Atelier",
    note: "Northlight Atelier declined to join this pool and was excluded when it formed — only consenting studios are ever listed.",
  },
};

/** A withdrawal note shown for pools whose history includes one (kernel truth). */
export const WITHDRAWAL_NOTES: Readonly<Record<string, { readonly studio: string; readonly note: string }>> = {
  "w3gr-prop-8": {
    studio: "Willowbrook Guild",
    note: "Willowbrook Guild withdrew before formation (withdrawal is permitted any time before the second confirmation); the pool honestly fell back below threshold to MONITORING on the machine's own THRESHOLD_LOST, reached HELD again when Saltmarsh Press joined, and the final roster froze WITHOUT Willowbrook — consenting-only, never re-enrolled.",
  },
};
