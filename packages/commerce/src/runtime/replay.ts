/**
 * Deterministic state reconstruction from event replay (W1-002 acceptance
 * scenario 2).
 *
 * `reconstructKernel` folds a persistent kernel state (journal + receipt
 * ledger + mint cursor) into a NEW kernel with IDENTICAL authoritative
 * state, identical idempotency behavior and identical subsequent id
 * minting. Journal discipline (unique ids, gapless per-subject sequences)
 * is validated during ingestion — corruption is detected and thrown, never
 * silently absorbed.
 */
import { CommerceKernel, type KernelPersistentState } from "./kernel.js";
import type { CommerceKernelOptions } from "./options.js";
import type { AnyCommerceEvent } from "../domain/events.js";

export function reconstructKernel(persistent: KernelPersistentState, options?: CommerceKernelOptions): CommerceKernel {
  const kernel = new CommerceKernel(options);
  for (const event of persistent.events) {
    kernel.ingestHistoricalEvent(event);
  }
  for (const receipt of persistent.receipts) {
    kernel.ingestHistoricalReceipt(receipt);
  }
  kernel.restoreMintCursor(persistent.mintCursor);
  if (!kernel.journalIsValid()) {
    throw new TypeError("reconstructed journal violates the event sequence law");
  }
  return kernel;
}

/**
 * Reconstruct authoritative state from the event journal ALONE (no receipt
 * ledger): the fold is pure, so truth never depends on dispatch metadata.
 * The returned kernel starts with an empty idempotency ledger — use
 * `reconstructKernel` for full crash recovery including exactly-once.
 */
export function reconstructAuthoritativeState(
  events: readonly AnyCommerceEvent[],
  options?: CommerceKernelOptions,
): CommerceKernel {
  const kernel = new CommerceKernel(options);
  for (const event of events) {
    kernel.ingestHistoricalEvent(event);
  }
  if (!kernel.journalIsValid()) {
    throw new TypeError("replayed journal violates the event sequence law");
  }
  return kernel;
}
