# @unicom/experience

UNiCOM public **experience / connector / physical-edge / deployment boundary
contracts** (W3-001) plus the **connector runtime framework and browser-session
isolation runtime** (W3-002), the **canonical connector execution + provider
adapters** (W3-003), the **physical-commerce edge + live-commerce UX**
(W3-004), and the **merchant/buyer/connector/autonomous UX hardening**
(W3-005) — Worker 3 lane: Experience / Connectors / Physical Edge /
Deployment.

Two public entrypoints:

- `@unicom/experience` → `src/contract.ts` — the boundary contracts
  (types, interfaces, const registries);
- `@unicom/experience/runtime` → `src/runtime/index.ts` — the runtime
  implemented behind those contracts (W3-002).

## What lives here

| Area | Modules |
| --- | --- |
| Common boundary values, opaque refs, evidence, untrusted content | `src/common/*` |
| Primary navigation, feature matrix, surfaces, discovery, roles, universal intent | `src/navigation/*` |
| Command Center, Intent Canvas, Opportunity Inbox, Decision Card (+ render model), storefront, operations, Connector Studio, Trust & Safety, Explore, autonomous-store visibility, surface states | `src/surfaces/*` |
| Transports, BrowserSession isolation, observability, connector health surface, live commerce, webhooks | `src/connector/*` |
| Physical observation, offline queue + reconciliation hand-off, LocalCommerceEdge, weighted workflow | `src/edge/*` |
| Deployment provider adapters (interface only), realtime channels, operator console | `src/deployment/*` |
| Connector runtime framework: adapter boundary, lifecycle, health, execution-mode dispatch, credential vault | `src/runtime/connector/*` |
| Browser session runtime with per-session isolation | `src/runtime/browser/*` |
| Untrusted-content sanitization at ingest/render boundaries | `src/runtime/sanitize/*` |
| Offline observation queue runtime (no promotion, explicit hand-off) | `src/runtime/edge/*` |
| Universal-intent catalog + resolver, Decision Card renderer, connector health surface, surface-state constructors | `src/runtime/surfaces/*` |
| Transport-coverage plumbing (router) | `src/runtime/transport/*` |
| Model-context gate + branded-ref constructors + agent-seam bridges | `src/runtime/model-context-gate.ts`, `src/runtime/ids.ts` |

Public entrypoints: `src/contract.ts` (contracts) and `src/runtime/index.ts`
(runtime) — both are architecture-policy public entrypoints for this module.

## Consumption laws (enforced by contract tests)

1. **Capability vocabulary is consumed, never redefined.** All capability
   references are opaque branded refs (`CapabilityDefinitionId`,
   `ConnectedCapabilityInstanceId`, `CapabilityObservationRef`, ...).
2. **Commerce truth is rendered, never modeled.** Views are read-side
   projections with truth classes; buyer/merchant actions leave as command
   envelopes with opaque `CommerceKernelCommandRef`s (Worker 1 owns command
   semantics).
3. **BrowserSession isolation.** Session handles carry no secret material;
   browser routes are explicit scoped capabilities; secrets never enter
   model context or repository artifacts.
4. **Untrusted content stays data.** Third-party descriptions, reviews,
   customer text, supplier files, web pages, marketplace messages and
   live-stream events are `UntrustedCommerceContent<T>`, never
   `TrustedInstruction`.
5. **Offline → queue → hand-off.** Observations captured offline queue on
   the LocalCommerceEdge and are handed to deterministic reconciliation.
   This boundary has no canonical promotion path.
6. **Zero provider names in domain contracts.** Deployment adapters are
   referenced by opaque ids and configured display labels; free-tier limits
   are observations only.
7. **Feature discoverability is architectural completeness.** The encoded
   feature matrix must keep every feature discoverable; the test suite
   parses `docs/FEATURE-COMPLETENESS-MATRIX.md` and fails on drift or gaps.
8. **UX completeness (W3-005).** Every registered surface implements the
   four typed degraded states (empty / loading / error / offline); every
   empty state structurally proposes the first action; every feature and
   surface is addressable through the typed universal-intent command
   catalog (no freeform command dispatch); offline is a first-class
   rendered state carrying the observation-queue sync + journaled
   supersede outcomes. Hidden feature = incomplete feature.

## The `@unicom/agent` seam (W3-002: landed)

The typed dependency **is in place**: `@unicom/agent` (`workspace:*`) is the
one sanctioned cross-package import for this lane, consumed exclusively
through the public entrypoints `@unicom/agent` and `@unicom/agent/capability`:

- `CapabilityDefinition`, `ProviderImplementation`,
  `ConnectedCapabilityInstance`, `CapabilityObservation`,
  `ExecutabilityPreconditions`, `ExecutionMode`, `CredentialRef`,
  `CredentialScope` — the CANONICAL vocabulary, consumed by name
  (invariant 34: no duplicate vocabulary anywhere);
- `evaluateCapabilityExecutability` — the canonical typed executability
  decision, live inside the execution-mode dispatch plumbing;
