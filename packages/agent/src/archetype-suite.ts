/**
 * Adversarial archetype suite: every fraud archetype gets an evasion variant
 * that must still be caught OR be explicitly journaled as a known limitation
 * (W2-004 scenario 6).
 *
 * "Defense must not rely on attacker cooperation": evasion flows are built
 * from the attacker's perspective — staggered timing, varied content,
 * partial truths, mixed honest activity, sub-threshold frequency, missing
 * observations. SILENT EVASION IS A BUG, structurally: the suite runner
 * refuses any uncaught evasion that was not declared with a documented
 * limitation, and every declared limitation becomes a journaled evidence
 * record (kind "security-analysis") — the exact evidence a lab promotion
 * gate consumes for adversarial evaluation.
 */

import type { EvidenceJournal, JournaledEvidenceRecord } from "./evidence-journal.js";
import type { PrincipalRef } from "./common.js";
import {
  detectReviewRing,
  type ArchetypeDetectionResult,
  type FraudArchetype,
} from "./fraud-archetypes.js";
export type { ArchetypeDetectionResult, FraudArchetype } from "./fraud-archetypes.js";
import {
  detectFalseBuyerClaim,
  detectFalseNonDelivery,
  detectReturnRefundAbuse,
  detectWrongItemShipment,
} from "./claim-archetypes.js";

/** Run every archetype detector over a body of journaled evidence. */
export function detectAllArchetypes(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): readonly ArchetypeDetectionResult[] {
  return [
    detectReviewRing(records, at),
    detectWrongItemShipment(records, at),
    detectFalseNonDelivery(records, at),
    detectFalseBuyerClaim(records, at),
    detectReturnRefundAbuse(records, at),
  ];
}

/** An explicitly documented evasion limitation (journaled, never silent). */
export interface KnownLimitationRecord {
  readonly limitationId: string;
  readonly archetype: FraudArchetype;
  readonly evasionVariant: string;
  readonly why: string;
  readonly journaledAt: string;
}

/** One adversarial evidence flow: a base attack or an evasion attempt. */
export interface ArchetypeFlow {
  readonly archetype: FraudArchetype;
  readonly variant: "BASE" | "EVASION";
  readonly label: string;
  readonly evidence: readonly JournaledEvidenceRecord[];
  /**
   * For EVASION flows only: the documented reason the evasion may succeed.
   * An uncaught evasion WITHOUT this declaration is a SILENT_EVASION bug.
   */
  readonly knownLimitationIfEvaded?: { readonly why: string };
}

export interface FlowOutcome {
  readonly archetype: FraudArchetype;
  readonly variant: "BASE" | "EVASION";
  readonly label: string;
  readonly caught: boolean;
  readonly detection: readonly ArchetypeDetectionResult[];
  readonly knownLimitation?: KnownLimitationRecord;
}

export type SuiteViolation =
  | {
      readonly kind: "BASE_EVASION";
      readonly archetype: FraudArchetype;
      readonly label: string;
      readonly rationale: string;
    }
  | {
      readonly kind: "SILENT_EVASION";
      readonly archetype: FraudArchetype;
      readonly label: string;
      readonly rationale: string;
    };

export interface SuiteOutcome {
  readonly outcomes: readonly FlowOutcome[];
  readonly violations: readonly SuiteViolation[];
  readonly knownLimitations: readonly KnownLimitationRecord[];
}

function limitationFor(
  flow: ArchetypeFlow,
  journaledAt: string,
): KnownLimitationRecord | undefined {
  if (flow.variant !== "EVASION" || flow.knownLimitationIfEvaded === undefined) return undefined;
  return {
    limitationId: `limitation:${flow.archetype}:${flow.label}`,
    archetype: flow.archetype,
    evasionVariant: flow.label,
    why: flow.knownLimitationIfEvaded.why,
    journaledAt,
  };
}

/**
 * Run the adversarial suite. Per archetype:
 * - BASE flows MUST be caught (a base attack that evades is a BASE_EVASION
 *   failure — no limitation declaration is accepted for a base flow);
 * - EVASION flows must be caught OR carry a declared known limitation that
 *   becomes a journaled record — an uncaught, undeclared evasion is a
 *   SILENT_EVASION violation (a bug by construction, never silent).
 */
export function runArchetypeSuite(input: {
  readonly flows: readonly ArchetypeFlow[];
  readonly at: string;
}): SuiteOutcome {
  const outcomes: FlowOutcome[] = [];
  const violations: SuiteViolation[] = [];
  const knownLimitations: KnownLimitationRecord[] = [];

  const seen = new Set<string>();
  for (const flow of input.flows) {
    const key = `${flow.archetype}:${flow.label}`;
    if (seen.has(key)) {
      violations.push({
        kind: "SILENT_EVASION",
        archetype: flow.archetype,
        label: flow.label,
        rationale: "duplicate flow label",
      });
      continue;
    }
    seen.add(key);

    const detection = detectAllArchetypes(flow.evidence, input.at);
    const caught = detection.some((result) => result.detected);
    const knownLimitation = caught ? undefined : limitationFor(flow, input.at);

    if (!caught && flow.variant === "BASE") {
      violations.push({
        kind: "BASE_EVASION",
        archetype: flow.archetype,
        label: flow.label,
        rationale: detection
          .map((result) => `${result.archetype}=${result.evidenceState}`)
          .join(", "),
      });
    }
    if (!caught && flow.variant === "EVASION" && knownLimitation === undefined) {
      violations.push({
        kind: "SILENT_EVASION",
        archetype: flow.archetype,
        label: flow.label,
        rationale:
          "evasion was not caught and no known limitation was declared — silent evasion is a bug",
      });
    }
    if (knownLimitation !== undefined) knownLimitations.push(knownLimitation);

    outcomes.push({
      archetype: flow.archetype,
      variant: flow.variant,
      label: flow.label,
      caught,
      detection,
      knownLimitation,
    });
  }

  return { outcomes, violations, knownLimitations };
}

/**
 * Journal known limitations as append-only evidence records. The limitation
 * records are the adversarial-evaluation evidence a lab promotion gate
 * consumes for immune-logic candidates.
 */
export function journalKnownLimitations(input: {
  readonly journal: EvidenceJournal;
  readonly limitations: readonly KnownLimitationRecord[];
  readonly subjectRef: PrincipalRef;
}): readonly JournaledEvidenceRecord[] {
  return input.limitations.map((limitation) =>
    input.journal.append({
      evidenceId: `evidence:known-limitation:${limitation.limitationId}`,
      kind: "security-analysis",
      subjectRef: input.subjectRef,
      payload: {
        evidenceKind: "KNOWN_LIMITATION",
        limitationId: limitation.limitationId,
        archetype: limitation.archetype,
        why: limitation.why,
      },
      recordedAt: limitation.journaledAt,
    }),
  );
}
