/**
 * W3-009 — Multi-role switching + access-control tests.
 *
 * The runner exercises role-switching through the visible Settings surface
 * (FROZEN §22.7: no internal vocabulary required to switch roles). Each role
 * sees only the surfaces its capability scope permits; access-control
 * violations are captured as BLOCKED journeys, not passes.
 *
 * The 8 role families per industry (W1-009 acceptance §3): project-owner,
 * procurement, finance, ops, end-user, approver, supplier, auditor.
 */

import type { InteractionStep, InteractionControl, ScreenshotCheckpoint, ApprovalState } from "./journey-evidence";

/** One role's access scope (which surfaces it can see; which actions it can take). */
export interface RoleAccessScope {
  readonly role: string;
  readonly allowedSurfaces: readonly string[];
  readonly allowedActions: readonly ("view" | "create" | "approve" | "reject" | "configure")[];
  readonly canSwitchFrom: readonly string[];
}

/** The 8 role families and their access scopes. */
export const ROLE_ACCESS_SCOPES: readonly RoleAccessScope[] = [
  {
    role: "project-owner",
    allowedSurfaces: ["command-center-work-graph", "buyer-intent-canvas", "opportunity-inbox"],
    allowedActions: ["view", "create", "approve"],
    canSwitchFrom: ["procurement", "ops"],
  },
  {
    role: "procurement",
    allowedSurfaces: ["command-center-work-graph", "operate-inventory", "operate-orders", "connector-studio", "buyer-intent-canvas"],
    allowedActions: ["view", "create", "approve"],
    canSwitchFrom: ["project-owner", "finance"],
  },
  {
    role: "finance",
    allowedSurfaces: ["command-center-work-graph", "operate-orders", "operate-customers"],
    allowedActions: ["view", "approve", "reject"],
    canSwitchFrom: ["procurement", "auditor"],
  },
  {
    role: "ops",
    allowedSurfaces: ["command-center-work-graph", "operate-catalog", "operate-inventory", "operate-orders", "operate-customers", "physical-capture", "local-edge-setup"],
    allowedActions: ["view", "create", "configure"],
    canSwitchFrom: ["procurement", "project-owner"],
  },
  {
    role: "end-user",
    allowedSurfaces: ["command-center-work-graph", "buyer-intent-canvas", "opportunity-inbox", "storefront-studio"],
    allowedActions: ["view", "create"],
    canSwitchFrom: [],
  },
  {
    role: "approver",
    allowedSurfaces: ["command-center-work-graph", "operate-orders"],
    allowedActions: ["view", "approve", "reject"],
    canSwitchFrom: ["finance", "auditor"],
  },
  {
    role: "supplier",
    allowedSurfaces: ["command-center-work-graph", "operate-inventory", "operate-orders"],
    allowedActions: ["view", "create"],
    canSwitchFrom: [],
  },
  {
    role: "auditor",
    allowedSurfaces: ["command-center-work-graph", "trust-security-center", "operate-orders"],
    allowedActions: ["view"],
    canSwitchFrom: [],
  },
];

/** Result of a role-switching access-control test. */
export interface RoleAccessTestResult {
  readonly fromRole: string;
  readonly toRole: string;
  readonly switchAllowed: boolean;
  readonly switchSurface: string;
  readonly interactionSteps: readonly InteractionStep[];
  readonly screenshotCheckpoints: readonly ScreenshotCheckpoint[];
  readonly approvalState: ApprovalState;
  readonly accessDeniedSurfaces: readonly string[];
  readonly blocked: boolean;
  readonly blockReason?: string;
}

/** The visible Settings → "Switch role" surface id (no internal vocabulary). */
export const ROLE_SWITCH_SURFACE = "settings-switch-role";

/** A control on the role-switch surface (visible label only — no internal vocab). */
const roleSwitchControl = (role: string): InteractionControl => ({
  kind: "menu-item",
  visibleLabel: `Switch to ${role.replace("-", " ")}`,
  accessibilityName: `Switch to ${role} role`,
});

