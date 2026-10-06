import { describe, expect, it } from "vitest";
import {
  immuneLabCandidates,
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  SecurityImmuneSystem,
  UNICOM_IMMUNE_LOGIC,
  verifyImmuneActionChain,
  type CapabilityDefinition,
  type ImmuneActionRecord,
  type SecuritySignal,
} from "../src/index.js";
import { AT2, PLATFORM, promoteLogic, RING_BASE, reviewRingJournal } from "./w2-004-support.js";

/**
 * Acceptance scenario 3 — Review ring: a coordinated fake-review ring
 * (colluding principals, timing correlation, duplicate content) is DETECTED
 * and QUARANTINED; the quarantine is REVERSIBLE and the principals' ledgers
 * remain append-only.
 */

const REVIEW_CAPABILITY: CapabilityDefinition = {
  capabilityDefinitionId: "capability:review.post",
  name: "Review Posting",
  supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
  transportNeutral: true,
};
const COMMERCE_CAPABILITY: CapabilityDefinition = {
  capabilityDefinitionId: "capability:commerce.command",
  name: "Commerce Command Seam",
  supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
  transportNeutral: true,
};
const CANONICAL_VOCABULARY: readonly CapabilityDefinition[] = [
  COMMERCE_CAPABILITY,
  REVIEW_CAPABILITY,
];

function immuneFixture(input?: { promote?: boolean }) {
  const log = new LabPromotionLog();
  for (const candidate of immuneLabCandidates(AT2)) {
    log.registerCandidate(candidate);
  }
  const registry = new LabGatedRuntimeRegistry(log);
  const system = new SecurityImmuneSystem({
    policy: { policyVersion: "immune-test-v1", blockThresholdBps: 8_500 },
    runtimeRegistry: registry,
    capabilityVocabulary: CANONICAL_VOCABULARY,
    capabilityHolders: () => [{ principalId: "merchant:1", kind: "merchant" }],
    now: () => AT2,
  });
  if (input?.promote !== false) {
    for (const logicId of Object.values(UNICOM_IMMUNE_LOGIC)) {
      const record = promoteLogic(log, logicId, PLATFORM);
      const activation = registry.activate(record.promotionId);
      expect(activation.ok).toBe(true);
    }
  }
  return { log, registry, system };
}

function ringSignal(): SecuritySignal {
  return {
    signalId: "signal:review-ring:device:shared:1",
    domain: "REVIEW",
    detectedAt: AT2,
    subjectRefs: [
      { principalId: "user:ring:1", kind: "user" },
      { principalId: "user:ring:2", kind: "user" },
      { principalId: "user:ring:3", kind: "user" },
    ],
    indicators: [
      {
        indicatorKind: "duplicate-content-fingerprint",
        value: "content:ring:canonical",
        confidenceBps: 9_400,
      },
      {
        indicatorKind: "shared-device-fingerprint",
        value: "device:shared:1",
        confidenceBps: 9_200,
      },
      { indicatorKind: "burst-timing-pattern", value: "window:6h", confidenceBps: 8_600 },
    ],
    correlationPolicyRef: "policy://security/correlation-v1",
  };
}

function ringCitations() {
  const journal = reviewRingJournal(RING_BASE);
  return journal
    .records()
    .map((record) => journal.citationFor(record.evidenceId))
    .slice(0, 5);
}

describe("scenario 3 — lab gating: un-promoted immune logic is unreachable", () => {
  it("every immune operation returns IMMUNE_LOGIC_NOT_PROMOTED before promotion", () => {
    const { system } = immuneFixture({ promote: false });
    expect(system.ingestSignal(ringSignal(), AT2).refusal?.code).toBe("IMMUNE_LOGIC_NOT_PROMOTED");
    expect(system.detectArchetypes(reviewRingJournal(RING_BASE).records(), AT2).refusal?.code).toBe(
      "IMMUNE_LOGIC_NOT_PROMOTED",
    );
    expect(
      system.quarantine({
        actionId: "action:q:1",
        principalRef: { principalId: "user:ring:1", kind: "user" },
        scope: {
          kind: "CAPABILITY_SET" as const,
          capabilityDefinitionIds: ["capability:review.post"],
        },
        decisionRef: "decision:x",
        evidenceCitations: [],
        actedAt: AT2,
      }).refusal?.code,
    ).toBe("IMMUNE_LOGIC_NOT_PROMOTED");
    expect(
      system.broadcast({
        broadcastId: "broadcast:1",
        scope: {
          threatClass: "REVIEW_RING",
          affectedPrincipalRefs: [],
          capabilityDefinitionId: "capability:review.post",
        },
      }).refusal?.code,
    ).toBe("IMMUNE_LOGIC_NOT_PROMOTED");
  });

  it("immune candidates register into the shared promotion log (born in the Lab)", () => {
    const log = new LabPromotionLog();
    for (const candidate of immuneLabCandidates(AT2)) {
      log.registerCandidate(candidate);
    }
    const kinds = log.listCandidates().map((candidate) => candidate.kind);
    expect(kinds).toContain("DETECTION");
    expect(kinds).toContain("ATTENUATION");
    expect(kinds).toContain("BROADCAST");
    for (const candidate of immuneLabCandidates(AT2)) {
      expect(log.findCandidate(candidate.logicId)?.logicId).toBe(candidate.logicId);
    }
  });

  it("respondToThreat is refused when ANY of its three logic gates is un-promoted", () => {
    const log = new LabPromotionLog();
    for (const candidate of immuneLabCandidates(AT2)) log.registerCandidate(candidate);
    const registry = new LabGatedRuntimeRegistry(log);
    const system = new SecurityImmuneSystem({
      policy: { policyVersion: "immune-test-v1", blockThresholdBps: 8_500 },
      runtimeRegistry: registry,
      capabilityVocabulary: CANONICAL_VOCABULARY,
      now: () => AT2,
    });
    // Promote classification ONLY — quarantine/broadcast stay in the Lab.
    const record = promoteLogic(log, UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION, PLATFORM);
    registry.activate(record.promotionId);
    const response = system.respondToThreat({
      signal: ringSignal(),
      at: AT2,
      actionIdPrefix: "action:partial",
      broadcastId: "broadcast:partial",
      quarantinePrincipalRefs: [{ principalId: "user:ring:1", kind: "user" }],
      quarantineCapabilityIds: ["capability:review.post"],
      broadcastCapabilityDefinitionId: "capability:review.post",
      evidenceCitations: [],
    });
    expect(response.refusal?.code).toBe("IMMUNE_LOGIC_NOT_PROMOTED");
    expect(response.refusal?.logicId).toBe(UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION);
  });
});

