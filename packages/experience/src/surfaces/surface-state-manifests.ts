/**
 * `SURFACE_STATE_MANIFESTS` — one frozen four-state design per registered
 * navigation surface (W3-005). Contract tests assert:
 * - every `NAVIGATION_SURFACES` id has exactly one manifest (zero orphans,
 *   both directions);
 * - every manifest carries ALL FOUR states (loading, empty, error, offline);
 * - every empty state PROPOSES a first action whose target surface is a
 *   registered surface and whose target feature (when present) is a real
 *   matrix row;
 * - every `EDGE_SYNC_SURFACE_IDS` surface declares `surfacesObservationQueue`.
 *
 * Manifests are DESIGNS (render templates): live data — including the
 * observation-queue sync and journaled supersede outcomes — flows through
 * the runtime state constructors, never through these constants.
 */

import type { SurfaceStateManifest } from "./surface-state";
import type { NavigationSurfaceId } from "../navigation/surfaces";

const loading = (summary: string, slowNote: string): SurfaceStateManifest["loading"] => ({
  stateKind: "loading",
  summary,
  slowNote,
});

const empty = (
  reasonSummary: string,
  actionLabel: string,
  actionKind: SurfaceStateManifest["empty"]["firstAction"]["actionKind"],
  targetSurfaceId: NavigationSurfaceId,
  targetFeatureId: string | undefined,
  rationale: string,
  teachingNote: string,
  relatedOnboardingPathwayId?: string,
): SurfaceStateManifest["empty"] => ({
  stateKind: "empty",
  reasonSummary,
  firstAction: { actionLabel, actionKind, targetSurfaceId, ...(targetFeatureId === undefined ? {} : { targetFeatureId }), rationale },
  teachingNote,
  ...(relatedOnboardingPathwayId === undefined ? {} : { relatedOnboardingPathwayId }),
});

const error = (summary: string, failureClass: "failed" | "unknown", severity: SurfaceStateManifest["error"]["severity"], retryable: boolean): SurfaceStateManifest["error"] => ({
  stateKind: "error",
  failureClass,
  summary,
  severity,
  retryable,
  evidence: [],
});

const offline = (degradationNote: string, stillAvailable: readonly string[], surfacesObservationQueue: boolean): SurfaceStateManifest["offline"] => ({
  stateKind: "offline",
  degradationNote,
  stillAvailable,
  surfacesObservationQueue,
});

