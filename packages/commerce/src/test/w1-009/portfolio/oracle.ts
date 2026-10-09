/**
 * W1-009 portfolio — outcome oracle builder.
 *
 * The oracle is consumed by W3 (GUI runner) and W2 (adoption scoring) — but
 * ONLY AFTER the GUI runner has performed the evaluated task. It contains:
 *
 * - The expected post-journey commerce state (deterministic, derived from
 *   the project template + seed).
 * - The assertions the GUI runner must satisfy to mark the journey successful.
 * - The failure conditions the journey must avoid.
 * - The UNKNOWN / BLOCKED conditions that must be preserved (never silently
 *   resolved to FAILED or SUCCESS).
 *
 * CRITICAL INVARIANT (per W1-009 work order): the oracle NEVER marks a user
 * journey successful. It only asserts expected post-journey state. Whether
 * the journey itself succeeded is determined by the W3 GUI runner performing
 * the task and the W2 adoption instrument scoring the result.
 */
import type {
  OutcomeOracle,
  OracleAssertion,
  ProjectManifest,
  ProjectTemplate,
} from "./schema.js";
import { INDUSTRIES, industryById } from "./industries.js";
import { JOURNEY_FAMILY_IDS, roleFamiliesForIndustry } from "./registries.js";
import { noRfidAssignmentForProject } from "./no-rfid.js";

const STANDARD_ASSERTIONS: readonly OracleAssertion[] = [
  {
    id: "cost-validity",
    kind: "MONEY_CONSERVATION",
    description: "Sum of received line totals equals journal money-out (no float).",
    check: "sumLineTotalsMinor === paymentCapturedMinor",
    severity: "CRITICAL",
  },
  {
    id: "budget-constraint",
    kind: "BUDGET",
    description: "Total cost ≤ project budget.",
    check: "totalCostMinor <= budgetTotalMinor",
    severity: "CRITICAL",
  },
  {
    id: "deadline-feasibility",
    kind: "DEADLINE",
    description: "Receiving completed on or before hard deadline.",
    check: "receivedAt <= hardDeadline",
    severity: "CRITICAL",
  },
  {
    id: "stock-reconciliation",
    kind: "RECONCILIATION",
    description: "On-hand equals received − sold − shrinkage (with explicit variance records).",
    check: "onHand === received - sold - shrinkageAdjusted",
    severity: "CRITICAL",
  },
  {
    id: "idempotency",
    kind: "IDEMPOTENCY",
    description: "Replaying the command envelope under the same idempotency key returns DUPLICATE.",
    check: "replay.status === 'DUPLICATE'",
    severity: "CRITICAL",
  },
  {
    id: "unknown-preservation",
    kind: "UNKNOWN",
    description: "An UNKNOWN provider observation stays UNKNOWN (never auto-promoted to FAILED or SUCCESS).",
    check: "observation.resolution.resolved === 'UNKNOWN'",
    severity: "CRITICAL",
  },
  {
    id: "approval-policy",
    kind: "APPROVAL",
    description: "Purchase above the approver's maxAmountMinor was rejected without the approval.",
    check: "unapprovedLargePurchase.status === 'REJECTED_APPROVAL_REQUIRED'",
    severity: "CRITICAL",
  },
  {
    id: "provider-unknown",
    kind: "PROVIDER_UNKNOWN",
    description: "A connector UNKNOWN response is preserved through the kernel boundary.",
    check: "connectorResponse.state === 'UNKNOWN'",
    severity: "CRITICAL",
  },
];

const STANDARD_FAILURE_CONDITIONS = [
  "BUDGET_EXCEEDED",
  "DEADLINE_MISSED",
  "QUALITY_BELOW_THRESHOLD",
  "MISSING_APPROVAL",
  "MISSING_EVIDENCE",
  "SUBSTITUTION_REJECTED",
  "DELIVERY_UNKNOWN",
] as const;

