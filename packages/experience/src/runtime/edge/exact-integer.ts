/**
 * Exact integer math for the physical-commerce edge (W3-004; INVARIANT 14:
 * money never uses floating-point arithmetic).
 *
 * Small, audited BigInt rational arithmetic — the ONLY numeric machinery the
 * weighted-product pricing path may use. Every value that touches money is
 * an integer (minor units) or an exact rational (BigInt num/den); parsing
 * accepts decimal STRINGS only. There is deliberately no float entry point.
 */

/** An exact rational number: num/den, den > 0, not necessarily reduced. */
export interface ExactRational {
  readonly num: bigint;
  readonly den: bigint;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

/** Thrown when a value is not an exact non-negative decimal string. */
export class ExactnessViolation extends Error {
  constructor(detail: string) {
    super(`exact-integer violation: ${detail}`);
    this.name = "ExactnessViolation";
  }
}

/** Parse an exact non-negative decimal string ("1.24", "0.5", "42") into a rational. */
export function parseExactDecimal(value: string): ExactRational {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new ExactnessViolation(`expected an exact non-negative decimal string, got ${JSON.stringify(value)}`);
  }
  const dot = value.indexOf(".");
  if (dot === -1) return { num: BigInt(value), den: 1n };
  const digits = value.slice(0, dot) + value.slice(dot + 1);
  const scale = BigInt(value.length - dot - 1);
  return { num: BigInt(digits), den: 10n ** scale };
}

/** Multiply two rationals exactly. */
export function multiplyRationals(a: ExactRational, b: ExactRational): ExactRational {
  return { num: a.num * b.num, den: a.den * b.den };
}

/** Divide two rationals exactly. */
export function divideRationals(a: ExactRational, b: ExactRational): ExactRational {
  if (b.num === 0n) throw new ExactnessViolation("division by zero");
  return { num: a.num * b.den, den: a.den * b.num };
}

/** Subtract two rationals exactly (may be negative). */
export function subtractRationals(a: ExactRational, b: ExactRational): ExactRational {
  return { num: a.num * b.den - b.num * a.den, den: a.den * b.den };
}

/** Compare two rationals exactly: -1, 0 or 1. */
export function compareRationals(a: ExactRational, b: ExactRational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Absolute value of a rational. */
export function absRational(a: ExactRational): ExactRational {
  return { num: a.num < 0n ? -a.num : a.num, den: a.den };
}

/**
 * Round a rational to an integer BigInt, HALF_UP (round half away from
 * zero — the retail-standard label price rounding, explicit and
 * deterministic). Example: 618.76 → 619; 618.5 → 619; 618.49 → 618.
 */
export function roundRationalHalfUp(a: ExactRational): bigint {
  const negative = a.num < 0n;
  const absNum = negative ? -a.num : a.num;
  const quotient = absNum / a.den;
  const remainder = absNum % a.den;
  // Half-up on the absolute value: remainder*2 >= den rounds away from zero.
  const rounded = remainder * 2n >= a.den ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

// ---------------------------------------------------------------------------
// Mass conversion to exact milligram rationals
// ---------------------------------------------------------------------------

/** Supported weight units of the physical edge. */
export type WeightUnit = "g" | "kg" | "lb" | "oz";

/** Exact milligrams per unit (1 lb = 453.59237 g exactly, by definition). */
const MILLIGRAMS_PER_UNIT: Readonly<Record<WeightUnit, ExactRational>> = {
  g: { num: 1000n, den: 1n },
  kg: { num: 1_000_000n, den: 1n },
  lb: { num: 45_359_237n, den: 100n }, // 453592.37 mg
  oz: { num: 45_359_237n, den: 1600n }, // 28349.523125 mg
};

/** Convert a decimal amount in a weight unit into exact milligrams. */
export function toExactMilligrams(amount: string, unit: WeightUnit): ExactRational {
  return multiplyRationals(parseExactDecimal(amount), MILLIGRAMS_PER_UNIT[unit]);
}

/** Convert exact milligrams into exact kilograms. */
export function milligramsToKilograms(mg: ExactRational): ExactRational {
  return divideRationals(mg, { num: 1_000_000n, den: 1n });
}

/**
 * Format an integer minor-units amount as an exact decimal money string
 * (default 2 fractional digits — USD/EUR-class minor scale; 0 for JPY-class,
 * 3 for BHD-class). Inverse of parsing: never loses information, never
 * touches a float.
 */
export function formatMinorUnitsAsMoney(minorUnits: bigint, minorDigits: 0 | 2 | 3 = 2): string {
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  if (minorDigits === 0) return `${negative ? "-" : ""}${abs.toString()}`;
  const scale = minorDigits === 3 ? 1000n : 100n;
  const whole = abs / scale;
  const fraction = abs % scale;
  const fractionText = fraction.toString().padStart(minorDigits, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionText}`;
}
