/**
 * Security immune system contracts (FROZEN-ARCHITECTURE §3.H, §22.3;
 * invariants 24/25/48/49).
 *
 * Pipeline: signal → classify → signature → deterministic policy decision →
 * block/quarantine/review → evidence → controlled defensive broadcast →
 * learning. Security BLOCK is a deterministic hard constraint that no model
 * preference can override. Signatures and broadcasts are DEFENSIVE ONLY.
 */

import type { EvidenceReference, PrincipalRef } from "./common.js";

export type SecuritySignalDomain =
  | "REVIEW"
  | "PRODUCT"
  | "MERCHANT"
  | "CUSTOMER"
  | "ORDER"
  | "CLAIM"
  | "SHIPMENT"
  | "PACKAGE"
  | "RETURN"
  | "REFUND"
  | "PAYMENT"
  | "ACCOUNT"
  | "CONNECTOR"
  | "AGENT"
  | "DEVICE";

export type SecurityThreatClass =
  | "FAKE_REVIEW"
  | "REVIEW_RING"
  | "PRODUCT_SUBSTITUTION"
  | "COUNTERFEIT_SUBSTITUTION"
  | "WRONG_ITEM_SHIPMENT"
  | "FALSE_ITEM_NOT_AS_DESCRIBED"
  | "FALSE_NON_DELIVERY"
  | "REFUND_RETURN_ABUSE"
  | "ACCOUNT_TAKEOVER"
  | "PAYMENT_MANIPULATION"
  | "CONNECTOR_COMPROMISE"
  | "AGENT_PROMPT_INJECTION"
  | "COORDINATED_AGENT_ABUSE"
  | "MARKETPLACE_COLLUSION"
  | "SYNTHETIC_IDENTITY_SYBIL"
  | "UNCLASSIFIED";

export type SecurityIndicatorKind =
  | "duplicate-content-fingerprint"
  | "shared-device-fingerprint"
  | "burst-timing-pattern"
  | "account-age-pattern"
  | "coordinated-account-graph"
  | "sku-mismatch"
  | "package-weight-mismatch"
  | "declared-vs-observed-conflict"
  | "claim-subject-mismatch"
  | "delivery-confirmation-conflict"
  | "return-frequency-anomaly"
  | "payment-instrument-anomaly"
  | "prompt-injection-marker"
  | "provenance-anomaly";

export interface SecurityIndicator {
  readonly indicatorKind: SecurityIndicatorKind;
  readonly value: string;
  /** Confidence in basis points (integer). */
  readonly confidenceBps: number;
}

export interface SecuritySignal {
  readonly signalId: string;
  readonly domain: SecuritySignalDomain;
  readonly detectedAt: string;
  readonly subjectRefs: readonly PrincipalRef[];
  readonly indicators: readonly SecurityIndicator[];
  /** Correlation across principals only under a declared policy (invariant 48). */
  readonly correlationPolicyRef?: string;
}

export interface ThreatClassification {
  readonly signalId: string;
  readonly threatClass: SecurityThreatClass;
  readonly confidenceBps: number;
  readonly classifiedBy: "deterministic-rule";
  readonly classifiedAt: string;
}

const THREAT_CLASSES: ReadonlySet<string> = new Set([
  "FAKE_REVIEW", "REVIEW_RING", "PRODUCT_SUBSTITUTION", "COUNTERFEIT_SUBSTITUTION",
  "WRONG_ITEM_SHIPMENT", "FALSE_ITEM_NOT_AS_DESCRIBED", "FALSE_NON_DELIVERY",
  "REFUND_RETURN_ABUSE", "ACCOUNT_TAKEOVER", "PAYMENT_MANIPULATION",
  "CONNECTOR_COMPROMISE", "AGENT_PROMPT_INJECTION", "COORDINATED_AGENT_ABUSE",
  "MARKETPLACE_COLLUSION", "SYNTHETIC_IDENTITY_SYBIL", "UNCLASSIFIED",
]);

function has(signal: SecuritySignal, kind: SecurityIndicatorKind): boolean {
  return signal.indicators.some((indicator) => indicator.indicatorKind === kind);
}

