/**
 * J18 shared state components tests — pin the honest-state vocabulary law
 * (POST-V3 blocker #7):
 * - all nine preserved lifecycle states render, each with its honest
 *   classification;
 * - non-failure states (OFFERED, PENDING, ATTEMPTED, OVERDUE) never take
 *   failure or denied visuals;
 * - UNKNOWN (SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN) never renders as
 *   failed — and never as success;
 * - the four surface phases (loading / empty / error / offline) render as
 *   DISTINCT panels, with failed and unknown error classes visually distinct.
 */
import { describe, expect, it } from "vitest";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LifecycleStateChip,
  LifecycleStateItem,
  LoadingStatePanel,
  OfflineStatePanel,
  SurfaceStatePanel,
  lifecycleClass,
  lifecycleNote,
} from "./index.js";
import type { CommerceLifecycleState } from "./index.js";
import { renderUi, textOf } from "../shell/test-utils.js";
import type {
  EmptyStateView,
  ErrorStateView,
  LoadingStateView,
  OfflineStateView,
  SurfaceState,
} from "@unicom/experience";

const ALL_LIFECYCLE_STATES: readonly CommerceLifecycleState[] = [
  "OFFERED",
  "PENDING",
  "ATTEMPTED",
  "OVERDUE",
  "SETTLEMENT-UNKNOWN",
  "NOT-PROMOTED-UNKNOWN",
  "FAILED",
  "DENIED",
  "COMPLETED",
];

const NON_FAILURE_STATES: readonly CommerceLifecycleState[] = [
  "OFFERED",
  "PENDING",
  "ATTEMPTED",
  "OVERDUE",
  "SETTLEMENT-UNKNOWN",
  "NOT-PROMOTED-UNKNOWN",
  "COMPLETED",
];

const SAMPLE_LOADING: LoadingStateView = {
  stateKind: "loading",
  summary: "Comparing offers across sellers…",
  slowNote: "Freshness checks can take a few seconds.",
};

const SAMPLE_EMPTY: EmptyStateView = {
  stateKind: "empty",
  reasonSummary: "No offers match your intent yet.",
  firstAction: {
    actionLabel: "Describe what you need",
    actionKind: "navigate",
    targetSurfaceId: "buyer-intent-canvas",
    rationale: "A clearer intent lets sellers answer precisely.",
  },
  teachingNote: "Empty states always propose the next action.",
};

const sampleError = (failureClass: "failed" | "unknown"): ErrorStateView => ({
  stateKind: "error",
  failureClass,
  summary: `The ${failureClass} sample summary.`,
  severity: "medium",
  retryable: true,
  evidence: [],
});

const SAMPLE_OFFLINE: OfflineStateView = {
  stateKind: "offline",
  degradationNote: "You are offline. Counts and observations queue locally.",
  stillAvailable: ["browsing loaded data", "queueing observations"],
  surfacesObservationQueue: true,
};

describe("lifecycle classification law (J18)", () => {
  it("classifies every state of the nine-state vocabulary", () => {
    expect(lifecycleClass("OFFERED")).toBe("informational");
    expect(lifecycleClass("PENDING")).toBe("informational");
    expect(lifecycleClass("ATTEMPTED")).toBe("informational");
    expect(lifecycleClass("OVERDUE")).toBe("informational");
    expect(lifecycleClass("SETTLEMENT-UNKNOWN")).toBe("unknown");
    expect(lifecycleClass("NOT-PROMOTED-UNKNOWN")).toBe("unknown");
    expect(lifecycleClass("FAILED")).toBe("failed");
    expect(lifecycleClass("DENIED")).toBe("denied");
    expect(lifecycleClass("COMPLETED")).toBe("completed");
  });

  it("never collapses a non-failure state into failed or denied", () => {
    for (const state of NON_FAILURE_STATES) {
      const cls = lifecycleClass(state);
      expect(cls, `${state} must not be failed`).not.toBe("failed");
      expect(cls, `${state} must not be denied`).not.toBe("denied");
    }
  });

  it("renders every lifecycle state as a chip with its own label", () => {
    for (const state of ALL_LIFECYCLE_STATES) {
      const rendered = renderUi(<LifecycleStateChip state={state} />);
      expect(textOf(rendered.container)).toContain(state);
      rendered.unmount();
    }
  });

  it("gives every state an honest human note (never empty)", () => {
    for (const state of ALL_LIFECYCLE_STATES) {
      expect(lifecycleNote(state).length).toBeGreaterThan(10);
    }
  });
});

