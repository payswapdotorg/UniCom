/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY CERTIFICATION SUPPORT — NEVER PRODUCTION CODE.          █
 * █ No production-reachable path may import this file.               █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-006 shared fuzz-session harness: drives the FULL kernel command
 * surface (the union of the W1-003/004 "legacy" vocabulary and the W1-005
 * "autonomous-store" vocabulary) through the real kernel with the
 * sanctioned payment-boundary double, folding the Commerce Twin
 * incrementally and twin-checking after every step. Deterministic by
 * construction: seeded mulberry32 RNG + stepping clock (no wall clock,
 * no unseeded randomness).
 */
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  commandEnvelope,
  currency,
  makeId,
  money,
  type AnyRuntimeCommand,
  type AutonomousStorePolicy,
  type CommandExecution,
  type PrincipalRef,
} from "../../../contract.js";
import { ScriptedPaymentDouble } from "../../runtime/support/payment-double.js";
import { steppingTimeSource } from "../../runtime/support/clock.js";
import { FuzzCommandSource, FuzzRng, FUZZ_SKUS, FUZZ_STORES, FUZZ_STORE_OWNER } from "../../projection/support/fuzz.js";

const usd = currency("USD");

/** The store policy the certification registers for both fuzz stores. */
export function fuzzStorePolicy(storeId: string): AutonomousStorePolicy {
  return {
    policyId: makeId<"AutonomousStorePolicyId">(`policy-fuzz-${storeId}`),
    autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
    revision: 1,
    policyCurrency: usd,
    marginFloorBps: 1_000,
    priceChangeApprovalThreshold: money("500", usd),
    promotionBudget: { limitPerPeriod: money("10000", usd), period: "DAILY" },
    spendLimit: { limitPerPeriod: money("5000", usd), period: "DAILY" },
    refundApprovalThreshold: money("5000", usd),
    stopConditions: [],
    storeOperations: {
      tillFloatMin: money("1000", usd),
      tillFloatMax: money("20000", usd),
      cashVarianceEscalationThreshold: money("500", usd),
      countMismatchEscalationUnits: 3,
    },
    restockRules: FUZZ_SKUS.flatMap((sku, skuIndex) =>
      (["loc-warehouse-1", "loc-store-b"] as const).map((location) => ({
        skuId: makeId<"SkuId">(sku),
        locationId: makeId<"LocationId">(location),
        supplierId: makeId<"SupplierId">("sup-fuzz"),
        thresholdUnits: 5,
        reorderUnits: 10,
        unitCost: money(skuIndex % 2 === 0 ? "200" : "350", usd),
      })),
    ),
  };
}

/** Register both fuzz stores + policies + the full price book. */
export async function setupFuzzStores(kernel: CommerceKernel): Promise<void> {
  for (const storeId of FUZZ_STORES) {
    await kernel.execute(
      commandEnvelope(
        makeId<"CommandId">(`cmd-setup-${storeId}`),
        makeId<"IdempotencyKey">(`idem-setup-${storeId}`),
        FUZZ_STORE_OWNER,
        "2026-10-05T00:00:00Z",
        {
          type: "REGISTER_AUTONOMOUS_STORE",
          autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
          ownerRef: FUZZ_STORE_OWNER,
          displayName: `certification ${storeId}`,
        },
      ) as AnyRuntimeCommand,
    );
    kernel.registerAutonomousPolicy(fuzzStorePolicy(storeId));
    for (const sku of FUZZ_SKUS) {
      await kernel.execute(
        commandEnvelope(
          makeId<"CommandId">(`cmd-price-${storeId}-${sku}`),
          makeId<"IdempotencyKey">(`idem-price-${storeId}-${sku}`),
          FUZZ_STORE_OWNER,
          "2026-10-05T00:00:00Z",
          {
            type: "SET_SKU_PRICE",
            autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
            skuId: makeId<"SkuId">(sku),
            unitPrice: money("1999", usd),
            costBasis: money("1000", usd),
          },
        ) as AnyRuntimeCommand,
      );
    }
  }
}

/**
 * Deterministic settlement scripting: identical to the W1-005 harness
 * (hash of the payment id picks the rail's clearing outcome; the
 * unscripted remainder reports UNKNOWN — the double's default).
 */
export function settlementHookFor(double: ScriptedPaymentDouble): (paymentId: string) => void {
  return (paymentId: string) => {
    let hash = 0;
    for (const char of paymentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const roll = hash % 4;
    if (roll === 0) double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "SETTLED", settledAmount: money("10000", usd) });
    else if (roll === 1) double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "NOT_SETTLED" });
    else if (roll === 2) double.scriptSettlementOutcome(paymentId, { resolved: "UNKNOWN", reason: "CLEARING_AMBIGUOUS", providerNativeStatus: "PENDING_RECON" });
  };
}

