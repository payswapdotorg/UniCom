/**
 * W2-009 — Reality/Learning Lab decision-quality evaluation (SEPARATE from
 * adoption).
 *
 * Split out of persona-scoring.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module.
 *
 * Law (W2-009 law #8): the seven organization/model archetypes from the
 * Reality/Learning Lab (W2-005) are evaluated for DECISION QUALITY ONLY.
 * They NEVER confound the GUI adoption score. A persona's adoption decision
 * is computed from GUI journey outcomes only; decision-quality outcomes are
 * reported ALONGSIDE adoption but do NOT enter the willingness formula.
 */

export interface DecisionQualityOutcome {
  readonly personaId: string;
  readonly configurationArchetype:
    | "MAIN_AGENT_SKILLS"
    | "MAIN_AGENT_EPHEMERAL_DELEGATES"
    | "PROVIDER_NATIVE_OPTIMIZATION"
    | "SEARCHED_ORGANIZATIONS"
    | "SYSTEM_1_ONLY"
    | "SYSTEM_1_JEPA"
    | "SYSTEM_1_JEPA_SYSTEM_2";
  /** Decision quality on the persona's applicable decision tasks, [0,1]. */
  readonly decisionQualityScore: number;
  /** Unit-cost proxy (integer). Not money. */
  readonly costUnits: number;
  /** Latency-proxy units (integer). Not wall-clock. */
  readonly latencyUnits: number;
  /** Whether this archetype surfaced a declared limitation for this persona's tasks. */
  readonly declaredLimitation: boolean;
}

export interface DecisionQualityAggregate {
  readonly configurationArchetype: DecisionQualityOutcome["configurationArchetype"];
  readonly denominator: number;
  readonly meanDecisionQuality: number;
  readonly meanCostUnits: number;
  readonly meanLatencyUnits: number;
  readonly declaredLimitationCount: number;
}

export function aggregateDecisionQuality(
  outcomes: ReadonlyArray<DecisionQualityOutcome>,
): ReadonlyArray<DecisionQualityAggregate> {
  const byArchetype = new Map<
    DecisionQualityOutcome["configurationArchetype"],
    DecisionQualityOutcome[]
  >();
  for (const o of outcomes) {
    const list = byArchetype.get(o.configurationArchetype) ?? [];
    list.push(o);
    byArchetype.set(o.configurationArchetype, list);
  }
  return Array.from(byArchetype.entries()).map(([archetype, list]) => {
    const denom = list.length;
    return {
      configurationArchetype: archetype,
      denominator: denom,
      meanDecisionQuality: denom === 0 ? 0 : mean(list.map((o) => o.decisionQualityScore)),
      meanCostUnits: denom === 0 ? 0 : Math.round(mean(list.map((o) => o.costUnits))),
      meanLatencyUnits: denom === 0 ? 0 : Math.round(mean(list.map((o) => o.latencyUnits))),
      declaredLimitationCount: list.filter((o) => o.declaredLimitation).length,
    };
  });
}

function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