function claimSubject(signal: SecuritySignal): string {
  const indicator = signal.indicators.find((candidate) => candidate.indicatorKind === "claim-subject-mismatch");
  return indicator?.value ?? "";
}

/** Deterministic confidence: base 7000 + 1000 per corroborating indicator, capped. */
function signalConfidence(signal: SecuritySignal): number {
  return Math.min(7000 + 1000 * Math.max(0, signal.indicators.length - 1), 9900);
}

/**
 * Stage-0 deterministic classifier (rule-ordered; replaceable by learned
 * components only through Lab promotion — see experiment.ts).
 */
export function classifySecuritySignal(signal: SecuritySignal, at: string): ThreatClassification {
  const domain = signal.domain;
  let threatClass: SecurityThreatClass = "UNCLASSIFIED";

  if (domain === "REVIEW") {
    const coordinated = has(signal, "shared-device-fingerprint") || has(signal, "burst-timing-pattern") || has(signal, "coordinated-account-graph");
    if (has(signal, "duplicate-content-fingerprint") && coordinated) threatClass = "REVIEW_RING";
    else if (has(signal, "duplicate-content-fingerprint")) threatClass = "FAKE_REVIEW";
  } else if (domain === "SHIPMENT" || domain === "PACKAGE") {
    if (has(signal, "sku-mismatch") || has(signal, "declared-vs-observed-conflict")) threatClass = "WRONG_ITEM_SHIPMENT";
    else if (has(signal, "package-weight-mismatch")) threatClass = "COUNTERFEIT_SUBSTITUTION";
  } else if (domain === "CLAIM") {
    if (has(signal, "claim-subject-mismatch") && has(signal, "delivery-confirmation-conflict")) {
      threatClass = claimSubject(signal).includes("non-delivery") ? "FALSE_NON_DELIVERY" : "FALSE_ITEM_NOT_AS_DESCRIBED";
    }
  } else if (domain === "RETURN" || domain === "REFUND") {
    if (has(signal, "return-frequency-anomaly")) threatClass = "REFUND_RETURN_ABUSE";
  } else if (domain === "PAYMENT") {
    if (has(signal, "payment-instrument-anomaly")) threatClass = "PAYMENT_MANIPULATION";
  } else if (domain === "AGENT" || domain === "CONNECTOR") {
    if (has(signal, "prompt-injection-marker")) threatClass = "AGENT_PROMPT_INJECTION";
  } else if (domain === "ACCOUNT") {
    if (has(signal, "account-age-pattern") && has(signal, "coordinated-account-graph")) threatClass = "SYNTHETIC_IDENTITY_SYBIL";
  }

  return {
    signalId: signal.signalId,
    threatClass,
    confidenceBps: signalConfidence(signal),
    classifiedBy: "deterministic-rule",
    classifiedAt: at,
  };
}

export type SecurityPolicyAction = "BLOCK" | "QUARANTINE" | "REVIEW" | "ALLOW";

export interface SecurityPolicy {
  readonly policyVersion: string;
  /** Confidence at or above which block-eligible classes become BLOCK. */
  readonly blockThresholdBps: number;
}

export interface SecurityPolicyDecision {
  readonly decisionId: string;
  readonly signalId: string;
  readonly action: SecurityPolicyAction;
  readonly policyVersion: string;
  /** true iff action is BLOCK — deterministic hard constraint (invariant 24). */
  readonly final: boolean;
  readonly rationale: string;
  readonly evidence: readonly EvidenceReference[];
  readonly decidedAt: string;
}

const BLOCK_ELIGIBLE: ReadonlySet<string> = new Set([
  "REVIEW_RING", "WRONG_ITEM_SHIPMENT", "ACCOUNT_TAKEOVER", "PAYMENT_MANIPULATION",
  "CONNECTOR_COMPROMISE", "AGENT_PROMPT_INJECTION",
]);

const QUARANTINE_ELIGIBLE: ReadonlySet<string> = new Set([
  "FAKE_REVIEW", "PRODUCT_SUBSTITUTION", "COUNTERFEIT_SUBSTITUTION",
  "FALSE_ITEM_NOT_AS_DESCRIBED", "FALSE_NON_DELIVERY", "REFUND_RETURN_ABUSE",
  "COORDINATED_AGENT_ABUSE", "MARKETPLACE_COLLUSION", "SYNTHETIC_IDENTITY_SYBIL",
]);

