/**
 * Trust plane contracts (FROZEN-ARCHITECTURE §3.G; invariants 21/22).
 *
 * UserTrust, AgentTrust and CapabilityTrust are DISTINCT typed records with
 * different subjects and different evidence. They are never conflated and
 * never substitute for TransactionProof (proof.ts).
 */

import type { EvidenceReference, PrincipalRef } from "./common.js";

/** Discrete trust-plane discriminant. */
export type TrustRecordKind = "USER_TRUST" | "AGENT_TRUST" | "CAPABILITY_TRUST";

/** Standing of a USER principal: identity, history, behavior. */
export interface UserTrust {
  readonly trustRecordId: string;
  readonly kind: "USER_TRUST";
  readonly subjectRef: PrincipalRef;
  readonly identityVerification: "UNVERIFIED" | "BASIC" | "STRONG";
  readonly verifiedPurchaseCount: number;
  /** Dispute rate in basis points (integer — no floating-point rates). */
  readonly disputeRateBps: number;
  readonly assessedAt: string;
  readonly validUntil?: string;
}

/** Standing of an AGENT principal: outcomes, compliance, evaluation lineage. */
export interface AgentTrust {
  readonly trustRecordId: string;
  readonly kind: "AGENT_TRUST";
  readonly subjectRef: PrincipalRef;
  readonly taskSuccessRate: number;
  readonly policyCompliance: "CLEAN" | "MINOR_VIOLATIONS" | "SUSPENDED";
  /** Lab evaluation evidence lineage (invariant 32). */
  readonly evaluationEvidenceRefs?: readonly EvidenceReference[];
  readonly assessedAt: string;
  readonly validUntil?: string;
}

/** Standing of a capability/provider implementation: reliability. */
export interface CapabilityTrust {
  readonly trustRecordId: string;
  readonly kind: "CAPABILITY_TRUST";
  readonly subjectCapabilityDefinitionId: string;
  readonly subjectProviderImplementationId?: string;
  /** Observation reliability in basis points (0..10000). */
  readonly observationReliabilityBps: number;
  readonly executionSuccessRate: number;
  readonly assessedAt: string;
  readonly validUntil?: string;
}

export type TrustRecord = UserTrust | AgentTrust | CapabilityTrust;

/** Discriminate a trust record without ever conflating the planes. */
export function trustRecordKind(record: TrustRecord): TrustRecordKind {
  return record.kind;
}
