# W2-011 — Cycle-1 Product-Ranking Preparation

> **Work order**: W2-011 (Worker 2 lane — Personas / Incumbent benchmarks / Adoption metrics)
> **Base SHA**: `45d8f274ba6c8ae3b8be0a08a6f7777a5ba0f219` (origin/main at dispatch)
> **Phase**: cycles.improvement_1 — preparation for CYCLE_1_PRODUCT_RANKING
> **Frozen contract**: `w2-009:v1` (byte-identical; this work order does not touch it)
> **SYNTHETIC SIMULATION ESTIMATE** — every willingness number below is a synthetic simulation estimate, NOT a human survey result.

## Deliverable index

| file | content |
|---|---|
| `veto-threshold-map.json` | every veto / threshold / weight, dual-cited (code + data), schema `unicom-cycle1-rankprep/1` |
| `component-surface-map.json` | all 7 scoring components → the product surfaces that generate their evidence |
| `candidate-levers.json` | 15 code-grounded levers with law-risk classification |
| `RANKING-EXPERIMENT-DESIGN.md` | how each lever gets measured through the frozen contract |
| `ranking-inputs.json` | consolidated levers × components × movement × cost for the TL's ranking |
| `analysis/lib.ts`, `analysis/derive-ceiling.ts`, `analysis/verify-deliverables.ts` | self-contained analysis scripts (deterministic; commands in §3 and §6) |
| `analysis/ceiling-arithmetic.output.json` | machine-readable derivation output |

## §1 Context — what the baseline measured and why preparation is needed

The amended-1 baseline (`docs/simulations/campaign/baseline-report.amended-1.json`, build 28783aa8) measured 48,300/48,300 journeys passing, 0 blocked, and four adoption outputs of **39/15,275** eligibles (0.3%) with global mean score **5**. The 39 eligibles are exactly one persona per firm — the campaign loop attaches every journey to `personaIds[0]` with hardcoded role `"project-owner"` (`packages/experience/src/sim/baseline-campaign.ts:204,211`); the other 15,236 personas score on empty bundles because every mapper component zeroes when `records.length === 0` (`packages/experience/src/sim/adoption-mapper.ts:56-80`).

W3-012 (in flight on the parallel chain) repairs this measurement gap and re-runs the amended-2 baseline. **This preparation is what lets the TL rank cycle-1 PRODUCT changes the moment those findings land**: the structural map of where score is lost (§2), the ceiling arithmetic (§3), the lever enumeration (§4), and the measurement design (§5).

The state file's framing holds: *the adoption ceiling = the frozen contract's veto/threshold structure over per-persona journey evidence*.

## §2 Veto/threshold map (summary — machine-readable in `veto-threshold-map.json`)

**Contract surface**: `packages/agent/src/contract.w2-009.ts` re-exports the frozen artifacts from `persona-scoring.ts` / `persona-types.ts`; **data side**: `docs/simulations/personas/adoption-contract.json`. Every entry below is dual-cited in the JSON deliverable; the completeness cross-check (`analysis/verify-deliverables.ts`) proves every weight/threshold/category/reason code in the source appears.

### 2.1 Vetoes (enforced in this order)

| # | veto | effect | code | data |
|---|---|---|---|---|
| 1 | **Critical-failure veto** (security, authority, financial-truth, privacy, data-integrity) | enforced FIRST; persona not eligible (a/c), not willing (b/d); scores forced to 0 | `persona-scoring.ts:85-86` (law `contract.w2-009.ts:11-13`) | `$.criticalFailureCategories` |
| 2 | **Full-switch blocker veto** | any missing-capability or blocker reason code ⇒ not eligible (a) | `persona-scoring.ts:139-149` | `$.fourAdoptionOutputs[0].rule` |
| 3 | **Main-interface blocker veto** | blockers veto (c); capability-gap exempted | `persona-scoring.ts:156-166` | `$.fourAdoptionOutputs[2].rule` |
| 4 | **Zero-applicable-journeys** | count 0 ⇒ not eligible (a)/(c) | `persona-scoring.ts:145-147,162-164` | — |
| 5 | **Incumbent class-D parity gate** | best firm class D ⇒ outcomeVsBenchmark = 0 (−20 pts; latent — 0/39 firms today) | `persona-scoring.ts:101-104` | `$.evidenceClasses[3]` |

### 2.2 Thresholds

