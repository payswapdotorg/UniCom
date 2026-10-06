/**
 * The Security Immune System (W2-004; FROZEN-ARCHITECTURE §3.H;
 * invariants 24/25/48/49; W2-003 promotion-gate discipline).
 *
 * Pipeline: journaled evidence → signal → deterministic classification →
 * deterministic policy decision → immune action (quarantine/suspension as
 * REVERSIBLE capability attenuation — never deletion) → evidence-carrying
 * append-only records → capability-scoped DEFENSIVE broadcast.
 *
 * Immune logic is BORN IN THE LAB: every runtime-reachable operation is
 * gated by the W2-003 promotion discipline — its logic id must be activated
 * through an evidence-bearing promotion (append-only hash-chained log +
 * runtime activation registry) or the operation is unreachable, returning a
 * typed IMMUNE_LOGIC_NOT_PROMOTED refusal. BLOCK decisions remain final and
 * deterministic (invariant 24); broadcasts stay defensive-only (25/49).
 */

import type { PrincipalRef } from "./common.js";
import type { CapabilityDefinition } from "./capability/capability.js";
import type { LabCandidate, LabGatedRuntimeRegistry } from "./lab-promotion.js";
import type { EvidenceCitation, JournaledEvidenceRecord } from "./evidence-journal.js";
import {
  QuarantineLedger,
  type ActiveAttenuation,
  type CapabilityAttenuationScope,
  type ImmuneActionOutcome,
} from "./immune-action.js";
import { detectAllArchetypes, type ArchetypeDetectionResult } from "./archetype-suite.js";
import {
  buildScopedDefensiveBroadcast,
  computeBroadcastAudience,
  defensiveSignatureFor,
  type BroadcastAudience,
  type ScopedDefensiveBroadcast,
  type SecurityBroadcastScope,
} from "./immune-broadcast.js";
import {
  classifySecuritySignal,
  decideSecurityPolicy,
  type SecurityPolicy,
  type SecurityPolicyDecision,
  type SecuritySignal,
  type ThreatSignature,
} from "./security.js";

/** The W2-004 immune-system logic entries born under Lab gates. */
export const UNICOM_IMMUNE_LOGIC = {
  SIGNAL_CLASSIFICATION: "logic:unicom:security-signal-classification",
  ARCHETYPE_DETECTION: "logic:unicom:fraud-archetype-detection",
  QUARANTINE_ATTENUATION: "logic:unicom:immune-quarantine-attenuation",
  DEFENSIVE_BROADCAST: "logic:unicom:security-defensive-broadcast",
} as const;

/** Typed refusal: immune logic that is not promoted is unreachable. */
export interface ImmuneRefusal {
  readonly code: "IMMUNE_LOGIC_NOT_PROMOTED";
  readonly logicId: string;
  readonly runtimeLogicIds: readonly string[];
  readonly detail: string;
}

export interface ImmuneSystemOptions {
  readonly policy: SecurityPolicy;
  /** The shared runtime activation registry (same log as the coordination lab). */
  readonly runtimeRegistry: LabGatedRuntimeRegistry;
  /** ONE canonical vocabulary — quarantine scopes are validated against it. */
  readonly capabilityVocabulary: readonly CapabilityDefinition[];
  /** Resolve holders of a capability for broadcast audiences. */
  readonly capabilityHolders?: (capabilityDefinitionId: string) => readonly PrincipalRef[];
  readonly now?: () => string;
}

/** The lab candidates for the immune logic entries (register into the shared log). */
export function immuneLabCandidates(registeredAt: string): readonly LabCandidate[] {
  return [
    {
      logicId: UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION,
      kind: "DETECTION",
      version: "v1",
      description: "deterministic security signal classification + policy decision",
      registeredAt,
    },
    {
      logicId: UNICOM_IMMUNE_LOGIC.ARCHETYPE_DETECTION,
      kind: "DETECTION",
      version: "v1",
      description: "five fraud-archetype adversarial evidence-flow detection",
      registeredAt,
    },
    {
      logicId: UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION,
      kind: "ATTENUATION",
      version: "v1",
      description: "reversible capability attenuation (quarantine/suspension/release)",
      registeredAt,
    },
    {
      logicId: UNICOM_IMMUNE_LOGIC.DEFENSIVE_BROADCAST,
      kind: "BROADCAST",
      version: "v1",
      description: "capability-scoped minimum-necessary defensive broadcast",
      registeredAt,
    },
  ];
}

/**
 * The runtime immune system. Every operation consults the lab promotion
 * registry first; decisions, immune actions and broadcasts are recorded as
 * evidence-bearing append-only state.
 */
export class SecurityImmuneSystem {
  readonly quarantineLedger = new QuarantineLedger();

