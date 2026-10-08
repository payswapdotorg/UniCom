/**
 * The matrix-audit harness (W1-008 §scope 1).
 *
 * Loads all registered section files, resolves every row's five rungs,
 * derives per-row and per-section verdicts, and emits the aggregated
 * `MatrixAuditArtifact`. Deterministic ordering (sections in fixed order,
 * rows in their declaration order; no generatedAt timestamp; content-
 * derived digest). Re-runs produce byte-identical output.
 */
import type {
  AuditSection,
  AuditSectionId,
  MatrixAuditArtifact,
  RowVerdict,
  RungVerdict,
  SectionVerdict,
} from "./types.js";
import {
  computeDigest,
  loadDiscoverabilityRegistry,
  resolveDiscoverableUx,
  resolvePointer,
} from "./resolve.js";

/**
 * The section registry. W1-008 lanes register their sections here; the
 * harness aggregates them in the order they appear (deterministic — W1-008's
 * three planes first, in matrix order; W2-008 / W3-008 lanes append theirs
 * in their own section files without re-ordering W1-008 entries).
 */
const SECTION_IDS_IN_ORDER: readonly AuditSectionId[] = [
  "merchant-parity",
  "ai-native-merchant-layer",
  "coordination-organization",
];

/** Loads all section registries (W1-008 planes only — others extend this list). */
async function loadSections(): Promise<readonly AuditSection[]> {
  const sections: AuditSection[] = [];
  // W1-008's three planes.
  const merchant = await import("./sections/merchant-parity.js");
  const aiNative = await import("./sections/ai-native-merchant-layer.js");
  const coordination = await import("./sections/coordination-organization.js");
  sections.push(merchant.SECTION, aiNative.SECTION, coordination.SECTION);
  // Validate section ids match the canonical order.
  for (let i = 0; i < SECTION_IDS_IN_ORDER.length; i += 1) {
    if (sections[i]?.section !== SECTION_IDS_IN_ORDER[i]) {
      throw new Error(
        `section at index ${i} is "${sections[i]?.section}", expected "${SECTION_IDS_IN_ORDER[i]}"`,
      );
    }
  }
  return sections;
}

/** Derives a row's full verdict from its five rungs. */
async function deriveRowVerdict(
  sectionId: AuditSectionId,
  row: import("./types.js").AuditRow,
): Promise<RowVerdict> {
  const registry = await loadDiscoverabilityRegistry();
  const contract = resolvePointer(row.rungs.contract);
  const implementation = resolvePointer(row.rungs.implementation);
  const discoverableUx = resolveDiscoverableUx(row.rungs.discoverableUx, registry);
  const journey = resolvePointer(row.rungs.journey);
  const evidence = resolvePointer(row.rungs.evidence);
  const verdict =
    contract.status === "PASS" &&
    implementation.status === "PASS" &&
    discoverableUx.status === "PASS" &&
    journey.status === "PASS" &&
    evidence.status === "PASS"
      ? "PASS"
      : "FAIL";
  const out: RowVerdict = {
    section: sectionId,
    row: row.row,
    contract,
    implementation,
    discoverableUx,
    journey,
    evidence,
    verdict,
  };
  if (row.closureNote !== undefined) out.closureNote = row.closureNote;
  return out;
}

/** Builds a section verdict block. */
async function buildSectionVerdict(section: AuditSection): Promise<SectionVerdict> {
  const rows: RowVerdict[] = [];
  for (const row of section.rows) {
    rows.push(await deriveRowVerdict(section.section, row));
  }
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.length - pass;
  return {
    section: section.section,
    rows,
    summary: { total: rows.length, pass, fail },
  };
}

/**
 * Runs the full audit. Deterministic. Re-runs produce byte-identical output
 * (no timestamps, no random ids, content-derived digest).
 */
export async function runAudit(): Promise<MatrixAuditArtifact> {
  const sections = await loadSections();
  const sectionVerdicts: SectionVerdict[] = [];
  for (const section of sections) {
    sectionVerdicts.push(await buildSectionVerdict(section));
  }
  const rowsTotal = sectionVerdicts.reduce((acc, s) => acc + s.summary.total, 0);
  const rowsGreen = sectionVerdicts.reduce((acc, s) => acc + s.summary.pass, 0);
  const rowsFail = sectionVerdicts.reduce((acc, s) => acc + s.summary.fail, 0);
  const artifactWithoutDigest = {
    schema: "matrix-audit-v2" as const,
    sections: sectionVerdicts,
    summary: {
      sectionsAudited: sectionVerdicts.length,
      rowsTotal,
      rowsGreen,
      rowsFail,
    },
  };
  const digest = computeDigest(artifactWithoutDigest);
  return { ...artifactWithoutDigest, digest };
}

/** Pretty-print one RungVerdict for the markdown summary. */
export function formatRung(rung: RungVerdict): string {
  return rung.status === "PASS" ? `PASS — ${rung.resolved}` : `FAIL — ${rung.reason}`;
}
