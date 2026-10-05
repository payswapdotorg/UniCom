import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  journalKnownLimitations,
  runArchetypeSuite,
  type ArchetypeFlow,
} from "../src/index.js";
import {
  AT,
  claimEvidenceJournal,
  FALSE_CLAIM_FULFILLED_UNKNOWN,
  NON_DELIVERY_UNKNOWN,
  PLATFORM,
  RETURN_ABUSE_BASE,
  RETURN_CONTRADICTION_NO_FREQUENCY,
  RETURN_EVASION_CONSISTENT,
  reviewRingJournal,
  RING_BASE,
  RING_EVASION_STAGGERED,
  RING_EVASION_UNTRACEABLE,
  WRONG_ITEM_BASE,
  WRONG_ITEM_UNKNOWN,
} from "./w2-004-support.js";

/**
 * Acceptance scenario 6 — Evasion resistance: for each archetype, an evasion
 * variant (ring members mixing honest activity, staggered timing, partial
 * truths) is still caught OR the failure is explicitly journaled as a known
 * limitation — SILENT EVASION IS A BUG (the suite runner enforces it).
 */

const NON_DELIVERY_CONFIRMED = {
  claimType: "NON_DELIVERY" as const,
  declaredSku: "sku:declared",
  observedSku: "sku:declared",
  deliveryStatus: "DELIVERED" as const,
  proofLevel: "P2" as const,
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};

const RING_DETECTED_FLOWS: readonly ArchetypeFlow[] = [
  {
    archetype: "FAKE_REVIEW_RING",
    variant: "BASE",
    label: "coordinated-ring",
    evidence: reviewRingJournal(RING_BASE).records(),
  },
  {
    archetype: "FAKE_REVIEW_RING",
    variant: "EVASION",
    label: "staggered-varied-content",
    evidence: reviewRingJournal(RING_EVASION_STAGGERED).records(),
  },
  {
    archetype: "FAKE_REVIEW_RING",
    variant: "EVASION",
    label: "untraceable-coordination",
    evidence: reviewRingJournal(RING_EVASION_UNTRACEABLE).records(),
    knownLimitationIfEvaded: {
      why: "coordination with no shared device, content, timing or account-age trace is indistinguishable from honest reviews at this evidence level — flagging it would require false positives on honest reviewers",
    },
  },
  {
    archetype: "WRONG_ITEM_SHIPMENT",
    variant: "BASE",
    label: "observed-substitution",
    evidence: claimEvidenceJournal(WRONG_ITEM_BASE).records(),
  },
  {
    archetype: "WRONG_ITEM_SHIPMENT",
    variant: "EVASION",
    label: "no-carrier-observation",
    evidence: claimEvidenceJournal(WRONG_ITEM_UNKNOWN).records(),
    knownLimitationIfEvaded: {
      why: "without an independent carrier observation, substitution is indistinguishable from honest disagreement — the tri-state stays UNKNOWN rather than guessing",
    },
  },
  {
    archetype: "FALSE_BUYER_CLAIM",
    variant: "BASE",
    label: "contradicted-claim",
    evidence: claimEvidenceJournal(RETURN_ABUSE_BASE).records(),
  },
  {
    archetype: "FALSE_BUYER_CLAIM",
    variant: "EVASION",
    label: "partial-truth-quality-claim",
    evidence: claimEvidenceJournal(FALSE_CLAIM_FULFILLED_UNKNOWN).records(),
    knownLimitationIfEvaded: {
      why: "a claim whose subject matches the journaled purchase (or whose fulfillment facts are UNKNOWN) cannot contradict the facts — quality complaints are unverifiable at this evidence level",
    },
  },
  {
    archetype: "FALSE_NON_DELIVERY",
    variant: "BASE",
    label: "confirmed-delivery",
    evidence: claimEvidenceJournal(NON_DELIVERY_CONFIRMED).records(),
  },
  {
    archetype: "FALSE_NON_DELIVERY",
    variant: "EVASION",
    label: "untracked-shipment",
    evidence: claimEvidenceJournal(NON_DELIVERY_UNKNOWN).records(),
    knownLimitationIfEvaded: {
      why: "without a carrier delivery confirmation, a non-delivery claim is unverifiable — flagging it would flag every honest untracked-shipment claim",
    },
  },
  {
    archetype: "RETURN_REFUND_ABUSE",
    variant: "BASE",
    label: "frequency-plus-contradiction",
    evidence: claimEvidenceJournal(RETURN_ABUSE_BASE).records(),
  },
  {
    archetype: "RETURN_REFUND_ABUSE",
    variant: "EVASION",
    label: "sub-threshold-contradicting-claims",
    evidence: claimEvidenceJournal(RETURN_CONTRADICTION_NO_FREQUENCY).records(),
  },
  {
    archetype: "RETURN_REFUND_ABUSE",
    variant: "EVASION",
    label: "consistent-claims-below-threshold",
    evidence: claimEvidenceJournal(RETURN_EVASION_CONSISTENT).records(),
    knownLimitationIfEvaded: {
      why: "abuse with individually-consistent claims and sub-threshold frequency is undetectable by construction — catching it would require flagging honest buyers",
    },
  },
];

