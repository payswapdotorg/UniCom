/**
 * @unicom/agent-kernel — opaque commerce seam mediator (W2-002).
 *
 * The agent plane PROPOSES commerce actions as typed command intents through
 * the opaque command/result seam from `@unicom/agent` and observes opaque
 * results. It never owns canonical commerce state (Worker 1's lane). The
 * seam stays idempotent (duplicate submissions return the prior result
 * without re-execution) and consequential submissions require a proof pin
 * produced BEFORE execution. GroupBuy and TradeCycle commitments are
 * EXPLICIT: the mediator only forwards commands whose explicit commitment /
 * per-leg authorization was recorded through the principal-side API — never
 * through model input.
 */

import {
  buildConsequentialSubmission,
  commerceCommandPayloadRef,
  commerceCommandType,
  commerceEntityRef,
  determineRequiredProofLevel,
  enrollParticipant,
  findPriorSubmission,
  idempotencyKey,
  pinProofSelection,
  submitWithIdempotency,
  type CommerceCommandPort,
  type CommerceCommandResult,
  type CommerceCommandStatus,
  type CommerceCommandSubmission,
  type CommerceCommandType,
  type DecisionImpact,
  type GroupBuy,
  type GroupBuyCommitment,
  type ProofLevel,
  type ProofPinnedAction,
  type ProofSelection,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { ExecutingPrincipal } from "./principal.js";
import type { UnicomBudgetLedger } from "./delegate-budget.js";

export interface CommerceCommandRequest {
  readonly commandType: string;
  readonly payloadRef: string;
  readonly targetRef?: string;
  readonly idempotencyKey?: string;
  /** Declared proof selection for this consequential action. */
  readonly proofLevel?: ProofLevel;
  readonly impact: DecisionImpact;
  readonly counterpartyExposure?: boolean;
  readonly settlementFinality?: boolean;
  /** GroupBuy explicitness: reference to a principal-recorded commitment. */
  readonly groupBuyCommitmentId?: string;
  /** TradeCycle explicitness: reference to a principal-authorized leg. */
  readonly tradeCycleLegAuthorizationId?: string;
  /** Proposed spend charged against the executing delegate's budget. */
  readonly spend?: { currency: string; minorUnits: string };
}

export interface SeamedCommandResult {
  readonly commandId: string;
  readonly status: CommerceCommandStatus;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly resultingStateRef?: string;
  readonly duplicate: boolean;
}

export interface UnicomCommerceMediatorOptions {
  /** Worker 1's runtime port. Absent → the seam fails closed (no mocks). */
  readonly port?: CommerceCommandPort;
  readonly policyVersion?: string;
  readonly now?: () => string;
  readonly budgetLedger?: UnicomBudgetLedger;
}

/** Explicit principal-side state (never model-writable). */
interface ExplicitGroupBuyCommitment {
  readonly commitment: GroupBuyCommitment;
  readonly groupBuy: GroupBuy;
}

interface ExplicitLegAuthorization {
  readonly legId: string;
  readonly cycleId: string;
  readonly participantRef: string;
}

export class UnicomCommerceMediator {
  private readonly port?: CommerceCommandPort;
  private readonly policyVersion: string;
  private readonly now: () => string;
  private readonly budgetLedger?: UnicomBudgetLedger;
  private readonly priorResults: CommerceCommandResult[] = [];
  private readonly groupBuyCommitments = new Map<string, ExplicitGroupBuyCommitment>();
  private readonly legAuthorizations = new Map<string, ExplicitLegAuthorization>();

  constructor(options: UnicomCommerceMediatorOptions) {
    this.port = options.port;
    this.policyVersion = options.policyVersion ?? "unicom-kernel-v1";
    this.now = options.now ?? (() => new Date().toISOString());
    this.budgetLedger = options.budgetLedger;
  }

  get hasPort(): boolean {
    return this.port !== undefined;
  }

  // -------------------------------------------------------------------------
  // Principal-side explicit state (GroupBuy / TradeCycle)
  // -------------------------------------------------------------------------

  /** Principal records a buyer commitment — the ONLY path to enrollment. */
  recordGroupBuyCommitment(id: string, groupBuy: GroupBuy, commitment: GroupBuyCommitment): GroupBuy {
    const updated = enrollParticipant(groupBuy, commitment);
    this.groupBuyCommitments.set(id, { commitment, groupBuy: updated });
    return updated;
  }

  findGroupBuyCommitment(id: string): GroupBuyCommitment | undefined {
    return this.groupBuyCommitments.get(id)?.commitment;
  }

  /** Principal authorizes one trade-cycle leg — per-leg, never blanket. */
  recordTradeCycleLegAuthorization(
    id: string,
    input: { legId: string; cycleId: string; participantRef: string },
  ): void {
    this.legAuthorizations.set(id, { ...input });
  }

  findLegAuthorization(id: string): ExplicitLegAuthorization | undefined {
    return this.legAuthorizations.get(id);
  }

  listPriorResults(): readonly CommerceCommandResult[] {
    return [...this.priorResults];
  }

  // -------------------------------------------------------------------------
  // Model-facing proposal path (the seam)
  // -------------------------------------------------------------------------

  /** Typed explicitness gates for group-buy / trade-cycle commands. */
  private explicitnessRefusal(request: CommerceCommandRequest): UnicomToolHandlerFailure | undefined {
    if (request.commandType.startsWith("groupbuy.")) {
      if (request.commandType === "groupbuy.enroll" && !request.groupBuyCommitmentId) {
        return refusalFailure(
          UnicomErrorCode.GROUPBUY_COMMITMENT_REQUIRED,
          "GROUPBUY_COMMITMENT_REQUIRED",
          { commandType: request.commandType, detail: "no silent enrollment" },
        );
      }
      if (request.groupBuyCommitmentId && !this.groupBuyCommitments.has(request.groupBuyCommitmentId)) {
        return refusalFailure(
          UnicomErrorCode.GROUPBUY_COMMITMENT_REQUIRED,
          "GROUPBUY_COMMITMENT_REQUIRED",
          {
            commandType: request.commandType,
            detail: "unknown commitment reference",
            groupBuyCommitmentId: request.groupBuyCommitmentId,
          },
        );
      }
    }
    if (request.commandType.startsWith("tradecycle.")) {
      if (!request.tradeCycleLegAuthorizationId) {
        return refusalFailure(
          UnicomErrorCode.TRADECYCLE_AUTHORIZATION_REQUIRED,
          "TRADECYCLE_AUTHORIZATION_REQUIRED",
          { commandType: request.commandType, detail: "each leg requires its own authorization" },
        );
      }
      if (!this.legAuthorizations.has(request.tradeCycleLegAuthorizationId)) {
        return refusalFailure(
          UnicomErrorCode.TRADECYCLE_AUTHORIZATION_REQUIRED,
          "TRADECYCLE_AUTHORIZATION_REQUIRED",
          {
            commandType: request.commandType,
            detail: "unknown leg authorization reference",
            tradeCycleLegAuthorizationId: request.tradeCycleLegAuthorizationId,
          },
        );
      }
    }
    return undefined;
  }

  /**
   * Submit a proposal through the opaque seam. Deterministic order:
   * authority (proposableCommandTypes) → explicitness → proof pin →
   * budget charge → idempotent submission.
   */
  propose(
    principal: ExecutingPrincipal,
    request: CommerceCommandRequest,
  ): { failure?: UnicomToolHandlerFailure; result?: SeamedCommandResult } {
    if (!this.port) {
      return {
        failure: refusalFailure(UnicomErrorCode.COMMERCE_SEAM_UNAVAILABLE, "COMMERCE_SEAM_UNAVAILABLE", {
          detail: "no commerce command port is configured; the agent plane never owns commerce state",
        }),
      };
    }
    // Authority gate for EVERY executing principal — the Main Agent's own
    // proposable command types bound it exactly as a delegate's bound the
    // delegate. The kernel checks this before anything else crosses the seam.
    const proposableCommandTypes =
      principal.kind === "delegate"
        ? principal.delegate.delegate.authority.proposableCommandTypes
        : principal.mainAgent.authority.proposableCommandTypes;
    if (!proposableCommandTypes.includes(commerceCommandType(request.commandType) as CommerceCommandType)) {
      return {
        failure: refusalFailure(UnicomErrorCode.DELEGATE_SCOPE_REFUSED, "DELEGATE_SCOPE_REFUSED", {
          commandType: request.commandType,
          executingPrincipalId:
            principal.kind === "delegate"
              ? principal.delegate.delegate.principalId
              : principal.mainAgent.principalId,
          proposableCommandTypes,
        }),
      };
    }
    const explicitness = this.explicitnessRefusal(request);
    if (explicitness) return { failure: explicitness };

    const requiredLevel = determineRequiredProofLevel({
      impact: request.impact,
      ...(request.counterpartyExposure === undefined ? {} : { counterpartyExposure: request.counterpartyExposure }),
      ...(request.settlementFinality === undefined ? {} : { settlementFinality: request.settlementFinality }),
    });
    if (request.proofLevel === undefined) {
      return {
        failure: refusalFailure(UnicomErrorCode.PROOF_LEVEL_REQUIRED, "PROOF_LEVEL_REQUIRED", {
          detail: "proof level must be selected before consequential execution",
          requiredMinimumLevel: requiredLevel,
        }),
      };
    }
    const commandId = `unicom:command:${request.idempotencyKey ?? `${request.commandType}:${request.payloadRef}`}`;
    let proofPin: ProofPinnedAction;
    const selection: ProofSelection = {
      selectedLevel: request.proofLevel,
      selectedAt: this.now(),
      requirement: { minimumLevel: requiredLevel, rationale: "kernel-enforced pre-execution pin" },
      selectorRef: { principalId: principalIdOf(principal), kind: "agent" },
    };
    try {
      proofPin = pinProofSelection(commandId, selection);
    } catch (error) {
      return {
        failure: refusalFailure(UnicomErrorCode.PROOF_LEVEL_REQUIRED, "PROOF_LEVEL_REQUIRED", {
          detail: error instanceof Error ? error.message : "invalid proof selection",
          requiredMinimumLevel: requiredLevel,
          selectedLevel: request.proofLevel,
        }),
      };
    }

    if (request.spend && this.budgetLedger) {
      const charge = this.budgetLedger.chargeSpend(principal, request.spend);
      if (charge) return { failure: charge };
    }

    const submission: CommerceCommandSubmission = buildConsequentialSubmission({
      intent: {
        commandId,
        commandType: commerceCommandType(request.commandType),
        payloadRef: commerceCommandPayloadRef(request.payloadRef),
        ...(request.targetRef ? { targetRef: commerceEntityRef(request.targetRef) } : {}),
        proposedBy: { principalId: principalIdOf(principal), kind: "agent" },
        onBehalfOf: { principalId: "main-agent:unicom", kind: "agent" },
        idempotencyKey: idempotencyKey(request.idempotencyKey ?? commandId),
      },
      authorization: {
        decision: "AUTHORIZED",
        decidedBy: { principalId: principalIdOf(principal), kind: "agent" },
        policyVersion: this.policyVersion,
        decidedAt: this.now(),
        reason: "unicom kernel gate passed (attenuated authority within scope)",
      },
      proofPin,
      submittedAt: this.now(),
    });

    const prior = findPriorSubmission(submission.intent.idempotencyKey, this.priorResults);
    const result = submitWithIdempotency(this.port, submission, this.priorResults);
    if (prior === undefined) this.priorResults.push(result);
    return {
      result: {
        commandId: result.commandId,
        status: result.status,
        idempotencyKey: result.idempotencyKey,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.resultingStateRef ? { resultingStateRef: result.resultingStateRef } : {}),
        duplicate: prior !== undefined,
      },
    };
  }
}

function principalIdOf(principal: ExecutingPrincipal): string {
  return principal.kind === "main-agent"
    ? principal.mainAgent.principalId
    : principal.delegate.delegate.principalId;
}
