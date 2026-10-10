/**
 * merchant-groupbuy-review presentational parts (J5 merchant side, W3-016)
 * — split out of component.tsx for the max-lines gate (pure code motion;
 * the composing entry stays component.tsx).
 *
 * Every panel renders KERNEL truth: the aggregate's state, terms, threshold
 * and (once formed) final terms + frozen roster, plus the per-participant
 * interest records the machine holds (each with its own consent terms).
 */

import type { JSX } from "react";

import { liveGroupBuyInterests } from "@unicom/commerce";
import type {
  GroupBuyAggregate,
  GroupBuyInterestRecord,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  clockLabel,
  COUNTER_OPTIONS,
  EXCLUDED_STUDIOS,
  MIRROR_NOTES,
  productTitleOf,
  REJECT_REASONS,
  studioNameOf,
  WITHDRAWAL_NOTES,
} from "./fixtures.js";
import type { DemoCounterOption } from "./fixtures.js";
import { KERNEL_STATE_LABELS, KERNEL_STATE_TONE, participantIdOf } from "./seed.js";

/** Derived kernel view of one pool (computed once in component.tsx). */
export interface PoolView {
  readonly poolId: string;
  readonly aggregate: GroupBuyAggregate;
  readonly interests: readonly GroupBuyInterestRecord[];
  readonly units: number;
  readonly studios: number;
  readonly met: boolean;
  readonly summary: string;
  readonly price: string;
  readonly list: string;
  readonly saving: string;
  readonly poolValue: string;
  readonly deadline: string;
}

function money(minor: string): string {
  return fmtMoney(demoMoney(minor));
}

/** Header: id, kernel state chip, desk-since, revision. */
export function PoolHeader({ view }: { readonly view: PoolView }): JSX.Element {
  const state = view.aggregate.state;
  return (
    <div className="cm-row">
      <span className="cm-state-item-label">{view.poolId}</span>
      <span
        className={`cm-chip ${KERNEL_STATE_TONE[state] === "ok" ? "cm-chip-ok" : KERNEL_STATE_TONE[state] === "warn" ? "cm-chip-warn" : KERNEL_STATE_TONE[state] === "unknown" ? "cm-chip-unknown" : "cm-chip-muted"}`}
        data-status={state}
      >
        {KERNEL_STATE_LABELS[state]}
      </span>
      <span className="cm-env-note">
        on your desk since {clockLabel(view.aggregate.openedAt)} · kernel revision {view.aggregate.revision}
      </span>
      <DemoTag />
    </div>
  );
}

/** Terms grid — all values kernel-derived (exact money math). */
export function PoolTermsPanel({ view }: { readonly view: PoolView }): JSX.Element {
  const terms = view.aggregate.terms;
  return (
    <div className="cm-stack">
      <div className="cm-journey-item">
        <span className="cm-journey-name">Product</span>
        <span className="cm-journey-summary">{productTitleOf(terms.skuRef)} — {terms.skuRef}</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Proposed group price</span>
        <span className="cm-journey-summary">{view.price} / box (vs {view.list} list — buyers save {view.saving} / box)</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Pool</span>
        <span className="cm-journey-summary">{view.units} boxes from {view.studios} consenting studios</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Pool value at the proposed price</span>
        <span className="cm-journey-summary">{view.poolValue} — {view.units} × {view.price}, exact math via the commerce kernel</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Threshold</span>
        <span className="cm-journey-summary">{view.summary}</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Pool closes</span>
        <span className="cm-journey-summary">{view.deadline} (demo clock)</span>
      </div>
    </div>
  );
}

/** Threshold row — kernel-derived threshold state. */
export function PoolThresholdRow({ view }: { readonly view: PoolView }): JSX.Element {
  return (
    <div className="cm-row">
      {view.met ? (
        <span className="cm-chip cm-chip-ok">threshold met</span>
      ) : (
        <span className="cm-chip cm-chip-warn">below threshold — held in review</span>
      )}
      {!view.met ? (
        <span className="cm-env-note">
          a below-threshold pool can be countered or accepted into threshold MONITORING — never auto-committed
        </span>
      ) : null}
    </div>
  );
}

