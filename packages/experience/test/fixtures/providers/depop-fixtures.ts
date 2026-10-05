/**
 * ⚠ TEST DOUBLE — provider-faithful recorded Depop public-API responses
 * (W3-003 CI fixtures). Shapes mirror the real API: OAuth Bearer identity
 * probe `/api/v1/me`, items feed with `max_id` cursor pagination, listing
 * creation, 429 + `Retry-After`, errors `{"error":…}`.
 */

import type { FixtureRoute } from "./player";

export const DEPOP_ME_OK = {
  status: 200,
  body: JSON.stringify({ id: "u-fix-1", username: "depopseller", followers: 120 }),
};

export const DEPOP_ME_UNAUTHORIZED = {
  status: 401,
  body: JSON.stringify({ error: "invalid_token", error_description: "token expired" }),
};

export const DEPOP_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "1" },
  body: JSON.stringify({ error: "rate_limit" }),
};

const itemsPage = (ids: string[], nextMaxId?: string): string =>
  JSON.stringify({
    items: ids.map((id) => ({ id, title: `Listing ${id}`, price_amount: "25.00", currency: "USD", status: "on_sale" })),
    ...(nextMaxId === undefined ? {} : { next_max_id: nextMaxId }),
  });

export const DEPOP_ITEMS_PAGE_1 = { status: 200, body: itemsPage(["d-item-1", "d-item-2", "d-item-3"], "MAX-2") };
export const DEPOP_ITEMS_PAGE_2 = { status: 200, body: itemsPage(["d-item-4", "d-item-5", "d-item-6"], "MAX-3") };
export const DEPOP_ITEMS_PAGE_3 = { status: 200, body: itemsPage(["d-item-7"]) };

export const DEPOP_LISTING_CREATED = {
  status: 201,
  body: JSON.stringify({ id: "d-listing-99", status: "on_sale" }),
};

export const DEPOP_LISTING_CONFLICT = {
  status: 409,
  body: JSON.stringify({ error: "duplicate_listing", message: "slug already exists" }),
};

export const depopFixtureRoutes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /^\/api\/v1\/me$/, responses: [DEPOP_ME_OK, DEPOP_ME_OK] },
  { method: "GET", pathPattern: /^\/api\/v1\/items\?limit=3$/, responses: [DEPOP_ITEMS_PAGE_1] },
  { method: "GET", pathPattern: /^\/api\/v1\/items\?limit=3&max_id=MAX-2$/, responses: [DEPOP_ITEMS_PAGE_2] },
  { method: "GET", pathPattern: /^\/api\/v1\/items\?limit=3&max_id=MAX-3$/, responses: [DEPOP_ITEMS_PAGE_3] },
  { method: "POST", pathPattern: /^\/api\/v1\/listings$/, responses: [DEPOP_LISTING_CREATED] },
];
