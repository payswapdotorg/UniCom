/**
 * W2-009 — Commerce-only incumbent stacks per industry (matrix-aligned).
 *
 * Split out of persona-cohort.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module.
 *
 * Law: each row maps a capability from the V3-INDUSTRY-AND-COMPETITOR-MATRIX
 * to a representative incumbent product and a conservative default evidence
 * class. General industry platforms (Autodesk/Procore/EHR/dispatch/creative/
 * legal/defense) are EXCLUDED — they are context, not scored competitors.
 *
 * Evidence-class policy:
 *   A — real authorized UI trial (none assumed; the campaign sets A after
 *       actually running an authorized incumbent trial)
 *   B — official interactive demo/UI observed (default for documented
 *       products with public demos)
 *   C — official documentation capability checklist (default for products
 *       with public docs but no accessible demo)
 *   D — unverified/inaccessible (default for spreadsheet/email/manual
 *       workflows; excluded from performance/superiority claims)
 *
 * The W3 runner may UPGRADE evidence class for incumbents it actually
 * trialled (A) and must DOWNGRADE to D anything it could not access. The
 * frozen default here is the conservative declared intent.
 */

import type { EvidenceClass, FirmSize, Industry, IncumbentStackEntry } from "./persona-types.js";

interface IncumbentMatrixRow {
  readonly capability: string;
  readonly incumbent: string;
  readonly editionOrAccess: (firmSize: FirmSize) => string;
  readonly evidenceClass: EvidenceClass;
}

