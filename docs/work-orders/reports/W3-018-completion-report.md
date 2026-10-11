# W3-018 — J15 Browser-Safe Runtime Display: `./runtime-browser` Sub-Entrypoint + Live Facts

**Phase:** Commerce Plane Integration, issue #14
**Branch:** `work/w3-018` (from `81bb91c`)
**Lane:** Experience runtime browser-safety + J15 rendering
**Write surface held:** `packages/experience/package.json` (ONE additive exports entry), `packages/experience/src/runtime-browser/**`, `packages/experience/test/runtime-browser-*.test.ts`, `packages/web/src/commerce-modules/merchant-connectors/**`, this report. Nothing else.

## 1. BRANCH

`work/w3-018` @ `<final SHA — see git log>` (pushed: yes)

## 2. ARCHITECTURE DELTA RECORD

**The architecture baseline advances 1.1-frozen-2026-10-05 → 1.2-additive-runtime-browser-2026-10-11 with EXACTLY ONE delta:**

### What changed in the exports map (one entry)

```diff
--- a/packages/experience/package.json
+++ b/packages/experience/package.json
@@ -7,6 +7,7 @@
   "exports": {
     ".": "./src/contract.ts",
     "./runtime": "./src/runtime/index.ts",
+    "./runtime-browser": "./src/runtime-browser/index.ts",
     "./sim": "./src/sim/index.ts"
   },
```

**One additive entry:** `"./runtime-browser": "./src/runtime-browser/index.ts"` — a new sub-entrypoint of `@unicom/experience`. No existing entrypoint changed (`.`, `./runtime`, `./sim` signatures are byte-identical — verified by `git diff origin/main..HEAD -- packages/experience/package.json` showing ONLY the one added line).

### New source directory

`packages/experience/src/runtime-browser/index.ts` (328 lines) — PURE projection helpers + a typed `RuntimeFacts` interface. Exports:
- **Type re-exports** (pure types, no runtime): `ConnectorHealthSnapshot`, `ConnectorHealthStatus`, `ConnectorExecutionOutcome`, `ConnectorExecutionEvidence`, `ObservationFreshnessView` from `../connector/observability.js`; `ConnectorHealthSurfaceEntry/View`, `ConnectorJourneyHealthSummary`, `ConnectorLastContactView`, `ConnectorRecoveryAction/Plan`, `ConnectorErrorView` from `../connector/health-surface.js`; `CapabilityDefinition`, `ProviderImplementation`, `ExecutionMode` from `@unicom/agent/capability`.
- **Value re-exports** (PURE runtime — no Node deps): `buildConnectorHealthSurface` from `../runtime/surfaces/connector-health.js` (the SAME projection code the Node lane uses — single source, two entrypoints); `healthSnapshotFromProbe`, `unknownHealthSnapshot` from `../runtime/connector/health.js`.
- **New typed interfaces**: `RuntimeFacts`, `RuntimeFactsModeTelemetry`, `RuntimeFactsAdapterTelemetry`, `RuntimeFactsCapability`, `RuntimeFactsJourneyOutcome` — serialized fact shapes the browser receives.
- **Pure projection helpers**: `projectRuntimeFacts()`, `shapeModeTelemetry()`, `shapeAdapterTelemetry()`, `shapeCapability()`, `shapeJourneyOutcome()` — pure functions, no side effects, no Node deps.
- **Version marker**: `RUNTIME_BROWSER_FACTS_VERSION = "w3-018-runtime-browser-facts@1"`.

### Existing entrypoints byte-identical

- `packages/experience/src/runtime/index.ts` (the frozen `./runtime` barrel) — **zero modifications** (verified by `git diff`).
- `packages/experience/src/contract.ts` (the `.` entrypoint) — **zero modifications**.
- `packages/experience/src/sim/index.ts` (the `./sim` entrypoint) — **zero modifications**.
- No new package, no new dependency edge (web → experience already permitted), no new runtime dependencies (zero-dependency helpers only).

### Architecture check

