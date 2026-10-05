/**
 * Agent plane contracts: AgentPrincipal / MainAgent, Skills, Tools,
 * ephemeral delegates and attenuated delegation
 * (FROZEN-ARCHITECTURE §3.B, §4; invariants 3/4/5).
 *
 * One Main Agent is the principal identity for an active task. Skills are
 * the normal specialization mechanism. Delegates are ephemeral and always
 * attenuated: authority scopes, budgets, memory bounds and evidence
 * obligations are typed and validated.
 */

import type { CommerceCommandType } from "./commerce-seam.js";
import type { DecisionImpact, Money } from "./common.js";

export type AgentPrincipalKind = "main-agent" | "ephemeral-delegate";

export interface AgentPrincipal {
  readonly principalId: string;
  readonly kind: AgentPrincipalKind;
  readonly displayName?: string;
}

/** Reference to an enabled skill (specialization, not a persona). */
export interface SkillReference {
  readonly skillId: string;
  readonly enabled: boolean;
}

/** Skills are the normal specialization mechanism. */
export interface SkillDefinition {
  readonly skillId: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilityDefinitionIds: readonly string[];
  readonly toolIds: readonly string[];
}

/**
 * Typed tool contract. Every consequential external action goes through a
 * typed capability/tool path (invariant 7) bound to a capability definition.
 */
export interface ToolContract {
  readonly toolId: string;
  readonly name: string;
  readonly capabilityDefinitionId: string;
  readonly consequential: boolean;
  readonly inputSchemaRef?: string;
  readonly outputSchemaRef?: string;
}

/** Data scopes a delegate may touch. */
export type DelegateDataScope = "task-context" | "capability-observations" | "coordination-messages" | "public-commerce-content";

/** Authority of the Main Agent itself (what it may propose). */
export interface MainAgentAuthorityScope {
  readonly capabilityDefinitionIds: readonly string[];
  readonly proposableCommandTypes: readonly CommerceCommandType[];
  readonly dataAccess: readonly DelegateDataScope[];
  readonly maxDecisionImpact: DecisionImpact;
}

/** Attenuated authority granted to a delegate — always a subset of the parent's. */
export interface AttenuatedAuthorityScope {
  readonly capabilityDefinitionIds: readonly string[];
  readonly proposableCommandTypes: readonly CommerceCommandType[];
  readonly dataAccess: readonly DelegateDataScope[];
  readonly maxDecisionImpact: DecisionImpact;
}

/** Bounded budget. Delegates and delegation pools always carry explicit bounds. */
export interface DelegateBudget {
  readonly maxSpend: Money;
  readonly maxActions: number;
  readonly expiresAt: string;
}

/** Scoped memory: no implicit inheritance of the principal's memory. */
export interface DelegateMemoryScope {
  readonly accessibleContextRefs: readonly string[];
  readonly inheritsPrincipalMemory: false;
}

export type EvidenceObligationKind = "execution-receipt" | "observation-record" | "decision-summary" | "proof-artifact";

/** Explicit evidence obligation attached to delegated capabilities. */
export interface EvidenceObligation {
  readonly obligationKind: EvidenceObligationKind;
  readonly forCapabilityDefinitionIds: readonly string[];
}

/** Ephemeral delegate — attenuated by construction. */
export interface EphemeralDelegate extends AgentPrincipal {
  readonly kind: "ephemeral-delegate";
  readonly parentMainAgentId: string;
  readonly authority: AttenuatedAuthorityScope;
  readonly budget: DelegateBudget;
  readonly memoryScope: DelegateMemoryScope;
  readonly evidenceObligations: readonly EvidenceObligation[];
  readonly expiresAt: string;
}

/** The single principal identity for an active task. */
export interface MainAgent extends AgentPrincipal {
  readonly kind: "main-agent";
  readonly skills: readonly SkillReference[];
  readonly authority: MainAgentAuthorityScope;
  readonly delegationBudget: DelegateBudget;
}

/** An active task has exactly one Main Agent as its principal identity. */
export interface ActiveTask {
  readonly taskId: string;
  readonly mainAgentId: string;
  /** Opaque EconomicGoal reference (see W2-001 report: spec gap note). */
  readonly goalRef?: string;
  readonly createdAt: string;
}

export function isMainAgent(principal: AgentPrincipal): principal is MainAgent {
  return principal.kind === "main-agent";
}

