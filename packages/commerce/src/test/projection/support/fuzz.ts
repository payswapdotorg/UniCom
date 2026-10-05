/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY FUZZ SUPPORT — NEVER PRODUCTION CODE.                    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic randomized command-sequence driver for the twin
 * verification harness (W1-003 acceptance scenario 1). A seeded PRNG
 * (mulberry32 — no Math.random, reproducible failures) drives envelope
 * generation (payload vocabulary lives in command-gen.ts), including exact
 * duplicate idempotent resubmissions (→ DUPLICATE) and same-key/different-
 * command conflicts (→ hard REJECTED).
 */
import {
  commandEnvelope,
  makeId,
  type AnyRuntimeCommand,
  type CommerceKernel,
  type PrincipalRef,
} from "../../../contract.js";
import { generatePayload } from "./command-gen.js";
import type { FuzzRng } from "./rng.js";

export { FuzzRng } from "./rng.js";
export const FUZZ_ACTORS: readonly PrincipalRef[] = [
  { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
  { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-1") },
  { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") },
];

export interface FuzzEnvelope {
  readonly envelope: AnyRuntimeCommand;
  readonly tag: "fresh" | "duplicate" | "conflict";
}

/** Deterministic envelope minting (unique command ids per fuzz run). */
export class FuzzCommandSource {
  private counter = 0;
  private readonly executed: AnyRuntimeCommand[] = [];
  constructor(private readonly rng: FuzzRng) {}

  /** Record an executed envelope as eligible for duplicate/conflict replay. */
  observeExecuted(envelope: AnyRuntimeCommand): void {
    this.executed.push(envelope);
  }

  /** Generate the next envelope: mostly fresh, sometimes duplicate/conflict. */
  next(kernel: CommerceKernel): FuzzEnvelope {
    if (this.executed.length > 0 && this.rng.chance(0.08)) {
      const original = this.rng.pick(this.executed);
      if (this.rng.chance(0.5)) {
        // Exact replay: same command id + idempotency key → DUPLICATE.
        return { envelope: original, tag: "duplicate" };
      }
      // Same key, DIFFERENT command id → hard idempotency conflict.
      this.counter += 1;
      return {
        envelope: commandEnvelope(
          makeId<"CommandId">(`cmd-fuzz-conflict-${this.counter}`),
          original.idempotencyKey,
          this.rng.pick(FUZZ_ACTORS),
          "2026-10-05T00:00:00Z",
          original.payload,
        ),
        tag: "conflict",
      };
    }
    this.counter += 1;
    const payload = generatePayload(this.rng, kernel, () => this.counter++);
    return {
      envelope: commandEnvelope(
        makeId<"CommandId">(`cmd-fuzz-${this.counter}`),
        makeId<"IdempotencyKey">(`idem-fuzz-${this.counter}`),
        this.rng.pick(FUZZ_ACTORS),
        "2026-10-05T00:00:00Z",
        payload,
      ),
      tag: "fresh",
    };
  }
}
