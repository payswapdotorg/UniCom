/**
 * Live-commerce connector runtime (W3-003; acceptance scenario 5;
 * FROZEN-ARCHITECTURE §3.D live-commerce streams; W3-001 live-commerce
 * contract).
 *
 * Ingests live commerce stream events (listings, bids, chat, sales — all
 * UNTRUSTED third-party content) and executes actions over the runtime's
 * live transport, Whatnot-class:
 *
 * - ARRIVAL ORDER: every event gets a monotonic arrival sequence; the
 *   execution loop drains the queue in strict arrival order (FIFO by
 *   sequence — never by wall clock, never by provider priority);
 * - BACKPRESSURE: ingestion is bounded. When the pending queue exceeds
 *   `softQueueDepth`, ingestion reports "backpressured" — the event is
 *   STILL ACCEPTED into the bounded queue (counted, surfaced in health)
 *   and never dropped: no event loss under bursts;
 * - DEDUPE: events are deduplicated by (stream, eventId) — a replayed
 *   provider event is ignored, never re-executed;
 * - EXECUTION: live actions execute through the injected executor bound
 *   to a connected capability instance (`LiveCommerceExecutionRequest`
 *   contract shape); one in-flight action at a time preserves ordering;
 * - EVIDENCE: every executed action emits a `LiveCommerceActionEvidence`
 *   record (adapter, action, outcome, timing, arrival sequence) —
 *   queryable from the connector telemetry surface.
 */

import type { AuthorizationContextRef, ConnectedCapabilityInstanceId, LiveStreamId } from "../../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";
import type { ConnectorExecutionOutcome } from "../../connector/observability";
import type { LiveCommerceActionKind } from "../../connector/live-commerce";
import { asUtcTimestamp } from "../ids";

/** One ingested live event (untrusted content + arrival sequence). */
export interface LiveIngestedEvent {
  readonly streamId: LiveStreamId;
  readonly eventId: string;
  readonly occurredAt: UtcIso8601String;
  readonly arrivalSequence: number;
  readonly kind: "listing" | "bid" | "chat" | "sale" | "stream-control";
  /** Untrusted raw event payload — data, never instructions. */
  readonly untrustedPayload: string;
}

/** Ingestion outcome (backpressure is a REPORT, never a drop). */
export type LiveIngestStatus =
  | { readonly status: "accepted" }
  | { readonly status: "duplicate-ignored" }
  | { readonly status: "backpressured"; readonly queueDepth: number };

/** An action to execute inside the live stream (arrival-ordered). */
export interface LiveActionInput {
  readonly streamId: LiveStreamId;
  readonly action: LiveCommerceActionKind;
  readonly eventId: string;
  readonly viaCapabilityInstance: ConnectedCapabilityInstanceId;
  readonly idempotencyKey: IdempotencyKey;
  readonly authorization: AuthorizationContextRef;
  readonly payloadRef: string;
}

/** Evidence for one executed live action. */
export interface LiveCommerceActionEvidence {
  readonly actionRef: string;
  readonly streamId: LiveStreamId;
  readonly action: LiveCommerceActionKind;
  readonly arrivalSequence: number;
  readonly outcome: ConnectorExecutionOutcome;
  readonly startedAt: UtcIso8601String;
  readonly endedAt: UtcIso8601String;
  readonly note?: string;
}

/** Executor: routes a live action through the connector plane. */
export type LiveActionExecutor = (input: LiveActionInput) => Promise<ConnectorExecutionOutcome>;

/** Health view of the live-commerce connector. */
export interface LiveCommerceHealth {
  readonly streamRef: LiveStreamId;
  readonly ingested: number;
  readonly duplicatesIgnored: number;
  readonly backpressureEvents: number;
  readonly pendingActions: number;
  readonly executedActions: number;
  readonly lastOutcome?: ConnectorExecutionOutcome;
}

export interface LiveCommerceConnectorOptions {
  readonly streamId: LiveStreamId;
  readonly executeAction: LiveActionExecutor;
  readonly clock: () => string;
  /** Queue depth at which ingestion reports backpressure (default 32). */
  readonly softQueueDepth?: number;
}

