/**
 * @unicom/agent-kernel — typed kernel refusal payloads (W2-002).
 *
 * Kernel-enforced refusals use the ZCode executor's native
 * {@link UnicomToolHandlerFailure} channel: deterministic numeric error codes plus a
 * JSON message carrying the structured refusal payload from the
 * `@unicom/agent` contracts. The model can read the typed reason; it can never
 * widen authority, because the decision is made before the tool handler runs.
 */


/**
 * Structural ToolHandlerFailure (the ZCode executor's native expected-failure
 * channel). Declared locally because the kernel type is not public-exported;
 * the executor's `isToolHandlerFailure` check is structural, so this shape is
 * the contract.
 */
export interface UnicomToolHandlerFailure {
  readonly result: false;
  readonly errorCode: number;
  readonly message: string;
}

/** Stable numeric error codes for kernel-level UNiCOM refusals. */
export const UnicomErrorCode = {
  DELEGATE_SCOPE_REFUSED: 60_001,
  DELEGATE_EXPIRED: 60_002,
  DELEGATE_REVOKED: 60_003,
  DELEGATE_BUDGET_EXHAUSTED: 60_004,
  DELEGATION_INVALID: 60_010,
  UNATTENUATED_DELEGATION_REFUSED: 60_011,
  SECURITY_BLOCK_FINAL: 60_020,
  CAPABILITY_NOT_EXECUTABLE: 60_030,
  CAPABILITY_UNKNOWN: 60_031,
  PROOF_LEVEL_REQUIRED: 60_040,
  GROUPBUY_COMMITMENT_REQUIRED: 60_050,
  TRADECYCLE_AUTHORIZATION_REQUIRED: 60_051,
  COMMERCE_SEAM_UNAVAILABLE: 60_060,
  ORGANIZATION_INVALID: 60_070,
} as const;
export type UnicomErrorCode = (typeof UnicomErrorCode)[keyof typeof UnicomErrorCode];

/** Deterministic JSON: fixed key insertion order, no whitespace. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Structured, deterministic kernel refusal. */
export interface UnicomRefusalPayload {
  readonly refusedBy: "unicom-kernel";
  readonly code: string;
  readonly detail: Record<string, unknown>;
}

export function refusalFailure(
  code: UnicomErrorCode,
  codeName: string,
  detail: Record<string, unknown>,
): UnicomToolHandlerFailure {
  const payload: UnicomRefusalPayload = {
    refusedBy: "unicom-kernel",
    code: codeName,
    detail,
  };
  return {
    result: false,
    errorCode: code,
    message: stableJson(payload),
  };
}
