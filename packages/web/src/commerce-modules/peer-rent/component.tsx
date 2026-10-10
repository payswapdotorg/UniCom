/**
 * peer-rent component — the J6 surface (lazily loaded). Offers render with
 * the full J6 term set; the live-rental panel advances a REAL
 * RentalAgreement through the commerce runtime state machine with exact
 * deposit math from depositReturn.
 */
import type { JSX } from "react";

import { useState } from "react";
import { advanceRental, depositReturn } from "@unicom/commerce";
import type { ItemCondition, RentalAgreement, RentalState, RentalTrigger } from "@unicom/commerce";
import { classifyFreshness, demoRef, moneyText, utc, usdMinor } from "../buyer-support/demo-data.js";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DemoTag, FreshnessChip, TermLine } from "../buyer-support/ui.js";
import { RentalFlowPanel } from "./rental-flow.js";

/** One committed demo rental offer (all values synthetic, DEMO-labelled). */
export interface DemoRentalOffer {
  readonly id: string;
  readonly item: string;
  readonly owner: string;
  readonly condition: ItemCondition;
  readonly ratePerWeek: string;
  readonly depositMinor: string;
  readonly availabilityFrom: ReturnType<typeof utc>;
  readonly availabilityNote: string;
  readonly checkedAt: ReturnType<typeof utc>;
  readonly returnTerms: string;
  readonly damagePolicy: string;
  readonly recourse: string;
}

export const DEMO_RENTAL_OFFERS: readonly DemoRentalOffer[] = [
  {
    id: "w2r-01",
    item: "Wide-format A1 printer (borrow-adjacent: includes 2 ink sets)",
    owner: "Meridian Office Supply (equipment desk)",
    condition: "LIKE_NEW",
    ratePerWeek: "95.00 USD / week",
    depositMinor: "48000",
    availabilityFrom: utc("2026-10-14T00:00:00Z"),
    availabilityNote: "Available from Oct 14 for 2–6 weeks (owner calendar, demo).",
    checkedAt: utc("2026-10-12T08:45:00Z"),
    returnTerms: "Return by the agreed end date, packaged as received; late returns become OVERDUE (a preserved state) and the weekly rate keeps accruing.",
    damagePolicy: "Fair wear is covered; damage beyond wear is settled from the deposit with an itemized deduction you can dispute.",
    recourse: "Disputes go to the support lane's recourse flow (trust & safety surfaces); demo mode never moves money.",
  },
  {
    id: "w2r-02",
    item: "Studio paper cutter (heavy duty)",
    owner: "Two Harbors Design (peer studio)",
    condition: "GOOD",
    ratePerWeek: "28.00 USD / week",
    depositMinor: "6000",
    availabilityFrom: utc("2026-10-18T00:00:00Z"),
    availabilityNote: "Available Oct 18 onward for 1–4 weeks (peer calendar, demo).",
    checkedAt: utc("2026-10-10T13:20:00Z"),
    returnTerms: "Return in person at the studio; the peer checks condition with you present.",
    damagePolicy: "Wear deduction agreed up front at 500 bps of the deposit for blade wear; anything above is itemized.",
    recourse: "Peer-to-peer: mediated by the trust lane's dispute flow if condition disagrees.",
  },
  {
    id: "w2r-03",
    item: "Photography light kit (3 heads + stands)",
    owner: "Northlight Atelier (peer studio)",
    condition: "FAIR",
    ratePerWeek: "18.00 USD / week",
    depositMinor: "9000",
    availabilityFrom: utc("2026-10-13T00:00:00Z"),
    availabilityNote: "Availability UNKNOWN — the atelier has not confirmed the return of a prior borrower (feed unanswered).",
    checkedAt: utc("2026-10-11T18:00:00Z"),
    returnTerms: "Return terms UNKNOWN until the owner confirms availability.",
    damagePolicy: "Damage policy UNKNOWN — do not treat silence as 'no deposit kept'.",
    recourse: "No recourse terms exist yet; this offer cannot be requested until the owner answers.",
  },
];

const BUY_PRICE_PRINTER = usdMinor("240000");

