/**
 * W2-009 — Synthetic Professional Persona Cohort (frozen, deterministic).
 *
 * This module is the W2-009 contract surface that W3-009 (GUI runner)
 * consumes: persona records, firm cohort definitions, role coverage,
 * incumbent stack selection, and population assumptions.
 *
 * Types and frozen enums live in persona-types.ts (lowest layer, no
 * persona-* imports). Static tables (role titles, journey applicability,
 * population assumptions, incumbent matrix) live in sibling files. This
 * file owns: the deterministic generator + cohort reconciliation.
 *
 * Laws (docs/work-orders/W2-009.md + FINAL-TL-HANDOFF-V3-SIMULATIONS):
 * 1. Determinism: same seed → same persona records. NO Math.random, NO wall
 *    clock. The SeededRandom from sim-random.ts is the only entropy source.
 * 2. Exact scale: 13 industries × 3 sizes = 39 firms; cohort sizes 25 / 150 /
 *    1,000 → exactly 15,275 personas. Reconciliation is enforced in code and
 *    in tests; partial cohorts are NEVER silently produced.
 * 3. Commerce-only: every firm's incumbent stack is selected from the
 *    V3-INDUSTRY-AND-COMPETITOR-MATRIX commerce-only rows. General industry
 *    platforms (Autodesk/Procore/EHR/dispatch/creative/legal/defense) are
 *    context, not competitors; they never appear as scored incumbents.
 * 4. Persona autonomy: a persona may REJECT UNiCOM. The cohort is generated
 *    BEFORE any UNiCOM GUI outcome exists; adoption scores are computed
 *    afterwards in persona-scoring.ts. No field here encodes a UNiCOM
 *    preference.
 * 5. Population assumptions are declared per firm size — not inferred from
 *    role titles or industry hearsay.
 * 6. No real personal/patient/financial/privileged/classified data. Every
 *    name, ID and attribute is synthetic and reproducible from a seed.
 */

import { SeededRandom } from "./sim-random.js";
import { roleFamilyAttributeBias, populationAssumptionsFor } from "./persona-population.js";
import { roleTitleFor, seniorityFor, rolePermissionsFor } from "./persona-roles.js";
import { applicableJourneysFor, portfolioExposureFor } from "./persona-journeys.js";
import { incumbentStackFor } from "./persona-incumbent-stacks.js";

// Re-export the shared types + frozen enums (persona-types is the low layer).
export * from "./persona-types.js";

// Import types for use below.
import type {
  FirmCohort,
  FirmSize,
  Industry,
  Persona,
  PreferredWorkflow,
  RoleFamily,
} from "./persona-types.js";
import {
  FIRM_SIZES,
  FIRM_SIZE_COHORT,
  INDUSTRIES,
  ROLE_FAMILIES,
} from "./persona-types.js";

// ---------------------------------------------------------------------------
// Cohort manifest — the 39 firms
// ---------------------------------------------------------------------------

export function buildFirmCohortManifest(): readonly FirmCohort[] {
  const firms: FirmCohort[] = [];
  for (const industry of INDUSTRIES) {
    for (const firmSize of FIRM_SIZES) {
      firms.push(buildFirmCohort(industry, firmSize));
    }
  }
  return firms;
}

export function buildFirmCohort(industry: Industry, firmSize: FirmSize): FirmCohort {
  const firmId = `firm:${industry}:${firmSize}`;
  const cohortSize = FIRM_SIZE_COHORT[firmSize];
  const seed = `w2-009:${firmId}`;
  return {
    firmId,
    industry,
    firmSize,
    cohortSize,
    incumbentStack: incumbentStackFor(industry, firmSize),
    populationAssumptions: populationAssumptionsFor(industry, firmSize),
    seed,
  };
}

// ---------------------------------------------------------------------------
// Persona generation — exactly 15,275 seeded records
// ---------------------------------------------------------------------------

/**
 * Generate all 15,275 personas across the 39 firms. Deterministic. Throws if
 * the reconciled count is not exactly 15,275 — partial cohorts are NEVER
 * silently produced.
 */
export function generatePersonaCohort(): readonly Persona[] {
  const firms = buildFirmCohortManifest();
  const personas: Persona[] = [];
  for (const firm of firms) {
    personas.push(...generateFirmPersonas(firm));
  }
  if (personas.length !== 15_275) {
    throw new Error(
      `cohort reconciliation failed: produced ${personas.length}, expected 15_275`,
    );
  }
  return personas;
}

/**
 * Generate personas for one firm, distributed across role families using the
 * firm's declared population assumptions. Uses the largest-remainder method
 * (Hamilton) so the cohort size is exact, not approximate.
 */
export function generateFirmPersonas(firm: FirmCohort): readonly Persona[] {
  const allocations = allocateRoleCounts(firm.populationAssumptions, firm.cohortSize);
  const personas: Persona[] = [];
  for (const [roleFamily, count] of Object.entries(allocations) as Array<
    [RoleFamily, number]
  >) {
    for (let index = 0; index < count; index += 1) {
      personas.push(generatePersona(firm, roleFamily, index));
    }
  }
  if (personas.length !== firm.cohortSize) {
    throw new Error(
      `firm cohort size mismatch for ${firm.firmId}: produced ${personas.length}, expected ${firm.cohortSize}`,
    );
  }
  return personas;
}

