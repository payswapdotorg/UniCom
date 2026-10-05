/**
 * Encoded feature completeness matrix.
 *
 * Source of truth: docs/FEATURE-COMPLETENESS-MATRIX.md (locked 2026-10-05).
 * Every row is a verbatim title from that document plus a plain-language
 * user label and an Explore grouping. The contract test suite parses the
 * markdown document and asserts this encoding stays in sync, and that every
 * row has a discoverable path (W3-001 UX acceptance).
 *
 `userLabel` must never require internal vocabulary (FROZEN §22.7).
 */

/** Sections of docs/FEATURE-COMPLETENESS-MATRIX.md. */
export type FeatureMatrixSectionId =
  | "merchant-parity"
  | "ai-native-merchant-layer"
  | "commerce-network"
  | "buyer-agent"
  | "coordination-organization"
  | "user-opportunities"
  | "trust-security"
  | "physical-commerce"
  | "deployment-coverage";

/** Explore groups (docs/UX-DEPLOYMENT.md "Explore / Capabilities"). */
export type ExploreGroupId = "buy" | "sell" | "operate" | "discover" | "automate" | "connect" | "protect";

/** One feature row of the completeness matrix. */
export interface FeatureRow {
  readonly id: string;
  readonly section: FeatureMatrixSectionId;
  /** Verbatim row text from docs/FEATURE-COMPLETENESS-MATRIX.md. */
  readonly title: string;
  /** Plain-language label users see. No internal vocabulary. */
  readonly userLabel: string;
  readonly exploreGroup: ExploreGroupId;
}

