/**
 * Adversarial evaluation per configuration (W2-005; W2-004 archetype suite).
 *
 * Every battery adversary flow (all five fraud archetypes, BASE + EVASION
 * variants) runs against every configuration:
 * - the REAL W2-004 detectors (detectAllArchetypes) run over the flow's
 *   journaled evidence — the raw detection outcome is recorded;
 * - the configuration SURFACES the detection only if its security-analysis
 *   capability covers the analysis depth the catch requires
 *   (EVIDENCE_LEVEL always; STATISTICAL_ANOMALY needs the anomaly tier;
 *   LOGICAL_CROSS_EVIDENCE_JOIN needs the deep tier);
 * - every miss is an EXPLICIT outcome: a declared, documented limitation
 *   (journaled as known-limitation evidence) or — when no declaration covers
 *   the miss — a SILENT EVASION, which FAILS the evaluation run. Undetected
 *   evasion is a bug, never a pass.
 */

import type { AgentConfiguration } from "./agent-configurations.js";
import { detectAllArchetypes } from "./archetype-suite.js";
import type { KnownLimitationRecord } from "./archetype-suite.js";
import type { JournaledEvidenceRecord } from "./evidence-journal.js";
import type { FraudArchetype } from "./fraud-archetypes.js";
import type { AdversaryAnalysisKind, AdversaryFlowSpec } from "./reality-battery.js";

export type AdversarialOutcomeKind = "DETECTED" | "MISSED_DECLARED" | "SILENT_EVASION";

/** One explicit adversarial outcome for one flow under one configuration. */
export interface AdversarialRunOutcome {
  readonly flowId: string;
  readonly archetype: FraudArchetype;
  readonly variant: "BASE" | "EVASION";
  readonly label: string;
  /** The REAL detectors' outcome over the flow's journaled evidence. */
  readonly detectorDetected: boolean;
  /** Whether THIS configuration surfaced the detection (capability-gated). */
  readonly surfaced: boolean;
  readonly outcome: AdversarialOutcomeKind;
  /** The documented why, for declared misses. */
  readonly limitationWhy?: string;
}

function canSurface(
  configuration: AgentConfiguration,
  requiredAnalysis: AdversaryAnalysisKind,
): boolean {
  if (requiredAnalysis === "EVIDENCE_LEVEL") return true;
  if (requiredAnalysis === "STATISTICAL_ANOMALY")
    return configuration.securityAnalysis.statisticalAnomalyDetection;
  return configuration.securityAnalysis.crossEvidenceJoin;
}

/**
 * Evaluate every flow against one configuration. Deterministic: a pure
 * function of (flows, evidence, configuration). Misses become explicit
 * outcomes; undeclared misses on catchable flows are SILENT_EVASION.
 */
export function evaluateAdversarialFlows(input: {
  readonly flows: readonly AdversaryFlowSpec[];
  readonly evidenceByOrder: ReadonlyMap<string, readonly JournaledEvidenceRecord[]>;
  readonly configuration: AgentConfiguration;
  readonly at: string;
}): readonly AdversarialRunOutcome[] {
  const outcomes: AdversarialRunOutcome[] = [];
  for (const flow of input.flows) {
    const evidence = flow.orderRefs.flatMap(
      (orderRef) => input.evidenceByOrder.get(orderRef) ?? [],
    );
    const detection = detectAllArchetypes(evidence, input.at);
    const detectorDetected = detection.some((result) => result.detected);
    const capable = canSurface(input.configuration, flow.requiredAnalysis);
    const surfaced = detectorDetected && capable;

    let outcome: AdversarialOutcomeKind;
    let limitationWhy: string | undefined;
    if (surfaced) {
      outcome = "DETECTED";
    } else if (!flow.catchable) {
      // Not catchable at this evidence level (W2-004-declared limitation).
      outcome = "MISSED_DECLARED";
      limitationWhy = flow.knownLimitationWhy ?? "flow declared uncatchable without a why";
    } else {
      const declaration = input.configuration.declaredLimitations[flow.requiredAnalysis];
      if (declaration !== undefined) {
        outcome = "MISSED_DECLARED";
        limitationWhy = declaration;
      } else {
        outcome = "SILENT_EVASION";
      }
    }

    outcomes.push({
      flowId: flow.flowId,
      archetype: flow.archetype,
      variant: flow.variant,
      label: flow.label,
      detectorDetected,
      surfaced,
      outcome,
      ...(limitationWhy !== undefined ? { limitationWhy } : {}),
    });
  }
  return outcomes;
}

/**
 * The known-limitation records for a run's declared misses — journaled via
 * the W2-004 discipline (journalKnownLimitations) so every miss is evidence.
 */
export function knownLimitationsOf(input: {
  readonly outcomes: readonly AdversarialRunOutcome[];
  readonly configurationId: string;
  readonly journaledAt: string;
}): readonly KnownLimitationRecord[] {
  return input.outcomes
    .filter((outcome) => outcome.outcome === "MISSED_DECLARED")
    .map((outcome) => ({
      limitationId: `limitation:${input.configurationId}:${outcome.flowId}`,
      archetype: outcome.archetype,
      evasionVariant: outcome.label,
      why: outcome.limitationWhy ?? "declared miss",
      journaledAt: input.journaledAt,
    }));
}
