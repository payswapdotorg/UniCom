/**
 * W2-012 buyer/peer shared demo-data vocabulary (module-internal support —
 * deliberately NOT a registered feature module: no module.ts, so the host
 * registry never discovers this directory).
 *
 * Laws (W2-012 work order §interface):
 * - every fixture is deterministic, committed, DEMO-labelled and resettable;
 * - timestamps are FIXED literals compared against a fixed DEMO_NOW "demo
 *   clock" so staleness classifications never drift between renders or test
 *   runs (a wall clock would silently flip verified→stale);
 * - money goes through the @unicom/commerce exact-money primitives (never
 *   floats);
 * - freshness classes are kept visibly distinct: verified / stale / UNKNOWN /
 *   unavailable — UNKNOWN is never rendered as a price.
 */

import { currency, formatMoney, money } from "@unicom/commerce";
import type { CurrencyCode, Money } from "@unicom/commerce";
import type { UtcIso8601String } from "@unicom/experience";

/** Fixture identity (shown on surfaces; namespaced to this lane). */
export const W2_DEMO_FIXTURES_ID = "w2-012-buyer-peer-fixtures@1";

/**
 * Cast a committed literal to the branded UtcIso8601String (fixtures are
 * fixed strings; the brand exists so non-fixture code can't fake instants).
 */
export function utc(value: string): UtcIso8601String {
  return value as UtcIso8601String;
}

/**
 * Cast a committed fixture literal to any branded opaque reference
 * (StrategyRef, OpportunityRef, PrincipalRef, DecisionRef, …). Opaque refs
 * are presentation-only in this lane; the fixtures never claim to resolve.
 */
export function demoRef<T>(value: string): T {
  return value as T;
}

/**
 * The fixed demo clock every freshness classification is computed against.
 * Rendered on the surfaces so the numbers are explainable, never mysterious.
 */
export const DEMO_NOW: UtcIso8601String = utc("2026-10-12T09:00:00Z");

/** The visible offer-freshness vocabulary (J2/J18 law: UNKNOWN ≠ FAILED). */
export type OfferFreshness = "verified" | "stale" | "unknown" | "unavailable";

/** Freshness classification metadata (label + visual class + honest note). */
export const FRESHNESS_META: Readonly<
  Record<OfferFreshness, { readonly label: string; readonly chip: string; readonly note: string }>
> = {
  verified: {
    label: "verified",
    chip: "cm-chip cm-chip-ok",
    note: "Confirmed by the seller's feed recently (demo clock).",
  },
  stale: {
    label: "stale",
    chip: "cm-chip cm-chip-warn",
    note: "Confirmed once, but a while ago — treat as a guide, not a promise.",
  },
  unknown: {
    label: "UNKNOWN",
    chip: "cm-chip cm-chip-unknown",
    note: "Freshness could not be confirmed. UNKNOWN is never shown as a price.",
  },
  unavailable: {
    label: "unavailable",
    chip: "cm-chip cm-chip-err",
    note: "The seller or feed reports this offer is not currently available.",
  },
};

/** Classify a source timestamp against the fixed demo clock. */
export function classifyFreshness(
  checkedAt: UtcIso8601String,
  verifiedWithinMinutes: number,
): "verified" | "stale" {
  const checked = Date.parse(checkedAt);
  const now = Date.parse(DEMO_NOW);
  if (Number.isNaN(checked) || Number.isNaN(now)) return "stale";
  return now - checked <= verifiedWithinMinutes * 60_000 ? "verified" : "stale";
}

/** Deterministic minutes-ago label against the demo clock (e.g. "8 min ago"). */
export function minutesAgoLabel(checkedAt: UtcIso8601String): string {
  const deltaMs = Date.parse(DEMO_NOW) - Date.parse(checkedAt);
  if (Number.isNaN(deltaMs) || deltaMs < 0) return "at an unknown time";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const USD: CurrencyCode = currency("USD");

/** Exact USD money from MINOR units (e.g. usdMinor("48000") = 480.00 USD). */
export function usdMinor(minor: string): Money {
  return money(minor, USD);
}

/** Render exact money deterministically via the commerce primitive. */
export function moneyText(amount: Money): string {
  return formatMoney(amount);
}

/** Fixed synthetic buyer principal (fixtures name participants honestly). */
export const DEMO_BUYER_NAME = "Harbor Lane Print Studio (demo buyer)";
