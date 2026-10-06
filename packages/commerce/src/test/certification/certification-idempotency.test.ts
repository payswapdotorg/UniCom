/**
 * W1-006 acceptance scenario 5 — idempotency certified across the FULL
 * command surface.
 *
 * PROPERTY: every command is idempotent under delivery duplication.
 * Certified SYSTEMATICALLY (not sampled): after every EXECUTED command
 * the exact envelope is replayed (→ DUPLICATE with the ORIGINAL receipt,
 * zero new events, zero new receipts) and a different command id under
 * the same idempotency key is submitted (→ deterministic
 * IDEMPOTENCY_KEY_CONFLICT, zero new events). Concurrent duplicate
 * submissions of one envelope resolve to exactly one execution. Coverage
 * of the money-critical command types is asserted (anti-vacuity).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  commandEnvelope,
  makeId,
  type AnyRuntimeCommand,
  type CommandExecution,
  type CommandReceipt,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { steppingTimeSource } from "../runtime/support/clock.js";
import { FuzzCommandSource, FuzzRng } from "../projection/support/fuzz.js";
import { assertMoneyConservation } from "./support/ledger.js";
import { runFuzzSession, settlementHookFor, setupFuzzStores, type FuzzSurface } from "./support/fuzz-session.js";

interface IdempotencyCounts {
  replays: number;
  conflicts: number;
  byType: Map<string, number>;
}

/** The money-critical command types that MUST be replay-certified. */
const MONEY_CRITICAL: readonly string[] = [
  "COMPLETE_CHECKOUT", "CREATE_PAYMENT_INTENT", "CAPTURE_PAYMENT", "CAPTURE_PAYMENT_PARTIAL",
  "VOID_PAYMENT", "REFUND_PAYMENT", "ISSUE_GOODWILL_REFUND", "OPEN_DISPUTE", "SUBMIT_DISPUTE_EVIDENCE",
  "RESOLVE_DISPUTE", "RECORD_CHARGEBACK", "OBSERVE_SETTLEMENT", "CLOSE_SETTLEMENT_WINDOW",
  "OPEN_STORE_CASH_SESSION", "RECORD_TILL_OPERATION", "HANDOVER_STORE_CASH_SESSION", "CLOSE_STORE_CASH_SESSION",
  "REGISTER_AUTONOMOUS_STORE", "HANDOVER_STORE_AUTHORITY", "RECORD_HUMAN_OVERRIDE", "ADVANCE_STORE_ESCALATION",
  "BEGIN_STORE_CYCLE", "ADVANCE_STORE_CYCLE", "AUTONOMOUS_OPEN_TILL", "AUTONOMOUS_CLOSE_TILL",
  "AUTONOMOUS_RESTOCK", "AUTONOMOUS_RECONCILE_COUNT", "SET_SKU_PRICE", "ADJUST_SKU_PRICE",
  "REQUEST_RETURN", "OPEN_RETURN", "ADVANCE_RETURN", "OPEN_FULFILLMENT", "ADVANCE_FULFILLMENT_ORDER",
  "RECONCILE_COUNT_OBSERVATION", "RECONCILE_POS_SYNC", "PLACE_ORDER", "RESERVE_INVENTORY", "COMMIT_RESERVATION",
];

