/**
 * merchant-b2b (J12) — the typed kernel-command runner every section shares
 * (component.tsx owns the single implementation; parts receive it as a prop).
 */

import type { CommandExecution, PrincipalRef, RuntimeCommandPayload } from "@unicom/commerce";

/** Hand one typed command envelope to the demo kernel (confirm-first UIs). */
export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;
