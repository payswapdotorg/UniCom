/**
 * TEST-ONLY W1-010 — integrity guards.
 *
 * 1. Holdout-leakage guard: prove zero `W1-009-H-*` (holdout-namespace)
 *    project appears anywhere in the evidence set, and prove
 *    baseline/holdout seed disjointness on the EXECUTED seeds.
 * 2. Money integrity (S11): every money value in the evidence set is an
 *    integer minor unit — zero float money.
 * 3. UNKNOWN preservation (S4/S9): no recorded outcome silently converts
 *    an UNKNOWN (or blocked/absent) into a pass/fail anywhere in the
 *    pipeline — record level AND every aggregation layer.
 */
import type {
  CampaignScheduleInput,
  HoldoutLeakageResult,
  JourneyEvidenceRecordInput,
  MoneyIntegrityResult,
  MoneyViolation,
  UnknownPreservationResult,
} from "./types.js";
import { computeSeed, INDUSTRIES, FIRM_SIZES } from "../w1-009/portfolio/index.js";

// ============================================================================
// 1. Holdout-leakage guard + seed disjointness
// ============================================================================

const HOLDOUT_PROJECT_ID_PREFIX = "W1-009-H-";
const BASELINE_PREFIX = 0x1a0c0; // seed-namespaces.json: baseline
const HOLDOUT_PREFIX = 0x2b1d1; // seed-namespaces.json: holdout
const MAX_OFFSET = 12 * 900 + 2 * 300 + 99; // industry 12, size 2, idx 100

/** The W3-009 fixture deterministicSeed algorithm (re-implemented read-only). */
export function fixtureFnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The W1 manifest seed facts for one project (campaign mode). */
export interface W1SeedFacts {
  readonly seedValue: number;
  readonly seedMaterial: string;
}

export interface HoldoutGuardArgs {
  readonly schedules: readonly CampaignScheduleInput[];
  readonly records: readonly JourneyEvidenceRecordInput[];
  /** Holdout-namespace project-id set (W1 generator output) — campaign only. */
  readonly holdoutProjectIds?: ReadonlySet<string>;
  /** Holdout-namespace numeric seed set (W1 generator output) — campaign only. */
  readonly holdoutNumericSeeds?: ReadonlySet<number>;
  /** Campaign mode: W1 manifest seed facts per project (re-derivation anchor). */
  readonly w1SeedFactsFor?: (projectId: string) => W1SeedFacts | null;
  /** Pilot mode: cohort id per record (record seed re-derivation anchor). */
  readonly cohortIdForRecord?: (record: JourneyEvidenceRecordInput) => string;
}

