# W3-023 — Deployment Integrity III: the Dist-Contract Completeness Fix

**Lane:** Deployment Integrity III (closing the REAL-CI-evidence finding)
**Branch:** `work/w3-023` @ final SHA (pushed: yes)
**Branched from:** `origin/main` (`1701f0c` — post-W2-022 merge)

## 1. BRANCH

`work/w3-023` @ final SHA (pushed: yes)

## 2. WHAT WAS BUILT

### The finding (closed)

The TL's TL_ACCEPT step ran the rehearsal against the REAL canonical-build CI manifest (run 38259561304, commit 29f037d, 6,204 files). The `dist-manifest-completeness` check failed honestly (exit 1): **172 unclassifiable files** — 168 `pdfjs/cmaps/*.bcmap`, 2 `*.wasm` (docx_wasm_bg, duke_sheets_wasm_bg), 1 `*.mp3` (task-notification-pop), 1 `THIRD-PARTY-NOTICES.md`. The honest-failure law held (the check named the files, exit non-zero, nothing laundered); the gap was the W1-021 contract's file-class list (5 classes, under-derived), not the worker's execution. This lane closes the gap.

### The four new DistFileClass values (additive — the existing 5 classes' semantics unchanged)

| New class | Extension(s) | The real CI evidence it covers |
|---|---|---|
| `wasm-module` | `.wasm` | `docx_wasm_bg-HWnIvdMf.wasm` + `duke_sheets_wasm_bg-BCCK9PkU.wasm` (2 files) |
| `audio-asset` | `.mp3`, `.wav`, `.ogg` | `task-notification-pop-qiQ1Ge3C.mp3` (1 file) |
| `data-asset` | `.bcmap`, `.dat`, `.bin` | `pdfjs/cmaps/*.bcmap` (168 files — one real line represents the class) |
| `text-asset` | `.md`, `.txt` | `THIRD-PARTY-NOTICES.md` (1 file) |

`SOURCE_TO_DIST_CLASS_MAP` is unchanged — the new classes are dist-only artifact classes; no source class maps to them additionally. They join the inventory as legitimate dist outputs.

### The fixture extensions

1. **`dist-manifest-fixture.txt`** extended from 10 → 14 lines (+4: one `.wasm`, one `.mp3`, one `.bcmap`, one `.md`). The 4 new lines use deterministic sha256 digests (generated from placeholder content) — they exercise the classifier, not mirror real artifacts. The existing 10 lines are unchanged.

2. **`real-dist-regression-fixture.txt`** (NEW) — a MINIMAL committed regression fixture distilled from the REAL manifest finding:
   - **5 real-evidence lines** — the 5 real unclassifiable paths with their REAL sha256 digests copied verbatim from the canonical build CI manifest (run 38259561304, commit 29f037d):
     - `THIRD-PARTY-NOTICES.md` → `4376c92862ab13f7b1bc8d0facc9622110caada8b1bd8612b3f707d00ea0c552`
     - `assets/docx_wasm_bg-HWnIvdMf.wasm` → `470d3bc418174d8c276c93ccf8b29622edceef13e0cb407d0797341d4fa86197`
     - `assets/duke_sheets_wasm_bg-BCCK9PkU.wasm` → `ab475856ab69ce1c29866d8961952578c488804bc4ca6bc13a6db13eb09e20de`
     - `assets/task-notification-pop-qiQ1Ge3C.mp3` → `bd95332236b7435be42002aed75335dbaac6e896a1650d16b8e2f49183d5cfce`
     - `pdfjs/cmaps/Adobe-Japan1-0.bcmap` → `464f08905236f5703b1f5cf8358767c8b18e6bcc808840d081f1de2c7ab38134` (represents the 168-file bcmap class)
   - **3 representative classifiable lines** — 2 verbatim from the same CI manifest (`index.html` + `CommerceHostApp-IroIIy6D.css`) + 1 representative `.js` line from the committed fixture (to satisfy the source→dist cross-check, which requires ≥1 js-entrypoint artifact so the contract-barrel/runtime-module/projection-module source classes map to a dist class). The `.js` line is the ONLY non-CI-verbatim line in the fixture; this is disclosed in the fixture's header comment.
   - The header comment records the full provenance: "paths + digests verbatim from the canonical build CI evidence (run 38259561304, commit 29f037d, extracted by the TL from dist-manifest-sha256.txt); the .bcmap line represents the 168-file class".

### The artifact (regenerated)

