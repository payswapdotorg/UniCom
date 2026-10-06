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

export type ReviewActivity = Extract<
  JournaledEvidenceRecord["payload"],
  { readonly evidenceKind: "REVIEW_ACTIVITY" }
>;
export type BuyerClaim = Extract<
  JournaledEvidenceRecord["payload"],
  { readonly evidenceKind: "BUYER_CLAIM" }
>;
export type Attestation = Extract<
  JournaledEvidenceRecord["payload"],
  { readonly evidenceKind: "MERCHANT_SHIPMENT_ATTESTATION" }
>;
export type CarrierObservation = Extract<
  JournaledEvidenceRecord["payload"],
  { readonly evidenceKind: "CARRIER_PACKAGE_OBSERVATION" }
>;

export function payloadOf<T extends JournaledEvidenceRecord["payload"]["evidenceKind"]>(
  records: readonly JournaledEvidenceRecord[],
  evidenceKind: T,
): readonly {
  readonly record: JournaledEvidenceRecord;
  readonly payload: Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: T }>;
}[] {
  return records
    .filter(
      (record) =>
        (record.payload as { readonly evidenceKind?: string }).evidenceKind === evidenceKind,
    )
    .map((record) => ({
      record,
      payload: record.payload as Extract<
        JournaledEvidenceRecord["payload"],
        { readonly evidenceKind: T }
      >,
    }));
}

export function indicator(
  kind: SecurityIndicator["indicatorKind"],
  value: string,
  confidenceBps: number,
): SecurityIndicator {
  return { indicatorKind: kind, value, confidenceBps };
}

export function classified(
  signals: readonly SecuritySignal[],
  at: string,
): readonly ThreatClassification[] {
  return signals.map((signal) => classifySecuritySignal(signal, at));
}

export function result(
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
    detected: classifications.some(
      (classification) => classification.threatClass !== "UNCLASSIFIED",
    ),
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
export function detectReviewRing(
  records: readonly JournaledEvidenceRecord[],
  at: string,
): ArchetypeDetectionResult {
  const activity = payloadOf(records, "REVIEW_ACTIVITY").map((entry) => ({
    author: entry.record.subjectRef,
    payload: entry.payload as ReviewActivity,
  }));
  if (activity.length < RING_MIN_AUTHORS) {
    return result(
      "FAKE_REVIEW_RING",
      "REFUTED",
      [],
      at,
      `insufficient review activity for correlation (${activity.length} < ${RING_MIN_AUTHORS})`,
    );
  }

  const byDevice = new Map<string, PrincipalRef[]>();
  const byContent = new Map<
    string,
    { readonly authors: PrincipalRef[]; readonly times: readonly string[] }
  >();
  for (const entry of activity) {
    const device = byDevice.get(entry.payload.deviceFingerprint) ?? [];
    if (!device.some((author) => author.principalId === entry.author.principalId))
      device.push(entry.author);
    byDevice.set(entry.payload.deviceFingerprint, device);
    const content = byContent.get(entry.payload.contentFingerprint) ?? { authors: [], times: [] };
    if (!content.authors.some((author) => author.principalId === entry.author.principalId)) {
      content.authors.push(entry.author);
    }
    byContent.set(entry.payload.contentFingerprint, {
      authors: content.authors,
      times: [...content.times, entry.payload.reviewedAt],
    });
  }

  const deviceCluster = [...byDevice.entries()]
    .filter(([, authors]) => authors.length >= RING_MIN_AUTHORS)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))[0];
  const contentCluster = [...byContent.entries()]
    .filter(([, group]) => group.authors.length >= RING_MIN_AUTHORS)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))[0];

  const clusterAuthors = deviceCluster?.[1] ?? contentCluster?.[1].authors;
  if (clusterAuthors === undefined) {
    return result(
      "FAKE_REVIEW_RING",
      "REFUTED",
      [],
      at,
      "no coordination cluster: distinct devices, distinct content, uncorrelated timing",
    );
  }

  const authors = clusterAuthors;
  const subjectRefs = [...authors].sort((a, b) => (a.principalId < b.principalId ? -1 : 1));
  const times = activity
    .filter((entry) => authors.some((author) => author.principalId === entry.author.principalId))
    .map((entry) => entry.payload.reviewedAt)
    .sort();
  const spanMs =
    times.length > 1 ? Date.parse(times[times.length - 1] ?? "") - Date.parse(times[0] ?? "") : 0;
  const burst = times.length >= RING_MIN_AUTHORS && spanMs <= RING_BURST_WINDOW_MS;
  const allYoung = activity
    .filter((entry) => authors.some((author) => author.principalId === entry.author.principalId))
    .every((entry) => entry.payload.accountAgeDays <= RING_YOUNG_ACCOUNT_DAYS);
  const indicators: SecurityIndicator[] = [
    indicator("coordinated-account-graph", `cluster:${authors.length}`, 9_000),
  ];
  if (deviceCluster !== undefined)
    indicators.push(indicator("shared-device-fingerprint", deviceCluster[0], 9_200));
  if (contentCluster !== undefined)
    indicators.push(indicator("duplicate-content-fingerprint", contentCluster[0], 9_400));
  if (burst)
    indicators.push(
      indicator(
        "burst-timing-pattern",
        `window:${Math.max(1, Math.round(spanMs / 3_600_000))}h`,
        8_600,
      ),
    );
  if (allYoung)
    indicators.push(indicator("account-age-pattern", `max-age:${RING_YOUNG_ACCOUNT_DAYS}d`, 8_400));

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
      indicators: [
        indicator("account-age-pattern", `max-age:${RING_YOUNG_ACCOUNT_DAYS}d`, 8_400),
        indicator("coordinated-account-graph", `cluster:${authors.length}`, 9_000),
      ],
      correlationPolicyRef: SECURITY_CORRELATION_POLICY_REF,
    });
  }
  return result(
    "FAKE_REVIEW_RING",
    "SUPPORTED",
    signals,
    at,
    `coordination cluster of ${authors.length} authors (device:${deviceCluster !== undefined}, content:${contentCluster !== undefined}, burst:${burst})`,
  );
}
