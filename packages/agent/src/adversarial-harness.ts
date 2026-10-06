/**
 * The adversarial-suite certification harness (W2-006): assembles the REAL
 * system-under-certification the release-gate adversaries attack —
 * - ONE hash-chained evidence journal;
 * - the release-candidate subject measured against the frozen Reality-Lab
 *   battery (runBatteryForSubject — the shared battery digest);
 * - a lab-gated immune system with ALL its logic promoted + activated through
 *   the W2-003 evidence-bearing promotion discipline (no un-promoted paths);
 * - a battery-pinned unified promotion chain (LAB gate evidence must carry
 *   the shared battery digest);
 * - a provenance-carrying opportunity graph backed by hash-verified lab
 *   promotions;
 * - the actor-capability ledger with its canonical vocabulary, one position
 *   and one canonical grant (no ambient authority anywhere).
 *
 * Deterministic: fixed explicit timestamps, the frozen battery and frozen
 * catalogs produce identical state on replay.
 */

import { EvidenceJournal } from "./evidence-journal.js";
import {
  immuneLabCandidates,
  SecurityImmuneSystem,
  UNICOM_IMMUNE_LOGIC,
} from "./immune-system.js";
import {
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  UNICOM_COORDINATION_LOGIC,
  type LabCandidate,
  type LabLogicKind,
  type PromotionRecord,
} from "./lab-promotion.js";
import type { ExperimentKind, ObservedOutcomeEvidence } from "./experiment.js";
import { OpportunityGraph } from "./opportunity-graph.js";
import { ActorCapabilityLedger, type OrganizationPosition } from "./actor-capability.js";
import type { CapabilityDefinition } from "./capability/capability.js";
import { REALITY_SCENARIO_BATTERY } from "./reality-scenarios.js";
import { releaseCandidateConfiguration, runBatteryForSubject } from "./promotion-battery.js";
import { UnifiedPromotionChain } from "./unified-promotion-chain.js";
import {
  ADVERSARY_HARNESS_PRINCIPAL,
  ADVERSARIAL_COMMERCE_CAPABILITY_ID,
  ADVERSARIAL_GROUPBUY_CAPABILITY_ID,
  ADVERSARIAL_REVIEW_CAPABILITY_ID,
  type AdversarialContext,
} from "./adversarial-context.js";

const HARNESS_VOCABULARY: readonly CapabilityDefinition[] = [
  {
    capabilityDefinitionId: ADVERSARIAL_COMMERCE_CAPABILITY_ID,
    name: "Commerce Command Seam",
    supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
    transportNeutral: true,
  },
  {
    capabilityDefinitionId: ADVERSARIAL_REVIEW_CAPABILITY_ID,
    name: "Review Posting",
    supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
    transportNeutral: true,
  },
  {
    capabilityDefinitionId: ADVERSARIAL_GROUPBUY_CAPABILITY_ID,
    name: "Group-Buy Coordination",
    supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
    transportNeutral: true,
  },
];

function promoteLabLogic(
  log: LabPromotionLog,
  logicId: string,
  kind: LabLogicKind,
  at: string,
): PromotionRecord {
  if (log.findCandidate(logicId) === undefined) {
    const candidate: LabCandidate = {
      logicId,
      kind,
      version: "v1",
      description: `adversarial-suite certification harness: ${logicId}`,
      registeredAt: at,
    };
    log.registerCandidate(candidate);
  }
  const kinds: readonly ExperimentKind[] = [
    "REPLAY",
    "ADVERSARIAL_EVALUATION",
    "SIMULATION",
    "SHADOW",
  ];
  for (const [index, experimentKind] of kinds.entries()) {
    log.recordExperiment({
      experimentId: `experiment:adv-suite:${logicId}:${index}`,
      kind: experimentKind,
      subjectRef: logicId,
      hypothesis: `${experimentKind} of ${logicId}`,
      successCriteria: ["deterministic", "invariant-clean"],
      rollbackPlan: { triggerConditions: ["regression"], retirementSteps: ["disable-logic"] },
    });
  }
  const evidence: readonly ObservedOutcomeEvidence[] = kinds.map((experimentKind, index) => ({
    evidenceId: `evidence:adv-suite-lab:${logicId}:${index}`,
    experimentId: `experiment:adv-suite:${logicId}:${index}`,
    experimentKind,
    environment: experimentKind === "SIMULATION" ? "LAB" : "SHADOW",
    outcome: "SUCCESS",
    observedAt: at,
  }));
  const outcome = log.promote({
    logicId,
    evidence,
    decidedBy: ADVERSARY_HARNESS_PRINCIPAL,
    decidedAt: at,
  });
  if (!outcome.ok) throw new Error(`harness lab promotion failed: ${outcome.violation}`);
  return outcome.record;
}

