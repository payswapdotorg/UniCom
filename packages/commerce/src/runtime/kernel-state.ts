/**
 * Kernel authoritative state: the fold over the append-only journal.
 *
 * State changes ONLY by applying events (append-only discipline). Every
 * runtime event payload carries the RESULTING aggregate state, so folds are
 * deterministic "set latest" operations — exactly the pattern established by
 * the domain (resultingLevel / ORDER_PLACED snapshot). The ORDER fold
 * mirrors the domain orderProjection; the INVENTORY fold mirrors the domain
 * inventoryProjection (tests assert agreement with the reference folds).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import { nextRevision } from "../domain/events.js";
import type { CanonicalInventoryLevel, InventoryReservation } from "../domain/inventory.js";
import { inventoryKey } from "../domain/inventory.js";
import type { Cart, CheckoutSession } from "../domain/cart.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { PaymentIntent } from "../domain/payments.js";
import type { StockTransfer } from "../domain/transfers.js";
import type { PurchaseOrder } from "../domain/purchasing.js";
import type { FulfillmentOrder, Shipment } from "../domain/fulfillment.js";
import type { ReturnAuthorization, RefundRecord } from "../domain/returns.js";
import type { Subscription } from "../domain/subscriptions.js";
import type { ConsignmentAgreement, RentalAgreement, ResaleListing } from "../domain/circular.js";
import type { AutonomousStorePolicy } from "../domain/policy.js";
import type { ReconciliationRecord } from "../domain/reconciliation.js";
import type { LocationId, SkuId } from "../domain/ids.js";
import type { PaymentCaptureRecord, SettlementRecord } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";
import { KernelRecourseFold } from "./kernel-fold-recourse.js";
import { KernelStoreOpsFold } from "./kernel-fold-store-ops.js";

type OrderEventPayloadLike =
  | { readonly kind: "ORDER_PLACED"; readonly snapshot: OrderSnapshot }
  | { readonly kind: "ORDER_STATE_CHANGED"; readonly from: OrderSnapshot["state"]; readonly to: OrderSnapshot["state"] }
  | { readonly kind: "ORDER_PAYMENT_STATUS_CHANGED"; readonly from: OrderSnapshot["paymentStatus"]; readonly to: OrderSnapshot["paymentStatus"] }
  | {
      readonly kind: "ORDER_FULFILLMENT_STATUS_CHANGED";
      readonly from: OrderSnapshot["fulfillmentStatus"];
      readonly to: OrderSnapshot["fulfillmentStatus"];
    };

export class KernelState {
  private readonly levels = new Map<string, CanonicalInventoryLevel>();
  private readonly reservations = new Map<string, InventoryReservation>();
  private readonly carts = new Map<string, Cart>();
  private readonly checkoutSessions = new Map<string, CheckoutSession>();
  private readonly orders = new Map<string, OrderSnapshot>();
  private readonly payments = new Map<string, PaymentIntent>();
  private readonly transfers = new Map<string, StockTransfer>();
  private readonly purchaseOrders = new Map<string, PurchaseOrder>();
  private readonly fulfillments = new Map<string, FulfillmentOrder>();
  private readonly shipments = new Map<string, Shipment>();
  private readonly shipmentByFulfillment = new Map<string, string>();
  private readonly fulfillmentByOrder = new Map<string, FulfillmentOrder>();
  private readonly returns = new Map<string, ReturnAuthorization>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly listings = new Map<string, ResaleListing>();
  private readonly rentals = new Map<string, RentalAgreement>();
  private readonly consignments = new Map<string, ConsignmentAgreement>();
  private readonly policies = new Map<string, AutonomousStorePolicy>();
  private readonly reconciliationRecords = new Map<string, ReconciliationRecord>();
  /** W1-004 recourse/payment-plane collections (captures, settlements, disputes, chargebacks, refunds). */
  private readonly recourse = new KernelRecourseFold();
  /** W1-004 autonomous-store cash-session collections (sessions, variances). */
  private readonly storeOps = new KernelStoreOpsFold();

  /** Fold one immutable fact into state. Pure with respect to inputs. */
  apply(event: AnyCommerceEvent): void {
    const id = event.subject.subjectId;
    switch (event.subject.subjectType) {
      case "INVENTORY_LEVEL":
        this.foldInventory(event);
        return;
      case "ORDER":
        this.foldOrder(event);
        return;
      case "CART":
        this.setCart(event.payload as { cart?: Cart });
        return;
      case "CHECKOUT_SESSION":
        this.setSession(event.payload as { session?: CheckoutSession });
        return;
      case "PAYMENT":
        this.foldPayment(event, id);
        this.recourse.apply(event);
        return;
      case "DISPUTE":
      case "CHARGEBACK":
        this.recourse.apply(event);
        return;
      case "STORE_CASH_SESSION":
      case "CASH_VARIANCE_RECORD":
        this.storeOps.apply(event);
        return;
      case "STOCK_TRANSFER":
        this.setTransfer(event.payload as { transfer?: StockTransfer });
        return;
      case "PURCHASE_ORDER":
        this.setPurchaseOrder(event.payload as { purchaseOrder?: PurchaseOrder });
        return;
      case "FULFILLMENT_ORDER":
        this.foldFulfillment(event, event.payload as { fulfillment?: FulfillmentOrder });
        return;
      case "SHIPMENT":
        this.setShipment(event.payload as { shipment?: Shipment });
        return;
      case "RETURN":
        this.setReturn(event.payload as { authorization?: ReturnAuthorization });
        return;
      case "SUBSCRIPTION":
        this.setSubscription(event.payload as { subscription?: Subscription });
        return;
      case "RESALE_LISTING":
        this.setListing(event.payload as { listing?: ResaleListing });
        return;
      case "RENTAL_AGREEMENT":
        this.setRental(event.payload as { rental?: RentalAgreement });
        return;
      case "CONSIGNMENT":
        this.setConsignment(event.payload as { consignment?: ConsignmentAgreement });
        return;
      case "AUTONOMOUS_STORE_POLICY":
        this.setPolicy(event.payload as { policy?: AutonomousStorePolicy });
        return;
      case "RECONCILIATION_RECORD":
        this.setReconciliationRecord(event.payload as { record?: ReconciliationRecord });
        return;
      default:
        return;
    }
  }

  // --- folds ---

  private foldInventory(event: AnyCommerceEvent): void {
    const payload = event.payload as {
      skuId?: SkuId;
      locationId?: LocationId;
      units?: number;
      reservationId?: string;
      resultingLevel?: CanonicalInventoryLevel;
      kind?: string;
    };
    if (payload.resultingLevel) {
      this.levels.set(inventoryKey(payload.resultingLevel.skuId, payload.resultingLevel.locationId), payload.resultingLevel);
    }
    if (!payload.reservationId || !payload.kind) return;
    const existing = this.reservations.get(payload.reservationId);
    if (payload.kind === "INVENTORY_RESERVED" && !existing) {
      this.reservations.set(payload.reservationId, {
        reservationId: payload.reservationId as InventoryReservation["reservationId"],
        skuId: payload.skuId as SkuId,
        locationId: payload.locationId as LocationId,
        units: payload.units ?? 0,
        status: "OPEN",
        revision: 1,
      });
      return;
    }
    if (existing && (payload.kind === "INVENTORY_RESERVATION_COMMITTED" || payload.kind === "INVENTORY_RESERVATION_RELEASED")) {
      this.reservations.set(payload.reservationId, {
        ...existing,
        status: payload.kind === "INVENTORY_RESERVATION_COMMITTED" ? "COMMITTED" : "RELEASED",
        revision: nextRevision(existing.revision),
      });
    }
  }

  /** Mirrors the domain orderProjection exactly. */
  private foldOrder(event: AnyCommerceEvent): void {
    const payload = event.payload as OrderEventPayloadLike;
    if (payload.kind === "ORDER_PLACED") {
      this.orders.set(event.subject.subjectId, payload.snapshot);
      return;
    }
    const current = this.orders.get(event.subject.subjectId);
    if (!current) return;
    const revision = nextRevision(current.revision);
    if (payload.kind === "ORDER_STATE_CHANGED") {
      this.orders.set(event.subject.subjectId, { ...current, state: payload.to, revision });
    } else if (payload.kind === "ORDER_PAYMENT_STATUS_CHANGED") {
      this.orders.set(event.subject.subjectId, { ...current, paymentStatus: payload.to, revision });
    } else if (payload.kind === "ORDER_FULFILLMENT_STATUS_CHANGED") {
      this.orders.set(event.subject.subjectId, { ...current, fulfillmentStatus: payload.to, revision });
    }
  }

  private foldPayment(event: AnyCommerceEvent, paymentId: string): void {
    const payload = event.payload as { intent?: PaymentIntent };
    if (payload.intent) this.payments.set(paymentId, payload.intent);
  }

  private foldFulfillment(event: AnyCommerceEvent, payload: { fulfillment?: FulfillmentOrder; shipment?: Shipment }): void {
    if (payload.fulfillment) {
      this.fulfillments.set(event.subject.subjectId, payload.fulfillment);
      this.fulfillmentByOrder.set(payload.fulfillment.orderId, payload.fulfillment);
    }
    if (payload.fulfillment && payload.shipment) {
      this.shipmentByFulfillment.set(payload.fulfillment.fulfillmentOrderId, payload.shipment.shipmentId);
      this.shipments.set(payload.shipment.shipmentId, payload.shipment);
    }
  }

  private setCart(payload: { cart?: Cart }): void {
    if (payload.cart) this.carts.set(payload.cart.cartId, payload.cart);
  }

  private setSession(payload: { session?: CheckoutSession }): void {
    if (payload.session) this.checkoutSessions.set(payload.session.checkoutSessionId, payload.session);
  }

  private setTransfer(payload: { transfer?: StockTransfer }): void {
    if (payload.transfer) this.transfers.set(payload.transfer.transferId, payload.transfer);
  }

  private setPurchaseOrder(payload: { purchaseOrder?: PurchaseOrder }): void {
    if (payload.purchaseOrder) this.purchaseOrders.set(payload.purchaseOrder.purchaseOrderId, payload.purchaseOrder);
  }

  private setShipment(payload: { shipment?: Shipment }): void {
    if (payload.shipment) this.shipments.set(payload.shipment.shipmentId, payload.shipment);
  }

  private setReturn(payload: { authorization?: ReturnAuthorization }): void {
    if (payload.authorization) this.returns.set(payload.authorization.returnId, payload.authorization);
  }

  private setSubscription(payload: { subscription?: Subscription }): void {
    if (payload.subscription) this.subscriptions.set(payload.subscription.subscriptionId, payload.subscription);
  }

  private setListing(payload: { listing?: ResaleListing }): void {
    if (payload.listing) this.listings.set(payload.listing.listingId, payload.listing);
  }

  private setRental(payload: { rental?: RentalAgreement }): void {
    if (payload.rental) this.rentals.set(payload.rental.rentalAgreementId, payload.rental);
  }

  private setConsignment(payload: { consignment?: ConsignmentAgreement }): void {
    if (payload.consignment) this.consignments.set(payload.consignment.consignmentId, payload.consignment);
  }

  private setPolicy(payload: { policy?: AutonomousStorePolicy }): void {
    if (payload.policy) this.policies.set(payload.policy.autonomousStoreId, payload.policy);
  }

  private setReconciliationRecord(payload: { record?: ReconciliationRecord }): void {
    if (payload.record) this.reconciliationRecords.set(payload.record.reconciliationRecordId, payload.record);
  }

  // --- read accessors (handlers/tests) ---

  level(skuId: SkuId, locationId: LocationId): CanonicalInventoryLevel | undefined {
    return this.levels.get(inventoryKey(skuId, locationId));
  }
  allLevels(): readonly CanonicalInventoryLevel[] {
    return [...this.levels.values()].sort(byKey);
  }
  reservation(reservationId: string): InventoryReservation | undefined {
    return this.reservations.get(reservationId);
  }
  allReservations(): readonly InventoryReservation[] {
    return [...this.reservations.values()].sort(byKey);
  }
  cart(cartId: string): Cart | undefined {
    return this.carts.get(cartId);
  }
  allCarts(): readonly Cart[] {
    return [...this.carts.values()].sort(byKey);
  }
  checkoutSession(checkoutSessionId: string): CheckoutSession | undefined {
    return this.checkoutSessions.get(checkoutSessionId);
  }
  allCheckoutSessions(): readonly CheckoutSession[] {
    return [...this.checkoutSessions.values()].sort(byKey);
  }
  order(orderId: string): OrderSnapshot | undefined {
    return this.orders.get(orderId);
  }
  allOrders(): readonly OrderSnapshot[] {
    return [...this.orders.values()].sort(byKey);
  }
  paymentIntent(paymentId: string): PaymentIntent | undefined {
    return this.payments.get(paymentId);
  }
  allPaymentIntents(): readonly PaymentIntent[] {
    return [...this.payments.values()].sort(byKey);
  }
  transfer(transferId: string): StockTransfer | undefined {
    return this.transfers.get(transferId);
  }
  allTransfers(): readonly StockTransfer[] {
    return [...this.transfers.values()].sort(byKey);
  }
  purchaseOrder(purchaseOrderId: string): PurchaseOrder | undefined {
    return this.purchaseOrders.get(purchaseOrderId);
  }
  allPurchaseOrders(): readonly PurchaseOrder[] {
    return [...this.purchaseOrders.values()].sort(byKey);
  }
  fulfillmentOrder(fulfillmentOrderId: string): FulfillmentOrder | undefined {
    return this.fulfillments.get(fulfillmentOrderId);
  }
  fulfillmentForOrder(orderId: string): FulfillmentOrder | undefined {
    return this.fulfillmentByOrder.get(orderId);
  }
  shipmentIdForFulfillment(fulfillmentOrderId: string): string | undefined {
    return this.shipmentByFulfillment.get(fulfillmentOrderId);
  }
  allFulfillments(): readonly FulfillmentOrder[] {
    return [...this.fulfillments.values()].sort(byKey);
  }
  shipment(shipmentId: string): Shipment | undefined {
    return this.shipments.get(shipmentId);
  }
  allShipments(): readonly Shipment[] {
    return [...this.shipments.values()].sort(byKey);
  }
  returnAuthorization(returnId: string): ReturnAuthorization | undefined {
    return this.returns.get(returnId);
  }
  allReturns(): readonly ReturnAuthorization[] {
    return [...this.returns.values()].sort(byKey);
  }
  refund(refundId: string): RefundRecord | undefined { return this.recourse.refund(refundId); }
  allRefunds(): readonly RefundRecord[] { return this.recourse.allRefunds(); }
  capture(captureId: string): PaymentCaptureRecord | undefined { return this.recourse.capture(captureId); }
  allCaptures(): readonly PaymentCaptureRecord[] { return this.recourse.allCaptures(); }
  capturesFor(paymentId: string): readonly PaymentCaptureRecord[] { return this.recourse.capturesFor(paymentId); }
  capturedTotalFor(paymentId: string): bigint { return this.recourse.capturedTotalFor(paymentId); }
  refundedTotalFor(paymentId: string): bigint { return this.recourse.refundedTotalFor(paymentId); }
  settlementRecord(paymentId: string): SettlementRecord | undefined { return this.recourse.settlement(paymentId); }
  allSettlements(): readonly SettlementRecord[] { return this.recourse.allSettlements(); }
  dispute(disputeId: string): DisputeRecord | undefined { return this.recourse.dispute(disputeId); }
  allDisputes(): readonly DisputeRecord[] { return this.recourse.allDisputes(); }
  chargeback(chargebackId: string): ChargebackRecord | undefined { return this.recourse.chargeback(chargebackId); }
  allChargebacks(): readonly ChargebackRecord[] { return this.recourse.allChargebacks(); }
  storeSession(sessionId: string): StoreCashSession | undefined { return this.storeOps.storeSession(sessionId); }
  allStoreSessions(): readonly StoreCashSession[] { return this.storeOps.allStoreSessions(); }
  openStoreSessionFor(storeId: string, tillId: string): StoreCashSession | undefined { return this.storeOps.openSessionFor(storeId, tillId); }
  cashVariance(varianceId: string): CashVarianceRecord | undefined { return this.storeOps.cashVariance(varianceId); }
  allCashVariances(): readonly CashVarianceRecord[] { return this.storeOps.allCashVariances(); }
  subscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }
  allSubscriptions(): readonly Subscription[] {
    return [...this.subscriptions.values()].sort(byKey);
  }
  listing(listingId: string): ResaleListing | undefined {
    return this.listings.get(listingId);
  }
  allListings(): readonly ResaleListing[] {
    return [...this.listings.values()].sort(byKey);
  }
  rental(rentalAgreementId: string): RentalAgreement | undefined {
    return this.rentals.get(rentalAgreementId);
  }
  allRentals(): readonly RentalAgreement[] {
    return [...this.rentals.values()].sort(byKey);
  }
  consignment(consignmentId: string): ConsignmentAgreement | undefined {
    return this.consignments.get(consignmentId);
  }
  allConsignments(): readonly ConsignmentAgreement[] {
    return [...this.consignments.values()].sort(byKey);
  }
  policyFor(autonomousStoreId: string): AutonomousStorePolicy | undefined {
    return this.policies.get(autonomousStoreId);
  }
  allPolicies(): readonly AutonomousStorePolicy[] {
    return [...this.policies.values()].sort(byKey);
  }
  reconciliationRecord(recordId: string): ReconciliationRecord | undefined {
    return this.reconciliationRecords.get(recordId);
  }
  allReconciliationRecords(): readonly ReconciliationRecord[] {
    return [...this.reconciliationRecords.values()].sort(byKey);
  }
}

function byKey(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
