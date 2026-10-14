/**
 * W2-029 — Main Agent view fixtures + module-local contract mirrors (J14).
 *
 * The Main Agent surface expresses the Goal → Observe → Plan → Simulate →
 * Approve → Execute → Verify → Learn loop (FROZEN-ARCHITECTURE §1 / §22) as
 * PRESENTATION only: the loop is prose + the WorkGraphNodeStatus vocabulary in
 * the frozen contracts — there is no runtime AgentLoopPhase type, and this
 * module invents none. Numbers in the predicted outcomes are computed by the
 * REAL advisory runtime (runInkWhatIf — the same pure functions the counter-
 * factual panels below use), so the agent's "simulation" claims are traceable
 * to the twin, never free-text.
 *
 * CONTRACT MIRROR NOTE: the view shapes below mirror @unicom/experience
 * contracts (TruthClass / EvidenceReference / AuthorizationStatus /
 * WorkGraphNode* / ObjectivePlanResponse vocabulary) field-for-field as
 * module-local structural types. They cannot be imported from the package:
 * packages/experience/src/contract.ts uses extension-less relative re-exports,
 * which fail TS2835 under moduleResolution nodenext, so the package's root
 * surface resolves EMPTY to tsc from packages/web (pre-existing baseline
 * defect — 91 web TS2305s at the dispatch SHA; that file is outside this
 * lane's write surface). Mirrors keep this module at zero new type errors
 * while preserving the frozen field vocabulary 1:1.
 */
import { classifyFreshness, minutesAgoLabel, moneyText, utc } from "../buyer-support/demo-data.js";
import { runInkWhatIf } from "./twin-data.js";

// ---------------------------------------------------------------------------
// Module-local structural mirrors (see header note)
// ---------------------------------------------------------------------------

/** Mirror of experience TruthClass (operational | observed | historical | predictive). */
export type TruthClass = "operational" | "observed" | "historical" | "predictive";

/** Mirror of experience AuthorizationStatus (UNKNOWN preserved). */
export type AuthorizationStatus =
  | "not-required"
  | "pending"
  | "granted"
  | "denied"
  | "expired"
  | "unknown";

/** Mirror of experience WorkGraphNodeStatus (closest contract vocabulary to loop phases). */
export type WorkGraphNodeStatus =
  | "idle"
  | "planning"
  | "awaiting-approval"
  | "executing"
  | "verifying"
  | "blocked"
  | "needs-attention"
  | "unknown";

/** The loop phases as PRESENTATION vocabulary (FROZEN §1 prose — no runtime type exists). */
export type AgentLoopPhaseId =
  | "goal"
  | "observe"
  | "plan"
  | "simulate"
  | "approve"
  | "execute"
  | "verify"
  | "learn";

/** One evidence item the agent is reasoning over (mirror of EvidenceReference + freshness). */
export interface EvidenceItemView {
  readonly evidenceId: string;
  readonly kind: string;
  readonly summary: string;
  readonly truthClass: TruthClass;
  readonly freshness: "verified" | "stale" | "unknown";
  readonly capturedAt: string | null;
  readonly proofRef: string;
}

/** One proposed plan step — a proposal, never a commitment. */
export interface PlanStepView {
  readonly stepId: string;
  readonly text: string;
  readonly handoffSurface: string;
}

/** One predicted outcome — predictive truth only (mirror field vocabulary). */
export interface PredictedOutcomeView {
  readonly truthClass: "predictive";
  readonly summary: string;
  readonly confidenceNote: string;
  readonly horizonNote: string;
}

/** One approval the agent needs before anything consequential (mirror field vocabulary). */
export interface ApprovalNeedView {
  readonly approvalId: string;
  readonly scope: string;
  readonly approverLabel: string;
  readonly status: AuthorizationStatus;
  readonly reason: string;
  readonly safeNextOption: string;
}

/** One loop phase row: presentation label + the contract status that backs it (or null). */
export interface LoopPhaseView {
  readonly phase: AgentLoopPhaseId;
  readonly label: string;
  readonly stateNote: string;
  /** Contract vocabulary backing this phase, or null when no wired runtime exists for it. */
  readonly nodeStatus: WorkGraphNodeStatus | null;
}