/** Roster — the machine's own interest records, consent terms included. */
export function PoolRoster({ view }: { readonly view: PoolView }): JSX.Element {
  const live = liveGroupBuyInterests(view.interests);
  const withdrawn = view.interests.filter((interest) => interest.state === "WITHDRAWN");
  const excluded = EXCLUDED_STUDIOS[view.poolId];
  const withdrawal = WITHDRAWAL_NOTES[view.poolId];
  return (
    <div className="cm-stack" aria-label="Consenting participants">
      {live.map((interest) => (
        <div key={participantIdOf(interest.participantRef)} className="cm-row">
          <span className="cm-state-item-label">{studioNameOf(participantIdOf(interest.participantRef))}</span>
          <span className="cm-chip cm-chip-ok">consented · {interest.quantity.units} boxes</span>
          <span className="cm-env-note">recorded {clockLabel(interest.recordedAt)}</span>
          <DemoTag />
        </div>
      ))}
      {withdrawn.map((interest) => (
        <div key={`w-${participantIdOf(interest.participantRef)}`} className="cm-row">
          <span className="cm-state-item-label">{studioNameOf(participantIdOf(interest.participantRef))}</span>
          <span className="cm-chip cm-chip-muted">WITHDRAWN before formation</span>
          <span className="cm-env-note">withdrawal recorded {clockLabel(interest.recordedAt)} — honored, never re-enrolled</span>
        </div>
      ))}
      <p className="cm-state-item-detail">
        Only consenting studios are listed — enrollment without consent never happens
        {excluded ? ` (${excluded.note})` : ""}
        . Consent terms are on record per participant (kernel interest records): “
        {live[0] ? live[0].consentTerms : "no live interests"}”.
      </p>
      {withdrawal ? <p className="cm-state-item-detail">{withdrawal.note}</p> : null}
      {MIRROR_NOTES[view.poolId] ? (
        <p className="cm-state-item-detail">{MIRROR_NOTES[view.poolId]}</p>
      ) : null}
    </div>
  );
}

/** The PENDING review decisions (permission-gated; full terms pre-commit). */
export function PendingDecisions({
  host,
  view,
  rejectReason,
  onAccept,
  onCounter,
  onRejectReason,
  onReject,
}: {
  readonly host: CommerceHostServices;
  readonly view: PoolView;
  readonly rejectReason: string | undefined;
  readonly onAccept: () => void;
  readonly onCounter: (option: DemoCounterOption) => void;
  readonly onRejectReason: (reason: string) => void;
  readonly onReject: () => void;
}): JSX.Element {
  const terms = view.aggregate.terms;
  const counterOptions = COUNTER_OPTIONS[view.poolId] ?? [];
  return (
    <PermissionBoundary host={host} permission="groupbuy.review-proposal">
      <div className="cm-stack">
        <p className="cm-card-sub">
          PENDING review — the buyers see &quot;offered, awaiting merchant review&quot; on their
          side (W2&apos;s surface). Accept, counter or reject; each runs as an explicit kernel
          transition of the formation aggregate with the terms shown before it commits.
        </p>
        <ConfirmableAction
          actionLabel={`Accept ${view.poolId} at the proposed terms`}
          confirmLabel="Record the acceptance"
          statement={`Runs your ACCEPTANCE of ${view.poolId} as a REAL transition of the kernel formation aggregate: ${view.poolId} moves PENDING → MONITORING (kernel revision ${view.aggregate.revision + 1}). Terms: ${view.units} boxes of ${productTitleOf(terms.skuRef)} (${terms.skuRef}) at ${view.price} / box (vs ${view.list} list), pool closes ${view.deadline}. The pool is ${view.met ? `at your threshold (${view.summary}) — threshold met; monitoring runs while the participants confirm` : `BELOW your threshold (${view.summary}) — accepting opens threshold MONITORING only; nothing can auto-commit until the pool reaches ${terms.threshold.minimumParticipants} studios / ${terms.threshold.minimumUnits} boxes`}. Formation is a separate explicit step from HELD and never happens automatically; commitments exist only on the commerce planes — this desk creates none.`}
          onExecute={onAccept}
        />
        {counterOptions.length > 0 ? (
          <>
            <p className="cm-card-sub">Counter options (each shows the full terms before sending):</p>
            {counterOptions.map((option) => (
              <CounterOptionAction
                key={option.counterId}
                view={view}
                option={option}
                onSend={() => onCounter(option)}
              />
            ))}
          </>
        ) : null}
        <div className="cm-stack">
          <p className="cm-card-sub">
            Reject with a recorded reason (the buyers see the reason on their side):
          </p>
          {REJECT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className="cm-button"
              aria-pressed={rejectReason === reason}
              onClick={() => onRejectReason(reason)}
            >
              {reason}
            </button>
          ))}
          {rejectReason ? (
            <ConfirmableAction
              actionLabel={`Reject ${view.poolId} — record the reason`}
              confirmLabel="Record the rejection"
              statement={`Runs your REJECTION of ${view.poolId} as a REAL transition of the kernel formation aggregate: ${view.poolId} moves PENDING → REJECTED (kernel revision ${view.aggregate.revision + 1}) with the reason on record: ${rejectReason}. REJECTED is terminal — nothing was ever committed and no participant is affected. The pool can re-propose next round with new terms.`}
              onExecute={onReject}
            />
          ) : null}
        </div>
      </div>
    </PermissionBoundary>
  );
}

