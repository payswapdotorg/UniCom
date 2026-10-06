/**
 * Decision Card renderer (W3-005; acceptance scenario 2).
 *
 * Deterministic, total projection of a Decision Card into its render model.
 * Every one of the contract fields lands in its typed render section; every
 * opaque reference (decision, strategy, organization, capability, instance,
 * execution-mode, command, proof refs) is rendered VERBATIM — the renderer
 * never re-interprets or scores them. Truth separation is preserved: state
 * lines are labeled operational, prediction lines predictive.
 */

import type { DecisionCard } from "../../surfaces/decision-card";
import type {
  DecisionCardRenderModel,
  DecisionCardRenderSection,
} from "../../surfaces/decision-card-render";
import { DECISION_CARD_RENDER_SECTIONS } from "../../surfaces/decision-card-render";

const SEVERITY_LABEL: Readonly<Record<string, string>> = {
  low: "low",
  medium: "medium",
  high: "high",
  severe: "severe",
};

function section(
  sectionId: (typeof DECISION_CARD_RENDER_SECTIONS)[number],
  title: string,
  lines: readonly string[],
  opaqueRefs: readonly string[],
): DecisionCardRenderSection {
  return { sectionId, title, lines, opaqueRefs };
}

/** Project one Decision Card into its COMPLETE render model. */
export function renderDecisionCard(card: DecisionCard): DecisionCardRenderModel {
  const sections: DecisionCardRenderSection[] = [
    section("objective", "Objective", [
      card.objective.statement,
      `Working toward your goal: ${card.objective.goalEcho}`,
    ], []),
    section("state", "Current state (operational truth)", [
      card.state.summary,
      `Last changed ${card.state.lastChangedAt}`,
    ], []),
    section("evidence", "Evidence", card.evidence.map((evidence) => `${evidence.summary} (${evidence.kind}, ${evidence.capturedAt})`),
      card.evidence.map((evidence) => evidence.proofRef as string)),
    section("alternatives", "Alternatives considered",
      card.alternatives.flatMap((alternative) => [
        `${alternative.label}: ${alternative.summary}`,
        `Predicted: ${alternative.predictedOutcome.summary} (${alternative.predictedOutcome.confidenceNote}, ${alternative.predictedOutcome.horizonNote})`,
        ...alternative.tradeoffs.map((tradeoff) => `Trade-off: ${tradeoff}`),
      ]),
      card.alternatives.map((alternative) => alternative.strategyRef as string)),
    section("predictions", "Predictions (not guarantees)",
      card.predictions.map((prediction) =>
        `${prediction.summary} — confidence ${prediction.confidenceNote}, horizon ${prediction.horizonNote}`),
      card.predictions.flatMap((prediction) => prediction.basedOnEvidence.map((evidence) => evidence.proofRef as string))),
    section("risk", "Downside & risk", [
      `${card.risk.downsideSummary} (severity ${SEVERITY_LABEL[card.risk.severity] ?? card.risk.severity})`,
      ...card.risk.stopConditions.map((condition) => `Stops if: ${condition}`),
      ...(card.risk.recourseNote === undefined ? [] : [`Recourse: ${card.risk.recourseNote}`]),
    ], []),
    section("organization", "Who & what does the work",
      [
        card.organizationUsed.whyThisOrganization,
        ...card.organizationUsed.actors.flatMap((actor) => [
          `${actor.actorLabel} (${actor.actorKind}) — authority: ${actor.attenuatedAuthorityNote}`,
        ]),
      ],
      [
        card.organizationUsed.organizationRef as string,
        ...card.organizationUsed.capabilitiesUsed.map((usage) => usage.capabilityDefinitionId as string),
        ...card.organizationUsed.capabilitiesUsed.flatMap((usage) =>
          usage.connectedInstanceRef === undefined ? [] : [usage.connectedInstanceRef as string]),
        ...card.organizationUsed.capabilitiesUsed.flatMap((usage) =>
          usage.executionModeRef === undefined ? [] : [usage.executionModeRef as string]),
      ]),
    section("authority", "Approvals", [
      card.authority.explanation,
      ...card.authority.requiredApprovals.map((approval) =>
        `Approval ${approval.approvalId} (${approval.scope}) — ${approval.status}`),
    ], []),
    section("action", "Your action", [
      card.action.available
        ? `Available action: ${card.action.actionKind}`
        : `Action ${card.action.actionKind} is unavailable: ${card.action.unavailableReason ?? "no reason given"}`,
    ], [
      ...(card.action.commandHandoff === undefined ? [] : [card.action.commandHandoff as string]),
      ...(card.action.idempotencyKey === undefined ? [] : [card.action.idempotencyKey as string]),
    ]),
    section("history", "History", card.history.map((event) =>
      `${event.occurredAt} — ${event.summary} (${event.actor})`), []),
  ];

  const byId = new Map(sections.map((rendered) => [rendered.sectionId, rendered]));
  const ordered = DECISION_CARD_RENDER_SECTIONS.map(
    (sectionId) => byId.get(sectionId) as DecisionCardRenderSection,
  );

  return {
    cardId: card.cardId,
    decisionRef: card.decisionRef as string,
    header: {
      title: card.objective.statement,
      stateBadge: `state: ${card.state.truthClass}`,
      approvalBadge: `approval: ${card.authority.currentStatus}`,
    },
    sections: ordered,
  };
}
