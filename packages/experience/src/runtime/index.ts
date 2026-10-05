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
 * - transport-coverage plumbing (`transport/router`).
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
export * from "./browser/session-runtime";
export * from "./sanitize/sanitizer";
export * from "./edge/offline-queue-runtime";
export * from "./transport/router";
