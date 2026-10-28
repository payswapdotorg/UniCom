/**
 * command-center — the deterministic product model + seed data (W1-027).
 *
 * Ported from the operator-approved UNiCOM console design (2026-10-23,
 * github.com/payswapdotorg/unicom-console `src/lib/product/data.ts`) into the
 * commerce host's conventions: same store identities (halcyon /
 * mountain-reads / kaia), same missions, decisions, watch ring, skills and
 * morning brief, same flavor — zero randomness (the connect wizard's
 * fabricated initial catalog is a pure function of its inputs).
 *
 * Honesty laws (host EnvironmentBadge law): every seed is DEMO-labelled
 * state until a real commerce API hydrates live data (see ./api.ts).
 */

export type PlatformId =
  | "shopify"
  | "woocommerce"
  | "etsy"
  | "amazon"
  | "squarespace"
  | "bigcommerce";

/** Platform glyph tone — mapped to a host CSS class (cmcc-tone-*), never a raw color. */
export type PlatformTone = "emerald" | "violet" | "orange" | "amber" | "stone" | "red";

export interface Platform {
  readonly id: PlatformId;
  readonly name: string;
  readonly glyph: string;
  readonly tone: PlatformTone;
  /** What the platform contributes once connected. */
  readonly catalog: string;
}

export const PLATFORMS: readonly Platform[] = [
  { id: "shopify", name: "Shopify", glyph: "S", tone: "emerald", catalog: "Products · Orders · Inventory · Customers" },
  { id: "woocommerce", name: "WooCommerce", glyph: "W", tone: "violet", catalog: "Products · Orders · Coupons · Media" },
  { id: "etsy", name: "Etsy", glyph: "E", tone: "orange", catalog: "Listings · Receipts · Reviews" },
  { id: "amazon", name: "Amazon", glyph: "a", tone: "amber", catalog: "Listings · Orders · FBA · Ads" },
  { id: "squarespace", name: "Squarespace", glyph: "◻", tone: "stone", catalog: "Products · Orders · Pages" },
  { id: "bigcommerce", name: "BigCommerce", glyph: "B", tone: "red", catalog: "Products · Orders · Carts" },
];

export type StoreHealth = "healthy" | "attention" | "syncing";

export interface StoreConnection {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly platform: PlatformId;
  readonly health: StoreHealth;
  /** Humanized by the API layer (demo seeds carry the committed strings). */
  readonly lastSync: string;
  readonly lastAudit: string;
  readonly products: number;
  readonly orders7d: number;
  /** USD. */
  readonly revenue7d: number;
  /** % vs previous week (signed). */
  readonly delta7d: number;
  /** 0–100 sync-call budget. */
  readonly apiUsage: number;
  readonly installedSkills: readonly string[];
}

export type MissionStatus = "running" | "in-review" | "awaiting-approval" | "done";

export interface MissionLane {
  readonly id: string;
  readonly name: string;
  readonly worker: string;
  readonly status: "running" | "in-review" | "done";
  /** 0–100. */
  readonly progress: number;
  readonly evidence: readonly string[];
}

export interface Mission {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  /** Store ids. */
  readonly stores: readonly string[];
  readonly status: MissionStatus;
  readonly eta: string;
  readonly started: string;
  readonly lanes: readonly MissionLane[];
}

export type DecisionKind = "price" | "listing" | "refund" | "campaign";

export interface Decision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly title: string;
  /** Store id. */
  readonly store: string;
  readonly proposedBy: string;
  readonly risk: "low" | "medium" | "high";
  readonly impact: string;
  readonly evidence: readonly string[];
  readonly detail: readonly { readonly label: string; readonly value: string }[];
  readonly expires: string;
}

export type WatchEventKind = "heartbeat" | "anomaly" | "heal" | "review" | "dispatch" | "connect";

export interface WatchEvent {
  readonly id: string;
  readonly ts: string;
  readonly kind: WatchEventKind;
  readonly actor: string;
  readonly text: string;
}

export type SkillRisk = "read-only" | "acts-with-approval" | "autonomous";

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly tagline: string;
  readonly watches: string;
  readonly acts: string;
  readonly risk: SkillRisk;
  readonly events7d: number;
  /** Store ids the skill is installed on. */
  readonly installedOn: readonly string[];
}

