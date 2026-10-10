/**
 * peer-tradecycle component — the J9 surface: a discovered 3-hop cycle with
 * ≥3 synthetic participants, per-leg terms (item, counterpart, proof level,
 * privacy, consent expiry), per-leg individual consent from the GIVING
 * participant only, honest stop states (refusal / expiry / withdrawal never
 * silently commit other legs), re-plan, and the execution hand-off boundary
 * (never a simulated live trade leg).
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { PROOF_LEVELS } from "@unicom/experience";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { CommitmentGate, DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import {
  DEMO_TRADE_PARTICIPANTS,
  consentLeg,
  initialCycle,
  lapseLeg,
  prepareHandoff,
  rePlanCycle,
  refuseLeg,
  withdrawLeg,
} from "./tradecycle-data.js";
import type { CycleStep, DemoTradeCycle, DemoTradeLeg } from "./tradecycle-data.js";

const CONSENT_CHIP: Readonly<Record<DemoTradeLeg["consent"], string>> = {
  UNCONSENTED: "cm-chip cm-chip-muted",
  CONSENTED: "cm-chip cm-chip-ok",
  REFUSED: "cm-chip cm-chip-warn",
  EXPIRED: "cm-chip cm-chip-warn",
  WITHDRAWN: "cm-chip cm-chip-muted",
};

function participant(id: string): string {
  return DEMO_TRADE_PARTICIPANTS.find((one) => one.id === id)?.name ?? id;
}

function proofLabel(id: string): string {
  return PROOF_LEVELS.find((level) => level.id === id)?.label ?? id;
}

export default function PeerTradecycleComponent({ host }: CommerceModuleProps): JSX.Element {
  const [cycle, setCycle] = useState<DemoTradeCycle>(initialCycle);
  const [error, setError] = useState<string | null>(null);
  const [ownGateLeg, setOwnGateLeg] = useState<number | null>(null);
  const [handoffGateOpen, setHandoffGateOpen] = useState(false);

  const run = (step: () => CycleStep): void => {
    const next = step();
    if (!next.ok) {
      setError(`Honest rejection from the consent machine: ${next.error}`);
      return;
    }
    setError(null);
    setCycle(next.cycle);
  };

  const stopped =
    cycle.status === "STOPPED_REFUSAL" || cycle.status === "STOPPED_EXPIRY" || cycle.status === "STOPPED_WITHDRAWAL";

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J9 · Trade cycles — multi-hop swaps</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          A trade cycle chains gives-and-wants across several participants so everyone both gives and
          receives. The law of this surface: <strong>every leg needs its own consent from the giving
          participant</strong> — a refusal, a dropout or an expired consent window stops or re-plans
          the whole cycle. Other legs are never silently committed: a stop is a stop.
        </p>
      </section>

      <section className="cm-card" aria-label="Engine boundary honesty">
        <h2 className="cm-card-title">What is real here, and what is not</h2>
        <TermLine
          label="Real"
          value="The per-leg terms, the per-leg consent lifecycle (consent / refusal / withdrawal / expiry), the stop-and-re-plan mechanics — all deterministic demo state mirroring the coordination laws."
        />
        <TermLine
          label="Demo-only"
          value="The candidate cycle itself. Discovery (bounded search over the offer graph) and validation (per-leg authorization checks) run in the agent lane, which the web host cannot import — candidates here are committed demo fixtures."
        />
        <TermLine
          label="Not wired (blocker)"
          value="Execution. Even with every leg consented, no trade leg executes in this host: the commerce seam carrying per-leg authorizations is agent-lane. The hand-off panel below records the request honestly — it never simulates a completed trade."
        />
      </section>

      <section className="cm-card" aria-label="Discovered cycle" data-testid="cm-tradecycle-cycle">
        <div className="cm-row">
          <h2 className="cm-card-title">{cycle.label}</h2>
          <DemoTag />
          {stopped ? <LifecycleStateChip state="DENIED" /> : null}
          {cycle.status === "HANDOFF_PREPARED" ? <span className="cm-chip cm-chip-unknown">HANDOFF PREPARED — not executed</span> : null}
        </div>
        <TermLine label="Cycle" value={`${cycle.cycleId} · ${cycle.legs.length} hops · ${cycle.legs.length} participants`} />
        <TermLine label="Status" value={cycle.status} />
        {error ? <p className="cm-blocked-reason">{error}</p> : null}

        {stopped ? (
          <div className="cm-state-item" data-testid="cm-tradecycle-stopped" style={{ borderColor: "var(--cm-warn)" }}>
            <div className="cm-row">
              <span className="cm-state-item-label">Cycle stopped — {cycle.status}</span>
              <LifecycleStateChip state="DENIED" />
            </div>
            <p className="cm-state-item-detail">
              <strong>No other leg was committed.</strong> Consents already recorded on other legs
              commit nothing now: execution requires every leg, so a stopped cycle moves no items and
              owes nothing. Each participant keeps their own goods.
            </p>
            {cycle.alternativeParticipantId !== null ? (
              <p className="cm-state-item-detail">
                Re-plan candidate available: {participant(cycle.alternativeParticipantId)} can replace
                the stopped leg&apos;s participant in a fresh proposal (fresh consent for every leg).
              </p>
            ) : (
              <p className="cm-state-item-detail">
                No further re-plan candidate exists in this demo — the asset stays yours; nothing moved.
              </p>
            )}
          </div>
        ) : null}

        <div className="cm-stack" style={{ marginTop: 8 }}>
          {cycle.legs.map((one) => (
            <LegCard
              key={one.legIndex}
              leg={one}
              cycle={cycle}
              host={host}
              ownGateLeg={ownGateLeg}
              setOwnGateLeg={setOwnGateLeg}
              run={run}
            />
          ))}
        </div>

        {stopped ? (
          cycle.alternativeParticipantId !== null ? (
            <button
              type="button"
              className="cm-button cm-button-primary"
              style={{ marginTop: 10 }}
              onClick={() => {
                setError(null);
                setCycle(rePlanCycle());
              }}
            >
              Re-plan with {participant(cycle.alternativeParticipantId)} (fresh consents for every leg)
            </button>
          ) : null
        ) : null}
      </section>

      {cycle.status === "ALL_LEGS_CONSENTED" ? (
        handoffGateOpen ? (
          <CommitmentGate
            title="Request the execution hand-off (terms, consequence, evidence)"
            terms={[
              { label: "Cycle", value: `${cycle.cycleId} — every one of the ${cycle.legs.length} legs carries its giver's recorded consent` },
              { label: "What would execute", value: "Each leg's item moves from its giver to its receiver, atomically in this demo's terms: no partial execution path is offered." },
              { label: "Recourse", value: "Per-leg recourse follows the trust lane's dispute flow; a failed leg never strands the others mid-flight (staged-with-recourse execution is the agent lane's decision)." },
            ]}
            consequence="Confirming records a hand-off REQUEST in this screen's local demo state. It does NOT execute any trade: execution passes through the agent lane's commerce seam with these per-leg authorizations, which the web host cannot reach. No item moves, no leg commits — the honest state below stays 'prepared, not executed'."
            evidence={[
              "Per-leg consents recorded above (each by the giving participant only)",
              "Consent windows all unexpired at the demo clock",
            ]}
            confirmLabel="Request the hand-off (does not execute)"
            onConfirm={() => {
              run(() => prepareHandoff(cycle));
              setHandoffGateOpen(false);
            }}
            onCancel={() => setHandoffGateOpen(false)}
          />
        ) : (
          <section className="cm-card" data-testid="cm-tradecycle-handoff">
            <h3 className="cm-card-title">All legs consented — execution hand-off</h3>
            <p className="cm-card-sub">
              Every leg carries its giver&apos;s consent. The next step in the real system is the
              execution hand-off through the commerce seam (per-leg authorizations attached). In this
              host that seam is agent-lane and not reachable — the button below records the request in
              demo state only and never simulates a completed trade.
            </p>
            <button type="button" className="cm-button cm-button-primary" onClick={() => setHandoffGateOpen(true)}>
              Request the execution hand-off (with authorization)
            </button>
          </section>
        )
      ) : null}

      {cycle.status === "HANDOFF_PREPARED" ? (
        <section className="cm-card" style={{ borderColor: "var(--cm-unknown)" }}>
          <div className="cm-row">
            <h3 className="cm-card-title">Hand-off requested — NOT executed</h3>
            <span className="cm-chip cm-chip-unknown">UNKNOWN outcome — honestly not run</span>
          </div>
          <p className="cm-card-sub">
            The request is recorded in local demo state. Whether the cycle executes is UNKNOWN until
            the agent lane&apos;s seam answers — and in demo mode it never will. No item has moved;
            every participant keeps their goods. This is an honest unavailable state, not a
            simulated success.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function LegCard({
  leg,
  cycle,
  host,
  ownGateLeg,
  setOwnGateLeg,
  run,
}: {
  readonly leg: DemoTradeLeg;
  readonly cycle: DemoTradeCycle;
  readonly host: CommerceModuleProps["host"];
  readonly ownGateLeg: number | null;
  readonly setOwnGateLeg: (legIndex: number | null) => void;
  readonly run: (step: () => CycleStep) => void;
}): JSX.Element {
  const isOwnLeg = leg.fromId === "harbor-lane";
  const giver = participant(leg.fromId);
  const receiver = participant(leg.toId);
  const shortGiver = giver.split(" (")[0]!;
  const open = cycle.status === "PROPOSED";
  // Your incoming leg: the leg whose receiver is you (your stated want).
  const incoming = cycle.legs.find((one) => one.toId === "harbor-lane");
  return (
    <div className="cm-state-item" data-testid={`cm-tradecycle-leg-${leg.legIndex}`}>
      <div className="cm-row">
        <span className="cm-state-item-label">
          Leg {leg.legIndex + 1} · {giver} → {receiver}
        </span>
        <span className={CONSENT_CHIP[leg.consent]}>{leg.consent}</span>
        <DemoTag />
      </div>
      <TermLine label="Item moving on this leg" value={leg.item} />
      <TermLine label="Consent authority" value={`${giver} — only the giving participant may authorize this leg`} />
      <TermLine label="Proof level" value={proofLabel(DEMO_TRADE_PARTICIPANTS.find((one) => one.id === leg.fromId)?.proofLevel ?? "P0")} />
      <TermLine label="Privacy" value="Only the immediate counterpart learns your identity on this leg — no participant sees the whole graph." />
      <TermLine label="Consent window ends" value={`${leg.consentExpiresAt} (demo clock)`} />
      <PermissionGate host={host} permission="tradecycle.consent-leg">
        {open && leg.consent === "UNCONSENTED" ? (
          isOwnLeg ? (
            ownGateLeg === leg.legIndex ? (
              <CommitmentGate
                title="Consent to YOUR leg (terms, consequence, evidence)"
                terms={[
                  { label: "You give", value: leg.item },
                  { label: "You asked for", value: `${incoming?.item ?? "nothing on this cycle"} — delivered to you on your incoming leg${incoming ? ` (leg ${incoming.legIndex + 1})` : ""}` },
                  { label: "Counterpart on this leg", value: receiver },
                  { label: "Revocability", value: "You may withdraw any time before the hand-off executes — a withdrawal stops the whole cycle, it never strands a partial trade." },
                ]}
                consequence="Consenting authorizes ONLY this leg. The cycle executes nothing until every leg is consented AND the hand-off is requested; your consent commits no money and moves no item by itself."
                evidence={["Your stated want and offer (committed demo fixture)", "Consent window end shown above (demo clock)"]}
                confirmLabel="Consent to my leg"
                onConfirm={() => {
                  run(() => consentLeg(cycle, leg.legIndex));
                  setOwnGateLeg(null);
                }}
                onCancel={() => setOwnGateLeg(null)}
              />
            ) : (
              <div className="cm-row" style={{ marginTop: 6 }}>
                <button type="button" className="cm-button cm-button-primary" onClick={() => setOwnGateLeg(leg.legIndex)}>
                  Consent to my leg (with authorization)
                </button>
              </div>
            )
          ) : (
              <div className="cm-row" style={{ marginTop: 6 }}>
                <button type="button" className="cm-button" onClick={() => run(() => consentLeg(cycle, leg.legIndex))}>
                  {shortGiver} consents (demo advance)
                </button>
                <button type="button" className="cm-button" onClick={() => run(() => refuseLeg(cycle, leg.legIndex))}>
                  {shortGiver} refuses — stop the cycle
                </button>
                <button type="button" className="cm-button" onClick={() => run(() => lapseLeg(cycle, leg.legIndex))}>
                  Let this leg&apos;s consent window lapse
                </button>
              </div>
          )
        ) : null}
        {open && leg.consent === "CONSENTED" ? (
          <div className="cm-row" style={{ marginTop: 6 }}>
            <button type="button" className="cm-button" onClick={() => run(() => withdrawLeg(cycle, leg.legIndex))}>
              {isOwnLeg ? "Withdraw my consent (dropout)" : `${shortGiver} drops out — stop the cycle`}
            </button>
            {!isOwnLeg ? (
              <button type="button" className="cm-button" onClick={() => run(() => refuseLeg(cycle, leg.legIndex))}>
                {shortGiver} changes to a refusal — stop the cycle
              </button>
            ) : null}
          </div>
        ) : null}
      </PermissionGate>
    </div>
  );
}
