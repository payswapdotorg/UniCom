/**
 * Inventory command handlers: adjustments, receiving, reservations and the
 * deterministic reconciliation commands (count observations + POS sync).
 *
 * All level math goes through the frozen domain functions; canonical state
 * can never go negative and observations are never silently promoted
 * (INVARIANT 29/47 — reconciliation outcomes are recorded facts).
 */
import { adjustOnHand, availableUnits, type CanonicalInventoryLevel } from "../domain/inventory.js";
import { commitReservation, releaseReservation, reserveUnits } from "../domain/inventory.js";
import { inventorySubject } from "../domain/inventory.js";
import { reconcileCountObservation, reconcilePosSync, reconciliationRecord } from "../domain/reconciliation.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInsufficientInventory,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import { mintReconciliationRecordId } from "./subjects.js";

function stamped(level: CanonicalInventoryLevel, now: string): CanonicalInventoryLevel {
  return { ...level, updatedAt: now };
}

export const handleAdjustInventory: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADJUST_INVENTORY") return rejectInvalidCommand("not ADJUST_INVENTORY");
  if (!Number.isSafeInteger(payload.deltaUnits)) {
    return rejectInvalidCommand(`delta must be a safe integer: ${payload.deltaUnits}`);
  }
  const current = ctx.state.level(payload.skuId, payload.locationId) ?? initLevel(payload.skuId, payload.locationId, ctx.now);
  const next = adjustOnHand(current, payload.deltaUnits, payload.reason);
  if (!next.ok) {
    return rejectInvalidState(`${next.error.code}: ${next.error.detail}`);
  }
  const resulting = stamped(next.value, ctx.now);
  ctx.emit({
    subject: inventorySubject(payload),
    kind: "INVENTORY_ADJUSTED",
    payload: {
      kind: "INVENTORY_ADJUSTED",
      skuId: payload.skuId,
      locationId: payload.locationId,
      units: payload.deltaUnits,
      reason: payload.reason,
      resultingLevel: resulting,
    },
  });
  return accept();
};

export const handleReceiveStock: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECEIVE_STOCK") return rejectInvalidCommand("not RECEIVE_STOCK");
  if (!Number.isSafeInteger(payload.units) || payload.units <= 0) {
    return rejectInvalidCommand(`units must be a positive safe integer: ${payload.units}`);
  }
  const current = ctx.state.level(payload.skuId, payload.locationId) ?? initLevel(payload.skuId, payload.locationId, ctx.now);
  const next = adjustOnHand(current, payload.units, payload.reason);
  if (!next.ok) {
    return rejectInvalidState(`${next.error.code}: ${next.error.detail}`);
  }
  const resulting = stamped(next.value, ctx.now);
  ctx.emit({
    subject: inventorySubject(payload),
    kind: "INVENTORY_RECEIVED",
    payload: {
      kind: "INVENTORY_RECEIVED",
      skuId: payload.skuId,
      locationId: payload.locationId,
      units: payload.units,
      reason: payload.reason,
      resultingLevel: resulting,
    },
  });
  return accept();
};

export const handleReserveInventory: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RESERVE_INVENTORY") return rejectInvalidCommand("not RESERVE_INVENTORY");
  const reservation = payload.reservation;
  if (reservation.status !== "OPEN" || reservation.revision !== 1) {
    return rejectInvalidCommand("reservation must arrive OPEN at revision 1");
  }
  if (ctx.state.reservation(reservation.reservationId)) {
    return rejectInvalidState(`reservation ${reservation.reservationId} already exists`);
  }
  if (!Number.isSafeInteger(reservation.units) || reservation.units <= 0) {
    return rejectInvalidCommand(`reservation units must be positive: ${reservation.units}`);
  }
  const current =
    ctx.state.level(reservation.skuId, reservation.locationId) ??
    initLevel(reservation.skuId, reservation.locationId, ctx.now);
  const result = reserveUnits(current, reservation.units, reservation.reservationId);
  if (!result.ok) {
    return rejectInsufficientInventory(
      `requested ${reservation.units}, available ${availableUnits(current)} for ${reservation.skuId}|${reservation.locationId}`,
    );
  }
  const resulting = stamped(result.value.level, ctx.now);
  ctx.emit({
    subject: inventorySubject(reservation),
    kind: "INVENTORY_RESERVED",
    payload: {
      kind: "INVENTORY_RESERVED",
      skuId: reservation.skuId,
      locationId: reservation.locationId,
      units: reservation.units,
      reservationId: reservation.reservationId,
      resultingLevel: resulting,
    },
  });
  return accept();
};

