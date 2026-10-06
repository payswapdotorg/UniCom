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
 *   dispositions, exactly-once ingest (`connector/feed-file`, W3-003);
 * - POS/back-office import connector: mode-journey pulls + exactly-once
 *   row ingestion + the idempotent fact ledger
 *   (`connector/pos-import`, W3-004);
 * - exact-integer math + the weighted-product workflow runtime with
 *   explicit tolerance bands (`edge/exact-integer`, `edge/weighted-runtime`,
 *   W3-004);
 * - offline observation replay with capture-time stamps and the journaled
 *   conflict/supersede rules (`edge/offline-replay`, W3-004);
 * - the reconciliation journey planner: edge vs system vs POS variance
 *   views with tri-state preservation (`edge/reconciliation-journey`, W3-004);
 * - the live-commerce session runtime implementing the typed UX contract
 *   (`surfaces/live-session`, W3-004);
 * - the universal-intent typed command catalog + deterministic resolver
 *   (`surfaces/universal-intent`, W3-005);
 * - the Decision Card render projector — every contract field rendered,
 *   opaque refs verbatim (`surfaces/decision-card-render`, W3-005);
 * - the per-connector health surface composed from W3-003 journey
 *   telemetry (`surfaces/connector-health`, W3-005);
 * - the surface-state constructors + the offline queue-sync/supersede view
 *   builder (`surfaces/surface-state`, W3-005).
 * - the provider-agnostic deployment target plan + the node-server target
 *   adapter: typed environment contracts, real build steps, loopback HTTP
 *   health/readiness/startup probes, startup ordering
 *   (`deployment/target-plan`, `deployment/target-adapter`, W3-006);
 * - the observability projector + operator dashboard — projections of the
 *   journaled event streams, never a second source of truth
 *   (`deployment/observability`, W3-006);
 * - journal backup/restore with hash-chain corruption detection
 *   (`deployment/journal-chain`, W3-006);
 * - the DR playbook engine (detection → journaled decision → recovery) +
 *   the single-writer fencing lease (`deployment/dr-playbooks`, W3-006);
 * - the RC evidence emitter + release-gate evaluator
 *   (`deployment/rc-evidence`, W3-006).
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
export * from "./connector/pos-import";
export * from "./browser/session-runtime";
export * from "./sanitize/sanitizer";
export * from "./edge/offline-queue-runtime";
export * from "./edge/local-commerce-edge";
export * from "./edge/offline-replay";
export * from "./edge/reconciliation-journey";
export * from "./edge/exact-integer";
export * from "./edge/weighted-runtime";
export * from "./surfaces/live-session";
export * from "./surfaces/universal-intent";
export * from "./surfaces/decision-card-render";
export * from "./surfaces/connector-health";
export * from "./surfaces/surface-state";
export * from "./transport/router";
export * from "./providers/index";
export * from "./deployment/target-plan";
export * from "./deployment/target-adapter";
export * from "./deployment/observability";
export * from "./deployment/journal-chain";
export * from "./deployment/dr-playbooks";
export * from "./deployment/dr-objectives";
export * from "./deployment/rc-evidence";
