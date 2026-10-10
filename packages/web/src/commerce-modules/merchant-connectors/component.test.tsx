/**
 * merchant-connectors component tests (J15, W3-016) — RUNTIME-DRIVEN:
 *
 * - the guarded runtime load SUCCEEDS in this (node) environment and the
 *   surface renders the REAL experience connector runtime's own outcomes:
 *   the registered Shopify adapter (lifecycle registered, 0 connected
 *   instances), the observed health snapshot (UNKNOWN — never down — with
 *   the runtime's own reason), the canonical capability declaration, the
 *   safe journey's honest refusal (failed-recoverable,
 *   CATALOG_ONLY_NO_CONNECTED_INSTANCE), the execution-mode telemetry
 *   rollups and the W3-005 health-surface recovery plan;
 * - the committed SAFE_EXERCISE_RECORD is PINNED against the live runtime's
 *   output (the fixtures cannot silently drift from the runtime truth);
 * - the browser boundary panel (rendered when the runtime barrel cannot be
 *   evaluated — a browser today) is pinned directly: verbatim reason, honest
 *   UNAVAILABLE (not an error), and the committed test-pinned record;
 * - safety counters: 0 provider HTTP calls (the tripwire port was never
 *   reached), 0 sealed credentials (the real vault stays empty);
 * - connected = NONE today, runtime-derived (never implied otherwise);
 * - the fixture board differentiates disconnected/demo/unavailable with a
 *   per-row basis (runtime-verified vs fixture) and the REAL transport
 *   descriptors from the @unicom/experience contract registry;
 * - a connection attempt journals ATTEMPTED → DISCONNECTED with the honest
 *   reason — never a fabricated success; unavailable connectors offer no
 *   attempt path; the demo file feed shows exactly the committed rows,
 *   local-only, DEMO-labelled; everything action-shaped is permission-gated
 *   (connectors.manage) with the holder named; reset restores.
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantConnectorsComponent from "./component.js";
import { loadConnectorsSpace } from "./runtime.js";
import { BrowserBoundaryPanel } from "./component-parts.js";
import { SAFE_EXERCISE_RECORD } from "./fixtures.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, findButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
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
  // The runtime space seeds asynchronously (guarded dynamic import).
  await waitForText(ui.container, "Genuinely connected integrations");
  return ui;
}

describe("merchant-connectors (J15) — the real connector runtime (safe exercise)", () => {
  it("renders the runtime's own lifecycle, health, capabilities and journey evidence", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo.myshopify.com");
    const text = textOf(rendered.container);
    // The registered REAL adapter — registered, never connected.
    expect(text).toContain("Shopify — harbor-lane-demo.myshopify.com");
    expect(text).toContain("REGISTERED — not connected");
    expect(text).toContain("connector connector-1-shopify-harbor-lane-demo.myshopify.com · transport rest");
    expect(text).toContain("Lifecycle is registered with 0 connected instances");
    // Health observation: UNKNOWN honestly, with the runtime's own reason.
    expect(text).toContain("status unknown · adapter has no connected instance yet · checked Oct 12, 09:00 UTC · evidence: adapter health probe completed");
    // Latest canonical observation.
    expect(text).toContain("status UNKNOWN · freshness UNKNOWN · adapter has no connected instance yet");
    // Capability declaration: the canonical catalog, matrix-intersected modes.
    expect(text).toContain("commerce.catalog.observe (PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER)");
    expect(text).toContain("commerce.listings.manage (PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER)");
    expect(text).toContain("commerce.orders.execute (PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER)");
    // The safe journey: the canonical gate's honest refusal, verbatim.
    expect(text).toContain("w3cn-journey-catalog-observe-1 · mode PASS_THROUGH_NATIVE · outcome failed-recoverable");
    expect(text).toContain("step observe-catalog: failed-recoverable (CATALOG_ONLY_NO_CONNECTED_INSTANCE)");
    expect(text).toContain("correlation journey-w3cn-journey-catalog-observe-1-w3cn-seed-1");
    // Execution-mode telemetry rollup.
    expect(text).toContain("PASS_THROUGH_NATIVE: 1 journeys — 0 succeeded, 1 failed-recoverable, 0 unknown");
    // The W3-005 health-surface recovery plan.
    expect(text).toContain("last journey Oct 12, 09:00 UTC · outcome failed-recoverable");
    expect(text).toContain("recovery: Try the operation again (the last run failed recoverably — a retry may succeed without changes)");
    // Safety counters: the exercise's own proof.
    expect(text).toContain("provider HTTP calls: 0 (the tripwire port was never reached)");
    expect(text).toContain("credentials sealed: 0 (the real vault stays empty)");
    // The precise safe-exercise label.
    expect(text).toContain("Adapter verified through its non-live surfaces; no live connection");
    expect(text).toContain("DEMO");
  });

  it("pins the committed safe-exercise record against the live runtime output (no drift)", async () => {
    const space = await loadConnectorsSpace();
    expect(space.kind).toBe("runtime");
    if (space.kind !== "runtime") return;
    const record = SAFE_EXERCISE_RECORD.outcomes;
    expect(space.lifecycle).toBe(record.lifecycle);
    expect(space.connectedInstanceCount).toBe(record.connectedInstanceCount);
    expect(space.health.status).toBe(record.healthStatus);
    expect(space.health.degradedReasons).toContain(record.healthReason);
    expect(space.observation?.status).toBe(record.observationStatus);
    expect(space.journey.journeyRef).toBe(record.journeyRef);
    expect(space.journey.mode).toBe(record.journeyMode);
    expect(space.journey.outcome).toBe(record.journeyOutcome);
    expect(space.journey.stepOutcomes[0]?.note).toBe(record.journeyBlockReason);
    expect(space.providerHttpCalls).toBe(record.providerHttpCalls);
    expect(space.sealedCredentialCount).toBe(record.sealedCredentials);
  });

  it("renders the honest browser boundary (runtime barrel not browser-evaluable) with the test-pinned record, never a fabricated runtime state", async () => {
    // In THIS (node) environment the guarded import succeeds, so the boundary
    // panel is rendered DIRECTLY with a representative thrown reason — the
    // panel's contract is what is pinned here: verbatim reason, an honest
    // UNAVAILABLE (not an error), and the committed safe-exercise record.
    const reason = "Module \"node:util\" has been externalized for browser compatibility.";
    const ui = await renderUiAsync(
      <BrowserBoundaryPanel reason={reason} />,
    );
    const text = textOf(ui.container);
    expect(text).toContain("Connector runtime panels");
    expect(text).toContain("UNAVAILABLE");
    // The chip's note (an accessible tooltip) says boundary, not error.
    const chip = ui.container.querySelector('[data-status="UNAVAILABLE"]');
    expect(chip?.getAttribute("title")).toBe(
      "Not browser-evaluable today — an honest boundary, not an error",
    );
    // The thrown reason is rendered VERBATIM, never paraphrased.
    expect(text).toContain(reason);
    // The committed, test-pinned safe-exercise record carries the runtime
    // truth to browser users — with the precise safe-exercise label.
    expect(text).toContain("Committed safe-exercise record (pinned by the module tests against the real runtime)");
    expect(text).toContain(SAFE_EXERCISE_RECORD.label);
    expect(text).toContain(SAFE_EXERCISE_RECORD.outcomes.journeyBlockReason);
    expect(text).toContain("0 provider HTTP calls");
    expect(text).toContain("0 sealed credentials");
    ui.unmount();
  });
});

describe("merchant-connectors (J15) — the honest board", () => {
  it("states connected = none today, runtime-derived, with no fabricated freshness", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    const text = textOf(rendered.container);
    expect(text).toContain("Genuinely connected integrations");
    expect(text).toContain("NONE_TODAY");
    expect(text).toContain("None. No marketplace, supplier portal, payment rail or accounting backend is connected right now");
    expect(text).toContain("The one REGISTERED adapter below is deliberately NOT connected");
    expect(text).toContain("no fabricated 'last synced'");
    expect(text).toContain("DEMO");
  });

  it("differentiates the board states with a per-row basis and the real transport descriptors", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    const text = textOf(rendered.container);
    expect(text).toContain("Northwind supplier portal");
    expect(text).toContain("DISCONNECTED");
    expect(text).toContain("basis: fixture · transport REST API (rest, commands+observations, untrusted content)");
    expect(text).toContain("CSV stock file feed (demo)");
    expect(text).toContain("basis: fixture · transport CSV files (file-feed, observations only, untrusted content)");
    expect(text).toContain("Supplier catalog browser-sync");
    expect(text).toContain("basis: fixture · transport Controlled browser login (browser, commands+observations, untrusted content)");
    expect(text).toContain("Live commerce rail (payment provider)");
    expect(text).toContain("basis: fixture · transport Live stream (live-commerce, commands+observations, untrusted content)");
    expect(text).toContain("Accounting export");
    expect(text).toContain("no transport wired — no provider exists");
    expect(text).toContain("UNAVAILABLE is not DISCONNECTED (there is nothing to disconnect)");
    expect(text).toContain("a live rail is never simulated");
    expect(text).toContain("REGISTERED is not CONNECTED");
  });

  it("an attempt journals ATTEMPTED → DISCONNECTED with the honest reason, never success", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    clickButton(rendered.container, "Attempt connection — Northwind supplier portal");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the connection");
    await waitForText(rendered.container, "ATTEMPTED");
    const text = textOf(rendered.container);
    expect(text).toContain("DISCONNECTED");
    expect(text).toContain("no live credentials or provider contract exists in this demo environment");
    // Attempt is not success: the connected count stays none.
    expect(text).toContain("None. No marketplace, supplier portal, payment rail or accounting backend is connected right now");
  });

  it("unavailable connectors offer no attempt path (nothing to attempt)", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    const text = textOf(rendered.container);
    expect(text).toContain("No attempt is offered");
    expect(text).toContain("an attempt would be theater");
    expect(findButton(rendered.container, "Attempt connection — Supplier catalog browser-sync")).toBeNull();
    expect(findButton(rendered.container, "Attempt connection — Live commerce rail (payment provider)")).toBeNull();
  });

  it("the demo file-feed import shows exactly the committed fixture rows, local-only", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    clickButton(rendered.container, "Run the demo file-feed import (local, deterministic)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Run the demo import");
    await waitForText(rendered.container, "Demo file-feed import (run 1)");
    const text = textOf(rendered.container);
    expect(text).toContain("sku-feed-flour");
    expect(text).toContain("supplier units 120");
    expect(text).toContain("supplier DATA (never trusted instructions)");
    expect(text).toContain("recorded on this screen only");
    expect(text).toContain("carries observations only (it can never carry commands)");
  });

  it("blocks every action without connectors.manage, naming the holder", async () => {
    rendered = await mount(["buyer"]);
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires connectors.manage");
    expect(text).toContain("held by merchant");
    expect(findButton(rendered.container, "Attempt connection — Northwind supplier portal")).toBeNull();
    expect(findButton(rendered.container, "Run the demo file-feed import")).toBeNull();
  });

  it("reset restores the seeded space and clears the local journals", async () => {
    rendered = await mount();
    await waitForText(rendered.container, "Shopify — harbor-lane-demo");
    clickButton(rendered.container, "Attempt connection — Northwind supplier portal");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the connection");
    await waitForText(rendered.container, "ATTEMPTED");
    clickButton(rendered.container, "Reset demo data");
    await waitForText(rendered.container, "Shopify — harbor-lane-demo.myshopify.com");
    const text = textOf(rendered.container);
    // The attempt journal is gone; the runtime space re-seeded identically.
    expect(text).not.toContain("attempt 1");
    expect(text).toContain("Lifecycle is registered with 0 connected instances");
    expect(text).toContain("w3cn-journey-catalog-observe-1");
  });
});
