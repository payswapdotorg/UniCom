# W3-013 — Wave D: Held-Out Final Report

> **SYNTHETIC SIMULATION ESTIMATE** — every willingness number is a synthetic simulation estimate, NOT a human survey result.

## Freeze record

- Code: `6a9d225f` (branch work/w3-013)
- Frozen adoption contract: w2-009:v1 (byte-identical throughout)
- Baseline measurement: amended-2 @ 3fcd39b (fingerprint e485b624da2bf73f)
- Deployment scope: local-dev fixture — isolated from production (recorded separately from simulation outcomes)

## The held-out campaign

- Namespace: **holdout** (3,900 W1-009-H-* projects; zero baseline-namespace projects executed — the §7 mirror, test-pinned)
- Projects: planned 3900 = executed 3900 + blocked 0 + skipped 0 (drift 0)
- Journeys: planned 196800 = executed 196800 + blocked 0 + skipped 0 (drift 0)
- Outcomes: pass=196800 fail=0 blocked=0 absent=0 unknown=0
- Evidence records: 196800; determinism fingerprint `d55d92c2250bad62`

## The four adoption outputs (holdout)

| output | eligible | % | mean score | threshold |
|---|---|---|---|---|
| (a) Technical full-switch eligibility | 15275/15275 | 10000.0% | n/a | n/a |
| (b) Simulated stated willingness to switch completely | 15275/15275 | 10000.0% | 83 | 65 |
| (c) Main-interface eligibility | 15275/15275 | 10000.0% | n/a | n/a |
| (d) Simulated stated willingness to use as main interface | 15275/15275 | 10000.0% | 83 | 55 |

## Baseline vs holdout (does the ceiling hold?)

| output | baseline | holdout | holds |
|---|---|---|---|
| (a) | 15275/15275 | 15275/15275 | YES |
| (b) | 15275/15275 | 15275/15275 | YES |
| (c) | 15275/15275 | 15275/15275 | YES |
| (d) | 15275/15275 | 15275/15275 | YES |

**Ceiling holds on the held-out seeds: YES.**

## Release-gate checklist

| gate | status | evidence |
|---|---|---|
| GUI-only law (no direct API/service/DB manufacture) | PASS | every journey record carries a non-empty GuiOnlyProof with violations: [] (law §1); the runner registers drivers only |
| 100% matrix capabilities tested for GUI discoverability | PASS | zero-orphan feature map 132/132 against the real portfolio (W3-010/W3-012 tests) |
| Zero critical security/authority/data-integrity violations | PASS | outcomeCounts across baseline+holdout: fail=0, blocked=0; no critical-failure vetoes in any adoption decision |
| Zero silent action failures | PASS | every project result and failure carries a journey-evidence record pointer; reconciliation drift 0 on both runs |
| Zero hidden-route-only features counted as present | PASS | routeOrigin=homepage on every record; deepLinkUsedForDiscovery=false (W3-009 pilot proofs + the driver tests) |
| 100% declared critical scenarios have evidence | PASS | 196,800 baseline + 196,800 holdout evidence records; per-family evidence tables complete (19/19 families) |
| No severe high-frequency GUI blocker without mitigation | PASS | the amended-2 failure list is EMPTY (zero blocked/absent/fail journeys across all 15,275 personas) |
| Improvements maintain held-out task success | PASS | holdout outputs identical to the amended-2 baseline: a=15275, b=15275, c=15275, d=15275 |
| Adoption-metric separation (a/b/c/d never combined) | PASS | four separate outputs with denominators, computed under the frozen w2-009:v1 contract |
| No human-willingness inference from simulation | PASS | every willingness number carries "synthetic simulation estimate" |

## Caveats

- Fixture-level simulation: the drivers model visible-UI paths as deterministic interaction/checkpoint graphs over the real experience-plane surface contracts (no pixel rendering, no real latency).
- The clean baseline and holdout do not exercise the failure/UNKNOWN/recovery dimension (the W3-009 failure-variants machinery exists for a follow-up resilience measurement).
- Synthetic adoption numbers are model outputs, not human preference research; validation with consenting real professionals is required before any user-facing adoption claim.

