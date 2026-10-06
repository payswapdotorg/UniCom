/**
 * Kernel-side fold for W1-005 autonomous-store runtime collections.
 *
 * Owns store control (authority chain), journaled policy applications,
 * explicit escalation states, operating cycles, the autonomous price book +
 * adjustment trail, restock order records and human override records.
 * Fold discipline is "set latest from the event payload" (the payload always
 * carries the resulting aggregate state). Event shapes folded here:
 * - AUTONOMOUS_STORE subject:
 *     STORE_REGISTERED { control } · STORE_AUTHORITY_CHANGED { from, to } ·
 *     AUTONOMOUS_OVERRIDE_RECORDED { override };
 * - POLICY_APPLICATION subject: POLICY_APPLIED { application };
 * - STORE_ESCALATION subject: STORE_ESCALATION_RECORDED / _ADVANCED { escalation };
 * - STORE_CYCLE subject: STORE_CYCLE_BEGUN { cycle } / STORE_CYCLE_ADVANCED { cycle };
 * - SKU_PRICE subject: SKU_PRICE_SET / SKU_PRICE_ADJUSTED { record };
 * - PRICE_ADJUSTMENT subject: SKU_PRICE_ADJUSTED / SKU_PRICE_ADJUSTMENT_REJECTED
 *     { adjustment };
 * - RESTOCK_ORDER subject: RESTOCK_ORDERED { restock }.
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
import type { PurchaseOrder } from "../domain/purchasing.js";
import type { Money } from "../domain/money.js";

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

/** Restock spend aggregation key. */
export interface RestockSpend {
  readonly orderedCount: number;
  readonly spendMinor: bigint;
  readonly currency: Money["currency"] | undefined;
}

export class KernelAutonomousStoreFold {
  private readonly stores = new Map<string, AutonomousStoreControl>();
  private readonly cycles = new Map<string, StoreCycle>();
  private readonly applications = new Map<string, PolicyApplication>();
  private readonly escalations = new Map<string, StoreEscalation>();
  private readonly overrides = new Map<string, AutonomousOverrideRecord>();
  private readonly prices = new Map<string, SkuPriceRecord>();
  private readonly adjustments = new Map<string, PriceAdjustmentRecord>();
  private readonly restockOrders = new Map<string, RestockOrderRecord>();

  apply(event: AnyCommerceEvent): void {
    const payload = event.payload as PayloadLike;
    const kind = kindOf(event);
    switch (event.subject.subjectType) {
      case "AUTONOMOUS_STORE": {
        if (kind === "STORE_REGISTERED" || kind === "STORE_AUTHORITY_CHANGED") {
          const control = optional<AutonomousStoreControl>(kind === "STORE_REGISTERED" ? payload.control : payload.to);
          if (control) this.stores.set(control.autonomousStoreId, control);
        }
        if (kind === "AUTONOMOUS_OVERRIDE_RECORDED") {
          const override = optional<AutonomousOverrideRecord>(payload.override);
          if (override) this.overrides.set(override.overrideId, override);
        }
        return;
      }
      case "POLICY_APPLICATION": {
        if (kind !== "POLICY_APPLIED") return;
        const application = optional<PolicyApplication>(payload.application);
        if (application) this.applications.set(application.applicationId, application);
        return;
      }
      case "STORE_ESCALATION": {
        if (kind !== "STORE_ESCALATION_RECORDED" && kind !== "STORE_ESCALATION_ADVANCED") return;
        const escalation = optional<StoreEscalation>(payload.escalation);
        if (escalation) this.escalations.set(escalation.escalationId, escalation);
        return;
      }
      case "STORE_CYCLE": {
        if (kind !== "STORE_CYCLE_BEGUN" && kind !== "STORE_CYCLE_ADVANCED") return;
        const cycle = optional<StoreCycle>(payload.cycle);
        if (cycle) this.cycles.set(cycle.cycleId, cycle);
        return;
      }
      case "SKU_PRICE": {
        const record = optional<SkuPriceRecord>(payload.record);
        if (record) this.prices.set(`${record.autonomousStoreId}|${record.skuId}`, record);
        return;
      }
      case "PRICE_ADJUSTMENT": {
        const adjustment = optional<PriceAdjustmentRecord>(payload.adjustment);
        if (adjustment) this.adjustments.set(adjustment.adjustmentId, adjustment);
        return;
      }
      case "RESTOCK_ORDER": {
        const restock = optional<RestockOrderRecord>(payload.restock);
        if (restock) this.restockOrders.set(restock.restockId, restock);
        return;
      }
      default:
        return;
    }
  }

