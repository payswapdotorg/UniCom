# W1-025 — Verification Hardening I: closing the three W1-021 runner deviations

**Lane:** Verification Hardening (the program's recorded-debt closure), tracking issue #19
**Branch:** `work/w1-025` @ final SHA (pushed: yes)
**Branched from:** `origin/main` (`821c097`)

## 1. BRANCH

`work/w1-025` @ final SHA (pushed: yes)

## 2. THE DEVIATION-CLOSURE TABLE

| # | Deviation (W1-021 record) | The fix | The test that proves it |
|---|---|---|---|
| 1 | The runner's manifest-mode determinism check re-hashes the same in-memory array (tautological — the honest two-assembly proof lived only in the .ts engine + tests) | The runner's `assembleManifest()` is called TWICE on the manifest text (two independent parses); the second digest is computed from the second parse's entries, not from the same array. The check's detail now says "matches across two independent assemblies". | `W1-025 deviation #1 — the two-parse determinism`: "two independent assemblies of the same manifest text produce the identical digest" + "the dist digest is stable across multiple independent assemblies (not tautological)" (5 iterations, 1 unique digest). |
| 2 | Unparseable manifest lines (not matching the sha256sum format) are silently dropped (the completeness check flags unclassifiable-PARSED files only) | `assembleManifest()` now collects unparseable lines in an `unparseable[]` array (never `continue`d silently). The completeness check's failure surface = `unclassifiable ∪ unparseable` (the detail names both classes separately). This folds INTO the existing `dist-manifest-completeness` check — NO new check (the artifact stays at 11). The engine's `assembleFromDistManifest()` gains `unparseable: string[]` additively; `verifyDist()` gains optional `unclassifiable`/`unparseable` params. | `W1-025 deviation #2 — the parse integrity`: "returns unparseable lines (never silently dropped)" + "FAILs completeness when unparseable lines are present (the detail names them)" + "FAILs when BOTH unparseable and unclassifiable are present (the detail names both)" + "the committed fixture has ZERO unparseable" + "the regression fixture has ZERO unparseable (comments removed in W1-025)". |
| 3 | The dist-root mode hardcodes its completeness PASS and silently omits unclassifiable files (untested — no dist dir in the sandbox) | The runner's `walkDistRoot()` now classifies EVERY file and collects unclassifiable (the `if (fileClass)` branch gains an `else` that pushes to `unclassifiable`). The completeness check is computed from the walk result (never a hardcoded `"PASS"`). The digest determinism is verified by two independent walks (`walkDistRoot()` called twice). | `W1-025 deviation #3 — the honest dist-root walk`: "classifies every file and collects unclassifiable" + "two independent walks produce the identical digest (determinism)" + "with zero unclassifiable passes completeness" + "with unclassifiable FAILs completeness naming the file". Plus the committed dist-dir fixtures: `dist-dir-clean-fixture/` (5 classifiable files, exit 0) + `dist-dir-fixture/` (5 classifiable + 1 `.xyz`, exit 1 naming `assets/unknown.xyz`). |

### The engine extension (additive — the existing test-proven semantics unchanged)

- `assembleFromDistManifest()` — the return record gains `unparseable: string[]` (additive; existing callers that destructure `{ inventory, unclassifiable }` still work).
- `assembleFromDistRoot(files)` — NEW: the pure testable core of the dist-root walk (takes a file-list; the runner's .mjs does the actual fs walk with the same discipline). Returns `{ inventory, unclassifiable }`.
- `verifyDist()` — gains optional `unclassifiable: string[] = []` and `unparseable: string[] = []` params. The completeness check folds `unclassifiable ∪ unparseable` into its failure surface. Still exactly 3 dist checks (no new check — the schema stays at 11).

### The committed dist-dir fixtures (NEW)

- `packages/experience/test/deployment/dist-dir-clean-fixture/` — a tiny fake dist directory: 5 classifiable files (`index.html`, `assets/app-abc.js`, `assets/app-def.css`, `assets/app-abc.js.map`, `assets/logo.svg`). The success path (exit 0, 10/10).
- `packages/experience/test/deployment/dist-dir-fixture/` — the same 5 files + 1 deliberately unclassifiable (`assets/unknown.xyz`). The failure path (exit 1, naming `assets/unknown.xyz`).
- `packages/experience/test/deployment/real-dist-regression-fixture.provenance.md` — the regression fixture's provenance documentation (moved from the fixture's `#` comment lines, which were removed because W1-025 closed deviation #2: unparseable lines are now counted, not silently dropped).

## 3. VERIFICATION (personally run, exact output numbers)

| Check | Command | Result |
|---|---|---|
| Experience tests | `pnpm --filter @unicom/experience exec vitest run` | **798 passed** (106 files) — baseline 783 + 15 net-new |
| Experience typecheck | `pnpm --filter @unicom/experience exec tsc --noEmit` | **EXIT 0** |
| Runner (source-only) | `node .../deployment-rehearsal.mjs` | **8/8 PASS, exit 0** |
| Runner (committed fixture) | `--dist-manifest dist-manifest-fixture.txt` | **11/11 PASS, exit 0, 14 files** |
| Runner (regression fixture) | `--dist-manifest real-dist-regression-fixture.txt` | **11/11 PASS, exit 0, 8 files** |
| Runner (clean dist-dir) | `--dist-root dist-dir-clean-fixture` | **10/10 PASS, exit 0, 5 files** (8 source + 2 dist checks; dist-root mode has no source-dist cross-check — the existing W1-021 behavior) |
| Runner (dist-dir + unclassifiable) | `--dist-root dist-dir-fixture` | **9/10 PASS, 1 FAIL, exit 1** — `dist-manifest-completeness: unclassifiable: assets/unknown.xyz` |
| Runner (corrupt manifest) | `--dist-manifest /tmp/corrupt.txt` | **9/11 PASS, 2 FAIL, exit 1** — `dist-manifest-completeness: unparseable: this is a corrupt line` |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — exact baseline, 0 new warnings |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |
| Artifact diff | `git diff --stat origin/main -- .../deployment-readiness.json` | **NO CHANGES** (the artifact was NOT regenerated — see honest gap #1) |

## 4. HONEST GAPS

1. **The artifact was NOT regenerated.** The work order says "regenerate the artifact — byte-identical except generatedAt." This is impossible for two honest reasons: (a) the committed artifact carries the REAL CI evidence (6,204 files, `ci-evidence` provenance) from the TL's evidence commit (210b8b9) — the full 6,204-file CI manifest is NOT committed in the repo (the TL-owned evidence step), so I cannot reproduce the same dist section; (b) I modified `rehearsal.ts` (which is in the source inventory as a `deployment-contract` entry), so the `inventoryDigest` would change from `sha256:3a8de191d6972b87` to `sha256:18a52157007574ed` if I regenerated — violating "ONLY generatedAt changes." The honest choice: leave the committed artifact unmodified. The `git diff --stat` shows NO changes to the artifact file — trivially satisfying "ONLY generatedAt changes" (there are zero changes). The schema stays at 11 checks (the parse integrity folds INTO `dist-manifest-completeness`, no new check). The TL can regenerate the artifact post-merge with the full CI manifest.

2. **The regression fixture's `#` comment lines were removed.** The W3-023 regression fixture used `#` comments as provenance documentation — those lines are unparseable (not valid sha256sum format). W1-025 closed deviation #2 (unparseable lines are now counted, not silently dropped), so the comments would cause a completeness FAIL. The fix: moved the provenance to `real-dist-regression-fixture.provenance.md` (a companion file). The fixture is now a pure sha256sum-format file (8 manifest lines, no comments). The existing W3-023 tests that filter `#` lines still pass (the filter is now a no-op). The regression fixture's dist digest changed (from `sha256:f62800d578e95ff5` to `sha256:972428393422901b`) because the comment lines are no longer in the file — but this is the honest, correct behavior (the old digest included silently-dropped unparseable lines in the file but not in the hash; the new digest is from the 8 real lines only).

3. **The dist-root mode has 10 checks (not 11).** The dist-root mode produces 8 source checks + 2 dist checks (completeness + determinism) — it does NOT include the source-dist cross-check (the existing W1-021 behavior; the cross-check is manifest-mode only). This is unchanged by my work — I did not add or remove any check. The work order's acceptance says "exit 0 with the honest walk" — 10/10 PASS satisfies this.

4. **No `bundle-definition.ts` changes.** The work surface mentioned `bundle-definition.ts` "only if a type-level adjustment is required" — none was required. The `DistFileClass` union is unchanged (the W3-023 classes are already there); `classifyDistFile` is unchanged; `SOURCE_TO_DIST_CLASS_MAP` is unchanged.

## 5. BOUNDARIES HELD

- **Write surface (exactly the ordered files, no others):**
  - `packages/experience/src/deployment/rehearsal.ts` — additive extension (assembleFromDistManifest gains `unparseable`; assembleFromDistRoot NEW; verifyDist gains optional params)
  - `packages/experience/scripts/deployment-rehearsal.mjs` — the three deviation fixes (two-parse determinism, unparseable counting, honest dist-root walk)
  - `packages/experience/test/deployment-dist-hash.test.ts` — 15 net-new tests
  - `packages/experience/test/deployment/real-dist-regression-fixture.txt` — comments removed (W1-025 deviation #2)
  - `packages/experience/test/deployment/real-dist-regression-fixture.provenance.md` — NEW (provenance moved here)
  - `packages/experience/test/deployment/dist-dir-clean-fixture/` — NEW (5 classifiable files)
  - `packages/experience/test/deployment/dist-dir-fixture/` — NEW (5 classifiable + 1 unclassifiable)
  - `docs/work-orders/reports/W1-025-completion-report.md` — this report
- **The artifact (`deployment-readiness.json`) is UNCHANGED** — not regenerated (honest gap #1). The schema stays at 11 checks (the parse integrity folds INTO `dist-manifest-completeness`).
- **NEVER touched** `packages/web/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`, `bundle-definition.ts` (no type-level adjustment needed).
- **NEVER built the dist locally** (the memory law holds).
- **The engine's existing test-proven semantics unchanged** — additive only. The 30 existing tests in `deployment-dist-hash.test.ts` still pass (the `assembleFromDistManifest` return-shape extension is additive; `verifyDist`'s new params are optional with defaults).
- **No 12th verification check** — the parse integrity folds INTO `dist-manifest-completeness`. Still exactly 11 checks in the artifact.
- **No provider names.** No new dependencies. Token never committed. Pushed only to `work/w1-025`.
