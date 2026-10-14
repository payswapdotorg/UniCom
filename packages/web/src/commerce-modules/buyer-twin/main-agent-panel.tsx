/**
 * W2-029 — the Main Agent panel (J14): one agent, your goal, visible reasoning.
 *
 * Objective, current step, evidence (with truth classes and freshness),
 * proposed plan, simulation-before-authorization, and the exact approvals
 * consequential steps need — including a DENIED authority state with its
 * reason and safe next option. No swarm chat, no internal architecture
 * terminology as primary UX. Every "agent" statement on this panel is
 * presentation over committed demo fixtures: nothing here executes, commits
 * or changes canonical commerce state.
 */
import type { JSX } from "react";

import { DemoTag, FreshnessChip, TermLine } from "../buyer-support/ui.js";
import {
  AGENT_APPROVALS,
  AGENT_EVIDENCE,
  AGENT_LOOP_PHASES,
  AGENT_OBJECTIVE,
  AGENT_PLAN,
  AGENT_VIEWS_FIXTURES_ID,
  AGENT_WORK_NODES,
  agentPredictedOutcomes,
  evidenceAgeLabel,
} from "./agent-views.js";
import type { ApprovalNeedView, TruthClass } from "./agent-views.js";

const TRUTH_CHIP: Readonly<Record<TruthClass, string>> = {
  operational: "cm-chip cm-chip-ok",
  observed: "cm-chip cm-chip-unknown",
  historical: "cm-chip cm-chip-muted",
  predictive: "cm-chip cm-chip-unknown",
};

function statusChip(status: string): string {
  if (status === "denied" || status === "blocked") return "cm-chip cm-chip-err";
  if (status === "pending" || status === "awaiting-approval") return "cm-chip cm-chip-warn";
  if (status === "unknown") return "cm-chip cm-chip-unknown";
  return "cm-chip cm-chip-ok";
}

function TruthClassChip({ truthClass }: { readonly truthClass: TruthClass }): JSX.Element {
  return <span className={TRUTH_CHIP[truthClass]}>{truthClass.toUpperCase()}</span>;
}

