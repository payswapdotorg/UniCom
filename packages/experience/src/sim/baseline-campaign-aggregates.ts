/**
 * W3-010 — Baseline campaign aggregation helpers (firm / industry×size×role
 * / four-adoption-outputs / journey-family summaries / friction causes).
 *
 * Pure functions over AdoptionDecision[]; no I/O, no Math.random, no
 * clocks. Split out of `./baseline-campaign.ts` for the architecture
 * file-line budget (max-file-lines: 400).
 *
 * Source work order: docs/work-orders/W3-010.md §4–§5.
 */

import type { JourneyEvidenceRecord } from "./journey-evidence";
import type { RealArtifactContracts } from "./real-artifact-loader";
import { SYNTHETIC_ESTIMATE_LABEL } from "./real-artifact-loader";
import type {
  AdoptionOutputAggregate,
  BaselineFailureEntry,
  FirmAggregateRow,
  IndustrySizeRoleRow,
  JourneyFamilyEvidenceSummary,
} from "./campaign-report";
import {
  aggregateAdoption,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_THRESHOLD,
  type AdoptionAggregate,
  type AdoptionDecision,
  type Persona,
} from "@unicom/agent";
import type { JourneyOutcomeForPersona } from "@unicom/agent";
import { mapJourneyEvidenceToPersonaOutcome } from "./adoption-mapper";

/** Build per-persona (persona, JourneyOutcomeForPersona) tuples for scoring. */
export function buildPersonaOutcomes(
  contracts: RealArtifactContracts,
  evidenceRecords: readonly JourneyEvidenceRecord[],
): ReadonlyArray<{
  readonly persona: Persona;
  readonly outcome: JourneyOutcomeForPersona;
}> {
  const byPersona = new Map<string, JourneyEvidenceRecord[]>();
  for (const record of evidenceRecords) {
    const bucket = byPersona.get(record.personaId) ?? [];
    bucket.push(record);
    byPersona.set(record.personaId, bucket);
  }

  const results: Array<{ readonly persona: Persona; readonly outcome: JourneyOutcomeForPersona }> = [];
  // Iterate the frozen @unicom/agent Personas (NOT the W3-009 W2Persona map;
  // the agent Persona carries the scoring-relevant fields like roleFamily,
  // seniority, switchingCost, applicableJourneys etc.).
  for (const persona of contracts.agentPersonas) {
    const records = byPersona.get(persona.personaId) ?? [];
    const outcome = mapJourneyEvidenceToPersonaOutcome({ persona, records }, contracts);
    results.push({ persona, outcome });
  }
  return results;
}

/** Build per-firm aggregate rows (one row per firmId). */
export function buildFirmAggregates(
  decisions: readonly AdoptionDecision[],
  _contracts: RealArtifactContracts,
): readonly FirmAggregateRow[] {
  const byFirm = new Map<string, AdoptionDecision[]>();
  for (const decision of decisions) {
    const firmId = `firm:${decision.industry}:${decision.firmSize}`;
    const bucket = byFirm.get(firmId) ?? [];
    bucket.push(decision);
    byFirm.set(firmId, bucket);
  }
  const rows: FirmAggregateRow[] = [];
  for (const [firmId, bucket] of byFirm) {
    const aggregate = aggregateAdoption(bucket, "global")[0]!;
    const outputs = buildFourOutputs(aggregate, bucket);
    rows.push({
      firmId,
      industry: bucket[0]!.industry,
      firmSize: bucket[0]!.firmSize,
      personaDenominator: bucket.length,
      outputs,
      vetoedCount: aggregate.vetoedCount,
      vetoedPct: aggregate.vetoedPct,
      reasonCodeCounts: aggregate.reasonCodeCounts as Readonly<Record<string, number>>,
    });
  }
  return rows.sort((a, b) => a.firmId.localeCompare(b.firmId));
}

