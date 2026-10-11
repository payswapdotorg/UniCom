/**
 * buyer-groupbuy component gates (extracted from component.tsx for the
 * max-lines lint rule; pure code motion — no behavior change).
 *
 * JoinGate / LeaveGate / FormationGate / InterestedItem: the commitment
 * gates and the recorded-interest item rendered by the J4 GroupBuy panel.
 */
import type { JSX } from "react";

import { multiplyMoneyByInteger } from "@unicom/commerce";
import type { CommandExecution, GroupBuyInterestRecord } from "@unicom/commerce";
import { LifecycleStateChip } from "../../commerce-host/shared/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import { DEMO_GROUPBUY_PRINCIPALS, participantName, unitsLabel } from "./groupbuy-data.js";
import type { DemoGroupBuyPool } from "./groupbuy-data.js";

export function JoinGate({
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

export function LeaveGate({
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

export function FormationGate({
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

export function InterestedItem({
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
