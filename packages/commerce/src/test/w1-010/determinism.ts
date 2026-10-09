/**
 * TEST-ONLY W1-010 — determinism audit.
 *
 * Independently re-derives the campaign schedules from the RECORDED
 * inputs (no imports of the runner code — the derivation rules are
 * re-implemented from the recorded contracts) and proves the executed
 * schedule matches byte-identical modulo recorded clock fields:
 *
 * - Pilot (experimentId "v3-baseline"): the three S+M+L cohort schedules
 *   re-derived from the W3-009 local-dev fixture rules (project-id rule,
 *   fnv1a seeds, journey-family sampling rule, persona roster).
 * - Campaign (experimentId "v3-w3-010-baseline"): the baseline schedule
 *   re-derived from the W1-009 portfolio generator (public surface) +
 *   the recorded W2 persona roster (docs/simulations/personas/
 *   cohort-manifest.json roleAllocation in W2 role-family order).
 *
 * Excluded from the byte-identity surface (recorded, audited elsewhere):
 * - clock/lineage fields: schedule.generatedAt, schedule.buildCommit.
 * - execution-outcome fields: project.status, evidenceRecordId,
 *   blockReason — these are execution facts governed by the count law
 *   (reconciliation module), not schedule-derivation inputs.
 */
import { createHash } from "node:crypto";
import type { CampaignScheduleInput, DeterminismAuditResult } from "./types.js";
import { canonicalJson } from "../../projection/serialize.js";
import { fixtureFnv1a } from "./guards.js";
import {
  generateByProjectId,
  INDUSTRIES,
  FIRM_SIZES,
} from "../w1-009/portfolio/index.js";

// ============================================================================
// Recorded-input mirrors (read-only, from the W3-009/W2-009 contracts)
// ============================================================================

/** The W3-009 local-dev fixture journey-family list (recorded order). */
export const FIXTURE_JOURNEY_FAMILIES: readonly string[] = [
  "buyer-intent-constraints",
  "offer-sourcing-comparison",
  "buy-now-vs-wait-price-timing",
  "existing-group-buy",
  "latent-demand-merchant-group-buy-proposal",
  "rent-borrow-vs-buy",
  "resale-rental-consignment",
  "proactive-economic-opportunities",
  "bounded-multi-hop-trade-cycle",
  "merchant-commerce-lifecycle",
  "supplier-procurement-receiving",
  "b2b-multi-location-supplier-coordination",
  "autonomous-store-policy",
  "commerce-twin-what-if",
  "connected-commerce-channels-and-live-commerce",
  "physical-no-rfid-supermarket",
  "trust-security-fraud-and-recourse",
  "failure-unknown-idempotency-recovery",
  "gui-feature-discoverability",
];

/** The W3-009 fixture role families (recorded order). */
export const FIXTURE_ROLE_FAMILIES: readonly string[] = [
  "project-owner",
  "procurement",
  "finance",
  "ops",
  "end-user",
  "approver",
  "supplier",
  "auditor",
];

/** The W2-009 role-family iteration order (persona-types.ts, recorded). */
export const W2_ROLE_FAMILIES: readonly string[] = [
  "procurement",
  "project-program-mgmt",
  "field-ops",
  "finance-accounting",
  "sales",
  "it",
  "compliance-audit",
  "approver-executive",
  "industry-specialist",
];

/** The W1 long industry id → W2 short id table (real-artifact-loader, recorded). */
const W1_TO_W2_INDUSTRY: Readonly<Record<string, string>> = {
  construction: "construction",
  "finance-banking-accounting": "finance",
  "sales-business-development": "sales",
  "technology-software-it-services": "technology",
  "healthcare-organizations": "healthcare",
  "transportation-delivery": "transportation",
  "hospitality-restaurants-hotels": "hospitality",
  "fashion-apparel-retail-brands": "fashion",
  "entertainment-media-production": "entertainment",
  "legal-professional-services": "legal",
  "defense-security-government-contracting": "defense",
  "manufacturing-supply-chain": "manufacturing",
  "supermarkets-local-retail": "supermarket",
};

// ============================================================================
// Canonical comparison surface
// ============================================================================

interface CanonicalSchedule {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly seedNamespace: string;
  readonly projects: readonly {
    readonly projectId: string;
    readonly firmId: string;
    readonly industry: string;
    readonly firmSize: string;
    readonly personaIds: readonly string[];
    readonly seed: string;
    readonly journeyFamilies: readonly string[];
  }[];
  readonly totalPlanned: number;
  readonly journeyFamilySampling: readonly (readonly [string, readonly string[]])[];
}

