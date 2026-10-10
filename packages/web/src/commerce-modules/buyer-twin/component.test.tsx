/**
 * buyer-twin component tests (J14): counterfactuals computed by the REAL
 * advisory runtime with exact money; every projection labelled predictive /
 * never canonical while canonical facts wear OPERATIONAL chips; the
 * new-SKU-no-history counterfactual resolves UNKNOWN honestly (never zero,
 * never failed); the structural write-block is visible and there is NO
 * apply/confirm path (no commitment gate exists); permission denial
 * (requester lacks twin.run-what-if); deterministic recompute (same inputs →
 * identical outputs); pure-helper exact math.
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerTwinComponent from "./component.js";
import { runInkWhatIf, runRentVsOwn, whatIfText } from "./twin-data.js";
import { findButton, renderUi, setCheckbox, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import { pickOption } from "../buyer-support/test-inputs.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderAt(roles: readonly string[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <BuyerTwinComponent
      moduleId="buyer-twin"
      journey="J14"
      host={makeTestHost({ roles: roles as never, currentPath: "/commerce/twin" })}
    />,
  );
  return rendered;
}

describe("buyer-twin J14 (Commerce Twin what-if)", () => {
  it("runs the default counterfactual (half shift, steady demand) with exact runtime math", () => {
    rendered = renderAt();
    const result = rendered.container.querySelector('[data-testid="cm-twin-ink-result"]');
    expect(result).not.toBeNull();
    const text = result?.textContent ?? "";
    expect(text).toContain("3 sets/week (12 per 4 weeks)");
    expect(text).toContain("45.00 USD");
    expect(text).toContain("588.00 USD");
    expect(text).toContain("540.00 USD");
    expect(text).toContain("48.00 USD");
    expect(text).toContain("SIMPLE_MOVING_AVERAGE (4-week window)");
    expect(text).toContain("assumes the pool forms at its threshold price, which it may not");
  });

  it("labels every projection predictive-never-canonical and canonical facts OPERATIONAL", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    expect(text).toContain("PREDICTIVE — never canonical");
    expect(text).toContain("OPERATIONAL");
    // The side-by-side law: the same panel shows both truth classes.
    const ink = rendered.container.querySelector('[data-testid="cm-twin-ink"]');
    expect((ink?.textContent ?? "").match(/PREDICTIVE — never canonical/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(ink?.textContent).toContain("Canonical facts this counterfactual ran against");
    expect(ink?.textContent).toContain("weekly units [3, 4, 2, 3, 5, 3]");
  });

  it("recomputes deterministically when the scenario changes (busy season ×1.25)", () => {
    rendered = renderAt();
    const container = rendered.container;
    pickOption(container, "Demand scenario", "busy");
    const text = container.querySelector('[data-testid="cm-twin-ink-result"]')?.textContent ?? "";
    expect(text).toContain("4 sets/week (16 per 4 weeks)");
    expect(text).toContain("720.00 USD");
    expect(text).toContain("64.00 USD");
    // Same inputs reproduce identical outputs (no hidden state).
    expect(whatIfText(runInkWhatIf({ shareBps: 5000, multiplier: 1.25, newSkuNoHistory: false }))).toBe(
      whatIfText(runInkWhatIf({ shareBps: 5000, multiplier: 1.25, newSkuNoHistory: false })),
    );
  });

  it("resolves the no-history counterfactual to UNKNOWN honestly (never zero, never failed)", () => {
    rendered = renderAt();
    const container = rendered.container;
    setCheckbox(container, "Model a brand-new SKU with no purchase history", true);
    const text = container.querySelector('[data-testid="cm-twin-ink-result"]')?.textContent ?? "";
    expect(text).toContain("Forecast UNKNOWN (NO_DATA)");
    expect(text).toContain("the runtime refused to guess");
    expect(text).toContain("UNKNOWN is not a failure and not a zero forecast");
    // No projected numbers are invented alongside the unknown.
    expect(text).not.toContain("sets/week (");
  });

  it("runs the rent-vs-own counterfactual with exact fixture math and no listing action", () => {
    rendered = renderAt();
    const rent = rendered.container.querySelector('[data-testid="cm-twin-rent"]');
    expect(rent).not.toBeNull();
    let text = rent?.textContent ?? "";
    expect(text).toContain("1140.00 USD for 12 weeks");
    expect(text).toContain("2400.00 USD");
    expect(text).toContain("741.00 USD");
    expect(text).toContain("nothing is listed, sold or rented by viewing them");
    pickOption(rendered.container, "Projected weeks of use", "4");
    text = rendered.container.querySelector('[data-testid="cm-twin-rent"]')?.textContent ?? "";
    expect(text).toContain("380.00 USD for 4 weeks");
  });

  it("shows the structural write-block and offers NO apply/confirm path (nothing can write)", () => {
    rendered = renderAt();
    const container = rendered.container;
    const writeblock = container.querySelector('[data-testid="cm-twin-writeblock"]');
    expect(writeblock).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("Write-block — this Twin cannot change real records");
    expect(text).toContain("Predictions never mutate canonical truth");
    expect(text).toContain("This surface exposes no order, price, listing, rental or commitment command");
    // No commitment gate, no apply button, no confirm anywhere on the twin.
    expect(container.querySelector('[data-testid="cm-commitment-gate"]')).toBeNull();
    expect(findButton(container, "Apply")).toBeNull();
    expect(findButton(container, "Confirm")).toBeNull();
    expect(findButton(container, "Order")).toBeNull();
  });

  it("visibly blocks the what-if for roles without twin.run-what-if (denial state)", () => {
    rendered = renderAt(["requester"]);
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires twin.run-what-if");
    expect(text).toContain("Held by Buyer, Merchant");
    expect(rendered.container.querySelector('[data-testid="cm-twin-ink"]')).toBeNull();
    // The header + law text stay visible (read-side honesty).
    expect(text).toContain("no path that writes commerce facts");
  });

  it("verifies the pure helpers' exact math (including the full-shift and no-shift edges)", () => {
    const none = runInkWhatIf({ shareBps: 0, multiplier: 1, newSkuNoHistory: false });
    const half = runInkWhatIf({ shareBps: 5000, multiplier: 1, newSkuNoHistory: false });
    const full = runInkWhatIf({ shareBps: 10_000, multiplier: 1, newSkuNoHistory: false });
    const unknown = runInkWhatIf({ shareBps: 5000, multiplier: 1, newSkuNoHistory: true });
    expect(none.kind).toBe("OBSERVED");
    expect(half.kind).toBe("OBSERVED");
    expect(full.kind).toBe("OBSERVED");
    expect(unknown.kind).toBe("UNKNOWN");
    if (none.kind === "OBSERVED" && half.kind === "OBSERVED" && full.kind === "OBSERVED") {
      // No shift: blended = list, delta = 0.
      expect(none.blendedPerSet.amountMinor).toBe("4900");
      expect(none.projectedDelta4w.amountMinor).toBe("0");
      // Half shift: 45.00/set, 48.00 delta over 12 sets.
      expect(half.blendedPerSet.amountMinor).toBe("4500");
      expect(half.projectedDelta4w.amountMinor).toBe("4800");
      // Full shift: 41.00/set, 96.00 delta over 12 sets.
      expect(full.blendedPerSet.amountMinor).toBe("4100");
      expect(full.projectedDelta4w.amountMinor).toBe("9600");
    }
    if (unknown.kind === "UNKNOWN") expect(unknown.reason).toBe("NO_DATA");
    const rent = runRentVsOwn(26);
    expect(rent.rentTotal.amountMinor).toBe("247000");
  });
});
