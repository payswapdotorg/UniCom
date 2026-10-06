/**
 * Shared vocabulary primitives for the @unicom/agent contract surface.
 *
 * Stage-0 laws expressed here:
 * - Money is integer minor units only — never floating point (invariant 14).
 * - Timestamps are ISO-8601 UTC strings (deterministic, serializable).
 * - Evidence references are typed, opaque handles.
 * - Principals are referenced opaquely; identity is owned elsewhere.
 */

/** Nominal brand for opaque reference types. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Construct a branded opaque reference. Empty values are rejected. */
export function brandRef<B extends string>(value: string, brand: B): Brand<string, B> {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid ${brand}: must be a non-empty string`);
  }
  return value as Brand<string, B>;
}

/** Integer-minor-unit money. `minorUnits` is a base-10 integer string. */
export interface Money {
  readonly currency: string;
  readonly minorUnits: string;
}

const ISO_4217 = /^[A-Z]{3}$/;
const MINOR_UNITS = /^-?\d+$/;

/** Construct Money from an ISO-4217 currency and integer minor units. */
export function money(currency: string, minorUnits: string): Money {
  if (!ISO_4217.test(currency)) {
    throw new Error(`invalid currency: ${currency}`);
  }
  if (!MINOR_UNITS.test(minorUnits)) {
    throw new Error(
      `invalid minorUnits: ${minorUnits} (integer string required — no floating point money)`,
    );
  }
  return { currency, minorUnits };
}

export function isMoney(value: unknown): value is Money {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { currency?: unknown; minorUnits?: unknown };
  return (
    typeof candidate.currency === "string" &&
    ISO_4217.test(candidate.currency) &&
    typeof candidate.minorUnits === "string" &&
    MINOR_UNITS.test(candidate.minorUnits)
  );
}

/** Compare two same-currency amounts: -1 | 0 | 1. Currency mismatch throws. */
export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  const left = BigInt(a.minorUnits);
  const right = BigInt(b.minorUnits);
  return left < right ? -1 : left > right ? 1 : 0;
}

const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Validate an ISO-8601 UTC timestamp string and return it unchanged. */
export function timestamp(value: string): string {
  if (!ISO_8601_UTC.test(value)) {
    throw new Error(`invalid ISO-8601 UTC timestamp: ${value}`);
  }
  return value;
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_8601_UTC.test(value);
}

/** Kinds of principal that can be referenced by intelligence-plane contracts. */
export type PrincipalKind = "user" | "merchant" | "agent" | "autonomous-store" | "platform";

/** Opaque reference to a principal. Identity/ownership is not modeled here. */
export interface PrincipalRef {
  readonly principalId: string;
  readonly kind: PrincipalKind;
}

/** Impact classification for consequential decisions (used by routing and proof). */
export type DecisionImpact = "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE";

/**
 * Kinds of evidence a proof, decision, trust derivation or immune action may
 * cite. W2-004 additions are ADDITIVE union members (existing consumers only
 * narrow): fraud-archetype evidence flows (buyer claims, carrier
 * observations, merchant attestations, commerce-fact snapshots from the
 * opaque seam) and journaled trust evidence. W2-005 additions (also additive
 * only): Learning-Lab evaluation evidence and routing-lifecycle promotion
 * decisions.
 */
export type EvidenceKind =
  | "observation"
  | "receipt"
  | "provider-signed"
  | "independent-observation"
  | "corroboration"
  | "ledger-finality"
  | "decision-summary"
  | "security-analysis"
  | "claim-statement"
  | "carrier-observation"
  | "merchant-attestation"
  | "commerce-fact"
  | "trust-evidence"
  | "lab-evaluation"
  | "promotion-decision";

/** Typed, opaque reference to stored evidence. */
export interface EvidenceReference {
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
}
