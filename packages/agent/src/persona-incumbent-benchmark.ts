/**
 * W2-010 — Incumbent benchmark suite (per-firm, in-scope commerce task goals).
 *
 * Builds the evidence-classed incumbent benchmark registry for every
 * synthetic firm (39) against the FROZEN W2-009 incumbent stacks
 * (persona-incumbent-stacks.ts) and the verified product table
 * (persona-incumbent-verification.ts).
 *
 * Laws (W2-010 work order + matrix + protocol §6):
 * 1. Commerce-only: only the commerce capabilities of the frozen stacks are
 *    benchmarked. Broad vertical platforms never appear (the frozen stacks
 *    already exclude them; this module adds none).
 * 2. Every in-scope commerce task goal observation is classed A/B/C/D or
 *    marked no-incumbent-counterpart (UNiCOM-differentiated goal with no
 *    incumbent capability row in the frozen stack).
 * 3. D-class observations render incumbent capability UNKNOWN — never a
 *    performance claim. C-class observations are capability checklists
 *    only. NO performance comparisons exist anywhere in the registry
 *    (performanceComparison is the literal "UNKNOWN").
 * 4. A row's effective class is the WEAKEST class among its named products
 *    (conservative weakest-link; D < C < B < A).
 * 5. A persona's effective incumbent evidence class is the weakest class
 *    across the incumbent counterpart task goals applicable to that persona
 *    (fed into the frozen W2-009 scoring: class D zeroes outcomeVsBenchmark).
 * 6. No invented prices, speeds or market share; no fake competitor UI.
 *
 * Internal to the @unicom/agent module (re-exported via contract.w2-010.ts).
 */

import { buildFirmCohortManifest } from "./persona-cohort.js";
import type {
  EvidenceClass,
  FirmCohort,
  FirmSize,
  IncumbentCapabilityKind,
  Industry,
  IncumbentStackEntry,
  JourneyFamily,
  Persona,
} from "./persona-types.js";
import { JOURNEY_FAMILIES } from "./persona-types.js";
import { VERIFIED_INCUMBENT_PRODUCTS } from "./persona-incumbent-verification.js";
import { CAPABILITY_KINDS, CLASS_STRENGTH, ROW_PRODUCTS, TASK_GOAL_REQUIREMENTS } from "./persona-incumbent-rows.js";

/** Version of the incumbent benchmark registry format. */
export const INCUMBENT_BENCHMARK_VERSION = "w2-010:v1";

/** One matched incumbent stack row inside a task-goal observation. */
export interface BenchmarkMatchedRow {
  readonly capability: string;
  readonly incumbent: string;
  readonly editionOrAccess: string;
  readonly capabilityKind: IncumbentCapabilityKind;
  readonly productKeys: readonly string[];
  readonly effectiveEvidenceClass: EvidenceClass;
  readonly supportsPerformanceClaims: boolean;
}

/** One in-scope commerce task goal observation against the incumbent stack. */
export interface IncumbentTaskGoalObservation {
  readonly taskGoal: JourneyFamily;
  /** incumbent-tool (specific products) | manual-fallback (D workflow) | no-incumbent-counterpart. */
  readonly coverage: "incumbent-tool" | "manual-fallback" | "no-incumbent-counterpart";
  readonly matchedRows: readonly BenchmarkMatchedRow[];
  /** Weakest class among matched rows (D when manual-fallback; "D" marker when none). */
  readonly effectiveEvidenceClass: EvidenceClass;
  /** Always UNKNOWN — no incumbent performance was measured anywhere. */
  readonly performanceComparison: "UNKNOWN";
}

/** One firm's incumbent benchmark (in-scope task goals with classified evidence). */
export interface FirmIncumbentBenchmark {
  readonly firmId: string;
  readonly industry: Industry;
  readonly firmSize: FirmSize;
  readonly version: typeof INCUMBENT_BENCHMARK_VERSION;
  readonly taskGoalObservations: readonly IncumbentTaskGoalObservation[];
  readonly classCounts: Readonly<Record<EvidenceClass, number> & { noIncumbentCounterpart: number }>;
  /** Number of task goals with an incumbent counterpart (in-scope for comparison). */
  readonly inScopeTaskGoalCount: number;
}

