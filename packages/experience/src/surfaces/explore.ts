/**
 * Explore / Capabilities surface
 * (docs/UX-DEPLOYMENT.md "Explore / Capabilities", W3-001 §3).
 *
 * Explore is a first-class product surface, not a help page. It shows the
 * complete set of things UNiCOM can do, grouped by Buy / Sell / Operate /
 * Discover / Automate / Connect / Protect. Capability cards are DERIVED from
 * the encoded feature matrix — the single source of feature truth — so a
 * hidden feature is structurally impossible: the contract test suite fails
 * if any matrix row lacks a discovery path.
 */

import type { ExploreGroupId, FeatureRow } from "../navigation/feature-matrix";
import type { DiscoveryPath } from "../navigation/discoverability";

/** Availability of a capability card. */
export type ExploreAvailabilityStatus =
  | "available"
  | "requires-connection"
  | "requires-approval"
  | "coming-soon"
  | "unknown";

/** Availability detail for a card. */
export interface ExploreAvailability {
  readonly status: ExploreAvailabilityStatus;
  readonly blockingNotes: readonly string[];
}

/** One capability card (what it does, when useful, example, Try-it). */
export interface ExploreCapabilityCard {
  readonly featureRowId: string;
  readonly title: string;
  readonly whatItDoes: string;
  readonly whenUseful: string;
  readonly requiredConnections: readonly string[];
  readonly exampleRequest: string;
  readonly availability: ExploreAvailability;
  readonly tryItPath: DiscoveryPath;
}

/** One Explore group (Buy/Sell/Operate/Discover/Automate/Connect/Protect). */
export interface ExploreGroup {
  readonly groupId: ExploreGroupId;
  readonly title: string;
  readonly description: string;
}

/** The seven canonical Explore groups. */
export const EXPLORE_GROUPS: readonly ExploreGroup[] = [
  { groupId: "buy", title: "Buy", description: "Get what you need, on your terms" },
  { groupId: "sell", title: "Sell", description: "Run a store, online or in person" },
  { groupId: "operate", title: "Operate", description: "Run the day-to-day with less work" },
  { groupId: "discover", title: "Discover", description: "Find deals and opportunities" },
  { groupId: "automate", title: "Automate", description: "Let UNiCOM work within limits you set" },
  { groupId: "connect", title: "Connect", description: "Link channels, devices and data" },
  { groupId: "protect", title: "Protect", description: "Stay safe and prove what happened" },
];

/**
 * The Explore view. `cards` must be derived from the COMPLETE feature matrix
 * (every `FeatureRow` becomes a card in its `exploreGroup`); the contract
 * tests enforce that no row is dropped.
 */
export interface ExploreView {
  readonly groups: readonly ExploreGroup[];
  readonly cards: readonly ExploreCapabilityCard[];
}

/** Feature rows grouped for Explore rendering (derivation source). */
export type ExploreGroupedFeatures = readonly {
  readonly group: ExploreGroupId;
  readonly features: readonly FeatureRow[];
}[];
