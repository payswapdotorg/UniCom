/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY FUZZ SUPPORT — NEVER PRODUCTION CODE.                    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic randomized payload generator for the twin verification
 * harness (W1-003 acceptance scenario 1). A seeded PRNG drives a weighted
 * vocabulary spanning the whole kernel command surface — including
 * intentionally invalid transitions (rejections fold to zero events, and the
 * twin must still equal the kernel).
 */
import {
  countQuantity,
  currency,
  makeId,
  measuredQuantity,
  money,
  unitOfMeasure,
  type CommerceKernel,
  type RuntimeCommandPayload,
} from "../../../contract.js";
import type { FuzzRng } from "./rng.js";

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

function receiveStock(skuIndex: number, locationIndex: number, units: number): RuntimeCommandPayload {
  return { type: "RECEIVE_STOCK", skuId: skuId(skuIndex), locationId: locationId(locationIndex), units, reason: "RECEIVING" };
}

/** Generate one randomized payload (uses kernel state for mostly-valid targets). */
export function generatePayload(rng: FuzzRng, kernel: CommerceKernel, mint: () => number): RuntimeCommandPayload {
  const view = kernel.view();
  const type = weightedType(rng);
  switch (type) {
    case "RECEIVE_STOCK":
      return { type, skuId: skuId(rng.int(4)), locationId: locationId(rng.int(2)), units: 1 + rng.int(9), reason: "RECEIVING" };
    case "ADJUST_INVENTORY":
      return { type, skuId: skuId(rng.int(4)), locationId: locationId(rng.int(2)), deltaUnits: rng.int(7) - 3, reason: "MANUAL" };
    case "RESERVE_INVENTORY":
      return {
        type,
        reservation: {
          reservationId: makeId<"ReservationId">(`res-fuzz-${mint()}`),
          skuId: skuId(rng.int(4)),
          locationId: locationId(rng.int(2)),
          units: 1 + rng.int(3),
          status: "OPEN",
          revision: 1,
        },
      };
    case "COMMIT_RESERVATION":
    case "RELEASE_RESERVATION": {
      const candidates = view.allReservations().filter((item) => item.status === "OPEN");
      const reservationId = candidates.length > 0 ? rng.pick(candidates).reservationId : makeId<"ReservationId">("res-missing");
      return { type, reservationId };
    }
    case "ADD_CART_LINE": {
      const carts = view.allCarts();
      const cartId = carts.length > 0 && rng.chance(0.75) ? rng.pick(carts).cartId : makeId<"CartId">(`cart-fuzz-${mint()}`);
      const measured = rng.chance(0.3);
      return {
        type,
        cartId,
        skuId: skuId(rng.int(4)),
        quantity: measured
          ? measuredQuantity(`${(1 + rng.int(900)) / 100}`, unitOfMeasure("KG"))
          : countQuantity(1 + rng.int(4)),
        unitPrice: money(`${100 + rng.int(2000)}`, usd),
      };
    }
    case "REMOVE_CART_LINE": {
      const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
      if (carts.length === 0) return receiveStock(0, 0, 3);
      const cart = rng.pick(carts);
      return { type, cartId: cart.cartId, lineId: rng.pick(cart.lines).lineId };
    }
    case "OPEN_CHECKOUT": {
      const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
      if (carts.length === 0) return receiveStock(1, 1, 5);
      return { type, cartId: rng.pick(carts).cartId };
    }
    case "ADVANCE_CHECKOUT": {
      const sessions = view.allCheckoutSessions().filter((session) => session.state !== "COMPLETED" && session.state !== "ABANDONED");
      if (sessions.length === 0) return receiveStock(2, 0, 2);
      return { type, checkoutSessionId: rng.pick(sessions).checkoutSessionId, trigger: rng.pick(["COMPLETE", "ABANDON"] as const) };
    }
    case "PLACE_ORDER": {
      const carts = view.allCarts().filter((cart) => cart.lines.length > 0);
      if (carts.length === 0) return receiveStock(3, 1, 4);
      return { type, cartId: rng.pick(carts).cartId, merchantId: makeId<"MerchantId">(rng.pick(FUZZ_MERCHANTS)) };
    }
    case "CANCEL_ORDER":
    case "ADVANCE_ORDER": {
      const orders = view.allOrders().filter((order) => order.state !== "COMPLETED" && order.state !== "CANCELLED");
      if (orders.length === 0) return receiveStock(0, 1, 6);
      const orderId = rng.pick(orders).orderId;
      return type === "CANCEL_ORDER"
        ? { type, orderId }
        : { type, orderId, trigger: rng.pick(["CANCELLED", "ORDER_COMPLETED"] as const) };
    }
    case "CREATE_PAYMENT_INTENT": {
      const unpaid = view.allOrders().filter((order) => order.paymentStatus === "NOT_PAID" || order.paymentStatus === "AUTHORIZED");
      const order = unpaid.length > 0 ? rng.pick(unpaid) : undefined;
      return {
        type,
        request: {
          amount: money(order ? order.totals.grandTotal.amountMinor : `${100 + rng.int(500)}`, usd),
          reference: { kind: "ORDER", orderId: order ? order.orderId : makeId<"OrderId">("order-missing") },
          method: { methodKind: "CARD", tokenRef: `tok-fuzz-${rng.int(1000)}` },
        },
      };
    }
    case "CAPTURE_PAYMENT":
    case "VOID_PAYMENT": {
      const intents = view.allPaymentIntents();
      const paymentId = intents.length > 0 ? rng.pick(intents).paymentId : makeId<"PaymentId">("pay-missing");
      return { type, paymentId };
    }
    case "REFUND_PAYMENT": {
      const captured = view.allPaymentIntents().filter((intent) => intent.status === "CAPTURED" || intent.status === "PARTIALLY_REFUNDED");
      if (captured.length === 0) return receiveStock(1, 0, 3);
      const intent = rng.pick(captured);
      const minor = Number(intent.amount.amountMinor);
      return { type, paymentId: intent.paymentId, amount: money(`${Math.max(1, Math.floor(minor / 2))}`, usd) };
    }
    case "OPEN_FULFILLMENT": {
      const paid = view.allOrders().filter((order) => order.state === "PAID");
      if (paid.length === 0) return receiveStock(2, 1, 2);
      return { type, orderId: rng.pick(paid).orderId, originLocationId: locationId(rng.int(2)) };
    }
    case "ADVANCE_FULFILLMENT_ORDER": {
      const fulfillments = view.allFulfillments();
      if (fulfillments.length === 0) return receiveStock(0, 0, 1);
      return {
        type,
        fulfillmentOrderId: rng.pick(fulfillments).fulfillmentOrderId,
        trigger: rng.pick(["PACK", "TENDER", "CONFIRM_DELIVERY", "FAIL_DELIVERY"] as const),
      };
    }
    case "APPLY_DELIVERY_OBSERVATION": {
      const shipments = view.allShipments();
      if (shipments.length === 0) return receiveStock(1, 1, 7);
      const shipment = rng.pick(shipments);
      const observed = rng.chance(0.5);
      return {
        type,
        observation: {
          shipmentId: shipment.shipmentId,
          observedAt: "2026-10-05T00:00:00Z",
          resolution: observed
            ? { resolved: "OBSERVED", value: rng.pick(["DELIVERED", "ATTEMPTED", "EXCEPTION", "RETURN_SIGNAL"] as const) }
            : { resolved: "UNKNOWN", reason: "AMBIGUOUS", carrierNativeStatus: "SCAN_UNCLEAR" },
        },
      };
    }
    case "OPEN_TRANSFER":
      return {
        type,
        transfer: {
          transferId: makeId<"TransferId">(`tr-fuzz-${mint()}`),
          fromLocationId: locationId(0),
          toLocationId: locationId(1),
          lines: [{ skuId: skuId(rng.int(4)), units: 1 + rng.int(2) }],
          state: "REQUESTED",
          revision: 1,
        },
      };
    case "ADVANCE_TRANSFER": {
      const transfers = view.allTransfers().filter((transfer) => transfer.state === "REQUESTED" || transfer.state === "DISPATCHED");
      if (transfers.length === 0) return receiveStock(2, 0, 8);
      return { type, transferId: rng.pick(transfers).transferId, trigger: rng.pick(["DISPATCH", "CONFIRM_RECEIPT", "CANCEL_REQUEST"] as const) };
    }
    case "OPEN_PURCHASE_ORDER":
      return {
        type,
        purchaseOrder: {
          purchaseOrderId: makeId<"PurchaseOrderId">(`po-fuzz-${mint()}`),
          supplierId: makeId<"SupplierId">("sup-fuzz"),
          destinationLocationId: locationId(rng.int(2)),
          lines: [{ skuId: skuId(rng.int(4)), orderedUnits: 10 + rng.int(10), receivedUnits: 0 }],
          state: "DRAFT",
          revision: 1,
        },
      };
    case "ADVANCE_PURCHASE_ORDER":
    case "RECEIVE_PURCHASE_ORDER": {
      const orders = view.allPurchaseOrders().filter((po) => po.state === "DRAFT" || po.state === "SUBMITTED" || po.state === "CONFIRMED" || po.state === "PARTIALLY_RECEIVED");
      if (orders.length === 0) return receiveStock(3, 0, 5);
      const po = rng.pick(orders);
      if (type === "ADVANCE_PURCHASE_ORDER") {
        return { type, purchaseOrderId: po.purchaseOrderId, trigger: rng.pick(["SUBMIT", "SUPPLIER_CONFIRM", "CLOSE", "CANCEL"] as const) };
      }
      const line = po.lines[0];
      return { type, purchaseOrderId: po.purchaseOrderId, lines: [{ skuId: line?.skuId ?? skuId(0), units: 1 + rng.int(3) }] };
    }
    case "RECONCILE_COUNT_OBSERVATION": {
      const resolution = rng.int(4);
      return {
        type,
        observation: {
          observationId: makeId<"ObservationId">(`obs-count-${mint()}`),
          kind: rng.pick(["CYCLE_COUNT", "BARCODE_COUNT", "EMPLOYEE_COUNT", "VISUAL_ESTIMATE", "SUPPLIER_REPORT"] as const),
          skuId: skuId(rng.int(4)),
          locationId: locationId(rng.int(2)),
          observedAt: "2026-10-05T00:00:00Z",
          source: { sourceType: "SCANNER", sourceRef: "scanner-fuzz" },
          resolution:
            resolution === 0
              ? { resolved: "UNKNOWN", reason: "AMBIGUOUS", providerNativeStatus: "COUNT_UNCLEAR" }
              : resolution === 1
                ? { resolved: "FAILED", error: "scanner offline" }
                : { resolved: "OBSERVED", value: rng.int(30) },
        },
        policy: { toleranceUnits: rng.int(3), promoteWithinTolerance: true },
      };
    }
    case "RECONCILE_POS_SYNC":
      return {
        type,
        observation: {
          observationId: makeId<"ObservationId">(`obs-pos-${mint()}`),
          kind: "POS_SYNC",
          skuId: skuId(rng.int(4)),
          locationId: locationId(rng.int(2)),
          observedAt: "2026-10-05T00:00:00Z",
          source: { sourceType: "POS", sourceRef: "pos-fuzz" },
          resolution: rng.chance(0.2)
            ? { resolved: "UNKNOWN", reason: "PROVIDER_UNAVAILABLE", providerNativeStatus: "POS_SYNC_PENDING" }
            : { resolved: "OBSERVED", value: { unitsSold: rng.int(5) } },
        },
      };
    case "REQUEST_RETURN":
    case "OPEN_RETURN": {
      const orders = view.allOrders().filter((order) => order.state !== "PENDING");
      if (orders.length === 0) return receiveStock(0, 1, 9);
      const order = rng.pick(orders);
      if (type === "REQUEST_RETURN") return { type, orderId: order.orderId };
      return {
        type,
        orderId: order.orderId,
        resolution: rng.pick(["REFUND", "EXCHANGE", "STORE_CREDIT"] as const),
        lines: [{ skuId: skuId(rng.int(4)), quantity: countQuantity(1), reason: "CUSTOMER_REMORSE" }],
      };
    }
    case "ADVANCE_RETURN": {
      const returns = view.allReturns().filter((item) => item.state !== "RESOLVED" && item.state !== "EXPIRED" && item.state !== "CANCELLED");
      if (returns.length === 0) return receiveStock(1, 1, 2);
      return { type, returnId: rng.pick(returns).returnId, trigger: rng.pick(["AUTHORIZE", "REJECT", "SHIP_BACK", "RECEIVE", "INSPECT", "RESOLVE", "CANCEL"] as const) };
    }
    case "OPEN_SUBSCRIPTION":
      return {
        type,
        subscription: {
          subscriptionId: makeId<"SubscriptionId">(`sub-fuzz-${mint()}`),
          customerId: makeId<"CustomerId">("customer-fuzz"),
          planId: makeId<"SubscriptionPlanId">("plan-fuzz"),
          state: "PENDING",
          revision: 1,
        },
      };
    case "ADVANCE_SUBSCRIPTION": {
      const subs = view.allSubscriptions().filter((sub) => sub.state !== "CANCELLED" && sub.state !== "EXPIRED");
      if (subs.length === 0) return receiveStock(2, 0, 3);
      return { type, subscriptionId: rng.pick(subs).subscriptionId, trigger: rng.pick(["ACTIVATE", "PAUSE", "RESUME", "CANCEL", "PAYMENT_FAILED", "PAYMENT_RECOVERED"] as const) };
    }
    case "OPEN_LISTING":
      return {
        type,
        listing: {
          listingId: makeId<"ResaleListingId">(`list-fuzz-${mint()}`),
          sellerRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
          skuRef: skuId(rng.int(4)),
          itemCondition: rng.pick(["NEW", "GOOD", "FAIR"] as const),
          askingPrice: money(`${500 + rng.int(5000)}`, usd),
          state: "DRAFT",
          revision: 1,
        },
      };
    case "ADVANCE_LISTING": {
      const listings = view.allListings().filter((listing) => listing.state !== "ENDED" && listing.state !== "CANCELLED");
      if (listings.length === 0) return receiveStock(3, 1, 4);
      return { type, listingId: rng.pick(listings).listingId, trigger: rng.pick(["PUBLISH", "RESERVE", "MARK_SOLD", "END", "CANCEL"] as const) };
    }
    case "OPEN_RENTAL":
      return {
        type,
        rental: {
          rentalAgreementId: makeId<"RentalAgreementId">(`rent-fuzz-${mint()}`),
          itemSkuRef: skuId(rng.int(4)),
          renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
          period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
          ratePerPeriod: money("2500", usd),
          deposit: money("10000", usd),
          state: "REQUESTED",
          revision: 1,
        },
      };
    case "ADVANCE_RENTAL": {
      const rentals = view.allRentals().filter((rental) => rental.state !== "RETURNED" && rental.state !== "CANCELLED" && rental.state !== "COMPLETED");
      if (rentals.length === 0) return receiveStock(0, 0, 2);
      return { type, rentalAgreementId: rng.pick(rentals).rentalAgreementId, trigger: rng.pick(["START", "MARK_OVERDUE", "RETURN", "COMPLETE", "CANCEL"] as const) };
    }
    case "OPEN_CONSIGNMENT":
      return {
        type,
        consignment: {
          consignmentId: makeId<"ConsignmentId">(`cons-fuzz-${mint()}`),
          consignorRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-fuzz") },
          consignorShareBps: 5_000,
          state: "PROPOSED",
          revision: 1,
        },
      };
    case "ADVANCE_CONSIGNMENT": {
      const consignments = view.allConsignments().filter((item) => item.state !== "TERMINATED");
      if (consignments.length === 0) return receiveStock(1, 0, 6);
      return { type, consignmentId: rng.pick(consignments).consignmentId, trigger: rng.pick(["ACCEPT", "SETTLE", "TERMINATE"] as const) };
    }
    default:
      return receiveStock(0, 0, 1);
  }
}

const WEIGHTED_VOCABULARY: readonly (readonly [string, number])[] = [
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

function weightedType(rng: FuzzRng): string {
  const total = WEIGHTED_VOCABULARY.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() % total;
  for (const [type, weight] of WEIGHTED_VOCABULARY) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return "RECEIVE_STOCK";
}