describe("LifecycleStateItem (record row)", () => {
  it("renders the label, the state, the detail and the honest note", () => {
    const rendered = renderUi(
      <LifecycleStateItem
        label="Quote request, 40 boxes A3 card stock"
        state="PENDING"
        detail="Waiting for the supplier's answer."
        demo={true}
      />,
    );
    const text = textOf(rendered.container);
    expect(text).toContain("Quote request, 40 boxes A3 card stock");
    expect(text).toContain("PENDING");
    expect(text).toContain("Waiting for the supplier's answer.");
    expect(text).toContain("Pending is not an error");
  });

  it("labels demo records visibly and omits the tag for non-demo records", () => {
    const demo = renderUi(
      <LifecycleStateItem label="l" state="OFFERED" detail="d" demo={true} />,
    );
    expect(textOf(demo.container)).toContain("DEMO");
    demo.unmount();
    const live = renderUi(
      <LifecycleStateItem label="l" state="OFFERED" detail="d" demo={false} />,
    );
    expect(textOf(live.container)).not.toContain("DEMO");
  });
});

describe("surface phase panels (typed views from @unicom/experience)", () => {
  it("renders the loading panel with summary and slow note", () => {
    const rendered = renderUi(<LoadingStatePanel view={SAMPLE_LOADING} />);
    const text = textOf(rendered.container);
    expect(text).toContain("Comparing offers across sellers…");
    expect(text).toContain("Freshness checks can take a few seconds.");
    expect(rendered.container.querySelector('[data-testid="cm-loading"]')).not.toBeNull();
  });

  it("renders the empty panel with its first action and rationale", () => {
    const rendered = renderUi(<EmptyStatePanel view={SAMPLE_EMPTY} />);
    const text = textOf(rendered.container);
    expect(text).toContain("No offers match your intent yet.");
    expect(text).toContain("Describe what you need");
    expect(text).toContain("A clearer intent lets sellers answer precisely.");
    expect(rendered.container.querySelector('[data-testid="cm-empty"]')).not.toBeNull();
  });

  it("renders FAILED and UNKNOWN errors as visually DISTINCT panels", () => {
    const failed = renderUi(<ErrorStatePanel view={sampleError("failed")} />);
    const failedText = textOf(failed.container);
    expect(failedText).toContain("Something failed");
    expect(failedText).toContain("FAILED · medium");
    expect(failedText).not.toContain("UNKNOWN — not a failure");
    expect(
      failed.container.querySelector('[data-testid="cm-error"]')?.getAttribute("data-failure-class"),
    ).toBe("failed");
    failed.unmount();

    const unknown = renderUi(<ErrorStatePanel view={sampleError("unknown")} />);
    const unknownText = textOf(unknown.container);
    // UNKNOWN never poses as a failure (INVARIANT 10)…
    expect(unknownText).toContain("Outcome unknown");
    expect(unknownText).toContain("UNKNOWN — not a failure");
    expect(unknownText).not.toContain("Something failed");
    expect(
      unknown.container.querySelector('[data-testid="cm-error"]')?.getAttribute("data-failure-class"),
    ).toBe("unknown");
  });

  it("renders the offline panel with what still works", () => {
    const rendered = renderUi(<OfflineStatePanel view={SAMPLE_OFFLINE} />);
    const text = textOf(rendered.container);
    expect(text).toContain("Offline");
    expect(text).toContain("You are offline. Counts and observations queue locally.");
    expect(text).toContain("browsing loaded data");
    expect(rendered.container.querySelector('[data-testid="cm-offline"]')).not.toBeNull();
  });
});

describe("SurfaceStatePanel (exactly one phase renders)", () => {
  it("delegates each phase to its panel and ready to the caller's renderer", () => {
    const loading: SurfaceState<LoadingStateView> = { phase: "loading", loading: SAMPLE_LOADING };
    const empty: SurfaceState<EmptyStateView> = { phase: "empty", empty: SAMPLE_EMPTY };
    const error: SurfaceState<ErrorStateView> = { phase: "error", error: sampleError("failed") };
    const offline: SurfaceState<OfflineStateView> = { phase: "offline", offline: SAMPLE_OFFLINE };
    const ready: SurfaceState<{ value: string }> = {
      phase: "ready",
      data: { value: "the-ready-payload" },
    };

    const cases: readonly { readonly state: SurfaceState<never>; readonly marker: string }[] = [
      { state: loading as unknown as SurfaceState<never>, marker: "cm-loading" },
      { state: empty as unknown as SurfaceState<never>, marker: "cm-empty" },
      { state: error as unknown as SurfaceState<never>, marker: "cm-error" },
      { state: offline as unknown as SurfaceState<never>, marker: "cm-offline" },
    ];
    for (const testCase of cases) {
      const rendered = renderUi(
        <SurfaceStatePanel state={testCase.state} renderReady={() => <div />} />,
      );
      expect(
        rendered.container.querySelector(`[data-testid="${testCase.marker}"]`),
        `phase ${testCase.state.phase} must render its own panel`,
      ).not.toBeNull();
      rendered.unmount();
    }

    const readyRendered = renderUi(
      <SurfaceStatePanel state={ready} renderReady={(view) => <div>{view.value}</div>} />,
    );
    expect(textOf(readyRendered.container)).toContain("the-ready-payload");
  });
});
