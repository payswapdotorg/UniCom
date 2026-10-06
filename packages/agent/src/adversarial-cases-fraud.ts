/**
 * FRAUD_ARCHETYPE adversaries of the release-gate suite (W2-006 acceptance
 * scenario 2): every battery fraud flow the system claims to catch — all
 * five archetypes in BASE form plus their CATCHABLE evasion variants —
 * executed against the REAL W2-005 Reality-Lab scenario scripts, screened by
 * the REAL W2-004 detectors, and answered by the REAL composed immune
 * response (classification → decision → reversible quarantine → scoped
 * defensive broadcast), with the response CERTIFIED (journaled + reversible).
 *
 * The declared-uncatchable evasion variants are covered by the suite-level
 * zero-silent-evasion discipline (adversarial-suite.ts), which runs the
 * complete battery flow set and journals every declared miss — a miss without
 * a declaration is a SILENT_EVASION bug and fails the suite.
 */

import { detectAllArchetypes } from "./archetype-suite.js";
import {
  journalEncounter,
  certifyImmuneResponse,
  ADVERSARIAL_COMMERCE_CAPABILITY_ID,
  ADVERSARIAL_REVIEW_CAPABILITY_ID,
  type AdversaryCase,
  type AdversarialContext,
  type AttackOutcome,
} from "./adversarial-context.js";
import type { SecuritySignal } from "./security.js";
import { allBatteryFlows, type AdversaryFlowSpec } from "./reality-battery.js";
import { batteryScenario } from "./reality-scenarios.js";
import { runRealityScenario } from "./reality-lab.js";
import { journalScenarioEvidence } from "./scenario-evidence.js";

interface FraudCaseSpec {
  readonly adversaryId: string;
  readonly flowId: string;
  readonly label: string;
  readonly description: string;
}

/**
 * The seven catchable fraud adversaries (five BASE flows + two catchable
 * EVASION variants — the ring's staggered/varied-content evasion and the
 * return-abuse sub-threshold-contradicting-claims evasion).
 */
const FRAUD_CASE_SPECS: readonly FraudCaseSpec[] = [
  {
    adversaryId: "adversary:fraud:ring-base",
    flowId: "flow:ring:base",
    label: "coordinated-review-ring",
    description:
      "FAKE_REVIEW_RING base attack: colluding authors, shared device, duplicate content, burst timing",
  },
  {
    adversaryId: "adversary:fraud:ring-staggered",
    flowId: "flow:ring:staggered",
    label: "staggered-varied-content-ring",
    description:
      "FAKE_REVIEW_RING evasion (staggered timing, varied content, honest activity mixed in) — caught by the statistical anomaly depth",
  },
  {
    adversaryId: "adversary:fraud:wrong-item-base",
    flowId: "flow:wrong-item:base",
    label: "observed-substitution",
    description: "WRONG_ITEM_SHIPMENT base attack: carrier observes the substituted item",
  },
  {
    adversaryId: "adversary:fraud:false-claim-base",
    flowId: "flow:false-claim:base",
    label: "contradicted-buyer-claim",
    description: "FALSE_BUYER_CLAIM base attack: claim contradicted by journaled purchase facts",
  },
  {
    adversaryId: "adversary:fraud:non-delivery-base",
    flowId: "flow:non-delivery:base",
    label: "false-non-delivery",
    description: "FALSE_NON_DELIVERY base attack: carrier confirms delivery at P2",
  },
  {
    adversaryId: "adversary:fraud:return-abuse-base",
    flowId: "flow:return-abuse:base",
    label: "frequency-plus-contradiction",
    description: "RETURN_REFUND_ABUSE base attack: return-frequency anomaly plus contradicting claim",
  },
  {
    adversaryId: "adversary:fraud:return-abuse-contradicting",
    flowId: "flow:return-abuse:evasion-contradicting",
    label: "sub-threshold-contradicting-claims",
    description:
      "RETURN_REFUND_ABUSE evasion (sub-threshold frequency, contradicting claims) — caught by the logical cross-evidence join",
  },
];

function flowById(flowId: string): AdversaryFlowSpec | undefined {
  return allBatteryFlows().find((flow) => flow.flowId === flowId);
}

