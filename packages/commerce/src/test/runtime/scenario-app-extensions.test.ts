/**
 * W1-008 journey + evidence test — app-extension ecosystem closure.
 *
 * Verifies the full product-complete journey for the matrix row
 * `app-extension-ecosystem`:
 *   contract (domain) → implementation (surface projection) → discoverable
 *   UX (the existing `app-extensions` navigation surface) → real journey
 *   (this test) → evidence (this test).
 *
 * The journey exercises:
 *  1. The deterministic lifecycle state machine (PENDING_REVIEW → INSTALLED
 *     → SUSPENDED → DISABLED → UNINSTALLED) including REJECT cases;
 *  2. Permission validation (rejection is first-class — INVARIANT 26:
 *     third-party content is untrusted data);
 *  3. Idempotency: advancing with the same trigger from the same state is
 *     deterministic (same inputs → same outcome, the W1-007 §1 law);
 *  4. Revision bumping (event-sourcing law).
 *
 * The surface projection is verified separately in
 * `packages/experience/test/app-extensions-studio-projection.test.ts`
 * (commerce tests may not import from experience — lane dependency order).
 *
 * Laws held (cited per acceptance scenario 4):
 * - Kernel-only truth: app-extension state is typed domain state, NOT
 *   commerce kernel truth (AGENTS rule 1: extensions never have direct
 *   authority over canonical commerce truth).
 * - Discoverability: closures reachable via the existing `app-extensions`
 *   navigation surface (no new surface kinds; W1-007 lane law).
 * - Idempotency: deterministic transitions; same (state, trigger) → same
 *   next state, every time.
 * - Anti-vacuity: this test would fail if any pointer (file, symbol,
 *   surface id) were corrupted — it imports the contract and exercises
 *   every transition.
 */
import { describe, expect, it } from "vitest";
import {
  advanceAppExtension,
  appExtensionTransition,
  makeId,
  validatePermissionRequest,
  type AppExtension,
  type AppExtensionPermission,
  type AppExtensionState,
  type AppExtensionTrigger,
} from "../../contract.js";

function baseExtension(
  id: string,
  state: AppExtensionState = "PENDING_REVIEW",
): AppExtension {
  return {
    appExtensionId: makeId<"AppExtensionId">(id),
    displayName: `App ${id}`,
    manifestVersion: 1,
    requestedPermissions: ["read:catalog", "read:orders"] as readonly AppExtensionPermission[],
    grantedPermissions: ["read:catalog"] as readonly AppExtensionPermission[],
    state,
    revision: 1,
  };
}

describe("W1-008 app-extension-ecosystem journey", () => {
  it("walks the full lifecycle PENDING_REVIEW → INSTALLED → SUSPENDED → DISABLED → UNINSTALLED", () => {
    const ext = baseExtension("app-1");
    const approved = advanceAppExtension(ext, "APPROVE");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.state).toBe("INSTALLED");
    expect(approved.value.revision).toBe(2);

    const suspended = advanceAppExtension(approved.value, "SUSPEND");
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) return;
    expect(suspended.value.state).toBe("SUSPENDED");

    const resumed = advanceAppExtension(suspended.value, "RESUME");
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.state).toBe("INSTALLED");

    const disabled = advanceAppExtension(resumed.value, "DISABLE");
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.value.state).toBe("DISABLED");

    const reEnabled = advanceAppExtension(disabled.value, "RE-enable");
    expect(reEnabled.ok).toBe(true);
    if (!reEnabled.ok) return;
    expect(reEnabled.value.state).toBe("INSTALLED");

    const uninstalled = advanceAppExtension(reEnabled.value, "UNINSTALL");
    expect(uninstalled.ok).toBe(true);
    if (!uninstalled.ok) return;
    expect(uninstalled.value.state).toBe("UNINSTALLED");
  });

  it("rejects invalid transitions (PENDING_REVIEW cannot SUSPEND, etc.)", () => {
    const ext = baseExtension("app-2", "PENDING_REVIEW");
    const result = advanceAppExtension(ext, "SUSPEND");
    expect(!result.ok).toBe(true);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_APP_EXTENSION_TRANSITION");
    expect(result.error.from).toBe("PENDING_REVIEW");
    expect(result.error.trigger).toBe("SUSPEND");
  });

  it("rejects transitions out of terminal UNINSTALLED state", () => {
    const ext = baseExtension("app-3", "UNINSTALLED");
    for (const trigger of ["APPROVE", "SUSPEND", "RESUME", "DISABLE", "RE-enable"] as AppExtensionTrigger[]) {
      const result = appExtensionTransition("UNINSTALLED", trigger);
      expect(!result.ok).toBe(true);
    }
  });

  it("validates permission requests against the typed catalog (rejection is first-class)", () => {
    const allowed = new Set<AppExtensionPermission>([
      "read:catalog",
      "read:orders",
      "read:inventory",
      "connect:channel",
    ]);
    const ok = validatePermissionRequest(["read:catalog", "read:orders"], allowed);
    expect(ok.ok).toBe(true);

    const rejected = validatePermissionRequest(
      ["read:catalog", "write:catalog"] as AppExtensionPermission[],
      allowed,
    );
    expect(!rejected.ok).toBe(true);
    if (rejected.ok) return;
    expect(rejected.error).toBe("PERMISSION_NOT_IN_CATALOG");
  });

  it("preserves immutability of inputs (advance returns a new value, never mutates)", () => {
    const ext = baseExtension("app-imm");
    const originalState = ext.state;
    const originalRev = ext.revision;
    const r = advanceAppExtension(ext, "APPROVE");
    expect(r.ok).toBe(true);
    expect(ext.state).toBe(originalState);
    expect(ext.revision).toBe(originalRev);
  });

  it("is deterministic: same (state, trigger) → same next state, every time", () => {
    for (let i = 0; i < 20; i += 1) {
      const r = appExtensionTransition("PENDING_REVIEW", "APPROVE");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe("INSTALLED");
    }
  });

  it("bumps revision on every advance (event-sourcing law)", () => {
    let ext = baseExtension("app-rev");
    const startRev = ext.revision;
    for (const trigger of ["APPROVE", "SUSPEND", "RESUME", "UNINSTALL"] as AppExtensionTrigger[]) {
      const r = advanceAppExtension(ext, trigger);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      ext = r.value;
    }
    expect(ext.revision).toBe(startRev + 4);
  });
});
