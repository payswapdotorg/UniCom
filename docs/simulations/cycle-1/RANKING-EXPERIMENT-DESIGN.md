# W2-011 — Cycle-1 Ranking Experiment Design

> How each candidate lever (or small bundle) is measured through the SAME frozen contract on the baseline namespace. Companion to `PRODUCT-RANKING-PREP.md` and `ranking-inputs.json` (schema `unicom-cycle1-rankprep/1`).
> **SYNTHETIC SIMULATION ESTIMATE** — all willingness outputs are synthetic simulation estimates, not human survey results.

## 1. Measurement invariants (non-negotiable, per run)

1. **Frozen contract, byte-identical.** `w2-009:v1` is never edited by a lever measurement. Pre-flight and post-flight, record the sha256 of the four contract-surface files:
   - `packages/agent/src/contract.w2-009.ts`
   - `packages/agent/src/persona-types.ts`
   - `packages/agent/src/persona-scoring.ts`
   - `docs/simulations/personas/adoption-contract.json`

   A run whose contract hashes differ from the amended-2 baseline's is invalid (measurement, not product).
2. **Baseline namespace only.** All measurements run on the 3,900 baseline-namespace projects (13 industries × 3 sizes × 100). `assertNoHoldoutInSchedule` (already in the campaign, `packages/experience/src/sim/baseline-campaign-helpers.ts`) must hold; the run record carries `namespace: "baseline"`.
3. **Holdout untouched.** The 3,900 holdout projects (`W1-009-H-*` seed namespace) are never executed, scheduled, or scored until the held-out final (protocol §7). `cohort.holdoutProjects` must be 0 in every measurement report.
4. **Determinism.** Fixed clock, seeded cohort, seeded projects; a re-run with zero lever delta must reproduce the amended-2 determinism fingerprint byte-for-byte (modulo the isolated throughput block — wall-clock timing is excluded by construction, `baseline-campaign.ts:386-395`). Every measurement report records its fingerprint; the before/after fingerprint delta must be explainable by the lever's evidence deltas alone.
5. **Four outputs, never merged.** (a) full-switch eligibility, (b) willing-to-switch, (c) main-interface eligibility, (d) willing-main — each with count AND percentage, by industry/firm-size/role, with denominators (contract law 7).
6. **Synthetic-estimate qualifier** on every willingness number (contract law 3).

## 2. The measurement baseline

The **before** state is the W3-012 amended-2 baseline (`baseline-report.amended-2.*`, in flight): full 15,275-persona coverage over mapped applicable journeys, reconciliation drift 0. Until amended-2 lands, no lever is measured — the amended-1 report (single-persona attribution) is not a valid before-state for product ranking.

Reference numbers for calibration (derived in `PRODUCT-RANKING-PREP.md` §3): empty-bundle ≈ 4.4; fully-evidenced generic-driver ≈ 83.9 (all 15,275 eligible+willing); honest ceiling ≈ 93.4.

## 3. Per-lever protocol

For each lever L (from `candidate-levers.json`):

