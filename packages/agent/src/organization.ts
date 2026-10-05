/**
 * Organization contracts (FROZEN-ARCHITECTURE §3.F, §4; invariant 31).
 *
 * An Organization is WHO/WHAT executes a Strategy: searched or directly
 * formed assignments of strategy steps to executors (main agent, skill,
 * ephemeral delegate or connected capability) under attenuated authority.
 * It references a Strategy by id — it never merges with it.
 */

import type { AttenuatedAuthorityScope, EphemeralDelegate, MainAgent } from "./agent.js";
import type { Strategy } from "./strategy.js";

export type OrganizationFormationKind = "DIRECT" | "SEARCHED";

export type OrganizationExecutor =
  | { readonly executorKind: "main-agent"; readonly mainAgentId: string }
  | { readonly executorKind: "skill"; readonly skillId: string }
  | { readonly executorKind: "ephemeral-delegate"; readonly delegateId: string }
  | { readonly executorKind: "connected-capability"; readonly connectedInstanceId: string };

/** WHO executes WHAT: a strategy step bound to an executor and authority. */
export interface OrganizationAssignment {
  readonly stepId: string;
  readonly executor: OrganizationExecutor;
  readonly authorityScope: AttenuatedAuthorityScope;
}

/**
 * WHO/WHAT executes. Carries no approach, rationale or command steps —
 * those belong to the referenced Strategy.
 */
export interface Organization {
  readonly organizationId: string;
  readonly strategyId: string;
  readonly mainAgentId: string;
  readonly formation: OrganizationFormationKind;
  readonly assignments: readonly OrganizationAssignment[];
}

export type OrganizationViolation =
  | "UNASSIGNED_STEP"
  | "UNKNOWN_DELEGATE_EXECUTOR"
  | "DELEGATE_NOT_CHILD_OF_MAIN_AGENT"
  | "ASSIGNMENT_FOR_UNKNOWN_STEP";

export type OrganizationValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly violations: readonly OrganizationViolation[] };

/**
 * Deterministic organization validation: every strategy step is assigned,
 * assignments name known steps, and delegate executors exist under the
 * organization's Main Agent.
 */
export function validateOrganization(input: {
  readonly organization: Organization;
  readonly strategy: Strategy;
  readonly parent: MainAgent;
  readonly delegates?: readonly EphemeralDelegate[];
}): OrganizationValidation {
  const { organization, strategy, parent, delegates = [] } = input;
  const violations: OrganizationViolation[] = [];
  const stepIds = new Set(strategy.steps.map((step) => step.stepId));
  const assignedSteps = new Set(organization.assignments.map((assignment) => assignment.stepId));

  for (const stepId of stepIds) {
    if (!assignedSteps.has(stepId)) violations.push("UNASSIGNED_STEP");
  }
  for (const assignment of organization.assignments) {
    if (!stepIds.has(assignment.stepId)) violations.push("ASSIGNMENT_FOR_UNKNOWN_STEP");
    const executor = assignment.executor;
    if (executor.executorKind === "ephemeral-delegate") {
      const delegate = delegates.find((candidate) => candidate.principalId === executor.delegateId);
      if (delegate === undefined) {
        violations.push("UNKNOWN_DELEGATE_EXECUTOR");
      } else if (delegate.parentMainAgentId !== parent.principalId || organization.mainAgentId !== parent.principalId) {
        violations.push("DELEGATE_NOT_CHILD_OF_MAIN_AGENT");
      }
    }
  }

  return violations.length === 0 ? { valid: true } : { valid: false, violations: [...new Set(violations)] };
}
