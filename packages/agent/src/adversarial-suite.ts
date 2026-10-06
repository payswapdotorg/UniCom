/**
 * The release-candidate adversarial suite (W2-006; the terminal trust
 * deliverable). Runs the COMPLETE adversary catalog — 34 adversaries across
 * ten categories — against the certification harness (adversarial-harness.ts)
 * and emits the MACHINE-READABLE release-candidate adversarial report:
 * - per-adversary DETECTED / EVASION_BLOCKED results, each backed by a
 *   journaled, hash-verified ADVERSARY_ENCOUNTER evidence record;
 * - the zero-silent-evasion discipline over the complete fraud-archetype
 *   battery (every evasion variant either detected or a journaled known
 *   limitation — a silent evasion is a bug and FAILS the report);
 * - immune-response certifications for every DETECTED fraud adversary
 *   (journaled quarantine + scoped defensive broadcast + proven reversal).
 *
 * `evaluateReleaseGate` is the deterministic release-gate consumer: the
 * release candidate passes ONLY when every adversary is DETECTED or
 * EVASION_BLOCKED, every encounter is journaled and verifiable, zero silent
 * evasions exist and every immune response is certified — a claimed-but-
 * unproven detection is a FAIL. Deterministic end-to-end: same inputs → same
 * report digest.
 */

import { resolveEvidenceCitation, type EvidenceCitation } from "./evidence-journal.js";
import { journalKnownLimitations } from "./archetype-suite.js";
import { knownLimitationsOf, type AdversarialRunOutcome } from "./adversarial-evaluation.js";
import { structuralHash } from "./lab-promotion.js";
import { buildAdversarialContext } from "./adversarial-harness.js";
import type { EvidenceJournal } from "./evidence-journal.js";
import {
  ADVERSARY_OBSERVER,
  type AdversaryCase,
  type AdversaryCategory,
  type AdversaryResult,
  type ImmuneResponseCertification,
} from "./adversarial-context.js";
import { FRAUD_ADVERSARIES } from "./adversarial-cases-fraud.js";
import { INTEGRITY_ADVERSARIES } from "./adversarial-cases-integrity.js";
import { IMMUNE_PLANE_ADVERSARIES } from "./adversarial-cases-immune.js";
import { STRUCTURAL_ADVERSARIES } from "./adversarial-cases-structure.js";

export { buildAdversarialContext } from "./adversarial-harness.js";

/** The frozen release-gate adversary catalog (34 adversaries, 10 categories). */
export const RELEASE_GATE_ADVERSARIES: readonly AdversaryCase[] = [
  ...FRAUD_ADVERSARIES,
  ...INTEGRITY_ADVERSARIES,
  ...IMMUNE_PLANE_ADVERSARIES,
  ...STRUCTURAL_ADVERSARIES,
];

export const RELEASE_ADVERSARIAL_REPORT_ID = "release-adversarial-report:w2-006:v1";

// ---------------------------------------------------------------------------
// The report (machine-readable, per-adversary, journal-backed)
// ---------------------------------------------------------------------------

export interface AdversaryReportEntry {
  readonly adversaryId: string;
  readonly category: AdversaryCategory;
  readonly label: string;
  readonly expected: "DETECTED" | "EVASION_BLOCKED";
  readonly result: AdversaryResult;
  /** The journaled encounter resolves against the live hash chain. */
  readonly journaled: boolean;
  readonly evidence: EvidenceCitation;
  readonly immuneCertified: boolean;
  readonly detail: string;
}

export interface SilentEvasionDiscipline {
  readonly flowsTotal: number;
  readonly detected: number;
  readonly missedDeclared: number;
  readonly silentEvasions: number;
  readonly limitationCitations: readonly EvidenceCitation[];
}

export interface AdversaryReportTotals {
  readonly adversaries: number;
  readonly detected: number;
  readonly evasionBlocked: number;
  readonly missedDeclared: number;
  readonly silentEvasions: number;
}

export interface ReleaseCandidateAdversarialReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly batteryDigest: string;
  readonly verdict: "PASS" | "FAIL";
  readonly totals: AdversaryReportTotals;
  readonly entries: readonly AdversaryReportEntry[];
  readonly silentEvasionDiscipline: SilentEvasionDiscipline;
  readonly immuneCertifications: readonly ImmuneResponseCertification[];
  readonly journalChainOk: boolean;
  readonly unifiedChainOk: boolean;
  readonly reportDigest: string;
}

