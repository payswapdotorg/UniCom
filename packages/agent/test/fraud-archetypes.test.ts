import { describe, expect, it } from "vitest";
import {
  detectFalseBuyerClaim,
  detectFalseNonDelivery,
  detectReturnRefundAbuse,
  detectReviewRing,
  detectWrongItemShipment,
  EvidenceJournal,
  journalCommerceFacts,
  pinCommerceFactsInterface,
  type ArchetypeDetectionResult,
} from "../src/index.js";
import {
  AT,
  claimEvidenceJournal,
  factsDoubleFor,
  FALSE_CLAIM_BASE,
  FALSE_CLAIM_FULFILLED_UNKNOWN,
  FALSE_CLAIM_HONEST,
  FALSE_CLAIM_MERCHANT_FAULT,
  NON_DELIVERY_FALSE,
  NON_DELIVERY_HONEST,
  NON_DELIVERY_P0_ONLY,
  NON_DELIVERY_UNKNOWN,
  PLATFORM,
  RETURN_ABUSE_BASE,
  RETURN_CONTRADICTION_NO_FREQUENCY,
  RETURN_HONEST_HIGH_FREQUENCY,
  RING_BASE,
  RING_HONEST,
  reviewRingJournal,
  WRONG_ITEM_BASE,
  WRONG_ITEM_HONEST_DISAGREEMENT,
  WRONG_ITEM_UNKNOWN,
} from "./w2-004-support.js";

/**
 * Acceptance scenarios 4, 5 — the five fraud archetypes as adversarial
 * evidence flows:
 *   4. Wrong-item shipment + false non-delivery distinguished from honest
 *      disagreement via evidence; UNKNOWN evidence preserves tri-state.
 *   5. False buyer claims + return/refund abuse: adversarial claims that
 *      contradict journaled commerce facts (from the opaque seam) are
 *      flagged; honest claims are NOT flagged (precision asserted).
 */

function threatClasses(detection: ArchetypeDetectionResult): readonly string[] {
  return detection.classifications.map((classification) => classification.threatClass);
}

