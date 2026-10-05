/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY FUZZ SUPPORT — NEVER PRODUCTION CODE.                    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic randomized command-sequence generator for the twin
 * verification harness (W1-003 acceptance scenario 1). A seeded PRNG
 * (mulberry32 — no Math.random, reproducible failures) drives a weighted
 * vocabulary spanning the whole kernel command surface, including
 * intentionally conflicting and invalid submissions (rejections must fold to
 * zero events — the twin must still equal the kernel), duplicate idempotent
 * resubmissions and concurrent batches.
 */
import {
  commandEnvelope,
  countQuantity,
  currency,
  makeId,
  measuredQuantity,
  money,
  unitOfMeasure,
  type AnyRuntimeCommand,
  type CommandId,
  type CommerceKernel,
  type IdempotencyKey,
  type PrincipalRef,
  type RuntimeCommandPayload,
  // Trigger unions for the intentional-invalidity fuzz casts below (the
  // fuzz vocabulary DELIBERATELY mixes invalid triggers — the kernel must
  // fold them to zero events; the casts acknowledge the violation).
  type CheckoutTrigger,
  type OrderTrigger,
  type ShipmentTrigger,
  type DeliveryObservation,
  type PurchaseOrderTrigger,
  type ReturnTrigger,
  type SubscriptionTrigger,
  type ListingTrigger,
  type RentalTrigger,
} from "../../../contract.js";

/** Deterministic PRNG (mulberry32): identical seed → identical sequence. */
export class FuzzRng {
  private state: number;
  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }
  /** Uniform uint32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Uniform integer in [0, n). */
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }
  /** Uniform pick. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }
  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() / 0x100000000 < p;
  }
}

const usd = currency("USD");

export const FUZZ_SKUS = ["sku-tote", "sku-bananas", "sku-drill", "sku-jacket"] as const;
export const FUZZ_LOCATIONS = ["loc-warehouse-1", "loc-store-b"] as const;
export const FUZZ_MERCHANTS = ["merchant-1", "merchant-2"] as const;

function skuId(n: number) {
  return makeId<"SkuId">(FUZZ_SKUS[n % FUZZ_SKUS.length] as string);
}
function locationId(n: number) {
  return makeId<"LocationId">(FUZZ_LOCATIONS[n % FUZZ_LOCATIONS.length] as string);
}

export const FUZZ_ACTORS: readonly PrincipalRef[] = [
  { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
  { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-1") },
  { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") },
];

export interface FuzzEnvelope {
  readonly envelope: AnyRuntimeCommand;
  readonly tag: "fresh" | "duplicate" | "conflict";
}

/** Deterministic envelope minting (unique command ids per fuzz run). */
export class FuzzCommandSource {
  private counter = 0;
  private readonly executed: AnyRuntimeCommand[] = [];
  constructor(private readonly rng: FuzzRng) {}

  /** Record an executed envelope as eligible for duplicate/conflict replay. */
  observeExecuted(envelope: AnyRuntimeCommand): void {
    this.executed.push(envelope);
  }

  /** Generate the next envelope: mostly fresh, sometimes duplicate/conflict. */
  next(kernel: CommerceKernel): FuzzEnvelope {
    if (this.executed.length > 0 && this.rng.chance(0.08)) {
      const original = this.rng.pick(this.executed);
      if (this.rng.chance(0.5)) {
        // Exact replay: same command id + idempotency key → DUPLICATE.
        return { envelope: original, tag: "duplicate" };
      }
      // Same key, DIFFERENT command id → hard idempotency conflict.
      this.counter += 1;
      return {
        envelope: commandEnvelope(
          makeId<"CommandId">(`cmd-fuzz-conflict-${this.counter}`),
          original.idempotencyKey,
          this.rng.pick(FUZZ_ACTORS),
          "2026-10-05T00:00:00Z",
          original.payload,
        ),
        tag: "conflict",
      };
    }
    this.counter += 1;
    const payload = this.generatePayload(kernel);
    return {
      envelope: commandEnvelope(
        makeId<"CommandId">(`cmd-fuzz-${this.counter}`),
        makeId<"IdempotencyKey">(`idem-fuzz-${this.counter}`),
        this.rng.pick(FUZZ_ACTORS),
        "2026-10-05T00:00:00Z",
        payload,
      ),
      tag: "fresh",
    };
  }

