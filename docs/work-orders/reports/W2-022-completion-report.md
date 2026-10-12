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
- The inventory digest set to `sha256:356ec58646abc037` (the W1-021 artifact's real value on main — copied verbatim from `packages/experience/reports/deployment/deployment-readiness.json`; content-based discipline: identical files → identical digest)
- The `generatedAt` timestamp set to `2026-10-12T13:41:45.317Z` (the W1-021 artifact's regeneration timestamp on main — copied verbatim from the committed artifact)

The existing sections (capabilities, config surface, standing gates, non-live note, kill switch, DEMO tag) are unchanged.

## 3. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **392 passed** (36 files) — baseline 386 + 6 net-new |
| Scoped tsc | `tsc --noEmit -p tsconfig.scoped.json` (from packages/web) | **EXIT 0** |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — exact baseline (after cleaning stray `packages/agent/test/*.js`/`*.d.ts` build artifacts left by a prior `tsc -b` run; my files produce zero warnings) |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |

## 4. HONEST GAPS

1. The earlier draft of this report claimed `lint 110w/3e` — that was an artifact of stray `packages/agent/test/*.js`/`*.d.ts` files emitted by a prior `tsc -b` run polluting the oxlint scan; after cleanup the lint baseline is `103w/0e` (exact), matching the TL's independent verification.
2. No browser lane evidence (sandbox has no browser); vitest coverage proves the rows render from the fixture.

## 5. BOUNDARIES HELD

- ZERO modifications to `packages/experience/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`.
- The kill switch `DEPLOYMENT_READINESS_SECTION_ENABLED`, the DEMO tag, the provenance note, and every existing row/behavior unchanged.
- ZERO runtime fs/network reads.
- Token never committed. Pushed only to `work/w2-022`.

## 6. TL FIX ROUND (CHANGES REQUESTED → re-delivered)

The TL review found one precise mirror-fidelity defect: the fixture's `bundle.inventorySummary.inventoryDigest` carried `sha256:087a65dee062d1ec` (a fabricated value matching no known artifact state), and `generatedAt` carried the stale W1-019 timestamp `2026-10-12T06:14:54.730Z`. The `dist` section already mirrored faithfully.

Fix applied (precise, additive, in-write-surface only):
- `inventoryDigest` set to `sha256:356ec58646abc037` — copied verbatim from `packages/experience/reports/deployment/deployment-readiness.json` (the committed artifact at W1-021's lineage `ed72c34`). The TL independently reproduced this value by running `node packages/experience/scripts/deployment-rehearsal.mjs --dist-manifest packages/experience/test/deployment/dist-manifest-fixture.txt` — content-based discipline: identical files → identical digest.
- `generatedAt` set to `2026-10-12T13:41:45.317Z` — copied verbatim from the committed artifact (the W1-021 regeneration timestamp).
- The fixture header comment updated to document the verbatim-copy provenance explicitly.
- The completion report's mirror-fidelity record updated to reflect the real values.
- No tests pinned the old digest literal (the two SystemSurface assertions reference `DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.inventoryDigest` directly, so they follow the fixture change automatically).

Battery re-run after the fix (this round): web 392/392 (36 files), scoped tsc EXIT 0 (`tsconfig.scoped.json`), lint 103w/0e (exact baseline), architecture 0/0/0.
