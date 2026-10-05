/**
 * @unicom/agent-kernel — ephemeral delegate spawning (W2-002).
 *
 * Delegates are ephemeral, bounded and attenuated, and attenuation is
 * KERNEL-ENFORCED (defense-in-depth):
 *  - authority is granted by the principal (a prepared grant), never by the
 *    model — a model prompt cannot widen it;
 *  - spawn is refused unless `validateDelegation` passes against the parent
 *    Main Agent, its skills and the typed tool contracts;
 *  - the child runtime is a REAL AgentRuntime built through the kernel's
 *    subagent runner (`createExploreSubagentPort`) with a tool allowlist
 *    derived from the attenuated authority, a gated registry, a fresh
 *    permission service and a deny permission broker;
 *  - delegates are time-bounded (expiry aborts the kernel turn), revocable
 *    (revoke() aborts + freezes the record), and budget-bounded on every
 *    consequential action.
 */

import {
  validateDelegation,
  type AttenuatedAuthorityScope,
  type DelegateBudget,
  type DelegateMemoryScope,
  type EvidenceObligation,
  type EphemeralDelegate,
  type MainAgent,
  type SkillDefinition,
  type ToolContract,
} from "@unicom/agent";
import {
  AgentRuntime,
  createDenyPermissionBroker,
  createExploreSubagentPort,
  defaultPermissionConfig,
  InMemoryRuntimeTaskRegistry,
  PermissionService,
  type AgentProfile,
  type AgentRuntimeConfig,
  type AgentRuntimeDeps,
  type ExploreSubagentRuntimeRequest,
  type ExploreSubagentRuntimeResult,
  type ToolRegistry,
} from "@zcode/core";
import {
  createInMemorySessionEventStore,
  createRootTraceContext,
  type AgentOutput,
  type SessionEvent,
  type SessionId,
  type SubagentPort,
  type TraceContext,
  type TurnId,
} from "@zcode/contracts";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomDelegateRecord } from "./principal.js";
import type { UnicomKernelGate } from "./registry-gate.js";
import type { UnicomModelRouter } from "./routing.js";
import { delegateRoutingTask } from "./routing.js";

export const UNICOM_DELEGATE_AGENT_TYPE = "unicom-delegate";

export interface UnicomDelegateSpec {
  readonly delegateId: string;
  readonly description: string;
  readonly authority: AttenuatedAuthorityScope;
  readonly budget: DelegateBudget;
  readonly memoryScope: DelegateMemoryScope;
  readonly evidenceObligations: readonly EvidenceObligation[];
  readonly expiresAt: string;
  /** Routing facts derived by the principal, never by the model. */
  readonly routing?: {
    readonly complexity: Parameters<typeof delegateRoutingTask>[0]["complexity"];
    readonly observationUncertainty: "LOW" | "MEDIUM" | "HIGH";
  };
}

export interface UnicomDelegateGrant {
  readonly spec: UnicomDelegateSpec;
  readonly organizationId?: string;
}

export interface UnicomDelegateRunInput {
  readonly prompt: string;
  readonly description: string;
  readonly parentToolCallId: string;
  readonly parentTurnId?: TurnId;
  readonly workingDirectory: string;
  readonly workspaceRoot: string;
  readonly traceContext?: TraceContext;
  readonly signal?: AbortSignal;
}

export interface UnicomDelegateRunOutcome {
  readonly output: AgentOutput;
  readonly delegateId: string;
  readonly childSessionId: SessionId;
}

export interface UnicomDelegateSpawnerDeps {
  readonly parentSessionId: SessionId;
  readonly parentConfig: AgentRuntimeConfig;
  readonly mainAgent: MainAgent;
  readonly skills: readonly SkillDefinition[];
  readonly tools: readonly ToolContract[];
  readonly router: UnicomModelRouter;
  readonly runtimeTaskRegistry: InMemoryRuntimeTaskRegistry;
  readonly now: () => Date;
  /** Derive the gated registry for a delegate child runtime. */
  readonly createChildRegistry: (gate: UnicomKernelGate) => ToolRegistry;
  /** Tool names a delegate's authority unlocks (typed derivation). */
  readonly toolNamesForAuthority: (authority: AttenuatedAuthorityScope) => readonly string[];
  /** Kernel gate factory per child (binds the delegate record as principal). */
  readonly createChildGate: (record: UnicomDelegateRecord) => UnicomKernelGate;
  /** Parent-visible subagent events (real kernel lifecycle events). */
  readonly recordParentEvent: (event: SessionEvent) => void;
  readonly logger?: AgentRuntimeDeps["logger"];
}

export class UnicomDelegateRegistry {
  private readonly records = new Map<string, UnicomDelegateRecord>();
  private readonly grants = new Map<string, UnicomDelegateGrant>();
  private readonly reservedAgentIds: string[] = [];
  private delegateCounter = 0;

  constructor(private readonly deps: UnicomDelegateSpawnerDeps) {}

