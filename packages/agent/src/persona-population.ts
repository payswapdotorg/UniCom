/**
 * W2-009 — Population assumptions and per-role-family attribute biases.
 *
 * Split out of persona-cohort.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module. The persona generator consumes
 * these to draw attribute values for each synthetic persona.
 *
 * Law: attribute biases describe the persona's posture toward the incumbent
 * stack and toward switching in general. They do NOT encode a UNiCOM
 * preference. UNiCOM outcomes come from the GUI runner, not from this bias.
 */

import type { FirmSize, Industry, RoleFamily } from "./persona-types.js";
import { ROLE_FAMILIES } from "./persona-types.js";

export interface RoleFamilyBias {
  toolFamiliarityMin: number; toolFamiliarityMax: number;
  permissionMin: number; permissionMax: number;
  costSensitivityMin: number; costSensitivityMax: number;
  riskToleranceMin: number; riskToleranceMax: number;
  switchingCostMin: number; switchingCostMax: number;
  trainingAvailabilityMin: number; trainingAvailabilityMax: number;
  complianceSensitivityMin: number; complianceSensitivityMax: number;
  trustThresholdMin: number; trustThresholdMax: number;
}

export function roleFamilyAttributeBias(
  roleFamily: RoleFamily,
  firmSize: FirmSize,
): RoleFamilyBias {
  const sizeBoost = firmSize === "large" ? 0.05 : firmSize === "small" ? -0.05 : 0;
  switch (roleFamily) {
    case "procurement":
      return {
        toolFamiliarityMin: 0.55 + sizeBoost, toolFamiliarityMax: 0.95 + sizeBoost,
        permissionMin: 0.55, permissionMax: 0.9,
        costSensitivityMin: 0.5, costSensitivityMax: 0.9,
        riskToleranceMin: 0.25, riskToleranceMax: 0.6,
        switchingCostMin: 0.4, switchingCostMax: 0.75,
        trainingAvailabilityMin: 0.4, trainingAvailabilityMax: 0.75,
        complianceSensitivityMin: 0.5, complianceSensitivityMax: 0.85,
        trustThresholdMin: 0.55, trustThresholdMax: 0.85,
      };
    case "approver-executive":
      return {
        toolFamiliarityMin: 0.4, toolFamiliarityMax: 0.75,
        permissionMin: 0.85, permissionMax: 1.0,
        costSensitivityMin: 0.55, costSensitivityMax: 0.95,
        riskToleranceMin: 0.15, riskToleranceMax: 0.45,
        switchingCostMin: 0.55, switchingCostMax: 0.9,
        trainingAvailabilityMin: 0.25, trainingAvailabilityMax: 0.55,
        complianceSensitivityMin: 0.7, complianceSensitivityMax: 0.95,
        trustThresholdMin: 0.65, trustThresholdMax: 0.95,
      };
    case "compliance-audit":
      return {
        toolFamiliarityMin: 0.5, toolFamiliarityMax: 0.85,
        permissionMin: 0.45, permissionMax: 0.7,
        costSensitivityMin: 0.35, costSensitivityMax: 0.7,
        riskToleranceMin: 0.1, riskToleranceMax: 0.35,
        switchingCostMin: 0.55, switchingCostMax: 0.9,
        trainingAvailabilityMin: 0.35, trainingAvailabilityMax: 0.7,
        complianceSensitivityMin: 0.85, complianceSensitivityMax: 1.0,
        trustThresholdMin: 0.7, trustThresholdMax: 0.95,
      };
    case "finance-accounting":
      return {
        toolFamiliarityMin: 0.5, toolFamiliarityMax: 0.85,
        permissionMin: 0.5, permissionMax: 0.8,
        costSensitivityMin: 0.6, costSensitivityMax: 0.9,
        riskToleranceMin: 0.15, riskToleranceMax: 0.4,
        switchingCostMin: 0.5, switchingCostMax: 0.85,
        trainingAvailabilityMin: 0.4, trainingAvailabilityMax: 0.7,
        complianceSensitivityMin: 0.7, complianceSensitivityMax: 0.95,
        trustThresholdMin: 0.6, trustThresholdMax: 0.9,
      };
    case "sales":
      return {
        toolFamiliarityMin: 0.45, toolFamiliarityMax: 0.85,
        permissionMin: 0.45, permissionMax: 0.75,
        costSensitivityMin: 0.3, costSensitivityMax: 0.6,
        riskToleranceMin: 0.4, riskToleranceMax: 0.7,
        switchingCostMin: 0.35, switchingCostMax: 0.65,
        trainingAvailabilityMin: 0.45, trainingAvailabilityMax: 0.8,
        complianceSensitivityMin: 0.35, complianceSensitivityMax: 0.65,
        trustThresholdMin: 0.4, trustThresholdMax: 0.7,
      };
    case "it":
      return {
        toolFamiliarityMin: 0.65, toolFamiliarityMax: 0.95,
        permissionMin: 0.6, permissionMax: 0.95,
        costSensitivityMin: 0.4, costSensitivityMax: 0.75,
        riskToleranceMin: 0.45, riskToleranceMax: 0.8,
        switchingCostMin: 0.3, switchingCostMax: 0.6,
        trainingAvailabilityMin: 0.6, trainingAvailabilityMax: 0.95,
        complianceSensitivityMin: 0.55, complianceSensitivityMax: 0.85,
        trustThresholdMin: 0.45, trustThresholdMax: 0.75,
      };
    case "field-ops":
      return {
        toolFamiliarityMin: 0.4, toolFamiliarityMax: 0.75,
        permissionMin: 0.4, permissionMax: 0.7,
        costSensitivityMin: 0.45, costSensitivityMax: 0.75,
        riskToleranceMin: 0.3, riskToleranceMax: 0.6,
        switchingCostMin: 0.4, switchingCostMax: 0.75,
        trainingAvailabilityMin: 0.35, trainingAvailabilityMax: 0.65,
        complianceSensitivityMin: 0.45, complianceSensitivityMax: 0.75,
        trustThresholdMin: 0.45, trustThresholdMax: 0.75,
      };
    case "project-program-mgmt":
      return {
        toolFamiliarityMin: 0.5, toolFamiliarityMax: 0.85,
        permissionMin: 0.5, permissionMax: 0.8,
        costSensitivityMin: 0.5, costSensitivityMax: 0.85,
        riskToleranceMin: 0.3, riskToleranceMax: 0.6,
        switchingCostMin: 0.4, switchingCostMax: 0.75,
        trainingAvailabilityMin: 0.4, trainingAvailabilityMax: 0.75,
        complianceSensitivityMin: 0.5, complianceSensitivityMax: 0.8,
        trustThresholdMin: 0.5, trustThresholdMax: 0.8,
      };
    case "industry-specialist":
      return {
        toolFamiliarityMin: 0.55 + sizeBoost, toolFamiliarityMax: 0.95 + sizeBoost,
        permissionMin: 0.5, permissionMax: 0.85,
        costSensitivityMin: 0.45, costSensitivityMax: 0.8,
        riskToleranceMin: 0.25, riskToleranceMax: 0.6,
        switchingCostMin: 0.4, switchingCostMax: 0.75,
        trainingAvailabilityMin: 0.4, trainingAvailabilityMax: 0.75,
        complianceSensitivityMin: 0.5, complianceSensitivityMax: 0.85,
        trustThresholdMin: 0.5, trustThresholdMax: 0.85,
      };
  }
}

