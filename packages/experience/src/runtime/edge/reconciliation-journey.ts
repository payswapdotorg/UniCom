/**
 * Reconciliation journey planner (W3-004; acceptance scenario 5;
 * FROZEN-ARCHITECTURE §9/§22.6, INVARIANTS 10/29/47).
 *
 * Assembles the supermarket reconciliation JOURNEY's evidence: for each
 * stock subject, the EDGE count (physical observation) vs the SYSTEM count
 * (canonical inventory fact from the commerce seam) vs the POS deltas
 * (sold units since the last sync point) — a deterministic variance plan:
 *
 * - expected = systemCount − unsyncedPosSold (what the shelf SHOULD hold);
 * - variance = edgeCount − expected;
 * - TRI-STATE PRESERVATION: if ANY input is UNKNOWN (edge count unknown,
 *   system fact absent, POS sync partial) the variance is UNKNOWN — never a
 *   guessed number, never collapsed into balanced/failed (INVARIANT 10);
 * - A VARIANCE IS AN EXPLICIT JOURNALED STATE: every decision lands in the
 *   append-only variance journal with its rationale; nothing silently
 *   adjusts.
 *
 * The planner only COMPUTES views — it never mutates commerce state. The
 * fold itself goes through the commerce lane's deterministic
 * reconciliation (the kernel's RECONCILE_COUNT_OBSERVATION /
 * RECONCILE_POS_SYNC commands); this module produces the evidence package
 * a merchant or agent reads before that fold.
 */

import type { UtcIso8601String } from "../../common/values";
import { asUtcTimestamp } from "../ids";

/** A tri-state count input (observation or fact as seen from one side). */
export type TriStateCount =
  | { readonly resolved: "OBSERVED"; readonly value: number }
  | { readonly resolved: "UNKNOWN"; readonly reason: string };

/** Per-subject variance status. UNKNOWN is a first-class value. */
export type VarianceStatus = "balanced" | "variance" | "unknown";

/** One append-only variance journal entry (evidence, never mutated). */
export interface VarianceJournalEntry {
  readonly subjectKey: string;
  readonly status: VarianceStatus;
  readonly varianceUnits?: number;
  readonly edgeCount?: number;
  readonly expected?: number;
  readonly systemCount?: number;
  readonly unsyncedPosSold?: number;
  readonly rationale: string;
  readonly journaledAt: UtcIso8601String;
}

/** The per-subject view rendered on operational surfaces. */
export interface InventoryVarianceView {
  readonly subjectKey: string;
  readonly status: VarianceStatus;
  readonly varianceUnits?: number;
  readonly edgeCount?: number;
  readonly systemCount?: number;
  readonly unsyncedPosSold?: number;
}

/** The full reconciliation journey plan. */
export interface ReconciliationJourneyPlan {
  readonly subjects: readonly InventoryVarianceView[];
  readonly journal: readonly VarianceJournalEntry[];
  readonly balanced: number;
  readonly variance: number;
  readonly unknown: number;
}

/** Where the planner's inputs come from (all seams, all read-only). */
export interface ReconciliationJourneySource {
  readonly subjects: readonly string[];
  /** Latest edge count per subject (from the journaled count observations). */
  readonly edgeCountOf: (subjectKey: string) => TriStateCount | undefined;
  /** Canonical on-hand per subject (from the commerce seam's inventory facts). */
  readonly systemCountOf: (subjectKey: string) => number | undefined;
  /** POS sold units since the last sync point per subject (unsynced deltas). */
  readonly posDeltasOf: (subjectKey: string) => TriStateCount | undefined;
}

export interface ReconciliationJourneyPlannerOptions {
  /** Absolute count difference tolerated before a variance is journaled. */
  readonly toleranceUnits: number;
  readonly clock: () => string;
}

export interface ReconciliationJourneyPlanner {
  plan(source: ReconciliationJourneySource): ReconciliationJourneyPlan;
}

