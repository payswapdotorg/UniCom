# W2-009 — Persona + Adoption Scoring Schema (frozen v1)

**Status:** FROZEN at SCORING_CONTRACT_VERSION = `w2-009:v1`
**Authors:** Worker-2 lane (persona-incumbent-benchmark-adoption-metrics)
**Consumed by:** W3-009 (GUI runner), TL (acceptance)
**Write surface:** `packages/agent/src/persona-*.ts`, `docs/simulations/personas/**`

This document is the human-readable schema spec for the W2-009 contract. The
authoritative source is the TypeScript types in `packages/agent/src/persona-types.ts`
re-exported through `packages/agent/src/contract.w2-009.ts` → `contract.ts` →
`index.ts`. W3 imports from `@unicom/agent` only.

## 1. Cohort scale (frozen)

| Metric | Value |
| --- | --- |
| Industries | 13 |
| Firm sizes | 3 (small / medium / large) |
| Firms | 39 (= 13 × 3) |
| Projects per firm | 200 |
| Project runs (total) | 7800 |
| Personas per small firm | 25 |
| Personas per medium firm | 150 |
| Personas per large firm | 1000 |
| **Total personas** | **15275** (= 13 × (25 + 150 + 1,000)) |

Reconciliation is enforced in code (`generatePersonaCohort()` throws on
mismatch) and in tests (`w2-009-cohort.test.ts`).

## 2. Role families (9)

- `procurement`
- `project-program-mgmt`
- `field-ops`
- `finance-accounting`
- `sales`
- `it`
- `compliance-audit`
- `approver-executive`
- `industry-specialist`

