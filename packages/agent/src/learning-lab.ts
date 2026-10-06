/**
 * The Learning Lab (W2-005; FROZEN-ARCHITECTURE §3.I; invariant 32).
 *
 * Evaluation runs: one configuration exercised against Reality-Lab
 * scenarios. Every run
 * - executes the scenario trajectories (deterministic, seeded);
 * - journals the scenarios' evidence into the W2-004 hash-chained evidence
 *   journal (scenario-evidence.ts — opaque seam reads);
 * - measures the configuration's per-task decisions against ground truth
 *   (decision quality) with deterministic cost and latency-proxy unit
 *   models;
 * - runs the adversarial archetype flows against the configuration with
 *   EXPLICIT outcomes (detections and misses; silent evasion fails the run);
 * - journals the run record + per-scenario outcomes + known limitations as
 *   hash-chained evidence (LAB_EVALUATION_RUN / LAB_EVALUATION_OUTCOME /
 *   KNOWN_LIMITATION payloads).
 *
 * Determinism: a run is a pure function of its spec + configuration — no
 * wall clock (executedAt is an explicit parameter), no ambient state.
 */

import { decideTask, type AgentConfiguration, type TaskDecision } from "./agent-configurations.js";
import { journalKnownLimitations } from "./archetype-suite.js";
import type { KnownLimitationRecord } from "./archetype-suite.js";
import type { EvidenceCitation, EvidenceJournal, JournaledEvidenceRecord } from "./evidence-journal.js";
import { structuralHash } from "./lab-promotion.js";
import {
  evaluateAdversarialFlows,
  knownLimitationsOf,
  type AdversarialRunOutcome,
} from "./adversarial-evaluation.js";
import { batteryFlowsFor, batteryTasksFor } from "./reality-battery.js";
import type { RealityScenarioSpec } from "./reality-lab.js";
import { runRealityScenario } from "./reality-lab.js";
import { journalScenarioEvidence } from "./scenario-evidence.js";

// ---------------------------------------------------------------------------
// Run spec + measured results
// ---------------------------------------------------------------------------

export interface EvaluationRunSpec {
  readonly evaluationRef: string;
  readonly configuration: AgentConfiguration;
  /** The scenarios of the run (normally the frozen battery). */
  readonly scenarios: readonly RealityScenarioSpec[];
  readonly seed: string;
  readonly executedAt: string;
}

/** Per-scenario measured outcomes. */
export interface ScenarioRunOutcome {
  readonly scenarioId: string;
  readonly trajectoryDigest: string;
  readonly tasksTotal: number;
  readonly decisionsCorrect: number;
  readonly costUnits: number;
  readonly latencyUnits: number;
  readonly decisions: readonly TaskDecision[];
}

/** Deterministic aggregate metrics for one configuration over the battery. */
export interface ConfigurationRunMetrics {
  readonly tasksTotal: number;
  readonly decisionsCorrect: number;
  /** 0..10000 basis points — round(correct / total × 10000). */
  readonly decisionQualityBps: number;
  readonly costUnits: number;
  readonly latencyUnits: number;
  readonly adversarialFlowsTotal: number;
  readonly adversarialDetected: number;
  readonly adversarialMissedDeclared: number;
  readonly silentEvasions: number;
  /** FAILURE iff any silent evasion — undetected evasion is a bug, not a pass. */
  readonly runOutcome: "SUCCESS" | "FAILURE";
}

