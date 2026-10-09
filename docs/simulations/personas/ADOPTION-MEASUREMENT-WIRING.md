# W2-010 — Adoption Measurement Wiring (w2-010:v1)

Status: **delivered** (cycles.baseline wave B)
Owner: Worker 2 (personas / incumbent benchmarks / adoption metrics lane)
Scoring contract: **frozen `w2-009:v1`, UNCHANGED** (weights, thresholds, veto
categories, reason codes, formulas — byte-identical; any deviation is a hard
fail requiring TL sign-off + rescoring)
Wiring version: `w2-010:v1` (this document is its law text)
Artifacts: `docs/simulations/results/baseline/adoption/**`

## 1. What this wiring is

The deterministic, versioned mapping that turns **consumed W3 journey
evidence** + the **W2-010 incumbent benchmark registry** into per-persona
`JourneyOutcomeForPersona` inputs for the frozen W2-009 scoring engine
(`computeAdoptionDecision` → `aggregateAdoption` → `runSensitivityAnalysis`).
It adds measurement wiring only — never formula changes.

Layers (all in `packages/agent/src/`):

| Layer | File | Law |
|---|---|---|
| Evidence projection + id normalization | `persona-evidence-input.ts` | §3 |
| Wiring (evidence → per-persona outcomes) | `persona-journey-outcomes.ts` + `persona-outcome-reasons.ts` | §4 W1–W9 |
| Incumbent benchmark registry | `persona-incumbent-benchmark.ts` + `persona-incumbent-rows.ts` + verification tables | §5 |
| Measurement pipeline + report contract | `persona-adoption-report.ts` | §6 |
| Generator (IO: bundles → artifacts) | `generate-w2-010-adoption-report.ts` | §7 |

## 2. Frozen-contract boundary

Everything under `persona-scoring.ts`, `persona-aggregation.ts`,
`persona-sensitivity.ts`, `persona-decision-quality.ts`,
`persona-types.ts` (scoring constants) and
`docs/simulations/personas/adoption-contract.json` is **W2-009 frozen**.
W2-010 does not modify any of them; the report records
`scoringFormulaChange: "none"` and machine tests assert the frozen constants.

## 3. Evidence projection + id normalization (`persona-evidence-input.ts`)

The W3-009 journey-evidence record schema (schemaVersion 1) is consumed via a
**structural projection** (`JourneyEvidenceRecordInput`): only the fields the
measurement reads. Additive schema evolution on the W3 side stays compatible.

- Journey family ids: W3-009 registry ids (pilot) and W1-charter ids
  (campaign) map 1:1 onto the W2 vocabulary (`W3_TO_W2_JOURNEY_FAMILY`).
  **Unmapped ids are never consumed** (no silent vocabulary invention) —
  `negotiation-substitution` (W1-charter, no W2-009 counterpart; 3,900
  harness-blocked campaign runs, W3-010 §7 root cause) is excluded and
  surfaced in the machine-checked `evidenceReconciliation` of the report.
- Industry ids: W1 long ids (`finance-banking-accounting`, …) and W3-009
  fixture ids (`retail-ecommerce`, …) alias onto the W2 industry enum
  (`INDUSTRY_ID_ALIASES`); direct enum values pass through.
- Firm ids: W2 shape `firm:<industry>:<size>`; other shapes resolve through
  the normalized (industry, size) pair.

## 4. Wiring laws W1–W9 (machine-tested in `w2-010-wiring.test.ts`)

- **W1 ATTRIBUTION** — a persona consumes (a) records whose `personaId`
  exactly matches (campaign mode — the bundle's records carry real W2
  persona ids); else (b) the records of their normalized firm scoped to the
  persona's applicable journey families — **only when the bundle carries NO
  real W2 persona ids** (pilot/fixture mode; the W3-009 local-dev fixture
  vocabulary has no W2 persona ids). A campaign bundle with real persona ids
  is scored **strictly per-persona**: a persona that was not scheduled keeps
  a zero-component outcome and **stays in every denominator** — the
  conservative baseline reading (no evidence of eligibility is never
  reported as eligible-by-proxy). Attribution stats
  (per-persona / firm-fallback / strict-unmeasured) are reported with every
  measurement.
- **W2 COMPLETION** — `journeyCompletionRate = pass / non-absent records`
  (absent = backend-only, never counts; fail/blocked/unknown count as not
  completed; no records → 0).
- **W3 USABILITY** — per record `1 − 0.25 × (backtracks + failedOrBlockedSteps
  + errorRecoveryTrace)` clamped to [0,1], averaged over non-absent records.
- **W4 PARITY** — passed / total checked-after-journey commerce assertions
  over non-absent records (no assertions → 0: no verified parity without
  assertions).
- **W5 TRUST** — per record `PROOF_LEVEL_VALUE` (none/P0=0 … P5=1), averaged
  over non-absent records.
- **W6 INTEGRATION** — per record: no connectors → 1.0, else the MIN
  connector health (healthy=1, degraded=.6, stale=.4, unknown=.2,
  disconnected/compromised/unauthorized=0), averaged over non-absent records.
- **W7 INCUMBENT CLASS** — from the W2-010 benchmark registry: the WEAKEST
  evidence class across the persona's incumbent-counterpart task goals (D
  when there is no counterpart at all). Feeds the frozen scoring's
  `outcomeVsBenchmark` gate (class D → component zeroed: no superiority
  claims against unverified incumbents).
