/**
 * BrowserSession isolation boundary
 * (FROZEN-ARCHITECTURE §16, INVARIANTS 18/19/27/28/50, W3-001 §3).
 *
 * Laws enforced by this boundary's SHAPE:
 *
 * 1. A BrowserSessionHandle carries NO secret material. It consists only of
 *    an opaque session id, an explicit authorization scope, isolation
 *    metadata and lifecycle state. There is no field that can hold cookies,
 *    tokens, passwords, MFA material or browser storage contents.
 * 2. Browser routes are EXPLICIT scoped capabilities: the scope references
 *    an opaque browser-route capability, allowed origins and allowed actions,
 *    and pins an exfiltration policy of "none-enters-model-context".
 * 3. Credentials, cookies, MFA material and browser storage NEVER enter
 *    model context or repository artifacts. The `materialPolicy` literal
 *    makes this a type-level fact; the secret vault itself lives outside
 *    this package (Connector Runtime, W3-002).
 *
 * The contract test suite asserts that secret-carrying shapes are NOT
 * assignable to this boundary (compile-time) and that handle fixtures carry
 * no secret-like keys or values (runtime deep scan).
 */

import type {
  BrowserRouteCapabilityRef,
  BrowserSessionId,
  BrowserStoragePartitionRef,
  PrincipalRef,
} from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** Actions a browser session may perform (explicitly granted only). */
export type BrowserSessionAction =
  | "navigate"
  | "read-structure"
  | "extract-content"
  | "fill-form"
  | "click"
  | "authenticate"
  | "download-file"
  | "upload-file";

/** Explicit scoped capability for a browser route (INVARIANT 28). */
export interface BrowserAuthorizationScope {
  readonly routeCapability: BrowserRouteCapabilityRef;
  readonly allowedOrigins: readonly string[];
  readonly allowedActions: readonly BrowserSessionAction[];
  readonly dataExfiltrationPolicy: "none-enters-model-context";
}

/** Isolation metadata for the session (no material, only policy + refs). */
export interface BrowserSessionIsolation {
  readonly partitionRef: BrowserStoragePartitionRef;
  readonly stateScope: "session-scoped";
  readonly materialPolicy: "secrets-never-enter-model-context-or-repository";
}

/** Lifecycle of an isolated browser session (UNKNOWN preserved). */
export type BrowserSessionLifecycle =
  | "requested"
  | "authorizing"
  | "active"
  | "suspended"
  | "expired"
  | "closed"
  | "unknown";

/**
 * The isolated browser session handle. CLOSED shape: exactly these fields.
 * Secret-carrying shapes are not assignable to it because it is branded and
 * carries no open-ended fields.
 */
export interface BrowserSessionHandle {
  readonly sessionId: BrowserSessionId;
  readonly authorizationScope: BrowserAuthorizationScope;
  readonly isolation: BrowserSessionIsolation;
  readonly lifecycle: BrowserSessionLifecycle;
  readonly issuedAt: UtcIso8601String;
  readonly expiresAt?: UtcIso8601String;
}

/** A grant of browser session authority to a principal. */
export interface BrowserSessionGrant {
  readonly grantId: string;
  readonly sessionRef: BrowserSessionId;
  readonly scope: BrowserAuthorizationScope;
  readonly grantedTo: PrincipalRef;
  readonly grantedAt: UtcIso8601String;
  readonly expiresAt: UtcIso8601String;
  readonly revocable: true;
}

/** What a browser connector must display when no API route exists. */
export interface BrowserConnectorDisclosure {
  readonly providerHasNoApiRoute: boolean;
  readonly userAuthorizationRequired: true;
  readonly sessionInteractionRequired: true;
  readonly userFacingNote: string;
}
