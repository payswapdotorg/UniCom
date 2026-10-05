/**
 * @unicom/agent-kernel — principal execution context (W2-002).
 *
 * Every gated tool execution resolves to a principal: the Main Agent (the
 * single task identity) or one of its ephemeral delegates. The context is
 * derived from the kernel's own `ToolExecutionContext` (session id + runtime
 * scope), never from model-visible content.
 */

import type { EphemeralDelegate, MainAgent } from "@unicom/agent";
/** Kernel tool runtime scope (structural match of the kernel's internal type). */
export type ToolRuntimeScope = "main" | "subagent";

export type ExecutingPrincipal =
  | { readonly kind: "main-agent"; readonly mainAgent: MainAgent }
  | { readonly kind: "delegate"; readonly delegate: UnicomDelegateRecord };

/** Delegate lifecycle state tracked by the kernel plane. */
export type UnicomDelegateStatus = "running" | "completed" | "failed" | "revoked" | "expired";

export interface UnicomDelegateRecord {
  readonly delegate: EphemeralDelegate;
  readonly childSessionId: string;
  /** Tool names derived from the attenuated authority (kernel allowlist). */
  readonly allowedToolNames: readonly string[];
  status: UnicomDelegateStatus;
  /** Monotonic action counter enforced against DelegateBudget.maxActions. */
  actionsTaken: number;
  /** Cumulative proposed spend enforced against DelegateBudget.maxSpend. */
  spendMinorUnits: bigint;
}

export interface PrincipalResolutionInput {
  readonly sessionId: string;
  readonly runtimeScope: ToolRuntimeScope | undefined;
}
