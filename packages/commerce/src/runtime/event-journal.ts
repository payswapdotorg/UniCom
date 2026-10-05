/**
 * Append-only CommerceEvent journal (W1-002 runtime).
 *
 * Contract laws enforced here:
 * - History is immutable: events are appended, never edited or removed.
 * - Per-subject sequences are strictly gapless-monotonic (1-based).
 * - Event ids are unique; deterministic minting (`evt-<n>`).
 * - Replayed historical facts are validated before ingestion: a corrupted
 *   journal throws (detected, never silent).
 */
import { makeId, type CommandId, type CommerceEventId, type CorrelationId } from "../domain/ids.js";
import type { AnyCommerceEvent, CommerceSubjectRef } from "../domain/events.js";
import { validateEventSequence } from "../domain/events.js";

export class EventJournal {
  private readonly events: AnyCommerceEvent[] = [];
  private readonly sequences = new Map<string, number>();
  private readonly eventIds = new Set<string>();

  /** Immutable ordered view of the journal. */
  journal(): readonly AnyCommerceEvent[] {
    return this.events;
  }

  /** The journal satisfies the domain sequence law (unique ids, gapless). */
  isValid(): boolean {
    return validateEventSequence(this.events).ok;
  }

  /**
   * Append a new immutable fact. Sequence numbers are gapless per subject;
   * event ids are deterministic given append order; `occurredAt` is supplied
   * by the kernel's deterministic time source.
   */
  append(
    subject: CommerceSubjectRef,
    kind: string,
    payload: unknown,
    occurredAt: string,
    causationId?: CommandId | CommerceEventId,
    correlationId?: CorrelationId,
  ): AnyCommerceEvent {
    const key = `${subject.subjectType}:${subject.subjectId}`;
    const sequence = (this.sequences.get(key) ?? 0) + 1;
    const eventId = this.mintEventId();
    const event: AnyCommerceEvent = {
      eventId,
      sequence,
      occurredAt,
      subject,
      kind,
      payload,
      causationId,
      correlationId,
    };
    this.events.push(event);
    this.sequences.set(key, sequence);
    return event;
  }

  /**
   * Ingest a historical fact (event-sourced reconstruction). The fact must
   * fit the journal discipline exactly (unique id, gapless sequence);
   * otherwise the journal is corrupt and the ingestion throws.
   */
  replay(event: AnyCommerceEvent): void {
    if (this.eventIds.has(event.eventId)) {
      throw new TypeError(`journal replay: duplicate event id ${event.eventId}`);
    }
    const key = `${event.subject.subjectType}:${event.subject.subjectId}`;
    const expected = (this.sequences.get(key) ?? 0) + 1;
    if (event.sequence !== expected) {
      throw new TypeError(
        `journal replay: non-monotonic sequence for ${key}: expected ${expected}, actual ${event.sequence}`,
      );
    }
    this.eventIds.add(event.eventId);
    this.events.push(event);
    this.sequences.set(key, expected);
  }

  /** Deterministic minting that avoids colliding with replayed ids. */
  private mintEventId(): CommerceEventId {
    let suffix = this.events.length + 1;
    let candidate = makeId<"CommerceEventId">(`evt-${suffix}`);
    while (this.eventIds.has(candidate)) {
      suffix += 1;
      candidate = makeId<"CommerceEventId">(`evt-${suffix}`);
    }
    this.eventIds.add(candidate);
    return candidate;
  }
}
