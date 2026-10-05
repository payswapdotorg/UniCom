/**
 * @unicom/agent-kernel — delegate budget and lifecycle enforcement (W2-002).
 *
 * Attenuation is kernel-enforced (defense-in-depth): a delegate's authority
 * scope, budget and expiry are checked on EVERY gated tool execution, not
 * only at spawn time. A model prompt can never widen them.
 */

import type { EphemeralDelegate } from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { ExecutingPrincipal, UnicomDelegateRecord } from "./principal.js";

export interface DelegateActionState {
  readonly refusal?: UnicomToolHandlerFailure;
}

/** Lifecycle gate: expiry and revocation are hard, kernel-side. */
export function isDelegateActionAllowed(
  record: UnicomDelegateRecord,
  now: Date,
): DelegateActionState {
  if (record.status === "revoked") {
    return {
      refusal: refusalFailure(UnicomErrorCode.DELEGATE_REVOKED, "DELEGATE_REVOKED", {
        delegateId: record.delegate.principalId,
      }),
    };
  }
  if (record.delegate.expiresAt !== undefined && record.delegate.expiresAt.length > 0) {
    const expiresAt = Date.parse(record.delegate.expiresAt);
    if (Number.isFinite(expiresAt) && now.getTime() >= expiresAt) {
      if (record.status === "running") record.status = "expired";
      return {
        refusal: refusalFailure(UnicomErrorCode.DELEGATE_EXPIRED, "DELEGATE_EXPIRED", {
          delegateId: record.delegate.principalId,
          expiresAt: record.delegate.expiresAt,
        }),
      };
    }
  }
  if (record.status !== "running") {
    return {
      refusal: refusalFailure(UnicomErrorCode.DELEGATE_REVOKED, "DELEGATE_REVOKED", {
        delegateId: record.delegate.principalId,
        status: record.status,
      }),
    };
  }
  return {};
}

export interface BudgetCharge {
  readonly currency: string;
  readonly minorUnits: string;
}

/** Charges consequential actions and proposed spend against delegate budgets. */
export class UnicomBudgetLedger {
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  chargeAction(
    principal: ExecutingPrincipal,
    toolName: string,
  ): UnicomToolHandlerFailure | undefined {
    if (principal.kind !== "delegate") return undefined;
    const delegate: EphemeralDelegate = principal.delegate.delegate;
    const record = principal.delegate;
    const lifecycle = isDelegateActionAllowed(record, this.now());
    if (lifecycle.refusal) return lifecycle.refusal;
    if (record.actionsTaken >= delegate.budget.maxActions) {
      return refusalFailure(UnicomErrorCode.DELEGATE_BUDGET_EXHAUSTED, "DELEGATE_BUDGET_EXHAUSTED", {
        budgetKind: "maxActions",
        delegateId: delegate.principalId,
        maxActions: delegate.budget.maxActions,
        toolName,
      });
    }
    record.actionsTaken += 1;
    return undefined;
  }

  chargeSpend(
    principal: ExecutingPrincipal,
    charge: BudgetCharge,
  ): UnicomToolHandlerFailure | undefined {
    const budget =
      principal.kind === "delegate"
        ? principal.delegate.delegate.budget
        : principal.mainAgent.delegationBudget;
    const principalId =
      principal.kind === "delegate" ? principal.delegate.delegate.principalId : principal.mainAgent.principalId;
    if (charge.currency !== budget.maxSpend.currency) {
      return refusalFailure(UnicomErrorCode.DELEGATE_BUDGET_EXHAUSTED, "DELEGATE_BUDGET_EXHAUSTED", {
        budgetKind: "maxSpend",
        delegateId: principalId,
        detail: `spend currency ${charge.currency} does not match budget currency ${budget.maxSpend.currency}`,
      });
    }
    const amount = BigInt(charge.minorUnits);
    if (amount < 0n) {
      return refusalFailure(UnicomErrorCode.DELEGATE_BUDGET_EXHAUSTED, "DELEGATE_BUDGET_EXHAUSTED", {
        budgetKind: "maxSpend",
        delegateId: principalId,
        detail: "spend must be non-negative",
      });
    }
    const spent =
      principal.kind === "delegate" ? principal.delegate.spendMinorUnits : this.mainSpendMinorUnits;
    if (spent + amount > BigInt(budget.maxSpend.minorUnits)) {
      return refusalFailure(UnicomErrorCode.DELEGATE_BUDGET_EXHAUSTED, "DELEGATE_BUDGET_EXHAUSTED", {
        budgetKind: "maxSpend",
        delegateId: principalId,
        maxSpendMinorUnits: budget.maxSpend.minorUnits,
        proposedMinorUnits: charge.minorUnits,
        spentMinorUnits: spent.toString(),
      });
    }
    if (principal.kind === "delegate") {
      principal.delegate.spendMinorUnits += amount;
    } else {
      this.mainSpendMinorUnits += amount;
    }
    return undefined;
  }

  private mainSpendMinorUnits = 0n;
}
