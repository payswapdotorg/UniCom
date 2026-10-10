/**
 * buyer-twin fixture data + the what-if computations (J14). The Commerce Twin
 * runs COUNTERFACTUALS on the safe side of the architecture: forecasts come
 * from the REAL advisory runtime (computeDemandForecast — never an
 * auto-mutation) and money math from the commerce exact-money primitives.
 * Nothing here can write commerce facts — the write-block is structural
 * (INVARIANT: predictions never mutate canonical truth).
 */
import { computeDemandForecast, multiplyMoneyByInteger, percentageBpsOfMoney, subtractMoney } from "@unicom/commerce";
import type { Money } from "@unicom/commerce";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";

/** Canonical demo facts (verified, from the committed lane fixtures). */
export const CANONICAL_FACTS = {
  inkListPriceMinor: "4900",
  poolPriceMinor: "4100",
  weeklyUnits: [3, 4, 2, 3, 5, 3] as const,
  plotterBuyMinor: "240000",
  plotterRentPerWeekMinor: "9500",
  plotterDepositMinor: "48000",
  plotterResaleNetMinor: "74100",
} as const;

/** The demand shift shares offered by the counterfactual editor. */
export const SHIFT_OPTIONS: readonly { readonly id: string; readonly label: string; readonly shareBps: number }[] = [
  { id: "none", label: "Keep buying at list (0%)", shareBps: 0 },
  { id: "quarter", label: "Shift a quarter to the pool (25%)", shareBps: 2500 },
  { id: "half", label: "Shift half to the pool (50%)", shareBps: 5000 },
  { id: "three-quarters", label: "Shift three quarters (75%)", shareBps: 7500 },
  { id: "full", label: "Shift everything to the pool (100%)", shareBps: 10_000 },
];

/** The demand scenarios offered by the counterfactual editor. */
export const DEMAND_OPTIONS: readonly { readonly id: string; readonly label: string; readonly multiplier: number }[] = [
  { id: "steady", label: "Steady demand (×1.0)", multiplier: 1 },
  { id: "busy", label: "Busy season (×1.25)", multiplier: 1.25 },
  { id: "quiet", label: "Quiet season (×0.75)", multiplier: 0.75 },
];

export interface WhatIfInput {
  readonly shareBps: number;
  readonly multiplier: number;
  /** true ⇒ model a brand-new SKU with no purchase history (forecast UNKNOWN). */
  readonly newSkuNoHistory: boolean;
}

export type WhatIfResult =
  | {
      readonly kind: "OBSERVED";
      readonly weeklyUnits: number;
      readonly units4w: number;
      readonly blendedPerSet: Money;
      readonly currentSpend4w: Money;
      readonly projectedSpend4w: Money;
      readonly projectedDelta4w: Money;
    }
  | {
      readonly kind: "UNKNOWN";
      readonly reason: string;
    };

/**
 * Run the ink-purchasing counterfactual. Deterministic: the forecast is the
 * runtime's own pure function over the (scaled) committed history; every
 * money value is exact-minor arithmetic. The pool price applies ONLY if the
 * pool forms — the result is predictive, never a promise.
 */
export function runInkWhatIf(input: WhatIfInput): WhatIfResult {
  const history = input.newSkuNoHistory
    ? []
    : CANONICAL_FACTS.weeklyUnits.map((units) => units * input.multiplier);
  const forecast = computeDemandForecast(history, { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 4 });
  if (forecast.kind !== "OBSERVED") {
    return { kind: "UNKNOWN", reason: forecast.reason };
  }
  const list = usdMinor(CANONICAL_FACTS.inkListPriceMinor);
  const pool = usdMinor(CANONICAL_FACTS.poolPriceMinor);
  const listMinusPool = subtractMoney(list, pool);
  if (!listMinusPool.ok) return { kind: "UNKNOWN", reason: "PRICE_MATH_UNAVAILABLE" };
  // Blended per-set price at the shifted share: list − shareBps×(list−pool).
  const discount = percentageBpsOfMoney(listMinusPool.value, input.shareBps, "HALF_UP");
  const blended = subtractMoney(list, discount);
  if (!blended.ok) return { kind: "UNKNOWN", reason: "PRICE_MATH_UNAVAILABLE" };
  const units4w = forecast.value * 4;
  return {
    kind: "OBSERVED",
    weeklyUnits: forecast.value,
    units4w,
    blendedPerSet: blended.value,
    currentSpend4w: multiplyMoneyByInteger(list, units4w),
    projectedSpend4w: multiplyMoneyByInteger(blended.value, units4w),
    projectedDelta4w: multiplyMoneyByInteger(discount, units4w),
  };
}

/** Rent-vs-own counterfactual for the plotter (exact, fixture-backed). */
export function runRentVsOwn(weeks: number): {
  readonly rentTotal: Money;
  readonly buyPrice: Money;
  readonly depositHeld: Money;
  readonly resaleNet: Money;
} {
  return {
    rentTotal: multiplyMoneyByInteger(usdMinor(CANONICAL_FACTS.plotterRentPerWeekMinor), weeks),
    buyPrice: usdMinor(CANONICAL_FACTS.plotterBuyMinor),
    depositHeld: usdMinor(CANONICAL_FACTS.plotterDepositMinor),
    resaleNet: usdMinor(CANONICAL_FACTS.plotterResaleNetMinor),
  };
}

/** Deterministic text for a what-if result (used by the component + tests). */
export function whatIfText(result: WhatIfResult): string {
  if (result.kind === "UNKNOWN") {
    return `Forecast UNKNOWN (${result.reason}) — the runtime refused to guess; no projection is shown.`;
  }
  return [
    `projected ${result.weeklyUnits} sets/week (${result.units4w} per 4 weeks)`,
    `blended ${moneyText(result.blendedPerSet)}/set`,
    `current-plan spend ${moneyText(result.currentSpend4w)}/4w`,
    `what-if spend ${moneyText(result.projectedSpend4w)}/4w`,
    `projected difference ${moneyText(result.projectedDelta4w)}/4w`,
  ].join(" · ");
}
