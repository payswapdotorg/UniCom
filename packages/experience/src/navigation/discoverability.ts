/**
 * Discovery paths, contextual opportunities and onboarding pathways
 * (docs/FEATURE-COMPLETENESS-MATRIX.md "UX discoverability requirement",
 * docs/UX-DEPLOYMENT.md "Feature discoverability architecture",
 * FROZEN-ARCHITECTURE §22.7).
 *
 * Every feature must be reachable through at least one of:
 * primary navigation, universal intent/command, contextual opportunity,
 * onboarding/empty-state education. The contract test suite walks the
 * surface registry plus these registries to enforce full coverage.
 */

/** The four discovery path kinds (verbatim from the matrix requirement). */
export type DiscoveryPathKind =
  | "primary-navigation"
  | "universal-intent"
  | "contextual-opportunity"
  | "onboarding-empty-state";

/** A resolved discovery path for a feature. */
export interface DiscoveryPath {
  readonly kind: DiscoveryPathKind;
  readonly surfaceId?: string;
  readonly contextualOpportunityTypeId?: string;
  readonly onboardingPathwayId?: string;
}

/**
 * Contextual opportunity types: capability cards that surface capabilities
 * users might not know to ask for (docs/UX-DEPLOYMENT.md examples).
 */
export interface ContextualOpportunityType {
  readonly id: string;
  /** Trigger template in plain user language. */
  readonly triggerTemplate: string;
  readonly relatedFeatures: readonly string[];
  /** Surface the user lands on when acting on the hint. */
  readonly actionSurfaceId: string;
}

