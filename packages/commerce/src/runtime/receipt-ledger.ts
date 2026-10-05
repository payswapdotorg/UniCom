/**
 * Idempotency receipt ledger (W1-002 runtime).
 *
 * Exactly-once law: an EXECUTED command binds its idempotency key to its
 * receipt permanently. Replaying the same envelope (same key + same command
 * id) returns the original receipt with no second effect; a different
 * command under a used key is a hard conflict. Rejected commands bind
 * nothing (a corrected retry with the same key stays possible until an
 * execution succeeds).
 */
import { makeId, type CommandId, type IdempotencyKey } from "../domain/ids.js";
import type { CommandReceipt } from "../domain/commands.js";

export class ReceiptLedger {
  private readonly byKey = new Map<IdempotencyKey, CommandReceipt>();
  private readonly byCommand = new Map<CommandId, CommandReceipt>();
  private readonly receiptIds = new Set<string>();
  private readonly ordered: CommandReceipt[] = [];

  /** Receipt bound to a key, if any (replay/conflict detection). */
  findByKey(idempotencyKey: IdempotencyKey): CommandReceipt | undefined {
    return this.byKey.get(idempotencyKey);
  }

  /** Bind an executed command's receipt (append-only, never overwritten). */
  record(receipt: CommandReceipt): void {
    if (this.receiptIds.has(receipt.receiptId)) {
      throw new TypeError(`receipt ledger: duplicate receipt id ${receipt.receiptId}`);
    }
    const keyOwner = this.byKey.get(receipt.idempotencyKey);
    if (keyOwner) {
      throw new TypeError(
        `receipt ledger: idempotency key ${receipt.idempotencyKey} already bound to ${keyOwner.commandId}`,
      );
    }
    const commandOwner = this.byCommand.get(receipt.commandId);
    if (commandOwner) {
      throw new TypeError(`receipt ledger: command ${receipt.commandId} already recorded`);
    }
    this.byKey.set(receipt.idempotencyKey, receipt);
    this.byCommand.set(receipt.commandId, receipt);
    this.receiptIds.add(receipt.receiptId);
    this.ordered.push(receipt);
  }

  /** Historical receipts in execution order (persistence/reconstruction). */
  receipts(): readonly CommandReceipt[] {
    return this.ordered;
  }

  /** Deterministic receipt id minting (`rcpt-<n>`). */
  mintReceiptId(): CommandReceipt["receiptId"] {
    let suffix = this.ordered.length + 1;
    while (this.receiptIds.has(`rcpt-${suffix}`)) {
      suffix += 1;
    }
    return makeId<"CommandReceiptId">(`rcpt-${suffix}`);
  }
}
