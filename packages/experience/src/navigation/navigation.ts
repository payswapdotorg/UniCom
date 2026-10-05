/**
 * Primary navigation shape (W3-001 §3, docs/UX-DEPLOYMENT.md
 * "Feature discoverability architecture").
 *
 * Navigation is organized around user intent, not internal subsystems.
 * Users never need internal vocabulary ("capability graph", "TradeCycle",
 * "Organization Lab") to reach a capability — surfaces carry plain-language
 * titles and the universal intent surface routes natural-language requests.
 */

/** The ten canonical primary navigation areas. */
export type PrimaryNavAreaId =
  | "home-command-center"
  | "buy-intent-canvas"
  | "sell-store"
  | "operate"
  | "discover"
  | "lab"
  | "trust-security"
  | "connections"
  | "explore-capabilities"
  | "settings";

/** A primary navigation area as rendered in the product. */
export interface PrimaryNavArea {
  readonly id: PrimaryNavAreaId;
  /** Plain-language label; internal subsystem names are forbidden here. */
  readonly title: string;
  readonly purpose: string;
  /** Example natural-language requests the universal intent input routes here. */
  readonly intentAliases: readonly string[];
}

/** The canonical primary navigation (order matters for rendering). */
export const PRIMARY_NAVIGATION_AREAS: readonly PrimaryNavArea[] = [
  {
    id: "home-command-center",
    title: "Home",
    purpose: "Your command center: goals, pending decisions, opportunities, alerts and health at a glance",
    intentAliases: ["what should I focus on", "how is my store doing", "show me my day"],
  },
  {
    id: "buy-intent-canvas",
    title: "Buy",
    purpose: "Describe what you need in your own words and let UNiCOM find, compare and get it",
    intentAliases: ["I need something", "find me", "buy", "I want"],
  },
  {
    id: "sell-store",
    title: "Sell",
    purpose: "Set up your storefront, products and how you sell — including letting UNiCOM run the store within your limits",
    intentAliases: ["start selling", "set up my store", "sell online"],
  },
  {
    id: "operate",
    title: "Operate",
    purpose: "Day-to-day operations: catalog, orders, inventory, customers, marketing, in-person selling",
    intentAliases: ["show my orders", "check stock", "who are my customers"],
  },
  {
    id: "discover",
    title: "Discover",
    purpose: "Opportunities beyond today's task: group deals, selling what you own, swaps, live shopping",
    intentAliases: ["any opportunities", "ways to save", "live shopping"],
  },
  {
    id: "lab",
    title: "Lab",
    purpose: "Test decisions before making them: simulations, experiments and trying new ways of working",
    intentAliases: ["what if", "simulate", "experiment"],
  },
  {
    id: "trust-security",
    title: "Trust & Safety",
    purpose: "Who and what to trust, proof for every deal, and protection against fraud and abuse",
    intentAliases: ["is this safe", "show security alerts", "who can I trust"],
  },
  {
    id: "connections",
    title: "Connections",
    purpose: "Connect channels, marketplaces, POS systems, local devices, apps and skills — even systems without an API",
    intentAliases: ["connect", "add a channel", "link my store"],
  },
  {
    id: "explore-capabilities",
    title: "Explore",
    purpose: "Everything UNiCOM can do, browsable by what you want to achieve — no jargon required",
    intentAliases: ["what can you do", "show me features", "help me get started"],
  },
  {
    id: "settings",
    title: "Settings",
    purpose: "Workspace, roles, deployment and operator controls",
    intentAliases: ["settings", "switch role", "where is my data"],
  },
];
