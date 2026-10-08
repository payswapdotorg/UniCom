/**
 * Section registry — Trust and security (W2-008 §scope 3).
 *
 * 23 rows covering the trust/security plane: v1 rows (closed in Wave-1)
 * + W2-006 threat-surface rows (closed in W2-006) + W2-008 residue rows
 * (prompt-injection immune chain, account/agent compromise, connector
 * compromise, marketplace collusion, Sybil, anomalous agent). FAIL rows
 * have empty pointers — verdict is DERIVED.
 */
import type { AuditSection } from "../types.js";

const P = (file: string, symbol?: string) => ({ file, ...(symbol ? { symbol } : {}) });

export const SECTION: AuditSection = {
  section: "trust-and-security",
  rows: [
    // --- v1 rows (PASS — closed in Wave-1) ---
    {
      row: "user-trust",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "UserTrustRecord"),
        implementation: P("packages/agent/src/proof.ts", "deriveUserTrust"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    {
      row: "agent-trust",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "AgentTrustRecord"),
        implementation: P("packages/agent/src/proof.ts", "deriveAgentTrust"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    {
      row: "capability-trust",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "CapabilityTrustRecord"),
        implementation: P("packages/agent/src/proof.ts", "verifyDerivedTrust"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    {
      row: "transaction-proof",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "TransactionProof"),
        implementation: P("packages/agent/src/proof.ts", "bindTransactionProof"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    {
      row: "proof-level-p0-p5",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "ProofLevel"),
        implementation: P("packages/agent/src/proof.ts", "pinProofSelection"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    // --- W2-006 threat-surface rows (PASS — closed in W2-006) ---
    {
      row: "prompt-injection-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-fraud.ts", "FRAUD_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/fraud-evasion.test.ts"),
        evidence: P("packages/agent/test/fraud-evasion.test.ts"),
      },
    },
    {
      row: "price-manipulation-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-fraud.ts", "FRAUD_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/fraud-evasion.test.ts"),
        evidence: P("packages/agent/test/fraud-evasion.test.ts"),
      },
    },
    {
      row: "review-manipulation-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-fraud.ts", "FRAUD_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/fraud-evasion.test.ts"),
        evidence: P("packages/agent/test/fraud-evasion.test.ts"),
      },
    },
    {
      row: "identity-spoofing-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-structure.ts", "STRUCTURE_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "data-exfiltration-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-integrity.ts", "INTEGRITY_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "constraint-bypass-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-buyer.ts", "BUYER_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "immune-broadcast",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-immune.ts", "IMMUNE_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-harness.ts", "runAdversarialCase"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/immune-broadcast.test.ts"),
        evidence: P("packages/agent/test/immune-broadcast.test.ts"),
      },
    },
    // --- W2-008 residue rows — immune chain + compromise vectors ---
    {
      row: "prompt-injection-immune-chain",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: prompt-injection immune chain — signal → classify → isolate → broadcast",
      },
    },
    {
      row: "account-compromise-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "AccountCompromiseConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: account compromise detection with anomaly threshold",
      },
    },
    {
      row: "agent-compromise-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "AgentCompromiseConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: agent compromise detection with behavioral deviation",
      },
    },
    {
      row: "connector-compromise-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "ConnectorCompromiseConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: connector compromise with attestation verification",
      },
    },
    {
      row: "marketplace-collusion-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "CollusionConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: marketplace collusion detection with seller-diversity floor",
      },
    },
    {
      row: "sybil-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "SybilConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: Sybil detection with unique-identity floor",
      },
    },
    {
      row: "anomalous-agent-detection",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "AnomalousAgentConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: anomalous agent detection with behavioral-bounds constraint",
      },
    },
    {
      row: "trust-four-kinds-invariant",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "UserTrustRecord"),
        implementation: P("packages/agent/src/proof.ts", "verifyDerivedTrust"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
        closureNote: "W2-008 closure: four-trust-kinds invariant (UserTrust/AgentTrust/CapabilityTrust/TransactionProof, rule 14)",
      },
    },
    {
      row: "proof-level-before-execution",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "ProofPinnedAction"),
        implementation: P("packages/agent/src/proof.ts", "pinProofSelection"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
        closureNote: "W2-008 closure: proof level selected BEFORE consequential execution (rule 23)",
      },
    },
    {
      row: "security-block-deterministic",
      rungs: {
        contract: P("packages/agent/src/intent.ts", "HardConstraintCheck"),
        implementation: P("packages/agent/src/intent.ts", "checkHardConstraints"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
        closureNote: "W2-008 closure: security BLOCK is deterministic hard constraint (rule 15)",
      },
    },
  ],
};
