/**
 * Minimal jsdom render helpers for W1-011 component tests (no
 * @testing-library dependency — react-dom/client + act suffice).
 */
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface RenderedUi {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly unmount: () => void;
}

function makeRendered(container: HTMLElement, root: Root): RenderedUi {
  return {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Render synchronously (no lazy children awaited). */
export function renderUi(node: ReactNode): RenderedUi {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return makeRendered(container, root);
}

/**
 * Poll with real timers until every commerce-module Suspense fallback has
 * resolved (or timeout) — the same lazy-resolution wait renderUiAsync uses,
 * callable after a synchronous interaction (e.g. taking a role) inside a
 * still-mounted tree.
 */
export async function flushLazy(container: HTMLElement, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();
  while (
    (container.textContent ?? "").includes("Loading the commerce module") &&
    Date.now() - startedAt < timeoutMs
  ) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Render and flush async work (Suspense boundaries, lazy imports, effects).
 *
 * Dynamic imports resolve through the vite/vitest module graph: on FIRST load
 * of a dependency chain (e.g. a lazy component importing the
 * `@unicom/experience` contract barrel) resolution takes many real event-loop
 * ticks, not just microtask flushes. The helper therefore polls with real
 * timers until every commerce-module Suspense fallback has resolved, with a
 * timeout so a genuinely-stuck import still fails the test honestly.
 */
export async function renderUiAsync(node: ReactNode, timeoutMs = 5000): Promise<RenderedUi> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await flushLazy(container, timeoutMs);
  return makeRendered(container, root);
}

/** Click a button by its text content (within the container). */
export function clickButton(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`button not found: ${text}`);
  act(() => {
    button.click();
  });
}

/** Check/uncheck a checkbox by its accessible (aria) label. */
export function setCheckbox(
  container: HTMLElement,
  ariaLabel: string,
  checked: boolean,
): void {
  const box = container.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="${CSS.escape(ariaLabel)}"]`,
  );
  if (!box) throw new Error(`checkbox not found: ${ariaLabel}`);
  if (box.checked !== checked) {
    act(() => {
      box.click();
    });
  }
}

/** Find a button whose text CONTAINS the given fragment. */
export function findButton(container: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    ([...container.querySelectorAll("button")] as HTMLButtonElement[]).find((candidate) =>
      candidate.textContent?.includes(text),
    ) ?? null
  );
}

/** All text content concatenated (for presence assertions). */
export function textOf(container: HTMLElement): string {
  return container.textContent ?? "";
}
