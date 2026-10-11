# Operator decision packet — J15 browser-safe connector runtime boundary (prepare-only)

**Status:** PREPARE_OPTIONS_ONLY_OPERATOR_DECISION_REQUIRED · **Implementation authorized:** NO
**Prepared by:** TL, product-completion phase (2026-10-11), issue #12
**Scope question:** whether a **browser-safe experience runtime sub-entrypoint** can be delivered so J15 can display actual connector-runtime information in a browser — while preserving architecture baseline `1.1-frozen-2026-10-05`, the frozen public entrypoints, and Node-only adapter isolation.

## 1. Problem and current evidence

`@unicom/experience` exposes public entrypoints `.`, `./runtime`, `./sim` (package.json exports; the entrypoints are part of the frozen baseline). The `./runtime` barrel (`src/runtime/index.ts`) re-exports the REAL connector runtime — `createShopifyAdapter`, `createCredentialVault`, `createConnectorRuntime`, provider-journey runners, telemetry rollups. It also transitively touches Node-only modules (`node:util` promisify at the barrel's module top level — statically verified from the public import chain during W3-016).

Consequence today: a browser `import { … } from "@unicom/experience/runtime"` fails to evaluate (the guarded dynamic import in the J15 web module renders the honest "not browser-evaluable" boundary). The J15 surface instead renders a **committed test-pinned SAFE_EXERCISE_RECORD**: the real runtime was exercised in a Node context (registered-never-connected Shopify adapter, health UNKNOWN, one read-only journey refused by the canonical gate `CATALOG_ONLY_NO_CONNECTED_INSTANCE`, tripwire 0 provider HTTP calls, 0 sealed credentials) and the RECORD of that exercise is what the browser displays. This is honest but static — the browser cannot show live runtime behavior.

## 2. Non-negotiable constraints

1. Frozen public entrypoints: `.`, `./runtime`, `./sim` — their SIGNATURES must not change; adding a new sub-entrypoint (e.g. `./runtime-browser`) is an additive change to the package's exports map = **an architecture change requiring operator approval** (this packet).
2. Node-only adapter isolation: the real adapter, vault and any Node-requiring code must remain impossible to pull into a browser bundle.
3. No secret/credential material may become reachable from browser code — browser-safe surfaces may carry only opaque refs and non-secret telemetry/health projections (existing contract law).
4. No live provider connections result from this decision (separately gated).

## 3. Options compared

| | A. Additive sub-entrypoint `./runtime-browser` (browser-safe projection kit) | B. Split the existing `./runtime` barrel so it becomes browser-safe itself | C. Keep the committed SAFE_EXERCISE_RECORD (status quo) |
|---|---|---|---|
| Shape | A new `src/runtime-browser/index.ts` barrel exporting PURE projection helpers (health-surface projection, telemetry rollup shaping, capability/status taxonomies) + a typed "runtime facts" interface the Node side can serialize; package.json gains `"./runtime-browser"` | Refactor `src/runtime/index.ts` to move `node:util` usage behind a lazy/adapter seam so the whole barrel evaluates in a browser | No change; J15 keeps rendering the committed record |
| Pros | Zero risk to existing consumers; browser bundle provably cannot reach Node code (the sub-entrypoint's module graph is statically browser-clean); the Node runtime stays untouched; additive = reversible | No new entrypoint; one barrel everywhere | Zero work; already honest |
| Cons | **New public entrypoint (exports-map change — needs this approval)**; two runtime surfaces to keep aligned (mitigated by a shared facts contract + a parity test) | Touches the FROZEN `./runtime` barrel — every existing consumer re-verifies; a lazy seam can still leak Node deps transitively (needs a `platform-check` lint/test); highest regression risk | J15 stays static in browsers; the "connector runtime" the user sees is a record, not a live evaluation |
| Architecture impact | Additive exports-map entry + new source dir; no new PACKAGE, no new dependency EDGE (web → experience already permitted) | Modifies a frozen entrypoint's implementation (signature-compatible but graph-risk) | None |
| TL recommendation | **Recommended** if live-ish browser display is wanted | Not recommended (graph risk on a frozen surface for marginal gain) | **Acceptable** if the operator prefers zero change |

## 4. Bundle/secret leakage analysis (Option A)

- The sub-entrypoint's graph would be statically verified browser-clean by a new module-graph test (walk the exports from `./runtime-browser`, assert zero `node:` specifiers, zero imports of the adapter/vault implementation modules).
- Browser code receives only serialized **runtime facts** (health snapshots, telemetry counters, capability declarations, journey outcomes) — all existing contract types; no credential refs cross the boundary (the vault's real type stays Node-side; the browser sees opaque ids only).
- The Node lane (agent/host) that runs the real runtime publishes facts through the existing telemetry/health-surface contracts — nothing new crosses the trust boundary.

## 5. Tests and rollout (only after approval)

1. Module-graph purity test for `./runtime-browser` (CI-fast, pure static analysis).
2. Parity test: every fact the browser can render is produced by the same projection code the Node lane uses (single source, two entrypoints).
3. J15 upgrade: render live facts when a facts provider is present, else the committed record (progressive enhancement, no removal of the honest boundary).
4. Kill switch: the sub-entrypoint is additive; J15 falls back to the committed record if absent.

## 6. Exact approval requested

1. Approve adding the additive `./runtime-browser` sub-entrypoint to `@unicom/experience` (exports-map addition; no existing entrypoint changes; no new package; no new dependency edge).
2. Alternatively, direct status quo (Option C) — the J15 committed-record boundary remains the permanent design.
3. Explicitly NOT requested: live provider connections, credentials in browser-reachable code, changes to `./runtime`'s signatures, production deployment.

**Interfaces that would change (Option A):** `packages/experience/package.json` exports map (+1 entry), new `src/runtime-browser/` directory, J15 web module's guarded import gains a browser-safe path. No changes to any existing export.
