/**
 * W1-009 portfolio — per-industry project-template DATA (group 1 of 4).
 *
 * Industries: construction, finance-banking-accounting,
 * sales-business-development, technology-software-it-services.
 *
 * Split from the original templates-data.ts to comply with the
 * architecture-policy max-file-lines (400) rule.
 */
import type { ProjectTemplate } from "./schema.js";

export interface TemplateSeed {
  readonly templateId: string;
  readonly title: string;
  readonly commerceScope: string;
  readonly lines: ReadonlyArray<{
    readonly lineId: string;
    readonly sku: string;
    readonly description: string;
    readonly basePriceMinor: number;
    readonly currency: string;
    readonly quantityMode: "COUNT" | "MEASURED";
    readonly quantityUom?: string;
    readonly baseQuantity: number;
    readonly substitutes: readonly string[];
    readonly evidenceRequired: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  }>;
  readonly baseBudgetMinor: number;
  readonly budgetCurrency: string;
  readonly hardDeadlineDays: number;
  readonly softDeadlineDays: number;
  readonly qualityDimension: string;
  readonly qualityMin: string;
  readonly deliveryMode: ProjectTemplate["delivery"]["mode"];
  readonly deliveryLocationPrefix: string;
  readonly returnsAllowed: boolean;
  readonly returnsWindowDays: number;
  readonly returnsRecourse: ProjectTemplate["returns"]["recourse"];
  readonly evidenceRequired: readonly string[];
  readonly approvalMaxAmountMinor: number;
}

