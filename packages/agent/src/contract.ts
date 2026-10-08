/**
 * @unicom/agent — public contract surface (Stage 0, W2-001).
 *
 * Module contract artifact: re-exports the frozen intelligence/coordination
 * contract. The capability vocabulary is additionally exposed at
 * `@unicom/agent/capability` (src/capability/index.ts) — the canonical
 * vocabulary Worker 3 consumes by name.
 *
 * Contract laws (docs/work-orders/W2-001.md §4):
 * 1. One Main Agent principal; skills specialize; delegates are ephemeral,
 *    always attenuated (typed scopes, budgets, memory, evidence duties).
 * 2. Strategy ≠ Organization.
 * 3. Executability = ConnectedCapabilityInstance + current CapabilityObservation.
 * 4. UNKNOWN ≠ FAILED; provider states preserved.
 * 5. Trust ≠ Proof; proof level selected before consequential execution.
 * 6. GroupBuy/TradeCycle explicit; hop-bounded production search.
 * 7. Security BLOCK deterministic and final; broadcasts defensive-only.
 * 8. Commerce referenced via opaque command/result seams only.
 * 9. No credentials in model-context-shaped types.
 * 10. Third-party commerce content is data, not instructions.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
export type {
  Brand,
  DecisionImpact,
  EvidenceKind,
  EvidenceReference,
  Money,
  PrincipalKind,
  PrincipalRef,
} from "./common.js";
export { brandRef, compareMoney, isMoney, isTimestamp, money, timestamp } from "./common.js";

// ---------------------------------------------------------------------------
// Model-context safety + untrusted content (laws 9, 10)
// ---------------------------------------------------------------------------
export type {
  CredentialRedactionFinding,
  CredentialRedactionResult,
  CredentialRef,
  CredentialScope,
  ModelContextMaterial,
  RejectSuspectCredentialKeys,
  SuspectCredentialKey,
  TrustedInstruction,
  TrustedInstructionSource,
  UntrustedContent,
  UntrustedContentKind,
} from "./model-context.js";
export {
  assertNoCredentialMaterial,
  credentialRef,
  credentialScope,
  credentialScopeSatisfies,
  credentialScopeTokens,
  isTrustedInstruction,
  redactCredentialMaterial,
  toModelContextMaterial,
} from "./model-context.js";

// ---------------------------------------------------------------------------
// Transaction proof (law 5)
// ---------------------------------------------------------------------------
export type {
  ProofLevel,
  ProofLevelDefinition,
  ProofPinnedAction,
  ProofRequirement,
  ProofSelection,
  RequiredProofLevelInput,
  TransactionProof,
} from "./proof.js";
export {
  ProofLevel as ProofLevelEnum,
  PROOF_LEVEL_DEFINITIONS,
  PROOF_LEVELS,
  determineRequiredProofLevel,
  pinProofSelection,
  proofLevelRank,
} from "./proof.js";

// ---------------------------------------------------------------------------
// Opaque commerce seam (law 8)
// ---------------------------------------------------------------------------
export type {
  ApprovalRecord,
  AuthorizationDecision,
  CommerceCommandIntent,
  CommerceCommandPayloadRef,
  CommerceCommandPort,
  CommerceCommandResult,
  CommerceCommandStatus,
  CommerceCommandSubmission,
  CommerceCommandType,
  CommerceEntityRef,
  IdempotencyKey,
} from "./commerce-seam.js";
export {
  buildCommerceSubmission,
  buildConsequentialSubmission,
  commerceCommandPayloadRef,
  commerceCommandType,
  commerceEntityRef,
  findPriorSubmission,
  idempotencyKey,
  submitWithIdempotency,
} from "./commerce-seam.js";

// ---------------------------------------------------------------------------
// Agent plane: MainAgent, skills, tools, delegates (law 1)
// ---------------------------------------------------------------------------
export type {
  ActiveTask,
  AgentPrincipal,
  AgentPrincipalKind,
  AttenuatedAuthorityScope,
  DelegateBudget,
  DelegateDataScope,
  DelegateMemoryScope,
  EphemeralDelegate,
  EvidenceObligation,
  EvidenceObligationKind,
  MainAgent,
  MainAgentAuthorityScope,
  SkillDefinition,
  SkillReference,
  ToolContract,
} from "./agent.js";
export { createActiveTask, isMainAgent, validateDelegation } from "./agent.js";
export type { DelegationValidation, DelegationViolation } from "./agent.js";

// ---------------------------------------------------------------------------
// Strategy and Organization (law 2)
// ---------------------------------------------------------------------------
export type { Strategy, StrategyApproach, StrategyConstraints, StrategyStep } from "./strategy.js";
export type {
  Organization,
  OrganizationAssignment,
  OrganizationExecutor,
  OrganizationFormationKind,
  OrganizationValidation,
  OrganizationViolation,
} from "./organization.js";
export { validateOrganization } from "./organization.js";

// ---------------------------------------------------------------------------
// Buyer commerce intent (scenario 1) + Opportunity engine (scenario 5)
// ---------------------------------------------------------------------------
export type {
  BuyerCommerceIntent,
  BuyerHardConstraints,
  BuyerSoftPreferences,
  DeliveryConstraint,
  HardConstraintCheck,
  HardConstraintViolation,
  IntentCandidate,
  PrivacyRequirement,
  QualityFloor,
  ScoredCandidate,
  SellerCredibilityFloor,
  SecurityRequirement,
} from "./intent.js";
export { checkHardConstraints, evaluateIntentCandidates } from "./intent.js";
export type {
  Opportunity,
  OpportunityChainViolation,
  OpportunityEpistemicKind,
  OpportunityEpistemics,
  OpportunityKind,
  RentalOpportunity,
  RentalTerms,
  ResaleOpportunity,
  ResaleTerms,
} from "./opportunity.js";
export { validateOpportunityChain } from "./opportunity.js";
// W2-007 financing/negotiation/warranty/subscription/local-pickup/shared-logistics types are in contract.w2-007.ts.

// ---------------------------------------------------------------------------
// Group-buy coordination (scenarios 2, 3)
// ---------------------------------------------------------------------------
export type {
  GroupBuy,
  GroupBuyCommitment,
  GroupBuyDiscount,
  GroupBuyExecutability,
  GroupBuyNotExecutableReason,
  GroupBuyProposal,
  GroupBuyStatus,
  GroupBuyTerms,
  LatentDemandCluster,
  MerchantGroupBuyResponse,
} from "./groupbuy.js";
export {
  enrollParticipant,
  groupBuyParticipantCount,
  isGroupBuyExecutable,
  respondToGroupBuyProposal,
} from "./groupbuy.js";

// ---------------------------------------------------------------------------
// Coordination + bounded trade cycles (scenario 4)
// ---------------------------------------------------------------------------
export type {
  CoordinationKind,
  CoordinationPrivacyPolicy,
  CoordinationRequest,
  TradeCycle,
  TradeCycleExecutionMode,
  TradeCycleLeg,
  TradeCycleSearchBounds,
  TradeCycleValidation,
  TradeCycleViolation,
} from "./coordination.js";
export { validateTradeCycle } from "./coordination.js";

// ---------------------------------------------------------------------------
// Trust plane (scenario 9)
// ---------------------------------------------------------------------------
export type {
  AgentTrust,
  CapabilityTrust,
  TrustRecord,
  TrustRecordKind,
  UserTrust,
} from "./trust.js";
export { trustRecordKind } from "./trust.js";

// ---------------------------------------------------------------------------
// Security immune system (scenarios 6, 7, 8; law 7)
// ---------------------------------------------------------------------------
export type {
  DefensiveSecurityBroadcast,
  MitigationKind,
  SecurityIndicator,
  SecurityIndicatorKind,
  SecurityLearningRecord,
  SecurityOverrideOutcome,
  SecurityPolicy,
  SecurityPolicyAction,
  SecurityPolicyDecision,
  SecuritySignal,
  SecuritySignalDomain,
  SecurityThreatClass,
  ThreatClassification,
  ThreatIndicator,
  ThreatIndicatorKind,
  ThreatMitigation,
  ThreatSignature,
  ThreatSignatureValidation,
} from "./security.js";
export {
  classifySecuritySignal,
  decideSecurityPolicy,
  issueDefensiveBroadcast,
  requestSecurityOverride,
  validateThreatSignature,
} from "./security.js";

// ---------------------------------------------------------------------------
// Model routing (scenario 11)
// ---------------------------------------------------------------------------
export type {
  ModelRouteClass,
  ModelRouteDecision,
  ModelRoutingTask,
  RoutingComplexity,
  RoutingUncertainty,
} from "./model-route.js";
export {
  MODEL_ROUTE_CLASSES,
  ModelRouteClass as ModelRouteClassEnum,
  routeModelTask,
} from "./model-route.js";

// ---------------------------------------------------------------------------
// Lab experiments and promotion gates
// ---------------------------------------------------------------------------
export type {
  ExperimentEnvironment,
  ExperimentKind,
  ExperimentSpec,
  ObservedOutcomeEvidence,
  PromotionEligibility,
  RollbackPlan,
} from "./experiment.js";
export { EXPERIMENT_KINDS, evaluatePromotionEligibility } from "./experiment.js";

// W2-003..W2-006 — Lab/Trust/Reality/adversarial artifacts (line budget).
// W2-007 — buyer-agent vocabulary + opportunity-engine extensions.
export * from "./contract.w2-003.js";
export * from "./contract.w2-004.js";
export * from "./contract.w2-005.js";
export * from "./contract.w2-006.js";
export * from "./contract.w2-007.js";
