/**
 * Weighted-product workflow runtime (W3-004; acceptance scenario 3;
 * docs/SUPERMARKET-WITHOUT-RFID.md, W3-001 `edge/weighted.ts` boundary).
 *
 * Supermarket scanner-scale flow, no RFID: select-or-scan → place-on-scale →
 * confirm-weight → print-or-attach-label → complete-sale.
 *
 * - PRICING IS EXACT INTEGER MATH: price-per-unit is an integer number of
 *   minor units per pricing unit (e.g. 499 = $4.99/kg); observed weight is
 *   an exact decimal string; the total is computed with BigInt rationals
 *   and rounded HALF_UP once, at the end, to integer minor units
 *   (INVARIANT 14: no floating-point money anywhere in this path);
 * - TOLERANCE BANDS: when an expected weight is present (label/entered),
 *   variance is checked EXACTLY. Within the band the observed weight prices
 *   (the scale is the truth of the moment); OUTSIDE the band the capture is
 *   EXPLICITLY REJECTED — never silently re-priced with either weight, never
 *   a guessed total. A malformed capture resolves UNKNOWN (never a price);
 * - OUTPUT: a priced capture yields the W3-001 `WeightedSaleObservation`
 *   (register-computed DISPLAY values — canonical totals remain the
 *   Commerce Kernel's, which reconciles deterministicly on its own side)
 *   plus a `pos-sale-event` journal observation for the edge queue.
 *
 * Cross-lane note (documented gap): the commerce reconciliation seam today
 * promotes integer-unit counts and POS syncs; a measured-quantity
 * (fractional-unit) sale promotion path does not exist yet in Worker 1's
 * seam. Weighted sales therefore hand off as OBSERVATIONS and stay
 * observations — this lane never approximates them into integer units.
 */

import type { CommerceProductRef } from "../../common/opaque-refs";
import type { MoneyString, UtcIso8601String } from "../../common/values";
import type {
  WeightedSaleObservation,
  WeightedWorkflowStep,
  WeightedWorkflowStepId,
} from "../../edge/weighted";
import type { PhysicalObservation } from "../../edge/observation";
import { asPhysicalObservationId, asUtcTimestamp } from "../ids";
import {
  ExactnessViolation,
  absRational,
  compareRationals,
  formatMinorUnitsAsMoney,
  multiplyRationals,
  parseExactDecimal,
  roundRationalHalfUp,
  subtractRationals,
  toExactMilligrams,
  type ExactRational,
  type WeightUnit,
} from "./exact-integer";

/** The unit a price-per-unit is quoted in. */
export type PricedPerUnit = "kg" | "lb";

/** Exact milligrams per pricing unit. */
const MILLIGRAMS_PER_PRICED_UNIT: Readonly<Record<PricedPerUnit, ExactRational>> = {
  kg: { num: 1_000_000n, den: 1n },
  lb: { num: 45_359_237n, den: 100n },
};

/** One weight capture at the scale (all values exact strings / integers). */
export interface WeightCaptureInput {
  readonly productRef?: CommerceProductRef;
  readonly barcode?: string;
  /** Price per pricing unit in INTEGER minor units (499 = $4.99/kg). */
  readonly unitPriceMinor: bigint;
  readonly pricedPerUnit: PricedPerUnit;
  readonly currency: string;
  /** Minor-unit scale of the currency (2 = USD-class, 0 = JPY, 3 = BHD). */
  readonly minorDigits?: 0 | 2 | 3;
  /** Observed weight on the scale (exact decimal string + unit). */
  readonly observedWeight: { readonly amount: string; readonly unit: WeightUnit };
  /** Expected weight (label/entered) for variance checking, when present. */
  readonly expectedWeight?: { readonly amount: string; readonly unit: WeightUnit };
  readonly scaleDeviceRef: string;
}

/** Explicit tolerance band for observed-vs-expected weight variance. */
export interface WeightToleranceBand {
  /** Max |observed−expected|/expected in basis points (200 = 2%). */
  readonly maxRelativeVarianceBps?: number;
  /** Max |observed−expected| in exact milligrams. */
  readonly maxAbsoluteMilligrams?: bigint;
}

