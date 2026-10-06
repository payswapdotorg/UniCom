/**
 * W3-006 DR contract tests — failure-mode playbooks (acceptance scenario 5):
 * every failure mode has a TESTED path detection → journaled decision →
 * recovery action → verification, wired to the REAL runtimes:
 *
 * - connector-outage  → the real ConnectorRuntime + a clearly-marked
 *   TEST DOUBLE provider whose API is down until a reconnect clears it;
 * - pod-loss          → the real node-server target adapter (terminate +
 *   restart + readiness-gated probes over real loopback HTTP);
 * - journal-corruption→ the real commerce kernel backup (hash-chain detects
 *   the tamper; the corrupted artifact is quarantined and NEVER imported;
 *   recovery restores the last-known-good and rebuilds from the journal);
 * - split-brain-risk  → the single-writer fencing lease (stale-epoch
 *   writers are fenced out — the kernel's single-writer law).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConnectorAdapterDescriptor } from "../src/runtime/connector/adapter";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { asConnectorInstanceId } from "../src/runtime/ids";
import type { DrDetectionSignal, DrPlaybookRunRecord } from "../src/deployment/runbook";
import {
  DR_PLAYBOOKS,
  createDrDecisionJournal,
  createSingleWriterLeaseAuthority,
  runFailurePlaybook,
} from "../src/runtime/deployment/dr-playbooks";
import { drOperatorRef } from "../src/runtime/deployment/dr-objectives";
import {
  exportJournalBackup,
  restoreJournalBackup,
  verifyJournalHashChain,
} from "../src/runtime/deployment/journal-chain";
import {
  NODE_SERVER_TARGET_PLAN,
} from "../src/runtime/deployment/target-plan";
import {
  createTargetDeploymentAdapter,
  type TargetDeploymentAdapter,
} from "../src/runtime/deployment/target-adapter";
import type { BackupExportResult, KernelStateRecord } from "../src/deployment/runbook";
import {
  createRestoreKernelRig,
  kernelStateExportPortOf,
  projectionRebuildPortOf,
  seedDrWorkload,
} from "./fixtures/commerce/dr-kernel-rig";
import { CommerceKernelLane } from "./fixtures/commerce/kernel-rig";
import { TestDoubleConnectorAdapter, doubleDescriptor, fixedUtcClock, resetClock } from "./doubles";
import { FencedWriterViolation } from "../src/deployment/runbook";

const CLOCK_BASE = "2026-10-09T08:00:00Z";
const CLOCK = fixedUtcClock(CLOCK_BASE);
const OPERATOR = drOperatorRef("operator:dr-drill");

/**
 * TEST DOUBLE provider — its API is DOWN until a reconnect clears the
 * outage (models a provider-side outage that a reconnect resolves). The
 * connector RUNTIME under test is the real one.
 */
class FlappingProviderAdapter extends TestDoubleConnectorAdapter {
  private providerDown = false;

  constructor(descriptor: ConnectorAdapterDescriptor) {
    super(descriptor);
  }

  /** The provider-side outage event (external world breaks). */
  breakProvider(): void {
    this.providerDown = true;
  }

  override async connect(...args: Parameters<TestDoubleConnectorAdapter["connect"]>) {
    const outcome = await super.connect(...args);
    this.providerDown = false;
    return outcome;
  }

  override async probeHealth(): Promise<{ status: "healthy" | "down"; degradedReasons?: string[] }> {
    return this.providerDown
      ? { status: "down", degradedReasons: ["provider API unreachable (TEST DOUBLE outage)"] }
      : { status: "healthy" };
  }
}