- **W8 CRITICAL-FAILURE VETO SOURCES** (record-derived; vetoed personas are
  not eligible and not willing under the frozen contract):
  `security` ← any connector state `compromised`;
  `authority` ← a PASSING journey whose required approval was never actuated
  (`approvedAt` missing);
  `financial-truth` ← a PASSING journey with a failed checked-after-journey
  commerce assertion (claimed success contradicted by economic truth);
  `data-integrity` ← `evidenceState.preservedThroughReconnect === false`
  (offline-queue invariant violated);
  `privacy` ← not derivable from the schema-v1 record projection; the frozen
  scoring still honors it when an outcome carries it (W2-009 fixture tests
  prove the veto itself).
- **W9 REASON CODES** (concise enumerable diagnostics, never free text):
  missing-capability `capability-gap` ← any applicable family absent-only or
  without attributed records; blockers `ui-friction` ← any fail record,
  `integration-readiness` ← any disconnected/unauthorized connector,
  `trust-compliance` ← pass with a failed assertion; friction `ui-friction`
  ← any friction events, `trust-compliance` ← average trust < 0.5,
  `price-cost` ← persona costSensitivity ≥ 0.8; preference `preference` ←
  specialist-stack/spreadsheet workflow, `training-switch-cost` ←
  switchingCost ≥ 0.7 AND training ≤ 0.3.

Determinism: same (personas, records, registry) → same outcomes. No clocks,
no randomness. The frozen sensitivity layer (5 seeds, ±5%) perturbs
components afterwards — **vetoes are preserved**.

## 5. Incumbent benchmark registry (`persona-incumbent-benchmark.ts`)

- **Commerce-only law**: only the commerce capabilities of the frozen W2-009
  incumbent stacks are benchmarked; broad vertical platforms never appear; no
  invented prices/speeds/market share; no fake competitor UI.
- Every in-scope commerce task goal observation is classed **A/B/C/D** or
  `no-incumbent-counterpart` (UNiCOM-differentiated goal with no incumbent
  capability row in the frozen stack).
- Row effective class = **weakest link** among its named products
  (D < C < B < A). Product table: 48 entries = 43 official-domain-verified
  products (27 class B + 16 class C, raw search snapshots in
  `incumbent-verification-evidence.json`) + 5 generic class-D rows
  (manual/category rows with no specific verifiable product).
  **Class A = 0 by law** (no authorized live incumbent trials this wave).
- `performanceComparison` is the literal string `"UNKNOWN"` everywhere; D-class
  observations render incumbent capability UNKNOWN and are excluded from
  performance claims.

## 6. Measurement pipeline + report contract (`persona-adoption-report.ts`)

`runAdoptionMeasurement({personas, records, evidenceSource, …})` →
`AdoptionMeasurementReport` (schema `w2-010-adoption-measurement/1`):

1. wiring (W1–W9) → per-persona outcomes;
2. frozen `computeAdoptionDecision` per persona (veto first);
3. frozen `aggregateAdoption` per grouping (global / industry / firm size /
   industry×size / role / industry×size×role);
4. frozen `runSensitivityAnalysis` (5 seeds) → every aggregate row carries
   min/max/mean/stddev for all five metrics (the four outputs + vetoed pct);
5. veto tallies by category, reason-code tallies, population denominators,
   machine-checked `evidenceReconciliation`, the prominent
   synthetic-willingness caveat and the caveat list.

Laws: four separate outputs (never merged); every aggregate carries numerator
AND denominator AND percentage (failed/blocked/UNKNOWN personas stay in the
denominator); deterministic (same inputs → byte-identical report JSON);
synthetic-willingness caveat embedded in every artifact.

## 7. Evidence bundles + generator

- `evidence/pilot-journey-evidence.json` — the W3-009 S+M+L pilot records
  (1,092; projection/1; from `packages/experience/reports/sim/
  pilot-summary.json` @ `w3-evidence`).
- `evidence/campaign-journey-evidence.json.gz` — the W3-010 baseline campaign
  records (48,300: 44,400 pass + 3,900 harness-blocked `negotiation-substitution`;
  projection/1, gzip; regenerated by running `runBaselineCampaign` from the
  W3-010 delivery ref in a clean worktree and **verified canonically identical
  to the published `docs/simulations/campaign/baseline-report.json`** modulo
  the two environment artifacts: the checkout-path prefix inside
  `fingerprints.*.loadedFromPath`, and the isolated throughput wall-clock
  block; published determinism fingerprint `6d41dc822423e598`).
- `generate-w2-010-adoption-report.ts` — loads the bundles (sha256-verified),
  runs the measurement twice (pilot validation first, then the campaign full
  re-run), enforces the report gates, and writes the machine-readable
  artifacts + `SUMMARY.md`. Rerun:
  `npx tsx packages/agent/src/generate-w2-010-adoption-report.ts`.

## 8. Relationship to the W3-010 campaign mapper

Both W2-010 and W3-010 feed the SAME frozen `w2-009:v1` scoring contract,
but the evidence→outcome wiring differs **by design** (the W3-010 campaign
mapper is the runner-side mapper at the W3-010 delivery ref; the W2-010
wiring is this repo's agent-side measurement wiring with incumbent-registry
integration, non-absent completion denominators, assertion-level parity,
MIN-connector integration, and weakest-link incumbent class). The four
numbers in the two reports are therefore not expected to be identical; both
are valid under their own versioned wiring. For the baseline campaign the
two measurements agree on the directly-measured personas (39 main-interface
eligible in both); W2-010 additionally reports 6 of them technically
full-switch eligible, plus sensitivity ranges, veto accounting and
incumbent-class gating that the campaign report carries as nulls/unknowns.