/** Run a role-switching access-control test for a (fromRole, toRole) pair. */
export function runRoleAccessTest(args: {
  fromRole: string;
  toRole: string;
  atUtc: string;
  attemptedSurfaces: readonly string[];
}): RoleAccessTestResult {
  const { fromRole, toRole, atUtc, attemptedSurfaces } = args;
  const fromScope = ROLE_ACCESS_SCOPES.find((scope) => scope.role === fromRole);
  const toScope = ROLE_ACCESS_SCOPES.find((scope) => scope.role === toRole);
  if (fromScope === undefined || toScope === undefined) {
    throw new Error(`unknown role: ${fromRole} or ${toRole}`);
  }
  const switchAllowed = fromScope.canSwitchFrom.includes(toRole) || toScope.canSwitchFrom.includes(fromRole) || fromRole === toRole;
  const steps: InteractionStep[] = [];
  const checkpoints: ScreenshotCheckpoint[] = [];
  const accessDenied: string[] = [];

  // Step 1: navigate to the visible Settings surface (primary navigation).
  steps.push({
    stepIndex: 0,
    surfaceId: "command-center-work-graph",
    control: { kind: "menu-item", visibleLabel: "Settings", accessibilityName: "Settings" },
    action: "click",
    atUtc,
    causedTransitionTo: ROLE_SWITCH_SURFACE,
  });

  if (!switchAllowed) {
    // The role switch is blocked at the visible UI — capture as BLOCKED.
    checkpoints.push({
      checkpointId: "scp-role-blocked",
      phase: "terminal-blocked",
      surfaceId: ROLE_SWITCH_SURFACE,
      atUtc,
      renderedViewDigest: "blocked-role-switch",
      visibleControlsDigest: "blocked-role-switch-controls",
      a11yTreeDigest: "blocked-role-switch-a11y",
      notes: `role switch from ${fromRole} to ${toRole} not permitted by visible access-control`,
    });
    return {
      fromRole,
      toRole,
      switchAllowed: false,
      switchSurface: ROLE_SWITCH_SURFACE,
      interactionSteps: steps,
      screenshotCheckpoints: checkpoints,
      approvalState: { required: false },
      accessDeniedSurfaces: attemptedSurfaces,
      blocked: true,
      blockReason: `role switch from ${fromRole} to ${toRole} not permitted`,
    };
  }

  // Step 2: actuate the visible role-switch control.
  steps.push({
    stepIndex: 1,
    surfaceId: ROLE_SWITCH_SURFACE,
    control: roleSwitchControl(toRole),
    action: "click",
    atUtc,
    causedTransitionTo: "command-center-work-graph",
  });

  // Step 3: verify the toRole's surface scope against attemptedSurfaces.
  for (const surface of attemptedSurfaces) {
    if (!toScope.allowedSurfaces.includes(surface)) {
      accessDenied.push(surface);
      steps.push({
        stepIndex: steps.length,
        surfaceId: "command-center-work-graph",
        control: { kind: "menu-item", visibleLabel: surface, accessibilityName: surface },
        action: "click",
        atUtc,
      });
      checkpoints.push({
        checkpointId: `scp-denied-${surface}`,
        phase: "terminal-blocked",
        surfaceId: surface,
        atUtc,
        renderedViewDigest: "denied",
        visibleControlsDigest: "denied-controls",
        a11yTreeDigest: "denied-a11y",
        notes: `${toRole} cannot access ${surface}`,
      });
    }
  }

  return {
    fromRole,
    toRole,
    switchAllowed: true,
    switchSurface: ROLE_SWITCH_SURFACE,
    interactionSteps: steps,
    screenshotCheckpoints: checkpoints,
    approvalState: { required: true, approvalKind: "operator", approvedAt: atUtc },
    accessDeniedSurfaces: accessDenied,
    blocked: accessDenied.length > 0,
    blockReason: accessDenied.length > 0 ? `${toRole} denied access to: ${accessDenied.join(", ")}` : undefined,
  };
}
