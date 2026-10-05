/**
 * Canonical inventory truth.
 *
 * Three-state law: `CanonicalInventoryLevel` is AUTHORITATIVE operational
 * state. Observed counts live in observation.ts/reconciliation.ts and are
 * NEVER assigned here directly — only deterministic reconciliation promotes
 * them (INVARIANT 29, 47). Predictive stock is an estimate, also never
 * canonical. Levels are immutable values: operations return new levels.
 */
import type { LocationId, ReservationId, SkuId } from "./ids.js";
import { nextRevision, type AnyCommerceEvent, type CommerceEvent, type CommerceProjection, type CommerceSubjectRef } from "./events.js";
import { err, ok, type Result } from "./result.js";

export type LocationKind = "STORE" | "WAREHOUSE" | "SUPPLIER" | "VIRTUAL";

export interface Location {
  readonly locationId: LocationId;
  readonly kind: LocationKind;
  readonly displayName: string;
}

export type InventoryErrorCode =
  | "NEGATIVE_UNITS"
  | "INSUFFICIENT_AVAILABLE"
  | "NEGATIVE_ON_HAND"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_NOT_OPEN";

export type InventoryError = { code: InventoryErrorCode; detail: string };

/** AUTHORITATIVE operational inventory state. Immutable value. */
export interface CanonicalInventoryLevel {
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly onHand: number;
  readonly reserved: number;
  readonly revision: number;
  readonly updatedAt: string;
}

/** Derived availability (never stored — always computed). */
export function availableUnits(level: CanonicalInventoryLevel): number {
  return level.onHand - level.reserved;
}

export function inventoryKey(skuId: SkuId, locationId: LocationId): string {
  return `${skuId}|${locationId}`;
}

function requireUnits(units: number): Result<number, InventoryError> {
  if (!Number.isSafeInteger(units) || units < 0) {
    return err({ code: "NEGATIVE_UNITS", detail: `units must be a non-negative safe integer: ${units}` });
  }
  return ok(units);
}

function rebuild(
  level: CanonicalInventoryLevel,
  onHand: number,
  reserved: number,
): Result<CanonicalInventoryLevel, InventoryError> {
  if (onHand < 0 || reserved < 0) {
    return err({
      code: "NEGATIVE_ON_HAND",
      detail: `canonical inventory can never be negative (onHand=${onHand}, reserved=${reserved}); reconcile instead`,
    });
  }
  if (reserved > onHand) {
    return err({
      code: "INSUFFICIENT_AVAILABLE",
      detail: `reserved (${reserved}) cannot exceed onHand (${onHand})`,
    });
  }
  return ok({ ...level, onHand, reserved, revision: nextRevision(level.revision) });
}

export type InventoryAdjustmentReason =
  | "MANUAL"
  | "SHRINKAGE"
  | "DAMAGE"
  | "RECOUNT"
  | "RECEIVING"
  | "POS_SYNC"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "RETURN_TO_STOCK"
  | "RECONCILIATION";

export type ReservationStatus = "OPEN" | "COMMITTED" | "RELEASED" | "EXPIRED";

export interface InventoryReservation {
  readonly reservationId: ReservationId;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly units: number;
  readonly status: ReservationStatus;
  readonly revision: number;
}

/** Open a reservation against availability; returns the new level + reservation. */
export function reserveUnits(
  level: CanonicalInventoryLevel,
  units: number,
  reservationId: ReservationId,
): Result<{ level: CanonicalInventoryLevel; reservation: InventoryReservation }, InventoryError> {
  const check = requireUnits(units);
  if (!check.ok) return check;
  if (units > availableUnits(level)) {
    return err({
      code: "INSUFFICIENT_AVAILABLE",
      detail: `requested ${units}, available ${availableUnits(level)} for ${inventoryKey(level.skuId, level.locationId)}`,
    });
  }
  const next = rebuild(level, level.onHand, level.reserved + units);
  if (!next.ok) return next;
  return ok({
    level: next.value,
    reservation: {
      reservationId,
      skuId: level.skuId,
      locationId: level.locationId,
      units,
      status: "OPEN",
      revision: 1,
    },
  });
}

/** Commit a reservation: stock physically leaves (onHand and reserved both drop). */
export function commitReservation(
  level: CanonicalInventoryLevel,
  reservation: InventoryReservation,
): Result<{ level: CanonicalInventoryLevel; reservation: InventoryReservation }, InventoryError> {
  if (reservation.skuId !== level.skuId || reservation.locationId !== level.locationId) {
    return err({ code: "RESERVATION_NOT_FOUND", detail: "reservation does not belong to this level" });
  }
  if (reservation.status !== "OPEN") {
    return err({ code: "RESERVATION_NOT_OPEN", detail: `reservation status ${reservation.status}` });
  }
  const next = rebuild(level, level.onHand - reservation.units, level.reserved - reservation.units);
  if (!next.ok) return next;
  return ok({
    level: next.value,
    reservation: { ...reservation, status: "COMMITTED", revision: nextRevision(reservation.revision) },
  });
}

