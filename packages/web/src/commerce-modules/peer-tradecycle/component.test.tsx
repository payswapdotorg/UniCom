/**
 * peer-tradecycle component tests (J9, kernel-driven since W2-013): the
 * ordinary consent flow (own leg through the authorization gate, synthetic
 * peers through labelled demo advances) reaches ALL_LEGS_AUTHORIZED and
 * executes ATOMICALLY through the commerce kernel; refusal stops the cycle
 * without committing any other leg and offers the re-plan; dropout/expiry
 * stops; a non-giver authorization attempt holds the leg UNKNOWN (never
 * failed) and the giver can disambiguate; duplicate command submission is
 * idempotent (DUPLICATE with the original receipt); permission denial
 * (requester lacks tradecycle.consent-leg); kernel-level honest rejections.
 */
import { afterEach, describe, expect, it } from "vitest";
import PeerTradecycleComponent from "./component.js";
import { CYCLE_A, DEMO_TRADECYCLE_INITIATOR, DEMO_TRADE_PRINCIPALS, kernelCycleOf, seedTradecycleDemo } from "./tradecycle-data.js";
import { TradecycleKernel } from "./kernel.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
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

describe("peer-tradecycle J9 (bounded multi-hop trades, kernel-driven)", () => {
  it("renders the 3-hop cycle with per-leg terms, proof levels, privacy and the honest kernel-driven state", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    expect(text).toContain("Cycle A — 3 hops");
    expect(text).toContain("3 hops · 3 participants");
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
    // The old blocker statement is GONE; the honest kernel-driven state is on the surface.
    expect(text).not.toContain("Not wired (blocker)");
    expect(text).toContain("Executed by the commerce kernel");
    expect(text).toContain("kernel's TradeCycle execution aggregate");
    // Initial kernel state renders as kernel truth.
    expect(text).toContain("OPEN — awaiting each giver's consent");
    expect(text).toContain("commands journaled with idempotency receipts");
  });

  it("collects per-leg kernel consent (own leg gated, peers as demo advances), executes ATOMICALLY and renders the kernel receipt", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("You give");
    expect(gateText).toContain("Wide-format A1 printer");
    expect(gateText).toContain("Overlock sewing machine (4-thread) — delivered to you on your incoming leg (leg 1)");
    expect(gateText).toContain("Consenting authorizes ONLY this leg");
    clickButton(container, "Consent to my leg");
    // The kernel outcome lands asynchronously: wait for the chip, never assume.
    await waitForText(container, "CONSENTED");
    // Your own leg is display position 2 (browser-evidenced selector).
    const ownLeg = container.querySelector('[data-testid="cm-tradecycle-leg-2"]');
    expect(ownLeg?.textContent).toContain("CONSENTED");
    expect(ownLeg?.textContent).toContain("Kernel authorization record");
    expect(ownLeg?.textContent).toContain("w2tc-authz-harbor-lane");
    // The synthetic peers consent through labelled demo advances (kernel commands).
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier consents (demo advance)");
    await waitForText(container, "ALL_LEGS_AUTHORIZED — every leg carries its giver's consent");
    expect(textOf(container)).toContain("Execute the cycle through the commerce kernel (with authorization)");
    clickButton(container, "Execute the cycle through the commerce kernel (with authorization)");
    const executeGate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(executeGate?.textContent).toContain("commits every leg together or none");
    clickButton(container, "Execute the cycle (all legs, atomically)");
    await waitForText(container, "Cycle COMMITTED — executed by the commerce kernel");
    const text = textOf(container);
    expect(text).toContain("Kernel receipt");
    expect(text).toContain("resulting revision");
    // Every leg chip is COMMITTED (kernel truth, all-or-nothing).
    for (const legIndex of [0, 1, 2]) {
      expect(container.querySelector(`[data-testid="cm-tradecycle-leg-${legIndex}"]`)?.textContent).toContain("COMMITTED");
    }
    expect(text).toContain("no live provider, payment or shipment was contacted");
  });

  it("stops the cycle on a refusal without committing any other leg (kernel ATOMIC outcome), then re-plans with fresh consents", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    clickButton(container, "Northlight Atelier refuses — stop the cycle");
    await waitForText(container, "Cycle stopped — STOPPED_REFUSAL");
    const stopped = container.querySelector('[data-testid="cm-tradecycle-stopped"]');
    expect(stopped).not.toBeNull();
    let text = textOf(container);
    expect(text).toContain("STOPPED_REFUSAL");
    expect(text).toContain("No other leg was committed");
    expect(text).toContain("Each participant keeps their own goods");
    // Kernel truth: zero legs COMMITTED (ATOMIC — a stop commits nothing).
    for (const legIndex of [0, 1, 2]) {
      expect(container.querySelector(`[data-testid="cm-tradecycle-leg-${legIndex}"]`)?.textContent).not.toContain("COMMITTED");
    }
    expect(stopped?.textContent).toContain("DENIED");
    // Re-plan offers the alternative participant with fresh consents.
    expect(text).toContain("Ferry Road Press (peer studio, re-plan alternative) can replace");
    clickButton(
      container,
      "Re-plan with Ferry Road Press (peer studio, re-plan alternative) (fresh consents for every leg)",
    );
    await waitForText(container, "Cycle B (re-plan) — 3 hops with Ferry Road Press instead of Northlight");
    text = textOf(container);
    expect(text).toContain("Leg 2 · Ferry Road Press (peer studio, re-plan alternative) → Two Harbors Design (peer studio)");
    // Every leg is fresh: three PENDING chips, no residual consent.
    for (const legIndex of [0, 1, 2]) {
      expect(container.querySelector(`[data-testid="cm-tradecycle-leg-${legIndex}"]`)?.textContent).toContain("PENDING");
    }
    expect(text.match(/CONSENTED\b/g)?.length ?? 0).toBe(0);
  });

  it("stops the cycle on a dropout (withdrawal) after consent was given", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Two Harbors Design consents (demo advance)");
    await waitForText(container, "drops out");
    clickButton(container, "Two Harbors Design drops out — stop the cycle");
    await waitForText(container, "Cycle stopped — STOPPED_WITHDRAWAL");
    const text = textOf(container);
    expect(text).toContain("STOPPED_WITHDRAWAL");
    expect(text).toContain("No other leg was committed");
    expect(text).toContain("WITHDRAWN");
  });

  it("stops the cycle when a consent window lapses (expiry)", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Let this leg's consent window lapse");
    await waitForText(container, "Cycle stopped — STOPPED_EXPIRY");
    const text = textOf(container);
    expect(text).toContain("STOPPED_EXPIRY");
    expect(text).toContain("EXPIRED");
    expect(text).toContain("No other leg was committed");
  });

  it("holds a leg UNKNOWN when a non-giver attempts to authorize (never failed), and the giver can disambiguate", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Attempt as a non-giver (kernel holds the leg UNKNOWN)");
    await waitForText(container, "Kernel ambiguity record");
    const leg = container.querySelector('[data-testid="cm-tradecycle-leg-0"]');
    const legText = leg?.textContent ?? "";
    expect(legText).toContain("UNKNOWN");
    expect(legText).toContain("PARTICIPANT_MISMATCH");
    expect(legText).toContain("never silently passed and never failed");
    expect(leg?.querySelector(".cm-chip-unknown")).not.toBeNull();
    // The cycle itself did not stop and nothing failed: disambiguation is the giver's clear consent.
    expect(textOf(container)).not.toContain("Cycle stopped");
    clickButton(container, "Two Harbors Design now clearly authorizes (disambiguation)");
    await waitForText(container.querySelector('[data-testid="cm-tradecycle-leg-0"]')!, "CONSENTED");
    // The cycle remains OPEN until every leg is authorized (kernel truth).
    expect(textOf(container)).toContain("OPEN — awaiting each giver's consent");
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

  it("is honest when no further re-plan candidate exists", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Northlight Atelier refuses — stop the cycle");
    await waitForText(container, "Cycle stopped — STOPPED_REFUSAL");
    clickButton(
      container,
      "Re-plan with Ferry Road Press (peer studio, re-plan alternative) (fresh consents for every leg)",
    );
    await waitForText(container, "Cycle B (re-plan)");
    clickButton(container, "Ferry Road Press refuses — stop the cycle");
    await waitForText(container, "No further re-plan candidate exists in this demo — the asset stays yours; nothing moved.");
    expect(findButton(container, "Re-plan")).toBeNull();
  });

  it("resets deterministically to a fresh kernel with Cycle A", async () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Consent to my leg (with authorization)");
    clickButton(container, "Consent to my leg");
    clickButton(container, "Reset the demo kernel (fresh Cycle A)");
    await waitForText(container, "OPEN — awaiting each giver's consent");
    expect(textOf(container)).not.toContain("Kernel authorization record");
    expect(container.querySelector('[data-testid="cm-tradecycle-leg-2"]')?.textContent).toContain("PENDING");
  });
});

