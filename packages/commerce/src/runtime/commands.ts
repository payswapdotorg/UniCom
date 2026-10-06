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
  AutonomousStoreId,
  CheckoutSessionId,
  ConsignmentId,
  DisputeId,
  LocationId,
  MerchantId,
  OrderId,
  PaymentId,
  PurchaseOrderId,
  RentalAgreementId,
  ResaleListingId,
  StoreCashSessionId,
  SubscriptionId,
  TillId,
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
import type { Money } from "../domain/money.js";
import type { PaymentMethodRef } from "../domain/payments.js";
import type { PrincipalRef } from "../domain/principals.js";
import type { DisputeEvidence } from "../domain/recourse.js";
import type { TillOperation } from "../domain/store-ops.js";

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

/** W1-004: end-to-end checkout completion (cart → order + payment authorization). */
export type CheckoutCompletionCommandPayload = {
  readonly type: "COMPLETE_CHECKOUT";
  readonly checkoutSessionId: CheckoutSessionId;
  readonly merchantId: MerchantId;
  readonly method: PaymentMethodRef;
};

/** W1-004: settlement observation + recourse-window close + partial capture. */
export type SettlementCommandPayload =
  | { readonly type: "OBSERVE_SETTLEMENT"; readonly paymentId: PaymentId }
  | { readonly type: "CAPTURE_PAYMENT_PARTIAL"; readonly paymentId: PaymentId; readonly amount: Money }
  | { readonly type: "CLOSE_SETTLEMENT_WINDOW"; readonly paymentId: PaymentId };

/** W1-004: dispute lifecycle + chargeback forcing + goodwill refunds. */
export type RecourseCommandPayload =
  | {
      readonly type: "OPEN_DISPUTE";
      readonly paymentId: PaymentId;
      readonly amount: Money;
      readonly reason?: string;
      readonly providerNativeStatus?: string;
    }
  | { readonly type: "SUBMIT_DISPUTE_EVIDENCE"; readonly disputeId: DisputeId; readonly evidence: DisputeEvidence }
  | { readonly type: "RESOLVE_DISPUTE"; readonly disputeId: DisputeId; readonly outcome: "ACCEPTED" | "REJECTED" }
  | {
      readonly type: "RECORD_CHARGEBACK";
      readonly paymentId: PaymentId;
      readonly amount: Money;
      readonly providerNativeStatus?: string;
    }
  | { readonly type: "ISSUE_GOODWILL_REFUND"; readonly paymentId: PaymentId; readonly amount: Money; readonly reason: string };

/** W1-004: autonomous-store cash-session operations (staff custody vocabulary). */
export type StoreOpsCommandPayload =
  | {
      readonly type: "OPEN_STORE_CASH_SESSION";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly tillId: TillId;
      readonly openingCount: Money;
      readonly staff: PrincipalRef;
    }
  | { readonly type: "RECORD_TILL_OPERATION"; readonly sessionId: StoreCashSessionId; readonly operation: TillOperation }
  | {
      readonly type: "HANDOVER_STORE_CASH_SESSION";
      readonly sessionId: StoreCashSessionId;
      readonly fromStaff: PrincipalRef;
      readonly toStaff: PrincipalRef;
      readonly countedCash: Money;
    }
  | { readonly type: "CLOSE_STORE_CASH_SESSION"; readonly sessionId: StoreCashSessionId; readonly closingCount: Money };

/** The full runtime command payload union (frozen core + additive flows). */
export type RuntimeCommandPayload =
  | CommerceCommandPayload
  | SupplyCommandPayload
  | ReconciliationCommandPayload
  | OrderFlowCommandPayload
  | ReturnFlowCommandPayload
  | CircularCommandPayload
  | CheckoutCompletionCommandPayload
  | SettlementCommandPayload
  | RecourseCommandPayload
  | StoreOpsCommandPayload;

/** Discriminated envelope over the runtime payload union. */
export type AnyRuntimeCommand = CommerceCommandEnvelope<RuntimeCommandPayload>;
