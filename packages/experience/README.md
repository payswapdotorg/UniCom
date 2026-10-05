# @unicom/experience

UNiCOM public **experience / connector / physical-edge / deployment boundary
contracts** — Stage 0 deliverable of work order **W3-001** (Worker 3 lane:
Experience / Connectors / Physical Edge / Deployment).

**Contracts only.** This package contains TypeScript types, interfaces and
const registries. No React components, no adapter implementations, no runtime
code. The Connector Runtime is W3-002; adapters are W3-003+.

## What lives here

| Area | Modules |
| --- | --- |
| Common boundary values, opaque refs, evidence, untrusted content | `src/common/*` |
| Primary navigation, feature matrix, surfaces, discovery, roles | `src/navigation/*` |
| Command Center, Intent Canvas, Opportunity Inbox, Decision Card, storefront, operations, Connector Studio, Trust & Safety, Explore | `src/surfaces/*` |
| Transports, BrowserSession isolation, observability, live commerce, webhooks | `src/connector/*` |
| Physical observation, offline queue + reconciliation hand-off, LocalCommerceEdge, weighted workflow | `src/edge/*` |
| Deployment provider adapters (interface only), realtime channels, operator console | `src/deployment/*` |

Public entrypoint: `src/contract.ts` (the single architecture-policy
public entrypoint for this module).

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

## Planned `@unicom/agent` seam

This package intentionally has **no dependency on `@unicom/agent` yet**.
W2-001 (capability vocabulary) is being defined in parallel and the Stage-0
lanes are pairwise disjoint. When W2-001 merges, **W3-002** will:

1. add the typed dependency on `@unicom/agent`;
2. replace opaque-ref *link shapes* (e.g. `CapabilityUsageView`) with typed
   imports of `CapabilityDefinition`, `ConnectedCapabilityInstance` and
   `CapabilityObservation` — without changing surface contracts;
3. keep every law above intact (opaque ids remain the wire format).

The same law applies to Worker 1's Commerce Kernel: projections and command
envelopes remain the only commerce-truth surface here.

## Tests

`pnpm --filter @unicom/experience test` (vitest, deterministic, offline,
zero-network). Coverage areas:

- feature-discoverability matrix (core UX acceptance) + markdown sync;
- Decision Card required-field contract;
- BrowserSession secret isolation (compile-time + runtime scans);
- untrusted-content boundary guards;
- LocalCommerceEdge offline queue with no promotion path;
- connector transport coverage;
- deployment provider-name guard;
- role-switch identity preservation;
- no-RFID supermarket end-to-end journey.