const STANDARD_UNKNOWN_CONDITIONS = [
  "SUPPLIER_QUOTE_UNKNOWN",
  "DELIVERY_OBSERVATION_UNKNOWN",
  "PAYMENT_SETTLEMENT_UNKNOWN",
] as const;

const STANDARD_BLOCKED_CONDITIONS = [
  "USER_LACKS_AUTHORITY",
  "SECURITY_BLOCK",
  "CONNECTOR_SCOPE_ABUSE",
] as const;

export function buildOutcomeOracle(manifest: ProjectManifest): OutcomeOracle {
  const template = manifest.projectTemplate;
  const industry = industryById(manifest.industryId);

  const expectedReceivedUnitsByLine = computeExpectedReceivedUnits(template);
  const expectedTotalCostMinor = computeExpectedTotalCostMinor(template);
  const expectedCapturedMinor = expectedTotalCostMinor;
  const expectedRefundedMinor = "0";

  const noRfidAssignment = noRfidAssignmentForProject(
    manifest.industryId,
    manifest.firmSize,
    manifest.namespace,
    parseInt(manifest.projectId.slice(-4), 10),
  );

  const assertions = buildAssertionsForIndustry(template, manifest.industryId);
  const failureConditions: string[] = [...STANDARD_FAILURE_CONDITIONS];
  const unknownConditions: string[] = [...STANDARD_UNKNOWN_CONDITIONS];
  const blockedConditions: string[] = [...STANDARD_BLOCKED_CONDITIONS];

  // No-RFID coverage: add the W3-004 contract assertions to supermarket
  // projects. These do NOT mark journeys successful — they assert the
  // post-journey contract state W3 must satisfy.
  if (noRfidAssignment) {
    assertions.push({
      id: `no-rfid-w3-004-scenario-${noRfidAssignment.w3_004_scenario}`,
      kind: noRfidAssertionKind(noRfidAssignment.w3_004_scenario),
      description: `W3-004 scenario ${noRfidAssignment.w3_004_scenario}: ${noRfidAssignment.name}`,
      check: JSON.stringify(noRfidAssignment.expectedContractState),
      severity: "CRITICAL",
    });
    if (noRfidAssignment.w3_004_scenario === 4) {
      unknownConditions.push("INVENTORY_COUNT_UNKNOWN");
    }
    if (noRfidAssignment.w3_004_scenario === 8) {
      blockedConditions.push("CONNECTOR_SCOPE_ABUSE");
    }
  }

  const journeyFamilyApplicability = computeJourneyFamilyApplicability(industry.applicableJourneyFamilies);

  return {
    schema: "unicom-w1-009-outcome-oracle/1",
    projectId: manifest.projectId,
    namespace: manifest.namespace,
    industryId: manifest.industryId,
    firmSize: manifest.firmSize,
    assertions,
    failureConditions,
    unknownConditions,
    blockedConditions,
    expectedState: {
      purchaseOrder: { state: "RECEIVED", outstandingUnits: 0 },
      inventory: { onHandByLine: expectedReceivedUnitsByLine },
      money: { capturedMinor: expectedCapturedMinor, refundedMinor: expectedRefundedMinor, currency: template.budget.currency },
      evidence: template.evidenceRequired,
      predictive: false,
    },
    journeyFamilyApplicability,
  };
}

function computeExpectedReceivedUnits(template: ProjectTemplate): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const line of template.purchasingList) {
    if (line.quantity.kind === "COUNT") {
      out[line.lineId] = line.quantity.units ?? 0;
    } else {
      // MEASURED lines report whole units (e.g. number of weighted-item
      // SKUs sold by weight). The on-hand count is in COUNT units.
      out[line.lineId] = 1;
    }
  }
  return out;
}

function computeExpectedTotalCostMinor(template: ProjectTemplate): string {
  let total = 0n;
  for (const line of template.purchasingList) {
    const units = line.quantity.kind === "COUNT" ? BigInt(line.quantity.units ?? 0) : 1n;
    const unitPrice = BigInt(line.unitPriceMinor);
    total += units * unitPrice;
  }
  return total.toString();
}

