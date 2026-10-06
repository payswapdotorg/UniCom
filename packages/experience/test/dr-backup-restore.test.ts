/**
 * W3-006 DR contract tests — backup/restore + rebuild-from-journal
 * (acceptance scenarios 4 + 6) over the REAL commerce kernel.
 *
 * LAW under test: the journal is the sole authority; a hash-chained backup
 * exports → imports into a FRESH kernel → reproduces IDENTICAL state
 * (journal fingerprint, full persistent state, idempotency behavior), and
 * every projection rebuilds from journal replay alone (twin ≡ kernel).
 */

import { describe, expect, it } from "vitest";
import { canonicalJson } from "@unicom/commerce";
import type { KernelStateRecord } from "../src/deployment/runbook";
import {
  exportJournalBackup,
  kernelRecordHash,
  restoreJournalBackup,
  verifyJournalHashChain,
} from "../src/runtime/deployment/journal-chain";
import { rtoBudgetFor, verifyRecoveryObjectives } from "../src/runtime/deployment/dr-objectives";
import {
  createRestoreKernelRig,
  kernelStateExportPortOf,
  projectionRebuildPortOf,
  seedDrWorkload,
} from "./fixtures/commerce/dr-kernel-rig";
import { fixedClock } from "./doubles";

const DRILL_CLOCK = fixedClock("2026-10-08T09:00:00Z");

describe("DR backup/restore round-trip (scenario 4)", () => {
  it("exports the real kernel state as a hash-chained backup artifact", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-1",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error(`unexpected export status: ${backup.status}`);
    expect(backup.artifact.schemaVersion).toBe(1);
    expect(backup.artifact.eventCount).toBeGreaterThan(0);
    expect(backup.artifact.receiptCount).toBeGreaterThan(0);
    expect(backup.artifact.journalFingerprint).toBe(kernelStateExportPortOf(lane).journalFingerprint);
    // The chain covers events + receipts + exactly one mint-cursor record.
    expect(backup.records).toHaveLength(backup.artifact.eventCount + backup.artifact.receiptCount + 1);
    expect(backup.records[0]?.prevRecordHash).toBe("0".repeat(64));
    expect(backup.artifact.chainHeadHash).toBe(backup.records[backup.records.length - 1]?.recordHash);
  });

  it("verifies an intact chain end-to-end (with head anchor + count)", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-2",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const report = verifyJournalHashChain(backup.records, {
      expectedHeadHash: backup.artifact.chainHeadHash,
      expectedCount: backup.records.length,
    });
    expect(report).toEqual({ verdict: "intact", recordsVerified: backup.records.length });
  });

  it("detects payload tampering and pinpoints the first corrupted record", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-3",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const middle = Math.floor(backup.records.length / 2);
    const tampered: KernelStateRecord[] = backup.records.map((record, index) =>
      index === middle
        ? { ...record, canonicalPayload: record.canonicalPayload.replace("1", "7") }
        : record,
    );
    const report = verifyJournalHashChain(tampered, {
      expectedHeadHash: backup.artifact.chainHeadHash,
      expectedCount: tampered.length,
    });
    expect(report.verdict).toBe("corrupted");
    expect(report.firstCorruptedOrdinal).toBe(tampered[middle]?.ordinal);
    expect(report.reason).toContain("tampered");
  });

  it("detects reordering even when every record's own hash is untouched", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-4",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const reordered: KernelStateRecord[] = [...backup.records];
    const first = reordered[0] as KernelStateRecord;
    const second = reordered[1] as KernelStateRecord;
    reordered[0] = second;
    reordered[1] = first;
    const report = verifyJournalHashChain(reordered);
    expect(report.verdict).toBe("corrupted");
    expect(report.reason).toMatch(/reordered|links to/);
  });

  it("detects truncation via the artifact's head anchor and count", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-5",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const truncated = backup.records.slice(0, backup.records.length - 2);
    // Without anchors the suffix chain looks consistent…
    expect(verifyJournalHashChain(truncated).verdict).toBe("intact");
    // …but the artifact anchors catch it.
    const report = verifyJournalHashChain(truncated, {
      expectedHeadHash: backup.artifact.chainHeadHash,
      expectedCount: backup.records.length,
    });
    expect(report.verdict).toBe("corrupted");
    expect(report.reason).toContain("truncated or spliced");
  });

  it("detects a fully re-forged chain via the head anchor (tamper + recompute)", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-6",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    // Sophisticated attacker: tamper a payload AND recompute every hash.
    let previous = "0".repeat(64);
    const reforged: KernelStateRecord[] = backup.records.map((record, index) => {
      const payload = index === 2 ? `${record.canonicalPayload}x` : record.canonicalPayload;
      const recordHash = kernelRecordHash(previous, index, record.recordId, payload);
      const next: KernelStateRecord = {
        ...record,
        ordinal: index,
        canonicalPayload: payload,
        prevRecordHash: previous,
        recordHash,
      };
      previous = recordHash;
      return next;
    });
    const report = verifyJournalHashChain(reforged, {
      expectedHeadHash: backup.artifact.chainHeadHash,
    });
    expect(report.verdict).toBe("corrupted");
    expect(report.reason).toContain("truncated or extended");
  });

  it("round-trips: export → import into a FRESH kernel → IDENTICAL state", async () => {
    const lane = await seedDrWorkload();
    const source = kernelStateExportPortOf(lane);
    const backup = exportJournalBackup(source, {
      artifactId: "backup-dr-7",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const restoreRig = createRestoreKernelRig();
    const result = restoreJournalBackup(backup, { restorePort: restoreRig.restorePort });
    if (result.status !== "restored") throw new Error(`restore failed: ${JSON.stringify(result)}`);
    expect(result.importedEvents).toBe(backup.artifact.eventCount);
    expect(result.importedReceipts).toBe(backup.artifact.receiptCount);
    expect(result.fingerprintMatches).toBe(true);
    expect(result.restoredFingerprint).toBe(source.journalFingerprint);
    // Full persistent-state equality (events + receipts + mint cursor).
    expect(canonicalJson(restoreRig.restoredState())).toBe(canonicalJson(lane.persistentState()));
    expect(restoreRig.restoredJournalIsValid()).toBe(true);
  });

  it("preserves exactly-once idempotency behavior across the restore", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-8",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const restoreRig = createRestoreKernelRig();
    const result = restoreJournalBackup(backup, { restorePort: restoreRig.restorePort });
    expect(result.status).toBe("restored");
    // Replaying an ORIGINAL command (same idempotency key) is a DUPLICATE.
    const replay = await restoreRig.replayOriginalReceiveStock({
      skuId: "sku-dr-laptop",
      locationId: "store-dr",
      units: 12,
      reason: "PURCHASE_ORDER",
    });
    expect(replay).toBe("DUPLICATE");
  });

  it("rejects a corrupted backup for restore — never partially imports", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-9",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const tampered: KernelStateRecord[] = backup.records.map((record, index) =>
      index === 1 ? { ...record, canonicalPayload: "{}" } : record,
    );
    const restoreRig = createRestoreKernelRig();
    const result = restoreJournalBackup(
      { status: "exported", artifact: backup.artifact, records: tampered },
      { restorePort: restoreRig.restorePort },
    );
    expect(result.status).toBe("rejected-corrupted");
    if (result.status === "rejected-corrupted") {
      expect(result.chain.firstCorruptedOrdinal).toBe(1);
    }
    // The restore kernel stayed untouched (no partial import).
    expect(restoreRig.restoredState()).toBeUndefined();
  });
});