/** One work-graph node in the execution progress (mirror field vocabulary, demo values). */
export interface WorkNodeView {
  readonly nodeId: string;
  readonly kind: "goal" | "task" | "simulation" | "approval";
  readonly title: string;
  readonly status: WorkGraphNodeStatus;
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Committed DEMO fixtures (fixed demo clock 2026-10-12T09:00:00Z)
// ---------------------------------------------------------------------------

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const AGENT_VIEWS_FIXTURES_ID = "w2-029-agent-views@1";

/** The demo objective (plain language — the user's goal, not swarm vocabulary). */
export const AGENT_OBJECTIVE = {
  statement:
    "Keep the studio supplied: pay less than list for ink without breaking the print schedule, and stop paying for an idle plotter.",
  goalEcho:
    "Spend less on consumables while every job stays on schedule — echoed from your intent draft (demo fixture).",
} as const;

/** Evidence the Main Agent is reasoning over — three truth classes + three freshness classes. */
export const AGENT_EVIDENCE: readonly EvidenceItemView[] = [
  {
    evidenceId: "w2j14-ev-intent",
    kind: "document",
    summary:
      "Your intent draft on this host: shift ink purchasing toward the co-op pool when the price advantage is real (operational demo state).",
    truthClass: "operational",
    freshness: classifyFreshness(utc("2026-10-12T08:55:00Z"), 60),
    capturedAt: "2026-10-12T08:55:00Z",
    proofRef: "P1",
  },
  {
    evidenceId: "w2j14-ev-list-price",
    kind: "connector-observation",
    summary:
      "Verified list price USD 49.00/set from the committed demo feed — the OPERATIONAL baseline the counterfactual runs against.",
    truthClass: "observed",
    freshness: classifyFreshness(utc("2026-10-12T08:52:00Z"), 60),
    capturedAt: "2026-10-12T08:52:00Z",
    proofRef: "P2",
  },
  {
    evidenceId: "w2j14-ev-pool-threshold",
    kind: "connector-observation",
    summary:
      "Pool threshold price USD 41.00/set — applies only if the pool forms; the live formation state lives on the J4 surface. This observation is from yesterday (stale — a guide, not a promise).",
    truthClass: "observed",
    freshness: classifyFreshness(utc("2026-10-11T14:30:00Z"), 60),
    capturedAt: "2026-10-11T14:30:00Z",
    proofRef: "P2",
  },
  {
    evidenceId: "w2j14-ev-history",
    kind: "account-history",
    summary:
      "Six weeks of committed purchase history [3, 4, 2, 3, 5, 3] — the forecast basis (immutable demo fixture).",
    truthClass: "historical",
    freshness: "verified",
    capturedAt: "2026-10-01T00:00:00Z",
    proofRef: "P1",
  },
  {
    evidenceId: "w2j14-ev-alt-seller",
    kind: "provider-signed-state",
    summary:
      "The alternative seller's stock level could not be confirmed — freshness UNKNOWN. UNKNOWN is never rendered as a price, and it is not a failure: the agent simply does not rely on it.",
    truthClass: "observed",
    freshness: "unknown",
    capturedAt: null,
    proofRef: "P0",
  },
];

/** The proposed plan — every step is a PROPOSAL; nothing has committed or executed. */
export const AGENT_PLAN: readonly PlanStepView[] = [
  {
    stepId: "w2j14-step-pool",
    text: "Shift half of ink purchasing to the co-op pool (what-if panels below simulate exactly this).",
    handoffSurface: "J4 · group-buy surface owns the real action",
  },
  {
    stepId: "w2j14-step-baseline",
    text: "Keep buying the remainder at the verified list price so the print schedule is never at risk.",
    handoffSurface: "J1 · buyer-intent surface owns the real action",
  },
  {
    stepId: "w2j14-step-plotter",
    text: "Revisit selling the idle plotter and renting during busy seasons (rent-vs-own panel below).",
    handoffSurface: "J6/J7 · rent and resale surfaces own the real actions",
  },
];

/** Predicted outcomes — computed by the REAL advisory runtime, labelled predictive. */
export function agentPredictedOutcomes(): readonly PredictedOutcomeView[] {
  const half = runInkWhatIf({ shareBps: 5000, multiplier: 1, newSkuNoHistory: false });
  const full = runInkWhatIf({ shareBps: 10_000, multiplier: 1, newSkuNoHistory: false });
  // Rent break-even in exact integer minor units: 7 weeks × USD 95.00 = USD 665.00
  // stays under the USD 741.00 resale net; 8 weeks (USD 760.00) exceeds it.
  const summaryA =
    half.kind === "OBSERVED" && full.kind === "OBSERVED"
      ? `Shifting half your ink purchasing to the pool projects ${moneyText(half.projectedDelta4w)} lower spend per 4 weeks (a full shift: ${moneyText(full.projectedDelta4w)}) — assumes the pool forms at its threshold price, which it may not.`
      : "Projection unavailable — the runtime refused to guess (UNKNOWN).";
  return [
    {
      truthClass: "predictive",
      summary: summaryA,
      confidenceNote:
        "Medium — deterministic arithmetic over committed fixtures; the pool forming is the assumption that can fail (the threshold observation is stale).",
      horizonNote: "Next 4 weeks.",
    },
    {
      truthClass: "predictive",
      summary:
        "Selling the idle plotter nets USD 741.00 today; renting stays under that net only at 7 weeks of use per year or fewer — at your projected 12 weeks, holding costs less.",
      confidenceNote:
        "Medium — the break-even is exact fixture math; the weeks-of-use figure is your projection, not a fact.",
      horizonNote: "Next 12 months.",
    },
  ];
}

/** Approvals the agent needs — one pending, one DENIED (the authority boundary). */
export const AGENT_APPROVALS: readonly ApprovalNeedView[] = [
  {
    approvalId: "w2j14-appr-pool",
    scope: "Joining the group-buy pool (would commit you to pool terms on formation).",
    approverLabel: "You (the buyer) — the agent never commits on your behalf",
    status: "pending",
    reason:
      "Consequential action: pool participation is a commitment. The Main Agent holds no authority to commit you; approval is required before anything executes.",
    safeNextOption:
      "Open the J4 group-buy surface from Explore, review the live threshold state and terms, and confirm there — nothing commits from this screen.",
  },
  {
    approvalId: "w2j14-appr-autopurchase",
    scope: "Purchasing ink autonomously on your behalf (agent-initiated spend).",
    approverLabel: "You (the buyer) — and the platform authority layer",
    status: "denied",
    reason:
      "Denied at the authority boundary: the Main Agent holds no purchasing authority here, and the web plane exposes no command path that spends. A denial is not a failure — it is the boundary working exactly as the frozen contracts require.",
    safeNextOption:
      "Act yourself from the J1 intent surface or the J4 pool surface, each with its own terms and confirmation gates — or grant nothing and keep the agent read-only.",
  },
];

/** The loop phases as presentation rows — phases without a wired runtime say so. */
export const AGENT_LOOP_PHASES: readonly LoopPhaseView[] = [
  {
    phase: "goal",
    label: "Goal",
    stateNote:
      "Your objective, in your words (above). The agent-plane goal object is an opaque reference in the frozen contracts — no structural goal type exists yet, so none is simulated here.",
    nodeStatus: null,
  },
  {
    phase: "observe",
    label: "Observe",
    stateNote:
      "The evidence panel below: verified, stale and UNKNOWN observations kept visibly separate — operational, observed and historical truth never blended.",
    nodeStatus: null,
  },
  {
    phase: "plan",
    label: "Plan",
    stateNote: "Three proposed steps (below) — a plan is a proposal, never a commitment.",
    nodeStatus: "planning",
  },
  {
    phase: "simulate",
    label: "Simulate",
    stateNote:
      "The what-if panels below run the counterfactuals through the deterministic advisory runtime — simulation only, nothing executes.",
    nodeStatus: "idle",
  },
  {
    phase: "approve",
    label: "Approve",
    stateNote:
      "One approval pending, one denied at the authority boundary (below) — consequential steps name the exact approval they need.",
    nodeStatus: "awaiting-approval",
  },
  {
    phase: "execute",
    label: "Execute",
    stateNote:
      "Not wired on this surface — the structural write-block below means no plan or simulation can execute from here. Execution belongs to the owning surfaces (J1/J4/J6/J7), each with its own confirmation gates.",
    nodeStatus: null,
  },
  {
    phase: "verify",
    label: "Verify",
    stateNote:
      "Nothing to verify yet: verification applies to executed commands, and nothing has executed. Shown rather than hidden.",
    nodeStatus: null,
  },
  {
    phase: "learn",
    label: "Learn",
    stateNote:
      "Presentation only: learning is an agent-plane Lab concept — candidates promote only with replay/evaluation evidence, and nothing on this surface learns.",
    nodeStatus: null,
  },
];

/** Execution progress as work-graph nodes (contract status vocabulary, demo values). */
export const AGENT_WORK_NODES: readonly WorkNodeView[] = [
  {
    nodeId: "w2j14-node-goal",
    kind: "goal",
    title: "Studio supply goal (demo)",
    status: "idle",
    note: "Recorded from your intent draft; the agent-plane goal is an opaque ref — no runtime goal engine is wired.",
  },
  {
    nodeId: "w2j14-node-plan",
    kind: "task",
    title: "Three-step supply plan",
    status: "planning",
    note: "Assembled and shown as proposals — nothing committed.",
  },
  {
    nodeId: "w2j14-node-simulation",
    kind: "simulation",
    title: "Ink-shift + rent-vs-own counterfactuals",
    status: "idle",
    note: "Runs deterministically on demand below; no runtime dispatch, no side effects.",
  },
  {
    nodeId: "w2j14-node-approval",
    kind: "approval",
    title: "Pool participation approval",
    status: "awaiting-approval",
    note: "Pending with you; autonomous purchase is DENIED at the boundary (by design).",
  },
];

/** Age label for an evidence item against the fixed demo clock. */
export function evidenceAgeLabel(capturedAt: string | null): string | null {
  return capturedAt === null ? null : minutesAgoLabel(capturedAt);
}
