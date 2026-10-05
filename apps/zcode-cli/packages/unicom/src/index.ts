/**
 * @unicom/agent-kernel — public entrypoint (W2-002).
 *
 * The UNiCOM agent-kernel adaptation: wires the `@unicom/agent` contracts
 * into the ZCode agent kernel runtime through the kernel's DI seams.
 * Public surface:
 *  - `UnicomAgentPlane` / `createRuntime` — install the plane on a real
 *    AgentRuntime session (MainAgent principal identity + session ownership).
 *  - Gated registry, capability gate, security gate, context guard, router,
 *    skill registry, delegate registry, commerce mediator, strategy/organization
 *    store — the kernel-side enforcement points.
 *  - Principal-side APIs on the plane (delegate grants, explicit GroupBuy /
 *    TradeCycle commitments, security signals) — never reachable from model
 *    input.
 */

export {
  UnicomErrorCode,
  refusalFailure,
  stableJson,
  type UnicomRefusalPayload,
  type UnicomToolHandlerFailure,
} from "./errors.js";
export {
  InMemoryCapabilityRuntime,
  type InMemoryCapabilityRuntimeOptions,
  type UnicomCapabilityRuntime,
} from "./capability-runtime.js";
export {
  UnicomCapabilityGate,
  type CapabilityGateOutcome,
  type CapabilityToolBinding,
} from "./capability-gate.js";
export {
  UNICOM_DEFAULT_SECURITY_POLICY,
  UnicomSecurityGate,
  type IngestSecuritySignalOptions,
  type SecurityRefusalDetail,
} from "./security-gate.js";
export {
  guardModelForContext,
  guardModelRequest,
  scrubCredentialPairsFromText,
  type UnicomContextGuardReport,
  type UnicomContextGuardSink,
} from "./context-guard.js";
export {
  delegateRoutingTask,
  ModelRouteClass,
  UnicomModelRouter,
  type UnicomModelRouterOptions,
} from "./routing.js";
export {
  UnicomSkillRegistry,
  type UnicomSkillRegistryOptions,
} from "./skills.js";
export {
  UnicomStrategyOrganizationStore,
  type RecordOrganizationInput,
} from "./strategy-organization.js";
export {
  UnicomCommerceMediator,
  type CommerceCommandRequest,
  type SeamedCommandResult,
  type UnicomCommerceMediatorOptions,
} from "./commerce-mediator.js";
export {
  UnicomBudgetLedger,
  type BudgetCharge,
  type DelegateActionState,
  isDelegateActionAllowed,
} from "./delegate-budget.js";
export {
  UnicomOpportunityLab,
  type UnicomOpportunityLabOptions,
} from "./opportunity-lab.js";
export {
  UnicomImmuneSystem,
  type UnicomImmuneSystemOptions,
} from "./immune-system.js";
export {
  UnicomOpportunityGraph,
  type UnicomOpportunityGraphOptions,
} from "./opportunity-graph.js";
export {
  createGatedToolRegistry,
  UnicomKernelGate,
  type UnicomRegistryGateOptions,
} from "./registry-gate.js";
export {
  UNICOM_DELEGATE_AGENT_TYPE,
  UnicomDelegateRegistry,
  createUnicomDelegateProfile,
  type UnicomDelegateGrant,
  type UnicomDelegateRunInput,
  type UnicomDelegateRunOutcome,
  type UnicomDelegateSpec,
  type UnicomDelegateSpawnerDeps,
} from "./delegate.js";
export {
  createUnicomToolEntries,
  UNICOM_COMMERCE_TOOL_NAME,
  UNICOM_DELEGATE_DISPATCH_TOOL_NAME,
  UNICOM_OBSERVE_TOOL_NAME,
  UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME,
  type UnicomToolContext,
} from "./tools.js";
export {
  COMMERCE_COMMAND_CAPABILITY_ID,
  UnicomAgentPlane,
  type UnicomAgentPlaneOptions,
  type UnicomInstalledRuntime,
} from "./plane.js";
export type {
  ExecutingPrincipal,
  PrincipalResolutionInput,
  UnicomDelegateRecord,
  UnicomDelegateStatus,
} from "./principal.js";
