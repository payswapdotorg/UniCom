/**
 * W2-029 — trust-plane + security-pipeline fixtures and module-local contract
 * mirrors (J17).
 *
 * Four SEPARATE planes — UserTrust, AgentTrust, CapabilityTrust and
 * TransactionProof — rendered as explainable components, never one score
 * (the experience trust-center contract has no aggregate score field by
 * law). Each plane carries the signal → risk → policy outcome → evidence →
 * mitigation/next-step chain. The security pipeline section renders one
 * BLOCKED incident through every stage: BLOCK is a deterministic hard
 * constraint — final, unoverrideable — and every defensive output shown is
 * indicators/mitigations only, never weaponized payloads.
 *
 * CONTRACT MIRROR NOTE: the shapes below mirror the @unicom/experience
 * trust-security view contracts (TrustComponentView / SecurityIncidentView /
 * PROOF_LEVELS legend) field-for-field as module-local structural types —
 * the package's root surface cannot be imported from packages/web without
 * adding baseline TS2305 errors (pre-existing extension-less re-export
 * defect in packages/experience/src/contract.ts, outside this lane's write
 * surface). The canonical UserTrust/AgentTrust/CapabilityTrust records and
 * TransactionProof live in @unicom/agent, which the web plane must never
 * import (frozen architecture): every value here is an explicitly labelled
 * DEMO fixture using the frozen field vocabulary — nothing claims to be a
 * live trust record or a real proof.
 */

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const TRUST_PLANES_FIXTURES_ID = "w2-029-trust-planes@1";

/** Mirror of experience TrustComponentKind (explainable component kinds). */
export type TrustComponentKind =
  | "verified-purchase"
  | "provider-signed-state"
  | "independent-observation"
  | "account-age-history"
  | "transaction-proof-level"
  | "agent-certification"
  | "security-warning";

/** Mirror of experience SecurityMitigationDecision. */
export type SecurityMitigationDecision =
  | "allowed"
  | "blocked"
  | "quarantined"
  | "under-review"
  | "recovered"
  | "unknown";

/** Mirror of experience SecurityPipelineStage. */
export type SecurityPipelineStage =
  | "signal"
  | "classification"
  | "policy-decision"
  | "mitigation"
  | "evidence"
  | "defensive-broadcast"
  | "learning";

/** One explainable trust plane (mirror of TrustComponentView field vocabulary). */
export interface TrustPlaneView {
  readonly planeId: string;
  readonly planeKind: "USER_TRUST" | "AGENT_TRUST" | "CAPABILITY_TRUST" | "TRANSACTION_PROOF";
  readonly kind: TrustComponentKind;
  readonly label: string;
  readonly explanation: string;
  /** The signal → risk → policy outcome → evidence → mitigation chain, one row each. */
  readonly chain: {
    readonly signal: string;
    readonly risk: string;
    readonly policyOutcome: string;
    readonly evidence: string;
    readonly mitigationNextStep: string;
  };
}

/** Mirror of the experience PROOF_LEVELS display registry (P0–P5). */
export const PROOF_LEVEL_LEGEND: readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "P0", label: "P0 — assertion", description: "Stated without independent backing" },
  { id: "P1", label: "P1 — receipt", description: "Authenticated artifact or receipt" },
  { id: "P2", label: "P2 — provider-signed", description: "Provider-signed evidence" },
  { id: "P3", label: "P3 — independent", description: "Independent observation" },
  { id: "P4", label: "P4 — protected", description: "Corroboration plus economic protection" },
  { id: "P5", label: "P5 — final", description: "Native rail/ledger finality" },
];

/**
 * The four planes — kept separate by construction: no field of one plane
 * feeds another, and no plane exposes any aggregate score.
 */
