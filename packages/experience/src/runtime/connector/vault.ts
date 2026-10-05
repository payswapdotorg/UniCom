/**
 * Credential vaulting at the connector boundary
 * (FROZEN-ARCHITECTURE §16, INVARIANTS 27/50, W3-002 scope).
 *
 * Laws enforced by this runtime component:
 *
 * 1. Credential material that enters the connector runtime is SEALED here.
 *    The outside world only ever sees the canonical opaque `CredentialRef`
 *    handle owned by `@unicom/agent` (`model-context.ts` — never a second
 *    vocabulary).
 * 2. Sealed material has exactly ONE reader: the adapter execution boundary
 *    it was sealed for (`presentForAdapterExecution`). Presentation to any
 *    other adapter is refused.
 * 3. The vault's audit surface exposes counts, kinds and scopes — NEVER
 *    material. `containsSealedMaterial` performs a fail-closed deep VALUE
 *    scan so the model-context gate can prove absence of secret values, not
 *    just secret-shaped keys.
 *
 * In-memory by design for W3-002: the vault is a boundary component, not a
 * persistence layer; production storage wiring is a later deployment stage
 * and will not change these contracts.
 */

import { credentialRef, type CredentialRef } from "@unicom/agent";

/** Kinds of secret material the connector boundary may vault. */
export type CredentialMaterialKind =
  | "api-secret"
  | "password"
  | "cookie"
  | "browser-storage"
  | "mfa"
  | "token";

/** A credential entering the connector runtime, about to be sealed. */
export interface CredentialMaterialInput {
  readonly kind: CredentialMaterialKind;
  /** The secret itself. Exists only inside the vault after `seal`. */
  readonly material: string;
  /** The single adapter (opaque id) allowed to read it at execution time. */
  readonly forAdapterId: string;
  /** The connected account the credential belongs to (opaque ref). */
  readonly forAccountRef: string;
}

/** Audit-safe description of one sealed credential (counts, never material). */
export interface SealedCredentialAuditEntry {
  readonly sealedAt: string;
  readonly kind: CredentialMaterialKind;
  readonly forAdapterId: string;
  readonly forAccountRef: string;
  readonly presentations: number;
}

/** Thrown when presentation is attempted outside the sealed scope. */
export class CredentialPresentationRefused extends Error {
  constructor(reason: string) {
    super(`credential presentation refused: ${reason}`);
    this.name = "CredentialPresentationRefused";
  }
}

interface SealedRecord {
  readonly input: CredentialMaterialInput;
  readonly sealedAt: string;
  presentations: number;
}

export interface CredentialVault {
  /** Seal credential material; returns the canonical opaque handle. */
  seal(input: CredentialMaterialInput): CredentialRef;
  /**
   * Present sealed material to the adapter execution boundary — the only
   * sanctioned reader. Refused for any adapter other than the sealed scope.
   */
  presentForAdapterExecution(handle: CredentialRef, adapterId: string): string;
  /** Audit surface: counts and scopes only. Never material. */
  auditSurface(): readonly SealedCredentialAuditEntry[];
  /**
   * Fail-closed deep VALUE scan: does any sealed secret value occur anywhere
   * in `value` (objects, arrays, nested strings)? Used by the model-context
   * gate to prove secrets absent by value, not merely by key name.
   */
  containsSealedMaterial(value: unknown): boolean;
  /** Number of sealed credentials (audit aid). */
  readonly sealedCount: number;
}

export interface CredentialVaultOptions {
  /** Deterministic clock injection (tests supply fixed clocks). */
  readonly clock: () => string;
}

export function createCredentialVault(options: CredentialVaultOptions): CredentialVault {
  const sealed = new Map<CredentialRef, SealedRecord>();
  let sequence = 0;

  const vault: CredentialVault = {
    seal(input: CredentialMaterialInput): CredentialRef {
      sequence += 1;
      const handle = credentialRef(
        `vaulted-credential:${sequence}:${input.forAdapterId}:${input.forAccountRef}`,
      );
      sealed.set(handle, { input, sealedAt: options.clock(), presentations: 0 });
      return handle;
    },

    presentForAdapterExecution(handle: CredentialRef, adapterId: string): string {
      const record = sealed.get(handle);
      if (record === undefined) {
        throw new CredentialPresentationRefused("unknown credential handle");
      }
      if (record.input.forAdapterId !== adapterId) {
        throw new CredentialPresentationRefused(
          `handle sealed for adapter "${record.input.forAdapterId}", presented to "${adapterId}"`,
        );
      }
      record.presentations += 1;
      return record.input.material;
    },

    auditSurface(): readonly SealedCredentialAuditEntry[] {
      return [...sealed.values()].map((record) => ({
        sealedAt: record.sealedAt,
        kind: record.input.kind,
        forAdapterId: record.input.forAdapterId,
        forAccountRef: record.input.forAccountRef,
        presentations: record.presentations,
      }));
    },

    containsSealedMaterial(value: unknown): boolean {
      const secretValues: string[] = [];
      for (const record of sealed.values()) {
        if (record.input.material.length > 0) secretValues.push(record.input.material);
      }
      if (secretValues.length === 0) return false;
      return scanForValues(value, secretValues);
    },

    get sealedCount(): number {
      return sealed.size;
    },
  };
  return vault;
}

/** Depth-first scan for forbidden literal values. Cycles tolerated. */
function scanForValues(value: unknown, needles: readonly string[]): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      for (const needle of needles) {
        if (current.includes(needle)) return true;
      }
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const key of Object.keys(current)) {
      stack.push((current as Record<string, unknown>)[key]);
    }
  }
  return false;
}
