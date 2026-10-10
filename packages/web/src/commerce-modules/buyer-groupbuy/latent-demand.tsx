/**
 * J5 buyer-side latent-demand surface: recruit only CONSENTING demo
 * participants, propose merchant terms through an explicit gate, then show
 * the merchant's accept / counter / reject response states. The merchant
 * review side belongs to W3-015; every fixture here is namespaced to the
 * buyer side (w2ld-) and stays local demo state.
 */
import type { JSX } from "react";

import { useState } from "react";
import { multiplyMoneyByInteger } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { CommitmentGate, DemoTag, TermLine } from "../buyer-support/ui.js";

/** Demo participant recruitment state — only CONSENTING studios are listed. */
interface DemoParticipant {
  readonly name: string;
  readonly consent: "consented" | "declined";
  readonly units: number;
  readonly consentNote: string;
}

const DEMO_PARTICIPANTS: readonly DemoParticipant[] = [
  {
    name: "Ferry Road Press",
    consent: "consented",
    units: 16,
    consentNote: "Explicitly agreed (demo fixture) to appear in this proposal with a 16-box share.",
  },
  {
    name: "Two Harbors Design",
    consent: "consented",
    units: 12,
    consentNote: "Explicitly agreed (demo fixture) to a 12-box share.",
  },
  {
    name: "Quayside Studio",
    consent: "consented",
    units: 8,
    consentNote: "Explicitly agreed (demo fixture) to an 8-box share.",
  },
  {
    name: "Northlight Atelier",
    consent: "declined",
    units: 0,
    consentNote:
      "Declined (demo fixture) — EXCLUDED from the proposal. Non-consenting studios are never silently enrolled.",
  },
];

const PROPOSAL_UNITS = DEMO_PARTICIPANTS
  .filter((participant) => participant.consent === "consented")
  .reduce((total, participant) => total + participant.units, 0);

/** Deterministic demo merchant review behaviors (buyer-side fixtures only). */
const MERCHANT_TARGETS: readonly {
  readonly name: string;
  readonly behavior: "accepts" | "counters" | "rejects";
  readonly replyNote: string;
}[] = [
  {
    name: "Meridian Office Supply",
    behavior: "counters",
    replyNote:
      "Counter (demo): we can do 11.60 USD per box at 36 boxes, delivered, if the pool closes by Oct 20.",
  },
  {
    name: "Cascade Foods Wholesale",
    behavior: "accepts",
    replyNote:
      "Accepted (demo): 11.20 USD per box at 36 boxes, payment-on-formation — final formation still needs every participant's second confirmation.",
  },
  {
    name: "Paper Trail Co-op",
    behavior: "rejects",
    replyNote:
      "Declined (demo): the co-op cannot honor group pricing this quarter. A rejection ends the proposal; nothing was ever committed.",
  },
];

type ProposalPhase =
  | { readonly kind: "draft" }
  | { readonly kind: "reviewing"; readonly merchant: string }
  | { readonly kind: "offered"; readonly merchant: string }
  | { readonly kind: "answered"; readonly merchant: string; readonly outcome: "accepted" | "countered" | "rejected"; readonly note: string };