/**
 * Declared population assumptions per (industry, firm size): relative weight
 * per role family in the cohort. Reconciliation to exact cohort size uses
 * largest-remainder (Hamilton) in persona-cohort.ts.
 *
 * Industries differ slightly in specialist weight; size shifts weight
 * toward individual contributors (field-ops, sales, industry-specialist)
 * at larger sizes and toward approver-executive at smaller sizes.
 */
export function populationAssumptionsFor(
  industry: Industry,
  firmSize: FirmSize,
): Record<RoleFamily, number> {
  const base: Record<RoleFamily, number> = {
    procurement: 0.16,
    "project-program-mgmt": 0.12,
    "field-ops": 0.14,
    "finance-accounting": 0.1,
    sales: 0.12,
    it: 0.08,
    "compliance-audit": 0.06,
    "approver-executive": 0.06,
    "industry-specialist": 0.16,
  };
  const specialistWeight: Partial<Record<Industry, number>> = {
    construction: 0.2,
    healthcare: 0.22,
    transportation: 0.18,
    hospitality: 0.2,
    fashion: 0.22,
    entertainment: 0.2,
    defense: 0.22,
    manufacturing: 0.2,
    supermarket: 0.22,
  };
  const sp = specialistWeight[industry] ?? 0.16;
  base["industry-specialist"] = sp;
  const sum = ROLE_FAMILIES.reduce((s, r) => s + base[r], 0);
  for (const r of ROLE_FAMILIES) base[r] = base[r] / sum;
  if (firmSize === "small") {
    base["approver-executive"] += 0.05;
    base["field-ops"] -= 0.025;
    base["sales"] -= 0.025;
  } else if (firmSize === "large") {
    base["approver-executive"] -= 0.03;
    base["field-ops"] += 0.02;
    base["sales"] += 0.01;
  }
  const finalSum = ROLE_FAMILIES.reduce((s, r) => s + base[r], 0);
  for (const r of ROLE_FAMILIES) base[r] = base[r] / finalSum;
  return base;
}
