/**
 * Twin-verification harness: PROVES twin ≡ kernel after arbitrary command
 * sequences (W1-003 acceptance scenario 1).
 *
 * Truth law: the twin is derived state; divergence between the twin and the
 * kernel's authoritative snapshot is a BUG, and this module exists to detect
 * it with precise, actionable evidence — collection, index and path of the
 * first divergence in every mismatching collection, plus canonical-JSON
 * agreement as the byte-level proof.
 *
 * The comparison is STRUCTURAL: `TwinStateSnapshot` is field-compatible with
 * the kernel's `KernelStateSnapshot` by design, so callers pass the kernel's
 * snapshot directly — the harness itself never imports the kernel (the twin
 * side stays provably kernel-free; the layer order forbids it).
 */
import type { TwinStateSnapshot } from "./twin-snapshot.js";
import { canonicalJson } from "./serialize.js";

/** One detected divergence between the twin and the authoritative snapshot. */
export interface TwinDivergence {
  readonly collection: string;
  readonly detail: string;
}

/** Snapshot-source contract: satisfied by the kernel snapshot (structural). */
export type AuthoritativeSnapshotSource = TwinStateSnapshot;

const COLLECTIONS: readonly (keyof TwinStateSnapshot)[] = [
  "levels",
  "reservations",
  "carts",
  "checkoutSessions",
  "orders",
  "payments",
  "transfers",
  "purchaseOrders",
  "fulfillments",
  "shipments",
  "returns",
  "refunds",
  "subscriptions",
  "listings",
  "rentals",
  "consignments",
  "policies",
  "reconciliationRecords",
  // --- W1-004 (additive): recourse + autonomous-store collections ---
  "captures",
  "settlements",
  "disputes",
  "chargebacks",
  "storeSessions",
  "cashVariances",
];

/**
 * Compare a twin snapshot against the authoritative snapshot, collection by
 * collection. Returns the divergence list — EMPTY means twin ≡ kernel.
 * Deep comparison via canonical JSON per collection: value equality AND
 * ordering equality (fold discipline), with byte-stable evidence strings.
 */
export function compareTwinToAuthoritative(
  twinSnapshot: TwinStateSnapshot,
  authoritativeSnapshot: AuthoritativeSnapshotSource,
): TwinDivergence[] {
  const divergences: TwinDivergence[] = [];
  for (const collection of COLLECTIONS) {
    const twinSide = twinSnapshot[collection];
    const kernelSide = authoritativeSnapshot[collection];
    const twinJson = canonicalJson(twinSide);
    const kernelJson = canonicalJson(kernelSide);
    if (twinJson === kernelJson) continue;
    divergences.push({
      collection,
      detail: describeDivergence(collection, twinSide, kernelSide, twinJson, kernelJson),
    });
  }
  return divergences;
}

function describeDivergence(
  collection: string,
  twinSide: readonly unknown[],
  kernelSide: readonly unknown[],
  twinJson: string,
  kernelJson: string,
): string {
  if (twinSide.length !== kernelSide.length) {
    return `${collection}: length ${twinSide.length} != ${kernelSide.length}; twin=${clip(twinJson)} kernel=${clip(kernelJson)}`;
  }
  for (let index = 0; index < twinSide.length; index += 1) {
    const twinItem = canonicalJson(twinSide[index]);
    const kernelItem = canonicalJson(kernelSide[index]);
    if (twinItem !== kernelItem) {
      const keyDiff = firstDifferingKey(twinSide[index], kernelSide[index]);
      return `${collection}[${index}]${keyDiff ? `.${keyDiff}` : ""}: twin=${clip(twinItem)} kernel=${clip(kernelItem)}`;
    }
  }
  return `${collection}: byte-level divergence; twin=${clip(twinJson)} kernel=${clip(kernelJson)}`;
}

function firstDifferingKey(a: unknown, b: unknown): string | undefined {
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return undefined;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    // Undefined-valued keys serialize as absent (writeCanonical law): both
    // absent is equal; absent on exactly one side IS the divergence.
    if (left[key] === undefined && right[key] === undefined) continue;
    if (left[key] === undefined || right[key] === undefined) return key;
    if (canonicalJson(left[key]) !== canonicalJson(right[key])) return key;
  }
  return undefined;
}

function clip(text: string): string {
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/**
 * Assertion form used by the verification battery: throws a TypeError with
 * every divergence spelled out when the twin does not match the kernel.
 * Returns the (proven-equal) twin snapshot for chaining.
 */
export function assertTwinMatchesAuthoritative(
  twinSnapshot: TwinStateSnapshot,
  authoritativeSnapshot: AuthoritativeSnapshotSource,
): TwinStateSnapshot {
  const divergences = compareTwinToAuthoritative(twinSnapshot, authoritativeSnapshot);
  if (divergences.length > 0) {
    const evidence = divergences.map((item) => `  - ${item.collection}: ${item.detail}`).join("\n");
    throw new TypeError(
      `COMMERCE TWIN DIVERGENCE (twin != kernel — this is a bug the harness must catch):\n${evidence}`,
    );
  }
  return twinSnapshot;
}

/**
 * Byte-level equivalence proof: canonical JSON of both snapshots must be
 * IDENTICAL (stronger than per-collection equality — total fold discipline).
 */
export function assertCanonicalEquivalence(
  twinSnapshot: TwinStateSnapshot,
  authoritativeSnapshot: AuthoritativeSnapshotSource,
): string {
  const twinJson = canonicalJson(twinSnapshot);
  const kernelJson = canonicalJson(authoritativeSnapshot);
  if (twinJson !== kernelJson) {
    const firstDifference = firstCharDifference(twinJson, kernelJson);
    throw new TypeError(
      `COMMERCE TWIN CANONICAL DIVERGENCE at byte ${firstDifference.index}:\n  twin:   ${clip(firstDifference.left)}\n  kernel: ${clip(firstDifference.right)}`,
    );
  }
  return twinJson;
}

function firstCharDifference(left: string, right: string): { index: number; left: string; right: string } {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      return { index, left: left.slice(Math.max(0, index - 60), index + 120), right: right.slice(Math.max(0, index - 60), index + 120) };
    }
  }
  return {
    index: limit,
    left: left.slice(Math.max(0, limit - 60)),
    right: right.slice(Math.max(0, limit - 60)),
  };
}