  private generatePayload(kernel: CommerceKernel): RuntimeCommandPayload {
    const view = kernel.view();
    const type = this.weightedType();
    switch (type) {
      case "RECEIVE_STOCK":
        return { type, skuId: skuId(this.rng.int(4)), locationId: locationId(this.rng.int(2)), units: 1 + this.rng.int(9), reason: "RECEIVING" };
      case "ADJUST_INVENTORY":
        return { type, skuId: skuId(this.rng.int(4)), locationId: locationId(this.rng.int(2)), deltaUnits: this.rng.int(7) - 3, reason: "MANUAL" };
      case "RESERVE_INVENTORY":
        return {
          type,
          reservation: {
            reservationId: makeId<"ReservationId">(`res-fuzz-${(this.counter += 1)}`),
            skuId: skuId(this.rng.int(4)),
            locationId: locationId(this.rng.int(2)),
            units: 1 + this.rng.int(3),
            status: "OPEN",
            revision: 1,
          },
        };
      case "COMMIT_RESERVATION":
      case "RELEASE_RESERVATION": {
        const candidates = view.allReservations().filter((item) => item.status === "OPEN");
        const reservationId = candidates.length > 0 ? this.rng.pick(candidates).reservationId : makeId<"ReservationId">("res-missing");
        return { type, reservationId };
      }
      case "ADD_CART_LINE": {
        const carts = view.allCarts();
        const cartId = carts.length > 0 && this.rng.chance(0.75) ? this.rng.pick(carts).cartId : makeId<"CartId">(`cart-fuzz-${(this.counter += 1)}`);
        const measured = this.rng.chance(0.3);
        return {
          type,
          cartId,
          skuId: skuId(this.rng.int(4)),
          quantity: measured
            ? measuredQuantity(`${(1 + this.rng.int(900)) / 100}`, unitOfMeasure("KG"))
            : countQuantity(1 + this.rng.int(4)),
          unitPrice: money(`${100 + this.rng.int(2000)}`, usd),
        };
      }
      case "REMOVE_CART_LINE": {
        const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
        if (carts.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(0), units: 3, reason: "RECEIVING" };
        const cart = this.rng.pick(carts);
        return { type, cartId: cart.cartId, lineId: this.rng.pick(cart.lines).lineId };
      }
      case "OPEN_CHECKOUT": {
        const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
        if (carts.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(1), locationId: locationId(1), units: 5, reason: "RECEIVING" };
        return { type, cartId: this.rng.pick(carts).cartId };
      }
      case "ADVANCE_CHECKOUT": {
        const sessions = view.allCheckoutSessions().filter((session) => session.state !== "COMPLETED" && session.state !== "ABANDONED");
        if (sessions.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(2), locationId: locationId(0), units: 2, reason: "RECEIVING" };
        return { type, checkoutSessionId: this.rng.pick(sessions).checkoutSessionId, trigger: this.rng.pick(["CONFIRM", "ABANDON"] as const) as CheckoutTrigger };
      }
      case "PLACE_ORDER": {
        const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
        if (carts.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(3), locationId: locationId(1), units: 4, reason: "RECEIVING" };
        return { type, cartId: this.rng.pick(carts).cartId, merchantId: makeId<"MerchantId">(this.rng.pick(FUZZ_MERCHANTS)) };
      }
      case "CANCEL_ORDER":
      case "ADVANCE_ORDER": {
        const orders = view.allOrders().filter((order) => order.state !== "COMPLETED" && order.state !== "CANCELLED");
        if (orders.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(1), units: 6, reason: "RECEIVING" };
        const orderId = this.rng.pick(orders).orderId;
        return type === "CANCEL_ORDER"
          ? { type, orderId }
          : { type, orderId, trigger: this.rng.pick(["SHIP", "ORDER_COMPLETED"] as const) as OrderTrigger };
      }
      case "CREATE_PAYMENT_INTENT": {
        const unpaid = view.allOrders().filter((order) => order.paymentStatus === "NOT_PAID" || order.paymentStatus === "AUTHORIZED");
        const order = unpaid.length > 0 ? this.rng.pick(unpaid) : undefined;
        return {
          type,
          request: {
            amount: money(order ? order.totals.grandTotal.amountMinor : `${100 + this.rng.int(500)}`, usd),
            reference: { kind: "ORDER", orderId: order ? order.orderId : makeId<"OrderId">("order-missing") },
            method: { methodKind: "CARD", tokenRef: `tok-fuzz-${this.rng.int(1000)}` },
          },
        };
      }
      case "CAPTURE_PAYMENT":
      case "VOID_PAYMENT": {
        const intents = view.allPaymentIntents();
        const paymentId = intents.length > 0 ? this.rng.pick(intents).paymentId : makeId<"PaymentId">("pay-missing");
        return { type, paymentId };
      }
      case "REFUND_PAYMENT": {
        const captured = view.allPaymentIntents().filter((intent) => intent.status === "CAPTURED" || intent.status === "PARTIALLY_REFUNDED");
        if (captured.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(1), locationId: locationId(0), units: 3, reason: "RECEIVING" };
        const intent = this.rng.pick(captured);
        const minor = Number(intent.amount.amountMinor);
        return { type, paymentId: intent.paymentId, amount: money(`${Math.max(1, Math.floor(minor / 2))}`, usd) };
      }
      case "OPEN_FULFILLMENT": {
        const paid = view.allOrders().filter((order) => order.state === "PAID");
        if (paid.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(2), locationId: locationId(1), units: 2, reason: "RECEIVING" };
        const order = this.rng.pick(paid);
        return { type, orderId: order.orderId, originLocationId: locationId(this.rng.int(2)) };
      }
      case "ADVANCE_FULFILLMENT_ORDER": {
        const fulfillments = view.allFulfillments();
        if (fulfillments.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(0), units: 1, reason: "RECEIVING" };
        return {
          type,
          fulfillmentOrderId: this.rng.pick(fulfillments).fulfillmentOrderId,
          trigger: this.rng.pick(["PACK", "TENDER", "CONFIRM_DELIVERY", "ATTEMPT_DELIVERY"] as const) as ShipmentTrigger,
        };
      }
      case "APPLY_DELIVERY_OBSERVATION": {
        const shipments = view.allShipments();
        if (shipments.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(1), locationId: locationId(1), units: 7, reason: "RECEIVING" };
        const shipment = this.rng.pick(shipments);
        const resolution = this.rng.int(3);
        return {
          type,
          // extra fields (observationId/source) are deliberately beyond the
          // DeliveryObservation contract — the kernel must ignore them; the
          // cast acknowledges the intentional excess (fuzz semantics).
          observation: {
            observationId: makeId<"ObservationId">(`obs-fuzz-${(this.counter += 1)}`),
            shipmentId: shipment.shipmentId,
            observedAt: "2026-10-05T00:00:00Z",
            source: { sourceType: "CARRIER", sourceRef: "carrier-fuzz" },
            resolution:
              (resolution === 0
                ? { resolved: "OBSERVED", value: "DELIVERED" as const }
                : resolution === 1
                  ? { resolved: "UNKNOWN", reason: "AMBIGUOUS" as const, providerNativeStatus: "SCAN_UNCLEAR" }
                  : { resolved: "FAILED", error: "carrier API error" }) as DeliveryObservation["resolution"],
          } as DeliveryObservation,
        };
      }
      case "OPEN_TRANSFER": {
        return {
          type,
          transfer: {
            transferId: makeId<"TransferId">(`tr-fuzz-${(this.counter += 1)}`),
            fromLocationId: locationId(0),
            toLocationId: locationId(1),
            lines: [{ skuId: skuId(this.rng.int(4)), units: 1 + this.rng.int(2) }],
            state: "REQUESTED",
            revision: 1,
          },
        };
      }
      case "ADVANCE_TRANSFER": {
        const transfers = view.allTransfers().filter((transfer) => transfer.state === "REQUESTED" || transfer.state === "DISPATCHED");
        if (transfers.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(2), locationId: locationId(0), units: 8, reason: "RECEIVING" };
        return {
          type,
          transferId: this.rng.pick(transfers).transferId,
          trigger: this.rng.pick(["DISPATCH", "CONFIRM_RECEIPT", "CANCEL_REQUEST"] as const),
        };
      }
      case "OPEN_PURCHASE_ORDER": {
        return {
          type,
          purchaseOrder: {
            purchaseOrderId: makeId<"PurchaseOrderId">(`po-fuzz-${(this.counter += 1)}`),
            supplierId: makeId<"SupplierId">("sup-fuzz"),
            destinationLocationId: locationId(this.rng.int(2)),
            lines: [{ skuId: skuId(this.rng.int(4)), orderedUnits: 10 + this.rng.int(10), receivedUnits: 0 }],
            state: "DRAFT",
            revision: 1,
          },
        };
      }
      case "ADVANCE_PURCHASE_ORDER":
      case "RECEIVE_PURCHASE_ORDER": {
        const orders = view.allPurchaseOrders().filter((po) => po.state === "DRAFT" || po.state === "SUBMITTED" || po.state === "CONFIRMED");
        if (orders.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(3), locationId: locationId(0), units: 5, reason: "RECEIVING" };
        const po = this.rng.pick(orders);
        if (type === "ADVANCE_PURCHASE_ORDER") {
          return { type, purchaseOrderId: po.purchaseOrderId, trigger: this.rng.pick(["SUBMIT", "CONFIRM"] as const) as PurchaseOrderTrigger };
        }
        const line = po.lines[0];
        return {
          type,
          purchaseOrderId: po.purchaseOrderId,
          lines: [{ skuId: line?.skuId ?? skuId(0), units: 1 + this.rng.int(3) }],
        };
      }
      case "RECONCILE_COUNT_OBSERVATION": {
        const sku = skuId(this.rng.int(4));
        const location = locationId(this.rng.int(2));
        const resolution = this.rng.int(4);
        return {
          type,
          observation: {
            observationId: makeId<"ObservationId">(`obs-count-${(this.counter += 1)}`),
            kind: this.rng.pick(["CYCLE_COUNT", "BARCODE_COUNT", "EMPLOYEE_COUNT", "VISUAL_ESTIMATE", "SUPPLIER_REPORT"] as const),
            skuId: sku,
            locationId: location,
            observedAt: "2026-10-05T00:00:00Z",
            source: { sourceType: "SCANNER", sourceRef: "scanner-fuzz" },
            resolution:
              resolution === 0
                ? { resolved: "UNKNOWN", reason: "AMBIGUOUS" as const, providerNativeStatus: "COUNT_UNCLEAR" }
                : resolution === 1
                  ? { resolved: "FAILED", error: "scanner offline" }
                  : { resolved: "OBSERVED", value: this.rng.int(30) },
          },
          policy: { toleranceUnits: this.rng.int(3), promoteWithinTolerance: true },
        };
      }
      case "RECONCILE_POS_SYNC": {
        return {
          type,
          observation: {
            observationId: makeId<"ObservationId">(`obs-pos-${(this.counter += 1)}`),
            kind: "POS_SYNC",
            skuId: skuId(this.rng.int(4)),
            locationId: locationId(this.rng.int(2)),
            observedAt: "2026-10-05T00:00:00Z",
            source: { sourceType: "POS", sourceRef: "pos-fuzz" },
            resolution: this.rng.chance(0.2)
              ? { resolved: "UNKNOWN", reason: "PROVIDER_UNAVAILABLE" as const, providerNativeStatus: "POS_SYNC_PENDING" }
              : { resolved: "OBSERVED", value: { unitsSold: this.rng.int(5) } },
          },
        };
      }
      case "REQUEST_RETURN":
      case "OPEN_RETURN": {
        const orders = view.allOrders().filter((order) => order.state !== "PENDING");
        if (orders.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(1), units: 9, reason: "RECEIVING" };
        const order = this.rng.pick(orders);
        if (type === "REQUEST_RETURN") return { type, orderId: order.orderId };
        return {
          type,
          orderId: order.orderId,
          resolution: this.rng.pick(["REFUND", "EXCHANGE", "STORE_CREDIT"] as const),
          lines: [{ skuId: skuId(this.rng.int(4)), quantity: countQuantity(1), reason: "CUSTOMER_REMORSE" }],
        };
      }
      case "ADVANCE_RETURN": {
        const returns = view.allReturns().filter((item) => item.state !== "RESOLVED");
        if (returns.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(1), locationId: locationId(1), units: 2, reason: "RECEIVING" };
        return { type, returnId: this.rng.pick(returns).returnId, trigger: this.rng.pick(["AUTHORIZE", "RECEIVE", "CLOSE"] as const) as ReturnTrigger };
      }
      case "OPEN_SUBSCRIPTION":
        return {
          type,
          subscription: {
            subscriptionId: makeId<"SubscriptionId">(`sub-fuzz-${(this.counter += 1)}`),
            customerId: makeId<"CustomerId">("customer-fuzz"),
            planId: makeId<"SubscriptionPlanId">("plan-fuzz"),
            state: "PENDING",
            revision: 1,
          },
        };
      case "ADVANCE_SUBSCRIPTION": {
        const subs = view.allSubscriptions().filter((sub) => sub.state !== "CANCELLED" && sub.state !== "EXPIRED");
        if (subs.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(2), locationId: locationId(0), units: 3, reason: "RECEIVING" };
        return { type, subscriptionId: this.rng.pick(subs).subscriptionId, trigger: this.rng.pick(["ACTIVATE", "CANCEL", "RENEW"] as const) as SubscriptionTrigger };
      }
      case "OPEN_LISTING":
        return {
          type,
          listing: {
            listingId: makeId<"ResaleListingId">(`list-fuzz-${(this.counter += 1)}`),
            sellerRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
            skuRef: skuId(this.rng.int(4)),
            itemCondition: this.rng.pick(["NEW", "GOOD", "FAIR"] as const),
            askingPrice: money(`${500 + this.rng.int(5000)}`, usd),
            state: "DRAFT",
            revision: 1,
          },
        };
      case "ADVANCE_LISTING": {
        const listings = view.allListings().filter((listing) => listing.state !== "SOLD" && listing.state !== "ENDED");
        if (listings.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(3), locationId: locationId(1), units: 4, reason: "RECEIVING" };
        return { type, listingId: this.rng.pick(listings).listingId, trigger: this.rng.pick(["PUBLISH", "WITHDRAW"] as const) as ListingTrigger };
      }
      case "OPEN_RENTAL":
        return {
          type,
          rental: {
            rentalAgreementId: makeId<"RentalAgreementId">(`rent-fuzz-${(this.counter += 1)}`),
            itemSkuRef: skuId(this.rng.int(4)),
            renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
            period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
            ratePerPeriod: money("2500", usd),
            deposit: money("10000", usd),
            state: "REQUESTED",
            revision: 1,
          },
        };
      case "ADVANCE_RENTAL": {
        const rentals = view.allRentals().filter((rental) => rental.state !== "RETURNED" && rental.state !== "CANCELLED");
        if (rentals.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(0), units: 2, reason: "RECEIVING" };
        return { type, rentalAgreementId: this.rng.pick(rentals).rentalAgreementId, trigger: this.rng.pick(["START", "END", "CANCEL"] as const) as RentalTrigger };
      }
      case "OPEN_CONSIGNMENT":
        return {
          type,
          consignment: {
            consignmentId: makeId<"ConsignmentId">(`cons-fuzz-${(this.counter += 1)}`),
            consignorRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
            consignorShareBps: 5_000,
            state: "PROPOSED",
            revision: 1,
          },
        };
      case "ADVANCE_CONSIGNMENT": {
        const consignments = view.allConsignments().filter((item) => item.state !== "TERMINATED");
        if (consignments.length === 0) return { type: "RECEIVE_STOCK", skuId: skuId(1), locationId: locationId(0), units: 6, reason: "RECEIVING" };
        return { type, consignmentId: this.rng.pick(consignments).consignmentId, trigger: this.rng.pick(["ACCEPT", "TERMINATE"] as const) };
      }
      default:
        return { type: "RECEIVE_STOCK", skuId: skuId(0), locationId: locationId(0), units: 1, reason: "RECEIVING" };
    }
  }

