/**
 * J5 buyer-side latent-demand surface, KERNEL-DRIVEN since W2-013: recruit
 * only CONSENTING demo participants, propose merchant terms through an
 * explicit gate, then watch the merchant's accept / counter / reject and the
 * formation flow — all as typed commands against the commerce kernel's
 * GroupBuy formation aggregate (see ./kernel.ts + ./groupbuy-data.ts).
 * Sending opens the proposal (OPEN_GROUP_BUY_PROPOSAL) and records the three
 * consenting studios' interests; the merchant's deterministic review is a
 * fixture-scripted DECIDE_GROUP_BUY_PROPOSAL by the organizer; your share
 * completes the threshold (MONITORING → HELD); the organizer's explicit
 * FORM_GROUP_BUY with final terms is the second confirmation and freezes the
 * consenting-only roster. The merchant review side belongs to W3's lane.
 *
 * The review-state panels live in ./latent-demand-parts.tsx and the
 * threshold-pool gates + FORMED panel in ./latent-demand-pool.tsx (the
 * 400-effective-line law; pure code motion).
 */
import type { JSX } from "react";

import { useState } from "react";
import { countQuantity, multiplyMoneyByInteger, poolParticipantCountOf, poolUnitsOf } from "@unicom/commerce";
import type { CommandExecution, GroupBuyCommandPayload, PrincipalRef } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import {
  AcceptedProposalPanel,
  ConsentingParticipantsPanel,
  CounteredProposalPanel,
  OfferedProposalPanel,
  RejectedProposalPanel,
  SendProposalGate,
} from "./latent-demand-parts.js";
import { FormedDealPanel, LatentFormGate, LatentShareGate, YourLatentInterestItem } from "./latent-demand-pool.js";
import {
  DEMO_GROUPBUY_BUYER,
  DEMO_GROUPBUY_PRINCIPALS,
  GROUPBUY_STATE_LABELS,
  LATENT_DEMAND_CONSENTING_SHARES,
  LATENT_DEMAND_PROPOSAL_ID,
  LATENT_DEMAND_TERMS,
  LATENT_DEMAND_UNITS,
  LATENT_DEMAND_YOUR_SHARE_UNITS,
  MERCHANT_TARGETS,
  groupBuyIdOf,
  kernelProposalOf,
  merchantTargetOf,
  openForInterest,
  participantName,
  yourInterestOf,
} from "./groupbuy-data.js";
import { GroupBuyKernel } from "./kernel.js";