export type FuzzSurface = "legacy" | "autonomous-store";

export interface FuzzStepContext {
  readonly kernel: CommerceKernel;
  readonly twin: CommerceTwin;
  readonly step: number;
  readonly outcome: CommandExecution;
  readonly tag: "fresh" | "duplicate" | "conflict";
  readonly double: ScriptedPaymentDouble;
}

export interface FuzzSessionCounts {
  readonly steps: number;
  readonly executed: number;
  readonly duplicates: number;
  readonly conflicts: number;
  readonly rejections: number;
  readonly ambiguousInjections: number;
}

export interface FuzzFinalContext {
  readonly kernel: CommerceKernel;
  readonly twin: CommerceTwin;
  readonly double: ScriptedPaymentDouble;
  readonly counts: FuzzSessionCounts;
}

export interface FuzzSessionOptions {
  readonly seed: number;
  readonly steps: number;
  readonly surface: FuzzSurface;
  /** Verify twin ≡ kernel after EVERY step (false: final only). */
  readonly verifyEveryStep?: boolean;
  /** Chance per step of scripting the NEXT port outcome as AMBIGUOUS. */
  readonly ambiguousChance?: number;
  /** Extra per-step certification hook (conservation/reconciliation/...). */
  readonly onStep?: (context: FuzzStepContext) => void;
  /** Final hook (runs after the last step, before the final assertions). */
  readonly onFinal?: (context: FuzzFinalContext) => void;
}

export interface FuzzSessionResult {
  readonly kernel: CommerceKernel;
  readonly twin: CommerceTwin;
  readonly double: ScriptedPaymentDouble;
  readonly counts: FuzzSessionCounts;
}

/** Run one seeded certification fuzz session over the full surface. */
export async function runFuzzSession(options: FuzzSessionOptions): Promise<FuzzSessionResult> {
  const double = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary: double, timeSource: steppingTimeSource() });
  if (options.surface === "autonomous-store") {
    await setupFuzzStores(kernel);
  }
  const twin = CommerceTwin.empty();
  twin.applyAll(kernel.events());
  const rng = new FuzzRng(options.seed);
  const harnessRng = new FuzzRng(options.seed ^ 0x5eed);
  const source = new FuzzCommandSource(rng, {
    surface: options.surface,
    onSettlementObservation: settlementHookFor(double),
  });
  let folded = kernel.events().length;
  let executed = 0;
  let duplicates = 0;
  let conflicts = 0;
  let rejections = 0;
  let ambiguousInjections = 0;
  const ambiguousChance = options.ambiguousChance ?? 0.06;

  for (let step = 0; step < options.steps; step += 1) {
    if (harnessRng.chance(ambiguousChance)) {
      ambiguousInjections += 1;
      double.makeNextOutcomeAmbiguous(`CERT_AMBIGUOUS_${options.seed}_${step}`);
    }
    const { envelope, tag } = source.next(kernel);
    const outcome: CommandExecution = await kernel.execute(envelope);
    if (outcome.status === "EXECUTED") source.observeExecuted(envelope);
    if (tag === "duplicate") {
      if (outcome.status !== "DUPLICATE") throw new TypeError(`expected DUPLICATE, got ${outcome.status}`);
      duplicates += 1;
    } else if (tag === "conflict") {
      if (outcome.status !== "REJECTED") throw new TypeError(`expected REJECTED (conflict), got ${outcome.status}`);
      conflicts += 1;
    } else if (outcome.status === "REJECTED") {
      rejections += 1;
    } else {
      executed += 1;
    }
    const events = kernel.events();
    twin.applyAll(events.slice(folded));
    folded = events.length;
    options.onStep?.({ kernel, twin, step, outcome, tag, double });
    if (options.verifyEveryStep === true || step === options.steps - 1) {
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    }
  }
  if (folded !== kernel.events().length) throw new TypeError("twin did not fold the whole journal");
  const counts: FuzzSessionCounts = { steps: options.steps, executed, duplicates, conflicts, rejections, ambiguousInjections };
  options.onFinal?.({ kernel, twin, double, counts });
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  if (!kernel.journalIsValid()) throw new TypeError("journal violates the event sequence law");
  return { kernel, twin, double, counts };
}

/** Convenience actor used by certification report verifies. */
export const CERTIFICATION_ACTOR: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };
