/**
 * W3-009 — Multi-role switching + access-control tests.
 *
 * The runner exercises role-switching through the visible Settings surface
 * (no internal vocabulary). Each role sees only the surfaces its capability
 * scope permits; access-control violations are captured as BLOCKED, not passes.
 */

import { describe, expect, it } from "vitest";
import {
  ROLE_ACCESS_SCOPES,
  runRoleAccessTest,
  ROLE_SWITCH_SURFACE,
} from "../../src/sim";

describe("W3-009 role-access (multi-role switching + access control)", () => {
  it("declares 8 role families per industry (W1-009 acceptance §3)", () => {
    expect(ROLE_ACCESS_SCOPES.length).toBe(8);
    const roles = ROLE_ACCESS_SCOPES.map((scope) => scope.role);
    expect(roles).toContain("project-owner");
    expect(roles).toContain("procurement");
    expect(roles).toContain("finance");
    expect(roles).toContain("ops");
    expect(roles).toContain("end-user");
    expect(roles).toContain("approver");
    expect(roles).toContain("supplier");
    expect(roles).toContain("auditor");
  });

  it("role switch surface uses no internal vocabulary", () => {
    expect(ROLE_SWITCH_SURFACE).toBe("settings-switch-role");
  });

  it("permits role switch when canSwitchFrom includes the target role", () => {
    const result = runRoleAccessTest({
      fromRole: "project-owner",
      toRole: "procurement",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["command-center-work-graph"],
    });
    expect(result.switchAllowed).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it("blocks role switch when canSwitchFrom does not include the target", () => {
    const result = runRoleAccessTest({
      fromRole: "end-user",
      toRole: "auditor",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["trust-security-center"],
    });
    expect(result.switchAllowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toContain("not permitted");
    expect(result.screenshotCheckpoints.some((cp) => cp.phase === "terminal-blocked")).toBe(true);
  });

  it("captures BLOCKED (not pass) when the toRole lacks access to an attempted surface", () => {
    const result = runRoleAccessTest({
      fromRole: "project-owner",
      toRole: "procurement",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["trust-security-center"], // not in procurement's allowedSurfaces
    });
    expect(result.switchAllowed).toBe(true);
    expect(result.accessDeniedSurfaces).toContain("trust-security-center");
    expect(result.blocked).toBe(true);
  });

  it("records the visible approval toggle on the role-switch surface (visible approval)", () => {
    const result = runRoleAccessTest({
      fromRole: "project-owner",
      toRole: "procurement",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["operate-inventory"],
    });
    expect(result.approvalState.required).toBe(true);
    expect(result.approvalState.approvalKind).toBe("operator");
  });

  it("interaction steps include the visible role-switch control with the role's plain-language label", () => {
    const result = runRoleAccessTest({
      fromRole: "project-owner",
      toRole: "procurement",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["command-center-work-graph"],
    });
    const roleSwitchStep = result.interactionSteps.find((step) => step.surfaceId === ROLE_SWITCH_SURFACE);
    expect(roleSwitchStep).toBeDefined();
    expect(roleSwitchStep?.control.visibleLabel).toContain("Switch to");
    // No internal vocabulary in the visible label.
    expect(roleSwitchStep?.control.visibleLabel).not.toMatch(/capability|principal|scope/i);
  });

  it("denied-surface checkpoints capture the BLOCKED outcome (not pass)", () => {
    const result = runRoleAccessTest({
      fromRole: "end-user",
      toRole: "auditor",
      atUtc: "2026-10-10T07:00:00Z",
      attemptedSurfaces: ["trust-security-center"],
    });
    const blocked = result.screenshotCheckpoints.find((cp) => cp.phase === "terminal-blocked");
    expect(blocked).toBeDefined();
  });
});