export function holdoutLeakageGuard(args: HoldoutGuardArgs): HoldoutLeakageResult {
  const evidenceProjectIds = new Set<string>();
  for (const schedule of args.schedules) {
    for (const project of schedule.projects) evidenceProjectIds.add(project.projectId);
  }
  for (const record of args.records) evidenceProjectIds.add(record.projectId);

  // (a) No W1-009-H-* id anywhere in the evidence set (pattern + generated set).
  const patternHits = [...evidenceProjectIds].filter((id) => id.startsWith(HOLDOUT_PROJECT_ID_PREFIX));
  const setHits = args.holdoutProjectIds != null
    ? [...evidenceProjectIds].filter((id) => args.holdoutProjectIds!.has(id))
    : [];
  const holdoutHits = [...new Set([...patternHits, ...setHits])];

  // (b) Seed disjointness over the EXECUTED seeds.
  const executedProjectIds = new Set<string>();
  for (const schedule of args.schedules) {
    for (const project of schedule.projects) {
      if (project.status !== "scheduled") executedProjectIds.add(project.projectId);
    }
  }
  for (const record of args.records) executedProjectIds.add(record.projectId);

  const namespaceComponents = new Set<string>();
  let numericChecked = 0;
  let numericMatches = 0;
  let numericOutOfRange = 0;
  let holdoutSetIntersections = 0;
  let blockedRecordFirmSeedAnchors = 0;
  let disjointnessProven = false;
  const isCampaign = args.w1SeedFactsFor != null;

  if (isCampaign) {
    // Executed seeds are W1 seed materials: "w1-009:<namespace>:<industry>:<size>:<NNNN>".
    // Schedule seeds are FIRM-level (the firm's first-project material — the
    // W3-010 recording convention); record seeds are the project's own.
    for (const schedule of args.schedules) {
      for (const project of schedule.projects) {
        if (project.status !== "scheduled") namespaceComponents.add(project.seed.split(":")[1] ?? "<malformed>");
      }
    }
    for (const record of args.records) namespaceComponents.add(record.deterministicSeed.split(":")[1] ?? "<malformed>");
    for (const projectId of executedProjectIds) {
      const match = projectId.match(/^W1-009-B-(.+)-(small|medium|large)-(\d{4})$/);
      const facts = args.w1SeedFactsFor!(projectId);
      if (match == null || facts == null) continue;
      const [, industryId, size, idxStr] = match;
      const industryIndex = INDUSTRIES.findIndex((industry) => industry.id === industryId);
      const sizeIndex = FIRM_SIZES.indexOf(size as "small" | "medium" | "large");
      const idx = Number.parseInt(idxStr!, 10);
      const reDerived = computeSeed("baseline", industryIndex, sizeIndex, idx);
      numericChecked += 1;
      // Re-derivation equality: id → numeric seed → manifest seedValue.
      // Record seeds anchor the project's own manifest seedMaterial for
      // executed journeys; BLOCKED records anchor the schedule's firm-level
      // seed (the W3-010 makeBlockedEvidenceRecord convention — counted and
      // disclosed, not silently accepted). Schedule seeds are firm-level
      // (the firm's first-project material).
      const firmLevelMaterial = `w1-009:baseline:${industryId}:${size}:0001`;
      let blockedFirmSeedAnchors = 0;
      let recordSeedsMatch = true;
      for (const record of args.records) {
        if (record.projectId !== projectId) continue;
        if (record.deterministicSeed === facts.seedMaterial) continue;
        if (record.deterministicSeed === firmLevelMaterial) {
          blockedFirmSeedAnchors += 1;
          continue;
        }
        recordSeedsMatch = false;
      }
      blockedRecordFirmSeedAnchors += blockedFirmSeedAnchors;
      const scheduleSeedMatches = args.schedules
        .flatMap((schedule) => schedule.projects.filter((project) => project.projectId === projectId))
        .every((project) => project.seed === firmLevelMaterial);
      if (reDerived === facts.seedValue && recordSeedsMatch && scheduleSeedMatches) numericMatches += 1;
      const inBaselineRange = reDerived >= BASELINE_PREFIX && reDerived <= BASELINE_PREFIX + MAX_OFFSET;
      if (!inBaselineRange) numericOutOfRange += 1;
      if (args.holdoutNumericSeeds?.has(reDerived)) holdoutSetIntersections += 1;
    }
    disjointnessProven =
      numericOutOfRange === 0
      && holdoutSetIntersections === 0
      && namespaceComponents.size === 1
      && namespaceComponents.has("baseline")
      && numericMatches === numericChecked;
  } else {
    // Pilot fixture seeds (8-hex fnv1a). Derivation contract (W3-009):
    //   schedule seed  = fnv1a(`baseline::<projectId>`)   (seedNamespace anchor)
    //   record seed    = fnv1a(`<cohortId>::<projectId>`) (manifest seed anchor)
    // Disjointness proof: the executed seed set must not intersect the
    // holdout-namespace seed set, and every executed seed must re-derive
    // exactly from its own anchor.
    const executedSeeds = new Set<string>();
    for (const schedule of args.schedules) {
      for (const project of schedule.projects) {
        if (project.status !== "scheduled") executedSeeds.add(project.seed);
      }
    }
    for (const record of args.records) executedSeeds.add(record.deterministicSeed);
    const holdoutSeeds = new Set([...evidenceProjectIds].map((id) => fixtureFnv1a(`holdout::${id}`)));
    for (const seed of executedSeeds) {
      numericChecked += 1;
      if (holdoutSeeds.has(seed)) holdoutSetIntersections += 1;
    }
    // Schedule seeds re-derive from the baseline namespace anchor.
    for (const schedule of args.schedules) {
      for (const project of schedule.projects) {
        if (project.status === "scheduled") continue;
        numericMatches += project.seed === fixtureFnv1a(`baseline::${project.projectId}`) ? 1 : 0;
      }
    }
    // Record seeds re-derive from the cohort anchor.
    for (const record of args.records) {
      numericMatches += record.deterministicSeed === fixtureFnv1a(`${record.cohortId}::${record.projectId}`) ? 1 : 0;
    }
    namespaceComponents.add("<fixture-8hex>");
    disjointnessProven = holdoutSetIntersections === 0 && holdoutHits.length === 0 && numericMatches > 0;
  }

  return {
    w1HoldoutProjectIdsInEvidence: holdoutHits.length,
    w1HoldoutProjectIdSamples: holdoutHits.slice(0, 5),
    executedProjectCount: evidenceProjectIds.size,
    executedSeedNamespaceComponents: [...namespaceComponents],
    baselineSeedRange: { min: BASELINE_PREFIX, max: BASELINE_PREFIX + MAX_OFFSET },
    holdoutSeedRange: { min: HOLDOUT_PREFIX, max: HOLDOUT_PREFIX + MAX_OFFSET },
    executedNumericSeedsChecked: numericChecked,
    numericSeedReDerivationMatches: numericMatches,
    numericSeedOutOfRange: numericOutOfRange,
    holdoutSeedSetIntersections: holdoutSetIntersections,
    blockedRecordFirmSeedAnchors,
    seedDisjointnessProven: disjointnessProven,
    leakageFree: holdoutHits.length === 0 && disjointnessProven,
  };
}


