/**
 * W3-009 — Journey family registry (the 19 §10 families + discoverability).
 *
 * The runner must schedule and score ALL applicable journey families per
 * cohort. Omitting a journey family from the overall campaign is forbidden
 * (protocol §10).
 *
 * Each entry declares: which surfaces the family touches, which roles are
 * applicable, which W1 project manifest fields drive it, and whether the
 * no-RFID path applies.
 *
 * Source: docs/simulations/V3-EXPERIMENT-PROTOCOL.md §10.
 */

import type { JourneyFamilyId } from "./journey-evidence";

/** One entry in the journey registry. */
export interface JourneyFamilyRegistryEntry {
  readonly journeyFamilyId: JourneyFamilyId;
  /** Section reference in the experiment protocol. */
  readonly protocolSection: string;
  /** The user-facing label (no internal vocabulary). */
  readonly userLabel: string;
  /** Surfaces the journey typically touches (in navigation order). */
  readonly surfaces: readonly string[];
  /** Roles applicable to this journey family (W2 contract). */
  readonly applicableRoles: readonly string[];
  /** Whether the no-RFID supermarket path applies. */
  readonly noRfidPath: boolean;
  /** Whether the journey is connector/provider-dependent. */
  readonly connectorDependent: boolean;
  /** Whether the journey requires explicit visible approval. */
  readonly approvalRequired: boolean;
}

/** The 19 journey family ids (verbatim from the protocol §10 + state file). */
export const JOURNEY_FAMILY_IDS: readonly JourneyFamilyId[] = [
  "buyer-intent-constraints",
  "offer-sourcing-comparison",
  "buy-now-vs-wait-price-timing",
  "existing-group-buy",
  "latent-demand-merchant-group-buy-proposal",
  "rent-borrow-vs-buy",
  "resale-rental-consignment",
  "proactive-economic-opportunities",
  "bounded-multi-hop-trade-cycle",
  "merchant-commerce-lifecycle",
  "supplier-procurement-receiving",
  "b2b-multi-location-supplier-coordination",
  "autonomous-store-policy",
  "commerce-twin-what-if",
  "connected-commerce-channels-and-live-commerce",
  "physical-no-rfid-supermarket",
  "trust-security-fraud-and-recourse",
  "failure-unknown-idempotency-recovery",
  "gui-feature-discoverability",
];

