/**
 * Handler seam between the kernel and the domain logic.
 *
 * Handlers are PURE decision functions: they read current authoritative
 * state, compute next aggregate values via the deterministic domain
 * functions, and BUFFER event specs. Nothing is appended until the handler
 * returns Ok — a rejected command leaves zero journal entries (torn state
 * is impossible by construction). State is only ever mutated by the kernel
 * folding appended events.
 */
import type { Result } from "../domain/result.js";
import type { CommandRejection } from "../domain/commands.js";
import type { PaymentBoundary } from "../domain/payments.js";
import type { CommerceSubjectRef } from "../domain/events.js";
import type { KernelState } from "./kernel-state.js";
import type { ResolvedKernelOptions } from "./options.js";
import type { AnyRuntimeCommand } from "./commands.js";

/** One buffered immutable fact (subject + kind + typed payload). */
export interface EmittedEventSpec {
  readonly subject: CommerceSubjectRef;
  readonly kind: string;
  readonly payload: unknown;
}

export interface CommandContext {
  /** Read-only authoritative state (never mutated by handlers). */
  readonly state: KernelState;
  /** Resolved deterministic kernel options. */
  readonly options: ResolvedKernelOptions;
  /** The typed payment boundary port (undefined = not injected). */
  readonly paymentBoundary: PaymentBoundary | undefined;
  /** Deterministic timestamp for this execution. */
  readonly now: string;
  /** Deterministic mint counter for kernel-minted aggregate ids. */
  readonly mint: () => number;
  /** Buffer an event spec; appended only if the command succeeds. */
  readonly emit: (spec: EmittedEventSpec) => void;
}

export type RuntimeCommandHandler = (
  envelope: AnyRuntimeCommand,
  ctx: CommandContext,
) => Promise<Result<void, CommandRejection>>;

export function rejectInvalidCommand(detail: string): Result<void, CommandRejection> {
  return { ok: false, error: { code: "INVALID_COMMAND", detail } };
}

export function rejectInvalidState(detail: string): Result<void, CommandRejection> {
  return { ok: false, error: { code: "INVALID_STATE", detail } };
}

export function rejectInsufficientInventory(detail: string): Result<void, CommandRejection> {
  return { ok: false, error: { code: "INSUFFICIENT_INVENTORY", detail } };
}

export function accept(): Result<void, CommandRejection> {
  return { ok: true, value: undefined };
}
