/**
 * The buyer-constraint adversarial suite runner (W2-007 acceptance scenario 7):
 * runs the BUYER_CONSTRAINT_ADVERSARIES against the certification harness
 * (adversarial-harness.ts — the SAME shared journal + battery context the
 * W2-006 release-gate suite uses) and emits a MACHINE-READABLE report for
 * the new buyer-agent vocabulary surfaces — financing bounds, buy-now-vs-
 * wait, price-timing, negotiation.
 *
 * The report follows the W2-006 standard: per-adversary EVASION_BLOCKED
 * results, each backed by a journaled, hash-verified ADVERSARY_ENCOUNTER
 * evidence record; zero silent evasions (every blocked attempt is journaled,
 * never silently refused). The discipline is identical to the W2-006 release
 * gate — a claimed-but-unproven block is a FAIL.
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
import { BUYER_CONSTRAINT_ADVERSARIES } from "./adversarial-cases-buyer.js";

export { BUYER_CONSTRAINT_ADVERSARIES } from "./adversarial-cases-buyer.js";

export const BUYER_CONSTRAINT_REPORT_ID = "buyer-constraint-adversarial-report:w2-007:v1";

// ---------------------------------------------------------------------------
// The report (machine-readable, per-adversary, journal-backed)
// ---------------------------------------------------------------------------

export interface BuyerConstraintReportEntry {
  readonly adversaryId: string;
  readonly category: AdversaryCategory;
  readonly label: string;
  readonly expected: "DETECTED" | "EVASION_BLOCKED";
  readonly result: AdversaryResult;
  /** The journaled encounter resolves against the live hash chain. */
  readonly journaled: boolean;
  readonly evidence: EvidenceCitation;
  readonly detail: string;
}

export interface BuyerConstraintReportTotals {
  readonly adversaries: number;
  readonly evasionBlocked: number;
  readonly missedDeclared: number;
  readonly silentEvasions: number;
}

export interface BuyerConstraintAdversarialReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly batteryDigest: string;
  readonly verdict: "PASS" | "FAIL";
  readonly totals: BuyerConstraintReportTotals;
  readonly entries: readonly BuyerConstraintReportEntry[];
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
 * Run the buyer-constraint adversarial suite. Deterministic: the frozen
 * catalog and explicit timestamps produce the identical report (digest
 * included) on replay. `extraCases` exists for the negative control — an
 * injected adversary that gets through FAILS the report.
 */
export function runBuyerConstraintSuite(input?: {
  readonly journal?: EvidenceJournal;
  readonly at?: string;
  readonly extraCases?: readonly AdversaryCase[];
}): BuyerConstraintAdversarialReport {
  const context = buildAdversarialContext({ journal: input?.journal, at: input?.at });
  const cases = [...BUYER_CONSTRAINT_ADVERSARIES, ...(input?.extraCases ?? [])];

  const entries: BuyerConstraintReportEntry[] = [];
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

  const totals: BuyerConstraintReportTotals = {
    adversaries: entries.length,
    evasionBlocked: entries.filter((entry) => entry.result === "EVASION_BLOCKED").length,
    missedDeclared: entries.filter((entry) => entry.result === "MISSED_DECLARED").length,
    // Buyer-constraint adversaries are structural BLOCKs — no silent evasions
    // by construction (every blocked attempt is journaled; an unblocked
    // attempt is a MISSED_DECLARED, never silent).
    silentEvasions: entries.filter((entry) => entry.result !== "EVASION_BLOCKED" && entry.result !== "MISSED_DECLARED").length,
  };
  const verdict: "PASS" | "FAIL" =
    entries.every((entry) => entry.result === entry.expected && entry.journaled) &&
    totals.silentEvasions === 0
      ? "PASS"
      : "FAIL";

  const report: Omit<BuyerConstraintAdversarialReport, "reportDigest"> = {
    reportId: BUYER_CONSTRAINT_REPORT_ID,
    generatedAt: context.at2,
    batteryDigest: context.batteryDigest,
    verdict,
    totals,
    entries,
    journalChainOk: context.journal.verifyChain().ok,
    unifiedChainOk: context.chain.verify().ok,
  };
  return { ...report, reportDigest: buyerConstraintReportDigest(report) };
}

