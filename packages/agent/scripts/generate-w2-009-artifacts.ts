/**
 * W2-009 — generate the cohort manifest + frozen adoption contract artifacts
 * under docs/simulations/personas/. Run via:
 *   npx tsx packages/agent/scripts/generate-w2-009-artifacts.ts
 *
 * Produces:
 *   docs/simulations/personas/cohort-manifest.json  — 39 firms with cohort
 *     sizes, incumbent stacks (commerce-only), evidence classes, population
 *     assumptions, and reconciliation to 15,275 personas.
 *   docs/simulations/personas/adoption-contract.json — frozen weights,
 *     thresholds, reason codes, critical-failure categories, evidence-class
 *     definitions, and the four adoption output definitions.
 *   docs/simulations/personas/SCHEMA.md — human-readable schema spec for W3.
 *
 * Law: deterministic. No clocks, no Math.random. The artifacts are the
 * frozen contract identifiers; the actual adoption VALUES come from the
 * campaign run, not from this generator.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFirmCohortManifest,
  FIRM_SIZE_COHORT,
  FIRM_SIZES,
  INDUSTRIES,
  JOURNEY_FAMILIES,
  ROLE_FAMILIES,
  generateFirmPersonas,
  generatePersonaCohort,
  TOTAL_FIRM_TARGET,
  TOTAL_INDUSTRY_TARGET,
  TOTAL_PERSONA_TARGET,
  TOTAL_PROJECT_TARGET,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  MAIN_INTERFACE_THRESHOLD,
  REASON_CODES,
  CRITICAL_FAILURE_CATEGORIES,
  SCORING_CONTRACT_VERSION,
  SCORE_COMPONENTS,
  SENSITIVITY_PERTURBATION_MAGNITUDE,
  SENSITIVITY_SEED_COUNT,
} from "../src/index.js";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

interface CohortManifestEntry {
  firmId: string;
  industry: string;
  firmSize: string;
  cohortSize: number;
  seed: string;
  incumbentStack: Array<{
    capability: string;
    incumbent: string;
    editionOrAccess: string;
    evidenceClass: string;
  }>;
  populationAssumptions: Record<string, number>;
  roleAllocation: Record<string, number>;
}

function generateCohortManifest() {
  const firms = buildFirmCohortManifest();
  const entries: CohortManifestEntry[] = firms.map((firm) => {
    const personas = generateFirmPersonas(firm);
    const roleAllocation: Record<string, number> = {};
    for (const role of ROLE_FAMILIES) {
      roleAllocation[role] = personas.filter((p) => p.roleFamily === role).length;
    }
    return {
      firmId: firm.firmId,
      industry: firm.industry,
      firmSize: firm.firmSize,
      cohortSize: firm.cohortSize,
      seed: firm.seed,
      incumbentStack: firm.incumbentStack.map((e) => ({
        capability: e.capability,
        incumbent: e.incumbent,
        editionOrAccess: e.editionOrAccess,
        evidenceClass: e.evidenceClass,
      })),
      populationAssumptions: { ...firm.populationAssumptions },
      roleAllocation,
    };
  });
  return entries;
}

function generateAdoptionContract() {
  return {
    scoringContractVersion: SCORING_CONTRACT_VERSION,
    frozenScoreWeights: FROZEN_SCORE_WEIGHTS,
    scoreComponents: SCORE_COMPONENTS,
    thresholds: {
      fullSwitchThreshold: FULL_SWITCH_THRESHOLD,
      mainInterfaceThreshold: MAIN_INTERFACE_THRESHOLD,
      fullSwitchJourneyCompletionFloor: FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
      mainInterfaceJourneySupervisionFloor: MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
    },
    criticalFailureCategories: CRITICAL_FAILURE_CATEGORIES,
    reasonCodes: REASON_CODES,
    evidenceClasses: [
      {
        code: "A",
        label: "Authorized direct UI trial",
        supportsPerformanceClaims: true,
      },
      {
        code: "B",
        label: "Official interactive demo/UI observed",
        supportsPerformanceClaims: true,
      },
      {
        code: "C",
        label: "Official documentation capability checklist only",
        supportsPerformanceClaims: false,
      },
      {
        code: "D",
        label: "Unverified/inaccessible/hearsay",
        supportsPerformanceClaims: false,
      },
    ],
    fourAdoptionOutputs: [
      {
        id: "a",
        label: "Technical full-switch eligibility",
        kind: "boolean",
        rule:
          "no critical-failure veto AND all applicable journeys discoverable+completable AND no missing-capability reason codes AND no blocker reason codes",
      },
      {
        id: "b",
        label: "Simulated stated willingness to switch completely",
        kind: "boolean + score (0..100)",
        rule:
          "no veto AND technical-full-switch-eligible AND weighted score >= FULL_SWITCH_THRESHOLD (65)",
      },
      {
        id: "c",
        label: "Main-interface eligibility",
        kind: "boolean",
        rule:
          "no veto AND >= 80% of applicable journeys can start/be supervised from UNiCOM AND no main-interface-blocking reason codes",
      },
      {
        id: "d",
        label: "Simulated stated willingness to use as main interface",
        kind: "boolean + score (0..100)",
        rule:
          "no veto AND main-interface-eligible AND weighted score >= MAIN_INTERFACE_THRESHOLD (55)",
      },
    ],
    sensitivity: {
      seedCount: SENSITIVITY_SEED_COUNT,
      perturbationMagnitude: SENSITIVITY_PERTURBATION_MAGNITUDE,
      note:
        "Critical-failure vetoes are preserved (not perturbed). Components stay in [0,1].",
    },
    realityLabSeparation: {
      law:
        "The seven Reality/Learning Lab organization/model configurations are evaluated for DECISION QUALITY ONLY. They NEVER confound the GUI adoption score. A persona's adoption decision is computed from GUI outcomes only; decision-quality outcomes are reported alongside but do NOT enter the willingness formula.",
      archetypes: [
        "MAIN_AGENT_SKILLS",
        "MAIN_AGENT_EPHEMERAL_DELEGATES",
        "PROVIDER_NATIVE_OPTIMIZATION",
        "SEARCHED_ORGANIZATIONS",
        "SYSTEM_1_ONLY",
        "SYSTEM_1_JEPA",
        "SYSTEM_1_JEPA_SYSTEM_2",
      ],
    },
    caveats: [
      "Simulated willingness is NOT human survey intent.",
      "Every report must carry this caveat prominently.",
      "Later validation with consenting real professionals is required.",
      "No chain-of-thought capture — reason codes are concise enumerable categories only.",
      "No real personal/patient/financial/privileged/classified data.",
      "V1/V2 registries are immutable; v3-simulation-state.json is TL-only.",
    ],
  };
}

function generateSchemaDoc(): string {
  return `# W2-009 — Persona + Adoption Scoring Schema (frozen v1)

**Status:** FROZEN at SCORING_CONTRACT_VERSION = \`${SCORING_CONTRACT_VERSION}\`
**Authors:** Worker-2 lane (persona-incumbent-benchmark-adoption-metrics)
**Consumed by:** W3-009 (GUI runner), TL (acceptance)
**Write surface:** \`packages/agent/src/persona-*.ts\`, \`docs/simulations/personas/**\`

This document is the human-readable schema spec for the W2-009 contract. The
authoritative source is the TypeScript types in \`packages/agent/src/persona-types.ts\`
re-exported through \`packages/agent/src/contract.w2-009.ts\` → \`contract.ts\` →
\`index.ts\`. W3 imports from \`@unicom/agent\` only.

## 1. Cohort scale (frozen)

| Metric | Value |
| --- | --- |
| Industries | ${TOTAL_INDUSTRY_TARGET} |
| Firm sizes | ${FIRM_SIZES.length} (small / medium / large) |
| Firms | ${TOTAL_FIRM_TARGET} (= 13 × 3) |
| Projects per firm | 200 |
| Project runs (total) | ${TOTAL_PROJECT_TARGET} |
| Personas per small firm | ${FIRM_SIZE_COHORT.small} |
| Personas per medium firm | ${FIRM_SIZE_COHORT.medium} |
| Personas per large firm | ${FIRM_SIZE_COHORT.large} |
| **Total personas** | **${TOTAL_PERSONA_TARGET}** (= 13 × (25 + 150 + 1,000)) |

Reconciliation is enforced in code (\`generatePersonaCohort()\` throws on
mismatch) and in tests (\`w2-009-cohort.test.ts\`).

## 2. Role families (9)

${ROLE_FAMILIES.map((r) => `- \`${r}\``).join("\n")}

8 base families + 1 \`industry-specialist\` family with industry-specific
titles (e.g. "Site Superintendent" for construction, "Contracting Officer
(KO)" for defense, "Store Manager" for supermarket).

Every firm cohort has at least 8 role families represented; medium and large
firms cover all 9. Population assumptions per (industry, firm-size) are
declared in \`persona-population.ts\` and reconciled to exact cohort sizes
using the largest-remainder (Hamilton) method.

## 3. Persona record (the W3-consumed contract)

\`\`\`typescript
interface Persona {
  personaId: string;            // stable: \`persona:<firmId>:<roleFamily>:<index>\`
  firmId: string;               // \`firm:<industry>:<size>\`
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
  seed: string;                     // \`w2-009:persona:<firmId>:<roleFamily>:<index>\`
}
\`\`\`

**Persona autonomy law:** no field encodes a UNiCOM preference. The cohort is
generated BEFORE any UNiCOM GUI outcome exists. Adoption scores are computed
afterwards from GUI outcomes (supplied by W3) — see §5.

## 4. Journey families (19, from V3-EXPERIMENT-PROTOCOL §10)

${JOURNEY_FAMILIES.map((j) => `- \`${j}\``).join("\n")}

Every persona has \`feature-discovery\` in their applicable set (first-discovery
is mandatory for every scored persona). Supermarket personas additionally
include \`no-rfid-physical-retail\`. Coverage across the campaign ensures every
journey family appears in at least one industry cohort.

## 5. Adoption scoring contract (frozen)

### 5.1 Frozen score weights (sum = 1.00)

| Component | Weight |
| --- | --- |
${SCORE_COMPONENTS.map((c) => `| \`${c}\` | ${FROZEN_SCORE_WEIGHTS[c]} |`).join("\n")}

### 5.2 Frozen thresholds

| Threshold | Value | Applies to |
| --- | --- | --- |
| FULL_SWITCH_THRESHOLD | ${FULL_SWITCH_THRESHOLD} | (b) simulated willingness to switch |
| MAIN_INTERFACE_THRESHOLD | ${MAIN_INTERFACE_THRESHOLD} | (d) simulated willingness to use as main |
| FULL_SWITCH_JOURNEY_COMPLETION_FLOOR | ${FULL_SWITCH_JOURNEY_COMPLETION_FLOOR} | (a) technical full-switch eligibility |
| MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR | ${MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR} | (c) main-interface eligibility |

### 5.3 Critical-failure veto (overrides weighted score)

Any of these categories, observed during a persona's journeys, VETO all four
adoption outputs — regardless of the weighted score:

${CRITICAL_FAILURE_CATEGORIES.map((c) => `- \`${c}\``).join("\n")}

A vetoed persona is NOT eligible for (a) or (c) and NOT willing for (b) or
(d), and the score is reported as 0.

### 5.4 Reason codes (concise; no chain-of-thought)

${REASON_CODES.map((c) => `- \`${c}\``).join("\n")}

### 5.5 Evidence classes

| Class | Meaning | Supports performance/superiority claims? |
| --- | --- | --- |
| A | Authorized direct UI trial | Yes |
| B | Official interactive demo/UI observed | Yes |
| C | Official documentation capability checklist | No |
| D | Unverified/inaccessible/hearsay | **No — excluded from superiority claims** |

When the W3 runner cannot access an incumbent's real UI, it must DOWNGRADE
the evidence class to D. The scoring contract zeroes the \`outcomeVsBenchmark\`
component under class D — no superiority claim can be made against an
unverified incumbent.

### 5.6 The four adoption outputs (never merged)

| ID | Output | Kind | Rule |
| --- | --- | --- | --- |
| (a) | Technical full-switch eligibility | boolean | no veto AND 100% journey completion AND no missing-capability AND no blocker |
| (b) | Simulated willingness to switch completely | boolean + score | no veto AND (a) AND score ≥ ${FULL_SWITCH_THRESHOLD} |
| (c) | Main-interface eligibility | boolean | no veto AND ≥ 80% journey supervision AND no main-interface blocker |
| (d) | Simulated willingness to use as main interface | boolean + score | no veto AND (c) AND score ≥ ${MAIN_INTERFACE_THRESHOLD} |

Each output is reported as **count AND percentage** by industry / firm-size /
role, with the **denominator** preserved (failed/blocked/UNKNOWN personas
remain in the denominator — W2-009 acceptance #6).

## 6. Sensitivity analysis (before baseline)

The charter requires sensitivity analysis BEFORE the baseline is set, and the
FINAL-TL-HANDOFF requires "sensitivity across seeds" in every report.

| Parameter | Value |
| --- | --- |
| SENSITIVITY_SEED_COUNT | ${SENSITIVITY_SEED_COUNT} |
| SENSITIVITY_PERTURBATION_MAGNITUDE | ±${(SENSITIVITY_PERTURBATION_MAGNITUDE * 100).toFixed(0)}% |

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
merged into the willingness formula. The \`AdoptionDecision\` type does NOT
carry a decision-quality field.

## 8. Required caveats (every report carries these prominently)

- **Simulated willingness is NOT human survey intent.**
- Later validation with consenting real professionals is required.
- No chain-of-thought capture — reason codes are concise enumerable categories.
- No real personal/patient/financial/privileged/classified data.
- V1/V2 registries are immutable; \`v3-simulation-state.json\` is TL-only.

## 9. Files

| File | Purpose |
| --- | --- |
| \`packages/agent/src/persona-types.ts\` | Shared types + frozen enums (lowest layer) |
| \`packages/agent/src/persona-cohort.ts\` | Cohort generator + reconciliation |
| \`packages/agent/src/persona-population.ts\` | Population assumptions + role-family attribute biases |
| \`packages/agent/src/persona-roles.ts\` | Industry-specific role titles, seniority, permissions |
| \`packages/agent/src/persona-journeys.ts\` | Journey applicability per (industry, role) |
| \`packages/agent/src/persona-incumbent-stacks.ts\` | Commerce-only incumbent matrix |
| \`packages/agent/src/persona-scoring.ts\` | \`computeAdoptionDecision\` — frozen weights, thresholds, veto |
| \`packages/agent/src/persona-aggregation.ts\` | \`aggregateAdoption\` by industry/firm-size/role |
| \`packages/agent/src/persona-decision-quality.ts\` | Reality/Lab seven-way (separate from adoption) |
| \`packages/agent/src/persona-sensitivity.ts\` | Cohort-seed sensitivity analysis |
| \`packages/agent/src/contract.w2-009.ts\` | Public re-export artifact |
| \`packages/agent/test/w2-009-cohort.test.ts\` | Cohort scale, role coverage, determinism tests |
| \`packages/agent/test/w2-009-scoring.test.ts\` | Score-direction fixtures, veto, four outputs tests |
| \`packages/agent/test/w2-009-sensitivity.test.ts\` | Sensitivity + Reality/Lab separation tests |
| \`docs/simulations/personas/cohort-manifest.json\` | 39 firms with stacks + population assumptions |
| \`docs/simulations/personas/adoption-contract.json\` | Frozen weights/thresholds/evidence classes |
| \`docs/simulations/personas/SCHEMA.md\` | This document |
`;
}

function main() {
  const manifest = generateCohortManifest();
  const total = manifest.reduce((s, f) => s + f.cohortSize, 0);
  const manifestPayload = {
    schemaVersion: SCORING_CONTRACT_VERSION,
    generatedAt: "2026-10-09T00:00:00.000Z", // frozen campaign activation timestamp
    description:
      "W2-009 cohort manifest: 39 firms with commerce-only incumbent stacks, population assumptions, and reconciliation to 15,275 personas.",
    totals: {
      industries: TOTAL_INDUSTRY_TARGET,
      firmSizes: FIRM_SIZES.length,
      firms: TOTAL_FIRM_TARGET,
      projectsPerFirm: 200,
      projectRuns: TOTAL_PROJECT_TARGET,
      personasPerSmallFirm: FIRM_SIZE_COHORT.small,
      personasPerMediumFirm: FIRM_SIZE_COHORT.medium,
      personasPerLargeFirm: FIRM_SIZE_COHORT.large,
      totalPersonas: total,
      expectedTotalPersonas: TOTAL_PERSONA_TARGET,
      reconciled: total === TOTAL_PERSONA_TARGET,
    },
    firms: manifest,
  };

  const contractPayload = generateAdoptionContract();
  const schemaDoc = generateSchemaDoc();

  const manifestPath = resolve(REPO_ROOT, "docs/simulations/personas/cohort-manifest.json");
  const contractPath = resolve(REPO_ROOT, "docs/simulations/personas/adoption-contract.json");
  const schemaPath = resolve(REPO_ROOT, "docs/simulations/personas/SCHEMA.md");

  writeFileSync(manifestPath, JSON.stringify(manifestPayload, null, 2) + "\n");
  writeFileSync(contractPath, JSON.stringify(contractPayload, null, 2) + "\n");
  writeFileSync(schemaPath, schemaDoc);

  // Reconciliation check.
  if (total !== TOTAL_PERSONA_TARGET) {
    throw new Error(`cohort reconciliation failed: ${total} != ${TOTAL_PERSONA_TARGET}`);
  }
  console.log(`W2-009 artifacts generated:`);
  console.log(`  ${manifestPath} (firms=${manifest.length}, totalPersonas=${total})`);
  console.log(`  ${contractPath}`);
  console.log(`  ${schemaPath}`);
}

main();
