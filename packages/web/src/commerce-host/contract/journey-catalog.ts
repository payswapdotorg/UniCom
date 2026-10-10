/**
 * The 19-journey catalog — W1-011's frozen mapping of journey id → family,
 * owning lane, Explore taxonomy group and plain-language summary.
 *
 * Sources: docs/simulations/V3-EXPERIMENT-PROTOCOL.md §10 (families),
 * docs/rendered-ui/CONTRACT-MAP.md §4 (journey → contract → runtime → owner),
 * packages/experience/src/navigation/feature-matrix.ts (Explore taxonomy).
 *
 * Laws:
 * - the catalog is the SOURCE OF TRUTH for journey ownership; modules may only
 *   claim journeys owned by their lane (the registry surfaces violations as
 *   honest warnings — CONTRACT-MAP §5 write-surface boundaries);
 * - every journey has a human-visible host entry (home + Explore taxonomy);
 * - featureRowIds/section defaults drive the Explore card availability
 *   derivation (a card is "available" only when its journeys have ready
 *   modules; otherwise "coming-soon" with the pending lane named).
 */

import type { ExploreGroupId, FeatureMatrixSectionId } from "@unicom/experience";
import type { CommerceJourneyId, CommerceModuleOwner } from "./module-contract.js";

/** One journey family in the catalog. */
export interface CommerceJourneyFamily {
  readonly journeyId: CommerceJourneyId;
  /** Family name (protocol §10). */
  readonly familyName: string;
  /** Plain-language summary shown on host surfaces (no internal vocabulary). */
  readonly summary: string;
  /** The lane that owns the rendered module for this journey. */
  readonly owner: CommerceModuleOwner;
  /** Other lanes with a declared side (e.g. J5 buyer + merchant review; J18 both feature lanes). */
  readonly sharedWith?: readonly CommerceModuleOwner[];
  /** Explore taxonomy group (packages/experience/src/surfaces/explore.ts). */
  readonly exploreGroup: ExploreGroupId;
  /** Feature-matrix sections whose rows surface this journey (availability derivation). */
  readonly featureSections: readonly FeatureMatrixSectionId[];
}