function citationOf(record: {
  evidenceId: string;
  kind: EvidenceCitation["kind"];
  recordHash: string;
}): EvidenceCitation {
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

/** The zero-silent-evasion discipline over the complete fraud-archetype battery. */
function runSilentEvasionDiscipline(context: ReturnType<typeof buildAdversarialContext>): SilentEvasionDiscipline {
  const outcomes: readonly AdversarialRunOutcome[] = context.battery.adversarialOutcomes;
  const limitations = knownLimitationsOf({
    outcomes,
    configurationId: context.configuration.configurationId,
    journaledAt: context.at2,
  });
  const limitationEvidence =
    limitations.length > 0
      ? journalKnownLimitations({
          journal: context.journal,
          limitations,
          subjectRef: ADVERSARY_OBSERVER,
        })
      : [];
  return {
    flowsTotal: outcomes.length,
    detected: outcomes.filter((outcome) => outcome.outcome === "DETECTED").length,
    missedDeclared: outcomes.filter((outcome) => outcome.outcome === "MISSED_DECLARED").length,
    silentEvasions: outcomes.filter((outcome) => outcome.outcome === "SILENT_EVASION").length,
    limitationCitations: limitationEvidence.map(citationOf),
  };
}

/**
 * Run the complete release-gate adversarial suite. Deterministic: the frozen
 * catalog, the frozen battery and explicit timestamps produce the identical
 * report (digest included) on replay. `extraCases` exists for the negative
 * control — an injected adversary that gets through FAILS the report.
 */
export function runReleaseAdversarialSuite(input?: {
  readonly journal?: EvidenceJournal;
  readonly at?: string;
  readonly extraCases?: readonly AdversaryCase[];
}): ReleaseCandidateAdversarialReport {
  const context = buildAdversarialContext({ journal: input?.journal, at: input?.at });
  const cases = [...RELEASE_GATE_ADVERSARIES, ...(input?.extraCases ?? [])];

  const entries: AdversaryReportEntry[] = [];
  const certifications: ImmuneResponseCertification[] = [];
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
    const immuneCertified = outcome.immuneCertification?.certified === true;
    if (outcome.immuneCertification !== undefined) certifications.push(outcome.immuneCertification);
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
      immuneCertified,
      detail: outcome.detail,
    });
  }

  const discipline = runSilentEvasionDiscipline(context);
  const totals: AdversaryReportTotals = {
    adversaries: entries.length,
    detected: entries.filter((entry) => entry.result === "DETECTED").length,
    evasionBlocked: entries.filter((entry) => entry.result === "EVASION_BLOCKED").length,
    missedDeclared: entries.filter((entry) => entry.result === "MISSED_DECLARED").length,
    silentEvasions: discipline.silentEvasions,
  };
  const verdict: "PASS" | "FAIL" =
    entries.every(
      (entry) =>
        entry.result === entry.expected &&
        entry.journaled &&
        (!entry.immuneCertified || entry.immuneCertified),
    ) &&
    discipline.silentEvasions === 0 &&
    certifications.every((certification) => certification.certified)
      ? "PASS"
      : "FAIL";

  const report: Omit<ReleaseCandidateAdversarialReport, "reportDigest"> = {
    reportId: RELEASE_ADVERSARIAL_REPORT_ID,
    generatedAt: context.at2,
    batteryDigest: context.batteryDigest,
    verdict,
    totals,
    entries,
    silentEvasionDiscipline: discipline,
    immuneCertifications: certifications,
    journalChainOk: context.journal.verifyChain().ok,
    unifiedChainOk: context.chain.verify().ok,
  };
  return { ...report, reportDigest: adversarialReportDigest(report) };
}

/** The deterministic digest over the report's result-bearing content. */
export function adversarialReportDigest(
  report: Omit<ReleaseCandidateAdversarialReport, "reportDigest">,
): string {
  return structuralHash({
    reportId: report.reportId,
    verdict: report.verdict,
    entries: report.entries.map((entry) => ({
      adversaryId: entry.adversaryId,
      result: entry.result,
      journaled: entry.journaled,
      immuneCertified: entry.immuneCertified,
    })),
    silentEvasions: report.silentEvasionDiscipline.silentEvasions,
    totals: report.totals,
  });
}

