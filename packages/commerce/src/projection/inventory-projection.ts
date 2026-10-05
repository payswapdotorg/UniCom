/**
 * Inventory read model: canonical levels, reservations and the tri-state
 * count-observation fact per stock level (W1-003).
 *
 * Laws:
 * - Levels fold from `resultingLevel` (the authoritative set-latest pattern);
 *   the projection NEVER recomputes inventory math (the kernel owns that
 *   authority — projections are derived state only).
 * - Tri-state preservation (scenario 6): reconciliation records carry the
 *   disposition of the latest count observation for a level. UNKNOWN
 *   observations project to `UNKNOWN` — never promoted to OBSERVED, never
 *   dropped, never collapsed into FAILED (INVARIANT 10). FAILED observation
 *   attempts remain a DISTINCT third state.
 */
import { inventoryKey, type CanonicalInventoryLevel, type InventoryReservation } from "../domain/inventory.js";
import { nextRevision } from "../domain/events.js";
import type { ReconciliationDisposition, ReconciliationRecord } from "../domain/reconciliation.js";
import type { ProjectionDefinition } from "./engine.js";

/** The tri-state fact for the latest count observation of one stock level. */
export type CountObservationState =
  | { readonly resolved: "OBSERVED" }
  | { readonly resolved: "UNKNOWN" }
  | { readonly resolved: "FAILED" };

export interface InventoryReadModelState {
  /** Canonical levels by `skuId|locationId`. */
  readonly levels: ReadonlyMap<string, CanonicalInventoryLevel>;
  /** Reservations by id. */
  readonly reservations: ReadonlyMap<string, InventoryReservation>;
  /** Latest count-observation tri-state per level key (end-to-end preservation). */
  readonly countObservations: ReadonlyMap<string, CountObservationState>;
}

export const INVENTORY_PROJECTION_ID = "inventory/v2";

interface InventoryPayloadShape {
  readonly kind?: unknown;
  readonly skuId?: unknown;
  readonly locationId?: unknown;
  readonly units?: unknown;
  readonly reservationId?: unknown;
  readonly resultingLevel?: CanonicalInventoryLevel | undefined;
}

interface RecordPayloadShape {
  readonly kind?: unknown;
  readonly record?: ReconciliationRecord | undefined;
}

/** Map a reconciliation disposition onto the preserved tri-state fact. */
export function countObservationStateOf(disposition: ReconciliationDisposition): CountObservationState {
  switch (disposition) {
    case "NOT_PROMOTED_UNKNOWN":
      return { resolved: "UNKNOWN" };
    case "NOT_PROMOTED_FAILED":
      return { resolved: "FAILED" };
    default:
      // PROMOTED / CONFIRMED / DISCREPANCY_HOLD / DISCREPANCY_NEGATIVE /
      // NOT_PROMOTED_KIND all started from an OBSERVED value.
      return { resolved: "OBSERVED" };
  }
}

export const inventoryReadModel: ProjectionDefinition<InventoryReadModelState> = {
  projectionId: INVENTORY_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): InventoryReadModelState => ({
    levels: new Map<string, CanonicalInventoryLevel>(),
    reservations: new Map<string, InventoryReservation>(),
    countObservations: new Map<string, CountObservationState>(),
  }),
  apply(state, event): InventoryReadModelState {
    if (event.subject.subjectType === "RECONCILIATION_RECORD") {
      const payload = event.payload as RecordPayloadShape;
      if (payload.record) {
        const key = inventoryKey(payload.record.skuId, payload.record.locationId);
        const observations = new Map(state.countObservations);
        observations.set(key, countObservationStateOf(payload.record.disposition));
        return { ...state, countObservations: observations };
      }
      return state;
    }
    if (event.subject.subjectType !== "INVENTORY_LEVEL") return state;
    const payload = event.payload as InventoryPayloadShape;
    let levels = state.levels;
    if (payload.resultingLevel) {
      const copy = new Map(state.levels);
      copy.set(inventoryKey(payload.resultingLevel.skuId, payload.resultingLevel.locationId), payload.resultingLevel);
      levels = copy;
    }
    const kind = typeof payload.kind === "string" ? payload.kind : undefined;
    const reservationId = typeof payload.reservationId === "string" ? payload.reservationId : undefined;
    let reservations = state.reservations;
    if (reservationId && kind) {
      const existing = state.reservations.get(reservationId);
      const copy = new Map(state.reservations);
      if (kind === "INVENTORY_RESERVED" && !existing) {
        copy.set(reservationId, {
          reservationId: reservationId as InventoryReservation["reservationId"],
          skuId: payload.skuId as InventoryReservation["skuId"],
          locationId: payload.locationId as InventoryReservation["locationId"],
          units: typeof payload.units === "number" ? payload.units : 0,
          status: "OPEN",
          revision: 1,
        });
        reservations = copy;
      } else if (
        existing &&
        (kind === "INVENTORY_RESERVATION_COMMITTED" || kind === "INVENTORY_RESERVATION_RELEASED")
      ) {
        copy.set(reservationId, {
          ...existing,
          status: kind === "INVENTORY_RESERVATION_COMMITTED" ? "COMMITTED" : "RELEASED",
          revision: nextRevision(existing.revision),
        });
        reservations = copy;
      }
    }
    if (levels === state.levels && reservations === state.reservations) return state;
    return { ...state, levels, reservations };
  },
};
