/**
 * merchant-autonomous component tests (J13) — against the REAL deterministic
 * commerce kernel (no mocks of kernel behavior):
 *
 * - the seeded kiosk renders: policy in force (revision 2, HALTED), control
 *   state, the seeded policy restock, the applied in-band price adjustment,
 *   the CASH_VARIANCE escalation from till close, the audit trail;
 * - the halt is real: an in-band autonomous price adjustment is DENIED at
 *   the kernel boundary with STOP_CONDITION_TRIGGERED (plus the recovery
 *   path);
 * - the human override path recovers: journaled owner overrides apply the
 *   price change (OVERRIDE basis) and force a restock;
 * - escalation acknowledge → resolve lifecycle, plus the honest invalid
 *   re-acknowledgement refusal (terminal state);
 * - the preview panel shows every decision class BEFORE anything commits
 *   (DENY margin floor / REQUIRE_APPROVAL refund / DENY spend / DENY stop);
 * - actions are permission-gated (storefront.manage) with holders named.
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantAutonomousComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, findButton, renderUi, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["merchant"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <MerchantAutonomousComponent moduleId="merchant-autonomous" journey="J13" host={host} />,
  );
  await waitForText(ui.container, "J13 · Autonomous store controls");
  return ui;
}

describe("merchant-autonomous (J13) — the seeded kiosk", () => {
  it("renders the policy in force with the halt, control state and audit facts", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Harbor 24 autonomous kiosk");
    expect(text).toContain("Policy in force");
    expect(text).toContain("revision 2");
    expect(text).toContain("Autonomy is HALTED — a stop condition holds");
    expect(text).toContain("observed 6200 bps · threshold 5000 bps");
    expect(text).toContain("Spend limit USD 200.00 per day");
    expect(text).toContain("REQUIRE_APPROVAL");
    expect(text).toContain("AUTONOMOUS");
    expect(text).toContain("DEMO");
  });

  it("renders the seeded policy restock, applied price adjustment and cash-variance escalation", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    // Policy restock: 4 units × USD 30.00 = USD 120.00, basis POLICY.
    expect(text).toContain("sku-auto-kettle");
    expect(text).toContain("units 4");
    expect(text).toContain("planned value USD 120.00");
    expect(text).toContain("POLICY");
    // Seeded in-band adjustment applied: USD 42.00 → USD 44.00.
    expect(text).toContain("USD 42.00 → USD 44.00");
    expect(text).toContain("APPLIED");
    // Till close variance escalated.
    expect(text).toContain("CASH_VARIANCE");
    expect(text).toContain("expected USD 25.00, counted USD 8.00");
    expect(text).toContain("variance USD 17.00");
    expect(text).toContain("Spend today");
    expect(text).toContain("USD 120.00 of the USD 200.00 daily limit");
  });

  it("blocks autonomous actions without storefront.manage, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires storefront.manage");
    expect(text).toContain("held by merchant, store-operator");
    expect(text).not.toContain("Try an autonomous price adjustment (in-band) while halted");
  });
});

describe("merchant-autonomous (J13) — the halt and the override path", () => {
  it("an in-band autonomous adjustment is DENIED at the kernel boundary while halted", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Try an autonomous price adjustment (in-band) while halted");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the adjustment");
    await waitForText(rendered.container, "Command refused: POLICY_DENIED");
    const text = textOf(rendered.container);
    expect(text).toContain("STOP_CONDITION_TRIGGERED");
    expect(text).toContain("Review the policy bounds on this surface");
  });

  it("a journaled human override applies the price change with OVERRIDE basis", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Human override — set the kettle price to USD 46.00 (journaled)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the override (price)");
    // W2-029: wait for the observable postcondition (the moved price book) — the
    // generic "OVERRIDE" marker is now also present in the static override-point
    // availability section, so it can no longer synchronize the async command.
    await waitForText(rendered.container, "unit price USD 46.00");
    const text = textOf(rendered.container);
    expect(text).toContain("unit price USD 46.00");
    expect(text).toContain("USD 44.00 → USD 46.00");
    expect(text).toContain("competitor price match");
  });

  it("a journaled human override forces a 2-unit restock (HUMAN_OVERRIDE basis)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Human override — force a 2-unit kettle restock (journaled)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the override (restock)");
    // W2-029: postcondition-based synchronization (see the price-override test note).
    await waitForText(rendered.container, "planned value USD 60.00");
    const text = textOf(rendered.container);
    expect(text).toContain("units 2");
    expect(text).toContain("planned value USD 60.00");
    expect(text).toContain("USD 180.00 of the USD 200.00 daily limit");
  });
});

describe("merchant-autonomous (J13) — escalations", () => {
  it("acknowledge → resolve walks the lifecycle and re-acknowledgement is refused honestly", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Acknowledge the cash-variance escalation");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Acknowledge it");
    await waitForText(rendered.container, "Resolve the acknowledged escalation");
    let text = textOf(rendered.container);
    expect(text).toContain("ACKNOWLEDGED");
    clickButton(rendered.container, "Resolve the acknowledged escalation");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Resolve it");
    await waitForText(rendered.container, "Try to acknowledge the resolved escalation again (see the refusal)");
    text = textOf(rendered.container);
    expect(text).toContain("RESOLVED");
    clickButton(rendered.container, "Try to acknowledge the resolved escalation again (see the refusal)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the invalid acknowledgement");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    text = textOf(rendered.container);
    expect(text).toContain("INVALID_STORE_ESCALATION_TRANSITION from RESOLVED on ACKNOWLEDGE");
    expect(text).toContain("Check the lifecycle shown, then act from the current state");
  });
});

describe("merchant-autonomous (J13) — the preview panel", () => {
  it("shows every decision class before anything commits", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("What the policy says before anything commits");
    expect(text).toContain("Price change below the margin floor");
    expect(text).toContain("BELOW_MARGIN_FLOOR");
    expect(text).toContain("Refund at the approval threshold");
    expect(text).toContain("REQUIRE_APPROVAL");
    expect(text).toContain("APPROVAL_THRESHOLD");
    expect(text).toContain("Restock spend beyond the daily limit");
    expect(text).toContain("EXCEEDS_SPEND_LIMIT");
    expect(text).toContain("Any action while the stop condition holds");
    expect(text).toContain("STOP_CONDITION_TRIGGERED");
    expect(text).toContain("nothing has committed");
  });
});

describe("merchant-autonomous (J13) — loading state", () => {
  it("renders the honest loading card while the demo kernel seeds, then the surface", async () => {
    const { host } = makeStubHost(["merchant"]);
    rendered = renderUi(
      <MerchantAutonomousComponent moduleId="merchant-autonomous" journey="J13" host={host} />,
    );
    // The loading card shares its title with the loaded surface, so the loading
    // assertion runs on the synchronous first render, and the loaded wait uses a
    // post-seed-only marker (the policy-in-force section).
    expect(textOf(rendered.container)).toContain("Seeding the deterministic demo kernel");
    await waitForText(rendered.container, "Policy in force");
    expect(textOf(rendered.container)).toContain("Harbor 24 autonomous kiosk");
  });
});

describe("merchant-autonomous (J13) — autonomy status & control availability (W2-029)", () => {
  it("derives the run presentation from journaled kernel state (STOPPED while halted)", async () => {
    rendered = await mount();
    const status = rendered.container.querySelector('[data-testid="cm-autonomy-status"]');
    expect(status).not.toBeNull();
    const text = status?.textContent ?? "";
    expect(text).toContain("STOPPED");
    expect(text).toContain("deterministic halt derived from journaled state");
    expect(text).toContain("control mode AUTONOMOUS");
    expect(text).toContain("How autonomy appears");
  });

  it("states honestly that no objective type exists, while rendering the represented boundaries", async () => {
    rendered = await mount();
    const objectives = rendered.container.querySelector('[data-testid="cm-autonomy-objectives"]');
    expect(objectives).not.toBeNull();
    const text = objectives?.textContent ?? "";
    expect(text).toContain("NOT REPRESENTED");
    expect(text).toContain("no objective type");
    expect(text).toContain("none is displayed and none is simulated");
    expect(text).toContain("Budget boundaries");
    expect(text).toContain("spend limit USD 200.00 per day");
    expect(text).toContain("promotion budget USD 80.00 per day");
    expect(text).toContain("Margin boundary");
    expect(text).toContain("margin floor 1500 bps over cost");
    expect(text).toContain("Approval thresholds");
    expect(text).toContain("REQUIRE_APPROVAL");
    expect(text).toContain("Stop conditions");
    expect(text).toContain("rendered verbatim — never recomputed");
  });

  it("lists all six override points with exactly one wired and five honestly unavailable", async () => {
    rendered = await mount();
    const overrides = rendered.container.querySelector('[data-testid="cm-autonomy-overrides"]');
    expect(overrides).not.toBeNull();
    const text = overrides?.textContent ?? "";
    for (const label of [
      "Approve a pending action yourself",
      "Pause autonomy",
      "Resume autonomy",
      "Stop the store",
      "Tighten the policy limits",
      "Loosen the policy limits",
    ]) {
      expect(text).toContain(label);
    }
    const chips = (overrides as HTMLElement).querySelectorAll(".cm-chip");
    const wired = [...chips].filter((chip) => chip.textContent === "WIRED");
    const notWired = [...chips].filter((chip) => chip.textContent === "NOT WIRED");
    expect(wired.length).toBe(1);
    expect(notWired.length).toBe(5);
    expect(text).toContain("kernel:RECORD_HUMAN_OVERRIDE");
    expect(text).toContain("No runtime command exists for pausing autonomy");
    expect(text).toContain("Missing controls are marked unavailable rather than simulated as effective policy");
  });

  it("offers no clickable control for the unwired override points", async () => {
    rendered = await mount();
    expect(findButton(rendered.container, "Pause autonomy")).toBeNull();
    expect(findButton(rendered.container, "Resume autonomy")).toBeNull();
    expect(findButton(rendered.container, "Stop the store")).toBeNull();
    expect(findButton(rendered.container, "Tighten the policy limits")).toBeNull();
    expect(findButton(rendered.container, "Loosen the policy limits")).toBeNull();
  });
});