export const handleCommitReservation: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "COMMIT_RESERVATION") return rejectInvalidCommand("not COMMIT_RESERVATION");
  const reservation = ctx.state.reservation(payload.reservationId);
  if (!reservation) return rejectInvalidState(`reservation ${payload.reservationId} not found`);
  if (reservation.status !== "OPEN") {
    return rejectInvalidState(`reservation ${payload.reservationId} is ${reservation.status} (revision ${reservation.revision})`);
  }
  const current = ctx.state.level(reservation.skuId, reservation.locationId);
  if (!current) return rejectInvalidState(`level vanished for reservation ${payload.reservationId}`);
  const result = commitReservation(current, reservation);
  if (!result.ok) return rejectInvalidState(`${result.error.code}: ${result.error.detail}`);
  const resulting = stamped(result.value.level, ctx.now);
  ctx.emit({
    subject: inventorySubject(reservation),
    kind: "INVENTORY_RESERVATION_COMMITTED",
    payload: {
      kind: "INVENTORY_RESERVATION_COMMITTED",
      skuId: reservation.skuId,
      locationId: reservation.locationId,
      units: reservation.units,
      reservationId: reservation.reservationId,
      resultingLevel: resulting,
    },
  });
  return accept();
};

export const handleReleaseReservation: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RELEASE_RESERVATION") return rejectInvalidCommand("not RELEASE_RESERVATION");
  const reservation = ctx.state.reservation(payload.reservationId);
  if (!reservation) return rejectInvalidState(`reservation ${payload.reservationId} not found`);
  if (reservation.status !== "OPEN") {
    return rejectInvalidState(`reservation ${payload.reservationId} is ${reservation.status} (revision ${reservation.revision})`);
  }
  const current = ctx.state.level(reservation.skuId, reservation.locationId);
  if (!current) return rejectInvalidState(`level vanished for reservation ${payload.reservationId}`);
  const result = releaseReservation(current, reservation);
  if (!result.ok) return rejectInvalidState(`${result.error.code}: ${result.error.detail}`);
  const resulting = stamped(result.value.level, ctx.now);
  ctx.emit({
    subject: inventorySubject(reservation),
    kind: "INVENTORY_RESERVATION_RELEASED",
    payload: {
      kind: "INVENTORY_RESERVATION_RELEASED",
      skuId: reservation.skuId,
      locationId: reservation.locationId,
      units: reservation.units,
      reservationId: reservation.reservationId,
      resultingLevel: resulting,
    },
  });
  return accept();
};

export const handleReconcileCount: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECONCILE_COUNT_OBSERVATION") return rejectInvalidCommand("not RECONCILE_COUNT_OBSERVATION");
  const observation = payload.observation;
  const current =
    ctx.state.level(observation.skuId, observation.locationId) ??
    initLevel(observation.skuId, observation.locationId, ctx.now);
  const outcome = reconcileCountObservation(current, observation, payload.policy);
  const recordId = mintReconciliationRecordId(ctx.mint());
  const record = reconciliationRecord(
    recordId,
    observation.observationId,
    outcome,
    observation.skuId,
    observation.locationId,
    ctx.now,
  );
  ctx.emit({
    subject: { subjectType: "RECONCILIATION_RECORD", subjectId: recordId },
    kind: "RECONCILIATION_RECORDED",
    payload: { kind: "RECONCILIATION_RECORDED", record },
  });
  if (outcome.disposition === "PROMOTED") {
    ctx.emit({
      subject: inventorySubject(observation),
      kind: "INVENTORY_RECONCILED",
      payload: {
        kind: "INVENTORY_RECONCILED",
        skuId: observation.skuId,
        locationId: observation.locationId,
        units: outcome.varianceUnits ?? 0,
        reason: "RECONCILIATION",
        varianceUnits: outcome.varianceUnits,
        resultingLevel: stamped(outcome.level, ctx.now),
      },
    });
  }
  return accept();
};

export const handleReconcilePosSync: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECONCILE_POS_SYNC") return rejectInvalidCommand("not RECONCILE_POS_SYNC");
  const observation = payload.observation;
  const current =
    ctx.state.level(observation.skuId, observation.locationId) ??
    initLevel(observation.skuId, observation.locationId, ctx.now);
  const outcome = reconcilePosSync(current, observation);
  const recordId = mintReconciliationRecordId(ctx.mint());
  const record = reconciliationRecord(
    recordId,
    observation.observationId,
    outcome,
    observation.skuId,
    observation.locationId,
    ctx.now,
  );
  ctx.emit({
    subject: { subjectType: "RECONCILIATION_RECORD", subjectId: recordId },
    kind: "RECONCILIATION_RECORDED",
    payload: { kind: "RECONCILIATION_RECORDED", record },
  });
  if (outcome.disposition === "PROMOTED") {
    ctx.emit({
      subject: inventorySubject(observation),
      kind: "INVENTORY_ADJUSTED",
      payload: {
        kind: "INVENTORY_ADJUSTED",
        skuId: observation.skuId,
        locationId: observation.locationId,
        units: -(outcome.varianceUnits ?? 0),
        reason: "POS_SYNC",
        resultingLevel: stamped(outcome.level, ctx.now),
      },
    });
  }
  return accept();
};

function initLevel(skuId: CanonicalInventoryLevel["skuId"], locationId: CanonicalInventoryLevel["locationId"], now: string): CanonicalInventoryLevel {
  return { skuId, locationId, onHand: 0, reserved: 0, revision: 0, updatedAt: now };
}