`deployment-readiness.json` regenerated via the runner with `--dist-manifest` on the regression fixture:
- `dist.mode`: `ci-evidence-manifest`
- `dist.digest`: `sha256:f62800d578e95ff5`
- `dist.fileCount`: 8
- `dist.provenance`: `{ source: "committed-fixture", lineage: "1701f0c3f5341af036f29f788e784b212312fa19" }`
- 11 verification checks, all PASS (8 source + 3 dist)

## 3. VERIFICATION (personally run, exact output numbers)

| Check | Command | Result |
|---|---|---|
| Experience tests | `pnpm --filter @unicom/experience exec vitest run` | **783 passed** (106 files) — baseline 772 + 11 net-new |
| Experience typecheck | `pnpm --filter @unicom/experience exec tsc --noEmit` | **EXIT 0** |
| Runner (source-only) | `node packages/experience/scripts/deployment-rehearsal.mjs` | **8/8 PASS, exit 0** |
| Runner (committed fixture) | `node packages/experience/scripts/deployment-rehearsal.mjs --dist-manifest packages/experience/test/deployment/dist-manifest-fixture.txt` | **11/11 PASS, exit 0, 14 dist files** |
| Runner (regression fixture) | `node packages/experience/scripts/deployment-rehearsal.mjs --dist-manifest packages/experience/test/deployment/real-dist-regression-fixture.txt` | **11/11 PASS, exit 0, 8 dist files, ZERO unclassifiable** |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — exact baseline, 0 new warnings |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |

## 4. HONEST GAPS

1. **The regression fixture's `.js` line is NOT a real CI digest.** The regression fixture carries 5 real-evidence lines (the 4 new-class paths + the bcmap representative) with their REAL sha256 digests verbatim from the CI manifest, plus 2 real classifiable lines (index.html + CommerceHostApp CSS, also verbatim). The 8th line (`index-Dy7vK8jN.js`) is a representative classifiable line from the committed fixture (NOT a real CI digest) — it exists to satisfy the source→dist cross-check, which requires ≥1 js-entrypoint artifact so the contract-barrel/runtime-module/projection-module source classes map to a dist class. This is the only non-CI-verbatim line in the fixture; it is disclosed in the fixture's header comment and in this report. The TL can replace it with a real `.js` digest from the full CI manifest post-merge (the TL-owned evidence step).

2. **The committed fixture's 4 new lines use deterministic digests** (generated from placeholder content), NOT real CI digests. The committed fixture's purpose is to exercise the classifier across all 9 classes; the real-dist regression fixture carries the REAL digests. This mirrors the W1-021 committed-fixture discipline (synthetic digests for classification coverage; real digests in the regression fixture for real-world fidelity).

3. **The full 6,204-file CI manifest is NOT committed.** The regression fixture is a minimal 8-line distillation. The TL will re-run the rehearsal with the FULL real CI manifest post-merge (the TL-owned evidence step) and commit the real-dist artifact. The `.bcmap` class (168 files) is represented by one real line.

4. **No engine logic changes.** `rehearsal.ts` was not modified — the engine already handles arbitrary classes via `classifyDistFile`. No type-level adjustment was needed (the `DistFileClass` union is extended additively; the engine consumes it via the same function).

## 5. BOUNDARIES HELD

- **Write surface (exactly the ordered files, no others):**
  - `packages/experience/src/deployment/bundle-definition.ts` — the 4 new `DistFileClass` values + `classifyDistFile` extended (additive)
  - `packages/experience/scripts/deployment-rehearsal.mjs` — the inlined `classifyDistFile` mirrors the same extensions
  - `packages/experience/test/deployment/dist-manifest-fixture.txt` — extended 10 → 14 lines
  - `packages/experience/test/deployment/real-dist-regression-fixture.txt` — NEW (8 lines + header comment)
  - `packages/experience/test/deployment-dist-hash.test.ts` — extended (new-class tests + regression fixture tests)
  - `packages/experience/reports/deployment/deployment-readiness.json` — regenerated via the runner
  - `docs/work-orders/reports/W3-023-completion-report.md` — this report
- **NEVER built the dist locally** (the memory law holds).
- **NEVER touched** `packages/web/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`, `rehearsal.ts` (no engine changes).
- **The existing 5 classes' semantics unchanged** — additive only. `SOURCE_TO_DIST_CLASS_MAP` unchanged.
- **The existing behaviors unchanged** — honest failure preserved (any unclassifiable file still fails the completeness check by name; `.xyz` and extensionless `README` return null).
- **No provider names in domain contracts.** No new dependencies. Token never committed. Pushed only to `work/w3-023`.
