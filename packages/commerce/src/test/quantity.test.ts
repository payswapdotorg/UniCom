/**
 * Contract tests — quantities, measurements and exact decimal semantics.
 */
import { describe, expect, it } from "vitest";
import {
  countQuantity,
  decimal,
  decimalAdd,
  decimalCompare,
  decimalMultiply,
  decimalNegate,
  decimalScale,
  measuredQuantity,
  quantityEquals,
  sumMeasurements,
  unitFamily,
  unitOfMeasure,
} from "../contract.js";

const kg = unitOfMeasure("KG");
const d = decimal;

describe("decimal exactness", () => {
  it("constructs canonical decimal strings and rejects malformed ones", () => {
    expect(d("0.542")).toBe("0.542");
    expect(d("3")).toBe("3");
    expect(() => d("0,5")).toThrow(TypeError);
    expect(() => d(".5")).toThrow(TypeError);
    expect(() => d("1.")).toThrow(TypeError);
    expect(() => d("01.5")).toThrow(TypeError);
    expect(() => d("1e3")).toThrow(TypeError);
  });

  it("forbids raw strings where Decimals are required (compile time)", () => {
    // @ts-expect-error — an unvalidated string is not a Decimal
    const raw: ReturnType<typeof decimal> = "0.542";
    void raw;
    expect(true).toBe(true);
  });

  it("adds with aligned scale", () => {
    expect(decimalAdd(d("0.542"), d("1.1"))).toBe("1.642");
    expect(decimalAdd(d("0.10"), d("0.90"))).toBe("1.00");
    expect(decimalAdd(d("2"), d("3"))).toBe("5");
  });

  it("multiplies exactly", () => {
    expect(decimalMultiply(d("1.5"), d("0.5"))).toBe("0.75");
    expect(decimalMultiply(d("0.542"), d("1000"))).toBe("542.000");
  });

  it("compares values exactly regardless of representation scale", () => {
    expect(decimalCompare(d("0.10"), d("0.1"))).toBe(0);
    expect(decimalCompare(d("1.01"), d("1.001"))).toBe(1);
    expect(decimalCompare(d("-0.5"), d("0.1"))).toBe(-1);
  });

  it("preserves scale and negation", () => {
    expect(decimalScale(d("0.542"))).toBe(3);
    expect(decimalScale(d("5"))).toBe(0);
    expect(decimalNegate(d("0.542"))).toBe("-0.542");
    expect(decimalNegate(d("-3"))).toBe("3");
  });
});

describe("quantities", () => {
  it("count quantities are non-negative safe integers", () => {
    expect(countQuantity(2).units).toBe(2);
    expect(() => countQuantity(-1)).toThrow(TypeError);
    expect(() => countQuantity(1.5)).toThrow(TypeError);
    expect(() => countQuantity(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });

  it("measured quantities carry an exact magnitude and unit", () => {
    const q = measuredQuantity("0.542", kg);
    expect(q.kind).toBe("MEASUREMENT");
    expect(q.magnitude).toBe("0.542");
    expect(q.unit).toBe("KG");
  });

  it("equality is kind-aware and exact", () => {
    expect(quantityEquals(countQuantity(2), countQuantity(2))).toBe(true);
    expect(quantityEquals(countQuantity(2), countQuantity(3))).toBe(false);
    expect(quantityEquals(measuredQuantity("1.0", kg), measuredQuantity("1.00", kg))).toBe(true);
    expect(quantityEquals(measuredQuantity("1.0", kg), measuredQuantity("1.1", kg))).toBe(false);
  });

  it("sums same-unit measurements exactly", () => {
    const total = sumMeasurements([
      measuredQuantity("0.542", kg),
      measuredQuantity("1.1", kg),
      measuredQuantity("0.358", kg),
    ]);
    expect(total?.magnitude).toBe("2.000");
    expect(() =>
      sumMeasurements([measuredQuantity("1", kg), measuredQuantity("1", unitOfMeasure("L"))]),
    ).toThrow(TypeError);
  });

  it("units map to families", () => {
    expect(unitFamily(kg)).toBe("MASS");
    expect(unitFamily(unitOfMeasure("L"))).toBe("VOLUME");
    expect(unitFamily(unitOfMeasure("EACH"))).toBe("COUNT");
    expect(unitFamily(unitOfMeasure("PAL"))).toBe("CUSTOM");
    expect(() => unitOfMeasure("k g")).toThrow(TypeError);
  });
});
