/**
 * merchant-connectors display catalog + fixture board (J15, W3-016).
 *
 * The RUNTIME space (the real connector runtime, the Shopify adapter
 * exercise, health/journey telemetry) lives in runtime.ts and is loaded
 * through the guarded dynamic import there. This file carries only the
 * DISPLAY layer of the same synthetic space: the fixture connection board
 * (now with an explicit BASIS per row — what is runtime-verified vs fixture
 * vs unavailable), the committed safe-exercise record (test-pinned against
 * the real runtime's output so it can never silently drift), the transport
 * display helpers and the demo file feed.
 */

import { DEMO_SHOP_DOMAIN, SAFE_JOURNEY_REF } from "./runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const CONNECTORS_FIXTURES_ID = "w3-016-connectors-fixtures@2";

/** The fixed demo clock as a display label. */
export const CONNECTORS_NOW_LABEL = "Oct 12, 09:00 UTC";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Deterministic UTC display label for an ISO instant (fixed demo clock). */
export function clockLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${hours}:${minutes} UTC`;
}

/** The honest connection-state vocabulary (never collapsed). */
export type ConnectorState = "CONNECTED" | "DISCONNECTED" | "DEMO" | "UNAVAILABLE";

/**
 * The sharpened honesty taxonomy: what a row's claim is BASED on.
 * - "runtime" — verified against the real experience connector runtime
 *   (registered adapter, observed health, journey evidence);
 * - "fixture" — committed fixture data describing a real integration target
 *   (nothing live is verified — the row says so).
 */
export type ConnectorBasis = "runtime" | "fixture";

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
  /** What the row's status is based on (runtime-verified vs fixture). */
  readonly basis: ConnectorBasis;
  /** Real transport id from the @unicom/experience CONNECTOR_TRANSPORTS registry (null: none wired). */
  readonly transportId: string | null;
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
 * The fixture connection board. CONNECTED is deliberately EMPTY — no live
 * provider is connected in this environment, and the surface says so instead
 * of implying otherwise. The runtime-verified Shopify registration is NOT a
 * board row: it renders in the runtime panel with its own honest REGISTERED
 * (not connected) status.
 */
export const CONNECTORS: readonly ConnectorFixture[] = [
  {
    id: "connector-northwind-portal",
    name: "Northwind supplier portal",
    kind: "SUPPLIER_PORTAL",
    state: "DISCONNECTED",
    basis: "fixture",
    transportId: "rest",
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
    basis: "fixture",
    transportId: "rest",
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
    basis: "fixture",
    transportId: "csv-feed",
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
    basis: "fixture",
    transportId: "browser",
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
    basis: "fixture",
    transportId: "live-commerce-stream",
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
    basis: "fixture",
    transportId: null,
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

/**
 * The COMMITTED safe-exercise record: what the real runtime exercise IS and
 * the deterministic outcomes it produced. Every outcome field is PINNED by
 * the module's component test against the live runtime's own output (the
 * test fails if this record drifts from the real runtime).
 */
export const SAFE_EXERCISE_RECORD = {
  label: "Adapter verified through its non-live surfaces; no live connection",
  adapter: "Shopify — the REAL createShopifyAdapter from @unicom/experience/runtime",
  shopDomain: DEMO_SHOP_DOMAIN,
  surfaces: [
    "health observation — runtime.observe → the adapter's probeHealth, mapped by the runtime's own health snapshot",
    "capability declaration — the adapter descriptor's canonical capability definitions + matrix-intersected provider implementations",
    "journey evidence — one read-only catalog-observation journey through the canonical runner, recorded in the telemetry registry",
  ] as const,
  constraints: [
    "the adapter's HTTP port is a tripwire that throws on any call — a provider call is mechanically impossible",
    "the credential vault is the REAL vault and stays empty (0 credentials sealed, none fabricated)",
    "the adapter is registered, never connected — connecting requires live credentials",
    "no purchases, payments, refunds or orders; nothing commits",
  ] as const,
  outcomes: {
    lifecycle: "registered",
    connectedInstanceCount: 0,
    healthStatus: "unknown",
    healthReason: "adapter has no connected instance yet",
    observationStatus: "UNKNOWN",
    journeyRef: SAFE_JOURNEY_REF,
    journeyMode: "PASS_THROUGH_NATIVE",
    journeyOutcome: "failed-recoverable",
    journeyBlockReason: "CATALOG_ONLY_NO_CONNECTED_INSTANCE",
    providerHttpCalls: 0,
    sealedCredentials: 0,
  } as const,
} as const;

/**
 * The honest browser boundary (statically verified from the runtime barrel's
 * public import chain): the @unicom/experience/runtime barrel cannot be
 * EVALUATED in a browser — its deployment target-adapter module calls
 * node:util's promisify at module top level, and the browser bundler
 * replaces node builtins with stubs that throw. Rendering environments that
 * hit this boundary show the record above plus this precise reason instead
 * of live runtime panels.
 */
export const RUNTIME_BROWSER_BOUNDARY =
  "the connector runtime barrel (@unicom/experience/runtime) is not browser-evaluable today: its deployment target-adapter module calls node:util at import time, and the browser bundler replaces node builtins with stubs that throw. The runtime panels are therefore UNAVAILABLE in a browser — honestly, never faked; the safe-exercise record above is the committed, test-pinned account of what the real runtime does, and the module's test suite renders it live.";
