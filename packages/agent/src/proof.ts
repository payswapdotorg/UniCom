/**
 * Transaction proof contracts (FROZEN-ARCHITECTURE §15; invariants 22/23).
 *
 * Proof levels P0..P5. The proof level for a consequential action is
 * selected BEFORE execution: the only sanctioned way to attach proof to a
 * consequential commerce submission is a ProofPinnedAction produced by
 * pinProofSelection(). Trust never substitutes for proof.
 */

import type { EvidenceReference, PrincipalRef } from "./common.js";
import { type DecisionImpact } from "./common.js";

/** Explicit proof-level enum: P0 assertion … P5 native rail/ledger finality. */
export const ProofLevel = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
  P4: "P4",
  P5: "P5",
} as const;
export type ProofLevel = (typeof ProofLevel)[keyof typeof ProofLevel];

export const PROOF_LEVELS: readonly ProofLevel[] = ["P0", "P1", "P2", "P3", "P4", "P5"];

export interface ProofLevelDefinition {
  readonly level: ProofLevel;
  readonly label: string;
  readonly description: string;
}

export const PROOF_LEVEL_DEFINITIONS: readonly ProofLevelDefinition[] = [
  { level: "P0", label: "assertion", description: "bare assertion without an artifact" },
  { level: "P1", label: "authenticated artifact/receipt", description: "authenticated artifact or receipt" },
  { level: "P2", label: "provider-signed evidence", description: "evidence signed by the executing provider" },
  { level: "P3", label: "independent observation", description: "observation independent of the transacting parties" },
  { level: "P4", label: "corroboration + economic protection", description: "corroboration plus bond or other economic protection" },
  { level: "P5", label: "native rail/ledger finality", description: "native rail or ledger finality" },
];

export function proofLevelRank(level: ProofLevel): number {
  const index = PROOF_LEVELS.indexOf(level);
  if (index < 0) throw new Error(`unknown proof level: ${level}`);
  return index;
}

/** The minimum acceptable proof level for a class of action. */
export interface ProofRequirement {
  readonly minimumLevel: ProofLevel;
  readonly rationale: string;
}

/** A proof level chosen BEFORE consequential execution. */
export interface ProofSelection {
  readonly selectedLevel: ProofLevel;
  readonly selectedAt: string;
  readonly requirement: ProofRequirement;
  readonly selectorRef: PrincipalRef;
}

/** Verified transaction proof. Never constructible from trust records. */
export interface TransactionProof {
  readonly proofId: string;
  readonly level: ProofLevel;
  readonly evidence: readonly EvidenceReference[];
  readonly verifiedAt: string;
}

/**
 * Branded pin attaching a pre-selected proof level to a proposed action.
 * Only pinProofSelection() constructs this shape.
 */
export interface ProofPinnedAction {
  readonly actionRef: string;
  readonly proofSelection: ProofSelection;
  readonly proofPinned: "ProofPinnedAction";
}

/** Pin the proof selection for a proposed action; the level must meet the requirement. */
export function pinProofSelection(actionRef: string, selection: ProofSelection): ProofPinnedAction {
  if (typeof actionRef !== "string" || actionRef.length === 0) {
    throw new Error("invalid actionRef");
  }
  if (proofLevelRank(selection.selectedLevel) < proofLevelRank(selection.requirement.minimumLevel)) {
    throw new Error(
      `selected proof level ${selection.selectedLevel} is below the required minimum ${selection.requirement.minimumLevel}`,
    );
  }
  return { actionRef, proofSelection: selection, proofPinned: "ProofPinnedAction" };
}

/** Input for the deterministic required-proof-level mapping. */
export interface RequiredProofLevelInput {
  readonly impact: DecisionImpact;
  readonly counterpartyExposure?: boolean;
  readonly settlementFinality?: boolean;
}

/**
 * Deterministically derive the minimum required proof level for an action
 * class. Native settlement finality demands P5; irreversibility demands
 * corroboration with economic protection (P4); counterparty exposure bumps
 * the base level by one.
 */
export function determineRequiredProofLevel(input: RequiredProofLevelInput): ProofLevel {
  if (input.settlementFinality === true) return "P5";
  const base: ProofLevel =
    input.impact === "LOW" ? "P0"
      : input.impact === "MEDIUM" ? "P1"
        : input.impact === "HIGH" ? "P2"
          : "P4";
  if (input.counterpartyExposure === true) {
    const bumped = Math.min(proofLevelRank(base) + 1, proofLevelRank("P4"));
    return PROOF_LEVELS[bumped] as ProofLevel;
  }
  return base;
}
