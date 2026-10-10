/**
 * merchant-groupbuy-review component — the J5 merchant-side surface (lazily
 * loaded).
 *
 * The queue of incoming latent-demand group-buy proposals renders from
 * committed DEMO fixtures (deterministic, resettable). Every merchant
 * decision — accept, counter, reject — is an EXPLICIT act: the full terms,
 * the threshold state and the no-binding-effect statement are shown BEFORE
 * anything commits, and the decision itself lands in LOCAL DEMO STATE only
 * (the commerce kernel has no group-buy aggregate yet; formation happens on
 * the buyer side and is never simulated here). Below-threshold pools are
 * held: they can be countered or accepted into threshold MONITORING, never
 * auto-committed. PENDING, ACCEPTED (monitoring), COUNTERED (awaiting buyer
 * response), REJECTED (with reason) and EXPIRED are all honest states.
 */

import type { JSX } from "react";

import { useState } from "react";
import { multiplyMoneyByInteger, subtractMoney, unwrap } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
} from "../merchant-shared/ui.js";
import {
  DEMO_PROPOSALS,
  GROUPBUY_REVIEW_FIXTURES_ID,
  GROUPBUY_REVIEW_NOW_LABEL,
  REJECT_REASONS,
  clockLabel,
  poolUnitsOf,
  thresholdMet,
  thresholdSummary,
} from "./fixtures.js";
import type { DemoCounterOption, DemoProposal } from "./fixtures.js";

/** One recorded decision (LOCAL DEMO STATE — not the kernel journal). */
interface DecisionLogEntry {
  readonly kind: "ACCEPT" | "COUNTER" | "REJECT";
  readonly proposalId: string;
  readonly detail: string;
  readonly at: string;
}

const STATUS_CHIP: Readonly<Record<DemoProposal["status"], { readonly className: string; readonly label: string }>> = {
  PENDING: { className: "cm-chip cm-chip-warn", label: "PENDING review" },
  ACCEPTED: { className: "cm-chip cm-chip-ok", label: "ACCEPTED — threshold monitoring" },
  COUNTERED: { className: "cm-chip cm-chip-unknown", label: "COUNTERED — awaiting buyer response" },
  REJECTED: { className: "cm-chip cm-chip-warn", label: "REJECTED — with reason" },
  EXPIRED: { className: "cm-chip cm-chip-muted", label: "EXPIRED — window closed" },
};

function money(minor: string): string {
  return fmtMoney(demoMoney(minor));
}

