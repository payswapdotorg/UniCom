/**
 * W3-015 lane-internal test support (NOT a discoverable commerce module).
 *
 * The stub host mirrors exactly what ModuleSurface hands a mounted module
 * (roles, activeRole, hasPermission via the REAL role registry, demo mode,
 * the committed demo scenario) so component tests exercise the same
 * permission vocabulary the rendered host enforces.
 */

import { permissionsOfRoles } from "../../commerce-host/contract/index.js";
import type {
  CommerceHostServices,
  CommercePermissionId,
  CommerceRoleId,
} from "../../commerce-host/contract/index.js";
import { DEFAULT_DEMO_SCENARIO } from "../../commerce-host/demo/demo-fixtures.js";
import { act } from "react";

/** A recorded-navigation stub host bound to a set of held roles. */
export function makeStubHost(roles: readonly CommerceRoleId[]): {
  readonly host: CommerceHostServices;
  readonly navigatedTo: string[];
} {
  const granted = permissionsOfRoles(roles);
  const navigatedTo: string[] = [];
  const host: CommerceHostServices = {
    navigate: (path) => {
      navigatedTo.push(path);
    },
    currentPath: "/commerce",
    roles,
    activeRole: roles[0] ?? null,
    hasPermission: (permission: CommercePermissionId) => granted.has(permission),
    mode: "demo",
    scenario: DEFAULT_DEMO_SCENARIO,
    resetDemo: () => undefined,
  };
  return { host, navigatedTo };
}

/**
 * Poll with real timers until the container shows the expected text (or
 * timeout) — used after async kernel commands so tests never depend on
 * microtask timing.
 */
export async function waitForText(
  container: HTMLElement,
  expected: string,
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now();
  while (!(container.textContent ?? "").includes(expected)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for text: ${expected}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Poll until the expected text is GONE (state transitions after commands). */
export async function waitForTextGone(
  container: HTMLElement,
  expected: string,
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now();
  while ((container.textContent ?? "").includes(expected)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for text to disappear: ${expected}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}