/** Result of pricing one weight capture. UNKNOWN and rejection are explicit. */
export type WeightedPricingResult =
  | {
      readonly status: "priced";
      readonly totalMinorUnits: bigint;
      readonly currency: string;
      /** Variance against the expected weight, in bps (when one was given). */
      readonly varianceBps?: number;
      readonly bandApplied: WeightToleranceBand;
    }
  | {
      readonly status: "rejected-out-of-tolerance";
      readonly varianceBps: number;
      readonly expectedMilligrams: bigint;
      readonly observedMilligrams: bigint;
      readonly bandApplied: WeightToleranceBand;
    }
  | { readonly status: "unknown"; readonly reason: string };

/** Default supermarket tolerance: ±2% relative (200 bps). */
export const DEFAULT_WEIGHT_TOLERANCE: WeightToleranceBand = { maxRelativeVarianceBps: 200 };

/**
 * Price one weight capture with exact integer math and explicit tolerance.
 * Pure function — no clock, no state, no floats.
 */
export function priceWeightedCapture(
  input: WeightCaptureInput,
  band: WeightToleranceBand = DEFAULT_WEIGHT_TOLERANCE,
): WeightedPricingResult {
  if (input.unitPriceMinor <= 0n) {
    return { status: "unknown", reason: `unit price must be a positive integer of minor units, got ${input.unitPriceMinor.toString()}` };
  }
  let observedMg: ExactRational;
  let expectedMg: ExactRational | undefined;
  try {
    observedMg = toExactMilligrams(input.observedWeight.amount, input.observedWeight.unit);
    expectedMg =
      input.expectedWeight === undefined
        ? undefined
        : toExactMilligrams(input.expectedWeight.amount, input.expectedWeight.unit);
  } catch (error) {
    // A malformed capture is UNKNOWN — never a guessed price.
    const reason = error instanceof ExactnessViolation ? error.message : "weight capture is not an exact decimal";
    return { status: "unknown", reason };
  }
  if (expectedMg !== undefined && compareRationals(observedMg, { num: 0n, den: 1n }) !== 1) {
    return { status: "unknown", reason: "observed weight must be strictly positive" };
  }
  if (expectedMg === undefined && compareRationals(observedMg, { num: 0n, den: 1n }) !== 1) {
    return { status: "unknown", reason: "observed weight must be strictly positive" };
  }

  if (expectedMg !== undefined) {
    const differenceMg = absRational(subtractRationals(observedMg, expectedMg));
    // |obs − exp| / exp × 10000, exact: (diff.num × exp.den × 10⁴) / (diff.den × exp.num).
    const varianceBps = roundRationalHalfUp({
      num: differenceMg.num * expectedMg.den * 10000n,
      den: differenceMg.den * expectedMg.num,
    });
    const relativeLimit = band.maxRelativeVarianceBps;
    if (relativeLimit !== undefined && varianceBps > BigInt(relativeLimit)) {
      return {
        status: "rejected-out-of-tolerance",
        varianceBps: Number(varianceBps),
        expectedMilligrams: roundRationalHalfUp(expectedMg),
        observedMilligrams: roundRationalHalfUp(observedMg),
        bandApplied: band,
      };
    }
    const absoluteLimit = band.maxAbsoluteMilligrams;
    if (absoluteLimit !== undefined && compareRationals(differenceMg, { num: absoluteLimit, den: 1n }) === 1) {
      return {
        status: "rejected-out-of-tolerance",
        varianceBps: Number(varianceBps),
        expectedMilligrams: roundRationalHalfUp(expectedMg),
        observedMilligrams: roundRationalHalfUp(observedMg),
        bandApplied: band,
      };
    }
    // Within tolerance: price the OBSERVED weight with exact math.
    const total = priceByWeight(input, observedMg);
    return {
      status: "priced",
      totalMinorUnits: total,
      currency: input.currency,
      varianceBps: Number(varianceBps),
      bandApplied: band,
    };
  }

  // No expected weight: no variance check — price the observed capture.
  return {
    status: "priced",
    totalMinorUnits: priceByWeight(input, observedMg),
    currency: input.currency,
    bandApplied: band,
  };
}

