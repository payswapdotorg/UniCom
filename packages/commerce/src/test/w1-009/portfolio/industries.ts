/**
 * W1-009 portfolio — 13 industries × 3 firm-size cohorts.
 *
 * Source of truth: docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md.
 * Commerce-only scope per the W1-009 work-order clarification: model only
 * the commerce inside industry projects.
 */
import type { FirmSize, IndustryDescriptor } from "./schema.js";

export const FIRM_SIZES: readonly FirmSize[] = ["small", "medium", "large"] as const;

export const FIRM_STAFF_BY_SIZE: Readonly<Record<FirmSize, number>> = {
  small: 25,
  medium: 150,
  large: 1000,
};

export const FIRM_STRESSOR_BY_SIZE: Readonly<Record<FirmSize, string>> = {
  small: "Low purchasing/admin capacity, price sensitivity, manual supplier/channel workflows",
  medium: "Cross-team purchasing, supplier coordination, multi-location/channel handoffs",
  large: "Procurement governance, segregation of duties, multi-entity purchasing and exception volume",
};

export const INDUSTRIES: readonly IndustryDescriptor[] = [
  {
    id: "construction",
    name: "Construction / engineering / contractors — purchasing only",
    commerceScope: "materials-and-parts-sourcing",
    commerceTasks: [
      "materials and parts sourcing", "quote comparison", "bulk and split purchasing",
      "equipment purchase vs rental", "used-tool resale", "supplier lead time/availability",
      "delivery to a site", "change in quantities/budget", "returns/credit/recourse",
      "local supplier pickup",
    ],
    incumbentComparators: ["Amazon Business", "Grainger", "Fastenal", "Ferguson", "HD Supply", "United Rentals", "Sunbelt Rentals"],
    excludedComparators: ["Autodesk", "Procore"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "rent-borrow-vs-buy", "resale-rental-consignment",
      "proactive-economic-opportunities", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "connected-commerce-channels-and-live-commerce",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "finance-banking-accounting",
    name: "Finance / banking / accounting — organizational purchasing only",
    commerceScope: "approved-buying-vendor-sourcing-procurement",
    commerceTasks: [
      "approved buying", "vendor/supplier discovery", "procurement budgets",
      "quote comparison", "purchase authorization", "invoice/PO matching",
      "renewal savings", "evidence for purchase approvals",
    ],
    incumbentComparators: ["Coupa", "SAP Ariba", "Amazon Business", "Ramp", "Brex"],
    excludedComparators: ["core banking", "accounting ledgers", "tax preparation", "investment platforms"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "negotiation-substitution",
      "supplier-procurement-receiving", "proactive-economic-opportunities",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "sales-business-development",
    name: "Sales / business development — buying and selling commerce",
    commerceScope: "b2b-catalog-quote-promotion-order-returns",
    commerceTasks: [
      "customer/merchant product offers", "B2B catalog and quote",
      "discount and promotion", "order creation", "wholesale buyer discovery",
      "deal-specific procurement", "negotiation", "group-buy proposals",
      "post-sale returns/recourse",
    ],
    incumbentComparators: ["Shopify B2B", "Faire", "Alibaba.com", "Amazon Business"],
    excludedComparators: ["generic CRM"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "existing-group-buy", "latent-demand-merchant-group-buy-proposal",
      "rent-borrow-vs-buy", "resale-rental-consignment", "proactive-economic-opportunities",
      "bounded-multi-hop-trade-cycle", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "commerce-twin-what-if",
      "connected-commerce-channels-and-live-commerce", "trust-security-fraud-and-recourse",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
  },
  {
    id: "technology-software-it-services",
    name: "Technology / software / IT services — business purchasing",
    commerceScope: "hardware-saas-procurement-renewal-resale",
    commerceTasks: [
      "hardware/device and accessory procurement", "SaaS/tool subscription purchase or renewal savings",
      "supplier quotes", "license/vendor purchasing", "replacement/resale/rental",
      "approvals and delivery/inventory tracking",
    ],
    incumbentComparators: ["CDW", "SHI", "Amazon Business", "Coupa", "SAP Ariba"],
    excludedComparators: ["issue tracking", "source hosting", "ITSM", "generic project-management tools"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "rent-borrow-vs-buy", "resale-rental-consignment",
      "proactive-economic-opportunities", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "commerce-twin-what-if",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "healthcare-organizations",
    name: "Healthcare organizations — supplies/equipment procurement only",
    commerceScope: "medical-supplies-equipment-procurement-recall-holds",
    commerceTasks: [
      "medical and facilities supplies", "approved device procurement",
      "catalog/contract pricing", "purchase orders", "stock/replenishment",
      "vendor availability", "recall-related purchasing holds", "returns/credits",
    ],
    incumbentComparators: ["GHX", "McKesson", "Medline", "Cardinal Health"],
    excludedComparators: ["EHRs", "clinical decision systems", "patient administration", "care delivery"],
    additionalRoleFamilies: ["recall-coordinator"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "negotiation-substitution",
      "supplier-procurement-receiving", "proactive-economic-opportunities",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "transportation-delivery",
    name: "Transportation / delivery — fleet and transport purchasing only",
    commerceScope: "fleet-parts-tires-fuel-rental-vs-buy",
    commerceTasks: [
      "vehicle parts", "tires", "maintenance supplies", "fuel/consumables procurement",
      "rental vs purchase of equipment", "parts availability across depots",
      "supplier choice", "emergency sourcing", "returns/credits", "local pickup",
    ],
    incumbentComparators: ["FleetPride", "NAPA Auto Parts", "Grainger", "Amazon Business"],
    excludedComparators: ["telematics", "GPS", "fleet dispatch", "route-optimization platforms"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "rent-borrow-vs-buy", "proactive-economic-opportunities",
      "supplier-procurement-receiving", "connected-commerce-channels-and-live-commerce",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
  },
  {
    id: "hospitality-restaurants-hotels",
    name: "Hospitality / restaurants / hotels — goods, stock and supplier ordering",
    commerceScope: "food-beverage-linen-supplier-ordering-pos",
    commerceTasks: [
      "food/beverage/linen/amenities ordering", "POS-to-inventory purchasing",
      "supplier quote/availability", "weighted/dated goods", "peak-demand stock planning",
      "equipment rental", "event group-buy", "replenishment", "returns/credits",
      "guest-facing sale/refund where in scope",
    ],
    incumbentComparators: ["Sysco Shop", "US Foods ordering", "Restaurant Depot", "MarketMan", "Toast", "Square", "Shopify POS"],
    excludedComparators: ["hotel property management", "generic reservation/operations software"],
    additionalRoleFamilies: ["banquet-coordinator"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "existing-group-buy", "latent-demand-merchant-group-buy-proposal",
      "rent-borrow-vs-buy", "proactive-economic-opportunities", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "physical-no-rfid-supermarket",
      "connected-commerce-channels-and-live-commerce", "trust-security-fraud-and-recourse",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
  },
  {
    id: "fashion-apparel-retail-brands",
    name: "Fashion / apparel / retail brands — product, wholesale and circular commerce",
    commerceScope: "catalog-wholesale-trims-rental-resale-fulfillment",
    commerceTasks: [
      "catalog and channel listings", "wholesale buying/selling", "supplier/trims procurement",
      "size/variant availability", "dynamic promotions", "markdown timing", "group purchase",
      "rental/resale/consignment", "fulfillment/returns",
    ],
    incumbentComparators: ["Shopify", "Shopify B2B", "Faire", "JOOR", "NuORDER", "Alibaba.com", "eBay", "Depop", "Poshmark"],
    excludedComparators: ["general product-lifecycle/design software", "creative work tools"],
    additionalRoleFamilies: ["merchandiser"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "existing-group-buy", "latent-demand-merchant-group-buy-proposal",
      "rent-borrow-vs-buy", "resale-rental-consignment", "proactive-economic-opportunities",
      "bounded-multi-hop-trade-cycle", "merchant-commerce-lifecycle", "supplier-procurement-receiving",
      "commerce-twin-what-if", "connected-commerce-channels-and-live-commerce",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "entertainment-media-production",
    name: "Entertainment / media / production — equipment and merchandise commerce",
    commerceScope: "buy-vs-rent-equipment-merchandise-resale",
    commerceTasks: [
      "buy vs rent cameras/audio/lighting/set equipment", "compare rental terms/deposits",
      "book available equipment", "procure event/production supplies", "resale used equipment",
      "merchandise catalog/orders", "group purchase", "returns/claims",
    ],
    incumbentComparators: ["ShareGrid", "KitSplit", "Amazon Business", "specialist gear suppliers"],
    excludedComparators: ["creative suites", "media review", "editing", "asset management", "production scheduling"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "rent-borrow-vs-buy", "resale-rental-consignment",
      "proactive-economic-opportunities", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "trust-security-fraud-and-recourse",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
  },
  {
    id: "legal-professional-services",
    name: "Legal / professional services — office, equipment and service procurement",
    commerceScope: "office-equipment-subscriptions-bulk-rental-recourse",
    commerceTasks: [
      "approved office/device/software purchases", "external expert/vendor sourcing",
      "supplier quotes", "subscriptions/renewal savings", "bulk purchasing", "rentals",
      "invoice/PO evidence", "returns/recourse",
    ],
    incumbentComparators: ["Amazon Business", "Staples Business Advantage", "procurement suites"],
    excludedComparators: ["legal practice management", "legal research", "matter-management", "privileged document/email systems"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "negotiation-substitution",
      "supplier-procurement-receiving", "proactive-economic-opportunities",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "defense-security-government-contracting",
    name: "Defense / security / government contracting — authorized unclassified procurement only",
    commerceScope: "compliant-unclassified-supply-sourcing-purchase-authorization",
    commerceTasks: [
      "compliant unclassified supply sourcing", "approved supplier/catalog lookup",
      "purchase authorizations", "budget and quote comparison", "equipment purchasing/rental",
      "order/receiving evidence", "returns/credit",
    ],
    incumbentComparators: ["GSA Advantage", "Amazon Business", "SAP Ariba", "Coupa"],
    excludedComparators: ["command-and-control", "classified systems", "cyber-operations platforms", "defense project/accounting systems"],
    additionalRoleFamilies: ["security-officer-classified-avoidance"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "negotiation-substitution",
      "rent-borrow-vs-buy", "supplier-procurement-receiving",
      "trust-security-fraud-and-recourse", "failure-unknown-idempotency-recovery",
      "gui-feature-discoverability",
    ],
  },
  {
    id: "manufacturing-supply-chain",
    name: "Manufacturing / supply chain — procurement and inventory commerce",
    commerceScope: "bom-component-sourcing-receiving-lot-serial-multi-site",
    commerceTasks: [
      "BOM and component sourcing", "supplier discovery", "quote comparison",
      "substitutes/approved alternates", "purchase-order release/receiving",
      "inventory replenishment", "lot/serial evidence", "rental vs purchase of tooling",
      "surplus resale", "supplier dispute", "multi-site stock",
    ],
    incumbentComparators: ["SAP Ariba", "Coupa", "Thomasnet", "Xometry", "Alibaba.com", "Grainger", "McMaster-Carr"],
    excludedComparators: ["CAD", "PLM", "MES", "generic engineering execution"],
    additionalRoleFamilies: ["materials-planner"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "rent-borrow-vs-buy", "resale-rental-consignment",
      "proactive-economic-opportunities", "merchant-commerce-lifecycle",
      "supplier-procurement-receiving", "commerce-twin-what-if",
      "connected-commerce-channels-and-live-commerce", "trust-security-fraud-and-recourse",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
  },
  {
    id: "supermarkets-local-retail",
    name: "Supermarkets / local retail — no-RFID is mandatory",
    commerceScope: "catalog-pos-supplier-ordering-weighted-reconciliation-no-rfid",
    commerceTasks: [
      "catalog/product pricing", "promotions", "POS orders", "supplier ordering",
      "purchase orders/receiving", "weighted goods", "barcode/camera stock count",
      "inventory reconciliation", "replenishment", "expiry/recall purchasing",
      "local delivery/pickup", "customer intent", "group buying",
      "merchant group-buy offers", "substitutions", "resale/consignment",
      "refunds", "fraud/recourse",
    ],
    incumbentComparators: ["Square POS", "Shopify POS", "Lightspeed", "local grocery POS", "wholesale portals", "Instacart", "spreadsheet/CSV/receipt workflows"],
    excludedComparators: [],
    additionalRoleFamilies: ["store-manager", "edge-operator", "reconciliation-clerk"],
    applicableJourneyFamilies: [
      "buyer-intent-constraints", "offer-sourcing-comparison", "buy-now-vs-wait-price-timing",
      "negotiation-substitution", "existing-group-buy", "latent-demand-merchant-group-buy-proposal",
      "rent-borrow-vs-buy", "resale-rental-consignment", "proactive-economic-opportunities",
      "merchant-commerce-lifecycle", "supplier-procurement-receiving", "autonomous-store-policy",
      "commerce-twin-what-if", "connected-commerce-channels-and-live-commerce",
      "physical-no-rfid-supermarket", "trust-security-fraud-and-recourse",
      "failure-unknown-idempotency-recovery", "gui-feature-discoverability",
    ],
    noRfidMandatory: true,
  },
] as const;

export const INDUSTRY_COUNT = INDUSTRIES.length;

export function industryById(id: string): IndustryDescriptor {
  const industry = INDUSTRIES.find((candidate) => candidate.id === id);
  if (!industry) throw new TypeError(`unknown industry id: ${id}`);
  return industry;
}

export function firmCohortId(industryId: string, size: FirmSize): string {
  return `${industryId}-${size}`;
}