/** The registry itself. */
export const JOURNEY_FAMILY_REGISTRY: readonly JourneyFamilyRegistryEntry[] = [
  {
    journeyFamilyId: "buyer-intent-constraints",
    protocolSection: "§10.1",
    userLabel: "Describe what you need in your own words",
    surfaces: ["buyer-intent-canvas"],
    applicableRoles: ["buyer", "procurement", "project-owner"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "offer-sourcing-comparison",
    protocolSection: "§10.2",
    userLabel: "Compare sellers, providers and offers",
    surfaces: ["buyer-intent-canvas", "opportunity-inbox"],
    applicableRoles: ["buyer", "procurement"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "buy-now-vs-wait-price-timing",
    protocolSection: "§10.3",
    userLabel: "Buy now or wait for a better price",
    surfaces: ["buyer-intent-canvas", "opportunity-inbox"],
    applicableRoles: ["buyer", "procurement"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "existing-group-buy",
    protocolSection: "§10.4",
    userLabel: "Find and join an existing group deal",
    surfaces: ["opportunity-inbox", "buyer-intent-canvas"],
    applicableRoles: ["buyer", "end-user"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "latent-demand-merchant-group-buy-proposal",
    protocolSection: "§10.5",
    userLabel: "Propose a group deal to a seller",
    surfaces: ["opportunity-inbox", "command-center-work-graph"],
    applicableRoles: ["buyer", "procurement", "merchant"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "rent-borrow-vs-buy",
    protocolSection: "§10.6",
    userLabel: "Rent or borrow instead of buying",
    surfaces: ["buyer-intent-canvas", "opportunity-inbox"],
    applicableRoles: ["buyer", "end-user"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "resale-rental-consignment",
    protocolSection: "§10.7",
    userLabel: "Sell, rent or consign what you already own",
    surfaces: ["opportunity-inbox"],
    applicableRoles: ["end-user", "merchant"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "proactive-economic-opportunities",
    protocolSection: "§10.8",
    userLabel: "See proactive ways to save or earn",
    surfaces: ["opportunity-inbox", "command-center-work-graph"],
    applicableRoles: ["merchant", "buyer", "end-user"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "bounded-multi-hop-trade-cycle",
    protocolSection: "§10.9",
    userLabel: "Multi-person swaps with safety limits",
    surfaces: ["opportunity-inbox", "buyer-intent-canvas"],
    applicableRoles: ["end-user", "buyer"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "merchant-commerce-lifecycle",
    protocolSection: "§10.10",
    userLabel: "Create, list, sell, fulfil, return",
    surfaces: ["operate-catalog", "operate-inventory", "operate-orders", "storefront-studio", "operate-marketing-analytics"],
    applicableRoles: ["merchant", "ops", "finance"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "supplier-procurement-receiving",
    protocolSection: "§10.11",
    userLabel: "Find suppliers, get quotes, receive orders",
    surfaces: ["operate-inventory", "operate-orders", "connector-studio"],
    applicableRoles: ["procurement", "ops", "finance"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "b2b-multi-location-supplier-coordination",
    protocolSection: "§10.12",
    userLabel: "Sell business-to-business across locations",
    surfaces: ["operate-inventory", "operate-orders", "operate-customers"],
    applicableRoles: ["merchant", "ops", "procurement"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "autonomous-store-policy",
    protocolSection: "§10.13",
    userLabel: "Let UNiCOM run your store within limits you set",
    surfaces: ["autonomous-store-config", "command-center-work-graph"],
    applicableRoles: ["merchant", "executive", "auditor"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "commerce-twin-what-if",
    protocolSection: "§10.14",
    userLabel: "Test ideas on a safe copy of your business",
    surfaces: ["commerce-twin-sandbox", "command-center-work-graph", "lab-surface"],
    applicableRoles: ["merchant", "executive", "ops"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "connected-commerce-channels-and-live-commerce",
    protocolSection: "§10.15",
    userLabel: "Connect channels and run live commerce",
    surfaces: ["connector-studio", "live-commerce-discovery", "app-extensions"],
    applicableRoles: ["merchant", "ops", "it"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "physical-no-rfid-supermarket",
    protocolSection: "§10.16",
    userLabel: "Run a supermarket without RFID",
    surfaces: ["physical-capture", "operate-inventory", "local-edge-setup", "physical-commerce-tools", "operate-pos"],
    applicableRoles: ["ops", "merchant", "procurement"],
    noRfidPath: true,
    connectorDependent: true,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "trust-security-fraud-and-recourse",
    protocolSection: "§10.17",
    userLabel: "Trust, security, fraud and recourse",
    surfaces: ["trust-security-center", "operate-orders"],
    applicableRoles: ["auditor", "merchant", "buyer", "end-user"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: true,
  },
  {
    journeyFamilyId: "failure-unknown-idempotency-recovery",
    protocolSection: "§10.18",
    userLabel: "Recover from failure, stale data and UNKNOWN state",
    surfaces: ["connector-studio", "operate-inventory", "trust-security-center", "operator-console"],
    applicableRoles: ["ops", "it", "auditor", "finance"],
    noRfidPath: false,
    connectorDependent: true,
    approvalRequired: false,
  },
  {
    journeyFamilyId: "gui-feature-discoverability",
    protocolSection: "§10.19",
    userLabel: "Discover a feature from the homepage",
    surfaces: ["command-center-work-graph", "explore-capabilities"],
    applicableRoles: ["buyer", "merchant", "ops", "procurement", "auditor", "end-user", "executive", "it"],
    noRfidPath: false,
    connectorDependent: false,
    approvalRequired: false,
  },
];

/** Look up a registry entry by id. */
export function journeyFamilyEntry(id: JourneyFamilyId): JourneyFamilyRegistryEntry {
  const entry = JOURNEY_FAMILY_REGISTRY.find((entry) => entry.journeyFamilyId === id);
  if (entry === undefined) {
    throw new Error(`unknown journey family id: ${id}`);
  }
  return entry;
}

/** The set of journey families applicable to a given role (for sampling). */
export function journeyFamiliesForRole(role: string): readonly JourneyFamilyId[] {
  return JOURNEY_FAMILY_REGISTRY.filter((entry) => entry.applicableRoles.includes(role)).map(
    (entry) => entry.journeyFamilyId,
  );
}

/** The set of journey families applicable to a given surface id. */
export function journeyFamiliesForSurface(surfaceId: string): readonly JourneyFamilyId[] {
  return JOURNEY_FAMILY_REGISTRY.filter((entry) => entry.surfaces.includes(surfaceId)).map(
    (entry) => entry.journeyFamilyId,
  );
}

/** The no-RFID supermarket journey families. */
export function noRfidJourneyFamilies(): readonly JourneyFamilyId[] {
  return JOURNEY_FAMILY_REGISTRY.filter((entry) => entry.noRfidPath).map(
    (entry) => entry.journeyFamilyId,
  );
}
