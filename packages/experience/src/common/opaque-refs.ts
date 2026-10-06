/**
 * Opaque reference law (Stage 0, W3-001 §4).
 *
 * Worker 2 owns the canonical capability vocabulary
 * (`CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance
 * → CapabilityObservation`, package `@unicom/agent`, W2-001, in parallel).
 * Worker 1 owns canonical commerce truth.
 *
 * This package therefore NEVER defines those models structurally. It references
 * them through branded opaque string IDs plus minimal link shapes. The typed
 * import seam against `@unicom/agent` is W3-002's first job after W2-001
 * merges; this package intentionally does NOT depend on `@unicom/agent` yet
 * (see README.md "Planned @unicom/agent seam").
 */

// ---------------------------------------------------------------------------
// Capability vocabulary (Worker 2, @unicom/agent) — consume only
// ---------------------------------------------------------------------------

declare const capabilityDefinitionIdBrand: unique symbol;
/** Opaque reference to a `CapabilityDefinition` owned by `@unicom/agent`. */
export type CapabilityDefinitionId = string & {
  readonly [capabilityDefinitionIdBrand]: "opaque:@unicom/agent/CapabilityDefinition";
};

declare const providerImplementationRefBrand: unique symbol;
/** Opaque reference to a `ProviderImplementation` owned by `@unicom/agent`. */
export type ProviderImplementationRef = string & {
  readonly [providerImplementationRefBrand]: "opaque:@unicom/agent/ProviderImplementation";
};

declare const connectedCapabilityInstanceIdBrand: unique symbol;
/** Opaque reference to a `ConnectedCapabilityInstance` owned by `@unicom/agent`. */
export type ConnectedCapabilityInstanceId = string & {
  readonly [connectedCapabilityInstanceIdBrand]: "opaque:@unicom/agent/ConnectedCapabilityInstance";
};

declare const capabilityObservationRefBrand: unique symbol;
/** Opaque reference to a `CapabilityObservation` owned by `@unicom/agent`. */
export type CapabilityObservationRef = string & {
  readonly [capabilityObservationRefBrand]: "opaque:@unicom/agent/CapabilityObservation";
};

declare const executionModeRefBrand: unique symbol;
/**
 * Opaque reference to an execution mode. The three frozen architecture values
 * (PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER, FROZEN-ARCHITECTURE
 * §3.D) are mirrored as data in `connector/transports.ts` until `@unicom/agent`
 * owns the canonical type.
 */
export type ExecutionModeRef = string & {
  readonly [executionModeRefBrand]: "opaque:execution-mode-ref";
};

// ---------------------------------------------------------------------------
// Agent / trust / coordination plane (Worker 2) — render references only
// ---------------------------------------------------------------------------

declare const principalRefBrand: unique symbol;
/** Opaque reference to an authenticated principal (user or agent principal). */
export type PrincipalRef = string & {
  readonly [principalRefBrand]: "opaque:authenticated-principal";
};

declare const agentPrincipalRefBrand: unique symbol;
/** Opaque reference to an `AgentPrincipal` owned by `@unicom/agent`. */
export type AgentPrincipalRef = string & {
  readonly [agentPrincipalRefBrand]: "opaque:@unicom/agent/AgentPrincipal";
};

declare const skillRefBrand: unique symbol;
/** Opaque reference to a skill owned by `@unicom/agent`. */
export type SkillRef = string & {
  readonly [skillRefBrand]: "opaque:@unicom/agent/Skill";
};

declare const economicGoalRefBrand: unique symbol;
/** Opaque reference to an `EconomicGoal` owned by `@unicom/agent`. */
export type EconomicGoalRef = string & {
  readonly [economicGoalRefBrand]: "opaque:@unicom/agent/EconomicGoal";
};

declare const activeTaskRefBrand: unique symbol;
/** Opaque reference to a long-running agent task owned by the agent runtime. */
export type ActiveTaskRef = string & {
  readonly [activeTaskRefBrand]: "opaque:agent-plane/ActiveTask";
};

declare const decisionRefBrand: unique symbol;
/** Opaque reference to a Decision Ledger entry owned by `@unicom/agent`. */
export type DecisionRef = string & {
  readonly [decisionRefBrand]: "opaque:@unicom/agent/Decision";
};

