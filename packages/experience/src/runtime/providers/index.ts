/**
 * @unicom/experience/runtime/providers — first provider adapters (W3-003).
 *
 * Public surface of the provider layer:
 * - the transport port real adapters call (production fetch wiring + the
 *   deterministic helpers shared by adapters);
 * - the rate-limit/backoff engine;
 * - the shared provider error taxonomy;
 * - the DOCUMENTED provider execution-mode permission matrix;
 * - the canonical capability catalog data for the first adapters;
 * - the six provider adapters: Shopify, eBay, Amazon SP-API, Jumia Seller
 *   Center, Depop, Whatnot.
 *
 * Vocabulary law: capability types are consumed from `@unicom/agent` —
 * this module declares catalog DATA, never a second vocabulary (INVARIANT 34).
 */

export * from "./transport";
export * from "./backoff";
export * from "./provider-errors";
export * from "./matrix";
export * from "./capabilities";
export * from "./provider-adapter-core";
export * from "./shopify";
export * from "./ebay";
export * from "./amazon-spapi";
export * from "./jumia";
export * from "./depop";
export * from "./whatnot";
