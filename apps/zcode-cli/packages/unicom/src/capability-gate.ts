/**
 * @unicom/agent-kernel — typed capability executability gate (W2-002).
 *
 * The canonical capability vocabulary is the SINGLE source of executable
 * capability semantics. Tools bound to a capability definition may only
 * execute after the kernel evaluates the typed preconditions from
 * `@unicom/agent`: a ConnectedCapabilityInstance plus a current
 * CapabilityObservation. Catalog presence never implies executable account
 * authority; UNKNOWN is preserved as UNKNOWN (never collapsed to FAILED).
 */

import {
  evaluateCapabilityExecutability,
  type CapabilityExecutability,
  type ExecutabilityPreconditions,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomCapabilityRuntime } from "./capability-runtime.js";

export interface CapabilityToolBinding {
  readonly capabilityDefinitionId: string;
  readonly preconditions: ExecutabilityPreconditions;
}

export type CapabilityGateOutcome =
  | { readonly status: "UNBOUND" }
  | { readonly status: "EVALUATED"; readonly executability: CapabilityExecutability };

/** Kernel-side precondition evaluator for capability-bound tools. */
export class UnicomCapabilityGate {
  private readonly bindings = new Map<string, CapabilityToolBinding>();
  private readonly capabilityRuntime: UnicomCapabilityRuntime;

  constructor(capabilityRuntime: UnicomCapabilityRuntime) {
    this.capabilityRuntime = capabilityRuntime;
  }

  /** Registration-time binding: a tool's executable semantics are a capability. */
  bindTool(toolName: string, binding: CapabilityToolBinding): void {
    this.bindings.set(toolName, binding);
  }

  getBinding(toolName: string): CapabilityToolBinding | undefined {
    return this.bindings.get(toolName);
  }

  listBoundTools(): readonly string[] {
    return [...this.bindings.keys()].sort();
  }

  evaluate(toolName: string): CapabilityGateOutcome {
    const binding = this.bindings.get(toolName);
    if (!binding) return { status: "UNBOUND" };
    const connectedInstance = this.capabilityRuntime.findConnectedInstance(
      binding.capabilityDefinitionId,
    );
    const observation = connectedInstance
      ? this.capabilityRuntime.findLatestObservation(connectedInstance.connectedInstanceId)
      : undefined;
    return {
      status: "EVALUATED",
      executability: evaluateCapabilityExecutability({
        preconditions: binding.preconditions,
        connectedInstance,
        observation,
      }),
    };
  }

  /**
   * Kernel refusal for non-executable / unknown states. Typed: the refusal
   * payload IS the contract's CapabilityExecutability, so callers (and the
   * model) see the exact precondition failure, never a generic error.
   */
  refusalFor(outcome: CapabilityGateOutcome): UnicomToolHandlerFailure | undefined {
    if (outcome.status === "UNBOUND") return undefined;
    const executability = outcome.executability;
    if (executability.status === "EXECUTABLE") return undefined;
    if (executability.status === "UNKNOWN") {
      return refusalFailure(UnicomErrorCode.CAPABILITY_UNKNOWN, "CAPABILITY_UNKNOWN", {
        executability,
      });
    }
    return refusalFailure(UnicomErrorCode.CAPABILITY_NOT_EXECUTABLE, "CAPABILITY_NOT_EXECUTABLE", {
      executability,
    });
  }

  /** Combined evaluate + typed refusal, used by the kernel execution gate. */
  check(toolName: string): UnicomToolHandlerFailure | undefined {
    return this.refusalFor(this.evaluate(toolName));
  }
}
