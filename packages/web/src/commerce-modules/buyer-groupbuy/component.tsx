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
import { countQuantity, poolParticipantCountOf, poolUnitsOf } from "@unicom/commerce";
import type { CommandExecution, GroupBuyCommandPayload, PrincipalRef } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { FormationGate, InterestedItem, JoinGate, LeaveGate } from "./component-gates.js";
import { LatentDemandPanel } from "./latent-demand.js";
import { FormedGroupBuyPanel } from "./formed-panel.js";
import { LinkedDraftLedger } from "./linking-draft.js";
import { DEMO_GROUP_BUY_POOLS, DEMO_GROUPBUY_BUYER, DEMO_GROUPBUY_PRINCIPALS, GROUPBUY_STATE_LABELS, groupBuyIdOf, openForInterest, participantName, seedGroupbuyDemo, unitsLabel, yourInterestOf } from "./groupbuy-data.js";
import type { GroupBuyKernel } from "./kernel.js";

/** The DEMO merchant id the PLACE_ORDER prefill would carry (DEMO fixture). */
const LINKING_DRAFT_MERCHANT_ID = "merchant-1";

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
  // W2-015 Stage 1: the local DEMO ledger of linked-order drafts created on
  // this surface. NOT kernel truth — the eventual PLACE_ORDER (if the human
  // proceeds) travels through the existing kernel command path under its own
  // idempotency key.
  const [draftLedger] = useState<LinkedDraftLedger>(() => new LinkedDraftLedger());

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
    draftLedger.reset();
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
              <FormedGroupBuyPanel
                host={host}
                aggregate={aggregate}
                interests={interests}
                pool={pool}
                buyerPrincipal={DEMO_GROUPBUY_BUYER}
                draftLedger={draftLedger}
                merchantIdForPrefill={LINKING_DRAFT_MERCHANT_ID}
              />
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

