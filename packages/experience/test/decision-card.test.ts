/**
 * Contract test 2 — Decision Card required-field contract
 * (W3-001 §6.2, docs/UX-DEPLOYMENT.md §3, FROZEN §14).
 *
 * All required fields must be expressible AND required: objective, state,
 * evidence, alternatives, predictions, downside/risk, organization/capabilities
 * used, authority/approval, action, history/evidence.
 */

import { describe, expect, it } from "vitest";
import type { DecisionCard, DecisionPrediction } from "../src/surfaces/decision-card";
import type { AuthorizationStatus } from "../src/common/evidence";
import type {
  CapabilityDefinitionId,
  CommerceKernelCommandRef,
  ConnectedCapabilityInstanceId,
  ExecutionModeRef,
  TransactionProofRef,
} from "../src/common/opaque-refs";
import type { Equal, Expect } from "./type-helpers";
import { decisionRef, organizationRef, principalRef, strategyRef, utc } from "./branded";

// Compile-time: every field is required (no optional properties).
export type AssertAllFieldsRequired = Expect<Equal<Required<DecisionCard>, DecisionCard>>;

// Compile-time: the required semantic fields exist by name.
export type AssertRequiredFields = Expect<
  Equal<
    keyof DecisionCard,
    | "cardId"
    | "decisionRef"
    | "objective"
    | "state"
    | "evidence"
    | "alternatives"
    | "predictions"
    | "risk"
    | "organizationUsed"
    | "authority"
    | "action"
    | "history"
  >
>;

// Compile-time: predictions are structurally predictive-truth-only.
export type AssertPredictionClass = Expect<Equal<DecisionPrediction["truthClass"], "predictive">>;

// Compile-time: state is operational-truth projection.
export type AssertStateClass = Expect<Equal<DecisionCard["state"]["truthClass"], "operational">>;

// Compile-time: authority status preserves UNKNOWN.
const ALL_AUTHORIZATION_STATUSES: readonly AuthorizationStatus[] = [
  "not-required",
  "pending",
  "granted",
  "denied",
  "expired",
  "unknown",
];

const proofRef = "P2" as TransactionProofRef;
const capDefId = "capdef-email-campaign" as CapabilityDefinitionId;
const connectedInstance = "cci-1" as ConnectedCapabilityInstanceId;
const executionMode = "PASS_THROUGH_NATIVE" as ExecutionModeRef;
const commandRef = "cmd-1" as CommerceKernelCommandRef;

// A complete, valid Decision Card fixture.
const validCard: DecisionCard = {
  cardId: "card-1",
  decisionRef: decisionRef("decision-77"),
  objective: {
    statement: "Grow repeat purchase 15% this quarter without more ad spend",
    goalEcho: "repeat-purchase-15",
  },
  state: {
    truthClass: "operational",
    summary: "Repeat purchase rate is 22% over the last 90 days",
    lastChangedAt: utc("2026-10-05T02:34:37Z"),
    evidence: [],
  },
  evidence: [
    {
      evidenceId: "ev-1",
      kind: "execution-log",
      summary: "Cohort report for Q3",
      capturedAt: utc("2026-10-01T00:00:00Z"),
      proofRef,
      sourceArtifactRefs: [],
    },
  ],
  alternatives: [
    {
      alternativeId: "alt-1",
      label: "Loyalty discount",
      summary: "Offer 10% to lapsed buyers",
      strategyRef: strategyRef("strategy-9"),
      predictedOutcome: {
        truthClass: "predictive",
        summary: "Repeat purchase +4pt",
        confidenceNote: "medium",
        horizonNote: "8 weeks",
        assumptions: ["discount elasticity holds"],
        basedOnEvidence: [],
      },
      tradeoffs: ["margin -2pt"],
    },
  ],
  predictions: [
    {
      truthClass: "predictive",
      summary: "Repeat purchase +5pt by quarter end",
      confidenceNote: "medium-high",
      horizonNote: "12 weeks",
      assumptions: ["email deliverability stable"],
      basedOnEvidence: [],
    },
  ],
  risk: {
    downsideSummary: "Discount overuse may erode margin",
    severity: "medium",
    stopConditions: ["margin floor < 18%", "unsubscribe rate > 1.5%"],
    recourseNote: "Campaign can be paused instantly",
    evidence: [],
  },
  organizationUsed: {
    organizationRef: organizationRef("org-3"),
    whyThisOrganization: "One main agent + campaign skill; no delegates needed",
    actors: [
      {
        actorLabel: "Main agent",
        actorKind: "main-agent",
        attenuatedAuthorityNote: "Campaign spend capped at policy limit",
        capabilities: [
          {
            capabilityDefinitionId: capDefId,
            connectedInstanceRef: connectedInstance,
            executionModeRef: executionMode,
            roleInPlan: "Sends campaign via connected provider",
          },
        ],
      },
    ],
    capabilitiesUsed: [
      {
        capabilityDefinitionId: capDefId,
        connectedInstanceRef: connectedInstance,
        executionModeRef: executionMode,
        roleInPlan: "Sends campaign via connected provider",
      },
    ],
  },
  authority: {
    requiredApprovals: [
      {
        approvalId: "appr-1",
        approver: principalRef("principal-owner"),
        scope: "campaign-budget-500",
        status: "pending",
        evidence: [],
      },
    ],
    currentStatus: "pending",
    explanation: "Owner approval required for spend above threshold",
  },
  action: { actionKind: "approve", available: true, commandHandoff: commandRef },
  history: [
    {
      occurredAt: utc("2026-10-05T02:00:00Z"),
      summary: "Card created from opportunity",
      actor: "Main agent",
      evidenceRefs: [],
    },
  ],
};

describe("Decision Card contract", () => {
  it("accepts a complete fixture with all required fields", () => {
    expect(validCard.objective.statement).toContain("repeat purchase");
    expect(validCard.state.truthClass).toBe("operational");
    expect(validCard.predictions[0]?.truthClass).toBe("predictive");
    expect(validCard.risk.stopConditions.length).toBeGreaterThan(0);
    expect(validCard.authority.currentStatus).toBe("pending");
    expect(validCard.action.actionKind).toBe("approve");
    expect(validCard.history.length).toBeGreaterThan(0);
  });

  it("rejects a card missing any required field at compile time", () => {
    const missingRisk: DecisionCard = {
      ...validCard,
      // @ts-expect-error risk (downside/risk) is required
      risk: undefined,
    };
    expect(missingRisk).toBeDefined();

    const missingHistory: DecisionCard = {
      ...validCard,
      // @ts-expect-error history (history/evidence) is required
      history: undefined,
    };
    expect(missingHistory).toBeDefined();

    const missingAuthority: DecisionCard = {
      ...validCard,
      // @ts-expect-error authority (authority/approval) is required
      authority: undefined,
    };
    expect(missingAuthority).toBeDefined();
  });

  it("types capability usage as opaque references (no second vocabulary)", () => {
    const usage = validCard.organizationUsed.capabilitiesUsed[0];
    expect(usage).toBeDefined();
    if (usage) {
      expect(typeof usage.capabilityDefinitionId).toBe("string");
      expect(usage.capabilityDefinitionId).toBe("capdef-email-campaign");
      expect(usage.connectedInstanceRef).toBe("cci-1");
    }
  });

  it("preserves UNKNOWN in authorization statuses", () => {
    expect(ALL_AUTHORIZATION_STATUSES).toContain("unknown");
    expect(ALL_AUTHORIZATION_STATUSES.length).toBe(6);
  });
});