1. **Pre-flight**: record the contract-file hashes (§1.1), the amended-2 fingerprint, and the namespace guard status.
2. **Implement** L in its owning-lane surface (levers own code paths listed in `candidate-levers.json` `groundedIn` — the W2 lane owns none of them; implementation dispatch is the TL's ranking decision).
3. **Re-run** the campaign over the baseline namespace with identical seeds/clock/build-target, recording:
   - project + journey reconciliation (planned = executed + blocked + skipped, drift 0)
   - outcome counts (pass/fail/blocked/absent/unknown)
   - the four adoption outputs, global AND per industry×size×role
   - score distribution stats (mean, median, p05, p95, min, max)
   - **component means** (the 7 frozen components — the causal trace of the movement)
   - veto counts **by category**, and reason-code counts
   - determinism fingerprint + throughput block
4. **Evidence-integrity audit** (per the lever's `lawRiskProfile`): the specific checks in §5 for every risk flagged MEDIUM or HIGH.
5. **Before/after table** (§4) filed as `docs/simulations/campaign/cycle1/<lever-id>.md` (the W3 lane's write surface for campaign artifacts — W2-011 only defines the format here).

## 4. Before/after table format (mandatory fields)

| field | before (amended-2) | after (lever) | delta |
|---|---|---|---|
| (a) eligible count / % | | | |
| (b) willing count / % + mean score | | | |
| (c) eligible count / % | | | |
| (d) willing count / % + mean score | | | |
| score mean / median / p05 / p95 | | | |
| component means (×7) | | | |
| vetoed count (by category ×5) | | | |
| reason-code counts (×7) | | | |
| pass/fail/blocked/absent/unknown | | | |
| determinism fingerprint | | n/a (must differ only via lever deltas) | |

Plus: the lever id, the implementer lane, the diff summary (files touched), the audit verdict (§5), and the honest classification (product improvement vs measurement repair).

## 5. Anti-gaming laws (veto-first)

**A lever that improves the score only by degrading evidence integrity is VOID — regardless of its measured movement.** Concretely:

1. **Veto-first traceability.** If `vetoedCount` drops for a category, the error records for that category's error kinds must show the *failure class disappearing* (fewer `denied-permission` / `session-interruption` / … entries), not the same incidence with suppressed capture. Vetoes dropping while error incidence stays constant ⇒ void. (The mapper derives vetoes from `errorRecoveryTrace` — `adoption-mapper.ts:251-301`; removing the capture rather than the failure is evidence degradation.)
2. **No fabricated health.** `integrationQuality` gains must trace to real health probes through the connector-studio surface (ConnectorHealthSnapshot evidence refs). A hardcoded `state: "healthy"` without a probe ⇒ void (no-fabrication law; `journey-evidence.ts:189-204`).
3. **No proof-label inflation.** `trustProof` gains via proof levels must trace to journaled evidence chains (artifact kinds journaled-command/observation/approval/proof). P5 stamps without journal content ⇒ void.
4. **No assertion pruning.** `outcomeVsBenchmark` must not improve by removing failing assertions. Per-family assertion counts are recorded before/after; any decrease requires written justification tied to oracle changes, not score. Zero-assertion journeys count parity 0 by design (`adoption-mapper.ts:148-151`) — that rule stays.
5. **No manufactured passes.** `journeyCompletion` gains must come from real visible-UI completions through the typed view contracts (the GUI-only law: GuiOnlyProof's `violations` is the literal empty list; drivers that fake deep completion ⇒ void). Pass-rate gains with interaction traces shallower than the generic driver's are presumptively void.
6. **No deep-linked discovery.** First-discovery journeys never deep-link (`deepLinkUsedForDiscovery: false` is a hard literal). Discovery levers (L13) must route through the declared discovery paths.
7. **No incumbent-claim inflation.** Evidence-class upgrades (L06) require an actual authorized trial record; documentation-only stays C/D.
8. **Regression discipline.** Any lever that improves its target component while degrading another component's honest evidence (e.g., removing error capture to "speed up" journeys) is void even if net score rises.

Audit procedure: for each MEDIUM/HIGH risk in the lever's `lawRiskProfile`, run the corresponding check above on the after-state records; file the verdict in the before/after table.

## 6. Sample sizing and units of analysis

- **Unit of measurement**: the persona (15,275, fixed frozen cohort). **Unit of analysis for ranking statistics: the firm** (39 firms: 13 industries × 3 sizes; per-firm persona denominators 25/150/1,000 — `persona-types.ts:30-34`).
- Every measurement covers ALL 39 firms and ALL 15,275 personas (a census, not a sample) — sampling error is zero; the statistics that matter are before/after deltas and their cross-firm consistency.
- **Paired design**: per-firm mean score before vs after (39 paired observations). Report the mean delta with its per-firm spread; a lever whose gain concentrates in <5 firms is a cohort-specific fix, not a product improvement (flag it).
- **Granularity reporting**: global, per industry (13), per size (3), per industry×size×role (351 rows — same granularity as the amended-1 report's §4 tables). The amended-2 report supplies the per-role tails the TL ranks against.
- **Cohort-concentrated levers** (e.g., L15 supermarket-only: 3 firms, 1,175 personas, 600 family runs): report descriptively with an explicit low-power flag; do not rank on global mean alone.
- **Sensitivity**: the frozen sensitivity helpers (5 seeds × 0.05 perturbation, vetoes preserved) are reported alongside outputs (b)/(d) as in the baseline reports.

## 7. Bundle measurement

Levers touching **disjoint components** may be measured as one bundle because the frozen score is a linear combination of components (no interaction inside the formula): e.g., {L02+L04} (trust) + {L01} (integration) + {L08} (usability) are additive. Two coupling exceptions require explicit bundle care:

1. `preferenceFit` couples to `integrationQuality` and `usabilityFriction` (`persona-scoring.ts:199-217`) — bundles containing L01/L07/L08 must report preferenceFit deltas explicitly (the second-order dividend must not be double-attributed).
2. Veto levers (L10/L11/L14) interact with everything (a vetoed persona scores 0 regardless of components) — measure veto levers separately first, then bundle.

Bundle reports carry the same before/after table with per-lever component attribution.

## 8. Measurement cost model (feeds `ranking-inputs.json`)

- One full campaign re-run = 3,900 projects × ~12.4 journeys/project = 48,300 journey runs (amended-1 executed this in 1.48 s wall-clock on the local fixture — the throughput block is excluded from fingerprints).
- Variant-scoped re-runs (interruption/approval/failure variants; supermarket cohort only) cost less; record the executed count in the reconciliation block.
- Every lever in `ranking-inputs.json` carries `measurementCost` as re-run count; the TL weighs it against `expectedMovementPoints` and the veto-cliff exposure.

## 9. Decision inputs to the TL (what the ranking consumes)

`ranking-inputs.json` (schema `unicom-cycle1-rankprep/1`) consolidates: the 15 levers × components moved × expected movement (points, with derivation basis) × effort class × measurement cost × law-risk profile; the component sensitivity budget (weight × headroom from the generic baseline); the veto cliffs; and the derived ceiling context (4.4 / 83.9 / 93.4 with the TL-estimate deviations). Ranking hints are factual (ordering axes: expected value, enablement structure, veto cliffs, law risk) — the ranking itself is the TL's.
