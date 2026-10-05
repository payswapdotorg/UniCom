/**
 * Runtime command vocabulary (W1-002).
 *
 * The W1-001 frozen payloads (domain/commands.ts) remain the core mutation
 * path. The runtime ADDITIVELY extends the vocabulary with the aggregate
 * opening/advance payloads needed to drive complete flows on the kernel
 * (transfers, purchase orders, reconciliation, fulfillment, returns and
 * circular commerce). Every payload still travels inside the SAME frozen
 * envelope shape: typed idempotency key, typed actor, deterministic result.
 */
import type {
  CheckoutSessionId,
  ConsignmentId,
  LocationId,
  OrderId,
  PurchaseOrderId,
  RentalAgreementId,
  ResaleListingId,
  SubscriptionId,
} from "../domain/ids.js";
import type { CommerceCommandEnvelope, CommerceCommandPayload } from "../domain/commands.js";
import type { PurchaseOrder, PurchaseOrderTrigger } from "../domain/purchasing.js";
import type {
  CountReconciliationPolicy,
  InventoryCountObservation,
  PosSyncObservation,
} from "../domain/reconciliation.js";
import type { CheckoutTrigger } from "../domain/cart.js";
import type { OrderTrigger } from "../domain/orders.js";
import type { ReturnLine, ReturnResolution } from "../domain/returns.js";
import type { DeliveryObservation } from "../domain/fulfillment.js";
import type { Subscription, SubscriptionTrigger } from "../domain/subscriptions.js";
import type {
  ConsignmentAgreement,
  ConsignmentTrigger,
  ListingTrigger as ResaleListingTrigger,
  RentalAgreement,
  RentalTrigger,
  ResaleListing,
} from "../domain/circular.js";
import type { StockTransfer } from "../domain/transfers.js";

/** Supply-side flows: multi-location transfers and supplier purchase orders. */
export type SupplyCommandPayload =
  | { readonly type: "OPEN_TRANSFER"; readonly transfer: StockTransfer }
  | { readonly type: "OPEN_PURCHASE_ORDER"; readonly purchaseOrder: PurchaseOrder }
  | {
      readonly type: "ADVANCE_PURCHASE_ORDER";
      readonly purchaseOrderId: PurchaseOrderId;
      readonly trigger: PurchaseOrderTrigger;
    };

/**
 * Physical/provider observation reconciliation — the ONLY deterministic
 * promotion path from observation to canonical inventory state. The payload
 * carries the observation and the reconciliation policy; the kernel records
 * the outcome (including NOT_PROMOTED_* and DISCREPANCY_HOLD) as facts.
 */
export type ReconciliationCommandPayload =
  | {
      readonly type: "RECONCILE_COUNT_OBSERVATION";
      readonly observation: InventoryCountObservation;
      readonly policy: CountReconciliationPolicy;
    }
  | { readonly type: "RECONCILE_POS_SYNC"; readonly observation: PosSyncObservation };

/** Checkout/order/fulfillment flow extensions. */
export type OrderFlowCommandPayload =
  | {
      readonly type: "ADVANCE_CHECKOUT";
      readonly checkoutSessionId: CheckoutSessionId;
      readonly trigger: CheckoutTrigger;
    }
  | { readonly type: "ADVANCE_ORDER"; readonly orderId: OrderId; readonly trigger: OrderTrigger }
  | { readonly type: "OPEN_FULFILLMENT"; readonly orderId: OrderId; readonly originLocationId?: LocationId }
  | { readonly type: "APPLY_DELIVERY_OBSERVATION"; readonly observation: DeliveryObservation };

/** Returns/exchanges with explicit resolution control. */
export type ReturnFlowCommandPayload =
  | {
      readonly type: "OPEN_RETURN";
      readonly orderId: OrderId;
      readonly resolution: ReturnResolution;
      readonly lines: readonly ReturnLine[];
    };

/** Circular commerce flows: subscription / resale / rental / consignment. */
export type CircularCommandPayload =
  | { readonly type: "OPEN_SUBSCRIPTION"; readonly subscription: Subscription }
  | {
      readonly type: "ADVANCE_SUBSCRIPTION";
      readonly subscriptionId: SubscriptionId;
      readonly trigger: SubscriptionTrigger;
    }
  | { readonly type: "OPEN_LISTING"; readonly listing: ResaleListing }
  | { readonly type: "ADVANCE_LISTING"; readonly listingId: ResaleListingId; readonly trigger: ResaleListingTrigger }
  | { readonly type: "OPEN_RENTAL"; readonly rental: RentalAgreement }
  | { readonly type: "ADVANCE_RENTAL"; readonly rentalAgreementId: RentalAgreementId; readonly trigger: RentalTrigger }
  | { readonly type: "OPEN_CONSIGNMENT"; readonly consignment: ConsignmentAgreement }
  | { readonly type: "ADVANCE_CONSIGNMENT"; readonly consignmentId: ConsignmentId; readonly trigger: ConsignmentTrigger };

/** The full runtime command payload union (frozen core + additive flows). */
export type RuntimeCommandPayload =
  | CommerceCommandPayload
  | SupplyCommandPayload
  | ReconciliationCommandPayload
  | OrderFlowCommandPayload
  | ReturnFlowCommandPayload
  | CircularCommandPayload;

/** Discriminated envelope over the runtime payload union. */
export type AnyRuntimeCommand = CommerceCommandEnvelope<RuntimeCommandPayload>;
