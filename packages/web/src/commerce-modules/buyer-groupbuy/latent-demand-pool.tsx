/**
 * The J5 threshold-pool gates + FORMED panel, split from
 * latent-demand-parts.tsx (W2-013, the 400-effective-line law — pure code
 * motion, zero behavior change). Every gate renders KERNEL TRUTH from the
 * GroupBuy aggregate: the explicit gates for recording your interest and
 * withdrawing it before formation, the organizer's formation with final
 * terms (the second confirmation), and the FORMED panel (exact group price,
 * exact pool value, consenting-only roster — all frozen at formation).
 */
import type { JSX } from "react";

import type {
  CommandExecution,
  GroupBuyAggregate,
  GroupBuyFormationState,
  GroupBuyFormationTerms,
  GroupBuyInterestRecord,
  GroupBuyParticipantShare,
} from "@unicom/commerce";
import { multiplyMoneyByInteger, poolUnitsOf } from "@unicom/commerce";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import {
  DEMO_GROUPBUY_PRINCIPALS,
  LATENT_DEMAND_TERMS,
  LATENT_DEMAND_YOUR_SHARE_UNITS,
  openForInterest,
  participantName,
} from "./groupbuy-data.js";
import type { DemoMerchantTarget } from "./groupbuy-data.js";

