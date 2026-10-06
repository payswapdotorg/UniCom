/**
 * W2-005 contract-test support — shared fixtures for the Reality/Learning
 * Lab, comparison, promotion-chain and routing-policy suites.
 *
 * Everything is built with the REAL constructors from `@unicom/agent`
 * (branded types included). No production mocks: the Reality-Lab
 * environment is a sanctioned simulation double (invariant 16/39) and the
 * fixtures below only assemble REAL battery/config/chain objects.
 */

import {
  EvidenceJournal,
  type EvidenceCitation,
  type PrincipalRef,
  journalGateEvidence,
  PROMOTION_GATES,
  type PromotionGate,
  RoutingPromotionChain,
  REALITY_SCENARIO_BATTERY,
  requiredGateEnvironment,
} from "../src/index.js";

export const AT = "2026-12-01T00:00:00.000Z";
export const AT2 = "2026-12-02T00:00:00.000Z";
export const AT3 = "2026-12-03T00:00:00.000Z";
export const AT4 = "2026-12-04T00:00:00.000Z";
export const AT5 = "2026-12-05T00:00:00.000Z";
export const AT6 = "2026-12-06T00:00:00.000Z";

export const TL: PrincipalRef = { principalId: "agent:unicom:tl", kind: "agent" };

/** The full battery scenarios (the SAME battery every configuration runs). */
export function batteryScenarios() {
  return REALITY_SCENARIO_BATTERY;
}

/**
 * Advance one config through ALL promotion gates with journaled gate
 * evidence (SIMULATION from LAB, SHADOW from SHADOW, CANARY + OBSERVED_OUTCOME
 * from CANARY). Returns the gate-evidence citations in gate order.
 */
export function passAllGates(input: {
  readonly journal: EvidenceJournal;
  readonly chain: RoutingPromotionChain;
  readonly configRef: string;
  readonly digestPrefix: string;
}): readonly EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];
  const gateTimes = [AT, AT2, AT3, AT4, AT5];
  for (const [index, gate] of PROMOTION_GATES.entries()) {
    const record = journalGateEvidence({
      journal: input.journal,
      evidenceId: `evidence:gate:${input.digestPrefix}:${gate}`,
      configRef: input.configRef,
      gate,
      environment: requiredGateEnvironment(gate),
      outcome: "SUCCESS",
      observedDigest: `${input.digestPrefix}:${gate}:observed`,
      recordedAt: gateTimes[index] ?? AT,
    });
    citations.push({
      evidenceId: record.evidenceId,
      kind: record.kind,
      recordHash: record.recordHash,
    });
    const advanced = input.chain.advanceGate({
      configRef: input.configRef,
      gate,
      evidenceCitations: [citations[citations.length - 1] as EvidenceCitation],
      transitionedAt: gateTimes[index] ?? AT,
    });
    if (!advanced.ok) throw new Error(`fixture gate advance failed: ${advanced.violation}`);
  }
  return citations;
}

/** Register + pass all gates + promote (the complete happy-path fixture). */
export function fullyPromotedChain(configRef: string): {
  readonly journal: EvidenceJournal;
  readonly chain: RoutingPromotionChain;
  readonly gateCitations: readonly EvidenceCitation[];
} {
  const journal = new EvidenceJournal();
  const chain = new RoutingPromotionChain(journal);
  if (!chain.registerCandidate(configRef, AT).ok) throw new Error("fixture registration failed");
  const gateCitations = passAllGates({ journal, chain, configRef, digestPrefix: configRef });
  const promotion = chain.promote({
    configRef,
    decidedBy: TL,
    decidedAt: AT6,
    evidenceCitations: gateCitations,
  });
  if (!promotion.ok) throw new Error(`fixture promotion failed: ${promotion.violation}`);
  return { journal, chain, gateCitations };
}

/** Gate evidence with an explicit environment (for negative tests). */
export function gateEvidenceWithEnvironment(input: {
  readonly journal: EvidenceJournal;
  readonly configRef: string;
  readonly gate: PromotionGate;
  readonly environment: "LAB" | "SHADOW" | "CANARY";
  readonly evidenceId?: string;
}): EvidenceCitation {
  const record = journalGateEvidence({
    journal: input.journal,
    evidenceId: input.evidenceId ?? `evidence:gate:${input.gate}:${input.environment}`,
    configRef: input.configRef,
    gate: input.gate,
    environment: input.environment,
    outcome: "SUCCESS",
    observedDigest: `observed:${input.gate}:${input.environment}`,
    recordedAt: AT,
  });
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}
