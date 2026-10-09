/**
 * W2-010 — Incumbent benchmark mapping tables (frozen data layer).
 *
 * Split from persona-incumbent-benchmark.ts for the architecture file-line
 * budget. Holds the pure mapping tables:
 * - CAPABILITY_KINDS: frozen-stack capability id → semantic capability kind.
 * - TASK_GOAL_REQUIREMENTS: journey family (task goal) → required
 *   capability kinds (ANY-OF semantics; empty = UNiCOM-differentiated goal
 *   with no incumbent counterpart in ANY frozen stack).
 * - ROW_PRODUCTS: frozen-stack row (industry + capability) → verified
 *   product keys (persona-incumbent-verification*.ts).
 * - CLASS_STRENGTH: evidence-class ordering for weakest-link computation.
 *
 * Laws unchanged: commerce-only rows; manual rows only cover coordination
 * goals; generic rows are class D. See persona-incumbent-benchmark.ts.
 *
 * Internal to the @unicom/agent module.
 */

import type { EvidenceClass, JourneyFamily } from "./persona-types.js";
import { type IncumbentCapabilityKind } from "./persona-types.js";

/** Frozen-stack capability id → capability kind. */
export const CAPABILITY_KINDS: Readonly<Record<string, IncumbentCapabilityKind>> = {
  "materials-parts-sourcing": "sourcing-catalog",
  "trade-supplier-portal": "supplier-portal-quotes",
  "equipment-rental": "rental",
  "spreadsheet-procurement": "manual",
  "procurement-suite": "procurement-suite",
  "supplier-sourcing": "supplier-portal-quotes",
  "expense-procurement": "procurement-suite",
  "marketplace-procurement": "sourcing-catalog",
  "b2b-catalog": "sourcing-catalog",
  "wholesale-marketplace": "supplier-portal-quotes",
  "order-quote": "supplier-portal-quotes",
  "supplier-portal": "supplier-portal-quotes",
  "it-hardware-procurement": "sourcing-catalog",
  "saas-renewal": "sourcing-catalog",
  "medical-supplies-procurement": "sourcing-catalog",
  "equipment-procurement": "sourcing-catalog",
  "vehicle-parts-procurement": "sourcing-catalog",
  "food-beverage-supplier": "supplier-portal-quotes",
  "wholesale-portal": "supplier-portal-quotes",
  "purchasing-inventory": "procurement-suite",
  pos: "pos",
  "storefront-catalog": "sourcing-catalog",
  "resale-marketplace": "resale",
  "used-equipment-resale": "resale",
  "merchandise-storefront": "sourcing-catalog",
  "gsa-advantage": "sourcing-catalog",
  "authorized-supplier-portal": "supplier-portal-quotes",
  "supplier-discovery": "supplier-portal-quotes",
  "components-sourcing": "sourcing-catalog",
  "shopper-ordering": "shopping-platform",
  "no-rfid-reconciliation": "manual",
  "office-supplies-procurement": "sourcing-catalog",
};

/**
 * Task goal (journey family) → required capability kinds. ANY-OF semantics:
 * the goal has an incumbent counterpart if the firm's stack carries a row of
 * ANY required kind. Empty array = UNiCOM-differentiated goal with no
 * incumbent counterpart in ANY frozen stack.
 */
export const TASK_GOAL_REQUIREMENTS: Readonly<
  Record<JourneyFamily, readonly IncumbentCapabilityKind[]>
> = {
  "buyer-intent-canvas": ["sourcing-catalog", "shopping-platform"],
  "compare-sellers": ["sourcing-catalog", "supplier-portal-quotes", "shopping-platform"],
  "buy-vs-wait-negotiate": ["sourcing-catalog", "procurement-suite", "supplier-portal-quotes"],
  "existing-groupbuy-discovery": ["manual"],
  "latent-demand-groupbuy": ["manual"],
  "rent-borrow-vs-buy": ["rental"],
  "resale-rental-consignment": ["resale"],
  "proactive-opportunities": ["manual"],
  "multi-hop-tradecycle": ["manual"],
  "merchant-lifecycle": ["sourcing-catalog", "pos"],
  "supplier-procurement-lifecycle": ["procurement-suite", "supplier-portal-quotes"],
  "b2b-multi-location": ["sourcing-catalog", "pos", "supplier-portal-quotes"],
  "autonomous-store-runtime": [],
  "commerce-twin-whatif": [],
  "connector-discovery-execution": ["manual"],
  "no-rfid-physical-retail": ["pos", "manual"],
  "commerce-trust-security": ["supplier-portal-quotes", "manual"],
  "failure-recovery": ["sourcing-catalog", "supplier-portal-quotes", "manual"],
  "feature-discovery": [],
};