// ---------------------------------------------------------------------------
// The release gate (the deterministic consumer)
// ---------------------------------------------------------------------------

export interface ReleaseGateDecision {
  readonly decision: "RELEASE_CANDIDATE_PASS" | "RELEASE_CANDIDATE_FAIL";
  readonly consumable: true;
  readonly reasons: readonly string[];
}

function isReportShape(value: unknown): value is ReleaseCandidateAdversarialReport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ReleaseCandidateAdversarialReport>;
  return (
    typeof candidate.reportId === "string" &&
    (candidate.verdict === "PASS" || candidate.verdict === "FAIL") &&
    typeof candidate.reportDigest === "string" &&
    Array.isArray(candidate.entries) &&
    typeof candidate.silentEvasionDiscipline === "object" &&
    candidate.silentEvasionDiscipline !== null &&
    typeof candidate.totals === "object" &&
    candidate.totals !== null
  );
}

/**
 * The release gate: consume an adversarial report (untyped input — forged
 * reports are rejected) and decide deterministically. PASS requires: every
 * adversary DETECTED or EVASION_BLOCKED, every encounter journaled, every
 * fraud detection immune-certified, ZERO silent evasions, internally
 * consistent totals and a matching report digest.
 */
export function evaluateReleaseGate(report: unknown): ReleaseGateDecision {
  const reasons: string[] = [];
  if (!isReportShape(report)) {
    return {
      decision: "RELEASE_CANDIDATE_FAIL",
      consumable: true,
      reasons: ["malformed adversarial report — the release gate consumes typed reports only"],
    };
  }
  const totals = report.totals as AdversaryReportTotals;
  const discipline = report.silentEvasionDiscipline as SilentEvasionDiscipline;

  const detected = report.entries.filter((entry) => entry.result === "DETECTED").length;
  const blocked = report.entries.filter((entry) => entry.result === "EVASION_BLOCKED").length;
  const missed = report.entries.filter((entry) => entry.result === "MISSED_DECLARED").length;
  if (detected !== totals.detected || blocked !== totals.evasionBlocked || missed !== totals.missedDeclared) {
    reasons.push("report totals do not match its per-adversary entries");
  }
  if (totals.adversaries !== report.entries.length) {
    reasons.push(`adversary count mismatch: totals say ${totals.adversaries}, entries say ${report.entries.length}`);
  }
  if (totals.adversaries !== totals.detected + totals.evasionBlocked + totals.missedDeclared) {
    reasons.push("totals are not internally additive");
  }
  const unproven = report.entries.filter((entry) => entry.result !== entry.expected);
  if (unproven.length > 0) {
    reasons.push(
      `${unproven.length} adversary(ies) not DETECTED/BLOCKED as expected: ${unproven.map((entry) => entry.adversaryId).join(", ")}`,
    );
  }
  const unjournaled = report.entries.filter((entry) => !entry.journaled);
  if (unjournaled.length > 0) {
    reasons.push(`${unjournaled.length} adversary encounter(s) not journaled/verifiable`);
  }
  const uncertified = report.entries.filter(
    (entry) => entry.category === "FRAUD_ARCHETYPE" && entry.result === "DETECTED" && !entry.immuneCertified,
  );
  if (uncertified.length > 0) {
    reasons.push(`${uncertified.length} detected fraud adversary(ies) without a certified immune response`);
  }
  if (discipline.silentEvasions !== 0 || totals.silentEvasions !== 0) {
    reasons.push(`silent evasions present (${Math.max(discipline.silentEvasions, totals.silentEvasions)}) — a bug, not a pass`);
  }
  if (report.verdict !== "PASS") {
    reasons.push(`suite verdict is ${report.verdict}`);
  }
  if (adversarialReportDigest(report) !== report.reportDigest) {
    reasons.push("report digest mismatch — the report content does not match its digest");
  }
  if (!report.journalChainOk) {
    reasons.push("evidence journal chain does not verify");
  }
  if (!report.unifiedChainOk) {
    reasons.push("unified promotion chains do not verify");
  }

  return {
    decision: reasons.length === 0 ? "RELEASE_CANDIDATE_PASS" : "RELEASE_CANDIDATE_FAIL",
    consumable: true,
    reasons,
  };
}