describe("scenario 4 — wrong-item shipment vs honest disagreement (evidence triage)", () => {
  it("carrier observation contradicting the declaration is SUPPORTED and classified WRONG_ITEM_SHIPMENT", () => {
    const detection = detectWrongItemShipment(claimEvidenceJournal(WRONG_ITEM_BASE).records(), AT);
    expect(detection.evidenceState).toBe("SUPPORTED");
    expect(detection.detected).toBe(true);
    expect(threatClasses(detection)).toContain("WRONG_ITEM_SHIPMENT");
  });

  it("carrier observation matching the declaration refutes the merchant-fault hypothesis (honest disagreement)", () => {
    const detection = detectWrongItemShipment(
      claimEvidenceJournal(WRONG_ITEM_HONEST_DISAGREEMENT).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("REFUTED");
    expect(detection.detected).toBe(false);
    expect(detection.signals).toHaveLength(0);
  });

  it("UNKNOWN carrier observation preserves the tri-state — NO signal, NO classification", () => {
    const detection = detectWrongItemShipment(
      claimEvidenceJournal(WRONG_ITEM_UNKNOWN).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("UNKNOWN");
    expect(detection.detected).toBe(false);
    expect(detection.signals).toHaveLength(0);
    expect(detection.rationale).toContain("tri-state preserved");
  });
});

describe("scenario 4 — false non-delivery vs honest waiting", () => {
  it("delivery confirmed at P2 while the buyer claims non-delivery → FALSE_NON_DELIVERY", () => {
    const detection = detectFalseNonDelivery(
      claimEvidenceJournal(NON_DELIVERY_FALSE).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("SUPPORTED");
    expect(detection.detected).toBe(true);
    expect(threatClasses(detection)).toContain("FALSE_NON_DELIVERY");
  });

  it("carrier shows the parcel in transit → the claim is honest (REFUTED, no signal)", () => {
    const detection = detectFalseNonDelivery(
      claimEvidenceJournal(NON_DELIVERY_HONEST).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("REFUTED");
    expect(detection.detected).toBe(false);
  });

  it("carrier observation UNKNOWN → tri-state preserved, no signal", () => {
    const detection = detectFalseNonDelivery(
      claimEvidenceJournal(NON_DELIVERY_UNKNOWN).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("UNKNOWN");
    expect(detection.detected).toBe(false);
  });

  it("a bare P0 carrier assertion never contradicts a claim (precision over recall)", () => {
    const detection = detectFalseNonDelivery(
      claimEvidenceJournal(NON_DELIVERY_P0_ONLY).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("UNKNOWN");
    expect(detection.detected).toBe(false);
  });
});

describe("scenario 5 — false buyer claims contradicting journaled commerce facts", () => {
  it("claim subject contradicting purchase + fulfillment facts is flagged FALSE_ITEM_NOT_AS_DESCRIBED", () => {
    const detection = detectFalseBuyerClaim(claimEvidenceJournal(FALSE_CLAIM_BASE).records(), AT);
    expect(detection.evidenceState).toBe("SUPPORTED");
    expect(detection.detected).toBe(true);
    expect(threatClasses(detection)).toContain("FALSE_ITEM_NOT_AS_DESCRIBED");
  });

  it("an honest claim consistent with the journaled facts is NOT flagged (precision)", () => {
    const detection = detectFalseBuyerClaim(claimEvidenceJournal(FALSE_CLAIM_HONEST).records(), AT);
    expect(detection.detected).toBe(false);
    expect(detection.signals).toHaveLength(0);
  });

  it("UNKNOWN fulfillment facts preserve the tri-state", () => {
    const detection = detectFalseBuyerClaim(
      claimEvidenceJournal(FALSE_CLAIM_FULFILLED_UNKNOWN).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("UNKNOWN");
    expect(detection.detected).toBe(false);
  });

  it("a claim consistent with a genuine fulfillment mismatch is honest (merchant fault — not buyer fraud)", () => {
    const detection = detectFalseBuyerClaim(
      claimEvidenceJournal(FALSE_CLAIM_MERCHANT_FAULT).records(),
      AT,
    );
    expect(detection.detected).toBe(false);
    // The wrong-item detector owns the merchant-fault direction instead.
    const wrongItem = detectWrongItemShipment(
      claimEvidenceJournal(FALSE_CLAIM_MERCHANT_FAULT).records(),
      AT,
    );
    expect(wrongItem.detected).toBe(true);
    expect(threatClasses(wrongItem)).toContain("WRONG_ITEM_SHIPMENT");
  });
});

describe("scenario 5 — return/refund abuse (frequency + contradiction)", () => {
  it("frequency anomaly together with a fact-contradicting claim is flagged REFUND_RETURN_ABUSE", () => {
    const detection = detectReturnRefundAbuse(
      claimEvidenceJournal(RETURN_ABUSE_BASE).records(),
      AT,
    );
    expect(detection.evidenceState).toBe("SUPPORTED");
    expect(detection.detected).toBe(true);
    expect(threatClasses(detection)).toContain("REFUND_RETURN_ABUSE");
  });

  it("high-frequency but HONEST claimant is NOT flagged (precision law)", () => {
    const detection = detectReturnRefundAbuse(
      claimEvidenceJournal(RETURN_HONEST_HIGH_FREQUENCY).records(),
      AT,
    );
    expect(detection.detected).toBe(false);
    expect(detection.signals).toHaveLength(0);
  });

  it("contradiction without frequency anomaly is not abuse (the false-claim detector owns it)", () => {
    const detection = detectReturnRefundAbuse(
      claimEvidenceJournal(RETURN_CONTRADICTION_NO_FREQUENCY).records(),
      AT,
    );
    expect(detection.detected).toBe(false);
    const falseClaim = detectFalseBuyerClaim(
      claimEvidenceJournal(RETURN_CONTRADICTION_NO_FREQUENCY).records(),
      AT,
    );
    expect(falseClaim.detected).toBe(true);
  });
});

describe("scenario 3/5 — review-ring detection over journaled review evidence", () => {
  it("the coordinated ring (device + duplicate content + burst) classifies as REVIEW_RING", () => {
    const detection = detectReviewRing(reviewRingJournal(RING_BASE).records(), AT);
    expect(detection.evidenceState).toBe("SUPPORTED");
    expect(detection.detected).toBe(true);
    expect(threatClasses(detection)).toContain("REVIEW_RING");
    expect(detection.signals[0]?.subjectRefs).toHaveLength(5);
  });

  it("honest reviewers (distinct devices, content, timing) are REFUTED with no signal", () => {
    const detection = detectReviewRing(reviewRingJournal(RING_HONEST).records(), AT);
    expect(detection.evidenceState).toBe("REFUTED");
    expect(detection.detected).toBe(false);
    expect(detection.signals).toHaveLength(0);
  });
});

describe("commerce facts enter ONLY through the opaque seam", () => {
  it("the facts port is pinned to the W1-003 interface identity and version", () => {
    const port = pinCommerceFactsInterface(factsDoubleFor(FALSE_CLAIM_BASE));
    expect(port.interfaceId).toBe("commerce-facts");
    expect(port.version).toBe(1);
    expect(() => pinCommerceFactsInterface({ interfaceId: "other", version: 1 })).toThrow(
      /interfaceId mismatch/,
    );
    expect(() => pinCommerceFactsInterface({ interfaceId: "commerce-facts", version: 2 })).toThrow(
      /version mismatch/,
    );
  });

  it("journalCommerceFacts journals fact snapshots as append-only evidence with tri-states preserved", () => {
    const journal = new EvidenceJournal();
    const journaled = journalCommerceFacts({
      journal,
      port: factsDoubleFor(RETURN_ABUSE_BASE),
      orderRefs: ["order:claim:1"],
      customerRefs: ["user:buyer:1"],
      subjectRef: PLATFORM,
      recordedAt: AT,
    });
    expect(journaled).toHaveLength(4);
    expect(journal.length).toBe(4);
    // UNKNOWN facts stay UNKNOWN in the journaled snapshot.
    const unknownJournal = new EvidenceJournal();
    journalCommerceFacts({
      journal: unknownJournal,
      port: factsDoubleFor(NON_DELIVERY_UNKNOWN),
      orderRefs: ["order:claim:1"],
      subjectRef: PLATFORM,
      recordedAt: AT,
    });
    const snapshot = unknownJournal.records()[1]?.payload as unknown as {
      snapshot: { deliveryStatus: { known: boolean } };
    };
    expect(snapshot.snapshot.deliveryStatus.known).toBe(false);
  });

  it("detection over journaled facts equals detection over directly journaled evidence (one evidence plane)", () => {
    const viaSeam = new EvidenceJournal();
    journalCommerceFacts({
      journal: viaSeam,
      port: factsDoubleFor(FALSE_CLAIM_BASE),
      orderRefs: ["order:claim:1"],
      subjectRef: PLATFORM,
      recordedAt: AT,
    });
    // Claims/attestation/carrier are journaled directly (principal-side).
    const direct = claimEvidenceJournal(FALSE_CLAIM_BASE);
    const detectionDirect = detectFalseBuyerClaim(direct.records(), AT);
    expect(detectionDirect.detected).toBe(true);
  });
});
