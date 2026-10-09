# W3-010 Completion Report

Status: **COMPLETE** (TL acceptance under the local-chain doctrine — worker vehicle delivered the full campaign at 7f52ac4 then went quiet; TL verified every gate, root-caused the blocked cluster, and completed this report)
Branch: `work/w3-010` (3 commits: loader skeleton + runner + namespace guard + tests → smoke run + fixes → full campaign run + lint cleanup)
Base: `e84ddb5` (W3-010 dispatch; all three wave-009 lanes merged at base)
Owner: worker-3 (lane: `gui-only-browser-runner-evidence`, phase cycles.baseline)

## 1. VERDICT

**COMPLETE** — the baseline campaign ran over the REAL artifacts: 3,900
baseline-namespace projects, 48,300 planned journey runs, 44,400 executed +
3,900 blocked + 0 skipped (drift 0, both reconciliation laws hold); all four
adoption outputs computed under the frozen w2-009:v1 contract; machine-readable
(941 KB) + slim + §8 human-readable reports delivered; holdout namespace
provably untouched; determinism fingerprint `6d41dc822423e598`.

## 2. Acceptance criteria → evidence (TL re-verified)

| # | Criterion | Evidence |
|---|---|---|
| 1 | Real W1/W2 artifacts consumed | real-artifact-loader.ts imports manifest/industries/roles/journey-families from docs/simulations/scenarios/** + cohort-manifest/adoption-contract from docs/simulations/personas/**; report carries buildCommit + artifact fingerprints; frozen dirs untouched on the branch (diff empty) |
| 2 | Exactly 3,900 baseline projects, zero holdout | namespace-guard tests (3): only-baseline, exactly-3,900, zero-holdout-scheduled/executed/scored; §7 confirmation namespaceGuardPassed=true |
| 3 | 39 firms / 13 industries / 3 sizes / 15,275 personas in aggregates | firmAggregates 39 (test: one per firm, denominators sum 15,275); industrySizeRoleAggregates present; §4 table in the report |
| 4 | Four outputs under frozen contract | contractVersion w2-009:v1 in report; adoption-contract.json byte-identical (no diff); mapper imports computeAdoptionDecision/aggregateAdoption from @unicom/agent unmodified |
| 5 | Synthetic-estimate qualifier everywhere | every willingness object carries syntheticEstimateLabel; §0 banner in the report; test locks it |
| 6 | Reconciliation exact | projects 3900=3900+0+0; journeys 48300=44400+3900+0; drift 0; tests + report |
| 7 | Evidence for every result incl. failures | 48,300 evidence records (blocked records carry the recovery trace per law §2); zero-orphan 132/132 against the real portfolio |
| 8 | §8 report completeness + sensitivity | BASELINE-REPORT.md covers §0-§9 (build/commit/timestamps, reconciliation, cohorts, outcome counts, industry×size×role, incumbent evidence classes, four outputs, friction causes, limitations); sensitivityRanges in the machine-readable report |
| 9 | Determinism | fingerprint test on re-run (byte-identical modulo the isolated throughput block); the only pilot-summary diff on the branch is totalDurationMs 45→34 (the permitted wall-clock exception) |
| 10 | Battery ≥ 1,538, zero regressions | TL re-run: experience 604/604 (+30 vs main 574) + commerce 405/405 + agent 559/559 = 1,568/1,568; typecheck 12/12 reachable projects exit 0; lint 99w/0e (identical tier); architecture 0 violations |

## 3. Campaign results (baseline, first measurement)

- Outcomes: pass 44,400 / fail 0 / blocked 3,900 / absent 0 / unknown 0.
- Four adoption outputs (denominator 15,275): (a) full-switch eligible 0 (0%);
  (b) simulated willingness-to-switch 0, meanScore 5; (c) main-interface
  eligible 39 (0.26% — exactly one per firm, the procurement role);
  (d) simulated willingness-main-interface 39, meanScore 5.
- All numbers are synthetic simulation estimates (not human survey results).

## 4. TL root-cause analysis of the 3,900-blocked cluster (the §7 register)

The report's cluster label is `blocked-misc`; the TL root-caused it precisely:

**The `negotiation-substitution` journey family is blocked in ALL 3,900 runs —
a harness vocabulary gap, not a measured product failure.** W1's authoritative
`journey-families.json` defines `negotiation-substitution` (per the charter's
mandatory journey list #3); W3-009's `journey-registry.ts` was built from the
protocol §10 list which instead carries `b2b-multi-location-supplier-
coordination`. The generic driver's `journeyFamilyEntry()` throws
`unknown journey family id: negotiation-substitution` before probing ANY
surface → blocked evidence record × 3,900. Every other family passes 100%
(the per-family evidence table in the machine-readable report confirms:
44,400 passes spread across 18 families, 0 fails).

**Classification**: campaign-infrastructure defect (W3-009 registry never
reconciled with the W1 authoritative vocabulary; the W3-009 pilot used the
local-fixture vocabulary which matched the registry, so the seam was invisible
until the real-artifact campaign). The baseline's adoption outputs are
therefore a LOWER BOUND for negotiation-substitution-inclusive eligibility;
they are NOT evidence that the product lacks the capability (the product
surfaces exist: `intent-negotiation` in the buyer-agent section of the
navigation feature matrix).

**Cycle-1 consequence**: the first remediation work order must fix the
registry seam and re-run the affected family WITHIN the baseline namespace
(no holdout), amending the baseline report, before product-facing improvement
cycles are ranked. A harness fix that un-blocks 3,900 journeys is measurement
repair, not a product improvement (the charter's anti-overfitting law: a fix
that "only improves the same seed or hides a failure" must not be counted).

## 5. Honest limitations

- The adoption outputs under-measure while the harness gap stands (§4).
- The campaign runs against the local-dev fixture deployment (isolated;
  no production systems, per the no-production law).
- Sampled journey families per project (the cohort collectively covers all
  families); throughput block excluded from the fingerprint.
- The worker's own report tier: agent tests could not run in ITS sandbox
  (missing workspace deps — environmental); the TL re-ran agent 559/559 on
  the branch with the workspace artifacts built (all green).

## 6. Next frontier (TL dispatch)

Improvement cycle 1, remediation order 1 (worker-3 lane): journey-registry
reconciliation with the W1 authoritative family list + the
negotiation-substitution driver (buyer-intent-canvas / opportunity-inbox
surfaces per the feature matrix) + the amended baseline re-run (baseline
namespace only) + the amended report. Cycle-1 product remediation orders
follow from the amended failure list.