  // --- read accessors (sorted by revision over insertion) ---

  controlFor(autonomousStoreId: string): AutonomousStoreControl | undefined {
    return this.stores.get(autonomousStoreId);
  }
  allStores(): readonly AutonomousStoreControl[] {
    return [...this.stores.values()].sort(byRevision);
  }
  cycle(cycleId: string): StoreCycle | undefined {
    return this.cycles.get(cycleId);
  }
  allCycles(): readonly StoreCycle[] {
    return [...this.cycles.values()].sort(byRevision);
  }
  /** The active (non-RECONCILED) cycle of a store on a day key, if any. */
  activeCycleFor(autonomousStoreId: string, dayKey: string): StoreCycle | undefined {
    return this.allCycles().find(
      (cycle) => cycle.autonomousStoreId === autonomousStoreId && cycle.dayKey === dayKey && cycle.state !== "RECONCILED",
    );
  }
  policyApplication(applicationId: string): PolicyApplication | undefined {
    return this.applications.get(applicationId);
  }
  allPolicyApplications(): readonly PolicyApplication[] {
    return [...this.applications.values()].sort(byRevision);
  }
  escalation(escalationId: string): StoreEscalation | undefined {
    return this.escalations.get(escalationId);
  }
  allEscalations(): readonly StoreEscalation[] {
    return [...this.escalations.values()].sort(byRevision);
  }
  escalationsForStore(autonomousStoreId: string): readonly StoreEscalation[] {
    return this.allEscalations().filter((item) => item.autonomousStoreId === autonomousStoreId);
  }
  override(overrideId: string): AutonomousOverrideRecord | undefined {
    return this.overrides.get(overrideId);
  }
  allOverrides(): readonly AutonomousOverrideRecord[] {
    return [...this.overrides.values()].sort(byRevision);
  }
  overridesForStore(autonomousStoreId: string): readonly AutonomousOverrideRecord[] {
    return this.allOverrides().filter((item) => item.autonomousStoreId === autonomousStoreId);
  }
  priceRecord(autonomousStoreId: string, skuId: string): SkuPriceRecord | undefined {
    return this.prices.get(`${autonomousStoreId}|${skuId}`);
  }
  allPriceRecords(): readonly SkuPriceRecord[] {
    return [...this.prices.values()].sort(byRevision);
  }
  priceAdjustment(adjustmentId: string): PriceAdjustmentRecord | undefined {
    return this.adjustments.get(adjustmentId);
  }
  allPriceAdjustments(): readonly PriceAdjustmentRecord[] {
    return [...this.adjustments.values()].sort(byRevision);
  }
  restockOrder(restockId: string): RestockOrderRecord | undefined {
    return this.restockOrders.get(restockId);
  }
  allRestockOrders(): readonly RestockOrderRecord[] {
    return [...this.restockOrders.values()].sort(byRevision);
  }
  restockOrdersFor(storeId: string, skuId?: string, locationId?: string): readonly RestockOrderRecord[] {
    return this.allRestockOrders().filter(
      (item) =>
        item.autonomousStoreId === storeId &&
        (skuId === undefined || item.skuId === skuId) &&
        (locationId === undefined || item.locationId === locationId),
    );
  }
  /** Deterministic spend-in-period aggregation over journaled restock orders. */
  restockSpendInPeriod(autonomousStoreId: string, periodKey: string, purchaseOrderOf: (id: string) => PurchaseOrder | undefined): RestockSpend {
    let orderedCount = 0;
    let spendMinor = 0n;
    let currency: Money["currency"] | undefined;
    for (const order of this.restockOrdersFor(autonomousStoreId)) {
      if (order.periodKey !== periodKey) continue;
      // Open restocks count toward spend until their PO reaches a terminal
      // non-received state (CANCELLED/CLOSED without full receipt releases
      // the commitment); RECEIVED/CLOSED-after-receipt keeps it committed.
      const po = order.purchaseOrderId === undefined ? undefined : purchaseOrderOf(order.purchaseOrderId);
      if (po && (po.state === "CANCELLED" || (po.state === "CLOSED" && po.lines.every((line) => line.receivedUnits === 0)))) continue;
      orderedCount += 1;
      if (order.plannedValue.currency === currency || currency === undefined) {
        currency = order.plannedValue.currency;
        spendMinor += BigInt(order.plannedValue.amountMinor);
      }
    }
    return { orderedCount, spendMinor, currency };
  }
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
