/**
 * GroupBuy formation kernel seam for the J4/J5 buyer surfaces (W2-013).
 *
 * The commerce kernel's runtime handlers for the W1-012 typed command payloads
 * (`GroupBuyCommandPayload`) land on the W1-012 lane; this lane-local
 * executor drives the CANONICAL formation machines (exported from the
 * `@unicom/commerce` public entrypoint — the same code the kernel runtime
 * will dispatch to) behind the kernel's execution-result shape
 * (`CommandExecution`: EXECUTED / DUPLICATE / REJECTED) with the kernel's
 * idempotency semantics (exact replay returns the ORIGINAL receipt).
 *
 * Actor-identity laws enforced here (mirroring the seam's handler contract):
 * - OPEN by the initiator; ACCEPT_COUNTER by the initiator (the counter's
 *   recorded terms are the evidence — replacement terms are refused);
 * - interest/withdrawal by the participant themself;
 * - DECIDE/FORM/CLOSE by the organizer; EXPIRE by the organizer or SYSTEM.
 *
 * Kernel laws rendered by the surfaces through this seam: interest is never
 * commitment; withdrawal any time before formation (a HELD pool that falls
 * back below the threshold honestly returns to MONITORING); threshold-met
 * pools are HELD awaiting the organizer's EXPLICIT formation; FORMED freezes
 * the final terms and the consenting-only roster.
 */
import {
  closeOrExpireGroupBuy,
  decideGroupBuyProposal,
  formGroupBuy,
  makeId,
  principalRefEquals,
  recordGroupBuyInterest,
  withdrawGroupBuyInterest,
} from "@unicom/commerce";
import type { Result } from "@unicom/commerce";
import type {
  CommandExecution,
  CommandReceipt,
  GroupBuyAggregate,
  GroupBuyCommandPayload,
  GroupBuyInterestError,
  GroupBuyInterestRecord,
  PrincipalRef,
} from "@unicom/commerce";

/** Fixed demo epoch of the J4/J5 fixture script (the W2 demo clock). */
export const GROUPBUY_DEMO_EPOCH = "2026-10-12T09:00:00Z";

export type GroupBuyRunOpts = {
  readonly commandId?: string;
  readonly idempotencyKey?: string;
};

function isDomainError(value: unknown): value is { readonly code: string; readonly state?: string; readonly participants?: number; readonly units?: number } {
  return typeof value === "object" && value !== null && "code" in value;
}

/**
 * The kernel's own opening shape laws (the same checks the W1-012 runtime
 * handler enforces at the command boundary): a proposal opens PENDING at
 * revision 1, both thresholds are positive safe integers, both prices share
 * one currency, and the window close is a non-empty instant string.
 */
function validateOpening(groupBuy: GroupBuyAggregate): string | undefined {
  if (groupBuy.state !== "PENDING") return "proposal must open in PENDING state";
  if (groupBuy.revision !== 1) return "proposal must open at revision 1";
  const threshold = groupBuy.terms.threshold;
  if (!Number.isSafeInteger(threshold.minimumParticipants) || threshold.minimumParticipants < 1) {
    return "minimumParticipants must be a positive safe integer";
  }
  if (!Number.isSafeInteger(threshold.minimumUnits) || threshold.minimumUnits < 1) {
    return "minimumUnits must be a positive safe integer";
  }
  if (groupBuy.terms.proposedUnitPrice.currency !== groupBuy.terms.listUnitPrice.currency) {
    return "proposed and list prices must share one currency";
  }
  if (typeof groupBuy.terms.windowClosesAt !== "string" || groupBuy.terms.windowClosesAt.length === 0) {
    return "windowClosesAt must be an ISO instant";
  }
  return undefined;
}

/**
 * The lane-local GroupBuy formation kernel: aggregates + per-pool interest
 * records, driven only by the seam's typed command payloads.
 */
export class GroupBuyKernel {
  private readonly aggregates = new Map<string, GroupBuyAggregate>();
  private readonly interests = new Map<string, GroupBuyInterestRecord[]>();
  private readonly receipts = new Map<string, CommandReceipt>();
  private minutes = 0;
  private counter = 0;

  now(): string {
    return new Date(Date.parse(GROUPBUY_DEMO_EPOCH) + this.minutes * 60_000).toISOString();
  }

  private tick(): string {
    this.minutes += 1;
    return this.now();
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  groupBuy(groupBuyId: string): GroupBuyAggregate | null {
    return this.aggregates.get(groupBuyId) ?? null;
  }

  /** Kernel truth: the interest pool of one group buy (live + withdrawn). */
  interestsOf(groupBuyId: string): readonly GroupBuyInterestRecord[] {
    return this.interests.get(groupBuyId) ?? [];
  }

  /** Async wrapper mirroring the real kernel's `execute` API. */
  async execute(actor: PrincipalRef, payload: GroupBuyCommandPayload, opts: GroupBuyRunOpts = {}): Promise<CommandExecution> {
    return this.apply(actor, payload, opts);
  }

  /** Synchronous dispatch core (the deterministic seed script shares it). */
  apply(actor: PrincipalRef, payload: GroupBuyCommandPayload, opts: GroupBuyRunOpts = {}): CommandExecution {
    const idempotencyKey = opts.idempotencyKey ?? this.nextId("w2gb-idem");
    const commandId = opts.commandId ?? this.nextId("w2gb-cmd");
    const recorded = this.receipts.get(idempotencyKey);
    if (recorded) return { status: "DUPLICATE", originalReceipt: recorded };

    const outcome = this.dispatch(actor, payload, commandId, idempotencyKey);
    if (outcome.status === "EXECUTED") this.receipts.set(idempotencyKey, outcome.receipt);
    return outcome;
  }

  private dispatch(
    actor: PrincipalRef,
    payload: GroupBuyCommandPayload,
    commandId: string,
    idempotencyKey: string,
  ):
    | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    if (payload.type === "OPEN_GROUP_BUY_PROPOSAL") {
      const invalid = validateOpening(payload.groupBuy);
      if (invalid) return rejected("INVALID_COMMAND", `group buy candidate failed the kernel's shape laws: ${invalid}`);
      if (!principalRefEquals(actor, payload.groupBuy.initiatorRef)) {
        return rejected("POLICY_DENIED", "only the proposal's initiator may open it");
      }
      if (this.aggregates.has(payload.groupBuy.groupBuyId)) {
        return rejected("INVALID_STATE", `group buy ${payload.groupBuy.groupBuyId} is already open — one aggregate per group buy id`);
      }
      this.aggregates.set(payload.groupBuy.groupBuyId, payload.groupBuy);
      this.interests.set(payload.groupBuy.groupBuyId, []);
      return executed(this, commandId, idempotencyKey, payload.groupBuy.groupBuyId, payload.groupBuy.revision);
    }

    const groupBuy = this.aggregates.get(payload.groupBuyId);
    if (!groupBuy) return rejected("INVALID_COMMAND", `unknown group buy ${payload.groupBuyId}`);
    const pool = this.interests.get(payload.groupBuyId) ?? [];

    switch (payload.type) {
      case "RECORD_GROUP_BUY_INTEREST": {
        if (!principalRefEquals(actor, payload.participantRef)) {
          return rejected("POLICY_DENIED", "an interest must be recorded by the participant it names");
        }
        const next = recordGroupBuyInterest(groupBuy, pool, {
          participantRef: payload.participantRef,
          quantity: payload.quantity,
          consentTerms: payload.consentTerms,
          recordedAt: this.tick(),
        });
        return this.settleInterest(groupBuy, next, commandId, idempotencyKey);
      }
      case "WITHDRAW_GROUP_BUY_INTEREST": {
        if (!principalRefEquals(actor, payload.participantRef)) {
          return rejected("POLICY_DENIED", "a withdrawal must be submitted by the participant it names");
        }
        const next = withdrawGroupBuyInterest(groupBuy, pool, payload.participantRef, this.tick());
        return this.settleInterest(groupBuy, next, commandId, idempotencyKey);
      }
      case "DECIDE_GROUP_BUY_PROPOSAL": {
        // ACCEPT/COUNTER/REJECT are the organizer's decisions; ACCEPT_COUNTER is
        // the initiator's response (the counter's recorded terms are the
        // evidence — replacement terms are refused by the domain machine).
        const expectedActor = payload.trigger === "ACCEPT_COUNTER" ? groupBuy.initiatorRef : groupBuy.organizerRef;
        if (!principalRefEquals(actor, expectedActor)) {
          return rejected(
            "POLICY_DENIED",
            payload.trigger === "ACCEPT_COUNTER"
              ? "only the proposal initiator may accept a counter"
              : "only the organizer may decide the proposal",
          );
        }
        const next = decideGroupBuyProposal(groupBuy, payload.trigger, {
          counterTerms: payload.counterTerms,
          rejectionReason: payload.rejectionReason,
        });
        return this.settleAggregate(groupBuy, next, commandId, idempotencyKey);
      }
      case "FORM_GROUP_BUY": {
        if (!principalRefEquals(actor, groupBuy.organizerRef)) {
          return rejected("POLICY_DENIED", "only the organizer may form the deal");
        }
        const next = formGroupBuy(groupBuy, pool, payload.groupPrice, this.tick());
        return this.settleAggregate(groupBuy, next, commandId, idempotencyKey);
      }
      case "CLOSE_GROUP_BUY": {
        if (!principalRefEquals(actor, groupBuy.organizerRef)) {
          return rejected("POLICY_DENIED", "only the organizer may close a group buy");
        }
        const next = closeOrExpireGroupBuy(groupBuy, "CLOSE");
        return this.settleAggregate(groupBuy, next, commandId, idempotencyKey);
      }
      case "EXPIRE_GROUP_BUY": {
        if (actor.kind !== "SYSTEM" && !principalRefEquals(actor, groupBuy.organizerRef)) {
          return rejected("POLICY_DENIED", "expiry is recorded by the organizer or the system");
        }
        const next = closeOrExpireGroupBuy(groupBuy, "EXPIRE");
        return this.settleAggregate(groupBuy, next, commandId, idempotencyKey);
      }
      default:
        return rejected("INVALID_COMMAND", "unhandled groupbuy command payload");
    }
  }

  /** Settle an interest-record/withdrawal outcome into the pool + aggregate. */
  private settleInterest(
    groupBuy: GroupBuyAggregate,
    next: Result<{ readonly groupBuy: GroupBuyAggregate; readonly interest: GroupBuyInterestRecord }, GroupBuyInterestError>,
    commandId: string,
    idempotencyKey: string,
  ):
    | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    if (!next.ok) return this.rejectDomain(next.error);
    this.aggregates.set(groupBuy.groupBuyId, next.value.groupBuy);
    const settled = next.value.interest;
    const prior = this.interests.get(groupBuy.groupBuyId) ?? [];
    const existingIndex = prior.findIndex((record) => principalRefEquals(record.participantRef, settled.participantRef));
    const nextPool =
      existingIndex >= 0
        ? prior.map((record, index) => (index === existingIndex ? settled : record))
        : [...prior, settled];
    this.interests.set(groupBuy.groupBuyId, nextPool);
    return executed(this, commandId, idempotencyKey, groupBuy.groupBuyId, next.value.groupBuy.revision);
  }

  /** Settle an aggregate-only outcome (decision / formation / close / expiry). */
  private settleAggregate(
    groupBuy: GroupBuyAggregate,
    next: Result<GroupBuyAggregate, unknown>,
    commandId: string,
    idempotencyKey: string,
  ):
    | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    if (!next.ok) return this.rejectDomain(next.error);
    this.aggregates.set(groupBuy.groupBuyId, next.value);
    return executed(this, commandId, idempotencyKey, groupBuy.groupBuyId, next.value.revision);
  }

  private rejectDomain(error: unknown):
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    const detail = isDomainError(error)
      ? `${error.code}${error.state !== undefined ? ` (state ${error.state})` : ""}${
          error.participants !== undefined ? ` (participants ${error.participants}, units ${error.units ?? 0})` : ""
        }`
      : "the commerce kernel rejected the command";
    return rejected("INVALID_STATE", detail);
  }
}

function executed(
  kernel: GroupBuyKernel,
  commandId: string,
  idempotencyKey: string,
  groupBuyId: string,
  resultingRevision: number,
): { readonly status: "EXECUTED"; readonly receipt: CommandReceipt } {
  return {
    status: "EXECUTED",
    receipt: {
      receiptId: makeId<"CommandReceiptId">(`w2gb-rcpt-${commandId}`),
      commandId: makeId<"CommandId">(commandId),
      idempotencyKey: makeId<"IdempotencyKey">(idempotencyKey),
      executedAt: kernel.now(),
      resultingRevision,
      subjectRefs: [groupBuyId],
    },
  };
}

function rejected(
  code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED",
  detail: string,
): { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
  return { status: "REJECTED", reason: { code, detail } };
}
