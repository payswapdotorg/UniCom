/**
 * W1-009 portfolio — deterministic scenario-portfolio generator.
 *
 * Generates 13 industries × 3 sizes × 200 projects = 7,800 manifests per
 * namespace (baseline + holdout = 15,600 total) from compact deterministic
 * descriptors. Same inputs ⇒ byte-identical output (validated by
 * `portfolio-determinism.test.ts`).
 *
 * Laws (binding — see docs/simulations/scenarios/SCHEMA.md):
 * 1. Deterministic: canonical commerce state reproducible from seeds.
 * 2. Commerce workloads only — no general PM/engineering/clinical/etc.
 * 3. Architecture frozen — additive test/fixture code only.
 * 4. No float money — all money values are integer minor units.
 * 5. Twin/prediction stays non-authoritative.
 * 6. Fixtures NEVER mark journeys successful — the oracle asserts
 *    expected post-journey state only; W3 marks journeys successful.
 */
import { canonicalJson } from "../../../projection/serialize.js";
import {
  FIRM_SIZES,
  FIRM_STAFF_BY_SIZE,
  FIRM_STRESSOR_BY_SIZE,
  INDUSTRIES,
  firmCohortId,
  industryById,
} from "./industries.js";
import { roleFamiliesForIndustry, journeyFamilyById, computeSeed, computeProjectId } from "./registries.js";
import { mulberry32, fnv1a32 } from "./rng.js";
import { buildProjectTemplate } from "./templates.js";
import { buildOutcomeOracle } from "./oracle.js";
import type {
  GeneratePortfolioOptions,
  GeneratedPair,
  GeneratedPortfolio,
  Namespace,
  ProjectManifest,
  RoleMixEntry,
  FirmSize,
} from "./schema.js";

const DEFAULT_PROJECTS_PER_FIRM = 100; // per namespace; 100 baseline + 100 holdout = 200 total per firm

export function generatePortfolio(options: GeneratePortfolioOptions): GeneratedPortfolio {
  const namespace: Namespace = options.namespace;
  const sizes = options.sizes ?? FIRM_SIZES;
  const projectsPerFirm = options.projectsPerFirm ?? DEFAULT_PROJECTS_PER_FIRM;

  const industryList = options.industries === "all" || options.industries === undefined
    ? INDUSTRIES
    : [industryById(options.industries)];

  const pairs: GeneratedPair[] = [];

  for (let industryIndex = 0; industryIndex < INDUSTRIES.length; industryIndex += 1) {
    const industry = INDUSTRIES[industryIndex]!;
    if (!industryList.some((candidate) => candidate.id === industry.id)) continue;

    for (const size of sizes) {
      const sizeIndex = FIRM_SIZES.indexOf(size);
      if (sizeIndex < 0) continue;

      for (let idx = 1; idx <= projectsPerFirm; idx += 1) {
        const pair = generatePair(namespace, industry.id, size, industryIndex, sizeIndex, idx);
        pairs.push(pair);
      }
    }
  }

  return {
    namespace,
    pairs,
    counts: {
      manifests: pairs.length,
      oracles: pairs.length,
      firms: industryList.length * sizes.length,
    },
  };
}

export function generatePair(
  namespace: Namespace,
  industryId: string,
  size: FirmSize,
  industryIndex: number,
  sizeIndex: number,
  idx: number,
): GeneratedPair {
  const industry = industryById(industryId);
  const seedValue = computeSeed(namespace, industryIndex, sizeIndex, idx);
  const projectId = computeProjectId(namespace, industryId, size, idx);
  const rng = mulberry32(seedValue);

  const firmDescriptor = {
    syntheticStaff: FIRM_STAFF_BY_SIZE[size],
    primaryCommerceStressor: FIRM_STRESSOR_BY_SIZE[size],
    incumbentStack: industry.incumbentComparators,
    excludedComparators: industry.excludedComparators,
  };

  const roleMix = buildRoleMix(industryId, size, rng);
  const projectTemplate = buildProjectTemplate(industryId, size, idx, rng);
  // Fill in the applicable journey families from the industry descriptor.
  const templateWithJourneys = {
    ...projectTemplate,
    applicableJourneyFamilies: industry.applicableJourneyFamilies,
  };

  // Build the GUI task goal from the template (deterministic, no LLM call).
  const guiTaskGoal = buildGuiTaskGoal(templateWithJourneys, industryId, size, idx);

  const taskOutcome = {
    guiTaskGoal,
    guiEntrySurface: journeyFamilyById(industry.applicableJourneyFamilies[0] ?? "gui-feature-discoverability").guiEntrySurface,
    applicableRoles: roleMix.map((entry) => entry.roleFamily),
    expectedPostJourneyState: {
      purchaseOrderState: "RECEIVED",
      receivedUnitsByLine: computeReceivedUnitsByLine(templateWithJourneys),
      totalCostMinor: computeTotalCostMinor(templateWithJourneys),
      currency: templateWithJourneys.budget.currency,
      withinBudget: true,
      withinDeadline: true,
      evidenceCaptured: templateWithJourneys.evidenceRequired,
    },
  };

  // The manifest object (pre-fingerprint).
  const manifestPre: Omit<ProjectManifest, "determinismFingerprint"> = {
    schema: "unicom-w1-009-project-manifest/1",
    projectId,
    namespace,
    industryId,
    industryName: industry.name,
    firmSize: size,
    firmCohortId: firmCohortId(industryId, size),
    firmDescriptor,
    seed: {
      namespace,
      seedValue,
      seedMaterial: `w1-009:${namespace}:${industryId}:${size}:${String(idx).padStart(4, "0")}`,
      prng: "mulberry32",
    },
    roleMix,
    projectTemplate: templateWithJourneys,
    taskOutcome,
    outcomeOracleRef: `${projectId}.oracle.json`,
  };

  // Compute the determinism fingerprint from the canonical JSON of the
  // manifest (excluding the fingerprint field itself).
  const canonical = canonicalJson(manifestPre);
  const determinismFingerprint = `sha256:${fnv1a32(canonical)}`;
  const manifest: ProjectManifest = { ...manifestPre, determinismFingerprint };

  const oracle = buildOutcomeOracle(manifest);

  return { manifest, oracle };
}

