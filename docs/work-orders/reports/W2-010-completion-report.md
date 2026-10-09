# W2-010 Completion Report — GUI-Visible Resilience, Authority and Recourse Journeys

Worker: TL-executed local-chain recovery (disclosed below)
Branch: `work/w2-010` (base `eb1ceca`)
Date: 2026-10-09
Work order: `docs/work-orders/W2-010.md` · Handoff: `docs/FINAL-TL-HANDOFF-POST-V3-REAL-WORLD-VALIDATION-2026-10-09.md`

## 0. Execution-vehicle disclosure (honesty standard)

This work order was dispatched to a local subagent worker (dispatch 24-b)
which lost its backend connection mid-flight after authoring the matrix, the
oracle, the fault adapters and the f01-f07 test files (all untracked). A
continuation dispatch (24-b2) failed on the same infrastructure drought (Task
tool: "context deadline exceeded" ×4 across the program). Per the banked
V3-era recovery doctrine (the W3-011 precedent — also used for W1-010 this
phase), the TL executed the completion on the worker lane:

- **Inherited from the predecessor subagent (verified, then kept, defects
  corrected + disclosed):** the fault matrix v1 (11 families / 63 scenarios /
  21 expected-success + 42 expected-block / 7 invariants — `resilience-matrix.v1.json`
  + `.md`), `matrix/oracle.ts`, the adapters (`fault-connector-adapter.ts`,
  `fault-payment-boundary.ts`, `resilience-rig.ts`) and the f01-f07 test
  files. One inherited defect found and corrected: the F07-S01 draft expected
  `low-stock` for an on-hand of 6 while asserting the in-stock branch's note —
  internally inconsistent; corrected to the band-faithful `in-stock` (see
  FAILURE-REGISTER finding 1).
- **Executed by the TL:** the F08-F11 test files (21 scenarios), the
  machine-readable results, the failure register, the remediation proposals,
  this completion report, the battery, the commits/push.

## 1. What was delivered

1. **Versioned fault/scenario matrix + oracle:** 11 families covering every
   WO-listed scenario family, 63 scenarios each with a stable ID, initial
   conditions, injected fault, expected transitions, expected visible state,
   permitted/blocked actions, recovery path, evidence requirements, terminal
   state and expected-result class. Machine-readable (JSON) + human-readable
   (MD).
2. **Safe fault-injection adapters (isolated test surface):** the
   FaultInjectingConnectorAdapter (connector faults enter ONLY through the
   adapter contract behind the REAL ConnectorRuntime), the
   FaultInjectingPaymentBoundary (payment faults behind the REAL kernel's only
   payment seam) and the resilience rig (composition helper + the typed
   view-contract projections that define the GUI-visible dimension).
3. **UI-level tests for all 11 families** (f01-f11, 63 tests): driving the
   REAL CommerceKernel, REAL GroupBuyFormationEngine, REAL journey dispatch,
   REAL offline queue + weighted runtimes, REAL sanitizer and REAL policy
   engine — asserting the VISIBLE dimension (typed refusal reasons, view
   states, decision fields, run presentations, journaled records), both the
   allowed path and the deny/recovery path per family.
4. **Machine-readable results:** `resilience-results.v1.json` — every scenario
   labelled `fixture-contract`, denominator reconciled with zero drift
   (63 = 63 + 0 + 0), all 7 invariant verdicts recorded with their proofs.
5. **Failure register + remediation proposals:** 0 failures; 5 disclosed
   findings (the F07-S01 draft correction, the structural browser-gap, three
   product-behavior confirmations for the rendered-UI program) and 4
   severity-ranked proposals (P1 is the operator-owned rendered-UI decision).

## 2. Actual commands and outputs

| Command | Result |
|---|---|
| `corepack pnpm --filter @unicom/experience exec vitest run test/resilience/` | 11 files, **63/63 passed** |
| `corepack pnpm --filter @unicom/experience test` | full suite **689/689 passed** (main baseline 626 + 63 additive; zero regressions; the V3 sim pilot-summary throughput block restored to base after the run — see §5) |
| `corepack pnpm exec oxlint` | 0 errors (99 warnings — the pre-existing main baseline) |
| `corepack pnpm exec tsc -b packages/experience` | exit 2 with 40 errors — **differentially identical to the pristine base worktree** (all 40 in `packages/agent/test/runtime/*`: unbuilt workspace dist resolution; environmental at base `eb1ceca`; zero new errors from this lane) |
| `node scripts/architecture/architecture-check.mjs check` | **0 violations** (baseline 0, new 0) |

