/**
 * Immune actions: quarantine/suspension as REVERSIBLE capability attenuation
 * (W2-004 scenario 3; FROZEN-ARCHITECTURE §3.H; invariants 5/24/48).
 *
 * Laws:
 * - Quarantine/suspension ATTENUATES capabilities — it never deletes
 *   anything: the action ledger is APPEND-ONLY and hash-chained (same chain
 *   discipline as the W2-003 promotion log); every action record cites its
 *   justifying evidence and the security decision behind it.
 * - Release/resume is the REVERSAL: it appends a new record that restores
 *   the attenuated scope. The quarantine record stays in history forever —
 *   the principal's ledger history is append-only, never rewritten.
 * - Attenuation is capability-SCOPED from the ONE canonical vocabulary
 *   (scope validated by the caller against the vocabulary; ids only).
 * - Deterministic: the active attenuation state is a pure fold over the
 *   ledger in sequence order — identical ledgers produce identical state.
 */

import type { PrincipalRef } from "./common.js";
import { structuralHash } from "./lab-promotion.js";
import type { EvidenceCitation } from "./evidence-journal.js";

export type ImmuneActionKind = "QUARANTINE" | "SUSPEND" | "RELEASE" | "RESUME";

/** The capability scope an action attenuates or restores. */
export type CapabilityAttenuationScope =
  | { readonly kind: "CAPABILITY_SET"; readonly capabilityDefinitionIds: readonly string[] }
  | { readonly kind: "ALL_CAPABILITIES" };

/** One append-only immune action. Content-hashed, chained to its predecessor. */
export interface ImmuneActionRecord {
  readonly sequence: number;
  readonly actionId: string;
  readonly action: ImmuneActionKind;
  readonly principalRef: PrincipalRef;
  readonly scope: CapabilityAttenuationScope;
  /** The deterministic security decision that justifies this action. */
  readonly decisionRef: string;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly actedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

export type ImmuneActionViolation =
  | "DUPLICATE_ACTION_ID"
  | "EMPTY_CAPABILITY_SCOPE"
  | "ALREADY_ATTENUATED"
  | "NOT_ATTENUATED"
  | "MALFORMED_SCOPE"
  /** Emitted by the immune system's vocabulary pre-check (one vocabulary law). */
  | "CAPABILITY_NOT_IN_CANONICAL_VOCABULARY";

export type ImmuneActionOutcome =
  | { readonly ok: true; readonly record: ImmuneActionRecord }
  | { readonly ok: false; readonly violation: ImmuneActionViolation; readonly detail: string };

/** An attenuation currently in force (deterministic fold of the ledger). */
export interface ActiveAttenuation {
  readonly principalRef: PrincipalRef;
  readonly scope: CapabilityAttenuationScope;
  readonly sinceActionId: string;
}

function actionRecordHash(record: Omit<ImmuneActionRecord, "recordHash">): string {
  return structuralHash({ ...record, recordHash: undefined });
}

function isValidScope(scope: CapabilityAttenuationScope): boolean {
  if (scope.kind === "ALL_CAPABILITIES") return true;
  return Array.isArray(scope.capabilityDefinitionIds) &&
    scope.capabilityDefinitionIds.length > 0 &&
    scope.capabilityDefinitionIds.every((id) => typeof id === "string" && id.length > 0);
}

function scopeIds(scope: CapabilityAttenuationScope): readonly string[] {
  return scope.kind === "ALL_CAPABILITIES" ? [] : [...scope.capabilityDefinitionIds].sort();
}

function scopesOverlap(left: CapabilityAttenuationScope, right: CapabilityAttenuationScope): boolean {
  if (left.kind === "ALL_CAPABILITIES" || right.kind === "ALL_CAPABILITIES") return true;
  const rightIds = new Set(scopeIds(right));
  return scopeIds(left).some((id) => rightIds.has(id));
}

function isAttenuating(action: ImmuneActionKind): boolean {
  return action === "QUARANTINE" || action === "SUSPEND";
}

function isRestoring(action: ImmuneActionKind): boolean {
  return action === "RELEASE" || action === "RESUME";
}

/**
 * The append-only immune action ledger. Quarantine/suspend and release/resume
 * both APPEND; there is no mutation or removal path. Active attenuation is a
 * deterministic fold — records() and historyFor() return copies.
 */
export class QuarantineLedger {
  private readonly entries: ImmuneActionRecord[] = [];
  private readonly actionIds = new Set<string>();

  /** Append a QUARANTINE/SUSPEND action (attenuation). */
  quarantine(input: {
    readonly actionId: string;
    readonly action: "QUARANTINE" | "SUSPEND";
    readonly principalRef: PrincipalRef;
    readonly scope: CapabilityAttenuationScope;
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly actedAt: string;
  }): ImmuneActionOutcome {
    return this.append({ ...input, action: input.action });
  }

  /** Append a RELEASE/RESUME action (reversal — restores attenuated scope). */
  release(input: {
    readonly actionId: string;
    readonly action: "RELEASE" | "RESUME";
    readonly principalRef: PrincipalRef;
    readonly scope: CapabilityAttenuationScope;
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly actedAt: string;
  }): ImmuneActionOutcome {
    return this.append({ ...input, action: input.action });
  }

