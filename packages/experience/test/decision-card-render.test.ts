/**
 * Contract + runtime test — Decision Card render hardening (W3-005
 * acceptance scenario 2).
 *
 * Every card renders the FULL contract: all ten render sections (the
 * 9-field contract + history/evidence), every section populated, and every
 * opaque Worker-2 reference rendered VERBATIM. Compile-time: the render
 * model and section ids are exactly the frozen contract.
 */

import { describe, expect, it } from "vitest";
import type { DecisionCard } from "../src/surfaces/decision-card";
import type { DecisionCardRenderModel } from "../src/surfaces/decision-card-render";
import { DECISION_CARD_RENDER_SECTIONS } from "../src/surfaces/decision-card-render";
import { renderDecisionCard } from "../src/runtime/surfaces/decision-card-render";
import { decisionRef, organizationRef, principalRef, strategyRef, utc } from "./branded";
import type { Equal, Expect } from "./type-helpers";
import type {
  CapabilityDefinitionId,
  CommerceKernelCommandRef,
  ConnectedCapabilityInstanceId,
  ExecutionModeRef,
  TransactionProofRef,
} from "../src/common/opaque-refs";

// Compile-time: the render model has no optional fields.
export type AssertRenderRequired = Expect<Equal<Required<DecisionCardRenderModel>, DecisionCardRenderModel>>;
export type AssertSectionIds = Expect<
  Equal<(typeof DECISION_CARD_RENDER_SECTIONS)[number], DecisionCardRenderModel["sections"][number]["sectionId"]>
>;

const proof = (id: string) => id as TransactionProofRef;

/** A COMPLETE card exercising every field (opaque refs are unique strings). */
const fullCard: DecisionCard = {
  cardId: "card-render-1",
  decisionRef: decisionRef("decision-render-77"),
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
      evidenceId: "ev-render-1",
      kind: "execution-log",
      summary: "Cohort report for Q3",
      capturedAt: utc("2026-10-01T00:00:00Z"),
      proofRef: proof("P2"),
      sourceArtifactRefs: [],
    },
  ],
  alternatives: [
    {
      alternativeId: "alt-render-1",
      label: "Loyalty discount",
      summary: "Offer 10% to lapsed buyers",
      strategyRef: strategyRef("strategy-render-9"),
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
    severity: "high",
    stopConditions: ["margin floor < 18%", "unsubscribe rate > 1.5%"],
    recourseNote: "Campaign can be paused instantly",
    evidence: [],
  },
  organizationUsed: {
    organizationRef: organizationRef("org-render-3"),
    whyThisOrganization: "One main agent + campaign skill; no delegates needed",
    actors: [
      {
        actorLabel: "Main agent",
        actorKind: "main-agent",
        attenuatedAuthorityNote: "Campaign spend capped at policy limit",
        capabilities: [
          {
            capabilityDefinitionId: "capdef-render-email-campaign" as CapabilityDefinitionId,
            connectedInstanceRef: "cci-render-1" as ConnectedCapabilityInstanceId,
            executionModeRef: "PASS_THROUGH_NATIVE" as ExecutionModeRef,
            roleInPlan: "Sends campaign via connected provider",
          },
        ],
      },
    ],
    capabilitiesUsed: [
      {
        capabilityDefinitionId: "capdef-render-email-campaign" as CapabilityDefinitionId,
        connectedInstanceRef: "cci-render-1" as ConnectedCapabilityInstanceId,
        executionModeRef: "PASS_THROUGH_NATIVE" as ExecutionModeRef,
        roleInPlan: "Sends campaign via connected provider",
      },
    ],
  },
  authority: {
    requiredApprovals: [
      {
        approvalId: "appr-render-1",
        approver: principalRef("principal-render-owner"),
        scope: "campaign-budget-500",
        status: "pending",
        evidence: [],
      },
    ],
    currentStatus: "pending",
    explanation: "Owner approval required for spend above threshold",
  },
  action: {
    actionKind: "approve",
    available: true,
    commandHandoff: "cmd-render-1" as CommerceKernelCommandRef,
  },
  history: [
    {
      occurredAt: utc("2026-10-05T02:00:00Z"),
      summary: "Card created from opportunity",
      actor: "Main agent",
      evidenceRefs: [],
    },
  ],
};