async function idempotencySession(seed: number, steps: number, surface: FuzzSurface): Promise<IdempotencyCounts> {
  const double = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary: double, timeSource: steppingTimeSource() });
  if (surface === "autonomous-store") await setupFuzzStores(kernel);
  const twin = CommerceTwin.empty();
  twin.applyAll(kernel.events());
  const rng = new FuzzRng(seed);
  const harnessRng = new FuzzRng(seed ^ 0x5eed);
  const source = new FuzzCommandSource(rng, { surface, onSettlementObservation: settlementHookFor(double) });
  let folded = kernel.events().length;
  const counts: IdempotencyCounts = { replays: 0, conflicts: 0, byType: new Map() };

  for (let step = 0; step < steps; step += 1) {
    if (harnessRng.chance(0.06)) double.makeNextOutcomeAmbiguous(`IDEM_AMBIGUOUS_${seed}_${step}`);
    const { envelope, tag } = source.next(kernel);
    const outcome: CommandExecution = await kernel.execute(envelope);
    if (outcome.status === "EXECUTED") {
      source.observeExecuted(envelope);
      if (tag === "fresh") {
        // Systematic certification: exact replay → DUPLICATE (original
        // receipt, zero new events); same key + different command id →
        // hard conflict, zero new events.
        const journalBefore = kernel.events().length;
        const receiptsBefore = kernel.receipts().length;
        const replay: CommandExecution = await kernel.execute(envelope);
        if (replay.status !== "DUPLICATE") {
          throw new TypeError(`replay of ${envelope.payload.type} must DUPLICATE, got ${replay.status}`);
        }
        const expectedReceipt: CommandReceipt | undefined = outcome.receipt;
        if (JSON.stringify(replay.originalReceipt) !== JSON.stringify(expectedReceipt)) {
          throw new TypeError(`duplicate replay must return the ORIGINAL receipt for ${envelope.payload.type}`);
        }
        if (kernel.events().length !== journalBefore || kernel.receipts().length !== receiptsBefore) {
          throw new TypeError(`duplicate replay of ${envelope.payload.type} appended effects`);
        }
        const conflictEnvelope = commandEnvelope(
          makeId<"CommandId">(`cmd-idem-conflict-${seed}-${step}`),
          envelope.idempotencyKey,
          envelope.actor,
          "2026-10-05T00:00:00Z",
          envelope.payload,
        ) as AnyRuntimeCommand;
        const conflict: CommandExecution = await kernel.execute(conflictEnvelope);
        if (conflict.status !== "REJECTED") {
          throw new TypeError(`same key + different command id must REJECTED (conflict), got ${conflict.status}`);
        }
        if (kernel.events().length !== journalBefore || kernel.receipts().length !== receiptsBefore) {
          throw new TypeError(`conflict submission of ${envelope.payload.type} appended effects`);
        }
        counts.replays += 1;
        counts.conflicts += 1;
        counts.byType.set(envelope.payload.type, (counts.byType.get(envelope.payload.type) ?? 0) + 1);
      }
    } else if (tag === "duplicate" && outcome.status !== "DUPLICATE") {
      throw new TypeError(`fuzz duplicate must DUPLICATE, got ${outcome.status}`);
    } else if (tag === "conflict" && outcome.status !== "REJECTED") {
      throw new TypeError(`fuzz conflict must REJECTED, got ${outcome.status}`);
    }
    const events = kernel.events();
    twin.applyAll(events.slice(folded));
    folded = events.length;
    assertMoneyConservation(events, `idempotency seed ${seed} step ${step}`);
    if (step % 25 === 24 || step === steps - 1) {
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    }
  }
  if (!kernel.journalIsValid()) throw new TypeError("journal sequence law violated");
  return counts;
}