| threshold | value | gates | code | data |
|---|---|---|---|---|
| FULL_SWITCH_THRESHOLD | 65 | (b) willing-to-switch | `persona-types.ts:164` (`contract.w2-009.ts:86`) | `$.thresholds.fullSwitchThreshold` |
| MAIN_INTERFACE_THRESHOLD | 55 | (d) willing-main-interface | `persona-types.ts:165` (`contract.w2-009.ts:88`) | `$.thresholds.mainInterfaceThreshold` |
| FULL_SWITCH_JOURNEY_COMPLETION_FLOOR | 1.0 | (a) — ALL journeys complete | `persona-types.ts:167` (`contract.w2-009.ts:85`) | `$.thresholds.fullSwitchJourneyCompletionFloor` |
| MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR | 0.8 | (c) — ≥80% supervisable | `persona-types.ts:166` (`contract.w2-009.ts:87`) | `$.thresholds.mainInterfaceJourneySupervisionFloor` |

### 2.3 Weights (frozen)

| component | weight | points | code | data |
|---|---|---|---|---|
| journeyCompletion | 0.30 | 30 | `persona-types.ts:144` | `$.frozenScoreWeights.journeyCompletion` |
| usabilityFriction | 0.15 | 15 | `persona-types.ts:145` | `$.frozenScoreWeights.usabilityFriction` |
| outcomeVsBenchmark | 0.20 | 20 | `persona-types.ts:146` | `$.frozenScoreWeights.outcomeVsBenchmark` |
| trustProof | 0.15 | 15 | `persona-types.ts:147` | `$.frozenScoreWeights.trustProof` |
| integrationQuality | 0.10 | 10 | `persona-types.ts:148` | `$.frozenScoreWeights.integrationQuality` |
| switchingCostFit | 0.05 | 5 | `persona-types.ts:149` | `$.frozenScoreWeights.switchingCostFit` |
| preferenceFit | 0.05 | 5 | `persona-types.ts:150` | `$.frozenScoreWeights.preferenceFit` |

Weight sum = 1.0 (verified). Score = `round₁ₚ(100·Σ wᵢcᵢ)` (`persona-scoring.ts:219-225`).

### 2.4 Operational evidence semantics (mapper-side — where evidence points are made/lost)

Not frozen-contract constants, but the numbers that realize the components from `JourneyEvidenceRecords` (`adoption-mapper.ts`):

