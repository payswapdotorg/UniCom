/**
 * Lab experiment and evaluation contracts (FROZEN-ARCHITECTURE §3.I;
 * invariants 16/32).
 *
 * Promotion of any Lab candidate (organization, model route, skill,
 * security classifier) requires observed outcome evidence: replay,
 * adversarial evaluation, simulation and shadow/canary rollout. Simulation
 * evidence is valid only from the LAB environment — simulation can never be
 * reached as a production provider. Every experiment carries an explicit
 * rollback/retirement path.
 */

export type ExperimentKind = "REPLAY" | "ADVERSARIAL_EVALUATION" | "SIMULATION" | "SHADOW" | "CANARY";

export const EXPERIMENT_KINDS: readonly ExperimentKind[] = [
  "REPLAY",
  "ADVERSARIAL_EVALUATION",
  "SIMULATION",
  "SHADOW",
  "CANARY",
];

export type ExperimentEnvironment = "LAB" | "SHADOW" | "CANARY" | "PRODUCTION";

export interface RollbackPlan {
  readonly triggerConditions: readonly string[];
  readonly retirementSteps: readonly string[];
}

export interface ExperimentSpec {
  readonly experimentId: string;
  readonly kind: ExperimentKind;
  /** Opaque promotion-candidate reference. */
  readonly subjectRef: string;
  readonly hypothesis: string;
  readonly successCriteria: readonly string[];
  readonly rollbackPlan: RollbackPlan;
}

/** Observed outcome evidence for a completed experiment run. */
export interface ObservedOutcomeEvidence {
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly experimentKind: ExperimentKind;
  readonly environment: ExperimentEnvironment;
  readonly outcome: "SUCCESS" | "PARTIAL" | "FAILURE" | "INCONCLUSIVE";
  readonly observedAt: string;
}

export type PromotionEligibility =
  | { readonly eligible: true; readonly satisfiedKinds: readonly ExperimentKind[] }
  | { readonly eligible: false; readonly missing: readonly ExperimentKind[] };

/**
 * Deterministic promotion gate (invariant 32): requires SUCCESS evidence for
 * REPLAY, ADVERSARIAL_EVALUATION and SIMULATION, plus SHADOW or CANARY.
 * SIMULATION evidence counts only from the LAB environment (invariant 16).
 */
export function evaluatePromotionEligibility(
  evidence: readonly ObservedOutcomeEvidence[],
): PromotionEligibility {
  const satisfied = new Set<ExperimentKind>();
  for (const record of evidence) {
    if (record.outcome !== "SUCCESS") continue;
    if (record.experimentKind === "SIMULATION" && record.environment !== "LAB") continue;
    if (record.experimentKind === "SHADOW" && record.environment === "PRODUCTION") continue;
    if (record.experimentKind === "CANARY" && record.environment === "PRODUCTION") continue;
    if (record.experimentKind === "REPLAY" || record.experimentKind === "ADVERSARIAL_EVALUATION") {
      if (record.environment === "PRODUCTION") continue;
    }
    satisfied.add(record.experimentKind);
  }

  const required: ExperimentKind[] = ["REPLAY", "ADVERSARIAL_EVALUATION", "SIMULATION"];
  const missing = required.filter((kind) => !satisfied.has(kind));
  if (!satisfied.has("SHADOW") && !satisfied.has("CANARY")) missing.push("SHADOW");
  if (missing.length > 0) return { eligible: false, missing };

  const satisfiedKinds = EXPERIMENT_KINDS.filter((kind) => satisfied.has(kind));
  return { eligible: true, satisfiedKinds };
}