export function LatentDemandPanel({ host }: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  void host;
  const [phase, setPhase] = useState<ProposalPhase>({ kind: "draft" });
  const [merchant, setMerchant] = useState<string>(MERCHANT_TARGETS[0]!.name);

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
          merchant terms, and no participant — including you — is enrolled silently. The merchant
          review side (accept/reject/counter decisions) is W3-015&apos;s surface; the responses here
          are deterministic BUYER-SIDE fixtures (w2ld- namespace).
        </p>
      </section>

      <section className="cm-card" aria-label="Consenting participants">
        <h2 className="cm-card-title">Recruited participants (consent visible)</h2>
        <div className="cm-stack">
          {DEMO_PARTICIPANTS.map((participant) => (
            <div key={participant.name} className="cm-state-item" data-testid={`cm-participant-${participant.consent}`}>
              <div className="cm-row">
                <span className="cm-state-item-label">{participant.name}</span>
                {participant.consent === "consented" ? (
                  <span className="cm-chip cm-chip-ok">consented · {participant.units} boxes</span>
                ) : (
                  <span className="cm-chip cm-chip-err">declined · excluded</span>
                )}
                <DemoTag />
              </div>
              <p className="cm-state-item-detail">{participant.consentNote}</p>
            </div>
          ))}
        </div>
        <TermLine label="Consenting total" value={`${PROPOSAL_UNITS} boxes from ${DEMO_PARTICIPANTS.filter((p) => p.consent === "consented").length} studios`} />
        <TermLine label="Non-consenting" value="Never listed in the proposal — enrollment without consent is structurally not offered here." />
      </section>

      <section className="cm-card" aria-label="Merchant terms">
        <h2 className="cm-card-title">Proposed merchant terms</h2>
        <div className="cm-stack">
          <TermLine label="Volume" value={`${PROPOSAL_UNITS} boxes of A3 recycled card`} />
          <TermLine label="Target group price" value="11.20 USD per box (vs 12.75 list — the exact savings a merchant would weigh)" />
          <TermLine label="Pool closes by" value="Oct 20, 18:00 (demo clock)" />
          <TermLine label="Your studio's share" value="Your interest is not a commitment — you confirm a second time if the merchant accepts" />
          <TermLine
            label="40-box reference cost at target price"
            value={`${moneyText(multiplyMoneyByInteger(usdMinor("1120"), 40))} (exact math via the commerce runtime)`}
          />
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-fg-subtle)" }}>
            <span>Send the proposal to</span>
            <select aria-label="Proposal target merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)}>
              {MERCHANT_TARGETS.map((target) => (
                <option key={target.name} value={target.name}>{target.name}</option>
              ))}
            </select>
          </label>
          {phase.kind === "draft" ? (
            <button
              type="button"
              className="cm-button cm-button-primary"
              onClick={() => setPhase({ kind: "reviewing", merchant })}
            >
              Review proposal before sending
            </button>
          ) : null}
        </div>
      </section>

      {phase.kind === "reviewing" ? (
        <CommitmentGate
          title="Authorize sending the group-deal proposal"
          terms={[
            { label: "Target merchant", value: phase.merchant },
            { label: "Volume", value: `${PROPOSAL_UNITS} boxes` },
            { label: "Target price", value: "11.20 USD per box" },
            { label: "Participants", value: "3 consenting studios (one declining studio excluded)" },
            { label: "What sending means", value: "An OFFER to the merchant — it may accept, counter or reject. No participant is committed by sending." },
          ]}
          consequence="The merchant sees the aggregate demand (units and target terms), not individual studios' identities beyond what consent covers. If they accept, formation still requires each participant's second confirmation."
          evidence={["Participant consents above (demo fixtures)", "Verified list price from the compare surface"]}
          confirmLabel="Send proposal to the merchant"
          onConfirm={() => setPhase({ ...phase, kind: "offered" })}
          onCancel={() => setPhase({ kind: "draft" })}
        />
      ) : null}

      {phase.kind === "offered" ? (
        <div className="cm-state-item" data-testid="cm-proposal-offered">
          <div className="cm-row">
            <span className="cm-state-item-label">Proposal to {phase.merchant}</span>
            <LifecycleStateChip state="OFFERED" />
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">
            Sent and on the merchant&apos;s desk. Pending is not an error and not an acceptance. The
            merchant review side is W3-015&apos;s surface — reveal the deterministic demo reply:
          </p>
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              const target = MERCHANT_TARGETS.find((m) => m.name === phase.merchant);
              if (!target) return;
              const outcome = target.behavior === "accepts" ? "accepted" : target.behavior === "counters" ? "countered" : "rejected";
              setPhase({ ...phase, kind: "answered", outcome, note: target.replyNote });
            }}
          >
            Reveal merchant review outcome (demo)
          </button>
        </div>
      ) : null}

      {phase.kind === "answered" ? (
        <div className="cm-state-item" data-testid={`cm-proposal-${phase.outcome}`}>
          <div className="cm-row">
            <span className="cm-state-item-label">Merchant review: {phase.outcome}</span>
            <span className={phase.outcome === "accepted" ? "cm-chip cm-chip-ok" : phase.outcome === "rejected" ? "cm-chip cm-chip-warn" : "cm-chip cm-chip-unknown"}>
              {phase.outcome}
            </span>
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">{phase.note}</p>
          <p className="cm-state-item-detail">
            {phase.outcome === "accepted"
              ? "Formation needs every participant's second confirmation against the final terms — deliberately not wired in this host (the canonical formation engine is the agent lane's; recorded as a blocker)."
              : phase.outcome === "countered"
                ? "You may accept the counter, reject it, or send a new round — each is another explicit step; nothing auto-commits."
                : "A rejected proposal ends here. No participant was ever enrolled or charged."}
          </p>
          <button type="button" className="cm-button" onClick={() => setPhase({ kind: "draft" })}>
            Start a new proposal round
          </button>
        </div>
      ) : null}
    </div>
  );
}