export default function PeerRentComponent({ host }: CommerceModuleProps): JSX.Element {
  const [selected, setSelected] = useState<string>(DEMO_RENTAL_OFFERS[0]!.id);
  const offer = DEMO_RENTAL_OFFERS.find((candidate) => candidate.id === selected) ?? DEMO_RENTAL_OFFERS[0]!;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J6 · Rent or borrow vs buy</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          For gear you use occasionally, renting keeps cash free. Every offer below shows its
          duration terms, availability (with freshness), deposit, condition, return, damage and
          recourse terms BEFORE you request anything. The rental lifecycle panel runs on the
          deterministic commerce runtime (rentalTransition / depositReturn) — exact money, preserved
          states (OVERDUE is not a failure).
        </p>
        <TermLine
          label="Buy-vs-rent reference (the printer)"
          value={`buying costs ${moneyText(BUY_PRICE_PRINTER)} once; renting at 95.00 USD/week breaks even after 25 weeks — you print twice a month (demo arithmetic).`}
        />
      </section>

      <section aria-label="Rental offers">
        <h2 className="cm-section-title">Rental &amp; borrow offers</h2>
        <div className="cm-stack">
          {DEMO_RENTAL_OFFERS.map((candidate) => {
            const availabilityFreshness = candidate.id === "w2r-03" ? "unknown" : classifyFreshness(candidate.checkedAt, 60 * 24);
            return (
              <div key={candidate.id} className="cm-card" data-testid={`cm-rental-${candidate.id}`}>
                <div className="cm-row">
                  <h3 className="cm-card-title">{candidate.item}</h3>
                  <DemoTag />
                  {selected === candidate.id ? <span className="cm-chip cm-chip-ok">selected</span> : null}
                </div>
                <TermLine label="Owner" value={candidate.owner} />
                <TermLine label="Condition" value={candidate.condition} />
                <TermLine label="Rate" value={candidate.ratePerWeek} />
                <TermLine label="Deposit" value={moneyText(usdMinor(candidate.depositMinor))} />
                <TermLine label="Availability" value={`${candidate.availabilityNote} (from ${candidate.availabilityFrom})`} />
                <div className="cm-row" style={{ marginTop: 4 }}>
                  <FreshnessChip
                    freshness={availabilityFreshness}
                    checkedAt={candidate.checkedAt}
                    ageLabel={null}
                  />
                </div>
                <TermLine label="Return" value={candidate.returnTerms} />
                <TermLine label="Damage policy" value={candidate.damagePolicy} />
                <TermLine label="Recourse" value={candidate.recourse} />
                {candidate.id === "w2r-03" ? (
                  <p className="cm-blocked-reason" style={{ marginTop: 8 }}>
                    Blocked: availability is UNKNOWN (the owner has not answered). Requesting a
                    rental against an unknown calendar would fake a live outcome — pick another
                    offer or wait for the owner&apos;s answer.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="cm-button"
                    style={{ marginTop: 8 }}
                    onClick={() => setSelected(candidate.id)}
                  >
                    {selected === candidate.id ? "Selected for the flow below" : "Select this offer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <RentalFlowPanel offer={offer} host={host} />
    </div>
  );
}

/** Build a real RentalAgreement fixture for the selected offer (runtime-fed). */
export function demoRentalAgreement(offer: DemoRentalOffer): RentalAgreement {
  return {
    rentalAgreementId: demoRef<RentalAgreement["rentalAgreementId"]>(`w2r-agreement-${offer.id}`),
    itemSkuRef: demoRef<RentalAgreement["itemSkuRef"]>(`demo-sku/${offer.id}`),
    renterRef: demoRef<RentalAgreement["renterRef"]>("demo-principal/harbor-lane"),
    period: { startsAt: offer.availabilityFrom, endsAt: utc("2026-10-28T00:00:00Z") },
    ratePerPeriod: usdMinor(offer.id === "w2r-01" ? "9500" : offer.id === "w2r-02" ? "2800" : "1800"),
    deposit: usdMinor(offer.depositMinor),
    state: "REQUESTED",
    revision: 1,
  };
}

/** Advance the real rental state machine (used by the flow panel + tests). */
export function advanceDemoRental(
  agreement: RentalAgreement,
  trigger: RentalTrigger,
): { readonly ok: true; readonly agreement: RentalAgreement } | { readonly ok: false; readonly error: string; readonly state: RentalState } {
  const next = advanceRental(agreement, trigger);
  if (!next.ok) {
    return {
      ok: false,
      error: `INVALID_RENTAL_TRANSITION from ${next.error.from} on ${next.error.trigger}`,
      state: agreement.state,
    };
  }
  return { ok: true, agreement: next.value };
}

/** Real deposit settlement math (wear bps → refunded/withheld, exact). */
export function settleDeposit(
  agreement: RentalAgreement,
  wearDeductionBps: number,
): { readonly refunded: string; readonly withheld: string } | { readonly error: string } {
  const result = depositReturn(agreement, wearDeductionBps, "HALF_UP");
  if (!result.ok) return { error: `invalid deduction bps: ${result.error.bps}` };
  return { refunded: moneyText(result.value.refunded), withheld: moneyText(result.value.withheld) };
}
