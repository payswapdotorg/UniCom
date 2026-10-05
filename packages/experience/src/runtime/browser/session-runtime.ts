/**
 * Browser session runtime with per-session isolation (W3-002;
 * FROZEN-ARCHITECTURE §16, INVARIANTS 19/28/50, W3-001 browser-session
 * boundary).
 *
 * Each session gets its own:
 * - IDENTITY: an opaque per-session identity ref — resolving identity is
 *   possible only through the session's own handle;
 * - STORAGE: a private storage partition resolved INTERNALLY from the
 *   handle. No API accepts a foreign partition ref, so no session can
 *   address another session's storage (same key names live in different
 *   partitions);
 * - AUTHORITY: an explicit `BrowserAuthorizationScope` (route capability,
 *   allowed origins, allowed actions) evaluated only against the session's
 *   own scope; expiry, suspension and closure are enforced.
 *
 * Handles are the W3-001 `BrowserSessionHandle` contract shape and are
 * constructed ONLY here ("handleKind" construction brand).
 * Browser material captured during automation (cookies, storage, MFA) is
 * sealed straight into the credential vault — it never appears on handles,
 * never enters model context, never reaches repository artifacts.
 */

import type {
  BrowserSessionAction,
  BrowserSessionHandle,
  BrowserAuthorizationScope,
  BrowserSessionLifecycle,
} from "../../connector/browser-session";
import type {
  BrowserRouteCapabilityRef,
  BrowserSessionId,
  PrincipalRef,
} from "../../common/opaque-refs";
import {
  asBrowserSessionId,
  asBrowserStoragePartitionRef,
  asUtcTimestamp,
} from "../ids";
import type { CredentialMaterialKind, CredentialVault } from "../connector/vault";

/** Thrown when an operation breaks session isolation or uses a dead session. */
export class BrowserSessionIsolationViolation extends Error {
  constructor(reason: string) {
    super(`browser session isolation violation: ${reason}`);
    this.name = "BrowserSessionIsolationViolation";
  }
}

/** Thrown when a handle fails validation (forged or malformed). */
export class InvalidBrowserSessionHandle extends Error {
  constructor(reason: string) {
    super(`invalid browser session handle: ${reason}`);
    this.name = "InvalidBrowserSessionHandle";
  }
}

/** Request to open an isolated browser session. */
export interface BrowserSessionOpenRequest {
  readonly principal: PrincipalRef;
  readonly routeCapability: BrowserRouteCapabilityRef;
  readonly allowedOrigins: readonly string[];
  readonly allowedActions: readonly BrowserSessionAction[];
  /** Lifetime in seconds; undefined means the session does not expire. */
  readonly ttlSeconds?: number;
}

/** Per-session identity (opaque, session-scoped, not a secret). */
export interface BrowserSessionIdentity {
  readonly identityRef: string;
  readonly principal: PrincipalRef;
  readonly sessionId: BrowserSessionId;
}

/** Result of an authorization check against a session's own scope. */
export interface BrowserAuthorizationDecision {
  readonly authorized: boolean;
  readonly reason: string;
}

/** Material captured from a browser session (secret — vaulted immediately). */
export interface BrowserMaterialCapture {
  readonly kind: Extract<CredentialMaterialKind, "cookie" | "browser-storage" | "mfa" | "token">;
  readonly value: string;
}

export interface BrowserSessionRuntimeOptions {
  readonly vault: CredentialVault;
  readonly clock: () => string;
  /** Adapter id of the browser connector boundary entitled to the material. */
  readonly browserAdapterId: string;
}

interface SessionRecord {
  readonly handle: BrowserSessionHandle;
  readonly identity: BrowserSessionIdentity;
  lifecycle: BrowserSessionLifecycle;
  readonly storage: Map<string, string>;
  readonly openedAt: string;
}

export interface BrowserSessionRuntime {
  openSession(request: BrowserSessionOpenRequest): BrowserSessionHandle;
  /** Read from THIS session's partition only (resolved from the handle). */
  readFromSession(handle: BrowserSessionHandle, key: string): string | undefined;
  /** Write to THIS session's partition only. */
  writeToSession(handle: BrowserSessionHandle, key: string, value: string): void;
  /** Resolve the identity of THIS session (handle-authenticated). */
  resolveIdentity(handle: BrowserSessionHandle): BrowserSessionIdentity;
  /** Authorize an action/origin against THIS session's scope and lifecycle. */
  authorizeAction(
    handle: BrowserSessionHandle,
    action: BrowserSessionAction,
    origin: string,
  ): BrowserAuthorizationDecision;
  /** Capture browser material into the vault; nothing is returned or exposed. */
  captureBrowserMaterial(handle: BrowserSessionHandle, capture: BrowserMaterialCapture): void;
  suspendSession(handle: BrowserSessionHandle): void;
  closeSession(handle: BrowserSessionHandle): void;
  /** Snapshot of storage KEYS (not values) for THIS session (audit view). */
  storageKeySummary(handle: BrowserSessionHandle): readonly string[];
  activeSessionCount(): number;
}

