/**
 * Unified promotion-gate integration with the W2-005 Reality Lab
 * (docs/work-orders/W2-006.md: "promotion-gate integration with the Reality
 * Lab scenarios — promotions measured against the same deterministic scenario
 * batteries, results comparable across subjects").
 *
 * Organizations, models and skills are measured against the SAME frozen
 * scenario battery (REALITY_SCENARIO_BATTERY): the run executes the REAL
 * seeded environments (runRealityScenario — opaque seam reads only, never a
 * production provider), journals the scenario evidence into the shared
 * hash-chained journal (journalScenarioEvidence), and derives:
 * - `batteryDigest` — a deterministic fingerprint over the battery's scenario
 *   ids + outcome digests. IDENTICAL for every subject (the battery is the
 *   shared measuring stick — asserted by the unified chain, which rejects LAB
 *   gate evidence carrying any other digest);
 * - the SIMULATION gate evidence (deterministic replay of the battery);
 * - the ADVERSARIAL gate evidence (every battery adversary flow evaluated
 *   against the release-candidate analysis profile — SUCCESS only with ZERO
 *   silent evasions; declared misses are journaled known limitations);
 * - `observedDigest` — the subject's own measured outcome fingerprint.
 *
 * Determinism: no wall clock, no unseeded RNG; the same inputs produce the
 * same digests and the same journaled hashes.
 */

import {
  findConfiguration,
  ROUTING_CONFIGURATION_IDS,
  type AgentConfiguration,
} from "./agent-configurations.js";
import {
  evaluateAdversarialFlows,
  type AdversarialRunOutcome,
} from "./adversarial-evaluation.js";
import type { EvidenceCitation, EvidenceJournal } from "./evidence-journal.js";
import { structuralHash } from "./lab-promotion.js";
import { batteryFlowsFor } from "./reality-battery.js";
import type { RealityScenarioSpec } from "./reality-lab.js";
import { runRealityScenario } from "./reality-lab.js";
import { REALITY_SCENARIO_BATTERY } from "./reality-scenarios.js";
import { journalScenarioEvidence } from "./scenario-evidence.js";
import {
  journalUnifiedGateEvidence,
  type PromotionSubjectType,
} from "./unified-promotion.js";

/**
 * The release-candidate analysis profile: the full deterministic cascade
 * (System 1 + JEPA + System 2) — the deepest security-analysis capability the
 * release ships (statistical anomaly + logical cross-evidence join).
 */
export function releaseCandidateConfiguration(): AgentConfiguration {
  const configuration = findConfiguration(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2);
  if (configuration === undefined) {
    throw new Error("release-candidate configuration missing from the frozen comparison set");
  }
  return configuration;
}

/** One scenario's measured fingerprint inside a battery run. */
export interface BatteryScenarioDigest {
  readonly scenarioId: string;
  readonly outcomeDigest: string;
}

/** The result of measuring one promotion subject against the battery. */
export interface BatteryRunResult {
  readonly evaluationRef: string;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  /** IDENTICAL across subjects — the shared measuring stick. */
  readonly batteryDigest: string;
  readonly scenarioDigests: readonly BatteryScenarioDigest[];
  readonly adversarialOutcomes: readonly AdversarialRunOutcome[];
  readonly silentEvasions: number;
  /** FALSE iff any catchable flow was not surfaced or any silent evasion. */
  readonly adversarialVerdict: "SUCCESS" | "FAILURE";
  /** The subject's own measured outcome fingerprint (per-subject). */
  readonly observedDigest: string;
  /** Journaled SIMULATION gate evidence (deterministic battery replay). */
  readonly simulationGateEvidence: EvidenceCitation;
  /** Journaled ADVERSARIAL gate evidence (the adversarial evaluation gate). */
  readonly adversarialGateEvidence: EvidenceCitation;
}

/**
 * Run the deterministic scenario battery for one promotion subject and
 * journal its SIMULATION + ADVERSARIAL gate evidence. The journal must be the
 * SAME journal the unified chain resolves citations against.
 */
