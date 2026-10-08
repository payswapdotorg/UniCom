/**
 * The W2-008 residue-closure adversarial suite runner: runs the
 * W2_008_RESIDUE_ADVERSARIES (16 adversaries across 8 v2 surface classes)
 * against the certification harness and emits a MACHINE-READABLE report.
 *
 * The report follows the W2-006 standard: per-adversary EVASION_BLOCKED
 * results, each backed by a journaled, hash-verified ADVERSARY_ENCOUNTER
 * evidence record; zero silent evasions. The discipline is identical to
 * the W2-006 release gate — a claimed-but-unproven block is a FAIL.
 *
 * Determinism: same frozen catalog, same explicit timestamps → identical
 * report digest on replay.
 */

import { resolveEvidenceCitation, type EvidenceCitation } from "./evidence-journal.js";
import { structuralHash } from "./lab-promotion.js";
import { buildAdversarialContext } from "./adversarial-harness.js";
import type { EvidenceJournal } from "./evidence-journal.js";
import {
  type AdversaryCase,
  type AdversaryCategory,
  type AdversaryResult,
} from "./adversarial-context.js";
import { W2_008_BOUNDARY_ADVERSARIES } from "./adversarial-cases-w2-008.js";
import { W2_008_DETECTION_ADVERSARIES } from "./adversarial-cases-w2-008-detection.js";

// TL battery split: the 16 adversaries now live in two case files (the
// combined file broke max-file-lines); the suite aggregates them under the
// original export so consumers/tests see the same set.
export const W2_008_RESIDUE_ADVERSARIES: readonly AdversaryCase[] = [
  ...W2_008_BOUNDARY_ADVERSARIES,
  ...W2_008_DETECTION_ADVERSARIES,
];

export const W2_008_REPORT_ID = "w2-008-adversarial-report:v1";

// ---------------------------------------------------------------------------
// The report (machine-readable, per-adversary, journal-backed)
// ---------------------------------------------------------------------------

export interface W2_008ReportEntry {
  readonly adversaryId: string;
  readonly category: AdversaryCategory;
  readonly label: string;
  readonly expected: "DETECTED" | "EVASION_BLOCKED";
  readonly result: AdversaryResult;
  readonly journaled: boolean;
  readonly evidence: EvidenceCitation;
  readonly detail: string;
}

export interface W2_008ReportTotals {
  readonly adversaries: number;
  readonly evasionBlocked: number;
  readonly missedDeclared: number;
  readonly silentEvasions: number;
}

export interface W2_008AdversarialReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly batteryDigest: string;
  readonly verdict: "PASS" | "FAIL";
  readonly totals: W2_008ReportTotals;
  readonly entries: readonly W2_008ReportEntry[];
  readonly journalChainOk: boolean;
  readonly unifiedChainOk: boolean;
  readonly reportDigest: string;
}

