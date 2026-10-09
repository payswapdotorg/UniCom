# W1-010 Completion Report — Rendered-Browser Commerce Journey Validation (Gates 0 + 1)

Worker: TL-executed local-chain recovery (disclosed below)
Branch: `work/w1-010` (base `eb1ceca`)
Date: 2026-10-09
Work order: `docs/work-orders/W1-010.md` · Handoff: `docs/FINAL-TL-HANDOFF-POST-V3-REAL-WORLD-VALIDATION-2026-10-09.md`

## 0. Execution-vehicle disclosure (honesty standard)

This work order was dispatched to a local subagent worker (dispatch 24-a) which lost its
backend connection mid-flight after capturing probe evidence and drafting the runner
(untracked). Two continuation dispatches (24-a2) failed on the same infrastructure drought
(Task tool: "context deadline exceeded" ×3). Per the banked V3-era recovery doctrine (the
W3-011 precedent), the TL executed the completion itself on the worker lane:

- **Inherited from the predecessor subagent (verified, then kept):** the probe evidence
  (`.tmp-w1010/` — root/share DOM snapshots, commerce-marker scans, screenshots), the
  runner module set (`browser-pilot-lib.mjs`, `browser-pilot-env.mjs`,
  `browser-pilot-capture.mjs`, `browser-pilot-manifest.mjs`, `run-browser-pilot.mjs`) and
  the three vitest files. The TL verified the evidence by RE-RUNNING the full pilot from
  scratch (fresh env boot, fresh chromium, fresh capture) before accepting it.
- **Executed by the TL:** the verified pilot run (run ID
  `w1-010-browser-pilot-2026-10-09T170138167Z`), the evidence bundle placement, the pilot
  report, this completion report, the battery, the commits/push.

## 1. What was delivered

1. **Real-browser pilot (G0+G1):** a genuine headless chromium 153.0.8010.12
   (Playwright 1.63.0) run against the reachable web shell (Hono :3030 + Vite :5173,
   started/torn down by the runner). Evidence: 13 artifacts — screenshots, console logs,
   body captures, OAuth target inventory — under
   `docs/simulations/post-v3/w1-010/evidence/`.
2. **First-discovery walk over the 19-family journey registry** from the ordinary landing
   surface, GUI-only (no deep links, no API/DB shortcuts, `guiOnlyProof.violations = []`):
   **all 19 families × 3 firm profiles = 57 attempts, ALL ABSENT** — the rendered shell is
   the ZCode agent connect wall (three auth buttons, zero commerce markers in the DOM).
   Denominator reconciles with zero drift: `57 = 57 + 0 + 0`, `pass=0 fail=0 blocked=0
   absent=57 unknown=0`.
3. **Machine-readable manifest:** `docs/simulations/post-v3/w1-010/pilot-manifest.json` —
   schema v1 + additive browser extension v1 (extends
   `docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md`); environment identity, navigation
   graphs per family, attempted-sign scans, environment blocks, evidence-integrity check
   (13/13 pointers resolve).
4. **Human-readable pilot report:** `docs/simulations/post-v3/w1-010/PILOT-REPORT.md` —
   environment identity, what rendered vs not, the 19-family table, S/M/L context,
   severity-ranked findings, the exact missing prerequisite, the real-browser vs
   fixture-only ledger.
5. **Runner + tests (isolated test surface):** `packages/experience/test/browser/` —
   standalone Node ESM runner (env boot/teardown with process-group kill, heap-capped Vite,
   playwright resolution with fallbacks, credential/PII scrubbing) + 39 vitest tests
   (lib/manifest/cli) that validate the runner logic and manifest structure WITHOUT
   launching a browser.

## 2. Actual commands and outputs

