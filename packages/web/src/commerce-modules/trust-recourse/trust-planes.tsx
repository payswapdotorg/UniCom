/**
 * W2-029 — the trust-planes and security-pipeline sections (J17).
 *
 * Section 1 renders the four trust planes (UserTrust, AgentTrust,
 * CapabilityTrust, TransactionProof) as separate explainable cards — each
 * with its signal → risk → policy outcome → evidence → mitigation/next-step
 * chain — plus the P0–P5 proof legend. No aggregate score exists anywhere
 * (by contract law), and a trust signal is never transaction proof.
 *
 * Section 2 renders one BLOCKED security incident through the full pipeline.
 * BLOCK is a deterministic hard constraint: final, unoverrideable, and shown
 * with no override affordance. Defensive outputs carry indicators and
 * mitigations only — never weaponized payloads.
 */
import type { JSX } from "react";

import { DemoTag, StatusChip } from "../merchant-shared/ui.js";
import {
  BLOCKED_INCIDENT,
  PROOF_LEVEL_LEGEND,
  TRUST_PLANES,
  TRUST_PLANES_FIXTURES_ID,
} from "./trust-plane-data.js";
import type { TrustPlaneView } from "./trust-plane-data.js";

function planeChip(planeKind: TrustPlaneView["planeKind"]): string {
  return planeKind === "TRANSACTION_PROOF" ? "cm-chip cm-chip-ok" : "cm-chip cm-chip-unknown";
}

export function TrustPlanesSection(): JSX.Element {
  return (
    <section aria-label="Trust ledger — four separate planes">
      <h2 className="cm-section-title">Trust ledger — four separate planes, never one score</h2>
      <div className="cm-stack">
        <p className="cm-card-sub">
          UserTrust (who the counterparty is), AgentTrust (how reliable the agent worker is),
          Capability/ProviderTrust (how reliable a capability or provider implementation is) and
          TransactionProof (what actually proves a transaction) are four DIFFERENT planes. They are
          never compressed into a single score — the trust view contract has no score field — and a
          trust signal is never transaction proof. All values are committed demo fixtures{" "}
          <code>{TRUST_PLANES_FIXTURES_ID}</code> in the frozen field vocabulary.
        </p>
        {TRUST_PLANES.map((plane) => (
          <div key={plane.planeId} className="cm-state-item" data-testid="cm-trust-plane">
            <div className="cm-row">
              <span className="cm-state-item-label">{plane.label}</span>
              <span className={planeChip(plane.planeKind)}>{plane.planeKind}</span>
              <DemoTag />
            </div>
            <p className="cm-state-item-detail">{plane.explanation}</p>
            <p className="cm-state-item-detail">
              <strong>Signal:</strong> {plane.chain.signal}
            </p>
            <p className="cm-state-item-detail">
              <strong>Risk:</strong> {plane.chain.risk}
            </p>
            <p className="cm-state-item-detail">
              <strong>Policy outcome:</strong> {plane.chain.policyOutcome}
            </p>
            <p className="cm-state-item-detail">
              <strong>Evidence:</strong> {plane.chain.evidence}
            </p>
            <p className="cm-state-item-detail">
              <strong>Mitigation / next step:</strong> {plane.chain.mitigationNextStep}
            </p>
          </div>
        ))}
        <div className="cm-state-item" data-testid="cm-proof-legend">
          <div className="cm-row">
            <span className="cm-state-item-label">Proof legend — the only levels that exist</span>
            <span className="cm-chip cm-chip-muted">P0–P5</span>
          </div>
          {PROOF_LEVEL_LEGEND.map((level) => (
            <p key={level.id} className="cm-state-item-detail">
              <strong>{level.label}:</strong> {level.description}
            </p>
          ))}
          <p className="cm-state-item-detail">
            Proof levels are selected BEFORE consequential execution and pinned to it. What proof is
            NOT: any trust signal. No UserTrust, AgentTrust or CapabilityTrust value can construct,
            upgrade or stand in for a TransactionProof — the planes stay separate on every surface.
          </p>
        </div>
      </div>
    </section>
  );
}

export function SecurityPipelineSection(): JSX.Element {
  return (
    <section aria-label="Security pipeline — one blocked incident, every stage">
      <h2 className="cm-section-title">Security — the immune system, one blocked case end-to-end</h2>
      <div className="cm-stack">
        <div className="cm-state-item" data-testid="cm-security-block">
          <div className="cm-row">
            <span className="cm-state-item-label">incident {BLOCKED_INCIDENT.incidentId}</span>
            <StatusChip status="BLOCKED" note="BLOCK — deterministic hard constraint, final: no override exists anywhere (not model, not config, not human)" />
            <span className="cm-chip cm-chip-warn">severity {BLOCKED_INCIDENT.severity}</span>
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">
            <strong>Signal:</strong> {BLOCKED_INCIDENT.signal}
          </p>
          <p className="cm-state-item-detail">
            <strong>Reason:</strong> {BLOCKED_INCIDENT.reason}
          </p>
          <p className="cm-state-item-detail">
            <strong>Effect:</strong> {BLOCKED_INCIDENT.effect}
          </p>
          <p className="cm-state-item-detail">
            <strong>Mitigation:</strong> {BLOCKED_INCIDENT.mitigation}
          </p>
          <p className="cm-state-item-detail">
            <strong>Next action:</strong> {BLOCKED_INCIDENT.nextAction}
          </p>
          <p className="cm-state-item-detail">
            <strong>Defensive broadcast:</strong> {BLOCKED_INCIDENT.defensiveBroadcast} — the
            broadcast carries indicators and mitigations only, never weaponized payloads.
          </p>
        </div>
        <div className="cm-stack" data-testid="cm-security-pipeline">
          {BLOCKED_INCIDENT.stages.map((stage) => (
            <div key={stage.stage} className="cm-journey-item">
              <span className="cm-journey-name">{stage.stage}</span>
              {stage.stage === "policy-decision" ? (
                <span className="cm-chip cm-chip-err">BLOCK — final</span>
              ) : (
                <span className="cm-chip cm-chip-muted">stage</span>
              )}
              <span className="cm-journey-summary">{stage.note}</span>
            </div>
          ))}
          <p className="cm-card-sub">
            The queue above is the signal stage; this is the whole pipeline for one case. BLOCK is
            final and deterministic — the override request answers granted: false with
            BLOCK_IS_FINAL_DETERMINISTIC — so this surface offers no override affordance, and none
            may exist. Learning is a Lab promotion: candidates graduate to detection rules only
            with replay/evaluation evidence.
          </p>
        </div>
      </div>
    </section>
  );
}
