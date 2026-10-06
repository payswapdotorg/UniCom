/**
 * @unicom/agent-kernel — gated tool registry (W2-002).
 *
 * The ZCode executor resolves every tool call through `registry.get(name)`
 * and every model-visible tool list through `registry.toContracts()`. This
 * module returns a ToolRegistry whose lookups are gated by the UNiCOM
 * kernel: delegate scope hiding (out-of-authority tools do not exist for a
 * delegate runtime), security BLOCK refusals, typed capability precondition
 * refusals, and delegate budget enforcement — all BEFORE the underlying
 * handler runs. The model cannot widen authority because it only ever sees
 * a gated wrapper; the raw entry is never reachable from model input.
 */

import type { ToolEntry, ToolExecutionContext, ToolRegistry } from "@zcode/core";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomCapabilityGate } from "./capability-gate.js";
import type { UnicomSecurityGate } from "./security-gate.js";
import type { UnicomImmuneSystem } from "./immune-system.js";
import type { ExecutingPrincipal } from "./principal.js";
import { isDelegateActionAllowed, UnicomBudgetLedger } from "./delegate-budget.js";

export interface UnicomRegistryGateOptions {
  readonly securityGate: UnicomSecurityGate;
  readonly capabilityGate: UnicomCapabilityGate;
  readonly budgetLedger: UnicomBudgetLedger;
  readonly now: () => Date;
  /**
   * The principal bound to THIS registry (main agent for the main runtime,
   * the delegate record for a delegate runtime). Undefined disables
   * principal scoping (only security/capability gates stay active).
   */
  readonly principal?: ExecutingPrincipal | undefined;
  /** W2-004: reversible capability attenuation check (immune quarantine). */
  readonly immuneSystem?: UnicomImmuneSystem | undefined;
}

/** Kernel-side execution gate shared by a gated registry. */
export class UnicomKernelGate {
  constructor(private readonly options: UnicomRegistryGateOptions) {}

  isToolVisible(toolName: string): boolean {
    const principal = this.options.principal;
    if (principal?.kind !== "delegate") return true;
    return principal.delegate.allowedToolNames.includes(toolName);
  }

  /** Full pre-execution gate. A refusal means the kernel refuses the call. */
  evaluate(toolName: string): UnicomToolHandlerFailure | undefined {
    const principal = this.options.principal;
    if (principal?.kind === "delegate") {
      const state = isDelegateActionAllowed(principal.delegate, this.options.now());
      if (state.refusal) return state.refusal;
      if (!this.isToolVisible(toolName)) {
        return refusalFailure(UnicomErrorCode.DELEGATE_SCOPE_REFUSED, "DELEGATE_SCOPE_REFUSED", {
          allowedToolNames: principal.delegate.allowedToolNames,
          delegateId: principal.delegate.delegate.principalId,
          toolName,
        });
      }
    }
    const securityRefusal = this.options.securityGate.checkTool(toolName);
    if (securityRefusal) return securityRefusal;
    const capabilityRefusal = this.options.capabilityGate.check(toolName);
    if (capabilityRefusal) return capabilityRefusal;
    // W2-004: reversible immune quarantine — an attenuated capability scope
    // refuses the tools bound to that capability for the executing principal.
    if (this.options.immuneSystem !== undefined && principal !== undefined) {
      const binding = this.options.capabilityGate.getBinding(toolName);
      const principalId = principal.kind === "main-agent"
        ? principal.mainAgent.principalId
        : principal.delegate.delegate.principalId;
      if (binding !== undefined) {
        const immuneRefusal = this.options.immuneSystem.attenuationRefusalFor(principalId, binding.capabilityDefinitionId);
        if (immuneRefusal) return immuneRefusal;
      }
    }
    return undefined;
  }

  /** Consequential-action budget charge (read-only tools are free). */
  chargeAction(toolName: string, consequential: boolean): UnicomToolHandlerFailure | undefined {
    if (!consequential || this.options.principal === undefined) return undefined;
    return this.options.budgetLedger.chargeAction(this.options.principal, toolName);
  }
}

export function createGatedToolRegistry(base: ToolRegistry, gate: UnicomKernelGate): ToolRegistry {
  const wrappedEntries = new Map<string, ToolEntry>();

  function wrappedEntry(entry: ToolEntry): ToolEntry {
    const cached = wrappedEntries.get(entry.metadata.name);
    if (cached !== undefined) return cached;
    const wrapper: ToolEntry = {
      ...entry,
      async handler(input: unknown, context: ToolExecutionContext) {
        const refusal = gate.evaluate(entry.metadata.name);
        if (refusal) return refusal;
        const consequential = entry.metadata.readOnly !== true;
        const actionCharge = gate.chargeAction(entry.metadata.name, consequential);
        if (actionCharge) return actionCharge;
        return entry.handler(input, context);
      },
    };
    wrappedEntries.set(entry.metadata.name, wrapper);
    return wrapper;
  }

  return {
    register(entry, options) {
      wrappedEntries.delete(entry.metadata.name);
      base.register(entry, options);
    },
    unregister(name: string) {
      wrappedEntries.delete(name);
      base.unregister(name);
    },
    get(name: string): ToolEntry | undefined {
      if (!gate.isToolVisible(name)) return undefined;
      const entry = base.get(name);
      if (!entry) return undefined;
      return wrappedEntry(entry);
    },
    has(name: string): boolean {
      return this.get(name) !== undefined;
    },
    list(): string[] {
      return base.list().filter((name) => gate.isToolVisible(name));
    },
    getMetadata(name: string) {
      if (!gate.isToolVisible(name)) return undefined;
      return base.getMetadata(name);
    },
    toContracts() {
      const hidden = new Set(base.list().filter((name) => !gate.isToolVisible(name)));
      if (hidden.size === 0) return base.toContracts();
      return base.toContracts().filter((contract) => !hidden.has(contract.name));
    },
  };
}
