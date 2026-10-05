/**
 * Untrusted-content sanitization at every render/ingest boundary
 * (FROZEN-ARCHITECTURE §16, INVARIANT 26, W3-002 scope).
 *
 * Third-party commerce content — product descriptions, reviews, customer
 * text, supplier files, web pages, external documents, marketplace messages,
 * live-stream events — is DATA, never trusted instructions. This module is
 * the deterministic neutralizer every ingest and render boundary routes
 * through:
 *
 * - removes script-bearing and embedding markup (script/iframe/object/embed
 *   blocks and tags, meta-refresh/base/link/form tags);
 * - strips event-handler attributes (`on…="…"`);
 * - neutralizes dangerous URL schemes (`javascript:`, `vbscript:`,
 *   `data:text/html`);
 * - strips control characters;
 * - escapes remaining angle brackets so leftover markup is inert text.
 *
 * Sanitized output REMAINS `UntrustedCommerceContent` branded data:
 * sanitization makes content inert, it never makes it trusted. Text-level
 * instruction smuggling (e.g. "ignore all instructions") survives as inert
 * data — the type brands, not deletion, keep it out of instruction slots.
 */

import type { UntrustedCommerceContent } from "../../common/untrusted";
import type { ConnectorTransportId } from "../../connector/transports";

/** An inbound third-party payload arriving over a connector transport. */
export interface UntrustedIngestPayload {
  /** Content kind (see UNTRUSTED_CONTENT_KINDS). */
  readonly kind: string;
  readonly rawText: string;
  readonly sourceTransportId: ConnectorTransportId;
}

/** Sanitized text payload — still untrusted data. */
export interface SanitizedTextContent {
  readonly inertText: string;
}

/** One neutralization applied at the boundary (evidence, no payloads). */
export interface NeutralizationRecord {
  readonly kind:
    | "script-or-embed-block"
    | "dangerous-tag"
    | "event-handler-attribute"
    | "dangerous-url-scheme"
    | "control-characters"
    | "escaped-markup";
  readonly detail: string;
}

/** Result of sanitizing one untrusted payload. */
export interface SanitizedIngestResult {
  readonly sanitized: UntrustedCommerceContent<SanitizedTextContent>;
  readonly neutralized: readonly NeutralizationRecord[];
  readonly changed: boolean;
}

const PAIRED_DANGEROUS_ELEMENTS = /<\s*(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_TAGS = /<\s*\/?\s*(script|iframe|object|embed|base|link|meta|form|svg)\b[^>]*>/gi;
const EVENT_HANDLER_ATTRIBUTES = /\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URL_SCHEMES = /\b(javascript|vbscript)\s*:/gi;
const DANGEROUS_DATA_URLS = /\bdata\s*:\s*text\/html/gi;
// Assembled from escape tokens so the source carries no literal control
// characters. The class is intentionally inclusive: C0 minus tab/LF plus
// DEL — fail-closed against steganographic control smuggling.
const CONTROL_CHARACTER_CLASS = ["\\u0000-\\u0008", "\\u000B", "\\u000C", "\\u000E-\\u001F", "\\u007F"].join("");
const CONTROL_CHARACTERS = new RegExp(`[${CONTROL_CHARACTER_CLASS}]`, "g");

function countMatches(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...source.matchAll(new RegExp(pattern.source, flags))].length;
}

/** Neutralize raw third-party text into inert text. Deterministic. */
export function sanitizeUntrustedText(rawText: string): {
  inertText: string;
  neutralized: readonly NeutralizationRecord[];
} {
  const neutralized: NeutralizationRecord[] = [];
  let text = rawText;

  const scriptBlocks = countMatches(text, PAIRED_DANGEROUS_ELEMENTS);
  if (scriptBlocks > 0) {
    neutralized.push({ kind: "script-or-embed-block", detail: `${scriptBlocks} block(s) removed` });
    text = text.replace(PAIRED_DANGEROUS_ELEMENTS, "");
  }

  const dangerousTags = countMatches(text, DANGEROUS_TAGS);
  if (dangerousTags > 0) {
    neutralized.push({ kind: "dangerous-tag", detail: `${dangerousTags} tag(s) removed` });
    text = text.replace(DANGEROUS_TAGS, "");
  }

  const handlers = countMatches(text, EVENT_HANDLER_ATTRIBUTES);
  if (handlers > 0) {
    neutralized.push({ kind: "event-handler-attribute", detail: `${handlers} handler(s) removed` });
    text = text.replace(EVENT_HANDLER_ATTRIBUTES, "");
  }

  const schemes = countMatches(text, DANGEROUS_URL_SCHEMES);
  const dataUrls = countMatches(text, DANGEROUS_DATA_URLS);
  if (schemes + dataUrls > 0) {
    neutralized.push({ kind: "dangerous-url-scheme", detail: `${schemes + dataUrls} URL(s) neutralized` });
    text = text.replace(DANGEROUS_URL_SCHEMES, "neutralized-scheme:").replace(DANGEROUS_DATA_URLS, "neutralized-data:");
  }

  const controlChars = countMatches(text, CONTROL_CHARACTERS);
  if (controlChars > 0) {
    neutralized.push({ kind: "control-characters", detail: `${controlChars} control char(s) stripped` });
    text = text.replace(CONTROL_CHARACTERS, "");
  }

  if (text.includes("<") || text.includes(">")) {
    neutralized.push({ kind: "escaped-markup", detail: "remaining angle brackets escaped" });
    text = text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  return { inertText: text, neutralized };
}

/**
 * The runtime-sanctioned constructor for `UntrustedCommerceContent` wrappers
 * (W3-001 tests cast locally; from W3-002 this is the real constructor).
 * Wrapping is cast-only branding — the payload stays inert data.
 */
export function wrapUntrusted<T extends object>(payload: T): UntrustedCommerceContent<T> {
  return payload as UntrustedCommerceContent<T>;
}

/** Ingest one untrusted payload at a transport boundary. Always sanitized. */
export function ingestUntrustedPayload(payload: UntrustedIngestPayload): SanitizedIngestResult {
  const { inertText, neutralized } = sanitizeUntrustedText(payload.rawText);
  return {
    sanitized: wrapUntrusted({ inertText }),
    neutralized,
    changed: neutralized.length > 0,
  };
}

/** Render boundary: re-sanitize already-wrapped content before display. */
export function renderUntrustedAsInertText(
  content: UntrustedCommerceContent<{ rawText?: string; inertText?: string }>,
): string {
  const raw = content.inertText ?? content.rawText ?? "";
  return sanitizeUntrustedText(raw).inertText;
}