declare const opportunityRefBrand: unique symbol;
/** Opaque reference to an `Opportunity` owned by `@unicom/agent`. */
export type OpportunityRef = string & {
  readonly [opportunityRefBrand]: "opaque:@unicom/agent/Opportunity";
};

declare const coordinationRequestRefBrand: unique symbol;
/** Opaque reference to a `CoordinationRequest` owned by `@unicom/agent`. */
export type CoordinationRequestRef = string & {
  readonly [coordinationRequestRefBrand]: "opaque:@unicom/agent/CoordinationRequest";
};

declare const groupBuyRefBrand: unique symbol;
/** Opaque reference to a `GroupBuy` owned by `@unicom/agent`. */
export type GroupBuyRef = string & {
  readonly [groupBuyRefBrand]: "opaque:@unicom/agent/GroupBuy";
};

declare const tradeCycleRefBrand: unique symbol;
/** Opaque reference to a `TradeCycle` owned by `@unicom/agent`. */
export type TradeCycleRef = string & {
  readonly [tradeCycleRefBrand]: "opaque:@unicom/agent/TradeCycle";
};

declare const strategyRefBrand: unique symbol;
/** Opaque reference to a `Strategy` owned by `@unicom/agent`. */
export type StrategyRef = string & {
  readonly [strategyRefBrand]: "opaque:@unicom/agent/Strategy";
};

declare const organizationRefBrand: unique symbol;
/** Opaque reference to an `Organization` owned by `@unicom/agent`. */
export type OrganizationRef = string & {
  readonly [organizationRefBrand]: "opaque:@unicom/agent/Organization";
};

declare const experimentRefBrand: unique symbol;
/** Opaque reference to an `Experiment` owned by `@unicom/agent`. */
export type ExperimentRef = string & {
  readonly [experimentRefBrand]: "opaque:@unicom/agent/Experiment";
};

declare const securityEventRefBrand: unique symbol;
/** Opaque reference to a security signal/incident owned by `@unicom/agent`. */
export type SecurityEventRef = string & {
  readonly [securityEventRefBrand]: "opaque:@unicom/agent/SecurityEvent";
};

declare const trustSignalRefBrand: unique symbol;
/** Opaque reference to a trust signal owned by `@unicom/agent`. */
export type TrustSignalRef = string & {
  readonly [trustSignalRefBrand]: "opaque:@unicom/agent/TrustSignal";
};

declare const transactionProofRefBrand: unique symbol;
/** Opaque reference to a `TransactionProof` owned by `@unicom/agent`. */
export type TransactionProofRef = string & {
  readonly [transactionProofRefBrand]: "opaque:@unicom/agent/TransactionProof";
};

declare const buyerCommerceIntentRefBrand: unique symbol;
/** Opaque reference to a `BuyerCommerceIntent` owned by `@unicom/agent`. */
export type BuyerCommerceIntentRef = string & {
  readonly [buyerCommerceIntentRefBrand]: "opaque:@unicom/agent/BuyerCommerceIntent";
};

declare const memoryScopeRefBrand: unique symbol;
/** Opaque reference to a merchant memory scope owned by `@unicom/agent`. */
export type MemoryScopeRef = string & {
  readonly [memoryScopeRefBrand]: "opaque:@unicom/agent/MerchantMemoryScope";
};

// ---------------------------------------------------------------------------
// Commerce truth (Worker 1, Commerce Kernel) — projections/commands only
// ---------------------------------------------------------------------------

declare const commerceKernelCommandRefBrand: unique symbol;
/** Opaque reference to a typed command accepted by the Commerce Kernel (W1). */
export type CommerceKernelCommandRef = string & {
  readonly [commerceKernelCommandRefBrand]: "opaque:@unicom/kernel/Command";
};

declare const reconciliationChannelRefBrand: unique symbol;
/**
 * Opaque reference to the deterministic reconciliation channel owned by the
 * Commerce Kernel (Worker 1). Offline observations are HANDED OFF here; only
 * Worker 1's reconciliation can promote them to canonical state.
 */