describe("DR playbook: connector outage (detection → journaled decision → recovery)", () => {
  beforeEach(() => resetClock());

  it("recovers a down connector through the real connector runtime", async () => {
    const vault = createCredentialVault({ clock: fixedUtcClock(CLOCK_BASE) });
    const runtime = createConnectorRuntime({ vault, clock: fixedUtcClock(CLOCK_BASE) });
    const adapter = new FlappingProviderAdapter(doubleDescriptor("dr-flap", "rest"));
    const connector = runtime.register(adapter);
    const connectorId = connector.connectorId;
    await runtime.connect({
      connectorId,
      accountRef: "account-dr",
      credential: {
        kind: "api-secret",
        material: "dr-drill-material",
        forAdapterId: "dr-flap",
        forAccountRef: "account-dr",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read",
    });
    // The healthy baseline.
    const before = await runtime.observe(connectorId);
    expect(before.health.status).toBe("healthy");

    // The outage: the provider goes down.
    adapter.breakProvider();
    const outage = await runtime.observe(connectorId);
    expect(outage.health.status).toBe("down");

    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "connector-outage", connectorId, observedStatus: "down", note: "provider API unreachable" },
      {
        decisionJournal: journal,
        operatorRef: OPERATOR,
        clock: CLOCK,
        connector: {
          probeConnector: async (id) => {
            const observed = await runtime.observe(asConnectorInstanceId(id));
            return {
              healthy: observed.health.status === "healthy",
              note: `health status: ${observed.health.status}`,
            };
          },
          recoverConnector: async (id) => {
            const cid = asConnectorInstanceId(id);
            await runtime.disconnect(cid);
            await runtime.connect({
              connectorId: cid,
              accountRef: "account-dr",
              credential: {
                kind: "api-secret",
                material: "dr-drill-material-refreshed",
                forAdapterId: "dr-flap",
                forAccountRef: "account-dr",
              },
              grantedPermissions: ["orders.read"],
              credentialScope: "orders.read",
            });
            const observed = await runtime.observe(cid);
            return {
              healthy: observed.health.status === "healthy",
              note: `reconnected; health status: ${observed.health.status}`,
            };
          },
        },
      },
    );

    expect(run.detected).toBe(true);
    expect(run.outcome).toBe("recovered");
    expect(run.decisionEntry.decision).toBe("isolate-and-recover");
    expect(run.actions).toHaveLength(1);
    expect(run.actions[0]).toMatchObject({ actionKind: "probe-connector-health", succeeded: true });
    // The decision was JOURNALED (append-only record of the recovery).
    expect(journal.entries()).toHaveLength(1);
    expect(journal.entries()[0]?.runId).toBe(run.runId);
    expect(journal.entries()[0]?.operatorRef).toBe(OPERATOR);
  });

  it("does NOT fire for UNKNOWN or degraded connectors (UNKNOWN ≠ outage)", async () => {
    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "connector-outage", connectorId: "connector-x", observedStatus: "unknown", note: "probe never settled" },
      { decisionJournal: journal, operatorRef: OPERATOR, clock: CLOCK },
    );
    expect(run.detected).toBe(false);
    expect(run.outcome).toBe("not-applicable");
    expect(run.actions).toEqual([]);
    // No decision is journaled for a non-event.
    expect(journal.entries()).toHaveLength(0);
  });
});

