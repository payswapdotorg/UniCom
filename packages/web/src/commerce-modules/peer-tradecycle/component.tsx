/**
 * peer-tradecycle component — the J9 surface, KERNEL-DRIVEN since W2-013:
 * the discovered 3-hop cycle (fixture candidates, DEMO-labelled) is opened as
 * a TradeCycleExecution aggregate of the commerce kernel; per-leg consent /
 * refusal / withdrawal / expiry and the atomic execution all travel as typed
 * kernel commands (see ./kernel.ts). CONSENTED / REFUSED / STOPPED_REFUSAL
 * and "No other leg was committed" below are kernel outcomes rendered from
 * the aggregate — not mirrored local text.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommandExecution, PrincipalRef, TradeCycleCommandPayload } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { DemoTag, TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import { LegCard } from "./leg-cards.js";
import {
  CYCLE_A,
  CYCLE_B,
  DEMO_TRADECYCLE_INITIATOR,
  TRADECYCLE_CONSENT_WINDOW_ENDS,
  TRADECYCLE_STATE_LABELS,
  candidateOf,
  kernelCycleOf,
  participant,
  seedTradecycleDemo,
} from "./tradecycle-data.js";
import type { TradecycleKernel } from "./kernel.js";

function actorOf(payload: TradeCycleCommandPayload, initiator: PrincipalRef): PrincipalRef {
  switch (payload.type) {
    case "AUTHORIZE_TRADE_CYCLE_LEG":
      return payload.authorizingRef;
    case "REFUSE_TRADE_CYCLE_LEG":
      return payload.refusingRef;
    case "WITHDRAW_TRADE_CYCLE_LEG":
      return payload.withdrawingRef;
    default:
      return initiator;
  }
}

export default function PeerTradecycleComponent({ host }: CommerceModuleProps): JSX.Element {
  const [kernel, setKernel] = useState<TradecycleKernel>(() => seedTradecycleDemo());
  const [cycleId, setCycleId] = useState<string>(CYCLE_A.cycleId);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);
  const [ownGateLeg, setOwnGateLeg] = useState<number | null>(null);
  const [executeGateOpen, setExecuteGateOpen] = useState(false);

  const cycle = kernel.cycle(cycleId);
  if (cycle === null) {
    return (
      <section className="cm-stack">
        <div className="cm-card" role="status" aria-live="polite" data-testid="cm-loading">
          <h1 className="cm-card-title">J9 · Trade cycles — multi-hop swaps</h1>
          <p className="cm-card-sub">Opening the fixture candidate through the commerce kernel…</p>
        </div>
      </section>
    );
  }
  const candidate = candidateOf(cycle.tradeCycleId) ?? CYCLE_A;

  const run = (payload: TradeCycleCommandPayload): void => {
    void (async () => {
      const outcome = await kernel.execute(actorOf(payload, DEMO_TRADECYCLE_INITIATOR), payload);
      setLastOutcome(outcome);
      if (outcome.status === "REJECTED") {
        setError(`Honest rejection from the commerce kernel: ${outcome.reason.detail} — the command changed nothing.`);
      } else {
        setError(null);
      }
    })();
  };

  const rePlan = (): void => {
    void (async () => {
      const outcome = await kernel.execute(DEMO_TRADECYCLE_INITIATOR, {
        type: "OPEN_TRADE_CYCLE",
        cycle: kernelCycleOf(CYCLE_B),
      });
      setLastOutcome(outcome);
      if (outcome.status === "REJECTED") {
        setError(`Honest rejection from the commerce kernel: ${outcome.reason.detail}`);
      } else {
        setCycleId(CYCLE_B.cycleId);
        setError(null);
      }
    })();
  };

  const resetDemo = (): void => {
    setKernel(seedTradecycleDemo());
    setCycleId(CYCLE_A.cycleId);
    setError(null);
    setLastOutcome(null);
    setOwnGateLeg(null);
    setExecuteGateOpen(false);
  };

  const stopped = cycle.state === "STOPPED_REFUSAL" || cycle.state === "STOPPED_WITHDRAWAL" || cycle.state === "STOPPED_EXPIRY";
  const noLegCommitted = cycle.legs.every((leg) => leg.consentState !== "COMMITTED");

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
          label="Real (kernel-driven)"
          value="Execution. Per-leg consent, refusal, withdrawal, window expiry and the atomic commit run through the commerce kernel's TradeCycle execution aggregate, imported from @unicom/commerce: every state and chip below is kernel truth."
        />
        <TermLine
          label="Demo-only"
          value="The candidate cycles and the participant identities. Discovery (bounded search over the offer graph) remains the agent lane's, which the web host cannot import — candidates arrive as committed demo fixtures and are validated by the kernel's cycle-shape laws when they open."
        />
        <TermLine
          label="Wired (new this phase)"
          value="Executed by the commerce kernel. Each consent travels as an AUTHORIZE_TRADE_CYCLE_LEG command carrying its per-leg authorization reference; with every leg authorized, EXECUTE_TRADE_CYCLE commits all legs atomically — all or none. Attribution by anyone other than the giver holds the leg UNKNOWN, never fails it."
        />
      </section>

      <section className="cm-card" aria-label="Discovered cycle" data-testid="cm-tradecycle-cycle">
        <div className="cm-row">
          <h2 className="cm-card-title">{candidate.label}</h2>
          <DemoTag />
          {stopped ? <LifecycleStateChip state="DENIED" /> : null}
          {cycle.state === "COMMITTED" ? <span className="cm-chip cm-chip-ok">COMMITTED — executed by the commerce kernel</span> : null}
        </div>
        <TermLine label="Cycle" value={`${cycle.tradeCycleId} · ${cycle.legs.length} hops · ${cycle.legs.length} participants · mode ${cycle.executionMode}`} />
        <TermLine label="Status (kernel)" value={TRADECYCLE_STATE_LABELS[cycle.state]} />
        <TermLine label="Kernel revision" value={`revision ${cycle.revision} · commands journaled with idempotency receipts`} />
        {error ? <p className="cm-blocked-reason">{error}</p> : null}

        {stopped ? (
          <div className="cm-state-item" data-testid="cm-tradecycle-stopped" style={{ borderColor: "var(--cm-warn)" }}>
            <div className="cm-row">
              <span className="cm-state-item-label">Cycle stopped — {cycle.state}</span>
              <LifecycleStateChip state="DENIED" />
            </div>
            <p className="cm-state-item-detail">
              {noLegCommitted ? (
                <>
                  <strong>No other leg was committed.</strong> Consents already recorded on other legs
                  commit nothing now: this cycle is ATOMIC, so execution requires every leg — a stopped
                  cycle moves no items and owes nothing. Each participant keeps their own goods.
                </>
              ) : (
                <>
                  Stopped with committed legs on record — the kernel state above is the authority on
                  which legs committed.
                </>
              )}
            </p>
            {candidate.alternativeParticipantId !== null ? (
              <p className="cm-state-item-detail">
                Re-plan candidate available: {participant(candidate.alternativeParticipantId)} can replace
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
          {candidate.displayOrder.map((kernelLegIndex, displayPosition) => {
            const leg = cycle.legs.find((one) => one.legIndex === kernelLegIndex);
            if (!leg) return null;
            return (
              <LegCard
                key={leg.legIndex}
                displayPosition={displayPosition}
                leg={leg}
                cycle={cycle}
                candidate={candidate}
                consentWindowEnds={TRADECYCLE_CONSENT_WINDOW_ENDS}
                host={host}
                ownGateLeg={ownGateLeg}
                setOwnGateLeg={setOwnGateLeg}
                run={run}
              />
            );
          })}
        </div>

        {stopped ? (
          candidate.alternativeParticipantId !== null ? (
            <button
              type="button"
              className="cm-button cm-button-primary"
              style={{ marginTop: 10 }}
              onClick={rePlan}
            >
              Re-plan with {participant(candidate.alternativeParticipantId)} (fresh consents for every leg)
            </button>
          ) : null
        ) : null}
        <div className="cm-row" style={{ marginTop: 10 }}>
          <button type="button" className="cm-button" onClick={resetDemo}>
            Reset the demo kernel (fresh Cycle A)
          </button>
        </div>
      </section>

      {cycle.state === "ALL_LEGS_AUTHORIZED" ? (
        executeGateOpen ? (
          <KernelCommitmentGate
            title="Execute the cycle through the commerce kernel (terms, consequence, evidence)"
            terms={[
              { label: "Cycle", value: `${cycle.tradeCycleId} — every one of the ${cycle.legs.length} legs carries its giver's recorded kernel authorization` },
              { label: "What would execute", value: "Each leg's item moves from its giver to its receiver — ATOMIC mode: the kernel commits every leg together or none, and no partial execution path exists." },
              { label: "Recourse", value: "A stop before this point commits nothing (the stop states above are kernel outcomes). Recourse after commit follows the trust lane's dispute flow." },
            ]}
            consequence="Confirming submits the EXECUTE_TRADE_CYCLE command to the commerce kernel. In ATOMIC mode the kernel transitions the cycle to COMMITTED and every leg to COMMITTED together — there is no partial-commit state to reach."
            evidence={[
              "Per-leg kernel authorization records above (each by the giving participant only)",
              "Kernel state ALL_LEGS_AUTHORIZED at the current revision",
            ]}
            confirmLabel="Execute the cycle (all legs, atomically)"
            onConfirm={() => {
              run({ type: "EXECUTE_TRADE_CYCLE", cycleId: cycle.tradeCycleId });
              setExecuteGateOpen(false);
            }}
            onCancel={() => setExecuteGateOpen(false)}
          />
        ) : (
          <section className="cm-card" data-testid="cm-tradecycle-execute">
            <h3 className="cm-card-title">All legs authorized — execute through the commerce kernel</h3>
            <p className="cm-card-sub">
              Every leg carries its giver&apos;s recorded authorization. The next step submits the
              EXECUTE_TRADE_CYCLE command: the kernel commits all {cycle.legs.length} legs atomically
              (all or none) and journals the receipt.
            </p>
            <button type="button" className="cm-button cm-button-primary" onClick={() => setExecuteGateOpen(true)}>
              Execute the cycle through the commerce kernel (with authorization)
            </button>
          </section>
        )
      ) : null}

      {cycle.state === "COMMITTED" ? (
        <section className="cm-card" style={{ borderColor: "var(--cm-ok)" }} data-testid="cm-tradecycle-committed">
          <div className="cm-row">
            <h3 className="cm-card-title">Cycle COMMITTED — executed by the commerce kernel</h3>
            <span className="cm-chip cm-chip-ok">COMMITTED</span>
          </div>
          <p className="cm-card-sub">
            The kernel executed the ATOMIC commit: every leg is COMMITTED and each item moves from its
            giver to its receiver. The per-leg authorization records above are the kernel&apos;s own
            evidence (who authorized, under which reference, when).
          </p>
          {lastOutcome && lastOutcome.status === "EXECUTED" ? (
            <TermLine
              label="Kernel receipt"
              value={`command ${lastOutcome.receipt.commandId} · idempotency key ${lastOutcome.receipt.idempotencyKey} · executed ${lastOutcome.receipt.executedAt} · resulting revision ${lastOutcome.receipt.resultingRevision}`}
            />
          ) : null}
          <TermLine
            label="Demo boundary"
            value="The execution is deterministic in-memory kernel truth — participants and items are DEMO fixtures and no live provider, payment or shipment was contacted."
          />
        </section>
      ) : null}
    </div>
  );
}
