/**
 * buyer-twin component — the J14 Commerce Twin what-if surface. The Twin
 * runs counterfactuals ONLY: every number it produces wears a PREDICTIVE
 * chip and the write-block panel states the structural truth — there is no
 * path from this screen to any canonical commerce command (predictions
 * never mutate canonical truth). Canonical facts are shown side-by-side
 * with OPERATIONAL chips for the contrast the law demands.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import {
  CANONICAL_FACTS,
  DEMAND_OPTIONS,
  SHIFT_OPTIONS,
  runInkWhatIf,
  runRentVsOwn,
} from "./twin-data.js";

const RENT_WEEK_OPTIONS = [4, 12, 26] as const;

export default function BuyerTwinComponent({ host }: CommerceModuleProps): JSX.Element {
  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J14 · Commerce Twin — what-if</h1>
          <DemoTag />
          <span className="cm-chip cm-chip-unknown">PREDICTIVE — never canonical</span>
        </div>
        <p className="cm-card-sub">
          The Commerce Twin tests decisions on a safe copy of your situation. Everything it
          produces is a <strong>forecast</strong>: deterministic arithmetic over committed demo
          facts, labelled predictive on every panel. Forecasts from the advisory runtime
          (computeDemandForecast) are never auto-applied — and this surface has{" "}
          <strong>no path that writes commerce facts</strong>: no order, price change, listing or
          commitment can be created from here.
        </p>
      </section>

      <PermissionGate host={host} permission="twin.run-what-if">
        <InkWhatIf />
        <RentVsOwnWhatIf />
        <WriteBlockPanel />
      </PermissionGate>
    </div>
  );
}

function InkWhatIf(): JSX.Element {
  const [shift, setShift] = useState(SHIFT_OPTIONS[2]!);
  const [demand, setDemand] = useState(DEMAND_OPTIONS[0]!);
  const [newSku, setNewSku] = useState(false);
  const result = runInkWhatIf({
    shareBps: shift.shareBps,
    multiplier: demand.multiplier,
    newSkuNoHistory: newSku,
  });
  return (
    <section className="cm-card" aria-label="Ink purchasing counterfactual" data-testid="cm-twin-ink">
      <div className="cm-row">
        <h2 className="cm-card-title">What-if · shift ink purchasing to the co-op pool</h2>
        <DemoTag />
        <span className="cm-chip cm-chip-unknown">PREDICTIVE — never canonical</span>
      </div>
      <div className="cm-row" style={{ gap: 10, marginTop: 6 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5 }}>
          <span>Purchasing shift</span>
          <select
            aria-label="Purchasing shift"
            value={shift.id}
            onChange={(event) => setShift(SHIFT_OPTIONS.find((option) => option.id === event.target.value) ?? shift)}
          >
            {SHIFT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5 }}>
          <span>Demand scenario</span>
          <select
            aria-label="Demand scenario"
            value={demand.id}
            onChange={(event) => setDemand(DEMAND_OPTIONS.find((option) => option.id === event.target.value) ?? demand)}
          >
            {DEMAND_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 4, fontSize: 12.5, alignItems: "center" }}>
          <input
            type="checkbox"
            aria-label="Model a brand-new SKU with no purchase history"
            checked={newSku}
            onChange={(event) => setNewSku(event.target.checked)}
          />
          <span>Brand-new SKU (no history)</span>
        </label>
      </div>

      <div className="cm-state-item" style={{ marginTop: 10 }} data-testid="cm-twin-ink-result">
        <div className="cm-row">
          <span className="cm-state-item-label">Counterfactual result</span>
          <span className="cm-chip cm-chip-unknown">PREDICTIVE — never canonical</span>
        </div>
        {result.kind === "OBSERVED" ? (
          <>
            <TermLine label="Forecast basis" value={`SIMPLE_MOVING_AVERAGE (4-week window) over your committed demo history, scaled by the demand scenario — computed by the commerce runtime's advisory forecasting (pure function).`} />
            <TermLine label="Projected demand" value={`${result.weeklyUnits} sets/week (${result.units4w} per 4 weeks)`} />
            <TermLine label="Blended price per set in the what-if" value={moneyText(result.blendedPerSet)} />
            <TermLine label="Current-plan spend (4 weeks)" value={`${moneyText(result.currentSpend4w)} — OPERATIONAL fact: the verified list price times the same projected units`} />
            <TermLine label="What-if spend (4 weeks)" value={`${moneyText(result.projectedSpend4w)} — PREDICTIVE: assumes the pool forms at its threshold price, which it may not`} />
            <TermLine label="Projected difference" value={`${moneyText(result.projectedDelta4w)} per 4 weeks — a forecast, not savings booked`} />
          </>
        ) : (
          <p className="cm-blocked-reason">
            Forecast UNKNOWN ({result.reason}) — the runtime refused to guess. No projection is
            shown: an honest unknown beats an invented number. UNKNOWN is not a failure and not a
            zero forecast.
          </p>
        )}
      </div>

      <div className="cm-state-item" style={{ marginTop: 8 }}>
        <div className="cm-row">
          <span className="cm-state-item-label">Canonical facts this counterfactual ran against</span>
          <span className="cm-chip cm-chip-ok">OPERATIONAL</span>
        </div>
        <TermLine label="Verified list price" value={`${moneyText(usdMinor(CANONICAL_FACTS.inkListPriceMinor))} per set (committed demo fixture, verified feed)`} />
        <TermLine label="Pool threshold price" value={`${moneyText(usdMinor(CANONICAL_FACTS.poolPriceMinor))} per set (applies only if the pool forms — J4 surface shows the live threshold state)`} />
        <TermLine label="Your purchase history" value={`weekly units [${CANONICAL_FACTS.weeklyUnits.join(", ")}] (committed demo fixture)`} />
      </div>
    </section>
  );
}

function RentVsOwnWhatIf(): JSX.Element {
  const [weeks, setWeeks] = useState<number>(RENT_WEEK_OPTIONS[1]!);
  const result = runRentVsOwn(weeks);
  return (
    <section className="cm-card" aria-label="Rent vs own counterfactual" data-testid="cm-twin-rent">
      <div className="cm-row">
        <h2 className="cm-card-title">What-if · sell the plotter, rent one when needed</h2>
        <DemoTag />
        <span className="cm-chip cm-chip-unknown">PREDICTIVE — never canonical</span>
      </div>
      <p className="cm-card-sub">
        Counterfactual: you sell the idle plotter at the evidence-backed ask and rent at the
        verified weekly rate when work demands it. All numbers below are projections over committed
        demo fixtures — nothing is listed, sold or rented by viewing them.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, maxWidth: 260 }}>
        <span>Projected weeks of use per year</span>
        <select
          aria-label="Projected weeks of use"
          value={weeks}
          onChange={(event) => setWeeks(Number(event.target.value))}
        >
          {RENT_WEEK_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} weeks
            </option>
          ))}
        </select>
      </label>
      <TermLine label="Rent spend at the projection" value={`${moneyText(result.rentTotal)} for ${weeks} weeks at the verified rate (plus ${moneyText(result.depositHeld)} deposit held during each rental)`} />
      <TermLine label="Buy price you would avoid" value={moneyText(result.buyPrice)} />
      <TermLine label="Resale net if you sold today" value={`${moneyText(result.resaleNet)} — evidence-backed estimate from the J7 surface (listing there takes your explicit action)`} />
      <p className="cm-env-note">
        These projections do not decide for you: the J6 (rent) and J7 (resale) surfaces own the real
        actions, each with its own terms and confirmation gates.
      </p>
    </section>
  );
}

function WriteBlockPanel(): JSX.Element {
  return (
    <section className="cm-card" aria-label="Write block" data-testid="cm-twin-writeblock" style={{ borderColor: "var(--cm-unknown)" }}>
      <div className="cm-row">
        <h2 className="cm-card-title">Write-block — this Twin cannot change real records</h2>
        <span className="cm-chip cm-chip-unknown">STRUCTURAL</span>
      </div>
      <TermLine
        label="Why nothing can be applied from here"
        value="Predictions never mutate canonical truth (architecture invariant). The forecasting runtime is advisory-only; the Commerce Twin is a read-side projection over committed demo facts. This surface exposes no order, price, listing, rental or commitment command — there is nothing to click that would write commerce facts."
      />
      <TermLine
        label="What acting on a projection looks like"
        value="You take the idea to the owning surface — J4 for the pool, J6 for renting, J7 for resale — where every action shows terms, consequence and evidence and requires your explicit confirmation."
      />
      <TermLine
        label="Audit"
        value="The Twin's outputs are recomputed deterministically from committed fixtures on every render — no hidden state, no side effects, nothing to roll back."
      />
    </section>
  );
}