/** Deterministic policy decision — identical inputs, identical output. */
export function decideSecurityPolicy(
  classification: ThreatClassification,
  policy: SecurityPolicy,
  at: string,
): SecurityPolicyDecision {
  const action: SecurityPolicyAction =
    classification.threatClass === "UNCLASSIFIED" ? "REVIEW"
      : BLOCK_ELIGIBLE.has(classification.threatClass)
        ? (classification.confidenceBps >= policy.blockThresholdBps ? "BLOCK" : "QUARANTINE")
        : QUARANTINE_ELIGIBLE.has(classification.threatClass)
          ? "QUARANTINE"
          : "REVIEW";
  return {
    decisionId: `decision:${classification.signalId}:${policy.policyVersion}`,
    signalId: classification.signalId,
    action,
    policyVersion: policy.policyVersion,
    final: action === "BLOCK",
    rationale: `${classification.threatClass} at ${classification.confidenceBps}bps under ${policy.policyVersion} → ${action}`,
    evidence: [
      { evidenceId: `classification:${classification.signalId}`, kind: "security-analysis" },
    ],
    decidedAt: at,
  };
}

export type SecurityOverrideOutcome =
  | { readonly granted: true; readonly note: string }
  | { readonly granted: false; readonly reason: "BLOCK_IS_FINAL_DETERMINISTIC" };

/** BLOCK can never be overridden — not by models, preferences or humans. */
export function requestSecurityOverride(decision: SecurityPolicyDecision): SecurityOverrideOutcome {
  if (decision.action === "BLOCK" && decision.final) {
    return { granted: false, reason: "BLOCK_IS_FINAL_DETERMINISTIC" };
  }
  return { granted: true, note: "non-block decisions may be appealed through review" };
}

/** Defensive indicator kinds a signature may carry. */
export type ThreatIndicatorKind =
  | "behavioral-pattern"
  | "account-id"
  | "content-fingerprint"
  | "device-fingerprint"
  | "network-indicator"
  | "provenance-marker";

export interface ThreatIndicator {
  readonly indicatorKind: ThreatIndicatorKind;
  readonly value: string;
}

export type MitigationKind = "verification-step" | "policy-rule" | "monitoring-rule" | "detection-heuristic";

export interface ThreatMitigation {
  readonly mitigationKind: MitigationKind;
  readonly guidance: string;
}

/**
 * Defensive-only threat signature: indicators and mitigations, never
 * weaponized exploit payloads (invariants 25/49).
 */
export interface ThreatSignature {
  readonly signatureId: string;
  readonly threatClass: SecurityThreatClass;
  readonly indicators: readonly ThreatIndicator[];
  readonly mitigations: readonly ThreatMitigation[];
  readonly publishedAt: string;
}

