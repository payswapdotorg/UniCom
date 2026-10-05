/**
 * @unicom/agent-kernel — the UNiCOM agent plane (W2-002).
 *
 * One plane adapts one ZCode kernel session: it binds the Main Agent as the
 * session's principal identity (ActiveTask — one Main Agent per task),
 * installs the gated tool registry, the context-guarded + routed model
 * factory, the delegate subagent port and the skill port into the kernel's
 * DI seams, and exposes the principal-side APIs (delegate grants, group-buy
 * commitments, trade-cycle leg authorizations, security signals) that model
 * input can never reach.
 *
 * The kernel runtime realizes the contracts; it never becomes canonical
 * commerce truth — commerce is referenced exclusively through the opaque
 * command/result seam.
 */

import {
  createActiveTask,
  credentialScope,
  type ActiveTask,
  type CommerceCommandPort,
  type GroupBuy,
  type GroupBuyCommitment,
  type MainAgent,
  type ModelRouteClass,
  type ModelRoutingTask,
  type SecurityPolicy,
  type SecuritySignal,
  type SkillDefinition,
  type Strategy,
  type ToolContract,
} from "@unicom/agent";
import {
  AgentRuntime,
  createToolRegistry,
  InMemoryRuntimeTaskRegistry,
  type AgentRuntimeConfig,
  type AgentRuntimeDeps,
  type ToolRegistry,
} from "@zcode/core";
import type { ModelSelection, SessionEvent, SessionId } from "@zcode/contracts";
import { InMemoryCapabilityRuntime, type UnicomCapabilityRuntime } from "./capability-runtime.js";
import { UnicomCapabilityGate, type CapabilityToolBinding } from "./capability-gate.js";
import { UnicomCommerceMediator } from "./commerce-mediator.js";
import { UNICOM_DEFAULT_SECURITY_POLICY, UnicomSecurityGate } from "./security-gate.js";
import { UnicomBudgetLedger } from "./delegate-budget.js";
import {
  UnicomDelegateRegistry,
  type UnicomDelegateSpec,
  createUnicomDelegateProfile,
} from "./delegate.js";
import { createGatedToolRegistry, UnicomKernelGate } from "./registry-gate.js";
import { UnicomModelRouter } from "./routing.js";
import { UnicomSkillRegistry } from "./skills.js";
import { type RecordOrganizationInput, UnicomStrategyOrganizationStore } from "./strategy-organization.js";
import {
  createUnicomToolEntries,
  UNICOM_COMMERCE_TOOL_NAME,
  UNICOM_OBSERVE_TOOL_NAME,
  type UnicomToolContext,
} from "./tools.js";
import type { ExecutingPrincipal } from "./principal.js";
import type { UnicomContextGuardSink } from "./context-guard.js";

/** The commerce seam's capability identity (catalog entry only). */
export const COMMERCE_COMMAND_CAPABILITY_ID = "capability:commerce.command";

export interface UnicomAgentPlaneOptions {
  readonly mainAgent: MainAgent;
  readonly skills?: readonly SkillDefinition[];
  readonly tools?: readonly ToolContract[];
  readonly capabilityRuntime?: UnicomCapabilityRuntime;
  readonly commerceCommandPort?: CommerceCommandPort;
  readonly securityPolicy?: SecurityPolicy;
  readonly now?: () => Date;
  /** The host's real model factory (adapter stack). */
  readonly backingModelFactory: AgentRuntimeDeps["modelFactory"];
  /** Selections per routing class (System 1 / JEPA / System 2). */
  readonly routeModels?: Partial<Record<ModelRouteClass, ModelSelection>>;
  readonly contextGuardSink?: UnicomContextGuardSink;
  readonly commerceCapabilityPreconditions?: CapabilityToolBinding["preconditions"];
  readonly extraCapabilityBindings?: Readonly<Record<string, CapabilityToolBinding>>;
  readonly logger?: AgentRuntimeDeps["logger"];
}

/** Deps accepted by createRuntime: modelFactory is optional because the plane's router supplies it. */
export type AgentRuntimeDepsInputForPlane = Omit<AgentRuntimeDeps, "modelFactory"> &
  Partial<Pick<AgentRuntimeDeps, "modelFactory">>;

export interface UnicomInstalledRuntime {
  readonly runtime: AgentRuntime;
  readonly plane: UnicomAgentPlane;
  readonly activeTask: ActiveTask;
  readonly registry: ToolRegistry;
}

