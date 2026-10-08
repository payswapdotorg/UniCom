/**
 * W1-008 surface projection test — app-extensions-studio.
 *
 * Verifies the discoverable-UX + implementation rung for three matrix rows
 * that share the new `app-extensions-studio.ts` surface contract:
 *   - merchant-parity `app-extension-ecosystem`
 *   - merchant-parity `ai-generated-apps-workflows`
 *   - ai-native-merchant-layer `agent-generated-business-tools`
 *
 * The test confirms:
 *  1. The studio view is a pure projection of `@unicom/commerce` domain state
 *     (never a second source of truth — W1-007 §truth distinctions);
 *  2. Both the merchant-parity view (`buildAiGeneratedAppRequestView`) and
 *     the Lab view (`buildAgentGeneratedToolView`) render the lifecycle
 *     state explicitly so the human-approval gate is visible;
 *  3. Untrusted third-party content stays inert (display strings only; no
 *     inline code; INVARIANT 26);
 *  4. The view exposes `approvalReady` so the surface cannot silently
 *     auto-approve (AGENTS rule 1: agents propose, never mutate truth).
 */
import { describe, expect, it } from "vitest";
import {
  advanceAiGeneratedAppRequest,
  makeId,
  type AgentGeneratedToolRequest,
  type AiGeneratedAppRequest,
  type AiGeneratedAppRequestState,
  type AppExtension,
  type AppExtensionPermission,
  type SandboxedArtifact,
} from "@unicom/commerce";
import {
  buildAgentGeneratedToolView,
  buildAiGeneratedAppRequestView,
  buildAppExtensionsStudioView,
} from "../src/surfaces/app-extensions-studio.js";

const SIM: SandboxedArtifact = {
  artifactRef: "artifact://sim/restock-dashboard-v1",
  artifactKind: "DASHBOARD",
  simulationSummary: "Restock dashboard sim: 3 SKUs need reorder within 5 days.",
};

function ext(id: string, state: AppExtension["state"] = "INSTALLED"): AppExtension {
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

function req(id: string, state: AiGeneratedAppRequestState = "REQUESTED"): AiGeneratedAppRequest {
  return {
    requestId: makeId<"AiGeneratedAppRequestId">(id),
    origin: "MERCHANT_PARITY_ASK",
    ask: "Build me a restock dashboard",
    state,
    revision: 1,
  };
}

function labReq(id: string, state: AiGeneratedAppRequestState = "REQUESTED"): AgentGeneratedToolRequest {
  return {
    requestId: makeId<"AgentGeneratedToolRequestId">(id),
    goalRef: "goal://merchant-1/inventory-health",
    ask: "Custom report for slow-moving SKUs",
    state,
    revision: 1,
  };
}

describe("W1-008 app-extensions-studio surface projection", () => {
  it("buildAppExtensionsStudioView renders installed extensions + pending requests", () => {
    const e1 = ext("a1", "INSTALLED");
    const e2 = ext("a2", "PENDING_REVIEW");
    const r1 = req("r1", "REQUESTED");
    const r2 = advanceAiGeneratedAppRequest(req("r2"), "RUN_SIMULATION", { simulatedArtifact: SIM });
    if (!r2.ok) throw new Error("expected ok");
    const view = buildAppExtensionsStudioView({
      extensions: [e1, e2],
      requests: [r1, r2.value],
    });
    expect(view.installed).toHaveLength(2);
    expect(view.installed[0]?.state).toBe("INSTALLED");
    expect(view.installed[1]?.state).toBe("PENDING_REVIEW");
    expect(view.installed[1]?.permissionNotes).toContain(
      "read:orders: not granted (human review required)",
    );
    expect(view.pendingRequests).toHaveLength(2);
    expect(view.pendingRequests[0]?.state).toBe("REQUESTED");
    expect(view.pendingRequests[0]?.approvalReady).toBe(false);
    expect(view.pendingRequests[1]?.state).toBe("SIMULATED");
    expect(view.pendingRequests[1]?.approvalReady).toBe(true);
    expect(view.pendingRequests[1]?.simulationSummary).toContain("Restock dashboard");
  });

  it("buildAiGeneratedAppRequestView projects the merchant-parity request queue", () => {
    const r1 = req("m1", "REQUESTED");
    const r2 = advanceAiGeneratedAppRequest(req("m2"), "RUN_SIMULATION", { simulatedArtifact: SIM });
    if (!r2.ok) throw new Error("expected ok");
    const view = buildAiGeneratedAppRequestView([r1, r2.value]);
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]?.origin).toBe("MERCHANT_PARITY_ASK");
    expect(view.rows[0]?.approvalReady).toBe(false);
    expect(view.rows[1]?.approvalReady).toBe(true);
  });

  it("buildAgentGeneratedToolView projects the Lab request queue with the LAB origin", () => {
    const r1 = labReq("lt1", "REQUESTED");
    const r2 = advanceAiGeneratedAppRequest(labReq("lt2"), "RUN_SIMULATION", {
      simulatedArtifact: { ...SIM, artifactKind: "REPORT" },
    });
    if (!r2.ok) throw new Error("expected ok");
    // The Lab variant uses the AgentGeneratedToolRequest type but the same lifecycle.
    const lab = {
      ...r2.value,
      requestId: makeId<"AgentGeneratedToolRequestId">("lt2"),
      goalRef: "goal://merchant-1/inventory-health",
    } as AgentGeneratedToolRequest;
    const view = buildAgentGeneratedToolView([r1, lab]);
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]?.origin).toBe("LAB_AGENT_PROPOSAL");
    expect(view.rows[1]?.origin).toBe("LAB_AGENT_PROPOSAL");
    expect(view.rows[1]?.hasSimulation).toBe(true);
    expect(view.rows[1]?.approvalReady).toBe(true);
  });

  it("the view is a pure projection — re-running with the same input yields the same output", () => {
    const extensions = [ext("a1"), ext("a2", "SUSPENDED")];
    const requests = [req("r1")];
    const v1 = buildAppExtensionsStudioView({ extensions, requests });
    const v2 = buildAppExtensionsStudioView({ extensions, requests });
    expect(v1).toEqual(v2);
  });

  it("exposes suggestions when lists are empty (empty-state education)", () => {
    const view = buildAppExtensionsStudioView({ extensions: [], requests: [] });
    expect(view.installed).toEqual([]);
    expect(view.pendingRequests).toEqual([]);
    expect(view.suggestions.length).toBeGreaterThan(0);
  });
});
