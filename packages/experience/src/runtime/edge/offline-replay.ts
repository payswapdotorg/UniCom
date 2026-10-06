/**
 * Offline observation replay — capture-time truth + journaled conflict rules
 * (W3-004; acceptance scenario 4; INVARIANTS 29/47, W3-001 offline-queue law).
 *
 * Offline captures carry CAPTURE-TIME TRUTH: a monotonic sequence and a
 * timestamp minted when the observation was MADE, not when it replays. On
 * reconnect the backlog replays EXACTLY-ONCE (idempotency keys) through the
 * journaled conflict/supersede rules:
 *
 * ┌────────────────────────────────────┬──────────────────────────────────┐
 * │ Situation                          │ Journaled decision              │
 * ├────────────────────────────────────┼──────────────────────────────────┤
 * │ idempotency key already replayed   │ duplicate-ignored               │
 * │ no online fact for the subject     │ applied (fold candidate)        │
 * │ offline capture FRESHER than online│ applied — the supersede is      │
 * │                                    │ JOURNALED, never silent         │
 * │ offline capture STALE vs online    │ superseded-stale — the online   │
 * │                                    │ fact STANDS; the observation    │
 * │                                    │ stays evidence, never overwrites│
 * │ identical stamp, different capture │ conflict-ambiguous — UNKNOWN,   │
 * │                                    │ never a coin-flip pick          │
 * └────────────────────────────────────┴──────────────────────────────────┘
 *
 * A stale offline observation NEVER silently overwrites a fresher online
 * fact: every decision lands in the append-only supersede journal with
 * both stamps and a rationale. The fold's terminal state on this side is
 * the APPLIED set — the freshest captures per subject that flow to the
 * commerce lane's reconciliation as fold candidates (still observations).
 */

import type { PhysicalObservation } from "../../edge/observation";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";
import type { LocalEdgeDeviceId } from "../../common/opaque-refs";
import { asUtcTimestamp } from "../ids";

/** Capture-time truth: sequence + timestamp, minted when the capture HAPPENED. */
export interface CaptureStamp {
  /** Monotonic per edge device (capture order survives replay). */
  readonly sequence: number;
  readonly capturedAt: UtcIso8601String;
  readonly captureMode: "online" | "offline";
}

/** One offline-captured observation with its capture-time stamp. */
export interface StampedObservation {
  readonly observation: PhysicalObservation;
  readonly stamp: CaptureStamp;
  /** Subject the observation bears on (e.g. "sku|location"). */
  readonly subjectKey: string;
  readonly idempotencyKey: IdempotencyKey;
}

/** The current online fact's capture stamp (how fresh the online side is). */
export interface OnlineFactStamp {
  readonly stamp: CaptureStamp;
  readonly sourceNote?: string;
}

/** The journaled supersede decision for one replayed capture. */
export type SupersedeDecision =
  | "applied"
  | "superseded-stale"
  | "duplicate-ignored"
  | "conflict-ambiguous";

/** One append-only journal entry (evidence, never mutated). */
export interface SupersedeJournalEntry {
  readonly observationId: string;
  readonly subjectKey: string;
  readonly decision: SupersedeDecision;
  readonly offlineStamp: CaptureStamp;
  readonly onlineStamp?: CaptureStamp;
  readonly rationale: string;
  readonly decidedAt: UtcIso8601String;
}

/** The replay report: counts + journal + the applied fold candidates. */
export interface OfflineReplayReport {
  readonly replayed: number;
  readonly applied: number;
  readonly supersededStale: number;
  readonly duplicatesIgnored: number;
  readonly ambiguous: number;
  readonly journal: readonly SupersedeJournalEntry[];
  /** Freshest captures per subject, in replay order — the fold candidates. */
  readonly appliedObservations: readonly PhysicalObservation[];
}

export interface OfflineCaptureRecorderOptions {
  readonly deviceRef: LocalEdgeDeviceId;
  /** Capture clock — the timestamp half of capture-time truth. */
  readonly clock: () => string;
}

/**
 * The capture-side recorder: stamps observations AT CAPTURE (sequence +
 * timestamp) so offline truth survives any replay delay. The recorder
 * holds the backlog while disconnected; stamps are immutable once minted.
 */
export interface OfflineCaptureRecorder {
  /** Stamp and record one capture made RIGHT NOW. */
  record(observation: PhysicalObservation, subjectKey: string, idempotencyKey: IdempotencyKey): StampedObservation;
  /** The stamped backlog in capture order. */
  entries(): readonly StampedObservation[];
}

