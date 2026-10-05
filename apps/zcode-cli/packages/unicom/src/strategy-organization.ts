/**
 * @unicom/agent-kernel — strategy/organization runtime separation (W2-002).
 *
 * Strategy ≠ Organization (invariant 31). At runtime they remain distinct
 * object kinds with distinct lifecycles: strategies are candidate plans,
 * organizations are execution assignments of executors to strategy steps.
 * Delegate dispatch through the plane requires a VALIDATED organization
 * whose assignments cover the strategy — the kernel refuses delegation for
 * an unvalidated or incomplete organization.
 */

import {
  validateOrganization,
  type Organization,
  type OrganizationAssignment,
  type OrganizationValidation,
  type Strategy,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";

export interface RecordOrganizationInput {
  readonly organization: Organization;
  readonly strategy: Strategy;
  readonly parent: Parameters<typeof validateOrganization>[0]["parent"];
  readonly delegates?: Parameters<typeof validateOrganization>[0]["delegates"];
}

export class UnicomStrategyOrganizationStore {
  private readonly strategies = new Map<string, Strategy>();
  private readonly organizations = new Map<string, Organization>();
  private readonly validationByOrganization = new Map<string, OrganizationValidation>();

  recordStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.strategyId, strategy);
  }

  /** Validate + store. Validation uses the contract's deterministic rules. */
  recordOrganization(input: RecordOrganizationInput): OrganizationValidation {
    const validation = validateOrganization(input);
    this.strategies.set(input.strategy.strategyId, input.strategy);
    this.organizations.set(input.organization.organizationId, input.organization);
    this.validationByOrganization.set(input.organization.organizationId, validation);
    return validation;
  }

  findStrategy(strategyId: string): Strategy | undefined {
    return this.strategies.get(strategyId);
  }

  findOrganization(organizationId: string): Organization | undefined {
    return this.organizations.get(organizationId);
  }

  validationFor(organizationId: string): OrganizationValidation | undefined {
    return this.validationByOrganization.get(organizationId);
  }

  /** Assignment lookup used by delegate dispatch (executor identity). */
  assignmentForDelegate(organizationId: string, delegateId: string): OrganizationAssignment | undefined {
    return this.organizations.get(organizationId)?.assignments.find(
      (assignment) =>
        assignment.executor.executorKind === "ephemeral-delegate" &&
        assignment.executor.delegateId === delegateId,
    );
  }

  /**
   * Kernel gate for delegate dispatch: the delegate's assignment must exist
   * inside a VALIDATED organization. Strategy and organization stay separate
   * runtime objects; neither can be substituted for the other.
   */
  delegationRefusal(organizationId: string, delegateId: string): UnicomToolHandlerFailure | undefined {
    const organization = this.organizations.get(organizationId);
    if (!organization) {
      return refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
        detail: "delegate dispatch requires a validated organization",
        organizationId,
      });
    }
    const validation = this.validationByOrganization.get(organizationId);
    if (!validation?.valid) {
      return refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
        detail: "organization failed validation",
        organizationId,
        violations: validation && !validation.valid ? [...validation.violations] : [],
      });
    }
    if (!this.assignmentForDelegate(organizationId, delegateId)) {
      return refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
        detail: "delegate has no assignment in the validated organization",
        delegateId,
        organizationId,
      });
    }
    return undefined;
  }

  listStrategies(): readonly Strategy[] {
    return [...this.strategies.values()];
  }

  listOrganizations(): readonly Organization[] {
    return [...this.organizations.values()];
  }
}
