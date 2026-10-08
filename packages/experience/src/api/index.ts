/**
 * @unicom/experience/api — public Commerce API/SDK surface (W3-007 §1).
 *
 * Barrels the typed REST-shaped endpoint contracts, the GraphQL-capable
 * read path, and the generated typed client SDK. Consumption is the
 * public entrypoint for any caller that wants to drive UNiCOM
 * programmatically — SDK clients, integration partners, the API
 * Explorer surface (W3-007 §5).
 *
 * Laws:
 * - The surface is a PROJECTION + COMMAND surface over the kernel — never
 *   a second truth (FROZEN-ARCHITECTURE §12, INVARIANT 6).
 * - Commerce truth read paths are journal-derived projections.
 * - Commands hand off through explicit kernel command paths; no new
 *   authority semantics.
 * - The capability vocabulary is consumed from `@unicom/agent` verbatim.
 *
 * File split (architecture line budget):
 * - `api-envelopes.ts` — base types (`ApiEndpointId`, `CommerceApiVersion`,
 *   `COMMERCE_API_VERSION`, `ApiRequestEnvelope`, `ApiResponseEnvelope`)
 *   and opaque-ref re-exports.
 * - `api-contracts.ts` — the REST-shaped endpoint registry; one-way import
 *   from `api-envelopes` (no cycle).
 * - `graphql-projection.ts` — the GraphQL read path (projection-equivalent
 *   with REST).
 * - `sdk.ts` — the generated typed SDK client; `sdk-bodies.ts` carries the
 *   request/response body shapes (split for the line budget).
 */

export * from "./api-envelopes";
export * from "./api-contracts";
export * from "./graphql-projection";
export * from "./sdk";