export type ReconciliationChannelRef = string & {
  readonly [reconciliationChannelRefBrand]: "opaque:@unicom/kernel/Reconciliation";
};

declare const commerceEntityRefBrand: unique symbol;
/**
 * Base opaque reference to a canonical commerce entity owned by the Commerce
 * Kernel. Specific entity families (merchant, product, order, ...) brand on
 * top of this so the experience plane can render without owning the model.
 */
export type CommerceEntityRef = string & {
  readonly [commerceEntityRefBrand]: "opaque:@unicom/kernel/Entity";
};

declare const commerceMerchantRefBrand: unique symbol;
/** Opaque reference to a canonical merchant record (Worker 1). */
export type CommerceMerchantRef = string & {
  readonly [commerceMerchantRefBrand]: "opaque:@unicom/kernel/Merchant";
};

declare const commerceCatalogRefBrand: unique symbol;
/** Opaque reference to a canonical catalog (Worker 1). */
export type CommerceCatalogRef = string & {
  readonly [commerceCatalogRefBrand]: "opaque:@unicom/kernel/Catalog";
};

declare const commerceProductRefBrand: unique symbol;
/** Opaque reference to a canonical product/variant/SKU (Worker 1). */
export type CommerceProductRef = string & {
  readonly [commerceProductRefBrand]: "opaque:@unicom/kernel/Product";
};

declare const commerceInventoryRefBrand: unique symbol;
/** Opaque reference to canonical inventory state (Worker 1). */
export type CommerceInventoryRef = string & {
  readonly [commerceInventoryRefBrand]: "opaque:@unicom/kernel/Inventory";
};

declare const commerceLocationRefBrand: unique symbol;
/** Opaque reference to a canonical location (Worker 1). */
export type CommerceLocationRef = string & {
  readonly [commerceLocationRefBrand]: "opaque:@unicom/kernel/Location";
};

declare const commerceOrderRefBrand: unique symbol;
/** Opaque reference to a canonical order (Worker 1). */
export type CommerceOrderRef = string & {
  readonly [commerceOrderRefBrand]: "opaque:@unicom/kernel/Order";
};

declare const commerceCartRefBrand: unique symbol;
/** Opaque reference to a canonical cart (Worker 1). */
export type CommerceCartRef = string & {
  readonly [commerceCartRefBrand]: "opaque:@unicom/kernel/Cart";
};

declare const commerceCustomerRefBrand: unique symbol;
/** Opaque reference to a canonical customer record (Worker 1). */
export type CommerceCustomerRef = string & {
  readonly [commerceCustomerRefBrand]: "opaque:@unicom/kernel/Customer";
};

declare const commerceAutonomousStoreRefBrand: unique symbol;
/**
 * Opaque reference to an autonomous store owned by the Commerce Kernel
 * (Worker 1 — deterministic runtime). The experience plane renders store
 * visibility through this ref; it never models the store's commerce
 * semantics (W3-005 autonomous-store visibility law).
 */
export type CommerceAutonomousStoreRef = string & {
  readonly [commerceAutonomousStoreRefBrand]: "opaque:@unicom/kernel/AutonomousStore";
};

declare const commerceAutonomousStorePolicyRefBrand: unique symbol;
/**
 * Opaque reference to an `AutonomousStorePolicy` owned by the Commerce
 * Kernel (Worker 1). Rendered verbatim with its revision — never re-modeled.
 */
export type CommerceAutonomousStorePolicyRef = string & {
  readonly [commerceAutonomousStorePolicyRefBrand]: "opaque:@unicom/kernel/AutonomousStorePolicy";
};

declare const commerceStoreVarianceRefBrand: unique symbol;
/**
 * Opaque reference to a variance record surfaced by the Commerce Kernel
 * (Worker 1). The experience plane shows that a variance exists and what
 * the merchant can do about it — variance SEMANTICS stay in Worker 1's lane.
 */
export type CommerceStoreVarianceRef = string & {
  readonly [commerceStoreVarianceRefBrand]: "opaque:@unicom/kernel/StoreVariance";
};

