/**
 * trust-recourse deterministic DEMO fixtures (J17).
 *
 * Committed, synthetic, single-currency (USD). The three seeded orders and
 * their captured payments, the two disputes, the provider chargeback, the
 * authorized wrong-item return and the settlement-UNKNOWN observation are
 * all driven through the REAL kernel by the component's seed script. The
 * threat-signal queue below is committed evidence FIXTURES (no kernel fraud
 * aggregate exists yet) — every row is DEMO-labelled on the surface.
 */

import { makeId } from "@unicom/commerce";
import type { PaymentMethodRef } from "@unicom/commerce";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const TRUST_FIXTURES_ID = "w3-015-trust-fixtures@1";

/** The demo back-office location. */
export const TRUST_LOCATION = makeId<"LocationId">("loc-demo-harbor-lane");

/** Demo payment methods (deterministic demo rail tokens). */
export const TRUST_CARD: PaymentMethodRef = { methodKind: "CARD", tokenRef: "tok-demo-card-1" };

/** The three seeded SKUs. */
export const TRUST_SKUS = [
  { skuId: "sku-trust-pins", title: "Enamel pin set", priceMinor: "2400", openingUnits: 10 },
  { skuId: "sku-trust-pendant", title: "Sterling silver pendant", priceMinor: "9900", openingUnits: 6 },
  { skuId: "sku-trust-mug", title: "Ceramic pour-over mug", priceMinor: "1600", openingUnits: 12 },
] as const;

/** Dispute reason strings (the seed and the surface share them). */
export const DISPUTE_WRONG_ITEM_REASON = "WRONG_ITEM";
export const DISPUTE_COUNTERFEIT_REASON = "COUNTERFEIT_CLAIM";
export const PROVIDER_DISPUTE_OPEN = "PROVIDER_DISPUTE_OPEN";
export const PROVIDER_DISPUTE_UNDER_REVIEW = "PROVIDER_DISPUTE_UNDER_REVIEW";

/** The evidence the merchant submits on the wrong-item dispute (DEMO text). */
export const WRONG_ITEM_EVIDENCE = {
  summary:
    "Packing-list + carrier weight check: the box weighed 48g against 96g expected for two pin sets; buyer photos show candle wicks in one slot. One unit wrong, one correct.",
} as const;

/** Fixed command identity for the duplicate-submission case (J18). */
export const EVIDENCE_COMMAND_ID = "cmd-evidence-wrongitem";
export const EVIDENCE_IDEMPOTENCY_KEY = "idem-evidence-wrongitem";

/** Policy reasons shown with each journaled decision (DEMO text). */
export const POLICY_REASONS = {
  acceptWrongItem:
    "Wrong item corroborated by weight + photo evidence → claim upheld; the refund executes separately and only within captured funds.",
  rejectCounterfeit:
    "Authentication evidence is single-source and does not meet the corroboration bar → claim rejected; the buyer may appeal to their payment provider, and a provider chargeback would land in the chargeback panel below.",
  appealChargeback:
    "Provider arbitration upheld the buyer on appeal: the provider forces a chargeback. The forced amount is capped at the un-refunded captured remainder — money never refunds twice.",
} as const;

/** One threat signal (committed DEMO evidence fixture — not kernel state). */
export interface ThreatSignal {
  readonly signalId: string;
  readonly category: "WRONG_ITEM" | "COUNTERFEIT" | "REVIEW_MANIPULATION" | "RETURN_ABUSE";
  readonly subject: string;
  readonly evidence: string;
  readonly proofLevel: "CORROBORATED" | "SINGLE_SOURCE" | "UNVERIFIABLE";
  readonly disposition: string;
}

/**
 * The threat-signal queue opening the surface. Proof levels are honest:
 * CORROBORATED means two independent evidence sources; SINGLE_SOURCE means
 * one; UNVERIFIABLE means the claim cannot be checked from here.
 */
export const THREAT_SIGNALS: readonly ThreatSignal[] = [
  {
    signalId: "signal-wrongitem-31",
    category: "WRONG_ITEM",
    subject: "order with two enamel pin sets",
    evidence:
      "Buyer photos show candle wicks in one pin slot; the carrier weight record (48g vs 96g expected) independently corroborates. One unit wrong, one correct.",
    proofLevel: "CORROBORATED",
    disposition: "Dispute opened — work the case below.",
  },
  {
    signalId: "signal-counterfeit-07",
    category: "COUNTERFEIT",
    subject: "sterling silver pendant listing",
    evidence:
      "Hallmark close-up does not match the maker's registered punch; two other marketplace listings reuse the same photos. One source only — hallmark registry pending.",
    proofLevel: "SINGLE_SOURCE",
    disposition: "Dispute opened — the corroboration bar decides the outcome.",
  },
  {
    signalId: "signal-reviews-88",
    category: "REVIEW_MANIPULATION",
    subject: "pour-over mug listing reviews",
    evidence:
      "17 five-star reviews within 40 minutes from accounts created the same day; 14 share a device fingerprint. No verified purchases among them.",
    proofLevel: "CORROBORATED",
    disposition: "Listing under review — reviews withheld from the storefront average.",
  },
  {
    signalId: "signal-returns-114",
    category: "RETURN_ABUSE",
    subject: "customer 114 return history",
    evidence:
      "9 returns in 30 days (account rate 61% against a 10% baseline); 3 returned boxes arrived empty. Single-source report from the returns dock.",
    proofLevel: "SINGLE_SOURCE",
    disposition: "Watch-listed — future returns require inspection before refund.",
  },
];