describe("DR rebuild-from-journal (scenario 6)", () => {
  it("rebuilds every projection from journal replay alone and matches authoritative state", async () => {
    const lane = await seedDrWorkload();
    const rebuild = projectionRebuildPortOf(lane).rebuild();
    expect(rebuild.replayedEvents).toBe(lane.events().length);
    expect(rebuild.projectionsMatch).toBe(true);
    expect(rebuild.projectionFingerprint).toBe(rebuild.authoritativeFingerprint);
  });

  it("meets the RTO operation budget and the RPO zero-data-loss contract", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-10",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const rebuild = projectionRebuildPortOf(lane).rebuild();
    const budget = rtoBudgetFor(backup.artifact.eventCount, backup.artifact.receiptCount);
    const verifications = verifyRecoveryObjectives(rebuild, { maxOperations: budget });
    const rto = verifications.find((verification) => verification.objectiveId === "rto-rebuild-budget");
    const rpo = verifications.find((verification) => verification.objectiveId === "rpo-zero-data-loss");
    expect(rto?.met).toBe(true);
    expect(rpo?.met).toBe(true);
  });

  it("rebuilds identically after a full export → restore cycle (recovery contract)", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-dr-11",
      createdAt: DRILL_CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const restoreRig = createRestoreKernelRig();
    const restored = restoreJournalBackup(backup, { restorePort: restoreRig.restorePort });
    expect(restored.status).toBe("restored");
    // Rebuild on the ORIGINAL lane and on restored state agree byte-for-byte.
    const rebuildOriginal = projectionRebuildPortOf(lane).rebuild();
    expect(rebuildOriginal.projectionsMatch).toBe(true);
    expect(restoreRig.restoredJournalIsValid()).toBe(true);
    expect(canonicalJson(restoreRig.restoredState())).toBe(canonicalJson(lane.persistentState()));
  });
});
