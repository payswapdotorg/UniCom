/**
 * Untrusted-content boundary (FROZEN-ARCHITECTURE §16, INVARIANTS 26).
 *
 * Third-party commerce content is DATA, never trusted instructions:
 * product descriptions, reviews, customer text, supplier files, web pages,
 * external documents, marketplace messages and live-stream events.
 *
 * Trusted instructions come only from: platform policy, merchant policy,
 * authenticated principal instruction, or an explicit approved tool contract.
 * Those are distinct branded types; untrusted content can NEVER be assigned
 * where a trusted instruction is required (compile-time boundary).
 */

declare const untrustedDataBrand: unique symbol;
/**
 * Third-party content wrapped as untrusted data. Consumers must treat it as
 * inert payload. It is not assignable to `TrustedInstruction` (or vice versa)
 * because the brands differ.
 */
export type UntrustedCommerceContent<T> = T & {
  readonly [untrustedDataBrand]: "untrusted-data-never-instruction";
};

declare const trustedInstructionBrand: unique symbol;
/** Instruction from a trusted origin only (policy or authenticated principal). */
export type TrustedInstruction = {
  readonly [trustedInstructionBrand]: "trusted-instruction";
  readonly issuedBy: "platform-policy" | "merchant-policy" | "authenticated-principal" | "approved-tool-contract";
  readonly instruction: string;
};

// ---------------------------------------------------------------------------
// Untrusted payload shapes (FROZEN §16 untrusted list)
// ---------------------------------------------------------------------------

/** Third-party product description text. */
export interface ProductDescriptionContent {
  readonly rawText: string;
  readonly sourceListingRef: string;
  readonly locale: string;
}

/** Third-party review text and metadata. */
export interface ReviewContent {
  readonly reviewId: string;
  readonly rawText: string;
  readonly ratingClaimed: string;
  readonly reviewerHandle: string;
}

/** Customer-provided free text (messages, notes, claims). */
export interface CustomerTextContent {
  readonly rawText: string;
  readonly channel: string;
}

/** Supplier-provided file payload (feed, document, attachment). */
export interface SupplierFileContent {
  readonly fileName: string;
  readonly mediaType: string;
  readonly storedArtifactRef: string;
}

/** Extracted web page content (browser connector observation). */
export interface WebPageExtractionContent {
  readonly url: string;
  readonly extractedText: string;
  readonly extractedStructure: string;
}

/** External document content (PDF, EDI document, invoice, etc.). */
export interface ExternalDocumentContent {
  readonly documentKind: string;
  readonly storedArtifactRef: string;
}

/** Marketplace message between counterparties. */
export interface MarketplaceMessageContent {
  readonly messageId: string;
  readonly rawText: string;
  readonly counterpartyHandle: string;
}

/** Live-commerce stream event payload (chat, bids, listings). */
export interface LiveStreamEventContent {
  readonly kind:
    | "listing-started"
    | "item-shown"
    | "price-changed"
    | "bid-placed"
    | "item-sold"
    | "viewer-message"
    | "stream-ended"
    | "other";
  readonly rawText: string;
  readonly actorHandle: string;
  readonly attachments: readonly string[];
}

/** Registry of untrusted content kinds (FROZEN §16) for discovery and tests. */
export const UNTRUSTED_CONTENT_KINDS: readonly {
  readonly kind: string;
  readonly payloadName: string;
  readonly plainLanguageDescription: string;
}[] = [
  { kind: "product-description", payloadName: "ProductDescriptionContent", plainLanguageDescription: "Text written by someone else about a product" },
  { kind: "review", payloadName: "ReviewContent", plainLanguageDescription: "Reviews from other people" },
  { kind: "customer-text", payloadName: "CustomerTextContent", plainLanguageDescription: "Messages and notes from customers" },
  { kind: "supplier-file", payloadName: "SupplierFileContent", plainLanguageDescription: "Files sent by suppliers" },
  { kind: "web-page", payloadName: "WebPageExtractionContent", plainLanguageDescription: "Content read from web pages" },
  { kind: "external-document", payloadName: "ExternalDocumentContent", plainLanguageDescription: "External documents and invoices" },
  { kind: "marketplace-message", payloadName: "MarketplaceMessageContent", plainLanguageDescription: "Messages from marketplaces" },
  { kind: "live-stream-event", payloadName: "LiveStreamEventContent", plainLanguageDescription: "What happens in live streams" },
];