export interface MorningBrief {
  readonly date: string;
  readonly summary: string;
  readonly checks: readonly string[];
  readonly numbers: readonly {
    readonly label: string;
    readonly value: string;
    readonly delta: string;
    readonly up: boolean | null;
  }[];
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "merchant" | "agent";
  readonly text: string;
  readonly plan?: readonly string[];
  readonly planDone?: number;
  readonly evidence?: readonly string[];
}

export const SEED_STORES: readonly StoreConnection[] = [
  {
    id: "halcyon",
    name: "Halcyon Goods",
    domain: "halcyongoods.com",
    platform: "shopify",
    health: "healthy",
    lastSync: "2 min ago",
    lastAudit: "06:40Z",
    products: 412,
    orders7d: 318,
    revenue7d: 28450,
    delta7d: 12.4,
    apiUsage: 34,
    installedSkills: ["price-sentinel", "listing-optimizer", "cart-saver"],
  },
  {
    id: "mountain-reads",
    name: "Mountain Reads",
    domain: "mountainreads.co",
    platform: "woocommerce",
    health: "attention",
    lastSync: "11 min ago",
    lastAudit: "06:40Z",
    products: 1287,
    orders7d: 96,
    revenue7d: 8120,
    delta7d: -4.1,
    apiUsage: 61,
    installedSkills: ["price-sentinel", "review-responder"],
  },
  {
    id: "kaia",
    name: "Kaia Ceramics",
    domain: "kaiaceramics.etsy.com",
    platform: "etsy",
    health: "syncing",
    lastSync: "just now",
    lastAudit: "yesterday 21:12Z",
    products: 84,
    orders7d: 61,
    revenue7d: 4390,
    delta7d: 23.8,
    apiUsage: 12,
    installedSkills: ["listing-optimizer"],
  },
];

export const SEED_MISSIONS: readonly Mission[] = [
  {
    id: "m-1",
    title: "Spring price audit across all stores",
    brief:
      "Reprice 61 SKUs flagged by Price Sentinel against competitor moves of the last 14 days. High-impact changes are packed as decisions for your approval.",
    stores: ["halcyon", "mountain-reads"],
    status: "awaiting-approval",
    eta: "2 lanes in review",
    started: "06:02Z",
    lanes: [
      { id: "l-1", name: "Competitor crawl + margin table", worker: "wkr-a7", status: "done", progress: 100, evidence: ["1,204 rows crawled", "margin-model v3 · 61 flagged", "run 41m 12s"] },
      { id: "l-2", name: "Reprice drafts + risk packing", worker: "wkr-c2", status: "in-review", progress: 100, evidence: ["61 drafts · 9 high-impact", "diff bundle 41f2c9", "TL review: 2 notes"] },
      { id: "l-3", name: "Apply approved changes", worker: "wkr-a7", status: "running", progress: 38, evidence: ["applying in batches of 10", "0 conflicts so far"] },
    ],
  },
  {
    id: "m-2",
    title: "Etsy listing refresh — Kaia Ceramics",
    brief:
      "Rewrite titles/tags for the 12 slowest listings using Listing Optimizer; A/B the top 4 against current copy.",
    stores: ["kaia"],
    status: "in-review",
    eta: "review by 12:00Z",
    started: "yesterday 22:47Z",
    lanes: [
      { id: "l-4", name: "Copy variants (12 listings × 3)", worker: "wkr-d9", status: "done", progress: 100, evidence: ["36 variants written", "keyword coverage +18%", "run 1h 04m"] },
      { id: "l-5", name: "A/B arm assignment", worker: "wkr-d9", status: "in-review", progress: 100, evidence: ["4 experiments staged", "traffic split 50/50"] },
    ],
  },
  {
    id: "m-3",
    title: "Abandoned-cart recovery funnel — Halcyon",
    brief:
      "Three-email sequence drafted from the buyer-thought teardowns; sends are packed as decisions before anything ships.",
    stores: ["halcyon"],
    status: "running",
    eta: "drafts ~11:30Z",
    started: "07:15Z",
    lanes: [
      { id: "l-6", name: "Sequence drafting", worker: "wkr-b1", status: "running", progress: 64, evidence: ["2 of 3 emails drafted"] },
      { id: "l-7", name: "Segment snapshot", worker: "wkr-b1", status: "done", progress: 100, evidence: ["1,847 carts in scope", "avg value $67.20"] },
    ],
  },
];

