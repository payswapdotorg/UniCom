# W1-010 Certification Summary — pilot (W3-009 evidence)

> Machine-readable authority: `certification-report.json` (schema `unicom-w1-010-certification/1`, certifier `w1-010-certifier/1.0.0`).

## Source

- Source kind: `pilot` (sampleMode `pilot`)
- Experiment: `v3-baseline` @ build `w3-009-pilot`
- Evidence: `packages/experience/reports/sim/pilot-summary.json` (1092 records, sha256 `8f2f1f3d2eaa8469…`)

## Oracle certification verdicts

| verdict | records |
| --- | --- |
| assertion-pass | 1092 |
| assertion-fail | 0 |
| unknown-preserved (blocked/unknown/absent) | 0 |

- Records certified: **1092/1092** (uncertified: 0)
- Per-record verdicts: complete list embedded (1092 rows; sha256 `54af0cd72a35cc98…`)

## Manifest↔execution reconciliation

| firms | reconciled | inventory | planned (run scope) | executed | blocked | skipped | drift |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 84 | 84 | 84 | 0 | 0 | 0 |

- Manifest source: `w3-009-local-dev-fixture`
- Untraced project ids: 0; fabricated project ids: 0

## Guards

- Holdout leakage: **0** holdout-namespace projects in evidence; seed disjointness proven: **true**
- Money integrity (S11): 0 money values scanned across 1 scopes — **float money found: 0**
- UNKNOWN preservation (S4/S9): conversions found: **0** (unknown records: 0, blocked: 0, absent: 0)

## Determinism audit

- `v3-baseline-pilot-schedules` (v3-baseline, cohorts pilot-S, pilot-M, pilot-L): re-derived **byte-identical** over 4305 canonical fields (clock fields excluded: schedule.generatedAt, schedule.buildCommit)

## Integrity + reproducibility

- Evidence unmutated: **true** (sha256 before = after)
- Re-run byte-identical: **true**

## Notes

- Pilot certification: the manifest source is the W3-009 local-dev fixture (W1-009 had not landed when the pilot ran); records carry localDevFixture: true.
- All 1,092 pilot records carry outcome 'pass'; UNKNOWN/blocked preservation is certified vacuously on records and exactly on every aggregation layer.
- Money integrity on the pilot evidence set is vacuous by construction: the W3-009 journey records + schedules carry no money-valued fields (the fixture's integer-cent budgets live in project manifests, not journey evidence). Non-vacuous money integrity is proven on the campaign evidence set (W1 portfolio manifests + oracles + reports).
