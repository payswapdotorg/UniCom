/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY CERTIFICATION SUPPORT — NEVER PRODUCTION CODE.          █
 * █ No production-reachable path may import this file.               █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-006 composed full-lifecycle journey: catalog → cart → checkout →
 * payment (auth → capture → settlement tri-state) → fulfillment →
 * returns → recourse (dispute / chargeback / goodwill) → till
 * reconciliation + count reconciliation, as ONE deterministic journey.
 *
 * Every command is twin-checked (structural + canonical) and money-
 * conservation-checked (the ledger battery) BEFORE the next step runs.
 */
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  commandEnvelope,
  countQuantity,
  currency,
  makeId,
  measuredQuantity,
  money,
  unitOfMeasure,
  type AnyRuntimeCommand,
  type CommandExecution,
  type PrincipalRef,
  type RuntimeCommandPayload,
} from "../../../contract.js";
import { ScriptedPaymentDouble } from "../../runtime/support/payment-double.js";
import { assertMoneyConservation, type ConservationReport } from "./ledger.js";

const usd = currency("USD");
const store = makeId<"AutonomousStoreId">("store-journey");
const tote = makeId<"SkuId">("sku-tote");
const bananas = makeId<"SkuId">("sku-bananas");
const warehouse = makeId<"LocationId">("loc-warehouse-1");
const storeFront = makeId<"LocationId">("loc-store-b");
const merchant = makeId<"MerchantId">("merchant-1");
const owner: PrincipalRef = { kind: "MERCHANT", merchantId: merchant };
const successor: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-1") };

export interface JourneyStep {
  readonly index: number;
  readonly label: string;
  readonly type: string;
}

export interface JourneySummary {
  readonly steps: readonly JourneyStep[];
  readonly stepCount: number;
  readonly twinChecks: number;
  readonly conservationChecks: number;
  readonly ledger: ConservationReport["totals"];
  readonly moneyInPaymentIds: readonly string[];
  readonly orderFinal: { state: string; paymentStatus: string; fulfillmentStatus: string };
  readonly variances: readonly string[];
}

export interface JourneyResult {
  readonly kernel: CommerceKernel;
  readonly twin: CommerceTwin;
  readonly double: ScriptedPaymentDouble;
  readonly summary: JourneySummary;
}

/** Execute one journey step: kernel dispatch → twin fold → twin ≡ kernel → conservation. */
async function journeyStep(
  kernel: CommerceKernel,
  twin: CommerceTwin,
  label: string,
  payload: RuntimeCommandPayload,
  actor: PrincipalRef,
  steps: JourneyStep[],
): Promise<CommandExecution> {
  const index = steps.length + 1;
  const outcome = await kernel.execute(
    commandEnvelope(
      makeId<"CommandId">(`cmd-journey-${index}`),
      makeId<"IdempotencyKey">(`idem-journey-${index}`),
      actor,
      "2026-10-05T00:00:00Z",
      payload,
    ) as AnyRuntimeCommand,
  );
  if (outcome.status !== "EXECUTED") {
    const reason = outcome.status === "REJECTED" ? outcome.reason : outcome;
    throw new TypeError(`journey step ${index} (${label}) rejected: ${JSON.stringify(reason)}`);
  }
  const events = kernel.events();
  // The twin folds only the new tail; equivalence is asserted immediately.
  twin.applyAll(events.slice(twin.position()));
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  assertMoneyConservation(kernel.events(), `journey step ${index} (${label})`);
  steps.push({ index, label, type: payload.type });
  return outcome;
}