export class UnicomAgentPlane {
  readonly mainAgent: MainAgent;
  readonly skills: UnicomSkillRegistry;
  readonly capabilityRuntime: UnicomCapabilityRuntime;
  readonly securityGate: UnicomSecurityGate;
  readonly capabilityGate: UnicomCapabilityGate;
  readonly commerce: UnicomCommerceMediator;
  readonly strategyOrganizations = new UnicomStrategyOrganizationStore();
  readonly budgetLedger: UnicomBudgetLedger;
  readonly router: UnicomModelRouter;
  readonly runtimeTaskRegistry = new InMemoryRuntimeTaskRegistry();
  readonly parentEvents: SessionEvent[] = [];

  private readonly now: () => Date;
  private readonly delegatesBySession = new Map<string, UnicomDelegateRegistry>();
  private readonly toolEntries: ReturnType<typeof createUnicomToolEntries>;
  private readonly mainSessionIds = new Set<string>();
  private readonly activeTasks = new Map<string, ActiveTask>();
  private readonly capabilityBindingsByTool: Map<string, CapabilityToolBinding>;
  private readonly logger?: AgentRuntimeDeps["logger"];
  private readonly toolContext: UnicomToolContext;

  constructor(private readonly options: UnicomAgentPlaneOptions) {
    this.mainAgent = options.mainAgent;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
    this.skills = new UnicomSkillRegistry({
      skills: options.skills,
      tools: options.tools,
    });
    this.capabilityRuntime = options.capabilityRuntime ?? new InMemoryCapabilityRuntime();
    this.securityGate = new UnicomSecurityGate(
      options.securityPolicy ?? UNICOM_DEFAULT_SECURITY_POLICY,
    );
    this.capabilityGate = new UnicomCapabilityGate(this.capabilityRuntime);
    this.budgetLedger = new UnicomBudgetLedger(this.now);
    this.commerce = new UnicomCommerceMediator({
      port: options.commerceCommandPort,
      budgetLedger: this.budgetLedger,
      now: () => this.now().toISOString(),
    });
    this.router = new UnicomModelRouter({
      backing: options.backingModelFactory,
      routeModels: options.routeModels,
      contextGuardSink: options.contextGuardSink,
    });
    this.capabilityBindingsByTool = new Map<string, CapabilityToolBinding>([
      [
        UNICOM_COMMERCE_TOOL_NAME,
        {
          capabilityDefinitionId: COMMERCE_COMMAND_CAPABILITY_ID,
          preconditions:
            options.commerceCapabilityPreconditions ?? {
              requiresConnectedInstance: true,
              requiredCredentialScope: credentialScope("commerce:propose"),
              requiredPermissions: ["commerce:propose"],
              requiresCommercialTermsAccepted: true,
              requiresCurrentObservation: true,
            },
        },
      ],
      ...(options.extraCapabilityBindings ? Object.entries(options.extraCapabilityBindings) : []),
    ]);
    for (const [toolName, binding] of this.capabilityBindingsByTool) {
      this.capabilityGate.bindTool(toolName, binding);
    }
    this.toolContext = {
      capabilityRuntime: this.capabilityRuntime,
      commerce: this.commerce,
      delegates: undefined as unknown as UnicomDelegateRegistry,
      resolvePrincipal: (input) => this.resolvePrincipal(input.sessionId),
    };
    this.toolEntries = createUnicomToolEntries(this.toolContext);
  }

  /** Principal resolution for gated execution (main session or delegate). */
  resolvePrincipal(sessionId: string): ExecutingPrincipal | undefined {
    if (this.mainSessionIds.has(sessionId)) {
      return { kind: "main-agent", mainAgent: this.mainAgent };
    }
    for (const registry of this.delegatesBySession.values()) {
      const record = registry.findByChildSession(sessionId);
      if (record) return { kind: "delegate", delegate: record };
    }
    return undefined;
  }

  /** Tool names an attenuated authority unlocks (typed derivation). */
  toolNamesForAuthority(authority: {
    capabilityDefinitionIds: readonly string[];
    dataAccess: readonly string[];
  }): readonly string[] {
    const names = new Set<string>();
    for (const [toolName, binding] of this.capabilityBindingsByTool) {
      if (authority.capabilityDefinitionIds.includes(binding.capabilityDefinitionId)) {
        names.add(toolName);
      }
    }
    if (authority.dataAccess.includes("capability-observations")) {
      names.add(UNICOM_OBSERVE_TOOL_NAME);
    }
    return [...names].sort();
  }

  private createGate(principal: ExecutingPrincipal | undefined): UnicomKernelGate {
    return new UnicomKernelGate({
      securityGate: this.securityGate,
      capabilityGate: this.capabilityGate,
      budgetLedger: this.budgetLedger,
      now: this.now,
      ...(principal ? { principal } : {}),
    });
  }

  private createBaseRegistry(): ToolRegistry {
    const base = createToolRegistry();
    for (const entry of this.toolEntries) {
      base.register(entry, { silentDuplicateWarning: true });
    }
    return base;
  }

