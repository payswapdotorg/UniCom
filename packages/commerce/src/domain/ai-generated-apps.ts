/**
 * W1-008 AI-generated apps/workflows + agent-generated business tools:
 * typed contract for the request/approval/artifact lifecycle.
 *
 * Closes two matrix rows at once (they share a domain — different surfaces):
 *  - merchant-parity "AI-generated apps/workflows" (the merchant asks for a
 *    custom app or workflow; surfaced on the `app-extensions` surface);
 *  - ai-native-merchant-layer "Agent-generated business tools" (agents in
 *    the Lab surface propose custom business tools; surfaced on the
 *    `lab-surface`).
 *
 * Laws (W1-008 §truth distinctions; AGENTS.md rules; INVARIANTS):
 * - Agents PROPOSE, never mutate truth (AGENTS rule 1; INVARIANT 6). A
 *   generated app/tool request is a typed proposal with a human-approval
 *   gate; the generated artifact itself is sandboxed untrusted data.
 * - No production-reachable mocks (INVARIANT 39). The generated artifact is
 *   typed as `SandboxedArtifact` and never auto-installed — it must pass
 *   through the app-extension lifecycle (PENDING_REVIEW → INSTALLED).
 * - Simulation/Twin cannot become production truth (INVARIANT 16/17). A
 *   request born in the Lab surface carries its Lab origin; promotion to
 *   an installed app extension is an explicit human action.
 * - Discoverability via existing surface contracts (W1-007 lane law): both
 *   surfaces already exist; this contract gives them something to render.
 *
 * Lifecycle (deterministic state machine):
 *   REQUESTED → SIMULATED → APPROVED → INSTALLED → RETIRED
 *                ↘ REJECTED ↗
 */
import type {
  AgentGeneratedToolRequestId,
  AiGeneratedAppRequestId,
  AppExtensionId,
} from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/** The request origin (Lab vs merchant parity surface). */
export type AiGeneratedAppRequestOrigin =
  | "MERCHANT_PARITY_ASK"
  | "LAB_AGENT_PROPOSAL";

/** The lifecycle states of a generation request. */
export type AiGeneratedAppRequestState =
  | "REQUESTED"
  | "SIMULATED"
  | "APPROVED"
  | "INSTALLED"
  | "REJECTED"
  | "RETIRED";

/** The lifecycle triggers. */
export type AiGeneratedAppRequestTrigger =
  | "RUN_SIMULATION"
  | "APPROVE"
  | "REJECT"
  | "INSTALL"
  | "RETIRE";

export type AiGeneratedAppRequestTransitionError = {
  readonly code: "INVALID_AI_GENERATED_APP_REQUEST_TRANSITION";
  readonly from: AiGeneratedAppRequestState;
  readonly trigger: AiGeneratedAppRequestTrigger;
};

/**
 * Deterministic generation-request lifecycle.
 *
 * REQUESTED → SIMULATED: the agent/system runs a sandboxed simulation of the
 *   proposed app/workflow in the Commerce Twin (never production truth —
 *   INVARIANT 16/17).
 * SIMULATED → APPROVED: the human reviews the simulation result and approves
 *   (the human gate is MANDATORY — agents cannot self-approve, AGENTS rule 1).
 * APPROVED → INSTALLED: the generated artifact is materialized as an
 *   `AppExtension` and routed through the app-extension lifecycle
 *   (PENDING_REVIEW → INSTALLED — the same human gate applies twice).
 * Any state → REJECTED: terminal for this request (a new request may be made).
 */