function CounterOptionAction({
  view,
  option,
  onSend,
}: {
  readonly view: PoolView;
  readonly option: DemoCounterOption;
  readonly onSend: () => void;
}): JSX.Element {
  const counterPrice = money(option.unitPriceMinor);
  return (
    <ConfirmableAction
      actionLabel={`Counter at ${counterPrice} / box (min ${option.minimumBoxes} boxes)`}
      confirmLabel={`Send the counter — ${counterPrice} / box`}
      statement={`Sends your COUNTER to the ${view.poolId} pool as a REAL transition of the kernel formation aggregate: ${view.poolId} moves PENDING → COUNTERED (kernel revision ${view.aggregate.revision + 1}) with these terms on record. Original ask: ${view.units} boxes at ${view.price} / box. Your counter: ${counterPrice} / box with a ${option.minimumBoxes}-box minimum, pool still closes ${view.deadline} (${option.note}) The studios decide on the buyer side — no simulated buyer response exists on this desk, and nothing commits while you wait.`}
      onExecute={onSend}
    />
  );
}

/** The HELD formation panel (permission-gated; final terms pre-commit). */
export function HeldFormationPanel({
  host,
  view,
  onForm,
}: {
  readonly host: CommerceHostServices;
  readonly view: PoolView;
  readonly onForm: () => void;
}): JSX.Element {
  return (
    <div className="cm-stack">
      <p className="cm-state-item-detail">
        Threshold met ({view.summary}) — the machine moved this pool MONITORING → HELD on its own
        derived THRESHOLD_MET trigger. HELD means the pool waits on YOUR explicit formation step;
        formation never happens automatically, and a HELD pool that honestly falls back below the
        threshold returns to MONITORING (the machine&apos;s own THRESHOLD_LOST).
      </p>
      <PermissionBoundary host={host} permission="groupbuy.review-proposal">
        <ConfirmableAction
          actionLabel={`Form ${view.poolId} — freeze the final terms`}
          confirmLabel="Form the group buy at these terms"
          statement={`Forms ${view.poolId} as a REAL transition of the kernel formation aggregate: ${view.poolId} moves HELD → FORMED (kernel revision ${view.aggregate.revision + 1}), freezing the FINAL terms — group price ${view.price} / box, exact pool value ${view.poolValue} (${view.units} × ${view.price}) — and the roster of the ${view.studios} consenting studios (consenting-only: withdrawn studios stay out, nobody is enrolled by you). Formation is the organizer's second confirmation: it creates NO commitment (commitments exist only on the commerce planes), moves no money, reserves no stock and never overrides buyer consent.`}
          onExecute={onForm}
        />
      </PermissionBoundary>
    </div>
  );
}