  /**
   * Install the plane on a real kernel runtime: session ownership (one Main
   * Agent per task), gated registry, guarded + routed model factory,
   * delegate subagent port and skill port. The model factory is supplied by
   * the plane's router (backed by the constructor's backing factory), so the
   * caller's deps only need to provide the event store and any ports it
   * wants wired through.
   */
  createRuntime(input: {
    readonly sessionId: SessionId;
    readonly deps: AgentRuntimeDepsInputForPlane;
    readonly config?: AgentRuntimeConfig;
  }): UnicomInstalledRuntime {
    const { sessionId, deps, config } = input;
    if (this.mainSessionIds.has(sessionId)) {
      throw new Error(`unicom plane already installed for session ${sessionId}`);
    }
    this.mainSessionIds.add(sessionId);

    const activeTask = createActiveTask({
      taskId: sessionId,
      principal: this.mainAgent,
      createdAt: this.now().toISOString(),
    });
    this.activeTasks.set(sessionId, activeTask);

    const delegates = new UnicomDelegateRegistry({
      parentSessionId: sessionId,
      parentConfig: {
        mode: "build",
        ...config,
      },
      mainAgent: this.mainAgent,
      skills: this.options.skills ?? [],
      tools: this.options.tools ?? [],
      router: this.router,
      runtimeTaskRegistry: this.runtimeTaskRegistry,
      now: this.now,
      createChildRegistry: (gate) => createGatedToolRegistry(this.createBaseRegistry(), gate),
      toolNamesForAuthority: (authority) => this.toolNamesForAuthority(authority),
      createChildGate: (record) => this.createGate({ kind: "delegate", delegate: record }),
      recordParentEvent: (event) => {
        this.parentEvents.push(event);
      },
      ...(this.logger ? { logger: this.logger } : {}),
    });
    this.delegatesBySession.set(sessionId, delegates);
    this.toolContext.delegates = delegates;

    const mainRegistry = createGatedToolRegistry(this.createBaseRegistry(), this.createGate({
      kind: "main-agent",
      mainAgent: this.mainAgent,
    }));

    const patchedConfig: AgentRuntimeConfig = {
      ...config,
      subagents: {
        ...config?.subagents,
        enabled: true,
        profiles: [createUnicomDelegateProfile()],
      },
    };

    const patchedDeps: AgentRuntimeDeps = {
      ...deps,
      toolRegistry: mainRegistry,
      modelFactory: this.router.guardedFactory(),
      subagentPort: delegates.createSubagentPort(),
      ...(deps.skillPort ? {} : { skillPort: this.skills.toKernelSkillPort() }),
    };

    const runtime = new AgentRuntime(sessionId, patchedConfig, patchedDeps);
    return { runtime, plane: this, activeTask, registry: mainRegistry };
  }

  activeTaskFor(sessionId: string): ActiveTask | undefined {
    return this.activeTasks.get(sessionId);
  }

  delegatesFor(sessionId: string): UnicomDelegateRegistry | undefined {
    return this.delegatesBySession.get(sessionId);
  }

  // -------------------------------------------------------------------------
  // Principal-side APIs (never reachable from model input)
  // -------------------------------------------------------------------------

  prepareDelegate(spec: UnicomDelegateSpec, organizationId?: string): string {
    const registry = [...this.delegatesBySession.values()][0];
    if (!registry) {
      throw new Error("prepareDelegate requires an installed plane session");
    }
    return registry.prepareGrant(spec, organizationId);
  }

  revokeDelegate(delegateId: string): boolean {
    for (const registry of this.delegatesBySession.values()) {
      if (registry.revoke(delegateId)) return true;
    }
    return false;
  }

  recordGroupBuyCommitment(id: string, groupBuy: GroupBuy, commitment: GroupBuyCommitment): GroupBuy {
    return this.commerce.recordGroupBuyCommitment(id, groupBuy, commitment);
  }

  recordTradeCycleLegAuthorization(
    id: string,
    input: { legId: string; cycleId: string; participantRef: string },
  ): void {
    this.commerce.recordTradeCycleLegAuthorization(id, input);
  }

  ingestSecuritySignal(signal: SecuritySignal, options?: { subjectTools?: readonly string[] }) {
    return this.securityGate.ingestSignal(signal, this.now().toISOString(), options);
  }

  recordStrategy(strategy: Strategy): void {
    this.strategyOrganizations.recordStrategy(strategy);
  }

  recordOrganization(input: RecordOrganizationInput) {
    return this.strategyOrganizations.recordOrganization(input);
  }

  route(task: ModelRoutingTask) {
    return this.router.route(task);
  }

  registerRouteModel(classKey: ModelRouteClass, selection: ModelSelection): void {
    this.router.registerRouteModel(classKey, selection);
  }
}

export { UNICOM_DELEGATE_AGENT_TYPE } from "./delegate.js";
