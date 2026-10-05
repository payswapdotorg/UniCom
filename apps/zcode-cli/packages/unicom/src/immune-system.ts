/**
 * @unicom/agent-kernel — Security Immune System enforcement point (W2-004).
 *
 * Realizes the W2-004 immune contracts inside the ZCode kernel:
 * - the immune logic entries are BORN IN THE LAB: registered into the SAME
 *   promotion log as the coordination logic and UNREACHABLE from the
 *   runtime plane until evidence-bearing promotions activate them — every
 *   lab-gated operation returns a typed kernel refusal
 *   (IMMUNE_LOGIC_NOT_PROMOTED) when its logic id is not promoted;
 * - quarantine is REVERSIBLE capability attenuation enforced at the kernel
 *   tool gate: a principal whose capability scope is attenuated gets a
 *   typed CAPABILITY_QUARANTINED refusal; after the release record is
 *   appended, execution flows again — the append-only ledger history keeps
 *   both records forever;
 * - commerce facts enter through the pinned opaque seam
 *   (CommerceEvidenceFactsPort) and are journaled as append-only evidence;
 * - BLOCK stays final (the W2-002 security gate is untouched); broadcasts
 *   are capability-scoped, minimum-necessary and defensive-only.
 */

import {
  EvidenceJournal,
  immuneLabCandidates,
  journalCommerceFacts,
  pinCommerceFactsInterface,
  SecurityImmuneSystem,
  UNICOM_IMMUNE_LOGIC,
  type ArchetypeDetectionResult,
  type CommerceEvidenceFactsPort,
  type EvidenceCitation,
  type ImmuneActionOutcome,
  type JournaledEvidenceRecord,
  type PrincipalRef,
  type ScopedDefensiveBroadcast,
  type SecurityBroadcastScope,
  type SecurityPolicy,
  type SecurityPolicyDecision,
  type SecuritySignal,
  type ThreatSignature,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomOpportunityLab } from "./opportunity-lab.js";

export interface UnicomImmuneSystemOptions {
  /** Shared with the coordination lab: ONE promotion log + registry. */
  readonly lab: UnicomOpportunityLab;
  readonly securityPolicy?: SecurityPolicy;
  readonly now?: () => string;
}

/** Principal-side immune-system + evidence-journal authority (never model-writable). */
export class UnicomImmuneSystem {
  readonly journal = new EvidenceJournal();
  readonly system: SecurityImmuneSystem;

  private readonly lab: UnicomOpportunityLab;
  private readonly now: () => string;

  constructor(options: UnicomImmuneSystemOptions) {
    this.lab = options.lab;
    this.now = options.now ?? (() => new Date().toISOString());
    for (const candidate of immuneLabCandidates(this.now())) {
      if (this.lab.log.findCandidate(candidate.logicId) === undefined) {
        this.lab.log.registerCandidate(candidate);
      }
    }
    this.system = new SecurityImmuneSystem({
      policy: options.securityPolicy ?? {
        policyVersion: "unicom-kernel-immune-v1",
        blockThresholdBps: 8_500,
      },
      runtimeRegistry: this.lab.runtimeRegistry,
      capabilityVocabulary: this.lab.capabilities.canonicalVocabulary(),
      capabilityHolders: (capabilityDefinitionId) =>
        this.lab.capabilities.holdersOfCapability(capabilityDefinitionId).map((principalId) => ({ principalId, kind: "agent" as const })),
      now: this.now,
    });
  }

  // -- typed kernel refusals ------------------------------------------------

  private kernelRefusal(refusal: { readonly code: string; readonly logicId: string; readonly runtimeLogicIds: readonly string[]; readonly detail: string }): UnicomToolHandlerFailure {
    return refusalFailure(UnicomErrorCode.IMMUNE_LOGIC_NOT_PROMOTED, "IMMUNE_LOGIC_NOT_PROMOTED", {
      logicId: refusal.logicId,
      runtimeLogicIds: refusal.runtimeLogicIds,
      detail: refusal.detail,
    });
  }

  /**
   * The kernel tool-gate check: a quarantined capability scope refuses the
   * tools bound to that capability for the quarantined principal. The
   * refusal is reversible — the release record restores execution.
   */
  attenuationRefusalFor(principalId: string, capabilityDefinitionId: string): UnicomToolHandlerFailure | undefined {
    if (!this.system.isAttenuated(principalId, capabilityDefinitionId)) return undefined;
    const attenuations = this.system.activeAttenuationsFor(principalId);
    return refusalFailure(UnicomErrorCode.CAPABILITY_QUARANTINED, "CAPABILITY_QUARANTINED", {
      principalId,
      capabilityDefinitionId,
      reversible: true,
      activeAttenuations: attenuations.map((entry) => ({ sinceActionId: entry.sinceActionId, scope: entry.scope })),
      detail: "capability attenuated by reversible immune quarantine — release restores execution; the ledger history stays append-only",
    });
  }

  // -- principal-side journaling (never model-writable) --------------------

  /** Journal evidence principal-side (typed payload, append-only). */
  recordEvidence(input: {
    readonly evidenceId: string;
    readonly kind: JournaledEvidenceRecord["kind"];
    readonly subjectRef: PrincipalRef;
    readonly payload: JournaledEvidenceRecord["payload"];
  }): JournaledEvidenceRecord {
    return this.journal.append({ ...input, recordedAt: this.now() });
  }