function citationOf(record: {
  readonly evidenceId: string;
  readonly kind: EvidenceCitation["kind"];
  readonly recordHash: string;
}): EvidenceCitation {
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

/**
 * Run the W2-008 residue-closure adversarial suite. Deterministic.
 */
export function runW2_008Suite(input?: {
  readonly journal?: EvidenceJournal;
  readonly at?: string;
  readonly extraCases?: readonly AdversaryCase[];
}): W2_008AdversarialReport {
  const context = buildAdversarialContext({ journal: input?.journal, at: input?.at });
  const cases = [...W2_008_RESIDUE_ADVERSARIES, ...(input?.extraCases ?? [])];

  const entries: W2_008ReportEntry[] = [];
  for (const adversary of cases) {
    const outcome = adversary.attack(context);
    const encounter = context.journal.find(`adversary:encounter:${adversary.adversaryId}`);
    const verification =
      encounter === undefined
        ? undefined
        : resolveEvidenceCitation(
            { evidenceId: encounter.evidenceId, kind: encounter.kind, recordHash: encounter.recordHash },
            context.journal.records(),
          );
    const journaled = encounter !== undefined && verification !== undefined && verification.ok;
    entries.push({
      adversaryId: adversary.adversaryId,
      category: adversary.category,
      label: adversary.label,
      expected: adversary.expected,
      result: outcome.result,
      journaled,
      evidence:
        encounter !== undefined
          ? citationOf(encounter)
          : { evidenceId: "", kind: "security-analysis", recordHash: "" },
      detail: outcome.detail,
    });
  }

  const totals: W2_008ReportTotals = {
    adversaries: entries.length,
    evasionBlocked: entries.filter((e) => e.result === "EVASION_BLOCKED").length,
    missedDeclared: entries.filter((e) => e.result === "MISSED_DECLARED").length,
    silentEvasions: entries.filter((e) => e.result !== "EVASION_BLOCKED" && e.result !== "MISSED_DECLARED").length,
  };
  const verdict: "PASS" | "FAIL" =
    entries.every((e) => e.result === e.expected && e.journaled) &&
    totals.silentEvasions === 0
      ? "PASS"
      : "FAIL";

  const report: Omit<W2_008AdversarialReport, "reportDigest"> = {
    reportId: W2_008_REPORT_ID,
    generatedAt: context.at2,
    batteryDigest: context.batteryDigest,
    verdict,
    totals,
    entries,
    journalChainOk: context.journal.verifyChain().ok,
    unifiedChainOk: context.chain.verify().ok,
  };
  return { ...report, reportDigest: w2_008ReportDigest(report) };
}

/** The deterministic digest over the report's result-bearing content. */
export function w2_008ReportDigest(
  report: Omit<W2_008AdversarialReport, "reportDigest">,
): string {
  return structuralHash({
    reportId: report.reportId,
    verdict: report.verdict,
    entries: report.entries.map((e) => ({
      adversaryId: e.adversaryId,
      result: e.result,
      journaled: e.journaled,
    })),
    totals: report.totals,
  });
}

// ---------------------------------------------------------------------------
// The W2-008 gate (the deterministic consumer)
// ---------------------------------------------------------------------------

export interface W2_008GateDecision {
  readonly decision: "W2_008_PASS" | "W2_008_FAIL";
  readonly consumable: true;
  readonly reasons: readonly string[];
}

function isReportShape(value: unknown): value is W2_008AdversarialReport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<W2_008AdversarialReport>;
  return (
    typeof candidate.reportId === "string" &&
    (candidate.verdict === "PASS" || candidate.verdict === "FAIL") &&
    typeof candidate.reportDigest === "string" &&
    Array.isArray(candidate.entries) &&
    typeof candidate.totals === "object" &&
    candidate.totals !== null
  );
}

/**
 * The W2-008 gate: consume a report and decide deterministically.
 * PASS requires: every adversary EVASION_BLOCKED, every encounter journaled,
 * ZERO silent evasions, internally consistent totals, matching report digest.
 */
export function evaluateW2_008Gate(report: unknown): W2_008GateDecision {
  const reasons: string[] = [];
  if (!isReportShape(report)) {
    return {
      decision: "W2_008_FAIL",
      consumable: true,
      reasons: ["malformed W2-008 report — the gate consumes typed reports only"],
    };
  }
  const totals = report.totals as W2_008ReportTotals;

  const blocked = report.entries.filter((e) => e.result === "EVASION_BLOCKED").length;
  const missed = report.entries.filter((e) => e.result === "MISSED_DECLARED").length;
  if (blocked !== totals.evasionBlocked || missed !== totals.missedDeclared) {
    reasons.push("report totals do not match its per-adversary entries");
  }
  if (totals.adversaries !== report.entries.length) {
    reasons.push(`adversary count mismatch: totals say ${totals.adversaries}, entries say ${report.entries.length}`);
  }
  if (totals.adversaries !== totals.evasionBlocked + totals.missedDeclared) {
    reasons.push("totals are not internally additive");
  }
  const unproven = report.entries.filter((e) => e.result !== e.expected);
  if (unproven.length > 0) {
    reasons.push(
      `${unproven.length} adversary(ies) not BLOCKED as expected: ${unproven.map((e) => e.adversaryId).join(", ")}`,
    );
  }
  const unjournaled = report.entries.filter((e) => !e.journaled);
  if (unjournaled.length > 0) {
    reasons.push(`${unjournaled.length} adversary encounter(s) not journaled/verifiable`);
  }
  if (totals.silentEvasions !== 0) {
    reasons.push(`silent evasions present (${totals.silentEvasions}) — a bug, not a pass`);
  }
  if (report.verdict !== "PASS") {
    reasons.push(`suite verdict is ${report.verdict}`);
  }
  if (w2_008ReportDigest(report) !== report.reportDigest) {
    reasons.push("report digest mismatch — the report content does not match its digest");
  }
  if (!report.journalChainOk) {
    reasons.push("evidence journal chain does not verify");
  }
  if (!report.unifiedChainOk) {
    reasons.push("unified promotion chains do not verify");
  }

  return {
    decision: reasons.length === 0 ? "W2_008_PASS" : "W2_008_FAIL",
    consumable: true,
    reasons,
  };
}