/** Release a reservation: availability returns without touching onHand. */
export function releaseReservation(
  level: CanonicalInventoryLevel,
  reservation: InventoryReservation,
): Result<{ level: CanonicalInventoryLevel; reservation: InventoryReservation }, InventoryError> {
  if (reservation.skuId !== level.skuId || reservation.locationId !== level.locationId) {
    return err({ code: "RESERVATION_NOT_FOUND", detail: "reservation does not belong to this level" });
  }
  if (reservation.status !== "OPEN") {
    return err({ code: "RESERVATION_NOT_OPEN", detail: `reservation status ${reservation.status}` });
  }
  const next = rebuild(level, level.onHand, level.reserved - reservation.units);
  if (!next.ok) return next;
  return ok({
    level: next.value,
    reservation: { ...reservation, status: "RELEASED", revision: nextRevision(reservation.revision) },
  });
}

/** Deterministic adjustment (receiving, shrinkage, transfer, manual). */
export function adjustOnHand(
  level: CanonicalInventoryLevel,
  deltaUnits: number,
  reason: InventoryAdjustmentReason,
): Result<CanonicalInventoryLevel, InventoryError> {
  if (!Number.isSafeInteger(deltaUnits)) {
    return err({ code: "NEGATIVE_UNITS", detail: `delta must be a safe integer: ${deltaUnits}` });
  }
  const next = rebuild(level, level.onHand + deltaUnits, level.reserved);
  if (!next.ok) {
    return err({ code: next.error.code, detail: `${next.error.detail} (reason=${reason})` });
  }
  return ok(next.value);
}

// --- Inventory events (immutable facts; payload carries the resulting level) ---

export interface InventoryEventPayloadBase {
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly units: number;
  readonly reason?: InventoryAdjustmentReason;
  readonly resultingLevel: CanonicalInventoryLevel;
}

export type InventoryEventPayload =
  | (InventoryEventPayloadBase & { readonly kind: "INVENTORY_RECEIVED" })
  | (InventoryEventPayloadBase & { readonly kind: "INVENTORY_RESERVED"; readonly reservationId: ReservationId })
  | (InventoryEventPayloadBase & {
      readonly kind: "INVENTORY_RESERVATION_COMMITTED";
      readonly reservationId: ReservationId;
    })
  | (InventoryEventPayloadBase & {
      readonly kind: "INVENTORY_RESERVATION_RELEASED";
      readonly reservationId: ReservationId;
    })
  | (InventoryEventPayloadBase & { readonly kind: "INVENTORY_ADJUSTED"; readonly reason: InventoryAdjustmentReason })
  | (InventoryEventPayloadBase & { readonly kind: "INVENTORY_RECONCILED"; readonly varianceUnits: number });

export type InventoryDomainEvent = CommerceEvent<InventoryEventPayload["kind"], InventoryEventPayload>;

export function inventorySubject(level: { skuId: SkuId; locationId: LocationId }): CommerceSubjectRef {
  return { subjectType: "INVENTORY_LEVEL", subjectId: inventoryKey(level.skuId, level.locationId) };
}

export interface InventoryProjectionState {
  readonly levels: ReadonlyMap<string, CanonicalInventoryLevel>;
}

/**
 * Reference fold: journal of inventory events → canonical levels.
 * Deterministic, pure, allocation-per-event (no input mutation).
 */
export const inventoryProjection = {
  projectionId: "inventory-levels/v1",
  initialState: (): InventoryProjectionState => ({ levels: new Map<string, CanonicalInventoryLevel>() }),
  apply(state: InventoryProjectionState, event: AnyCommerceEvent): InventoryProjectionState {
    if (!isInventoryEvent(event)) return state;
    const levels = new Map(state.levels);
    levels.set(inventoryKey(event.payload.skuId, event.payload.locationId), event.payload.resultingLevel);
    return { levels };
  },
} as const satisfies CommerceProjection<InventoryProjectionState>;

function isInventoryEvent(event: AnyCommerceEvent): event is InventoryDomainEvent {
  return typeof (event.payload as InventoryEventPayload | null)?.kind === "string" &&
    (event.payload as InventoryEventPayload).kind.startsWith("INVENTORY_");
}
