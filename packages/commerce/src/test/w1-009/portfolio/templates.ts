/**
 * W1-009 portfolio — per-industry project-template builder.
 *
 * Each industry has a small library of commerce-only project templates.
 * The builder selects templates deterministically from the seed and fills
 * them with seed-driven purchasing lists, quantities, budgets, deadlines,
 * supplier options, approvals, substitutions, delivery modes, returns and
 * evidence requirements.
 *
 * Commerce-only scope (per W1-009 work-order clarification): no general PM,
 * engineering design, clinical care, dispatch, creative production, legal
 * matter-management or classified operations. Only the commerce inside the
 * industry project.
 */
import type {
  FirmSize,
  ProjectTemplate,
  PurchasingLineDescriptor,
  QuantityDescriptor,
  SupplierOptionDescriptor,
} from "./schema.js";
import type { SeededRng } from "./rng.js";
import { FIRM_SIZES } from "./industries.js";
import { templatesForIndustry, type TemplateSeed } from "./templates-data.js";

const SIZE_BUDGET_MULTIPLIER: Readonly<Record<FirmSize, number>> = {
  small: 1,
  medium: 4,
  large: 25,
};

const SIZE_QUANTITY_MULTIPLIER: Readonly<Record<FirmSize, number>> = {
  small: 1,
  medium: 3,
  large: 12,
};

const SIZE_STAFF_THRESHOLD: Readonly<Record<FirmSize, number>> = {
  small: 25,
  medium: 150,
  large: 1000,
};

export function buildProjectTemplate(
  industryId: string,
  size: FirmSize,
  idx: number,
  rng: SeededRng,
): ProjectTemplate {
  const templates = templatesForIndustry(industryId);
  const template = templates[(idx - 1) % templates.length] ?? templates[0]!;
  const budgetMult = SIZE_BUDGET_MULTIPLIER[size];
  const qtyMult = SIZE_QUANTITY_MULTIPLIER[size];
  void SIZE_STAFF_THRESHOLD;
  void FIRM_SIZES;

  const lines: PurchasingLineDescriptor[] = template.lines.map((line) => {
    const quantity = buildQuantity(line, qtyMult, rng);
    const unitPriceMinor = String(line.basePriceMinor + rng.nextInt(-25, 75));
    const supplierOptions = buildSupplierOptions(line.basePriceMinor, rng);
    return {
      lineId: line.lineId,
      sku: line.sku,
      description: line.description,
      quantity,
      unitPriceMinor,
      currency: line.currency,
      supplierOptions,
      substitutes: line.substitutes,
      evidenceRequired: line.evidenceRequired,
    };
  });

  const totalMinor = String(template.baseBudgetMinor * budgetMult);
  const hardDeadline = addDays(template.hardDeadlineDays);
  const softDeadline = addDays(template.softDeadlineDays);

  return {
    templateId: template.templateId,
    title: template.title,
    commerceScope: template.commerceScope,
    applicableJourneyFamilies: [], // filled in by the generator
    purchasingList: lines,
    budget: { totalMinor, currency: template.budgetCurrency },
    deadline: { hard: hardDeadline, soft: softDeadline },
    qualityThresholds: [{ dimension: template.qualityDimension, min: template.qualityMin }],
    approvals: [
      { step: 1, roleFamily: "procurement", action: "REQUEST_PURCHASE" },
      { step: 2, roleFamily: "approver", action: "APPROVE_PURCHASE", maxAmountMinor: String(template.approvalMaxAmountMinor) },
      { step: 3, roleFamily: "finance", action: "RECONCILE_INVOICE" },
    ],
    delivery: { mode: template.deliveryMode, location: `${template.deliveryLocationPrefix}-${size}-${idx}` },
    returns: {
      allowed: template.returnsAllowed,
      windowDays: template.returnsWindowDays,
      recourse: template.returnsRecourse,
    },
    evidenceRequired: template.evidenceRequired,
  };
}

function buildQuantity(
  line: TemplateSeed["lines"][number],
  qtyMult: number,
  rng: SeededRng,
): QuantityDescriptor {
  if (line.quantityMode === "COUNT") {
    const scaled = line.baseQuantity * qtyMult;
    const jitter = rng.nextInt(-Math.max(1, Math.floor(scaled * 0.05)), Math.floor(scaled * 0.05));
    return { kind: "COUNT", units: Math.max(1, scaled + jitter) };
  }
  // MEASURED — expressed as decimal kilograms (string, no float)
  const scaled = line.baseQuantity * qtyMult;
  const grams = scaled * 1000 + rng.nextInt(-50, 50);
  return { kind: "MEASURED", amount: `${Math.max(1, grams)}`, uom: line.quantityUom ?? "KG" };
}

function buildSupplierOptions(
  basePrice: number,
  rng: SeededRng,
): SupplierOptionDescriptor[] {
  const suppliers = rng.shuffle(["sup-a", "sup-b", "sup-c", "sup-d"]).slice(0, rng.nextInt(2, 3));
  const tiers = ["STANDARD", "PREMIUM", "ECONOMY"] as const;
  return suppliers.map((supplierId, i) => ({
    supplierId,
    quoteMinor: String(Math.max(1, basePrice + rng.nextInt(-75, 75) + i * 25)),
    leadTimeDays: rng.nextInt(1, 14),
    qualityTier: tiers[rng.nextInt(0, tiers.length - 1)] ?? "STANDARD",
  }));
}

function addDays(days: number): string {
  // Use the program's frozen DETERMINISTIC_EPOCH (2026-10-05) — never wall-clock.
  // Format: YYYY-MM-DD (date-only).
  const epochMs = Date.parse("2026-10-05T00:00:00Z");
  const target = new Date(epochMs + days * 86_400_000);
  return target.toISOString().slice(0, 10);
}
