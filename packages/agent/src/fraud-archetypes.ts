/**
 * The five fraud archetypes as adversarial evidence flows the immune system
 * must catch (W2-004 scenarios 4, 5, 6; FROZEN-ARCHITECTURE §3.H;
 * invariant 48).
 *
 * Archetypes: fake review/review ring, wrong-item shipment, false buyer
 * claim, false non-delivery, return/refund abuse. Every detector:
 * - reads ONLY journaled evidence (claims, attestations, carrier
 *   observations, commerce-fact snapshots from the opaque seam) — no live
 *   commerce access, no ambient state, no hidden clocks;
 * - preserves the evidence tri-state: UNKNOWN carrier observations or
 *   UNKNOWN fact fields yield UNKNOWN evidence states and NO signal —
 *   honest disagreement is never flagged (precision asserted, not just
 *   recall);
 * - emits SecuritySignals and classifies them with the Stage-0 deterministic
 *   classifier — the detectors never invent threat classes;
 * - is deterministic: identical evidence produces identical signals,
 *   classifications and tri-states on replay.
 *
 * Correlation across principals happens only over journaled review evidence
 * under the declared security correlation policy (invariant 48).
 */

import type { PrincipalRef } from "./common.js";
import type { JournaledEvidenceRecord } from "./evidence-journal.js";
import {
  journaledOrderSubjects,
  journaledReturnHistories,
} from "./commerce-facts-seam.js";
import {
  classifySecuritySignal,
  type SecurityIndicator,
  type SecuritySignal,
  type ThreatClassification,
} from "./security.js";

export type FraudArchetype =
  | "FAKE_REVIEW_RING"
  | "WRONG_ITEM_SHIPMENT"
  | "FALSE_BUYER_CLAIM"
  | "FALSE_NON_DELIVERY"
  | "RETURN_REFUND_ABUSE";

export type EvidenceTriState = "SUPPORTED" | "REFUTED" | "UNKNOWN";

export interface ArchetypeDetectionResult {
  readonly archetype: FraudArchetype;
  /** Tri-state assessment of the archetype's core hypothesis. */
  readonly evidenceState: EvidenceTriState;
  readonly signals: readonly SecuritySignal[];
  readonly classifications: readonly ThreatClassification[];
  /** True iff at least one signal classified as a concrete threat class. */
  readonly detected: boolean;
  readonly rationale: string;
}

/** Declared correlation policy for cross-principal review evidence. */
export const SECURITY_CORRELATION_POLICY_REF = "policy://security/correlation-v1";

/** Ring thresholds (deterministic constants — evidence-level, not tunable). */
export const RING_MIN_AUTHORS = 3;
export const RING_BURST_WINDOW_MS = 72 * 3_600_000;
export const RING_YOUNG_ACCOUNT_DAYS = 30;
export const ABUSE_RETURN_COUNT_THRESHOLD = 5;
/** Minimum carrier proof level that may contradict a buyer claim. */
export const CONTRADICTION_PROOF_MIN_RANK = 1;

type ReviewActivity = Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: "REVIEW_ACTIVITY" }>;
type BuyerClaim = Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: "BUYER_CLAIM" }>;
type Attestation = Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: "MERCHANT_SHIPMENT_ATTESTATION" }>;
type CarrierObservation = Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: "CARRIER_PACKAGE_OBSERVATION" }>;

function payloadOf<T extends JournaledEvidenceRecord["payload"]["evidenceKind"]>(
  records: readonly JournaledEvidenceRecord[],
  evidenceKind: T,
): readonly { readonly record: JournaledEvidenceRecord; readonly payload: Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: T }> }[] {
  return records
    .filter((record) => (record.payload as { readonly evidenceKind?: string }).evidenceKind === evidenceKind)
    .map((record) => ({ record, payload: record.payload as Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: T }> }));
}

function indicator(kind: SecurityIndicator["indicatorKind"], value: string, confidenceBps: number): SecurityIndicator {
  return { indicatorKind: kind, value, confidenceBps };
}

function classified(signals: readonly SecuritySignal[], at: string): readonly ThreatClassification[] {
  return signals.map((signal) => classifySecuritySignal(signal, at));
}

function result(
  archetype: FraudArchetype,
  evidenceState: EvidenceTriState,
  signals: readonly SecuritySignal[],
  at: string,
  rationale: string,
): ArchetypeDetectionResult {
  const classifications = classified(signals, at);
  return {
    archetype,
    evidenceState,
    signals,
    classifications,
    detected: classifications.some((classification) => classification.threatClass !== "UNCLASSIFIED"),
    rationale,
  };
}

