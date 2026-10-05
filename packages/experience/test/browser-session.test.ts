/**
 * Contract test 3 — BrowserSession isolation
 * (W3-001 §6.3, FROZEN §16, INVARIANTS 18/19/27/28/50).
 *
 * The boundary must make secret leakage impossible BY SHAPE:
 * - session handles carry no secret material;
 * - authorization scope is an explicit browser-route capability;
 * - a secret-carrying shape is NOT assignable to the boundary (compile-time);
 * - handle fixtures pass a runtime deep scan for secret-like keys/values.
 */

import { describe, expect, it } from "vitest";
import type {
  BrowserAuthorizationScope,
  BrowserSessionHandle,
} from "../src/connector/browser-session";
import type { Equal, Expect, Extends } from "./type-helpers";
import { partitionRef, routeCapability, sessionId, utc } from "./branded";

// A deliberately secret-carrying session shape.
interface SecretCarryingSession {
  sessionId: string;
  cookies: readonly string[];
  localStorage: Record<string, string>;
  authorizationHeader: string;
  mfaCode: string;
}

// Compile-time: the secret-carrying shape is not assignable to the handle
// (it cannot present the construction brand `handleKind`).
export type AssertSecretNotAssignable = Expect<Equal<Extends<SecretCarryingSession, BrowserSessionHandle>, false>>;

// Compile-time: a secret shape that happens to carry the brand key but the
// WRONG literal still fails.
interface ForgedBrandSession {
  handleKind: "definitely-not-isolated";
  sessionId: string;
  cookies: readonly string[];
}
export type AssertForgedNotAssignable = Expect<Equal<Extends<ForgedBrandSession, BrowserSessionHandle>, false>>;

// Compile-time: the handle is a CLOSED shape with exactly these fields.
export type AssertHandleKeys = Expect<
  Equal<
    keyof BrowserSessionHandle,
    "handleKind" | "sessionId" | "authorizationScope" | "isolation" | "lifecycle" | "issuedAt" | "expiresAt"
  >
>;

// Compile-time: the authorization scope is an explicit scoped capability.
export type AssertScopeKeys = Expect<
  Equal<
    keyof BrowserAuthorizationScope,
    "routeCapability" | "allowedOrigins" | "allowedActions" | "dataExfiltrationPolicy"
  >
>;

// Runtime deep scan: no key (at any depth) may look like secret material.
const SECRET_KEY_PATTERN =
  /password|passwd|api[-_]?key|accesstoken|refreshtoken|cookie|localstorage|sessionstorage|mfa|otp|privatekey|credential/i;

function findSecretLikeKeys(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) found.push(`${path}.${key}`);
      findSecretLikeKeys(nested, `${path}.${key}`, found);
    }
  }
}

// A valid handle fixture. In Stage 0 the Connector Runtime does not exist,
// so the construction brand is asserted locally; W3-002 will own the only
// real constructor.
const handle: BrowserSessionHandle = {
  handleKind: "isolated-browser-session",
  sessionId: sessionId("bs-session-1"),
  authorizationScope: {
    routeCapability: routeCapability("brcap-marketplace-backoffice"),
    allowedOrigins: ["https://provider.example"],
    allowedActions: ["navigate", "read-structure", "extract-content"],
    dataExfiltrationPolicy: "none-enters-model-context",
  },
  isolation: {
    partitionRef: partitionRef("partition-7"),
    stateScope: "session-scoped",
    materialPolicy: "secrets-never-enter-model-context-or-repository",
  },
  lifecycle: "active",
  issuedAt: utc("2026-10-05T02:34:37Z"),
  expiresAt: utc("2026-10-05T04:34:37Z"),
};

describe("BrowserSession isolation", () => {
  it("carries no secret-like keys at any depth (runtime scan)", () => {
    const found: string[] = [];
    findSecretLikeKeys(handle, "handle", found);
    expect(found).toEqual([]);
  });

  it("is an explicit scoped capability with pinned exfiltration policy", () => {
    expect(handle.authorizationScope.routeCapability).toBe("brcap-marketplace-backoffice");
    expect(handle.authorizationScope.allowedOrigins.length).toBeGreaterThan(0);
    expect(handle.authorizationScope.dataExfiltrationPolicy).toBe("none-enters-model-context");
    expect(handle.isolation.materialPolicy).toBe("secrets-never-enter-model-context-or-repository");
  });

  it("serializes to a secret-free representation (what context would see)", () => {
    const serialized = JSON.stringify(handle);
    expect(serialized).not.toMatch(SECRET_KEY_PATTERN);
    expect(serialized).toContain("none-enters-model-context");
    expect(handle.handleKind).toBe("isolated-browser-session");
  });

  it("the runtime scan actually catches smuggled secrets (guard sanity)", () => {
    const smuggler = { sessionId: "x", cookies: ["session=abc"], nested: { apiToken: "tok" } };
    const found: string[] = [];
    findSecretLikeKeys(smuggler, "smuggler", found);
    expect(found.length).toBeGreaterThan(0);
  });
});
