/**
 * Contract tests — money safety (W1-001 §4.2 / INVARIANT 14).
 *
 * Every money value is integer minor units with an explicit currency.
 * No floating-point anywhere. Compile-time negatives are enforced with
 * @ts-expect-error (verified by the repo typecheck gate, not just vitest).
 */
import { describe, expect, it } from "vitest";
import {
  addMoney,
  decimal,
  compareMoney,
  currency,
  formatMoney,
  money,
  moneyEquals,
  multiplyMoneyByDecimal,
  multiplyMoneyByInteger,
  negateMoney,
  percentageBpsOfMoney,
  subtractMoney,
  sumMoney,
  type MinorUnits,
  type Money,
} from "../contract.js";

const usd = currency("USD");
const eur = currency("EUR");
const jpy = currency("JPY");
const bhd = currency("BHD");

describe("money construction and canonicalization", () => {
  it("constructs exact integer minor units", () => {
    const m = money("1999", usd);
    expect(m.amountMinor).toBe("1999");
    expect(m.currency).toBe("USD");
  });

  it("accepts bigint amounts", () => {
    expect(money(1999n, usd).amountMinor).toBe("1999");
    expect(money(-5n, usd).amountMinor).toBe("-5");
  });

  it("canonicalizes non-canonical integer strings deterministically", () => {
    expect(money("007", usd).amountMinor).toBe("7");
    expect(money("-0", usd).amountMinor).toBe("0");
    expect(money("000", usd).amountMinor).toBe("0");
  });

  it("rejects non-integer or malformed amounts", () => {
    expect(() => money("19.99", usd)).toThrow(TypeError);
    expect(() => money("1e3", usd)).toThrow(TypeError);
    expect(() => money("", usd)).toThrow(TypeError);
    expect(() => money(" 12", usd)).toThrow(TypeError);
    expect(() => money("12 ", usd)).toThrow(TypeError);
  });

  it("rejects invalid currency codes", () => {
    expect(() => currency("usd")).toThrow(TypeError);
    expect(() => currency("USDD")).toThrow(TypeError);
    expect(() => currency("U1")).toThrow(TypeError);
  });

  it("forbids floating-point money at compile time", () => {
    // @ts-expect-error — number is not an integer minor-units representation (no floating-point money)
    const fromNumber: Parameters<typeof money>[0] = 19.99;
    void fromNumber;
    // @ts-expect-error — amountMinor must be a branded MinorUnits string, never a raw number
    const asValue: Money = { currency: usd, amountMinor: 1999 };
    void asValue;
    // @ts-expect-error — an unbranded string is not a MinorUnits value
    const unbranded: MinorUnits = "1999";
    void unbranded;
    expect(true).toBe(true);
  });
});

describe("exact money arithmetic", () => {
  it("adds and subtracts exactly", () => {
    const a = money("1999", usd);
    const b = money("1", usd);
    expect(addMoney(a, b)).toMatchObject({ ok: true, value: { amountMinor: "2000" } });
    expect(subtractMoney(a, b)).toMatchObject({ ok: true, value: { amountMinor: "1998" } });
    expect(subtractMoney(b, a)).toMatchObject({ ok: true, value: { amountMinor: "-1998" } });
  });

  it("rejects mixed-currency arithmetic as a domain rejection", () => {
    const result = addMoney(money("100", usd), money("100", eur));
    expect(result).toMatchObject({ ok: false, error: { code: "CURRENCY_MISMATCH" } });
  });

  it("compares within a currency and rejects across currencies", () => {
    expect(compareMoney(money("100", usd), money("200", usd))).toMatchObject({ ok: true, value: -1 });
    expect(compareMoney(money("200", usd), money("100", usd))).toMatchObject({ ok: true, value: 1 });
    expect(compareMoney(money("200", usd), money("200", usd))).toMatchObject({ ok: true, value: 0 });
    expect(compareMoney(money("200", usd), money("200", eur))).toMatchObject({ ok: false });
  });

  it("negates without losing exactness", () => {
    expect(negateMoney(money("1999", usd)).amountMinor).toBe("-1999");
    expect(negateMoney(negateMoney(money("1999", usd))).amountMinor).toBe("1999");
  });

  it("multiplies by integer counts exactly (unit pricing)", () => {
    expect(multiplyMoneyByInteger(money("1999", usd), 2).amountMinor).toBe("3998");
    expect(multiplyMoneyByInteger(money("1999", usd), 0).amountMinor).toBe("0");
    expect(() => multiplyMoneyByInteger(money("1", usd), 1.5)).toThrow(TypeError);
  });

  it("sums homogeneous lists and rejects empty or mixed lists", () => {
    const sum = sumMoney([money("100", usd), money("250", usd)]);
    expect(sum).toMatchObject({ ok: true, value: { amountMinor: "350" } });
    expect(sumMoney([])).toMatchObject({ ok: false, error: { code: "EMPTY" } });
    expect(sumMoney([money("1", usd), money("1", eur)])).toMatchObject({ ok: false });
  });

  it("equality is value-based (currency + minor units)", () => {
    expect(moneyEquals(money("100", usd), money("100", usd))).toBe(true);
    expect(moneyEquals(money("100", usd), money("1000", usd))).toBe(false);
    expect(moneyEquals(money("100", usd), money("100", eur))).toBe(false);
  });
});