export const CLOCK_FIELDS_EXCLUDED = ["schedule.generatedAt", "schedule.buildCommit"] as const;
export const EXECUTION_FIELDS_EXCLUDED = [
  "project.status",
  "project.evidenceRecordId",
  "project.blockReason",
] as const;

function toCanonical(schedule: CampaignScheduleInput): CanonicalSchedule {
  const familyCoverage = new Map<string, string[]>();
  const projects = schedule.projects.map((project) => {
    for (const family of project.journeyFamilies) {
      const list = familyCoverage.get(family) ?? [];
      list.push(project.projectId);
      familyCoverage.set(family, list);
    }
    return {
      projectId: project.projectId,
      firmId: project.firmId,
      industry: project.industry,
      firmSize: project.firmSize,
      personaIds: project.personaIds,
      seed: project.seed,
      journeyFamilies: project.journeyFamilies,
    };
  });
  return {
    experimentId: schedule.experimentId,
    cohortId: schedule.cohortId,
    seedNamespace: schedule.seedNamespace,
    projects,
    totalPlanned: schedule.totalPlanned,
    journeyFamilySampling: [...familyCoverage.entries()],
  };
}

function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (value === null || value === undefined) {
    out.set(prefix, "null");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) flatten(child, `${prefix}.${key}`, out);
    return;
  }
  out.set(prefix, String(value));
}

/** Compare a re-derived schedule against the executed one on the canonical surface. */
export function compareSchedules(
  scheduleId: string,
  derived: CampaignScheduleInput,
  executed: CampaignScheduleInput,
): { byteIdentical: boolean; fieldsCompared: number; mismatches: string[]; derivedSha256: string; executedSha256: string } {
  const derivedCanonical = toCanonical(derived);
  const executedCanonical = toCanonical(executed);
  const derivedJson = canonicalJson(derivedCanonical);
  const executedJson = canonicalJson(executedCanonical);
  const derivedFlat = new Map<string, string>();
  const executedFlat = new Map<string, string>();
  flatten(derivedCanonical, "$", derivedFlat);
  flatten(executedCanonical, "$", executedFlat);
  const mismatches: string[] = [];
  const keys = new Set([...derivedFlat.keys(), ...executedFlat.keys()]);
  for (const key of keys) {
    if (derivedFlat.get(key) !== executedFlat.get(key)) mismatches.push(key);
  }
  return {
    byteIdentical: derivedJson === executedJson,
    fieldsCompared: keys.size,
    mismatches: mismatches.slice(0, 50),
    derivedSha256: createHash("sha256").update(derivedJson).digest("hex"),
    executedSha256: createHash("sha256").update(executedJson).digest("hex"),
  };
}

// ============================================================================
// Pilot schedule re-derivation (experimentId "v3-baseline")
// ============================================================================

export interface PilotCohortSpec {
  readonly cohortId: string;
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly projectsPerFirm: number;
}

const FIXTURE_PERSONAS_BY_SIZE: Readonly<Record<string, number>> = { small: 1, medium: 2, large: 3 };

function fixturePersonaIds(firmId: string, firmSize: string): string[] {
  const count = FIXTURE_PERSONAS_BY_SIZE[firmSize] ?? 1;
  const ids: string[] = [];
  for (const role of FIXTURE_ROLE_FAMILIES) {
    for (let i = 1; i <= count; i++) ids.push(`${firmId}-persona-${role}-${i}`);
  }
  return ids;
}

function fixtureJourneyFamiliesForIndex(projectIndex: number): string[] {
  const families = FIXTURE_JOURNEY_FAMILIES.filter((_, idx) => (projectIndex + idx) % 3 !== 0);
  if (!families.includes("gui-feature-discoverability")) {
    families.push("gui-feature-discoverability");
  }
  return families;
}

/** Re-derive a pilot cohort schedule from the recorded fixture rules. */
export function rederivePilotSchedule(experimentId: string, cohort: PilotCohortSpec): CampaignScheduleInput {
  const personaIds = fixturePersonaIds(cohort.firmId, cohort.firmSize);
  const projects = [];
  for (let i = 0; i < cohort.projectsPerFirm; i++) {
    const projectId = `${cohort.firmId}-proj-${String(i + 1).padStart(3, "0")}`;
    projects.push({
      projectId,
      firmId: cohort.firmId,
      industry: cohort.industry,
      firmSize: cohort.firmSize,
      personaIds,
      seed: fixtureFnv1a(`baseline::${projectId}`),
      journeyFamilies: fixtureJourneyFamiliesForIndex(i),
      status: "scheduled" as const,
    });
  }
  return {
    experimentId,
    cohortId: cohort.cohortId,
    seedNamespace: "baseline",
    generatedAt: "<derived>",
    buildCommit: "<derived>",
    projects,
    totalPlanned: projects.length,
  };
}