export const CONTEXTUAL_OPPORTUNITY_TYPES: readonly ContextualOpportunityType[] = [
  {
    id: "group-buy-demand-hint",
    triggerTemplate: "23 shoppers want this product — create a group deal?",
    relatedFeatures: ["group-buy-formation", "user-group-buying", "intent-group-buy", "merchant-demand-generation-proposals"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "pos-no-api-edge-hint",
    triggerTemplate: "Your register has no inventory connection — connect this store computer.",
    relatedFeatures: ["local-pos-no-api", "physical-edge", "physical-offline-edge-operation", "usb-serial-lan"],
    actionSurfaceId: "local-edge-setup",
  },
  {
    id: "owned-items-resale-rental-hint",
    triggerTemplate: "These owned items have resale or rental opportunities.",
    relatedFeatures: ["user-resale-owned-items", "user-rental", "intent-resale", "intent-rent-borrow"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "trade-cycle-found-hint",
    triggerTemplate: "A valid multi-person swap was found for items you own.",
    relatedFeatures: ["user-swaps", "intent-swap-trade", "intent-multi-hop-trade-cycles", "bounded-multi-hop-trade"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "review-manipulation-hint",
    triggerTemplate: "Review activity shows possible coordinated manipulation.",
    relatedFeatures: ["threat-review-rings", "threat-fake-rigged-reviews", "security-pipeline-signal-to-learning"],
    actionSurfaceId: "trust-security-center",
  },
  {
    id: "price-drop-timing-hint",
    triggerTemplate: "Prices for items on your list are predicted to drop — wait or buy?",
    relatedFeatures: ["user-future-price-opportunities", "intent-price-timing", "intent-buy-now-vs-wait", "deadline-aware-waiting"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "unused-subscription-hint",
    triggerTemplate: "You are paying for subscriptions you barely use.",
    relatedFeatures: ["user-unused-subscriptions"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "warranty-recovery-hint",
    triggerTemplate: "An owned item may still be under warranty.",
    relatedFeatures: ["user-warranty-recovery"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "local-pickup-logistics-hint",
    triggerTemplate: "Nearby buyers could share delivery or pickup with you.",
    relatedFeatures: ["user-local-pickup-shared-logistics", "intent-local-commerce"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "discount-hint",
    triggerTemplate: "A discount is available on something you buy regularly.",
    relatedFeatures: ["user-discounts"],
    actionSurfaceId: "opportunity-inbox",
  },
  {
    id: "low-stock-replenish-hint",
    triggerTemplate: "This product will run out in a few days — reorder now?",
    relatedFeatures: ["inventory-locations-transfers-receiving-forecasting"],
    actionSurfaceId: "operate-inventory",
  },
  {
    id: "live-commerce-starting-hint",
    triggerTemplate: "A live sale is starting for products like yours.",
    relatedFeatures: ["live-streams", "whatnot-live-commerce"],
    actionSurfaceId: "live-commerce-discovery",
  },
  {
    id: "connector-reauth-hint",
    triggerTemplate: "A connection needs you to log in again to keep working.",
    relatedFeatures: ["browser-only-systems", "browser-sessions-isolated-authority"],
    actionSurfaceId: "connector-studio",
  },
  {
    id: "api-explorer-hint",
    triggerTemplate: "You can drive your store programmatically — explore the public API and generate a typed SDK.",
    relatedFeatures: ["api-sdk-rest-graphql"],
    actionSurfaceId: "api-explorer",
  },
  {
    id: "protocol-adapter-hint",
    triggerTemplate: "Connect an agent protocol (MCP, UCP, ACP or A2A) and exchange typed frames with peers.",
    relatedFeatures: ["ucp-acp-mcp-a2a-adapters"],
    actionSurfaceId: "protocol-adapter-studio",
  },
  {
    id: "ingestion-monitor-hint",
    triggerTemplate: "A webhook, file or email arrived — review what it ingested as a journaled command or observation.",
    relatedFeatures: ["webhooks", "csv-xml-edi-sftp-email"],
    actionSurfaceId: "ingestion-monitor",
  },
  {
    id: "physical-capture-hint",
    triggerTemplate: "Count a shelf with your phone — observations reconcile before becoming canonical state.",
    relatedFeatures: ["physical-phone-tablet-camera", "physical-qr", "physical-nfc", "physical-shelf-photos-computer-vision", "physical-cycle-counts"],
    actionSurfaceId: "physical-capture",
  },
];

/** Onboarding / empty-state education pathway (zero-data onboarding). */
export interface OnboardingPathway {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly string[];
  readonly relatedFeatures: readonly string[];
}

export const ONBOARDING_PATHWAYS: readonly OnboardingPathway[] = [
  {
    id: "connect-a-store",
    title: "Connect a store",
    steps: ["Choose a channel or marketplace", "Authorize UNiCOM", "Confirm what syncs"],
    relatedFeatures: ["shopify", "ebay", "amazon", "jumia", "depop", "push-pull-catalogs-prices-inventory-orders-permitted-customer-data"],
  },
  {
    id: "import-a-catalog",
    title: "Import a catalog",
    steps: ["Upload a file or connect a feed", "Map your columns", "Review the result"],
    relatedFeatures: ["catalog-products-variants-skus-collections", "csv-xml-edi-sftp-email"],
  },
  {
    id: "start-selling",
    title: "Start selling",
    steps: ["Pick a look for your storefront", "Set prices", "Turn on checkout"],
    relatedFeatures: ["storefront-themes-content", "cart-checkout-payments", "pricing-promotions-coupons"],
  },
  {
    id: "ask-unicom-to-operate",
    title: "Ask UNiCOM to operate the store",
    steps: ["Say what you want to achieve", "Review the plan and limits", "Approve and watch it run"],
    relatedFeatures: ["global-merchant-agent", "goal-driven-operation", "autonomous-store"],
  },
  {
    id: "find-first-opportunity",
    title: "Find your first opportunity",
    steps: ["Connect your accounts", "Review what UNiCOM finds", "Act on what interests you"],
    relatedFeatures: ["continuous-opportunity-discovery", "opportunity-discovery", "user-discounts"],
  },
  {
    id: "try-buyer-intent",
    title: "Try buyer intent",
    steps: ["Describe what you need", "Add constraints", "Compare the plans"],
    relatedFeatures: ["natural-language-shopping-intent", "intent-deadline", "intent-maximum-total-cost"],
  },
  {
    id: "create-a-group-buy",
    title: "Create a group deal",
    steps: ["Pick a product", "Set the group size and discount", "Invite or wait for buyers"],
    relatedFeatures: ["group-buy-formation", "user-group-buying", "intent-group-buy"],
  },
  {
    id: "connect-physical-inventory",
    title: "Connect physical inventory",
    steps: ["Scan barcodes with your phone", "Count a shelf", "Watch stock update"],
    relatedFeatures: ["physical-barcode-scanners", "physical-phone-tablet-camera", "physical-cycle-counts", "local-pos-no-api", "physical-edge"],
  },
  {
    id: "run-a-simulation",
    title: "Run a simulation",
    steps: ["Pick a change you are considering", "See the predicted result", "Compare alternatives"],
    relatedFeatures: ["commerce-twin", "what-if-counterfactual-simulation"],
  },
  {
    id: "no-rfid-supermarket-quick-start",
    title: "Supermarket quick start — no RFID needed",
    steps: [
      "You do not need RFID",
      "Connect your register or upload sales and stock files",
      "Scan barcodes with your phone",
      "Use your scanner or scale",
      "Count shelves when convenient",
      "Let buyers order and group-buy",
      "Review opportunities",
      "Add RFID later only if you want it",
    ],
    relatedFeatures: [
      "physical-pos",
      "pos",
      "physical-barcode-scanners",
      "physical-scanner-scales",
      "physical-ordinary-weighing-workflows",
      "physical-cycle-counts",
      "physical-receipts-invoices",
      "physical-offline-edge-operation",
      "inventory-locations-transfers-receiving-forecasting",
      "user-group-buying",
    ],
  },
];