  /** Principal-side grant preparation. NOT reachable from model input. */
  prepareGrant(spec: UnicomDelegateSpec, organizationId?: string): string {
    const grantId = `unicom:grant:${spec.delegateId}:${this.delegateCounter++}`;
    this.grants.set(grantId, { spec, ...(organizationId ? { organizationId } : {}) });
    return grantId;
  }

  findGrant(grantId: string): UnicomDelegateGrant | undefined {
    return this.grants.get(grantId);
  }

  listGrants(): readonly string[] {
    return [...this.grants.keys()];
  }

  getDelegate(delegateId: string): UnicomDelegateRecord | undefined {
    return this.records.get(delegateId);
  }

  findByChildSession(childSessionId: string): UnicomDelegateRecord | undefined {
    for (const record of this.records.values()) {
      if (record.childSessionId === childSessionId) return record;
    }
    return undefined;
  }

  listDelegates(): readonly UnicomDelegateRecord[] {
    return [...this.records.values()];
  }

  /** Revoke: aborts the kernel turn and freezes the record. Final. */
  revoke(delegateId: string): boolean {
    const record = this.records.get(delegateId);
    if (!record) return false;
    record.status = "revoked";
    this.abortControllers.get(delegateId)?.abort();
    return true;
  }

  private readonly abortControllers = new Map<string, AbortController>();

  /** Deterministic agent id reservation so grants bind to the right child. */
  reserveAgentId(): string {
    const agentId = `unicom_delegate_${this.delegateCounter}`;
    this.reservedAgentIds.push(agentId);
    return agentId;
  }

  consumeReservedAgentId(): string | undefined {
    return this.reservedAgentIds.shift();
  }

  /**
   * Build the contract delegate and validate attenuation against the parent.
   * Returns a typed kernel refusal when delegation would widen authority.
   */
  validateSpec(spec: UnicomDelegateSpec): { failure?: UnicomToolHandlerFailure; delegate?: EphemeralDelegate } {
    const delegate: EphemeralDelegate = {
      principalId: spec.delegateId,
      kind: "ephemeral-delegate",
      ...(spec.description ? { displayName: spec.description } : {}),
      parentMainAgentId: this.deps.mainAgent.principalId,
      authority: spec.authority,
      budget: spec.budget,
      memoryScope: spec.memoryScope,
      evidenceObligations: spec.evidenceObligations,
      expiresAt: spec.expiresAt,
    };
    const validation = validateDelegation({
      parent: this.deps.mainAgent,
      skills: this.deps.skills,
      tools: this.deps.tools,
      delegate,
    });
    if (!validation.valid) {
      return {
        failure: refusalFailure(UnicomErrorCode.DELEGATION_INVALID, "DELEGATION_INVALID", {
          delegateId: spec.delegateId,
          violations: [...validation.violations],
        }),
      };
    }
    return { delegate };
  }

  /** Register the delegate record for a dispatched grant. */
  registerRecord(delegate: EphemeralDelegate, childSessionId: string): UnicomDelegateRecord {
    const record: UnicomDelegateRecord = {
      delegate,
      childSessionId,
      allowedToolNames: [...this.deps.toolNamesForAuthority(delegate.authority)],
      status: "running",
      actionsTaken: 0,
      spendMinorUnits: 0n,
    };
    this.records.set(delegate.principalId, record);
    return record;
  }

  abortControllerFor(delegateId: string): AbortController {
    const existing = this.abortControllers.get(delegateId);
    if (existing) return existing;
    const controller = new AbortController();
    this.abortControllers.set(delegateId, controller);
    return controller;
  }

  /** The kernel subagent runner: real lifecycle, task registry, watchdog. */
  createSubagentPort(): SubagentPort {
    return createExploreSubagentPort({
      profiles: [createUnicomDelegateProfile()],
      runtimeTaskRegistry: this.deps.runtimeTaskRegistry,
      createAgentId: () => this.consumeReservedAgentId() ?? `unicom_delegate_auto_${Date.now()}`,
      emitParentEvent: async (event) => {
        this.deps.recordParentEvent(event);
      },
      runExploreAgent: async (request, options) => this.runDelegate(request, options),
    });
  }

  /** Dispatch a grant through the kernel runner. */
  async runGrant(grantId: string, input: UnicomDelegateRunInput): Promise<UnicomDelegateRunOutcome> {
    const grant = this.grants.get(grantId);
    if (!grant) {
      throw new Error(`unknown delegate grant: ${grantId}`);
    }
    this.port ??= this.createSubagentPort();
    const agentId = this.reserveAgentId();
    this.pendingByAgentId.set(agentId, grant);
    try {
      const output = await this.port.run(
        {
          sessionId: this.deps.parentSessionId,
          ...(input.parentTurnId ? { turnId: input.parentTurnId } : {}),
          parentToolCallId: input.parentToolCallId,
          agentType: UNICOM_DELEGATE_AGENT_TYPE,
          description: input.description,
          prompt: input.prompt,
          workingDirectory: input.workingDirectory,
          workspaceRoot: input.workspaceRoot,
          trace: input.traceContext ?? createRootTraceContext({ sessionId: this.deps.parentSessionId }),
        },
        input.signal ? { signal: input.signal } : undefined,
      );
      return {
        output,
        delegateId: grant.spec.delegateId,
        childSessionId: agentId as SessionId,
      };
    } finally {
      this.pendingByAgentId.delete(agentId);
    }
  }