describe("scenario 3 — review-ring detection and reversible quarantine", () => {
  it("detects the ring, decides, quarantines every affected principal and broadcasts defensively", () => {
    const { system } = immuneFixture();
    const response = system.respondToThreat({
      signal: ringSignal(),
      at: AT2,
      actionIdPrefix: "action:ring",
      broadcastId: "broadcast:ring:1",
      quarantinePrincipalRefs: [
        { principalId: "user:ring:1", kind: "user" },
        { principalId: "user:ring:2", kind: "user" },
      ],
      quarantineCapabilityIds: ["capability:review.post"],
      broadcastCapabilityDefinitionId: "capability:review.post",
      evidenceCitations: ringCitations(),
    });

    expect(response.refusal).toBeUndefined();
    expect(response.decision?.action).toBe("BLOCK");
    expect(response.decision?.final).toBe(true);
    expect(response.quarantines).toHaveLength(2);
    for (const quarantine of response.quarantines ?? []) {
      expect(quarantine.ok).toBe(true);
    }
    expect(response.broadcast).toBeDefined();

    // Both principals are attenuated — exactly the scoped capability.
    expect(system.isAttenuated("user:ring:1", "capability:review.post")).toBe(true);
    expect(system.isAttenuated("user:ring:2", "capability:review.post")).toBe(true);
    // Scoped: the commerce capability is NOT attenuated.
    expect(system.isAttenuated("user:ring:1", "capability:commerce.command")).toBe(false);
    // Unaffected principals are untouched.
    expect(system.isAttenuated("user:honest:1", "capability:review.post")).toBe(false);
  });

  it("release reverses the quarantine while the ledger history stays append-only", () => {
    const { system } = immuneFixture();
    const ringPrincipal = { principalId: "user:ring:1", kind: "user" } as const;
    const response = system.respondToThreat({
      signal: ringSignal(),
      at: AT2,
      actionIdPrefix: "action:ring",
      broadcastId: "broadcast:ring:2",
      quarantinePrincipalRefs: [ringPrincipal],
      quarantineCapabilityIds: ["capability:review.post"],
      broadcastCapabilityDefinitionId: "capability:review.post",
      evidenceCitations: ringCitations(),
    });
    const decisionId = response.decision?.decisionId ?? "decision:unknown";

    expect(system.isAttenuated(ringPrincipal.principalId, "capability:review.post")).toBe(true);
    const historyAfterQuarantine = system.quarantineLedger.historyFor(ringPrincipal.principalId);
    expect(historyAfterQuarantine).toHaveLength(1);
    expect(historyAfterQuarantine[0]?.action).toBe("QUARANTINE");

    // The release: a REVERSING record, never a deletion.
    const release = system.release({
      actionId: "action:ring:release:1",
      principalRef: ringPrincipal,
      scope: {
        kind: "CAPABILITY_SET" as const,
        capabilityDefinitionIds: ["capability:review.post"],
      },
      decisionRef: decisionId,
      evidenceCitations: ringCitations(),
      actedAt: AT2,
    });
    expect(release.outcome?.ok).toBe(true);

    // Capability restored (reversible).
    expect(system.isAttenuated(ringPrincipal.principalId, "capability:review.post")).toBe(false);

    // The ledger history still contains BOTH records — append-only law.
    const historyAfterRelease = system.quarantineLedger.historyFor(ringPrincipal.principalId);
    expect(historyAfterRelease).toHaveLength(2);
    expect(historyAfterRelease[0]?.action).toBe("QUARANTINE");
    expect(historyAfterRelease[1]?.action).toBe("RELEASE");
    expect(system.quarantineLedger.verifyChain().ok).toBe(true);

    // Re-quarantine is possible after a release (a new append).
    const requarantine = system.quarantine({
      actionId: "action:ring:re:1",
      principalRef: ringPrincipal,
      scope: {
        kind: "CAPABILITY_SET" as const,
        capabilityDefinitionIds: ["capability:review.post"],
      },
      decisionRef: decisionId,
      evidenceCitations: ringCitations(),
      actedAt: AT2,
    });
    expect(requarantine.outcome?.ok).toBe(true);
    expect(system.quarantineLedger.historyFor(ringPrincipal.principalId)).toHaveLength(3);
  });

  it("quarantine validates against the ONE canonical vocabulary", () => {
    const { system } = immuneFixture();
    const outcome = system.quarantine({
      actionId: "action:vocab:1",
      principalRef: { principalId: "user:ring:1", kind: "user" },
      scope: {
        kind: "CAPABILITY_SET" as const,
        capabilityDefinitionIds: ["capability:not.in.vocabulary"],
      },
      decisionRef: "decision:x",
      evidenceCitations: [],
      actedAt: AT2,
    });
    const vocabularyOutcome = outcome.outcome;
    expect(vocabularyOutcome?.ok).toBe(false);
    if (vocabularyOutcome !== undefined && !vocabularyOutcome.ok) {
      expect(vocabularyOutcome.violation).toBe("CAPABILITY_NOT_IN_CANONICAL_VOCABULARY");
    }
  });

  it("duplicate quarantine and groundless release are typed violations", () => {
    const { system } = immuneFixture();
    const principal = { principalId: "user:ring:3", kind: "user" } as const;
    const scope = {
      kind: "CAPABILITY_SET" as const,
      capabilityDefinitionIds: ["capability:review.post"],
    };
    const first = system.quarantine({
      actionId: "action:dq:1",
      principalRef: principal,
      scope,
      decisionRef: "d:1",
      evidenceCitations: [],
      actedAt: AT2,
    });
    expect(first.outcome?.ok).toBe(true);
    const duplicate = system.quarantine({
      actionId: "action:dq:2",
      principalRef: principal,
      scope,
      decisionRef: "d:1",
      evidenceCitations: [],
      actedAt: AT2,
    });
    const duplicateOutcome = duplicate.outcome;
    expect(duplicateOutcome?.ok).toBe(false);
    if (duplicateOutcome !== undefined && !duplicateOutcome.ok)
      expect(duplicateOutcome.violation).toBe("ALREADY_ATTENUATED");

    const releaseOutcome = system.release({
      actionId: "action:dq:3",
      principalRef: principal,
      scope: {
        kind: "CAPABILITY_SET" as const,
        capabilityDefinitionIds: ["capability:review.post"],
      },
      decisionRef: "d:1",
      evidenceCitations: [],
      actedAt: AT2,
    });
    expect(releaseOutcome.outcome?.ok).toBe(true);
    const groundless = system.release({
      actionId: "action:dq:4",
      principalRef: principal,
      scope: {
        kind: "CAPABILITY_SET" as const,
        capabilityDefinitionIds: ["capability:review.post"],
      },
      decisionRef: "d:1",
      evidenceCitations: [],
      actedAt: AT2,
    });
    const groundlessOutcome = groundless.outcome;
    expect(groundlessOutcome?.ok).toBe(false);
    if (groundlessOutcome !== undefined && !groundlessOutcome.ok)
      expect(groundlessOutcome.violation).toBe("NOT_ATTENUATED");
  });

  it("immune action ledger tampering is detected deterministically by the chain law", () => {
    const { system } = immuneFixture();
    system.respondToThreat({
      signal: ringSignal(),
      at: AT2,
      actionIdPrefix: "action:ring",
      broadcastId: "broadcast:ring:3",
      quarantinePrincipalRefs: [
        { principalId: "user:ring:1", kind: "user" },
        { principalId: "user:ring:2", kind: "user" },
      ],
      quarantineCapabilityIds: ["capability:review.post"],
      broadcastCapabilityDefinitionId: "capability:review.post",
      evidenceCitations: ringCitations(),
    });
    const records = system.quarantineLedger.records();
    expect(records).toHaveLength(2);
    expect(verifyImmuneActionChain(records).ok).toBe(true);

    // Tamper with the recorded history (out-of-system mutation): the raw
    // chain law catches it — deterministically on repeat.
    const tampered = records.map((record, index) =>
      index === 0
        ? ({ ...record, actedAt: "2030-01-01T00:00:00.000Z" } as ImmuneActionRecord)
        : record,
    );
    const first = verifyImmuneActionChain(tampered);
    const second = verifyImmuneActionChain(tampered);
    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.violation).toBe("CHAIN_BROKEN");

    // Removing a record from the middle breaks the chain (sequence gap).
    const spliced = records.toSpliced(0, 1);
    expect(verifyImmuneActionChain(spliced).ok).toBe(false);
  });
});
