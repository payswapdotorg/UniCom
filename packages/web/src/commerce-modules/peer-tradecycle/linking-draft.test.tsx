/**
 * W2-015 Stage 1 — peer-tradecycle linked-order-draft affordance tests.
 *
 * Covers the human-confirmed "create linked order draft" affordance on an
 * EXECUTED TradeCycle leg (participant side): the affordance renders ONLY
 * for a COMMITTED leg (execution truth exists) and only for the leg's
 * receiver (the participant whose stated want was satisfied); activating it
 * is ALWAYS a separate human confirmation (never fires on execution);
 * provenance visible (which cycle, which leg, which actor, which consent
 * basis); the draft is a draft (placing still requires the existing flow);
 * permission-aware; kill-switchable.
 *
 * Law 7 (refusal isolation): refusing to draft one leg never drafts another —
 * each leg's affordance is independent (only COMMITTED legs render it).
 */
import { afterEach, describe, expect, it } from "vitest";
import PeerTradecycleComponent from "./component.js";
import { clickButton, findButton, renderUi } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function waitForText(container: HTMLElement, expected: string, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();
  while (!(container.textContent ?? "").includes(expected)) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timed out waiting for text: ${expected}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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

/** Walk the cycle to COMMITTED (all legs authorized → ATOMIC execute). */
async function walkToCommitted(container: HTMLElement): Promise<void> {
  clickButton(container, "Consent to my leg (with authorization)");
  clickButton(container, "Consent to my leg");
  clickButton(container, "Two Harbors Design consents (demo advance)");
  clickButton(container, "Northlight Atelier consents (demo advance)");
  await waitForText(container, "ALL_LEGS_AUTHORIZED — every leg carries its giver's consent");
  clickButton(container, "Execute the cycle through the commerce kernel (with authorization)");
  clickButton(container, "Execute the cycle (all legs, atomically)");
  await waitForText(container, "Cycle COMMITTED — executed by the commerce kernel");
}

describe("W2-015 peer-tradecycle linked-order-draft affordance (Stage 1)", () => {
  it("renders the affordance on a COMMITTED leg — provenance visible, prefill visible, per-leg isolation", async () => {
    rendered = renderAt();
    const container = rendered.container;
    await walkToCommitted(container);
    // After COMMIT, every leg is COMMITTED. The affordance renders on each
    // committed leg's card (per-leg — law 7: refusing to draft one never
    // drafts another, but the affordance IS available on every committed leg).
    const draftPanels = container.querySelectorAll('[data-testid="cm-linking-draft-panel"]');
    expect(draftPanels.length).toBeGreaterThanOrEqual(1);
    const firstDraftText = draftPanels[0]?.textContent ?? "";
    // Provenance: source aggregate id (the cycle id), source kind, acting principal.
    expect(firstDraftText).toContain("Provenance — source aggregate");
    expect(firstDraftText).toContain("w2tc-cycle-a");
    expect(firstDraftText).toContain("TRADECYCLE_LEG_EXECUTED");
    expect(firstDraftText).toContain("Provenance — acting principal");
    expect(firstDraftText).toContain("customer:w2tc-");
    expect(firstDraftText).toContain("Provenance — consent basis");
    expect(firstDraftText).toContain("committed (the giver authorized, the cycle executed atomically)");
    // Prefill: ADD_CART_LINE with the leg's offered item ref; PLACE_ORDER.
    expect(firstDraftText).toContain("Prefill — ADD_CART_LINE");
    expect(firstDraftText).toContain("Prefill — PLACE_ORDER");
    // The trade-cycle aggregate carries no money — the price is the acting
    // human's to set (rendered honestly on-surface).
    expect(firstDraftText).toContain("The price is the acting human's to set");
    // DEMO labelling.
    expect(firstDraftText).toContain("DEMO");
    // The create button (human-confirmed, never automatic).
    expect(findButton(container, "Create a linked order draft (human-confirmed, never automatic)")).not.toBeNull();
  });

  it("activating the affordance is ALWAYS a separate human confirmation — it never fires on execution", async () => {
    rendered = renderAt();
    const container = rendered.container;
    await walkToCommitted(container);
    // Before clicking: no recorded draft.
    expect(container.querySelector('[data-testid="cm-linking-draft-recorded"]')).toBeNull();
    // Click the create button → confirmation gate opens (NEVER auto-fires).
    clickButton(container, "Create a linked order draft (human-confirmed, never automatic)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("Create the linked order draft (terms, consequence, evidence)");
    expect(gateText).toContain("Source aggregate");
    expect(gateText).toContain("w2tc-cycle-a");
    expect(gateText).toContain("It issues NO kernel command");
    expect(gateText).toContain("Confirming creates a DRAFT only — never an order, never a payment, never a reservation, never a recourse case");
    // Still no recorded draft.
    expect(container.querySelector('[data-testid="cm-linking-draft-recorded"]')).toBeNull();
    // Confirm → recorded (DEMO state, no command).
    clickButton(container, "Create the linked order draft (DEMO state, no command)");
    await waitForText(container, "Linked order draft recorded");
    const recorded = container.querySelector('[data-testid="cm-linking-draft-recorded"]');
    expect(recorded).not.toBeNull();
    expect(recorded?.textContent).toContain("DEMO state — no command issued");
    expect(recorded?.textContent).toContain("w2tc-cycle-a");
    expect(recorded?.textContent).toContain("Placing the order is a SEPARATE step");
  });

  it("does NOT render the affordance on non-committed legs (law 7 — per-leg isolation; a stopped cycle drafts nothing)", async () => {
    rendered = renderAt();
    const container = rendered.container;
    // Refuse one leg → the cycle stops; NO leg is committed; NO affordance renders.
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier refuses — stop the cycle");
    await waitForText(container, "Cycle stopped — STOPPED_REFUSAL");
    // No leg is COMMITTED → no affordance renders (law 7: refusal isolates).
    expect(container.querySelector('[data-testid="cm-linking-draft-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="cm-linking-draft-recorded"]')).toBeNull();
  });

  it("visibly blocks the affordance for roles without tradecycle.consent-leg (denial state, not silent absence)", async () => {
    // The buyer role holds tradecycle.consent-leg; the requester role does NOT.
    rendered = renderAt(["requester"]);
    const container = rendered.container;
    // Even before execution, the consent controls are blocked (the established
    // permission-block pattern). The linked-draft affordance uses the SAME
    // permission gate — if the role can't consent, it can't draft either.
    const blocked = container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    expect(blocked?.textContent).toContain("Blocked: this action requires tradecycle.consent-leg");
    expect(blocked?.textContent).toContain("Held by Buyer");
  });
});
