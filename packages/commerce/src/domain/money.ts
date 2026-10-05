/**
 * Money: integer minor units + explicit currency. Never floating point.
 *
 * Contract law (W1-001 §4.2 / INVARIANT 14):
 * - `amountMinor` is a canonical INTEGER string (e.g. "1999" = 19.99 USD).
 * - All arithmetic is exact BigInt math; division sites declare a RoundingMode.
 * - Currency mismatch is a domain rejection (Result), never silent conversion.
 */
import type { Brand } from "./ids.js";
import { decimalToRational, roundRationalToBigInt, type Decimal, type RoundingMode } from "./decimal.js";
import { err, ok, type Result } from "./result.js";

export type CurrencyCode = Brand<string, "CurrencyCode">;
export type MinorUnits = Brand<string, "MinorUnits">;

export interface Money {
  readonly currency: CurrencyCode;
  /** Canonical integer minor units, e.g. "-0" is normalized to "0". */
  readonly amountMinor: MinorUnits;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

/** ISO-4217-style currency constructor (alpha-3). */
export function currency(code: string): CurrencyCode {
  if (!CURRENCY_PATTERN.test(code)) {
    throw new TypeError(`invalid currency code: ${JSON.stringify(code)}`);
  }
  return code as CurrencyCode;
}

/** Canonicalize an integer minor-units string via BigInt ("007"→"7", "-0"→"0"). */
function canonicalMinorUnits(value: string): MinorUnits {
  if (!/^-?\d+$/.test(value)) {
    throw new TypeError(`invalid minor-units string: ${JSON.stringify(value)}`);
  }
  return BigInt(value).toString() as MinorUnits;
}

/** Construct Money from integer minor units (string or bigint). */
export function money(amountMinor: string | bigint, currencyCode: CurrencyCode): Money {
  const raw = typeof amountMinor === "bigint" ? amountMinor.toString() : amountMinor;
  return { currency: currencyCode, amountMinor: canonicalMinorUnits(raw) };
}

const MINOR_DIGITS: Readonly<Record<string, number>> = {
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, GHS: 2, NGN: 2, KES: 2, ZAR: 2,
  JPY: 0, KRW: 0, VND: 0, BHD: 3, KWD: 3, OMR: 3, TND: 3,
};

/** Minor-unit digits for a currency (ISO-4217 table subset; default 2). */
export function currencyMinorDigits(code: CurrencyCode): number {
  return MINOR_DIGITS[code] ?? 2;
}

export type MoneyError = { code: "CURRENCY_MISMATCH"; left: CurrencyCode; right: CurrencyCode };

function sameCurrency(a: Money, b: Money): Result<true, MoneyError> {
  return a.currency === b.currency
    ? ok(true)
    : err({ code: "CURRENCY_MISMATCH", left: a.currency, right: b.currency });
}

function toMinor(m: Money): bigint {
  return BigInt(m.amountMinor);
}

function fromMinor(amount: bigint, code: CurrencyCode): Money {
  return money(amount.toString(), code);
}

/** Exact addition; rejects mixed currencies. */
export function addMoney(a: Money, b: Money): Result<Money, MoneyError> {
  const guard = sameCurrency(a, b);
  if (!guard.ok) return guard;
  return ok(fromMinor(toMinor(a) + toMinor(b), a.currency));
}

/** Exact subtraction; rejects mixed currencies. */
export function subtractMoney(a: Money, b: Money): Result<Money, MoneyError> {
  const guard = sameCurrency(a, b);
  if (!guard.ok) return guard;
  return ok(fromMinor(toMinor(a) - toMinor(b), a.currency));
}

export function negateMoney(m: Money): Money {
  return fromMinor(-toMinor(m), m.currency);
}

export function isZeroMoney(m: Money): boolean {
  return toMinor(m) === 0n;
}

export function isNegativeMoney(m: Money): boolean {
  return toMinor(m) < 0n;
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/** Total order within the same currency; rejects mixed currencies. */
export function compareMoney(a: Money, b: Money): Result<-1 | 0 | 1, MoneyError> {
  const guard = sameCurrency(a, b);
  if (!guard.ok) return guard;
  const left = toMinor(a);
  const right = toMinor(b);
  return ok(left < right ? -1 : left > right ? 1 : 0);
}

/** Exact integer multiple (units × unit price). Factor must be a safe integer. */
export function multiplyMoneyByInteger(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new TypeError(`money factor must be a safe integer: ${factor}`);
  }
  return fromMinor(toMinor(m) * BigInt(factor), m.currency);
}

/**
 * Exact multiplication by a decimal quantity with an explicit rounding mode —
 * the weighted/measured-goods kernel (e.g. 4.99/kg × 0.542 kg).
 */
export function multiplyMoneyByDecimal(m: Money, factor: Decimal, mode: RoundingMode): Money {
  const rational = decimalToRational(factor);
  const numerator = toMinor(m) * rational.numerator;
  const denominator = rational.denominator;
  return fromMinor(roundRationalToBigInt(numerator, denominator, mode), m.currency);
}

/**
 * Integer basis points of an amount (e.g. tax 825 bps, discount 1500 bps),
 * deterministically rounded. `basisPoints` must be a non-negative safe integer.
 */
export function percentageBpsOfMoney(m: Money, basisPoints: number, mode: RoundingMode): Money {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new TypeError(`basisPoints must be a non-negative safe integer: ${basisPoints}`);
  }
  const numerator = toMinor(m) * BigInt(basisPoints);
  return fromMinor(roundRationalToBigInt(numerator, 10000n, mode), m.currency);
}

/** Fold addition over a money list; fails on mixed currency or empty list. */
export function sumMoney(amounts: readonly Money[]): Result<Money, MoneyError | { code: "EMPTY" }> {
  if (amounts.length === 0) return err({ code: "EMPTY" });
  let total = toMinor(amounts[0] as Money);
  const code = (amounts[0] as Money).currency;
  for (const amount of amounts.slice(1)) {
    if (amount.currency !== code) {
      return err({ code: "CURRENCY_MISMATCH", left: code, right: amount.currency });
    }
    total += toMinor(amount);
  }
  return ok(fromMinor(total, code));
}

/** Deterministic human-readable rendering, e.g. "19.99 USD". */
export function formatMoney(m: Money): string {
  const digits = currencyMinorDigits(m.currency);
  const negative = toMinor(m) < 0n;
  const magnitude = (negative ? -toMinor(m) : toMinor(m)).toString().padStart(digits + 1, "0");
  const body =
    digits === 0
      ? magnitude
      : `${magnitude.slice(0, magnitude.length - digits)}.${magnitude.slice(magnitude.length - digits)}`;
  return `${negative ? "-" : ""}${body} ${m.currency}`;
}