describe("deterministic rounding (explicit modes, never floats)", () => {
  it("rounds ties per the declared mode", () => {
    // 5 minor × 1000bps = 0.5 minor — an exact tie.
    expect(percentageBpsOfMoney(money("5", usd), 1000, "HALF_UP").amountMinor).toBe("1");
    expect(percentageBpsOfMoney(money("5", usd), 1000, "HALF_EVEN").amountMinor).toBe("0");
    expect(percentageBpsOfMoney(money("5", usd), 1000, "CEILING").amountMinor).toBe("1");
    expect(percentageBpsOfMoney(money("5", usd), 1000, "FLOOR").amountMinor).toBe("0");
    expect(percentageBpsOfMoney(money("5", usd), 1000, "TRUNCATE").amountMinor).toBe("0");
    // 15 minor × 1000bps = 1.5 minor — a second tie, banker's rounds to even 2.
    expect(percentageBpsOfMoney(money("15", usd), 1000, "HALF_EVEN").amountMinor).toBe("2");
    expect(percentageBpsOfMoney(money("15", usd), 1000, "HALF_UP").amountMinor).toBe("2");
  });

  it("rounds tax deterministically (825 bps of 3998 = 329.835 → 330)", () => {
    expect(percentageBpsOfMoney(money("3998", usd), 825, "HALF_UP").amountMinor).toBe("330");
    expect(percentageBpsOfMoney(money("3998", usd), 825, "FLOOR").amountMinor).toBe("329");
  });

  it("rejects invalid basis points", () => {
    expect(() => percentageBpsOfMoney(money("5", usd), -1, "HALF_UP")).toThrow(TypeError);
    expect(() => percentageBpsOfMoney(money("5", usd), 1.5, "HALF_UP")).toThrow(TypeError);
  });
});

describe("weighted/measured goods math (scenario 3 kernel)", () => {
  it("multiplies a per-kg price by an exact decimal weight", () => {
    // $4.99/kg × 0.542 kg = 270.458 minor → 270 (HALF_UP).
    const line = multiplyMoneyByDecimal(money("499", usd), decimal("0.542"), "HALF_UP");
    expect(line.amountMinor).toBe("270");
  });

  it("repeated computation is bit-stable (no float drift)", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(multiplyMoneyByDecimal(money("499", usd), decimal("0.542"), "HALF_UP").amountMinor).toBe("270");
    }
  });

  it("uses the declared rounding mode at the tie", () => {
    // 249 minor × 0.5 = 124.5 — tie.
    expect(multiplyMoneyByDecimal(money("249", usd), decimal("0.5"), "HALF_UP").amountMinor).toBe("125");
    expect(multiplyMoneyByDecimal(money("249", usd), decimal("0.5"), "HALF_EVEN").amountMinor).toBe("124");
  });
});

describe("deterministic formatting", () => {
  it("formats per currency minor digits", () => {
    expect(formatMoney(money("1999", usd))).toBe("19.99 USD");
    expect(formatMoney(money("1000", jpy))).toBe("1000 JPY");
    expect(formatMoney(money("1234", bhd))).toBe("1.234 BHD");
    expect(formatMoney(money("-150", usd))).toBe("-1.50 USD");
    expect(formatMoney(money("0", usd))).toBe("0.00 USD");
  });
});