declare const commerceEscalationRefBrand: unique symbol;
/**
 * Opaque reference to an escalation requiring owner attention. Rendered
 * verbatim; the escalation's commerce meaning is owned behind the ref.
 */
export type CommerceEscalationRef = string & {
  readonly [commerceEscalationRefBrand]: "opaque:@unicom/kernel/Escalation";
};

// ---------------------------------------------------------------------------
// Experience-plane owned handles (opaque to everything outside this plane)
// ---------------------------------------------------------------------------

declare const browserSessionIdBrand: unique symbol;
/** Identifier of an isolated browser session (see connector/browser-session.ts). */
export type BrowserSessionId = string & {
  readonly [browserSessionIdBrand]: "experience:BrowserSessionId";
};

declare const browserStoragePartitionRefBrand: unique symbol;
/** Opaque reference to an isolated browser storage partition. Carries no material. */
export type BrowserStoragePartitionRef = string & {
  readonly [browserStoragePartitionRefBrand]: "experience:BrowserStoragePartition";
};

declare const browserRouteCapabilityRefBrand: unique symbol;
/** Opaque reference to an explicitly granted browser-route capability. */
export type BrowserRouteCapabilityRef = string & {
  readonly [browserRouteCapabilityRefBrand]: "experience:BrowserRouteCapability";
};

declare const connectorInstanceIdBrand: unique symbol;
/** Identifier of a connected connector instance. */
export type ConnectorInstanceId = string & {
  readonly [connectorInstanceIdBrand]: "experience:ConnectorInstanceId";
};

declare const localEdgeDeviceIdBrand: unique symbol;
/** Identifier of a LocalCommerceEdge device. */
export type LocalEdgeDeviceId = string & {
  readonly [localEdgeDeviceIdBrand]: "experience:LocalEdgeDeviceId";
};

declare const physicalObservationIdBrand: unique symbol;
/** Identifier of a physical commerce observation. */
export type PhysicalObservationId = string & {
  readonly [physicalObservationIdBrand]: "experience:PhysicalObservationId";
};

declare const offlineQueueEntryIdBrand: unique symbol;
/** Identifier of an offline observation queue entry. */
export type OfflineQueueEntryId = string & {
  readonly [offlineQueueEntryIdBrand]: "experience:OfflineQueueEntryId";
};

declare const reconciliationHandoffIdBrand: unique symbol;
/** Identifier of an observation reconciliation hand-off. */
export type ReconciliationHandoffId = string & {
  readonly [reconciliationHandoffIdBrand]: "experience:ReconciliationHandoffId";
};

declare const liveStreamIdBrand: unique symbol;
/** Identifier of a live-commerce stream. */
export type LiveStreamId = string & {
  readonly [liveStreamIdBrand]: "experience:LiveStreamId";
};

declare const deploymentAdapterIdBrand: unique symbol;
/** Identifier of a deployment provider adapter (provider-agnostic). */
export type DeploymentAdapterId = string & {
  readonly [deploymentAdapterIdBrand]: "experience:DeploymentAdapterId";
};

declare const realtimeChannelIdBrand: unique symbol;
/** Identifier of a realtime event channel. */
export type RealtimeChannelId = string & {
  readonly [realtimeChannelIdBrand]: "experience:RealtimeChannelId";
};

declare const webhookSourceIdBrand: unique symbol;
/** Identifier of a registered webhook source. */
export type WebhookSourceId = string & {
  readonly [webhookSourceIdBrand]: "experience:WebhookSourceId";
};

declare const authorizationContextRefBrand: unique symbol;
/** Opaque reference to an authorization/approval context (agent-plane). */
export type AuthorizationContextRef = string & {
  readonly [authorizationContextRefBrand]: "opaque:agent-plane/AuthorizationContext";
};

declare const longRunningTaskRefBrand: unique symbol;
/** Opaque reference to a durable long-running task admitted by a worker tier. */
export type LongRunningTaskRef = string & {
  readonly [longRunningTaskRefBrand]: "opaque:deployment/LongRunningTask";
};

// W3-006 deployment-readiness refs live in opaque-refs-deployment.ts
// (additive split for the architecture line budget) and are re-exported
// verbatim here so existing import paths stay stable.
export * from "./opaque-refs-deployment";