8 base families + 1 `industry-specialist` family with industry-specific
titles (e.g. "Site Superintendent" for construction, "Contracting Officer
(KO)" for defense, "Store Manager" for supermarket).

Every firm cohort has at least 8 role families represented; medium and large
firms cover all 9. Population assumptions per (industry, firm-size) are
declared in `persona-population.ts` and reconciled to exact cohort sizes
using the largest-remainder (Hamilton) method.

## 3. Persona record (the W3-consumed contract)

```typescript
interface Persona {
  personaId: string;            // stable: `persona:<firmId>:<roleFamily>:<index>`
  firmId: string;               // `firm:<industry>:<size>`
  industry: Industry;
  firmSize: FirmSize;
  roleFamily: RoleFamily;
  roleTitle: string;            // industry-specific for industry-specialist
  seniority: "individual" | "manager" | "director" | "executive";
  // Normalized [0,1] attributes (declared windows per role family):
  toolFamiliarity: number;          // familiarity with incumbent stack
  rolePermissionScore: number;      // authority breadth for in-scope tasks
  costSensitivity: number;          // TCO sensitivity
  riskTolerance: number;            // willingness to adopt before peers
  switchingCost: number;            // friction of moving off incumbents
  trainingAvailability: number;     // capacity to learn a new tool
  complianceSensitivity: number;    // weight given to compliance findings
  trustThreshold: number;           // min UNiCOM trust required to consider
  preferredWorkflow: "single-tool" | "specialist-stack" | "spreadsheet" | "mixed";
  rolePermissions: string[];        // commerce capability scopes
  portfolioExposure: string[];      // W1-009 project seeds this persona touches
  applicableJourneys: JourneyFamily[];  // V3-EXPERIMENT-PROTOCOL §10 families
  seed: string;                     // `w2-009:persona:<firmId>:<roleFamily>:<index>`
}
```

**Persona autonomy law:** no field encodes a UNiCOM preference. The cohort is
generated BEFORE any UNiCOM GUI outcome exists. Adoption scores are computed
afterwards from GUI outcomes (supplied by W3) — see §5.

## 4. Journey families (19, from V3-EXPERIMENT-PROTOCOL §10)

- `buyer-intent-canvas`
- `compare-sellers`
- `buy-vs-wait-negotiate`
- `existing-groupbuy-discovery`
- `latent-demand-groupbuy`
- `rent-borrow-vs-buy`
- `resale-rental-consignment`
- `proactive-opportunities`
- `multi-hop-tradecycle`
- `merchant-lifecycle`
- `supplier-procurement-lifecycle`
- `b2b-multi-location`
- `autonomous-store-runtime`
- `commerce-twin-whatif`
- `connector-discovery-execution`
- `no-rfid-physical-retail`
- `commerce-trust-security`
- `failure-recovery`
- `feature-discovery`

Every persona has `feature-discovery` in their applicable set (first-discovery
is mandatory for every scored persona). Supermarket personas additionally
include `no-rfid-physical-retail`. Coverage across the campaign ensures every
journey family appears in at least one industry cohort.

## 5. Adoption scoring contract (frozen)

### 5.1 Frozen score weights (sum = 1.00)

| Component | Weight |
| --- | --- |
| `journeyCompletion` | 0.3 |
| `usabilityFriction` | 0.15 |
| `outcomeVsBenchmark` | 0.2 |
| `trustProof` | 0.15 |
| `integrationQuality` | 0.1 |
| `switchingCostFit` | 0.05 |
| `preferenceFit` | 0.05 |

### 5.2 Frozen thresholds

| Threshold | Value | Applies to |
| --- | --- | --- |
| FULL_SWITCH_THRESHOLD | 65 | (b) simulated willingness to switch |
| MAIN_INTERFACE_THRESHOLD | 55 | (d) simulated willingness to use as main |
| FULL_SWITCH_JOURNEY_COMPLETION_FLOOR | 1 | (a) technical full-switch eligibility |
| MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR | 0.8 | (c) main-interface eligibility |

### 5.3 Critical-failure veto (overrides weighted score)

Any of these categories, observed during a persona's journeys, VETO all four
adoption outputs — regardless of the weighted score:

- `security`
- `authority`
- `financial-truth`
- `privacy`
- `data-integrity`

A vetoed persona is NOT eligible for (a) or (c) and NOT willing for (b) or
(d), and the score is reported as 0.

### 5.4 Reason codes (concise; no chain-of-thought)

- `capability-gap`
- `ui-friction`
- `trust-compliance`
- `price-cost`
- `integration-readiness`
- `training-switch-cost`
- `preference`

### 5.5 Evidence classes

| Class | Meaning | Supports performance/superiority claims? |
| --- | --- | --- |
| A | Authorized direct UI trial | Yes |
| B | Official interactive demo/UI observed | Yes |
| C | Official documentation capability checklist | No |
| D | Unverified/inaccessible/hearsay | **No — excluded from superiority claims** |

When the W3 runner cannot access an incumbent's real UI, it must DOWNGRADE
the evidence class to D. The scoring contract zeroes the `outcomeVsBenchmark`
component under class D — no superiority claim can be made against an
unverified incumbent.

### 5.6 The four adoption outputs (never merged)

| ID | Output | Kind | Rule |
| --- | --- | --- | --- |
| (a) | Technical full-switch eligibility | boolean | no veto AND 100% journey completion AND no missing-capability AND no blocker |
| (b) | Simulated willingness to switch completely | boolean + score | no veto AND (a) AND score ≥ 65 |
| (c) | Main-interface eligibility | boolean | no veto AND ≥ 80% journey supervision AND no main-interface blocker |
| (d) | Simulated willingness to use as main interface | boolean + score | no veto AND (c) AND score ≥ 55 |

Each output is reported as **count AND percentage** by industry / firm-size /
role, with the **denominator** preserved (failed/blocked/UNKNOWN personas
remain in the denominator — W2-009 acceptance #6).

## 6. Sensitivity analysis (before baseline)

The charter requires sensitivity analysis BEFORE the baseline is set, and the
FINAL-TL-HANDOFF requires "sensitivity across seeds" in every report.

| Parameter | Value |
| --- | --- |
| SENSITIVITY_SEED_COUNT | 5 |
| SENSITIVITY_PERTURBATION_MAGNITUDE | ±5% |

The cohort itself is FROZEN at W2-009:v1 — only the GUI journey outcomes are
uncertain before the campaign runs. The sensitivity analysis perturbs the
outcomes within declared tolerance bands and reports mean ± stddev per group
key per metric. **Critical-failure vetoes are preserved (not perturbed).**

## 7. Reality/Learning Lab seven-way (separate from adoption)

The seven organization/model archetypes from W2-005 are evaluated for
**decision quality only**. They NEVER confound the GUI adoption score.

| Archetype |
| --- |
| MAIN_AGENT_SKILLS |
| MAIN_AGENT_EPHEMERAL_DELEGATES |
| PROVIDER_NATIVE_OPTIMIZATION |
| SEARCHED_ORGANIZATIONS |
| SYSTEM_1_ONLY |
| SYSTEM_1_JEPA |
| SYSTEM_1_JEPA_SYSTEM_2 |

Decision-quality outcomes are reported ALONGSIDE adoption aggregates, never
merged into the willingness formula. The `AdoptionDecision` type does NOT
carry a decision-quality field.

## 8. Required caveats (every report carries these prominently)

- **Simulated willingness is NOT human survey intent.**
- Later validation with consenting real professionals is required.
- No chain-of-thought capture — reason codes are concise enumerable categories.
- No real personal/patient/financial/privileged/classified data.
- V1/V2 registries are immutable; `v3-simulation-state.json` is TL-only.

## 9. Files

| File | Purpose |
| --- | --- |
| `packages/agent/src/persona-types.ts` | Shared types + frozen enums (lowest layer) |
| `packages/agent/src/persona-cohort.ts` | Cohort generator + reconciliation |
| `packages/agent/src/persona-population.ts` | Population assumptions + role-family attribute biases |
| `packages/agent/src/persona-roles.ts` | Industry-specific role titles, seniority, permissions |
| `packages/agent/src/persona-journeys.ts` | Journey applicability per (industry, role) |
| `packages/agent/src/persona-incumbent-stacks.ts` | Commerce-only incumbent matrix |
| `packages/agent/src/persona-scoring.ts` | `computeAdoptionDecision` — frozen weights, thresholds, veto |
| `packages/agent/src/persona-aggregation.ts` | `aggregateAdoption` by industry/firm-size/role |
| `packages/agent/src/persona-decision-quality.ts` | Reality/Lab seven-way (separate from adoption) |
| `packages/agent/src/persona-sensitivity.ts` | Cohort-seed sensitivity analysis |
| `packages/agent/src/contract.w2-009.ts` | Public re-export artifact |
| `packages/agent/test/w2-009-cohort.test.ts` | Cohort scale, role coverage, determinism tests |
| `packages/agent/test/w2-009-scoring.test.ts` | Score-direction fixtures, veto, four outputs tests |
| `packages/agent/test/w2-009-sensitivity.test.ts` | Sensitivity + Reality/Lab separation tests |
| `docs/simulations/personas/cohort-manifest.json` | 39 firms with stacks + population assumptions |
| `docs/simulations/personas/adoption-contract.json` | Frozen weights/thresholds/evidence classes |
| `docs/simulations/personas/SCHEMA.md` | This document |
