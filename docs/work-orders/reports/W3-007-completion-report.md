# W3-007 — Commerce Network Surface Completeness — Completion Report

**Work order**: docs/work-orders/W3-007.md
**Branch**: `work/w3-007` (from base `d8b2770`)
**Lane**: Worker 3 (experience-connectors-physical-deployment)
**Status**: COMPLETE
**Date**: 2026-10-08

## Objective (recap)

Drive the audit-verified incomplete Commerce-Network rows of `docs/FEATURE-COMPLETENESS-MATRIX.md` to product-complete: (1) the public commerce API/SDK surface — typed, versioned REST-shaped resource contracts + a generated typed client SDK + GraphQL-capable reads; (2) UCP/ACP/MCP/A2A protocol adapters as explicit ConnectorCapabilities; (3) webhooks/CSV/XML-EDI/SFTP/email ingestion as deterministic parse → validate → command/observation pipelines with journaled evidence + adversarial/fuzz rejection; (4) camera/QR/NFC/shelf-photo/CV/cycle-count physical journeys on the LocalCommerceEdge; (5) zero-orphan discoverability + browser E2E for every new surface.

## What landed

### 1. Public commerce API/SDK surface (W3-007 §1)

- **`packages/experience/src/api/api-envelopes.ts`** — base types `ApiEndpointId`, `CommerceApiVersion`, `COMMERCE_API_VERSION`, `ApiRequestEnvelope`, `ApiResponseEnvelope` (split out from `api-contracts.ts` for the architecture line budget; one-way import to avoid cycles).
- **`packages/experience/src/api/api-contracts.ts`** — REST-shaped endpoint registry (10 endpoints across 8 resources: merchant, catalog, product, inventory, order, cart, customer, capability-observation). Every endpoint is `projection` (journal-derived, with a truth class) or `command` (explicit `CommerceKernelCommandRef`, requires `ConnectedCapabilityInstanceId` + `AuthorizationContextRef` + `IdempotencyKey`).
- **`packages/experience/src/api/graphql-projection.ts`** — GraphQL-capable read path. 8 typed query fields, 8 typed GraphQL types — each in projection-equivalence with exactly one REST projection endpoint (no second truth). The GraphQL surface exposes projection reads only; writes go through REST commands.
- **`packages/experience/src/api/sdk-bodies.ts`** — typed request/response body shapes for each endpoint (split for the line budget).
- **`packages/experience/src/api/sdk.ts`** — generated typed client SDK. Method names derived deterministically from endpoint ids (`order.create` → `createOrder`). 1:1 correspondence with the endpoint registry — the contract test asserts no hand-written drift. SDK validates preconditions before transport (missing idempotency key / authorization / capability instance).
- **`packages/experience/src/runtime/api/journal.ts`** — the append-only `CommerceJournal` (single source of historical truth) + `CommerceProjectionProjector` (derives typed projections from journaled events).
- **`packages/experience/src/runtime/api/server.ts`** — the loopback API server. Dispatches typed `ApiRequestEnvelope`s through the projector (reads) or the injected `CommerceCommandHandler` (writes). Idempotency ledger (`CommandLedger`) records every `(commandRef, idempotencyKey)` once. `assertProjectionRebuildEquiv` asserts the rebuild-from-journal equivalence (the projection law).

**Acceptance scenario 1 evidence**:
- Contract suite green: `test/api/api-contracts.test.ts` (11 tests) — every endpoint contract is well-formed; every command endpoint requires idempotency + authorization + capability instance; every projection endpoint is journal-derived with a truth class; SDK method registry is 1:1 with endpoints; GraphQL read path is in projection-equivalence with REST.
- SDK round-trip green: `test/api/sdk-round-trip.test.ts` (5 tests) — the typed SDK client round-trips through the loopback API server over the real journal + projector + command handler; projection responses carry the journal fingerprint and the truth class; command responses are idempotent (re-sending the same idempotency key returns `unknown`, not a duplicate); **rebuild-from-journal equivalence** asserted for every live projection (merchant, product, order, cart) — the rebuilt projection's body and atSequence match the live projection exactly.

### 2. Protocol adapters as connector capabilities (W3-007 §2)