/** Build the benchmark registry for one firm cohort. */
export function buildFirmIncumbentBenchmark(
  firm: FirmCohort,
): FirmIncumbentBenchmark {
  const observations = inScopeTaskGoals(firm).map((goal) =>
    observeTaskGoal(firm, goal),
  );
  const classCounts = { A: 0, B: 0, C: 0, D: 0, noIncumbentCounterpart: 0 };
  let inScope = 0;
  for (const observation of observations) {
    if (observation.coverage === "no-incumbent-counterpart") {
      classCounts.noIncumbentCounterpart += 1;
      continue;
    }
    inScope += 1;
    classCounts[observation.effectiveEvidenceClass] += 1;
  }
  return {
    firmId: firm.firmId,
    industry: firm.industry,
    firmSize: firm.firmSize,
    version: INCUMBENT_BENCHMARK_VERSION,
    taskGoalObservations: observations,
    classCounts,
    inScopeTaskGoalCount: inScope,
  };
}

/** Build the full registry (39 firms, deterministic). */
export function buildIncumbentBenchmarkRegistry(): readonly FirmIncumbentBenchmark[] {
  return buildFirmCohortManifest().map((firm) => buildFirmIncumbentBenchmark(firm));
}

/**
 * A persona's effective incumbent evidence class: the WEAKEST class across
 * the incumbent counterpart task goals applicable to that persona. Personas
 * whose applicable goals have no incumbent counterpart at all resolve to D
 * (no comparable benchmark — no superiority claim possible; conservative).
 */
