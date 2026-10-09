/**
 * W3-009 — No-RFID supermarket GUI paths tests (protocol §4 + §10.16).
 *
 * The supermarket cohort runs WITHOUT RFID hardware. Every path uses POS /
 * file import, barcode / camera count, weighted item, offline observation
 * queue, receiving, or explicit reconciliation — never RFID (INVARIANT 46).
 * Observations never silently promote (INVARIANT 29) — reconciliation is
 * required before canonical stock changes.
 */

import { describe, expect, it } from "vitest";
import {
  NO_RFID_PATHS,
  runNoRfidPath,
  type NoRfidPathKind,
} from "../../src/sim";

describe("W3-009 no-RFID supermarket GUI paths", () => {
  it("declares exactly 6 no-RFID path kinds (POS/file, barcode/camera, weighted, offline queue, receiving, reconciliation)", () => {
    expect(NO_RFID_PATHS.length).toBe(6);
    const kinds = NO_RFID_PATHS.map((p) => p.kind);
    expect(kinds).toContain("pos-file-import");
    expect(kinds).toContain("barcode-camera-count");
    expect(kinds).toContain("weighted-item");
    expect(kinds).toContain("offline-observation-queue");
    expect(kinds).toContain("receiving");
    expect(kinds).toContain("reconciliation");
  });

  it("none of the paths use RFID (INVARIANT 46 — RFID is optional)", () => {
    for (const path of NO_RFID_PATHS) {
      expect(path.kind).not.toContain("rfid");
      expect(path.visibleLabel.toLowerCase()).not.toContain("rfid");
    }
  });

  it("every path starts at the homepage (no deep link — law §1)", () => {
    for (const kind of NO_RFID_PATHS.map((p) => p.kind)) {
      const result = runNoRfidPath({
        kind: kind as NoRfidPathKind,
        projectId: "firm-grocery-L-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      const firstStep = result.steps[0];
      expect(firstStep?.surfaceId).toBe("command-center-work-graph");
      expect(firstStep?.action).toBe("navigate-back");
    }
  });

  it("paths that produce offline queue entries declare it (no silent promotion)", () => {
    for (const path of NO_RFID_PATHS) {
      if (path.producesOfflineQueueEntry) {
        const result = runNoRfidPath({
          kind: path.kind,
          projectId: "firm-grocery-L-1-proj-001",
          atUtc: "2026-10-10T07:00:00Z",
        });
        expect(result.evidenceState.evidenceArtifacts.some((a) => a.artifactKind === "observation")).toBe(true);
      }
    }
  });

  it("every path requires explicit reconciliation (INVARIANT 29 — never silently promoted)", () => {
    for (const path of NO_RFID_PATHS) {
      expect(path.requiresReconciliation).toBe(true);
      const result = runNoRfidPath({
        kind: path.kind,
        projectId: "firm-grocery-L-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      expect(result.observationsNeverPromoted).toBe(true);
      expect(result.approvalState.required).toBe(true);
      expect(result.approvalState.approvalKind).toBe("operator");
    }
  });

  it("every path captures a start + critical-decision + terminal-success screenshot sequence", () => {
    for (const kind of NO_RFID_PATHS.map((p) => p.kind)) {
      const result = runNoRfidPath({
        kind: kind as NoRfidPathKind,
        projectId: "firm-grocery-L-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      const phases = result.checkpoints.map((cp) => cp.phase);
      expect(phases).toContain("start");
      expect(phases).toContain("critical-decision");
      expect(phases).toContain("terminal-success");
    }
  });

  it("connector/provider state is UNKNOWN when no live probe was attempted (law §3)", () => {
    for (const path of NO_RFID_PATHS) {
      if (path.providerState === "unknown") {
        const result = runNoRfidPath({
          kind: path.kind,
          projectId: "firm-grocery-L-1-proj-001",
          atUtc: "2026-10-10T07:00:00Z",
        });
        expect(result.connectorProviderState.state).toBe("unknown");
      }
    }
  });

  it("every path records an assertion that no-RFID was used", () => {
    for (const kind of NO_RFID_PATHS.map((p) => p.kind)) {
      const result = runNoRfidPath({
        kind: kind as NoRfidPathKind,
        projectId: "firm-grocery-L-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      expect(result.assertionRefs.length).toBeGreaterThan(0);
      expect(result.assertionRefs[0]?.checkedAfterJourney).toBe(true);
      expect(result.assertionRefs[0]?.evidenceNote).toContain("no-RFID");
    }
  });

  it("evidence state preserves through reconnect (offline queue survives)", () => {
    for (const kind of NO_RFID_PATHS.map((p) => p.kind)) {
      const result = runNoRfidPath({
        kind: kind as NoRfidPathKind,
        projectId: "firm-grocery-L-1-proj-001",
        atUtc: "2026-10-10T07:00:00Z",
      });
      expect(result.evidenceState.preservedThroughReconnect).toBe(true);
    }
  });
});
