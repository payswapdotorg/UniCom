/**
 * Typed commerce commands — the ONLY mutation path into commerce truth
 * (FROZEN-ARCHITECTURE §12: Agent → typed Tool → Command → policy/authority
 * check → deterministic service → event → projection).
 *
 * Every consequential command carries an idempotency key (W1-001 §4.4):
 * replaying the same envelope MUST be safe — the kernel returns the original
 * receipt and produces no second effect. A different payload under an already
 * used key is a hard CONFLICT, never a silent overwrite.
 *
 * These are type contracts: the deterministic executor is W1-002.
 */
import type {
  CartId,
  CommandId,
  CommandReceiptId,
  CorrelationId,
  FulfillmentOrderId,
  IdempotencyKey,
  LocationId,
  MerchantId,
  OrderId,
  PaymentId,
  PurchaseOrderId,
  ReservationId,
  ReturnId,
  SkuId,
  TransferId,
} from "./ids.js";
import type { PrincipalRef } from "./principals.js";
import type { Money } from "./money.js";
import type { Quantity } from "./quantity.js";
import type { InventoryAdjustmentReason, InventoryReservation } from "./inventory.js";
import type { ReceivingLine } from "./purchasing.js";
import type { TransferTrigger } from "./transfers.js";
import type { ShipmentTrigger } from "./fulfillment.js";
import type { ReturnTrigger } from "./returns.js";
import type { PaymentIntentRequest } from "./payments.js";
import type { OpportunityReference } from "./opportunity.js";
import type { PolicyDecision } from "./policy.js";

/** Envelope for every consequential command. Idempotency key is mandatory. */
export interface CommerceCommandEnvelope<P> {
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
  readonly actor: PrincipalRef;
  readonly issuedAt: string;
  readonly correlationId?: CorrelationId;
  readonly payload: P;
}

// --- Inventory commands ---

export type InventoryCommandPayload =
  | { readonly type: "ADJUST_INVENTORY"; readonly skuId: SkuId; readonly locationId: LocationId; readonly deltaUnits: number; readonly reason: InventoryAdjustmentReason }
  | { readonly type: "RESERVE_INVENTORY"; readonly reservation: InventoryReservation }
  | { readonly type: "COMMIT_RESERVATION"; readonly reservationId: ReservationId }
  | { readonly type: "RELEASE_RESERVATION"; readonly reservationId: ReservationId }
  | { readonly type: "RECEIVE_STOCK"; readonly skuId: SkuId; readonly locationId: LocationId; readonly units: number; readonly reason: InventoryAdjustmentReason }
  | { readonly type: "ADVANCE_TRANSFER"; readonly transferId: TransferId; readonly trigger: TransferTrigger }
  | { readonly type: "RECEIVE_PURCHASE_ORDER"; readonly purchaseOrderId: PurchaseOrderId; readonly lines: readonly ReceivingLine[] };

// --- Cart / checkout commands ---

export type CartCommandPayload =
  | { readonly type: "ADD_CART_LINE"; readonly cartId: CartId; readonly skuId: SkuId; readonly quantity: Quantity; readonly unitPrice: Money }
  | { readonly type: "REMOVE_CART_LINE"; readonly cartId: CartId; readonly lineId: string }
  | { readonly type: "OPEN_CHECKOUT"; readonly cartId: CartId; readonly opportunityRef?: OpportunityReference };

// --- Order commands ---

export type OrderCommandPayload =
  | { readonly type: "PLACE_ORDER"; readonly cartId: CartId; readonly merchantId: MerchantId; readonly opportunityRef?: OpportunityReference }
  | { readonly type: "CANCEL_ORDER"; readonly orderId: OrderId }
  | { readonly type: "ADVANCE_FULFILLMENT_ORDER"; readonly fulfillmentOrderId: FulfillmentOrderId; readonly trigger: ShipmentTrigger };

// --- Payment boundary commands (providers adapt TO the boundary) ---

export type PaymentCommandPayload =
  | { readonly type: "CREATE_PAYMENT_INTENT"; readonly request: PaymentIntentRequest }
  | { readonly type: "CAPTURE_PAYMENT"; readonly paymentId: PaymentId }
  | { readonly type: "VOID_PAYMENT"; readonly paymentId: PaymentId }
  | { readonly type: "REFUND_PAYMENT"; readonly paymentId: PaymentId; readonly amount: Money };

// --- Return commands ---

export type ReturnCommandPayload =
  | { readonly type: "REQUEST_RETURN"; readonly orderId: OrderId }
  | { readonly type: "ADVANCE_RETURN"; readonly returnId: ReturnId; readonly trigger: ReturnTrigger };

export type CommerceCommandPayload =
  | InventoryCommandPayload
  | CartCommandPayload
  | OrderCommandPayload
  | PaymentCommandPayload
  | ReturnCommandPayload;

/** Discriminated command envelope over all payloads. */
export type AnyCommerceCommand = CommerceCommandEnvelope<CommerceCommandPayload>;

/** Evidence of a single deterministic effect. */
export interface CommandReceipt {
  readonly receiptId: CommandReceiptId;
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
  readonly executedAt: string;
  readonly resultingRevision?: number;
  readonly subjectRefs: readonly string[];
}

export type CommandRejectionCode =
  | "INVALID_COMMAND"
  | "INVALID_STATE"
  | "POLICY_DENIED"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "INSUFFICIENT_INVENTORY";

export interface CommandRejection {
  readonly code: CommandRejectionCode;
  readonly detail: string;
  readonly policyDecision?: PolicyDecision;
}

/**
 * Deterministic execution outcome.
 * - EXECUTED: exactly-once effect recorded.
 * - DUPLICATE: same envelope replayed → original receipt, no new effect.
 * - REJECTED: deterministic refusal with coded reason (not UNKNOWN: the
 *   kernel itself never produces ambiguity — only external observations do).
 */
export type CommandExecution =
  | { readonly status: "EXECUTED"; readonly receipt: CommandReceipt }
  | { readonly status: "DUPLICATE"; readonly originalReceipt: CommandReceipt }
  | { readonly status: "REJECTED"; readonly reason: CommandRejection };

/** Typed helpers for envelope construction (single authority for the shape). */
export function commandEnvelope<P>(
  commandId: CommandId,
  idempotencyKey: IdempotencyKey,
  actor: PrincipalRef,
  issuedAt: string,
  payload: P,
): CommerceCommandEnvelope<P> {
  return { commandId, idempotencyKey, actor, issuedAt, payload };
}

/** Same key + same command id = safe replay; same key + different id = conflict. */
export function isSafeReplay(
  envelope: CommerceCommandEnvelope<unknown>,
  recorded: CommandReceipt,
): boolean {
  return envelope.commandId === recorded.commandId;
}