  private readonly pendingByAgentId = new Map<string, UnicomDelegateGrant>();
  private port?: SubagentPort;

  /**
   * runExploreAgent implementation: constructs the child AgentRuntime through
   * the real kernel path with attenuated, gated deps.
   */
  private async runDelegate(
    request: ExploreSubagentRuntimeRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ExploreSubagentRuntimeResult> {
    if (request.agentType !== UNICOM_DELEGATE_AGENT_TYPE) {
      throw new Error(
        `unicom kernel refused un-attenuated delegation: agent type '${request.agentType}' has no typed attenuation; only '${UNICOM_DELEGATE_AGENT_TYPE}' grants are dispatchable`,
      );
    }
    const grant = this.pendingByAgentId.get(request.agentId);
    if (!grant) {
      throw new Error(
        "unicom kernel refused delegation: no principal-prepared grant is bound to this dispatch — authority cannot originate from model input",
      );
    }
    const validation = this.validateSpec(grant.spec);
    if (validation.failure || !validation.delegate) {
      throw new Error(`unicom kernel refused delegation: ${validation.failure?.message ?? "invalid"}`);
    }
    const record = this.registerRecord(validation.delegate, request.sessionId);

    const delegate = validation.delegate;
    const controller = this.abortControllerFor(delegate.principalId);
    const expiresAtMs = Date.parse(delegate.expiresAt);
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    if (Number.isFinite(expiresAtMs)) {
      const delay = Math.max(0, expiresAtMs - this.deps.now().getTime());
      expiryTimer = setTimeout(() => {
        if (record.status === "running") record.status = "expired";
        controller.abort();
      }, delay);
    }
    const signals: AbortSignal[] = [controller.signal];
    if (options?.signal) signals.push(options.signal);
    const abortSignal = combineSignals(signals);

    const childGate = this.deps.createChildGate(record);
    const childRegistry = this.deps.createChildRegistry(childGate);
    const task = delegateRoutingTask({
      maxDecisionImpact: delegate.authority.maxDecisionImpact,
      complexity: grant.spec.routing?.complexity ?? "ROUTINE",
      observationUncertainty: grant.spec.routing?.observationUncertainty ?? "LOW",
    });

    const childConfig: AgentRuntimeConfig = {
      ...this.deps.parentConfig,
      taskType: "subagent_child",
      parentSessionId: this.deps.parentSessionId,
      toolAllowlist: [...record.allowedToolNames],
      toolset: "main",
      maxTurns: 8,
      subagents: { enabled: false },
      modelStreaming: "off",
      systemPrompt: [
        "You are an ephemeral UNiCOM delegate executing a bounded task for the Main Agent.",
        "Your authority is attenuated; attempts to exceed it are refused by the kernel.",
        grant.spec.description,
      ].join("\n"),
      subagentContext: undefined,
    };

    const childRuntime = new AgentRuntime(
      request.sessionId,
      childConfig,
      {
        eventStore: createInMemorySessionEventStore(),
        modelFactory: this.deps.router.factoryForTask(task),
        toolRegistry: childRegistry,
        permissionService: new PermissionService(defaultPermissionConfig),
        permissionBroker: createDenyPermissionBroker(),
        now: this.deps.now,
        logger: this.deps.logger,
        runtimeTaskRegistry: this.deps.runtimeTaskRegistry,
      },
    );
    try {
      await request.onSessionReady?.();
      const turn = await childRuntime.executeTurn(request.prompt, undefined, {
        abortSignal,
        inputSource: "subagent",
        traceContext: request.traceContext,
      });
      if (record.status === "running") record.status = "completed";
      return {
        response: turn.response,
        traceId: request.traceContext.traceId,
        events: turn.events,
      };
    } catch (error) {
      if (record.status === "running") record.status = "failed";
      throw error;
    } finally {
      if (expiryTimer !== undefined) clearTimeout(expiryTimer);
      controller.abort();
    }
  }
}

function combineSignals(signals: readonly AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];
  const combined = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      combined.abort();
      break;
    }
    signal.addEventListener("abort", () => combined.abort(signal.reason), { once: true });
  }
  return combined.signal;
}

export function createUnicomDelegateProfile(): AgentProfile {
  return {
    name: UNICOM_DELEGATE_AGENT_TYPE,
    description:
      "Ephemeral UNiCOM delegate with attenuated authority. Dispatched only through principal-prepared grants; scope, budget, expiry and revocation are kernel-enforced.",
    systemPrompt: "You are an ephemeral UNiCOM delegate.",
    source: "built-in",
    injectAgentsMd: false,
    maxTurns: 8,
  };
}
