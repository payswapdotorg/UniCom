/**
 * Quantities: integer counts (safe integers) and exact measurements (decimal
 * strings + unit of measure) for weighted/volumetric/length-priced goods.
 *
 * Quantities are NOT money: counts may be plain numbers (validated as safe
 * non-negative integers); measurements are exact decimal strings.
 */
import type { Brand } from "./ids.js";
import { decimal, decimalAdd, decimalCompare, type Decimal } from "./decimal.js";

export type UnitFamily = "MASS" | "VOLUME" | "LENGTH" | "AREA" | "COUNT" | "TIME" | "CUSTOM";

export type UnitOfMeasure = Brand<string, "UnitOfMeasure">;

const UNIT_PATTERN = /^[A-Z0-9]{1,12}$/u;
const UNIT_FAMILIES: Readonly<Record<string, UnitFamily>> = {
  EACH: "COUNT", KG: "MASS", G: "MASS", LB: "MASS", OZ: "MASS",
  L: "VOLUME", ML: "VOLUME", GAL: "VOLUME",
  M: "LENGTH", CM: "LENGTH", IN: "LENGTH", FT: "LENGTH",
  SQM: "AREA", SQFT: "AREA",
  SEC: "TIME", MIN: "TIME", HOUR: "TIME", DAY: "TIME",
};

/** Construct a unit of measure; family defaults from a known table. */
export function unitOfMeasure(code: string, family?: UnitFamily): UnitOfMeasure {
  if (!UNIT_PATTERN.test(code)) {
    throw new TypeError(`invalid unit code: ${JSON.stringify(code)}`);
  }
  return code as UnitOfMeasure;
}

export function unitFamily(unit: UnitOfMeasure): UnitFamily {
  return UNIT_FAMILIES[unit] ?? "CUSTOM";
}

/** A countable quantity (units). Safe non-negative integer. */
export interface CountQuantity {
  readonly kind: "COUNT";
  readonly units: number;
}

/** A measured quantity (weight/volume/length/…). Exact decimal magnitude. */
export interface MeasurementQuantity {
  readonly kind: "MEASUREMENT";
  readonly magnitude: Decimal;
  readonly unit: UnitOfMeasure;
}

export type Quantity = CountQuantity | MeasurementQuantity;

export function countQuantity(units: number): CountQuantity {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new TypeError(`count quantity must be a non-negative safe integer: ${units}`);
  }
  return { kind: "COUNT", units };
}

export function measuredQuantity(magnitude: string, unit: UnitOfMeasure): MeasurementQuantity {
  return { kind: "MEASUREMENT", magnitude: decimal(magnitude), unit };
}

/** Units of a COUNT quantity; measurements have no unit count. */
export function countUnits(quantity: Quantity): number | undefined {
  return quantity.kind === "COUNT" ? quantity.units : undefined;
}

export function quantityEquals(a: Quantity, b: Quantity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "COUNT" && b.kind === "COUNT") return a.units === b.units;
  if (a.kind === "MEASUREMENT" && b.kind === "MEASUREMENT") {
    return a.unit === b.unit && decimalCompare(a.magnitude, b.magnitude) === 0;
  }
  return false;
}

export function isMeasurementQuantity(quantity: Quantity): quantity is MeasurementQuantity {
  return quantity.kind === "MEASUREMENT";
}

/** Exact sum of same-unit measurements (deterministic scale = max operand scale). */
export function sumMeasurements(
  quantities: readonly MeasurementQuantity[],
): MeasurementQuantity | undefined {
  if (quantities.length === 0) return undefined;
  const unit = (quantities[0] as MeasurementQuantity).unit;
  for (const quantity of quantities) {
    if (quantity.unit !== unit) {
      throw new TypeError(`mixed units: ${quantity.unit} vs ${unit}`);
    }
  }
  let total = (quantities[0] as MeasurementQuantity).magnitude;
  for (const quantity of quantities.slice(1)) total = decimalAdd(total, quantity.magnitude);
  return { kind: "MEASUREMENT", magnitude: total, unit };
}
