/**
 * peer-tradecycle component tests (J9): the ordinary consent flow (own leg
 * through the authorization gate, synthetic peers through labelled demo
 * advances, ALL_LEGS_CONSENTED → execution hand-off boundary that never
 * simulates a live trade); refusal stops the cycle without committing other
 * legs and offers the re-plan; dropout/expiry stops; no further re-plan
 * candidate is honest; permission denial (requester lacks
 * tradecycle.consent-leg); pure-machine honest rejections.
 */
import { afterEach, describe, expect, it } from "vitest";
import PeerTradecycleComponent from "./component.js";
import {
  consentLeg,
  initialCycle,
  lapseLeg,
  prepareHandoff,
  refuseLeg,
  withdrawLeg,
} from "./tradecycle-data.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderAt(roles: readonly string[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <PeerTradecycleComponent
      moduleId="peer-tradecycle"
      journey="J9"
      host={makeTestHost({ roles: roles as never, currentPath: "/commerce/trade-cycle" })}
    />,
  );
  return rendered;
}

describe("peer-tradecycle J9 (bounded multi-hop trades)", () => {
  it("renders the 3-hop cycle with per-leg terms, proof levels, privacy and the engine-boundary honesty", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    expect(text).toContain("Cycle A — 3 hops");
    expect(text).toContain("3 hops · 3 participants");
    // All three legs render with their terms.
    for (const needle of [
      "Leg 1 · Two Harbors Design (peer studio) → Harbor Lane Print Studio (you, demo buyer)",
      "Leg 2 · Northlight Atelier (peer studio) → Two Harbors Design (peer studio)",
      "Leg 3 · Harbor Lane Print Studio (you, demo buyer) → Northlight Atelier (peer studio)",
      "Overlock sewing machine (4-thread)",
      "Photography light kit (3 heads)",
      "Wide-format A1 printer",
      "only the giving participant may authorize this leg",
      "P2 — provider-signed",
      "P1 — receipt",
      "Only the immediate counterpart learns your identity",
      "Consent window ends: 2026-10-13T18:00:00Z (demo clock)",
      "every leg needs its own consent",
    ]) {
      expect(text).toContain(needle);
    }
    // The engine boundary is visible (no simulated live discovery/execution).
    expect(text).toContain("Discovery (bounded search over the offer graph)");
    expect(text).toContain("no trade leg executes in this host");
  });

  it("collects per-leg consent (own leg gated, peers as demo advances) and reaches ALL_LEGS_CONSENTED", () => {
    rendered = renderAt();
    const container = rendered.container;
    // Own leg (leg 3) requires the explicit authorization gate.
    clickButton(container, "Consent to my leg (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("You give");
    expect(gateText).toContain("Wide-format A1 printer");
    expect(gateText).toContain("Overlock sewing machine (4-thread) — delivered to you on your incoming leg (leg 1)");
    expect(gateText).toContain("Consenting authorizes ONLY this leg");
    clickButton(container, "Consent to my leg");
    expect(textOf(container)).toContain("CONSENTED");
    // The synthetic peers consent through labelled demo advances.
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier consents (demo advance)");
    const text = textOf(container);
    expect(text).toContain("ALL_LEGS_CONSENTED");
    expect(text).toContain("All legs consented — execution hand-off");
    // No leg claims execution.
    expect(text).not.toContain("COMPLETED");
  });

  it("records the execution hand-off request WITHOUT simulating a live trade (honest boundary)", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier consents (demo advance)");
    clickButton(container, "Request the execution hand-off (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate?.textContent ?? "").toContain("does NOT execute any trade");
    clickButton(container, "Request the hand-off (does not execute)");
    const text = textOf(container);
    expect(text).toContain("Hand-off requested — NOT executed");
    expect(text).toContain("UNKNOWN outcome — honestly not run");
    expect(text).toContain("No item has moved");
    expect(text).toContain("not a simulated success");
  });

  it("stops the cycle on a refusal without committing any other leg, then re-plans with fresh consents", () => {
    rendered = renderAt();
    const container = rendered.container;
    // Two legs consent first; the third refuses — nothing the others consented commits.
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier refuses — stop the cycle");
    const stopped = container.querySelector('[data-testid="cm-tradecycle-stopped"]');
    expect(stopped).not.toBeNull();
    let text = textOf(container);
    expect(text).toContain("STOPPED_REFUSAL");
    expect(text).toContain("No other leg was committed");
    expect(text).toContain("Each participant keeps their own goods");
    // DENIED is the honest classification (a refusal is not a failure).
    expect(stopped?.textContent).toContain("DENIED");
    // Re-plan offers the alternative participant with fresh consents.
    expect(text).toContain("Ferry Road Press (peer studio, re-plan alternative) can replace");
    clickButton(
      container,
      "Re-plan with Ferry Road Press (peer studio, re-plan alternative) (fresh consents for every leg)",
    );
    text = textOf(container);
    expect(text).toContain("Cycle B (re-plan) — 3 hops with Ferry Road Press instead of Northlight");
    expect(text).toContain("Leg 2 · Ferry Road Press (peer studio, re-plan alternative) → Two Harbors Design (peer studio)");
    // Every leg is fresh: three UNCONSENTED chips, no residual consent.
    const legStates = [...container.querySelectorAll('[data-testid="cm-tradecycle-leg-1"]')];
    expect(legStates.length).toBe(1);
    expect(text).toContain("UNCONSENTED");
    expect(text.match(/CONSENTED\b/g)?.length ?? 0).toBe(0); // every consent chip is fresh (UNCONSENTED does not match)
  });

  it("stops the cycle on a dropout (withdrawal) after consent was given", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Two Harbors Design drops out — stop the cycle");
    const text = textOf(container);
    expect(text).toContain("STOPPED_WITHDRAWAL");
    expect(text).toContain("No other leg was committed");
    expect(text).toContain("WITHDRAWN");
  });

  it("stops the cycle when a consent window lapses (expiry)", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Let this leg's consent window lapse");
    const text = textOf(container);
    expect(text).toContain("STOPPED_EXPIRY");
    expect(text).toContain("EXPIRED");
    expect(text).toContain("No other leg was committed");
  });

  it("visibly blocks all consent controls for roles without tradecycle.consent-leg (denial state)", () => {
    rendered = renderAt(["requester"]);
    const container = rendered.container;
    expect(findButton(container, "Consent to my leg (with authorization)")).toBeNull();
    const blocked = container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("Blocked: this action requires tradecycle.consent-leg");
    expect(text).toContain("Held by Buyer");
    // The cycle, legs and terms remain visible (read-side).
    expect(text).toContain("Cycle A — 3 hops");
    expect(text).toContain("only the giving participant may authorize this leg");
  });

  it("is honest when no further re-plan candidate exists", () => {
    rendered = renderAt();
    const container = rendered.container;
    // Stop cycle A, re-plan to B, stop B — no alternative left.
    clickButton(container, "Northlight Atelier refuses — stop the cycle");
    clickButton(
      container,
      "Re-plan with Ferry Road Press (peer studio, re-plan alternative) (fresh consents for every leg)",
    );
    clickButton(container, "Ferry Road Press refuses — stop the cycle");
    const text = textOf(container);
    expect(text).toContain("No further re-plan candidate exists in this demo — the asset stays yours; nothing moved.");
    expect(findButton(container, "Re-plan")).toBeNull();
  });

  it("reports honest rejections from the pure consent machine", () => {
    const cycle = initialCycle();
    expect(cycle.status).toBe("PROPOSED");
    expect(cycle.legs.every((leg) => leg.consent === "UNCONSENTED")).toBe(true);
    // Hand-off before all legs consent is rejected.
    expect(prepareHandoff(cycle).ok).toBe(false);
    // Withdrawal of an unconsented leg is rejected.
    expect(withdrawLeg(cycle, 0).ok).toBe(false);
    // Double consent is rejected.
    const once = consentLeg(cycle, 0);
    expect(once.ok).toBe(true);
    if (once.ok) {
      expect(once.cycle.legs[0]!.consent).toBe("CONSENTED");
      expect(once.cycle.status).toBe("PROPOSED");
      expect(consentLeg(once.cycle, 0).ok).toBe(false);
      // Consent completes when the remaining legs consent.
      const two = consentLeg(once.cycle, 1);
      expect(two.ok).toBe(true);
      if (two.ok) {
        const three = consentLeg(two.cycle, 2);
        expect(three.ok).toBe(true);
        if (three.ok) expect(three.cycle.status).toBe("ALL_LEGS_CONSENTED");
      }
    }
    // Stops refuse further consent, and lapse only applies to unanswered legs.
    const refused = refuseLeg(cycle, 1);
    expect(refused.ok).toBe(true);
    if (refused.ok) {
      expect(refused.cycle.status).toBe("STOPPED_REFUSAL");
      expect(consentLeg(refused.cycle, 0).ok).toBe(false);
      expect(lapseLeg(refused.cycle, 0).ok).toBe(false);
    }
  });
});