// ============================================================================
// Campaign schedule re-derivation (W1 portfolio + W2 roster)
// ============================================================================

export interface CampaignFirmSpec {
  readonly w1IndustryId: string;
  readonly firmSize: "small" | "medium" | "large";
  /** W2 roster: persona ids per firm in generation (role-family) order. */
  readonly personaIds: readonly string[];
}

/**
 * Re-derive the baseline campaign schedule from the W1 portfolio generator
 * + the recorded W2 persona roster. Firm order = W1 generation order
 * (13 industries × small/medium/large); 100 baseline projects per firm.
 */
export function rederiveCampaignSchedule(args: {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly firms: readonly CampaignFirmSpec[];
  readonly projectsPerFirm: number;
}): CampaignScheduleInput {
  const projects = [];
  for (const firm of args.firms) {
    const industryIndex = INDUSTRIES.findIndex((industry) => industry.id === firm.w1IndustryId);
    if (industryIndex < 0) throw new TypeError(`unknown W1 industry: ${firm.w1IndustryId}`);
    const sizeIndex = FIRM_SIZES.indexOf(firm.firmSize);
    const short = W1_TO_W2_INDUSTRY[firm.w1IndustryId];
    if (short == null) throw new TypeError(`no W2 mapping for industry: ${firm.w1IndustryId}`);
    const firmId = `firm:${short}:${firm.firmSize}`;
    for (let idx = 1; idx <= args.projectsPerFirm; idx++) {
      const padded = String(idx).padStart(4, "0");
      const projectId = `W1-009-B-${firm.w1IndustryId}-${firm.firmSize}-${padded}`;
      const pair = generateByProjectId(projectId);
      projects.push({
        projectId,
        firmId,
        industry: pair.manifest.industryId,
        firmSize: firm.firmSize,
        personaIds: firm.personaIds,
        // The W3-010 recording convention: the schedule's per-project seed
        // field carries the FIRM-level seed material (the firm's first
        // project's material) — re-derived here exactly as recorded.
        seed: `w1-009:baseline:${firm.w1IndustryId}:${firm.firmSize}:0001`,
        journeyFamilies: pair.manifest.projectTemplate.applicableJourneyFamilies,
        status: "scheduled" as const,
      });
    }
  }
  return {
    experimentId: args.experimentId,
    cohortId: args.cohortId,
    seedNamespace: "baseline",
    generatedAt: "<derived>",
    buildCommit: "<derived>",
    projects,
    totalPlanned: projects.length,
  };
}

/** Build a determinism-audit result row. */
export function auditResult(args: {
  readonly scheduleId: string;
  readonly experimentId: string;
  readonly cohortIds: readonly string[];
  readonly derived: readonly CampaignScheduleInput[];
  readonly executed: readonly CampaignScheduleInput[];
  readonly notes: readonly string[];
  readonly personaRosterChecks?: DeterminismAuditResult["personaRosterChecks"];
}): DeterminismAuditResult {
  let byteIdentical = true;
  let fieldsCompared = 0;
  const mismatches: string[] = [];
  const derivedHashes: string[] = [];
  const executedHashes: string[] = [];
  for (let i = 0; i < args.derived.length; i++) {
    const comparison = compareSchedules(args.scheduleId, args.derived[i]!, args.executed[i]!);
    byteIdentical = byteIdentical && comparison.byteIdentical;
    fieldsCompared += comparison.fieldsCompared;
    mismatches.push(...comparison.mismatches);
    derivedHashes.push(comparison.derivedSha256);
    executedHashes.push(comparison.executedSha256);
  }
  return {
    scheduleId: args.scheduleId,
    experimentId: args.experimentId,
    cohortIds: args.cohortIds,
    reDerived: true,
    byteIdenticalModuloClockFields: byteIdentical,
    fieldsCompared,
    fieldMismatches: mismatches,
    clockFieldsExcluded: [...CLOCK_FIELDS_EXCLUDED],
    executionOutcomeFieldsExcluded: [...EXECUTION_FIELDS_EXCLUDED],
    derivedScheduleSha256: createHash("sha256").update(JSON.stringify(derivedHashes)).digest("hex"),
    executedScheduleSha256: createHash("sha256").update(JSON.stringify(executedHashes)).digest("hex"),
    personaRosterChecks: args.personaRosterChecks,
    notes: args.notes,
  };
}