describe("peer-tradecycle kernel seam (typed commands, kernel semantics)", () => {
  it("duplicate submission returns the ORIGINAL receipt with no new effect (DUPLICATE, not an error)", async () => {
    const kernel = seedTradecycleDemo();
    const payload = {
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: kernelCycleOf(CYCLE_A).tradeCycleId,
      legIndex: 1,
      authorizingRef: DEMO_TRADE_PRINCIPALS["harbor-lane"]!,
      authorizationRef: "w2tc-authz-harbor-lane-leg-1",
    } as const;
    const first = await kernel.execute(DEMO_TRADECYCLE_INITIATOR, payload, { idempotencyKey: "w2tc-idem-own" });
    expect(first.status).toBe("EXECUTED");
    const second = await kernel.execute(DEMO_TRADECYCLE_INITIATOR, payload, { idempotencyKey: "w2tc-idem-own" });
    expect(second.status).toBe("DUPLICATE");
    if (second.status === "DUPLICATE" && first.status === "EXECUTED") {
      expect(second.originalReceipt.receiptId).toBe(first.receipt.receiptId);
    }
    // No new effect: exactly one CONSENTED leg in the kernel.
    const cycle = kernel.cycle(CYCLE_A.cycleId)!;
    expect(cycle.legs.filter((leg) => leg.consentState === "CONSENTED").length).toBe(1);
  });

  it("enforces the kernel's honest rejections: identity, double consent, premature execute, duplicate open", async () => {
    const kernel = seedTradecycleDemo();
    const cycleId = kernelCycleOf(CYCLE_A).tradeCycleId;
    // A participant cannot submit another participant's authorization.
    const smuggled = await kernel.execute(DEMO_TRADE_PRINCIPALS["northlight"]!, {
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId,
      legIndex: 0,
      authorizingRef: DEMO_TRADE_PRINCIPALS["two-harbors"]!,
      authorizationRef: "w2tc-authz-smuggled",
    });
    expect(smuggled.status).toBe("REJECTED");
    if (smuggled.status === "REJECTED") expect(smuggled.reason.code).toBe("POLICY_DENIED");
    // Clear consent by the giver, then double consent is rejected by the machine.
    const giver = DEMO_TRADE_PRINCIPALS["two-harbors"]!;
    const once = await kernel.execute(giver, {
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId,
      legIndex: 0,
      authorizingRef: giver,
      authorizationRef: "w2tc-authz-two-harbors-leg-0",
    });
    expect(once.status).toBe("EXECUTED");
    const twice = await kernel.execute(giver, {
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId,
      legIndex: 0,
      authorizingRef: giver,
      authorizationRef: "w2tc-authz-two-harbors-leg-0",
    });
    expect(twice.status).toBe("REJECTED");
    if (twice.status === "REJECTED") expect(twice.reason.detail).toContain("LEG_ALREADY_CONSENTED");
    // ATOMIC execution before every leg is authorized is rejected.
    const early = await kernel.execute(DEMO_TRADECYCLE_INITIATOR, { type: "EXECUTE_TRADE_CYCLE", cycleId });
    expect(early.status).toBe("REJECTED");
    if (early.status === "REJECTED") expect(early.reason.detail).toContain("NOT_ALL_LEGS_AUTHORIZED");
    // Only the initiating principal may execute; opening a cycle twice is rejected.
    const notInitiator = await kernel.execute(DEMO_TRADE_PRINCIPALS["northlight"]!, { type: "EXECUTE_TRADE_CYCLE", cycleId });
    expect(notInitiator.status).toBe("REJECTED");
    if (notInitiator.status === "REJECTED") expect(notInitiator.reason.code).toBe("POLICY_DENIED");
    const reopened = await kernel.execute(DEMO_TRADECYCLE_INITIATOR, {
      type: "OPEN_TRADE_CYCLE",
      cycle: kernelCycleOf(CYCLE_A),
    });
    expect(reopened.status).toBe("REJECTED");
    if (reopened.status === "REJECTED") expect(reopened.reason.detail).toContain("already open");
    // A rejected command changes nothing: the cycle still has exactly one CONSENTED leg.
    const cycle = kernel.cycle(CYCLE_A.cycleId)!;
    expect(cycle.legs.filter((leg) => leg.consentState === "CONSENTED").length).toBe(1);
    expect(cycle.state).toBe("OPEN");
  });

  it("opens only cycle-shape-valid candidates (the kernel's own laws validate the fixtures)", () => {
    const kernel = new TradecycleKernel();
    const malformed = { ...kernelCycleOf(CYCLE_A), legs: [] };
    const outcome = kernel.apply(DEMO_TRADECYCLE_INITIATOR, { type: "OPEN_TRADE_CYCLE", cycle: malformed });
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain("NO_LEGS");
    expect(kernel.cycle(CYCLE_A.cycleId)).toBeNull();
  });
});