/** The encoded matrix. Kept in lockstep with the markdown by contract tests. */
export const FEATURE_MATRIX: readonly {
  readonly section: FeatureMatrixSectionId;
  readonly rows: readonly FeatureRow[];
}[] = [
  {
    section: "merchant-parity",
    rows: [
      { id: "storefront-themes-content", section: "merchant-parity", title: "Storefront/themes/content", userLabel: "Design your storefront", exploreGroup: "sell" },
      { id: "catalog-products-variants-skus-collections", section: "merchant-parity", title: "Catalog/products/variants/SKUs/collections", userLabel: "Manage products and collections", exploreGroup: "operate" },
      { id: "pricing-promotions-coupons", section: "merchant-parity", title: "Pricing/promotions/coupons", userLabel: "Set prices, sales and coupons", exploreGroup: "operate" },
      { id: "inventory-locations-transfers-receiving-forecasting", section: "merchant-parity", title: "Inventory/locations/transfers/receiving/forecasting", userLabel: "Track stock across locations", exploreGroup: "operate" },
      { id: "cart-checkout-payments", section: "merchant-parity", title: "Cart/checkout/payments", userLabel: "Checkout and payments", exploreGroup: "sell" },
      { id: "orders-fulfillment-returns-exchanges-refunds", section: "merchant-parity", title: "Orders/fulfillment/returns/exchanges/refunds", userLabel: "Orders, shipping and returns", exploreGroup: "operate" },
      { id: "customers-crm-loyalty-subscriptions", section: "merchant-parity", title: "Customers/CRM/loyalty/subscriptions", userLabel: "Customers, loyalty and subscriptions", exploreGroup: "operate" },
      { id: "marketing-analytics", section: "merchant-parity", title: "Marketing/analytics", userLabel: "Marketing and reports", exploreGroup: "operate" },
      { id: "b2b", section: "merchant-parity", title: "B2B", userLabel: "Sell business-to-business", exploreGroup: "operate" },
      { id: "pos", section: "merchant-parity", title: "POS", userLabel: "Sell in person", exploreGroup: "operate" },
      { id: "multi-location-channel-commerce", section: "merchant-parity", title: "Multi-location/channel commerce", userLabel: "Sell across locations and channels", exploreGroup: "operate" },
      { id: "app-extension-ecosystem", section: "merchant-parity", title: "App/extension ecosystem", userLabel: "Apps and extensions", exploreGroup: "connect" },
      { id: "ai-generated-apps-workflows", section: "merchant-parity", title: "AI-generated apps/workflows", userLabel: "Ask for a custom app or workflow", exploreGroup: "automate" },
      { id: "autonomous-store", section: "merchant-parity", title: "Autonomous Store", userLabel: "Let UNiCOM run your store within limits you set", exploreGroup: "sell" },
    ],
  },
  {
    section: "ai-native-merchant-layer",
    rows: [
      { id: "global-merchant-agent", section: "ai-native-merchant-layer", title: "Global merchant agent", userLabel: "Your store's own agent", exploreGroup: "automate" },
      { id: "goal-driven-operation", section: "ai-native-merchant-layer", title: "Goal-driven operation", userLabel: "Tell UNiCOM what you want to achieve", exploreGroup: "automate" },
      { id: "persistent-merchant-memory", section: "ai-native-merchant-layer", title: "Persistent merchant memory", userLabel: "UNiCOM remembers your business", exploreGroup: "automate" },
      { id: "goal-plan-simulate-approve-execute-verify-learn", section: "ai-native-merchant-layer", title: "Goal → plan → simulate → approve → execute → verify → learn", userLabel: "Plan, preview, approve, then verify results", exploreGroup: "automate" },
      { id: "commerce-twin", section: "ai-native-merchant-layer", title: "Commerce Twin", userLabel: "A safe copy of your business to test ideas on", exploreGroup: "automate" },
      { id: "what-if-counterfactual-simulation", section: "ai-native-merchant-layer", title: "What-if/counterfactual simulation", userLabel: "What-if scenarios", exploreGroup: "automate" },
      { id: "causal-diagnosis", section: "ai-native-merchant-layer", title: "Causal diagnosis", userLabel: "Why did sales change?", exploreGroup: "automate" },
      { id: "autonomous-pricing-merchandising-replenishment-campaigns", section: "ai-native-merchant-layer", title: "Autonomous pricing/merchandising/replenishment/campaigns", userLabel: "Automatic pricing, stock and campaigns within your limits", exploreGroup: "automate" },
      { id: "supplier-optimization", section: "ai-native-merchant-layer", title: "Supplier optimization", userLabel: "Better supplier choices", exploreGroup: "automate" },
      { id: "experimentation-canary-rollout", section: "ai-native-merchant-layer", title: "Experimentation/canary/rollout", userLabel: "Safe experiments and gradual rollouts", exploreGroup: "automate" },
      { id: "agent-generated-business-tools", section: "ai-native-merchant-layer", title: "Agent-generated business tools", userLabel: "Custom business tools built for you", exploreGroup: "automate" },
      { id: "continuous-opportunity-discovery", section: "ai-native-merchant-layer", title: "Continuous opportunity discovery", userLabel: "Ongoing ways to save or earn more", exploreGroup: "discover" },
    ],
  },
  {
    section: "commerce-network",
    rows: [
      { id: "push-pull-catalogs-prices-inventory-orders-permitted-customer-data", section: "commerce-network", title: "Push/pull catalogs, prices, inventory, orders and permitted customer data", userLabel: "Sync products, prices, stock and orders both ways", exploreGroup: "connect" },
      { id: "shopify", section: "commerce-network", title: "Shopify", userLabel: "Connect Shopify", exploreGroup: "connect" },
      { id: "ebay", section: "commerce-network", title: "eBay", userLabel: "Connect eBay", exploreGroup: "connect" },
      { id: "amazon", section: "commerce-network", title: "Amazon", userLabel: "Connect Amazon", exploreGroup: "connect" },
      { id: "jumia", section: "commerce-network", title: "Jumia", userLabel: "Connect Jumia", exploreGroup: "connect" },
      { id: "depop", section: "commerce-network", title: "Depop", userLabel: "Connect Depop", exploreGroup: "connect" },
      { id: "whatnot-live-commerce", section: "commerce-network", title: "Whatnot/live commerce", userLabel: "Live shopping like Whatnot", exploreGroup: "connect" },
      { id: "ucp-acp-mcp-a2a-adapters", section: "commerce-network", title: "UCP/ACP/MCP/A2A adapters", userLabel: "Agent-to-agent commerce protocols", exploreGroup: "connect" },
      { id: "api-sdk-rest-graphql", section: "commerce-network", title: "API/SDK/REST/GraphQL", userLabel: "Direct API connections", exploreGroup: "connect" },
      { id: "webhooks", section: "commerce-network", title: "Webhooks", userLabel: "Real-time event feeds", exploreGroup: "connect" },
      { id: "cli", section: "commerce-network", title: "CLI", userLabel: "Command-line control", exploreGroup: "connect" },
      { id: "csv-xml-edi-sftp-email", section: "commerce-network", title: "CSV/XML/EDI/SFTP/email", userLabel: "Sync through files and email", exploreGroup: "connect" },
      { id: "browser-only-systems", section: "commerce-network", title: "Browser-only systems", userLabel: "Connect systems that have no API", exploreGroup: "connect" },
      { id: "browser-sessions-isolated-authority", section: "commerce-network", title: "Browser sessions with isolated authority", userLabel: "Controlled logins that never expose your secrets", exploreGroup: "connect" },
      { id: "local-pos-no-api", section: "commerce-network", title: "Local POS with no API", userLabel: "Connect a cash register without an API", exploreGroup: "connect" },
      { id: "usb-serial-lan", section: "commerce-network", title: "USB/serial/LAN", userLabel: "Connect local devices and networks", exploreGroup: "connect" },
      { id: "live-streams", section: "commerce-network", title: "Live streams", userLabel: "Buy and sell inside live streams", exploreGroup: "connect" },
      { id: "physical-edge", section: "commerce-network", title: "Physical edge", userLabel: "Connect your physical store equipment", exploreGroup: "connect" },
    ],
  },
  {
    section: "buyer-agent",
    rows: [
      { id: "natural-language-shopping-intent", section: "buyer-agent", title: "Natural-language shopping intent", userLabel: "Describe what you need in your own words", exploreGroup: "buy" },
      { id: "intent-deadline", section: "buyer-agent", title: "deadline", userLabel: "Set a deadline", exploreGroup: "buy" },
      { id: "intent-maximum-total-cost", section: "buyer-agent", title: "maximum total cost", userLabel: "Set a total budget", exploreGroup: "buy" },
      { id: "intent-quality", section: "buyer-agent", title: "quality", userLabel: "Require a quality level", exploreGroup: "buy" },
      { id: "intent-seller-credibility", section: "buyer-agent", title: "seller credibility", userLabel: "Choose how trusted sellers must be", exploreGroup: "buy" },
      { id: "intent-privacy-security", section: "buyer-agent", title: "privacy/security", userLabel: "Set privacy and security requirements", exploreGroup: "buy" },
      { id: "intent-speed", section: "buyer-agent", title: "speed", userLabel: "Say how fast you need it", exploreGroup: "buy" },
      { id: "intent-delivery-pickup", section: "buyer-agent", title: "delivery/pickup", userLabel: "Delivery or pickup preferences", exploreGroup: "buy" },
      { id: "intent-condition", section: "buyer-agent", title: "condition", userLabel: "New, used or refurbished", exploreGroup: "buy" },
      { id: "intent-substitutes", section: "buyer-agent", title: "substitutes", userLabel: "Allow similar alternatives", exploreGroup: "buy" },
      { id: "intent-financing", section: "buyer-agent", title: "financing", userLabel: "Pay over time", exploreGroup: "buy" },
      { id: "intent-buy-now-vs-wait", section: "buyer-agent", title: "buy-now vs wait", userLabel: "Buy now or wait for a better price", exploreGroup: "buy" },
      { id: "intent-price-timing", section: "buyer-agent", title: "price timing", userLabel: "Track price changes", exploreGroup: "buy" },
      { id: "intent-local-commerce", section: "buyer-agent", title: "local commerce", userLabel: "Buy locally", exploreGroup: "buy" },
      { id: "intent-group-buy", section: "buyer-agent", title: "group-buy", userLabel: "Team up with other buyers", exploreGroup: "buy" },
      { id: "intent-merchant-suggested-group-buy", section: "buyer-agent", title: "merchant-suggested group-buy", userLabel: "Seller-offered group deals", exploreGroup: "buy" },
      { id: "intent-negotiation", section: "buyer-agent", title: "negotiation", userLabel: "Negotiate the price", exploreGroup: "buy" },
      { id: "intent-rent-borrow", section: "buyer-agent", title: "rent/borrow", userLabel: "Rent or borrow instead of buying", exploreGroup: "buy" },
      { id: "intent-resale", section: "buyer-agent", title: "resale", userLabel: "Plan to resell later", exploreGroup: "buy" },
      { id: "intent-swap-trade", section: "buyer-agent", title: "swap/trade", userLabel: "Swap what you already own", exploreGroup: "buy" },
      { id: "intent-multi-hop-trade-cycles", section: "buyer-agent", title: "multi-hop trade cycles", userLabel: "Multi-person swaps", exploreGroup: "buy" },
      { id: "intent-proof-recourse-aware-execution", section: "buyer-agent", title: "proof/recourse aware execution", userLabel: "Buy with proof and protection", exploreGroup: "buy" },
    ],
  },
  {
    section: "coordination-organization",
    rows: [
      { id: "one-main-agent", section: "coordination-organization", title: "One Main Agent", userLabel: "One assistant that knows your whole world", exploreGroup: "automate" },
      { id: "skills", section: "coordination-organization", title: "skills", userLabel: "Skills your agent can use and learn", exploreGroup: "automate" },
      { id: "ephemeral-system-actors-delegates", section: "coordination-organization", title: "ephemeral system actors/delegates", userLabel: "Temporary helper agents for specific jobs", exploreGroup: "automate" },
      { id: "capability-based-actor-representation", section: "coordination-organization", title: "capability-based actor representation", userLabel: "See exactly what each helper is allowed to do", exploreGroup: "automate" },
      { id: "strategy-search", section: "coordination-organization", title: "strategy search", userLabel: "Compare possible plans", exploreGroup: "automate" },
      { id: "organization-search", section: "coordination-organization", title: "organization search", userLabel: "Find the best team for a job", exploreGroup: "automate" },
      { id: "opportunity-discovery", section: "coordination-organization", title: "opportunity discovery", userLabel: "Spot opportunities automatically", exploreGroup: "discover" },
      { id: "group-buy-formation", section: "coordination-organization", title: "group-buy formation", userLabel: "Form group buys", exploreGroup: "discover" },
      { id: "merchant-demand-generation-proposals", section: "coordination-organization", title: "merchant demand-generation proposals", userLabel: "Propose group deals to sellers", exploreGroup: "discover" },
      { id: "bounded-multi-hop-trade", section: "coordination-organization", title: "bounded multi-hop trade", userLabel: "Multi-person swaps with safety limits", exploreGroup: "discover" },
      { id: "privacy-aware-matching", section: "coordination-organization", title: "privacy-aware matching", userLabel: "Get matched without exposing your data", exploreGroup: "discover" },
      { id: "deadline-aware-waiting", section: "coordination-organization", title: "deadline-aware waiting", userLabel: "Smart waiting within your deadlines", exploreGroup: "discover" },
      { id: "multi-objective-optimization", section: "coordination-organization", title: "multi-objective optimization", userLabel: "Balance price, speed, quality and risk", exploreGroup: "automate" },
      { id: "system1-jepa-system2-routing", section: "coordination-organization", title: "System 1 / JEPA / System 2 routing", userLabel: "Fast answers, deep thinking when it matters", exploreGroup: "automate" },
    ],
  },
  {
    section: "user-opportunities",
    rows: [
      { id: "user-resale-owned-items", section: "user-opportunities", title: "resale of owned items", userLabel: "Sell what you own", exploreGroup: "discover" },
      { id: "user-rental", section: "user-opportunities", title: "rental", userLabel: "Rent out your things", exploreGroup: "discover" },
      { id: "user-swaps", section: "user-opportunities", title: "swaps", userLabel: "Trade items with others", exploreGroup: "discover" },
      { id: "user-group-buying", section: "user-opportunities", title: "group buying", userLabel: "Group buying power", exploreGroup: "discover" },
      { id: "user-discounts", section: "user-opportunities", title: "discounts", userLabel: "Discounts for you", exploreGroup: "discover" },
      { id: "user-future-price-opportunities", section: "user-opportunities", title: "future-price opportunities", userLabel: "Buy later for less", exploreGroup: "discover" },
      { id: "user-unused-subscriptions", section: "user-opportunities", title: "unused subscriptions", userLabel: "Unused subscriptions worth money", exploreGroup: "discover" },
      { id: "user-warranty-recovery", section: "user-opportunities", title: "warranty/recovery", userLabel: "Warranty and recovery claims", exploreGroup: "discover" },
      { id: "user-local-pickup-shared-logistics", section: "user-opportunities", title: "local pickup/shared logistics", userLabel: "Pickup and shared delivery", exploreGroup: "discover" },
      { id: "user-other-proactive-opportunities", section: "user-opportunities", title: "other proactive economic opportunities", userLabel: "More ways to save or earn", exploreGroup: "discover" },
    ],
  },
  {
    section: "trust-security",
    rows: [
      { id: "separate-trust-kinds", section: "trust-security", title: "Separate UserTrust, AgentTrust, CapabilityTrust and TransactionProof.", userLabel: "Trust explained in parts, not one score", exploreGroup: "protect" },
      { id: "proof-p0-p5", section: "trust-security", title: "Proof P0–P5.", userLabel: "Proof levels for every deal", exploreGroup: "protect" },
      { id: "threat-fake-rigged-reviews", section: "trust-security", title: "fake/rigged reviews", userLabel: "Spot fake reviews", exploreGroup: "protect" },
      { id: "threat-review-rings", section: "trust-security", title: "review rings", userLabel: "Detect organized review abuse", exploreGroup: "protect" },
      { id: "threat-counterfeit-product-substitution", section: "trust-security", title: "counterfeit/product substitution", userLabel: "Catch counterfeit items", exploreGroup: "protect" },
      { id: "threat-wrong-item-shipments", section: "trust-security", title: "wrong-item shipments", userLabel: "Wrong-item shipment alerts", exploreGroup: "protect" },
      { id: "threat-false-non-delivery", section: "trust-security", title: "false non-delivery", userLabel: "False non-delivery detection", exploreGroup: "protect" },
      { id: "threat-false-wrong-item-claims", section: "trust-security", title: "false wrong-item claims", userLabel: "False claim detection", exploreGroup: "protect" },
      { id: "threat-refund-return-abuse", section: "trust-security", title: "refund/return abuse", userLabel: "Refund and return abuse alerts", exploreGroup: "protect" },
      { id: "threat-account-agent-compromise", section: "trust-security", title: "account/agent compromise", userLabel: "Account takeover protection", exploreGroup: "protect" },
      { id: "threat-connector-compromise", section: "trust-security", title: "connector compromise", userLabel: "Connected-account protection", exploreGroup: "protect" },
      { id: "threat-prompt-injection", section: "trust-security", title: "prompt injection", userLabel: "Protection from manipulated content", exploreGroup: "protect" },
      { id: "threat-marketplace-collusion", section: "trust-security", title: "marketplace collusion", userLabel: "Collusion detection", exploreGroup: "protect" },
      { id: "threat-sybil-identities", section: "trust-security", title: "Sybil identities", userLabel: "Fake-identity detection", exploreGroup: "protect" },
      { id: "threat-anomalous-agent-behavior", section: "trust-security", title: "anomalous agent behavior", userLabel: "Unusual agent behavior alerts", exploreGroup: "protect" },
      { id: "security-pipeline-signal-to-learning", section: "trust-security", title: "Security uses signal → signature → deterministic policy → mitigation → evidence → defensive broadcast → learning.", userLabel: "How threats are found, stopped and learned from", exploreGroup: "protect" },
    ],
  },
  {
    section: "physical-commerce",
    rows: [
      { id: "physical-rfid", section: "physical-commerce", title: "RFID", userLabel: "RFID tagging (optional upgrade)", exploreGroup: "operate" },
      { id: "physical-barcode-scanners", section: "physical-commerce", title: "barcode scanners", userLabel: "Barcode scanners", exploreGroup: "operate" },
      { id: "physical-phone-tablet-camera", section: "physical-commerce", title: "phone/tablet camera", userLabel: "Scan with your phone camera", exploreGroup: "operate" },
      { id: "physical-qr", section: "physical-commerce", title: "QR", userLabel: "QR codes", exploreGroup: "operate" },
      { id: "physical-nfc", section: "physical-commerce", title: "NFC", userLabel: "Tap-to-scan (NFC)", exploreGroup: "operate" },
      { id: "physical-pos", section: "physical-commerce", title: "POS", userLabel: "In-person checkout hardware", exploreGroup: "operate" },
      { id: "physical-scanner-scales", section: "physical-commerce", title: "scanner scales", userLabel: "Scanner scales", exploreGroup: "operate" },
      { id: "physical-ordinary-weighing-workflows", section: "physical-commerce", title: "ordinary weighing workflows", userLabel: "Weigh items to sell them", exploreGroup: "operate" },
      { id: "physical-shelf-photos-computer-vision", section: "physical-commerce", title: "shelf photos/computer vision", userLabel: "Shelf photos and recognition", exploreGroup: "operate" },
      { id: "physical-cycle-counts", section: "physical-commerce", title: "cycle counts", userLabel: "Count stock on shelves", exploreGroup: "operate" },
      { id: "physical-receipts-invoices", section: "physical-commerce", title: "receipts/invoices", userLabel: "Capture receipts and invoices", exploreGroup: "operate" },
      { id: "physical-local-network", section: "physical-commerce", title: "local network", userLabel: "Connect over your local network", exploreGroup: "connect" },
      { id: "physical-usb-serial", section: "physical-commerce", title: "USB/serial", userLabel: "USB and serial devices", exploreGroup: "connect" },
      { id: "physical-offline-edge-operation", section: "physical-commerce", title: "offline edge operation", userLabel: "Keep working during internet outages", exploreGroup: "connect" },
    ],
  },
  {
    section: "deployment-coverage",
    rows: [
      { id: "deploy-edge-api", section: "deployment-coverage", title: "edge API", userLabel: "Fast global API access", exploreGroup: "operate" },
      { id: "deploy-durable-workflows", section: "deployment-coverage", title: "durable workflows", userLabel: "Long-running jobs that never get lost", exploreGroup: "operate" },
      { id: "deploy-async-queues", section: "deployment-coverage", title: "async queues", userLabel: "Background processing", exploreGroup: "operate" },
      { id: "deploy-realtime-coordination", section: "deployment-coverage", title: "realtime coordination", userLabel: "Live updates", exploreGroup: "operate" },
      { id: "deploy-postgres", section: "deployment-coverage", title: "Postgres", userLabel: "Reliable records database", exploreGroup: "operate" },
      { id: "deploy-object-evidence-storage", section: "deployment-coverage", title: "object/evidence storage", userLabel: "File and evidence storage", exploreGroup: "operate" },
      { id: "deploy-cache", section: "deployment-coverage", title: "cache", userLabel: "Fast caching", exploreGroup: "operate" },
      { id: "deploy-browser-runtime", section: "deployment-coverage", title: "browser runtime", userLabel: "Safe browsing for connections", exploreGroup: "operate" },
      { id: "deploy-local-merchant-edge", section: "deployment-coverage", title: "local merchant edge", userLabel: "Runs partly on your own computer", exploreGroup: "operate" },
      { id: "deploy-model-gateway", section: "deployment-coverage", title: "model gateway", userLabel: "AI model access", exploreGroup: "operate" },
      { id: "deploy-observability", section: "deployment-coverage", title: "observability", userLabel: "Full activity history", exploreGroup: "operate" },
      { id: "deploy-replaceable-compute-provider-adapters", section: "deployment-coverage", title: "replaceable compute/provider adapters", userLabel: "Easily move between providers", exploreGroup: "operate" },
    ],
  },
];

/**
 * Features that are explicitly OPTIONAL (FROZEN §22.5, INVARIANT 46).
 * Everything else in the matrix is first-class; RFID must never be required.
 */
export const OPTIONAL_FEATURES: readonly {
  readonly featureId: string;
  readonly optionalBecause: string;
}[] = [
  {
    featureId: "physical-rfid",
    optionalBecause: "RFID is an accelerator, not a prerequisite. Barcode, camera, POS, file, receipt and local-edge paths are first-class without it.",
  },
];
