/**
 * Decision Card render contract (W3-005; acceptance scenario 2).
 *
 * The W3-001 Decision Card contract already freezes the full field set
 * (objective, state, evidence, alternatives, predictions, risk,
 * organization, authority, action, history — all required). W3-005 proves
 * RENDERABILITY: every contract field lands in a typed render section, and
 * every opaque Worker-2 reference (decision, strategy, organization,
 * capability, instance, execution-mode, command, proof refs) is rendered
 * VERBATIM — the renderer never re-interprets, scores or invents semantics
 * for them.
 *
 * The deterministic projector lives at
 * `runtime/surfaces/decision-card-render.ts`.
 */

import type { DecisionCard } from "./decision-card";

/** The render sections — one per contract field, plus history/evidence. */
export const DECISION_CARD_RENDER_SECTIONS = [
  "objective",
  "state",
  "evidence",
  "alternatives",
  "predictions",
  "risk",
  "organization",
  "authority",
  "action",
  "history",
] as const;

export type DecisionCardRenderSectionId = (typeof DECISION_CARD_RENDER_SECTIONS)[number];

/** One rendered section: plain-language lines + opaque refs verbatim. */
export interface DecisionCardRenderSection {
  readonly sectionId: DecisionCardRenderSectionId;
  readonly title: string;
  readonly lines: readonly string[];
  /** Opaque references rendered verbatim (never re-interpreted). */
  readonly opaqueRefs: readonly string[];
}

/** The complete render model of one Decision Card. */
export interface DecisionCardRenderModel {
  readonly cardId: string;
  /** The opaque decision reference, rendered verbatim at the top. */
  readonly decisionRef: string;
  readonly header: {
    readonly title: string;
    readonly stateBadge: string;
    readonly approvalBadge: string;
  };
  readonly sections: readonly DecisionCardRenderSection[];
}

/** Project a Decision Card into its complete render model (total, deterministic). */
export type DecisionCardRenderer = (card: DecisionCard) => DecisionCardRenderModel;
