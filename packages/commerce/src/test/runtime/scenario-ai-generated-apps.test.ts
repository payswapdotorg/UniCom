/**
 * W1-008 journey + evidence test — AI-generated apps/workflows + agent-
 * generated business tools closure.
 *
 * Verifies the full product-complete journey for two matrix rows at once
 * (they share the `ai-generated-apps` domain — different surface angles):
 *   - merchant-parity `ai-generated-apps-workflows`
 *   - ai-native-merchant-layer `agent-generated-business-tools`
 *
 * The journey exercises:
 *  1. The deterministic request lifecycle (REQUESTED → SIMULATED → APPROVED
 *     → INSTALLED → RETIRED) including REJECT cases at every gate;
 *  2. The human-approval gate (`canApprove` returns true iff state is
 *     SIMULATED — agents cannot self-approve, AGENTS rule 1);
 *  3. Idempotency + determinism (same inputs → same outcome, the W1-007
 *     §1 law);
 *  4. Revision bumping (event-sourcing law);
 *  5. Immutability of inputs.
 *
 * The surface projections (merchant-parity + Lab views) are verified
 * separately in `packages/experience/test/app-extensions-studio-projection.test.ts`
 * (commerce tests may not import from experience — lane dependency order).
 *
 * Laws held (cited per acceptance scenario 4):
 * - Kernel-only truth: the request lifecycle is typed domain state, NOT
 *   commerce kernel truth. The installed artifact becomes an `AppExtension`
 *   (separate domain) and never gains direct commerce-truth authority
 *   (AGENTS rule 1; INVARIANT 6: models cannot directly mutate commerce
 *   state).
 * - Simulation cannot become production truth (INVARIANT 16/17): a
 *   `SandboxedArtifact` is opaque untrusted data; installation requires
 *   explicit human approval.
 * - No production-reachable mocks (INVARIANT 39): the simulated artifact
 *   reference is typed and never auto-installed.
 * - Discoverability via existing surface contracts: both the merchant-
 *   parity `app-extensions` surface and the AI-native `lab-surface` are
 *   pre-existing; this closure adds the typed view contracts they render.
 */
import { describe, expect, it } from "vitest";
import {
  advanceAgentGeneratedToolRequest,
  advanceAiGeneratedAppRequest,
  aiGeneratedAppRequestTransition,
  canApprove,
  makeId,
  type AgentGeneratedToolRequest,
  type AiGeneratedAppRequest,
  type AiGeneratedAppRequestState,
  type AiGeneratedAppRequestTrigger,
  type SandboxedArtifact,
} from "../../contract.js";

const SIM_ARTIFACT: SandboxedArtifact = {
  artifactRef: "artifact://sim/restock-dashboard-v1",
  artifactKind: "DASHBOARD",
  simulationSummary: "Restock dashboard sim: predicted 3 SKUs need reorder within 5 days; no inventory mutation.",
};

function merchantRequest(id: string, state: AiGeneratedAppRequestState = "REQUESTED"): AiGeneratedAppRequest {
  return {
    requestId: makeId<"AiGeneratedAppRequestId">(id),
    origin: "MERCHANT_PARITY_ASK",
    ask: "Build me a restock dashboard",
    state,
    revision: 1,
  };
}

function labRequest(id: string, state: AiGeneratedAppRequestState = "REQUESTED"): AgentGeneratedToolRequest {
  return {
    requestId: makeId<"AgentGeneratedToolRequestId">(id),
    goalRef: "goal://merchant-1/inventory-health",
    ask: "Custom report for slow-moving SKUs",
    state,
    revision: 1,
  };
}

