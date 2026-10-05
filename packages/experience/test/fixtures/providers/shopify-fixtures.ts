/**
 * ⚠ TEST DOUBLE — provider-faithful recorded Shopify Admin REST responses
 * (W3-003 CI fixtures; INVARIANT 39 — test data only, separated from
 * adapter code). Shapes mirror the real API:
 * - `shop.json` envelope `{"shop":{…}}` with currency/country_code;
 * - products pagination via RFC 5988 `Link: <…page_info=…>; rel="next"`;
 * - leaky-bucket `X-Shopify-Shop-Api-Call-Limit: <used>/<limit>` header;
 * - 429 carrying `Retry-After` (seconds);
 * - error payloads `{"errors":…}` (string OR per-field object on 422).
 */

import type { FixtureRoute } from "./player";

const CALL_LIMIT = (used: number, limit = 40): Record<string, string> => ({
  "X-Shopify-Shop-Api-Call-Limit": `${used}/${limit}`,
});

export const SHOPIFY_SHOP_OK = {
  status: 200,
  headers: CALL_LIMIT(1),
  body: JSON.stringify({
    shop: {
      id: 10990001,
      name: "Connors Store",
      email: "owner@connors-store.example",
      domain: "connors-store.myshopify.com",
      currency: "USD",
      country_code: "US",
      plan_name: "basic",
    },
  }),
};

export const SHOPIFY_SHOP_UNAUTHORIZED = {
  status: 401,
  body: JSON.stringify({
    errors: "[API] Invalid API key or access token (unrecognized login or wrong password)",
  }),
};

export const SHOPIFY_SHOP_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "2", ...CALL_LIMIT(40) },
  body: JSON.stringify({ errors: "Exceeded 2 calls per second for api. Reduce request rates." }),
};

export const SHOPIFY_PRODUCTS_PAGE_1 = {
  status: 200,
  headers: {
    ...CALL_LIMIT(5),
    Link: '<https://connors-store.myshopify.com/admin/api/2024-01/products.json?page_info=hijgklmn&limit=2>; rel="next"',
  },
  body: JSON.stringify({
    products: [
      { id: 632910392, title: "The Camper Snowboard", variants: [{ id: 80419992 }] },
      { id: 921728736, title: "Arbor Classic", variants: [{ id: 92345678 }] },
    ],
  }),
};

export const SHOPIFY_PRODUCTS_PAGE_2 = {
  status: 200,
  headers: { ...CALL_LIMIT(6) },
  body: JSON.stringify({
    products: [
      { id: 439654642, title: "Rustic Lantern", variants: [{ id: 11112222 }] },
      { id: 697304814, title: "Blue rasta", variants: [{ id: 33334444 }] },
    ],
  }),
};

export const SHOPIFY_ORDER_CREATED = {
  status: 201,
  headers: CALL_LIMIT(7),
  body: JSON.stringify({
    order: {
      id: 450789469,
      email: "buyer@example.com",
      currency: "USD",
      total_price: "41.94",
      line_items: [{ id: 466157049, variant_id: 80419992, quantity: 1 }],
    },
  }),
};

export const SHOPIFY_ORDER_UNPROCESSABLE = {
  status: 422,
  body: JSON.stringify({ errors: { line_items: ["is invalid"] } }),
};

export const SHOPIFY_PRODUCT_UPDATED = {
  status: 200,
  headers: CALL_LIMIT(8),
  body: JSON.stringify({ product: { id: 632910392, title: "The Camper Snowboard" } }),
};

export const SHOPIFY_INTERNAL_ERROR = {
  status: 500,
  body: JSON.stringify({ errors: "Internal Server Error" }),
};

/** Full route script for the Shopify adapter CI suite. */
export const shopifyFixtureRoutes: readonly FixtureRoute[] = [
  {
    method: "GET",
    pathPattern: /^\/admin\/api\/2024-01\/shop\.json$/,
    responses: [SHOPIFY_SHOP_OK, SHOPIFY_SHOP_OK, SHOPIFY_SHOP_OK],
  },
  {
    method: "GET",
    pathPattern: /^\/admin\/api\/2024-01\/products\.json\?limit=2$/,
    responses: [SHOPIFY_PRODUCTS_PAGE_1],
  },
  {
    method: "GET",
    pathPattern: /^\/admin\/api\/2024-01\/products\.json\?limit=2&page_info=hijgklmn$/,
    responses: [SHOPIFY_PRODUCTS_PAGE_2],
  },
  {
    method: "GET",
    pathPattern: /^\/admin\/api\/2024-01\/products\.json\?limit=3$/,
    responses: [SHOPIFY_PRODUCTS_PAGE_1],
  },
  {
    method: "POST",
    pathPattern: /^\/admin\/api\/2024-01\/orders\.json$/,
    responses: [SHOPIFY_ORDER_CREATED],
  },
  {
    method: "PUT",
    pathPattern: /^\/admin\/api\/2024-01\/products\/\d+\.json$/,
    responses: [SHOPIFY_PRODUCT_UPDATED],
  },
];
