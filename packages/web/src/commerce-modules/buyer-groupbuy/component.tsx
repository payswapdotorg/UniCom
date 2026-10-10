/**
 * buyer-groupbuy component — the J4 surface (open group buys: join/leave
 * with explicit authorization, interest never a commitment) plus the route
 * split to the J5 latent-demand surface (latent-demand.tsx).
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { CommitmentGate, DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { LatentDemandPanel } from "./latent-demand.js";

/** One committed demo group buy (all values synthetic, DEMO-labelled). */
export interface DemoGroupBuy {
  readonly id: string;
  readonly title: string;
  readonly thresholdUnits: number;
  readonly currentUnits: number;
  readonly deadline: string;
  readonly eligibility: string;
  readonly unitPriceAtThreshold: string;
  readonly consentTerms: string;
  readonly commitmentTerms: string;
  readonly organizerNote: string;
}

export const DEMO_GROUP_BUYS: readonly DemoGroupBuy[] = [
  {
    id: "w2gb-01",
    title: "A3 recycled card — studio pool",
    thresholdUnits: 60,
    currentUnits: 48,
    deadline: "Oct 15, 18:00 (demo clock)",
    eligibility: "Studios inside Meridian's delivery area; one participation per studio.",
    unitPriceAtThreshold: "11.20 USD per box (vs 12.75 list, demo)",
    consentTerms:
      "Your interest is shared with the organizer only. It is NOT a commitment: nothing is owed, charged or ordered while you are merely interested.",
    commitmentTerms:
      "A commitment would exist only after the threshold is met AND you confirm a second time against the formed deal's final terms. Payment-on-formation is the organizer's rule; you may withdraw interest any time before that second confirmation.",
    organizerNote: "48 of 60 boxes spoken for (demo participants).",
  },
  {
    id: "w2gb-02",
    title: "Pigment ink set — print co-op",
    thresholdUnits: 24,
    currentUnits: 24,
    deadline: "Oct 13, 12:00 (demo clock)",
    eligibility: "Co-op members who have completed a previous group buy.",
    unitPriceAtThreshold: "41.00 USD per set (vs 49.00 list, demo)",
    consentTerms:
      "Threshold already met — the pool is awaiting the organizer's formation step. Your interest still commits you to nothing.",
    commitmentTerms:
      "If you express interest now, you join the waiting list for the formed deal's final terms — the deal is NOT formed yet, and no money moves in demo mode.",
    organizerNote: "Threshold reached (24/24). Formation pending organizer authorization — not automatic.",
  },
];

