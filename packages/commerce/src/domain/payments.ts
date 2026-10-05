/**
 * Payment boundary — a typed, provider-agnostic seam.
 *
 * This is a BOUNDARY contract only: payment providers live behind it and
 * ADAPT to these shapes (law 6: no Shopify/Stripe/Amazon semantics here).
 * Payment PROCESSING is out of scope for the boundary module: the checkout
 * handoff (cart.ts) produces the request; the commerce kernel records
 * payment intents and their statuses as immutable facts.
 *
 * Statuses: ambiguous provider outcomes map to UNKNOWN with the provider-native
 * status preserved verbatim (INVARIANT 10/11); customer-action-required is a
 * first-class state, never flattened (AGENTS.md #9).
 */
import type { CheckoutSessionId, OrderId, PaymentId } from "./ids.js";
import type { Money } from "./money.js";
import { err, ok, type Result } from "./result.js";

export type PaymentMethodKind =
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "WALLET"
  | "CASH"
  | "BNPL"
  | "CRYPTO"
  | "GIFT_CARD"
  | "STORE_CREDIT";

/** Tokenized payment method reference — raw credentials NEVER appear here. */
export interface PaymentMethodRef {
  readonly methodKind: PaymentMethodKind;
  /** Opaque provider token; PANs/secrets are out of scope by contract. */
  readonly tokenRef: string;
}

export type PaymentStatus =
  | "REQUIRES_CUSTOMER_ACTION"
  | "AUTHORIZED"
  | "CAPTURED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED"
  | "FAILED"
  | "UNKNOWN";

export type PaymentReference =
  | { readonly kind: "ORDER"; readonly orderId: OrderId }
  | { readonly kind: "CHECKOUT"; readonly checkoutSessionId: CheckoutSessionId };

export interface CustomerAction {
  readonly actionKind: "CONFIRM" | "OTP" | "REDIRECT" | "APP_APPROVAL";
  /** Provider-supplied instruction — untrusted DATA, never an instruction to execute. */
  readonly instruction: string;
  readonly expiresAt?: string;
}

export interface PaymentIntent {
  readonly paymentId: PaymentId;
  readonly reference: PaymentReference;
  readonly amount: Money;
  readonly status: PaymentStatus;
  /** Provider-native status, preserved verbatim (INVARIANT 11). */
  readonly providerNativeStatus?: string;
  readonly customerAction?: CustomerAction;
  readonly revision: number;
}

export type PaymentBoundaryErrorCode =
  | "INVALID_AMOUNT"
  | "PAYMENT_NOT_FOUND"
  | "CURRENCY_MISMATCH"
  | "PROVIDER_UNAVAILABLE"
  | "AMBIGUOUS_PROVIDER_RESPONSE";

export type PaymentBoundaryError = {
  code: PaymentBoundaryErrorCode;
  detail: string;
  providerNativeStatus?: string;
};

export interface PaymentIntentRequest {
  readonly amount: Money;
  readonly reference: PaymentReference;
  readonly method: PaymentMethodRef;
}

/**
 * The typed mutation path into the payment plane. Providers adapt TO this
 * interface (transport belongs to the connector plane, Worker 3's lane).
 * Async by contract: real rails are asynchronous; determinism applies to the
 * RECORDED outcomes, not the transport.
 */
export interface PaymentBoundary {
  createPaymentIntent(request: PaymentIntentRequest): Promise<Result<PaymentIntent, PaymentBoundaryError>>;
  capturePayment(paymentId: PaymentId): Promise<Result<PaymentIntent, PaymentBoundaryError>>;
  voidPayment(paymentId: PaymentId): Promise<Result<PaymentIntent, PaymentBoundaryError>>;
  refundPayment(paymentId: PaymentId, amount: Money): Promise<Result<PaymentIntent, PaymentBoundaryError>>;
}

/**
 * Deterministic helper expressing law 5 for payments: an AMBIGUOUS provider
 * outcome resolves the intent to UNKNOWN (never FAILED) with the native
 * status preserved. Adapters must use this instead of inventing failures.
 */
export function resolveAmbiguousPayment(
  intent: PaymentIntent,
  providerNativeStatus: string,
): PaymentIntent {
  return {
    ...intent,
    status: "UNKNOWN",
    providerNativeStatus,
    revision: intent.revision + 1,
  };
}

/** Deterministic validation of an intent request (boundary pre-condition). */
export function validatePaymentIntentRequest(
  request: PaymentIntentRequest,
): Result<PaymentIntentRequest, PaymentBoundaryError> {
  if (request.amount.currency.length !== 3) {
    return err({ code: "INVALID_AMOUNT", detail: "currency must be alpha-3" });
  }
  if (BigInt(request.amount.amountMinor) <= 0n) {
    return err({ code: "INVALID_AMOUNT", detail: "amount must be positive" });
  }
  if (request.method.tokenRef.length === 0) {
    return err({ code: "PROVIDER_UNAVAILABLE", detail: "empty payment method token" });
  }
  return ok(request);
}

/** Refund amount validation against the captured intent. */
export function validateRefundAmount(
  intent: PaymentIntent,
  amount: Money,
): Result<Money, PaymentBoundaryError> {
  if (intent.status !== "CAPTURED" && intent.status !== "PARTIALLY_REFUNDED") {
    return err({ code: "PAYMENT_NOT_FOUND", detail: `refund requires a captured intent, got ${intent.status}` });
  }
  if (amount.currency !== intent.amount.currency) {
    return err({ code: "CURRENCY_MISMATCH", detail: `${amount.currency} vs ${intent.amount.currency}` });
  }
  if (BigInt(amount.amountMinor) <= 0n || BigInt(amount.amountMinor) > BigInt(intent.amount.amountMinor)) {
    return err({ code: "INVALID_AMOUNT", detail: `refund ${amount.amountMinor} out of bounds for ${intent.amount.amountMinor}` });
  }
  return ok(amount);
}