describe("W1-008 ai-generated-apps-workflows + agent-generated-business-tools journey", () => {
  it("walks the full lifecycle REQUESTED → SIMULATED → APPROVED → INSTALLED → RETIRED", () => {
    const req = merchantRequest("req-1");
    expect(canApprove(req.state)).toBe(false); // Cannot approve until simulated.

    const simulated = advanceAiGeneratedAppRequest(req, "RUN_SIMULATION", {
      simulatedArtifact: SIM_ARTIFACT,
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.state).toBe("SIMULATED");
    expect(simulated.value.simulatedArtifact).toBe(SIM_ARTIFACT);
    expect(canApprove(simulated.value.state)).toBe(true); // Gate now satisfiable.

    const approved = advanceAiGeneratedAppRequest(simulated.value, "APPROVE");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.state).toBe("APPROVED");

    const installed = advanceAiGeneratedAppRequest(approved.value, "INSTALL", {
      installedAppExtensionId: makeId<"AppExtensionId">("app-from-req-1"),
    });
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.state).toBe("INSTALLED");
    expect(installed.value.installedAppExtensionId).toBeDefined();

    const retired = advanceAiGeneratedAppRequest(installed.value, "RETIRE");
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    expect(retired.value.state).toBe("RETIRED");
  });

  it("rejects transition shortcuts (cannot skip the simulation step)", () => {
    const req = merchantRequest("req-2");
    // Cannot APPROVE from REQUESTED (no simulation to review).
    const r = advanceAiGeneratedAppRequest(req, "APPROVE");
    expect(!r.ok).toBe(true);
    if (r.ok) return;
    expect(r.error.code).toBe("INVALID_AI_GENERATED_APP_REQUEST_TRANSITION");
    expect(r.error.from).toBe("REQUESTED");
    expect(r.error.trigger).toBe("APPROVE");
  });

  it("rejects installation without prior approval (the human gate is mandatory)", () => {
    const req = merchantRequest("req-3", "SIMULATED");
    // Cannot INSTALL from SIMULATED (must APPROVE first).
    const r = advanceAiGeneratedAppRequest(req, "INSTALL");
    expect(!r.ok).toBe(true);
  });

  it("allows REJECT from any non-terminal state (the user can always say no)", () => {
    for (const state of ["REQUESTED", "SIMULATED", "APPROVED"] as AiGeneratedAppRequestState[]) {
      const r = aiGeneratedAppRequestTransition(state, "REJECT");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe("REJECTED");
    }
  });

  it("treats REJECTED and RETIRED as terminal (no further transitions)", () => {
    for (const terminal of ["REJECTED", "RETIRED"] as AiGeneratedAppRequestState[]) {
      for (const trigger of ["RUN_SIMULATION", "APPROVE", "REJECT", "INSTALL", "RETIRE"] as AiGeneratedAppRequestTrigger[]) {
        const r = aiGeneratedAppRequestTransition(terminal, trigger);
        expect(!r.ok).toBe(true);
      }
    }
  });

  it("canApprove is true iff state is SIMULATED (agents cannot self-approve)", () => {
    for (const state of ["REQUESTED", "APPROVED", "INSTALLED", "REJECTED", "RETIRED"] as AiGeneratedAppRequestState[]) {
      expect(canApprove(state)).toBe(false);
    }
    expect(canApprove("SIMULATED")).toBe(true);
  });

  it("walks the Lab-origin variant through the same lifecycle (agent-generated tools)", () => {
    const req = labRequest("lt-1");
    const simulated = advanceAgentGeneratedToolRequest(req, "RUN_SIMULATION", {
      simulatedArtifact: { ...SIM_ARTIFACT, artifactKind: "REPORT" },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.state).toBe("SIMULATED");
    expect(canApprove(simulated.value.state)).toBe(true);

    const approved = advanceAgentGeneratedToolRequest(simulated.value, "APPROVE");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.state).toBe("APPROVED");

    const installed = advanceAgentGeneratedToolRequest(approved.value, "INSTALL", {
      installedAppExtensionId: makeId<"AppExtensionId">("app-from-lt-1"),
    });
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.state).toBe("INSTALLED");
    expect(installed.value.installedAppExtensionId).toBeDefined();
  });

  it("preserves immutability of inputs (advance returns a new value, never mutates)", () => {
    const req = merchantRequest("imm");
    const originalState = req.state;
    const originalRev = req.revision;
    const r = advanceAiGeneratedAppRequest(req, "RUN_SIMULATION", {
      simulatedArtifact: SIM_ARTIFACT,
    });
    expect(r.ok).toBe(true);
    expect(req.state).toBe(originalState);
    expect(req.revision).toBe(originalRev);
    expect(req.simulatedArtifact).toBeUndefined(); // patch only applies to the result
  });

  it("is deterministic: same (state, trigger) → same next state, every time", () => {
    for (let i = 0; i < 20; i += 1) {
      const r = aiGeneratedAppRequestTransition("REQUESTED", "RUN_SIMULATION");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe("SIMULATED");
    }
  });

  it("bumps revision on every advance (event-sourcing law)", () => {
    let req = merchantRequest("rev");
    const startRev = req.revision;
    const steps: Array<{
      trigger: AiGeneratedAppRequestTrigger;
      patch?: Partial<Pick<AiGeneratedAppRequest, "simulatedArtifact" | "installedAppExtensionId">>;
    }> = [
      { trigger: "RUN_SIMULATION", patch: { simulatedArtifact: SIM_ARTIFACT } },
      { trigger: "APPROVE" },
      { trigger: "INSTALL", patch: { installedAppExtensionId: makeId<"AppExtensionId">("app-rev") } },
      { trigger: "RETIRE" },
    ];
    for (const step of steps) {
      const r = advanceAiGeneratedAppRequest(req, step.trigger, step.patch);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      req = r.value;
    }
    expect(req.revision).toBe(startRev + 4);
  });
});
