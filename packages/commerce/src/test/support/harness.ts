/**
 * Deterministic kernel harness — TEST-ONLY fixture (never exported from the
 * public contract; no production-reachable path can use it).
 *
 * It validates the command-execution contract shape: commands enter through
 * typed envelopes with idempotency keys, effects append immutable events with
 * gapless per-subject sequences, replays return the original receipt and
 * produce no second effect.
 */
import {
  commandEnvelope,
  makeId,
  validateEventSequence,
  type AnyCommerceEvent,
  type CommerceCommandEnvelope,
  type CommerceEventId,
  type CommerceSubjectRef,
  type CommandExecution,
  type CommandId,
  type CommandReceipt,
  type CommandRejection,
  type Result,
} from "../../contract.js";

export type Effect = {
  subject: CommerceSubjectRef;
  kind: string;
  payload: unknown;
};

export class DeterministicKernelHarness {
  private readonly events: AnyCommerceEvent[] = [];
  private readonly receiptsByIdempotencyKey = new Map<string, CommandReceipt>();
  private readonly sequences = new Map<string, number>();
  private counter = 0;

  journal(): readonly AnyCommerceEvent[] {
    return this.events;
  }

  journalIsValid(): boolean {
    return validateEventSequence(this.events).ok;
  }

  appendFact(
    subject: CommerceSubjectRef,
    kind: string,
    payload: unknown,
    causationId?: CommandId | CommerceEventId,
  ): AnyCommerceEvent {
    const key = `${subject.subjectType}:${subject.subjectId}`;
    const sequence = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, sequence);
    this.counter += 1;
    const event: AnyCommerceEvent = {
      eventId: makeId<"CommerceEventId">(`evt-${this.counter}`),
      sequence,
      occurredAt: "2026-10-05T00:00:00Z",
      subject,
      kind,
      payload,
      causationId,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Deterministic command execution with idempotency:
   * - same key + same command id → DUPLICATE (original receipt, no new event)
   * - same key + different command id → REJECTED (IDEMPOTENCY_KEY_CONFLICT)
   * - deterministic refusal → REJECTED with the coded reason
   */
  execute<P>(
    envelope: CommerceCommandEnvelope<P>,
    apply: (payload: P) => Result<Effect, CommandRejection>,
  ): CommandExecution {
    const existing = this.receiptsByIdempotencyKey.get(envelope.idempotencyKey);
    if (existing) {
      if (existing.commandId === envelope.commandId) {
        return { status: "DUPLICATE", originalReceipt: existing };
      }
      return {
        status: "REJECTED",
        reason: {
          code: "IDEMPOTENCY_KEY_CONFLICT",
          detail: `idempotency key already bound to command ${existing.commandId}`,
        },
      };
    }
    const effect = apply(envelope.payload);
    if (!effect.ok) return { status: "REJECTED", reason: effect.error };
    const event = this.appendFact(
      effect.value.subject,
      effect.value.kind,
      effect.value.payload,
      envelope.commandId,
    );
    const receipt: CommandReceipt = {
      receiptId: makeId<"CommandReceiptId">(`rcpt-${this.counter}`),
      commandId: envelope.commandId,
      idempotencyKey: envelope.idempotencyKey,
      executedAt: "2026-10-05T00:00:00Z",
      resultingRevision: event.sequence,
      subjectRefs: [`${event.subject.subjectType}:${event.subject.subjectId}`],
    };
    this.receiptsByIdempotencyKey.set(envelope.idempotencyKey, receipt);
    return { status: "EXECUTED", receipt };
  }
}

/** Convenience: build a typed envelope. */
export function envelope<P>(commandId: string, idempotencyKey: string, payload: P): CommerceCommandEnvelope<P> {
  return commandEnvelope(
    makeId<"CommandId">(commandId),
    makeId<"IdempotencyKey">(idempotencyKey),
    { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
    "2026-10-05T00:00:00Z",
    payload,
  );
}
