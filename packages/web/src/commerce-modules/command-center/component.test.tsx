/**
 * command-center component tests (W1-027): the operator-approved Command
 * Center ported as the commerce home — the seven sections render and switch,
 * the heartbeat strip stays visible on every section, the pinned host laws
 * (J19 registry rows, scenario card) hold inside the Command section, and
 * the ported interaction flows work end-to-end on the deterministic seeds:
 * the 3-step connect wizard (store joins the ring), decision approve/decline
 * with the resolved list, skill install/uninstall per store, and the
 * Commander chat with the plan-tick animation + evidence chips.
 *
 * Demo-mode law: a fetch spy asserts ZERO network calls through every flow.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { JSX } from "react";

import { CommerceHostProvider } from "../../commerce-host/shell/CommerceHostContext.js";
import { commerceModuleRegistry } from "../../commerce-host/module-registry.js";
import { CommandCenterView } from "./component.js";
import { CommandCenterHome } from "./sections.js";
import { CommandCenterProvider } from "./state.js";
import { fabricateDemoCatalog } from "./data.js";
import type { FetchLike } from "./api.js";
import { clickButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

/**
 * Poll with REAL timers until the condition holds (the flushLazy pattern).
 *
 * The wizard/plan-tick drives itself through React effects scheduled on real
 * macrotasks (the scheduler's MessageChannel), so fake timers starve the chain
 * between steps — real time is the honest clock for these flows.
 */
async function waitFor(condition: () => boolean, timeoutMs = 9000, stepMs = 40): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    });
  }
}

function renderCenter(): RenderedUi {
  rendered = renderUi(
    <CommerceHostProvider>
      <CommandCenterView />
    </CommerceHostProvider>,
  );
  return rendered;
}

/** Click one rail section button by its label (Command/Stores/…/Skills). */
function clickSection(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll(".cmcc-rail .cmcc-nav-button")].find(
    (entry) => entry.textContent?.startsWith(label),
  );
  if (!button) throw new Error(`section button not found: ${label}`);
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