export const SURFACE_STATE_MANIFESTS: readonly SurfaceStateManifest[] = [
  {
    surfaceId: "command-center-work-graph",
    loading: loading("Gathering your goals, decisions and alerts…", "Large stores can take a moment to summarize."),
    empty: empty("No goals, decisions or alerts yet — your command center starts empty.", "Set your first goal", "create", "command-center-work-graph", "goal-driven-operation", "A first goal seeds the work graph and surfaces pending decisions.", "Start with one plain-language goal; everything else builds around it.", "ask-unicom-to-operate"),
    error: error("We could not confirm the latest business pulse.", "unknown", "medium", true),
    offline: offline("Live pulse is paused while offline; cached figures are shown.", ["cached pulse", "pending decisions"], false),
  },
  {
    surfaceId: "buyer-intent-canvas",
    loading: loading("Preparing your intent canvas…", "Almost ready — constraint fields load first."),
    empty: empty("Nothing here yet — describe what you need in your own words.", "Describe what you need", "create", "buyer-intent-canvas", "natural-language-shopping-intent", "A first intent unlocks constraint fields and plan comparisons.", "One sentence is enough: 'I need a laptop under $1,500 by Friday'.", "try-buyer-intent"),
    error: error("Your intent could not be parsed into a typed plan.", "failed", "medium", true),
    offline: offline("New plan comparisons need a connection; your draft is kept.", ["edit draft", "saved constraints"], false),
  },
  {
    surfaceId: "storefront-studio",
    loading: loading("Loading your storefront…", "Theme assets can take a moment."),
    empty: empty("You have no storefront yet — pick a look and start selling.", "Pick a look for your storefront", "create", "storefront-studio", "storefront-themes-content", "A theme choice creates your first storefront to build on.", "You can change everything later; start with any look.", "start-selling"),
    error: error("Your storefront could not be loaded.", "unknown", "high", true),
    offline: offline("Storefront edits need a connection; changes queue locally.", ["browse current design"], false),
  },
  {
    surfaceId: "autonomous-store-config",
    loading: loading("Loading your autopilot settings and limits…", "Policy revisions load first."),
    empty: empty("Autopilot is not set up — say what you want to achieve and set limits.", "Ask UNiCOM to operate the store", "configure", "autonomous-store-config", "autonomous-store", "A first goal plus limits turns on supervised autonomy.", "You approve every consequential action until you raise the limits.", "ask-unicom-to-operate"),
    error: error("Autopilot state could not be confirmed.", "unknown", "high", true),
    offline: offline("Autopilot keeps running within its limits; changes need a connection.", ["view limits", "override points"], false),
  },
  {
    surfaceId: "operate-catalog",
    loading: loading("Loading your products…", "Large catalogs load in the background."),
    empty: empty("No products yet — add one or import your catalog.", "Add or import products", "import", "operate-catalog", "catalog-products-variants-skus-collections", "A first product makes pricing, inventory and storefront surfaces usable.", "Upload a file or add one product by hand to start.", "import-a-catalog"),
    error: error("Your catalog could not be loaded.", "unknown", "medium", true),
    offline: offline("Product edits need a connection; your work is kept locally.", ["browse products", "stage edits"], false),
  },
  {
    surfaceId: "operate-inventory",
    loading: loading("Loading stock across your locations…", "Counting observations reconcile as they load."),
    empty: empty("No inventory tracked yet — connect a channel or count a shelf.", "Track your first stock", "connect", "operate-inventory", "inventory-locations-transfers-receiving-forecasting", "Stock tracking unlocks receiving, transfers and forecasts.", "Scan barcodes with your phone — no special hardware needed.", "connect-physical-inventory"),
    error: error("Inventory state could not be confirmed.", "unknown", "high", true),
    offline: offline("Offline counts queue on your device and sync when reconnected.", ["capture counts", "view last-known stock"], true),
  },
  {
    surfaceId: "operate-orders",
    loading: loading("Loading orders and fulfillment…", "Recent orders load first."),
    empty: empty("No orders yet — share your storefront or connect a channel.", "Start taking orders", "create", "storefront-studio", "cart-checkout-payments", "A live checkout path brings your first orders in.", "Orders, shipping and returns all start from a first sale.", "start-selling"),
    error: error("Orders could not be loaded.", "unknown", "high", true),
    offline: offline("Fulfillment actions need a connection; in-person sales keep working.", ["view orders", "in-person checkout"], false),
  },
  {
    surfaceId: "operate-customers",
    loading: loading("Loading customers…", "Loyalty status loads with each record."),
    empty: empty("No customers yet — they appear as you sell.", "See where customers come from", "review", "operate-marketing-analytics", "marketing-analytics", "Understanding your first customers shapes your first campaign.", "Customer records build automatically from orders.", undefined),
    error: error("Customer records could not be loaded.", "unknown", "low", true),
    offline: offline("Customer lookups need a connection.", ["view cached list"], false),
  },
  {
    surfaceId: "operate-marketing-analytics",
    loading: loading("Loading reports and campaigns…", "Charts compute from projections."),
    empty: empty("No reports yet — data appears as you sell.", "Start selling to see reports", "create", "storefront-studio", "storefront-themes-content", "A first sale begins the numbers your reports draw from.", "Every order feeds analytics automatically.", undefined),
    error: error("Reports could not be computed.", "unknown", "low", true),
    offline: offline("Reports are paused while offline; cached tiles are shown.", ["cached tiles"], false),
  },
  {
    surfaceId: "operate-pos",
    loading: loading("Connecting your register…", "Terminal sync may take a moment."),
    empty: empty("No register connected yet — set up in-person selling.", "Connect your register", "connect", "local-edge-setup", "local-pos-no-api", "A connected register rings up sales even without a provider API.", "Works with a plain POS export or a store computer.", "no-rfid-supermarket-quick-start"),
    error: error("The register connection could not be confirmed.", "unknown", "high", true),
    offline: offline("The register keeps selling; sales queue and sync when reconnected.", ["ring up sales", "offline queue status"], true),
  },
  {
    surfaceId: "physical-commerce-tools",
    loading: loading("Waking up your store tools…", "Camera and scanner readiness check."),
    empty: empty("Nothing scanned or counted yet — start with one shelf.", "Count a shelf with your phone", "run", "physical-commerce-tools", "physical-cycle-counts", "A first count creates the observation your stock view builds on.", "Your phone camera reads barcodes — no extra hardware.", "connect-physical-inventory"),
    error: error("Store tools could not start.", "failed", "medium", true),
    offline: offline("Tools work fully offline; observations queue with capture-time truth.", ["scan", "count", "weigh", "photograph"], true),
  },
  {
    surfaceId: "opportunity-inbox",
    loading: loading("Looking for opportunities beyond today's task…", "Discovery scans your accounts and items."),
    empty: empty("No opportunities found yet — connect accounts so UNiCOM can look.", "Connect accounts to find opportunities", "connect", "connector-studio", "opportunity-discovery", "Discovery needs somewhere to look: a channel, a store or your accounts.", "Opportunities arrive as cards you can act on or dismiss.", "find-first-opportunity"),
    error: error("Opportunity discovery could not run.", "unknown", "low", true),
    offline: offline("Discovery is paused while offline; seen opportunities stay readable.", ["review seen items"], false),
  },
  {
    surfaceId: "live-commerce-discovery",
    loading: loading("Loading live shopping…", "Stream health and schedules load first."),
    empty: empty("No live sales scheduled — start one or follow a seller.", "Watch or start a live sale", "review", "live-commerce-discovery", "live-streams", "Live sessions appear here from announce through end, with replay.", "Missed a session? Late joiners replay from the start.", undefined),
    error: error("Live streams could not be loaded.", "failed", "medium", true),
    offline: offline("Live viewing needs a connection; announcements stay readable.", ["view schedule", "announcements"], false),
  },
  {
    surfaceId: "lab-surface",
    loading: loading("Preparing the Lab…", "Simulation runtimes warm up first."),
    empty: empty("No simulations or experiments yet — test a decision safely.", "Run your first simulation", "run", "lab-surface", "commerce-twin", "A first what-if shows predicted outcomes before you commit.", "Simulations never touch your real store.", "run-a-simulation"),
    error: error("The Lab could not start.", "unknown", "medium", true),
    offline: offline("Simulations need a connection; past results stay readable.", ["view past results"], false),
  },
  {
    surfaceId: "trust-security-center",
    loading: loading("Loading trust and safety…", "Signals classify as they load."),
    empty: empty("No trust components or incidents yet — they build as you transact.", "See how trust works", "learn", "trust-security-center", "proof-p0-p5", "The proof legend explains what every deal's evidence means.", "Trust builds from verified purchases and provider-signed state.", undefined),
    error: error("Trust and safety state could not be confirmed.", "unknown", "high", true),
    offline: offline("New signals need a connection; active protections keep running.", ["proof legend", "cached incidents"], false),
  },
  {
    surfaceId: "connector-studio",
    loading: loading("Loading your connections…", "Per-connector health checks refresh."),
    empty: empty("No channels connected yet — connect your first channel.", "Connect your first channel", "connect", "connector-studio", "shopify", "A first connection syncs products, orders and inventory.", "API, files or a controlled login — even systems without an API.", "connect-a-store"),
    error: error("Connection health could not be confirmed.", "unknown", "medium", true),
    offline: offline("Connections need a connection to check; last-known health is shown.", ["last-known health", "recovery steps"], false),
  },
  {
    surfaceId: "local-edge-setup",
    loading: loading("Looking for your store computer…", "Local network discovery runs first."),
    empty: empty("No store computer connected — connect registers, files and devices.", "Connect a store computer", "connect", "local-edge-setup", "local-pos-no-api", "A connected edge keeps your shop working without internet or APIs.", "Works with the register and files you already have.", "no-rfid-supermarket-quick-start"),
    error: error("The local edge could not be reached.", "failed", "high", true),
    offline: offline("The edge is designed for offline operation; queue and sync state shown.", ["queue observations", "view sync state"], true),
  },
  {
    surfaceId: "app-extensions",
    loading: loading("Loading apps and skills…", "Installed extensions load first."),
    empty: empty("No apps or skills installed — browse or ask for a new one.", "Browse or request an app", "learn", "app-extensions", "app-extension-ecosystem", "Extensions add channels and tools; skills teach UNiCOM new tricks.", "You can ask for a custom app or workflow in plain words.", undefined),
    error: error("Apps and skills could not be loaded.", "unknown", "low", true),
    offline: offline("Installing needs a connection; installed apps keep working.", ["use installed apps"], false),
  },
  {
    surfaceId: "api-explorer",
    loading: loading("Loading the public API surface…", "Endpoint contracts load first."),
    empty: empty("No API endpoints loaded yet — your store is ready to be driven programmatically.", "Browse the API", "learn", "api-explorer", "api-sdk-rest-graphql", "The API explorer lists every endpoint and generates a typed SDK for you.", "Try a GET endpoint to see a journal-derived projection.", undefined),
    error: error("The API explorer could not load.", "unknown", "medium", true),
    offline: offline("The API explorer works from cached contracts while offline.", ["browse contracts"], false),
  },
  {
    surfaceId: "protocol-adapter-studio",
    loading: loading("Loading agent protocol adapters…", "Adapter descriptors load first."),
    empty: empty("No agent protocol adapter connected yet — connect MCP, UCP, ACP or A2A.", "Connect an agent protocol", "connect", "protocol-adapter-studio", "ucp-acp-mcp-a2a-adapters", "Agent protocol adapters exchange typed frames with peers — never trusted instructions.", "MCP, UCP, ACP and A2A each register as an explicit ConnectorCapability.", undefined),
    error: error("The agent protocol adapters could not load.", "unknown", "medium", true),
    offline: offline("Protocol adapters need a connection to exchange frames.", ["adapter descriptors"], false),
  },
  {
    surfaceId: "ingestion-monitor",
    loading: loading("Loading ingestion events…", "Per-source-family evidence loads first."),
    empty: empty("No ingestion events yet — connect a webhook, file drop or email source.", "Connect an ingestion source", "connect", "ingestion-monitor", "webhooks", "Ingested content is data, never trusted instructions — events turn into journaled commands or observations.", "Webhook, CSV, XML/EDI, SFTP and email are all first-class ingestion paths.", undefined),
    error: error("The ingestion monitor could not load.", "unknown", "medium", true),
    offline: offline("Ingested events queue at the edge; the monitor shows last-known evidence.", ["ingestion evidence", "queued events"], true),
  },
  {
    surfaceId: "physical-capture",
    loading: loading("Waking up physical capture…", "Camera, QR, NFC, shelf-photo and cycle-count journeys load."),
    empty: empty("Nothing captured yet — start with a phone-camera barcode scan.", "Scan with your phone", "run", "physical-capture", "physical-phone-tablet-camera", "Phone-camera scans work offline and queue observations for reconciliation.", "Observations reconcile before becoming canonical state.", "connect-physical-inventory"),
    error: error("Physical capture could not start.", "failed", "medium", true),
    offline: offline("Physical capture works fully offline; observations queue with capture-time truth.", ["scan", "count", "photograph", "tap"], true),
  },
  {
    surfaceId: "explore-capabilities",
    loading: loading("Collecting everything UNiCOM can do…", "Cards derive from the full feature list."),
    empty: empty("Nothing to browse yet — everything UNiCOM can do will appear here.", "See everything you can do", "learn", "explore-capabilities", undefined, "Explore groups every capability by what you want to achieve.", "Each card has a Try-it action — no jargon required.", undefined),
    error: error("The capability list could not be loaded.", "unknown", "low", true),
    offline: offline("Browsing works from the cached capability list.", ["browse cards"], false),
  },
  {
    surfaceId: "workspace-settings",
    loading: loading("Loading your settings…", "Workspace and roles load first."),
    empty: empty("No settings to show yet — set up your workspace.", "Set up your workspace", "configure", "workspace-settings", undefined, "Roles and workspace choices shape what you see first.", "Switching roles changes emphasis, never who you are.", undefined),
    error: error("Settings could not be loaded.", "unknown", "low", true),
    offline: offline("Most settings changes need a connection.", ["view settings"], false),
  },
  {
    surfaceId: "operator-console",
    loading: loading("Loading system and data status…", "Deployment adapters report first."),
    empty: empty("No deployment status yet — connect a deployment to see it here.", "See system status", "review", "operator-console", "deploy-observability", "The console shows where data lives and how the platform runs.", "Provider replacement boundaries stay visible here.", undefined),
    error: error("System status could not be confirmed.", "unknown", "high", true),
    offline: offline("Operator status is limited while offline; the edge queue reports locally.", ["edge queue health", "supersede journal"], true),
  },
];
