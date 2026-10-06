/**
 * Twin-side fold for W1-005 autonomous-store runtime collections.
 *
 * INDEPENDENT implementation of the kernel's KernelAutonomousStoreFold (same
 * event contracts, separate code — the twin-verification discipline). Folds:
 * - AUTONOMOUS_STORE subject: STORE_REGISTERED { control },
 *   STORE_AUTHORITY_CHANGED { from, to } (control set-latest),
 *   AUTONOMOUS_OVERRIDE_RECORDED { override };
 * - POLICY_APPLICATION subject: POLICY_APPLIED { application };
 * - STORE_ESCALATION subject: STORE_ESCALATION_RECORDED / _ADVANCED
 *   { escalation };
 * - STORE_CYCLE subject: STORE_CYCLE_BEGUN / _ADVANCED { cycle };
 * - SKU_PRICE subject: SKU_PRICE_SET / SKU_PRICE_ADJUSTED { record };
 * - PRICE_ADJUSTMENT subject: SKU_PRICE_ADJUSTMENT_RECORDED /
 *   SKU_PRICE_ADJUSTMENT_REJECTED { adjustment };
 * - RESTOCK_ORDER subject: RESTOCK_ORDERED { restock }.
 *
 * The bag is owned by TwinState as a single field; clone/serialize/resume go
 * through the helpers below (checkpoint round-trips preserve insertion order).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type {
  AutonomousOverrideRecord,
  AutonomousStoreControl,
  PolicyApplication,
  PriceAdjustmentRecord,
  RestockOrderRecord,
  SkuPriceRecord,
  StoreCycle,
  StoreEscalation,
} from "../domain/autonomous-store.js";

/** Mutable map bag owned by TwinState (passed by reference per fold step). */
export interface TwinAutonomousCollections {
  readonly stores: Map<string, AutonomousStoreControl>;
  readonly cycles: Map<string, StoreCycle>;
  readonly policyApplications: Map<string, PolicyApplication>;
  readonly escalations: Map<string, StoreEscalation>;
  readonly overrides: Map<string, AutonomousOverrideRecord>;
  readonly skuPrices: Map<string, SkuPriceRecord>;
  readonly priceAdjustments: Map<string, PriceAdjustmentRecord>;
  readonly restockOrders: Map<string, RestockOrderRecord>;
}

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

function kindOf(event: AnyCommerceEvent): string {
  const payload = event.payload as PayloadLike | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

function optional<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : (value as T);
}

export function emptyAutonomousCollections(): TwinAutonomousCollections {
  return {
    stores: new Map<string, AutonomousStoreControl>(),
    cycles: new Map<string, StoreCycle>(),
    policyApplications: new Map<string, PolicyApplication>(),
    escalations: new Map<string, StoreEscalation>(),
    overrides: new Map<string, AutonomousOverrideRecord>(),
    skuPrices: new Map<string, SkuPriceRecord>(),
    priceAdjustments: new Map<string, PriceAdjustmentRecord>(),
    restockOrders: new Map<string, RestockOrderRecord>(),
  };
}

export function applyAutonomousStoreEvent(collections: TwinAutonomousCollections, event: AnyCommerceEvent): void {
  const payload = event.payload as PayloadLike;
  const kind = kindOf(event);
  switch (event.subject.subjectType) {
    case "AUTONOMOUS_STORE": {
      if (kind === "STORE_REGISTERED" || kind === "STORE_AUTHORITY_CHANGED") {
        const control = optional<AutonomousStoreControl>(kind === "STORE_REGISTERED" ? payload.control : payload.to);
        if (control) collections.stores.set(control.autonomousStoreId, control);
      }
      if (kind === "AUTONOMOUS_OVERRIDE_RECORDED") {
        const override = optional<AutonomousOverrideRecord>(payload.override);
        if (override) collections.overrides.set(override.overrideId, override);
      }
      return;
    }
    case "POLICY_APPLICATION": {
      if (kind !== "POLICY_APPLIED") return;
      const application = optional<PolicyApplication>(payload.application);
      if (application) collections.policyApplications.set(application.applicationId, application);
      return;
    }
    case "STORE_ESCALATION": {
      if (kind !== "STORE_ESCALATION_RECORDED" && kind !== "STORE_ESCALATION_ADVANCED") return;
      const escalation = optional<StoreEscalation>(payload.escalation);
      if (escalation) collections.escalations.set(escalation.escalationId, escalation);
      return;
    }
    case "STORE_CYCLE": {
      if (kind !== "STORE_CYCLE_BEGUN" && kind !== "STORE_CYCLE_ADVANCED") return;
      const cycle = optional<StoreCycle>(payload.cycle);
      if (cycle) collections.cycles.set(cycle.cycleId, cycle);
      return;
    }
    case "SKU_PRICE": {
      const record = optional<SkuPriceRecord>(payload.record);
      if (record) collections.skuPrices.set(`${record.autonomousStoreId}|${record.skuId}`, record);
      return;
    }
    case "PRICE_ADJUSTMENT": {
      const adjustment = optional<PriceAdjustmentRecord>(payload.adjustment);
      if (adjustment) collections.priceAdjustments.set(adjustment.adjustmentId, adjustment);
      return;
    }
    case "RESTOCK_ORDER": {
      const restock = optional<RestockOrderRecord>(payload.restock);
      if (restock) collections.restockOrders.set(restock.restockId, restock);
      return;
    }
    default:
      return;
  }
}

/** Structured, insertion-order-preserving checkpoint form of the bag. */
export type TwinAutonomousSerializable = {
  readonly [K in keyof TwinAutonomousCollections]: readonly (readonly [string, TwinAutonomousCollections[K] extends ReadonlyMap<string, infer V> ? V : never])[];
};

export function serializeAutonomousCollections(collections: TwinAutonomousCollections): TwinAutonomousSerializable {
  return {
    stores: [...collections.stores.entries()],
    cycles: [...collections.cycles.entries()],
    policyApplications: [...collections.policyApplications.entries()],
    escalations: [...collections.escalations.entries()],
    overrides: [...collections.overrides.entries()],
    skuPrices: [...collections.skuPrices.entries()],
    priceAdjustments: [...collections.priceAdjustments.entries()],
    restockOrders: [...collections.restockOrders.entries()],
  };
}

/** Fill an (empty) target bag from a source bag (clone path). */
export function copyAutonomousCollections(target: TwinAutonomousCollections, source: TwinAutonomousCollections): void {
  for (const key of Object.keys(source) as (keyof TwinAutonomousCollections)[]) {
    const from = source[key] as ReadonlyMap<string, unknown>;
    const to = target[key] as Map<string, unknown>;
    for (const [mapKey, value] of from) to.set(mapKey, value);
  }
}

/** Restore a bag from its checkpoint form (resume path). */
export function restoreAutonomousCollections(target: TwinAutonomousCollections, serialized: TwinAutonomousSerializable | undefined): void {
  if (!serialized) return;
  const record = serialized as unknown as Record<string, readonly (readonly [string, unknown])[]>;
  for (const key of Object.keys(target) as (keyof TwinAutonomousCollections)[]) {
    const to = target[key] as Map<string, unknown>;
    for (const [mapKey, value] of record[key] ?? []) to.set(mapKey, value);
  }
}
