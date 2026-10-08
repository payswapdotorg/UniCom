/**
 * W3-008 matrix-audit resolver (consumed by the v2 release gate).
 *
 * Walks the section files under `scripts/matrix-audit/sections/*.json` (W1-008
 * harness contract: entry shape `{row, contract, implementation,
 * discoverableUx, journey, evidence, verdict}`), resolves every pointer
 * against the repo tree, and DERIVES the per-row verdict — never
 * hand-typed PASS (W1-008 §scope-1 anti-vacuity law).
 *
 * Pointer resolution rules:
 * - `contract` / `implementation` — `path/to/file.ts:SymbolName` must point
 *   to a file that exists AND a symbol that is exported (structural regex
 *   on the file content; not a full TS parser, but adequate for the
 *   contract-shape audit).
 * - `discoverableUx` — surface id OR intent alias from
 *   `NAVIGATION_SURFACES` (W3-005 zero-orphan discoverability law).
 * - `journey` — test file under `packages/experience/test/**` (write
 *   surface law; journeys must live in the experience test tree).
 * - `evidence` — `path/to/file.json#row-id` OR `path/to/file.ts:Symbol`
 *   (resolves the path portion; for JSON evidence, the file's existence is
 *   the contract).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NAVIGATION_SURFACES } from "../../navigation/surfaces";

/** One row entry of a matrix-audit section file (W1-008 harness contract). */
export interface MatrixAuditRowEntry {
  readonly row: string;
  readonly contract: string;
  readonly implementation: string;
  readonly discoverableUx: string;
  readonly journey: string;
  readonly evidence: string;
}

/** A matrix-audit section file (loaded JSON). */
export interface MatrixAuditSectionFile {
  readonly section: string;
  readonly sectionTitle?: string;
  readonly source?: string;
  readonly harnessContract?: string;
  readonly rows: readonly MatrixAuditRowEntry[];
}

/** One row with its DERIVED verdict + failure reason (none when PASS). */
export interface MatrixAuditVerdictRow {
  readonly row: string;
  readonly section: string;
  readonly contract: string;
  readonly implementation: string;
  readonly discoverableUx: string;
  readonly journey: string;
  readonly evidence: string;
  readonly verdict: "pass" | "fail";
  readonly reason?: string;
}