export default function MerchantGroupbuyReviewComponent({ host }: CommerceModuleProps): JSX.Element {
  const [proposals, setProposals] = useState<readonly DemoProposal[]>(DEMO_PROPOSALS);
  const [decisions, setDecisions] = useState<readonly DecisionLogEntry[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Readonly<Record<string, string>>>({});

  const reset = (): void => {
    setProposals(DEMO_PROPOSALS);
    setDecisions([]);
    setRejectReasons({});
  };

  const recordDecision = (
    proposalId: string,
    kind: DecisionLogEntry["kind"],
    detail: string,
    patch: Partial<DemoProposal>,
  ): void => {
    setProposals((current) =>
      current.map((proposal) =>
        proposal.proposalId === proposalId ? { ...proposal, ...patch } : proposal,
      ),
    );
    setDecisions((current) => [
      ...current,
      { kind, proposalId, detail, at: GROUPBUY_REVIEW_NOW_LABEL },
    ]);
  };

  const openCount = proposals.filter((proposal) => proposal.status === "PENDING").length;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J5 · Merchant group-buy review</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Buyer pools propose group deals for things you don&apos;t currently offer as a group
          buy — this is your review desk (fixtures{" "}
          <code>{GROUPBUY_REVIEW_FIXTURES_ID}</code>, demo clock {GROUPBUY_REVIEW_NOW_LABEL}).
          Participant counts vs thresholds, proposed terms and deadlines are visible before any
          decision; accept, counter and reject each show the full terms before they commit. Every
          decision lands in LOCAL DEMO STATE ONLY — no binding effect: it binds neither you nor
          the participants, reserves no stock, moves no money and enrolls nobody. The buyer side
          of this same synthetic scenario space is W2-012&apos;s surface (buyer-groupbuy,{" "}
          <code>w2ld-</code> fixtures) — mirrored read-only for coherence, never edited here.
        </p>
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={reset}>
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live buyers or pools
          </span>
        </div>
      </section>

      <section aria-label="Incoming proposals">
        <h2 className="cm-section-title">Incoming latent-demand proposals ({openCount} awaiting review)</h2>
        <div className="cm-stack">
          {proposals.map((proposal) => {
            const units = poolUnitsOf(proposal);
            const met = thresholdMet(proposal);
            const summary = thresholdSummary(proposal);
            const price = money(proposal.unitPriceMinor);
            const list = money(proposal.listPriceMinor);
            const saving = fmtMoney(
              unwrap(
                subtractMoney(demoMoney(proposal.listPriceMinor), demoMoney(proposal.unitPriceMinor)),
              ),
            );
            const poolValue = fmtMoney(multiplyMoneyByInteger(demoMoney(proposal.unitPriceMinor), units));
            const deadline = clockLabel(proposal.deadlineIso);
            const chip = STATUS_CHIP[proposal.status];
            const rejectReason = rejectReasons[proposal.proposalId];
            return (
              <div key={proposal.proposalId} className="cm-state-item" data-proposal-id={proposal.proposalId}>
                <div className="cm-row">
                  <span className="cm-state-item-label">{proposal.proposalId}</span>
                  <span className={chip.className} data-status={proposal.status}>{chip.label}</span>
                  <span className="cm-env-note">on your desk since {proposal.openedAtLabel}</span>
                  <DemoTag />
                </div>

                <div className="cm-stack">
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Product</span>
                    <span className="cm-journey-summary">{proposal.productTitle} — {proposal.productSkuId}</span>
                  </div>
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Proposed group price</span>
                    <span className="cm-journey-summary">{price} / box (vs {list} list — buyers save {saving} / box)</span>
                  </div>
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Pool</span>
                    <span className="cm-journey-summary">{units} boxes from {proposal.participants.length} consenting studios</span>
                  </div>
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Pool value at the proposed price</span>
                    <span className="cm-journey-summary">{poolValue} — {units} × {price}, exact math via the commerce runtime</span>
                  </div>
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Threshold</span>
                    <span className="cm-journey-summary">{summary}</span>
                  </div>
                  <div className="cm-journey-item">
                    <span className="cm-journey-name">Pool closes</span>
                    <span className="cm-journey-summary">{deadline} (demo clock)</span>
                  </div>
                </div>

                <div className="cm-row">
                  {met ? (
                    <span className="cm-chip cm-chip-ok">threshold met</span>
                  ) : (
                    <span className="cm-chip cm-chip-warn">below threshold — held in review</span>
                  )}
                  {!met ? (
                    <span className="cm-env-note">
                      a below-threshold pool can be countered or accepted into threshold MONITORING — never auto-committed
                    </span>
                  ) : null}
                </div>

                <div className="cm-stack" aria-label="Consenting participants">
                  {proposal.participants.map((participant) => (
                    <div key={participant.name} className="cm-row">
                      <span className="cm-state-item-label">{participant.name}</span>
                      <span className="cm-chip cm-chip-ok">consented · {participant.units} boxes</span>
                      <DemoTag />
                    </div>
                  ))}
                  <p className="cm-state-item-detail">
                    Only consenting studios are listed — enrollment without consent never happens
                    {proposal.excludedStudio
                      ? ` (${proposal.excludedStudio} declined to join this pool and was excluded when it formed)`
                      : ""}
                    .
                  </p>
                </div>

                {proposal.mirrorNote ? (
                  <p className="cm-state-item-detail">{proposal.mirrorNote}</p>
                ) : null}

                {proposal.status === "PENDING" ? (
                  <PermissionBoundary host={host} permission="groupbuy.review-proposal">
                    <div className="cm-stack">
                      <p className="cm-card-sub">
                        PENDING review — the buyers see &quot;offered, awaiting merchant review&quot;
                        on their side (W2&apos;s surface). Accept, counter or reject; each is an
                        explicit decision with the terms shown before it commits.
                      </p>
                      <ConfirmableAction
                        actionLabel={`Accept ${proposal.proposalId} at the proposed terms`}
                        confirmLabel="Record the acceptance"
                        statement={`Records your ACCEPTANCE of ${proposal.proposalId} in LOCAL DEMO STATE ONLY — no binding effect: it binds neither you nor the studios, reserves no stock, moves no money and enrolls nobody. Terms: ${units} boxes of ${proposal.productTitle} (${proposal.productSkuId}) at ${price} / box (vs ${list} list), pool closes ${deadline}. The pool is ${met ? `at your threshold (${summary}) — threshold met; monitoring runs while the participants confirm` : `BELOW your threshold (${summary}) — accepting opens threshold MONITORING only; nothing can auto-commit until the pool reaches ${proposal.thresholdStudios} studios / ${proposal.thresholdBoxes} boxes`}. Formation happens only on the buyer side, after every participant confirms a second time — this host never simulates it.`}
                        onExecute={() => {
                          recordDecision(
                            proposal.proposalId,
                            "ACCEPT",
                            `at ${price} / box — ${met ? "threshold met" : "below threshold, monitoring"}`,
                            { status: "ACCEPTED", acceptedAtLabel: GROUPBUY_REVIEW_NOW_LABEL },
                          );
                        }}
                      />
                      <p className="cm-card-sub">Counter options (each shows the full terms before sending):</p>
                      {proposal.counterOptions.map((option) => (
                        <CounterOptionAction
                          key={option.counterId}
                          proposal={proposal}
                          option={option}
                          onSend={() => {
                            recordDecision(
                              proposal.proposalId,
                              "COUNTER",
                              `counter ${money(option.unitPriceMinor)} / box (min ${option.minimumBoxes})`,
                              {
                                status: "COUNTERED",
                                counteredWith: option,
                                counteredAtLabel: GROUPBUY_REVIEW_NOW_LABEL,
                              },
                            );
                          }}
                        />
                      ))}
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
                            onClick={() =>
                              setRejectReasons((current) => ({
                                ...current,
                                [proposal.proposalId]: reason,
                              }))
                            }
                          >
                            {reason}
                          </button>
                        ))}
                        {rejectReason ? (
                          <ConfirmableAction
                            actionLabel={`Reject ${proposal.proposalId} — record the reason`}
                            confirmLabel="Record the rejection"
                            statement={`Records your REJECTION of ${proposal.proposalId} with the reason: ${rejectReason} — in LOCAL DEMO STATE ONLY, no binding effect. The proposal ends REJECTED; nothing was ever committed and no participant is affected. The pool can re-propose next round with new terms.`}
                            onExecute={() => {
                              recordDecision(
                                proposal.proposalId,
                                "REJECT",
                                `reason: ${rejectReason}`,
                                {
                                  status: "REJECTED",
                                  rejectedReason: rejectReason,
                                  rejectedAtLabel: GROUPBUY_REVIEW_NOW_LABEL,
                                },
                              );
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </PermissionBoundary>
                ) : null}

                {proposal.status === "ACCEPTED" ? (
                  <div className="cm-stack">
                    <p className="cm-state-item-detail">
                      Accepted {proposal.acceptedAtLabel} (local demo state). Monitoring: {summary} —{" "}
                      {met
                        ? "threshold met; the pool now waits on every participant's second confirmation on the buyer side"
                        : `still below threshold; monitoring continues and nothing can commit until the pool reaches ${proposal.thresholdStudios} studios / ${proposal.thresholdBoxes} boxes`}
                      .
                    </p>
                    <p className="cm-state-item-detail">
                      Formation itself is a buyer-side event this host never simulates — no
                      binding effect, nothing reserved, nobody enrolled.
                    </p>
                  </div>
                ) : null}

                {proposal.status === "COUNTERED" && proposal.counteredWith ? (
                  <div className="cm-stack">
                    <p className="cm-state-item-detail">
                      Counter terms: {money(proposal.counteredWith.unitPriceMinor)} / box,{" "}
                      {proposal.counteredWith.minimumBoxes}-box minimum (sent{" "}
                      {proposal.counteredAtLabel}, local demo state).
                    </p>
                    <p className="cm-state-item-detail">
                      Awaiting buyer response — pending is not an error and not an acceptance: the
                      studios may accept the counter, decline it, or send a new round. No simulated
                      buyer response exists in this host, and nothing commits while you wait.
                    </p>
                  </div>
                ) : null}

                {proposal.status === "REJECTED" ? (
                  <p className="cm-state-item-detail">
                    Rejected {proposal.rejectedAtLabel} (local demo state) — reason:{" "}
                    {proposal.rejectedReason}. A rejected proposal ends here; nothing was ever
                    committed. The pool can re-propose next round with new terms.
                  </p>
                ) : null}

                {proposal.status === "EXPIRED" ? (
                  <p className="cm-state-item-detail">
                    The pool&apos;s window closed {deadline} — before a decision was recorded.
                    EXPIRED is a time fact, not a failure; nothing was committed, and no decision
                    is available now. The buyers can open a new round.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Decision log">
        <h2 className="cm-section-title">Decision log (local demo state — not the kernel journal)</h2>
        {decisions.length === 0 ? (
          <p className="cm-card-sub">
            No decisions recorded yet — the queue above is exactly the committed fixtures.
          </p>
        ) : (
          <ul className="cm-perm-list" data-testid="cm-decision-log">
            {decisions
              .slice()
              .reverse()
              .map((entry, index) => (
                <li key={`${entry.proposalId}-${entry.kind}-${index}`}>
                  <code>{entry.kind}</code> · {entry.proposalId} · {entry.detail} · {entry.at}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="cm-card" aria-label="Boundaries">
        <h2 className="cm-card-title">What this surface will never do</h2>
        <p className="cm-card-sub">
          No binding effect: every accept / counter / reject is a local demo record. The
          deterministic commerce kernel has no group-buy aggregate yet (recorded as a lane
          blocker), formation happens on the buyer side and is never simulated here, and no
          participant, merchant or stock position is ever enrolled, charged, reserved or committed
          by anything on this surface.
        </p>
      </section>
    </div>
  );
}

function CounterOptionAction({
  proposal,
  option,
  onSend,
}: {
  readonly proposal: DemoProposal;
  readonly option: DemoCounterOption;
  readonly onSend: () => void;
}): JSX.Element {
  const counterPrice = money(option.unitPriceMinor);
  return (
    <ConfirmableAction
      actionLabel={`Counter at ${counterPrice} / box (min ${option.minimumBoxes} boxes)`}
      confirmLabel={`Send the counter — ${counterPrice} / box`}
      statement={`Sends your COUNTER to the ${proposal.proposalId} pool in LOCAL DEMO STATE ONLY — no binding effect. Original ask: ${poolUnitsOf(proposal)} boxes at ${money(proposal.unitPriceMinor)} / box. Your counter: ${counterPrice} / box with a ${option.minimumBoxes}-box minimum, pool still closes ${clockLabel(proposal.deadlineIso)} (${option.note}) The proposal moves to COUNTERED and the studios decide — no simulated buyer response exists here; nothing commits while you wait.`}
      onExecute={onSend}
    />
  );
}