export const TRUST_PLANES: readonly TrustPlaneView[] = [
  {
    planeId: "w2j17-plane-user",
    planeKind: "USER_TRUST",
    kind: "verified-purchase",
    label: "UserTrust — the buyer as a counterparty",
    explanation:
      "Who the buyer is and how they have transacted: verification level, verified-purchase count, dispute rate. A DEMO fixture in the frozen field vocabulary — the canonical UserTrust records live in the agent plane, which this surface never imports.",
    chain: {
      signal:
        "Identity verification STRONG · 34 verified purchases · dispute rate 290 bps (2.9%) · assessed 2026-10-12, valid 30 days (demo clock).",
      risk:
        "A rising dispute rate or weak verification raises counterparty risk for manual trust decisions (concessions, holds, watch-lists).",
      policyOutcome:
        "Feeds human trust decisions only — it never gates a payment automatically, never settles anything, and is never proof of a transaction.",
      evidence: "34 receipted purchases (P1-class receipts) · account history since 2023-04 (P1).",
      mitigationNextStep:
        "If the dispute rate crosses the operator threshold, support reviews before any manual concession — a human decision, journaled like every decision on this surface.",
    },
  },
  {
    planeId: "w2j17-plane-agent",
    planeKind: "AGENT_TRUST",
    kind: "agent-certification",
    label: "AgentTrust — the Main Agent as a worker",
    explanation:
      "How reliable the agent is at what it does: task success rate and policy compliance. Agent trust is about the worker, never about money — it is not transaction finality and never will be.",
    chain: {
      signal:
        "Task success rate 0.94 (demo) · policy compliance CLEAN · assessed 2026-10-12 (demo clock) · evaluation lineage is an opaque ref in the frozen contract.",
      risk: "A non-compliant or low-success agent is a reliability risk for the work it prepares — not a payment risk.",
      policyOutcome:
        "Gates what the agent may prepare (plans, comparisons, simulations). It never authorizes spending, never moves money, and never substitutes for an approval.",
      evidence:
        "Lab evaluation lineage (opaque evaluationEvidenceRefs in the frozen agent contract — not importable from the web plane; values labelled demo).",
      mitigationNextStep:
        "On MINOR_VIOLATIONS the agent is demoted to supervised proposals; on SUSPENDED it stops acting entirely. Compliance is re-assessed on a fixed schedule.",
    },
  },
  {
    planeId: "w2j17-plane-capability",
    planeKind: "CAPABILITY_TRUST",
    kind: "independent-observation",
    label: "Capability/ProviderTrust — the capability as an observer and executor",
    explanation:
      "How reliable a capability/provider implementation is: observation reliability and execution success. The frozen taxonomy has no separate ProviderTrust kind — provider standing lives here, on the capability, and today nothing is connected.",
    chain: {
      signal:
        "Observation reliability 9800 bps over the last 200 observations (demo) · execution success rate: not connected — no ConnectedCapabilityInstance exists (connected integrations: none).",
      risk:
        "A degraded observer yields UNKNOWN observations (held as UNKNOWN, never rendered as failure or success); an unconnected capability cannot execute anything at all.",
      policyOutcome:
        "Catalogue presence never implies executable authority — the connectors surface (J15) states honestly that nothing is connected, so no execution path is simulated here.",
      evidence: "200 demo observations in the independent-observation pattern (P3-class).",
      mitigationNextStep:
        "Connect a provider implementation on the connectors surface (J15); until then every execution path renders honestly unavailable rather than pretending.",
    },
  },
  {
    planeId: "w2j17-plane-proof",
    planeKind: "TRANSACTION_PROOF",
    kind: "transaction-proof-level",
    label: "TransactionProof — what actually proves a transaction",
    explanation:
      "Proof is evidence-backed verification at a pinned level (P0–P5), selected BEFORE consequential execution. It is a distinct plane, constructible only from evidence — no trust signal can create, upgrade or stand in for it. A trust signal is never transaction proof.",
    chain: {
      signal:
        "On this surface: the kernel's journaled command receipts (EXECUTED with idempotency keys) are the P1-class facts; settlement observations carry provider-native statuses verbatim (P2-class when the rail signs).",
      risk:
        "Treating a trust signal (or an UNKNOWN settlement) as proof would invent money that was never verified — the exact failure the four-plane separation exists to prevent.",
      policyOutcome:
        "Money-in derives ONLY from OBSERVED SETTLED; refunds are bounded by captured totals; UNKNOWN settlements stay UNKNOWN until observed or the window closes.",
      evidence:
        "The receipts, dispute records, chargebacks and settlement records on this surface — each journaled, each replayable in the audit trail below.",
      mitigationNextStep:
        "When a fact matters, demand its level: check the receipt (P1), the provider-signed state (P2) or an independent observation (P3) — never a trust score, because none exists.",
    },
  },
];

/** Mirror of experience SecurityIncidentView (field vocabulary, demo values). */
export interface SecurityIncidentFixture {
  readonly incidentId: string;
  readonly signal: string;
  readonly reason: string;
  readonly effect: string;
  readonly mitigation: string;
  readonly nextAction: string;
  readonly severity: "low" | "medium" | "high" | "severe";
  readonly decision: SecurityMitigationDecision;
  readonly defensiveBroadcast: "not-applicable" | "prepared" | "broadcast" | "unknown";
  readonly updatedAt: string;
  /** The pipeline stages rendered in order, one honest line each. */
  readonly stages: readonly { readonly stage: SecurityPipelineStage; readonly note: string }[];
}

/** The blocked incident: a review ring, tied to the threat-signal queue above. */
export const BLOCKED_INCIDENT: SecurityIncidentFixture = {
  incidentId: "w2j17-incident-reviews-88",
  signal: "17 five-star reviews within 40 minutes on the pour-over mug listing (queue row signal-reviews-88).",
  reason: "Review ring: same-day accounts, 14 of 17 sharing a device fingerprint, zero verified purchases.",
  effect: "The manipulated reviews would have inflated the listing's average — withheld before that happened.",
  mitigation: "The 17 reviews are withheld from the storefront average and the listing stays under review.",
  nextAction: "A human reviews the listing; the defensive broadcast below tells other merchants what to watch for.",
  severity: "high",
  decision: "blocked",
  defensiveBroadcast: "prepared",
  updatedAt: "2026-10-12T08:58:00Z",
  stages: [
    {
      stage: "signal",
      note: "Review timestamps + device fingerprints + absence of verified purchases — the evidence queue row above is this stage, verbatim.",
    },
    {
      stage: "classification",
      note: "Threat class REVIEW_RING. The signature carries defensive indicators and mitigations only — never weaponized payloads (invariant law).",
    },
    {
      stage: "policy-decision",
      note: "BLOCK — final and deterministic. No model preference, no configuration and no human request can lift it: the override API answers granted: false with BLOCK_IS_FINAL_DETERMINISTIC. There is no override affordance on this surface, and none may exist.",
    },
    {
      stage: "mitigation",
      note: "Reviews withheld from the average; listing held under review. Containment happened before exposure.",
    },
    {
      stage: "evidence",
      note: "CORROBORATED — three independent sources (timestamps, fingerprints, purchase records). The evidence stays attached to the incident for audit.",
    },
    {
      stage: "defensive-broadcast",
      note: "Prepared: the broadcast to other merchants carries indicators and mitigations only — defensive content, never the exploit mechanics.",
    },
    {
      stage: "learning",
      note: "A Lab candidate: promotion to a detection rule requires replay/evaluation evidence — CONFIRMED_THREAT status is earned, never automatic.",
    },
  ],
};
