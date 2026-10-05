/**
 * ⚠ TEST DOUBLE — provider-faithful recorded Whatnot responses (W3-003 CI
 * fixtures). Shapes mirror the real API: Bearer identity probe
 * `/api/v1/me`, show-listings `cursor` pagination, in-stream `bid` and
 * `buy-now` execution, 429 + `Retry-After`, errors
 * `{"error":{"code":…}}` (409 outbid / lot closed conflicts).
 */

import type { FixtureRoute } from "./player";

export const WHATNOT_ME_OK = {
  status: 200,
  body: JSON.stringify({ id: "wn-user-1", username: "whatnotseller" }),
};

export const WHATNOT_ME_UNAUTHORIZED = {
  status: 401,
  body: JSON.stringify({ error: { code: "invalid_session", message: "session token expired" } }),
};

export const WHATNOT_AGE_GATED = {
  status: 403,
  body: JSON.stringify({ error: { code: "verification_required", message: "age verification required to bid" } }),
};

export const WHATNOT_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "1" },
  body: JSON.stringify({ error: { code: "rate_limited", message: "too many bids" } }),
};

const listingsPage = (ids: string[], nextCursor?: string): string =>
  JSON.stringify({
    listings: ids.map((id) => ({ id, title: `Lot ${id}`, current_bid: "12.00", currency: "USD", status: "live" })),
    ...(nextCursor === undefined ? {} : { next_cursor: nextCursor }),
  });

export const WHATNOT_LISTINGS_PAGE_1 = { status: 200, body: listingsPage(["wn-lot-1", "wn-lot-2", "wn-lot-3"], "CURSOR-2") };
export const WHATNOT_LISTINGS_PAGE_2 = { status: 200, body: listingsPage(["wn-lot-4", "wn-lot-5"], "CURSOR-3") };
export const WHATNOT_LISTINGS_PAGE_3 = { status: 200, body: listingsPage(["wn-lot-6"]) };

export const WHATNOT_BID_ACCEPTED = {
  status: 200,
  body: JSON.stringify({ bidId: "wn-bid-77", listingId: "wn-lot-1", bidAmount: "13.00" }),
};

export const WHATNOT_OUTBID = {
  status: 409,
  body: JSON.stringify({ error: { code: "OUTBID", message: "a higher bid exists" } }),
};

export const WHATNOT_LOT_CLOSED = {
  status: 404,
  body: JSON.stringify({ error: { code: "LOT_CLOSED", message: "the lot is closed" } }),
};

export const WHATNOT_BUY_NOW_OK = {
  status: 200,
  body: JSON.stringify({ orderId: "wn-order-42", listingId: "wn-lot-2" }),
};

export const whatnotFixtureRoutes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /^\/api\/v1\/me$/, responses: [WHATNOT_ME_OK, WHATNOT_ME_OK] },
  { method: "GET", pathPattern: /^\/api\/v1\/shows\/fixture-show\/listings\?limit=3$/, responses: [WHATNOT_LISTINGS_PAGE_1] },
  { method: "GET", pathPattern: /^\/api\/v1\/shows\/fixture-show\/listings\?limit=3&cursor=CURSOR-2$/, responses: [WHATNOT_LISTINGS_PAGE_2] },
  { method: "GET", pathPattern: /^\/api\/v1\/shows\/fixture-show\/listings\?limit=3&cursor=CURSOR-3$/, responses: [WHATNOT_LISTINGS_PAGE_3] },
  { method: "POST", pathPattern: /^\/api\/v1\/live\/streams\/[^/]+\/bid$/, responses: [WHATNOT_BID_ACCEPTED] },
  { method: "POST", pathPattern: /^\/api\/v1\/live\/streams\/[^/]+\/buy-now$/, responses: [WHATNOT_BUY_NOW_OK] },
];
