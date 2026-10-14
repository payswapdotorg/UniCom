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

describe("buyer-twin J14 — the Main Agent loop view (W2-029)", () => {
  it("renders the goal and all eight loop phases with the current step named", () => {
    rendered = renderAt();
    const panel = rendered.container.querySelector('[data-testid="cm-agent-panel"]');
    expect(panel).not.toBeNull();
    const text = panel?.textContent ?? "";
    for (const label of ["Goal", "Observe", "Plan", "Simulate", "Approve", "Execute", "Verify", "Learn"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("Keep the studio supplied");
    expect(text).toContain("Current step: Simulate — the counterfactual panels below");
    // The surface names the Main Agent — not swarm chat, not internal architecture.
    expect(textOf(rendered.container)).toContain("Your Main Agent — working the goal");
  });

  it("marks unwired phases honestly (execute not wired, verify has nothing to verify, learn is presentation)", () => {
    rendered = renderAt();
    const loop = rendered.container.querySelector('[data-testid="cm-agent-loop"]');
    const text = loop?.textContent ?? "";
    expect(text).toContain("Not wired on this surface");
    expect(text).toContain("Nothing to verify yet");
    expect(text).toContain("learning is an agent-plane Lab concept");
    expect(text).toContain("phases without a wired runtime say so instead of simulating progress");
    // No phase row claims execution.
    expect(text).not.toContain("executing");
  });

  it("keeps evidence truth classes and freshness visibly separate (verified vs stale vs UNKNOWN)", () => {
    rendered = renderAt();
    const evidence = rendered.container.querySelector('[data-testid="cm-agent-evidence"]');
    const text = evidence?.textContent ?? "";
    expect(text).toContain("OPERATIONAL");
    expect(text).toContain("OBSERVED");
    expect(text).toContain("HISTORICAL");
    expect(text).toContain("verified");
    expect(text).toContain("stale");
    expect(text).toContain("UNKNOWN");
    // The stale observation carries its deterministic age label against the demo clock.
    expect(text).toContain("18 h ago");
    expect(text).toContain("UNKNOWN is never rendered as a price");
    expect(text).toContain("not a failure");
    // Truth classes are explained, never blended.
    expect(text).toContain("stay visibly separate");
  });

  it("shows the plan as proposals — never commitments, no execution claims", () => {
    rendered = renderAt();
    const plan = rendered.container.querySelector('[data-testid="cm-agent-plan"]');
    const text = plan?.textContent ?? "";
    expect((text.match(/PROPOSED — not committed/g) ?? []).length).toBe(3);
    expect(text).toContain("A plan is a proposal. No step has executed");
    expect(text).toContain("J4 · group-buy surface owns the real action");
    expect(text).not.toContain("COMMITTED");
    expect(text).not.toContain("EXECUTED");
  });

  it("labels the agent's predictions predictive/simulation-only with twin-computed numbers", () => {
    rendered = renderAt();
    const simulation = rendered.container.querySelector('[data-testid="cm-agent-simulation"]');
    const text = simulation?.textContent ?? "";
    expect((text.match(/PREDICTIVE — simulation only/g) ?? []).length).toBe(2);
    // The numbers are the advisory runtime's own (48.00 / 96.00 per 4 weeks).
    expect(text).toContain("48.00 USD");
    expect(text).toContain("96.00 USD");
    expect(text).toContain("assumes the pool forms at its threshold price, which it may not");
    expect(text).toContain("Confidence:");
    expect(text).toContain("simulation only, nothing executed");
  });

  it("shows the pending approval AND the denied authority with reason + safe next option", () => {
    rendered = renderAt();
    const approvals = rendered.container.querySelector('[data-testid="cm-agent-approvals"]');
    const text = approvals?.textContent ?? "";
    expect(text).toContain("AUTHORIZATION PENDING");
    expect(text).toContain("AUTHORIZATION DENIED");
    expect(text).toContain("holds no purchasing authority");
    expect(text).toContain("A denial is not a failure");
    expect(text).toContain("Safe next option");
    expect(text).toContain("Open the J4 group-buy surface");
    expect(text).toContain("the agent never commits on your behalf");
    // No override/retry/approve affordance anywhere on the twin.
    expect(findButton(rendered.container, "Override")).toBeNull();
    expect(findButton(rendered.container, "Retry")).toBeNull();
    expect(findButton(rendered.container, "Approve")).toBeNull();
  });

  it("renders the work graph with contract statuses and no executing/verifying nodes", () => {
    rendered = renderAt();
    const graph = rendered.container.querySelector('[data-testid="cm-agent-workgraph"]');
    const text = graph?.textContent ?? "";
    expect(text).toContain("planning");
    expect(text).toContain("awaiting-approval");
    expect(text).toContain("idle");
    expect(text).toContain("No node claims runtime execution or verification");
    expect(text).not.toContain("executing");
    expect(text).not.toContain("verifying");
  });
});