export function createReconciliationJourneyPlanner(
  options: ReconciliationJourneyPlannerOptions,
): ReconciliationJourneyPlanner {
  const { toleranceUnits, clock } = options;
  return {
    plan(source: ReconciliationJourneySource): ReconciliationJourneyPlan {
      const views: InventoryVarianceView[] = [];
      const journal: VarianceJournalEntry[] = [];
      let balanced = 0;
      let variance = 0;
      let unknown = 0;

      for (const subjectKey of source.subjects) {
        const journaledAt = asUtcTimestamp(clock());
        const edge = source.edgeCountOf(subjectKey);
        const system = source.systemCountOf(subjectKey);
        const pos = source.posDeltasOf(subjectKey);

        const base = { subjectKey, journaledAt } as const;

        // TRI-STATE PRESERVATION — any UNKNOWN input makes the variance UNKNOWN.
        if (edge === undefined) {
          unknown += 1;
          journal.push({
            ...base,
            status: "unknown",
            systemCount: system,
            rationale: `no edge count journaled for "${subjectKey}" — variance UNKNOWN`,
          });
          views.push({ subjectKey, status: "unknown", systemCount: system });
          continue;
        }
        if (edge.resolved === "UNKNOWN") {
          unknown += 1;
          journal.push({
            ...base,
            status: "unknown",
            systemCount: system,
            rationale: `edge count UNKNOWN (${edge.reason}) for "${subjectKey}" — variance UNKNOWN, never a guess`,
          });
          views.push({ subjectKey, status: "unknown", systemCount: system });
          continue;
        }
        if (system === undefined) {
          unknown += 1;
          journal.push({
            ...base,
            status: "unknown",
            edgeCount: edge.value,
            rationale: `no canonical system fact for "${subjectKey}" — variance UNKNOWN`,
          });
          views.push({ subjectKey, status: "unknown", edgeCount: edge.value });
          continue;
        }
        if (pos === undefined) {
          unknown += 1;
          journal.push({
            ...base,
            status: "unknown",
            edgeCount: edge.value,
            systemCount: system,
            rationale: `no POS sync in the reconciliation window for "${subjectKey}" — sold units unknown, variance UNKNOWN`,
          });
          views.push({ subjectKey, status: "unknown", edgeCount: edge.value, systemCount: system });
          continue;
        }
        if (pos.resolved === "UNKNOWN") {
          unknown += 1;
          journal.push({
            ...base,
            status: "unknown",
            edgeCount: edge.value,
            systemCount: system,
            rationale: `POS sync UNKNOWN (${pos.reason}) for "${subjectKey}" — variance UNKNOWN, never a guess`,
          });
          views.push({ subjectKey, status: "unknown", edgeCount: edge.value, systemCount: system });
          continue;
        }

        // All inputs OBSERVED: expected = system − unsynced sold units.
        const expected = system - pos.value;
        const varianceUnits = edge.value - expected;
        const view: InventoryVarianceView = {
          subjectKey,
          status: Math.abs(varianceUnits) <= toleranceUnits ? "balanced" : "variance",
          varianceUnits,
          edgeCount: edge.value,
          systemCount: system,
          unsyncedPosSold: pos.value,
        };
        views.push(view);
        if (view.status === "balanced") {
          balanced += 1;
          journal.push({
            ...base,
            status: "balanced",
            varianceUnits,
            edgeCount: edge.value,
            expected,
            systemCount: system,
            unsyncedPosSold: pos.value,
            rationale: `edge ${edge.value} === system ${system} − sold ${pos.value} (variance ${varianceUnits} within tolerance ${toleranceUnits})`,
          });
        } else {
          variance += 1;
          journal.push({
            ...base,
            status: "variance",
            varianceUnits,
            edgeCount: edge.value,
            expected,
            systemCount: system,
            unsyncedPosSold: pos.value,
            rationale: `VARIANCE: edge ${edge.value} vs expected ${expected} (system ${system} − sold ${pos.value}) — variance ${varianceUnits} exceeds tolerance ${toleranceUnits}; explicit journaled state`,
          });
        }
      }

      return { subjects: views, journal, balanced, variance, unknown };
    },
  };
}
