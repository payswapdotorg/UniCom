/**
 * W2-020 — System-surface Deployment-readiness section tests.
 *
 * Covers:
 * - the section renders from the committed fixture
 * - every capability kind renders with its adapter + replaceable guarantee
 * - the config surface renders the classification (demo | live-gated | neutral)
 * - the live-gated keys are visibly marked
 * - the verification results render per check
 * - the standing gates render their true status (🔒 NOT_AUTHORIZED)
 * - the non-live note renders
 */
import { afterEach, describe, expect, it } from "vitest";
import { CommerceHostApp } from "./CommerceHostApp.js";
import { renderUi, textOf } from "./test-utils.js";
import type { RenderedUi } from "./test-utils.js";
import { DEPLOYMENT_READINESS_FIXTURE, STANDING_GATES } from "./fixtures/deployment-readiness-fixture.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  if (window.location.pathname !== "/") {
    window.history.replaceState({}, "", "/");
  }
});

async function navigateToSystem(): Promise<RenderedUi> {
  window.history.replaceState({}, "", "/commerce/system");
  rendered = renderUi(<CommerceHostApp />);
  // Wait for lazy modules to resolve
  await new Promise((r) => setTimeout(r, 200));
  return rendered;
}

describe("W2-020 Deployment readiness section — renders from the fixture", () => {
  it("the section renders with the DEMO label + ALL CHECKS PASS chip", async () => {
    rendered = await navigateToSystem();
    const section = rendered.container.querySelector('[data-testid="cm-deployment-readiness"]');
    expect(section).not.toBeNull();
    const text = textOf(section as HTMLElement);
    expect(text).toContain("Deployment readiness");
    expect(text).toContain("DEMO");
    expect(text).toContain("ALL CHECKS PASS");
  });

  it("the bundle identity renders (lineage commit + toolchain + inventory digest)", async () => {
    rendered = await navigateToSystem();
    const text = textOf(rendered.container);
    expect(text).toContain(DEPLOYMENT_READINESS_FIXTURE.lineage.commit.slice(0, 12));
    expect(text).toContain(DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.inventoryDigest);
  });

  it("every capability kind renders with its adapter + the replaceable guarantee", async () => {
    rendered = await navigateToSystem();
    const caps = rendered.container.querySelectorAll('[data-testid="cm-deployment-capabilities"] .cm-journey-item');
    expect(caps.length).toBe(DEPLOYMENT_READINESS_FIXTURE.capabilities.length);
    const text = textOf(rendered.container);
    for (const cap of DEPLOYMENT_READINESS_FIXTURE.capabilities) {
      expect(text).toContain(cap.kind);
      expect(text).toContain(cap.adapter);
    }
    const replaceableChips = rendered.container.querySelectorAll('[data-testid="cm-capability-replaceable"]');
    expect(replaceableChips.length).toBe(DEPLOYMENT_READINESS_FIXTURE.capabilities.length);
  });

  it("the config surface renders the classification for every key", async () => {
    rendered = await navigateToSystem();
    const entries = rendered.container.querySelectorAll('[data-testid="cm-deployment-config-surface"] .cm-journey-item');
    expect(entries.length).toBe(DEPLOYMENT_READINESS_FIXTURE.configSurface.length);
    const text = textOf(rendered.container);
    for (const entry of DEPLOYMENT_READINESS_FIXTURE.configSurface) {
      expect(text).toContain(entry.key);
      expect(text).toContain(entry.classification);
    }
  });

  it("the live-gated keys are visibly marked (warn chip class)", async () => {
    rendered = await navigateToSystem();
    const classifications = rendered.container.querySelectorAll('[data-testid="cm-config-classification"]');
    const liveGated = [...classifications].filter((c) => c.textContent === "live-gated");
    expect(liveGated.length).toBe(DEPLOYMENT_READINESS_FIXTURE.configSurface.filter((e) => e.classification === "live-gated").length);
  });

  it("the verification results render per check", async () => {
    rendered = await navigateToSystem();
    const checks = rendered.container.querySelectorAll('[data-testid="cm-deployment-verification"] .cm-journey-item');
    expect(checks.length).toBe(DEPLOYMENT_READINESS_FIXTURE.verification.length);
    const text = textOf(rendered.container);
    for (const v of DEPLOYMENT_READINESS_FIXTURE.verification) {
      expect(text).toContain(v.check);
      expect(text).toContain(v.result);
    }
  });

  it("the standing gates render their true status (🔒 NOT_AUTHORIZED)", async () => {
    rendered = await navigateToSystem();
    const gates = rendered.container.querySelector('[data-testid="cm-standing-gates"]');
    expect(gates).not.toBeNull();
    const text = textOf(gates as HTMLElement);
    for (const g of STANDING_GATES) {
      expect(text).toContain(g.gate);
      expect(text).toContain(g.status);
      expect(text).toContain("NOT_AUTHORIZED");
    }
  });

  it("the non-live note renders", async () => {
    rendered = await navigateToSystem();
    const note = rendered.container.querySelector('[data-testid="cm-non-live-note"]');
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain("deploys NOTHING");
    expect(note?.textContent).toContain("connects NOTHING");
    expect(note?.textContent).toContain("reads NO credential");
  });
});
