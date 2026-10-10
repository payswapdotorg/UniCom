/**
 * The J5 latent-demand review-state panels, split from the original single
 * parts file (W2-013, the 400-effective-line law — pure code motion, zero
 * behavior change; the threshold-pool gates + FORMED panel live in
 * ./latent-demand-pool.tsx). Every panel renders KERNEL TRUTH from the
 * GroupBuy aggregate: the proposal states (PENDING on the organizer's desk,
 * COUNTERED with the counter's recorded terms, accepted into threshold
 * MONITORING, REJECTED/EXPIRED terminal) and the explicit send gate.
 */
import type { JSX } from "react";

import type { GroupBuyAggregate } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import {
  GROUPBUY_STATE_LABELS,
  LATENT_DEMAND_CONSENTING_SHARES,
  LATENT_DEMAND_EXCLUDED,
  LATENT_DEMAND_UNITS,
  LATENT_DEMAND_YOUR_SHARE_UNITS,
  participant,
} from "./groupbuy-data.js";
import type { DemoMerchantTarget } from "./groupbuy-data.js";

/** The recruited participants (fixture consents visible; the declining studio visibly excluded). */
export function ConsentingParticipantsPanel(): JSX.Element {
  return (
    <section className="cm-card" aria-label="Consenting participants">
      <h2 className="cm-card-title">Recruited participants (consent visible)</h2>
      <div className="cm-stack">
        {LATENT_DEMAND_CONSENTING_SHARES.map((share) => (
          <div key={share.participantId} className="cm-state-item" data-testid="cm-participant-consented">
            <div className="cm-row">
              <span className="cm-state-item-label">{participant(share.participantId)}</span>
              <span className="cm-chip cm-chip-ok">consented · {share.units} boxes</span>
              <DemoTag />
            </div>
            <p className="cm-state-item-detail">{share.consentNote}</p>
          </div>
        ))}
        <div className="cm-state-item" data-testid="cm-participant-declined">
          <div className="cm-row">
            <span className="cm-state-item-label">{participant(LATENT_DEMAND_EXCLUDED.participantId)}</span>
            <span className="cm-chip cm-chip-err">declined · excluded</span>
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">{LATENT_DEMAND_EXCLUDED.consentNote}</p>
        </div>
      </div>
      <TermLine label="Consenting total" value={`${LATENT_DEMAND_UNITS} boxes from ${LATENT_DEMAND_CONSENTING_SHARES.length} studios`} />
      <TermLine label="Non-consenting" value="Never listed in the proposal — enrollment without consent is structurally not offered here." />
    </section>
  );
}

