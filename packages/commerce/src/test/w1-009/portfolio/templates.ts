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

interface TemplateSeed {
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

const TEMPLATES_BY_INDUSTRY: Readonly<Record<string, readonly TemplateSeed[]>> = {
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
  "healthcare-organizations": [
    {
      templateId: "medical-supplies-restock",
      title: "Medical supplies restock (gloves + syringes + gauze)",
      commerceScope: "medical-supplies-equipment-procurement-recall-holds",
      lines: [
        { lineId: "L01", sku: "sku-gloves-nitrile", description: "Nitrile gloves (box of 100)", basePriceMinor: 850, currency: "USD", quantityMode: "COUNT", baseQuantity: 500, substitutes: ["sku-gloves-latex"], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-syringes-10ml", description: "10ml syringes (case of 100)", basePriceMinor: 3200, currency: "USD", quantityMode: "COUNT", baseQuantity: 80, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L03", sku: "sku-gauze-4x4", description: "Gauze 4×4 (case of 200)", basePriceMinor: 2100, currency: "USD", quantityMode: "COUNT", baseQuantity: 60, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 950000,
      budgetCurrency: "USD",
      hardDeadlineDays: 14,
      softDeadlineDays: 10,
      qualityDimension: "GRADE",
      qualityMin: "MEDICAL",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-clinic",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE", "LOT_SERIAL"],
      approvalMaxAmountMinor: 100000,
    },
    {
      templateId: "recall-hold-procurement",
      title: "Recall-related purchasing hold + alternate sourcing",
      commerceScope: "recall-related-purchasing-holds",
      lines: [
        { lineId: "L01", sku: "sku-iv-set-recalled", description: "IV set (recalled)", basePriceMinor: 0, currency: "USD", quantityMode: "COUNT", baseQuantity: 0, substitutes: ["sku-iv-set-v2"], evidenceRequired: "P3" },
        { lineId: "L02", sku: "sku-iv-set-v2", description: "IV set replacement", basePriceMinor: 5400, currency: "USD", quantityMode: "COUNT", baseQuantity: 120, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 750000,
      budgetCurrency: "USD",
      hardDeadlineDays: 7,
      softDeadlineDays: 5,
      qualityDimension: "GRADE",
      qualityMin: "MEDICAL",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-clinic",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["RECALL_NOTICE", "PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
  ],
  "transportation-delivery": [
    {
      templateId: "fleet-parts-procurement",
      title: "Fleet parts procurement (tires + filters + oil)",
      commerceScope: "fleet-parts-tires-fuel-rental-vs-buy",
      lines: [
        { lineId: "L01", sku: "sku-tire-225-65r17", description: "Tire 225/65R17", basePriceMinor: 14500, currency: "USD", quantityMode: "COUNT", baseQuantity: 80, substitutes: ["sku-tire-225-65r17-alt"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-oil-filter", description: "Oil filter", basePriceMinor: 850, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: [], evidenceRequired: "P0" },
        { lineId: "L03", sku: "sku-engine-oil-5w30", description: "Engine oil 5W-30 (5qt)", basePriceMinor: 3200, currency: "USD", quantityMode: "COUNT", baseQuantity: 100, substitutes: ["sku-engine-oil-0w20"], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 1500000,
      budgetCurrency: "USD",
      hardDeadlineDays: 14,
      softDeadlineDays: 10,
      qualityDimension: "GRADE",
      qualityMin: "OE",
      deliveryMode: "PICKUP",
      deliveryLocationPrefix: "loc-depot",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
    {
      templateId: "equipment-rental-vs-buy",
      title: "Equipment rental vs purchase (lift + diagnostic)",
      commerceScope: "rental-vs-purchase",
      lines: [
        { lineId: "L01", sku: "sku-lift-2t-rental", description: "2t lift weekly rental", basePriceMinor: 85000, currency: "USD", quantityMode: "COUNT", baseQuantity: 4, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-diagnostic-scan", description: "Diagnostic scanner", basePriceMinor: 320000, currency: "USD", quantityMode: "COUNT", baseQuantity: 1, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 700000,
      budgetCurrency: "USD",
      hardDeadlineDays: 21,
      softDeadlineDays: 14,
      qualityDimension: "GRADE",
      qualityMin: "B",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-depot",
      returnsAllowed: true,
      returnsWindowDays: 14,
      returnsRecourse: "REPLACEMENT",
      evidenceRequired: ["RENTAL_AGREEMENT", "DELIVERY_RECEIPT"],
      approvalMaxAmountMinor: 200000,
    },
  ],
  "hospitality-restaurants-hotels": [
    {
      templateId: "food-supplies-order",
      title: "Food supplies weekly order (with weighted goods)",
      commerceScope: "food-beverage-linen-supplier-ordering-pos",
      lines: [
        { lineId: "L01", sku: "sku-tomato-roma", description: "Roma tomatoes (weighted)", basePriceMinor: 199, currency: "USD", quantityMode: "MEASURED", quantityUom: "KG", baseQuantity: 40, substitutes: ["sku-tomato-vine"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-flour-25kg", description: "Flour 25kg bag", basePriceMinor: 1850, currency: "USD", quantityMode: "COUNT", baseQuantity: 30, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-chicken-breast", description: "Chicken breast (weighted)", basePriceMinor: 499, currency: "USD", quantityMode: "MEASURED", quantityUom: "KG", baseQuantity: 25, substitutes: ["sku-chicken-thigh"], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 95000,
      budgetCurrency: "USD",
      hardDeadlineDays: 7,
      softDeadlineDays: 5,
      qualityDimension: "FRESHNESS",
      qualityMin: "A",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-restaurant",
      returnsAllowed: true,
      returnsWindowDays: 2,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 25000,
    },
    {
      templateId: "event-group-buy",
      title: "Banquet event group-buy (linens + cutlery)",
      commerceScope: "event-group-buy",
      lines: [
        { lineId: "L01", sku: "sku-linen-tablecloth", description: "Tablecloth", basePriceMinor: 850, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-cutlery-set", description: "Cutlery set (case of 24)", basePriceMinor: 4200, currency: "USD", quantityMode: "COUNT", baseQuantity: 25, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 250000,
      budgetCurrency: "USD",
      hardDeadlineDays: 14,
      softDeadlineDays: 10,
      qualityDimension: "GRADE",
      qualityMin: "A",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-venue",
      returnsAllowed: true,
      returnsWindowDays: 7,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 50000,
    },
  ],
  "fashion-apparel-retail-brands": [
    {
      templateId: "trims-procurement",
      title: "Trims procurement (buttons + zippers + labels)",
      commerceScope: "supplier-trims-procurement",
      lines: [
        { lineId: "L01", sku: "sku-button-12mm", description: "12mm buttons (card of 100)", basePriceMinor: 350, currency: "USD", quantityMode: "COUNT", baseQuantity: 100, substitutes: ["sku-button-14mm"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-zipper-25cm", description: "25cm zipper", basePriceMinor: 180, currency: "USD", quantityMode: "COUNT", baseQuantity: 500, substitutes: [], evidenceRequired: "P0" },
        { lineId: "L03", sku: "sku-label-woven", description: "Woven label (roll of 1000)", basePriceMinor: 950, currency: "USD", quantityMode: "COUNT", baseQuantity: 20, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 125000,
      budgetCurrency: "USD",
      hardDeadlineDays: 30,
      softDeadlineDays: 21,
      qualityDimension: "GRADE",
      qualityMin: "A",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-factory",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 50000,
    },
    {
      templateId: "resale-consignment-batch",
      title: "Resale + consignment batch (returned inventory)",
      commerceScope: "rental-resale-consignment",
      lines: [
        { lineId: "L01", sku: "sku-returns-batch", description: "Returns batch (graded)", basePriceMinor: 12500, currency: "USD", quantityMode: "COUNT", baseQuantity: 80, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-consignment-slot", description: "Consignment slot monthly", basePriceMinor: 4500, currency: "USD", quantityMode: "COUNT", baseQuantity: 6, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 350000,
      budgetCurrency: "USD",
      hardDeadlineDays: 45,
      softDeadlineDays: 30,
      qualityDimension: "GRADE",
      qualityMin: "B",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-warehouse",
      returnsAllowed: true,
      returnsWindowDays: 60,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["CONSIGNMENT_AGREEMENT", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 100000,
    },
  ],
  "entertainment-media-production": [
    {
      templateId: "equipment-rental-batch",
      title: "Production equipment rental (camera + audio + lighting)",
      commerceScope: "buy-vs-rent-equipment",
      lines: [
        { lineId: "L01", sku: "sku-camera-cinema-rental", description: "Cinema camera weekly rental", basePriceMinor: 250000, currency: "USD", quantityMode: "COUNT", baseQuantity: 2, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-audio-mixer-rental", description: "Audio mixer weekly rental", basePriceMinor: 85000, currency: "USD", quantityMode: "COUNT", baseQuantity: 1, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L03", sku: "sku-lighting-kit-rental", description: "Lighting kit weekly rental", basePriceMinor: 65000, currency: "USD", quantityMode: "COUNT", baseQuantity: 2, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 950000,
      budgetCurrency: "USD",
      hardDeadlineDays: 14,
      softDeadlineDays: 7,
      qualityDimension: "CONDITION",
      qualityMin: "A",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-set",
      returnsAllowed: true,
      returnsWindowDays: 3,
      returnsRecourse: "REPLACEMENT",
      evidenceRequired: ["RENTAL_AGREEMENT", "DELIVERY_RECEIPT"],
      approvalMaxAmountMinor: 250000,
    },
    {
      templateId: "merchandise-catalog-order",
      title: "Merchandise catalog order (event T-shirts + posters)",
      commerceScope: "merchandise-catalog-orders",
      lines: [
        { lineId: "L01", sku: "sku-tee-event", description: "Event T-shirt", basePriceMinor: 1250, currency: "USD", quantityMode: "COUNT", baseQuantity: 500, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-poster-a2", description: "A2 poster", basePriceMinor: 450, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: [], evidenceRequired: "P0" },
      ],
      baseBudgetMinor: 95000,
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
      approvalMaxAmountMinor: 50000,
    },
  ],
  "legal-professional-services": [
    {
      templateId: "office-supplies-quarterly",
      title: "Office supplies quarterly procurement",
      commerceScope: "office-equipment-subscriptions-bulk-rental-recourse",
      lines: [
        { lineId: "L01", sku: "sku-paper-a4", description: "A4 paper (5000 sheets)", basePriceMinor: 4500, currency: "USD", quantityMode: "COUNT", baseQuantity: 30, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-toner-laserjet", description: "Toner cartridge", basePriceMinor: 8900, currency: "USD", quantityMode: "COUNT", baseQuantity: 12, substitutes: [], evidenceRequired: "P1" },
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
      approvalMaxAmountMinor: 50000,
    },
  ],
  "defense-security-government-contracting": [
    {
      templateId: "compliant-supply-sourcing",
      title: "Compliant unclassified supply sourcing",
      commerceScope: "compliant-unclassified-supply-sourcing-purchase-authorization",
      lines: [
        { lineId: "L01", sku: "sku-tool-set", description: "Tool set (compliant)", basePriceMinor: 18500, currency: "USD", quantityMode: "COUNT", baseQuantity: 15, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-ppe-kit", description: "PPE kit", basePriceMinor: 8900, currency: "USD", quantityMode: "COUNT", baseQuantity: 50, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 950000,
      budgetCurrency: "USD",
      hardDeadlineDays: 60,
      softDeadlineDays: 45,
      qualityDimension: "GRADE",
      qualityMin: "MIL-SPEC",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-base",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE", "AUTHORIZATION"],
      approvalMaxAmountMinor: 250000,
    },
  ],
  "manufacturing-supply-chain": [
    {
      templateId: "bom-component-sourcing",
      title: "BOM component sourcing (multi-supplier quote)",
      commerceScope: "bom-component-sourcing-receiving-lot-serial-multi-site",
      lines: [
        { lineId: "L01", sku: "sku-resistor-10k", description: "Resistor 10kΩ (reel of 5000)", basePriceMinor: 2500, currency: "USD", quantityMode: "COUNT", baseQuantity: 50, substitutes: ["sku-resistor-10k-alt"], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-capacitor-100uf", description: "Capacitor 100µF", basePriceMinor: 850, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-pcb-blank", description: "PCB blank", basePriceMinor: 4200, currency: "USD", quantityMode: "COUNT", baseQuantity: 100, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 950000,
      budgetCurrency: "USD",
      hardDeadlineDays: 30,
      softDeadlineDays: 21,
      qualityDimension: "GRADE",
      qualityMin: "INDUSTRIAL",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-plant",
      returnsAllowed: true,
      returnsWindowDays: 30,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE", "LOT_SERIAL"],
      approvalMaxAmountMinor: 100000,
    },
    {
      templateId: "tooling-rental-vs-buy",
      title: "Tooling rental vs purchase (CNC fixture + jig)",
      commerceScope: "rental-vs-purchase-of-tooling",
      lines: [
        { lineId: "L01", sku: "sku-cnc-fixture-rental", description: "CNC fixture monthly rental", basePriceMinor: 120000, currency: "USD", quantityMode: "COUNT", baseQuantity: 3, substitutes: [], evidenceRequired: "P2" },
        { lineId: "L02", sku: "sku-jig-custom", description: "Custom jig", basePriceMinor: 45000, currency: "USD", quantityMode: "COUNT", baseQuantity: 4, substitutes: [], evidenceRequired: "P2" },
      ],
      baseBudgetMinor: 550000,
      budgetCurrency: "USD",
      hardDeadlineDays: 21,
      softDeadlineDays: 14,
      qualityDimension: "GRADE",
      qualityMin: "INDUSTRIAL",
      deliveryMode: "SHIP_TO_LOCATION",
      deliveryLocationPrefix: "loc-plant",
      returnsAllowed: true,
      returnsWindowDays: 14,
      returnsRecourse: "REPLACEMENT",
      evidenceRequired: ["RENTAL_AGREEMENT", "DELIVERY_RECEIPT"],
      approvalMaxAmountMinor: 150000,
    },
  ],
  "supermarkets-local-retail": [
    {
      templateId: "supplier-po-receiving",
      title: "Supplier PO + receiving (with weighted goods + barcode count)",
      commerceScope: "catalog-pos-supplier-ordering-weighted-reconciliation-no-rfid",
      lines: [
        { lineId: "L01", sku: "sku-milk-1l", description: "Milk 1L", basePriceMinor: 199, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: ["sku-milk-2l"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-bananas", description: "Bananas (weighted)", basePriceMinor: 99, currency: "USD", quantityMode: "MEASURED", quantityUom: "KG", baseQuantity: 80, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-bread-loaf", description: "Bread loaf", basePriceMinor: 350, currency: "USD", quantityMode: "COUNT", baseQuantity: 150, substitutes: ["sku-bread-alt"], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 95000,
      budgetCurrency: "USD",
      hardDeadlineDays: 7,
      softDeadlineDays: 5,
      qualityDimension: "FRESHNESS",
      qualityMin: "A",
      deliveryMode: "SITE_DELIVERY",
      deliveryLocationPrefix: "loc-store",
      returnsAllowed: true,
      returnsWindowDays: 3,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "DELIVERY_RECEIPT", "INVOICE"],
      approvalMaxAmountMinor: 25000,
    },
    {
      templateId: "no-rfid-reconciliation-day",
      title: "No-RFID supermarket day (POS sync + barcode count + weighted + reconciliation)",
      commerceScope: "no-rfid-supermarket-reconciliation",
      lines: [
        { lineId: "L01", sku: "sku-milk-1l", description: "Milk 1L", basePriceMinor: 199, currency: "USD", quantityMode: "COUNT", baseQuantity: 200, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-bananas", description: "Bananas (weighted)", basePriceMinor: 99, currency: "USD", quantityMode: "MEASURED", quantityUom: "KG", baseQuantity: 80, substitutes: [], evidenceRequired: "P1" },
        { lineId: "L03", sku: "sku-tomato-vine", description: "Vine tomatoes (weighted)", basePriceMinor: 299, currency: "USD", quantityMode: "MEASURED", quantityUom: "KG", baseQuantity: 40, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 95000,
      budgetCurrency: "USD",
      hardDeadlineDays: 1,
      softDeadlineDays: 1,
      qualityDimension: "FRESHNESS",
      qualityMin: "A",
      deliveryMode: "LOCAL_EDGE",
      deliveryLocationPrefix: "loc-store",
      returnsAllowed: true,
      returnsWindowDays: 1,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["PO", "POS_RECEIPT", "COUNT_OBSERVATION", "RECONCILIATION_RECORD"],
      approvalMaxAmountMinor: 25000,
    },
    {
      templateId: "expiry-recall-purchasing",
      title: "Expiry/recall purchasing hold + replacement",
      commerceScope: "expiry-recall-purchasing",
      lines: [
        { lineId: "L01", sku: "sku-yogurt-expired", description: "Yogurt (expiring)", basePriceMinor: 0, currency: "USD", quantityMode: "COUNT", baseQuantity: 0, substitutes: ["sku-yogurt-fresh"], evidenceRequired: "P1" },
        { lineId: "L02", sku: "sku-yogurt-fresh", description: "Yogurt fresh replacement", basePriceMinor: 150, currency: "USD", quantityMode: "COUNT", baseQuantity: 100, substitutes: [], evidenceRequired: "P1" },
      ],
      baseBudgetMinor: 25000,
      budgetCurrency: "USD",
      hardDeadlineDays: 1,
      softDeadlineDays: 1,
      qualityDimension: "FRESHNESS",
      qualityMin: "A",
      deliveryMode: "LOCAL_EDGE",
      deliveryLocationPrefix: "loc-store",
      returnsAllowed: true,
      returnsWindowDays: 1,
      returnsRecourse: "CREDIT",
      evidenceRequired: ["RECALL_NOTICE", "PO", "DELIVERY_RECEIPT"],
      approvalMaxAmountMinor: 10000,
    },
  ],
};

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

function templatesForIndustry(industryId: string): readonly TemplateSeed[] {
  const templates = TEMPLATES_BY_INDUSTRY[industryId];
  if (!templates || templates.length === 0) {
    throw new TypeError(`no templates defined for industry: ${industryId}`);
  }
  return templates;
}

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
