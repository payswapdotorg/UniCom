/**
 * merchant-connectors component tests (J15) — the honesty contract:
 *
 * - connected = NONE today, stated on the surface (never implied otherwise);
 * - the four states (CONNECTED/DISCONNECTED/DEMO/UNAVAILABLE) render with
 *   their distinct honest meanings;
 * - a connection attempt journals ATTEMPTED → DISCONNECTED with the honest
 *   reason — never a fabricated success;
 * - unavailable connectors offer no attempt path (nothing to attempt);
 * - the demo file feed import shows exactly the committed fixture rows,
 *   local-only, DEMO-labelled;
 * - everything is permission-gated (connectors.manage) with holders named.
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantConnectorsComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
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
    <MerchantConnectorsComponent moduleId="merchant-connectors" journey="J15" host={host} />,
  );
  await waitForText(ui.container, "Genuinely connected integrations");
  return ui;
}

describe("merchant-connectors (J15) — the honest board", () => {
  it("states connected = none today, with no fabricated freshness", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Genuinely connected integrations");
    expect(text).toContain("NONE_TODAY");
    expect(text).toContain("None. No marketplace, supplier portal, payment rail or accounting backend is connected right now");
    expect(text).toContain("no fabricated 'last synced'");
    expect(text).toContain("DEMO");
  });

  it("differentiates disconnected, demo and unavailable accurately", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Northwind supplier portal");
    expect(text).toContain("DISCONNECTED");
    expect(text).toContain("No credentials exist in this demo");
    expect(text).toContain("CSV stock file feed (demo)");
    expect(text).toContain("DEMO");
    expect(text).toContain("Supplier catalog browser-sync");
    expect(text).toContain("UNAVAILABLE");
    expect(text).toContain("UNAVAILABLE is not DISCONNECTED (there is nothing to disconnect)");
    expect(text).toContain("a live rail is never simulated");
  });

  it("an attempt journals ATTEMPTED → DISCONNECTED with the honest reason, never success", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Attempt connection — Northwind supplier portal");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the connection");
    await waitForText(rendered.container, "ATTEMPTED");
    const text = textOf(rendered.container);
    expect(text).toContain("DISCONNECTED");
    expect(text).toContain("no live credentials or provider contract exists in this demo environment");
    expect(text).toContain("never show a fabricated");
    // Attempt is not success: the connected count stays none.
    expect(text).toContain("None. No marketplace, supplier portal, payment rail or accounting backend is connected right now");
  });

  it("unavailable connectors offer no attempt path (nothing to attempt)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("No attempt is offered");
    expect(text).toContain("an attempt would be theater");
    expect(text).not.toContain("Attempt connection — Supplier catalog browser-sync");
    expect(text).not.toContain("Attempt connection — Live commerce rail (payment provider)");
  });

  it("the demo file-feed import shows exactly the committed fixture rows, local-only", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Run the demo file-feed import (local, deterministic)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Run the demo import");
    await waitForText(rendered.container, "Demo file-feed import (run 1)");
    const text = textOf(rendered.container);
    expect(text).toContain("sku-feed-flour");
    expect(text).toContain("supplier units 120");
    expect(text).toContain("supplier DATA (never trusted instructions)");
    expect(text).toContain("recorded on this screen only");
  });

  it("blocks the whole board without connectors.manage, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires connectors.manage");
    expect(text).toContain("held by merchant");
    expect(text).not.toContain("Attempt connection — Northwind supplier portal");
  });
});