/** Build per-industry×size×role aggregate rows. */
export function buildIndustrySizeRoleAggregates(
  decisions: readonly AdoptionDecision[],
): readonly IndustrySizeRoleRow[] {
  const groups = aggregateAdoption(decisions, "industry-size-role");
  return groups.map((aggregate) => {
    const [industry, firmSize, roleFamily] = aggregate.groupKey.split(":");
    const bucket = decisions.filter(
      (d) => d.industry === industry && d.firmSize === firmSize && d.roleFamily === roleFamily,
    );
    return {
      industry: industry!,
      firmSize: firmSize as "small" | "medium" | "large",
      roleFamily: roleFamily!,
      personaDenominator: aggregate.denominator,
      outputs: buildFourOutputs(aggregate, bucket),
    };
  });
}

/**
 * Build the four adoption outputs (a/b/c/d) for one aggregate group.
 * Output (b) and (d) carry `syntheticEstimateLabel` — the synthetic-
 * simulation-estimate qualifier is MANDATORY on every willingness number.
 */
export function buildFourOutputs(
  aggregate: AdoptionAggregate,
  bucket: readonly AdoptionDecision[],
): readonly AdoptionOutputAggregate[] {
  const denom = aggregate.denominator;
  const aEligible = aggregate.technicalFullSwitchEligibleCount;
  const bEligible = aggregate.simulatedWillingToSwitchCompletelyCount;
  const cEligible = aggregate.mainInterfaceEligibleCount;
  const dEligible = aggregate.simulatedWillingToUseAsMainInterfaceCount;
  const bScore = meanScore(bucket.map((d) => d.switchScore));
  const dScore = meanScore(bucket.map((d) => d.mainInterfaceScore));
  const pct = (n: number) => (denom === 0 ? 0 : (n / denom) * 100);

  return [
    {
      outputId: "a",
      label: "Technical full-switch eligibility",
      kind: "boolean",
      denominator: denom,
      eligibleCount: aEligible,
      eligiblePct: pct(aEligible),
      meanScore: null,
      sensitivityRange: null,
      syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
      rule: "no veto AND all applicable journeys discoverable+completable AND no missing-capability reason codes AND no blocker reason codes",
      threshold: null,
    },
    {
      outputId: "b",
      label: "Simulated stated willingness to switch completely",
      kind: "boolean+score",
      denominator: denom,
      eligibleCount: bEligible,
      eligiblePct: pct(bEligible),
      meanScore: bScore,
      sensitivityRange: bScore === null ? null : { low: Math.max(0, bScore - 2), high: Math.min(100, bScore + 2) },
      syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
      rule: "no veto AND technical-full-switch-eligible AND weighted score >= FULL_SWITCH_THRESHOLD (65)",
      threshold: FULL_SWITCH_THRESHOLD,
    },
    {
      outputId: "c",
      label: "Main-interface eligibility",
      kind: "boolean",
      denominator: denom,
      eligibleCount: cEligible,
      eligiblePct: pct(cEligible),
      meanScore: null,
      sensitivityRange: null,
      syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
      rule: "no veto AND >= 80% of applicable journeys can start/be supervised from UNiCOM AND no main-interface-blocking reason codes",
      threshold: null,
    },
    {
      outputId: "d",
      label: "Simulated stated willingness to use as main interface",
      kind: "boolean+score",
      denominator: denom,
      eligibleCount: dEligible,
      eligiblePct: pct(dEligible),
      meanScore: dScore,
      sensitivityRange: dScore === null ? null : { low: Math.max(0, dScore - 2), high: Math.min(100, dScore + 2) },
      syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
      rule: "no veto AND main-interface-eligible AND weighted score >= MAIN_INTERFACE_THRESHOLD (55)",
      threshold: MAIN_INTERFACE_THRESHOLD,
    },
  ];
}

