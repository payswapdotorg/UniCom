/**
 * Model-routing policy over journaled state (W2-005; FROZEN-ARCHITECTURE
 * §11: routing is a POLICY DECISION, not a fixed product layer).
 *
 * - A policy maps task kinds to configurations (with optional forced route
 *   classes). Applying it is a PURE, DETERMINISTIC function of
 *   (policy, journaled promotion state, request) — the same journaled state
 *   and inputs ALWAYS produce the same routing decisions (replay law).
 * - The promotion chain is the journaled state: a rule targeting a
 *   configuration that is not promoted (or is retired) produces a TYPED
 *   REFUSAL — routing never silently falls back. Post-retirement the
 *   configuration no longer routes.
 * - Every accepted decision is recorded in a hash-chained, append-only
 *   RoutingDecisionJournal (journaled + replayable, never silent) and can be
 *   REPLAYED against the same journaled state to prove determinism.
 */

import type { DecisionImpact } from "./common.js";
import { structuralHash } from "./lab-promotion.js";
import { routeModelTask } from "./model-route.js";
import type { ModelRouteClass as RouteClass, RoutingComplexity, RoutingUncertainty } from "./model-route.js";
import type { RoutingPromotionChain } from "./promotion-chain.js";
import type { ScenarioTaskKind } from "./reality-battery.js";

// ---------------------------------------------------------------------------
// Policy + requests
// ---------------------------------------------------------------------------

export interface RoutingPolicyRule {
  readonly taskKind: ScenarioTaskKind;
  readonly configurationId: string;
  /** Optional forced route class (policy force wins outright). */
  readonly forcedClass?: RouteClass;
}

export interface ModelRoutingPolicy {
  readonly policyId: string;
  readonly version: string;
  readonly description?: string;
  readonly rules: readonly RoutingPolicyRule[];
}

export interface RoutingRequest {
  readonly taskId: string;
  readonly taskKind: ScenarioTaskKind;
  readonly complexity: RoutingComplexity;
  readonly uncertainty: RoutingUncertainty;
  readonly impact: DecisionImpact;
}

export type RoutingPolicyViolation =
  | "NO_POLICY_RULE"
  | "CONFIGURATION_NOT_PROMOTED"
  | "CONFIGURATION_RETIRED"
  | "CONFIGURATION_UNKNOWN";

export type PolicyApplication =
  | { readonly ok: true; readonly decision: PolicyRoutingDecision }
  | { readonly ok: false; readonly violation: RoutingPolicyViolation; readonly detail: string };

/** The policy decision BEFORE journaling (deterministic, replay-stable). */
export interface PolicyRoutingDecision {
  readonly decisionId: string;
  readonly taskId: string;
  readonly taskKind: ScenarioTaskKind;
  readonly configurationId: string;
  readonly routedClass: RouteClass;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly rationale: string;
  readonly decidedAt: string;
}

// ---------------------------------------------------------------------------
// Deterministic policy application
// ---------------------------------------------------------------------------

/**
 * Apply the routing policy to one request over the journaled promotion
 * state. Pure: same policy + same chain state + same request → same
 * decision (including decisionId). A configuration that is not promoted, or
 * is retired, is a typed refusal — never a silent fallback.
 */