  private readonly policy: SecurityPolicy;
  private readonly runtimeRegistry: LabGatedRuntimeRegistry;
  private readonly capabilityVocabulary: readonly CapabilityDefinition[];
  private readonly capabilityHolders?: (capabilityDefinitionId: string) => readonly PrincipalRef[];
  private readonly decisions: SecurityPolicyDecision[] = [];
  private readonly broadcasts: ScopedDefensiveBroadcast[] = [];
  private readonly now: () => string;

  constructor(options: ImmuneSystemOptions) {
    this.policy = options.policy;
    this.runtimeRegistry = options.runtimeRegistry;
    this.capabilityVocabulary = options.capabilityVocabulary;
    this.capabilityHolders = options.capabilityHolders;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // -- gate ----------------------------------------------------------------

  private refusalFor(logicId: string): ImmuneRefusal | undefined {
    if (this.runtimeRegistry.isRuntimeReachable(logicId)) return undefined;
    return {
      code: "IMMUNE_LOGIC_NOT_PROMOTED",
      logicId,
      runtimeLogicIds: this.runtimeRegistry.runtimeLogicIds(),
      detail:
        "immune logic is born in the Lab; it is unreachable from the runtime plane until an evidence-bearing promotion activates it",
    };
  }

  // -- pipeline ------------------------------------------------------------

  /** Ingest a raw signal: classify + decide (deterministic, lab-gated). */
  ingestSignal(
    signal: SecuritySignal,
    at: string,
  ): { readonly refusal?: ImmuneRefusal; readonly decision?: SecurityPolicyDecision } {
    const refusal = this.refusalFor(UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION);
    if (refusal) return { refusal };
    const classification = classifySecuritySignal(signal, at);
    const decision = decideSecurityPolicy(classification, this.policy, at);
    this.decisions.push(decision);
    return { decision };
  }

  /** Run the five fraud-archetype detectors over journaled evidence (lab-gated). */
  detectArchetypes(
    records: readonly JournaledEvidenceRecord[],
    at: string,
  ): { readonly refusal?: ImmuneRefusal; readonly results?: readonly ArchetypeDetectionResult[] } {
    const refusal = this.refusalFor(UNICOM_IMMUNE_LOGIC.ARCHETYPE_DETECTION);
    if (refusal) return { refusal };
    return { results: detectAllArchetypes(records, at) };
  }

  /** Quarantine principals: reversible capability attenuation (lab-gated). */
  quarantine(input: {
    readonly actionId: string;
    readonly principalRef: PrincipalRef;
    readonly scope: CapabilityAttenuationScope;
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly actedAt: string;
  }): { readonly refusal?: ImmuneRefusal; readonly outcome?: ImmuneActionOutcome } {
    const refusal = this.refusalFor(UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION);
    if (refusal) return { refusal };
    const vocabularyFailure = this.validateScopeVocabulary(input.scope);
    if (vocabularyFailure) return { outcome: vocabularyFailure };
    return { outcome: this.quarantineLedger.quarantine({ ...input, action: "QUARANTINE" }) };
  }

  /** Release: the reversal — appends a restoring record (lab-gated). */
  release(input: {
    readonly actionId: string;
    readonly principalRef: PrincipalRef;
    readonly scope: CapabilityAttenuationScope;
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly actedAt: string;
  }): { readonly refusal?: ImmuneRefusal; readonly outcome?: ImmuneActionOutcome } {
    const refusal = this.refusalFor(UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION);
    if (refusal) return { refusal };
    return { outcome: this.quarantineLedger.release({ ...input, action: "RELEASE" }) };
  }

  /** Issue a capability-scoped defensive broadcast (lab-gated, defensive-only). */
  broadcast(input: {
    readonly broadcastId: string;
    readonly scope: SecurityBroadcastScope;
    readonly signature?: ThreatSignature;
    readonly issuedAt?: string;
  }): {
    readonly refusal?: ImmuneRefusal;
    readonly audience?: BroadcastAudience;
    readonly broadcast?: ScopedDefensiveBroadcast;
    readonly detail?: string;
  } {
    const refusal = this.refusalFor(UNICOM_IMMUNE_LOGIC.DEFENSIVE_BROADCAST);
    if (refusal) return { refusal };
    if (this.capabilityHolders === undefined) {
      return { detail: "no capability-holder resolver configured — audience cannot be scoped" };
    }
    const audience = computeBroadcastAudience({
      scope: input.scope,
      capabilityHolders: this.capabilityHolders(input.scope.capabilityDefinitionId),
    });
    const signature =
      input.signature ??
      defensiveSignatureFor({
        signatureId: `signature:${input.broadcastId}`,
        threatClass: input.scope.threatClass,
        publishedAt: input.issuedAt ?? this.now(),
      });
    const built = buildScopedDefensiveBroadcast({
      broadcastId: input.broadcastId,
      scope: input.scope,
      audience,
      signature,
      issuedAt: input.issuedAt ?? this.now(),
    });
    if (!built.ok) return { audience, detail: `${built.violation}: ${built.detail}` };
    this.broadcasts.push(built.broadcast);
    return { audience, broadcast: built.broadcast };
  }

  /**
   * The composed immune response to one signal: classify → decide →
   * (QUARANTINE/BLOCK) quarantine the affected principals → defensive
   * broadcast to the scoped audience. All three logic gates must be
   * promoted; BLOCK decisions are final (no override path exists).
   */
  respondToThreat(input: {
    readonly signal: SecuritySignal;
    readonly at: string;
    readonly actionIdPrefix: string;
    readonly broadcastId: string;
    /** Principals quarantined when the decision attenuates. */
    readonly quarantinePrincipalRefs: readonly PrincipalRef[];
    /** Capability scope attenuated on quarantine (one vocabulary). */
    readonly quarantineCapabilityIds: readonly string[];
    /** Capability whose holders receive the defensive broadcast. */
    readonly broadcastCapabilityDefinitionId: string;
    readonly opaqueSubjectRefs?: readonly string[];
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): {
    readonly refusal?: ImmuneRefusal;
    readonly decision?: SecurityPolicyDecision;
    readonly quarantines?: readonly ImmuneActionOutcome[];
    readonly broadcast?: ScopedDefensiveBroadcast;
  } {
    for (const logicId of [
      UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION,
      UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION,
      UNICOM_IMMUNE_LOGIC.DEFENSIVE_BROADCAST,
    ]) {
      const refusal = this.refusalFor(logicId);
      if (refusal) return { refusal };
    }
    const classification = classifySecuritySignal(input.signal, input.at);
    const decision = decideSecurityPolicy(classification, this.policy, input.at);
    this.decisions.push(decision);

    const quarantines: ImmuneActionOutcome[] = [];
    if (decision.action === "QUARANTINE" || decision.action === "BLOCK") {
      const scope: CapabilityAttenuationScope = {
        kind: "CAPABILITY_SET",
        capabilityDefinitionIds: [...input.quarantineCapabilityIds].sort(),
      };
      for (const principalRef of [...input.quarantinePrincipalRefs].sort((a, b) =>
        a.principalId < b.principalId ? -1 : 1,
      )) {
        quarantines.push(
          this.quarantineLedger.quarantine({
            actionId: `${input.actionIdPrefix}:${principalRef.principalId}`,
            action: "QUARANTINE",
            principalRef,
            scope,
            decisionRef: decision.decisionId,
            evidenceCitations: input.evidenceCitations,
            actedAt: input.at,
          }),
        );
      }
    }

    let broadcast: ScopedDefensiveBroadcast | undefined;
    if (decision.action === "QUARANTINE" || decision.action === "BLOCK") {
      const issued = this.broadcast({
        broadcastId: input.broadcastId,
        scope: {
          threatClass: classification.threatClass,
          affectedPrincipalRefs: input.quarantinePrincipalRefs,
          capabilityDefinitionId: input.broadcastCapabilityDefinitionId,
          opaqueSubjectRefs: input.opaqueSubjectRefs,
        },
        issuedAt: input.at,
      });
      broadcast = issued.broadcast;
    }
    return { decision, quarantines: quarantines.length > 0 ? quarantines : undefined, broadcast };
  }

  // -- state views ---------------------------------------------------------

  isAttenuated(principalId: string, capabilityDefinitionId: string): boolean {
    return this.quarantineLedger.isAttenuated(principalId, capabilityDefinitionId);
  }

  activeAttenuationsFor(principalId: string): readonly ActiveAttenuation[] {
    return this.quarantineLedger.activeAttenuationsFor(principalId);
  }

  listDecisions(): readonly SecurityPolicyDecision[] {
    return [...this.decisions];
  }

  listBroadcasts(): readonly ScopedDefensiveBroadcast[] {
    return this.broadcasts.map((broadcast) => ({ ...broadcast }));
  }

  private validateScopeVocabulary(
    scope: CapabilityAttenuationScope,
  ): ImmuneActionOutcome | undefined {
    if (scope.kind === "ALL_CAPABILITIES") return undefined;
    const vocabulary = new Set(
      this.capabilityVocabulary.map((definition) => definition.capabilityDefinitionId),
    );
    const unknown = scope.capabilityDefinitionIds.filter((id) => !vocabulary.has(id));
    if (unknown.length > 0) {
      return {
        ok: false,
        violation: "CAPABILITY_NOT_IN_CANONICAL_VOCABULARY",
        detail: `attenuation scope references capabilities outside the canonical vocabulary: ${unknown.join(", ")}`,
      };
    }
    return undefined;
  }
}
