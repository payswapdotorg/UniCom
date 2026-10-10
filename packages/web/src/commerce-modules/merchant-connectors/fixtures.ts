/**
 * merchant-connectors deterministic DEMO fixtures (J15).
 *
 * Committed, synthetic. There is NO commerce-kernel aggregate for provider
 * integrations, so this module is honestly fixture-driven: the catalog below
 * is the claimed state of the world, and the component's local demo state
 * (attempt log, import results) is resettable and DEMO-labelled. No live
 * provider, credential or browser session is ever contacted.
 */

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const CONNECTORS_FIXTURES_ID = "w3-015-connectors-fixtures@1";

/** The honest connection-state vocabulary (never collapsed). */
export type ConnectorState = "CONNECTED" | "DISCONNECTED" | "DEMO" | "UNAVAILABLE";

/** What kind of integration this is. */
export type ConnectorKind =
  | "MARKETPLACE"
  | "SUPPLIER_PORTAL"
  | "FILE_FEED"
  | "BROWSER_ONLY"
  | "LIVE_COMMERCE"
  | "ACCOUNTING";

export interface ConnectorFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: ConnectorKind;
  readonly state: ConnectorState;
  /** What is true RIGHT NOW (the honest status line). */
  readonly statusDetail: string;
  /** The concrete next step a real deployment would take (recovery path). */
  readonly nextStep: string;
  /** What data would flow through it when real. */
  readonly dataFlow: string;
  /** Whether a demo connection attempt is offered (only for DISCONNECTED). */
  readonly attemptable: boolean;
}

/**
 * The connector catalog. CONNECTED is deliberately EMPTY — no live provider
 * is connected in this environment, and the surface says so instead of
 * implying otherwise.
 */
export const CONNECTORS: readonly ConnectorFixture[] = [
  {
    id: "connector-northwind-portal",
    name: "Northwind supplier portal",
    kind: "SUPPLIER_PORTAL",
    state: "DISCONNECTED",
    statusDetail:
      "A real supplier portal integration that would need live credentials and a contracted account. No credentials exist in this demo — and none are requested.",
    nextStep:
      "In a real deployment: enter portal credentials through the operator-owned secret store, then request access. Here: attempts are journaled with their honest DISCONNECTED outcome.",
    dataFlow: "Purchase orders out; order confirmations, ship notices and invoices in.",
    attemptable: true,
  },
  {
    id: "connector-harbor-marketplace",
    name: "Harbor wholesale marketplace",
    kind: "MARKETPLACE",
    state: "DISCONNECTED",
    statusDetail:
      "A marketplace integration (listing sync + orders in) that would create live listings and receive live orders the moment it connects. Disabled in demo — no fabricated marketplace activity.",
    nextStep:
      "In a real deployment: authorize the marketplace app, map listings, then enable order ingestion. Here: attempts are journaled with their honest DISCONNECTED outcome.",
    dataFlow: "Listings and stock levels out; orders and returns in.",
    attemptable: true,
  },
  {
    id: "connector-csv-feed",
    name: "CSV stock file feed (demo)",
    kind: "FILE_FEED",
    state: "DEMO",
    statusDetail:
      "The one working integration in this environment — and it is a DEMO: it reads committed fixture rows (supplier price/stock CSV) locally and deterministically. No file leaves this machine; no feed is fetched.",
    nextStep:
      "Run the demo import below to see the deterministic rows it would deliver. A real feed would need a scheduled fetch contract with the supplier.",
    dataFlow: "Supplier stock/price rows in (committed fixture file, DEMO-labelled).",
    attemptable: false,
  },
  {
    id: "connector-catalog-browser",
    name: "Supplier catalog browser-sync",
    kind: "BROWSER_ONLY",
    state: "UNAVAILABLE",
    statusDetail:
      "This connector can ONLY work through an interactive browser session with the supplier's catalog site (no API exists). There is no live browser session in this environment — never connected, so no freshness is claimed (no fabricated 'last synced').",
    nextStep:
      "In a real deployment with the browser vehicle: open an authenticated browser session, then run the catalog sync. Until then this stays unavailable — not disconnected, because there is nothing to disconnect.",
    dataFlow: "Catalog pages scraped in (requires a human-in-the-loop browser session).",
    attemptable: false,
  },
  {
    id: "connector-live-commerce-rail",
    name: "Live commerce rail (payment provider)",
    kind: "LIVE_COMMERCE",
    state: "UNAVAILABLE",
    statusDetail:
      "No payment provider contract exists for this environment. There is nothing to connect to, and a live rail is never simulated: payments in these demos run on the deterministic DEMO rail only.",
    nextStep:
      "Requires an operator decision and a real provider contract (see the blocker register). Until then, every payment surface stays on the demo rail, labelled.",
    dataFlow: "Payment authorizations, captures, refunds, settlement observations.",
    attemptable: false,
  },
  {
    id: "connector-accounting-export",
    name: "Accounting export",
    kind: "ACCOUNTING",
    state: "UNAVAILABLE",
    statusDetail:
      "No accounting backend is registered. Exports would be fabricated here — so the export path is unavailable, not 'connected with zero rows'.",
    nextStep: "Register an accounting backend contract first; the export button then unlocks against it.",
    dataFlow: "Journal summaries and settlement reports out.",
    attemptable: false,
  },
];

/** One row of the committed demo CSV the file feed would deliver. */
export interface FeedRow {
  readonly skuId: string;
  readonly title: string;
  readonly supplierUnits: number;
  readonly priceMinor: string;
}

/** The committed demo file (deterministic — the feed's only input). */
export const DEMO_FEED_ROWS: readonly FeedRow[] = [
  { skuId: "sku-feed-flour", title: "Bread flour, 1kg", supplierUnits: 120, priceMinor: "520" },
  { skuId: "sku-feed-yeast", title: "Instant yeast, 100g", supplierUnits: 80, priceMinor: "310" },
  { skuId: "sku-feed-salt", title: "Sea salt, 500g", supplierUnits: 60, priceMinor: "280" },
];

/** The honest reason every demo attempt records (with the attempt). */
export const ATTEMPT_OUTCOME_REASON =
  "no live credentials or provider contract exists in this demo environment — the attempt cannot succeed, and success is never fabricated";
