/**
 * W3-012 — W2→W1 journey vocabulary mapping (the third-seam repair).
 *
 * The W2 persona artifact's `applicableJourneys` (from
 * packages/agent/src/persona-journeys.ts — READ-ONLY, frozen) uses the W2
 * working vocabulary ("compare-sellers", "buy-vs-wait-negotiate", ...).
 * The W1 authoritative journey families (docs/simulations/scenarios/
 * journey-families.json) use the campaign vocabulary
 * ("offer-sourcing-comparison", "buy-now-vs-wait-price-timing", ...).
 * The two were never reconciled — the third vocabulary seam of the class
 * the W3-010/W3-011 registers documented.
 *
 * This module maps ON TOP of the frozen W2 artifact (zero edits to
 * packages/agent): every W2 id maps to ≥1 W1 family; the mapping is
 * total (test-pinned) and deterministic.
 *
 * Source: docs/work-orders/W3-012.md §1.
 */

import type { JourneyFamilyId } from "./journey-evidence";

/** The W2 persona-journey working vocabulary id. */
export type W2JourneyId = string;

/**
 * The total W2→W1 mapping. Semantics:
 * - "feature-discovery" → the GUI discoverability family.
 * - "buy-vs-wait-negotiate" spans TWO W1 families (price timing +
 *   negotiation/substitution) — the W2 id conflated them.
 * - "b2b-multi-location" has no dedicated W1 family (W1 models B2B
 *   coordination inside the merchant lifecycle); it maps to the nearest
 *   W1 family and the conflation is recorded here — not silently dropped.
 */
export const W2_TO_W1_JOURNEY_MAP: ReadonlyMap<W2JourneyId, readonly JourneyFamilyId[]> =
  new Map([
    ["feature-discovery", ["gui-feature-discoverability"]],
    ["buyer-intent-canvas", ["buyer-intent-constraints"]],
    ["compare-sellers", ["offer-sourcing-comparison"]],
    ["buy-vs-wait-negotiate", ["buy-now-vs-wait-price-timing", "negotiation-substitution"]],
    ["failure-recovery", ["failure-unknown-idempotency-recovery"]],
    ["merchant-lifecycle", ["merchant-commerce-lifecycle"]],
    // Conflation recorded: the W2 id covers merchant B2B multi-location
    // selling, which W1 models within the merchant commerce lifecycle.
    ["b2b-multi-location", ["merchant-commerce-lifecycle"]],
    ["existing-groupbuy-discovery", ["existing-group-buy"]],
    ["latent-demand-groupbuy", ["latent-demand-merchant-group-buy-proposal"]],
    ["supplier-procurement-lifecycle", ["supplier-procurement-receiving"]],
    ["rent-borrow-vs-buy", ["rent-borrow-vs-buy"]],
    ["resale-rental-consignment", ["resale-rental-consignment"]],
    ["proactive-opportunities", ["proactive-economic-opportunities"]],
    ["multi-hop-tradecycle", ["bounded-multi-hop-trade-cycle"]],
    ["commerce-trust-security", ["trust-security-fraud-and-recourse"]],
    ["commerce-twin-whatif", ["commerce-twin-what-if"]],
    ["connector-discovery-execution", ["connected-commerce-channels-and-live-commerce"]],
    ["autonomous-store-runtime", ["autonomous-store-policy"]],
    ["no-rfid-physical-retail", ["physical-no-rfid-supermarket"]],
  ]);

/**
 * The complete W2 working vocabulary (the ids
 * applicableJourneysFor can emit). Test-pinned against the mapping: every
 * id here must map; every mapping key must be here.
 */
export const W2_JOURNEY_VOCABULARY: readonly W2JourneyId[] = [
  "feature-discovery",
  "buyer-intent-canvas",
  "compare-sellers",
  "buy-vs-wait-negotiate",
  "failure-recovery",
  "merchant-lifecycle",
  "b2b-multi-location",
  "existing-groupbuy-discovery",
  "latent-demand-groupbuy",
  "supplier-procurement-lifecycle",
  "rent-borrow-vs-buy",
  "resale-rental-consignment",
  "proactive-opportunities",
  "multi-hop-tradecycle",
  "commerce-trust-security",
  "commerce-twin-whatif",
  "connector-discovery-execution",
  "autonomous-store-runtime",
  "no-rfid-physical-retail",
];

/** Map one W2 id to its W1 families; throws on an unmapped id (totality law). */
export function w2JourneysToW1(w2Id: W2JourneyId): readonly JourneyFamilyId[] {
  const mapped = W2_TO_W1_JOURNEY_MAP.get(w2Id);
  if (mapped === undefined) {
    throw new Error(
      `W3-012 vocabulary map: unmapped W2 journey id "${w2Id}" — the mapping must be total (record the id + reason instead of silently dropping)`,
    );
  }
  return mapped;
}

/** Map a persona's applicableJourneys (W2 ids) to the W1 family set (deduped, sorted). */
export function w2JourneySetToW1(w2Ids: readonly string[]): readonly JourneyFamilyId[] {
  const out = new Set<JourneyFamilyId>();
  for (const id of w2Ids) {
    for (const family of w2JourneysToW1(id)) {
      out.add(family);
    }
  }
  return [...out].sort();
}
