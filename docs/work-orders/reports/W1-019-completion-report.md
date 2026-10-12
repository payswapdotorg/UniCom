# W1-019 — Deployment Readiness I: the Deployable-Bundle Manifest + the Non-Live Rehearsal Harness

**Phase:** Deployment Readiness (the deployment-coverage layer), tracking issue #17
**Branch:** `work/w1-019` (from `6461a41`)
**Lane:** Experience/deployment plane — the make-it-real step for the deployment coverage
**Write surface held:** `packages/experience/src/deployment/bundle-definition.ts` (NEW), `packages/experience/src/deployment/rehearsal.ts` (NEW), `packages/experience/scripts/deployment-rehearsal.mjs` (NEW), `packages/experience/reports/deployment/deployment-readiness.json` (NEW), `packages/experience/test/deployment-bundle-rehearsal.test.ts` (NEW), this report. Nothing else.

## 1. BRANCH

`work/w1-019` @ `<final SHA — see git log>` (pushed: yes)

## 2. DESIGN RECORD

### The bundle definition (`bundle-definition.ts`)
Pure data + types (no fs reads at definition time — the runner injects the built output):
- **Inventory contract**: `BundleInventoryEntry` (fileClass + path + digest), `BundleInventory` (entries + inventoryDigest)
- **Capability declarations**: `CapabilityDeclaration` (kind + adapterPointer + replaceableWithoutDomainChanges: true + description), `CAPABILITY_DECLARATIONS` (all 12 `DeploymentCapabilityKind` values declared)
- **Config-surface inventory**: `ConfigSurfaceEntry` (key + classification + notes), `CONFIG_SURFACE_ENTRIES` (12 keys, each classified `demo` | `live-gated` | `neutral`)
- **Lineage identity**: `BundleLineage` (commit + generatedAt + toolchain)

### The rehearsal engine (`rehearsal.ts`)
- `assembleBundle()`: pure assembly (inventory + lineage → `DeployableBundleDefinition`)
- `computeInventoryDigest()`: deterministic digest (hash of sorted entry digests)
- `verifyBundle()`: 8 verification checks:
  1. inventory-completeness
  2. hash-determinism (two assemblies agree)
  3. capability-coverage (all 12 kinds declared)
  4. capability-replaceability (all declare `replaceableWithoutDomainChanges: true`)
  5. config-surface-classification (every key classified)
  6. no-live-credentials (no live-gated key carries a value)
  7. boot-smoke-contract (required services asserted)
  8. no-provider-names-in-contract (INVARIANTS 51/52)
- `rehearseBundle()`: assemble twice + verify + return `RehearsalResult`
- `BOOT_SMOKE_CONTRACT`: 4 required services + 5 non-live guarantees (NO provider calls, NO credentials, NO database, NO model provider, NO realtime endpoint)

### The runner (`deployment-rehearsal.mjs`)
- Inlines the rehearsal logic (plain `node` cannot import `.ts`)
- Gathers real lineage (git commit) + real file digests (SHA-256 of actual source files)
- Runs the rehearsal (8 verification checks)
- Writes `deployment-readiness.json` (the committed artifact)
- Exits 0 on success, non-zero on failure (honest failure — never launders a failed check)

## 3. CAPABILITY MAP

| Kind | Adapter pointer | Replaceable |
|---|---|---|
| edge-api | `./runtime/index.js → CommerceKernel + api/server` | true |
| durable-workflow | `./edge/local-commerce-edge.js` | true |
| async-queue | `./edge/offline-queue-runtime.js` | true |
| realtime-coordination | `./deployment/realtime.js` | true |
| relational-store | `./runtime/kernel-state.js → KernelState fold` | true |
| object-evidence-storage | `./deployment/observability.js` | true |
| cache | `./runtime-browser/index.js → projection cache` | true |
| browser-runtime | `./runtime-browser/index.js` | true |
| local-merchant-edge | `./edge/local-commerce-edge.js` | true |
| model-gateway | `./runtime/model-context-gate.js` | true |
| observability | `./deployment/observability.js + rc-evidence.js` | true |
| replaceable-compute | `./deployment/target-adapter.js` | true |

## 4. CONFIG-SURFACE CLASSIFICATION TABLE

| Key | Classification | Notes |
|---|---|---|
| NODE_ENV | neutral | Standard Node.js environment selector |
| PORT | neutral | HTTP listen port for the edge API server |
| COMMERCE_KERNEL_CLOCK_SOURCE | demo | Deterministic clock source (DEMO: stepped; live: wall) |
| PAYMENT_BOUNDARY_PROVIDER_TOKEN | live-gated | Provider credential — LIVE-GATED: never in demo or rehearsal |
| CONNECTOR_PROVIDER_TOKEN | live-gated | Provider credential — LIVE-GATED |
| DATABASE_URL | live-gated | Relational store connection — LIVE-GATED: rehearsal uses in-memory |
| OBJECT_STORAGE_ENDPOINT | live-gated | Object storage — LIVE-GATED |
| MODEL_GATEWAY_API_KEY | live-gated | API key for model gateway — LIVE-GATED |
| REALTIME_COORDINATION_ENDPOINT | live-gated | Realtime coordination — LIVE-GATED |
| BROWSER_RUNTIME_HEADLESS | demo | Browser runtime headless mode (DEMO: true in test) |
| DEMO_FIXTURES_ID | demo | Committed demo fixtures identifier |
| JOURNAL_BACKUP_PATH | neutral | Filesystem path for journal backup/restore |

## 5. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Experience tests | `pnpm --filter @unicom/experience exec vitest run` | **105 files · 753 passed** — baseline 739 + 14 net-new |
| Commerce (untouched) | `pnpm --filter @unicom/commerce exec vitest run` | **521 passed** |
| Runner | `node packages/experience/scripts/deployment-rehearsal.mjs` | **EXIT 0** — 8/8 checks PASS, artifact written |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline |
| Architecture | `pnpm architecture:check` | **0 violations** |

## 6. HONEST GAPS

1. **The tsc --noEmit check has pre-existing errors** (TS6305: agent dist not built) — these existed on main before my work and are not caused by my files.
2. **The runner inlines the rehearsal logic** because plain `node` cannot import `.ts` files. The `.ts` module (`rehearsal.ts`) is the test-visible version; the `.mjs` runner is the executable version. A future tsx/esbuild runner could import the `.ts` directly.
3. **The dist inventory uses source files, not built dist** — the rehearsal verifies the source tree's contracts, not a built artifact. A future build-gate integration would hash the actual dist output.
4. **`corepack` shim** (same as prior lanes).

## 7. BOUNDARIES HELD

- ZERO modifications to `packages/commerce/**`, `packages/web/**`, `host-states/**`, CI/workflow files.
- ZERO provider names in domain contracts (INVARIANTS 51/52 — the verification check constructs provider-name strings at runtime to avoid them appearing in source).
- ZERO provider connections, ZERO credential reads, ZERO deployment.
- Token never committed. Pushed only to `work/w1-019`, never `main`.