/** The frozen 19-journey catalog (J1–J19). */
export const COMMERCE_JOURNEY_CATALOG: readonly CommerceJourneyFamily[] = [
  {
    journeyId: "J1",
    familyName: "Buyer Intent Canvas",
    summary:
      "Describe what you need in your own words, add constraints (deadline, budget, quality, proof, recourse), and compare plans before buying.",
    owner: "W2-012",
    exploreGroup: "buy",
    featureSections: ["buyer-agent"],
  },
  {
    journeyId: "J2",
    familyName: "Offer sourcing and comparison",
    summary:
      "Compare offers across sellers with verified, stale and unknown freshness kept visibly separate — unknown is never shown as a price.",
    owner: "W2-012",
    exploreGroup: "buy",
    featureSections: ["buyer-agent"],
  },
  {
    journeyId: "J3",
    familyName: "Buy now vs wait, negotiation, substitution",
    summary:
      "Weigh buying now against waiting, negotiate with sellers, and allow substitutes when a similar item serves the need.",
    owner: "W2-012",
    exploreGroup: "buy",
    featureSections: ["buyer-agent"],
  },
  {
    journeyId: "J4",
    familyName: "Group buying — discovery, join, leave",
    summary:
      "Team up with other buyers toward a group threshold; interest is never a commitment and joining needs your explicit consent.",
    owner: "W2-012",
    exploreGroup: "discover",
    featureSections: ["coordination-organization", "user-opportunities"],
  },
  {
    journeyId: "J5",
    familyName: "Latent-demand group buys (buyer + merchant sides)",
    summary:
      "Buyers propose group deals to sellers; merchants review, accept, counter or reject — no silent enrollment on either side.",
    owner: "W2-012",
    sharedWith: ["W3-015"],
    exploreGroup: "discover",
    featureSections: ["coordination-organization"],
  },
  {
    journeyId: "J6",
    familyName: "Rent or borrow vs buy",
    summary:
      "Compare renting or borrowing against buying, with duration, availability, deposit, condition, return and damage terms visible.",
    owner: "W2-012",
    exploreGroup: "buy",
    featureSections: ["buyer-agent", "user-opportunities"],
  },
  {
    journeyId: "J7",
    familyName: "Resale, rental and consignment of owned items",
    summary:
      "Sell or rent out what you own, or hand items to a consignment partner — listing always requires your explicit action.",
    owner: "W2-012",
    exploreGroup: "discover",
    featureSections: ["user-opportunities"],
  },
  {
    journeyId: "J8",
    familyName: "Proactive economic opportunities",
    summary:
      "Suggestions beyond the current task — with why-suggested, provenance, expiry and a safe next action for each.",
    owner: "W2-012",
    exploreGroup: "discover",
    featureSections: ["user-opportunities", "coordination-organization"],
  },
  {
    journeyId: "J9",
    familyName: "Bounded multi-hop trades (TradeCycle)",
    summary:
      "Multi-person swap chains where every leg needs individual consent; a refusal re-plans without silent commitments.",
    owner: "W2-012",
    exploreGroup: "discover",
    featureSections: ["buyer-agent", "coordination-organization"],
  },
  {
    journeyId: "J10",
    familyName: "Merchant commerce lifecycle",
    summary:
      "Run a store end to end: catalog, checkout, payments, orders, fulfillment, returns, exchanges, refunds and support.",
    owner: "W3-015",
    exploreGroup: "sell",
    featureSections: ["merchant-parity", "ai-native-merchant-layer"],
  },
  {
    journeyId: "J11",
    familyName: "Supplier procurement and receiving",
    summary:
      "From supplier quotes through approvals and purchase orders to partial receiving, substitution and reconciliation-gated stock updates.",
    owner: "W3-015",
    exploreGroup: "operate",
    featureSections: ["merchant-parity"],
  },
  {
    journeyId: "J12",
    familyName: "B2B and multi-location commerce",
    summary:
      "Coordinate business-to-business selling, negotiated price lists, terms and stock across locations and channels.",
    owner: "W3-015",
    exploreGroup: "operate",
    featureSections: ["merchant-parity"],
  },
  {
    journeyId: "J13",
    familyName: "Autonomous store policies",
    summary:
      "Let UNiCOM run day-to-day selling inside limits you set — margins, spend, refund bands, stop conditions and an audit trail.",
    owner: "W3-015",
    exploreGroup: "automate",
    featureSections: ["merchant-parity", "ai-native-merchant-layer"],
  },
  {
    journeyId: "J14",
    familyName: "Commerce Twin what-if",
    summary:
      "Test decisions on a safe copy of the business — predictions are clearly non-authoritative and never change real records.",
    owner: "W2-012",
    exploreGroup: "automate",
    featureSections: ["ai-native-merchant-layer"],
  },
  {
    journeyId: "J15",
    familyName: "Connected commerce channels and live commerce",
    summary:
      "Connect marketplaces, files, agent protocols and live-selling streams — with connected, demo and unavailable states kept distinct.",
    owner: "W3-015",
    exploreGroup: "connect",
    featureSections: ["commerce-network", "deployment-coverage"],
  },
  {
    journeyId: "J16",
    familyName: "Physical, no-RFID supermarket operations",
    summary:
      "Barcode, camera, QR, weighing and cycle-count capture that works offline and reconciles before touching canonical stock — no RFID required.",
    owner: "W3-015",
    exploreGroup: "operate",
    featureSections: ["physical-commerce"],
  },
  {
    journeyId: "J17",
    familyName: "Trust, security and recourse",
    summary:
      "Separate trust kinds and proof levels, see threats and security evidence, and pursue controlled refunds, returns and disputes.",
    owner: "W3-015",
    exploreGroup: "protect",
    featureSections: ["trust-security"],
  },
  {
    journeyId: "J18",
    familyName: "Failure, unknown and recovery states",
    summary:
      "Preserved non-failure states — pending, attempted, overdue, settlement-unknown, not-promoted-unknown — never collapse into errors.",
    owner: "W1-011",
    sharedWith: ["W2-012", "W3-015"],
    exploreGroup: "protect",
    featureSections: [],
  },
  {
    journeyId: "J19",
    familyName: "Feature discoverability (Explore)",
    summary:
      "Everything UNiCOM commerce can do, grouped by what you want to achieve, each capability with an honest availability state and a Try-it path.",
    owner: "W1-011",
    exploreGroup: "discover",
    featureSections: [],
  },
];

/** Look up one journey family by id. */
export function journeyFamily(journeyId: CommerceJourneyId): CommerceJourneyFamily {
  const family = COMMERCE_JOURNEY_CATALOG.find((entry) => entry.journeyId === journeyId);
  if (!family) throw new Error(`unknown journey id: ${journeyId}`);
  return family;
}

/** Journeys owned by one lane (sharedWith sides included). */
export function journeysOwnedBy(owner: CommerceModuleOwner): readonly CommerceJourneyFamily[] {
  return COMMERCE_JOURNEY_CATALOG.filter(
    (family) => family.owner === owner || family.sharedWith?.includes(owner) === true,
  );
}