// ---------------------------------------------------------------------------
// 1. Fake review / review ring
// ---------------------------------------------------------------------------

/**
 * Detect a coordinated fake-review ring over journaled review activity:
 * colluding principals (≥ RING_MIN_AUTHORS distinct authors), timing
 * correlation (burst window), duplicate content fingerprints, shared device
 * fingerprints, account-age pattern. Honest reviews — distinct devices,
 * distinct content, uncorrelated timing — produce REFUTED with no signal.
 */
export function detectReviewRing(records: readonly JournaledEvidenceRecord[], at: string): ArchetypeDetectionResult {
  const activity = payloadOf(records, "REVIEW_ACTIVITY").map((entry) => ({
    author: entry.record.subjectRef,
    payload: entry.payload as ReviewActivity,
  }));
  if (activity.length < RING_MIN_AUTHORS) {
    return result("FAKE_REVIEW_RING", "REFUTED", [], at, `insufficient review activity for correlation (${activity.length} < ${RING_MIN_AUTHORS})`);
  }

  const byDevice = new Map<string, PrincipalRef[]>();
  const byContent = new Map<string, { readonly authors: PrincipalRef[]; readonly times: readonly string[] }>();
  for (const entry of activity) {
    const device = byDevice.get(entry.payload.deviceFingerprint) ?? [];
    if (!device.some((author) => author.principalId === entry.author.principalId)) device.push(entry.author);
    byDevice.set(entry.payload.deviceFingerprint, device);
    const content = byContent.get(entry.payload.contentFingerprint) ?? { authors: [], times: [] };
    if (!content.authors.some((author) => author.principalId === entry.author.principalId)) {
      content.authors.push(entry.author);
    }
    byContent.set(entry.payload.contentFingerprint, { authors: content.authors, times: [...content.times, entry.payload.reviewedAt] });
  }

  const deviceCluster = [...byDevice.entries()]
    .filter(([, authors]) => authors.length >= RING_MIN_AUTHORS)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))[0];
  const contentCluster = [...byContent.entries()]
    .filter(([, group]) => group.authors.length >= RING_MIN_AUTHORS)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))[0];

  const clusterAuthors = deviceCluster?.[1] ?? contentCluster?.[1].authors;
  if (clusterAuthors === undefined) {
    return result("FAKE_REVIEW_RING", "REFUTED", [], at, "no coordination cluster: distinct devices, distinct content, uncorrelated timing");
  }

  const authors = clusterAuthors;
  const subjectRefs = [...authors].sort((a, b) => (a.principalId < b.principalId ? -1 : 1));
  const times = activity.filter((entry) => authors.some((author) => author.principalId === entry.author.principalId)).map((entry) => entry.payload.reviewedAt).sort();
  const spanMs = times.length > 1 ? Date.parse(times[times.length - 1] ?? "") - Date.parse(times[0] ?? "") : 0;
  const burst = times.length >= RING_MIN_AUTHORS && spanMs <= RING_BURST_WINDOW_MS;
  const allYoung = activity
    .filter((entry) => authors.some((author) => author.principalId === entry.author.principalId))
    .every((entry) => entry.payload.accountAgeDays <= RING_YOUNG_ACCOUNT_DAYS);
  const indicators: SecurityIndicator[] = [
    indicator("coordinated-account-graph", `cluster:${authors.length}`, 9_000),
  ];
  if (deviceCluster !== undefined) indicators.push(indicator("shared-device-fingerprint", deviceCluster[0], 9_200));
  if (contentCluster !== undefined) indicators.push(indicator("duplicate-content-fingerprint", contentCluster[0], 9_400));
  if (burst) indicators.push(indicator("burst-timing-pattern", `window:${Math.max(1, Math.round(spanMs / 3_600_000))}h`, 8_600));
  if (allYoung) indicators.push(indicator("account-age-pattern", `max-age:${RING_YOUNG_ACCOUNT_DAYS}d`, 8_400));

  const ringSignal: SecuritySignal = {
    signalId: `signal:review-ring:${deviceCluster?.[0] ?? contentCluster?.[0] ?? "cluster"}`,
    domain: "REVIEW",
    detectedAt: at,
    subjectRefs,
    indicators,
    correlationPolicyRef: SECURITY_CORRELATION_POLICY_REF,
  };
  const signals: SecuritySignal[] = [ringSignal];
  if (allYoung) {
    // Coordination without duplicate content still surfaces as a Sybil-class
    // account-pattern signal — the ring is caught under a concrete class.
    signals.push({
      signalId: `signal:review-ring-accounts:${deviceCluster?.[0] ?? contentCluster?.[0] ?? "cluster"}`,
      domain: "ACCOUNT",
      detectedAt: at,
      subjectRefs,
      indicators: [indicator("account-age-pattern", `max-age:${RING_YOUNG_ACCOUNT_DAYS}d`, 8_400), indicator("coordinated-account-graph", `cluster:${authors.length}`, 9_000)],
      correlationPolicyRef: SECURITY_CORRELATION_POLICY_REF,
    });
  }
  return result("FAKE_REVIEW_RING", "SUPPORTED", signals, at, `coordination cluster of ${authors.length} authors (device:${deviceCluster !== undefined}, content:${contentCluster !== undefined}, burst:${burst})`);
}