/** unitPriceMinor × (weightMg / mgPerPricedUnit), rounded HALF_UP once. */
function priceByWeight(input: WeightCaptureInput, weightMg: ExactRational): bigint {
  const weightInPricedUnit = { num: weightMg.num * MILLIGRAMS_PER_PRICED_UNIT[input.pricedPerUnit].den, den: weightMg.den * MILLIGRAMS_PER_PRICED_UNIT[input.pricedPerUnit].num };
  const exact = multiplyRationals({ num: input.unitPriceMinor, den: 1n }, weightInPricedUnit);
  return roundRationalHalfUp(exact);
}

/** State of one weighted sale session at the register. */
export type WeightedSessionState = "selecting" | "weighed-rejected" | "weighed-unknown" | "priced" | "labelled" | "completed";

/** The completed sale's outputs (display contract + journal observation). */
export interface CompletedWeightedSale {
  readonly saleObservation: WeightedSaleObservation;
  /** POS-sale journal observation for the edge queue (evidence, never truth). */
  readonly journalObservation: PhysicalObservation;
}

/**
 * One weighted sale session — the W3-001 five-step workflow as a
 * deterministic state machine. Rejections are explicit states, never
 * silent: a rejected capture must be re-weighed before the sale proceeds.
 */
export interface WeightedSaleSession {
  readonly sessionRef: string;
  selectOrScan(item: { readonly productRef?: CommerceProductRef; readonly barcode?: string }): void;
  /** Place on scale + confirm weight: prices exactly or rejects explicitly. */
  placeOnScale(capture: WeightCaptureInput): WeightedPricingResult;
  /** Print/attach the label (requires a priced capture). */
  printLabel(): { readonly labelRef: string };
  /** Complete the sale (requires a printed label). */
  completeSale(): CompletedWeightedSale;
  /** Re-weigh after a rejection or UNKNOWN (back to place-on-scale). */
  reweigh(): void;
  state(): WeightedSessionState;
  pricing(): WeightedPricingResult | undefined;
  /** The W3-001 workflow step view (with completion timestamps). */
  steps(): readonly WeightedWorkflowStep[];
}

export interface WeightedProductRuntimeOptions {
  readonly tolerance?: WeightToleranceBand;
  readonly clock: () => string;
  /** Prefix for minted session refs (defaults to "weighted-session"). */
  readonly sessionPrefix?: string;
}

let weightedSessionCounter = 0;

