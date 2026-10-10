/**
 * TradeCycle kernel execution seam for the J9 surface (W2-013).
 *
 * The commerce kernel's runtime handlers for the W1-012 typed command payloads
 * (`TradeCycleCommandPayload`) land on the W1-012 lane; this lane-local
 * executor drives the CANONICAL domain machines (exported from the
 * `@unicom/commerce` public entrypoint — the same code the kernel runtime
 * will dispatch to) behind the kernel's own execution-result shape
 * (`CommandExecution`: EXECUTED / DUPLICATE / REJECTED), with the kernel's
 * idempotency semantics (exact replay of an idempotency key returns the
 * ORIGINAL receipt with no new effect).
 *
 * Actor-identity laws enforced here (mirroring the seam's handler contract):
 * - OPEN/EXECUTE/EXECUTE_LEG/ROLLBACK only by the cycle's initiating principal;
 * - AUTHORIZE/REFUSE/WITHDRAW submitted by the payload's own principal — the
 *   domain machine then attributes the action (clear if the principal IS the
 *   leg's giver; otherwise the leg is held UNKNOWN with the ambiguity
 *   recorded, never a failure);
 * - LAPSE is a window observation any principal may record.
 *
 * Deterministic by construction: no network, no clock reads (a stepped demo
 * clock), no randomness. Resetting the module constructs a fresh kernel.
 */
import {
  applyTradeCycleLegAction,
  executeTradeCycle,
  executeTradeCycleLeg,
  lapseTradeCycleLeg,
  makeId,
  principalRefEquals,
  rollbackTradeCycleLeg,
  validateTradeCycleLegs,
} from "@unicom/commerce";
import type {
  CommandExecution,
  CommandReceipt,
  PrincipalRef,
  TradeCycleCommandPayload,
  TradeCycleExecution,
} from "@unicom/commerce";

/** Fixed demo epoch of the J9 fixture script (matches the W2 demo clock). */
export const TRADECYCLE_DEMO_EPOCH = "2026-10-12T09:00:00Z";

export type TradecycleRunOpts = {
  readonly commandId?: string;
  readonly idempotencyKey?: string;
};

/** Readable text for every TradeCycleExecutionError code (honest rejections). */
export function describeTradecycleRejection(payload: TradeCycleCommandPayload): string {
  switch (payload.type) {
    case "OPEN_TRADE_CYCLE":
      return "opening a trade cycle";
    case "AUTHORIZE_TRADE_CYCLE_LEG":
      return `authorizing leg ${payload.legIndex}`;
    case "REFUSE_TRADE_CYCLE_LEG":
      return `refusing leg ${payload.legIndex}`;
    case "WITHDRAW_TRADE_CYCLE_LEG":
      return `withdrawing consent on leg ${payload.legIndex}`;
    case "LAPSE_TRADE_CYCLE_LEG":
      return `recording the lapsed window on leg ${payload.legIndex}`;
    case "EXECUTE_TRADE_CYCLE":
      return "executing the whole cycle";
    case "EXECUTE_TRADE_CYCLE_LEG":
      return `executing leg ${payload.legIndex}`;
    case "ROLLBACK_TRADE_CYCLE_LEG":
      return `rolling back leg ${payload.legIndex}`;
  }
}

function isDomainError(
  value: unknown,
): value is { readonly code: string; readonly legIndex?: number; readonly state?: string; readonly consentState?: string } {
  return typeof value === "object" && value !== null && "code" in value;
}

/**
 * The lane-local TradeCycle kernel: registers validated cycles and applies
 * the seam's typed command payloads through the canonical domain machines.
 */
export class TradecycleKernel {
  private readonly cycles = new Map<string, TradeCycleExecution>();
  private readonly receipts = new Map<string, CommandReceipt>();
  private minutes = 0;
  private counter = 0;

  /** Deterministic clock of the demo script (never wall time). */
  now(): string {
    return new Date(Date.parse(TRADECYCLE_DEMO_EPOCH) + this.minutes * 60_000).toISOString();
  }

