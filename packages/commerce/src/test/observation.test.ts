/**
 * Contract tests — three-state truth and UNKNOWN ≠ FAILED (W1-001 §4.1/§4.5).
 *
 * Authoritative operational state, provider/physical observation and
 * predictive estimate are SEPARATE types; only deterministic reconciliation
 * promotes an observation. Provider-native state is preserved verbatim.
 */
import { describe, expect, it } from "vitest";
import {
  failedResolution,
  isFailed,
  isObserved,
  isUnknown,
  makeId,
  unknownResolution,
  type CanonicalInventoryLevel,
  type ObservationResolution,
  type PredictiveEstimate,
} from "../contract.js";

describe("tri-state observation resolution", () => {
  it("distinguishes OBSERVED / UNKNOWN / FAILED", () => {
    const observed: ObservationResolution<number> = { resolved: "OBSERVED", value: 12 };
    const unknown: ObservationResolution<number> = { resolved: "UNKNOWN", reason: "AMBIGUOUS" };
    const failed: ObservationResolution<number> = { resolved: "FAILED", error: "scanner hardware fault" };
    expect(isObserved(observed)).toBe(true);
    expect(isUnknown(unknown)).toBe(true);
    expect(isFailed(failed)).toBe(true);
    expect(isUnknown(failed)).toBe(false);
    expect(isFailed(unknown)).toBe(false);
  });

  it("UNKNOWN is not FAILED and carries an explicit reason", () => {
    const resolution = unknownResolution("CONFLICTING_OBSERVATIONS", "PARTIAL_SCAN_TIMEOUT");
    expect(resolution.resolved).toBe("UNKNOWN");
    if (resolution.resolved === "UNKNOWN") {
      expect(resolution.reason).toBe("CONFLICTING_OBSERVATIONS");
      // Provider-native state preserved verbatim (INVARIANT 11) — not flattened.
      expect(resolution.providerNativeStatus).toBe("PARTIAL_SCAN_TIMEOUT");
    }
  });

  it("FAILED is reserved for observation-attempt errors", () => {
    const resolution = failedResolution("device disconnected mid-scan");
    expect(resolution.resolved).toBe("FAILED");
    if (resolution.resolved === "FAILED") {
      expect(resolution.error).toBe("device disconnected mid-scan");
    }
  });

  it("compile-time separation: observations and estimates are not canonical state", () => {
    // @ts-expect-error — an observation is not a canonical inventory level (three-state law)
    const asLevel: CanonicalInventoryLevel = { resolved: "OBSERVED", value: 12 };
    void asLevel;
    // @ts-expect-error — a predictive estimate is not an observation resolution
    const asResolution: ObservationResolution<number> = { estimatedAt: "t", modelRef: "m", estimate: 12 };
    void asResolution;
    expect(true).toBe(true);
  });
});

describe("predictive estimates never become truth by assignment", () => {
  it("carries model reference and confidence without any canonical authority", () => {
    const estimate: PredictiveEstimate<number> = {
      estimatedAt: "2026-10-05T00:00:00Z",
      modelRef: "demand-forecast/v3",
      estimate: 9,
      confidenceBps: 7500,
    };
    expect(estimate.estimate).toBe(9);
    expect(estimate.confidenceBps).toBe(7500);
  });

  it("compile-time: an estimate is not a canonical level", () => {
    const estimate: PredictiveEstimate<number> = { estimatedAt: "t", modelRef: "m", estimate: 9 };
    // @ts-expect-error — a prediction can never be assigned where operational truth is required
    const level: CanonicalInventoryLevel = estimate;
    void level;
    expect(true).toBe(true);
  });
});

describe("opaque observation ids", () => {
  it("ids are validated nominal values", () => {
    expect(makeId<"ObservationId">("obs-1")).toBe("obs-1");
    expect(() => makeId<"ObservationId">("")).toThrow(TypeError);
    expect(() => makeId<"ObservationId">("bad id!")).toThrow(TypeError);
    expect(() => makeId<"ObservationId">("x".repeat(200))).toThrow(TypeError);
  });
});
