/**
 * J3 multi-merchant negotiation panel: draft a counter-offer, review it in an
 * explicit gate (an OFFER, never a commitment), send it, and watch the
 * seller's deterministic reply states (accepted / countered / rejected) —
 * all local DEMO state. Different merchants respond differently, which is
 * the point of comparing across sellers.
 */
import type { JSX } from "react";

import { useState } from "react";
import { multiplyMoneyByInteger } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { CommitmentGate, DemoTag, TermLine } from "../buyer-support/ui.js";

type NegotiationPhase =
  | { readonly kind: "drafting" }
  | { readonly kind: "reviewing"; readonly seller: string; readonly targetMajor: string }
  | { readonly kind: "sent"; readonly seller: string; readonly targetMajor: string }
  | {
      readonly kind: "replied";
      readonly seller: string;
      readonly targetMajor: string;
      readonly outcome: "accepted" | "countered" | "rejected";
      readonly replyNote: string;
    };

/** Committed demo merchant negotiation behaviors (deterministic, labelled). */
const MERCHANTS: readonly {
  readonly name: string;
  readonly listPriceMajor: string;
  readonly thresholdMajor: string;
  readonly behavior: "accepts-at-threshold" | "counters-once" | "rejects-below-cost";
  readonly note: string;
}[] = [
  {
    name: "Meridian Office Supply",
    listPriceMajor: "12.75",
    thresholdMajor: "12.20",
    behavior: "counters-once",
    note: "This merchant usually counters once, splitting the difference.",
  },
  {
    name: "Cascade Foods Wholesale",
    listPriceMajor: "11.99",
    thresholdMajor: "11.50",
    behavior: "accepts-at-threshold",
    note: "This merchant accepts offers at or above their floor when stock is high.",
  },
  {
    name: "Paper Trail Co-op",
    listPriceMajor: "0",
    thresholdMajor: "0",
    behavior: "rejects-below-cost",
    note: "The co-op feed is UNKNOWN right now — a negotiation would be dishonest to start.",
  },
];

function merchantReply(
  merchant: (typeof MERCHANTS)[number],
  targetMajor: number,
): { readonly outcome: "accepted" | "countered" | "rejected"; readonly replyNote: string } {
  const threshold = Number(merchant.thresholdMajor);
  if (merchant.behavior === "rejects-below-cost") {
    return {
      outcome: "rejected",
      replyNote: "Cannot open a negotiation: the co-op's price feed could not be confirmed (UNKNOWN).",
    };
  }
  if (targetMajor >= threshold) {
    return {
      outcome: merchant.behavior === "accepts-at-threshold" ? "accepted" : "countered",
      replyNote:
        merchant.behavior === "accepts-at-threshold"
          ? `Accepted: ${targetMajor.toFixed(2)} USD per box is at or above our floor (${merchant.thresholdMajor} USD, demo).`
          : `Counter: we can do ${((threshold + Number(merchant.listPriceMajor)) / 2).toFixed(2)} USD per box — splitting the difference (demo).`,
    };
  }
  return {
    outcome: "rejected",
    replyNote: `Declined: ${targetMajor.toFixed(2)} USD is below our floor (${merchant.thresholdMajor} USD, demo).`,
  };
}