/** The explicit gate for recording YOUR studio's interest (never a commitment). */
export function LatentShareGate({
  merchant,
  units,
  participants,
  onConfirm,
  onCancel,
}: {
  readonly merchant: string;
  readonly units: number;
  readonly participants: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <KernelCommitmentGate
      title="Authorize recording your interest (this is NOT a commitment)"
      terms={[
        { label: "Pool", value: `Latent-demand proposal to ${merchant}` },
        { label: "Threshold & deadline", value: `40 boxes / 4 studios by ${LATENT_DEMAND_TERMS.windowClosesLabel}` },
        { label: "Price at threshold", value: "11.20 USD per box (vs 12.75 list, demo)" },
        { label: "Your share", value: `${LATENT_DEMAND_YOUR_SHARE_UNITS} boxes (demo fixture share) — recorded at ${units + LATENT_DEMAND_YOUR_SHARE_UNITS}/40 boxes from ${participants + 1} studios` },
        { label: "What interest means", value: "Your interest is shared with the organizer only. It is NOT a commitment: nothing is owed, charged or ordered while you are merely interested." },
        { label: "What a commitment would mean (later, separately)", value: "A commitment would exist only after the organizer forms the deal with final terms — the second confirmation. You may withdraw interest any time before that moment." },
      ]}
      consequence="Your studio joins the pool's interested list only. The RECORD_GROUP_BUY_INTEREST command travels to the commerce kernel with your consent terms and creates no commitment; if it completes the threshold, the kernel moves the pool to HELD — still awaiting the organizer's explicit formation."
      evidence={[
        "Participant consents above (demo fixtures)",
        "Kernel threshold law: BOTH the studio count and the unit count must be met before the pool is HELD",
      ]}
      confirmLabel="Record my interest (not a commitment)"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** The explicit gate for withdrawing your interest before the second confirmation. */
export function LatentWithdrawGate({
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
      title="Withdraw your interest"
      terms={[
        { label: "Pool", value: `Latent-demand proposal to ${merchant}` },
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

/** Your studio's recorded kernel interest, with the withdraw-before-formation path. */
export function YourLatentInterestItem({
  merchant,
  interest,
  state,
  withdrawGateOpen,
  lastOutcome,
  onOpenWithdraw,
  onConfirmWithdraw,
  onCancelWithdraw,
}: {
  readonly merchant: string;
  readonly interest: GroupBuyInterestRecord;
  readonly state: GroupBuyFormationState;
  readonly withdrawGateOpen: boolean;
  readonly lastOutcome: CommandExecution | null;
  readonly onOpenWithdraw: () => void;
  readonly onConfirmWithdraw: () => void;
  readonly onCancelWithdraw: () => void;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-latent-your-interest">
      <div className="cm-row">
        <span className="cm-state-item-label">Your interest is recorded</span>
        <LifecycleStateChip state="OFFERED" />
        <span className="cm-chip cm-chip-unknown">interest — not a commitment</span>
      </div>
      <p className="cm-state-item-detail">
        Kernel interest record: {interest.quantity.units} boxes · recorded{" "}
        {interest.recordedAt} (demo clock) · revision {interest.revision}. Withdraw
        any time before the deal forms — the second confirmation.
      </p>
      {lastOutcome && lastOutcome.status === "EXECUTED" ? (
        <TermLine
          label="Kernel receipt"
          value={`command ${lastOutcome.receipt.commandId} · idempotency key ${lastOutcome.receipt.idempotencyKey} · executed ${lastOutcome.receipt.executedAt} · resulting revision ${lastOutcome.receipt.resultingRevision}`}
        />
      ) : null}
      {openForInterest(state) ? (
        withdrawGateOpen ? (
          <LatentWithdrawGate merchant={merchant} onConfirm={onConfirmWithdraw} onCancel={onCancelWithdraw} />
        ) : (
          <button type="button" className="cm-button" onClick={onOpenWithdraw}>
            Withdraw my interest (before formation)
          </button>
        )
      ) : null}
    </div>
  );
}

/** The organizer's explicit formation gate (the second confirmation, with final terms). */
export function LatentFormGate({
  merchant,
  target,
  aggregate,
  units,
  participants,
  onConfirm,
  onCancel,
}: {
  readonly merchant: string;
  readonly target: DemoMerchantTarget;
  readonly aggregate: GroupBuyAggregate;
  readonly units: number;
  readonly participants: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <KernelCommitmentGate
      title="The organizer's explicit formation (the second confirmation, with final terms)"
      terms={[
        { label: "Pool", value: `Latent-demand proposal to ${merchant}` },
        {
          label: "Final group price",
          value: `${moneyText(aggregate.counterTerms ? aggregate.counterTerms.unitPrice : LATENT_DEMAND_TERMS.proposedUnitPrice)} per box (exact, frozen at formation)${
            aggregate.counterTerms ? " — the accepted counter's terms" : ""
          }`,
        },
        {
          label: "Pool value at formation",
          value: `${moneyText(
            multiplyMoneyByInteger(
              aggregate.counterTerms ? aggregate.counterTerms.unitPrice : LATENT_DEMAND_TERMS.proposedUnitPrice,
              units,
            ),
          )} — group price × ${units} boxes (kernel-computed)`,
        },
        {
          label: "Consenting-only roster",
          value: `${participants} live consenting studios — the declining studio (Northlight Atelier) was never recorded and never enrolls`,
        },
        {
          label: "What formation freezes",
          value: "The final terms (exact group price, exact pool value) and the roster of consenting-only participants. Interest was never a commitment — THIS is the second confirmation.",
        },
      ]}
      consequence={`Confirming submits the FORM_GROUP_BUY command as ${participantName(
        DEMO_GROUPBUY_PRINCIPALS[target.id]!,
      )} (demo advance): the kernel transitions the HELD pool to FORMED and freezes the final terms and the consenting-only roster. No money moves — an actual commitment would live on the commerce planes, and this kernel aggregate never creates one.`}
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

/** The FORMED final-terms panel (kernel truth, frozen at formation). */
export function FormedDealPanel({
  formation,
  roster,
  interests,
  lastOutcome,
}: {
  readonly formation: GroupBuyFormationTerms;
  readonly roster: readonly GroupBuyParticipantShare[];
  readonly interests: readonly GroupBuyInterestRecord[];
  readonly lastOutcome: CommandExecution | null;
}): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-groupbuy-formed" style={{ borderColor: "var(--cm-ok)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Deal FORMED — the second confirmation happened with final terms</span>
        <span className="cm-chip cm-chip-ok">FORMED</span>
      </div>
      <TermLine label="Final group price (frozen)" value={`${moneyText(formation.groupPrice)} per box`} />
      <TermLine
        label="Pool value (exact, kernel-computed)"
        value={`${moneyText(formation.poolValue)} — group price × ${poolUnitsOf(interests)} boxes, frozen at formation`}
      />
      <TermLine label="Formed at" value={`${formation.formedAt} (demo clock)`} />
      <TermLine
        label="Consenting-only roster (frozen)"
        value={roster
          .map((share) => `${participantName(share.participantRef)} · ${share.quantity.units} boxes`)
          .join(" / ")}
      />
      <p className="cm-state-item-detail">
        Interest was never a commitment; formation with these final terms WAS the second
        confirmation. Withdrawal closed the moment the deal formed — before it, any
        participant could withdraw any time. The declining studio never appeared in any
        kernel state. No money moved: an actual commitment would live on the commerce
        planes, and this kernel aggregate never creates one.
      </p>
      {lastOutcome && lastOutcome.status === "EXECUTED" ? (
        <TermLine
          label="Kernel receipt"
          value={`command ${lastOutcome.receipt.commandId} · idempotency key ${lastOutcome.receipt.idempotencyKey} · executed ${lastOutcome.receipt.executedAt} · resulting revision ${lastOutcome.receipt.resultingRevision}`}
        />
      ) : null}
    </div>
  );
}