function buildAssertionsForIndustry(
  template: ProjectTemplate,
  industryId: string,
): OracleAssertion[] {
  const assertions: OracleAssertion[] = [...STANDARD_ASSERTIONS];

  // Add evidence assertion if the template requires >1 evidence types.
  if (template.evidenceRequired.length > 1) {
    assertions.push({
      id: "evidence-completeness",
      kind: "EVIDENCE",
      description: "All required evidence types captured (PO, delivery receipt, invoice).",
      check: `evidence.includesAll(${JSON.stringify(template.evidenceRequired)})`,
      severity: "MAJOR",
    });
  }

  // Add quality assertion if the template declares a quality threshold.
  if (template.qualityThresholds.length > 0) {
    assertions.push({
      id: "quality-threshold",
      kind: "QUALITY",
      description: `Quality ${template.qualityThresholds[0]?.dimension} ≥ ${template.qualityThresholds[0]?.min}.`,
      check: `quality.${template.qualityThresholds[0]?.dimension} >= ${template.qualityThresholds[0]?.min}`,
      severity: "MAJOR",
    });
  }

  // Add substitution assertion if any line declares a substitute.
  if (template.purchasingList.some((line) => line.substitutes.length > 0)) {
    assertions.push({
      id: "substitution-policy",
      kind: "SUBSTITUTION",
      description: "A requested substitution was applied only after explicit user authorization.",
      check: "substitution.authorizedBy === 'end-user'",
      severity: "MAJOR",
    });
  }

  // Add delivery assertion based on the template's delivery mode.
  assertions.push({
    id: "delivery-mode",
    kind: "DELIVERY",
    description: `Delivery mode ${template.delivery.mode} completed with explicit receipt.`,
    check: `delivery.mode === '${template.delivery.mode}' && delivery.receiptCaptured`,
    severity: "MAJOR",
  });

  // For supermarket industry, ensure the no-RFID + recall-related assertions
  // are present in the project's oracle coverage.
  if (industryId === "supermarkets-local-retail") {
    assertions.push({
      id: "no-rfid-required",
      kind: "RECONCILIATION",
      description: "Project does NOT require RFID hardware (per docs/SUPERMARKET-WITHOUT-RFID.md).",
      check: "manifest.requiresRfid === false || manifest.requiresRfid === undefined",
      severity: "CRITICAL",
    });
  }

  return assertions;
}

function noRfidAssertionKind(scenario: number): OracleAssertion["kind"] {
  switch (scenario) {
    case 1: return "IDEMPOTENCY";
    case 2: return "RECONCILIATION";
    case 3: return "MONEY_CONSERVATION";
    case 4: return "IDEMPOTENCY";
    case 5: return "RECONCILIATION";
    case 6: return "DELIVERY";
    case 7: return "EVIDENCE";
    case 8: return "APPROVAL";
    default: return "RECONCILIATION";
  }
}

function computeJourneyFamilyApplicability(
  industryApplicableFamilies: readonly string[],
): Readonly<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const familyId of JOURNEY_FAMILY_IDS) {
    out[familyId] = industryApplicableFamilies.includes(familyId);
  }
  return out;
}

/**
 * Compute the campaign-wide journey-family coverage map: for each of the
 * 19 mandatory journey families, count how many industry cohorts cover it.
 */
export function computeCampaignJourneyCoverage(): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const familyId of JOURNEY_FAMILY_IDS) {
    out[familyId] = 0;
  }
  for (const industry of INDUSTRIES) {
    for (const familyId of industry.applicableJourneyFamilies) {
      out[familyId] = (out[familyId] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Compute the per-industry role-family count for the role-mix table.
 */
export function computeIndustryRoleFamilyCounts(): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const industry of INDUSTRIES) {
    out[industry.id] = roleFamiliesForIndustry(industry.id).length;
  }
  return out;
}
