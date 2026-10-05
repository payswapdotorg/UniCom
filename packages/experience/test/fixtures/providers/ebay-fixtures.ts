/**
 * ⚠ TEST DOUBLE — provider-faithful recorded eBay Sell-REST responses
 * (W3-003 CI fixtures). Shapes mirror the real API:
 * - OAuth Bearer identity probe `GET /commerce/identity/v1/user/`;
 * - Sell Inventory offset/limit pagination with response `total`;
 * - fulfillment creation `POST …/shipping_fulfillment` → `fulfillmentId`;
 * - 429 carrying `Retry-After`; error payloads `{"errors":[{"errorId":…}]}`.
 */

import type { FixtureRoute } from "./player";

export const EBAY_IDENTITY_OK = {
  status: 200,
  body: JSON.stringify({ apiUsername: "seller-fixture-1", registrationMarketplace: "EBAY_US" }),
};

export const EBAY_IDENTITY_UNAUTHORIZED = {
  status: 401,
  body: JSON.stringify({ errors: [{ errorId: 1002, domain: "ACCESS", message: "token expired" }] }),
};

export const EBAY_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "1" },
  body: JSON.stringify({ errors: [{ errorId: 10001, message: "rate limit exceeded" }] }),
};

const inventoryItems = (skus: string[]): { sku: string; product: { title: string } }[] =>
  skus.map((sku) => ({ sku, product: { title: `Item ${sku}` } }));

export const EBAY_INVENTORY_PAGE_1 = {
  status: 200,
  body: JSON.stringify({
    inventoryItems: inventoryItems(["SKU-A1", "SKU-A2", "SKU-A3"]),
    total: 8,
    limit: 3,
    offset: 0,
  }),
};

export const EBAY_INVENTORY_PAGE_2 = {
  status: 200,
  body: JSON.stringify({
    inventoryItems: inventoryItems(["SKU-B1", "SKU-B2", "SKU-B3"]),
    total: 8,
    limit: 3,
    offset: 3,
  }),
};

export const EBAY_INVENTORY_PAGE_3 = {
  status: 200,
  body: JSON.stringify({
    inventoryItems: inventoryItems(["SKU-C1", "SKU-C2"]),
    total: 8,
    limit: 3,
    offset: 6,
  }),
};

export const EBAY_FULFILLMENT_CREATED = {
  status: 201,
  body: JSON.stringify({ fulfillmentId: "5000012345" }),
};

export const EBAY_INVENTORY_ITEM_UPSERTED = {
  status: 200,
  body: JSON.stringify({ sku: "SKU-A1" }),
};

export const EBAY_STATE_CONFLICT = {
  status: 409,
  body: JSON.stringify({ errors: [{ errorId: 21007, message: "offer already published in this state" }] }),
};

export const ebayFixtureRoutes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /^\/commerce\/identity\/v1\/user\/$/, responses: [EBAY_IDENTITY_OK, EBAY_IDENTITY_OK] },
  { method: "GET", pathPattern: /\/sell\/inventory\/v1\/inventory_items\?limit=3&offset=0$/, responses: [EBAY_INVENTORY_PAGE_1] },
  { method: "GET", pathPattern: /\/sell\/inventory\/v1\/inventory_items\?limit=3&offset=3$/, responses: [EBAY_INVENTORY_PAGE_2] },
  { method: "GET", pathPattern: /\/sell\/inventory\/v1\/inventory_items\?limit=3&offset=6$/, responses: [EBAY_INVENTORY_PAGE_3] },
  { method: "POST", pathPattern: /\/sell\/fulfillment\/v1\/order\/[^/]+\/shipping_fulfillment$/, responses: [EBAY_FULFILLMENT_CREATED] },
  { method: "PUT", pathPattern: /\/sell\/inventory\/v1\/inventory_item\/[^/]+$/, responses: [EBAY_INVENTORY_ITEM_UPSERTED] },
];
