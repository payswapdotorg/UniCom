/**
 * Model-context safety and untrusted-content contracts
 * (FROZEN-ARCHITECTURE §16; invariants 26/27/50).
 *
 * - Third-party commerce content is data, never trusted instructions.
 * - Credentials, cookies, MFA material and browser storage never enter
 *   model-context-shaped types. The gate below fails closed at both the
 *   type level and the runtime level.
 */

import { type Brand, brandRef } from "./common.js";

/** Kinds of third-party commerce content — all untrusted. */
export type UntrustedContentKind =
  | "product-description"
  | "review"
  | "customer-message"
  | "supplier-file"
  | "web-page"
  | "external-document"
  | "marketplace-message"
  | "provider-response";

/** Untrusted third-party content: data only, never instructions. */
export interface UntrustedContent {
  readonly origin: "third-party";
  readonly kind: UntrustedContentKind;
  readonly data: string;
}

/** The only sources instructions may originate from. */
export type TrustedInstructionSource =
  | "platform-policy"
  | "merchant-policy"
  | "authenticated-principal"
  | "approved-tool-contract";

/** Trusted instruction with an explicit declared source. */
export interface TrustedInstruction {
  readonly source: TrustedInstructionSource;
  readonly instruction: string;
}

export function isTrustedInstruction(value: unknown): value is TrustedInstruction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { source?: unknown; instruction?: unknown; origin?: unknown };
  return candidate.origin === undefined &&
    typeof candidate.instruction === "string" &&
    (candidate.source === "platform-policy" ||
      candidate.source === "merchant-policy" ||
      candidate.source === "authenticated-principal" ||
      candidate.source === "approved-tool-contract");
}

/**
 * Opaque credential-scope descriptor (space-separated scope tokens, e.g.
 * "orders.read orders.write"). A descriptor, never credential material.
 */
export type CredentialScope = Brand<string, "CredentialScope">;

/** Opaque handle to credential material held behind the capability boundary. */
export type CredentialRef = Brand<string, "CredentialRef">;

export function credentialScope(value: string): CredentialScope {
  return brandRef(value, "CredentialScope");
}

export function credentialRef(value: string): CredentialRef {
  return brandRef(value, "CredentialRef");
}

/** Parse a credential scope into its tokens. */
export function credentialScopeTokens(scope: CredentialScope): readonly string[] {
  return scope.split(/\s+/).filter((token) => token.length > 0);
}

/** Deterministic scope sufficiency: every required token is granted. */
export function credentialScopeSatisfies(granted: CredentialScope, required: CredentialScope): boolean {
  const grantedSet = new Set(credentialScopeTokens(granted));
  return credentialScopeTokens(required).every((token) => grantedSet.has(token));
}

/**
 * Key shapes that must never appear on model-context material. Matched
 * conservatively (fail-closed): handles such as credentialRef are also
 * rejected from model context.
 */
export type SuspectCredentialKey =
  | "credential"
  | "credentials"
  | "cookie"
  | "cookies"
  | "sessionCookie"
  | "token"
  | "accessToken"
  | "refreshToken"
  | "secret"
  | "secretKey"
  | "password"
  | "passphrase"
  | "mfa"
  | "mfaCode"
  | "otp"
  | "browserStorage"
  | `credential${string}`;

/**
 * Structural credential rejection: a type carrying any suspect key collapses
 * to `never`, making credential-bearing values unpassable at the gate.
 */
export type RejectSuspectCredentialKeys<T> = Extract<keyof T, SuspectCredentialKey> extends never ? T : never;

/** Audited, credential-free material cleared for model context. */
export interface ModelContextMaterial {
  readonly clearedAt: string;
  readonly content: Readonly<Record<string, unknown>>;
}

/**
 * The only sanctioned gate into model context. Type-level: credential-bearing
 * shapes cannot be passed. Runtime: a deep fail-closed scanner double-checks.
 */
export function toModelContextMaterial<T extends object>(
  material: RejectSuspectCredentialKeys<T>,
  clearedAt: string,
): ModelContextMaterial {
  assertNoCredentialMaterial(material);
  return { clearedAt, content: { ...(material as Record<string, unknown>) } };
}

const SUSPECT_KEY_PATTERN = /credential|cookie|token|secret|password|passphrase|\bmfa\b|\botp\b|browserstorage|sessionid/i;

/**
 * Deep, fail-closed scanner: throws as soon as any object key anywhere in
 * the value looks like credential material. Cycles are tolerated.
 */
export function assertNoCredentialMaterial(value: unknown): void {
  const seen = new Set<unknown>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current !== "object" || current === null) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const key of Object.keys(current)) {
      if (SUSPECT_KEY_PATTERN.test(key)) {
        throw new Error(`credential-shaped material is not allowed in model context: key "${key}"`);
      }
      stack.push((current as Record<string, unknown>)[key]);
    }
  }
}