- `credentialRef` / `credentialScope` / `assertNoCredentialMaterial` /
  `toModelContextMaterial` — the canonical credential-safety machinery,
  reused by the connector credential vault and the model-context gate.

Surface contracts keep opaque branded refs as the wire format; the runtime
bridges them (`src/runtime/ids.ts`). The module manifest
(`src/module.ts`) and `architecture-policy.yaml` declare
`experience → agent`.

## Tests

`pnpm --filter @unicom/experience test` (vitest, deterministic, offline,
zero-network). Coverage areas:

- feature-discoverability matrix (core UX acceptance) + markdown sync;
- Decision Card required-field contract;
- BrowserSession secret isolation (compile-time + runtime scans);
- untrusted-content boundary guards;
- LocalCommerceEdge offline queue with no promotion path;
- connector transport coverage;
- deployment provider-name guard (W3-002: the @unicom/agent workspace seam
  is the one sanctioned dependency, still zero provider names);
- role-switch identity preservation;
- no-RFID supermarket end-to-end journey;
- **connector adapter lifecycle, health observation (UNKNOWN ≠ FAILED) and
  execution evidence on real runtime paths**;
- **execution-mode dispatch through PASS_THROUGH_NATIVE / COMPOSED /
  OPTIMIZED_MULTI_PROVIDER plumbing (provider-agnostic, TEST DOUBLE
  executors clearly marked — no production mocks, no provider adapters)**;
- **browser session runtime per-session isolation (two concurrent sessions
  cannot read each other's storage, identity or authority)**;
- **untrusted-content sanitization at ingest/render boundaries
  (adversarial)**;
- **offline queue runtime: drains to the commerce lane as observations, no
  silent promotion, explicit reconciliation**;
- **credential vaulting + model-context gate (adversarial: sealed values
  provably absent by key AND by value)**;
- **transport-coverage plumbing (all families, command/observation
  capability enforcement, sanitized ingest)**;
- **typed vocabulary seam (canonical imports, no second vocabulary)**;
- **W3-005 UX hardening: navigation completeness with zero orphan routes
  (primary nav + universal intent both resolve); typed universal-intent
  command surface (deterministic resolution, UNKNOWN on no-match);
  Decision Card full-contract render with opaque refs verbatim; connector
  health surface populated by real execution-mode journeys; autonomous-
  store visibility with opaque commerce refs; four-state manifests for all
  surfaces with first-action empty states; offline queue-sync + journaled
  supersede outcomes rendered from the real W3-004 components;
  live-commerce lifecycle visibility, late-joiner replay (also after end),
  backpressure consumer states and the terminal summary**.

Test doubles live in `test/doubles.ts` and are clearly marked — never on a
production path (invariant 39).

## W3-006 — public deployment readiness (additive)

- **Deployment adapters as code** — provider-agnostic target plans
  (`deployment/manifest.ts` contracts; `runtime/deployment/target-plan.ts`
  carries the fully-specified `NODE_SERVER_TARGET_PLAN`): typed environment
  contracts, build steps, liveness/readiness/startup probes and startup
  ordering. The node-server target adapter (`runtime/deployment/
  target-adapter.ts`) builds through a REAL command executor, boots REAL
  loopback HTTP services, gates dependents on dependency readiness and
  re-verifies every probe over HTTP (termination/restart drives the DR
  pod-loss playbook). Zero provider names, zero provider SDKs.
- **Browser E2E journey suites** — `test/e2e/` drives the REAL experience
  runtimes headless through the primary user paths (Command Center, Intent
  Canvas, Opportunity Inbox, storefront → checkout, Connector Studio,
  Trust/Security, live commerce incl. late-joiner replay + backpressure)
  against the typed UI contracts — the same runners emit the RC evidence.
- **Production observability** — `deployment/observability.ts` +
  `runtime/deployment/observability.ts`: per-subsystem health, connector
  health, autonomous-store and live-session status as typed PROJECTIONS of
  the journaled event streams (`projectionOnly: true`,
  `sourceOfTruth: "journaled-events"` — never a second source of truth);
  the operator dashboard composes the snapshot + DR runbook statuses.
- **DR runbook as code** — `deployment/runbook.ts` +
  `runtime/deployment/{journal-chain,dr-playbooks,dr-objectives}.ts`:
  hash-chained kernel-state backups (tamper/reorder/truncate/reforge
  detection), verified restore into a FRESH kernel (identical state +
  identical exactly-once behavior), full projection rebuild from journal
  replay, four tested failure-mode playbooks (connector outage, pod loss,
  journal corruption, split-brain) each running detection → journaled
  decision → recovery → verification, and the single-writer fencing lease.
- **RC evidence** — `deployment/rc-evidence.ts` +
  `runtime/deployment/rc-evidence.ts`: machine-readable reports (E2E /
  observability / DR drills + the aggregated release gate) written to
  `reports/rc/` with a deterministic drill clock; the gate re-states that
  the production push stays UNAUTHORIZED (the operator flips it).