/** State-detail panels for the non-pending, non-held lifecycle states. */
export function PoolStateDetail({ view }: { readonly view: PoolView }): JSX.Element {
  const aggregate = view.aggregate;
  const terms = aggregate.terms;
  if (aggregate.state === "MONITORING") {
    return (
      <div className="cm-stack">
        <p className="cm-state-item-detail">
          Kernel state MONITORING (accepted; revision {aggregate.revision}): {view.summary} —{" "}
          {view.met
            ? "threshold met; the pool now waits on every participant's second confirmation path — formation unlocks from HELD via your explicit step"
            : `still below threshold; monitoring continues and nothing can commit until the pool reaches ${terms.threshold.minimumParticipants} studios / ${terms.threshold.minimumUnits} boxes`}
          .
        </p>
        <p className="cm-state-item-detail">
          Buyer-side interests can still arrive (each is a consenting participant&apos;s own act) —
          this desk never simulates a buyer and never overrides buyer consent.
        </p>
      </div>
    );
  }
  if (aggregate.state === "COUNTERED" && aggregate.counterTerms) {
    const counter = aggregate.counterTerms;
    return (
      <div className="cm-stack">
        <p className="cm-state-item-detail">
          Counter terms on record (kernel revision {aggregate.revision}):{" "}
          {fmtMoney(counter.unitPrice)} / box, {counter.minimumUnits}-box minimum — {counter.note}
        </p>
        <p className="cm-state-item-detail">
          Awaiting buyer response — pending is not an error and not an acceptance: the initiator
          may accept the counter on record (ACCEPT_COUNTER, buyer side), decline it, or send a new
          round. No simulated buyer response exists on this desk, and nothing commits while you
          wait.
        </p>
      </div>
    );
  }
  if (aggregate.state === "REJECTED") {
    return (
      <p className="cm-state-item-detail">
        Kernel state REJECTED (revision {aggregate.revision}) — reason on record:{" "}
        {aggregate.rejectionReason}. A rejected proposal ends here; nothing was ever committed. The
        pool can re-propose next round with new terms.
      </p>
    );
  }
  if (aggregate.state === "EXPIRED") {
    return (
      <p className="cm-state-item-detail">
        The pool&apos;s window closed {view.deadline} — before a decision was recorded (kernel
        EXPIRE, revision {aggregate.revision}). EXPIRED is a time fact, not a failure; nothing was
        committed, and no decision is available now. The buyers can open a new round.
      </p>
    );
  }
  if (aggregate.state === "FORMED" && aggregate.formation) {
    const formation = aggregate.formation;
    const roster = aggregate.participants;
    return (
      <div className="cm-stack">
        <div className="cm-row">
          <StatusChip status="FORMED" note="Final terms frozen by the formation machine" />
          <span className="cm-env-note">formed {clockLabel(formation.formedAt)} · kernel revision {aggregate.revision}</span>
        </div>
        <div className="cm-journey-item">
          <span className="cm-journey-name">Final group price</span>
          <span className="cm-journey-summary">{fmtMoney(formation.groupPrice)} / box (frozen)</span>
        </div>
        <div className="cm-journey-item">
          <span className="cm-journey-name">Final pool value</span>
          <span className="cm-journey-summary">
            {fmtMoney(formation.poolValue)} — exact ({formation.poolValue.amountMinor} minor units), computed by the formation machine
          </span>
        </div>
        <div className="cm-journey-item">
          <span className="cm-journey-name">Frozen roster (consenting-only)</span>
          <span className="cm-journey-summary">
            {roster
              .map((share) => `${studioNameOf(participantIdOf(share.participantRef))} · ${share.quantity.units} boxes`)
              .join(" · ")}
          </span>
        </div>
        <p className="cm-state-item-detail">
          Formation froze the final terms and the consenting-only roster. No commitment was created
          — commitments exist only on the commerce planes — and withdrawn studios stay out forever.
        </p>
      </div>
    );
  }
  return <span />;
}