  private weightedType(): string {
    const table: readonly (readonly [string, number])[] = [
      ["RECEIVE_STOCK", 12],
      ["ADJUST_INVENTORY", 8],
      ["RESERVE_INVENTORY", 8],
      ["COMMIT_RESERVATION", 5],
      ["RELEASE_RESERVATION", 3],
      ["ADD_CART_LINE", 10],
      ["REMOVE_CART_LINE", 3],
      ["OPEN_CHECKOUT", 4],
      ["ADVANCE_CHECKOUT", 3],
      ["PLACE_ORDER", 8],
      ["CANCEL_ORDER", 3],
      ["ADVANCE_ORDER", 4],
      ["CREATE_PAYMENT_INTENT", 6],
      ["CAPTURE_PAYMENT", 5],
      ["VOID_PAYMENT", 2],
      ["REFUND_PAYMENT", 3],
      ["OPEN_FULFILLMENT", 3],
      ["ADVANCE_FULFILLMENT_ORDER", 5],
      ["APPLY_DELIVERY_OBSERVATION", 4],
      ["OPEN_TRANSFER", 4],
      ["ADVANCE_TRANSFER", 5],
      ["OPEN_PURCHASE_ORDER", 4],
      ["ADVANCE_PURCHASE_ORDER", 3],
      ["RECEIVE_PURCHASE_ORDER", 4],
      ["RECONCILE_COUNT_OBSERVATION", 6],
      ["RECONCILE_POS_SYNC", 4],
      ["REQUEST_RETURN", 3],
      ["OPEN_RETURN", 3],
      ["ADVANCE_RETURN", 4],
      ["OPEN_SUBSCRIPTION", 3],
      ["ADVANCE_SUBSCRIPTION", 3],
      ["OPEN_LISTING", 3],
      ["ADVANCE_LISTING", 3],
      ["OPEN_RENTAL", 3],
      ["ADVANCE_RENTAL", 3],
      ["OPEN_CONSIGNMENT", 3],
      ["ADVANCE_CONSIGNMENT", 3],
    ];
    const total = table.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.rng.next() % total;
    for (const [type, weight] of table) {
      roll -= weight;
      if (roll < 0) return type;
    }
    return "RECEIVE_STOCK";
  }
}
