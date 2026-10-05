/**
 * Value-level boundary types shared across the experience plane.
 *
 * These types exist so that lane laws are enforced at the type level:
 * - money is NEVER a floating-point number (INVARIANT 14);
 * - consequential requests are idempotent (W1/W3 contract laws);
 * - timestamps are explicit UTC instants.
 */

/**
 * Money as an exact decimal string (e.g. "1234.50"), never a float.
 * Canonical money arithmetic belongs to the Commerce Kernel (Worker 1);
 * the experience plane only renders and transports money representations.
 */
declare const moneyStringBrand: unique symbol;
export type MoneyString = string & {
  readonly [moneyStringBrand]: "exact-decimal-money-string-never-float";
};

/**
 * Client-generated deterministic key that makes a consequential request
 * idempotent. Required on connector commands, commerce command envelopes,
 * offline observation queue entries and reconciliation hand-offs.
 */
declare const idempotencyKeyBrand: unique symbol;
export type IdempotencyKey = string & {
  readonly [idempotencyKeyBrand]: "client-generated-deterministic-idempotency-key";
};

/** UTC instant in ISO 8601 extended format (e.g. "2026-10-05T02:34:37Z"). */
declare const utcTimestampBrand: unique symbol;
export type UtcIso8601String = string & {
  readonly [utcTimestampBrand]: "utc-iso-8601-instant";
};

/** Opaque reference to a stored media/file/evidence artifact. */
declare const storedArtifactRefBrand: unique symbol;
export type StoredArtifactRef = string & {
  readonly [storedArtifactRefBrand]: "opaque-reference-to-stored-artifact";
};