export function LatentDemandPanel({ host }: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  const [kernel, setKernel] = useState<GroupBuyKernel>(() => new GroupBuyKernel());
  const [merchant, setMerchant] = useState<string>(MERCHANT_TARGETS[0]!.name);
  const [gate, setGate] = useState<"send" | "share" | "withdraw" | "form" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);

  const aggregate = kernel.groupBuy(LATENT_DEMAND_PROPOSAL_ID);
  const sent = aggregate !== null;
  const interests = kernel.interestsOf(LATENT_DEMAND_PROPOSAL_ID);
  const units = poolUnitsOf(interests);
  const participants = poolParticipantCountOf(interests);
  const yourInterest = yourInterestOf(kernel, LATENT_DEMAND_PROPOSAL_ID);
  const target = merchantTargetOf(merchant);
  const organizer = sent && target ? DEMO_GROUPBUY_PRINCIPALS[target.id]! : null;
  const poolLive = aggregate !== null && (aggregate.state === "MONITORING" || aggregate.state === "HELD" || aggregate.state === "FORMED");
  const formed = aggregate !== null && aggregate.state === "FORMED";

  const run = async (steps: readonly { readonly actor: PrincipalRef; readonly payload: GroupBuyCommandPayload }[]): Promise<void> => {
    let last: CommandExecution | null = null;
    for (const step of steps) {
      const outcome = await kernel.execute(step.actor, step.payload);
      if (outcome.status === "REJECTED") {
        setLastOutcome(outcome);
        setError(`Honest rejection from the commerce kernel: ${outcome.reason.detail} — the command changed nothing.`);
        return;
      }
      last = outcome;
    }
    setLastOutcome(last);
    setError(null);
  };

  const sendProposal = (): void => {
    if (target === null) return;
    const steps: { readonly actor: PrincipalRef; readonly payload: GroupBuyCommandPayload }[] = [
      {
        actor: DEMO_GROUPBUY_BUYER,
        payload: {
          type: "OPEN_GROUP_BUY_PROPOSAL",
          groupBuy: kernelProposalOf(target),
        },
      },
    ];
    for (const share of LATENT_DEMAND_CONSENTING_SHARES) {
      steps.push({
        actor: DEMO_GROUPBUY_PRINCIPALS[share.participantId]!,
        payload: {
          type: "RECORD_GROUP_BUY_INTEREST",
          groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
          participantRef: DEMO_GROUPBUY_PRINCIPALS[share.participantId]!,
          quantity: countQuantity(share.units),
          consentTerms: share.consentNote,
        },
      });
    }
    void run(steps);
  };

  const revealMerchantReview = (): void => {
    if (target === null || organizer === null || aggregate === null) return;
    const payload: GroupBuyCommandPayload =
      target.behavior === "accepts"
        ? { type: "DECIDE_GROUP_BUY_PROPOSAL", groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID), trigger: "ACCEPT" }
        : target.behavior === "counters"
          ? {
              type: "DECIDE_GROUP_BUY_PROPOSAL",
              groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
              trigger: "COUNTER",
              counterTerms: target.counterTerms,
            }
          : {
              type: "DECIDE_GROUP_BUY_PROPOSAL",
              groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
              trigger: "REJECT",
              rejectionReason: target.rejectionReason ?? "Declined (demo fixture reason).",
            };
    void run([{ actor: organizer, payload }]);
  };

  const acceptCounter = (): void => {
    void run([
      {
        actor: DEMO_GROUPBUY_BUYER,
        payload: { type: "DECIDE_GROUP_BUY_PROPOSAL", groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID), trigger: "ACCEPT_COUNTER" },
      },
    ]);
  };

  const recordYourShare = (): void => {
    void run([
      {
        actor: DEMO_GROUPBUY_BUYER,
        payload: {
          type: "RECORD_GROUP_BUY_INTEREST",
          groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
          participantRef: DEMO_GROUPBUY_BUYER,
          quantity: countQuantity(LATENT_DEMAND_YOUR_SHARE_UNITS),
          consentTerms:
            "Your interest is shared with the organizer only. It is NOT a commitment: nothing is owed, charged or ordered while you are merely interested.",
        },
      },
    ]);
  };

  const withdrawYourShare = (): void => {
    void run([
      {
        actor: DEMO_GROUPBUY_BUYER,
        payload: {
          type: "WITHDRAW_GROUP_BUY_INTEREST",
          groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
          participantRef: DEMO_GROUPBUY_BUYER,
        },
      },
    ]);
  };

  const formTheDeal = (): void => {
    if (organizer === null || aggregate === null) return;
    const groupPrice = aggregate.counterTerms ? aggregate.counterTerms.unitPrice : LATENT_DEMAND_TERMS.proposedUnitPrice;
    void run([
      {
        actor: organizer,
        payload: { type: "FORM_GROUP_BUY", groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID), groupPrice },
      },
    ]);
  };

  const startNewRound = (): void => {
    setKernel(new GroupBuyKernel());
    setGate(null);
    setError(null);
    setLastOutcome(null);
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J5 · Propose a group deal (latent demand)</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Enough buyers would buy something no seller currently offers as a group deal — so propose
          one. Laws on this surface: only CONSENTING participants are recruited (the demo fixture
          set includes a studio that declined, visibly excluded), the proposal carries explicit
          merchant terms, and no participant — including you — is enrolled silently. The proposal
          and every state after it run through the commerce kernel&apos;s GroupBuy formation
          aggregate; the merchant replies are deterministic fixture-scripted organizer commands
          (the same kernel laws the merchant review desk uses — that surface is W3&apos;s).
        </p>
      </section>

      <section className="cm-card" aria-label="Latent demand availability honesty">
        <h2 className="cm-card-title">What is real here, and what is not</h2>
        <TermLine
          label="Real (kernel-driven)"
          value="Formation. The proposal opens as a GroupBuy aggregate of the commerce kernel; the three consenting studios' interests, the merchant's accept/counter/reject, your share, threshold MONITORING → HELD and the formation with final terms are all typed kernel commands — every state below is kernel truth."
        />
        <TermLine
          label="Demo-only"
          value="The studios, the merchants and their deterministic review behaviors. They arrive as committed demo fixtures (DEMO-labelled); the merchant's reply is a fixture-scripted organizer command, not a live merchant."
        />
        <TermLine
          label="Wired (new this phase)"
          value="Executed by the commerce kernel. Interest is never commitment; a threshold-met pool is HELD until the organizer's explicit formation with final terms (the second confirmation) freezes the exact group price, the exact pool value and the consenting-only roster. Every participant can withdraw until that moment; no group-buy commitment is ever created by this aggregate."
        />
      </section>

      <ConsentingParticipantsPanel />

      <section className="cm-card" aria-label="Merchant terms">
        <h2 className="cm-card-title">Proposed merchant terms</h2>
        <div className="cm-stack">
          <TermLine label="Volume" value={`${LATENT_DEMAND_UNITS} boxes of A3 recycled card`} />
          <TermLine label="Target group price" value="11.20 USD per box (vs 12.75 list — the exact savings a merchant would weigh)" />
          <TermLine label="Pool closes by" value={LATENT_DEMAND_TERMS.windowClosesLabel} />
          <TermLine label="Your studio's share" value="Your interest is not a commitment — you confirm a second time if the merchant accepts" />
          <TermLine
            label="40-box reference cost at target price"
            value={`${moneyText(multiplyMoneyByInteger(LATENT_DEMAND_TERMS.proposedUnitPrice, 40))} (exact math via the commerce runtime)`}
          />
          {sent ? (
            <TermLine label="Sent to" value={`${merchant} (demo fixture organizer — the reply below is fixture-scripted)`} />
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-fg-subtle)" }}>
              <span>Send the proposal to</span>
              <select aria-label="Proposal target merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)}>
                {MERCHANT_TARGETS.map((option) => (
                  <option key={option.name} value={option.name}>{option.name}</option>
                ))}
              </select>
            </label>
          )}
          {!sent ? (
            <button
              type="button"
              className="cm-button cm-button-primary"
              onClick={() => setGate("send")}
            >
              Review proposal before sending
            </button>
          ) : null}
        </div>
      </section>

      {error ? <p className="cm-blocked-reason" role="alert">{error}</p> : null}

      <PermissionGate host={host} permission="groupbuy.express-interest">
        {!sent && gate === "send" ? (
          <SendProposalGate
            merchant={merchant}
            onConfirm={() => {
              sendProposal();
              setGate(null);
            }}
            onCancel={() => setGate(null)}
          />
        ) : null}
      </PermissionGate>

      {aggregate !== null && aggregate.state === "PENDING" ? (
        <OfferedProposalPanel
          merchant={merchant}
          aggregate={aggregate}
          units={units}
          participants={participants}
          host={host}
          onReveal={revealMerchantReview}
        />
      ) : null}

      {aggregate !== null && aggregate.state === "COUNTERED" && target !== null ? (
        <CounteredProposalPanel
          target={target}
          aggregate={aggregate}
          host={host}
          onAcceptCounter={acceptCounter}
        />
      ) : null}

      {aggregate !== null && aggregate.state === "MONITORING" && target !== null ? (
        <AcceptedProposalPanel target={target} aggregate={aggregate} />
      ) : null}

      {aggregate !== null && (aggregate.state === "REJECTED" || aggregate.state === "EXPIRED") && target !== null ? (
        <RejectedProposalPanel target={target} aggregate={aggregate} />
      ) : null}

      {poolLive && aggregate !== null && target !== null ? (
        <section className="cm-card" data-testid="cm-latent-pool" aria-label="Threshold pool, kernel truth">
          <div className="cm-row">
            <h2 className="cm-card-title">Threshold pool — kernel truth</h2>
            <DemoTag />
            {aggregate.state === "HELD" ? (
              <span className="cm-chip cm-chip-warn">threshold met — formation pending</span>
            ) : formed ? (
              <span className="cm-chip cm-chip-ok">formed — final terms frozen</span>
            ) : (
              <span className="cm-chip cm-chip-ok">
                {units}/{LATENT_DEMAND_TERMS.threshold.minimumUnits} toward the threshold
              </span>
            )}
          </div>
          <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
          <TermLine
            label="Pool (kernel)"
            value={`${units} boxes from ${participants} consenting studios (threshold ${LATENT_DEMAND_TERMS.threshold.minimumUnits} boxes / ${LATENT_DEMAND_TERMS.threshold.minimumParticipants} studios) · revision ${aggregate.revision}`}
          />
          {aggregate.state === "MONITORING" ? (
            <p className="cm-state-item-detail">
              The merchant accepted (kernel MONITORING): the pool watches the threshold and nothing
              is formed yet — formation never happens automatically. Your studio&apos;s{" "}
              {LATENT_DEMAND_YOUR_SHARE_UNITS}-box share completes it; recording your share is
              interest, never a commitment.
            </p>
          ) : null}
          {aggregate.state === "HELD" ? (
            <p className="cm-state-item-detail">
              Threshold met (kernel HELD): the pool is held for the organizer&apos;s explicit
              formation with final terms — the second confirmation. Until that moment every
              participant may withdraw; a withdrawal that drops the pool back below the threshold
              honestly returns it to MONITORING.
            </p>
          ) : null}

          <PermissionGate host={host} permission="groupbuy.express-interest">
            {yourInterest === null && openForInterest(aggregate.state) ? (
              gate === "share" ? (
                <LatentShareGate
                  merchant={merchant}
                  units={units}
                  participants={participants}
                  onConfirm={() => {
                    recordYourShare();
                    setGate(null);
                  }}
                  onCancel={() => setGate(null)}
                />
              ) : (
                <button type="button" className="cm-button cm-button-primary" onClick={() => setGate("share")}>
                  Add your studio&apos;s share ({LATENT_DEMAND_YOUR_SHARE_UNITS} boxes — interest, not a commitment)
                </button>
              )
            ) : null}
            {yourInterest !== null ? (
              <YourLatentInterestItem
                merchant={merchant}
                interest={yourInterest}
                state={aggregate.state}
                withdrawGateOpen={gate === "withdraw"}
                lastOutcome={lastOutcome}
                onOpenWithdraw={() => setGate("withdraw")}
                onConfirmWithdraw={() => {
                  withdrawYourShare();
                  setGate(null);
                }}
                onCancelWithdraw={() => setGate(null)}
              />
            ) : null}
          </PermissionGate>

          {aggregate.state === "HELD" ? (
            <PermissionGate host={host} permission="groupbuy.review-proposal">
              {gate === "form" ? (
                <LatentFormGate
                  merchant={merchant}
                  target={target}
                  aggregate={aggregate}
                  units={units}
                  participants={participants}
                  onConfirm={() => {
                    formTheDeal();
                    setGate(null);
                  }}
                  onCancel={() => setGate(null)}
                />
              ) : (
                <button type="button" className="cm-button" onClick={() => setGate("form")}>
                  {organizer !== null ? participantName(DEMO_GROUPBUY_PRINCIPALS[target.id]!) : ""} forms the deal with final
                  terms (demo advance)
                </button>
              )}
            </PermissionGate>
          ) : null}

          {formed && aggregate.formation ? (
            <FormedDealPanel
              formation={aggregate.formation}
              roster={aggregate.participants}
              interests={interests}
              lastOutcome={lastOutcome}
            />
          ) : null}
        </section>
      ) : null}

      {sent ? (
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={startNewRound}>
            Start a new proposal round
          </button>
        </div>
      ) : null}
    </div>
  );
}
