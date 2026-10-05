/**
 * Evidence, history and the three-truths separation
 * (FROZEN-ARCHITECTURE §3.E, §14, §15, §22.6).
 *
 * Every consequential surface must be able to show state, explanation,
 * action and history/evidence. These shared shapes make that expressible
 * without duplicating Worker 1/2 models: proof and decision objects are
 * referenced opaquely.
 */

import type { TransactionProofRef } from "./opaque-refs";
import type { UtcIso8601String } from "./values";

/** Truth classes that must never be conflated (FROZEN §22.6, §3.E). */
export type TruthClass =
  | "operational" // projection of authoritative operational state (Worker 1)
  | "observed" // physical/provider observation, not yet reconciled
  | "historical" // immutable fact about what happened
  | "predictive"; // model/Twin expectation, never operational truth

/** Kinds of evidence a surface can cite. */
export type EvidenceKind =
  | "receipt"
  | "provider-signed-state"
  | "independent-observation"
  | "verified-purchase"
  | "account-history"
  | "agent-certification"
  | "security-warning"
  | "execution-log"
  | "connector-observation"
  | "document";

/** A citable piece of evidence. Payloads live outside the model context. */
export interface EvidenceReference {
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly summary: string;
  readonly capturedAt: UtcIso8601String;
  readonly proofRef: TransactionProofRef;
  readonly sourceArtifactRefs: readonly string[];
}

/** History/evidence entry rendered on consequential surfaces. */
export interface HistoryEvent {
  readonly occurredAt: UtcIso8601String;
  readonly summary: string;
  readonly actor: string;
  readonly evidenceRefs: readonly EvidenceReference[];
}

/**
 * Proof level display registry mirroring FROZEN-ARCHITECTURE §15 (P0–P5).
 * The canonical `TransactionProof` type is owned by `@unicom/agent` (W2-001);
 * these opaque refs + labels are presentation-only.
 */
export const PROOF_LEVELS: readonly {
  readonly id: TransactionProofRef;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "P0" as TransactionProofRef, label: "P0 — assertion", description: "Stated without independent backing" },
  { id: "P1" as TransactionProofRef, label: "P1 — receipt", description: "Authenticated artifact or receipt" },
  { id: "P2" as TransactionProofRef, label: "P2 — provider-signed", description: "Provider-signed evidence" },
  { id: "P3" as TransactionProofRef, label: "P3 — independent", description: "Independent observation" },
  { id: "P4" as TransactionProofRef, label: "P4 — protected", description: "Corroboration plus economic protection" },
  { id: "P5" as TransactionProofRef, label: "P5 — final", description: "Native rail/ledger finality" },
];

/** Status of an approval/authorization requirement (UNKNOWN preserved). */
export type AuthorizationStatus =
  | "not-required"
  | "pending"
  | "granted"
  | "denied"
  | "expired"
  | "unknown";