/** Run the whole composed journey; returns kernel + twin + machine summary. */
export async function runComposedJourney(): Promise<JourneyResult> {
  const double = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary: double });
  const twin = CommerceTwin.empty();
  const steps: JourneyStep[] = [];
  const step = (label: string, payload: RuntimeCommandPayload, actor: PrincipalRef = owner) =>
    journeyStep(kernel, twin, label, payload, actor, steps);

  // --- Catalog: price book (base price + cost basis) + stock on two locations.
  await step("register autonomous store", { type: "REGISTER_AUTONOMOUS_STORE", autonomousStoreId: store, ownerRef: owner, displayName: "Journey Store" });
  await step("price book: tote", { type: "SET_SKU_PRICE", autonomousStoreId: store, skuId: tote, unitPrice: money("1999", usd), costBasis: money("1000", usd) });
  await step("price book: bananas", { type: "SET_SKU_PRICE", autonomousStoreId: store, skuId: bananas, unitPrice: money("250", usd), costBasis: money("120", usd) });
  await step("receive 10 totes @warehouse", { type: "RECEIVE_STOCK", skuId: tote, locationId: warehouse, units: 10, reason: "RECEIVING" });
  await step("receive 6 totes @store-front", { type: "RECEIVE_STOCK", skuId: tote, locationId: storeFront, units: 6, reason: "RECEIVING" });
  await step("receive 20 bananas @store-front", { type: "RECEIVE_STOCK", skuId: bananas, locationId: storeFront, units: 20, reason: "RECEIVING" });

  // --- Cart: 2 totes × $19.99 + 2.000 kg bananas × $2.50/kg = $44.98.
  const cart = makeId<"CartId">("cart-journey");
  await step("cart: 2 totes", { type: "ADD_CART_LINE", cartId: cart, skuId: tote, quantity: countQuantity(2), unitPrice: money("1999", usd) });
  await step("cart: 2kg bananas", { type: "ADD_CART_LINE", cartId: cart, skuId: bananas, quantity: measuredQuantity("2", unitOfMeasure("KG")), unitPrice: money("250", usd) });

  // --- Checkout: session → payment pending → completed order with AUTHORIZED payment.
  await step("open checkout", { type: "OPEN_CHECKOUT", cartId: cart });
  const session = kernel.view().allCheckoutSessions().at(-1)!;
  await step("start payment", { type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" });
  await step("complete checkout (order + authorized payment)", {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: session.checkoutSessionId,
    merchantId: merchant,
    method: { methodKind: "CARD", tokenRef: "tok-journey" },
  }, { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-1") });
  const order = kernel.view().allOrders().at(-1)!;
  if (order.totals.grandTotal.amountMinor !== "4498") {
    throw new TypeError(`journey grand total ${order.totals.grandTotal.amountMinor} != 4498`);
  }
  const paymentId = kernel.view().allPaymentIntents().find((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === order.orderId)!.paymentId;

  // --- Payment tri-state: capture → UNKNOWN settlement hold → OBSERVED SETTLED.
  await step("capture payment", { type: "CAPTURE_PAYMENT", paymentId });
  if (kernel.view().order(order.orderId)?.paymentStatus !== "PAID") throw new TypeError("order must be PAID after capture");
  double.scriptSettlementOutcome(paymentId, { resolved: "UNKNOWN", reason: "CLEARING_IN_PROGRESS", providerNativeStatus: "SETTLEMENT_PENDING" });
  await step("settlement observation: UNKNOWN (order holds UNKNOWN)", { type: "OBSERVE_SETTLEMENT", paymentId });
  if (kernel.view().order(order.orderId)?.paymentStatus !== "UNKNOWN") throw new TypeError("order must hold UNKNOWN while clearing is ambiguous");
  if (kernel.view().settlementRecord(paymentId)?.status !== "UNKNOWN") throw new TypeError("settlement must be UNKNOWN");
  double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "SETTLED", settledAmount: money("4498", usd) });
  await step("settlement observation: SETTLED (money-in)", { type: "OBSERVE_SETTLEMENT", paymentId });
  if (kernel.view().settlementRecord(paymentId)?.status !== "SETTLED") throw new TypeError("settlement must be SETTLED");

  // --- Fulfillment: pack → tender → delivered; order completes.
  await step("open fulfillment", { type: "OPEN_FULFILLMENT", orderId: order.orderId, originLocationId: warehouse });
  const fulfillment = kernel.view().fulfillmentForOrder(order.orderId)!;
  await step("pack", { type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "PACK" });
  await step("tender to carrier", { type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "TENDER" });
  await step("confirm delivery", { type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "CONFIRM_DELIVERY" });
  await step("order completed", { type: "ADVANCE_ORDER", orderId: order.orderId, trigger: "ORDER_COMPLETED" });

  // --- Inventory follows the sale: reserve 2, commit (stock leaves the shelf exactly once).
  await step("reserve 2 totes", {
    type: "RESERVE_INVENTORY",
    reservation: { reservationId: makeId<"ReservationId">("res-journey"), skuId: tote, locationId: warehouse, units: 2, status: "OPEN", revision: 1 },
  });
  await step("commit reservation", { type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-journey") });
  if (kernel.view().level(tote, warehouse)?.onHand !== 8) throw new TypeError("warehouse onHand must be 8 after commit");

  // --- Returns: the full deterministic ladder, then the money moves on the payment plane.
  await step("request return", { type: "REQUEST_RETURN", orderId: order.orderId });
  const returnAuth = kernel.view().allReturns().at(-1)!;
  await step("authorize return", { type: "ADVANCE_RETURN", returnId: returnAuth.returnId, trigger: "AUTHORIZE" });
  await step("ship back", { type: "ADVANCE_RETURN", returnId: returnAuth.returnId, trigger: "SHIP_BACK" });
  await step("receive return", { type: "ADVANCE_RETURN", returnId: returnAuth.returnId, trigger: "RECEIVE" });
  await step("inspect return", { type: "ADVANCE_RETURN", returnId: returnAuth.returnId, trigger: "INSPECT" });
  await step("resolve return", { type: "ADVANCE_RETURN", returnId: returnAuth.returnId, trigger: "RESOLVE" });

  // --- Refunds: policy refund + goodwill refund (bounded by captured facts).
  await step("policy refund 19.98", { type: "REFUND_PAYMENT", paymentId, amount: money("1998", usd) });
  await step("goodwill refund 5.00", { type: "ISSUE_GOODWILL_REFUND", paymentId, amount: money("500", usd), reason: "journey goodwill concession" });

  // --- Recourse: dispute lifecycle (decision, no money) + chargeback forcing (bounded).
  await step("open dispute 3.00", { type: "OPEN_DISPUTE", paymentId, amount: money("300", usd), reason: "NOT_AS_DESCRIBED" });
  const dispute = kernel.view().allDisputes().at(-1)!;
  await step("submit dispute evidence", { type: "SUBMIT_DISPUTE_EVIDENCE", disputeId: dispute.disputeId, evidence: { summary: "journey evidence packet" } });
  await step("resolve dispute (merchant prevails)", { type: "RESOLVE_DISPUTE", disputeId: dispute.disputeId, outcome: "REJECTED" });
  await step("chargeback 30.00 → forced 20.00 (cap = captured − refunded)", { type: "RECORD_CHARGEBACK", paymentId, amount: money("3000", usd), providerNativeStatus: "CB_JOURNEY" });
  const chargeback = kernel.view().allChargebacks().at(-1)!;
  if (chargeback.forcedRefundAmount.amountMinor !== "2000") {
    throw new TypeError(`chargeback forced ${chargeback.forcedRefundAmount.amountMinor} != 2000 (cap is captured − refunded)`);
  }
  if (kernel.view().order(order.orderId)?.paymentStatus !== "REFUNDED") throw new TypeError("order must be REFUNDED after full refund");
  if (kernel.view().refundedTotalFor(paymentId) !== 4498n) throw new TypeError("refunded total must be 4498");

  // --- Till reconciliation: float → operations → handover (carry) → close with SHORT variance.
  await step("open till (float 50.00)", { type: "OPEN_STORE_CASH_SESSION", autonomousStoreId: store, tillId: makeId<"TillId">("till-front"), openingCount: money("5000", usd), staff: owner });
  const tillSession = kernel.view().openStoreSessionFor(store, makeId<"TillId">("till-front"))!;
  await step("tender sale +12.00", { type: "RECORD_TILL_OPERATION", sessionId: tillSession.sessionId, operation: { kind: "TENDER_SALE", amount: money("1200", usd) } });
  await step("cash out −5.00", { type: "RECORD_TILL_OPERATION", sessionId: tillSession.sessionId, operation: { kind: "CASH_OUT", amount: money("500", usd), note: "safe drop" } });
  await step("handover counted 57.00 (BALANCED)", { type: "HANDOVER_STORE_CASH_SESSION", sessionId: tillSession.sessionId, fromStaff: owner, toStaff: successor, countedCash: money("5700", usd) });
  const successorSession = kernel.view().allStoreSessions().find((item) => item.sessionId !== tillSession.sessionId)!;
  await step("successor tender sale +9.00", { type: "RECORD_TILL_OPERATION", sessionId: successorSession.sessionId, operation: { kind: "TENDER_SALE", amount: money("900", usd) } });
  await step("close till counted 62.00 (SHORT 4.00)", { type: "CLOSE_STORE_CASH_SESSION", sessionId: successorSession.sessionId, closingCount: money("6200", usd) });

  // --- Count reconciliation: barcode count within tolerance promotes; POS sync applies sold units.
  await step("count reconcile (PROMOTED, variance −1 unit)", {
    type: "RECONCILE_COUNT_OBSERVATION",
    observation: {
      observationId: makeId<"ObservationId">("obs-journey-count"),
      kind: "BARCODE_COUNT",
      skuId: tote,
      locationId: warehouse,
      observedAt: "2026-10-05T00:00:00Z",
      source: { sourceType: "SCANNER", sourceRef: "scanner-journey" },
      resolution: { resolved: "OBSERVED", value: 7 },
    },
    policy: { toleranceUnits: 2, promoteWithinTolerance: true },
  });
  await step("POS sync (sold 2 @store-front)", {
    type: "RECONCILE_POS_SYNC",
    observation: {
      observationId: makeId<"ObservationId">("obs-journey-pos"),
      kind: "POS_SYNC",
      skuId: tote,
      locationId: storeFront,
      observedAt: "2026-10-05T00:00:00Z",
      source: { sourceType: "POS", sourceRef: "pos-journey" },
      resolution: { resolved: "OBSERVED", value: { unitsSold: 2 } },
    },
  });

  // --- Terminal certification state.
  if (!kernel.journalIsValid()) throw new TypeError("journey journal violates the sequence law");
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  const ledger = assertMoneyConservation(kernel.events(), "composed journey (final)");
  const moneyIn = twin.facts().recourse.moneyInPaymentIds();
  const finalOrder = kernel.view().order(order.orderId)!;
  const summary: JourneySummary = {
    steps,
    stepCount: steps.length,
    twinChecks: steps.length,
    conservationChecks: steps.length,
    ledger: ledger.totals,
    moneyInPaymentIds: moneyIn,
    orderFinal: { state: finalOrder.state, paymentStatus: finalOrder.paymentStatus, fulfillmentStatus: finalOrder.fulfillmentStatus },
    variances: kernel.view().allCashVariances().map((variance) => variance.kind),
  };
  return { kernel, twin, double, summary };
}
