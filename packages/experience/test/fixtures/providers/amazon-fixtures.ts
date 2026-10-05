/**
 * ⚠ TEST DOUBLE — provider-faithful recorded Amazon SP-API responses
 * (W3-003 CI fixtures). Shapes mirror the real API:
 * - LWA token exchange `POST /auth/o2/token` → `access_token`
 *   (form-encoded grant_type=refresh_token);
 * - `GET /sellers/v1/marketplaceParticipations` with
 *   `x-amzn-RateLimit-Limit` per-operation rate headers;
 * - Orders pagination via `payload.NextPageToken` / `PageToken`;
 * - Listings Items `PUT /listings/2021-08-01/items/{sellerId}/{sku}`;
 * - 429 QuotaExceeded with `Retry-After`; errors `{"errors":[{"code":…}]}`.
 */

import type { FixtureRoute } from "./player";

export const AMAZON_LWA_TOKEN_OK = {
  status: 200,
  body: JSON.stringify({
    access_token: "Atza|IwEBIA...fixture-token",
    token_type: "bearer",
    expires_in: 3600,
  }),
};

export const AMAZON_LWA_TOKEN_REJECTED = {
  status: 400,
  body: JSON.stringify({ error: "invalid_grant", error_description: "refresh token revoked" }),
};

export const AMAZON_PARTICIPATIONS_OK = {
  status: 200,
  headers: { "x-amzn-RateLimit-Limit": "0.0167" },
  body: JSON.stringify([{ marketplace: { id: "ATVPDKIKX0DER", name: "United States" } }]),
};

export const AMAZON_PARTICIPATIONS_FORBIDDEN = {
  status: 403,
  body: JSON.stringify({ errors: [{ code: "Unauthorized", message: "no participating marketplace" }] }),
};

export const AMAZON_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "3", "x-amzn-RateLimit-Limit": "0.0167" },
  body: JSON.stringify({ errors: [{ code: "QuotaExceeded", message: "rate quota exceeded" }] }),
};

export const AMAZON_ORDERS_PAGE_1 = {
  status: 200,
  headers: { "x-amzn-RateLimit-Limit": "0.0167" },
  body: JSON.stringify({
    payload: {
      Orders: [
        { AmazonOrderId: "111-2223334-5556667", OrderStatus: "Shipped" },
        { AmazonOrderId: "111-2223334-5556677", OrderStatus: "Unshipped" },
      ],
      NextPageToken: "PAGE-TOKEN-2",
    },
  }),
};

export const AMAZON_ORDERS_PAGE_2 = {
  status: 200,
  body: JSON.stringify({
    payload: {
      Orders: [
        { AmazonOrderId: "111-2223334-5556688", OrderStatus: "Canceled" },
        { AmazonOrderId: "111-2223334-5556699", OrderStatus: "Unshipped" },
      ],
    },
  }),
};

export const AMAZON_LISTING_UPSERTED = {
  status: 200,
  body: JSON.stringify({ sku: "FIXTURE-SKU-1", status: "ACCEPTED", submissionId: "4885dddc-1a47" }),
};

export const AMAZON_SHIPMENT_CREATED = {
  status: 200,
  body: JSON.stringify({ payload: { shipmentId: "fix-shipment-77" } }),
};

export const AMAZON_INVALID_INPUT = {
  status: 400,
  body: JSON.stringify({ errors: [{ code: "InvalidInput", message: "condition_type is required" }] }),
};

export const amazonFixtureRoutes: readonly FixtureRoute[] = [
  { method: "POST", pathPattern: /^\/auth\/o2\/token$/, responses: [AMAZON_LWA_TOKEN_OK] },
  { method: "GET", pathPattern: /^\/sellers\/v1\/marketplaceParticipations$/, responses: [AMAZON_PARTICIPATIONS_OK, AMAZON_PARTICIPATIONS_OK] },
  {
    method: "GET",
    pathPattern: /\/orders\/v0\/orders\?MarketplaceIds=[^&]+&CreatedAfter=[^&]+$/,
    responses: [AMAZON_ORDERS_PAGE_1],
  },
  {
    method: "GET",
    pathPattern: /\/orders\/v0\/orders\?MarketplaceIds=[^&]+&CreatedAfter=[^&]+&PageToken=PAGE-TOKEN-2$/,
    responses: [AMAZON_ORDERS_PAGE_2],
  },
  { method: "PUT", pathPattern: /\/listings\/2021-08-01\/items\/[^/]+\/[^/]+\?.*$/, responses: [AMAZON_LISTING_UPSERTED] },
  { method: "POST", pathPattern: /\/orders\/v0\/orders\/[^/]+\/shipment$/, responses: [AMAZON_SHIPMENT_CREATED] },
];