describe("DR playbook: pod loss (detection → journaled decision → recovery)", () => {
  let adapter: TargetDeploymentAdapter;

  beforeEach(() => {
    adapter = createTargetDeploymentAdapter({ plan: NODE_SERVER_TARGET_PLAN, clock: CLOCK });
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  it("detects a lost service and recovers it through restart + readiness probes", async () => {
    await adapter.build({
      "kernel-store": {},
      "connector-worker": { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-1" },
      "experience-web": { UNICOM_PUBLIC_BASE_URL: "https://unicom.example.test" },
    });
    await adapter.boot();
    await adapter.terminateService("kernel-store");
    const deadProbe = await adapter.probe("kernel-store", "probe:kernel-store:liveness");
    expect(deadProbe.httpStatus).toBe("connection-failed");

    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "pod-loss", serviceId: "kernel-store", probeOutcome: "connection-failed", note: "process lost" },
      {
        decisionJournal: journal,
        operatorRef: OPERATOR,
        clock: CLOCK,
        deployment: {
          restartService: async (serviceId) => {
            const probes = await adapter.restartService(serviceId);
            return {
              probesPassed: probes.every((probe) => probe.passed),
              note: `${probes.filter((probe) => probe.passed).length}/${probes.length} probes pass after restart`,
            };
          },
          probeService: async (serviceId) => {
            const probes = (await adapter.probeAll()).filter((probe) => probe.serviceId === serviceId);
            return {
              probesPassed: probes.length > 0 && probes.every((probe) => probe.passed),
              note: `${probes.filter((probe) => probe.passed).length}/${probes.length} probes pass`,
            };
          },
        },
      },
    );

    expect(run.detected).toBe(true);
    expect(run.outcome).toBe("recovered");
    expect(run.decisionEntry.decision).toBe("restart-service");
    expect(run.actions[0]).toMatchObject({ actionKind: "restart-service", succeeded: true });
    expect(journal.entries()).toHaveLength(1);
    expect(adapter.status().allReady).toBe(true);
  });
});

describe("DR playbook: journal corruption (detection → journaled decision → recovery)", () => {
  it("quarantines the corrupted backup, restores last-known-good, rebuilds from journal", async () => {
    const lane: CommerceKernelLane = await seedDrWorkload();
    const goodBackup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-good",
      createdAt: CLOCK(),
    });
    if (goodBackup.status !== "exported") throw new Error("export failed");

    // The corrupted copy: a payload is tampered with after export.
    const corruptedRecords: KernelStateRecord[] = goodBackup.records.map((record, index) =>
      index === 2 ? { ...record, canonicalPayload: record.canonicalPayload.replace("1", "9") } : record,
    );
    const corruptedBackup: BackupExportResult = {
      status: "exported",
      artifact: goodBackup.artifact,
      records: corruptedRecords,
    };
    const chain = verifyJournalHashChain(corruptedRecords, {
      expectedHeadHash: goodBackup.artifact.chainHeadHash,
    });
    expect(chain.verdict).toBe("corrupted");

    const quarantined: string[] = [];
    const journal = createDrDecisionJournal();
    let restoreRig = createRestoreKernelRig();
    const run = await runFailurePlaybook(
      { kind: "journal-corruption", chain, note: "nightly backup artifact failed chain verification" },
      {
        decisionJournal: journal,
        operatorRef: OPERATOR,
        clock: CLOCK,
        backup: {
          quarantineArtifact: async (note) => {
            quarantined.push(note);
            return { succeeded: true, note: "artifact moved to quarantine (never imported)" };
          },
          restoreLastKnownGood: async () => {
            restoreRig = createRestoreKernelRig();
            const result = restoreJournalBackup(goodBackup, { restorePort: restoreRig.restorePort });
            if (result.status !== "restored") {
              return { restored: false, fingerprintMatches: false, note: `restore failed: ${result.status}` };
            }
            return {
              restored: true,
              fingerprintMatches: result.fingerprintMatches,
              note: `restored ${result.importedEvents} events, fingerprint ${result.fingerprintMatches ? "matches" : "DIVERGES"}`,
            };
          },
          rebuildProjections: async () => projectionRebuildPortOf(lane).rebuild(),
        },
      },
    );

    expect(run.detected).toBe(true);
    expect(run.outcome).toBe("recovered");
    expect(run.decisionEntry.decision).toBe("quarantine-and-restore");
    expect(quarantined).toHaveLength(1);
    expect(run.actions.map((action) => action.actionKind)).toEqual([
      "quarantine-backup",
      "restore-last-known-good",
      "rebuild-projections",
    ]);
    expect(run.actions.every((action) => action.succeeded)).toBe(true);
    // The restored kernel reproduces the source state byte-for-byte.
    expect(restoreRig.restoredJournalIsValid()).toBe(true);
    expect(journal.entries()).toHaveLength(1);
  });

  it("does not fire for an intact chain (no corruption, no decision)", async () => {
    const lane = await seedDrWorkload();
    const backup = exportJournalBackup(kernelStateExportPortOf(lane), {
      artifactId: "backup-intact",
      createdAt: CLOCK(),
    });
    if (backup.status !== "exported") throw new Error("export failed");
    const chain = verifyJournalHashChain(backup.records);
    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "journal-corruption", chain, note: "routine verification" },
      { decisionJournal: journal, operatorRef: OPERATOR, clock: CLOCK },
    );
    expect(run.detected).toBe(false);
    expect(run.outcome).toBe("not-applicable");
    expect(journal.entries()).toHaveLength(0);
  });
});

