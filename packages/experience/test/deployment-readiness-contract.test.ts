/**
 * W3-006 deployment-readiness completeness contract — the typed registry
 * laws behind the order's acceptance scenarios, plus the readiness-law
 * type guarantees (production push NOT authorized; every deployment
 * surface typed + registered).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Equal, Expect } from "./type-helpers";
import type { ObservabilitySnapshot, OperatorDashboardView } from "../src/deployment/observability";
import type { ReleaseGateReport } from "../src/deployment/rc-evidence";
import { RC_EVIDENCE_SCHEMA_VERSION } from "../src/deployment/rc-evidence";
import type { DrPlaybookRunRecord, JournalBackupArtifact } from "../src/deployment/runbook";
import { DR_PLAYBOOKS } from "../src/runtime/deployment/dr-playbooks";
import { OBSERVABILITY_SUBSYSTEM_IDS } from "../src/runtime/deployment/observability";
import { OPERATOR_DASHBOARD_SECTIONS } from "../src/deployment/observability";
import { NODE_SERVER_TARGET_PLAN, resolveStartupOrder } from "../src/runtime/deployment/target-plan";
import { REQUIRED_EVIDENCE_KINDS } from "../src/runtime/deployment/rc-evidence";
import { experienceModule } from "../src/module";

const statePath = fileURLToPath(new URL("../../../docs/development-state/v1-work-order-state.json", import.meta.url));

// Compile-time: the projection + readiness laws are literal type guarantees.
export type AssertSnapshotProjectionLaw = Expect<
  Equal<ObservabilitySnapshot["sourceOfTruth"], "journaled-events">
>;
export type AssertSnapshotProjectionOnly = Expect<Equal<ObservabilitySnapshot["projectionOnly"], true>>;
export type AssertDashboardProjectionOnly = Expect<Equal<OperatorDashboardView["projectionOnly"], true>>;
export type AssertGatePushUnauthorized = Expect<Equal<ReleaseGateReport["productionPushAuthorized"], false>>;
export type AssertBackupSchemaVersion = Expect<Equal<JournalBackupArtifact["schemaVersion"], 1>>;
export type AssertPlaybookRunTyped = Expect<Equal<DrPlaybookRunRecord["outcome"], "recovered" | "unresolved" | "not-applicable">>;

describe("deployment readiness registries", () => {
  it("registers every W3-006 capability in the module manifest", () => {
    for (const provided of [
      "deployment-target-plan-contracts",
      "node-server-target-adapter",
      "production-observability-projections",
      "operator-dashboard-surface",
      "dr-runbook-as-code",
      "journal-hash-chain-verification",
      "single-writer-lease-fencing",
      "rc-evidence-release-gate",
    ]) {
      expect(experienceModule.provides).toContain(provided);
    }
  });

  it("keeps the fully-specified target plan structurally sound (DAG, unique probes, documented env)", () => {
    const order = resolveStartupOrder(NODE_SERVER_TARGET_PLAN);
    expect(order).toHaveLength(NODE_SERVER_TARGET_PLAN.services.length);
    // Every dependency precedes its dependent (startup ordering law).
    for (const service of NODE_SERVER_TARGET_PLAN.services) {
      for (const dependency of service.dependsOn) {
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(service.serviceId));
      }
    }
    for (const service of NODE_SERVER_TARGET_PLAN.services) {
      // Probe paths unique per service; all three probe kinds present.
      const paths = service.probes.map((probe) => probe.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(new Set(service.probes.map((probe) => probe.kind))).toEqual(new Set(["liveness", "readiness", "startup"]));
      // Every env var is documented (operator-facing configuration law).
      for (const variable of service.environment.variables) {
        expect(variable.description.length).toBeGreaterThan(5);
      }
    }
  });

  it("covers all six observability subsystems and all seven dashboard sections", () => {
    expect(OBSERVABILITY_SUBSYSTEM_IDS).toHaveLength(6);
    expect(OPERATOR_DASHBOARD_SECTIONS).toHaveLength(7);
    expect(new Set(OPERATOR_DASHBOARD_SECTIONS).size).toBe(7);
  });

  it("registers a tested playbook for every DR failure mode of the order", () => {
    expect(DR_PLAYBOOKS.map((playbook) => playbook.failureModeId).sort()).toEqual([
      "connector-outage",
      "journal-corruption",
      "pod-loss",
      "split-brain-risk",
    ]);
  });

  it("requires exactly the three evidence kinds the release gate consumes", () => {
    expect(REQUIRED_EVIDENCE_KINDS).toEqual(["e2e-journeys", "observability", "dr-drill"]);
    expect(RC_EVIDENCE_SCHEMA_VERSION).toBe(1);
  });

  it("acknowledges production_deployment_authorized = false in the work-order state (readiness only)", () => {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      production_deployment_authorized?: boolean;
      active_work_orders?: { id: string; branch?: string }[];
      completed_work_orders?: { id: string; branch?: string }[];
    };
    expect(state.production_deployment_authorized).toBe(false);
    // Readiness invariant: the W3-006 delivery branch stays recorded whether
    // the order is still active or already merged (completed) — the roadmap
    // advances without weakening the readiness acknowledgement.
    const own = [
      ...(state.active_work_orders ?? []),
      ...(state.completed_work_orders ?? []),
    ].find((order) => order.id === "W3-006");
    expect(own?.branch).toBe("work/w3-006");
  });

  it("keeps every W3-006 VALUE export reachable through the public entrypoints", async () => {
    const runtime = await import("../src/runtime/index");
    for (const exported of [
      "NODE_SERVER_TARGET_PLAN",
      "createTargetDeploymentAdapter",
      "resolveDeploymentEnvironment",
      "resolveStartupOrder",
      "createObservabilityProjector",
      "exportJournalBackup",
      "restoreJournalBackup",
      "verifyJournalHashChain",
      "DR_PLAYBOOKS",
      "runFailurePlaybook",
      "createSingleWriterLeaseAuthority",
      "createDrDecisionJournal",
      "rtoBudgetFor",
      "verifyRecoveryObjectives",
      "runbookStatusesOf",
      "emitEvidenceReport",
      "evaluateReleaseGate",
      "writeRcEvidenceArtifacts",
    ]) {
      expect((runtime as Record<string, unknown>)[exported], `runtime entrypoint must export ${exported}`).toBeDefined();
    }
    const contract = await import("../src/contract");
    for (const exported of [
      "OPERATOR_DASHBOARD_SECTIONS",
      "RC_EVIDENCE_SCHEMA_VERSION",
      "FencedWriterViolation",
      "DeploymentEnvironmentError",
      "DeploymentPlanError",
    ]) {
      expect((contract as Record<string, unknown>)[exported], `contract entrypoint must export ${exported}`).toBeDefined();
    }
  });
});