function buildRoleMix(industryId: string, size: FirmSize, rng: ReturnType<typeof mulberry32>): readonly RoleMixEntry[] {
  const roleFamilies = roleFamiliesForIndustry(industryId);
  const personaScale: Readonly<Record<FirmSize, number>> = {
    small: 1,
    medium: 4,
    large: 25,
  };
  const scale = personaScale[size];
  return roleFamilies.map((roleFamily) => {
    const base = Math.max(1, Math.floor(scale * (0.5 + rng.next())));
    return {
      roleFamily: roleFamily.roleFamily,
      personas: base,
      authorityScope: roleFamily.authorityScope,
    };
  });
}

function buildGuiTaskGoal(
  template: ProjectManifest["projectTemplate"],
  industryId: string,
  size: FirmSize,
  idx: number,
): string {
  const firstLine = template.purchasingList[0];
  const units = firstLine?.quantity.kind === "COUNT"
    ? `${firstLine.quantity.units} ${firstLine.description}`
    : `${firstLine?.quantity.amount ?? "0"} ${firstLine?.quantity.uom ?? ""} of ${firstLine?.description}`;
  const budget = Number(template.budget.totalMinor) / 100;
  const approverStep = template.approvals.find((step) => step.action === "APPROVE_PURCHASE");
  const approvalThreshold = approverStep?.maxAmountMinor
    ? `, requiring ${approverStep.roleFamily} approval for amounts over $${Number(approverStep.maxAmountMinor) / 100}`
    : "";
  return `Order ${units} for ${industryId}-${size} project ${idx} with site delivery by ${template.deadline.hard}, within $${budget.toFixed(2)} budget${approvalThreshold}.`;
}

function computeReceivedUnitsByLine(template: ProjectManifest["projectTemplate"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of template.purchasingList) {
    if (line.quantity.kind === "COUNT") {
      out[line.lineId] = line.quantity.units ?? 0;
    } else {
      out[line.lineId] = 1;
    }
  }
  return out;
}

function computeTotalCostMinor(template: ProjectManifest["projectTemplate"]): string {
  let total = 0n;
  for (const line of template.purchasingList) {
    const units = line.quantity.kind === "COUNT" ? BigInt(line.quantity.units ?? 0) : 1n;
    const unitPrice = BigInt(line.unitPriceMinor);
    total += units * unitPrice;
  }
  return total.toString();
}

/**
 * Convenience: generate the full portfolio (baseline + holdout).
 * Total = 15,600 manifests.
 */
export function generateFullPortfolio(): { baseline: GeneratedPortfolio; holdout: GeneratedPortfolio } {
  return {
    baseline: generatePortfolio({ namespace: "baseline" }),
    holdout: generatePortfolio({ namespace: "holdout" }),
  };
}

/**
 * Convenience: generate a single manifest by projectId (used by tests).
 */
export function generateByProjectId(projectId: string): GeneratedPair {
  // Parse: W1-009-{B|H}-{industryId}-{size}-{NNNN}
  const match = projectId.match(/^W1-009-([BH])-(.+)-(small|medium|large)-(\d{4})$/);
  if (!match) throw new TypeError(`invalid projectId: ${projectId}`);
  const [, ns, industryId, size, idxStr] = match;
  const namespace: Namespace = ns === "B" ? "baseline" : "holdout";
  const idx = parseInt(idxStr!, 10);
  const industryIndex = INDUSTRIES.findIndex((industry) => industry.id === industryId);
  if (industryIndex < 0) throw new TypeError(`unknown industry in projectId: ${industryId}`);
  const sizeIndex = FIRM_SIZES.indexOf(size as FirmSize);
  return generatePair(namespace, industryId!, size as FirmSize, industryIndex, sizeIndex, idx);
}

/**
 * Compute the canonical JSON fingerprint of a generated portfolio.
 * Two portfolios with identical inputs MUST produce identical fingerprints.
 */
export function portfolioFingerprint(portfolio: GeneratedPortfolio): string {
  return fnv1a32(canonicalJson(portfolio));
}
