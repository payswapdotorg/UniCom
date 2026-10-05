/**
 * Opaque commerce command/result seam (contract law 8; FROZEN-ARCHITECTURE
 * §12 deterministic authority boundary).
 *
 * The intelligence plane PROPOSES commerce actions as typed command intents
 * and observes opaque results. It never models catalog/orders/payments and
 * never declares commerce truth — Worker 1 owns canonical commerce state.
 * Commerce payloads stay opaque handles; browser credentials never appear
 * here (they live behind the capability boundary).
 */

import type { PrincipalRef } from "./common.js";
import { brandRef, type Brand } from "./common.js";
import type { ProofPinnedAction } from "./proof.js";

/** Opaque commerce command type (e.g. an opaque "listing.create" verb). */
export type CommerceCommandType = Brand<string, "CommerceCommandType">;

/** Opaque handle to commerce state (never dereferenced in this plane). */
export type CommerceEntityRef = Brand<string, "CommerceEntityRef">;

/** Opaque handle to a commerce command payload (shape owned by Worker 1). */
export type CommerceCommandPayloadRef = Brand<string, "CommerceCommandPayloadRef">;

/** Idempotency key for consequential command submissions. */
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

export function commerceCommandType(value: string): CommerceCommandType {
  return brandRef(value, "CommerceCommandType");
}

export function commerceEntityRef(value: string): CommerceEntityRef {
  return brandRef(value, "CommerceEntityRef");
}

export function commerceCommandPayloadRef(value: string): CommerceCommandPayloadRef {
  return brandRef(value, "CommerceCommandPayloadRef");
}

export function idempotencyKey(value: string): IdempotencyKey {
  return brandRef(value, "IdempotencyKey");
}

/** A PROPOSED commerce action. Proposal only — never a declaration of truth. */
export interface CommerceCommandIntent {
  readonly commandId: string;
  readonly commandType: CommerceCommandType;
  readonly payloadRef: CommerceCommandPayloadRef;
  readonly targetRef?: CommerceEntityRef;
  readonly proposedBy: PrincipalRef;
  readonly onBehalfOf?: PrincipalRef;
  readonly idempotencyKey: IdempotencyKey;
}

/** Typed authorization decision for a command (seam shape; authority is Worker 1's). */
export interface AuthorizationDecision {
  readonly decision: "AUTHORIZED" | "DENIED" | "UNKNOWN";
  readonly decidedBy: PrincipalRef;
  readonly policyVersion: string;
  readonly decidedAt: string;
  readonly reason?: string;
}

/** Typed approval record (human/policy in the loop where required). */
export interface ApprovalRecord {
  readonly approved: boolean;
  readonly approver: PrincipalRef;
  readonly approvedAt: string;
  readonly conditions?: readonly string[];
}

/** The only submittable shape across the commerce seam. */
export interface CommerceCommandSubmission {
  readonly intent: CommerceCommandIntent;
  readonly authorization: AuthorizationDecision;
  readonly approval?: ApprovalRecord;
  /** Required for consequential commands — see buildConsequentialSubmission. */
  readonly proofPin?: ProofPinnedAction;
  readonly submittedAt: string;
}

/** Command result. UNKNOWN is an explicit, distinct status (never "FAILED"). */
export type CommerceCommandStatus = "ACCEPTED" | "REJECTED" | "UNKNOWN";

export interface CommerceCommandResult {
  readonly commandId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly status: CommerceCommandStatus;
  readonly reason?: string;
  readonly resultingStateRef?: CommerceEntityRef;
}

/** Runtime port owned by the commerce plane (Worker 1). */
export interface CommerceCommandPort {
  submit(submission: CommerceCommandSubmission): CommerceCommandResult;
}

function assertAuthorized(authorization: AuthorizationDecision): void {
  if (authorization.decision !== "AUTHORIZED") {
    throw new Error(`refusing to submit command: authorization decision is ${authorization.decision}`);
  }
}

/** Build a non-consequential submission (no proof pin). */
export function buildCommerceSubmission(input: {
  readonly intent: CommerceCommandIntent;
  readonly authorization: AuthorizationDecision;
  readonly approval?: ApprovalRecord;
  readonly submittedAt: string;
}): CommerceCommandSubmission {
  assertAuthorized(input.authorization);
  const { approval, ...rest } = input;
  return approval === undefined ? rest : { ...rest, approval };
}

/**
 * Build a consequential submission. The proof pin is a REQUIRED parameter:
 * the proof level must already have been selected before execution.
 */
export function buildConsequentialSubmission(input: {
  readonly intent: CommerceCommandIntent;
  readonly authorization: AuthorizationDecision;
  readonly approval?: ApprovalRecord;
  readonly proofPin: ProofPinnedAction;
  readonly submittedAt: string;
}): CommerceCommandSubmission {
  assertAuthorized(input.authorization);
  const { approval, ...rest } = input;
  return approval === undefined ? rest : { ...rest, approval };
}

/** Locate a prior result for an idempotency key, if any. */
export function findPriorSubmission(
  key: IdempotencyKey,
  priorResults: readonly CommerceCommandResult[],
): CommerceCommandResult | undefined {
  return priorResults.find((result) => result.idempotencyKey === key);
}

/**
 * Submit through the commerce seam with idempotency: a duplicate submission
 * (same idempotency key) returns the prior result WITHOUT re-execution.
 */
export function submitWithIdempotency(
  port: CommerceCommandPort,
  submission: CommerceCommandSubmission,
  priorResults: readonly CommerceCommandResult[],
): CommerceCommandResult {
  const prior = findPriorSubmission(submission.intent.idempotencyKey, priorResults);
  if (prior !== undefined) return prior;
  return port.submit(submission);
}