describe("scenario 6 — every archetype's evasion is caught or journaled", () => {
  it("the full adversarial suite runs with zero violations", () => {
    const suite = runArchetypeSuite({ flows: RING_DETECTED_FLOWS, at: AT });
    expect(suite.violations).toEqual([]);

    const byArchetype = new Map<string, { caught: number; journaled: number }>();
    for (const outcome of suite.outcomes) {
      const tally = byArchetype.get(outcome.archetype) ?? { caught: 0, journaled: 0 };
      if (outcome.variant === "BASE") expect(outcome.caught).toBe(true);
      if (outcome.caught) tally.caught += 1;
      if (outcome.knownLimitation !== undefined) tally.journaled += 1;
      byArchetype.set(outcome.archetype, tally);
    }
    // Every archetype has at least one caught flow AND (for evasions that
    // escape) an explicitly journaled limitation.
    for (const archetype of byArchetype.keys()) {
      expect(byArchetype.get(archetype)?.caught ?? 0).toBeGreaterThan(0);
    }
    expect(suite.knownLimitations.length).toBeGreaterThan(0);
  });

  it("the staggered/varied-content ring evasion is still caught (defense does not rely on attacker cooperation)", () => {
    const suite = runArchetypeSuite({
      flows: RING_DETECTED_FLOWS.filter((flow) => flow.label === "staggered-varied-content"),
      at: AT,
    });
    expect(suite.violations).toEqual([]);
    const outcome = suite.outcomes[0];
    expect(outcome?.caught).toBe(true);
    // Caught under a concrete threat class (the Sybil account pattern).
    const sybil = outcome?.detection.find((result) =>
      result.classifications.some(
        (classification) => classification.threatClass === "SYNTHETIC_IDENTITY_SYBIL",
      ),
    );
    expect(sybil).toBeDefined();
  });

  it("the untraceable-coordination evasion is NOT caught and IS journaled as a known limitation", () => {
    const suite = runArchetypeSuite({
      flows: RING_DETECTED_FLOWS.filter((flow) => flow.label === "untraceable-coordination"),
      at: AT,
    });
    expect(suite.violations).toEqual([]);
    const outcome = suite.outcomes[0];
    expect(outcome?.caught).toBe(false);
    expect(outcome?.knownLimitation?.archetype).toBe("FAKE_REVIEW_RING");
    expect(outcome?.knownLimitation?.why).toContain("indistinguishable");
  });

  it("sub-threshold return abuse with CONTRADICTING claims is still caught (by the contradiction detector)", () => {
    const suite = runArchetypeSuite({
      flows: RING_DETECTED_FLOWS.filter(
        (flow) => flow.label === "sub-threshold-contradicting-claims",
      ),
      at: AT,
    });
    expect(suite.violations).toEqual([]);
    expect(suite.outcomes[0]?.caught).toBe(true);
  });

  it("consistent-claims-below-threshold evasion is journaled, not silently missed", () => {
    const suite = runArchetypeSuite({
      flows: RING_DETECTED_FLOWS.filter(
        (flow) => flow.label === "consistent-claims-below-threshold",
      ),
      at: AT,
    });
    expect(suite.violations).toEqual([]);
    expect(suite.outcomes[0]?.caught).toBe(false);
    expect(suite.outcomes[0]?.knownLimitation?.evasionVariant).toBe(
      "consistent-claims-below-threshold",
    );
  });
});

describe("scenario 6 — the silent-evasion discipline is enforced (a bug by construction)", () => {
  it("an undeclared uncaught evasion produces a SILENT_EVASION violation", () => {
    const flows: readonly ArchetypeFlow[] = [
      {
        archetype: "FAKE_REVIEW_RING",
        variant: "BASE",
        label: "base",
        evidence: reviewRingJournal(RING_BASE).records(),
      },
      {
        archetype: "FAKE_REVIEW_RING",
        variant: "EVASION",
        label: "undeclared-untraceable",
        evidence: reviewRingJournal(RING_EVASION_UNTRACEABLE).records(),
        // NO knownLimitationIfEvaded — a silent evasion.
      },
    ];
    const suite = runArchetypeSuite({ flows, at: AT });
    expect(suite.violations).toHaveLength(1);
    expect(suite.violations[0]?.kind).toBe("SILENT_EVASION");
    if (suite.violations[0]?.kind === "SILENT_EVASION") {
      expect(suite.violations[0]?.rationale).toContain("silent evasion is a bug");
    }
    expect(suite.knownLimitations).toHaveLength(0);
  });

  it("a BASE attack that evades is a BASE_EVASION failure — limitation declarations are not accepted for base flows", () => {
    const flows: readonly ArchetypeFlow[] = [
      {
        archetype: "FALSE_BUYER_CLAIM",
        variant: "BASE",
        label: "weak-base",
        // UNKNOWN fulfillment — the base attack "evades" detection.
        evidence: claimEvidenceJournal(FALSE_CLAIM_FULFILLED_UNKNOWN).records(),
        knownLimitationIfEvaded: { why: "should not be accepted for a BASE flow" },
      },
    ];
    const suite = runArchetypeSuite({ flows, at: AT });
    expect(suite.violations).toHaveLength(1);
    expect(suite.violations[0]?.kind).toBe("BASE_EVASION");
    expect(suite.knownLimitations).toHaveLength(0);
  });
});

describe("scenario 6 — known limitations become journaled evidence", () => {
  it("journalKnownLimitations appends typed security-analysis evidence records", () => {
    const suite = runArchetypeSuite({ flows: RING_DETECTED_FLOWS, at: AT });
    const journal = new EvidenceJournal();
    const journaled = journalKnownLimitations({
      journal,
      limitations: suite.knownLimitations,
      subjectRef: PLATFORM,
    });
    expect(journaled).toHaveLength(suite.knownLimitations.length);
    for (const record of journaled) {
      expect(record.kind).toBe("security-analysis");
      expect((record.payload as { evidenceKind: string }).evidenceKind).toBe("KNOWN_LIMITATION");
    }
    expect(journal.verifyChain().ok).toBe(true);
  });
});
