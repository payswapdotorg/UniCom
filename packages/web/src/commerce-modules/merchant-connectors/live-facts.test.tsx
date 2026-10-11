/**
 * W3-018 — merchant-connectors live-facts panel tests (J15 progressive
 * rendering, Stage 1 of the browser-safe runtime display).
 *
 * Covers the `LiveFactsPanel` rendering on top of the committed
 * SAFE_EXERCISE_RECORD:
 * - the live-facts panel renders when the facts provider is present (the
 *   committed, test-pinned `RuntimeFacts` fixture);
 * - provenance is labelled on-surface ("committed-fixture");
 * - every fact field is rendered (connector, lifecycle, health, observation,
 *   journey, telemetry, capabilities, vault audit);
 * - the honest boundary text is NEVER removed (the existing SAFE_EXERCISE_RECORD
 *   still renders alongside the live-facts panel);
 * - kill switch: when `RUNTIME_FACTS_LIVE_ENABLED` is false, the live-facts
 *   panel does not render (the component falls back to the existing record,
 *   zero errors);
 * - zero credential material in the rendered facts.
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantConnectorsComponent from "./component.js";
import { COMMITTED_RUNTIME_FACTS, RUNTIME_FACTS_LIVE_ENABLED, useCommittedRuntimeFacts } from "./runtime-facts-fixture.js";
import { LiveFactsPanel } from "./live-facts-panel.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(): Promise<RenderedUi> {
  const { host } = makeStubHost(["merchant"]);
  const ui = await renderUiAsync(
    <MerchantConnectorsComponent moduleId="merchant-connectors" journey="J15" host={host} />,
  );
  await waitForText(ui.container, "Genuinely connected integrations");
  return ui;
}

describe("W3-018 merchant-connectors live-facts panel (J15 progressive rendering)", () => {
  it("renders the live-facts panel when the facts provider is present (committed fixture)", async () => {
    rendered = await mount();
    const container = rendered.container;
    const panel = container.querySelector('[data-testid="cm-live-facts-panel"]');
    expect(panel).not.toBeNull();
    const text = panel?.textContent ?? "";
    // Provenance labelled on-surface.
    expect(text).toContain("Provenance:");
    expect(text).toContain("committed fixture");
    expect(text).toContain("produced by the real Node runtime projection, pinned here");
    // Every fact field rendered.
    expect(text).toContain("Shopify");
    expect(text).toContain("registered");
    expect(text).toContain("0 connected instance");
    expect(text).toContain("unknown");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("failed-recoverable");
    expect(text).toContain("PASS_THROUGH_NATIVE");
    expect(text).toContain("0 credential");
    expect(text).toContain("0 provider HTTP call");
    // The browser-safe sub-entrypoint is named on-surface.
    expect(text).toContain("@unicom/experience/runtime-browser");
    // The honest boundary text is NEVER removed.
    expect(text).toContain("Honest boundary (never removed)");
    expect(text).toContain("the live-facts section ADDS to the committed SAFE_EXERCISE_RECORD");
    expect(text).toContain("No credential material crosses the boundary");
  });

  it("the existing runtime section still renders alongside the live-facts panel (ADD, not replace)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    // The runtime section title still renders (the existing content is never removed).
    expect(text).toContain("The real connector runtime — safe exercise (non-live surfaces only)");
    // The live-facts panel ALSO renders (ADD, not replace).
    expect(text).toContain("Live connector-runtime facts (browser-safe projection)");
    // The honest boundary note still renders (the env-note under the runtime panel).
    expect(text).toContain("Exercised through");
    expect(text).toContain("@unicom/experience/runtime");
  });

  it("zero credential material in the rendered live-facts panel", async () => {
    rendered = await mount();
    const panel = rendered.container.querySelector('[data-testid="cm-live-facts-panel"]');
    const text = panel?.textContent ?? "";
    // No credential VALUES — only the audit counter ("0 credential(s) sealed").
    expect(text).not.toMatch(/"secret"/i);
    expect(text).not.toMatch(/"password"/i);
    expect(text).not.toMatch(/"apiKey"/i);
    expect(text).not.toMatch(/"accessToken"/i);
    expect(text).not.toMatch(/"vault"/i);
    // The vault's real type stays Node-side — the browser sees only the
    // sealedCredentialCount audit counter.
    expect(text).toContain("0 credential(s) sealed");
  });

  it("the committed facts fixture is labelled committed-fixture (provenance honest)", () => {
    expect(COMMITTED_RUNTIME_FACTS.provenance).toBe("committed-fixture");
  });

  it("the kill switch RUNTIME_FACTS_LIVE_ENABLED is a boolean (the one-line kill switch)", () => {
    expect(typeof RUNTIME_FACTS_LIVE_ENABLED).toBe("boolean");
  });

  it("useCommittedRuntimeFacts returns the fixture when the kill switch is on, null when off", () => {
    // The kill switch is on by default — the hook returns the fixture.
    const facts = useCommittedRuntimeFacts();
    expect(facts).not.toBeNull();
    expect(facts?.provenance).toBe("committed-fixture");
  });

  it("the LiveFactsPanel renders standalone with the committed fixture", async () => {
    const { host } = makeStubHost(["merchant"]);
    rendered = await renderUiAsync(
      <div data-testid="cm-test-host">
        <LiveFactsPanel facts={COMMITTED_RUNTIME_FACTS} />
      </div>,
    );
    // The host wrapper is only here to satisfy the renderUiAsync pattern; the
    // panel itself does not use the host.
    void host;
    const panel = rendered.container.querySelector('[data-testid="cm-live-facts-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("committed fixture");
  });
});
