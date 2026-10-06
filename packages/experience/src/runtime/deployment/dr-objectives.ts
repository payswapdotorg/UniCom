/**
 * DR recovery objectives + operator runbook statuses (W3-006 §Scope 4).
 *
 * Recovery-time and recovery-point objectives expressed as TESTABLE
 * contracts: the RTO budget bounds the operations a full projection rebuild
 * may consume (deterministic — no wall clocks in the battery), and the RPO
 * contract is zero data loss (rebuilt projections must match authoritative
 * state byte-for-byte via fingerprints).
 */

import type {
  DrPlaybookRunRecord,
  DrRunbookStatusView,
  ProjectionRebuildPort,
  ProjectionRebuildResult,
  RecoveryObjectiveVerification,
} from "../../deployment/runbook";
import type { PrincipalRef } from "../../common/opaque-refs";
import { asPrincipalRef } from "../ids";
import { DR_PLAYBOOKS } from "./dr-playbooks";

/**
 * RTO budget: the rebuild must complete within 2× the state size (journal
 * replay + twin fold) plus the structural comparison of the projection
 * collections and operational slack — all deterministic operation counts.
 */
export function rtoBudgetFor(eventCount: number, receiptCount: number): number {
  return 2 * (eventCount + receiptCount) + 48;
}

/** Verify the recovery objectives against a real rebuild result. */
export function verifyRecoveryObjectives(
  rebuild: ProjectionRebuildResult,
  budget: { readonly maxOperations: number },
): readonly RecoveryObjectiveVerification[] {
  return [
    {
      objectiveId: "rto-rebuild-budget",
      met: rebuild.operationsConsumed <= budget.maxOperations,
      measured: `${rebuild.operationsConsumed} operations consumed (budget ${budget.maxOperations})`,
    },
    {
      objectiveId: "rpo-zero-data-loss",
      met: rebuild.projectionsMatch,
      measured: `projections ${rebuild.projectionsMatch ? "match" : "diverge from"} authoritative state (fingerprint ${rebuild.projectionFingerprint.slice(0, 12)}…)`,
    },
  ];
}

/** Operator-dashboard statuses for every registered playbook. */
export function runbookStatusesOf(
  runs: readonly DrPlaybookRunRecord[],
  objectiveVerifications: readonly RecoveryObjectiveVerification[] = [],
): readonly DrRunbookStatusView[] {
  return DR_PLAYBOOKS.map((playbook) => {
    const lastRun = runs.find((run) => run.failureModeId === playbook.failureModeId);
    return {
      failureModeId: playbook.failureModeId,
      playbookPresent: true,
      ...(lastRun === undefined ? {} : { lastRun }),
      objectiveVerifications,
    };
  });
}

/** Operator principal helper (the runbook's decisions are attributed). */
export const drOperatorRef = (ref: string): PrincipalRef => asPrincipalRef(ref);

/** Re-export for the runtime barrel. */
export type { ProjectionRebuildPort };