export function createBrowserSessionRuntime(
  options: BrowserSessionRuntimeOptions,
): BrowserSessionRuntime {
  const { vault, clock, browserAdapterId } = options;
  const sessions = new Map<BrowserSessionId, SessionRecord>();
  let sequence = 0;

  const validate = (handle: BrowserSessionHandle): SessionRecord => {
    if (handle.handleKind !== "isolated-browser-session") {
      throw new InvalidBrowserSessionHandle("missing construction brand");
    }
    const record = sessions.get(handle.sessionId);
    if (record === undefined) {
      throw new BrowserSessionIsolationViolation("session does not exist or was closed");
    }
    const now = clock();
    if (
      record.handle.expiresAt !== undefined &&
      Date.parse(record.handle.expiresAt) < Date.parse(now) &&
      record.lifecycle === "active"
    ) {
      record.lifecycle = "expired";
    }
    return record;
  };

  const assertActive = (record: SessionRecord): void => {
    if (record.lifecycle !== "active") {
      throw new BrowserSessionIsolationViolation(`session is ${record.lifecycle}`);
    }
  };

  const runtime: BrowserSessionRuntime = {
    openSession(request: BrowserSessionOpenRequest): BrowserSessionHandle {
      sequence += 1;
      const issuedAt = asUtcTimestamp(clock());
      const sessionId = asBrowserSessionId(`browser-session-${sequence}-${issuedAt}`);
      const partitionRef = asBrowserStoragePartitionRef(`partition-${sequence}-${sessionId}`);
      const scope: BrowserAuthorizationScope = {
        routeCapability: request.routeCapability,
        allowedOrigins: request.allowedOrigins,
        allowedActions: request.allowedActions,
        dataExfiltrationPolicy: "none-enters-model-context",
      };
      const expiresAt =
        request.ttlSeconds === undefined
          ? undefined
          : asUtcTimestamp(
              new Date(Date.parse(issuedAt) + request.ttlSeconds * 1000).toISOString(),
            );
      const handle: BrowserSessionHandle = {
        handleKind: "isolated-browser-session",
        sessionId,
        authorizationScope: scope,
        isolation: {
          partitionRef,
          stateScope: "session-scoped",
          materialPolicy: "secrets-never-enter-model-context-or-repository",
        },
        lifecycle: "active",
        issuedAt,
        expiresAt,
      };
      const identity: BrowserSessionIdentity = {
        identityRef: `browser-identity-${sequence}-${sessionId}`,
        principal: request.principal,
        sessionId,
      };
      sessions.set(sessionId, {
        handle,
        identity,
        lifecycle: "active",
        storage: new Map<string, string>(),
        openedAt: issuedAt,
      });
      return handle;
    },

    readFromSession(handle: BrowserSessionHandle, key: string): string | undefined {
      const record = validate(handle);
      assertActive(record);
      return record.storage.get(key);
    },

    writeToSession(handle: BrowserSessionHandle, key: string, value: string): void {
      const record = validate(handle);
      assertActive(record);
      record.storage.set(key, value);
    },

    resolveIdentity(handle: BrowserSessionHandle): BrowserSessionIdentity {
      const record = validate(handle);
      return record.identity;
    },

    authorizeAction(
      handle: BrowserSessionHandle,
      action: BrowserSessionAction,
      origin: string,
    ): BrowserAuthorizationDecision {
      let record: SessionRecord;
      try {
        record = validate(handle);
      } catch (error) {
        return { authorized: false, reason: error instanceof Error ? error.message : "invalid handle" };
      }
      if (record.lifecycle !== "active") {
        return { authorized: false, reason: `session is ${record.lifecycle}` };
      }
      if (!record.handle.authorizationScope.allowedActions.includes(action)) {
        return { authorized: false, reason: `action "${action}" is not granted to this session` };
      }
      if (!record.handle.authorizationScope.allowedOrigins.includes(origin)) {
        return { authorized: false, reason: `origin "${origin}" is not allowed for this session` };
      }
      return { authorized: true, reason: "within the session's own scope" };
    },

    captureBrowserMaterial(handle: BrowserSessionHandle, capture: BrowserMaterialCapture): void {
      const record = validate(handle);
      assertActive(record);
      // Sealed immediately against the browser connector boundary; the
      // return value is deliberately discarded — nothing is exposed.
      vault.seal({
        kind: capture.kind,
        material: capture.value,
        forAdapterId: browserAdapterId,
        forAccountRef: record.identity.identityRef,
      });
    },

    suspendSession(handle: BrowserSessionHandle): void {
      const record = validate(handle);
      record.lifecycle = "suspended";
    },

    closeSession(handle: BrowserSessionHandle): void {
      const record = validate(handle);
      record.lifecycle = "closed";
      // Storage is purged with the session: no cross-session residue.
      record.storage.clear();
      sessions.delete(handle.sessionId);
    },

    storageKeySummary(handle: BrowserSessionHandle): readonly string[] {
      const record = validate(handle);
      return [...record.storage.keys()];
    },

    activeSessionCount(): number {
      let count = 0;
      for (const record of sessions.values()) {
        if (record.lifecycle === "active") count += 1;
      }
      return count;
    },
  };
  return runtime;
}
