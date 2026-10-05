/**
 * @unicom/agent-kernel — security immune-system enforcement point (W2-002).
 *
 * Realizes the `@unicom/agent` security contracts inside the ZCode kernel:
 * signal → deterministic classification → deterministic policy decision →
 * BLOCK/QUARANTINE/REVIEW → kernel refusal for BLOCK. BLOCK is final: no
 * model prompt, retry or preference can un-block a tool surface, and the
 * refusal payload is byte-identical on every attempt. Broadcasts are
 * defensive-only and validated before issue.
 */

import {
  classifySecuritySignal,
  decideSecurityPolicy,
  issueDefensiveBroadcast,
  requestSecurityOverride,
  type DefensiveSecurityBroadcast,
  type SecurityPolicy,
  type SecurityPolicyDecision,
  type SecuritySignal,
  type SecurityOverrideOutcome,
  type ThreatSignature,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";

export const UNICOM_DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  policyVersion: "unicom-kernel-security-v1",
  blockThresholdBps: 8_500,
};

export interface IngestSecuritySignalOptions {
  /**
   * Tool surfaces this signal governs (e.g. a compromised connector's
   * capability-bound tools). BLOCK freezes them for the plane's lifetime.
   */
  readonly subjectTools?: readonly string[];
}

export interface SecurityRefusalDetail {
  readonly action: "BLOCK";
  readonly final: true;
  readonly decisionId: string;
  readonly threatClass: string;
  readonly policyVersion: string;
  readonly rationale: string;
  readonly evidence: readonly { evidenceId: string; kind: string }[];
}

/** Kernel-side immune-system gate. One instance per installed plane. */
export class UnicomSecurityGate {
  private readonly policy: SecurityPolicy;
  private readonly decisions: SecurityPolicyDecision[] = [];
  private readonly blockedTools = new Map<string, SecurityPolicyDecision>();
  private readonly broadcasts: DefensiveSecurityBroadcast[] = [];

  constructor(policy: SecurityPolicy = UNICOM_DEFAULT_SECURITY_POLICY) {
    this.policy = policy;
  }

  get securityPolicy(): SecurityPolicy {
    return this.policy;
  }

  ingestSignal(signal: SecuritySignal, at: string, options: IngestSecuritySignalOptions = {}): SecurityPolicyDecision {
    const classification = classifySecuritySignal(signal, at);
    const decision = decideSecurityPolicy(classification, this.policy, at);
    this.decisions.push(decision);
    if (decision.action === "BLOCK") {
      for (const toolName of options.subjectTools ?? []) {
        // First BLOCK wins forever: a later ingest can never un-block.
        if (!this.blockedTools.has(toolName)) this.blockedTools.set(toolName, decision);
      }
    }
    return decision;
  }

  listDecisions(): readonly SecurityPolicyDecision[] {
    return [...this.decisions];
  }

  listBroadcasts(): readonly DefensiveSecurityBroadcast[] {
    return [...this.broadcasts];
  }

  /** Deterministic BLOCK check the kernel consults before tool execution. */
  checkTool(toolName: string): UnicomToolHandlerFailure | undefined {
    const decision = this.blockedTools.get(toolName);
    if (!decision) return undefined;
    return refusalFailure(UnicomErrorCode.SECURITY_BLOCK_FINAL, "SECURITY_BLOCK_FINAL", {
      action: "BLOCK",
      decidedAt: decision.decidedAt,
      decisionId: decision.decisionId,
      evidence: decision.evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind })),
      final: true,
      policyVersion: decision.policyVersion,
      rationale: decision.rationale,
      threatClass: decision.rationale.split(" at ")[0] ?? "",
    });
  }

  /** Override attempts always fail for BLOCK (deterministic, final). */
  requestOverride(decision: SecurityPolicyDecision): SecurityOverrideOutcome {
    return requestSecurityOverride(decision);
  }

  findDecision(decisionId: string): SecurityPolicyDecision | undefined {
    return this.decisions.find((decision) => decision.decisionId === decisionId);
  }

  /** Defensive-only broadcast; weaponized signatures are rejected before issue. */
  issueBroadcast(input: {
    broadcastId: string;
    signature: unknown;
    audienceRefs: DefensiveSecurityBroadcast["audienceRefs"];
    issuedAt: string;
  }): DefensiveSecurityBroadcast {
    const broadcast = issueDefensiveBroadcast({
      broadcastId: input.broadcastId,
      signature: input.signature as ThreatSignature,
      audienceRefs: input.audienceRefs,
      issuedAt: input.issuedAt,
    });
    this.broadcasts.push(broadcast);
    return broadcast;
  }
}
