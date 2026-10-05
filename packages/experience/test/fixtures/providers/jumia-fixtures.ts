/**
 * ⚠ TEST DOUBLE — provider-faithful recorded Jumia Seller Center
 * responses (W3-003 CI fixtures). Shapes mirror the real SC-family API:
 * - Action-RPC query (Action/Format/Timestamp/UserID/Version + HMAC
 *   `Signature`) — the fixture player does NOT validate the signature
 *   (that is asserted in the suite against the adapter's own signing);
 * - `SuccessResponse.Head/Body` envelopes with `Products` +
 *   `MetaData.TotalProducts` page windows;
 * - in-band `ErrorResponse.Head.ErrorCode/ErrorType/ErrorMessage`;
 * - 429 with `Retry-After`.
 */

import type { FixtureRoute } from "./player";

const productsPage = (skus: string[], total: number, page: number): string =>
  JSON.stringify({
    SuccessResponse: {
      Head: { RequestAction: "GetProducts", RequestId: `fixture-req-${page}`, ResponseCode: "0" },
      Body: {
        Products: skus.map((sellerSku) => ({ SellerSku: sellerSku, Name: `Product ${sellerSku}`, Status: "active", Quantity: 10, Price: "1500.00" })),
        MetaData: { TotalProducts: total },
      },
    },
  });

export const JUMIA_PRODUCTS_PAGE_1 = { status: 200, body: productsPage(["JM-SKU-1", "JM-SKU-2", "JM-SKU-3"], 8, 1) };
export const JUMIA_PRODUCTS_PAGE_2 = { status: 200, body: productsPage(["JM-SKU-4", "JM-SKU-5", "JM-SKU-6"], 8, 2) };
export const JUMIA_PRODUCTS_PAGE_3 = { status: 200, body: productsPage(["JM-SKU-7", "JM-SKU-8"], 8, 3) };

export const JUMIA_STATUS_UPDATED = {
  status: 200,
  body: JSON.stringify({
    SuccessResponse: { Head: { RequestAction: "SetStatusToReadyToShip", RequestId: "fixture-req-rts", ResponseCode: "0" }, Body: {} },
  }),
};

export const JUMIA_PRODUCT_CREATED = {
  status: 200,
  body: JSON.stringify({
    SuccessResponse: { Head: { RequestAction: "ProductCreate", RequestId: "fixture-req-pc", ResponseCode: "0" }, Body: {} },
  }),
};

export const JUMIA_INBAND_SIGNATURE_ERROR = {
  status: 200,
  body: JSON.stringify({
    ErrorResponse: { Head: { RequestAction: "GetProducts", ErrorType: "Sender", ErrorCode: "4", ErrorMessage: "IS_SIGNED: signature is not valid" } },
  }),
};

export const JUMIA_UNAUTHORIZED = {
  status: 401,
  body: JSON.stringify({ ErrorResponse: { Head: { ErrorCode: "17", ErrorMessage: "Unauthorized" } } }),
};

export const JUMIA_THROTTLED = {
  status: 429,
  headers: { "Retry-After": "2" },
  body: JSON.stringify({ ErrorResponse: { Head: { ErrorCode: "77", ErrorMessage: "too many requests" } } }),
};

export const jumiaFixtureRoutes: readonly FixtureRoute[] = [
  { method: "GET", pathPattern: /Action=GetProducts&.*page=1&per_page=1&Signature=/, responses: [{ status: 200, body: productsPage(["JM-SKU-1"], 8, 1) }] },
  { method: "GET", pathPattern: /Action=GetProducts&.*page=1&per_page=3&Signature=/, responses: [JUMIA_PRODUCTS_PAGE_1] },
  { method: "GET", pathPattern: /Action=GetProducts&.*page=2&per_page=3&Signature=/, responses: [JUMIA_PRODUCTS_PAGE_2] },
  { method: "GET", pathPattern: /Action=GetProducts&.*page=3&per_page=3&Signature=/, responses: [JUMIA_PRODUCTS_PAGE_3] },
  { method: "POST", pathPattern: /Action=SetStatusToReadyToShip/, responses: [JUMIA_STATUS_UPDATED] },
  { method: "POST", pathPattern: /Action=ProductCreate/, responses: [JUMIA_PRODUCT_CREATED] },
];