export function createWeightedProductRuntime(options: WeightedProductRuntimeOptions): {
  /** Begin a new weighted sale session (select-or-scan step). */
  begin(item: { readonly productRef?: CommerceProductRef; readonly barcode?: string }): WeightedSaleSession;
} {
  const tolerance = options.tolerance ?? DEFAULT_WEIGHT_TOLERANCE;
  const clock = options.clock;
  return {
    begin(item): WeightedSaleSession {
      weightedSessionCounter += 1;
      const sessionRef = `${options.sessionPrefix ?? "weighted-session"}-${weightedSessionCounter}`;
      const completedSteps = new Map<WeightedWorkflowStepId, UtcIso8601String>();
      let state: WeightedSessionState = "selecting";
      let pricing: WeightedPricingResult | undefined;
      let capture: WeightCaptureInput | undefined;
      let labelRef: string | undefined;
      let itemRef = item;
      const mark = (stepId: WeightedWorkflowStepId): void => {
        completedSteps.set(stepId, asUtcTimestamp(clock()));
      };
      mark("select-or-scan");

      const session: WeightedSaleSession = {
        sessionRef,
        selectOrScan(nextItem): void {
          if (state === "completed") throw new Error(`weighted session ${sessionRef} is already completed`);
          itemRef = nextItem;
          state = "selecting";
          mark("select-or-scan");
        },
        placeOnScale(nextCapture): WeightedPricingResult {
          if (state === "completed" || state === "labelled") {
            throw new Error(`weighted session ${sessionRef} is at ${state}; a new capture requires a new session`);
          }
          capture = nextCapture;
          mark("place-on-scale");
          pricing = priceWeightedCapture(nextCapture, tolerance);
          if (pricing.status === "priced") {
            state = "priced";
            mark("confirm-weight");
          } else if (pricing.status === "rejected-out-of-tolerance") {
            state = "weighed-rejected";
          } else {
            state = "weighed-unknown";
          }
          return pricing;
        },
        printLabel(): { readonly labelRef: string } {
          if (state !== "priced") throw new Error(`weighted session ${sessionRef} cannot print a label from state ${state}`);
          labelRef = `${sessionRef}-label`;
          state = "labelled";
          mark("print-or-attach-label");
          return { labelRef };
        },
        completeSale(): CompletedWeightedSale {
          if (state !== "labelled") throw new Error(`weighted session ${sessionRef} cannot complete from state ${state}`);
          const priced = pricing;
          const weighed = capture;
          if (priced === undefined || priced.status !== "priced" || weighed === undefined) {
            throw new Error(`weighted session ${sessionRef} lost its priced capture (internal invariant)`);
          }
          const minorDigits = weighed.minorDigits ?? 2;
          const observedAt = asUtcTimestamp(clock());
          const saleObservation: WeightedSaleObservation = {
            productRef: itemRef.productRef ?? weighed.productRef,
            barcode: itemRef.barcode ?? weighed.barcode,
            weight: {
              measuredAmount: weighed.observedWeight.amount,
              unit: weighed.observedWeight.unit,
              scaleDeviceRef: weighed.scaleDeviceRef,
              productRef: weighed.productRef,
            },
            unitPriceDisplay: formatMinorUnitsAsMoney(weighed.unitPriceMinor, minorDigits) as MoneyString,
            computedPriceDisplay: formatMinorUnitsAsMoney(priced.totalMinorUnits, minorDigits) as MoneyString,
            observedAt,
            truthClass: "observed",
          };
          mark("complete-sale");
          state = "completed";
          // Journal observation: the register's weighted sale as evidence.
          const journalObservation: PhysicalObservation = {
            observationId: asPhysicalObservationId(`${sessionRef}-sale`),
            kind: "pos-sale-event",
            sourceClass: "pos-reported",
            truthClass: "observed",
            capture: {
              capturedAt: observedAt,
              capturedBy: "edge-device",
              captureMode: "online",
              deviceRef: weighed.scaleDeviceRef as never,
            },
            payload: {
              kind: "pos-sale-event",
              transaction: {
                posTerminalRef: weighed.scaleDeviceRef,
                transactionRef: sessionRef,
                lineItems: [
                  {
                    barcode: itemRef.barcode ?? weighed.barcode,
                    productRef: itemRef.productRef ?? weighed.productRef,
                    quantity: `${weighed.observedWeight.amount} ${weighed.observedWeight.unit}`,
                  },
                ],
                totalDisplay: saleObservation.computedPriceDisplay,
              },
            },
          };
          return { saleObservation, journalObservation };
        },
        reweigh(): void {
          if (state !== "weighed-rejected" && state !== "weighed-unknown") {
            throw new Error(`weighted session ${sessionRef} is at ${state}; only rejected/unknown captures re-weigh`);
          }
          state = "selecting";
        },
        state(): WeightedSessionState {
          return state;
        },
        pricing(): WeightedPricingResult | undefined {
          return pricing === undefined ? undefined : { ...pricing };
        },
        steps(): readonly WeightedWorkflowStep[] {
          const order: readonly WeightedWorkflowStepId[] = [
            "select-or-scan",
            "place-on-scale",
            "confirm-weight",
            "print-or-attach-label",
            "complete-sale",
          ];
          const labels: Readonly<Record<WeightedWorkflowStepId, string>> = {
            "select-or-scan": "Select or scan the item",
            "place-on-scale": "Place the item on the scale",
            "confirm-weight": "Confirm the measured weight",
            "print-or-attach-label": "Print or attach the price label",
            "complete-sale": "Complete the sale",
          };
          return order.map((stepId) => ({
            stepId,
            userLabel: labels[stepId],
            ...(completedSteps.has(stepId) ? { completedAt: completedSteps.get(stepId) } : {}),
          }));
        },
      };
      return session;
    },
  };
}

/** Parse-side helper exported for tests: exact decimal → rational. */
export { parseExactDecimal, formatMinorUnitsAsMoney };