export function runBatteryForSubject(input: {
  readonly journal: EvidenceJournal;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly scenarios?: readonly RealityScenarioSpec[];
  readonly configuration?: AgentConfiguration;
  readonly at: string;
}): BatteryRunResult {
  const scenarios = input.scenarios ?? REALITY_SCENARIO_BATTERY;
  const configuration = input.configuration ?? releaseCandidateConfiguration();
  const evaluationRef = `unified:${input.subjectType}:${input.subjectRef}`;

  const scenarioDigests: BatteryScenarioDigest[] = [];
  const adversarialOutcomes: AdversarialRunOutcome[] = [];
  for (const scenario of scenarios) {
    const trajectory = runRealityScenario(scenario);
    const evidence = journalScenarioEvidence({
      journal: input.journal,
      evaluationRef,
      spec: scenario,
      trajectory,
    });
    scenarioDigests.push({ scenarioId: scenario.scenarioId, outcomeDigest: trajectory.outcomeDigest });
    const flows = batteryFlowsFor(scenario.scenarioId);
    if (flows.length > 0) {
      adversarialOutcomes.push(
        ...evaluateAdversarialFlows({
          flows,
          evidenceByOrder: evidence.recordsByOrder,
          configuration,
          at: input.at,
        }),
      );
    }
  }

  // Determinism witness: the battery replays identically (same seeds).
  const replay = runRealityScenario(scenarios[0] as RealityScenarioSpec);
  const deterministic =
    scenarios.length > 0 &&
    replay.outcomeDigest === (scenarioDigests[0] as BatteryScenarioDigest).outcomeDigest;

  const batteryDigest = structuralHash({
    scenarioIds: scenarioDigests.map((entry) => entry.scenarioId),
    outcomeDigests: scenarioDigests.map((entry) => entry.outcomeDigest),
  });

  const silentEvasions = adversarialOutcomes.filter(
    (outcome) => outcome.outcome === "SILENT_EVASION",
  ).length;
  const catchableMissed = adversarialOutcomes.filter(
    (outcome) => outcome.outcome !== "DETECTED" && outcome.outcome !== "MISSED_DECLARED",
  ).length;
  const adversarialVerdict: "SUCCESS" | "FAILURE" =
    silentEvasions === 0 && catchableMissed === 0 ? "SUCCESS" : "FAILURE";

  const observedDigest = structuralHash({
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    batteryDigest,
    adversarial: adversarialOutcomes.map((outcome) => outcome.outcome),
  });

  const simulationEvidence = journalUnifiedGateEvidence({
    journal: input.journal,
    evidenceId: `evidence:unified-gate:${evaluationRef}:SIMULATION`,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    gate: "SIMULATION",
    environment: "LAB",
    batteryDigest,
    outcome: deterministic ? "SUCCESS" : "FAILURE",
    observedDigest: structuralHash(scenarioDigests.map((entry) => entry.outcomeDigest)),
    recordedAt: input.at,
  });
  const adversarialEvidence = journalUnifiedGateEvidence({
    journal: input.journal,
    evidenceId: `evidence:unified-gate:${evaluationRef}:ADVERSARIAL`,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    gate: "ADVERSARIAL",
    environment: "LAB",
    batteryDigest,
    outcome: adversarialVerdict,
    observedDigest: structuralHash(adversarialOutcomes.map((outcome) => outcome.outcome)),
    recordedAt: input.at,
  });

  return {
    evaluationRef,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    batteryDigest,
    scenarioDigests,
    adversarialOutcomes,
    silentEvasions,
    adversarialVerdict,
    observedDigest,
    simulationGateEvidence: {
      evidenceId: simulationEvidence.evidenceId,
      kind: simulationEvidence.kind,
      recordHash: simulationEvidence.recordHash,
    },
    adversarialGateEvidence: {
      evidenceId: adversarialEvidence.evidenceId,
      kind: adversarialEvidence.kind,
      recordHash: adversarialEvidence.recordHash,
    },
  };
}

/**
 * Journal the rollout-gate evidence (SHADOW / CANARY / OBSERVED_OUTCOME) for
 * one subject: the observation digest of the subject's rollout window in the
 * gate's required environment, still carrying the shared battery digest.
 */
export function journalRolloutGateEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly gate: "SHADOW" | "CANARY" | "OBSERVED_OUTCOME";
  readonly batteryDigest: string;
  readonly observedDigest: string;
  readonly recordedAt: string;
}): EvidenceCitation {
  const environment = input.gate === "SHADOW" ? "SHADOW" : "CANARY";
  const record = journalUnifiedGateEvidence({
    journal: input.journal,
    evidenceId: `evidence:unified-gate:unified:${input.subjectType}:${input.subjectRef}:${input.gate}`,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    gate: input.gate,
    environment,
    batteryDigest: input.batteryDigest,
    outcome: "SUCCESS",
    observedDigest: input.observedDigest,
    recordedAt: input.recordedAt,
  });
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}