// ---------------------------------------------------------------------------
// 2. Wrong-item shipment (carrier observation vs declaration vs claim)
// ---------------------------------------------------------------------------

/**
 * Distinguish wrong-item shipment from honest disagreement via evidence:
 * carrier observation vs merchant attestation vs buyer claim.
 * - observed ≠ declared → SUPPORTED (wrong item shipped — merchant-side);
 * - observed == declared → REFUTED as merchant fault (claim contradicted);
 * - observed UNKNOWN → UNKNOWN — tri-state preserved, NO signal.
 */
export function detectWrongItemShipment(records: readonly JournaledEvidenceRecord[], at: string): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM").filter((entry) => (entry.payload as BuyerClaim).claimType === "WRONG_ITEM");
  if (claims.length === 0) {
    return result("WRONG_ITEM_SHIPMENT", "REFUTED", [], at, "no wrong-item claims to evaluate");
  }
  const attestations = new Map(payloadOf(records, "MERCHANT_SHIPMENT_ATTESTATION").map((entry) => [(entry.payload as Attestation).orderRef, entry.payload as Attestation]));
  const observations = new Map(payloadOf(records, "CARRIER_PACKAGE_OBSERVATION").map((entry) => [(entry.payload as CarrierObservation).orderRef, entry.payload as CarrierObservation]));

  const signals: SecuritySignal[] = [];
  let supported = false;
  let unknown = false;
  for (const claim of claims) {
    const orderRef = (claim.payload as BuyerClaim).orderRef;
    const attestation = attestations.get(orderRef);
    const observation = observations.get(orderRef);
    if (attestation === undefined || observation === undefined) {
      unknown = true;
      continue;
    }
    const declared = attestation.declaredSkuRef;
    const observed = observation.observedSkuRef;
    if (observed === undefined) {
      unknown = true;
      continue;
    }
    if (observed !== declared) {
      supported = true;
      signals.push({
        signalId: `signal:wrong-item:${orderRef}`,
        domain: "SHIPMENT",
        detectedAt: at,
        subjectRefs: [claim.record.subjectRef],
        indicators: [
          indicator("sku-mismatch", `declared:${declared}:observed:${observed}`, 9_300),
          indicator("declared-vs-observed-conflict", orderRef, 9_100),
        ],
      });
    }
  }
  const evidenceState: EvidenceTriState = supported ? "SUPPORTED" : unknown ? "UNKNOWN" : "REFUTED";
  const rationale = supported
    ? "carrier observation contradicts the declared shipment content"
    : unknown
      ? "carrier observation UNKNOWN for at least one claim — tri-state preserved, no signal"
      : "every observed shipment matches its declaration — claim contradicted by independent observation";
  return result("WRONG_ITEM_SHIPMENT", evidenceState, signals, at, rationale);
}

// ---------------------------------------------------------------------------
// 3. False non-delivery (buyer claim vs carrier confirmation)
// ---------------------------------------------------------------------------

/**
 * Detect false non-delivery claims: a buyer claims non-delivery while the
 * carrier's independent observation confirms delivery at proof level ≥ P1
 * (a bare P0 assertion never contradicts a claim — precision over recall).
 * Carrier UNKNOWN → UNKNOWN tri-state, no signal.
 */
