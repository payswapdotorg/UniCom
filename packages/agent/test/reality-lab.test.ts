import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  journalCommerceFacts,
  pinCommerceFactsInterface,
  REALITY_LAB_OBSERVER,
  REALITY_SCENARIO_BATTERY,
  runRealityScenario,
  SeededRandom,
  SimClock,
  type RealityTrajectory,
} from "../src/index.js";
import { batteryScenario } from "../src/index.js";

/**
 * W2-005 acceptance scenario 1 — Reality Lab determinism:
 * same seed → same environment trajectory (two runs, identical event
 * streams + outcomes). Plus the simulation laws: opaque seam reads only,
 * no canonical mutation path, no wall clock, no unseeded randomness.
 */

const ROUTINE = batteryScenario("scenario:reality:routine-commerce");
const ABUSE = batteryScenario("scenario:reality:coordinated-abuse");

function snapshotFacts(trajectory: RealityTrajectory) {
  return trajectory.environment.orderRefs().map((orderRef) => ({
    subject: trajectory.environment.orderSubject(orderRef),
    delivery: trajectory.environment.deliveryConfirmation(orderRef),
    content: trajectory.environment.shipmentContent(orderRef),
  }));
}

describe("scenario 1 — same seed → same environment trajectory", () => {
  it("two runs of the same scenario produce IDENTICAL event streams (incl. hash chain)", () => {
    expect(ROUTINE).toBeDefined();
    if (ROUTINE === undefined) return;
    const first = runRealityScenario(ROUTINE);
    const second = runRealityScenario(ROUTINE);
    expect(second.events).toEqual(first.events);
    expect(second.outcomeDigest).toBe(first.outcomeDigest);
    expect(second.actorCount).toBe(first.actorCount);
    expect(second.events.length).toBeGreaterThan(20);
  });

  it("two runs realize IDENTICAL simulated facts through the opaque seam", () => {
    if (ROUTINE === undefined || ABUSE === undefined) return;
    const routineFirst = runRealityScenario(ROUTINE);
    const routineSecond = runRealityScenario(ROUTINE);
    expect(snapshotFacts(routineSecond)).toEqual(snapshotFacts(routineFirst));
    expect(routineSecond.environment.customerRefs()).toEqual(routineFirst.environment.customerRefs());

    const abuseFirst = runRealityScenario(ABUSE);
    const abuseSecond = runRealityScenario(ABUSE);
    expect(snapshotFacts(abuseSecond)).toEqual(snapshotFacts(abuseFirst));
    // The tri-state law survives realization: UNKNOWN observations stay UNKNOWN.
    const wrongItemEvasion = abuseFirst.environment.shipmentContent(
      "order:scenario:reality:coordinated-abuse:wrong-item-evasion",
    );
    expect(wrongItemEvasion?.observedSkuRef).toEqual({ known: false });
  });

  it("a different seed produces a DIFFERENT trajectory (the seed matters)", () => {
    if (ROUTINE === undefined) return;
    const baseline = runRealityScenario(ROUTINE);
    const reseeded = runRealityScenario({ ...ROUTINE, seed: "reality-seed:routine-commerce:ALT" });
    expect(reseeded.outcomeDigest).not.toBe(baseline.outcomeDigest);
    expect(reseeded.events).not.toEqual(baseline.events);
  });

  it("the first run is unaffected by the second (no shared mutable state)", () => {
    if (ROUTINE === undefined) return;
    const first = runRealityScenario(ROUTINE);
    const before = snapshotFacts(first);
    runRealityScenario(ROUTINE);
    expect(snapshotFacts(first)).toEqual(before);
  });
});

describe("scenario 1 — the simulation laws (opaque seam reads only)", () => {
  it("the environment implements the pinned commerce-facts seam (read-only port)", () => {
    if (ABUSE === undefined) return;
    const trajectory = runRealityScenario(ABUSE);
    const port = pinCommerceFactsInterface(trajectory.environment);
    expect(port.interfaceId).toBe("commerce-facts");
    expect(port.version).toBe(1);
    // Reads are the ONLY operations — there is no command port, no write path.
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(trajectory.environment)).sort()).toEqual(
      [
        "constructor",
        "customerRefs",
        "deliveryConfirmation",
        "orderRefs",
        "orderSubject",
        "recordSimulatedOrder",
        "recordSimulatedReturnHistory",
        "returnHistory",
        "shipmentContent",
      ].sort(),
    );
  });

  it("commerce facts journal through the opaque seam with chain integrity", () => {
    if (ABUSE === undefined) return;
    const trajectory = runRealityScenario(ABUSE);
    const journal = new EvidenceJournal();
    const journaled = journalCommerceFacts({
      journal,
      port: trajectory.environment,
      orderRefs: trajectory.environment.orderRefs().slice(0, 4),
      customerRefs: trajectory.environment.customerRefs(),
      subjectRef: REALITY_LAB_OBSERVER,
      recordedAt: "2026-12-01T00:00:00.000Z",
    });
    expect(journaled.length).toBeGreaterThan(0);
    expect(journal.verifyChain().ok).toBe(true);
    for (const record of journaled) {
      expect(record.kind).toBe("commerce-fact");
      expect((record.payload as { evidenceKind: string }).evidenceKind).toBe(
        "COMMERCE_FACT_SNAPSHOT",
      );
    }
  });

  it("every battery scenario runs deterministically and covers the battery", () => {
    expect(REALITY_SCENARIO_BATTERY).toHaveLength(5);
    for (const scenario of REALITY_SCENARIO_BATTERY) {
      const first = runRealityScenario(scenario);
      const second = runRealityScenario(scenario);
      expect(second.events).toEqual(first.events);
      expect(second.outcomeDigest).toBe(first.outcomeDigest);
      expect(first.events.every((event, index) => event.sequence === index + 1)).toBe(true);
    }
  });
});

describe("deterministic primitives — no Math.random, no wall clock", () => {
  it("SeededRandom: same seed → same draw sequence; different seed → different draws", () => {
    const draw = (random: SeededRandom): readonly number[] => [
      random.nextInt(0, 1_000),
      random.nextInt(0, 1_000),
      random.nextInt(0, 1_000),
    ];
    expect(draw(SeededRandom.fromSeed("seed-1"))).toEqual(draw(SeededRandom.fromSeed("seed-1")));
    expect(draw(SeededRandom.fromSeed("seed-1"))).not.toEqual(
      draw(SeededRandom.fromSeed("seed-2")),
    );
  });

  it("SimClock: tick-derived ISO timestamps, deterministic and advancing", () => {
    const clock = new SimClock(Date.parse("2026-11-01T00:00:00.000Z"), 3_600_000);
    const first = clock.now();
    clock.advance();
    const second = clock.now();
    expect(first).toBe("2026-11-01T00:00:00.000Z");
    expect(second).toBe("2026-11-01T01:00:00.000Z");
    const replay = new SimClock(Date.parse("2026-11-01T00:00:00.000Z"), 3_600_000);
    replay.advance();
    expect(replay.now()).toBe(second);
  });
});