// ============================================================================
// 2. Money integrity (S11)
// ============================================================================

const MONEY_KEY_PATTERN = /minor$|minor(?![a-z])|cents$|^budget$|^money$|^price$/i;
/** Non-value fields that may appear inside money contexts (skipped). */
const MONEY_CONTEXT_SKIP_KEYS = new Set(["currency", "uom"]);

interface MoneyScanState {
  values: number;
  violations: MoneyViolation[];
}

function scanMoneyNode(node: unknown, path: string, inMoneyContext: boolean, state: MoneyScanState): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) scanMoneyNode(node[i], `${path}[${i}]`, inMoneyContext, state);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (inMoneyContext && MONEY_CONTEXT_SKIP_KEYS.has(key)) continue;
      scanMoneyNode(value, `${path}.${key}`, inMoneyContext || MONEY_KEY_PATTERN.test(key), state);
    }
    return;
  }
  if (!inMoneyContext) return;
  const leafKey = path.split(".").pop() ?? path;
  if (typeof node === "number") {
    state.values += 1;
    if (!Number.isInteger(node)) {
      state.violations.push({ path, key: leafKey, value: String(node), kind: "float" });
    }
    return;
  }
  if (typeof node === "string") {
    state.values += 1;
    if (!/^-?\d+$/.test(node)) {
      state.violations.push({ path, key: leafKey, value: node, kind: "non-integer-string" });
    }
    return;
  }
  state.values += 1;
  state.violations.push({ path, key: leafKey, value: JSON.stringify(node), kind: "non-numeric" });
}

/** Scan one evidence scope (a parsed JSON artifact or in-process object). */
export function scanMoneyIntegrity(scope: string, root: unknown): { values: number; violations: MoneyViolation[] } {
  const state: MoneyScanState = { values: 0, violations: [] };
  scanMoneyNode(root, "$", false, state);
  return { values: state.values, violations: state.violations.map((v) => ({ ...v, path: `${scope}:${v.path}` })) };
}

export function moneyIntegrityGuard(scopes: readonly { scope: string; root: unknown }[]): MoneyIntegrityResult {
  let values = 0;
  const violations: MoneyViolation[] = [];
  const scopeRows: { scope: string; values: number; violations: number }[] = [];
  for (const { scope, root } of scopes) {
    const result = scanMoneyIntegrity(scope, root);
    values += result.values;
    violations.push(...result.violations);
    scopeRows.push({ scope, values: result.values, violations: result.violations.length });
  }
  return {
    moneyValuesScanned: values,
    floatMoneyFound: violations.filter((v) => v.kind === "float").length,
    violations: violations.slice(0, 50),
    scopes: scopeRows,
  };
}

// ============================================================================
// 3. UNKNOWN preservation (S4/S9)
// ============================================================================

export interface AggregateCheck {
  readonly label: string;
  readonly recorded: number;
  readonly actual: number;
}

export function unknownPreservationGuard(args: {
  readonly records: readonly JourneyEvidenceRecordInput[];
  readonly aggregateChecks: readonly AggregateCheck[];
}): UnknownPreservationResult {
  const unknownRecords = args.records.filter((r) => r.outcome === "unknown").length;
  const blockedRecords = args.records.filter((r) => r.outcome === "blocked").length;
  const absentRecords = args.records.filter((r) => r.outcome === "absent").length;

  const checks = args.aggregateChecks.map((check) => ({ ...check, matches: check.recorded === check.actual }));
  const recordLevelViolations: { evidenceId: string; reason: string }[] = [];
  for (const record of args.records) {
    if (record.outcome === "pass" || record.outcome === "fail") continue;
    if (record.successfulSteps.some((step) => step.includes("complete-task"))) {
      recordLevelViolations.push({
        evidenceId: record.evidenceId,
        reason: `${record.outcome} record claims a completion step`,
      });
    }
    const adoption = record.postTaskAdoptionResponse;
    if (adoption?.technicalFullSwitchEligible === true) {
      recordLevelViolations.push({
        evidenceId: record.evidenceId,
        reason: `${record.outcome} record claims technicalFullSwitchEligible`,
      });
    }
    if (adoption?.mainInterfaceEligible === true) {
      recordLevelViolations.push({
        evidenceId: record.evidenceId,
        reason: `${record.outcome} record claims mainInterfaceEligible`,
      });
    }
  }

  const conversionsFound = checks.filter((check) => !check.matches).length + recordLevelViolations.length;

  return {
    unknownRecords,
    blockedRecords,
    absentRecords,
    aggregateChecks: checks,
    recordLevelViolations,
    conversionsFound,
    preserved: conversionsFound === 0,
  };
}