const SIGNATURE_FIELDS = new Set(["signatureId", "threatClass", "indicators", "mitigations", "publishedAt"]);
const INDICATOR_KINDS = new Set(["behavioral-pattern", "account-id", "content-fingerprint", "device-fingerprint", "network-indicator", "provenance-marker"]);
const MITIGATION_KINDS = new Set(["verification-step", "policy-rule", "monitoring-rule", "detection-heuristic"]);
const WEAPONIZED_FIELD = /exploit|payload|weapon|attack|poc\b|injection[-_]?sample|malicious|attack[-_]?script|steps[-_]?to[-_]?reproduce|repro\b/i;
const WEAPONIZED_CONTENT = /<script[\s>]|javascript:|eval\(|\bexec\(|child_process|powershell\s+-|rm\s+-rf|nc\s+-e|bash\s+-i|base64\s+-d/i;

export type ThreatSignatureRejectionReason =
  | "INVALID_STRUCTURE"
  | "WEAPONIZED_FIELD_NAME"
  | "UNKNOWN_FIELD"
  | "WEAPONIZED_CONTENT"
  | "MISSING_MITIGATION";

export type ThreatSignatureValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: ThreatSignatureRejectionReason; readonly detail: string };

/**
 * Defensive-only validation: rejects weaponized field names, undeclared
 * fields, executable content inside indicator values and signatures without
 * mitigations.
 */
export function validateThreatSignature(candidate: unknown): ThreatSignatureValidation {
  if (typeof candidate !== "object" || candidate === null) {
    return { valid: false, reason: "INVALID_STRUCTURE", detail: "signature must be an object" };
  }
  const record = candidate as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (WEAPONIZED_FIELD.test(key)) {
      return { valid: false, reason: "WEAPONIZED_FIELD_NAME", detail: `field "${key}" is weaponization-shaped` };
    }
    if (!SIGNATURE_FIELDS.has(key)) {
      return { valid: false, reason: "UNKNOWN_FIELD", detail: `undeclared field "${key}"` };
    }
  }
  if (typeof record.signatureId !== "string" || typeof record.publishedAt !== "string" || typeof record.threatClass !== "string" || !THREAT_CLASSES.has(record.threatClass)) {
    return { valid: false, reason: "INVALID_STRUCTURE", detail: "signatureId/publishedAt/threatClass invalid" };
  }
  if (!Array.isArray(record.indicators)) {
    return { valid: false, reason: "INVALID_STRUCTURE", detail: "indicators must be an array" };
  }
  for (const indicator of record.indicators) {
    if (typeof indicator !== "object" || indicator === null) {
      return { valid: false, reason: "INVALID_STRUCTURE", detail: "indicator must be an object" };
    }
    const entry = indicator as Record<string, unknown>;
    if (typeof entry.indicatorKind !== "string" || !INDICATOR_KINDS.has(entry.indicatorKind)) {
      return { valid: false, reason: "INVALID_STRUCTURE", detail: "unknown indicator kind" };
    }
    if (typeof entry.value !== "string" || entry.value.length === 0) {
      return { valid: false, reason: "INVALID_STRUCTURE", detail: "indicator value must be a non-empty string" };
    }
    if (WEAPONIZED_CONTENT.test(entry.value)) {
      return { valid: false, reason: "WEAPONIZED_CONTENT", detail: "indicator value carries executable payload content" };
    }
  }
  if (!Array.isArray(record.mitigations) || record.mitigations.length === 0) {
    return { valid: false, reason: "MISSING_MITIGATION", detail: "a defensive signature must carry mitigations" };
  }
  for (const mitigation of record.mitigations) {
    if (typeof mitigation !== "object" || mitigation === null) {
      return { valid: false, reason: "INVALID_STRUCTURE", detail: "mitigation must be an object" };
    }
    const entry = mitigation as Record<string, unknown>;
    if (typeof entry.mitigationKind !== "string" || !MITIGATION_KINDS.has(entry.mitigationKind) || typeof entry.guidance !== "string") {
      return { valid: false, reason: "INVALID_STRUCTURE", detail: "mitigation kind/guidance invalid" };
    }
  }
  return { valid: true };
}

/** Controlled defensive broadcast — validated defensive-only before issue. */
export interface DefensiveSecurityBroadcast {
  readonly broadcastId: string;
  readonly signature: ThreatSignature;
  readonly audienceRefs: readonly PrincipalRef[];
  readonly issuedAt: string;
}

/** Issue a broadcast only after defensive-only validation passes. */
export function issueDefensiveBroadcast(input: {
  readonly broadcastId: string;
  readonly signature: unknown;
  readonly audienceRefs: readonly PrincipalRef[];
  readonly issuedAt: string;
}): DefensiveSecurityBroadcast {
  const validation = validateThreatSignature(input.signature);
  if (!validation.valid) {
    throw new Error(`defensive-only violation (${validation.reason}): ${validation.detail}`);
  }
  return {
    broadcastId: input.broadcastId,
    signature: input.signature as ThreatSignature,
    audienceRefs: input.audienceRefs,
    issuedAt: input.issuedAt,
  };
}

/** Learning record feeding future classifiers through Lab promotion. */
export interface SecurityLearningRecord {
  readonly learningId: string;
  readonly decisionRef: string;
  readonly observedOutcome: "CONFIRMED_THREAT" | "FALSE_POSITIVE" | "INCONCLUSIVE";
  readonly incorporatedAt: string;
}