export function NegotiationPanel(_props: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  const [phase, setPhase] = useState<NegotiationPhase>({ kind: "drafting" });

  return (
    <section className="cm-card" aria-label="Negotiate with sellers">
      <div className="cm-row">
        <h2 className="cm-card-title">Negotiate (an offer, never a commitment)</h2>
        <DemoTag />
      </div>
      <p className="cm-card-sub">
        Send a counter-offer to one seller at a time. Sending creates an OFFERED record — the seller
        may accept, counter or reject it; nothing is owed by either side until an order would exist
        (and demo mode never creates one). Replies below are deterministic demo behaviors of the
        committed merchants.
      </p>

      {phase.kind === "drafting" ? (
        <NegotiationDraft onSubmit={(seller, target) => setPhase({ kind: "reviewing", seller, targetMajor: target })} />
      ) : null}

      {phase.kind === "reviewing" ? (
        <CommitmentGate
          title="Review your counter-offer before sending"
          terms={[
            { label: "Seller", value: phase.seller },
            { label: "Your target price", value: `${phase.targetMajor} USD per box × 40 boxes = ${moneyText(multiplyMoneyByInteger(usdMinor(String(Math.round(Number(phase.targetMajor) * 100))), 40))}` },
            { label: "Offer type", value: "A proposal the seller may accept, counter or reject — NOT an order and NOT a commitment" },
          ]}
          consequence="If the seller accepts, you get an accepted offer you may still walk away from (no payment path exists in demo mode). If they counter or reject, the thread stays open for another round."
          evidence={[`List prices from the compare surface (verified/stale chips there)`, `Merchant behavior note: ${MERCHANTS.find((m) => m.name === phase.seller)?.note ?? ""}`]}
          confirmLabel="Send counter-offer"
          onConfirm={() => setPhase({ ...phase, kind: "sent" })}
          onCancel={() => setPhase({ kind: "drafting" })}
        />
      ) : null}

      {phase.kind === "sent" ? (
        <div className="cm-state-item" data-testid="cm-negotiation-offered">
          <div className="cm-row">
            <span className="cm-state-item-label">Counter-offer to {phase.seller}</span>
            <LifecycleStateChip state="OFFERED" />
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">
            Sent — the seller has it on their desk. No commitment exists yet, and pending is not an
            error. In demo mode, reveal the (deterministic) reply:
          </p>
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              const merchant = MERCHANTS.find((m) => m.name === phase.seller);
              if (!merchant) return;
              const reply = merchantReply(merchant, Number(phase.targetMajor));
              setPhase({ ...phase, kind: "replied", outcome: reply.outcome, replyNote: reply.replyNote });
            }}
          >
            Reveal seller reply (demo)
          </button>
        </div>
      ) : null}

      {phase.kind === "replied" ? (
        <div className="cm-state-item" data-testid={`cm-negotiation-${phase.outcome}`}>
          <div className="cm-row">
            <span className="cm-state-item-label">Reply from {phase.seller}</span>
            <span
              className={
                phase.outcome === "accepted"
                  ? "cm-chip cm-chip-ok"
                  : phase.outcome === "rejected"
                    ? "cm-chip cm-chip-warn"
                    : "cm-chip cm-chip-unknown"
              }
            >
              {phase.outcome}
            </span>
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">{phase.replyNote}</p>
          <p className="cm-state-item-detail">
            {phase.outcome === "accepted"
              ? "You hold an accepted offer — accepting it back into an order is deliberately not wired in demo mode."
              : phase.outcome === "countered"
                ? "You can send another round from the drafting panel; every round stays a non-binding offer."
                : "Rejection is a normal outcome, not a failure — try the other verified seller or the substitution path."}
          </p>
          <button type="button" className="cm-button" onClick={() => setPhase({ kind: "drafting" })}>
            Draft another round
          </button>
        </div>
      ) : null}
    </section>
  );
}

function NegotiationDraft({
  onSubmit,
}: {
  readonly onSubmit: (seller: string, targetMajor: string) => void;
}): JSX.Element {
  const [seller, setSeller] = useState<string>(MERCHANTS[0]!.name);
  const [target, setTarget] = useState<string>("12.20");
  const merchant = MERCHANTS.find((m) => m.name === seller) ?? MERCHANTS[0]!;
  const targetMinor = String(Math.round(Number(target || "0") * 100));
  return (
    <div className="cm-stack" style={{ marginTop: 8 }}>
      <div className="cm-grid">
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-fg-subtle)" }}>
          <span>Seller</span>
          <select
            aria-label="Negotiation seller"
            value={seller}
            onChange={(event) => setSeller(event.target.value)}
          >
            {MERCHANTS.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} (list {m.listPriceMajor === "0" ? "UNKNOWN" : `${m.listPriceMajor} USD`})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-fg-subtle)" }}>
          <span>Your target price per box (USD)</span>
          <input
            type="number"
            step="0.05"
            min="0"
            aria-label="Target price per box"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
      </div>
      <TermLine label="40-box total at your target" value={moneyText(multiplyMoneyByInteger(usdMinor(targetMinor), 40))} />
      <TermLine label="This seller's pattern" value={merchant.note} />
      <button
        type="button"
        className="cm-button cm-button-primary"
        onClick={() => onSubmit(seller, target || "0")}
      >
        Review counter-offer
      </button>
    </div>
  );
}