describe("DR playbook: split-brain avoidance (single-writer fencing lease)", () => {
  it("fences a stale-epoch writer and transfers the lease to the operator", async () => {
    const authority = createSingleWriterLeaseAuthority(CLOCK);
    const firstLease = authority.acquire(drOperatorRef("writer:primary"));
    expect(firstLease.epoch).toBe(1);

    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "split-brain-risk", writerEpoch: firstLease.epoch, leaseEpoch: firstLease.epoch, note: "old primary still writing after failover" },
      {
        decisionJournal: journal,
        operatorRef: OPERATOR,
        clock: CLOCK,
        lease: authority,
      },
    );

    expect(run.detected).toBe(true);
    expect(run.outcome).toBe("recovered");
    expect(run.decisionEntry.decision).toBe("fence-stale-writer");
    expect(run.actions.map((action) => action.actionKind)).toEqual([
      "acquire-single-writer-lease",
      "fence-stale-writer",
    ]);
    expect(run.lease?.epoch).toBe(2);
    // The new lease is the ONLY writable identity…
    expect(() => authority.assertWritable(firstLease.leaseId)).toThrow(FencedWriterViolation);
    expect(() => authority.assertWritable(run.lease?.leaseId ?? "")).not.toThrow();
    // …and the stale writer is explicitly fenced.
    expect(authority.fenceStaleWriter(1).fenced).toBe(true);
    expect(journal.entries()).toHaveLength(1);
  });

  it("does not fire for a writer ABOVE the current epoch (not stale)", async () => {
    const authority = createSingleWriterLeaseAuthority(CLOCK);
    authority.acquire(drOperatorRef("writer:primary"));
    const journal = createDrDecisionJournal();
    const run = await runFailurePlaybook(
      { kind: "split-brain-risk", writerEpoch: 5, leaseEpoch: 1, note: "epoch above lease" },
      { decisionJournal: journal, operatorRef: OPERATOR, clock: CLOCK, lease: authority },
    );
    expect(run.detected).toBe(false);
    expect(run.outcome).toBe("not-applicable");
  });

  it("keeps the lease law: release ends writability, re-acquire advances the epoch", () => {
    const authority = createSingleWriterLeaseAuthority(CLOCK);
    const lease = authority.acquire(drOperatorRef("writer:a"));
    authority.release(lease.leaseId);
    expect(() => authority.assertWritable(lease.leaseId)).toThrow(FencedWriterViolation);
    const next = authority.acquire(drOperatorRef("writer:b"));
    expect(next.epoch).toBe(lease.epoch + 1);
    expect(next.active).toBe(true);
  });
});

describe("DR playbook registry (runbook as code)", () => {
  it("covers exactly the four failure modes with decision + actions + verification", () => {
    expect(DR_PLAYBOOKS.map((playbook) => playbook.failureModeId)).toEqual([
      "connector-outage",
      "pod-loss",
      "journal-corruption",
      "split-brain-risk",
    ]);
    for (const playbook of DR_PLAYBOOKS) {
      expect(playbook.detection.failureModeId).toBe(playbook.failureModeId);
      expect(playbook.recoveryActions.length).toBeGreaterThan(0);
      expect(playbook.verification.length).toBeGreaterThan(0);
      expect(playbook.decisionRationale.length).toBeGreaterThan(0);
    }
  });

  it("detection rules accept ONLY their own signal kind (closed unions)", () => {
    const signals: DrDetectionSignal[] = [
      { kind: "connector-outage", connectorId: "c", observedStatus: "down", note: "n" },
      { kind: "pod-loss", serviceId: "s", probeOutcome: "connection-failed", note: "n" },
      { kind: "journal-corruption", chain: { verdict: "corrupted", recordsVerified: 1 }, note: "n" },
      { kind: "split-brain-risk", writerEpoch: 1, leaseEpoch: 1, note: "n" },
    ];
    for (const playbook of DR_PLAYBOOKS) {
      const foreign = signals.filter((signal) => signal.kind !== playbook.failureModeId);
      for (const signal of foreign) {
        expect(playbook.detection.detects(signal)).toBe(false);
      }
      const own = signals.find(
        (signal): signal is Extract<DrDetectionSignal, { kind: typeof playbook.failureModeId }> =>
          signal.kind === playbook.failureModeId,
      );
      if (own !== undefined) expect(playbook.detection.detects(own)).toBe(true);
    }
  });

  it("requires the matching recovery executors — never runs half-wired", async () => {
    const journal = createDrDecisionJournal();
    await expect(
      runFailurePlaybook(
        { kind: "pod-loss", serviceId: "kernel-store", probeOutcome: "connection-failed", note: "n" },
        { decisionJournal: journal, operatorRef: OPERATOR, clock: CLOCK },
      ),
    ).rejects.toThrow(/requires deployment recovery executors/);
  });

  it("records every run with a typed run id and detection note", async () => {
    const journal = createDrDecisionJournal();
    const run: DrPlaybookRunRecord = await runFailurePlaybook(
      { kind: "connector-outage", connectorId: "c1", observedStatus: "degraded", note: "partial" },
      { decisionJournal: journal, operatorRef: OPERATOR, clock: CLOCK },
    );
    expect(run.runId).toMatch(/^dr-run-/);
    expect(run.detectionNote).toContain("UNKNOWN");
  });
});
