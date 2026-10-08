/**
 * The adversarial-suite core (W2-006): shared adversary vocabulary, the
 * certification harness context and the immune-response certification.
 *
 * The release-gate adversarial suite proves, per adversary, that every
 * detection the system CLAIMS is real and every structural defense actually
 * blocks: "a claimed-but-unproven detection is a FAIL". Every executed
 * adversary leaves a JOURNALED ADVERSARY_ENCOUNTER record in the shared
 * hash-chained evidence journal — detected adversaries (fraud archetypes
 * caught by the REAL detectors) additionally trigger the full journaled
 * immune response (classification → policy decision → reversible capability
 * attenuation/quarantine → capability-scoped defensive broadcast), and the
 * certification proves the response executed, was journaled and REVERSED
 * cleanly (append-only history preserved).
 *
 * Structural adversaries (tampering, forgery, replay, bypass, escape,
 * escalation, poisoning, circumvention) are certified by their typed
 * rejection: the boundary IS the immune response of the type system, and the
 * rejection + encounter are journaled.
 *
 * Deterministic: all timestamps explicit; no wall clock; no unseeded RNG.
 */

import type { EvidenceCitation, EvidenceJournal } from "./evidence-journal.js";
import type { CapabilityDefinition } from "./capability/capability.js";
import type { PrincipalRef } from "./common.js";
import type { SecurityImmuneSystem } from "./immune-system.js";
import type { SecuritySignal } from "./security.js";
import type { AgentConfiguration } from "./agent-configurations.js";
import type { PromotionRecord } from "./lab-promotion.js";
import { OpportunityGraph } from "./opportunity-graph.js";
import type { RealityScenarioSpec } from "./reality-lab.js";
import type { BatteryRunResult } from "./promotion-battery.js";
import { ActorCapabilityLedger } from "./actor-capability.js";
import {
  UNIFIED_PROMOTION_GATES,
  journalUnifiedGateEvidence,
  unifiedGateEnvironment,
  type PromotionSubjectType,
} from "./unified-promotion.js";
import { UnifiedPromotionChain } from "./unified-promotion-chain.js";

// ---------------------------------------------------------------------------
// Adversary vocabulary
// ---------------------------------------------------------------------------

/** The adversary categories of the release-gate suite (frozen vocabulary). */
export type AdversaryCategory =
  | "FRAUD_ARCHETYPE"
  | "TRUST_JOURNAL_TAMPERING"
  | "EVIDENCE_FORGERY"
  | "EVIDENCE_REPLAY"
  | "QUARANTINE_ESCAPE"
  | "CAPABILITY_SCOPE_ESCALATION"
  | "BROADCAST_FORGERY"
  | "OPPORTUNITY_GRAPH_POISONING"
  | "PROMOTION_GATE_BYPASS"
  | "RETIREMENT_CIRCUMVENTION"
  // --- W2-007 (additive): buyer-agent vocabulary surfaces — financing
  // bounds, buy-now-vs-wait, price-timing, negotiation. Each is a
  // structural adversary caught by the typed boundary (checkHardConstraints),
  // never an immune-certified fraud detection. ---
  | "BUYER_CONSTRAINT_VIOLATION";

/**
 * One adversarial outcome: the attack either got DETECTED or was BLOCKED. A
 * MISSED_DECLARED result is an explicitly journaled miss (never silent) — the
 * suite verdict FAILS on it, but the miss is evidence, not a hole.
 */
export type AdversaryResult = "DETECTED" | "EVASION_BLOCKED" | "MISSED_DECLARED";

export interface AttackOutcome {
  readonly result: AdversaryResult;
  readonly detail: string;
  /** Present for DETECTED adversaries with an identifiable adversary principal. */
  readonly immuneCertification?: ImmuneResponseCertification;
}

/** One release-gate adversary: a spec plus its deterministic attack executor. */
export interface AdversaryCase {
  readonly adversaryId: string;
  readonly category: AdversaryCategory;
  readonly label: string;
  readonly description: string;
  readonly expected: "DETECTED" | "EVASION_BLOCKED";
  readonly attack: (context: AdversarialContext) => AttackOutcome;
}

// ---------------------------------------------------------------------------
// The certification harness context (assembled by adversarial-suite.ts)
// ---------------------------------------------------------------------------

export const ADVERSARIAL_REVIEW_CAPABILITY_ID = "capability:review.post";
export const ADVERSARIAL_COMMERCE_CAPABILITY_ID = "capability:commerce.command";
export const ADVERSARIAL_GROUPBUY_CAPABILITY_ID = "capability:groupbuy.coordinate";