| Command | Result |
|---|---|
| `corepack pnpm --filter @unicom/experience exec vitest run test/browser/` | 3 files, **39/39 passed** |
| `node packages/experience/test/browser/run-browser-pilot.mjs --dry-run` | plan: 19 families, S/M/L, external mode |
| `node packages/experience/test/browser/run-browser-pilot.mjs --start-env --out docs/simulations/post-v3/w1-010/evidence --manifest docs/simulations/post-v3/w1-010/pilot-manifest.json` | env booted (server-up=true web-up=true), chromium launched, 7 surfaces walked, manifest valid=true, 13 pointers, missing=0, **denominator 57=57+0+0 zero drift** |
| `corepack pnpm --filter @unicom/experience test` | **665/665 passed** (baseline 626 + 39 additive) — see §3 |
| `corepack pnpm exec oxlint` | 0 errors (warnings within the pre-existing baseline) |
| `corepack pnpm exec tsc -b packages/experience` | exit 2 with 40 errors — **differentially identical to the pristine base worktree** (all 40 in `packages/agent/test/runtime/*`: `@zcode/contracts` / `@unicom/agent-kernel` module resolution — the deps-dist-not-built condition of fresh worktrees; environmental, pre-existing at base `eb1ceca`, zero new errors from this lane) |
| `node scripts/architecture/architecture-check.mjs check` | **0 violations** (baseline 0, new 0) |

## 3. Battery summary

- Experience package: **665/665** (main baseline 626 + 39 new browser-module tests; zero
  regressions).
- Lint: 0 errors (99 warnings — the pre-existing main baseline). Architecture check:
  0 violations. Typecheck: 40 pre-existing environmental errors in agent test support
  (module resolution of unbuilt workspace dists) — differentially identical to the pristine
  base; zero new errors from this lane (differential proof: identical error sets on base
  `eb1ceca` with no lane changes).
- The commerce/agent suites are untouched by this lane (no source changes outside the
  browser test surface + docs); the TL acceptance battery on the merged lineage re-runs
  them (see the state dispatch_log / acceptance record).

## 4. Scenario counts and reconciliation

- Planned attempts: 57 (19 families × 3 firm profiles). Executed: 57. Blocked: 0
  (attempt-level; the desktop app is a SURFACE-level environment block, recorded separately
  in `environmentBlocks` with its verification). Skipped: 0. Zero drift.
- Outcome distribution: absent=57 (100%), pass=0, fail=0, unknown=0.
- Every outcome category remains visible in the manifest; no hidden denominator changes.

## 5. Deviations

1. **Continuation/TL-execution** (disclosed in §0): the original subagent vehicle failed on
   infrastructure; the TL completed the WO on the worker lane per the banked recovery
   doctrine, re-verifying all inherited evidence by re-running the pilot from scratch.
2. **The pilot is an absence proof, not a pass proof:** the WO's acceptance criterion
   "evidence covers applicable core commerce journeys" is met as EVIDENCE OF ABSENCE — the
   rendered commerce UI does not exist (the WO's own law: "A feature reachable only by deep
   link or not visible to the user is ABSENT for that journey"). The finding, its severity
   ranking and the exact missing prerequisite are in the pilot report §4–§5.
3. **Authenticated interiors untested:** the web shell behind OAuth/API-key requires
   operator-owned account provisioning — disclosed as environment/authority-blocked rather
   than bypassed (no credentials were invented or fabricated).
4. Scratch cleanup: the predecessor's `.tmp-w1010/` probe directory was salvaged (the
   evidentiary captures re-taken by the verified re-run) and removed before commit.

## 6. Next frontier

1. **Operator decision (product scope):** authorize (or decline) building the rendered
   host UI for the experience-plane surfaces — the exact prerequisite documented in the
   pilot report §5. Until it exists, G3 "expanded suite" browser validation of commerce
   journeys has nothing to expand onto; the honest state is absent-at-scale.
2. **W2-010 lane:** its fault matrix + fixture-labelled runs can proceed unchanged; its
   browser-labeled runs share this runner's evidence format when a rendered commerce UI
   exists.
3. **If the operator provisions a staging environment or desktop build**, the runner's
   `--base-url` mode applies to it unchanged (no code changes needed).
4. Optional: authenticated web-shell interior validation once accounts are provisioned
   (operator-owned).