/** Bind an active task — only a Main Agent may be the task principal. */
export function createActiveTask(input: {
  readonly taskId: string;
  readonly principal: AgentPrincipal;
  readonly createdAt: string;
  readonly goalRef?: string;
}): ActiveTask {
  if (!isMainAgent(input.principal)) {
    throw new Error("only a Main Agent can be the principal identity of an active task");
  }
  const { principal, goalRef, ...rest } = input;
  return goalRef === undefined
    ? { ...rest, mainAgentId: principal.principalId }
    : { ...rest, mainAgentId: principal.principalId, goalRef };
}

export type DelegationViolation =
  | "CAPABILITY_SCOPE_EXCEEDS_PARENT"
  | "COMMAND_TYPES_EXCEED_PARENT"
  | "DATA_ACCESS_EXCEEDS_PARENT"
  | "DECISION_IMPACT_EXCEEDS_PARENT"
  | "BUDGET_EXCEEDS_PARENT"
  | "BUDGET_CURRENCY_MISMATCH"
  | "MISSING_EVIDENCE_OBLIGATION"
  | "MISSING_EXPIRY"
  | "MEMORY_SCOPE_NOT_ATTENUATED";

export type DelegationValidation = { readonly valid: true } | { readonly valid: false; readonly violations: readonly DelegationViolation[] };

const IMPACT_RANK: Readonly<Record<DecisionImpact, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2, IRREVERSIBLE: 3 };

/**
 * Deterministic delegation validation: a delegate's authority, command
 * types, data access, impact bound and budget must be attenuations of the
 * parent Main Agent's; consequential capabilities require evidence
 * obligations; memory must not inherit the principal's memory.
 */
export function validateDelegation(input: {
  readonly parent: MainAgent;
  readonly skills?: readonly SkillDefinition[];
  readonly tools?: readonly ToolContract[];
  readonly delegate: EphemeralDelegate;
}): DelegationValidation {
  const { parent, skills = [], tools = [], delegate } = input;
  const violations: DelegationViolation[] = [];

  // Effective parent capabilities: own authority plus enabled skills.
  const parentCapabilities = new Set(parent.authority.capabilityDefinitionIds);
  for (const skill of skills) {
    for (const capabilityId of skill.capabilityDefinitionIds) parentCapabilities.add(capabilityId);
  }
  for (const capabilityId of delegate.authority.capabilityDefinitionIds) {
    if (!parentCapabilities.has(capabilityId)) violations.push("CAPABILITY_SCOPE_EXCEEDS_PARENT");
  }

  const parentCommands = new Set(parent.authority.proposableCommandTypes);
  for (const commandType of delegate.authority.proposableCommandTypes) {
    if (!parentCommands.has(commandType)) violations.push("COMMAND_TYPES_EXCEED_PARENT");
  }

  const parentData = new Set(parent.authority.dataAccess);
  for (const scope of delegate.authority.dataAccess) {
    if (!parentData.has(scope)) violations.push("DATA_ACCESS_EXCEEDS_PARENT");
  }

  if (IMPACT_RANK[delegate.authority.maxDecisionImpact] > IMPACT_RANK[parent.authority.maxDecisionImpact]) {
    violations.push("DECISION_IMPACT_EXCEEDS_PARENT");
  }

  if (delegate.budget.maxSpend.currency !== parent.delegationBudget.maxSpend.currency) {
    violations.push("BUDGET_CURRENCY_MISMATCH");
  } else if (BigInt(delegate.budget.maxSpend.minorUnits) > BigInt(parent.delegationBudget.maxSpend.minorUnits)) {
    violations.push("BUDGET_EXCEEDS_PARENT");
  }
  if (delegate.budget.maxActions > parent.delegationBudget.maxActions) {
    violations.push("BUDGET_EXCEEDS_PARENT");
  }

  const consequentialCapabilities = new Set(
    tools.filter((tool) => tool.consequential).map((tool) => tool.capabilityDefinitionId),
  );
  if (consequentialCapabilities.size > 0) {
    const covered = new Set(
      delegate.evidenceObligations.flatMap((obligation) => obligation.forCapabilityDefinitionIds),
    );
    for (const capabilityId of delegate.authority.capabilityDefinitionIds) {
      if (consequentialCapabilities.has(capabilityId) && !covered.has(capabilityId)) {
        violations.push("MISSING_EVIDENCE_OBLIGATION");
      }
    }
  }

  if (typeof delegate.expiresAt !== "string" || delegate.expiresAt.length === 0) {
    violations.push("MISSING_EXPIRY");
  }
  if (delegate.memoryScope.inheritsPrincipalMemory !== false) {
    violations.push("MEMORY_SCOPE_NOT_ATTENUATED");
  }

  return violations.length === 0 ? { valid: true } : { valid: false, violations: [...new Set(violations)] };
}
