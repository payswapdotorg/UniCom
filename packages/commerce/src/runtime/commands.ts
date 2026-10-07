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
  SkuId,
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
import type {
  OverrideAction,
  StoreControlMode,
  StoreCycleTrigger,
  StoreEscalationTrigger,
} from "../domain/autonomous-store.js";
import type { StoreCycleId, StoreEscalationId } from "../domain/ids.js";
import type {
  CampaignStackingPolicy,
  Campaign,
} from "../domain/marketing.js";
import type {
  CustomerRecord,
  LoyaltyAccount,
  LoyaltyEntryReason,
  LoyaltyPoints,
  LoyaltyTierPolicy,
} from "../domain/crm.js";
import type { DemandSignal } from "../domain/forecasting.js";
import type {
  CampaignId,
  CampaignEffectId,
  DemandSignalId,
  LoyaltyAccountId,
  ReorderProposalId,
} from "../domain/ids.js";

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

/**
 * W1-005: autonomous-store runtime commands. The store operating itself:
 * control registration + authority handover, human override, operating
 * cycles, autonomous till open/close, restock triggers, count reconcile,
 * the price book, in-policy price adjustments, escalation advancement.
 */
export type AutonomousStoreCommandPayload =
  | {
      readonly type: "REGISTER_AUTONOMOUS_STORE";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly ownerRef: PrincipalRef;
      readonly displayName: string;
    }
  | {
      readonly type: "HANDOVER_STORE_AUTHORITY";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly fromPrincipal: PrincipalRef;
      readonly toPrincipal: PrincipalRef;
      readonly toMode: StoreControlMode;
    }
  | {
      readonly type: "RECORD_HUMAN_OVERRIDE";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly action: OverrideAction;
      readonly justification: string;
    }
  | { readonly type: "ADVANCE_STORE_ESCALATION"; readonly escalationId: StoreEscalationId; readonly trigger: StoreEscalationTrigger }
  | { readonly type: "BEGIN_STORE_CYCLE"; readonly autonomousStoreId: AutonomousStoreId }
  | { readonly type: "ADVANCE_STORE_CYCLE"; readonly cycleId: StoreCycleId; readonly trigger: StoreCycleTrigger }
  | {
      readonly type: "AUTONOMOUS_OPEN_TILL";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly tillId: TillId;
      readonly openingCount: Money;
    }
  | {
      readonly type: "AUTONOMOUS_CLOSE_TILL";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly sessionId: StoreCashSessionId;
      readonly closingCount: Money;
    }
  | {
      readonly type: "AUTONOMOUS_RESTOCK";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly skuId: SkuId;
      readonly locationId: LocationId;
    }
  | {
      readonly type: "AUTONOMOUS_RECONCILE_COUNT";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly observation: InventoryCountObservation;
    }
  | {
      readonly type: "SET_SKU_PRICE";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly skuId: SkuId;
      readonly unitPrice: Money;
      readonly costBasis: Money;
    }
  | {
      readonly type: "ADJUST_SKU_PRICE";
      readonly autonomousStoreId: AutonomousStoreId;
      readonly skuId: SkuId;
      readonly newPrice: Money;
      readonly reason?: string;
    };

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
  | StoreOpsCommandPayload
  | AutonomousStoreCommandPayload
  | MarketingCommandPayload
  | CrmCommandPayload
  | ForecastingCommandPayload;

/**
 * W1-007 marketing campaign commands. Campaigns are journaled lifecycle
 * objects wrapping the certified PromotionRule; every state transition and
 * every effect application is an idempotent kernel command with evidence.
 * Stacking/exclusivity is an explicit policy contract (never silent).
 */
export type MarketingCommandPayload =
  | { readonly type: "OPEN_CAMPAIGN"; readonly campaign: Campaign }
  | { readonly type: "ADVANCE_CAMPAIGN"; readonly campaignId: CampaignId; readonly trigger: import("../domain/marketing.js").CampaignTrigger }
  | {
      readonly type: "APPLY_CAMPAIGN_EFFECT";
      readonly campaignId: CampaignId;
      readonly skuId: SkuId;
      readonly lineAmount: Money;
    }
  | {
      readonly type: "RESOLVE_CAMPAIGN_STACKING";
      readonly effectIds: readonly CampaignEffectId[];
      readonly policy: CampaignStackingPolicy;
    };

/**
 * W1-007 CRM + loyalty commands. Customer records and loyalty ledger entries
 * are journaled like money (W1-006 conservation law extended to points).
 * Every accrual/redemption/expiry is a CREDIT/DEBIT pair — zero-sum verified.
 */
export type CrmCommandPayload =
  | { readonly type: "OPEN_CUSTOMER_RECORD"; readonly record: CustomerRecord }
  | {
      readonly type: "OPEN_LOYALTY_ACCOUNT";
      readonly account: LoyaltyAccount;
      readonly tierPolicy: LoyaltyTierPolicy;
    }
  | {
      readonly type: "ACCRUE_LOYALTY";
      readonly loyaltyAccountId: LoyaltyAccountId;
      readonly points: LoyaltyPoints;
      readonly reason: LoyaltyEntryReason;
      readonly orderId?: import("../domain/ids.js").OrderId;
      readonly campaignId?: CampaignId;
    }
  | {
      readonly type: "REDEEM_LOYALTY";
      readonly loyaltyAccountId: LoyaltyAccountId;
      readonly points: LoyaltyPoints;
    }
  | { readonly type: "EXPIRE_LOYALTY"; readonly loyaltyAccountId: LoyaltyAccountId }
  | {
      readonly type: "ADJUST_LOYALTY";
      readonly loyaltyAccountId: LoyaltyAccountId;
      readonly points: LoyaltyPoints;
      readonly reason: LoyaltyEntryReason;
    };

/**
 * W1-007 forecasting commands. Demand signals are journaled OBSERVATIONS;
 * reorder proposals are journaled ADVISORY facts (opportunities) — NEVER
 * automatic inventory mutation. The autonomous store's AUTONOMOUS_RESTOCK is
 * the only path that mutates inventory from a forecast, separately authority-gated.
 */
export type ForecastingCommandPayload =
  | { readonly type: "RECORD_DEMAND_SIGNAL"; readonly signal: DemandSignal }
  | {
      readonly type: "PROPOSE_REORDER";
      readonly sourceDemandSignalId: DemandSignalId;
      readonly skuId: SkuId;
      readonly locationId: import("../domain/ids.js").LocationId;
      readonly forecast: import("../domain/forecasting.js").ForecastResolution;
      readonly currentOnHand: number;
      readonly leadTimeDays: number;
      readonly safetyStockUnits: number;
    }
  | {
      readonly type: "ADVANCE_REORDER_PROPOSAL";
      readonly reorderProposalId: ReorderProposalId;
      readonly trigger: "ACCEPT" | "REJECT" | "SUPERSEDE";
    };

/** Discriminated envelope over the runtime payload union. */
export type AnyRuntimeCommand = CommerceCommandEnvelope<RuntimeCommandPayload>;
