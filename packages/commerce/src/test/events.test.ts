/**
 * Contract tests — events, revisions and projections.
 *
 * Events are immutable facts: append-only, gapless per-subject sequences.
 * Projections are derived state: pure folds, no input mutation, replayable.
 */
import { describe, expect, it } from "vitest";
import {
  makeId,
  nextRevision,
  projectEvents,
  validateEventSequence,
  type AnyCommerceEvent,
  type CommerceProjection,
} from "../contract.js";

function event(subjectId: string, sequence: number, kind = "TEST_EVENT"): AnyCommerceEvent {
  return {
    eventId: makeId<"CommerceEventId">(`evt-${subjectId}-${sequence}`),
    sequence,
    occurredAt: "2026-10-05T00:00:00Z",
    subject: { subjectType: "ORDER", subjectId },
    kind,
    payload: { kind, note: `fact-${sequence}` },
  };
}

interface CountState {
  readonly seen: number;
}

const counterProjection: CommerceProjection<CountState> = {
  projectionId: "counter/v1",
  initialState: () => ({ seen: 0 }),
  apply: (state, e) => (e.kind === "TEST_EVENT" ? { seen: state.seen + 1 } : state),
};

describe("event journal discipline", () => {
  it("accepts gapless per-subject sequences", () => {
    const journal = [event("o-1", 1), event("o-1", 2), event("o-2", 1), event("o-1", 3)];
    expect(validateEventSequence(journal)).toMatchObject({ ok: true });
  });

  it("rejects duplicate event ids (facts are unique)", () => {
    const journal = [event("o-1", 1), event("o-1", 2), event("o-1", 2)];
    const result = validateEventSequence(journal);
    expect(result).toMatchObject({ ok: false, error: { code: "DUPLICATE_EVENT_ID" } });
  });

  it("rejects non-monotonic sequences (history corruption is detectable)", () => {
    const journal = [event("o-1", 1), event("o-1", 3)];
    const result = validateEventSequence(journal);
    expect(result).toMatchObject({ ok: false, error: { code: "NON_MONOTONIC_SEQUENCE" } });
  });
});

describe("projections are derived, pure, replayable", () => {
  it("folds deterministically and re-folds identically", () => {
    const journal = [event("o-1", 1), event("o-1", 2), event("o-2", 1)];
    const first = projectEvents(counterProjection, journal);
    const second = projectEvents(counterProjection, journal);
    expect(first.seen).toBe(3);
    expect(second).toEqual(first);
  });

  it("never mutates the input journal (facts are immutable)", () => {
    const journal = [event("o-1", 1), event("o-1", 2)];
    const snapshot = journal.map((e) => ({ ...e }));
    projectEvents(counterProjection, journal);
    expect(journal).toEqual(snapshot);
  });

  it("partial replay yields the same state as full replay of the prefix", () => {
    const journal = [event("o-1", 1), event("o-1", 2), event("o-1", 3)];
    const prefixState = projectEvents(counterProjection, journal.slice(0, 2));
    const fullState = projectEvents(counterProjection, journal);
    expect(prefixState.seen).toBe(2);
    expect(fullState.seen).toBe(3);
  });
});

describe("revisions", () => {
  it("increments monotonically", () => {
    expect(nextRevision(0)).toBe(1);
    expect(nextRevision(41)).toBe(42);
    expect(() => nextRevision(-1)).toThrow(TypeError);
    expect(() => nextRevision(1.5)).toThrow(TypeError);
  });
});