describe("Decision Card render contract — scenario 2", () => {
  it("renders the FULL contract: all ten sections, canonical order, none missing", () => {
    const model = renderDecisionCard(fullCard);
    expect(model.sections.map((section) => section.sectionId)).toEqual([
      ...DECISION_CARD_RENDER_SECTIONS,
    ]);
  });

  it("every render section is POPULATED (lines present)", () => {
    const model = renderDecisionCard(fullCard);
    for (const section of model.sections) {
      expect(section.lines.length).toBeGreaterThan(0);
      expect(section.title.length).toBeGreaterThan(0);
    }
  });

  it("every contract FIELD lands in the render (field-by-field coverage)", () => {
    const model = renderDecisionCard(fullCard);
    const text = (section: string) =>
      model.sections
        .filter((rendered) => rendered.sectionId === section)
        .map((rendered) => rendered.lines.join(" "))
        .join(" ");
    expect(text("objective")).toContain("Grow repeat purchase 15%");
    expect(text("objective")).toContain("repeat-purchase-15");
    expect(text("state")).toContain("22% over the last 90 days");
    expect(text("evidence")).toContain("Cohort report for Q3");
    expect(text("alternatives")).toContain("Loyalty discount");
    expect(text("alternatives")).toContain("margin -2pt");
    expect(text("predictions")).toContain("+5pt by quarter end");
    expect(text("risk")).toContain("erode margin");
    expect(text("risk")).toContain("margin floor < 18%");
    expect(text("risk")).toContain("Campaign can be paused instantly");
    expect(text("organization")).toContain("One main agent + campaign skill");
    expect(text("organization")).toContain("Campaign spend capped at policy limit");
    expect(text("authority")).toContain("Owner approval required");
    expect(text("authority")).toContain("campaign-budget-500");
    expect(text("action")).toContain("approve");
    expect(text("history")).toContain("Card created from opportunity");
    expect(model.header.title).toContain("Grow repeat purchase");
    expect(model.header.stateBadge).toContain("operational");
    expect(model.header.approvalBadge).toContain("pending");
  });

  it("renders every OPAQUE reference VERBATIM (never re-interpreted)", () => {
    const model = renderDecisionCard(fullCard);
    const allRefs = model.sections.flatMap((section) => section.opaqueRefs);
    expect(model.decisionRef).toBe("decision-render-77");
    expect(allRefs).toContain("strategy-render-9");
    expect(allRefs).toContain("org-render-3");
    expect(allRefs).toContain("capdef-render-email-campaign");
    expect(allRefs).toContain("cci-render-1");
    expect(allRefs).toContain("PASS_THROUGH_NATIVE");
    expect(allRefs).toContain("cmd-render-1");
    expect(allRefs).toContain("P2");
    // Verbatim means character-for-character: no rewriting, no prefixes.
    for (const ref of allRefs) {
      expect(typeof ref).toBe("string");
      expect(ref.includes("ref:")).toBe(false);
    }
  });

  it("an unavailable action renders its unavailable reason", () => {
    const model = renderDecisionCard({
      ...fullCard,
      action: { actionKind: "execute", available: false, unavailableReason: "approval still pending" },
    });
    const actionText = model.sections
      .find((section) => section.sectionId === "action")
      ?.lines.join(" ");
    expect(actionText).toContain("unavailable");
    expect(actionText).toContain("approval still pending");
  });

  it("rendering is DETERMINISTIC (identical card, identical model)", () => {
    expect(renderDecisionCard(fullCard)).toEqual(renderDecisionCard(fullCard));
  });

  it("truth separation is preserved in render labels", () => {
    const model = renderDecisionCard(fullCard);
    expect(model.sections.find((s) => s.sectionId === "state")?.title).toContain("operational truth");
    expect(model.sections.find((s) => s.sectionId === "predictions")?.title).toContain("not guarantees");
  });
});