/** Frozen-stack row (industry + capability) → verified product keys. */
export const ROW_PRODUCTS: Readonly<Record<string, readonly string[]>> = {
  "construction:materials-parts-sourcing": ["amazon-business"],
  "construction:trade-supplier-portal": ["grainger", "fastenal"],
  "construction:equipment-rental": ["united-rentals"],
  "construction:spreadsheet-procurement": ["spreadsheet-email-manual"],
  "finance:procurement-suite": ["coupa"],
  "finance:supplier-sourcing": ["sap-ariba"],
  "finance:expense-procurement": ["ramp", "brex"],
  "finance:marketplace-procurement": ["amazon-business"],
  "sales:b2b-catalog": ["shopify-b2b"],
  "sales:wholesale-marketplace": ["faire"],
  "sales:order-quote": ["salesforce-cpq"],
  "sales:supplier-portal": ["alibaba"],
  "technology:it-hardware-procurement": ["cdw", "shi"],
  "technology:saas-renewal": ["vendor-storefronts-generic"],
  "technology:marketplace-procurement": ["amazon-business"],
  "technology:procurement-suite": ["coupa"],
  "healthcare:medical-supplies-procurement": ["ghx"],
  "healthcare:supplier-portal": ["mckesson", "medline"],
  "healthcare:equipment-procurement": ["cardinal-health"],
  "healthcare:spreadsheet-procurement": ["spreadsheet-email-manual"],
  "transportation:vehicle-parts-procurement": ["fleetpride", "napa"],
  "transportation:marketplace-procurement": ["amazon-business"],
  "transportation:equipment-rental": ["penske", "ryder"],
  "transportation:spreadsheet-procurement": ["spreadsheet-email-manual"],
  "hospitality:food-beverage-supplier": ["sysco", "us-foods"],
  "hospitality:wholesale-portal": ["restaurant-depot"],
  "hospitality:purchasing-inventory": ["marketman"],
  "hospitality:pos": ["toast", "square"],
  "fashion:storefront-catalog": ["shopify"],
  "fashion:wholesale-marketplace": ["faire", "joor", "nuorder"],
  "fashion:resale-marketplace": ["ebay", "depop", "poshmark"],
  "fashion:supplier-portal": ["alibaba"],
  "entertainment:equipment-rental": ["sharegrid", "kitsplit"],
  "entertainment:used-equipment-resale": ["ebay"],
  "entertainment:merchandise-storefront": ["shopify"],
  "entertainment:marketplace-procurement": ["amazon-business"],
  "legal:office-supplies-procurement": ["staples-advantage"],
  "legal:marketplace-procurement": ["amazon-business"],
  "legal:spreadsheet-procurement": ["spreadsheet-email-manual"],
  "defense:gsa-advantage": ["gsa-advantage"],
  "defense:authorized-supplier-portal": ["authorized-supplier-portals-generic"],
  "defense:procurement-suite": ["sap-ariba", "coupa"],
  "manufacturing:procurement-suite": ["sap-ariba", "coupa"],
  "manufacturing:supplier-discovery": ["thomasnet", "xometry"],
  "manufacturing:components-sourcing": ["grainger", "mcmaster"],
  "manufacturing:supplier-portal": ["alibaba"],
  "supermarket:pos": ["square", "shopify", "lightspeed"],
  "supermarket:wholesale-portal": ["local-cash-and-carry-generic"],
  "supermarket:shopper-ordering": ["instacart"],
  "supermarket:no-rfid-reconciliation": ["pos-file-csv-manual"],
};

/** Class strength for weakest-link computation (higher = stronger evidence). */
export const CLASS_STRENGTH: Readonly<Record<EvidenceClass, number>> = {
  A: 3,
  B: 2,
  C: 1,
  D: 0,
};