export function effectiveIncumbentEvidenceClassFor(
  persona: Persona,
  registry: ReadonlyArray<FirmIncumbentBenchmark>,
): EvidenceClass {
  const firm = registry.find((entry) => entry.firmId === persona.firmId);
  if (!firm) {
    throw new Error(`no incumbent benchmark for firm ${persona.firmId}`);
  }
  let weakest: EvidenceClass = "A";
  let anyCounterpart = false;
  for (const goal of persona.applicableJourneys) {
    const observation = firm.taskGoalObservations.find(
      (entry) => entry.taskGoal === goal,
    );
    if (!observation || observation.coverage === "no-incumbent-counterpart") {
      continue;
    }
    anyCounterpart = true;
    if (CLASS_STRENGTH[observation.effectiveEvidenceClass] < CLASS_STRENGTH[weakest]) {
      weakest = observation.effectiveEvidenceClass;
    }
  }
  return anyCounterpart ? weakest : "D";
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** In-scope task goals for a firm: union over all role families. */
function inScopeTaskGoals(firm: FirmCohort): JourneyFamily[] {
  const goals = new Set<JourneyFamily>();
  // Union of role applicability (mirrors persona-journeys.ts coverage per firm).
  const roleFamilies: readonly string[] = [
    "procurement", "project-program-mgmt", "field-ops", "finance-accounting",
    "sales", "it", "compliance-audit", "approver-executive", "industry-specialist",
  ];
  for (const role of roleFamilies) {
    for (const goal of journeyGoalsForRole(firm.industry, role)) {
      goals.add(goal);
    }
  }
  return JOURNEY_FAMILIES.filter((goal) => goals.has(goal));
}

/** Role-level applicable goals (kept structurally in sync with persona-journeys.ts laws). */
function journeyGoalsForRole(industry: Industry, role: string): JourneyFamily[] {
  const goals: JourneyFamily[] = ["feature-discovery"];
  const buyerSide = [
    "procurement", "project-program-mgmt", "industry-specialist", "approver-executive", "field-ops",
  ];
  if (buyerSide.includes(role)) {
    goals.push("buyer-intent-canvas", "compare-sellers", "buy-vs-wait-negotiate", "failure-recovery");
  }
  if (role === "sales" || role === "industry-specialist") {
    goals.push(
      "merchant-lifecycle", "b2b-multi-location", "existing-groupbuy-discovery", "latent-demand-groupbuy",
    );
  }
  if (role === "procurement" || role === "field-ops" || role === "industry-specialist") {
    goals.push(
      "supplier-procurement-lifecycle", "rent-borrow-vs-buy", "resale-rental-consignment",
      "proactive-opportunities", "multi-hop-tradecycle",
    );
  }
  if (role === "compliance-audit" || role === "approver-executive") {
    goals.push("commerce-trust-security", "commerce-twin-whatif");
  }
  if (role === "it" || role === "industry-specialist") {
    goals.push("connector-discovery-execution", "autonomous-store-runtime");
  }
  if (industry === "supermarket") {
    goals.push("no-rfid-physical-retail");
  }
  if (role === "approver-executive" || role === "industry-specialist" || role === "procurement") {
    goals.push("commerce-twin-whatif");
  }
  return Array.from(new Set(goals));
}

/** Observe one task goal against one firm's frozen stack. */
function observeTaskGoal(
  firm: FirmCohort,
  goal: JourneyFamily,
): IncumbentTaskGoalObservation {
  const requiredKinds = TASK_GOAL_REQUIREMENTS[goal];
  if (requiredKinds.length === 0) {
    return {
      taskGoal: goal,
      coverage: "no-incumbent-counterpart",
      matchedRows: [],
      effectiveEvidenceClass: "D",
      performanceComparison: "UNKNOWN",
    };
  }
  const matchedRows: BenchmarkMatchedRow[] = [];
  for (const entry of firm.incumbentStack) {
    const kind = CAPABILITY_KINDS[entry.capability];
    if (!kind || !requiredKinds.includes(kind)) {
      continue;
    }
    matchedRows.push(buildMatchedRow(firm, entry, kind));
  }
  if (matchedRows.length === 0) {
    return {
      taskGoal: goal,
      coverage: "no-incumbent-counterpart",
      matchedRows: [],
      effectiveEvidenceClass: "D",
      performanceComparison: "UNKNOWN",
    };
  }
  let weakest: EvidenceClass = "A";
  let onlyManual = true;
  for (const row of matchedRows) {
    if (CLASS_STRENGTH[row.effectiveEvidenceClass] < CLASS_STRENGTH[weakest]) {
      weakest = row.effectiveEvidenceClass;
    }
    if (row.capabilityKind !== "manual") {
      onlyManual = false;
    }
  }
  const coverage = onlyManual ? "manual-fallback" : "incumbent-tool";
  return {
    taskGoal: goal,
    coverage,
    matchedRows,
    effectiveEvidenceClass: weakest,
    performanceComparison: "UNKNOWN",
  };
}

function buildMatchedRow(
  firm: FirmCohort,
  entry: IncumbentStackEntry,
  kind: IncumbentCapabilityKind,
): BenchmarkMatchedRow {
  const productKeys = ROW_PRODUCTS[`${firm.industry}:${entry.capability}`] ?? [];
  let weakest: EvidenceClass = "A";
  for (const key of productKeys) {
    const product = VERIFIED_INCUMBENT_PRODUCTS[key];
    if (!product) {
      throw new Error(`no verified product for key ${key} (${firm.industry}:${entry.capability})`);
    }
    if (CLASS_STRENGTH[product.evidenceClass] < CLASS_STRENGTH[weakest]) {
      weakest = product.evidenceClass;
    }
  }
  if (productKeys.length === 0) {
    // Defensive: every frozen-stack row must map to at least one product key.
    throw new Error(`no product mapping for stack row ${firm.industry}:${entry.capability}`);
  }
  return {
    capability: entry.capability,
    incumbent: entry.incumbent,
    editionOrAccess: entry.editionOrAccess,
    capabilityKind: kind,
    productKeys,
    effectiveEvidenceClass: weakest,
    supportsPerformanceClaims: weakest === "A" || weakest === "B",
  };
}