export const TEMPLATES_GROUP_1: Readonly<Record<string, readonly TemplateSeed[]>> = {
  construction: [
    {
      templateId: "construction-materials-procurement",
      title: "Phase materials procurement (concrete + rebar + formwork)",
      commerceScope: "materials-and-parts-sourcing",
      lines: [
        { lineId: "L01", sku: "sku-rebar-10mm", description: "Rebar 10mm × 6m", basePriceMinor: 1250, currency: "USD", quantityMode: "COUNT", baseQuantity: 240, substitutes: ["sku-rebar-12mm"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-concrete-mix", description: "Ready-mix concrete 30 MPa", basePriceMinor: 14500, currency: "USD", quantityMode: "MEASURED", quantityUom: "M3", baseQuantity: 18, substitutes: ["sku-concrete-25mpa"], evidenceRequired: "P2" },
        { lineId: "L03", sku: "sku-formwork-plywood", description: "Formwork plywood 18mm", basePriceMinor: 3800, currency: "USD", quantityMode: "COUNT", baseQuantity: 60, substitutes: ["sku-formwork-steel"], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 350000,
      budgetCurrency: "USD",
      hardDeadlineDays: 35,
      softDeadlineDays: 28,
      qualityDimension: "GRADE",
      qualityMin: "B+",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-site",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 50000,
    },
    {
      templateId: "construction-equipment-rental",
      title: "Equipment rental vs buy (excavator + mixer)",
      commerceScope: "rental-vs-purchase",
      lines: [
        { lineId: "L01", sku: "sku-excavator-5t", description: "Excavator 5t weekly rental", basePriceMinor: 220000, currency: "USD", quantityMode: "COUNT", baseQuantity: 4, substitutes: ["sku-excavator-8t"], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-mixer-350l", description: "Concrete mixer 350L", basePriceMinor: 18500, currency: "USD", quantityMode: "COUNT", baseQuantity: 2, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 950000,
      budgetCurrency: "USD",
      hardDeadlineDays: 28,
      softDeadlineDays: 21,
      qualityDimension: "CONDITION",
      qualityMin: "B",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-site",
      returnsAllowed: true,
      returnsWindowDays: 14,
      returnsRecourse: "REPLACEMENT",
      evidenceRequired: ["RENTAL_AGREEMENT", "DELIVERY_RECEIPT"],
      approvalMaxAmountMinor: 100000,
    },
  ],
  "finance-banking-accounting": [
    {
      templateId: "office-supplies-quarterly",
      title: "Quarterly office supplies procurement",
      commerceScope: "approved-buying-vendor-sourcing-procurement",
      lines: [
        { lineId: "L01", sku: "sku-paper-a4", description: "A4 paper (5000 sheets)", basePriceMinor: 4500, currency: "USD", quantityMode: "COUNT", baseQuantity: 40, substitutes: ["sku-paper-a3"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-toner-laserjet", description: "Toner cartridge", basePriceMinor: 8900, currency: "USD", quantityMode: "COUNT", baseQuantity: 18, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-pens-box", description: "Pens box of 50", basePriceMinor: 1200, currency: "USD", quantityMode: "COUNT", baseQuantity: 25, substitutes: [], evidenceRequired: "P0" },
      ],
      baseBudgetMinor: 250000,
      budgetCurrency: "USD",
      hardDeadlineDays: 14,
      softDeadlineDays: 10,
      qualityDimension: "GRADE",
      qualityMin: "B",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-office",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 25000,
    },
    {
      templateId: "saas-renewal-savings",
      title: "SaaS subscription renewal savings analysis",
      commerceScope: "subscription-renewal-savings",
      lines: [
        { lineId: "L01", sku: "sku-saas-analytics", description: "Analytics seat annual", basePriceMinor: 144000, currency: "USD", quantityMode: "COUNT", baseQuantity: 50, substitutes: ["sku-saas-analytics-alt"], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-saas-crm", description: "CRM seat annual", basePriceMinor: 96000, currency: "USD", quantityMode: "COUNT", baseQuantity: 50, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 1200000,
      budgetCurrency: "USD",
      hardDeadlineDays: 30,
      softDeadlineDays: 21,
      qualityDimension: "TIER",
      qualityMin: "STANDARD",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-office",
      returnsAllowed: false,
      returnsWindowDays: 0,
      returnsRecourse: "NONE",
      evidenceRequired: ["CONTRACT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
  ],
  "sales-business-development": [
    {
      templateId: "b2b-catalog-order",
      title: "B2B catalog order with wholesale discount",
      commerceScope: "b2b-catalog-quote-promotion-order-returns",
      lines: [
        { lineId: "L01", sku: "sku-apparel-tee", description: "T-shirt (wholesale)", basePriceMinor: 650, currency: "USD", quantityMode: "COUNT", baseQuantity: 500, substitutes: ["sku-apparel-tee-premium"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-apparel-hoodie", description: "Hoodie (wholesale)", basePriceMinor: 1850, currency: "USD", quantityMode: "COUNT", baseQuantity: 250, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 800000,
      budgetCurrency: "USD",
      hardDeadlineDays: 21,
      softDeadlineDays: 14,
      qualityDimension: "GRADE",
      qualityMin: "A",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-warehouse",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
    {
      templateId: "group-buy-proposal",
      title: "Group-buy proposal + merchant negotiation",
      commerceScope: "group-buy-proposal",
      lines: [
        { lineId: "L01", sku: "sku-electronics-batch", description: "Electronics batch (group-buy)", basePriceMinor: 25000, currency: "USD", quantityMode: "COUNT", baseQuantity: 40, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 1000000,
      budgetCurrency: "USD",
      hardDeadlineDays: 45,
      softDeadlineDays: 35,
      qualityDimension: "GRADE",
      qualityMin: "A",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-warehouse",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["GROUP_BUY_AGREEMENT", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 250000,
    },
  ],
  "technology-software-it-services": [
    {
      templateId: "hardware-refresh-procurement",
      title: "Hardware refresh procurement (laptops + accessories)",
      commerceScope: "hardware-saas-procurement-renewal-resale",
      lines: [
        { lineId: "L01", sku: "sku-laptop-pro-14", description: "Pro laptop 14-inch", basePriceMinor: 189900, currency: "USD", quantityMode: "COUNT", baseQuantity: 25, substitutes: ["sku-laptop-pro-15"], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-monitor-27", description: "27-inch monitor", basePriceMinor: 32900, currency: "USD", quantityMode: "COUNT", baseQuantity: 25, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-dock-usb-c", description: "USB-C dock", basePriceMinor: 14900, currency: "USD", quantityMode: "COUNT", baseQuantity: 25, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 6500000,
      budgetCurrency: "USD",
      hardDeadlineDays: 21,
      softDeadlineDays: 14,
      qualityDimension: "TIER",
      qualityMin: "PREMIUM",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-office",
      returnsAllowed: true,
      returnsWindowDays: 45,
      returnsRecourse: "REPLACEMENT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE", "ASSET_TAG"],
      approvalMaxAmountMinor: 250000,
    },
    {
      templateId: "saas-license-renewal",
      title: "SaaS license renewal + resale old devices",
      commerceScope: "subscription-renewal-savings-resale",
      lines: [
        { lineId: "L01", sku: "sku-saas-ide-seat", description: "IDE seat annual", basePriceMinor: 24000, currency: "USD", quantityMode: "COUNT", baseQuantity: 30, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-saas-ci-minutes", description: "CI minutes bundle", basePriceMinor: 9900, currency: "USD", quantityMode: "COUNT", baseQuantity: 12, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 850000,
      budgetCurrency: "USD",
      hardDeadlineDays: 30,
      softDeadlineDays: 21,
      qualityDimension: "TIER",
      qualityMin: "STANDARD",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-office",
      returnsAllowed: false,
      returnsWindowDays: 0,
      returnsRecourse: "NONE",
      evidenceRequired: ["CONTRACT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
  ],
};