export function aiGeneratedAppRequestTransition(
  state: AiGeneratedAppRequestState,
  trigger: AiGeneratedAppRequestTrigger,
): Result<AiGeneratedAppRequestState, AiGeneratedAppRequestTransitionError> {
  const table: Record<
    AiGeneratedAppRequestState,
    Partial<Record<AiGeneratedAppRequestTrigger, AiGeneratedAppRequestState>>
  > = {
    REQUESTED: { RUN_SIMULATION: "SIMULATED", REJECT: "REJECTED" },
    SIMULATED: { APPROVE: "APPROVED", REJECT: "REJECTED" },
    APPROVED: { INSTALL: "INSTALLED", REJECT: "REJECTED" },
    INSTALLED: { RETIRE: "RETIRED" },
    REJECTED: {},
    RETIRED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) {
    return err({
      code: "INVALID_AI_GENERATED_APP_REQUEST_TRANSITION",
      from: state,
      trigger,
    });
  }
  return ok(next);
}

/** A sandboxed generated artifact (untrusted data, INVARIANT 26). */
export interface SandboxedArtifact {
  /** Opaque content reference — never inline code or instructions. */
  readonly artifactRef: string;
  /** The artifact's declared surface kind (typed, never freeform). */
  readonly artifactKind: "WORKFLOW" | "DASHBOARD" | "REPORT" | "CONNECTOR_ADAPTER";
  /** Simulation result summary (Twin-derived; never production truth). */
  readonly simulationSummary: string;
}

/** One generation request (covers both merchant-parity and AI-native rows). */
export interface AiGeneratedAppRequest {
  readonly requestId: AiGeneratedAppRequestId;
  /** Origin: which surface initiated the request. */
  readonly origin: AiGeneratedAppRequestOrigin;
  /** The natural-language ask (untrusted data). */
  readonly ask: string;
  readonly state: AiGeneratedAppRequestState;
  /** Set once SIMULATED; the sandboxed artifact reference. */
  readonly simulatedArtifact?: SandboxedArtifact;
  /** Set once INSTALLED; the resulting AppExtension id (typed link). */
  readonly installedAppExtensionId?: AppExtensionId;
  readonly revision: number;
}

/** The Lab-surface variant — agents in the Lab surface propose tools. */
export interface AgentGeneratedToolRequest {
  readonly requestId: AgentGeneratedToolRequestId;
  /** Opaque EconomicGoal reference (the Lab agent's goal context). */
  readonly goalRef: string;
  readonly ask: string;
  readonly state: AiGeneratedAppRequestState;
  readonly simulatedArtifact?: SandboxedArtifact;
  readonly installedAppExtensionId?: AppExtensionId;
  readonly revision: number;
}

/** Advance a request (revision bumps per event-sourcing law). */
export function advanceAiGeneratedAppRequest(
  req: AiGeneratedAppRequest,
  trigger: AiGeneratedAppRequestTrigger,
  patch?: Partial<Pick<AiGeneratedAppRequest, "simulatedArtifact" | "installedAppExtensionId">>,
): Result<AiGeneratedAppRequest, AiGeneratedAppRequestTransitionError> {
  const result = aiGeneratedAppRequestTransition(req.state, trigger);
  if (!result.ok) return result;
  return ok({
    ...req,
    ...patch,
    state: result.value,
    revision: nextRevision(req.revision),
  });
}

/** Advance an agent-generated tool request (same lifecycle, different origin). */
export function advanceAgentGeneratedToolRequest(
  req: AgentGeneratedToolRequest,
  trigger: AiGeneratedAppRequestTrigger,
  patch?: Partial<Pick<AgentGeneratedToolRequest, "simulatedArtifact" | "installedAppExtensionId">>,
): Result<AgentGeneratedToolRequest, AiGeneratedAppRequestTransitionError> {
  const result = aiGeneratedAppRequestTransition(req.state, trigger);
  if (!result.ok) return result;
  return ok({
    ...req,
    ...patch,
    state: result.value,
    revision: nextRevision(req.revision),
  });
}

/**
 * The human-approval gate. Returns true iff the request is in SIMULATED
 * state (i.e. a simulation exists to review). Agents cannot self-approve
 * (AGENTS rule 1) — the gate is a typed precondition, not a runtime check.
 */
export function canApprove(
  state: AiGeneratedAppRequestState,
): boolean {
  return state === "SIMULATED";
}