/** The principal under whose authority the suite journals encounters. */
export const ADVERSARY_OBSERVER: PrincipalRef = {
  principalId: "platform:unicom:adversarial-suite",
  kind: "platform",
};

/** The harness decider (the TL-acceptance stand-in for fixture subjects). */
export const ADVERSARY_HARNESS_PRINCIPAL: PrincipalRef = {
  principalId: "agent:unicom:adversarial-suite",
  kind: "agent",
};

export interface AdversarialContext {
  readonly journal: EvidenceJournal;
  readonly at: string;
  readonly at2: string;
  /** The shared Reality-Lab battery digest (from the context's battery run). */
  readonly batteryDigest: string;
  readonly battery: BatteryRunResult;
  /** The fully-promoted (lab-gated) immune system under certification. */
  readonly immune: SecurityImmuneSystem;
  /** The unified promotion chain pinned to the battery digest. */
  readonly chain: UnifiedPromotionChain;
  readonly graph: OpportunityGraph;
  readonly graphPromotions: readonly PromotionRecord[];
  readonly vocabulary: readonly CapabilityDefinition[];
  readonly ledger: ActorCapabilityLedger;
  readonly configuration: AgentConfiguration;
  readonly scenarios: readonly RealityScenarioSpec[];
}

/** Journal one adversary encounter (hash-chained, append-only). */
export function journalEncounter(
  context: AdversarialContext,
  input: {
    readonly adversaryId: string;
    readonly category: AdversaryCategory;
    readonly result: AdversaryResult;
    readonly detail: string;
  },
): EvidenceCitation {
  const record = context.journal.append({
    evidenceId: `adversary:encounter:${input.adversaryId}`,
    kind: "security-analysis",
    subjectRef: ADVERSARY_OBSERVER,
    payload: {
      evidenceKind: "ADVERSARY_ENCOUNTER",
      adversaryId: input.adversaryId,
      category: input.category,
      result: input.result,
      detail: input.detail,
    },
    recordedAt: context.at2,
  });
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

// ---------------------------------------------------------------------------
// Immune-response certification (journaled + reversible, proven)
// ---------------------------------------------------------------------------

/** The certified immune response to one DETECTED adversary. */
export interface ImmuneResponseCertification {
  readonly adversaryId: string;
  readonly decisionAction: "BLOCK" | "QUARANTINE" | "REVIEW" | "ALLOW";
  readonly decisionId: string;
  readonly quarantinedPrincipalIds: readonly string[];
  readonly attenuatedCapabilityIds: readonly string[];
  /** Attenuation actually held for every principal × capability after quarantine. */
  readonly capabilityRevocationProven: boolean;
  /** Release restored every principal; no attenuation remains. */
  readonly reversalProven: boolean;
  /** Quarantine AND release records both remain in the append-only history. */
  readonly historyPreserved: boolean;
  /** A capability-scoped defensive broadcast was issued. */
  readonly broadcastIssued: boolean;
  readonly broadcastAudienceCount: number;
  readonly certified: boolean;
}

/**
 * Certify the immune response to a detected adversary: run the REAL composed
 * response (classify → decide → quarantine → broadcast), prove the capability
 * revocation held, then prove REVERSIBILITY (release restores every principal
 * while the append-only ledger keeps both records). The certification is the
 * evidence the release gate consumes — an uncertified detection is a FAIL.
 */
export function certifyImmuneResponse(
  context: AdversarialContext,
  input: {
    readonly adversaryId: string;
    readonly signal: SecuritySignal;
    readonly citations: readonly EvidenceCitation[];
    readonly quarantineCapabilityIds: readonly string[];
    readonly broadcastCapabilityDefinitionId: string;
  },
): ImmuneResponseCertification {
  const response = context.immune.respondToThreat({
    signal: input.signal,
    at: context.at2,
    actionIdPrefix: `action:${input.adversaryId}`,
    broadcastId: `broadcast:${input.adversaryId}`,
    quarantinePrincipalRefs: input.signal.subjectRefs,
    quarantineCapabilityIds: input.quarantineCapabilityIds,
    broadcastCapabilityDefinitionId: input.broadcastCapabilityDefinitionId,
    evidenceCitations: input.citations,
  });
  const decision = response.decision;
  const quarantinedPrincipalIds = input.signal.subjectRefs.map((principal) => principal.principalId);
  let capabilityRevocationProven = false;
  let reversalProven = false;
  let historyPreserved = false;

  if (decision !== undefined && (decision.action === "QUARANTINE" || decision.action === "BLOCK")) {
    const quarantines = response.quarantines ?? [];
    capabilityRevocationProven =
      quarantines.length > 0 &&
      quarantines.every((outcome) => outcome.ok) &&
      input.signal.subjectRefs.every((principal) =>
        input.quarantineCapabilityIds.every((capabilityId) =>
          context.immune.isAttenuated(principal.principalId, capabilityId),
        ),
      );

    // Reversibility: release every principal with the same scope + evidence.
    let allReleased = quarantines.length > 0;
    for (const principal of input.signal.subjectRefs) {
      const release = context.immune.release({
        actionId: `action:${input.adversaryId}:release:${principal.principalId}`,
        principalRef: principal,
        scope: {
          kind: "CAPABILITY_SET",
          capabilityDefinitionIds: [...input.quarantineCapabilityIds].sort(),
        },
        decisionRef: decision.decisionId,
        evidenceCitations: input.citations,
        actedAt: context.at2,
      });
      const released =
        release.outcome?.ok === true &&
        input.quarantineCapabilityIds.every(
          (capabilityId) =>
            !context.immune.isAttenuated(principal.principalId, capabilityId),
        );
      if (!released) allReleased = false;
    }
    reversalProven = allReleased;

    historyPreserved = input.signal.subjectRefs.every((principal) => {
      const history = context.immune.quarantineLedger.historyFor(principal.principalId);
      return (
        history.some((record) => record.action === "QUARANTINE") &&
        history.some((record) => record.action === "RELEASE")
      );
    });
  }

  const broadcast = response.broadcast;
  const broadcastIssued = broadcast !== undefined;
  const certified =
    capabilityRevocationProven && reversalProven && historyPreserved && broadcastIssued;

  return {
    adversaryId: input.adversaryId,
    decisionAction: decision?.action ?? "REVIEW",
    decisionId: decision?.decisionId ?? "",
    quarantinedPrincipalIds,
    attenuatedCapabilityIds: [...input.quarantineCapabilityIds].sort(),
    capabilityRevocationProven,
    reversalProven,
    historyPreserved,
    broadcastIssued,
    broadcastAudienceCount: broadcast?.audienceRefs.length ?? 0,
    certified,
  };
}

// ---------------------------------------------------------------------------
// Harness subject helper (adversary subjects that need the full gate chain)
// ---------------------------------------------------------------------------

/**
 * Register an adversary-harness subject and walk it through the FULL unified
 * gate chain with journaled gate evidence (the sanctioned writer; LAB gates
 * carry the context's real battery digest) into promotion. Used by the
 * retirement-circumvention adversaries that need a real promoted subject to
 * attack from.
 */
export function fullyPromotedAdversarySubject(
  context: AdversarialContext,
  subjectType: PromotionSubjectType,
  subjectRef: string,
): void {
  const registered = context.chain.registerSubject(subjectType, subjectRef, context.at);
  if (!registered.ok) throw new Error(`harness registration failed: ${registered.detail}`);
  for (const [index, gate] of UNIFIED_PROMOTION_GATES.entries()) {
    const record = journalUnifiedGateEvidence({
      journal: context.journal,
      evidenceId: `evidence:adversary-harness:${subjectType}:${subjectRef}:${gate}`,
      subjectType,
      subjectRef,
      gate,
      environment: unifiedGateEnvironment(gate),
      batteryDigest: context.batteryDigest,
      outcome: "SUCCESS",
      observedDigest: `adversary-harness:${subjectType}:${subjectRef}:${gate}:${index}`,
      recordedAt: context.at,
    });
    const advanced = context.chain.advanceGate({
      subjectType,
      subjectRef,
      gate,
      evidenceCitations: [
        { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash },
      ],
      transitionedAt: context.at,
    });
    if (!advanced.ok) throw new Error(`harness gate advance failed: ${advanced.violation}`);
  }
  const promoted = context.chain.promote({
    subjectType,
    subjectRef,
    decidedBy: ADVERSARY_HARNESS_PRINCIPAL,
    decidedAt: context.at2,
    reason: "adversarial-suite harness subject (the attack target)",
  });
  if (!promoted.ok) throw new Error(`harness promotion failed: ${promoted.violation}`);
}
