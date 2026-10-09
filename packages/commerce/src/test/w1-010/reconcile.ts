/**
 * TEST-ONLY W1-010 — manifest↔execution reconciliation.
 *
 * Every scheduled project must trace to a manifest inventory (the W1-009
 * portfolio generator for the campaign; the W3-009 local-dev fixture for
 * the pilot); no fabricated projects; and the count law
 *
 *     planned = executed + blocked + skipped      (drift 0)
 *
 * must reconcile per firm AND overall, with the manifest inventory
 * disclosed per firm (executed-in-scope vs out-of-scope inventory).
 */
import type {
  CampaignScheduleInput,
  FirmReconciliationRow,
  JourneyEvidenceRecordInput,
  OverallReconciliationRow,
} from "./types.js";

/** A firm's manifest inventory (independent of the schedules). */
export interface FirmInventoryEntry {
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: string;
  readonly projectIds: readonly string[];
}

export interface ReconcileResult {
  readonly perFirm: readonly FirmReconciliationRow[];
  readonly overall: OverallReconciliationRow;
}

export function reconcileManifestExecution(args: {
  readonly schedules: readonly CampaignScheduleInput[];
  readonly records: readonly JourneyEvidenceRecordInput[];
  readonly inventory: readonly FirmInventoryEntry[];
}): ReconcileResult {
  // The manifest inventory: every scheduled project must trace here.
  const inventoryIds = new Set<string>();
  const inventoryByFirm = new Map<string, FirmInventoryEntry>();
  for (const firm of args.inventory) {
    inventoryByFirm.set(firm.firmId, firm);
    for (const id of firm.projectIds) inventoryIds.add(id);
  }

  // Scheduled projects by firm (across all schedules / cohorts).
  const scheduledByFirm = new Map<string, typeof args.schedules[number]["projects"][number][]>();
  for (const schedule of args.schedules) {
    for (const project of schedule.projects) {
      const list = scheduledByFirm.get(project.firmId) ?? [];
      list.push(project);
      scheduledByFirm.set(project.firmId, list);
    }
  }

  // Every firm appearing anywhere (inventory or schedule) gets a row.
  const firmIds = new Set<string>([...inventoryByFirm.keys(), ...scheduledByFirm.keys()]);
  const rows: FirmReconciliationRow[] = [];
  const untraced: string[] = [];
  let totalPlanned = 0;
  let totalExecuted = 0;
  let totalBlocked = 0;
  let totalSkipped = 0;
  let totalInventory = 0;

  for (const firmId of [...firmIds].sort()) {
    const inventory = inventoryByFirm.get(firmId);
    const scheduled = scheduledByFirm.get(firmId) ?? [];
    const planned = scheduled.length;
    const executed = scheduled.filter((p) => p.status === "executed").length;
    const blocked = scheduled.filter((p) => p.status === "blocked").length;
    const skipped = scheduled.filter((p) => p.status === "skipped").length;
    const drift = planned - (executed + blocked + skipped);
    const traced = scheduled.every((p) => inventoryIds.has(p.projectId));
    if (!traced) {
      untraced.push(...scheduled.filter((p) => !inventoryIds.has(p.projectId)).map((p) => p.projectId));
    }
    const inventoryCount = inventory?.projectIds.length ?? 0;
    totalInventory += inventoryCount;
    totalPlanned += planned;
    totalExecuted += executed;
    totalBlocked += blocked;
    totalSkipped += skipped;
    rows.push({
      firmId,
      industry: inventory?.industry ?? scheduled[0]?.industry ?? "",
      firmSize: inventory?.firmSize ?? scheduled[0]?.firmSize ?? "",
      manifestInventoryProjects: inventoryCount,
      planned,
      executed,
      blocked,
      skipped,
      drift,
      reconciled: drift === 0,
      manifestTraced: traced,
      outOfScopeProjects: Math.max(0, inventoryCount - planned),
    });
  }

  // Records must reference only scheduled projects (no orphan records).
  const scheduledIds = new Set<string>();
  for (const schedule of args.schedules) {
    for (const project of schedule.projects) scheduledIds.add(project.projectId);
  }
  const fabricated = args.records
    .map((record) => record.projectId)
    .filter((projectId) => !scheduledIds.has(projectId));
  const uniqueFabricated = [...new Set(fabricated)].sort();

  const overallDrift = totalPlanned - (totalExecuted + totalBlocked + totalSkipped);
  const overall: OverallReconciliationRow = {
    firms: rows.length,
    firmsReconciled: rows.filter((row) => row.reconciled && row.manifestTraced).length,
    manifestInventoryProjects: totalInventory,
    planned: totalPlanned,
    executed: totalExecuted,
    blocked: totalBlocked,
    skipped: totalSkipped,
    drift: overallDrift,
    reconciled: overallDrift === 0 && untraced.length === 0 && uniqueFabricated.length === 0,
    untracedProjectIds: untraced.sort(),
    fabricatedProjectIds: uniqueFabricated,
  };

  return { perFirm: rows, overall };
}

/**
 * Status-transition legality (append-only): scheduled → executed|blocked|
 * skipped, never back, never cross-transitioning. Verified against the
 * executed schedules (the end state) via the block/evidence pointers.
 */
export function statusTransitionLegality(schedule: CampaignScheduleInput): readonly string[] {
  const violations: string[] = [];
  for (const project of schedule.projects) {
    if (project.status === "executed" && typeof project.evidenceRecordId !== "string") {
      violations.push(`${project.projectId}: executed without evidenceRecordId`);
    }
    if ((project.status === "blocked" || project.status === "skipped") && typeof project.blockReason !== "string") {
      violations.push(`${project.projectId}: ${project.status} without blockReason`);
    }
    if (project.status === "scheduled") {
      violations.push(`${project.projectId}: still scheduled in an executed schedule`);
    }
  }
  return violations;
}
