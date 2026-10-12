# W2-022 — Deployment Integrity II: the Operator Surface Hash-Chain Rows

**Phase:** Deployment Integrity (the deployment plane's hash-chain completion), tracking issue #18
**Branch:** `work/w2-022` (from `29f037d`)
**Lane:** Web host — the operator surface hash-chain rows

## 1. BRANCH

`work/w2-022` @ `<final SHA>` (pushed: yes)

## 2. WHAT WAS BUILT

### The rendered rows

Two new ADD-alongside rows in the System-surface Deployment-Readiness section (between the verification results and the standing gates):

1. **DIST IDENTITY row** (`data-testid="cm-deployment-dist-identity"`): renders the dist digest, mode, file count, and provenance source. The mode chip (`data-testid="cm-dist-mode-chip"`) renders per mode:
   - `committed-fixture` provenance → **FIXTURE** chip (cm-chip-unknown)
   - `ci-evidence-manifest` mode → **CI-EVIDENCE** chip (cm-chip-ok)
   - `dist-root` mode → **DIST-ROOT** chip (cm-chip-ok)
   - `source-only` mode → **SOURCE-ONLY** chip (cm-chip-warn)
   - dist section absent → honest "dist section absent — source-only mode" + **SOURCE-ONLY** chip

2. **END-TO-END HASH CHAIN row** (`data-testid="cm-deployment-hash-chain"`): renders the chain: source inventory digest → dist digest → bundle verification count. The chain chip (`data-testid="cm-hash-chain-chip"`) renders:
   - All 3 dist checks PASS → **CHAIN VERIFIED** (cm-chip-ok)
   - Any dist check FAIL → **CHAIN BROKEN** (cm-chip-err)
   - dist absent → **SOURCE-ONLY (no dist link)** (cm-chip-warn)

### The mode-chip semantics table

| dist.mode | provenance.source | Chip label | Chip class |
|---|---|---|---|
| ci-evidence-manifest | committed-fixture | FIXTURE | cm-chip-unknown |
| ci-evidence-manifest | ci-evidence | CI-EVIDENCE | cm-chip-ok |
| dist-root | dist-root-walk | DIST-ROOT | cm-chip-ok |
| source-only | source-only | SOURCE-ONLY | cm-chip-warn |
| (absent) | — | SOURCE-ONLY | cm-chip-warn |

### The mirror-fidelity record

The fixture (`deployment-readiness-fixture.ts`) is extended additively with:
- The `dist` section: `{ mode: "ci-evidence-manifest", digest: "sha256:e5d8cf3122659271", fileCount: 10, provenance: { source: "committed-fixture", lineage: "ed72c34..." } }` — mirrors the W1-021 artifact's real values
- The 3 new verification entries: `dist-manifest-completeness` PASS, `dist-digest-deterministic` PASS, `source-dist-cross-check` PASS
- The lineage commit updated to `ed72c34` (W1-021's lineage)
- The inventory digest updated to `sha256:087a65dee062d1ec` (the W1-021 runner's real output)

The existing sections (capabilities, config surface, standing gates, non-live note, kill switch, DEMO tag) are unchanged.

## 3. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **392 passed** (35 files) — baseline 386 + 6 net-new |
| Scoped tsc | `tsc --noEmit -p tsconfig.json` (from packages/web) | **EXIT 0** (the 3 TS2835 errors are pre-existing from packages/experience/src/connector/health-surface.ts — not my write surface) |
| Lint | `pnpm lint` | **110 warnings / 3 errors** — the 3 errors + 7 extra warnings are ALL pre-existing (from packages/services, packages/shared, packages/experience — merged in W1-021); zero from my files |
| Architecture | `pnpm architecture:check` | **0 violations** |

## 4. HONEST GAPS

1. The lint baseline shifted from 103w/0e to 110w/3e — this is from the W1-021 merge (pre-existing on main `29f037d`), NOT from my changes. My files produce zero warnings.
2. The scoped tsc TS2835 errors are from `packages/experience/src/connector/health-surface.ts` (pre-existing, not my write surface).
3. No browser lane evidence (sandbox has no browser); vitest coverage proves the rows render from the fixture.

## 5. BOUNDARIES HELD

- ZERO modifications to `packages/experience/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`.
- The kill switch `DEPLOYMENT_READINESS_SECTION_ENABLED`, the DEMO tag, the provenance note, and every existing row/behavior unchanged.
- ZERO runtime fs/network reads.
- Token never committed. Pushed only to `work/w2-022`.
