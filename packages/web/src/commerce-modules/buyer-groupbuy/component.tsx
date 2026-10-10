/**
 * buyer-groupbuy component — the J4 surface (open group buys: join/leave with
 * explicit authorization, interest never a commitment) plus the route split
 * to the J5 latent-demand surface (latent-demand.tsx). KERNEL-DRIVEN since
 * W2-013: the pools are GroupBuy formation aggregates of the commerce kernel;
 * join/leave travel as RECORD_GROUP_BUY_INTEREST / WITHDRAW_GROUP_BUY_INTEREST
 * commands, threshold MONITORING / HELD and the organizer's formation with
 * final terms render from kernel truth (see ./kernel.ts and
 * ./groupbuy-data.ts).
 */
import type { JSX } from "react";

import { useState } from "react";
import { countQuantity, multiplyMoneyByInteger, poolParticipantCountOf, poolUnitsOf } from "@unicom/commerce";
import type { CommandExecution, GroupBuyCommandPayload, GroupBuyInterestRecord, PrincipalRef } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import { LatentDemandPanel } from "./latent-demand.js";
import { DEMO_GROUP_BUY_POOLS, DEMO_GROUPBUY_BUYER, DEMO_GROUPBUY_PRINCIPALS, GROUPBUY_STATE_LABELS, groupBuyIdOf, openForInterest, participantName, seedGroupbuyDemo, unitsLabel, yourInterestOf } from "./groupbuy-data.js";
import type { DemoGroupBuyPool } from "./groupbuy-data.js";
import type { GroupBuyKernel } from "./kernel.js";

export default function BuyerGroupbuyComponent({ host }: CommerceModuleProps): JSX.Element {
  if (host.currentPath.startsWith("/commerce/buyer/group-buy/latent-demand")) {
    return <LatentDemandPanel host={host} />;
  }
  return <GroupBuyPanel host={host} />;
}