  private append(input: {
    readonly actionId: string;
    readonly action: ImmuneActionKind;
    readonly principalRef: PrincipalRef;
    readonly scope: CapabilityAttenuationScope;
    readonly decisionRef: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly actedAt: string;
  }): ImmuneActionOutcome {
    if (typeof input.actionId !== "string" || input.actionId.length === 0) {
      return { ok: false, violation: "MALFORMED_SCOPE", detail: "actionId must be a non-empty string" };
    }
    if (this.actionIds.has(input.actionId)) {
      return { ok: false, violation: "DUPLICATE_ACTION_ID", detail: `immune action already recorded: ${input.actionId} (append-only ledger)` };
    }
    if (!isValidScope(input.scope)) {
      return { ok: false, violation: "EMPTY_CAPABILITY_SCOPE", detail: "capability attenuation scope must be ALL_CAPABILITIES or a non-empty capability id set" };
    }
    const active = this.activeAttenuationsFor(input.principalRef.principalId);
    if (isAttenuating(input.action)) {
      if (active.some((attenuation) => scopesOverlap(attenuation.scope, input.scope))) {
        return {
          ok: false,
          violation: "ALREADY_ATTENUATED",
          detail: `principal ${input.principalRef.principalId} already has an overlapping active attenuation (${active.map((entry) => entry.sinceActionId).join(", ")})`,
        };
      }
    } else if (isRestoring(input.action)) {
      if (!active.some((attenuation) => scopesOverlap(attenuation.scope, input.scope))) {
        return {
          ok: false,
          violation: "NOT_ATTENUATED",
          detail: `principal ${input.principalRef.principalId} has no active attenuation matching the release scope`,
        };
      }
    } else {
      return { ok: false, violation: "MALFORMED_SCOPE", detail: `unknown immune action: ${String(input.action)}` };
    }

    const predecessor = this.entries[this.entries.length - 1];
    const base: Omit<ImmuneActionRecord, "recordHash"> = {
      sequence: this.entries.length + 1,
      actionId: input.actionId,
      action: input.action,
      principalRef: input.principalRef,
      scope: input.scope,
      decisionRef: input.decisionRef,
      evidenceCitations: [...input.evidenceCitations].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0)),
      actedAt: input.actedAt,
      prevRecordHash: predecessor === undefined ? "genesis" : predecessor.recordHash,
    };
    const record: ImmuneActionRecord = { ...base, recordHash: actionRecordHash(base) };
    this.actionIds.add(input.actionId);
    this.entries.push(record);
    return { ok: true, record: { ...record } };
  }

  /** Active attenuations for a principal (deterministic fold, copies). */
  activeAttenuationsFor(principalId: string): readonly ActiveAttenuation[] {
    const active: ActiveAttenuation[] = [];
    for (const record of this.entries) {
      if (record.principalRef.principalId !== principalId) continue;
      if (isAttenuating(record.action)) {
        active.push({ principalRef: record.principalRef, scope: record.scope, sinceActionId: record.actionId });
      } else if (isRestoring(record.action)) {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (scopesOverlap((active[index] as ActiveAttenuation).scope, record.scope)) active.splice(index, 1);
        }
      }
    }
    return active;
  }

  /** True while a capability is attenuated for a principal (never by default). */
  isAttenuated(principalId: string, capabilityDefinitionId: string): boolean {
    return this.activeAttenuationsFor(principalId).some((attenuation) => {
      if (attenuation.scope.kind === "ALL_CAPABILITIES") return true;
      return attenuation.scope.capabilityDefinitionIds.includes(capabilityDefinitionId);
    });
  }

  /** Full append-only history for a principal (quarantines AND releases). */
  historyFor(principalId: string): readonly ImmuneActionRecord[] {
    return this.entries.filter((record) => record.principalRef.principalId === principalId).map((record) => ({ ...record }));
  }

  /** Copy of the full append-only ledger, in sequence order. */
  records(): readonly ImmuneActionRecord[] {
    return this.entries.map((record) => ({ ...record }));
  }

  findAction(actionId: string): ImmuneActionRecord | undefined {
    const record = this.entries.find((entry) => entry.actionId === actionId);
    return record === undefined ? undefined : { ...record };
  }

  /** Verify the action chain: sequences 1..n, hashes chained and correct. */
  verifyChain(): { readonly ok: true } | { readonly ok: false; readonly violation: "CHAIN_BROKEN"; readonly firstBrokenSequence: number } {
    let prevRecordHash = "genesis";
    for (let index = 0; index < this.entries.length; index += 1) {
      const record = this.entries[index];
      if (record === undefined || record.sequence !== index + 1 || record.prevRecordHash !== prevRecordHash) {
        return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: index + 1 };
      }
      const { recordHash: _ignored, ...rest } = record;
      if (actionRecordHash(rest as Omit<ImmuneActionRecord, "recordHash">) !== record.recordHash) {
        return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: record.sequence };
      }
      prevRecordHash = record.recordHash;
    }
    return { ok: true };
  }

  get length(): number {
    return this.entries.length;
  }
}