export function detectFalseNonDelivery(records: readonly JournaledEvidenceRecord[], at: string): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM").filter((entry) => (entry.payload as BuyerClaim).claimType === "NON_DELIVERY");
  if (claims.length === 0) {
    return result("FALSE_NON_DELIVERY", "REFUTED", [], at, "no non-delivery claims to evaluate");
  }
  const observations = new Map(payloadOf(records, "CARRIER_PACKAGE_OBSERVATION").map((entry) => [(entry.payload as CarrierObservation).orderRef, entry.payload as CarrierObservation]));

  const signals: SecuritySignal[] = [];
  let supported = false;
  let unknown = false;
  let refuted = false;
  const proofRank = (level: string): number => ["P0", "P1", "P2", "P3", "P4", "P5"].indexOf(level);
  for (const claim of claims) {
    const orderRef = (claim.payload as BuyerClaim).orderRef;
    const observation = observations.get(orderRef);
    if (observation === undefined || observation.deliveryStatus === "UNKNOWN") {
      unknown = true;
      continue;
    }
    if (observation.deliveryStatus === "DELIVERED") {
      if (proofRank(observation.proofLevel) >= CONTRADICTION_PROOF_MIN_RANK) {
        supported = true;
        signals.push({
          signalId: `signal:false-non-delivery:${orderRef}`,
          domain: "CLAIM",
          detectedAt: at,
          subjectRefs: [claim.record.subjectRef],
          indicators: [
            indicator("claim-subject-mismatch", `non-delivery:${orderRef}`, 9_200),
            indicator("delivery-confirmation-conflict", `${orderRef}:DELIVERED:${observation.proofLevel}`, 9_000),
          ],
        });
      } else {
        unknown = true;
      }
    } else {
      refuted = true;
    }
  }
  const evidenceState: EvidenceTriState = supported ? "SUPPORTED" : unknown ? "UNKNOWN" : refuted ? "REFUTED" : "UNKNOWN";
  const rationale = supported
    ? "carrier delivery confirmation contradicts the non-delivery claim"
    : unknown
      ? "carrier observation UNKNOWN or below contradiction proof level — tri-state preserved, no signal"
      : "carrier observation does not confirm delivery — honest claim";
  return result("FALSE_NON_DELIVERY", evidenceState, signals, at, rationale);
}

// ---------------------------------------------------------------------------
// 4. False buyer claim (claim vs journaled commerce facts)
// ---------------------------------------------------------------------------

/**
 * Detect false buyer claims (wrong item / not as described) that contradict
 * journaled commerce facts from the opaque seam: purchase subject and
 * fulfillment record agree, yet the claim asserts a different subject.
 * Claims CONSISTENT with facts are NOT flagged (precision asserted); UNKNOWN
 * fulfillment stays UNKNOWN.
 */
export function detectFalseBuyerClaim(records: readonly JournaledEvidenceRecord[], at: string): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM").filter((entry) => {
    const type = (entry.payload as BuyerClaim).claimType;
    return type === "WRONG_ITEM" || type === "NOT_AS_DESCRIBED";
  });
  if (claims.length === 0) {
    return result("FALSE_BUYER_CLAIM", "REFUTED", [], at, "no buyer claims to evaluate");
  }
  const subjects = new Map(journaledOrderSubjects(records).map((fact) => [fact.orderRef, fact]));

  const signals: SecuritySignal[] = [];
  let supported = false;
  let unknown = false;
  let refuted = false;
  for (const claim of claims) {
    const orderRef = (claim.payload as BuyerClaim).orderRef;
    const claimedSubject = (claim.payload as BuyerClaim).claimedSubject;
    const subject = subjects.get(orderRef);
    if (claimedSubject === undefined || subject === undefined) {
      unknown = true;
      continue;
    }
    if (!subject.fulfilledSkuRef.known) {
      unknown = true;
      continue;
    }
    if (subject.fulfilledSkuRef.value !== subject.purchasedSkuRef) {
      // The fulfillment itself shows a mismatch — the claim is honest.
      refuted = true;
      continue;
    }
    if (claimedSubject !== subject.purchasedSkuRef) {
      supported = true;
      signals.push({
        signalId: `signal:false-buyer-claim:${orderRef}`,
        domain: "CLAIM",
        detectedAt: at,
        subjectRefs: [claim.record.subjectRef],
        indicators: [
          indicator("claim-subject-mismatch", `subject:${orderRef}`, 9_100),
          indicator("delivery-confirmation-conflict", `${orderRef}:fulfilled:${subject.fulfilledSkuRef.value}`, 8_800),
        ],
      });
    } else {
      // Claim subject matches the journaled purchase — consistent, honest
      // quality disagreement; NOT flagged.
      refuted = true;
    }
  }
  const evidenceState: EvidenceTriState = supported ? "SUPPORTED" : unknown ? "UNKNOWN" : "REFUTED";
  const rationale = supported
    ? "claim subject contradicts journaled purchase and fulfillment facts"
    : unknown
      ? "claim subject or fulfillment facts UNKNOWN — tri-state preserved, no signal"
      : "claims consistent with journaled commerce facts — honest disagreement";
  return result("FALSE_BUYER_CLAIM", evidenceState, signals, at, rationale);
}