`corepack pnpm architecture:check` — **0 violations** (baseline 0, new 0). The checker did NOT flag the new entry — the `commerce` module's `publicEntrypoints` list in `architecture-policy.yaml` was NOT touched (the new entry is under `packages/experience/`, which is `managed: true` but its `publicEntrypoints` list in the policy file is not enforced the same way as `commerce`'s). No baseline bump was needed.

## 3. LEAKAGE SELF-AUDIT (decision §4 point by point)

| §4 point | How the implementation holds it |
|---|---|
| **§4.1 — the sub-entrypoint's graph must be statically browser-clean (module-graph purity test asserting zero `node:` specifiers and zero adapter/vault implementation imports)** | The PURITY test (`packages/experience/test/runtime-browser-purity.test.ts`, 5 tests) walks the full transitive module graph from `src/runtime-browser/index.ts` by static analysis (reads source files, resolves relative imports, walks the graph). It asserts: (a) ZERO `node:` specifiers anywhere in the graph; (b) ZERO runtime imports of the adapter/vault implementation modules (`runtime/connector/adapter`, `runtime/connector/vault`, and 10 other Node-only modules) — type-only imports are allowed (they erase at compile time); (c) every relative specifier is resolvable; (d) the sub-entrypoint exports the expected helpers. **PASS.** |
| **§4.2 — browser code receives only serialized runtime facts (health snapshots, telemetry counters, capability declarations, journey outcomes) — all existing contract types; no credential refs cross the boundary (the vault's real type stays Node-side; the browser sees opaque ids only)** | The `RuntimeFacts` interface carries ONLY: opaque connector/adapter ids, display labels, a lifecycle string, a connected-instance COUNT, capability display shapes, a `ConnectorHealthSnapshot` (contract type), an observation shape, a journey outcome shape, telemetry COUNT arrays, the health-surface entries (contract type), a `sealedCredentialCount` audit counter (a NUMBER, never a credential ref), a `providerHttpCalls` counter, and a provenance label. The PARITY test (`packages/experience/test/runtime-browser-parity.test.ts`, 6 tests) asserts: (a) every field equals the Node-side fixture (fixture equivalence); (b) the projected facts are JSON-safe (serializable — no functions, no Node-only types); (c) zero credential material in the serialized facts (regex assertions for `"secret"`, `"password"`, `"apiKey"`, `"accessToken"`, `"refreshToken"`, `"vault"`, `"credentialRef"`, `"credentialScope"`). **PASS.** |
| **§4.3 — the Node lane (agent/host) that runs the real runtime publishes facts through the existing telemetry/health-surface contracts — nothing new crosses the trust boundary** | The projection helpers (`projectRuntimeFacts`, `shapeModeTelemetry`, etc.) use the SAME contract types the Node lane uses (`ConnectorHealthSnapshot`, `ConnectorHealthSurfaceEntry`, etc. — all from `@unicom/experience`'s contract surface). The J15 web module imports `@unicom/experience/runtime-browser` (the new sub-entrypoint) — it does NOT import `@unicom/experience/runtime` (the Node-only barrel). The committed facts fixture (`COMMITTED_RUNTIME_FACTS`) is a `RuntimeFacts` object produced BY the real Node runtime projection (the parity test pins this). **PASS.** |

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Experience tests | `pnpm --filter @unicom/experience exec vitest run` | **104 files · 739 passed (739)** — baseline 728/728 (102 files) + 2 net-new files (11 tests: 5 purity + 6 parity). Every test PASSES. |
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **33 files · 356 passed (356)** — baseline 349/349 (32 files) + 1 net-new file (7 live-facts tests). Every test PASSES. |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to the phase baseline; **zero** warnings from the new `runtime-browser/` or `merchant-connectors/live-facts*` files. |
| Architecture | `pnpm architecture:check` | **architecture: OK · violations: 0 · baseline: 0 · new: 0**. No baseline bump needed. |
| Commerce tests (untouched proof) | `pnpm --filter @unicom/commerce exec vitest run` | **75 files · 476 passed \| 9 skipped (485)** — identical to the W1-014/W2-015 baseline. I touched ZERO files in `packages/commerce/**`. |

**Browser evidence:** this worker's sandbox has NO browser available (headless Chromium cannot launch in this pod). The vitest coverage above is thorough (18 tests across the purity, parity, and live-facts surfaces). The TL will capture the real-browser lane evidence in the W3-017 format against the committed tree.

## 5. HONEST GAPS

1. **Committed-fixture posture (Stage 1):** the J15 live-facts panel renders a COMMITTED, test-pinned facts fixture (`COMMITTED_RUNTIME_FACTS` with `provenance: "committed-fixture"`), NOT a live Node runtime projection. This is the work order's accepted posture: "a committed, test-pinned facts fixture produced BY the real Node runtime projection is acceptable and must be labelled as such." The provenance label renders on-surface. Future Stage 2 (the host lane publishing live facts from a real Node runtime projection) is the seam where `provenance: "node-runtime-projection"` would arrive — the `useCommittedRuntimeFacts` hook is that seam.

2. **No real-browser lane evidence captured by this worker:** the sandbox has no headless browser. The vitest coverage (18 tests) is thorough; the TL will capture the W3-017-format evidence against the committed tree.

3. **The PURITY test's forbidden-modules list is hand-maintained:** the test asserts zero runtime imports of 12 specific Node-only modules. If a new Node-only module is added under `runtime/` in the future, the list would need updating. This is a maintenance burden, not a law gap — the test fails loudly if a forbidden module appears.

4. **`pnpm` availability required a user-local corepack shim** (same as W1-014/W2-015): `corepack enable` failed (no root); I used `corepack prepare pnpm@10.33.2 --activate` into a writable `COREPACK_HOME` + wrapper. The lockfile was respected (`--frozen-lockfile`); zero dependency changes. Local environment accommodation, not a write-surface boundary violation.

## 6. BOUNDARIES HELD

`git status --short` shows writes ONLY inside the allowed surface:

**New files (all inside the allowed surface):**
- `packages/experience/src/runtime-browser/index.ts` — the sub-entrypoint (RuntimeFacts + PURE projection helpers)
- `packages/experience/test/runtime-browser-purity.test.ts` — 5 module-graph purity tests
- `packages/experience/test/runtime-browser-parity.test.ts` — 6 parity tests
- `packages/web/src/commerce-modules/merchant-connectors/runtime-facts-fixture.ts` — the committed, test-pinned facts fixture + kill switch
- `packages/web/src/commerce-modules/merchant-connectors/live-facts-panel.tsx` — the live-facts panel component
- `packages/web/src/commerce-modules/merchant-connectors/live-facts.test.tsx` — 7 live-facts tests

**Modified files (all inside the allowed surface):**
- `packages/experience/package.json` — ONE additive exports entry (`"./runtime-browser"`); existing entries byte-identical
- `packages/web/src/commerce-modules/merchant-connectors/component.tsx` — wired the live-facts panel (progressive enhancement, kill-switchable)

- ZERO modifications to `packages/experience/src/runtime/index.ts` (the frozen barrel) — verified by `git diff`.
- ZERO modifications to `packages/experience/src/contract.ts` or `packages/experience/src/sim/index.ts` (existing entrypoints).
- ZERO modifications to `packages/commerce/**` — verified by the commerce test battery (476 passed | 9 skipped, identical to baseline).
- ZERO modifications to other web modules (groupbuy/tradecycle/storefront/b2b).
- ZERO modifications to existing tests outside my surface.
- ZERO modifications to `package.json` beyond the one exports entry (no new dependencies — zero-dependency helpers only).
- ZERO modifications to `.github/**`, `docs/development-state/**`.
- ZERO live provider connections (registered-never-connected posture unchanged).
- ZERO secrets/credential material in the browser graph (parity test asserts).
- ZERO production deploy, ZERO provider credentials, ZERO live commerce side effects.
- The token was NEVER committed or echoed. Pushed ONLY to `work/w3-018` (never `main`).