  /**
   * Pull commerce facts through the pinned opaque seam and journal them as
   * append-only evidence records — the ONLY commerce access for evidence.
   */
  journalCommerceFacts(input: {
    readonly port: unknown;
    readonly orderRefs: readonly string[];
    readonly customerRefs?: readonly string[];
    readonly subjectRef?: PrincipalRef;
  }): { readonly failure?: UnicomToolHandlerFailure; readonly records?: readonly JournaledEvidenceRecord[] } {
    let pinned: CommerceEvidenceFactsPort;
    try {
      pinned = pinCommerceFactsInterface(input.port);
    } catch (error) {
      return {
        failure: refusalFailure(UnicomErrorCode.COMMERCE_SEAM_UNAVAILABLE, "COMMERCE_SEAM_UNAVAILABLE", {
          detail: error instanceof Error ? error.message : String(error),
        }),
      };
    }
    const subjectRef = input.subjectRef ?? { principalId: "platform:unicom:immune", kind: "platform" as const };
    return {
      records: journalCommerceFacts({
        journal: this.journal,
        port: pinned,
        orderRefs: input.orderRefs,
        customerRefs: input.customerRefs,
        subjectRef,
        recordedAt: this.now(),
      }),
    };
  }

  /** Citations for journaled evidence (for immune actions and proofs). */
  citationsFor(evidenceIds: readonly string[]): readonly EvidenceCitation[] {
    return evidenceIds.map((evidenceId) => this.journal.citationFor(evidenceId));
  }

  // -- lab-gated runtime operations ----------------------------------------

  /** Ingest a raw security signal (classify + decide; lab-gated). */
  ingestSignal(signal: SecuritySignal, at?: string): { readonly failure?: UnicomToolHandlerFailure; readonly decision?: SecurityPolicyDecision } {
    const outcome = this.system.ingestSignal(signal, at ?? this.now());
    if (outcome.refusal) return { failure: this.kernelRefusal(outcome.refusal) };
    return { decision: outcome.decision };
  }

  /** Run the five fraud-archetype detectors over journaled evidence (lab-gated). */
  detectArchetypes(at?: string): { readonly failure?: UnicomToolHandlerFailure; readonly results?: readonly ArchetypeDetectionResult[] } {
    const outcome = this.system.detectArchetypes(this.journal.records(), at ?? this.now());
    if (outcome.refusal) return { failure: this.kernelRefusal(outcome.refusal) };
    return { results: outcome.results };
  }

  /** The composed immune response: decide → quarantine → broadcast (lab-gated). */
  respondToThreat(input: {
    readonly signal: SecuritySignal;
    readonly at?: string;
    readonly actionIdPrefix: string;
    readonly broadcastId: string;
    readonly quarantinePrincipalRefs: readonly PrincipalRef[];
    readonly quarantineCapabilityIds: readonly string[];
    readonly broadcastCapabilityDefinitionId: string;
    readonly opaqueSubjectRefs?: readonly string[];
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): {
    readonly failure?: UnicomToolHandlerFailure;
    readonly decision?: SecurityPolicyDecision;
    readonly quarantines?: readonly ImmuneActionOutcome[];
    readonly broadcast?: ScopedDefensiveBroadcast;
  } {
    const outcome = this.system.respondToThreat({
      signal: input.signal,
      at: input.at ?? this.now(),
      actionIdPrefix: input.actionIdPrefix,
      broadcastId: input.broadcastId,
      quarantinePrincipalRefs: input.quarantinePrincipalRefs,
      quarantineCapabilityIds: input.quarantineCapabilityIds,
      broadcastCapabilityDefinitionId: input.broadcastCapabilityDefinitionId,
      opaqueSubjectRefs: input.opaqueSubjectRefs,
      evidenceCitations: input.evidenceCitations,
    });
    if (outcome.refusal) return { failure: this.kernelRefusal(outcome.refusal) };
    return { decision: outcome.decision, quarantines: outcome.quarantines, broadcast: outcome.broadcast };
  }

  /** Release a quarantine: appends the reversal record (lab-gated). */
  release(input: {
    readonly actionId: string;
    readonly principalRef: PrincipalRef;
    readonly capabilityDefinitionIds: readonly string[];
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): { readonly failure?: UnicomToolHandlerFailure; readonly outcome?: ImmuneActionOutcome } {
    const outcome = this.system.release({
      actionId: input.actionId,
      principalRef: input.principalRef,
      scope: { kind: "CAPABILITY_SET", capabilityDefinitionIds: [...input.capabilityDefinitionIds].sort() },
      decisionRef: input.decisionRef,
      evidenceCitations: input.evidenceCitations,
      actedAt: this.now(),
    });
    if (outcome.refusal) return { failure: this.kernelRefusal(outcome.refusal) };
    return { outcome: outcome.outcome };
  }

  /** Issue a scoped defensive broadcast (lab-gated, defensive-only). */
  broadcast(input: {
    readonly broadcastId: string;
    readonly scope: SecurityBroadcastScope;
    readonly signature?: ThreatSignature;
  }): { readonly failure?: UnicomToolHandlerFailure; readonly broadcast?: ScopedDefensiveBroadcast } {
    const outcome = this.system.broadcast({
      broadcastId: input.broadcastId,
      scope: input.scope,
      signature: input.signature,
      issuedAt: this.now(),
    });
    if (outcome.refusal) return { failure: this.kernelRefusal(outcome.refusal) };
    if (outcome.broadcast === undefined) {
      return {
        failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
          detail: outcome.detail ?? "broadcast could not be issued",
        }),
      };
    }
    return { broadcast: outcome.broadcast };
  }

  /** The immune logic ids born under the shared lab gates. */
  static readonly LOGIC = UNICOM_IMMUNE_LOGIC;
}
