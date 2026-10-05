/**
 * Explicit projection-schema migrations for the commerce event vocabulary.
 *
 * Scenario 5 law: events written under projection schema N must project
 * correctly under schema N+1 THROUGH THE EXPLICIT PATH — never by silently
 * guessing shapes inside folds. History is immutable (INVARIANT 15), so
 * migrations transform the EVENT VIEW handed to projections, never the
 * journal itself.
 *
 * Schema history:
 * - v1 (legacy first projection draft): inventory events carried `count`
 *   instead of `units` and no `reason`; ORDER_PAYMENT_STATUS_CHANGED carried
 *   only `status` (the resulting status — the prior status was not recorded);
 *   ORDER_PLACED snapshots predate the `opportunityRef` pass-through.
 * - v2 (current): the shapes emitted by the W1-002 kernel runtime.
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import { migrateEventToCurrent, type EventMigration } from "./engine.js";

/** Current projection schema version for the commerce event vocabulary. */
export const COMMERCE_PROJECTION_SCHEMA_VERSION = 2;

/** Legacy schema version understood by the explicit migration path. */
export const LEGACY_PROJECTION_SCHEMA_VERSION = 1;

interface PayloadShape {
  readonly kind?: unknown;
  [key: string]: unknown;
}

function payloadOf(event: AnyCommerceEvent): PayloadShape {
  const payload = event.payload as PayloadShape | null | undefined;
  if (payload === null || typeof payload !== "object") {
    throw new TypeError(`migration v1->v2: event ${event.eventId} payload is not an object`);
  }
  return payload;
}

function requireString(payload: PayloadShape, key: string, eventId: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new TypeError(`migration v1->v2: event ${eventId} field ${key} must be a string`);
  }
  return value;
}

function requireObject<T>(payload: PayloadShape, key: string, eventId: string): T {
  const value = payload[key];
  if (value === null || typeof value !== "object") {
    throw new TypeError(`migration v1->v2: event ${eventId} field ${key} must be an object`);
  }
  return value as T;
}

/** v1 → v2: normalize legacy event shapes into the current vocabulary. */
export const migrateV1ToV2: EventMigration = {
  fromSchemaVersion: 1,
  toSchemaVersion: 2,
  migrate(event: AnyCommerceEvent): AnyCommerceEvent {
    const payload = payloadOf(event);
    const kind = requireString(payload, "kind", event.eventId);
    if (kind === "INVENTORY_RECEIVED" || kind === "INVENTORY_ADJUSTED") {
      // v1 carried `count` (no `units`, no `reason`). `count` was the signed
      // delta for adjustments and the received quantity for receipts; v2
      // renamed it `units`. Adjustments in v1 did not record a reason — the
      // deterministic normalization is "MANUAL" (least-assumption value).
      const count = payload.count;
      if (typeof count !== "number" || !Number.isSafeInteger(count)) {
        throw new TypeError(`migration v1->v2: event ${event.eventId} field count must be a safe integer`);
      }
      return {
        ...event,
        payload: {
          ...payload,
          kind,
          units: count,
          reason: typeof payload.reason === "string" ? payload.reason : "MANUAL",
        },
      };
    }
    if (kind === "ORDER_PAYMENT_STATUS_CHANGED") {
      // v1 recorded only the resulting payment status (`status`). v2 records
      // from/to; `from` is NOT recoverable from a v1 journal and is normalized
      // to the resulting status (folds consume `to`; the normalization is
      // documented here, not silently buried in a fold).
      const status = requireString(payload, "status", event.eventId);
      return {
        ...event,
        payload: { ...payload, kind, from: status, to: status },
      };
    }
    if (kind === "ORDER_PLACED") {
      // v1 order snapshots predate the opaque opportunity-reference
      // pass-through; v2 carries it (undefined when absent — verbatim).
      const snapshot = requireObject<Record<string, unknown>>(payload, "snapshot", event.eventId);
      return {
        ...event,
        payload: { ...payload, kind, snapshot: { ...snapshot, opportunityRef: snapshot.opportunityRef } },
      };
    }
    if (typeof kind === "string" && kind.length > 0) {
      // Shape already satisfies v2 (kinds unchanged between schemas).
      return event;
    }
    throw new TypeError(`migration v1->v2: event ${event.eventId} has unrecognized payload shape`);
  },
};

/** The full explicit migration registry (ordered chain v1 → … → current). */
export const COMMERCE_EVENT_MIGRATIONS: readonly EventMigration[] = [migrateV1ToV2];

/** Migrate a legacy journal (schema `from`) up to the current schema. */
export function migrateJournalToCurrent(
  events: readonly AnyCommerceEvent[],
  fromSchemaVersion: number,
): AnyCommerceEvent[] {
  if (fromSchemaVersion === COMMERCE_PROJECTION_SCHEMA_VERSION) return [...events];
  if (fromSchemaVersion < LEGACY_PROJECTION_SCHEMA_VERSION || fromSchemaVersion > COMMERCE_PROJECTION_SCHEMA_VERSION) {
    throw new TypeError(`unknown projection schema version ${fromSchemaVersion}`);
  }
  return events.map((event) =>
    migrateEventToCurrent(event, fromSchemaVersion, COMMERCE_PROJECTION_SCHEMA_VERSION, COMMERCE_EVENT_MIGRATIONS),
  );
}