  private tick(): string {
    this.minutes += 1;
    return this.now();
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  cycle(cycleId: string): TradeCycleExecution | null {
    return this.cycles.get(cycleId) ?? null;
  }

  /** Kernel truth: does any leg of this cycle carry a recorded ambiguity? */
  receipt(idempotencyKey: string): CommandReceipt | null {
    return this.receipts.get(idempotencyKey) ?? null;
  }

  /**
   * Hand one typed command envelope to the domain machines. Async to mirror
   * the real kernel's `execute` API (the UI awaits the CommandExecution).
   */
  async execute(
    actor: PrincipalRef,
    payload: TradeCycleCommandPayload,
    opts: TradecycleRunOpts = {},
  ): Promise<CommandExecution> {
    return this.apply(actor, payload, opts);
  }

  /**
   * Synchronous dispatch core. The deterministic seed script uses the same
   * core (one code path, journaled identically); the async `execute` wraps it.
   */
  apply(actor: PrincipalRef, payload: TradeCycleCommandPayload, opts: TradecycleRunOpts = {}): CommandExecution {
    const idempotencyKey = opts.idempotencyKey ?? this.nextId("w2tc-idem");
    const commandId = opts.commandId ?? this.nextId("w2tc-cmd");
    const recorded = this.receipts.get(idempotencyKey);
    if (recorded) return { status: "DUPLICATE", originalReceipt: recorded };

    const outcome = this.dispatch(actor, payload, commandId, idempotencyKey);
    if (outcome.status === "EXECUTED") this.receipts.set(idempotencyKey, outcome.receipt);
    return outcome;
  }

  private dispatch(
    actor: PrincipalRef,
    payload: TradeCycleCommandPayload,
    commandId: string,
    idempotencyKey: string,
  ):
    | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    if (payload.type === "OPEN_TRADE_CYCLE") {
      if (!principalRefEquals(actor, payload.cycle.initiatingRef)) {
        return rejected("POLICY_DENIED", "only the cycle's initiating principal may open it");
      }
      if (this.cycles.has(payload.cycle.tradeCycleId)) {
        return rejected("INVALID_STATE", `trade cycle ${payload.cycle.tradeCycleId} is already open — one aggregate per cycle id`);
      }
      const validation = validateTradeCycleLegs(
        payload.cycle.legs,
        payload.cycle.bounds,
        payload.cycle.executionMode,
        payload.cycle.recoursePlanRef,
      );
      if (!validation.ok) {
        return rejected("INVALID_COMMAND", `cycle candidate failed the kernel's shape laws: ${validation.error.code}`);
      }
      this.cycles.set(payload.cycle.tradeCycleId, payload.cycle);
      return executed(this, commandId, idempotencyKey, payload.cycle.tradeCycleId, payload.cycle.revision);
    }

    const cycle = this.cycles.get(payload.cycleId);
    if (!cycle) return rejected("INVALID_COMMAND", `unknown trade cycle ${payload.cycleId}`);

    switch (payload.type) {
      case "AUTHORIZE_TRADE_CYCLE_LEG": {
        if (!principalRefEquals(actor, payload.authorizingRef)) {
          return rejected("POLICY_DENIED", "an authorization must be submitted by the principal it names");
        }
        const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
          kind: "AUTHORIZE",
          actor: payload.authorizingRef,
          authorizationRef: payload.authorizationRef,
          recordedAt: this.tick(),
        });
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "REFUSE_TRADE_CYCLE_LEG": {
        if (!principalRefEquals(actor, payload.refusingRef)) {
          return rejected("POLICY_DENIED", "a refusal must be submitted by the principal it names");
        }
        const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
          kind: "REFUSE",
          actor: payload.refusingRef,
          recordedAt: this.tick(),
        });
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "WITHDRAW_TRADE_CYCLE_LEG": {
        if (!principalRefEquals(actor, payload.withdrawingRef)) {
          return rejected("POLICY_DENIED", "a withdrawal must be submitted by the principal it names");
        }
        const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
          kind: "WITHDRAW",
          actor: payload.withdrawingRef,
          recordedAt: this.tick(),
        });
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "LAPSE_TRADE_CYCLE_LEG": {
        const next = lapseTradeCycleLeg(cycle, payload.legIndex);
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "EXECUTE_TRADE_CYCLE": {
        if (!principalRefEquals(actor, cycle.initiatingRef)) {
          return rejected("POLICY_DENIED", "only the cycle's initiating principal may execute it");
        }
        const next = executeTradeCycle(cycle);
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "EXECUTE_TRADE_CYCLE_LEG": {
        if (!principalRefEquals(actor, cycle.initiatingRef)) {
          return rejected("POLICY_DENIED", "only the cycle's initiating principal may execute a leg");
        }
        const next = executeTradeCycleLeg(cycle, payload.legIndex);
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      case "ROLLBACK_TRADE_CYCLE_LEG": {
        if (!principalRefEquals(actor, cycle.initiatingRef)) {
          return rejected("POLICY_DENIED", "only the cycle's initiating principal may roll a leg back");
        }
        const next = rollbackTradeCycleLeg(cycle, payload.legIndex);
        return this.settle(cycle, next, commandId, idempotencyKey);
      }
      default:
        return rejected("INVALID_COMMAND", "unhandled tradecycle command payload");
    }
  }

  private settle(
    cycle: TradeCycleExecution,
    next: { readonly ok: true; readonly value: TradeCycleExecution } | { readonly ok: false; readonly error: unknown },
    commandId: string,
    idempotencyKey: string,
  ):
    | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
    | { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
    if (!next.ok) {
      const detail = isDomainError(next.error)
        ? `${next.error.code}${next.error.legIndex !== undefined ? ` on leg ${next.error.legIndex}` : ""}${
            next.error.state !== undefined ? ` (cycle is ${next.error.state})` : ""
          }${next.error.consentState !== undefined ? ` (leg is ${next.error.consentState})` : ""}`
        : "the commerce kernel rejected the command";
      return rejected("INVALID_STATE", detail);
    }
    this.cycles.set(cycle.tradeCycleId, next.value);
    return executed(this, commandId, idempotencyKey, cycle.tradeCycleId, next.value.revision);
  }
}

function executed(
  kernel: TradecycleKernel,
  commandId: string,
  idempotencyKey: string,
  cycleId: string,
  resultingRevision: number,
): { readonly status: "EXECUTED"; readonly receipt: CommandReceipt } {
  return {
    status: "EXECUTED",
    receipt: {
      receiptId: makeId<"CommandReceiptId">(`w2tc-rcpt-${commandId}`),
      commandId: makeId<"CommandId">(commandId),
      idempotencyKey: makeId<"IdempotencyKey">(idempotencyKey),
      executedAt: kernel.now(),
      resultingRevision,
      subjectRefs: [cycleId],
    },
  };
}

function rejected(
  code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED",
  detail: string,
): { readonly status: "REJECTED"; readonly reason: { readonly code: "INVALID_COMMAND" | "INVALID_STATE" | "POLICY_DENIED"; readonly detail: string } } {
  return { status: "REJECTED", reason: { code, detail } };
}
