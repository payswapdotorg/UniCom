/**
 * Claim-correlation fraud archetypes (W2-004 scenarios 4, 5; invariant 48).
 *
 * The four claim-evidence detectors: wrong-item shipment, false
 * non-delivery, false buyer claim and return/refund abuse. Each correlates
 * buyer claims against merchant attestations, carrier observations and
 * commerce-fact snapshots journaled through the opaque seam — preserving the
 * evidence tri-state (UNKNOWN never flags) and asserting precision (honest
 * claims are never flagged).
 */

import type {
  ArchetypeDetectionResult,
  Attestation,
  BuyerClaim,
  CarrierObservation,
  EvidenceTriState,
} from "./fraud-archetypes.js";
import { indicator, payloadOf, result } from "./fraud-archetypes.js";
import { journaledOrderSubjects, journaledReturnHistories } from "./commerce-facts-seam.js";
import type { JournaledEvidenceRecord } from "./evidence-journal.js";
import type { SecuritySignal } from "./security.js";

/** Completed-return count at which frequency anomaly begins. */
export const ABUSE_RETURN_COUNT_THRESHOLD = 5;
/** Minimum carrier proof level that may contradict a buyer claim. */
export const CONTRADICTION_PROOF_MIN_RANK = 1;

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
export function detectWrongItemShipment(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM").filter(
    (entry) => (entry.payload as BuyerClaim).claimType === "WRONG_ITEM",
  );
  if (claims.length === 0) {
    return result("WRONG_ITEM_SHIPMENT", "REFUTED", [], at, "no wrong-item claims to evaluate");
  }
  const attestations = new Map(
    payloadOf(records, "MERCHANT_SHIPMENT_ATTESTATION").map((entry) => [
      (entry.payload as Attestation).orderRef,
      entry.payload as Attestation,
    ]),
  );
  const observations = new Map(
    payloadOf(records, "CARRIER_PACKAGE_OBSERVATION").map((entry) => [
      (entry.payload as CarrierObservation).orderRef,
      entry.payload as CarrierObservation,
    ]),
  );

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
export function detectFalseNonDelivery(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM").filter(
    (entry) => (entry.payload as BuyerClaim).claimType === "NON_DELIVERY",
  );
  if (claims.length === 0) {
    return result("FALSE_NON_DELIVERY", "REFUTED", [], at, "no non-delivery claims to evaluate");
  }
  const observations = new Map(
    payloadOf(records, "CARRIER_PACKAGE_OBSERVATION").map((entry) => [
      (entry.payload as CarrierObservation).orderRef,
      entry.payload as CarrierObservation,
    ]),
  );

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
            indicator(
              "delivery-confirmation-conflict",
              `${orderRef}:DELIVERED:${observation.proofLevel}`,
              9_000,
            ),
          ],
        });
      } else {
        unknown = true;
      }
    } else {
      refuted = true;
    }
  }
  const evidenceState: EvidenceTriState = supported
    ? "SUPPORTED"
    : unknown
      ? "UNKNOWN"
      : refuted
        ? "REFUTED"
        : "UNKNOWN";
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
export function detectFalseBuyerClaim(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): ArchetypeDetectionResult {
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
          indicator(
            "delivery-confirmation-conflict",
            `${orderRef}:fulfilled:${subject.fulfilledSkuRef.value}`,
            8_800,
          ),
        ],
      });
    } else {
      // Claim subject matches the journaled purchase — consistent, honest
      // quality disagreement; NOT flagged.
      continue;
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
export function detectReturnRefundAbuse(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): ArchetypeDetectionResult {
  const claims = payloadOf(records, "BUYER_CLAIM");
  if (claims.length === 0) {
    return result("RETURN_REFUND_ABUSE", "REFUTED", [], at, "no claims to evaluate");
  }
  const subjects = new Map(journaledOrderSubjects(records).map((fact) => [fact.orderRef, fact]));
  const histories = journaledReturnHistories(records);
  if (histories.length === 0) {
    return result(
      "RETURN_REFUND_ABUSE",
      "UNKNOWN",
      [],
      at,
      "no journaled return history — frequency unassessable (UNKNOWN)",
    );
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
    if (
      history === undefined ||
      subject === undefined ||
      claimedSubject === undefined ||
      !subject.fulfilledSkuRef.known
    ) {
      unknown = true;
      continue;
    }
    const frequencyAnomaly = history.completedReturnCount >= ABUSE_RETURN_COUNT_THRESHOLD;
    const contradicts =
      subject.fulfilledSkuRef.value === subject.purchasedSkuRef &&
      claimedSubject !== subject.purchasedSkuRef;
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