/** Execute one fraud adversary against the REAL detectors + immune system. */
function fraudAttack(context: AdversarialContext, spec: FraudCaseSpec): AttackOutcome {
  const flow = flowById(spec.flowId);
  if (flow === undefined) {
    return { result: "MISSED_DECLARED", detail: `unknown battery flow: ${spec.flowId}` };
  }
  const scenario = batteryScenario(flow.scenarioId);
  if (scenario === undefined) {
    return { result: "MISSED_DECLARED", detail: `unknown battery scenario: ${flow.scenarioId}` };
  }

  // The adversary executes inside the REAL deterministic scenario script.
  const trajectory = runRealityScenario(scenario);
  const evidence = journalScenarioEvidence({
    journal: context.journal,
    evaluationRef: `adversary:${flow.flowId}`,
    spec: scenario,
    trajectory,
  });
  const records = flow.orderRefs.flatMap((orderRef) => evidence.recordsByOrder.get(orderRef) ?? []);

  // The REAL W2-004 detectors screen the flow's journaled evidence (the
  // same discipline evaluateAdversarialFlows applies: any detector firing
  // over the flow's evidence is a detection of that flow).
  const detection = detectAllArchetypes(records, context.at).find((result) => result.detected);
  if (detection === undefined || detection.signals.length === 0) {
    journalEncounter(context, {
      adversaryId: spec.adversaryId,
      category: "FRAUD_ARCHETYPE",
      result: "MISSED_DECLARED",
      detail: `${flow.archetype} (${flow.label}) was NOT detected — a claimed detection that cannot be proven is a FAIL`,
    });
    return {
      result: "MISSED_DECLARED",
      detail: `${flow.archetype} (${flow.label}) was NOT detected — a claimed detection that cannot be proven is a FAIL`,
    };
  }

  // Pick the first signal that classifies under a CONCRETE threat class (the
  // staggered ring surfaces as the Sybil account pattern, not REVIEW_RING).
  const classifiedIndex = detection.classifications.findIndex(
    (classification) => classification.threatClass !== "UNCLASSIFIED",
  );
  const signal = detection.signals[classifiedIndex >= 0 ? classifiedIndex : 0] as SecuritySignal;
  const citation = journalEncounter(context, {
    adversaryId: spec.adversaryId,
    category: "FRAUD_ARCHETYPE",
    result: "DETECTED",
    detail: `${flow.archetype} ${flow.variant} (${flow.label}) detected via ${detection.archetype} and answered: ${detection.rationale}`,
  });

  // The release-candidate profile surfaces statistical + cross-evidence
  // depths, so a detector catch IS a surfaced detection here.
  const isRing = flow.archetype === "FAKE_REVIEW_RING";
  const certification = certifyImmuneResponse(context, {
    adversaryId: spec.adversaryId,
    signal,
    citations: [citation],
    quarantineCapabilityIds: [
      isRing ? ADVERSARIAL_REVIEW_CAPABILITY_ID : ADVERSARIAL_COMMERCE_CAPABILITY_ID,
    ],
    broadcastCapabilityDefinitionId: isRing
      ? ADVERSARIAL_REVIEW_CAPABILITY_ID
      : ADVERSARIAL_COMMERCE_CAPABILITY_ID,
  });

  return {
    result: "DETECTED",
    detail: `${flow.archetype} (${flow.label}): detected → decision ${certification.decisionAction} → ${certification.quarantinedPrincipalIds.length} principal(s) quarantined on [${certification.attenuatedCapabilityIds.join(", ")}] → defensive broadcast to ${certification.broadcastAudienceCount} recipient(s) → reversal ${certification.reversalProven ? "proven" : "FAILED"}`,
    immuneCertification: certification,
  };
}

/** The FRAUD_ARCHETYPE release-gate adversaries (all expected DETECTED). */
export const FRAUD_ADVERSARIES: readonly AdversaryCase[] = FRAUD_CASE_SPECS.map((spec) => ({
  adversaryId: spec.adversaryId,
  category: "FRAUD_ARCHETYPE" as const,
  label: spec.label,
  description: spec.description,
  expected: "DETECTED" as const,
  attack: (context: AdversarialContext) => fraudAttack(context, spec),
}));
