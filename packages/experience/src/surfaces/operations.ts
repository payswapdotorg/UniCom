/**
 * Operational surfaces: catalog, orders, inventory, customers, marketing,
 * fulfillment, B2B, POS, channels (FROZEN-ARCHITECTURE §19; W3-001 §3).
 *
 * All views are read-side projections of Worker 1's canonical truth and
 * carry truth classes. Statuses always include "unknown" — UNKNOWN is not
 * FAILED. Customer-authored text arrives as untrusted content.
 */

import type {
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceLocationRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectorInstanceId,
  ReconciliationHandoffId,
} from "../common/opaque-refs";
import type { TruthClass } from "../common/evidence";
import type { MoneyString, UtcIso8601String } from "../common/values";
import type { CustomerTextContent, UntrustedCommerceContent } from "../common/untrusted";

/** Operational surface kinds. */
export type OperationalSurfaceKind =
  | "catalog"
  | "orders"
  | "inventory"
  | "customers"
  | "marketing"
  | "analytics"
  | "fulfillment"
  | "returns"
  | "b2b"
  | "pos"
  | "channels";

/** Product row on the catalog surface. */
export interface CatalogProductRow {
  readonly productRef: CommerceProductRef;
  readonly title: string;
  readonly skuCode: string;
  readonly variantCount: number;
  readonly priceDisplay: MoneyString;
  readonly lifecycleStatus: "draft" | "active" | "archived" | "unknown";
}

/** Order row on the orders surface. */
export interface OrderRowView {
  readonly orderRef: CommerceOrderRef;
  readonly orderNumber: string;
  readonly paymentStatus: "paid" | "pending" | "failed" | "refunded" | "partially-refunded" | "unknown";
  readonly fulfillmentStatus: "unfulfilled" | "in-progress" | "fulfilled" | "returned" | "unknown";
  readonly returnStatus: "none" | "requested" | "approved" | "rejected" | "completed" | "unknown";
  readonly placedAt: UtcIso8601String;
}

/**
 * Inventory row: three-truth separation made visible.
 * `onHand` is operational truth; `observedCounts` are unreconciled
 * observations; `forecast` is predictive truth.
 */
export interface InventoryRowView {
  readonly inventoryRef: CommerceInventoryRef;
  readonly productRef: CommerceProductRef;
  readonly locationRef: CommerceLocationRef;
  readonly onHand: { readonly truthClass: "operational"; readonly displayQuantity: string };
  readonly observedCounts: readonly {
    readonly truthClass: "observed";
    readonly sourceNote: string;
    readonly displayQuantity: string;
    readonly observedAt: UtcIso8601String;
    readonly pendingReconciliation: boolean;
  }[];
  readonly forecast?: { readonly truthClass: "predictive"; readonly note: string };
}

/** Customer row on the customers surface. */
export interface CustomerRowView {
  readonly customerRef: CommerceCustomerRef;
  readonly displayName: string;
  readonly loyaltyStatus: "none" | "member" | "tiered" | "unknown";
  readonly subscriptionRefs: readonly string[];
  /** Customer-authored notes are untrusted data, never instructions. */
  readonly recentNotes: readonly UntrustedCommerceContent<CustomerTextContent>[];
}

/** POS terminal status on the in-person selling surface. */
export interface PosTerminalView {
  readonly terminalId: string;
  readonly connectorRef: ConnectorInstanceId;
  readonly shiftStatus: "closed" | "open" | "unknown";
  readonly lastSyncAt: UtcIso8601String;
  readonly lastSyncStatus: "synced" | "pending" | "offline-queued" | "unknown";
}

/** Marketing campaign row. */
export interface MarketingCampaignRow {
  readonly campaignRef: string;
  readonly title: string;
  readonly status: "draft" | "scheduled" | "running" | "paused" | "completed" | "unknown";
  readonly channelNote: string;
}

/** Analytics tile (operational projections only; Twin forecasts stay in Lab). */
export interface AnalyticsTileView {
  readonly tileId: string;
  readonly label: string;
  readonly displayValue: string;
  readonly truthClass: TruthClass;
  readonly asOf: UtcIso8601String;
}

/** Reconciliation queue visibility on operational surfaces. */
export interface PendingReconciliationNotice {
  readonly handoffId: ReconciliationHandoffId;
  readonly surfaceKind: OperationalSurfaceKind;
  readonly note: string;
  readonly submittedAt: UtcIso8601String;
}