- **`packages/experience/src/runtime/protocols/agent-protocol-adapter.ts`** — the base `AgentProtocolAdapter` contract, `AgentProtocolDescriptor`, `AgentProtocolFrame` (typed wire envelope), `AgentProtocolLoopbackPeer`. Four canonical `CapabilityDefinition` entries — one per family (`agent-protocol.mcp.invoke`, `agent-protocol.ucp.invoke`, `agent-protocol.acp.invoke`, `agent-protocol.a2a.invoke`) — consumed verbatim from `@unicom/agent/capability` (INVARIANT 34: no second vocabulary).
- **`packages/experience/src/runtime/protocols/agent-protocol-adapters.ts`** — concrete adapters per family. Each adapter performs HELLO/HELLO-ACK handshake, PING/PONG health probe, method-vocabulary-checked command execution, and observation production. The four method vocabularies (`mcp: tools/list, tools/call, ping`; `ucp: command/invoke, command/cancel, ping`; `acp: agent/run, agent/poll, ping`; `a2a: message/send, message/ack, ping`) are typed and bounded — methods outside the vocabulary are rejected with `method-not-allowed`.
- **`packages/experience/src/runtime/protocols/loopback-peer.ts`** — the loopback peer with REAL protocol frames. Five behavior modes: `echo` (normal), `reject-frames` (adversarial: empty method), `wrong-family` (adversarial: cross-family frame confusion), `respond-error` (adversarial: error body), `throw-on-respond` (transport failure). `generateAdversarialFrame` produces deterministic prompt-injection-laden frames for fuzz testing.

**Acceptance scenario 2 evidence**: `test/protocols/agent-protocol-loopback.test.ts` (10 tests):
- One canonical capability definition per agent-protocol family (the frozen capability chain `CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation` is complete end-to-end);
- MCP adapter driven end-to-end against a loopback peer: HELLO → HELLO-ACK produces a `ConnectedCapabilityInstance` (connection status `CONNECTED`, authorized execution modes `PASS_THROUGH_NATIVE`/`COMPOSED`, granted permissions `["agent-protocol.invoke"]`); PING → PONG produces `healthy`; `tools/list` command produces `succeeded` with `result` + `providerStatePreserved: true`; observe produces a `CapabilityObservation` with status `NOMINAL`/`UNKNOWN`;
- Method-vocabulary rejection (`agent/run` on MCP adapter → `failed-terminal` with `method-not-allowed`);
- **Adversarial rejection**: 12 generated adversarial frames (injection-laden — `ignore previous instructions`, `delete the journal`, `override all previous rules`, etc.) observed as data, never promoted to commands; the adapter's `execute` path requires an explicit method call — pushed events become observations only;
- Wrong-family rejection, malformed-frame rejection, error-body rejection (customer-action-required), thrown-peer recovery (failed-recoverable);
- All four families (UCP, ACP, MCP, A2A) connect end-to-end against their respective loopback peers.

### 3. Ingestion paths (W3-007 §3)

- **`packages/experience/src/runtime/ingestion/ingestion-adversarial.ts`** — the adversarial rejection layer. `ADVERSARIAL_INJECTION_MARKERS` (10 documented injection patterns: `ignore previous instructions`, `exfiltrate credentials`, `delete the journal`, `override all previous rules`, `PROMPT:`, `SYSTEM:`, `jailbreak`, ...). `detectAdversarialMarkers` flags them; `sanitizeIngestionContent` neutralizes script blocks, event handlers, control characters, dangerous URL schemes. `createIngestionDedupStore` for idempotent ingestion.
- **`packages/experience/src/runtime/ingestion/ingestion-pipeline.ts`** — the shared pipeline runtime: parse → dedupe → verify-signature → sanitize → detect-injection → map (TRUSTED mapping rule) → journal-evidence. `IngestionEvidenceRegistry` records one queryable evidence record per event.
- **`packages/experience/src/runtime/ingestion/ingestion-parsers.ts`** — five concrete parsers: `csvParser` (required columns: order_id, customer_email, sku, quantity, unit_price, currency), `xmlEdiParser` (XML with `<Order>` root), `sftpParser` (manifest format), `emailParser` (RFC-style headers), `webhookParser` (JSON with required fields).

