/**
 * @unicom/experience/runtime — the connector runtime framework public
 * entrypoint (W3-002).
 *
 * Runtime components (contracts remain at `@unicom/experience`):
 * - branded-ref constructors + typed @unicom/agent seam bridges (`ids`);
 * - credential vaulting at the connector boundary (`connector/vault`);
 * - the model-context gate — the only path toward model context
 *   (`model-context-gate`);
 * - provider-agnostic connector adapter boundary (`connector/adapter`);
 * - connector lifecycle orchestration (`connector/runtime`);
 * - connector health observation + reporting (`connector/health`);
 * - execution-mode dispatch plumbing for the three frozen modes
 *   (`connector/dispatch`);
 * - browser session runtime with per-session isolation
 *   (`browser/session-runtime`);
 * - untrusted-content sanitization at ingest/render boundaries
 *   (`sanitize/sanitizer`);
 * - offline observation queue with explicit no-promotion hand-off
 *   (`edge/offline-queue-runtime`);
 * - transport-coverage plumbing (`transport/router`);
 * - first provider adapters: Shopify, eBay, Amazon SP-API, Jumia Seller
 *   Center, Depop, Whatnot — real API semantics, documented
 *   execution-mode permission matrix, shared backoff/error taxonomy
 *   (`providers/*`, W3-003);
 * - connector telemetry + journey evidence registry, queryable from the
 *   health surface (`connector/telemetry`, W3-003);
 * - the canonical journey runner: observe → decide → execute with
 *   recorded evidence (`connector/journey`, W3-003);
 * - LocalCommerceEdge: local-first queueing, exactly-once replay,
 *   degraded-mode operation (`edge/local-commerce-edge`, W3-003);
 * - browser-only connector over the isolated session runtime
 *   (`connector/browser-only`, W3-003);
 * - live-commerce connector: arrival-order execution + backpressure
 *   (`connector/live-commerce`, W3-003);
 * - feed/file connector: schema validation, per-row partial-failure
 *   dispositions, exactly-once ingest (`connector/feed-file`, W3-003).
 *
 * Vocabulary law: the capability vocabulary is consumed from
 * `@unicom/agent` public entrypoints (`.` and `./capability`) — this package
 * declares no vocabulary of its own (invariant 34).
 */

export * from "./ids";
export * from "./model-context-gate";
export * from "./connector/adapter";
export * from "./connector/vault";
export * from "./connector/health";
export * from "./connector/dispatch";
export * from "./connector/runtime";
export * from "./connector/telemetry";
export * from "./connector/journey";
export * from "./connector/browser-only";
export * from "./connector/live-commerce";
export * from "./connector/feed-file";
export * from "./browser/session-runtime";
export * from "./sanitize/sanitizer";
export * from "./edge/offline-queue-runtime";
export * from "./edge/local-commerce-edge";
export * from "./transport/router";
export * from "./providers/index";