export function applyRoutingPolicy(input: {
  readonly policy: ModelRoutingPolicy;
  readonly chain: RoutingPromotionChain;
  readonly request: RoutingRequest;
  readonly decidedAt: string;
}): PolicyApplication {
  const rule = input.policy.rules.find((entry) => entry.taskKind === input.request.taskKind);
  if (rule === undefined) {
    return {
      ok: false,
      violation: "NO_POLICY_RULE",
      detail: `no policy rule for task kind ${input.request.taskKind}`,
    };
  }
  if (!input.chain.isRoutingEligible(rule.configurationId)) {
    const stage = input.chain.stageFor(rule.configurationId);
    if (stage === undefined) {
      return {
        ok: false,
        violation: "CONFIGURATION_UNKNOWN",
        detail: `policy targets ${rule.configurationId}, which is not a registered candidate`,
      };
    }
    if (stage === "RETIRED") {
      return {
        ok: false,
        violation: "CONFIGURATION_RETIRED",
        detail: `${rule.configurationId} is retired — it no longer routes`,
      };
    }
    return {
      ok: false,
      violation: "CONFIGURATION_NOT_PROMOTED",
      detail: `${rule.configurationId} has not completed the promotion chain (stage ${stage})`,
    };
  }
  const cascade = routeModelTask({
    taskId: input.request.taskId,
    complexity: input.request.complexity,
    uncertainty: input.request.uncertainty,
    impact: input.request.impact,
  });
  const routedClass = rule.forcedClass ?? cascade.routedClass;
  return {
    ok: true,
    decision: {
      decisionId: `route:${input.policy.policyId}:${input.request.taskId}`,
      taskId: input.request.taskId,
      taskKind: input.request.taskKind,
      configurationId: rule.configurationId,
      routedClass,
      policyId: input.policy.policyId,
      policyVersion: input.policy.version,
      rationale:
        rule.forcedClass !== undefined
          ? `policy forced ${rule.forcedClass}`
          : cascade.rationale,
      decidedAt: input.decidedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// The journaled, replayable routing decisions
// ---------------------------------------------------------------------------

export interface JournaledRoutingDecision extends PolicyRoutingDecision {
  readonly sequence: number;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

/**
 * The append-only, hash-chained routing decision journal. Decisions can only
 * be RECORDED (never mutated or removed); any edit, reorder or omission of
 * the chain breaks verifyChain deterministically.
 */
export class RoutingDecisionJournal {
  private readonly entries: JournaledRoutingDecision[] = [];

  record(decision: PolicyRoutingDecision): JournaledRoutingDecision {
    if (this.entries.some((entry) => entry.decisionId === decision.decisionId)) {
      throw new Error(`routing decision already journaled: ${decision.decisionId} (append-only)`);
    }
    const base = {
      ...decision,
      sequence: this.entries.length + 1,
      prevRecordHash:
        this.entries.length === 0
          ? "genesis"
          : (this.entries[this.entries.length - 1] as JournaledRoutingDecision).recordHash,
    };
    const record: JournaledRoutingDecision = {
      ...base,
      recordHash: structuralHash({ ...base, recordHash: undefined }),
    };
    this.entries.push(record);
    return { ...record };
  }

  decisions(): readonly JournaledRoutingDecision[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  verifyChain():
    | { readonly ok: true }
    | { readonly ok: false; readonly firstBrokenSequence: number } {
    let prevRecordHash = "genesis";
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry === undefined) continue;
      if (entry.sequence !== index + 1 || entry.prevRecordHash !== prevRecordHash) {
        return { ok: false, firstBrokenSequence: index + 1 };
      }
      const { recordHash: _ignored, ...rest } = entry;
      if (structuralHash(rest) !== entry.recordHash) {
        return { ok: false, firstBrokenSequence: entry.sequence };
      }
      prevRecordHash = entry.recordHash;
    }
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Replay (determinism proof)
// ---------------------------------------------------------------------------

export type ReplayVerification =
  | { readonly ok: true; readonly decisions: number }
  | {
      readonly ok: false;
      readonly firstMismatchSequence: number;
      readonly detail: string;
    };

/**
 * Replay journaled routing decisions against the SAME journaled promotion
 * state and requests: every re-applied policy decision must equal the
 * journaled one, field for field. Same state + same inputs → same decisions
 * — any divergence (including refusals caused by state changes, e.g. a
 * retirement) is reported as a mismatch.
 */
export function replayRoutingDecisions(input: {
  readonly journal: RoutingDecisionJournal;
  readonly policy: ModelRoutingPolicy;
  readonly chain: RoutingPromotionChain;
  readonly requests: readonly RoutingRequest[];
  readonly decidedAt: string;
}): ReplayVerification {
  const journaled = input.journal.decisions();
  if (journaled.length !== input.requests.length) {
    return {
      ok: false,
      firstMismatchSequence: Math.min(journaled.length, input.requests.length) + 1,
      detail: `request count ${input.requests.length} ≠ journaled decisions ${journaled.length}`,
    };
  }
  for (let index = 0; index < input.requests.length; index += 1) {
    const request = input.requests[index];
    const recorded = journaled[index];
    if (request === undefined || recorded === undefined) continue;
    const applied = applyRoutingPolicy({
      policy: input.policy,
      chain: input.chain,
      request,
      decidedAt: input.decidedAt,
    });
    if (!applied.ok) {
      return {
        ok: false,
        firstMismatchSequence: index + 1,
        detail: `replay of ${request.taskId} refused (${applied.violation}: ${applied.detail}) — the journaled state no longer produces the recorded decision`,
      };
    }
    const replayed = applied.decision;
    const { sequence: _s2, prevRecordHash: _p2, recordHash: _r2, ...original } = recorded;
    if (structuralHash(replayed) !== structuralHash(original)) {
      return {
        ok: false,
        firstMismatchSequence: index + 1,
        detail: `replay of ${request.taskId} diverged from the journaled decision`,
      };
    }
  }
  return { ok: true, decisions: input.requests.length };
}

/** Convenience: the policy routing all task kinds at one configuration. */
export function uniformRoutingPolicy(
  policyId: string,
  version: string,
  configurationId: string,
  taskKinds: readonly ScenarioTaskKind[],
): ModelRoutingPolicy {
  return {
    policyId,
    version,
    rules: taskKinds.map((taskKind) => ({ taskKind, configurationId })),
  };
}