/** The explicit gate for sending the proposal (opening it on the organizer's desk). */
export function SendProposalGate({
  merchant,
  onConfirm,
  onCancel,
}: {
  readonly merchant: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <KernelCommitmentGate
      title="Authorize sending the group-deal proposal"
      terms={[
        { label: "Target merchant", value: merchant },
        { label: "Volume", value: `${LATENT_DEMAND_UNITS} boxes` },
        { label: "Target price", value: "11.20 USD per box" },
        { label: "Participants", value: "3 consenting studios (one declining studio excluded)" },
        { label: "Threshold", value: `40 boxes from 4 studios — your ${LATENT_DEMAND_YOUR_SHARE_UNITS}-box share completes it` },
        { label: "What sending means", value: "An OFFER to the merchant — it may accept, counter or reject. No participant is committed by sending." },
      ]}
      consequence="The OPEN_GROUP_BUY_PROPOSAL command opens the proposal on the organizer's desk and the three consenting studios' interests travel with it as RECORD_GROUP_BUY_INTEREST commands — the declining studio is never recorded. The merchant sees the aggregate demand (units and target terms), not individual studios' identities beyond what consent covers. If they accept, formation still requires the second confirmation against the final terms."
      evidence={[
        "Participant consents above (demo fixtures)",
        "Verified list price from the compare surface",
        "Kernel interest law: interest carries consent terms only — never a commitment",
      ]}
      confirmLabel="Send proposal to the merchant"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** The proposal on the organizer's desk (kernel PENDING) — not an error, not an acceptance. */
export function OfferedProposalPanel({
  merchant,
  aggregate,
  units,
  participants,
  host,
  onReveal,
}: {
  readonly merchant: string;
  readonly aggregate: GroupBuyAggregate;
  readonly units: number;
  readonly participants: number;
  readonly host: CommerceModuleProps["host"];
  readonly onReveal: () => void;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-proposal-offered">
      <div className="cm-row">
        <span className="cm-state-item-label">Proposal to {merchant}</span>
        <LifecycleStateChip state="OFFERED" />
        <DemoTag />
      </div>
      <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
      <TermLine
        label="Pool (kernel)"
        value={`${units} boxes from ${participants} consenting studios · revision ${aggregate.revision}`}
      />
      <p className="cm-state-item-detail">
        Sent and on the merchant&apos;s desk. Pending is not an error and not an acceptance. The
        merchant review side is W3&apos;s surface — reveal the deterministic demo reply:
      </p>
      <PermissionGate host={host} permission="groupbuy.review-proposal">
        <button type="button" className="cm-button" onClick={onReveal}>
          Reveal merchant review outcome (demo)
        </button>
      </PermissionGate>
    </div>
  );
}

/** The merchant's counter (kernel COUNTERED) — the recorded terms are the evidence. */
export function CounteredProposalPanel({
  target,
  aggregate,
  host,
  onAcceptCounter,
}: {
  readonly target: DemoMerchantTarget;
  readonly aggregate: GroupBuyAggregate;
  readonly host: CommerceModuleProps["host"];
  readonly onAcceptCounter: () => void;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-proposal-countered">
      <div className="cm-row">
        <span className="cm-state-item-label">Merchant review: countered</span>
        <span className="cm-chip cm-chip-unknown">countered</span>
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">{target.replyNote}</p>
      <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
      {aggregate.counterTerms ? (
        <TermLine
          label="Counter terms on record (kernel)"
          value={`${moneyText(aggregate.counterTerms.unitPrice)} per box at a ${aggregate.counterTerms.minimumUnits}-box minimum — acceptance keeps these terms; replacement terms are never smuggled in`}
        />
      ) : null}
      <p className="cm-state-item-detail">
        You may accept the counter, reject it, or send a new round — each is another explicit
        step; nothing auto-commits.
      </p>
      <PermissionGate host={host} permission="groupbuy.express-interest">
        <button type="button" className="cm-button" onClick={onAcceptCounter}>
          Accept the counter (as initiator — the recorded terms are the evidence)
        </button>
      </PermissionGate>
    </div>
  );
}

/**
 * The merchant's acceptance (kernel MONITORING): the proposal moved into
 * threshold watching. Rendered for a direct accept AND after the initiator
 * accepts a counter (the recorded counter terms stay on record as evidence).
 */
export function AcceptedProposalPanel({
  target,
  aggregate,
}: {
  readonly target: DemoMerchantTarget;
  readonly aggregate: GroupBuyAggregate;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-proposal-accepted">
      <div className="cm-row">
        <span className="cm-state-item-label">
          Merchant review: accepted{aggregate.counterTerms ? " (on the counter's recorded terms)" : ""}
        </span>
        <span className="cm-chip cm-chip-ok">accepted</span>
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">{target.replyNote}</p>
      <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
      {aggregate.counterTerms ? (
        <TermLine
          label="Counter terms on record (kernel)"
          value={`${moneyText(aggregate.counterTerms.unitPrice)} per box at a ${aggregate.counterTerms.minimumUnits}-box minimum — acceptance keeps these terms; replacement terms are never smuggled in`}
        />
      ) : null}
      <p className="cm-state-item-detail">
        The kernel moved the proposal into threshold MONITORING: the pool now watches the
        threshold and nothing is formed yet — formation is the organizer&apos;s explicit step
        with final terms (the second confirmation), never automatic. Every participant can
        withdraw until that moment.
      </p>
    </div>
  );
}

/** The merchant's rejection (kernel REJECTED/EXPIRED, terminal) — nothing was ever committed. */
export function RejectedProposalPanel({
  target,
  aggregate,
}: {
  readonly target: DemoMerchantTarget;
  readonly aggregate: GroupBuyAggregate;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-proposal-rejected">
      <div className="cm-row">
        <span className="cm-state-item-label">Merchant review: rejected</span>
        <span className="cm-chip cm-chip-warn">rejected</span>
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">{target.replyNote}</p>
      <TermLine label="Status (kernel)" value={GROUPBUY_STATE_LABELS[aggregate.state]} />
      {aggregate.rejectionReason ? (
        <TermLine label="Rejection reason (kernel)" value={aggregate.rejectionReason} />
      ) : null}
      <p className="cm-state-item-detail">
        A rejected proposal ends here. No participant was ever enrolled or charged.
      </p>
    </div>
  );
}