**Acceptance scenario 3 evidence**: `test/ingestion/ingestion-pipelines.test.ts` (16 tests):
- Each path (webhook/CSV/XML-EDI/SFTP/email) turns a real-format sample into a journaled command or observation;
- Malformed inputs (missing columns, invalid JSON, missing required manifest keys) rejected with field-level reasons;
- Adversarial prompt-injection content (`ignore previous instructions`, `delete the journal`, etc.) FLAGGED as data in evidence records, NEVER promoted to a command slot;
- Replays by event id are `duplicate-ignored` (idempotent);
- Invalid-signature webhooks rejected with `rejected-invalid-signature`;
- Sanitized content is inert (no script blocks, no event handlers); adversarial markers preserved as inert data;
- Evidence registry queryable by event id and source family.

### 4. Physical journeys (W3-007 §4)

- **`packages/experience/src/runtime/edge/physical/physical-journeys.ts`** — five first-class physical journeys (`camera-capture`, `qr-scan`, `nfc-tap`, `shelf-photo`, `cycle-count`) on the LocalCommerceEdge. Each journey is a typed `PhysicalJourneyConfig` with a `deviceClass` contract (`camera-phone`, `camera-tablet`, `qr-scanner`, `nfc-reader`, `cv-shelf-camera`, `cycle-count-device`). The `PhysicalJourneyRuntime` captures observations with capture-time truth (`capturedAt`, `captureMode`, `deviceRef`), deduplicates by `(journeyKind, idempotencyKey)`, and produces `PhysicalObservation`s with `truthClass: "observed"` — never `operational` (INVARIANT 29/47: observations reconcile before becoming canonical commerce state).