export interface LiveCommerceConnectorRuntime {
  /** Ingest one live event (deduped; backpressure is reported, never drops). */
  ingestEvent(event: {
    readonly eventId: string;
    readonly occurredAt: UtcIso8601String;
    readonly kind: LiveIngestedEvent["kind"];
    readonly untrustedPayload: string;
  }): LiveIngestStatus;
  /** Enqueue an executable action tied to an ingested event (in order). */
  enqueueAction(input: Omit<LiveActionInput, "streamId">): { status: "queued" | "duplicate-ignored" };
  /**
   * Drain pending actions in ARRIVAL ORDER (FIFO by arrival sequence),
   * one at a time. Under burst, callers invoke drain repeatedly; nothing
   * is lost — the queue is bounded but never dropping.
   */
  drainReady(maxActions?: number): Promise<readonly LiveCommerceActionEvidence[]>;
  /** Ingested events in arrival order (untrusted payloads included). */
  events(): readonly LiveIngestedEvent[];
  /** Execution evidence for all executed actions (queryable). */
  actionEvidence(): readonly LiveCommerceActionEvidence[];
  health(): LiveCommerceHealth;
}

interface PendingAction {
  readonly input: LiveActionInput;
  readonly arrivalSequence: number;
}

export function createLiveCommerceConnector(
  options: LiveCommerceConnectorOptions,
): LiveCommerceConnectorRuntime {
  const { streamId, executeAction, clock } = options;
  const softQueueDepth = options.softQueueDepth ?? 32;
  const events: LiveIngestedEvent[] = [];
  const eventIds = new Set<string>();
  const actionKeys = new Set<string>();
  const pending: PendingAction[] = [];
  const evidence: LiveCommerceActionEvidence[] = [];
  let arrivalSequence = 0;
  let duplicatesIgnored = 0;
  let backpressureEvents = 0;

  const runtime: LiveCommerceConnectorRuntime = {
    ingestEvent(event): LiveIngestStatus {
      const compositeKey = `${streamId}:${event.eventId}`;
      if (eventIds.has(compositeKey)) {
        duplicatesIgnored += 1;
        return { status: "duplicate-ignored" };
      }
      eventIds.add(compositeKey);
      arrivalSequence += 1;
      events.push({
        streamId,
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        arrivalSequence,
        kind: event.kind,
        untrustedPayload: event.untrustedPayload,
      });
      if (pending.length >= softQueueDepth) {
        // Backpressure is REPORTED and counted — the event itself stays
        // accepted (no loss); the operator surface sees the pressure.
        backpressureEvents += 1;
        return { status: "backpressured", queueDepth: pending.length };
      }
      return { status: "accepted" };
    },

    enqueueAction(input) {
      if (actionKeys.has(input.idempotencyKey)) return { status: "duplicate-ignored" };
      actionKeys.add(input.idempotencyKey);
      arrivalSequence += 1;
      pending.push({ input: { ...input, streamId }, arrivalSequence });
      return { status: "queued" };
    },

    async drainReady(maxActions = pending.length): Promise<readonly LiveCommerceActionEvidence[]> {
      const executed: LiveCommerceActionEvidence[] = [];
      // Strict arrival order: sort by arrival sequence, take the head.
      pending.sort((left, right) => left.arrivalSequence - right.arrivalSequence);
      let count = 0;
      while (count < maxActions && pending.length > 0) {
        const next = pending.shift();
        if (next === undefined) break;
        const startedAt = asUtcTimestamp(clock());
        let outcome: ConnectorExecutionOutcome;
        let note: string | undefined;
        try {
          outcome = await executeAction(next.input);
        } catch (error) {
          outcome = "unknown";
          note = error instanceof Error ? error.message : "executor threw";
        }
        const endedAt = asUtcTimestamp(clock());
        const record: LiveCommerceActionEvidence = {
          actionRef: `live-action-${next.arrivalSequence}-${next.input.idempotencyKey}`,
          streamId,
          action: next.input.action,
          arrivalSequence: next.arrivalSequence,
          outcome,
          startedAt,
          endedAt,
          ...(note === undefined ? {} : { note }),
        };
        evidence.push(record);
        executed.push(record);
        count += 1;
      }
      return executed;
    },

    events(): readonly LiveIngestedEvent[] {
      return events.map((event) => ({ ...event }));
    },

    actionEvidence(): readonly LiveCommerceActionEvidence[] {
      return evidence.map((record) => ({ ...record }));
    },

    health(): LiveCommerceHealth {
      const last = evidence[evidence.length - 1];
      return {
        streamRef: streamId,
        ingested: events.length,
        duplicatesIgnored,
        backpressureEvents,
        pendingActions: pending.length,
        executedActions: evidence.length,
        ...(last === undefined ? {} : { lastOutcome: last.outcome }),
      };
    },
  };
  return runtime;
}
