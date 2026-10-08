/**
 * W2-008 residue-closure adversaries — the three detection surface classes
 * (account/agent compromise, connector/collusion/Sybil, anomalous agent).
 * Cases 6-8 of 8; the boundary classes live in
 * adversarial-cases-w2-008.ts (TL battery split).
 */

import {
  checkHardConstraints,
  type BuyerCommerceIntent,
  type IntentCandidate,
} from "./intent.js";
import {
  type AdversaryCase,
} from "./adversarial-context.js";
import {
  BUYER,
  USD,
  buyerIntentWithAccountCompromise,
  buyerIntentWithAgentCompromise,
  buyerIntentWithSybil,
  buyerIntentWithAnomalousAgent,
  encounterOutcome,
} from "./adversarial-cases-w2-008-support.js";

export const W2_008_DETECTION_ADVERSARIES: readonly AdversaryCase[] = [
  // === 6. Account/agent compromise detection ===
  {
    adversaryId: "adversary:w2-008:account-anomalous-login-rate",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "account-anomalous-login-rate-exceeds",
    description: "ACCOUNT_COMPROMISE: the anomalous login rate exceeds the buyer's declared max",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAccountCompromise();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/account-anomalous-rate",
        securityCandidate: { anomalousLoginRate: 15, attestationProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:account-anomalous-login-rate",
        ok: !check.satisfied && check.violations.includes("ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous login rate exceeding buyer's max rejected (ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX) — account compromise detection is a deterministic hard constraint (rule 15)",
        label: "account anomalous login rate exceeds",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:agent-behavioral-deviation",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "agent-behavioral-deviation-exceeds",
    description: "AGENT_COMPROMISE: the agent's behavioral deviation exceeds the buyer's declared max bps",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAgentCompromise();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/agent-behavioral-deviation",
        securityCandidate: { behavioralDeviationBps: 3000, agentProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:agent-behavioral-deviation",
        ok: !check.satisfied && check.violations.includes("AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "agent behavioral deviation exceeding buyer's max rejected (AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX) — agent compromise detection is a deterministic hard constraint (rule 15)",
        label: "agent behavioral deviation exceeds",
      });
    },
  },

  // === 7. Connector/collusion/Sybil detection ===
  {
    adversaryId: "adversary:w2-008:sybil-unique-identities-below",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "sybil-unique-identities-below-min",
    description: "SYBIL: the participant set has fewer unique identities than the buyer's minimum",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithSybil();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/sybil-identities-below",
        securityCandidate: { uniqueIdentityCount: 2 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:sybil-unique-identities-below",
        ok: !check.satisfied && check.violations.includes("SYBIL_UNIQUE_IDENTITIES_BELOW_MIN"),
        okResult: "EVASION_BLOCKED",
        okDetail: "Sybil: unique identities below buyer's minimum rejected (SYBIL_UNIQUE_IDENTITIES_BELOW_MIN) — the identity floor is a hard constraint; multi-identity attacks are blocked",
        label: "Sybil unique identities below min",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:connector-attestation-stale",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "connector-attestation-stale",
    description: "CONNECTOR_COMPROMISE: the connector's attestation is stale (below the buyer's freshness floor)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent: BuyerCommerceIntent = {
        intentId: "intent:adv:w2-008:connector-compromise",
        buyerRef: BUYER,
        desired: ["desired://any/item"],
        hardConstraints: {
          connectorCompromise: {
            minAttestationFreshnessSeconds: 300,
            requiredConnectorProofLevel: "P2",
          },
        },
        statedAt: "2026-10-01T00:00:00Z",
      };
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/connector-attestation-stale",
        securityCandidate: { attestationFreshnessSeconds: 60, attestationProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:connector-attestation-stale",
        ok: !check.satisfied && check.violations.includes("CONNECTOR_ATTESTATION_STALE"),
        okResult: "EVASION_BLOCKED",
        okDetail: "connector attestation stale rejected (CONNECTOR_ATTESTATION_STALE) — attestation freshness is a hard constraint; stale connectors are untrusted",
        label: "connector attestation stale",
      });
    },
  },

  // === 8. Anomalous agent detection ===
  {
    adversaryId: "adversary:w2-008:anomalous-agent-action-rate",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "anomalous-agent-action-rate-exceeds",
    description: "ANOMALOUS_AGENT: the agent's action rate exceeds the buyer's declared max per minute",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAnomalousAgent();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/anomalous-rate",
        securityCandidate: { actionRatePerMinute: 120, capabilityDeviationBps: 200 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:anomalous-agent-action-rate",
        ok: !check.satisfied && check.violations.includes("ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous agent action rate exceeding buyer's max rejected (ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX) — behavioral bounds are deterministic hard constraints (rule 15)",
        label: "anomalous agent action rate exceeds",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:anomalous-agent-capability-deviation",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "anomalous-agent-capability-deviation-exceeds",
    description: "ANOMALOUS_AGENT: the agent's capability deviation exceeds the buyer's declared max bps",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAnomalousAgent();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/anomalous-capability-deviation",
        securityCandidate: { actionRatePerMinute: 10, capabilityDeviationBps: 2000 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:anomalous-agent-capability-deviation",
        ok: !check.satisfied && check.violations.includes("ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous agent capability deviation exceeding buyer's max rejected (ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX) — agents acting outside declared capability bounds are blocked",
        label: "anomalous agent capability deviation exceeds",
      });
    },
  },
];
