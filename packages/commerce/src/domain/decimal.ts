/**
 * Exact decimal arithmetic on canonical decimal strings.
 *
 * Contract law: money never uses floating-point. Quantities that are not integer
 * counts (weight, volume, length) are represented as decimal STRINGS and all
 * arithmetic is performed on BigInt rationals — exactly, deterministically,
 * offline. No `number` arithmetic anywhere in this module.
 */

export type Decimal = string & { readonly __commerceBrand: "Decimal" };

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

/** Rounding modes available to money/quantity math. Deterministic, total. */
export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "FLOOR" | "CEILING" | "TRUNCATE";

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** Parse a decimal string into an exact rational. Throws on malformed input. */
export function decimalToRational(value: Decimal): Rational {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new TypeError(`invalid decimal string: ${JSON.stringify(value)}`);
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const point = body.indexOf(".");
  const digits = point === -1 ? body : body.slice(0, point) + body.slice(point + 1);
  const scale = point === -1 ? 0 : body.length - point - 1;
  const magnitude = BigInt(digits === "" ? "0" : digits);
  const numerator = negative ? -magnitude : magnitude;
  return { numerator, denominator: 10n ** BigInt(scale) };
}

/** Validate and construct a canonical decimal string (scale preserved). */
export function decimal(value: string): Decimal {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new TypeError(`invalid decimal string: ${JSON.stringify(value)}`);
  return value as Decimal;
}

/** Number of fractional digits in the canonical string form. */
export function decimalScale(value: Decimal): number {
  const point = value.indexOf(".");
  return point === -1 ? 0 : value.length - point - 1;
}

/** Compare two decimals exactly: -1, 0, or 1. */
export function decimalCompare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const left = decimalToRational(a);
  const right = decimalToRational(b);
  return compareRationals(left, right);
}

export function compareRationals(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Exact addition; result scale is the max of the operand scales. */
export function decimalAdd(a: Decimal, b: Decimal): Decimal {
  const left = decimalToRational(a);
  const right = decimalToRational(b);
  const scale = BigInt(Math.max(decimalScale(a), decimalScale(b)));
  const numerator =
    left.numerator * (10n ** scale / left.denominator) +
    right.numerator * (10n ** scale / right.denominator);
  return formatExact(numerator, scale);
}

/** Exact multiplication; result scale is the sum of the operand scales. */
export function decimalMultiply(a: Decimal, b: Decimal): Decimal {
  const left = decimalToRational(a);
  const right = decimalToRational(b);
  const scale = BigInt(decimalScale(a) + decimalScale(b));
  return formatExact(left.numerator * right.numerator, scale);
}

export function decimalNegate(a: Decimal): Decimal {
  return (a.startsWith("-") ? a.slice(1) : `-${a}`) as Decimal;
}

export function decimalIsZero(a: Decimal): boolean {
  return decimalToRational(a).numerator === 0n;
}

/** True when the decimal has no fractional part (e.g. "3", "3.0" → false, "3" → true). */
export function decimalIsIntegral(a: Decimal): boolean {
  return decimalScale(a) === 0 || decimalToRational(a).numerator % 10n ** BigInt(decimalScale(a)) === 0n;
}

/** Render an exact signed integer over 10^scale as a canonical decimal string (scale preserved). */
export function formatExact(numerator: bigint, scale: bigint): Decimal {
  if (scale < 0n) throw new TypeError("negative scale");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const scaleNumber = Number(scale);
  const digits = magnitude.toString().padStart(scaleNumber + 1, "0");
  const intPart = scaleNumber === 0 ? digits : digits.slice(0, digits.length - scaleNumber);
  const fracPart = scaleNumber === 0 ? "" : `.${digits.slice(digits.length - scaleNumber)}`;
  const body = intPart + fracPart;
  return (negative && magnitude !== 0n ? `-${body}` : body) as Decimal;
}

/**
 * Deterministic rounding of numerator/denominator to an integer BigInt.
 * HALF_UP rounds ties away from zero (the commerce default).
 */
export function roundRationalToBigInt(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  if (denominator === 0n) throw new TypeError("division by zero");
  if (denominator < 0n) return roundRationalToBigInt(numerator, -denominator, mode);
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const twice = remainder * 2n;
  let rounded: bigint;
  switch (mode) {
    case "TRUNCATE":
      rounded = quotient;
      break;
    case "FLOOR":
      rounded = negative && remainder !== 0n ? quotient + 1n : quotient;
      return negative ? -rounded : rounded;
    case "CEILING":
      rounded = remainder !== 0n ? quotient + 1n : quotient;
      return negative ? -rounded : rounded;
    case "HALF_UP":
      rounded = twice >= denominator ? quotient + 1n : quotient;
      break;
    case "HALF_EVEN": {
      if (twice === denominator) {
        rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
      } else {
        rounded = twice > denominator ? quotient + 1n : quotient;
      }
      break;
    }
  }
  return negative ? -rounded : rounded;
}
