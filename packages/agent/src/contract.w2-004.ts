/**
 * @unicom/agent — W2-004 contract artifact: Trust, Proof & Security Immune
 * System + Opportunity Graph.
 *
 * Re-exports the W2-004 contract modules through the module's public
 * contract surface (contract.ts → index.ts). Kept in its own file because
 * contract.ts is at its architecture-policy line budget; this file carries
 * the same contract-artifact discipline (types + deterministic validation
 * only, no IO, no hidden clocks).
 *
 * Contract laws (docs/work-orders/W2-004.md):
 * 1. Trust is earned evidence, never an ambient number; removing evidence
 *    invalidates derived trust.
 * 2. Proofs verify against their evidence chains, not their asserters.
 * 3. Quarantine/suspension is REVERSIBLE capability attenuation —
 *    append-only ledgers, never deletion.
 * 4. Broadcasts follow the coordination-privacy contract — no raw
 *    cross-principal intent leakage through security channels
 *    (adversarial-observer asserted).
 * 5. Commerce facts enter ONLY through the opaque seam (typed versioned
 *    queries); no kernel/event access, no opportunity semantics on the
 *    commerce side.
 * 6. BLOCK is final; no model override. Delegates stay ephemeral/bounded.
 * 7. ONE capability vocabulary; immune actions born under the W2-003 lab
 *    promotion gates (append-only hash chain, runtime activation registry,
 *    un-promoted logic unreachable).
 * 8. Every opportunity-graph edge carries its promotion evidence reference;
 *    provenance-less queries are rejected by contract.
 */

// --- Append-only evidence journal (the trust/proof/immune foundation) ---
export type {
  BuyerClaimPayload,
  CarrierPackageObservationPayload,
  EvidenceCitation,
  EvidenceChainVerification,
  EvidenceChainViolation,
  JournaledEvidencePayload,
  JournaledEvidenceRecord,
  MerchantShipmentAttestationPayload,
  ReviewActivityPayload,
  TrustEvidencePayload,
} from "./evidence-journal.js";
export {
  EvidenceJournal,
  resolveEvidenceCitation,
  resolveEvidenceCitations,
  verifyEvidenceChain,
} from "./evidence-journal.js";

// --- Journaled/derived trust (scenario 1) ---
export type {
  DerivedAgentTrust,
  DerivedCapabilityTrust,
  DerivedTrustRecord,
  DerivedTrustVerification,
  DerivedTrustViolation,
  DerivedUserTrust,
} from "./trust-journal.js";
export {
  capabilitySubject,
  deriveAgentTrust,
  deriveCapabilityTrust,
  deriveUserTrust,
  verifyDerivedTrust,
} from "./trust-journal.js";

// --- TransactionProof records (scenario 2) ---
export type {
  TransactionProofRecord,
  TransactionProofVerification,
  TransactionProofViolation,
} from "./transaction-proof.js";
export {
  bindTransactionProof,
  citationsFor,
  proofEvidenceReferences,
  verifyTransactionProof,
} from "./transaction-proof.js";

// --- Opaque commerce-facts seam (typed, versioned, tri-state) ---
export type {
  CommerceEvidenceFactsPort,
  DeliveryConfirmationFact,
  FactValue,
  OrderSubjectFact,
  ReturnHistoryFact,
  ShipmentContentFact,
} from "./commerce-facts-seam.js";
export {
  COMMERCE_FACTS_INTERFACE_ID,
  COMMERCE_FACTS_INTERFACE_VERSION,
  journalCommerceFacts,
  journaledDeliveryConfirmations,
  journaledOrderSubjects,
  journaledReturnHistories,
  journaledShipmentContents,
  pinCommerceFactsInterface,
} from "./commerce-facts-seam.js";

// --- Immune actions: reversible capability attenuation (scenario 3) ---
export type {
  ActiveAttenuation,
  CapabilityAttenuationScope,
  ImmuneActionOutcome,
  ImmuneActionRecord,
  ImmuneActionViolation,
} from "./immune-action.js";
export { QuarantineLedger, verifyImmuneActionChain } from "./immune-action.js";

// --- The five fraud archetypes (scenarios 4, 5) ---
export type {
  ArchetypeDetectionResult,
  EvidenceTriState,
  FraudArchetype,
} from "./fraud-archetypes.js";
export {
  detectReviewRing,
  RING_BURST_WINDOW_MS,
  RING_MIN_AUTHORS,
  RING_YOUNG_ACCOUNT_DAYS,
  SECURITY_CORRELATION_POLICY_REF,
} from "./fraud-archetypes.js";
export {
  detectFalseBuyerClaim,
  detectFalseNonDelivery,
  detectReturnRefundAbuse,
  detectWrongItemShipment,
  ABUSE_RETURN_COUNT_THRESHOLD,
  CONTRADICTION_PROOF_MIN_RANK,
} from "./claim-archetypes.js";
// --- Adversarial archetype suite: evasion resistance (scenario 6) ---
export type {
  ArchetypeFlow,
  FlowOutcome,
  KnownLimitationRecord,
  SuiteOutcome,
  SuiteViolation,
} from "./archetype-suite.js";
export {
  detectAllArchetypes,
  journalKnownLimitations,
  runArchetypeSuite,
} from "./archetype-suite.js";

// --- Capability-scoped defensive broadcasts (scenario 7) ---
export type {
  BroadcastAudience,
  BroadcastBuildOutcome,
  BroadcastViolation,
  ScopedDefensiveBroadcast,
  SecurityBroadcastScope,
} from "./immune-broadcast.js";
export {
  buildScopedDefensiveBroadcast,
  computeBroadcastAudience,
  defensiveSignatureFor,
  observeBroadcastChannel,
  SECURITY_BROADCAST_DISCLOSURE_FIELDS,
  SECURITY_BROADCAST_DISCLOSURE_POLICY_ID,
} from "./immune-broadcast.js";

// --- The lab-gated immune system runtime ---
export type { ImmuneRefusal, ImmuneSystemOptions } from "./immune-system.js";
export { immuneLabCandidates, SecurityImmuneSystem, UNICOM_IMMUNE_LOGIC } from "./immune-system.js";

// --- Provenance-carrying opportunity graph (scenario 8) ---
export type {
  AddEdgeOutcome,
  EdgeProvenance,
  EdgeProvenanceVerification,
  EdgeProvenanceViolation,
  GraphEdgeViolation,
  GraphNodeKind,
  GraphNodeRef,
  GraphQueryOutcome,
  GraphQueryRejection,
  OpportunityGraphEdge,
  OpportunityGraphEdgeKind,
  ProvenanceBearingGraphQuery,
} from "./opportunity-graph.js";
export {
  buildEdgesFromLabOutputs,
  OpportunityGraph,
  queryOpportunityGraph,
  verifyEdgeProvenance,
} from "./opportunity-graph.js";
