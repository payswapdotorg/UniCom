/**
 * ⚠ TEST DOUBLE — provider-faithful recorded POS/back-office export API
 * responses (W3-004 CI fixtures; INVARIANT 39 — test data only, separated
 * from adapter code). Shapes mirror a Square/Lightspeed-class LOCAL
 * back-office export API:
 * - `GET /pos/v1/health` → `{"status":"ok","backOffice":…}`;
 * - `GET /pos/v1/status` → export-API liveness (`ok` = NOMINAL,
 *   `degraded` = DEGRADED observation — used by optimizer ranking);
 * - `GET /pos/v1/catalog/export` and `GET /pos/v1/inventory/levels` →
 *   `{batchId, rows:[…]}` batches (UNTRUSTED row data);
 * - 429 carrying `Retry-After` (seconds) — local throttling.
 */

import type { FixtureRoute } from "./player";

export const POS_STORE_1_CATALOG_ROWS = [
  { sku: "APPL-GALA-1KG", title: "Gala apples (tray)", price: "3.49", barcode: "6291041500213" },
  { sku: "MILK-WHL-2L", title: "Whole milk 2L", price: "2.15", barcode: "6291041500214" },
  { sku: "BREAD-WHT-500", title: "White bread 500g", price: "1.85", barcode: "6291041500215" },
] as const;

export const POS_STORE_1_INVENTORY_ROWS = [
  { sku: "APPL-GALA-1KG", location: "store-1", onHand: 42, asOf: "2026-10-06T08:00:00Z" },
  { sku: "MILK-WHL-2L", location: "store-1", onHand: 18, asOf: "2026-10-06T08:00:00Z" },
  // Malformed on purpose: on-hand must be a safe integer, never a string.
  { sku: "BREAD-WHT-500", location: "store-1", onHand: "many", asOf: "2026-10-06T08:00:00Z" },
] as const;

export const POS_STORE_2_CATALOG_ROWS = [
  { sku: "APPL-GALA-1KG", title: "Gala apples (tray)", price: "3.49", barcode: "6291041500213" },
  { sku: "MILK-WHL-2L", title: "Whole milk 2L", price: "2.15", barcode: "6291041500214" },
] as const;

const healthOk = (backOffice: string) => ({
  status: 200,
  body: JSON.stringify({ status: "ok", backOffice }),
});

const statusOk = { status: 200, body: JSON.stringify({ status: "ok" }) };
const statusDegraded = {
  status: 200,
  body: JSON.stringify({ status: "degraded", reason: "backfilling nightly exports" }),
};

const catalogExport = (batchId: string, rows: readonly unknown[]) => ({
  status: 200,
  body: JSON.stringify({ batchId, rows }),
});

const inventoryLevels = (batchId: string, rows: readonly unknown[]) => ({
  status: 200,
  body: JSON.stringify({ batchId, rows }),
});

/** Recorded routes for the STORE-1 back office (nominal). */
export const posStore1Routes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /\/pos\/v1\/health$/, responses: [healthOk("store-1")] },
  { method: "GET", pathPattern: /\/pos\/v1\/status$/, responses: [statusOk] },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/catalog\/export/,
    responses: [catalogExport("cat-store1-1", POS_STORE_1_CATALOG_ROWS)],
  },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/inventory\/levels/,
    responses: [inventoryLevels("inv-store1-1", POS_STORE_1_INVENTORY_ROWS)],
  },
];

/**
 * Store-1 routes with a THROTTLED first catalog pull (429 + Retry-After: 1)
 * — drives the shared backoff engine through a real retry trace.
 */
export const posStore1ThrottledCatalogRoutes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /\/pos\/v1\/health$/, responses: [healthOk("store-1")] },
  { method: "GET", pathPattern: /\/pos\/v1\/status$/, responses: [statusOk] },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/catalog\/export/,
    responses: [
      { status: 429, headers: { "Retry-After": "1" }, body: JSON.stringify({ error: "export throttle" }) },
      catalogExport("cat-store1-throttled", POS_STORE_1_CATALOG_ROWS),
    ],
  },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/inventory\/levels/,
    responses: [inventoryLevels("inv-store1-1", POS_STORE_1_INVENTORY_ROWS)],
  },
];

/** Recorded routes for the STORE-2 back office (DEGRADED observation). */
export const posStore2Routes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /\/pos\/v1\/health$/, responses: [healthOk("store-2")] },
  { method: "GET", pathPattern: /\/pos\/v1\/status$/, responses: [statusDegraded] },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/catalog\/export/,
    responses: [catalogExport("cat-store2-1", POS_STORE_2_CATALOG_ROWS)],
  },
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/inventory\/levels/,
    responses: [inventoryLevels("inv-store2-1", [])],
  },
];

/** Auth-failure variant (connect probe 401 — customer action required). */
export const posUnauthorizedRoute: readonly FixtureRoute[] = [
  {
    method: "GET",
    pathPattern: /\/pos\/v1\/health$/,
    responses: [{ status: 401, body: JSON.stringify({ error: "invalid bearer token" }) }],
  },
];