export interface EvaluationRunResult {
  readonly evaluationRef: string;
  readonly configuration: AgentConfiguration;
  readonly seed: string;
  readonly executedAt: string;
  readonly scenarioOutcomes: readonly ScenarioRunOutcome[];
  readonly adversarialOutcomes: readonly AdversarialRunOutcome[];
  readonly metrics: ConfigurationRunMetrics;
  /** The journaled LAB_EVALUATION_RUN record (hash-chained evidence). */
  readonly runEvidence: JournaledEvidenceRecord;
  /** The journaled LAB_EVALUATION_OUTCOME record per scenario. */
  readonly outcomeEvidence: readonly JournaledEvidenceRecord[];
  /** The journaled KNOWN_LIMITATION records for declared misses. */
  readonly limitationEvidence: readonly JournaledEvidenceRecord[];
  /** Citations for every record the run journaled. */
  readonly citations: readonly EvidenceCitation[];
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function citationFor(record: JournaledEvidenceRecord): EvidenceCitation {
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

/**
 * Execute one evaluation run. Deterministic and pure given the spec: the
 * same spec + configuration + journal state produce the same measurements
 * and the same evidence hashes. The run FAILS (metrics.runOutcome FAILURE)
 * on any silent evasion.
 */
export function runEvaluation(input: {
  readonly spec: EvaluationRunSpec;
  readonly journal: EvidenceJournal;
}): EvaluationRunResult {
  const { spec, journal } = input;
  const scenarioOutcomes: ScenarioRunOutcome[] = [];
  const adversarialOutcomes: AdversarialRunOutcome[] = [];
  const limitationRecords: KnownLimitationRecord[] = [];

  for (const scenario of spec.scenarios) {
    // 1. Deterministic environment trajectory (opaque seam reads only).
    const trajectory = runRealityScenario(scenario);

    // 2. Journal the scenario's evidence (hash-chained, run-prefixed ids).
    const evidence = journalScenarioEvidence({
      journal,
      evaluationRef: spec.evaluationRef,
      spec: scenario,
      trajectory,
    });

    // 3. Measure the configuration's decisions over the scenario's tasks.
    const tasks = batteryTasksFor(scenario.scenarioId);
    const decisions = tasks.map((task) => decideTask(spec.configuration, task));
    scenarioOutcomes.push({
      scenarioId: scenario.scenarioId,
      trajectoryDigest: trajectory.outcomeDigest,
      tasksTotal: tasks.length,
      decisionsCorrect: decisions.filter((decision) => decision.correct).length,
      costUnits: decisions.reduce((total, decision) => total + decision.costUnits, 0),
      latencyUnits: decisions.reduce((total, decision) => total + decision.latencyUnits, 0),
      decisions,
    });

    // 4. Adversarial evaluation: the REAL detectors + capability surfacing.
    const flows = batteryFlowsFor(scenario.scenarioId);
    if (flows.length > 0) {
      adversarialOutcomes.push(
        ...evaluateAdversarialFlows({
          flows,
          evidenceByOrder: evidence.recordsByOrder,
          configuration: spec.configuration,
          at: spec.executedAt,
        }),
      );
    }
  }

  // 5. Journal declared misses as known-limitation evidence (never silent).
  const limitations = knownLimitationsOf({
    outcomes: adversarialOutcomes,
    configurationId: spec.configuration.configurationId,
    journaledAt: spec.executedAt,
  });
  limitationRecords.push(...limitations);
  const limitationEvidence =
    limitations.length > 0
      ? journalKnownLimitations({
          journal,
          limitations,
          subjectRef: { principalId: `platform:${spec.configuration.configurationId}`, kind: "platform" },
        })
      : [];

  // 6. Aggregate metrics (internally consistent by construction).
  const tasksTotal = scenarioOutcomes.reduce((total, outcome) => total + outcome.tasksTotal, 0);
  const decisionsCorrect = scenarioOutcomes.reduce(
    (total, outcome) => total + outcome.decisionsCorrect,
    0,
  );
  const costUnits = scenarioOutcomes.reduce((total, outcome) => total + outcome.costUnits, 0);
  const latencyUnits = scenarioOutcomes.reduce(
    (total, outcome) => total + outcome.latencyUnits,
    0,
  );
  const silentEvasions = adversarialOutcomes.filter(
    (outcome) => outcome.outcome === "SILENT_EVASION",
  ).length;
  const metrics: ConfigurationRunMetrics = {
    tasksTotal,
    decisionsCorrect,
    decisionQualityBps: tasksTotal === 0 ? 0 : Math.round((decisionsCorrect / tasksTotal) * 10_000),
    costUnits,
    latencyUnits,
    adversarialFlowsTotal: adversarialOutcomes.length,
    adversarialDetected: adversarialOutcomes.filter((outcome) => outcome.outcome === "DETECTED").length,
    adversarialMissedDeclared: adversarialOutcomes.filter(
      (outcome) => outcome.outcome === "MISSED_DECLARED",
    ).length,
    silentEvasions,
    runOutcome: silentEvasions > 0 ? "FAILURE" : "SUCCESS",
  };

  // 7. Journal per-scenario outcomes + the run record (hash-chained).
  const outcomeEvidence = scenarioOutcomes.map((outcome) =>
    journal.append({
      evidenceId: `evidence:${spec.evaluationRef}:outcome:${outcome.scenarioId}`,
      kind: "lab-evaluation",
      subjectRef: { principalId: `platform:${spec.configuration.configurationId}`, kind: "platform" },
      payload: {
        evidenceKind: "LAB_EVALUATION_OUTCOME",
        evaluationRef: spec.evaluationRef,
        scenarioId: outcome.scenarioId,
        tasksTotal: outcome.tasksTotal,
        decisionsCorrect: outcome.decisionsCorrect,
        costUnits: outcome.costUnits,
        latencyUnits: outcome.latencyUnits,
      },
      recordedAt: spec.executedAt,
    }),
  );
  const runEvidence = journal.append({
    evidenceId: `evidence:${spec.evaluationRef}:run`,
    kind: "lab-evaluation",
    subjectRef: { principalId: `platform:${spec.configuration.configurationId}`, kind: "platform" },
    payload: {
      evidenceKind: "LAB_EVALUATION_RUN",
      evaluationRef: spec.evaluationRef,
      configurationId: spec.configuration.configurationId,
      seed: spec.seed,
      scenarioIds: spec.scenarios.map((scenario) => scenario.scenarioId),
      metricsDigest: structuralHash(metrics),
      outcome: metrics.runOutcome,
    },
    recordedAt: spec.executedAt,
  });

  return {
    evaluationRef: spec.evaluationRef,
    configuration: spec.configuration,
    seed: spec.seed,
    executedAt: spec.executedAt,
    scenarioOutcomes,
    adversarialOutcomes,
    metrics,
    runEvidence,
    outcomeEvidence,
    limitationEvidence,
    citations: [...outcomeEvidence, runEvidence, ...limitationEvidence].map(citationFor),
  };
}
