/**
 * Runtime test — browser session per-session isolation
 * (W3-002 acceptance scenario 2; FROZEN §16, INVARIANTS 19/28/50).
 *
 * Two CONCURRENT browser sessions cannot read each other's storage,
 * identity or authority. Browser material captured during automation is
 * vaulted and provably absent from handles. The runtime is the only
 * constructor of `BrowserSessionHandle` shapes (construction brand).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createBrowserSessionRuntime,
  type BrowserSessionRuntime,
} from "../src/runtime/browser/session-runtime";
import { createCredentialVault, type CredentialVault } from "../src/runtime/connector/vault";
import { asPrincipalRef, asBrowserRouteCapabilityRef } from "../src/runtime/ids";
import { fixedClock, resetClock } from "./doubles";

const CLOCK_BASE = "2026-10-05T11:00:00Z";
const BROWSER_ADAPTER = "browser-connector-boundary";

function buildRuntime(): { sessions: BrowserSessionRuntime; vault: CredentialVault } {
  const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
  const sessions = createBrowserSessionRuntime({
    vault,
    clock: fixedClock(CLOCK_BASE),
    browserAdapterId: BROWSER_ADAPTER,
  });
  return { sessions, vault };
}

const openSessionA = (sessions: BrowserSessionRuntime) =>
  sessions.openSession({
    principal: asPrincipalRef("principal-alpha"),
    routeCapability: asBrowserRouteCapabilityRef("brcap-marketplace-alpha"),
    allowedOrigins: ["https://alpha.example"],
    allowedActions: ["navigate", "read-structure", "extract-content"],
  });

const openSessionB = (sessions: BrowserSessionRuntime) =>
  sessions.openSession({
    principal: asPrincipalRef("principal-beta"),
    routeCapability: asBrowserRouteCapabilityRef("brcap-marketplace-beta"),
    allowedOrigins: ["https://beta.example"],
    allowedActions: ["navigate", "fill-form"],
  });

describe("browser session isolation (two concurrent sessions)", () => {
  beforeEach(() => resetClock());

  it("two concurrent sessions exist simultaneously with distinct ids and partitions", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    const b = openSessionB(sessions);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.isolation.partitionRef).not.toBe(b.isolation.partitionRef);
    expect(sessions.activeSessionCount()).toBe(2);
  });

  it("STORAGE: same key in two sessions holds different values; neither can read the other's", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    const b = openSessionB(sessions);
    sessions.writeToSession(a, "cart", "session-alpha-cart-value");
    sessions.writeToSession(b, "cart", "session-beta-cart-value");
    // Each session reads its own partition only.
    expect(sessions.readFromSession(a, "cart")).toBe("session-alpha-cart-value");
    expect(sessions.readFromSession(b, "cart")).toBe("session-beta-cart-value");
    // A key B never wrote reads as absent for B — and vice versa.
    sessions.writeToSession(a, "alpha-only", "secret-alpha");
    expect(sessions.readFromSession(b, "alpha-only")).toBeUndefined();
    expect(sessions.readFromSession(a, "alpha-only")).toBe("secret-alpha");
    // Storage key summaries are partition-scoped.
    expect(sessions.storageKeySummary(a)).toEqual(["cart", "alpha-only"]);
    expect(sessions.storageKeySummary(b)).toEqual(["cart"]);
  });

  it("IDENTITY: resolving identity is handle-authenticated and per-session", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    const b = openSessionB(sessions);
    const identityA = sessions.resolveIdentity(a);
    const identityB = sessions.resolveIdentity(b);
    expect(identityA.identityRef).not.toBe(identityB.identityRef);
    expect(identityA.principal).toBe("principal-alpha");
    expect(identityB.principal).toBe("principal-beta");
    expect(identityA.sessionId).toBe(a.sessionId);
    expect(identityB.sessionId).toBe(b.sessionId);
  });

  it("AUTHORITY: each session's scope is its own; cross-scope requests are denied", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    const b = openSessionB(sessions);
    // Own scope: allowed.
    expect(sessions.authorizeAction(a, "navigate", "https://alpha.example").authorized).toBe(true);
    // B's handle cannot exercise A's authority (origin not in B's scope).
    expect(sessions.authorizeAction(b, "navigate", "https://alpha.example").authorized).toBe(false);
    // A's handle cannot exercise B's authority (action not granted to A).
    expect(sessions.authorizeAction(a, "fill-form", "https://alpha.example").authorized).toBe(false);
    // B acting within its own scope: allowed.
    expect(sessions.authorizeAction(b, "fill-form", "https://beta.example").authorized).toBe(true);
  });

  it("MATERIAL: captured browser storage is vaulted and absent from the handle (secret scan)", () => {
    const { sessions, vault } = buildRuntime();
    const a = openSessionA(sessions);
    sessions.captureBrowserMaterial(a, { kind: "cookie", value: "session-cookie-alpha-xyz" });
    sessions.captureBrowserMaterial(a, { kind: "browser-storage", value: "localStorage-blob-alpha" });
    // The handle deep-scan: no cookie/storage value anywhere.
    const serialized = JSON.stringify(a);
    expect(serialized).not.toContain("session-cookie-alpha-xyz");
    expect(serialized).not.toContain("localStorage-blob-alpha");
    // The vault holds exactly the two sealed browser materials.
    expect(vault.sealedCount).toBe(2);
    expect(vault.auditSurface().every((entry) => entry.forAdapterId === BROWSER_ADAPTER)).toBe(true);
    // The vault's own value scan catches the material if it ever leaks into a payload.
    expect(vault.containsSealedMaterial({ note: "harmless" })).toBe(false);
    expect(vault.containsSealedMaterial({ note: "leaked session-cookie-alpha-xyz" })).toBe(true);
  });

  it("closed sessions lose storage, identity and authority (no residue)", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    sessions.writeToSession(a, "cart", "alpha-cart");
    sessions.closeSession(a);
    expect(sessions.activeSessionCount()).toBe(0);
    expect(() => sessions.readFromSession(a, "cart")).toThrow();
    expect(() => sessions.resolveIdentity(a)).toThrow();
    expect(sessions.authorizeAction(a, "navigate", "https://alpha.example").authorized).toBe(false);
  });

  it("suspended sessions refuse storage access and authority until they are gone", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    sessions.suspendSession(a);
    expect(() => sessions.readFromSession(a, "cart")).toThrow("suspended");
    expect(sessions.authorizeAction(a, "navigate", "https://alpha.example").authorized).toBe(false);
  });

  it("forged handles are rejected: wrong construction brand never reaches session state", () => {
    const { sessions } = buildRuntime();
    const real = openSessionA(sessions);
    // The forged shape is deliberately NOT assignable to the handle type
    // (compile-time law); we bypass the type with a runtime cast to prove
    // the runtime refuses forged brands at run time too.
    const forged = { ...real, handleKind: "definitely-not-isolated" } as unknown as typeof real;
    expect(() => sessions.readFromSession(forged, "cart")).toThrow(/construction brand/);
    expect(sessions.authorizeAction(forged, "navigate", "https://alpha.example").authorized).toBe(false);
  });

  it("expired sessions are denied authority (ttl enforced by the runtime clock)", () => {
    const { sessions } = buildRuntime();
    const short = sessions.openSession({
      principal: asPrincipalRef("principal-gamma"),
      routeCapability: asBrowserRouteCapabilityRef("brcap-gamma"),
      allowedOrigins: ["https://gamma.example"],
      allowedActions: ["navigate"],
      ttlSeconds: 1,
    });
    expect(sessions.authorizeAction(short, "navigate", "https://gamma.example").authorized).toBe(true);
    // Fixed clock ticks once per call; after enough ticks the session expires.
    for (let tick = 0; tick < 5; tick += 1) sessions.storageKeySummary(short);
    expect(sessions.authorizeAction(short, "navigate", "https://gamma.example").authorized).toBe(false);
  });

  it("handles satisfy the W3-001 contract shape with pinned exfiltration policy", () => {
    const { sessions } = buildRuntime();
    const a = openSessionA(sessions);
    expect(a.handleKind).toBe("isolated-browser-session");
    expect(a.authorizationScope.dataExfiltrationPolicy).toBe("none-enters-model-context");
    expect(a.isolation.materialPolicy).toBe("secrets-never-enter-model-context-or-repository");
    expect(a.isolation.stateScope).toBe("session-scoped");
    expect(a.lifecycle).toBe("active");
  });
});