/** Largest-remainder allocation: weights sum to 1, target counts sum to total. */
function allocateRoleCounts(
  weights: Readonly<Record<RoleFamily, number>>,
  total: number,
): Record<RoleFamily, number> {
  const entries = ROLE_FAMILIES.map((role) => [role, weights[role] ?? 0] as const);
  const weightSum = entries.reduce((sum, [, w]) => sum + w, 0);
  if (weightSum <= 0) {
    throw new Error("population assumption weights must sum > 0");
  }
  const normalized = entries.map(([role, w]) => ({ role, quota: (w * total) / weightSum }));
  const floorAllocation = new Map<RoleFamily, number>();
  let allocated = 0;
  const remainders: Array<{ role: RoleFamily; remainder: number }> = [];
  for (const { role, quota } of normalized) {
    const floor = Math.floor(quota);
    floorAllocation.set(role, floor);
    allocated += floor;
    remainders.push({ role, remainder: quota - floor });
  }
  remainders.sort((a, b) => b.remainder - a.remainder);
  let leftover = total - allocated;
  let cursor = 0;
  while (leftover > 0 && cursor < remainders.length) {
    const { role } = remainders[cursor]!;
    floorAllocation.set(role, (floorAllocation.get(role) ?? 0) + 1);
    leftover -= 1;
    cursor += 1;
  }
  if (leftover !== 0) {
    throw new Error(`role allocation failed: ${leftover} unallocated after largest-remainder`);
  }
  const result = {} as Record<RoleFamily, number>;
  for (const role of ROLE_FAMILIES) result[role] = floorAllocation.get(role) ?? 0;
  return result;
}

/** Generate one persona. Deterministic from (firm, role, index). */
export function generatePersona(
  firm: FirmCohort,
  roleFamily: RoleFamily,
  index: number,
): Persona {
  const personaId = `persona:${firm.firmId}:${roleFamily}:${index}`;
  const seed = `w2-009:${personaId}`;
  const rng = SeededRandom.fromSeed(seed);
  const roleTitle = roleTitleFor(firm.industry, roleFamily, index);
  const seniority = seniorityFor(roleFamily, index, firm.firmSize, rng);
  const rolePermissions = rolePermissionsFor(firm.industry, roleFamily, seniority);
  const applicableJourneys = applicableJourneysFor(firm.industry, roleFamily);
  const portfolioExposure = portfolioExposureFor(firm, rng);
  const draw = (min: number, max: number) =>
    min + (rng.nextUint32() / 0x1_0000_0000) * (max - min);
  const bias = roleFamilyAttributeBias(roleFamily, firm.firmSize);
  return {
    personaId,
    firmId: firm.firmId,
    industry: firm.industry,
    firmSize: firm.firmSize,
    roleFamily,
    roleTitle,
    seniority,
    toolFamiliarity: clamp01(draw(bias.toolFamiliarityMin, bias.toolFamiliarityMax)),
    rolePermissionScore: clamp01(draw(bias.permissionMin, bias.permissionMax)),
    costSensitivity: clamp01(draw(bias.costSensitivityMin, bias.costSensitivityMax)),
    riskTolerance: clamp01(draw(bias.riskToleranceMin, bias.riskToleranceMax)),
    switchingCost: clamp01(draw(bias.switchingCostMin, bias.switchingCostMax)),
    trainingAvailability: clamp01(
      draw(bias.trainingAvailabilityMin, bias.trainingAvailabilityMax),
    ),
    complianceSensitivity: clamp01(
      draw(bias.complianceSensitivityMin, bias.complianceSensitivityMax),
    ),
    trustThreshold: clamp01(draw(bias.trustThresholdMin, bias.trustThresholdMax)),
    preferredWorkflow: preferredWorkflowFor(rng, firm.firmSize, roleFamily),
    rolePermissions,
    portfolioExposure,
    applicableJourneys,
    seed,
  };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function preferredWorkflowFor(
  rng: SeededRandom,
  firmSize: FirmSize,
  roleFamily: RoleFamily,
): PreferredWorkflow {
  const draw = rng.nextUint32() / 0x1_0000_0000;
  if (roleFamily === "it" || roleFamily === "approver-executive") {
    return draw < 0.6 ? "single-tool" : draw < 0.85 ? "mixed" : "specialist-stack";
  }
  if (firmSize === "small") {
    return draw < 0.4 ? "spreadsheet" : draw < 0.7 ? "single-tool" : "mixed";
  }
  if (firmSize === "medium") {
    return draw < 0.45 ? "specialist-stack" : draw < 0.75 ? "single-tool" : "mixed";
  }
  return draw < 0.55 ? "specialist-stack" : draw < 0.85 ? "mixed" : "single-tool";
}
