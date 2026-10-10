/**
 * The J6 rental lifecycle panel: a REAL RentalAgreement advances through the
 * commerce runtime state machine (REQUESTED → ACTIVE → [OVERDUE] → RETURNED
 * → COMPLETED, or CANCELLED) with an explicit gate before the rental
 * request, and exact deposit settlement via depositReturn at return time.
 * Every advance is a demo control that mutates only local state.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { RentalAgreement } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { CommitmentGate, DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { advanceDemoRental, demoRentalAgreement, settleDeposit } from "./component.js";
import type { DemoRentalOffer } from "./component.js";

type Wear = "none" | "fair-wear" | "damage";

const WEAR_BPS: Readonly<Record<Wear, number>> = { none: 0, "fair-wear": 500, damage: 2500 };
const WEAR_LABEL: Readonly<Record<Wear, string>> = {
  none: "no wear — full deposit back",
  "fair-wear": "fair wear — 500 bps deduction (agreed in the offer's damage policy)",
  damage: "damage beyond wear — 2500 bps itemized deduction (disputable via recourse)",
};

export function RentalFlowPanel({
  offer,
  host,
}: {
  readonly offer: DemoRentalOffer;
  readonly host: CommerceModuleProps["host"];
}): JSX.Element {
  const [agreement, setAgreement] = useState<RentalAgreement | null>(null);
  const [gateOpen, setGateOpen] = useState<boolean>(false);
  const [wear, setWear] = useState<Wear>("none");
  const [error, setError] = useState<string | null>(null);

  const permission = "rental.request" as const;
  return (
    <PermissionGate host={host} permission={permission}>
      <section className="cm-card" aria-label="Rental lifecycle" data-testid="cm-rental-flow">
      <div className="cm-row">
        <h2 className="cm-card-title">Rental lifecycle — {offer.item}</h2>
        <DemoTag />
        {agreement ? (
          <span className={agreement.state === "OVERDUE" ? "cm-chip cm-chip-warn" : "cm-chip cm-chip-muted"}>
            {agreement.state}
          </span>
        ) : null}
      </div>
      <p className="cm-card-sub">
        This panel advances a REAL rental agreement through the deterministic commerce state
        machine. The states are the runtime&apos;s own (REQUESTED, ACTIVE, OVERDUE, RETURNED,
        COMPLETED, CANCELLED); OVERDUE is a preserved state — never a failure. Nothing here reaches
        a canonical ledger: demo controls only.
      </p>

      {error ? <p className="cm-blocked-reason">{error}</p> : null}

      {agreement === null ? (
        gateOpen ? (
          <CommitmentGate
            title="Authorize the rental request (terms, consequence, evidence)"
            terms={[
              { label: "Item & owner", value: `${offer.item} — ${offer.owner}` },
              { label: "Condition at handover", value: offer.condition },
              { label: "Period", value: `${offer.availabilityFrom} → 2026-10-28 (2 weeks)` },
              { label: "Rate", value: offer.ratePerWeek },
              { label: "Deposit (held, returned on timely return minus wear)", value: moneyText(usdMinor(offer.depositMinor)) },
              { label: "Return terms", value: offer.returnTerms },
              { label: "Damage policy", value: offer.damagePolicy },
              { label: "Recourse", value: offer.recourse },
            ]}
            consequence="The owner sees your request; they may start the rental (deposit terms apply). You may cancel while the request is pending. In demo mode no deposit is ever actually held — the settlement math below is the runtime's real arithmetic."
            evidence={["Offer terms above (committed demo fixtures)", "The commerce runtime's rental state machine (deterministic)"]}
            confirmLabel="Request this rental"
            onConfirm={() => {
              setAgreement(demoRentalAgreement(offer));
              setGateOpen(false);
              setError(null);
            }}
            onCancel={() => setGateOpen(false)}
          />
        ) : (
          <button type="button" className="cm-button cm-button-primary" onClick={() => setGateOpen(true)}>
            Request this rental (with authorization)
          </button>
        )
      ) : (
        <RentalSteps
          agreement={agreement}
          wear={wear}
          onWear={(next) => setWear(next)}
          onTrigger={(trigger) => {
            const next = advanceDemoRental(agreement, trigger);
            if (!next.ok) {
              setError(`Honest rejection from the runtime: ${next.error} — the current state stays ${next.state}.`);
              return;
            }
            setError(null);
            setAgreement(next.agreement);
          }}
          onReset={() => {
            setAgreement(null);
            setWear("none");
            setError(null);
          }}
        />
      )}
    </section>
    </PermissionGate>
  );
}

function RentalSteps({
  agreement,
  wear,
  onWear,
  onTrigger,
  onReset,
}: {
  readonly agreement: RentalAgreement;
  readonly wear: Wear;
  readonly onWear: (wear: Wear) => void;
  readonly onTrigger: (trigger: "START" | "MARK_OVERDUE" | "RETURN" | "COMPLETE" | "CANCEL") => void;
  readonly onReset: () => void;
}): JSX.Element {
  const settlement = agreement.state === "RETURNED" || agreement.state === "COMPLETED" ? settleDeposit(agreement, WEAR_BPS[wear]) : null;
  return (
    <div className="cm-stack" style={{ marginTop: 8 }}>
      <TermLine label="Agreement" value={`${agreement.rentalAgreementId} · revision ${agreement.revision} (runtime-tracked)`} />
      <TermLine label="State" value={`${agreement.state} — ${agreement.state === "OVERDUE" ? "OVERDUE is a preserved state, not a failure; the weekly rate keeps accruing" : "the runtime's own state"}`} />
      <TermLine label="Rate / deposit" value={`${moneyText(agreement.ratePerPeriod)} per period · deposit ${moneyText(agreement.deposit)}`} />

      {agreement.state === "REQUESTED" ? (
        <>
          <button type="button" className="cm-button" onClick={() => onTrigger("START")}>
            Owner starts the rental (demo advance)
          </button>
          <button type="button" className="cm-button" onClick={() => onTrigger("CANCEL")}>
            Cancel my request (runtime CANCEL)
          </button>
        </>
      ) : null}
      {agreement.state === "ACTIVE" ? (
        <>
          <button type="button" className="cm-button" onClick={() => onTrigger("MARK_OVERDUE")}>
            Simulate a late return (runtime MARK_OVERDUE)
          </button>
          <button type="button" className="cm-button" onClick={() => onTrigger("RETURN")}>
            Mark returned on time (runtime RETURN)
          </button>
        </>
      ) : null}
      {agreement.state === "OVERDUE" ? (
        <button type="button" className="cm-button" onClick={() => onTrigger("RETURN")}>
          Return the item now, late (runtime RETURN from OVERDUE)
        </button>
      ) : null}
      {agreement.state === "RETURNED" || agreement.state === "COMPLETED" ? (
        <>
          <div className="cm-row">
            {(Object.keys(WEAR_BPS) as Wear[]).map((option) => (
              <label key={option} className="cm-row" style={{ gap: 4, fontSize: 12.5 }}>
                <input
                  type="radio"
                  name="rental-wear"
                  aria-label={`Wear outcome ${WEAR_LABEL[option]}`}
                  checked={wear === option}
                  onChange={() => onWear(option)}
                />
                <span>{WEAR_LABEL[option]}</span>
              </label>
            ))}
          </div>
          {settlement && "refunded" in settlement ? (
            <div className="cm-state-item" data-testid="cm-deposit-settlement">
              <div className="cm-row">
                <span className="cm-state-item-label">Deposit settlement (depositReturn, exact math)</span>
                <DemoTag />
              </div>
              <TermLine label="Wear deduction" value={`${WEAR_BPS[wear]} bps — ${WEAR_LABEL[wear]}`} />
              <TermLine label="Refunded to you" value={settlement.refunded} />
              <TermLine label="Withheld by the owner" value={settlement.withheld} />
              <TermLine label="Dispute path" value="You can dispute an itemized withholding via the trust lane's recourse surface — not wired in demo mode." />
            </div>
          ) : settlement && "error" in settlement ? (
            <p className="cm-blocked-reason">{settlement.error}</p>
          ) : null}
          {agreement.state === "RETURNED" ? (
            <button type="button" className="cm-button" onClick={() => onTrigger("COMPLETE")}>
              Complete the rental (runtime COMPLETE)
            </button>
          ) : null}
        </>
      ) : null}

      <button type="button" className="cm-button" onClick={onReset}>
        Reset the demo agreement
      </button>
    </div>
  );
}
