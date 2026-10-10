/**
 * J3 substitution panel: when the exact item is scarce or pricey, a similar
 * item may serve the need. Substitutes render with fit, trade-offs and a
 * verified/stale freshness chip (J2 vocabulary), and choosing one is an
 * intent change — never an order.
 */
import type { JSX } from "react";

import { useState } from "react";
import { multiplyMoneyByInteger, subtractMoney } from "@unicom/commerce";
import type { Money } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { classifyFreshness, moneyText, utc, usdMinor } from "../buyer-support/demo-data.js";
import { DemoTag, FreshnessChip, TermLine } from "../buyer-support/ui.js";

interface SubstituteOption {
  readonly id: string;
  readonly label: string;
  readonly unitPrice: Money;
  readonly checkedAt: ReturnType<typeof utc>;
  readonly fits: string;
  readonly doesNotFit: string;
  readonly tradeoff: string;
}

const SUBSTITUTES: readonly SubstituteOption[] = [
  {
    id: "w2j3-sub-a2",
    label: "A2 recycled card (same mill, 420 × 594 mm)",
    unitPrice: usdMinor("980"),
    checkedAt: utc("2026-10-12T08:50:00Z"),
    fits: "Two of your three print jobs (the poster series tolerates 5 mm shorter sheets).",
    doesNotFit: "The gallery-proof job needs exact A3 size.",
    tradeoff: "24 of 40 boxes could become A2: a 16-box A3 + 24-box A2 blend.",
  },
  {
    id: "w2j3-sub-brand",
    label: "Off-brand A3 card (other mill)",
    unitPrice: usdMinor("1125"),
    checkedAt: utc("2026-10-10T09:10:00Z"),
    fits: "All three jobs by size and weight class.",
    doesNotFit: "Color reproduction differs slightly between mills — your ICC profile is tuned to the current mill.",
    tradeoff: "Cheaper per box, but you would re-profile color (about an afternoon of work).",
  },
];

const BASELINE_40: Money = multiplyMoneyByInteger(usdMinor("1275"), 40);

export function SubstitutionPanel({ host }: { readonly host: CommerceModuleProps["host"] }): JSX.Element {
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  return (
    <section className="cm-card" aria-label="Substitution path">
      <div className="cm-row">
        <h2 className="cm-card-title">Substitution — a similar item may serve the need</h2>
        <DemoTag />
      </div>
      <p className="cm-card-sub">
        Your intent allowed alternatives (“similar models fine”). Each candidate carries fit,
        non-fit and a freshness chip. Marking one “under consideration” changes only THIS surface —
        it never orders, reserves or re-prices anything.
      </p>
      <div className="cm-stack" style={{ marginTop: 8 }}>
        {SUBSTITUTES.map((option) => {
          const blend40: Money = multiplyMoneyByInteger(option.unitPrice, 40);
          const savingResult = subtractMoney(BASELINE_40, blend40);
          const savingText = savingResult.ok ? moneyText(savingResult.value) : "not computable (currency mismatch)";
          return (
            <div key={option.id} className="cm-state-item" data-testid={`cm-substitute-${option.id}`}>
              <div className="cm-row">
                <span className="cm-state-item-label">{option.label}</span>
                <FreshnessChip
                  freshness={classifyFreshness(option.checkedAt, 30)}
                  checkedAt={option.checkedAt}
                  ageLabel={null}
                />
                <DemoTag />
              </div>
              <TermLine label="Unit price (verified feed)" value={`${moneyText(option.unitPrice)} per box`} />
              <TermLine label="If all 40 boxes switched" value={`${moneyText(blend40)} — ${savingText} vs the verified A3 offer`} />
              <TermLine label="Fits" value={option.fits} />
              <TermLine label="Does not fit" value={option.doesNotFit} />
              <TermLine label="Trade-off" value={option.tradeoff} />
              <button
                type="button"
                className="cm-button"
                style={{ marginTop: 8 }}
                onClick={() => setChosen((prior) => ({ ...prior, [option.id]: !prior[option.id] }))}
              >
                {chosen[option.id] ? "Remove from consideration" : "Mark as under consideration"}
              </button>
              {chosen[option.id] ? (
                <p className="cm-state-item-detail">
                  Noted on this screen only. Next step when you are ready: re-run the comparison with
                  this mix on <button type="button" className="cm-button" style={{ display: "inline" }} onClick={() => host.navigate("/commerce/buyer/compare")}>Compare offers</button>.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
