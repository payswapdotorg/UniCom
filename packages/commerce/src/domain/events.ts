/**
 * CommerceEvent + projections: event-sourced truth.
 *
 * - Events are IMMUTABLE FACTS (INVARIANT 15): append-only, never edited.
 *   State changes are new events, never in-place mutations of history.
 * - Projections are DERIVED state (FROZEN-ARCHITECTURE §3.E): what happened
 *   is the journal; what is true now is a fold. Re-folding is deterministic.
 */
import type { CommerceEventId, CommerceSubjectType, CorrelationId, CommandId } from "./ids.js";
import { err, ok, type Result } from "./result.js";

/** The event envelope. `K` is the event kind, `P` the typed payload. */
export interface CommerceEvent<K extends string = string, P = unknown> {
  readonly eventId: CommerceEventId;
  /** Monotonic per-subject sequence (1-based, gapless). */
  readonly sequence: number;
  readonly occurredAt: string;
  readonly subject: CommerceSubjectRef;
  readonly kind: K;
  readonly payload: P;
  /** Command (or upstream event) that caused this fact. */
  readonly causationId?: CommandId | CommerceEventId;
  readonly correlationId?: CorrelationId;
}

export interface CommerceSubjectRef {
  readonly subjectType: CommerceSubjectType;
  readonly subjectId: string;
}

/** Any concrete event; folds narrow by `kind`. */
export type AnyCommerceEvent = CommerceEvent<string, unknown>;

/** Versioned state pairing used by snapshots and policy revisions. */
export interface Revisioned<S> {
  readonly revision: number;
  readonly state: S;
}

export function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new TypeError(`invalid revision: ${current}`);
  }
  return current + 1;
}

export type EventSequenceError =
  | { code: "DUPLICATE_EVENT_ID"; eventId: CommerceEventId }
  | { code: "NON_MONOTONIC_SEQUENCE"; subject: string; expected: number; actual: number };

/**
 * Deterministic journal validation: event ids unique, per-subject sequences
 * strictly gapless-monotonic. History corruption is detectable, never silent.
 */
export function validateEventSequence(
  events: readonly AnyCommerceEvent[],
): Result<void, EventSequenceError> {
  const seenIds = new Set<string>();
  const nextBySubject = new Map<string, number>();
  for (const event of events) {
    if (seenIds.has(event.eventId)) {
      return err({ code: "DUPLICATE_EVENT_ID", eventId: event.eventId });
    }
    seenIds.add(event.eventId);
    const key = `${event.subject.subjectType}:${event.subject.subjectId}`;
    const expected = (nextBySubject.get(key) ?? 0) + 1;
    if (event.sequence !== expected) {
      return err({ code: "NON_MONOTONIC_SEQUENCE", subject: key, expected, actual: event.sequence });
    }
    nextBySubject.set(key, expected);
  }
  return ok(undefined);
}

/** A deterministic projection: derived state folded from immutable events. */
export interface CommerceProjection<S> {
  readonly projectionId: string;
  initialState(): S;
  apply(state: S, event: AnyCommerceEvent): S;
}

/** Fold a projection over an ordered journal slice. Pure: never mutates input. */
export function projectEvents<S>(projection: CommerceProjection<S>, events: readonly AnyCommerceEvent[]): S {
  let state = projection.initialState();
  for (const event of events) state = projection.apply(state, event);
  return state;
}