export function createOfflineCaptureRecorder(options: OfflineCaptureRecorderOptions): OfflineCaptureRecorder {
  const entries: StampedObservation[] = [];
  let sequence = 0;
  return {
    record(observation, subjectKey, idempotencyKey): StampedObservation {
      if (idempotencyKey.length === 0) {
        throw new Error("offline capture requires a non-empty idempotency key");
      }
      sequence += 1;
      const stamped: StampedObservation = {
        observation,
        subjectKey,
        idempotencyKey,
        stamp: {
          sequence,
          capturedAt: asUtcTimestamp(options.clock()),
          captureMode: observation.capture.captureMode,
        },
      };
      entries.push(stamped);
      return { ...stamped };
    },
    entries(): readonly StampedObservation[] {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}

/** Freshness order: capture timestamp first, sequence as the tie-break. */
function isFresherOrEqual(a: CaptureStamp, b: CaptureStamp): boolean {
  const aTime = Date.parse(a.capturedAt);
  const bTime = Date.parse(b.capturedAt);
  if (aTime !== bTime) return aTime > bTime;
  return a.sequence >= b.sequence;
}

function stampsIdentical(a: CaptureStamp, b: CaptureStamp): boolean {
  return a.sequence === b.sequence && a.capturedAt === b.capturedAt;
}

export interface OfflineReplayOptions {
  /** The online side's current fact stamp per subject (injected lookup). */
  readonly onlineFactOf: (subjectKey: string) => OnlineFactStamp | undefined;
  /** Decision clock (journal evidence). */
  readonly clock: () => string;
}

/** The stateful offline-observation replayer (exactly-once across passes). */
export interface OfflineObservationReplayer {
  /**
   * Replay a backlog pass through the journaled conflict/supersede rules.
   * Idempotency keys are remembered ACROSS passes — a capture replayed once
   * never processes again. Deterministic per pass.
   */
  replay(entries: readonly StampedObservation[]): OfflineReplayReport;
  /** The append-only supersede journal across all passes. */
  journal(): readonly SupersedeJournalEntry[];
  /** The current fold state: freshest applied stamp per subject. */
  latestStamps(): ReadonlyMap<string, CaptureStamp>;
}

/**
 * Create the replayer. The fold state starts from the ONLINE facts (via the
 * injected lookup) and advances as fresher captures apply — later backlog
 * entries for the same subject chain against the fold, not the stale online
 * fact.
 */
export function createOfflineObservationReplayer(options: OfflineReplayOptions): OfflineObservationReplayer {
  const replayedKeys = new Set<string>();
  const journal: SupersedeJournalEntry[] = [];
  const latestBySubject = new Map<string, CaptureStamp>();

  return {
    replay(entries: readonly StampedObservation[]): OfflineReplayReport {
      const { onlineFactOf, clock } = options;
      const appliedObservations: PhysicalObservation[] = [];
      let applied = 0;
      let supersededStale = 0;
      let duplicatesIgnored = 0;
      let ambiguous = 0;

      for (const entry of entries) {
        const decidedAt = asUtcTimestamp(clock());
        const online = onlineFactOf(entry.subjectKey);
        const onlineStamp = online?.stamp ?? latestBySubject.get(entry.subjectKey);
        const base = {
          observationId: entry.observation.observationId,
          subjectKey: entry.subjectKey,
          offlineStamp: entry.stamp,
          decidedAt,
        };
        if (replayedKeys.has(entry.idempotencyKey)) {
          // Exactly-once: a replayed key never processes twice.
          duplicatesIgnored += 1;
          journal.push({
            ...base,
            decision: "duplicate-ignored",
            rationale: `idempotency key "${entry.idempotencyKey}" already replayed`,
          });
          continue;
        }
        replayedKeys.add(entry.idempotencyKey);
        if (onlineStamp === undefined) {
          // No online fact (and no prior applied capture): the observation is
          // the fold candidate for its subject.
          applied += 1;
          latestBySubject.set(entry.subjectKey, entry.stamp);
          appliedObservations.push(entry.observation);
          journal.push({
            ...base,
            decision: "applied",
            rationale: `no online fact for subject "${entry.subjectKey}" — offline capture becomes the fold candidate`,
          });
          continue;
        }
        if (stampsIdentical(onlineStamp, entry.stamp)) {
          // Identical stamp but a different capture: the journal cannot order
          // them — UNKNOWN, never a coin-flip pick (INVARIANT 10).
          ambiguous += 1;
          journal.push({
            ...base,
            onlineStamp,
            decision: "conflict-ambiguous",
            rationale: "offline capture stamp identical to the online fact's stamp but the capture differs — resolution UNKNOWN",
          });
          continue;
        }
        if (isFresherOrEqual(entry.stamp, onlineStamp)) {
          // The offline capture is FRESHER: it supersedes the online fact —
          // journaled, never silent.
          applied += 1;
          latestBySubject.set(entry.subjectKey, entry.stamp);
          appliedObservations.push(entry.observation);
          journal.push({
            ...base,
            onlineStamp,
            decision: "applied",
            rationale: `offline capture (seq ${entry.stamp.sequence} at ${entry.stamp.capturedAt}) is fresher than the online fact (seq ${onlineStamp.sequence} at ${onlineStamp.capturedAt}) — supersede JOURNALED`,
          });
          continue;
        }
        // The offline capture is STALE: the fresher online fact STANDS. The
        // observation remains evidence — it never overwrites the online fact.
        supersededStale += 1;
        journal.push({
          ...base,
          onlineStamp,
          decision: "superseded-stale",
          rationale: `stale offline capture (seq ${entry.stamp.sequence} at ${entry.stamp.capturedAt}) vs fresher online fact (seq ${onlineStamp.sequence} at ${onlineStamp.capturedAt}) — the online fact stands; never a silent overwrite`,
        });
      }

      return {
        replayed: entries.length,
        applied,
        supersededStale,
        duplicatesIgnored,
        ambiguous,
        journal: [...journal],
        appliedObservations,
      };
    },

    journal(): readonly SupersedeJournalEntry[] {
      return [...journal];
    },

    latestStamps(): ReadonlyMap<string, CaptureStamp> {
      return new Map(latestBySubject);
    },
  };
}