describe("W1-006 acceptance scenario 5 — idempotency across the full command surface", () => {
  it(
    "every executed command replays to DUPLICATE (original receipt, zero effects) and conflicts hard on key reuse — systematically, every step",
    async () => {
      const aggregated: IdempotencyCounts = { replays: 0, conflicts: 0, byType: new Map() };
      for (const seed of [11, 23, 37, 5150]) {
        const counts = await idempotencySession(seed, 320, "autonomous-store");
        aggregated.replays += counts.replays;
        aggregated.conflicts += counts.conflicts;
        for (const [type, count] of counts.byType) aggregated.byType.set(type, (aggregated.byType.get(type) ?? 0) + count);
      }
      expect(aggregated.replays).toBeGreaterThan(400);
      expect(aggregated.conflicts).toBe(aggregated.replays);
      // REGISTER_AUTONOMOUS_STORE rarely executes under the fuzz vocabulary
      // (re-registration is a deterministic rejection; fresh-store draws are
      // rare) — certify it directly on a fresh store.
      {
        const double = new ScriptedPaymentDouble();
        const kernel = new CommerceKernel({ paymentBoundary: double, timeSource: steppingTimeSource() });
        const register = commandEnvelope(
          makeId<"CommandId">("cmd-idem-register"),
          makeId<"IdempotencyKey">("idem-idem-register"),
          { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
          "2026-10-05T00:00:00Z",
          {
            type: "REGISTER_AUTONOMOUS_STORE",
            autonomousStoreId: makeId<"AutonomousStoreId">("store-idem-cert"),
            ownerRef: { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
            displayName: "idem cert store",
          },
        ) as AnyRuntimeCommand;
        const executed: CommandExecution = await kernel.execute(register);
        expect(executed.status).toBe("EXECUTED");
        const journalBefore = kernel.events().length;
        const receiptsBefore = kernel.receipts().length;
        const replay: CommandExecution = await kernel.execute(register);
        expect(replay.status).toBe("DUPLICATE");
        expect(JSON.stringify(replay.originalReceipt)).toBe(JSON.stringify(executed.receipt));
        const conflict: CommandExecution = await kernel.execute(commandEnvelope(
          makeId<"CommandId">("cmd-idem-register-conflict"),
          register.idempotencyKey,
          register.actor,
          "2026-10-05T00:00:00Z",
          register.payload,
        ) as AnyRuntimeCommand);
        expect(conflict.status).toBe("REJECTED");
        expect(kernel.events().length).toBe(journalBefore);
        expect(kernel.receipts().length).toBe(receiptsBefore);
        aggregated.byType.set("REGISTER_AUTONOMOUS_STORE", (aggregated.byType.get("REGISTER_AUTONOMOUS_STORE") ?? 0) + 1);
        aggregated.replays += 1;
        aggregated.conflicts += 1;
      }
      // Anti-vacuity: every money-critical command type was replay-certified.
      const missing = MONEY_CRITICAL.filter((type) => (aggregated.byType.get(type) ?? 0) === 0);
      expect(missing, `money-critical types never replay-certified: ${missing.join(", ")}`).toEqual([]);
    },
    120_000,
  );

  it(
    "concurrent duplicate submissions of one envelope resolve to exactly one execution",
    async () => {
      const { kernel } = await runFuzzSession({ seed: 424242, steps: 60, surface: "legacy" });
      const journalBefore = kernel.events().length;
      // A fresh consequential command on a guaranteed-free till (the fuzz
      // never opens "till-concurrent" on store-alpha).
      const envelope = commandEnvelope(
        makeId<"CommandId">("cmd-concurrent-1"),
        makeId<"IdempotencyKey">("idem-concurrent-1"),
        { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
        "2026-10-05T00:00:00Z",
        {
          type: "OPEN_STORE_CASH_SESSION",
          autonomousStoreId: makeId<"AutonomousStoreId">("store-alpha"),
          tillId: makeId<"TillId">("till-concurrent"),
          openingCount: { currency: "USD", amountMinor: "2500" },
          staff: { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
        },
      ) as AnyRuntimeCommand;
      const outcomes = await Promise.all([1, 2, 3, 4, 5].map(() => kernel.execute(envelope)));
      const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
      const duplicated = outcomes.filter((outcome) => outcome.status === "DUPLICATE");
      expect(executed).toHaveLength(1);
      expect(duplicated).toHaveLength(4);
      // Exactly one effect: the journal grew by the single execution only.
      expect(kernel.events().length - journalBefore).toBe(1);
      assertMoneyConservation(kernel.events(), "concurrent duplicates");
    },
    30_000,
  );
});