/** The deterministic digest over the report's result-bearing content. */
export function buyerConstraintReportDigest(
  report: Omit<BuyerConstraintAdversarialReport, "reportDigest">,
): string {
  return structuralHash({
    reportId: report.reportId,
    verdict: report.verdict,
    entries: report.entries.map((entry) => ({
      adversaryId: entry.adversaryId,
      result: entry.result,
      journaled: entry.journaled,
    })),
    totals: report.totals,
  });
}

// ---------------------------------------------------------------------------
// The buyer-constraint gate (the deterministic consumer)
// ---------------------------------------------------------------------------

export interface BuyerConstraintGateDecision {
  readonly decision: "BUYER_CONSTRAINT_PASS" | "BUYER_CONSTRAINT_FAIL";
  readonly consumable: true;
  readonly reasons: readonly string[];
}

function isReportShape(value: unknown): value is BuyerConstraintAdversarialReport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<BuyerConstraintAdversarialReport>;
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
 * The buyer-constraint gate: consume a report (untyped input — forged reports
 * are rejected) and decide deterministically. PASS requires: every adversary
 * EVASION_BLOCKED, every encounter journaled, ZERO silent evasions, internally
 * consistent totals and a matching report digest.
 */
export function evaluateBuyerConstraintGate(report: unknown): BuyerConstraintGateDecision {
  const reasons: string[] = [];
  if (!isReportShape(report)) {
    return {
      decision: "BUYER_CONSTRAINT_FAIL",
      consumable: true,
      reasons: ["malformed buyer-constraint report — the gate consumes typed reports only"],
    };
  }
  const totals = report.totals as BuyerConstraintReportTotals;

  const blocked = report.entries.filter((entry) => entry.result === "EVASION_BLOCKED").length;
  const missed = report.entries.filter((entry) => entry.result === "MISSED_DECLARED").length;
  if (blocked !== totals.evasionBlocked || missed !== totals.missedDeclared) {
    reasons.push("report totals do not match its per-adversary entries");
  }
  if (totals.adversaries !== report.entries.length) {
    reasons.push(`adversary count mismatch: totals say ${totals.adversaries}, entries say ${report.entries.length}`);
  }
  if (totals.adversaries !== totals.evasionBlocked + totals.missedDeclared) {
    reasons.push("totals are not internally additive");
  }
  const unproven = report.entries.filter((entry) => entry.result !== entry.expected);
  if (unproven.length > 0) {
    reasons.push(
      `${unproven.length} adversary(ies) not BLOCKED as expected: ${unproven.map((entry) => entry.adversaryId).join(", ")}`,
    );
  }
  const unjournaled = report.entries.filter((entry) => !entry.journaled);
  if (unjournaled.length > 0) {
    reasons.push(`${unjournaled.length} adversary encounter(s) not journaled/verifiable`);
  }
  if (totals.silentEvasions !== 0) {
    reasons.push(`silent evasions present (${totals.silentEvasions}) — a bug, not a pass`);
  }
  if (report.verdict !== "PASS") {
    reasons.push(`suite verdict is ${report.verdict}`);
  }
  if (buyerConstraintReportDigest(report) !== report.reportDigest) {
    reasons.push("report digest mismatch — the report content does not match its digest");
  }
  if (!report.journalChainOk) {
    reasons.push("evidence journal chain does not verify");
  }
  if (!report.unifiedChainOk) {
    reasons.push("unified promotion chains do not verify");
  }

  return {
    decision: reasons.length === 0 ? "BUYER_CONSTRAINT_PASS" : "BUYER_CONSTRAINT_FAIL",
    consumable: true,
    reasons,
  };
}
