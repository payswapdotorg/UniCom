/**
 * Storefront and commerce command envelopes
 * (FROZEN-ARCHITECTURE §3.A, §12; W3-001 §3).
 *
 * The storefront is a RENDER boundary over Worker 1's canonical commerce
 * truth: every view here is a read-side projection carrying a truth class,
 * never the truth itself. Buyer actions leave the experience plane only as
 * command ENVELOPES whose typed command semantics belong to the Commerce
 * Kernel (Worker 1). Money is always an exact decimal string (never float).
 */

import type {
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceKernelCommandRef,
  CommerceProductRef,
  AuthorizationContextRef,
  TransactionProofRef,
} from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { IdempotencyKey, MoneyString, UtcIso8601String } from "../common/values";

/** Command categories that may travel in an envelope. */
export type CommerceCommandType =
  | "cart"
  | "checkout"
  | "order"
  | "fulfillment"
  | "return"
  | "payment"
  | "catalog"
  | "pricing"
  | "inventory"
  | "customer"
  | "subscription"
  | "b2b";

/**
 * Envelope handing a commerce command to the deterministic kernel.
 * The typed command itself is an opaque ref (Worker 1 owns its semantics);
 * the envelope guarantees idempotency and authorization context.
 */
export interface CommerceCommandEnvelope {
  readonly envelopeId: string;
  readonly commandType: CommerceCommandType;
  readonly commandRef: CommerceKernelCommandRef;
  readonly idempotencyKey: IdempotencyKey;
  readonly authorization: AuthorizationContextRef;
  readonly issuedAt: UtcIso8601String;
}

/** Price as rendered to a buyer (display only; canonical pricing is W1's). */
export interface PriceView {
  readonly displayAmount: MoneyString;
  readonly currencyCode: string;
  readonly compareAtDisplay?: MoneyString;
  readonly unitNote?: string;
}

/** Availability as rendered (observed/operational split preserved). */
export interface AvailabilityView {
  readonly truthClass: "operational" | "observed";
  readonly displayStatus: "in-stock" | "low-stock" | "out-of-stock" | "unknown";
  readonly note?: string;
}

/** A product card on the storefront. */
export interface StorefrontProductView {
  readonly productRef: CommerceProductRef;
  readonly title: string;
  readonly mediaArtifactRefs: readonly string[];
  readonly price: PriceView;
  readonly availability: AvailabilityView;
  readonly variantSummaryNote?: string;
}

/** A storefront collection page. */
export interface StorefrontCollectionView {
  readonly catalogRef: CommerceCatalogRef;
  readonly title: string;
  readonly products: readonly StorefrontProductView[];
}

/** One line of the cart view. */
export interface CartLineView {
  readonly productRef: CommerceProductRef;
  readonly quantity: number;
  readonly lineTotal: MoneyString;
}

/** Cart view (projection of canonical cart). */
export interface StorefrontCartView {
  readonly cartRef: CommerceCartRef;
  readonly lines: readonly CartLineView[];
  readonly estimatedTotal: MoneyString;
  readonly taxNote?: string;
}

/** Checkout step status (UNKNOWN preserved; proof level pinned up front). */
export interface CheckoutStatusView {
  readonly checkoutRef: string;
  readonly currentStep: "contact" | "delivery" | "payment" | "review" | "confirming" | "done" | "unknown";
  readonly selectedProofLevel: TransactionProofRef;
  readonly blockerNote?: string;
  readonly evidence: readonly EvidenceReference[];
}

/** Theme/content customization surface of the storefront. */
export interface StorefrontThemeView {
  readonly themeId: string;
  readonly contentSlots: readonly { readonly slotId: string; readonly userLabel: string }[];
}

/** Buyer identity context for a storefront session (never authority). */
export interface StorefrontBuyerContext {
  readonly customerRef?: CommerceCustomerRef;
  readonly guest: boolean;
}