export const SEED_DECISIONS: readonly Decision[] = [
  {
    id: "d-1",
    kind: "price",
    title: "Reprice 9 high-impact SKUs — Halcyon Goods",
    store: "halcyon",
    proposedBy: "Price Sentinel",
    risk: "medium",
    impact: "Est. +$1,840/mo margin at 95% confidence",
    evidence: ["margin-table v3", "competitor moves 14d", "elasticity model PASS"],
    detail: [
      { label: "SKU 8841 · Linen Throw", value: "$84 → $79 (−6.0%)" },
      { label: "SKU 2210 · Waffle Robe", value: "$118 → $126 (+6.8%)" },
      { label: "SKU 7702 · travel kit", value: "$52 → $49 (−5.8%)" },
      { label: "+ 6 more", value: "all within ±8%" },
    ],
    expires: "expires 18:00Z",
  },
  {
    id: "d-2",
    kind: "refund",
    title: "Refund order #MR-88113 — Mountain Reads",
    store: "mountain-reads",
    proposedBy: "Support Agent",
    risk: "low",
    impact: "Protects a 4× repeat buyer; order arrived damaged",
    evidence: ["photo evidence attached", "carrier scan shows damage", "buyer LTV $341"],
    detail: [
      { label: "Order", value: "#MR-88113 · $58.40" },
      { label: "Buyer", value: "repeat buyer · 4 orders" },
      { label: "Policy check", value: "within 30-day window" },
    ],
    expires: "expires 14:00Z",
  },
  {
    id: "d-3",
    kind: "listing",
    title: "Publish 12 rewritten Etsy listings — Kaia Ceramics",
    store: "kaia",
    proposedBy: "Listing Optimizer",
    risk: "medium",
    impact: "Projected +31% search impressions over 28 days",
    evidence: ["36 variants · A/B staged", "keyword coverage +18%", "no prohibited terms"],
    detail: [
      { label: "Titles", value: "12 rewritten (≤140 chars)" },
      { label: "Tags", value: "13/13 on every listing" },
      { label: "A/B arms", value: "top 4 listings, 50/50 split" },
    ],
    expires: "expires 12:00Z",
  },
];

export const SEED_WATCH_EVENTS: readonly WatchEvent[] = [
  { id: "e-1", ts: "07:04Z", kind: "heal", actor: "inventory-sync", text: "Mountain Reads rate-limit recovered — backoff succeeded on retry 2 (self-healed, no action needed)" },
  { id: "e-2", ts: "06:58Z", kind: "anomaly", actor: "price-sentinel", text: "Competitor undercut detected on 3 Halcyon SKUs — packed as decision d-1" },
  { id: "e-3", ts: "06:40Z", kind: "review", actor: "tl-agent", text: "Overnight audit complete: 3 stores, 0 security findings, 2 margin flags" },
  { id: "e-4", ts: "06:02Z", kind: "dispatch", actor: "orchestrator", text: "Mission m-1 dispatched — 3 lanes, 2 workers assigned" },
  { id: "e-5", ts: "05:41Z", kind: "anomaly", actor: "cart-saver", text: "Abandoned-cart spike on Halcyon (+38% vs baseline) — mission m-3 spawned" },
];