function GroupBuyPanel({ host }: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  const [kernel, setKernel] = useState<GroupBuyKernel>(() => seedGroupbuyDemo());
  const [gate, setGate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);

  const interestedCount = DEMO_GROUP_BUY_POOLS.filter((pool) => yourInterestOf(kernel, pool.poolId) !== null).length;

  const run = (actor: PrincipalRef, payload: GroupBuyCommandPayload): void => {
    void (async () => {
      const outcome = await kernel.execute(actor, payload);
      setLastOutcome(outcome);
      if (outcome.status === "REJECTED") {
        setError(`Honest rejection from the commerce kernel: ${outcome.reason.detail} — the command changed nothing.`);
      } else {
        setError(null);
      }
    })();
  };

  const resetDemo = (): void => {
    setKernel(seedGroupbuyDemo());
    setGate(null);
    setError(null);
    setLastOutcome(null);
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J4 · Group buys — discover, join, leave</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Team up with other buyers toward a group threshold. The law of this surface:{" "}
          <strong>interest is never a commitment</strong>. Every pool shows its threshold, deadline,
          eligibility and the exact terms a future commitment would carry — before you express
          anything. Formation runs on the commerce kernel: a threshold-met pool is HELD until the
          organizer forms the deal with final terms (the second confirmation) — never automatic,
          and a withdrawal before it honestly drops the pool back to threshold monitoring.
        </p>
        <p className="cm-card-sub">
          You currently hold interest in {interestedCount} of {DEMO_GROUP_BUY_POOLS.length} pools.
        </p>
      </section>

      <section className="cm-card" aria-label="Group buy availability honesty">
        <h2 className="cm-card-title">What is real here, and what is not</h2>
        <TermLine
          label="Real (kernel-driven)"
          value="Formation. Interest, withdrawal, threshold MONITORING, HELD pools and the formation with final terms run through the commerce kernel's GroupBuy formation aggregate, imported from @unicom/commerce — every pool state and roster below is kernel truth."
        />
        <TermLine
          label="Demo-only"
          value="The pools, the participant identities and the seeded shares. They arrive as committed demo fixtures (DEMO-labelled) and open through the kernel's own command path."
        />
        <TermLine
          label="Wired (new this phase)"
          value="Executed by the commerce kernel. Your interest travels as a RECORD_GROUP_BUY_INTEREST command carrying your consent terms; the kernel holds a threshold-met pool until the organizer's explicit FORM_GROUP_BUY freezes the final terms (exact group price, exact pool value) and the consenting-only roster. No group-buy commitment is ever created by this aggregate — a commitment would exist only on the commerce planes, after formation."
        />
      </section>

      {error ? <p className="cm-blocked-reason" role="alert">{error}</p> : null}

      {DEMO_GROUP_BUY_POOLS.map((pool) => {
        const aggregate = kernel.groupBuy(pool.poolId);
        if (aggregate === null) return null;
        const interests = kernel.interestsOf(pool.poolId);
        const units = poolUnitsOf(interests);
        const participants = poolParticipantCountOf(interests);
        const yourInterest = yourInterestOf(kernel, pool.poolId);
        const thresholdMet = aggregate.state === "HELD" || aggregate.state === "FORMED";
        const organizer = DEMO_GROUPBUY_PRINCIPALS[pool.organizerId]!;
        return (
          <section key={pool.poolId} className="cm-card" data-testid={`cm-groupbuy-${pool.poolId}`}>
            <div className="cm-row">
              <h2 className="cm-card-title">{pool.title}</h2>
              <DemoTag />
              {aggregate.state === "FORMED" ? (
                <span className="cm-chip cm-chip-ok">formed — final terms frozen</span>
              ) : thresholdMet ? (
                <span className="cm-chip cm-chip-warn">threshold met — formation pending</span>
              ) : (
                <span className="cm-chip cm-chip-ok">
                  {units}/{pool.threshold.minimumUnits} toward the threshold
                </span>
              )}
            </div>
            <TermLine
              label="Group threshold"
              value={`${pool.threshold.minimumUnits} units · at least ${pool.threshold.minimumParticipants} studios (both must be met)`}
            />
            <TermLine label="Deadline" value={pool.deadlineLabel} />
            <TermLine label="Eligibility" value={pool.eligibility} />
            <TermLine
              label="Price at threshold"
              value={`${moneyText(pool.proposedUnitPrice)} per ${pool.unitNoun} (vs ${moneyText(pool.listUnitPrice)} list, demo)`}
            />
            <TermLine label="Consent terms" value={pool.consentTerms} />
            <TermLine label="Commitment terms (what a REAL commitment would mean)" value={pool.commitmentTerms} />
            <TermLine label="Organizer note" value={pool.organizerNote} />
            <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
            <TermLine
              label="Pool (kernel)"
              value={`${unitsLabel(pool, units)} from ${participants} consenting studios · revision ${aggregate.revision} · organizer ${participantName(organizer)} (demo fixture)`}
            />

            {aggregate.state === "FORMED" && aggregate.formation ? (
              <div className="cm-state-item" data-testid="cm-groupbuy-formed" style={{ marginTop: 10, borderColor: "var(--cm-ok)" }}>
                <div className="cm-row">
                  <span className="cm-state-item-label">Deal FORMED — the second confirmation happened with final terms</span>
                  <span className="cm-chip cm-chip-ok">FORMED</span>
                </div>
                <TermLine label="Final group price (frozen)" value={`${moneyText(aggregate.formation.groupPrice)} per ${pool.unitNoun}`} />
                <TermLine
                  label="Pool value (exact, kernel-computed)"
                  value={`${moneyText(aggregate.formation.poolValue)} — group price × ${unitsLabel(pool, poolUnitsOf(interests))}, frozen at formation`}
                />
                <TermLine
                  label="Consenting-only roster (frozen)"
                  value={aggregate.participants
                    .map((share) => `${participantName(share.participantRef)} · ${unitsLabel(pool, share.quantity.units)}`)
                    .join(" / ")}
                />
                <p className="cm-state-item-detail">
                  Interest was never a commitment; formation with these final terms WAS the second
                  confirmation. Withdrawal closed the moment the deal formed — before it, any
                  participant could withdraw any time. No money moved: an actual commitment would
                  live on the commerce planes, and this kernel aggregate never creates one.
                </p>
              </div>
            ) : null}

            <PermissionGate host={host} permission="groupbuy.express-interest">
              {gate === `join:${pool.poolId}` && yourInterest === null ? (
                <JoinGate
                  pool={pool}
                  units={units}
                  onCancel={() => setGate(null)}
                  onConfirm={() => {
                    run(DEMO_GROUPBUY_BUYER, {
                      type: "RECORD_GROUP_BUY_INTEREST",
                      groupBuyId: groupBuyIdOf(pool.poolId),
                      participantRef: DEMO_GROUPBUY_BUYER,
                      quantity: countQuantity(pool.yourShareUnits),
                      consentTerms: pool.consentTerms,
                    });
                    setGate(null);
                  }}
                />
              ) : gate === `leave:${pool.poolId}` && yourInterest !== null ? (
                <LeaveGate
                  pool={pool}
                  onCancel={() => setGate(null)}
                  onConfirm={() => {
                    run(DEMO_GROUPBUY_BUYER, {
                      type: "WITHDRAW_GROUP_BUY_INTEREST",
                      groupBuyId: groupBuyIdOf(pool.poolId),
                      participantRef: DEMO_GROUPBUY_BUYER,
                    });
                    setGate(null);
                  }}
                />
              ) : yourInterest !== null ? (
                <InterestedItem
                  pool={pool}
                  interest={yourInterest}
                  formationRevision={aggregate.revision}
                  frozen={aggregate.state === "FORMED"}
                  lastOutcome={lastOutcome}
                  onWithdraw={() => setGate(`leave:${pool.poolId}`)}
                />
              ) : openForInterest(aggregate.state) ? (
                <button
                  type="button"
                  className="cm-button cm-button-primary"
                  style={{ marginTop: 10 }}
                  onClick={() => setGate(`join:${pool.poolId}`)}
                >
                  Express interest (with authorization)
                </button>
              ) : (
                <p className="cm-state-item-detail">
                  This pool is {aggregate.state} — interest is not being taken on it any more.
                </p>
              )}
            </PermissionGate>

            <PermissionGate host={host} permission="groupbuy.review-proposal">
              {aggregate.state === "HELD" ? (
                gate === `form:${pool.poolId}` ? (
                  <FormationGate
                    pool={pool}
                    units={units}
                    participants={participants}
                    onCancel={() => setGate(null)}
                    onConfirm={() => {
                      run(organizer, {
                        type: "FORM_GROUP_BUY",
                        groupBuyId: groupBuyIdOf(pool.poolId),
                        groupPrice: pool.proposedUnitPrice,
                      });
                      setGate(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="cm-button"
                    style={{ marginTop: 10 }}
                    onClick={() => setGate(`form:${pool.poolId}`)}
                  >
                    {participantName(organizer)} forms the deal with final terms (demo advance)
                  </button>
                )
              ) : null}
            </PermissionGate>
          </section>
        );
      })}

      <section className="cm-card" aria-label="Latent demand hand-off">
        <h2 className="cm-card-title">No pool for what you need?</h2>
        <p className="cm-card-sub">
          If enough buyers would buy something that no seller currently offers as a group deal, you
          can propose one — the merchant review side is a separate lane&apos;s surface.
        </p>
        <button
          type="button"
          className="cm-button"
          onClick={() => host.navigate("/commerce/buyer/group-buy/latent-demand")}
        >
          Propose a group deal (J5)
        </button>
      </section>

      <div className="cm-row">
        <button type="button" className="cm-button" onClick={resetDemo}>
          Reset the demo kernel (fresh pools)
        </button>
      </div>
    </div>
  );
}

function JoinGate({
  pool,
  units,
  onCancel,
  onConfirm,
}: {
  readonly pool: DemoGroupBuyPool;
  readonly units: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  return (
    <KernelCommitmentGate
      title="Authorize recording your interest (this is NOT a commitment)"
      terms={[
        { label: "Pool", value: pool.title },
        { label: "Threshold & deadline", value: `${pool.threshold.minimumUnits} units by ${pool.deadlineLabel}` },
        { label: "Price at threshold", value: `${moneyText(pool.proposedUnitPrice)} per ${pool.unitNoun} (vs ${moneyText(pool.listUnitPrice)} list, demo)` },
        { label: "Your share", value: `${unitsLabel(pool, pool.yourShareUnits)} (demo fixture share) — recorded at ${units + pool.yourShareUnits}/${pool.threshold.minimumUnits} units` },
        { label: "What interest means", value: pool.consentTerms },
        { label: "What a commitment would mean (later, separately)", value: pool.commitmentTerms },
      ]}
      consequence="Your studio joins the interested list only. The RECORD_GROUP_BUY_INTEREST command travels to the commerce kernel with your consent terms and creates no commitment. If the threshold is later met AND the deal forms, you would be asked to confirm a SECOND time against the final terms — declining then costs nothing."
      evidence={[
        `Organizer note: ${pool.organizerNote}`,
        "Pool terms above (demo fixtures)",
        "Kernel threshold law: BOTH the studio count and the unit count must be met before the pool is HELD",
      ]}
      confirmLabel="Record my interest (not a commitment)"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function LeaveGate({
  pool,
  onCancel,
  onConfirm,
}: {
  readonly pool: DemoGroupBuyPool;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  return (
    <KernelCommitmentGate
      title="Withdraw your interest"
      terms={[
        { label: "Pool", value: pool.title },
        { label: "Effect", value: "Your studio leaves the interested list. No other participant is affected; nothing was ever owed." },
      ]}
      consequence="The WITHDRAW_GROUP_BUY_INTEREST command removes your share from the kernel's live pool — a HELD pool that falls back below the threshold honestly returns to threshold MONITORING. If the pool still reaches its threshold, it can form without you."
      evidence={["Your kernel interest record above (participant, share, consent terms)"]}
      confirmLabel="Withdraw interest"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function FormationGate({
  pool,
  units,
  participants,
  onCancel,
  onConfirm,
}: {
  readonly pool: DemoGroupBuyPool;
  readonly units: number;
  readonly participants: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  const organizer = participantName(DEMO_GROUPBUY_PRINCIPALS[pool.organizerId]!);
  return (
    <KernelCommitmentGate
      title="The organizer's explicit formation (the second confirmation, with final terms)"
      terms={[
        { label: "Pool", value: pool.title },
        { label: "Final group price", value: `${moneyText(pool.proposedUnitPrice)} per ${pool.unitNoun} (exact, frozen at formation)` },
        { label: "Pool value at formation", value: `${moneyText(multiplyMoneyByInteger(pool.proposedUnitPrice, units))} — group price × ${unitsLabel(pool, units)} (kernel-computed)` },
        { label: "Consenting-only roster", value: `${participants} live consenting studios — non-consenting and withdrawn studios are never enrolled` },
        { label: "What formation freezes", value: "The final terms (exact group price, exact pool value) and the roster of consenting-only participants. Interest was never a commitment — THIS is the second confirmation." },
      ]}
      consequence={`Confirming submits the FORM_GROUP_BUY command as ${organizer} (demo advance): the kernel transitions the HELD pool to FORMED and freezes the final terms and the consenting-only roster. No money moves — an actual commitment would live on the commerce planes, and this kernel aggregate never creates one.`}
      evidence={[
        "Kernel state HELD at the current revision (threshold met — both studios and units)",
        "Live consenting interests rendered above (kernel truth)",
      ]}
      confirmLabel="Form the deal with final terms (as the organizer, demo advance)"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function InterestedItem({
  pool,
  interest,
  formationRevision,
  frozen,
  lastOutcome,
  onWithdraw,
}: {
  readonly pool: DemoGroupBuyPool;
  readonly interest: GroupBuyInterestRecord;
  readonly formationRevision: number;
  readonly frozen: boolean;
  readonly lastOutcome: CommandExecution | null;
  readonly onWithdraw: () => void;
}): JSX.Element {
  return (
    <div className="cm-state-item" style={{ marginTop: 10 }} data-testid="cm-groupbuy-interested">
      <div className="cm-row">
        <span className="cm-state-item-label">Your interest is recorded</span>
        <LifecycleStateChip state="OFFERED" />
        <span className="cm-chip cm-chip-unknown">interest — not a commitment</span>
      </div>
      <p className="cm-state-item-detail">
        Kernel interest record: {unitsLabel(pool, interest.quantity.units)} · recorded {interest.recordedAt} (demo clock) ·
        revision {interest.revision} of the pool&apos;s revision {formationRevision}. Withdraw any
        time before the deal forms; withdrawing interest cancels nothing else (there is nothing
        else to cancel).
      </p>
      {lastOutcome && lastOutcome.status === "EXECUTED" ? (
        <TermLine
          label="Kernel receipt"
          value={`command ${lastOutcome.receipt.commandId} · idempotency key ${lastOutcome.receipt.idempotencyKey} · executed ${lastOutcome.receipt.executedAt} · resulting revision ${lastOutcome.receipt.resultingRevision}`}
        />
      ) : null}
      {frozen ? (
        <p className="cm-state-item-detail">
          Your share is frozen into the formed deal&apos;s roster — withdrawal closed when the deal
          formed (the second confirmation).
        </p>
      ) : (
        <button type="button" className="cm-button" onClick={onWithdraw}>
          Withdraw my interest
        </button>
      )}
    </div>
  );
}