/** Click the first button whose text CONTAINS the fragment (platform tiles). */
function clickButtonContaining(container: HTMLElement, fragment: string): void {
  const button = [...container.querySelectorAll("button")].find((entry) =>
    entry.textContent?.includes(fragment),
  );
  if (!button) throw new Error(`button containing "${fragment}" not found`);
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

/** Click the button with the fragment inside one card (data-testid scope). */
function clickInCard(container: HTMLElement, testid: string, fragment: string): void {
  const card = container.querySelector(`[data-testid="${testid}"]`);
  const button = [...(card?.querySelectorAll("button") ?? [])].find((entry) =>
    entry.textContent?.includes(fragment),
  );
  if (!button) throw new Error(`button "${fragment}" not found in ${testid}`);
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

/** Spy on global fetch — demo mode must never call it. */
function spyOnFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const SECTION_TESTIDS = [
  "cmcc-section-command",
  "cmcc-section-stores",
  "cmcc-section-missions",
  "cmcc-section-chat",
  "cmcc-section-decisions",
  "cmcc-section-watch",
  "cmcc-section-skills",
] as const;

/** The rail label → the section's data-testid (one section renders at a time). */
const SECTION_BY_LABEL: readonly [label: string, testid: string][] = [
  ["Command", "cmcc-section-command"],
  ["Stores", "cmcc-section-stores"],
  ["Missions", "cmcc-section-missions"],
  ["Commander", "cmcc-section-chat"],
  ["Decisions", "cmcc-section-decisions"],
  ["Watch", "cmcc-section-watch"],
  ["Skills", "cmcc-section-skills"],
];

describe("the command-center module registration (module contract)", () => {
  it("registers through the module contract with zero registry warnings", () => {
    const module = commerceModuleRegistry.moduleById("command-center");
    expect(module).not.toBeNull();
    expect(module?.owner).toBe("W1-011");
    expect(module?.status.kind).toBe("ready");
    expect(module?.nav[0]?.path).toBe("/commerce/command-center");
    // No journey claims (the 19-journey discovery stays with the journey
    // modules + the home registry rows) and no registry warnings at all.
    expect(module?.journeys).toEqual([]);
    expect(commerceModuleRegistry.warnings).toEqual([]);
  });
});

describe("the Command Center home (all seven sections + heartbeat)", () => {
  it("renders the Command section by default with the pinned host laws", () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    const text = textOf(container);
    expect(container.querySelector('[data-testid="cmcc-section-command"]')).not.toBeNull();
    expect(text).toContain("UNiCOM Commerce");
    expect(text).toContain("Overnight brief");
    expect(text).toContain("Revenue 7d");
    // Host law: the scenario card + the J19 registry rows live in the Command section.
    expect(text).toContain("Your scenario");
    expect(text).toContain("Harbor Lane Print Studio");
    expect(container.querySelectorAll(".cm-journey-item")).toHaveLength(19);
    expect(text).toContain("19 of the 19 journey families are rendered right now.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switches through all seven sections; the heartbeat strip never unmounts", () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    // One section renders at a time: each click must mount exactly its own
    // section while the heartbeat strip stays on screen through every switch.
    for (const [label, testid] of SECTION_BY_LABEL) {
      clickSection(container, label);
      expect(container.querySelector(`[data-testid="${testid}"]`)).not.toBeNull();
      expect(container.querySelector('[data-testid="cmcc-heartbeat"]')).not.toBeNull();
    }
    // All seven ids are the complete set (one per rail button).
    expect(SECTION_BY_LABEL.map(([, testid]) => testid).sort()).toEqual(
      [...SECTION_TESTIDS].sort(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the seed data honestly: three stores, three missions, three decisions, six skills", () => {
    const { container } = renderCenter();
    const text = textOf(container);
    for (const name of ["Halcyon Goods", "Mountain Reads", "Kaia Ceramics"]) {
      expect(text).toContain(name);
    }
    clickSection(container, "Missions");
    expect(textOf(container)).toContain("Spring price audit across all stores");
    expect(textOf(container)).toContain("Etsy listing refresh — Kaia Ceramics");
    clickSection(container, "Decisions");
    expect(textOf(container)).toContain("Reprice 9 high-impact SKUs — Halcyon Goods");
    clickSection(container, "Skills");
    expect(textOf(container)).toContain("Price Sentinel");
    expect(textOf(container)).toContain("DEMO");
  });
});

describe("the connect wizard (3 steps, fabricated initial catalog)", () => {
  it("walks platform picker → form → progress → the store joins the ring", async () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    clickSection(container, "Stores");
    clickButton(container, "Connect a store");
    expect(container.querySelector('[data-testid="cmcc-connect-dialog"]')).not.toBeNull();
    // Step 1: the platform picker (tiles carry glyph + catalog text).
    clickButtonContaining(container, "Shopify");
    expect(textOf(container)).toContain("Store name");
    // Step 2: the credentials/name form (defaults applied when left blank).
    clickButtonContaining(container, "Authorize Shopify");
    // Step 3: the progress steps drive themselves (900ms each, then 250ms).
    await waitFor(() => textOf(container).includes("My Shopify store"));
    // The store joins the ring with its fabricated initial catalog + toast.
    expect(textOf(container)).toContain("my-store.shopify.com");
    expect(textOf(container)).toContain("Store connected");
    // The watch ring records the fabricated initial catalog (the event text).
    clickSection(container, "Watch");
    expect(textOf(container)).toContain("initial catalog sync queued");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is deterministic: the same inputs fabricate the same catalog", async () => {
    // The pure fabrication is a function of its inputs — same in, same out.
    const input = { platform: "etsy" as const, name: "My Etsy store", domain: "my-store.etsy.com" };
    expect(fabricateDemoCatalog(input)).toEqual(fabricateDemoCatalog(input));
    const catalog = fabricateDemoCatalog(input);
    expect(catalog.products).toBeGreaterThanOrEqual(40);
    expect(catalog.products).toBeLessThanOrEqual(120);
    // And the wizard lands exactly those numbers in the ring record.
    const { container } = renderCenter();
    clickSection(container, "Stores");
    clickButton(container, "Connect a store");
    clickButtonContaining(container, "Etsy");
    clickButtonContaining(container, "Authorize Etsy");
    await waitFor(() => textOf(container).includes("My Etsy store"));
    clickSection(container, "Watch");
    const recorded = /initial catalog sync queued \((\d+) products/.exec(textOf(container))?.[1];
    expect(recorded).toBe(String(catalog.products));
  });
});

describe("decision approve/decline with the resolved list", () => {
  it("approves d-1: the queue drops, the resolved list + watch ring record it", () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    act(() => {
      clickSection(container, "Decisions");
    });
    expect(container.querySelectorAll('[data-testid="cmcc-approve"]')).toHaveLength(3);
    act(() => {
      clickButton(container, "Approve");
    });
    expect(container.querySelectorAll('[data-testid="cmcc-approve"]')).toHaveLength(2);
    expect(textOf(container)).toContain("Handled today");
    expect(textOf(container)).toContain("approved");
    expect(textOf(container)).toContain("Decision approved");
    act(() => {
      clickButton(container, "Decline");
    });
    expect(container.querySelectorAll('[data-testid="cmcc-approve"]')).toHaveLength(1);
    expect(textOf(container)).toContain("Decision declined");
    // The watch ring records both verdicts.
    act(() => {
      clickSection(container, "Watch");
    });
    const text = textOf(container);
    expect(text).toContain("Approved — Reprice 9 high-impact SKUs — Halcyon Goods");
    expect(text).toContain("Declined — ");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("skill install/uninstall per store", () => {
  it("installs Stock Scout on Halcyon and removes it again (chips + ring + toast)", () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    clickSection(container, "Skills");
    expect(textOf(container)).toContain("not installed anywhere yet");
    // The install buttons live one per skill CARD — scope to Stock Scout's card
    // (every uninstalled-on-Halcyon skill renders the same button label).
    clickInCard(container, "cmcc-skill-stock-scout", "Install on Halcyon Goods");
    expect(textOf(container)).toContain("✓ Halcyon Goods");
    expect(textOf(container)).toContain("Skill installed");
    // The watch ring records the install (dispatch event).
    clickSection(container, "Watch");
    expect(textOf(container)).toContain("Stock Scout installed on Halcyon Goods — initial sweep queued");
    clickSection(container, "Skills");
    clickInCard(container, "cmcc-skill-stock-scout", "Remove from Halcyon Goods");
    expect(textOf(container)).toContain("not installed anywhere yet");
    expect(textOf(container)).toContain("Skill removed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the Commander chat (plan-tick + evidence)", () => {
  it("replies with a 4-step plan that ticks to completion", async () => {
    const fetchSpy = spyOnFetch();
    const { container } = renderCenter();
    clickSection(container, "Commander");
    const input = container.querySelector<HTMLInputElement>("input.cmcc-input--chat")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      set?.call(input, "Why did Etsy revenue jump 24%?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (container.querySelector("form.cmcc-chat-form button[type='submit']") as HTMLButtonElement).click();
    });
    expect(textOf(container)).toContain("Why did Etsy revenue jump 24%?");
    // The thinking state holds until the 700ms reply lands.
    expect(textOf(container)).toContain("orchestrator thinking…");
    await waitFor(() => textOf(container).includes("On it. Here's my plan"));
    // …then ticks one step every 900ms to completion (4 steps).
    await waitFor(() => {
      const plan = container.querySelector(".cmcc-plan");
      return (plan?.querySelectorAll(".cmcc-plan-step--done").length ?? 0) === 4;
    });
    const plan = container.querySelector(".cmcc-plan");
    expect(plan?.querySelectorAll(".cmcc-plan-step--done")).toHaveLength(4);
    expect(plan?.querySelector(".cmcc-plan-cursor")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a suggestion chip through the same flow", async () => {
    const { container } = renderCenter();
    clickSection(container, "Commander");
    clickButton(container, "Reprice the linen throw");
    expect(textOf(container)).toContain("Reprice the linen throw");
    await waitFor(() => textOf(container).includes("On it. Here's my plan"));
    await waitFor(() => {
      const plan = container.querySelector(".cmcc-plan");
      return (plan?.querySelectorAll(".cmcc-plan-step--done").length ?? 0) === 4;
    });
    expect(container.querySelector(".cmcc-plan")?.querySelectorAll(".cmcc-plan-step--done")).toHaveLength(4);
  });
});

describe("the seam is injectable: live mode hydrates + falls back softly", () => {
  it("hydrates from the commerce API when it lands (live: true)", async () => {
    const calls: { url: string }[] = [];
    const fetchImpl = (url: string): Promise<Response> => {
      calls.push({ url });
      const body = (() => {
        if (url.endsWith("/api/stores")) return { stores: [{ id: "live-store", name: "Live Store", domain: "live.example", platform: "shopify", health: "healthy", lastSync: "1 min ago", lastAudit: "06:40Z", products: 10, orders7d: 5, revenue7d: 900, delta7d: 1, apiUsage: 5, installedSkills: [] }] };
        if (url.endsWith("/api/missions")) return { missions: [] };
        if (url.startsWith("https://commerce.example/api/decisions")) return { decisions: [] };
        if (url.endsWith("/api/watch?limit=50")) return { events: [] };
        if (url.endsWith("/api/skills")) return { skills: [] };
        if (url.startsWith("https://commerce.example/api/commander/history")) return { messages: [] };
        if (url.endsWith("/api/brief")) return { brief: { date: "2026-10-24", summary: "Live brief.", checks: ["live check"], numbers: [] } };
        return {};
      })();
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    };
    rendered = renderUi(
      <CommerceHostProvider>
        <CommandCenterViewWrapped fetchImpl={fetchImpl} />
      </CommerceHostProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const text = textOf(rendered.container);
    expect(text).toContain("Live Store");
    expect(text).toContain("Live brief.");
    expect(rendered.container.querySelector(".cmcc-heartbeat-mode")?.textContent).toContain("live");
  });

  it("falls back to the demo seeds when any required fetch fails", async () => {
    const fetchImpl = (): Promise<Response> => Promise.reject(new Error("down"));
    rendered = renderUi(
      <CommerceHostProvider>
        <CommandCenterViewWrapped fetchImpl={fetchImpl} />
      </CommerceHostProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const text = textOf(rendered.container);
    expect(text).toContain("Halcyon Goods");
    expect(text).toContain("Overnight brief");
    expect(rendered.container.querySelector(".cmcc-heartbeat-mode")?.textContent).toContain("demo");
  });
});

/** CommandCenterView with an injected fetch impl (the seam, live for tests). */
function CommandCenterViewWrapped({ fetchImpl }: { readonly fetchImpl: FetchLike }): JSX.Element {
  return (
    <CommandCenterProvider config={{ baseUrl: "https://commerce.example", source: "test" }} fetchImpl={fetchImpl}>
      <CommandCenterHome />
    </CommandCenterProvider>
  );
}
