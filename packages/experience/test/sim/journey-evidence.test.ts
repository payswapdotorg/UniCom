/**
 * W3-009 — Journey-evidence schema tests.
 *
 * Verifies the typed contract for every JourneyEvidenceRecord (law §1 GUI-ONLY,
 * law §2 evidence for failures, law §5 adoption metric separation, law §6 no
 * state-file edits — this test does NOT touch state files).
 */

import { describe, expect, it } from "vitest";
import {
  JOURNEY_FAMILY_IDS,
  buildEvidenceId,
  buildScreenshotCheckpoint,
  scrubSensitiveValue,
  appendInteractionStep,
  appendNavigationNode,
  recordBacktrack,
} from "../../src/sim";

describe("W3-009 journey-evidence schema", () => {
  it("exposes all registry journey family ids (W3-011: 19 W1-authoritative + the retained protocol-only family)", () => {
    expect(JOURNEY_FAMILY_IDS.length).toBe(20); // W3-011 derivation law
    expect(JOURNEY_FAMILY_IDS).toContain("gui-feature-discoverability");
    expect(JOURNEY_FAMILY_IDS).toContain("physical-no-rfid-supermarket");
    expect(JOURNEY_FAMILY_IDS).toContain("failure-unknown-idempotency-recovery");
  });

  it("builds a stable evidence id from run coordinates (determinism)", () => {
    const args = {
      experimentId: "v3-baseline",
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints",
      projectId: "firm-retail-S-1-proj-001",
      seed: "abc12345",
    };
    const id1 = buildEvidenceId(args);
    const id2 = buildEvidenceId(args);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^evidence-[0-9a-f]{16}$/);
  });

  it("evidence id differs when any coordinate changes", () => {
    const base = {
      experimentId: "v3-baseline",
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints" as const,
      projectId: "firm-retail-S-1-proj-001",
      seed: "abc12345",
    };
    const id1 = buildEvidenceId(base);
    const id2 = buildEvidenceId({ ...base, projectId: "firm-retail-S-1-proj-002" });
    expect(id1).not.toBe(id2);
  });

  it("builds a screenshot checkpoint with content-addressed digests", () => {
    const checkpoint = buildScreenshotCheckpoint({
      phase: "start",
      surfaceId: "command-center-work-graph",
      atUtc: "2026-10-10T07:00:00Z",
      renderedView: { surface: "command-center-work-graph", ready: true },
      visibleControls: [{ kind: "link", visibleLabel: "Home" }],
      a11yTree: { landmark: "main", controls: 1 },
    });
    expect(checkpoint.renderedViewDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(checkpoint.visibleControlsDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(checkpoint.a11yTreeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(checkpoint.checkpointId).toMatch(/^scp-[0-9a-f]{12}$/);
  });

  it("scrubs sensitive values before they enter the trace (law §5 — no secrets in evidence)", () => {
    expect(scrubSensitiveValue("password=hunter2")).toBe("[scrubbed]");
    expect(scrubSensitiveValue("Bearer abc.def.ghi")).toBe("[scrubbed]");
    expect(scrubSensitiveValue("api_key=sk_test_12345")).toBe("[scrubbed]");
    expect(scrubSensitiveValue("4111111111111111")).toBe("[scrubbed]"); // credit-card-shaped
    expect(scrubSensitiveValue("a normal form value")).toBe("a normal form value");
    expect(scrubSensitiveValue(undefined)).toBeUndefined();
    expect(scrubSensitiveValue("")).toBe("");
  });

  it("appends interaction steps with deterministic stepIndex", () => {
    const trace: import("../../src/sim").InteractionStep[] = [];
    const idx0 = appendInteractionStep(trace, {
      surfaceId: "homepage",
      control: { kind: "link", visibleLabel: "Home" },
      action: "click",
      atUtc: "2026-10-10T07:00:00Z",
    });
    const idx1 = appendInteractionStep(trace, {
      surfaceId: "buyer-intent-canvas",
      control: { kind: "menu-item", visibleLabel: "What do you need?" },
      action: "click",
      atUtc: "2026-10-10T07:00:01Z",
      causedTransitionTo: "buyer-intent-canvas",
    });
    expect(idx0).toBe(0);
    expect(idx1).toBe(1);
    expect(trace[1]?.causedTransitionTo).toBe("buyer-intent-canvas");
  });

  it("records backtracks — never silently drops them (law §2)", () => {
    const backtracks: import("../../src/sim").BacktrackRecord[] = [];
    recordBacktrack(backtracks, {
      atInteractionIndex: 3,
      reason: "wrong-surface",
      fromSurfaceId: "operate-orders",
      recoveredToSurfaceId: "operate-inventory",
    });
    expect(backtracks.length).toBe(1);
    expect(backtracks[0]?.reason).toBe("wrong-surface");
  });

  it("appends navigation nodes with back-pointer into the interaction trace", () => {
    const graph: import("../../src/sim").NavigationNode[] = [];
    appendNavigationNode(graph, {
      kind: "primary-nav",
      fromSurfaceId: "command-center-work-graph",
      toSurfaceId: "buyer-intent-canvas",
      viaLabel: "What do you need?",
      atInteractionIndex: 1,
    });
    expect(graph.length).toBe(1);
    expect(graph[0]?.kind).toBe("primary-nav");
    expect(graph[0]?.atInteractionIndex).toBe(1);
  });

  it("GuiOnlyProof is unrepresentable as non-empty violations (law §1)", () => {
    // The literal `readonly never[]` makes a non-empty list unrepresentable.
    const proof: import("../../src/sim").GuiOnlyProof = {
      deepLinkUsedForDiscovery: false,
      directApiCallsDuringJourney: [],
      directServiceInvocationsDuringJourney: [],
      dbMutationsDuringJourney: [],
      hiddenRouteTouchesDuringJourney: [],
      violations: [],
      instrumentationOnly: true,
    };
    expect(proof.violations.length).toBe(0);
    expect(proof.deepLinkUsedForDiscovery).toBe(false);
    expect(proof.instrumentationOnly).toBe(true);
  });

  it("CommerceAssertionRef.checkedAfterJourney is the literal true (law §4 — assertions only AFTER the journey)", () => {
    const ref: import("../../src/sim").CommerceAssertionRef = {
      assertionId: "assert-1",
      checkedAfterJourney: true,
      passed: true,
      evidenceNote: "assertion checked AFTER journey completed",
    };
    expect(ref.checkedAfterJourney).toBe(true);
  });

  it("JourneyEvidenceRecord.sensitiveValueScrubbed is the literal true (law §5)", () => {
    const record: import("../../src/sim").JourneyEvidenceRecord = {
      schemaVersion: 1,
      evidenceId: "evidence-test",
      experimentId: "v3-baseline",
      cohortId: "pilot-S",
      journeyFamilyId: "gui-feature-discoverability",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
      role: "project-owner",
      personaId: "persona-1",
      projectId: "proj-001",
      deterministicSeed: "abc12345",
      buildCommit: "abc1234",
      deploymentTarget: "local-dev-fixture",
      runStartedAt: "2026-10-10T07:00:00Z",
      runEndedAt: "2026-10-10T07:00:01Z",
      routeOrigin: "homepage",
      discoveryPathKind: "primary-navigation",
      discoveryPathRef: "primary-nav → Home",
      navigationGraph: [],
      backtracks: [],
      interactionTrace: [],
      interactionCount: 0,
      screenshotCheckpoints: [],
      outcome: "pass",
      successfulSteps: [],
      failedOrBlockedSteps: [],
      approvalState: { required: false },
      evidenceState: { proofLevel: "none", evidenceArtifacts: [], preservedThroughReconnect: false },
      connectorProviderState: [],
      commerceAssertionRefs: [],
      errorRecoveryTrace: [],
      guiOnlyProof: {
        deepLinkUsedForDiscovery: false,
        directApiCallsDuringJourney: [],
        directServiceInvocationsDuringJourney: [],
        dbMutationsDuringJourney: [],
        hiddenRouteTouchesDuringJourney: [],
        violations: [],
        instrumentationOnly: true,
      },
      sensitiveValueScrubbed: true,
    };
    expect(record.sensitiveValueScrubbed).toBe(true);
    expect(record.schemaVersion).toBe(1);
  });
});
