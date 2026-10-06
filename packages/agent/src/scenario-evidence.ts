/**
 * Scenario evidence journaling (W2-005 Learning Lab).
 *
 * The bridge from a Reality-Lab trajectory to hash-chained evidence: for
 * every scripted order the run journals
 * - the review activity (when the order posts a review),
 * - the buyer claim (when the order files one),
 * - the merchant shipment attestation,
 * - the carrier package observation (UNKNOWN tri-states preserved),
 * - commerce-fact snapshots read THROUGH THE OPAQUE SEAM (the environment's
 *   CommerceEvidenceFactsPort — the only commerce access this lane has).
 *
 * Every evidence id is prefixed with the evaluation ref: multiple evaluation
 * runs may share ONE append-only journal without id collisions, and every
 * run's records verify within the single hash chain.
 */

import type { PrincipalRef } from "./common.js";
import type { EvidenceJournal, JournaledEvidenceRecord } from "./evidence-journal.js";
import type { RealityScenarioSpec, RealityTrajectory } from "./reality-lab.js";
import { simActorPrincipalRef } from "./reality-lab.js";

/** The observer principal under whose authority the run journals evidence. */
export const REALITY_LAB_OBSERVER: PrincipalRef = {
  principalId: "platform:unicom:reality-lab",
  kind: "platform",
};

export interface ScenarioEvidence {
  /** Journaled evidence per order ref (deterministic, script order). */
  readonly recordsByOrder: ReadonlyMap<string, readonly JournaledEvidenceRecord[]>;
  /** Every record journaled for the scenario, in append order. */
  readonly records: readonly JournaledEvidenceRecord[];
}

/**
 * Journal one scenario's evidence into the run's journal. Commerce facts are
 * read through the opaque seam (the trajectory's environment port) and
 * journaled as snapshots — the sanctioned path; the tri-state law holds
 * (UNKNOWN facts stay UNKNOWN).
 */
export function journalScenarioEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly evaluationRef: string;
  readonly spec: RealityScenarioSpec;
  readonly trajectory: RealityTrajectory;
}): ScenarioEvidence {
  const { journal, evaluationRef, spec, trajectory } = input;
  const environment = trajectory.environment;
  const recordsByOrder = new Map<string, JournaledEvidenceRecord[]>();
  const all: JournaledEvidenceRecord[] = [];

  const append = (record: JournaledEvidenceRecord, orderRef: string): void => {
    all.push(record);
    const bucket = recordsByOrder.get(orderRef) ?? [];
    bucket.push(record);
    recordsByOrder.set(orderRef, bucket);
  };

  for (const order of spec.orders) {
    const prefix = `evidence:${evaluationRef}:${order.orderRef}`;
    const customerRef = simActorPrincipalRef("customer", spec.scenarioId, order.customerIndex);
    const merchantRef = simActorPrincipalRef("merchant", spec.scenarioId, order.merchantIndex);

    if (order.postsReview !== undefined) {
      append(
        journal.append({
          evidenceId: `${prefix}:review`,
          kind: "observation",
          subjectRef: customerRef,
          payload: {
            evidenceKind: "REVIEW_ACTIVITY",
            productRef: order.purchasedSkuRef,
            contentFingerprint: order.postsReview.contentFingerprint,
            deviceFingerprint: order.postsReview.deviceFingerprint,
            reviewedAt: order.postsReview.reviewedAt,
            accountAgeDays: order.postsReview.accountAgeDays,
            verifiedPurchase: order.postsReview.verifiedPurchase,
          },
          recordedAt: order.evidenceAt,
        }),
        order.orderRef,
      );
    }

    if (order.filesClaim !== undefined) {
      const claim = order.filesClaim;
      append(
        journal.append({
          evidenceId: `${prefix}:claim`,
          kind: "claim-statement",
          subjectRef: customerRef,
          payload: {
            evidenceKind: "BUYER_CLAIM",
            claimType: claim.claimType,
            orderRef: order.orderRef,
            ...(claim.claimedSubject !== undefined ? { claimedSubject: claim.claimedSubject } : {}),
            claimedAt: order.evidenceAt,
          },
          recordedAt: order.evidenceAt,
        }),
        order.orderRef,
      );
    }

    append(
      journal.append({
        evidenceId: `${prefix}:attestation`,
        kind: "merchant-attestation",
        subjectRef: merchantRef,
        payload: {
          evidenceKind: "MERCHANT_SHIPMENT_ATTESTATION",
          orderRef: order.orderRef,
          declaredSkuRef: order.declaredSkuRef,
          attestedAt: order.evidenceAt,
        },
        recordedAt: order.evidenceAt,
      }),
      order.orderRef,
    );

    append(
      journal.append({
        evidenceId: `${prefix}:carrier`,
        kind: "carrier-observation",
        subjectRef: REALITY_LAB_OBSERVER,
        payload: {
          evidenceKind: "CARRIER_PACKAGE_OBSERVATION",
          orderRef: order.orderRef,
          ...(order.observedSkuRef !== undefined
            ? { observedSkuRef: order.observedSkuRef }
            : {}),
          deliveryStatus: order.deliveryStatus,
          proofLevel: order.carrierProofLevel,
          observedAt: order.evidenceAt,
        },
        recordedAt: order.evidenceAt,
      }),
      order.orderRef,
    );

    // Commerce facts: opaque seam reads → journaled snapshots.
    const subject = environment.orderSubject(order.orderRef);
    if (subject !== undefined) {
      append(
        journal.append({
          evidenceId: `${prefix}:fact:subject`,
          kind: "commerce-fact",
          subjectRef: REALITY_LAB_OBSERVER,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: subject.factId,
            snapshot: subject as unknown as Record<string, unknown>,
          },
          recordedAt: order.evidenceAt,
        }),
        order.orderRef,
      );
    }
    const delivery = environment.deliveryConfirmation(order.orderRef);
    if (delivery !== undefined) {
      append(
        journal.append({
          evidenceId: `${prefix}:fact:delivery`,
          kind: "commerce-fact",
          subjectRef: REALITY_LAB_OBSERVER,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: delivery.factId,
            snapshot: delivery as unknown as Record<string, unknown>,
          },
          recordedAt: order.evidenceAt,
        }),
        order.orderRef,
      );
    }
    const content = environment.shipmentContent(order.orderRef);
    if (content !== undefined) {
      append(
        journal.append({
          evidenceId: `${prefix}:fact:content`,
          kind: "commerce-fact",
          subjectRef: REALITY_LAB_OBSERVER,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: content.factId,
            snapshot: content as unknown as Record<string, unknown>,
          },
          recordedAt: order.evidenceAt,
        }),
        order.orderRef,
      );
    }
    if (order.returnHistory !== undefined) {
      const history = environment.returnHistory(customerRef.principalId);
      if (history !== undefined) {
        append(
          journal.append({
            evidenceId: `${prefix}:fact:history`,
            kind: "commerce-fact",
            subjectRef: REALITY_LAB_OBSERVER,
            payload: {
              evidenceKind: "COMMERCE_FACT_SNAPSHOT",
              factId: history.factId,
              snapshot: history as unknown as Record<string, unknown>,
            },
            recordedAt: order.evidenceAt,
          }),
          order.orderRef,
        );
      }
    }
  }

  return { recordsByOrder, records: all };
}
