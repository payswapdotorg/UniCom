/**
 * W1-006 acceptance scenario 6 — replay certified at EVERY boundary.
 *
 * For a randomized full-surface journal AND the composed journey: a twin
 * checkpoint taken at EVERY event boundary, resumed with the remaining
 * tail, reconstructs a twin byte-identical to the full rebuild (and to
 * the kernel's authoritative snapshot). Prefix reconstruction (journal
 * prefix → kernel fold) agrees with the twin fold of the same prefix at
 * every boundary. Full-journal replay reconstructs identical state, the
 * idempotency ledger survives the restart (exactly-once across recovery),
 * and the replayed journal continues to satisfy the sequence law.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceTwin,
  assertTwinMatchesAuthoritative,
  reconstructAuthoritativeState,
  reconstructKernel,
  type AnyCommerceEvent,
} from "../../contract.js";
import { env } from "../runtime/support/envelopes.js";
import { runFuzzSession } from "./support/fuzz-session.js";
import { runComposedJourney } from "./support/journey.js";
import { commandEnvelope, makeId } from "../../contract.js";
import { assertMoneyConservation } from "./support/ledger.js";

/** Checkpoint/resume at EVERY boundary of a journal; resumed ≡ full rebuild ≡ kernel. */
function certifyEveryBoundary(events: readonly AnyCommerceEvent[], kernelSnapshot: () => unknown, label: string): number {
  const rebuilt = CommerceTwin.fromEvents(events);
  assertTwinMatchesAuthoritative(rebuilt.snapshot(), kernelSnapshot() as never);
  let boundaries = 0;
  let incremental = CommerceTwin.empty();
  for (let index = 0; index < events.length; index += 1) {
    incremental.apply(events[index] as AnyCommerceEvent);
    const resumed = CommerceTwin.resume(incremental.checkpoint(), events.slice(index + 1));
    if (resumed.canonical() !== rebuilt.canonical()) {
      throw new TypeError(`resume at boundary ${index} of ${label} diverges from the full rebuild`);
    }
    if (resumed.position() !== events.length) {
      throw new TypeError(`resume at boundary ${index} of ${label} folded ${resumed.position()} of ${events.length} events`);
    }
    boundaries += 1;
  }
  return boundaries;
}

/** Prefix reconstruction: journal prefix → kernel fold ≡ twin fold at every boundary. */
function certifyPrefixReconstruction(events: readonly AnyCommerceEvent[], label: string): number {
  let checked = 0;
  for (let boundary = 1; boundary <= events.length; boundary += 1) {
    const prefix = events.slice(0, boundary);
    const kernelFold = reconstructAuthoritativeState(prefix);
    const twinFold = CommerceTwin.fromEvents(prefix);
    assertTwinMatchesAuthoritative(twinFold.snapshot(), kernelFold.snapshot());
    checked += 1;
  }
  void label;
  return checked;
}

describe("W1-006 acceptance scenario 6 — replay at every boundary + full-journal reconstruction", () => {
  it(
    "a full-surface fuzz journal: twin checkpoint/resume at EVERY boundary is byte-identical to the full rebuild",
    async () => {
      const { kernel } = await runFuzzSession({ seed: 271828, steps: 380, surface: "autonomous-store" });
      const events = kernel.events();
      expect(events.length).toBeGreaterThan(300);
      const boundaries = certifyEveryBoundary(events, () => kernel.snapshot(), "fuzz journal");
      expect(boundaries).toBe(events.length);
      // Every prefix also reconstructs identically through the kernel fold.
      const prefixes = certifyPrefixReconstruction(events, "fuzz journal");
      expect(prefixes).toBe(events.length);
    },
    120_000,
  );

  it(
    "the composed journey: checkpoint/resume at EVERY boundary + prefix reconstruction agree",
    async () => {
      const { kernel } = await runComposedJourney();
      const events = kernel.events();
      const boundaries = certifyEveryBoundary(events, () => kernel.snapshot(), "composed journey");
      expect(boundaries).toBe(events.length);
      const prefixes = certifyPrefixReconstruction(events, "composed journey");
      expect(prefixes).toBe(events.length);
    },
    60_000,
  );

  it(
    "full-journal replay reconstructs identical state; exactly-once idempotency survives the restart; the journal continues validly",
    async () => {
      const { kernel } = await runFuzzSession({ seed: 314159, steps: 160, surface: "legacy" });
      // One extra consequential command whose envelope we keep, to prove
      // the receipt ledger survives reconstruction.
      const sku = makeId<"SkuId">("sku-replay-cert");
      const location = makeId<"LocationId">("loc-replay-cert");
      const receive = env({ type: "RECEIVE_STOCK", skuId: sku, locationId: location, units: 7, reason: "RECEIVING" });
      const outcome = await kernel.execute(receive);
      if (outcome.status !== "EXECUTED") throw new TypeError(`expected EXECUTED, got ${outcome.status}`);

      const events = kernel.events();
      const authoritative = reconstructAuthoritativeState(events);
      expect(authoritative.snapshot()).toEqual(kernel.snapshot());
      const recovered = reconstructKernel(kernel.persistentState());
      expect(recovered.snapshot()).toEqual(kernel.snapshot());

      // Exactly-once across recovery: replaying the already-executed
      // envelope against the RECOVERED kernel is a DUPLICATE (original
      // receipt), and a key conflict is still a hard conflict.
      const replay = await recovered.execute(receive);
      if (replay.status !== "DUPLICATE") throw new TypeError(`expected DUPLICATE, got ${replay.status}`);
      expect(JSON.stringify(replay.originalReceipt)).toBe(JSON.stringify(outcome.receipt));
      const conflict = await recovered.execute(commandEnvelope(
        makeId<"CommandId">("cmd-recovery-conflict"),
        receive.idempotencyKey,
        receive.actor,
        "2026-10-05T00:00:00Z",
        receive.payload,
      ));
      expect(conflict.status).toBe("REJECTED");

      // The recovered kernel continues deterministically: a new command
      // appends events that continue the per-subject sequences, and the
      // whole extended journal still satisfies the sequence law + conservation.
      const extended = await recovered.execute(env({
        type: "RECEIVE_STOCK", skuId: sku, locationId: location, units: 3, reason: "RECEIVING",
      }));
      expect(extended.status).toBe("EXECUTED");
      expect(recovered.journalIsValid()).toBe(true);
      const before = events.length;
      expect(recovered.events().length).toBe(before + 1);
      assertMoneyConservation(recovered.events(), "recovered continuation");
    },
    60_000,
  );
});