export const COMMERCE_INCUMBENT_ROWS: Readonly<Record<Industry, readonly IncumbentMatrixRow[]>> = {
  construction: [
    { capability: "materials-parts-sourcing", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
    { capability: "trade-supplier-portal", incumbent: "Grainger / Fastenal", editionOrAccess: () => "Supplier portal", evidenceClass: "B" },
    { capability: "equipment-rental", incumbent: "United Rentals", editionOrAccess: () => "Rental portal", evidenceClass: "B" },
    { capability: "spreadsheet-procurement", incumbent: "Spreadsheet/Email", editionOrAccess: () => "Manual workflow", evidenceClass: "D" },
  ],
  finance: [
    { capability: "procurement-suite", incumbent: "Coupa", editionOrAccess: (s) => s === "large" ? "Enterprise" : "SMB", evidenceClass: "C" },
    { capability: "supplier-sourcing", incumbent: "SAP Ariba", editionOrAccess: (s) => s === "large" ? "Enterprise" : "Discovery", evidenceClass: "C" },
    { capability: "expense-procurement", incumbent: "Ramp / Brex", editionOrAccess: () => "Procurement module", evidenceClass: "C" },
    { capability: "marketplace-procurement", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
  ],
  sales: [
    { capability: "b2b-catalog", incumbent: "Shopify B2B", editionOrAccess: (s) => s === "large" ? "Plus" : "Standard", evidenceClass: "B" },
    { capability: "wholesale-marketplace", incumbent: "Faire", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
    { capability: "order-quote", incumbent: "Salesforce CPQ", editionOrAccess: (s) => s === "large" ? "Enterprise" : "Starter", evidenceClass: "C" },
    { capability: "supplier-portal", incumbent: "Alibaba.com", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
  ],
  technology: [
    { capability: "it-hardware-procurement", incumbent: "CDW / SHI", editionOrAccess: () => "Business portal", evidenceClass: "B" },
    { capability: "saas-renewal", incumbent: "Vendor storefronts", editionOrAccess: () => "Vendor portal", evidenceClass: "C" },
    { capability: "marketplace-procurement", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
    { capability: "procurement-suite", incumbent: "Coupa", editionOrAccess: (s) => s === "large" ? "Enterprise" : "SMB", evidenceClass: "C" },
  ],
  healthcare: [
    { capability: "medical-supplies-procurement", incumbent: "GHX", editionOrAccess: (s) => s === "large" ? "Exchange" : "Essentials", evidenceClass: "C" },
    { capability: "supplier-portal", incumbent: "McKesson / Medline", editionOrAccess: () => "Supplier portal", evidenceClass: "B" },
    { capability: "equipment-procurement", incumbent: "Cardinal Health", editionOrAccess: () => "Catalog", evidenceClass: "C" },
    { capability: "spreadsheet-procurement", incumbent: "Spreadsheet/Email", editionOrAccess: () => "Manual workflow", evidenceClass: "D" },
  ],
  transportation: [
    { capability: "vehicle-parts-procurement", incumbent: "FleetPride / NAPA", editionOrAccess: () => "Parts portal", evidenceClass: "B" },
    { capability: "marketplace-procurement", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
    { capability: "equipment-rental", incumbent: "Penske / Ryder", editionOrAccess: () => "Rental portal", evidenceClass: "C" },
    { capability: "spreadsheet-procurement", incumbent: "Spreadsheet/Email", editionOrAccess: () => "Manual workflow", evidenceClass: "D" },
  ],
  hospitality: [
    { capability: "food-beverage-supplier", incumbent: "Sysco Shop / US Foods", editionOrAccess: () => "Ordering portal", evidenceClass: "B" },
    { capability: "wholesale-portal", incumbent: "Restaurant Depot", editionOrAccess: () => "Cash-and-carry portal", evidenceClass: "C" },
    { capability: "purchasing-inventory", incumbent: "MarketMan", editionOrAccess: () => "SaaS", evidenceClass: "C" },
    { capability: "pos", incumbent: "Toast / Square", editionOrAccess: (s) => s === "large" ? "Multi-location" : "Standard", evidenceClass: "B" },
  ],
  fashion: [
    { capability: "storefront-catalog", incumbent: "Shopify", editionOrAccess: (s) => s === "large" ? "Plus" : "Standard", evidenceClass: "B" },
    { capability: "wholesale-marketplace", incumbent: "Faire / JOOR / NuORDER", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
    { capability: "resale-marketplace", incumbent: "eBay / Depop / Poshmark", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
    { capability: "supplier-portal", incumbent: "Alibaba.com", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
  ],
  entertainment: [
    { capability: "equipment-rental", incumbent: "ShareGrid / KitSplit", editionOrAccess: () => "Rental marketplace", evidenceClass: "B" },
    { capability: "used-equipment-resale", incumbent: "eBay / Used-marketplaces", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
    { capability: "merchandise-storefront", incumbent: "Shopify", editionOrAccess: () => "Standard", evidenceClass: "B" },
    { capability: "marketplace-procurement", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
  ],
  legal: [
    { capability: "office-supplies-procurement", incumbent: "Staples Business Advantage", editionOrAccess: () => "Business portal", evidenceClass: "C" },
    { capability: "marketplace-procurement", incumbent: "Amazon Business", editionOrAccess: () => "Business account", evidenceClass: "B" },
    { capability: "spreadsheet-procurement", incumbent: "Spreadsheet/Email", editionOrAccess: () => "Manual workflow", evidenceClass: "D" },
  ],
  defense: [
    { capability: "gsa-advantage", incumbent: "GSA Advantage", editionOrAccess: () => "Authorized unclassified", evidenceClass: "B" },
    { capability: "authorized-supplier-portal", incumbent: "Authorized supplier portals", editionOrAccess: () => "Unclassified only", evidenceClass: "C" },
    { capability: "procurement-suite", incumbent: "SAP Ariba / Coupa", editionOrAccess: () => "Where permitted", evidenceClass: "C" },
  ],
  manufacturing: [
    { capability: "procurement-suite", incumbent: "SAP Ariba / Coupa", editionOrAccess: (s) => s === "large" ? "Enterprise" : "SMB", evidenceClass: "C" },
    { capability: "supplier-discovery", incumbent: "Thomasnet / Xometry", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
    { capability: "components-sourcing", incumbent: "Grainger / McMaster-Carr", editionOrAccess: () => "Catalog portal", evidenceClass: "B" },
    { capability: "supplier-portal", incumbent: "Alibaba.com", editionOrAccess: () => "Marketplace", evidenceClass: "B" },
  ],
  supermarket: [
    { capability: "pos", incumbent: "Square POS / Shopify POS / Lightspeed", editionOrAccess: (s) => s === "large" ? "Multi-location" : "Standard", evidenceClass: "B" },
    { capability: "wholesale-portal", incumbent: "Local cash-and-carry / supplier portal", editionOrAccess: () => "Wholesale portal", evidenceClass: "C" },
    { capability: "shopper-ordering", incumbent: "Instacart", editionOrAccess: () => "Where applicable", evidenceClass: "B" },
    { capability: "no-rfid-reconciliation", incumbent: "POS/file/CSV/receipt workflow", editionOrAccess: () => "Manual no-RFID", evidenceClass: "D" },
  ],
};

export function incumbentStackFor(
  industry: Industry,
  firmSize: FirmSize,
): IncumbentStackEntry[] {
  const rows = COMMERCE_INCUMBENT_ROWS[industry];
  if (!rows) {
    throw new Error(`no incumbent stack defined for industry ${industry}`);
  }
  return rows.map((row) => ({
    capability: row.capability,
    incumbent: row.incumbent,
    editionOrAccess: row.editionOrAccess(firmSize),
    evidenceClass: row.evidenceClass,
  }));
}
