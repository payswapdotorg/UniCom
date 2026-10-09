# W3-013 Completion Report

Status: **COMPLETE** (TL-executed under the local-chain doctrine — the fourth consecutive vehicle stall; the pattern is recorded in the dispatch log)
Branch: `work/w3-013` (base 3e3fec6)
Owner: worker-3 lane (phase cycles.held_out_final — Wave D)

## 1. VERDICT

**COMPLETE — THE CEILING HOLDS ON THE HELD-OUT SEEDS.** The Wave D run
executed all 3,900 holdout-namespace projects (196,800 journeys, drift 0,
zero failures/blocks/absents) and the four adoption outputs are IDENTICAL
to the amended-2 baseline (15,275/15,275 on every axis) — the measurement
generalizes: the product measures at the adoption ceiling on unseen seeds
under the fixture-level simulation.

## 2. What ran

- **Freeze**: code 6a9d225 (work/w3-013), frozen contract w2-009:v1
  (byte-identical throughout), baseline measurement = amended-2 @ 3fcd39b
  (fingerprint e485b624), deployment scope recorded separately (local-dev
  fixture, isolated from production).
- **The §7 mirror**: the holdout schedule contains ONLY W1-009-H-*
  projects (zero baseline ids — test-pinned); the campaign machinery is
  identical (per-role execution, real roles, the W2→W1 mapping,
  reconciliation laws, evidence law).
- **The campaign**: 3,900/3,900 projects, 196,800/196,800 journeys,
  drift 0; outcomes pass=196,800 fail=0 blocked=0 absent=0 unknown=0;
  determinism fingerprint d55d92c2 (bound to 6a9d225).
- **The final report**: docs/simulations/results/final/final-report.json +
  FINAL-REPORT.md — the freeze record, the campaign, the four outputs
  (each 15,275/15,275 with the synthetic-estimate qualifier), the
  baseline-vs-holdout comparison (holds: YES on all four), the 10-item
  release-gate checklist (all PASS with evidence pointers), and the
  3-item caveat register.

## 3. The release-gate checklist (all PASS)

| gate | evidence |
|---|---|
| GUI-only law | GuiOnlyProof violations: [] on every record |
| 100% discoverability | zero-orphan 132/132 (W3-010/W3-012 tests) |
| Zero critical violations | fail=0 blocked=0 across baseline+holdout; no vetoes |
| Zero silent failures | every result carries an evidence pointer; drift 0 |
| Zero hidden-route features | routeOrigin=homepage; no deep links |
| 100% critical-scenario evidence | 196,800 + 196,800 records; 19/19 families |
| No unmitigated blockers | the amended-2 failure list is EMPTY |
| Improvements maintain held-out success | holdout outputs identical to baseline |
| Adoption-metric separation | four outputs, never combined, frozen contract |
| No human-willingness inference | the qualifier on every willingness number |

## 4. Commands run + outputs

- `npx tsx scripts/sim/run-holdout-final.ts` → freeze 6a9d225; 196,800
  journeys drift 0; ceiling holds: YES; final-report.json + FINAL-REPORT.md
- `pnpm vitest run packages/experience/test/sim/w3-013-held-out-final.test.ts` → 5/5
- Full gates: experience 626/626 (+5); typecheck exit 0; lint 99w/0e;
  architecture 0 violations (the 410-line file compacted to 398)

## 5. Honest caveats (the register)

1. Fixture-level simulation (deterministic interaction graphs, no pixels).
2. The failure/UNKNOWN/recovery dimension is not exercised in the clean
   runs (machinery exists for a follow-up).
3. Synthetic estimates only — validation with consenting real
   professionals is required before any user-facing adoption claim.

## 6. Program consequence

The charter's stopping criteria are met: the holdout confirms the ceiling,
the release-gate checklist is all-PASS, and no measured blocker remains.
The simulation phase can close: the final program record (certification)
follows this acceptance.