export function MainAgentPanel(): JSX.Element {
  const predictions = agentPredictedOutcomes();
  return (
    <section className="cm-card" aria-label="Main Agent" data-testid="cm-agent-panel">
      <div className="cm-row">
        <h2 className="cm-card-title">Your Main Agent — working the goal</h2>
        <DemoTag />
        <span className="cm-chip cm-chip-muted">fixtures {AGENT_VIEWS_FIXTURES_ID}</span>
      </div>
      <p className="cm-card-sub">
        One Main Agent works toward your goal — planning, simulating and asking for approval —
        and nothing it shows here executes: every value is a proposal, a simulation or an
        observation, all from committed demo fixtures. When a step would commit you to anything,
        the exact approval it needs is named below.
      </p>
      <TermLine label="Goal" value={AGENT_OBJECTIVE.statement} />
      <TermLine label="In your words" value={AGENT_OBJECTIVE.goalEcho} />

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>The loop — where your agent is now</h3>
      <div className="cm-stack" data-testid="cm-agent-loop">
        {AGENT_LOOP_PHASES.map((phase) => (
          <div key={phase.phase} className="cm-journey-item">
            <span className="cm-journey-name">{phase.label}</span>
            {phase.nodeStatus === null ? (
              <span className="cm-chip cm-chip-muted">presentation only</span>
            ) : (
              <span className={statusChip(phase.nodeStatus)}>{phase.nodeStatus}</span>
            )}
            <span className="cm-journey-summary">{phase.stateNote}</span>
          </div>
        ))}
        <p className="cm-card-sub">
          The loop vocabulary is presentation: the frozen contracts define the underlying node
          statuses (planning / awaiting-approval / idle / unknown), and phases without a wired
          runtime say so instead of simulating progress. Current step:{" "}
          <strong>Simulate — the counterfactual panels below</strong>.
        </p>
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Evidence the agent is using</h3>
      <div className="cm-stack" data-testid="cm-agent-evidence">
        {AGENT_EVIDENCE.map((item) => (
          <div key={item.evidenceId} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">{item.evidenceId}</span>
              <TruthClassChip truthClass={item.truthClass} />
              <FreshnessChip
                freshness={item.freshness}
                checkedAt={item.capturedAt}
                ageLabel={evidenceAgeLabel(item.capturedAt)}
              />
              <span className="cm-chip cm-chip-muted">{item.proofRef}</span>
            </div>
            <p className="cm-state-item-detail">{item.summary}</p>
          </div>
        ))}
        <p className="cm-card-sub">
          Operational, observed, historical and predictive truth stay visibly separate; verified,
          stale and UNKNOWN freshness stay distinct — UNKNOWN is not failure, and a stale
          observation is labelled as a guide, not a promise.
        </p>
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Proposed plan — nothing committed</h3>
      <div className="cm-stack" data-testid="cm-agent-plan">
        {AGENT_PLAN.map((step) => (
          <div key={step.stepId} className="cm-journey-item">
            <span className="cm-journey-name">{step.stepId}</span>
            <span className="cm-chip cm-chip-warn">PROPOSED — not committed</span>
            <span className="cm-journey-summary">{step.text}</span>
            <span className="cm-env-note">{step.handoffSurface}</span>
          </div>
        ))}
        <p className="cm-card-sub">
          A plan is a proposal. No step has executed and no step can execute from this surface —
          the owning surfaces (J1 / J4 / J6 / J7) hold the real actions, each behind its own terms
          and confirmation gates.
        </p>
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Simulation — before any authorization</h3>
      <div className="cm-stack" data-testid="cm-agent-simulation">
        {predictions.map((prediction) => (
          <div key={prediction.summary} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">Predicted outcome</span>
              <span className="cm-chip cm-chip-unknown">PREDICTIVE — simulation only</span>
            </div>
            <p className="cm-state-item-detail">{prediction.summary}</p>
            <p className="cm-state-item-detail">
              Confidence: {prediction.confidenceNote} Horizon: {prediction.horizonNote}
            </p>
          </div>
        ))}
        <p className="cm-card-sub">
          These predictions are computed by the same deterministic advisory runtime as the
          counterfactual panels below — simulation only, nothing executed. The exact approval any
          consequential version of these steps needs is listed next.
        </p>
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Approvals — the authority boundary</h3>
      <div className="cm-stack" data-testid="cm-agent-approvals">
        {AGENT_APPROVALS.map((approval) => (
          <ApprovalCard key={approval.approvalId} approval={approval} />
        ))}
        <p className="cm-card-sub">
          The agent asks; you decide. A denied authority is shown as denied — never retried
          silently, never worked around — and each state names the safe next option.
        </p>
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Execution progress (work graph)</h3>
      <div className="cm-stack" data-testid="cm-agent-workgraph">
        {AGENT_WORK_NODES.map((node) => (
          <div key={node.nodeId} className="cm-journey-item">
            <span className="cm-journey-name">{node.title}</span>
            <span className={statusChip(node.status)}>{node.status}</span>
            <span className="cm-chip cm-chip-muted">{node.kind}</span>
            <span className="cm-journey-summary">{node.note}</span>
          </div>
        ))}
        <p className="cm-card-sub">
          Node statuses use the frozen contract vocabulary. No node claims runtime execution or
          verification — because nothing has executed.
        </p>
      </div>
    </section>
  );
}

function ApprovalCard({ approval }: { readonly approval: ApprovalNeedView }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-agent-approval">
      <div className="cm-row">
        <span className="cm-state-item-label">{approval.approvalId}</span>
        <span className={statusChip(approval.status)}>AUTHORIZATION {approval.status.toUpperCase()}</span>
      </div>
      <TermLine label="What needs approval" value={approval.scope} />
      <TermLine label="Who approves" value={approval.approverLabel} />
      <TermLine label="Why this state" value={approval.reason} />
      <TermLine label="Safe next option" value={approval.safeNextOption} />
    </div>
  );
}