/**
 * Assemble the certification harness (see the module doc). The context is the
 * single shared state every adversary attacks.
 */
export function buildAdversarialContext(input: {
  readonly journal?: EvidenceJournal;
  readonly at?: string;
}): AdversarialContext {
  const at = input.at ?? "2026-12-10T00:00:00.000Z";
  const at2 = "2026-12-11T00:00:00.000Z";
  const journal = input.journal ?? new EvidenceJournal();

  // 1. The release-candidate subject measured against the frozen battery.
  const battery = runBatteryForSubject({
    journal,
    subjectType: "MODEL",
    subjectRef: "release-candidate",
    at,
  });

  // 2. The lab-gated immune system with ALL its logic promoted + activated.
  const log = new LabPromotionLog();
  for (const candidate of immuneLabCandidates(at)) log.registerCandidate(candidate);
  const registry = new LabGatedRuntimeRegistry(log);
  const graphPromotions: PromotionRecord[] = [];
  for (const [logicId, kind] of [
    [UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION, "DETECTION"],
    [UNICOM_IMMUNE_LOGIC.ARCHETYPE_DETECTION, "DETECTION"],
    [UNICOM_IMMUNE_LOGIC.QUARANTINE_ATTENUATION, "ATTENUATION"],
    [UNICOM_IMMUNE_LOGIC.DEFENSIVE_BROADCAST, "BROADCAST"],
    [UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION, "FORMATION"],
  ] as const) {
    const record = promoteLabLogic(log, logicId, kind, at);
    const activation = registry.activate(record.promotionId);
    if (!activation.ok) throw new Error(`harness activation failed: ${activation.violation}`);
    graphPromotions.push(record);
  }

  // 3. The actor-capability ledger (one position, one canonical grant).
  const ledger = new ActorCapabilityLedger(HARNESS_VOCABULARY);
  const position: OrganizationPosition = {
    positionId: "position:adv:harness",
    organizationId: "org:adv:harness",
    title: "Adversarial harness operator",
    holder: { principalId: ADVERSARY_HARNESS_PRINCIPAL.principalId, kind: "main-agent" },
    grantorRef: ADVERSARY_HARNESS_PRINCIPAL,
  };
  ledger.registerPosition(position);
  const granted = ledger.grant({
    grant: {
      grantId: `grant:adv:${ADVERSARIAL_COMMERCE_CAPABILITY_ID}:${ADVERSARY_HARNESS_PRINCIPAL.principalId}`,
      positionId: position.positionId,
      capabilityDefinitionId: ADVERSARIAL_COMMERCE_CAPABILITY_ID,
      grantedBy: ADVERSARY_HARNESS_PRINCIPAL,
      authorization: {
        decision: "AUTHORIZED",
        decidedBy: ADVERSARY_HARNESS_PRINCIPAL,
        policyVersion: "adv-v1",
        decidedAt: at,
      },
      grantedAt: at,
    },
  });
  if (!granted.valid) throw new Error("harness capability grant failed");

  // 4. The immune system (capability holders resolved from the ledger).
  const immune = new SecurityImmuneSystem({
    policy: { policyVersion: "release-adversarial-v1", blockThresholdBps: 8_500 },
    runtimeRegistry: registry,
    capabilityVocabulary: HARNESS_VOCABULARY,
    capabilityHolders: (capabilityDefinitionId) =>
      ledger
        .holdersOfCapability(capabilityDefinitionId)
        .map((principalId) => ({ principalId, kind: "agent" as const })),
    now: () => at,
  });

  // 5. The battery-pinned unified promotion chain.
  const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });

  return {
    journal,
    at,
    at2,
    batteryDigest: battery.batteryDigest,
    battery,
    immune,
    chain,
    graph: new OpportunityGraph(),
    graphPromotions,
    vocabulary: HARNESS_VOCABULARY,
    ledger,
    configuration: releaseCandidateConfiguration(),
    scenarios: REALITY_SCENARIO_BATTERY,
  };
}