export default function BuyerGroupbuyComponent({ host }: CommerceModuleProps): JSX.Element {
  if (host.currentPath.startsWith("/commerce/buyer/group-buy/latent-demand")) {
    return <LatentDemandPanel host={host} />;
  }
  return <GroupBuyPanel host={host} />;
}
function GroupBuyPanel({ host }: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  const [interest, setInterest] = useState<Record<string, boolean>>({});
  const [gate, setGate] = useState<string | null>(null);

  const interestedCount = DEMO_GROUP_BUYS.filter((buy) => interest[buy.id] === true).length;

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
          anything. Formation itself is the agent lane&apos;s group-buy engine; in this host the
          formation states are demo-only local state (recorded as a lane blocker, never simulated as
          a live outcome).
        </p>
        <p className="cm-card-sub">
          You currently hold interest in {interestedCount} of {DEMO_GROUP_BUYS.length} pools.
        </p>
      </section>

      <section className="cm-card" aria-label="Group buy availability honesty">
        <h2 className="cm-card-title">What is real here, and what is not</h2>
        <TermLine
          label="Real"
          value="The discovery surface, the terms shown, and the join/leave/consent flows — all deterministic demo fixtures."
        />
        <TermLine
          label="Demo-only"
          value="Participant counts, threshold progress and any 'formation' state — they live in local screen state only."
        />
        <TermLine
          label="Not wired"
          value="The canonical GroupBuy formation engine (agent lane) is not connected to this host; no group-buy commitment is ever created."
        />
      </section>

      {DEMO_GROUP_BUYS.map((buy) => (
        <section key={buy.id} className="cm-card" data-testid={`cm-groupbuy-${buy.id}`}>
          <div className="cm-row">
            <h2 className="cm-card-title">{buy.title}</h2>
            <DemoTag />
            {buy.currentUnits >= buy.thresholdUnits ? (
              <span className="cm-chip cm-chip-warn">threshold met — formation pending</span>
            ) : (
              <span className="cm-chip cm-chip-ok">{buy.currentUnits}/{buy.thresholdUnits} toward the threshold</span>
            )}
          </div>
          <TermLine label="Group threshold" value={`${buy.thresholdUnits} units`} />
          <TermLine label="Deadline" value={buy.deadline} />
          <TermLine label="Eligibility" value={buy.eligibility} />
          <TermLine label="Price at threshold" value={buy.unitPriceAtThreshold} />
          <TermLine label="Consent terms" value={buy.consentTerms} />
          <TermLine label="Commitment terms (what a REAL commitment would mean)" value={buy.commitmentTerms} />
          <TermLine label="Organizer note" value={buy.organizerNote} />

          <PermissionGate host={host} permission="groupbuy.express-interest">
            {gate === `join:${buy.id}` && interest[buy.id] !== true ? (
              <CommitmentGate
                title="Authorize recording your interest (this is NOT a commitment)"
                terms={[
                  { label: "Pool", value: buy.title },
                  { label: "Threshold & deadline", value: `${buy.thresholdUnits} units by ${buy.deadline}` },
                  { label: "Price at threshold", value: buy.unitPriceAtThreshold },
                  { label: "What interest means", value: buy.consentTerms },
                  { label: "What a commitment would mean (later, separately)", value: buy.commitmentTerms },
                ]}
                consequence="Your studio joins the interested list only. If the threshold is later met AND the deal forms, you would be asked to confirm a SECOND time against the final terms — declining then costs nothing."
                evidence={[`Organizer note: ${buy.organizerNote}`, "Pool terms above (demo fixtures)"]}
                confirmLabel="Record my interest (not a commitment)"
                onConfirm={() => {
                  setInterest((prior) => ({ ...prior, [buy.id]: true }));
                  setGate(null);
                }}
                onCancel={() => setGate(null)}
              />
            ) : gate === `leave:${buy.id}` && interest[buy.id] === true ? (
              <CommitmentGate
                title="Withdraw your interest"
                terms={[
                  { label: "Pool", value: buy.title },
                  { label: "Effect", value: "Your studio leaves the interested list. No other participant is affected; nothing was ever owed." },
                ]}
                consequence="The pool's interested count drops by your share. If the pool still reaches its threshold, it can form without you."
                evidence={["Your interest record (local demo state)"]}
                confirmLabel="Withdraw interest"
                onConfirm={() => {
                  setInterest((prior) => ({ ...prior, [buy.id]: false }));
                  setGate(null);
                }}
                onCancel={() => setGate(null)}
              />
            ) : interest[buy.id] === true ? (
              <div className="cm-state-item" style={{ marginTop: 10 }} data-testid="cm-groupbuy-interested">
                <div className="cm-row">
                  <span className="cm-state-item-label">Your interest is recorded</span>
                  <LifecycleStateChip state="OFFERED" />
                  <span className="cm-chip cm-chip-unknown">interest — not a commitment</span>
                </div>
                <p className="cm-state-item-detail">
                  Withdraw any time; withdrawing interest cancels nothing else (there is nothing else
                  to cancel).
                </p>
                <button type="button" className="cm-button" onClick={() => setGate(`leave:${buy.id}`)}>
                  Withdraw my interest
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="cm-button cm-button-primary"
                style={{ marginTop: 10 }}
                onClick={() => setGate(`join:${buy.id}`)}
              >
                Express interest (with authorization)
              </button>
            )}
          </PermissionGate>
        </section>
      ))}

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
    </div>
  );
}
