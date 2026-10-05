import { describe, expect, expectTypeOf, it } from "vitest";
import type { AgentTrust, CapabilityTrust, TransactionProof, TrustRecord, UserTrust } from "../src/index.js";
import { trustRecordKind } from "../src/index.js";

/**
 * Acceptance scenario 9 — UserTrust and AgentTrust are represented
 * independently; they are never conflated and never substituted for
 * TransactionProof (invariants 21/22; AGENTS rule 14).
 */

const AT = "2026-11-05T00:00:00.000Z";

const userTrust: UserTrust = {
  trustRecordId: "trust-user-1",
  kind: "USER_TRUST",
  subjectRef: { principalId: "user-amara", kind: "user" },
  identityVerification: "STRONG",
  verifiedPurchaseCount: 63,
  disputeRateBps: 120,
  assessedAt: AT,
};

const agentTrust: AgentTrust = {
  trustRecordId: "trust-agent-1",
  kind: "AGENT_TRUST",
  subjectRef: { principalId: "agent-main-7", kind: "agent" },
  taskSuccessRate: 0.94,
  policyCompliance: "CLEAN",
  evaluationEvidenceRefs: [{ evidenceId: "eval-2026-q4", kind: "decision-summary" }],
  assessedAt: AT,
};

const capabilityTrust: CapabilityTrust = {
  trustRecordId: "trust-cap-1",
  kind: "CAPABILITY_TRUST",
  subjectCapabilityDefinitionId: "cap.orders.read",
  subjectProviderImplementationId: "impl.shopify.v1",
  observationReliabilityBps: 9910,
  executionSuccessRate: 0.98,
  assessedAt: AT,
};

describe("scenario 9 — trust planes stay distinct", () => {
  it("represents UserTrust, AgentTrust and CapabilityTrust as three distinct typed records", () => {
    expect(trustRecordKind(userTrust)).toBe("USER_TRUST");
    expect(trustRecordKind(agentTrust)).toBe("AGENT_TRUST");
    expect(trustRecordKind(capabilityTrust)).toBe("CAPABILITY_TRUST");
  });

  it("does not allow UserTrust and AgentTrust to stand in for each other", () => {
    expectTypeOf<UserTrust>().not.toMatchTypeOf<AgentTrust>();
    expectTypeOf<AgentTrust>().not.toMatchTypeOf<UserTrust>();
    expectTypeOf<UserTrust>().not.toMatchTypeOf<CapabilityTrust>();
    // The union discriminates on a mandatory literal kind.
    const record: TrustRecord = userTrust;
    expect(record.kind).toBe("USER_TRUST");
  });

  it("never substitutes trust for transaction proof", () => {
    expectTypeOf<TrustRecord>().not.toMatchTypeOf<TransactionProof>();
    expectTypeOf<TransactionProof>().not.toMatchTypeOf<TrustRecord>();
    // A trust record carries no proof level and no verified evidence —
    // there is no trust-based path to proof in the runtime surface either.
    expect("level" in userTrust).toBe(false);
    expect("level" in agentTrust).toBe(false);
    expect("evidence" in capabilityTrust).toBe(false);
  });

  it("models a TransactionProof with an explicit level and verified evidence", () => {
    const proof: TransactionProof = {
      proofId: "proof-1",
      level: "P2",
      evidence: [{ evidenceId: "ev-receipt-9", kind: "provider-signed" }],
      verifiedAt: AT,
    };
    expect(proof.level).toBe("P2");
    expect(proof.evidence).toHaveLength(1);
  });
});