- **Empty-bundle zeroing** (lines 56-80): no records ⇒ all five evidence components 0. *The structural root of the 4.4 empty-bundle score.*
- **Friction penalties** (lines 129-140): backtrack 0.1 · failed step 0.15 · blocked step 0.2 · error-recovery entry 0.1 · outcome unknown 0.3 / fail 0.5.
- **Parity rule** (lines 143-158): a record needs ≥1 assertion AND all passed; zero-assertion records count 0.
- **Trust mapping** (lines 170-180): P0..P5 → 0..1 in 0.2 steps; +0.1 reconnect-preserved; +0.05 ≥1 artifact; min(1, ·).
- **Integration mapping** (lines 192-217): healthy 1.0 / degraded 0.6 / stale 0.4 / **unknown 0.3** / disconnected 0.2 / unauthorized 0.1 / compromised 0.0; **no connector states ⇒ neutral 0.5** (a journey that touches no connector cannot observe health — the honest ceiling's structural cap).
- **Veto mapping** (lines 283-301): denied-permission/missing-approval/disabled-permission → authority; settlement-unknown → financial-truth; supplier-disappearance → data-integrity; session-interruption → privacy; compromised/unsupported-competitor → security.
- **Generic-driver floor** (`journey-drivers.ts:112-134`): P3/P2 proof, `unknown` connectors, 1 artifact, 1 assertion — the per-record evidence baseline all levers move.

## §3 Ceiling arithmetic (reproduced from the frozen contract structure)

Derived by `analysis/derive-ceiling.ts` over **all 15,275 frozen personas** through the REAL engines (`generatePersonaCohort` → `mapJourneyEvidenceToPersonaOutcome` → `computeAdoptionDecision` — never re-implemented), with one evidence record per mapped applicable W1 family (the W3-012 coverage-law bundle shape; the analysis-side W2→W1 mapping lives in `analysis/lib.ts` and defers to W3-012's authoritative one).

**Command**: `node_modules/.bin/tsx docs/simulations/cycle-1/analysis/derive-ceiling.ts`

### 3.1 Component-by-component derivation (cohort means)

| component | weight | (a) empty bundle | (b) fully-evidenced generic | (c) ceiling P5+healthy | (a) pts | (b) pts | (c) pts |
|---|---|---|---|---|---|---|---|
| journeyCompletion | 0.30 | 0.000 | 1.000 | 1.000 | 0.0 | 30.0 | 30.0 |
| usabilityFriction | 0.15 | 0.000 | 1.000 | 1.000 | 0.0 | 15.0 | 15.0 |
| outcomeVsBenchmark | 0.20 | 0.000 | 1.000 | 1.000 | 0.0 | 20.0 | 20.0 |
| trustProof | 0.15 | 0.000 | 0.626 | 1.000 | 0.0 | 9.4 | 15.0 |
| integrationQuality | 0.10 | 0.000 | 0.411 | 0.722 | 0.0 | 4.1 | 7.2 |
| switchingCostFit | 0.05 | 0.585 | 0.585 | 0.585 | 2.9 | 2.9 | 2.9 |
| preferenceFit | 0.05 | 0.296 | 0.500 | 0.646 | 1.5 | 2.5 | 3.2 |
| **weighted score** | 1.00 | | | | **4.4** | **83.9** | **93.4** |

Distribution stats: (a) median 4.3, range [1.1, 7.7], p05–p95 [2.3, 7.0]; (b) median 83.7, range [80.5, 88.1], p05–p95 [81.7, 86.5]; (c) median 93.6, range [88.5, 97.7]. Under (b) and (c) **all 15,275 personas are eligible AND willing on all four outputs** — confirming the TL's finding that the 39/15,275 amended-1 outputs are a single-attribution artifact, not a product measurement.

Role-family means under (b): it 85.8, sales 85.8, compliance-audit 84.2, industry-specialist 84.1, procurement 83.5, field-ops 83.4, finance-accounting 83.4, approver-executive 83.1, project-program-mgmt 82.2 — every role crosses both thresholds (65/55).

### 3.2 TL estimate comparison (W3-012 §"TL quantitative analysis")

| metric | TL estimate | derived | delta | verdict |
|---|---|---|---|---|
| fully-evidenced generic-driver score | ≈ 82 | 83.9 | +1.9 | **match** (within ±3) |
| empty-bundle score | ≈ 4 | 4.4 | +0.4 | **match** |
| product ceiling (healthy connectors, P5 proof) | ≈ 95 | 93.4 | −1.6 | **match** (within ±3) |

**Deviation notes (exact numbers, per the work order's flagging requirement):**

1. **Fully-evidenced 83.9 vs TL 82 (+1.9).** The TL's estimate is slightly conservative. The derivation uses the exact per-family P2/P3 mix from the registry's `approvalRequired` flags and the exact connector/non-connector mix from `connectorDependent` — the resulting trust mean 0.626 and integration mean 0.411 give 83.9.
2. **Empty-bundle 4.4 vs TL 4 (+0.4); amended-1 observed global mean 5.** Consistent: the observed mean is a mixture — 15,236 empty-bundle personas at ≈4.4 plus 39 evidenced `personaIds[0]` personas at ≈84 → (15,236×4.4 + 39×84)/15,275 ≈ 4.6, displayed as 5 in the amended-1 report's rounded mean. No unexplained discrepancy.
3. **Ceiling 93.4 vs TL 95 (−1.6).** The honest ceiling sits *below* the TL's estimate for a structural reason: non-connector journeys record no connector states, and the mapper scores no-states at the neutral 0.5 (`adoption-mapper.ts:194-197`) — a journey that touches no connector cannot observe connector health, and fabricating states would violate the no-fabrication law. The integration ceiling is therefore 0.722 (cohort mean over each persona's family mix), not 1.0. A non-structural absolute bound (integration forced 1.0) computes to 96.8 — recorded in `analysis/ceiling-arithmetic.output.json` as `absoluteUpperBound` and **explicitly not achievable** by honest product change.

### 3.3 Where the score is lost (the ranking's target list)

- **Empty → fully-evidenced: +79.5 points** — bundle presence itself (journeyCompletion +30, usability +15, parity +20, trust +9.4, integration +4.1, preference +1.0). This is W3-012's measurement repair, **not** a product lever.
- **Fully-evidenced → ceiling: +9.5 points** — the honest product headroom: trustProof +5.6 (proof levels), integrationQuality +3.1 (connector health), preferenceFit +0.7 (second-order).
- **Ceiling → absolute: +3.4 points** — non-structural (neutral-0.5 cap); not rankable.
- **Veto cliffs** — binary, outside the weighted arithmetic: any of the 5 critical-failure categories forces score 0. The ranking must weight veto-elimination levers (L10, L14, L11) by exposure, not by points.

## §4 Candidate product-change levers (≥ 12 required; 15 delivered)

Every lever cites real code at the base SHA (path-existence verified by `analysis/verify-deliverables.ts`); the full risk classifications live in `candidate-levers.json`. Effort: S/M/L.

| id | lever | components moved | expected movement (pts) | key law risk | effort |
|---|---|---|---|---|---|
| L01 | connector health probing recorded on connector-dependent journeys (`journey-drivers.ts:112-115`; `connector/observability.ts`, `connector/health-surface.ts`) | integrationQuality ↑, preferenceFit ↑ | **+3.8** | no-fabrication HIGH (real probe only) | M |
| L02 | P4/P5 proof evidence on approval/recourse paths (`journey-drivers.ts:121-125`; `journey-evidence.ts:176-187`; `surfaces/trust-security.ts`) | trustProof ↑ | **+5.6** | no-fabrication HIGH | M |
| L03 | offline-queue evidence survival through reconnect (`edge/offline-queue.ts:27-62`) | trustProof ↑ | +1.5 (exposure-dependent) | no-fabrication MEDIUM | M |
| L04 | ≥1 evidence artifact on every journey (`adoption-mapper.ts:178-179`) | trustProof ↑ | +0.75 | no-fabrication MEDIUM | S |
| L05 | post-journey assertions on every family (`adoption-mapper.ts:143-158`; `journey-drivers.ts:127-134`) | outcomeVsBenchmark (loss avoidance) | 0 direct; pairs with L12 | evidence MEDIUM | S |
| L06 | authorized incumbent trials (class A upgrades; `persona-incumbent-stacks.ts:23-34`) | outcomeVsBenchmark (D-gate prevention) | 0 (latent −20 cliff) | no-fabrication HIGH | M |
| L07 | wayfinding: dead-end/wrong-surface elimination (`journey-evidence.ts:78-91`) | usabilityFriction ↑ | +1.5 (with L12) | GUI-only MEDIUM | M |
| L08 | form-validation friction reduction (`surfaces/intent-canvas.ts:16-75`) | usabilityFriction ↑ | +2.5 (failure exposure) | low | S |
| L09 | in-journey recovery consolidating error entries (`failure-variants.ts:79-100`) | usabilityFriction ↑ | +1.5 (failure exposure) | evidence MEDIUM (no trace suppression) | M |
| L10 | in-context approval acquisition (`journey-evidence.ts:159-174`; authority veto source) | journeyCompletion ↑, vetoAvoidance | binary veto cliff | GUI-only MEDIUM | L |
| L11 | role-access coverage broadening (`role-access.ts:24-73`) | journeyCompletion ↑, vetoAvoidance | enables per-role coverage | anti-overfitting MEDIUM | M |
| L12 | family-specific drivers replacing the one generic template (`journey-drivers.ts:27-175`) | journeyCompletion, usability, parity | measurement-depth (enables L05/L07/L13) | GUI-only/no-fabrication HIGH | L |
| L13 | discovery-path coverage (universal-intent, contextual, onboarding; `navigation/universal-intent.ts`) | journeyCompletion ↑, usabilityFriction ↑ | feature-findability measurement | GUI-only HIGH (no deep links) | M |
| L14 | session-resilience (privacy veto source; `connector/browser-session.ts`) | vetoAvoidance, trustProof | binary veto cliff | evidence MEDIUM | M |
| L15 | no-RFID capture reliability (`edge/observation.ts:22-117`; supermarket cohort) | journeyCompletion ↑, usabilityFriction ↑ | +0.2 (cohort-concentrated) | evidence MEDIUM | L |

**Explicitly not levers** (prevents phantom ranking): `switchingCostFit` (persona-bound, frozen attributes — no product influence); persona-journey attribution repair (W3-012's measurement repair, moves 39→15,275 evidenced personas without product change); contract weight/threshold changes (frozen; law 5 requires version bump + rescoring + TL sign-off).

## §5 Ranking experiment design (summary)

Full protocol in `RANKING-EXPERIMENT-DESIGN.md`. Core laws: the frozen `w2-009:v1` contract stays byte-identical (sha256-verified per run); measurements run on the **baseline namespace only** (3,900 projects; `assertNoHoldoutInSchedule`); the holdout `W1-009-H-*` is never executed, scheduled or scored (§7 anti-overfitting); every run carries a determinism fingerprint (byte-identical re-runs modulo the isolated throughput block); and the **veto-first anti-gaming law**: a lever that improves the score by degrading evidence integrity is void.

## §6 Verification (commands + results at this SHA)

| check | command | result |
|---|---|---|
| ceiling derivation | `node_modules/.bin/tsx docs/simulations/cycle-1/analysis/derive-ceiling.ts` | green — 15,275 personas × 4 scenarios; output above |
| deliverable cross-checks | `node_modules/.bin/tsx docs/simulations/cycle-1/analysis/verify-deliverables.ts` | green — all weights/thresholds/veto categories/reason codes dual-cited and matching source + data; all cited paths exist; 15 levers ≥ 12 |
| lint | `pnpm lint` | see completion report |
| architecture | `pnpm architecture:check` | see completion report |

## §7 Notes and lane boundaries

- The W2→W1 journey-id mapping used for bundle sizing is the analysis-side derivation (`analysis/lib.ts`); **W3-012 owns the authoritative campaign-side mapping**. If they disagree, W3-012 wins and the ceiling arithmetic re-derives.
- `persona-journeys.ts` was read for vocabulary analysis only (W3-012's write surface — untouched).
- All willingness numbers carry the synthetic-estimate qualifier; the four outputs are never merged.
