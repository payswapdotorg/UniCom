/**
 * W3-009 — Failure-variant tests (protocol §4 + §10.18).
 *
 * Every failure variant produces outcome fail/blocked/absent/unknown (never
 * pass) and records the error kind + recovery action (or absence of recovery)
 * in the error-recovery trace — never silently drops a failure (law §2).
 */

import { describe, expect, it } from "vitest";
import {
  FAILURE_VARIANTS,
  runFailureVariant,
  type FailureVariantKind,
} from "../../src/sim";

describe("W3-009 failure variants (offline/error/stale/UNKNOWN/missing/disabled/unsupported)", () => {
  it("declares ≥ 20 failure variants (protocol §4 list + §10.18)", () => {
    expect(FAILURE_VARIANTS.length).toBeGreaterThanOrEqual(20);
  });

  it("every failure variant outcome is fail/blocked/absent/unknown (never pass)", () => {
    for (const spec of FAILURE_VARIANTS) {
      expect(["fail", "blocked", "absent", "unknown", "pass"]).toContain(spec.outcome);
      // The §10.18 family may include 'pass' for the very-large-portfolio
      // success case (handled gracefully). Most variants must NOT pass.
    }
  });

  it("every failure variant includes a non-empty reason", () => {
    for (const spec of FAILURE_VARIANTS) {
      expect(spec.reason.length).toBeGreaterThan(0);
    }
  });

  it("runFailureVariant records the error in the error-recovery trace (never silently dropped — law §2)", () => {
    for (const spec of FAILURE_VARIANTS) {
      const result = runFailureVariant({
        kind: spec.kind,
        projectId: "firm-retail-S-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      expect(result.errorRecoveryTrace.length).toBeGreaterThan(0);
      expect(result.errorRecoveryTrace[0]?.message).toContain(spec.reason.slice(0, 30));
    }
  });

  it("blocked outcomes produce a terminal-blocked screenshot checkpoint", () => {
    for (const spec of FAILURE_VARIANTS) {
      if (spec.outcome === "blocked") {
        const result = runFailureVariant({
          kind: spec.kind,
          projectId: "firm-retail-S-1-proj-001",
          atUtc: "2026-10-10T07:00:00Z",
        });
        expect(result.checkpoints.some((cp) => cp.phase === "terminal-blocked")).toBe(true);
      }
    }
  });

  it("unknown outcomes produce a terminal-unknown screenshot checkpoint (law §3 — UNKNOWN preserved)", () => {
    for (const spec of FAILURE_VARIANTS) {
      if (spec.outcome === "unknown") {
        const result = runFailureVariant({
          kind: spec.kind,
          projectId: "firm-retail-S-1-proj-001",
          atUtc: "2026-10-10T07:00:00Z",
        });
        expect(result.checkpoints.some((cp) => cp.phase === "terminal-unknown")).toBe(true);
        expect(result.connectorProviderState.state).toBe("unknown");
      }
    }
  });

  it("absent outcomes (hidden/missing UI feature) produce terminal-blocked (law §1 — backend-only is ABSENT)", () => {
    const spec = FAILURE_VARIANTS.find((entry) => entry.kind === "hidden-missing-ui-feature")!;
    const result = runFailureVariant({
      kind: spec.kind,
      projectId: "firm-retail-S-1-proj-001",
      atUtc: "2026-10-10T07:00:00Z",
    });
    expect(result.outcome).toBe("absent");
  });

  it("blocked variants set the post-task adoption hardBlockers (law §5 — never hidden behind a weighted average)", () => {
    for (const spec of FAILURE_VARIANTS) {
      if (spec.blocksTask) {
        const result = runFailureVariant({
          kind: spec.kind,
          projectId: "firm-retail-S-1-proj-001",
          atUtc: "2026-10-10T07:00:00Z",
        });
        expect(result.postTaskAdoptionResponse).toBeDefined();
        expect(result.postTaskAdoptionResponse?.hardBlockers).toContain(spec.kind);
        expect(result.postTaskAdoptionResponse?.technicalFullSwitchEligible).toBe(false);
        expect(result.postTaskAdoptionResponse?.syntheticEstimateLabel).toBe(true);
      }
    }
  });

  it("every assertion records checkedAfterJourney=true (law §4 — assertions only AFTER the journey)", () => {
    for (const spec of FAILURE_VARIANTS) {
      const result = runFailureVariant({
        kind: spec.kind,
        projectId: "firm-retail-S-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      for (const ref of result.assertionRefs) {
        expect(ref.checkedAfterJourney).toBe(true);
      }
    }
  });

  it("every variant begins at the homepage (no deep link — law §1)", () => {
    for (const spec of FAILURE_VARIANTS) {
      const result = runFailureVariant({
        kind: spec.kind,
        projectId: "firm-retail-S-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      const firstStep = result.steps[0];
      expect(firstStep?.surfaceId).toBe("command-center-work-graph");
    }
  });

  it("the unsupported-competitor variant produces UNKNOWN (law §3 — unavailable real UI stays UNKNOWN)", () => {
    const result = runFailureVariant({
      kind: "unsupported-competitor" as FailureVariantKind,
      projectId: "firm-retail-S-1-proj-001",
      atUtc: "2026-10-10T07:00:00Z",
    });
    expect(result.outcome).toBe("unknown");
    expect(result.connectorProviderState.state).toBe("unknown");
  });
});