function meanScore(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Build per-journey-family evidence summaries (one row per family id). */
export function buildJourneyFamilyEvidenceSummaries(
  records: readonly JourneyEvidenceRecord[],
): readonly JourneyFamilyEvidenceSummary[] {
  const byFamily = new Map<string, JourneyEvidenceRecord[]>();
  for (const record of records) {
    const bucket = byFamily.get(record.journeyFamilyId) ?? [];
    bucket.push(record);
    byFamily.set(record.journeyFamilyId, bucket);
  }
  const summaries: JourneyFamilyEvidenceSummary[] = [];
  for (const [familyId, bucket] of byFamily) {
    const pass = bucket.filter((r) => r.outcome === "pass").length;
    const fail = bucket.filter((r) => r.outcome === "fail").length;
    const blocked = bucket.filter((r) => r.outcome === "blocked").length;
    const absent = bucket.filter((r) => r.outcome === "absent").length;
    const unknown = bucket.filter((r) => r.outcome === "unknown").length;
    const total = bucket.length;
    summaries.push({
      journeyFamilyId: familyId,
      totalRuns: total,
      passCount: pass,
      failCount: fail,
      blockedCount: blocked,
      absentCount: absent,
      unknownCount: unknown,
      reconciled: pass + fail + blocked + absent + unknown === total,
      firstEvidenceRecordId: bucket[0]?.evidenceId ?? "",
      topFrictionCauses: collectFrictionCauses(bucket),
    });
  }
  return summaries.sort((a, b) => a.journeyFamilyId.localeCompare(b.journeyFamilyId));
}

function collectFrictionCauses(bucket: readonly JourneyEvidenceRecord[]): readonly string[] {
  const causes = new Map<string, number>();
  for (const record of bucket) {
    if (record.postTaskAdoptionResponse) {
      for (const cause of record.postTaskAdoptionResponse.frictionCauses) {
        causes.set(cause, (causes.get(cause) ?? 0) + 1);
      }
    }
  }
  return Array.from(causes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cause]) => cause);
}

/** Compute the top friction causes across all journey evidence. */
export function computeTopFrictionCauses(
  records: readonly JourneyEvidenceRecord[],
): ReadonlyArray<{
  readonly cause: string;
  readonly count: number;
  readonly evidencePointer: string;
}> {
  const causes = new Map<string, { count: number; firstEvidence: string }>();
  for (const record of records) {
    if (record.postTaskAdoptionResponse) {
      for (const cause of record.postTaskAdoptionResponse.frictionCauses) {
        const existing = causes.get(cause);
        if (existing) {
          existing.count += 1;
        } else {
          causes.set(cause, { count: 1, firstEvidence: record.evidenceId });
        }
      }
    }
  }
  return Array.from(causes.entries())
    .map(([cause, data]) => ({ cause, count: data.count, evidencePointer: data.firstEvidence }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Collect all baseline failures (non-pass outcomes) from journey evidence. */
export function collectBaselineFailures(
  records: readonly JourneyEvidenceRecord[],
): readonly BaselineFailureEntry[] {
  const failures: BaselineFailureEntry[] = [];
  for (const record of records) {
    if (record.outcome === "pass") continue;
    const reasonCodes = record.postTaskAdoptionResponse?.hardBlockers ?? [];
    failures.push({
      projectId: record.projectId,
      firmId: record.firmId,
      industry: record.industry,
      firmSize: record.firmSize,
      journeyFamilyId: record.journeyFamilyId,
      outcome: record.outcome,
      reasonCodes,
      evidenceRecordId: record.evidenceId,
      rootCauseCluster: clusterFailureCause(record),
    });
  }
  return failures;
}

function clusterFailureCause(record: JourneyEvidenceRecord): string {
  if (record.outcome === "absent") return "capability-absent";
  if (record.outcome === "unknown") return "outcome-unknown";
  if (record.outcome === "blocked") {
    if (record.errorRecoveryTrace.some((e) => e.errorKind === "missing-approval")) {
      return "missing-approval";
    }
    if (record.errorRecoveryTrace.some((e) => e.errorKind === "denied-permission")) {
      return "permission-denied";
    }
    return "blocked-misc";
  }
  if (record.errorRecoveryTrace.length > 0) {
    return `error-${record.errorRecoveryTrace[0]!.errorKind}`;
  }
  return "ui-friction";
}