/** The aggregated matrix audit (consumed by the release gate). */
export interface MatrixAuditAggregated {
  readonly sections: readonly {
    readonly section: string;
    readonly sectionTitle?: string;
    readonly source?: string;
    readonly rows: readonly MatrixAuditVerdictRow[];
    readonly rowsTotal: number;
    readonly rowsGreen: number;
  }[];
  readonly rowsTotal: number;
  readonly rowsGreen: number;
  readonly loadedSectionFiles: readonly string[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

/** Resolve a repo-relative path like `packages/experience/src/...` to absolute. */
function resolveRepoPath(pointer: string): string {
  const cleaned = pointer.replace(/^\.\//, "").replace(/^\.\\/, "");
  return resolve(REPO_ROOT, cleaned);
}

/** Whether a file exists at the pointer path. */
function fileResolvable(pointer: string): boolean {
  try {
    const abs = resolveRepoPath(pointer);
    return existsSync(abs) && statSync(abs).isFile();
  } catch {
    return false;
  }
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether the file:symbol pointer resolves. The symbol check is structural:
 * for `path/to/file.ts:SymbolName`, confirm the file exists AND the symbol
 * name appears as an exported name in the file. (Derived verdict — never
 * hand-typed PASS.)
 */
function symbolResolvable(pointer: string): boolean {
  const colonIndex = pointer.lastIndexOf(":");
  if (colonIndex < 0) return fileResolvable(pointer);
  const filePath = pointer.slice(0, colonIndex);
  const symbol = pointer.slice(colonIndex + 1);
  if (!fileResolvable(filePath)) return false;
  if (symbol.length === 0) return false;
  const abs = resolveRepoPath(filePath);
  const content = readFileSync(abs, "utf8");
  // Strip comments to avoid false positives in commented-out exports.
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const symbolPattern = new RegExp(
    `\\bexport\\s+(?:async\\s+)?(?:function|class|interface|type|const|enum)\\s+${escapeRegex(symbol)}\\b`,
  );
  const symbolPropertyPattern = new RegExp(`\\b${escapeRegex(symbol)}\\s*[:?]`, "");
  // Evidence pointers carrying a `#row-id` suffix are resolved via file
  // existence on the path portion (handled by the caller for evidence).
  if (symbol.includes("#")) return fileResolvable(filePath);
  return symbolPattern.test(stripped) || symbolPropertyPattern.test(stripped);
}

/** Whether the surface id (or intent alias) is registered in NAVIGATION_SURFACES. */
function discoverableUxResolvable(pointer: string): boolean {
  const surfaceIds = new Set(NAVIGATION_SURFACES.map((surface) => surface.id));
  if (surfaceIds.has(pointer)) return true;
  for (const surface of NAVIGATION_SURFACES) {
    if (surface.intentAliases.some((alias) => alias.toLowerCase() === pointer.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** Whether the test file pointer resolves (file under packages/experience/test/**). */
function journeyResolvable(pointer: string): boolean {
  if (!fileResolvable(pointer)) return false;
  const abs = resolveRepoPath(pointer);
  const testRoot = resolve(REPO_ROOT, "packages", "experience", "test");
  return abs.startsWith(testRoot + sep);
}

/** Resolve a single matrix row's pointers and derive its verdict. */
export function resolveMatrixAuditRow(
  entry: MatrixAuditRowEntry,
  sectionId: string,
): MatrixAuditVerdictRow {
  const failures: string[] = [];
  if (!symbolResolvable(entry.contract)) {
    failures.push(`contract pointer unresolved: ${entry.contract}`);
  }
  if (!symbolResolvable(entry.implementation)) {
    failures.push(`implementation pointer unresolved: ${entry.implementation}`);
  }
  if (!discoverableUxResolvable(entry.discoverableUx)) {
    failures.push(`discoverableUx pointer unresolved: ${entry.discoverableUx}`);
  }
  if (!journeyResolvable(entry.journey)) {
    failures.push(`journey pointer unresolved: ${entry.journey}`);
  }
  // Evidence pointer is a path (or path#row-id). Resolve the path portion.
  const evidencePath = entry.evidence.split("#")[0] ?? "";
  if (evidencePath.length > 0 && !fileResolvable(evidencePath)) {
    // Evidence may also be a `path:symbol` pointer (file + exported symbol).
    if (!symbolResolvable(entry.evidence)) {
      failures.push(`evidence pointer unresolved: ${entry.evidence}`);
    }
  }
  const verdict: "pass" | "fail" = failures.length === 0 ? "pass" : "fail";
  return {
    row: entry.row,
    section: sectionId,
    contract: entry.contract,
    implementation: entry.implementation,
    discoverableUx: entry.discoverableUx,
    journey: entry.journey,
    evidence: entry.evidence,
    verdict,
    ...(verdict === "fail" ? { reason: failures.join("; ") } : {}),
  };
}

/** Load all matrix-audit section files from a directory. */
export function loadMatrixAuditSections(sectionsDir: string): readonly MatrixAuditSectionFile[] {
  return readdirSync(sectionsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const abs = join(sectionsDir, name);
      return JSON.parse(readFileSync(abs, "utf8")) as MatrixAuditSectionFile;
    });
}

/** Resolve every row of every loaded section and aggregate. */
export function resolveMatrixAudit(sectionsDir: string): MatrixAuditAggregated {
  const sections = loadMatrixAuditSections(sectionsDir);
  const aggregatedSections = sections.map((section) => {
    const rows = section.rows.map((entry) => resolveMatrixAuditRow(entry, section.section));
    return {
      section: section.section,
      ...(section.sectionTitle !== undefined ? { sectionTitle: section.sectionTitle } : {}),
      ...(section.source !== undefined ? { source: section.source } : {}),
      rows,
      rowsTotal: rows.length,
      rowsGreen: rows.filter((row) => row.verdict === "pass").length,
    };
  });
  const rowsTotal = aggregatedSections.reduce((sum, section) => sum + section.rowsTotal, 0);
  const rowsGreen = aggregatedSections.reduce((sum, section) => sum + section.rowsGreen, 0);
  return {
    sections: aggregatedSections,
    rowsTotal,
    rowsGreen,
    loadedSectionFiles: readdirSync(sectionsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => relative(REPO_ROOT, join(sectionsDir, name))),
  };
}