export const SEED_SKILLS: readonly Skill[] = [
  {
    id: "price-sentinel",
    name: "Price Sentinel",
    glyph: "⌖",
    tagline: "Watches competitor prices and your margins, 24/7.",
    watches: "competitor prices · cost changes · elasticity",
    acts: "drafts repricing decisions for your approval",
    risk: "acts-with-approval",
    events7d: 412,
    installedOn: ["halcyon", "mountain-reads"],
  },
  {
    id: "listing-optimizer",
    name: "Listing Optimizer",
    glyph: "✎",
    tagline: "Rewrites listings that stopped selling.",
    watches: "search rank · CTR · conversion per listing",
    acts: "drafts new titles/tags, A/B tests the top movers",
    risk: "acts-with-approval",
    events7d: 268,
    installedOn: ["halcyon", "kaia"],
  },
  {
    id: "cart-saver",
    name: "Cart Saver",
    glyph: "◔",
    tagline: "Catches abandoned carts before they cool.",
    watches: "cart events · checkout abandonment",
    acts: "drafts recovery emails (never sends without you)",
    risk: "acts-with-approval",
    events7d: 189,
    installedOn: ["halcyon"],
  },
  {
    id: "review-responder",
    name: "Review Responder",
    glyph: "☾",
    tagline: "Answers reviews in your voice, kindly and fast.",
    watches: "new reviews across all connected stores",
    acts: "drafts public replies; escalates the angry ones",
    risk: "acts-with-approval",
    events7d: 97,
    installedOn: ["mountain-reads"],
  },
  {
    id: "stock-scout",
    name: "Stock Scout",
    glyph: "▦",
    tagline: "Knows what you'll run out of, before you do.",
    watches: "inventory velocity · supplier lead times",
    acts: "read-only forecasts (restock packs coming soon)",
    risk: "read-only",
    events7d: 55,
    installedOn: [],
  },
  {
    id: "ad-watcher",
    name: "Ad Watcher",
    glyph: "◉",
    tagline: "Guards your ad spend like it's its own.",
    watches: "ROAS · burn rate · listing quality score",
    acts: "flags waste, never pauses campaigns without you",
    risk: "read-only",
    events7d: 31,
    installedOn: [],
  },
];

export const MORNING_BRIEF: MorningBrief = {
  date: "2026-10-19",
  summary:
    "Night watch: all three stores healthy. One self-heal (Woo rate-limit), two margin flags packed as decisions, one recovery mission spawned.",
  checks: [
    "3 stores audited overnight — 0 security findings",
    "Mountain Reads rate-limit self-healed at 07:04Z",
    "2 margin flags → decision d-1 awaiting you",
    "Cart-saver spike +38% → mission m-3 running",
  ],
  numbers: [
    { label: "Revenue 7d", value: "$40,960", delta: "+9.2%", up: true },
    { label: "Orders 7d", value: "475", delta: "+6.1%", up: true },
    { label: "Open decisions", value: "3", delta: "2 urgent", up: null },
    { label: "Watch events", value: "854", delta: "all green", up: true },
  ],
};

export const SEED_CHAT: readonly ChatMessage[] = [
  {
    id: "c-0",
    role: "agent",
    text: "Morning. All three stores are connected and green — Mountain Reads self-healed a rate-limit at 07:04Z, nothing needs you urgently. Ask me anything, or say things like “reprice the linen throw” or “why did Etsy jump 24%?”",
  },
];

export function storeName(id: string, stores: readonly StoreConnection[] = SEED_STORES): string {
  return stores.find((store) => store.id === id)?.name ?? id;
}

export function platformOf(id: PlatformId): Platform {
  const platform = PLATFORMS.find((candidate) => candidate.id === id);
  if (!platform) throw new Error(`unknown platform: ${id}`);
  return platform;
}

/** Deterministic char-code sum (never Math.random in render or data paths). */
function codeSum(value: string): number {
  let sum = 0;
  for (const char of value) sum += char.codePointAt(0) ?? 0;
  return sum;
}

/**
 * The connect wizard's fabricated initial catalog — a PURE function of its
 * inputs (the backend's demo adapter contract: deterministic per store, no
 * external calls). The same name+platform always fabricates the same catalog.
 */
export function fabricateDemoCatalog(input: {
  readonly platform: PlatformId;
  readonly name: string;
  readonly domain: string;
}): { readonly products: number; readonly orders7d: number; readonly revenue7d: number } {
  const seed = codeSum(`${input.platform}:${input.domain || input.name}`);
  return {
    products: 40 + (seed % 81),
    orders7d: 20 + (seed % 61),
    revenue7d: 1500 + (seed % 47) * 90,
  };
}
