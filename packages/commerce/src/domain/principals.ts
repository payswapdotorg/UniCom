/**
 * Principals of commerce: merchants, customers, and principal references.
 *
 * Principal identity is commerce-truth-owned. Agent principals, capability
 * vocabulary and trust semantics belong to Worker 2's lane and are referenced
 * ONLY opaquely from this package.
 */
import type { AutonomousStoreId, CustomerId, MerchantId, SystemPrincipalId } from "./ids.js";
import type { CurrencyCode } from "./money.js";

export type MerchantStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export type CustomerStatus = "ACTIVE" | "BLOCKED" | "CLOSED";

/** Discriminated reference to any commerce principal. */
export type PrincipalRef =
  | { readonly kind: "MERCHANT"; readonly merchantId: MerchantId }
  | { readonly kind: "CUSTOMER"; readonly customerId: CustomerId }
  | { readonly kind: "AUTONOMOUS_STORE"; readonly autonomousStoreId: AutonomousStoreId }
  | { readonly kind: "SYSTEM"; readonly systemPrincipalId: SystemPrincipalId };

export interface Merchant {
  readonly merchantId: MerchantId;
  readonly displayName: string;
  readonly defaultCurrency: CurrencyCode;
  readonly status: MerchantStatus;
}

export interface Customer {
  readonly customerId: CustomerId;
  readonly displayName?: string;
  readonly email?: string;
  readonly status: CustomerStatus;
}

export type PrincipalStatus = MerchantStatus | CustomerStatus;

/** Stable string form for ledger keys and event subjects. */
export function principalRefKey(ref: PrincipalRef): string {
  switch (ref.kind) {
    case "MERCHANT":
      return `merchant:${ref.merchantId}`;
    case "CUSTOMER":
      return `customer:${ref.customerId}`;
    case "AUTONOMOUS_STORE":
      return `autonomous-store:${ref.autonomousStoreId}`;
    case "SYSTEM":
      return `system:${ref.systemPrincipalId}`;
  }
}

/** Compare two principal references for identity equality. */
export function principalRefEquals(a: PrincipalRef, b: PrincipalRef): boolean {
  return principalRefKey(a) === principalRefKey(b);
}