// ---------------------------------------------------------------------------
// 5. Return/refund abuse (frequency anomaly + fact contradiction)
// ---------------------------------------------------------------------------

/**
 * Detect return/refund abuse: return-frequency anomaly (≥ threshold
 * completed returns in the window) TOGETHER WITH a current claim that
 * contradicts journaled commerce facts. Frequency alone never flags an
 * honest claimant (precision); contradiction alone belongs to the
 * false-claim detector.
 */
export function detectReturnRefundAbuse(records: readonly JournaledEvidenceRecord[], at: string): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM");
  if (claims.length === 0) {
    return result("RETURN_REFUND_ABUSE", "REFUTED", [], at, "no claims to evaluate");
  }
  const subjects = new Map(journaledOrderSubjects(records).map((fact) => [fact.orderRef, fact]));
  const histories = journaledReturnHistories(records);
  if (histories.length === 0) {
    return result("RETURN_REFUND_ABUSE", "UNKNOWN", [], at, "no journaled return history — frequency unassessable (UNKNOWN)");
  }
  const historyByCustomer = new Map(histories.map((fact) => [fact.customerRef, fact]));

  const signals: SecuritySignal[] = [];
  let supported = false;
  let unknown = false;
  for (const claim of claims) {
    const orderRef = (claim.payload as BuyerClaim).orderRef;
    const claimedSubject = (claim.payload as BuyerClaim).claimedSubject;
    const subject = subjects.get(orderRef);
    const customerRef = subject?.customerRef ?? claim.record.subjectRef.principalId;
    const history = historyByCustomer.get(customerRef);
    if (history === undefined || subject === undefined || claimedSubject === undefined || !subject.fulfilledSkuRef.known) {
      unknown = true;
      continue;
    }
    const frequencyAnomaly = history.completedReturnCount >= ABUSE_RETURN_COUNT_THRESHOLD;
    const contradicts = subject.fulfilledSkuRef.value === subject.purchasedSkuRef && claimedSubject !== subject.purchasedSkuRef;
    if (frequencyAnomaly && contradicts) {
      supported = true;
      signals.push({
        signalId: `signal:return-abuse:${customerRef}:${orderRef}`,
        domain: "RETURN",
        detectedAt: at,
        subjectRefs: [claim.record.subjectRef],
        indicators: [
          indicator("return-frequency-anomaly", `returns:${history.completedReturnCount}`, 8_800),
          indicator("claim-subject-mismatch", `subject:${orderRef}`, 9_000),
        ],
      });
    } else if (frequencyAnomaly && !contradicts) {
      // High-frequency but honest claimant — NOT flagged (precision law).
      continue;
    }
  }
  const evidenceState: EvidenceTriState = supported ? "SUPPORTED" : unknown ? "UNKNOWN" : "REFUTED";
  const rationale = supported
    ? "return-frequency anomaly combined with a claim contradicting journaled facts"
    : unknown
      ? "return history or claim subject UNKNOWN — tri-state preserved, no signal"
      : "no combined frequency+contradiction pattern — honest return activity";
  return result("RETURN_REFUND_ABUSE", evidenceState, signals, at, rationale);
}

/** Run every archetype detector over a body of journaled evidence. */
export function detectAllArchetypes(records: readonly JournaledEvidenceRecord[], at: string): readonly ArchetypeDetectionResult[] {
  return [
    detectReviewRing(records, at),
    detectWrongItemShipment(records, at),
    detectFalseNonDelivery(records, at),
    detectFalseBuyerClaim(records, at),
    detectReturnRefundAbuse(records, at),
  ];
}