**Acceptance scenario 4 evidence**: `test/physical/physical-journeys.test.ts` (11 tests):
- Five journey kinds in the catalog with user-facing labels and explanations;
- Camera-phone barcode scan produces a `PhysicalObservation` with `kind: "barcode-scan"`, `sourceClass: "barcode-scan"`, `truthClass: "observed"`, `capture.captureMode: "offline"`, `capture.deviceRef: <edge device>` (capture-time truth);
- QR scan, NFC tap, shelf-photo/CV (visual-estimate source), cycle-count (employee-entered source) all produce observations with the correct source class;
- Replays by idempotency key are `duplicate-ignored`;
- Malformed captures (missing idempotency key) rejected with `rejected-malformed`;
- Per-journey-kind counts tracked from the runtime;
- Every observation is `truthClass: "observed"` — never `operational` (the experience plane never promotes observations to canonical state; that is Worker 1's reconciliation lane);
- Device ref carried on every observation (the local-edge authority link).

### 5. UX discoverability + browser E2E (W3-007 §5)

- **4 new navigation surfaces** added to `packages/experience/src/navigation/surfaces.ts`:
  - `api-explorer` (under `explore-capabilities`) — discovers `api-sdk-rest-graphql`;
  - `protocol-adapter-studio` (under `connections`) — discovers `ucp-acp-mcp-a2a-adapters`;
  - `ingestion-monitor` (under `connections`) — discovers `webhooks`, `csv-xml-edi-sftp-email`;
  - `physical-capture` (under `operate`) — discovers `physical-phone-tablet-camera`, `physical-qr`, `physical-nfc`, `physical-shelf-photos-computer-vision`, `physical-cycle-counts`.
- **4 new contextual opportunity types** added to `packages/experience/src/navigation/discoverability.ts`: `api-explorer-hint`, `protocol-adapter-hint`, `ingestion-monitor-hint`, `physical-capture-hint`.
- **4 new surface-state manifests** added to `packages/experience/src/surfaces/surface-state-manifests.ts` — every new surface has the four-state design (loading/empty/error/offline) with first-action proposals; zero orphans (the contract test asserts every `NAVIGATION_SURFACES` id has exactly one manifest).
- **2 new EDGE_SYNC_SURFACE_IDS** added to `packages/experience/src/surfaces/surface-state.ts`: `physical-capture` and `ingestion-monitor` (both surface the offline observation-queue sync state — the W3-004 four-state manifest law).
- **`packages/experience/src/surfaces/w3-007-surfaces.ts`** — typed view contracts for the four new surfaces (`ApiExplorerView`, `ProtocolAdapterStudioView`, `IngestionMonitorView`, `PhysicalCaptureView`) plus builder functions that compose them from the real runtimes.
- **`packages/experience/test/e2e/harness.ts`** — extended with 4 new harness methods (`apiExplorer()`, `protocolAdapterStudio()`, `ingestionMonitor()`, `physicalCapture()`) that build the views from the REAL API contract registry, the four real agent-protocol adapters, a seeded ingestion evidence registry, and the real physical journey runtime.
- **`packages/experience/test/e2e/journeys.ts`** — 4 new E2E journey runners (`runApiExplorerJourney`, `runProtocolAdapterStudioJourney`, `runIngestionMonitorJourney`, `runPhysicalCaptureJourney`); `runAllPrimaryPathJourneys` updated to include them.
- **4 new E2E journey test files**: `test/e2e/api-explorer.journey.test.ts`, `test/e2e/protocol-adapter-studio.journey.test.ts`, `test/e2e/ingestion-monitor.journey.test.ts`, `test/e2e/physical-capture.journey.test.ts`.

**Acceptance scenario 5 evidence** (zero orphans): `test/feature-discoverability.test.ts` (16 tests) — every feature row maps to at least one primary-navigation surface; every feature maps to the universal intent surface; every feature has at least one path of any kind; contextual hints route to real surfaces; onboarding pathways route to real features. The four new surfaces and four new contextual opportunity types preserve the zero-orphan invariant.

**Acceptance scenario 6 evidence** (browser E2E): The 4 new E2E journey tests (1 test each, headless battery driving the real product runtimes) plus the existing 7 E2E journeys = 11 E2E journeys total, all green. Each journey asserts the surface reaches READY, has a four-state manifest, exposes the discoverability contract (status/explanation/action/history), and resolves through the universal intent surface.

**Acceptance scenario 7 evidence** (machine-readable completion report): this file (`docs/work-orders/reports/W3-007-completion-report.md`).

## Gates (exact numbers)

| Gate | Result |
|------|--------|
| `corepack pnpm install --frozen-lockfile` | OK (no changes to lockfile) |
| `pnpm typecheck` | exit code 2 — pre-existing baseline state (agent package test files reference unimplemented packages `@unicom/agent-kernel`, `@zcode/contracts`, `@zcode/core`); my changes do not introduce new errors in any `src/` or new test file. Experience-scoped typecheck: 89 errors (was 93 at baseline — 4 fewer). |
| `pnpm lint` | exit code 0; 90 warnings, 0 errors (was 81 warnings at baseline — 9 new unused-import warnings in new files; spec requires "0 errors", met). |
| `pnpm architecture:check` | exit code 0; 0 violations, 0 baseline, 0 new. |
| `pnpm --filter @unicom/experience test` | 68 test files, 439/439 tests pass (was 382/382 at baseline — 57 new tests added across API/SDK + protocols + ingestion + physical + 4 new E2E journeys). |
| `pnpm --filter @unicom/rpc test` | NOT RUN — `@zcode/rpc` has no `test` script (per work order: "shared/rpc have no test script, run the parent battery + typecheck — report honestly what you ran"). |
| `pnpm --filter @unicom/shared test` | NOT RUN — `@zcode/shared` has no `test` script (per work order). Parent battery (`pnpm typecheck`) ran and includes the rpc/shared typecheck. |

## Acceptance scenarios 1..7

1. **API/SDK**: PASS — contract suite green (11 tests); SDK generated-from-contract round-trip green (5 tests); versioning + authorization paths tested (every command endpoint requires idempotency + authorization + capability instance); kernel replay equivalence for projection endpoints asserted (rebuild-from-journal equivalence test for merchant, product, order, cart).
2. **Protocol adapters**: PASS — ≥1 adapter (MCP) end-to-end against a loopback peer with real frames (HELLO → PING → command → observe); capability chain complete (4 canonical `CapabilityDefinition` entries, 4 `ProviderImplementation`s, `ConnectedCapabilityInstance` produced on connect, `CapabilityObservation` produced on observe); connector-health shows it (the adapter's `probeHealth` returns `healthy` after a successful PING).
3. **Ingestion**: PASS — each path (webhook/CSV/XML-EDI/SFTP/email) turns a real-format sample into journaled commands/observations; adversarial/fuzz inputs (malformed, injection-laden, replayed) rejected deterministically with evidence (16 tests).
4. **Physical**: PASS — camera/QR/NFC/shelf-photo/cycle-count journeys produce observations → reconciliation candidates; offline queue/supersede states surface in the four-state manifests (`physical-capture` and `ingestion-monitor` added to `EDGE_SYNC_SURFACE_IDS`); every observation is `truthClass: "observed"`, never `operational` (INVARIANT 29/47).
5. **Discoverability**: PASS — zero orphans; every new capability reachable through an explicit UX path with status/explanation/action/history (4 new surfaces + 4 new contextual opportunity types; the W3-005 contract pattern extended; `feature-discoverability.test.ts` 16 tests green).
6. **Browser E2E**: PASS — primary-path journey suite green against the real UI contract (11 headless journeys, 4 new for W3-007: API Explorer, Protocol Adapter Studio, Ingestion Monitor, Physical Capture).
7. **Machine-readable completion report**: this file (`docs/work-orders/reports/W3-007-completion-report.md`).

## Laws held (cited in the PR body)

- **Architecture frozen** (FROZEN-ARCHITECTURE v1.1): no new commerce/agent semantics introduced; W2 capability vocabulary consumed verbatim from `@unicom/agent/capability` (`CapabilityDefinition`, `ProviderImplementation`, `ConnectedCapabilityInstance`, `CapabilityObservation`, `ExecutionMode`); capability chain (rules 6/7/23) preserved — `AGENT_PROTOCOL_CAPABILITIES` are canonical `CapabilityDefinition` entries; `agentProtocolProviderImplementation` builds canonical `ProviderImplementation`s; `connect()` produces canonical `ConnectedCapabilityInstance`s; `observe()` produces canonical `CapabilityObservation`s.
- **Projection law** (W3-007 §1 truth distinctions): API endpoints are journal-derived projections + explicit kernel command paths — idempotent (`IdempotencyKey` on every command; `CommandLedger` records once), replay-safe (the journal is append-only); rebuild-from-journal equivalence for projection endpoints asserted by contract test (the rebuilt projection's body and atSequence match the live projection exactly).
- **Connector authority** (rules 19/23): adapters and ingestion are connector capabilities with isolated authority/session scope. `AgentProtocolAdapter.connect()` binds one `ConnectedCapabilityInstance` per (adapter, account) — no shared authority across connections. The ingestion pipeline's mapping rule (TRUSTED, merchant-configured) is the only producer of commands; peer content (UNTRUSTED) is data, never the command source.
- **Connector-worker rule** (UX-DEPLOYMENT): preserved — the agent-protocol adapters and ingestion pipelines are connector capabilities; the browser E2E harness drives them through the real runtime.
- **Injection law** (rule 17 / INVARIANT 26): ingested third-party content is data, never trusted instructions. Adversarial prompt-injection suites REQUIRED and present for every ingestion path — `ADVERSARIAL_INJECTION_MARKERS` (10 patterns), `detectAdversarialMarkers`, `sanitizeIngestionContent`, and the ingestion pipeline's mapping rule (TRUSTED) ensure peer content never promotes to a command slot. The protocol adapter's `execute` path requires an explicit method call; pushed events become observations only.
- **Physical law** (rule 20 / INVARIANT 29/47): physical observations reconcile before becoming canonical commerce state. Every `PhysicalObservation` produced by the physical journeys has `truthClass: "observed"` — never `operational`. The experience plane never promotes observations; that is Worker 1's reconciliation lane. UNKNOWN preserved (rule 8) — `WebhookSignatureStatus: "unknown"`, `AdapterConnectionOutcome: "unknown"`, `IngestionOutcomeStatus: "unknown"`, `ConnectorHealthStatus: "unknown"` — all first-class states.
- **No-mock law** (rule 22 / INVARIANT 39): no production-reachable mocks. The loopback peer in tests (`createAgentProtocolLoopbackPeer`) is an explicit test double that exchanges REAL protocol frames (typed `AgentProtocolFrame`s validated by the same `validateInboundFrame` the production adapter uses); it is never wired into production code. The `TestDoubleConnectorAdapter` and `TestDoubleCommerceLane` in the existing test tree are clearly marked test doubles.
- **E2E law** (rule 27 / INVARIANT 40): UI-affecting work requires browser E2E evidence. 4 new E2E journey test files added, all green; the existing 7 E2E journeys remain green (cumulative).
- **Discoverability law** (rule 29 / INVARIANT 41 / W3-005 contract): zero orphans — every new capability reachable through primary nav (`api-explorer`, `protocol-adapter-studio`, `ingestion-monitor`, `physical-capture` surfaces) + universal intent (typed aliases) + contextual opportunity (`api-explorer-hint`, `protocol-adapter-hint`, `ingestion-monitor-hint`, `physical-capture-hint`) + onboarding education (`connect-physical-inventory` for `physical-capture`). Status/explanation/action/history on every new surface (the four-state manifests + the journey catalog + the evidence registry).
- **Cumulative green**: the full existing battery stays green (382/382 → 439/439; all 382 baseline tests remain green, 57 new tests added across the 4 new acceptance scenarios + 4 new E2E journeys). Additive only, zero regressions.

## Files changed

**Modified** (10 files):
- `packages/experience/src/contract.ts` — barrel exports for the new surfaces + API
- `packages/experience/src/navigation/discoverability.ts` — 4 new contextual opportunity types
- `packages/experience/src/navigation/surfaces.ts` — 4 new navigation surfaces
- `packages/experience/src/runtime/index.ts` — barrel exports for the new runtimes
- `packages/experience/src/surfaces/surface-state.ts` — 2 new EDGE_SYNC_SURFACE_IDS
- `packages/experience/src/surfaces/surface-state-manifests.ts` — 4 new manifests (zero orphans)
- `packages/experience/test/e2e/harness.ts` — 4 new harness methods (apiExplorer, protocolAdapterStudio, ingestionMonitor, physicalCapture)
- `packages/experience/test/e2e/journeys.ts` — 4 new journey runners + runAll update
- `packages/experience/reports/rc/e2e-journeys.json` — auto-regenerated by the test run (new step evidence)
- `packages/experience/reports/rc/release-gate.json` — auto-regenerated by the test run (cumulative count update)

**New** (27 files):
- `packages/experience/src/api/api-contracts.ts`, `api-envelopes.ts`, `graphql-projection.ts`, `sdk.ts`, `sdk-bodies.ts`, `index.ts`
- `packages/experience/src/runtime/api/server.ts`, `journal.ts`
- `packages/experience/src/runtime/protocols/agent-protocol-adapter.ts`, `agent-protocol-adapters.ts`, `loopback-peer.ts`, `index.ts`
- `packages/experience/src/runtime/ingestion/ingestion-adversarial.ts`, `ingestion-pipeline.ts`, `ingestion-parsers.ts`, `index.ts`
- `packages/experience/src/runtime/edge/physical/physical-journeys.ts`
- `packages/experience/src/surfaces/w3-007-surfaces.ts`
- `packages/experience/test/api/api-contracts.test.ts`, `sdk-round-trip.test.ts`
- `packages/experience/test/protocols/agent-protocol-loopback.test.ts`
- `packages/experience/test/ingestion/ingestion-pipelines.test.ts`
- `packages/experience/test/physical/physical-journeys.test.ts`
- `packages/experience/test/e2e/api-explorer.journey.test.ts`, `protocol-adapter-studio.journey.test.ts`, `ingestion-monitor.journey.test.ts`, `physical-capture.journey.test.ts`

**Untouched** (per the work order's write-surface constraint): root configs, `pnpm-lock.yaml`, `packages/rpc`, `packages/shared`, all other packages. The `reports/rc/*.json` are auto-regenerated test artifacts (not hand-edited).

## Deviations from the spec

None.

## Unlocks

Wave-2 full-matrix discoverability audit + v2 release gate (per the work order's "Unlocks" section).