## 3. Scenario counts and reconciliation (per family)

| Family | Scope | Planned | Executed | Pass | Fail | Blocked | UNKNOWN |
|---|---|---:|---:|---:|---:|---:|---:|
| F01 | connector response integrity (stale/slow/unavailable/contradictory) | 6 | 6 | 6 | 0 | 0 | 0 |
| F02 | session interruption / network loss / retry | 5 | 5 | 5 | 0 | 0 | 0 |
| F03 | duplicate submit / idempotency / settlement UNKNOWN | 5 | 5 | 5 | 0 | 0 | 0 |
| F04 | approvals / authority (missing/denied/expired/revoked) | 7 | 7 | 7 | 0 | 0 | 0 |
| F05 | GroupBuy dropout / threshold / counter / expiry / cancel | 7 | 7 | 7 | 0 | 0 | 0 |
| F06 | multi-hop TradeCycle per-leg consent / refusal / recourse | 6 | 6 | 6 | 0 | 0 | 0 |
| F07 | inventory / receiving / reconciliation conflicts | 6 | 6 | 6 | 0 | 0 | 0 |
| F08 | rental / deposit / late return / damage dispute | 6 | 6 | 6 | 0 | 0 | 0 |
| F09 | fraud / counterfeit / false claims / refund abuse / scope compromise | 6 | 6 | 6 | 0 | 0 | 0 |
| F10 | no-RFID supermarket: offline queue / weighted / reconciliation | 4 | 4 | 4 | 0 | 0 | 0 |
| F11 | autonomous-store guardrails / refund band / Commerce Twin | 5 | 5 | 5 | 0 | 0 | 0 |
| **Total** | | **63** | **63** | **63** | **0** | **0** | **0** |

Zero drift; all categories visible; nothing dropped.

## 4. Invariant verdicts (all pass)

UNKNOWN_NEVER_FAILURE · UNKNOWN_NEVER_SUCCESS · NO_PENDING_AS_SETTLED ·
NO_SIDE_EFFECT_WITHOUT_AUTHORITY · TRADECYCLE_LEG_REQUIRES_OWN_CONSENT ·
PREDICTIONS_NEVER_MUTATE_CANONICAL_TRUTH · REPEATED_SUBMISSION_NO_DUPLICATE_EFFECT
— proofs mapped per verdict in `resilience-results.v1.json`.

## 5. Deviations

1. **Continuation/TL-execution** (disclosed in §0): the vehicle drought
   recovery doctrine applied, as for W1-010.
2. **F07-S01 draft-expectation correction** (inherited defect): corrected the
   test to the band-faithful expectation; the product, the band definition and
   the frozen oracle were untouched (FAILURE-REGISTER finding 1).
3. **Fixture-labelled honesty:** every result is `fixture-contract` evidence —
   real runtimes driven through typed view contracts, NOT real-browser
   evidence. The browser-labelled dimension is structurally unavailable (the
   W1-010 pilot's finding: the commerce surfaces have no rendered UI); the
   results caveat states this on every record.
4. **V3 artifact hygiene:** the full-suite run regenerates
   `packages/experience/reports/sim/pilot-summary.json`'s timing-dependent
   throughput block; it was restored to the base bytes before committing (the
   V3-artifact immutability law).

## 6. Next frontier

1. **Browser-labelled reruns** once a rendered commerce UI exists (P1 in
   REMEDIATION-PROPOSALS.md — the operator's product-scope decision): re-run
   the 63-scenario matrix through W1-010's browser runner + evidence format
   (already compatible).
2. **The rendered-UI state vocabulary** (P2): preserved non-failure states,
   the global halt banner and the supersede marker must render distinctly.
3. The matrix is extensible (additive-only): new fault families append without
   disturbing the frozen 63.
