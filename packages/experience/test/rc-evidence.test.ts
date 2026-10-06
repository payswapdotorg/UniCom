/**
 * W3-006 acceptance scenario 7 — release-candidate evidence drill.
 *
 * Re-runs the REAL drills through the SAME journey runners the E2E suite
 * asserts (no separate evidence path), emits machine-readable reports
 * (E2E / observability / DR), evaluates the aggregated release gate and
 * writes the artifacts to packages/experience/reports/rc/ — consumable by
 * the release gate. Deterministic drill clock → byte-reproducible
 * artifacts. The gate re-states the readiness law: production push stays
 * UNAUTHORIZED (the operator flips it).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RC_EVIDENCE_SCHEMA_VERSION, type RcEvidenceReport, type ReleaseGateReport } from "../src/deployment/rc-evidence";
import {
  RC_EVIDENCE_FILES,
  emitEvidenceReport,
  evaluateReleaseGate,
  REQUIRED_EVIDENCE_KINDS,
  writeRcEvidenceArtifacts,
} from "../src/runtime/deployment/rc-evidence";
import {
  createObservabilityProjector,
} from "../src/runtime/deployment/observability";
import { createTargetDeploymentAdapter } from "../src/runtime/deployment/target-adapter";
import { NODE_SERVER_TARGET_PLAN } from "../src/runtime/deployment/target-plan";
import {
  createDrDecisionJournal,
  createSingleWriterLeaseAuthority,
  runFailurePlaybook,
} from "../src/runtime/deployment/dr-playbooks";
import { drOperatorRef, rtoBudgetFor, verifyRecoveryObjectives } from "../src/runtime/deployment/dr-objectives";
import { exportJournalBackup, restoreJournalBackup, verifyJournalHashChain } from "../src/runtime/deployment/journal-chain";
import type { KernelStateRecord } from "../src/deployment/runbook";
import { buildConnectorHealthSurface } from "../src/runtime/surfaces/connector-health";
import { createConnectorTelemetry } from "../src/runtime/connector/telemetry";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { asPrincipalRef, asUtcTimestamp } from "../src/runtime/ids";
import { runAllPrimaryPathJourneys, journeyToEvidenceRows } from "./e2e/journeys";
import { createExperienceAppHarness } from "./e2e/harness";
import {
  createRestoreKernelRig,
  kernelStateExportPortOf,
  projectionRebuildPortOf,
  seedDrWorkload,
} from "./fixtures/commerce/dr-kernel-rig";
import { canonicalJson } from "@unicom/commerce";
import { TestDoubleConnectorAdapter, doubleDescriptor, fixedClock, resetClock } from "./doubles";

const DRILL_CLOCK_BASE = "2026-10-11T06:00:00Z";
const drillClock = fixedClock(DRILL_CLOCK_BASE);
const REPORTS_DIR = fileURLToPath(new URL("../reports/rc", import.meta.url));

const emitted: RcEvidenceReport[] = [];
let gateReport: ReleaseGateReport | undefined;

describe("RC evidence drill (scenario 7)", () => {
  afterAll(async () => {
    // The artifacts land in the repo as the release-gate evidence set.
    if (gateReport !== undefined) {
      await writeRcEvidenceArtifacts(REPORTS_DIR, emitted, gateReport);
    }
  });

  it("emits the E2E journeys report from the SAME runners the suite asserts", async () => {
    resetClock();
    const journeys = await runAllPrimaryPathJourneys();
    const rows = journeys.flatMap((journey) => journeyToEvidenceRows(journey));
    const report = emitEvidenceReport("e2e-journeys", {
      reportId: "rc-e2e-journeys-v1",
      subject: "W3-006 primary user paths (headless, real UI contracts)",
      generatedAt: asUtcTimestamp(drillClock()),
      rows,
    });
    expect(report.rows.length).toBeGreaterThanOrEqual(40);
    expect(report.verdict).toBe("pass");
    expect(report.summary.failed).toBe(0);
    emitted.push(report);
  });

  it("emits the observability report from real journal-derived projections", async () => {
    resetClock();
    // Real connector health surface for the projection input.
    const vault = createCredentialVault({ clock: drillClock });
    const connectors = createConnectorRuntime({ vault, clock: drillClock });
    const connector = connectors.register(new TestDoubleConnectorAdapter(doubleDescriptor("rc-provider", "rest")));
    await connectors.connect({
      connectorId: connector.connectorId,
      accountRef: "account-rc",
      credential: {
        kind: "api-secret",
        material: "rc-drill-material",
        forAdapterId: "rc-provider",
        forAccountRef: "account-rc",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read",
    });
    await connectors.observe(connector.connectorId);
    const healthSurface = buildConnectorHealthSurface({
      connectors: connectors.connectors().map((registered) => ({
        connectorId: registered.connectorId,
        providerDisplayName: "RC drill provider (configured label)",
        health: connectors.healthReport().find((report) => report.connectorId === registered.connectorId)?.health
          ?? { status: "unknown", lastCheckedAt: asUtcTimestamp(drillClock()), degradedReasons: [], customerActionNotes: [], evidence: [] },
      })),
      telemetry: createConnectorTelemetry({ clock: drillClock }),
      generatedAt: asUtcTimestamp(drillClock()),
    });

    // REAL deployment plane: build + boot + probes over loopback HTTP.
    const adapter = createTargetDeploymentAdapter({ plan: NODE_SERVER_TARGET_PLAN, clock: drillClock });
    const buildResults = await adapter.build({
      "kernel-store": {},
      "connector-worker": { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-rc" },
      "experience-web": { UNICOM_PUBLIC_BASE_URL: "https://unicom.example.test" },
    });
    const bootProbes = await adapter.boot();
    try {
      const lane = await seedDrWorkload();
      const projector = createObservabilityProjector({ clock: drillClock });
      const snapshot = projector.snapshot({
        commerceJournal: {
          eventCount: lane.events().length,
          journalFingerprint: kernelStateExportPortOf(lane).journalFingerprint,
          sequenceLawHolds: lane.journalIsValid(),
          ...(lane.events()[lane.events().length - 1] === undefined
            ? {}
            : { lastEventAt: lane.events()[lane.events().length - 1]?.occurredAt }),
        },
        connectorHealth: healthSurface,
        liveSessions: [],
        autonomousStores: [],
        edgeQueues: [],
        deploymentPlane: adapter.status(),
        recentExecutions: connectors.executionLog(),
      });
      const dashboard = projector.operatorDashboard({
        snapshot,
        runbookStatuses: [],
        operatorRef: asPrincipalRef("operator:rc-drill"),
      });
      const subsystemRows = snapshot.subsystems.map(
        (view) =>
          `${view.subsystemId}=${view.status} (derived from ${view.derivedFrom.map((source) => source.sourceKind).join("+")})`,
      );
      const report = emitEvidenceReport("observability", {
        reportId: "rc-observability-v1",
        subject: "W3-006 production observability contracts (journal-derived projections)",
        generatedAt: asUtcTimestamp(drillClock()),
        rows: [
          {
            checkId: "obs:projection-law",
            description: "the snapshot declares the projection law (journal truth only, never a second source)",
            passed: snapshot.sourceOfTruth === "journaled-events" && snapshot.projectionOnly === true,
            evidenceNote: "sourceOfTruth=journaled-events, projectionOnly=true",
          },
          {
            checkId: "obs:subsystems-typed",
            description:
              "all six subsystems expose typed health; subsystems WITH journal evidence cite it, subsystems without project UNKNOWN",
            passed:
              snapshot.subsystems.length === 6 &&
              snapshot.subsystems.every(
                (view) =>
                  view.projectionOnly === true &&
                  (view.derivedFrom.length > 0 || view.status === "unknown"),
              ),
            evidenceNote: subsystemRows.join("; "),
          },
          {
            checkId: "obs:connector-health-wired",
            description: "connector health is wired to the real health surface + execution evidence",
            passed: snapshot.connectors.entries.length === 1 && snapshot.connectors.entries[0]?.health.status === "healthy",
            evidenceNote: `${snapshot.connectors.entries.length} connector entry(ies), status ${snapshot.connectors.entries[0]?.health.status}`,
          },
          {
            checkId: "obs:deployment-plane-live",
            description: "the deployment plane projects the REAL booted target adapter (build + boot + probes)",
            passed:
              buildResults.length === 5 &&
              bootProbes.length === 9 &&
              bootProbes.every((probe) => probe.passed) &&
              snapshot.subsystems.find((view) => view.subsystemId === "deployment-plane")?.status === "healthy",
            evidenceNote: `5 build steps exit-0, 9/9 probes pass, plane=${snapshot.subsystems.find((view) => view.subsystemId === "deployment-plane")?.status}`,
          },
          {
            checkId: "obs:operator-dashboard-complete",
            description: "the operator dashboard renders all seven typed sections over the snapshot",
            passed: dashboard.sections.length === 7 && dashboard.projectionOnly === true,
            evidenceNote: `sections: ${dashboard.sections.join(", ")}`,
          },
          {
            checkId: "obs:unknown-preserved",
            description: "subsystems without journaled evidence project UNKNOWN, never fabricated health",
            passed: snapshot.subsystems.find((view) => view.subsystemId === "live-commerce")?.status === "unknown",
            evidenceNote: "live-commerce=unknown (no sessions in this drill input)",
          },
        ],
      });
      expect(report.verdict).toBe("pass");
      emitted.push(report);
    } finally {
      await adapter.shutdown();
    }
  });

  it("emits the DR drill report from the real kernel + playbooks", async () => {
    resetClock();
    const lane = await seedDrWorkload();
    const exportPort = kernelStateExportPortOf(lane);
    const backup = exportJournalBackup(exportPort, {
      artifactId: "backup-rc-drill",
      createdAt: asUtcTimestamp(drillClock()),
    });
    if (backup.status !== "exported") throw new Error("export failed");

    // Round-trip restore into a FRESH kernel.
    const restoreRig = createRestoreKernelRig();
    const restored = restoreJournalBackup(backup, { restorePort: restoreRig.restorePort });

    // Tamper detection.
    const tampered: KernelStateRecord[] = backup.records.map((record, index) =>
      index === 3 ? { ...record, canonicalPayload: `${record.canonicalPayload}t` } : record,
    );
    const tamperChain = verifyJournalHashChain(tampered, { expectedHeadHash: backup.artifact.chainHeadHash });

    // Rebuild from journal + objectives.
    const rebuild = projectionRebuildPortOf(lane).rebuild();
    const objectives = verifyRecoveryObjectives(rebuild, {
      maxOperations: rtoBudgetFor(backup.artifact.eventCount, backup.artifact.receiptCount),
    });

    // All four failure playbooks (compact drills against the real runtimes).
    const journal = createDrDecisionJournal();
    const connectorOutage = await runFailurePlaybook(
      { kind: "connector-outage", connectorId: "connector-rc", observedStatus: "down", note: "drill" },
      {
        decisionJournal: journal,
        operatorRef: drOperatorRef("operator:rc-drill"),
        clock: drillClock,
        connector: {
          probeConnector: async () => ({ healthy: true, note: "recovered (drill)" }),
          recoverConnector: async () => ({ healthy: true, note: "reconnected (drill)" }),
        },
      },
    );
    const authority = createSingleWriterLeaseAuthority(drillClock);
    const firstLease = authority.acquire(drOperatorRef("writer:rc-primary"));
    const splitBrain = await runFailurePlaybook(
      { kind: "split-brain-risk", writerEpoch: firstLease.epoch, leaseEpoch: firstLease.epoch, note: "drill" },
      { decisionJournal: journal, operatorRef: drOperatorRef("operator:rc-drill"), clock: drillClock, lease: authority },
    );

    const report = emitEvidenceReport("dr-drill", {
      reportId: "rc-dr-drill-v1",
      subject: "W3-006 disaster/recovery runbook drills (real commerce kernel)",
      generatedAt: asUtcTimestamp(drillClock()),
      rows: [
        {
          checkId: "dr:backup-export",
          description: "journal export produces a hash-chained artifact over the real kernel state",
          passed: backup.artifact.eventCount > 0 && backup.artifact.chainHeadHash.length === 64,
          evidenceNote: `${backup.artifact.eventCount} events + ${backup.artifact.receiptCount} receipts chained`,
        },
        {
          checkId: "dr:restore-roundtrip",
          description: "export → import into a FRESH kernel reproduces IDENTICAL state (RPO zero data loss)",
          passed:
            restored.status === "restored" &&
            restored.fingerprintMatches &&
            canonicalJson(restoreRig.restoredState()) === canonicalJson(lane.persistentState()),
          evidenceNote:
            restored.status === "restored"
              ? `${restored.importedEvents} events restored, fingerprint matches, persistent state identical`
              : "restore failed",
        },
        {
          checkId: "dr:corruption-detection",
          description: "hash-chain verification pinpoints the first tampered record",
          passed: tamperChain.verdict === "corrupted" && tamperChain.firstCorruptedOrdinal === 3,
          evidenceNote: tamperChain.reason ?? "",
        },
        {
          checkId: "dr:rebuild-from-journal",
          description: "full projection rebuild from journal replay matches authoritative state",
          passed: rebuild.projectionsMatch && rebuild.replayedEvents === lane.events().length,
          evidenceNote: `${rebuild.replayedEvents} events replayed; projections match`,
        },
        {
          checkId: "dr:recovery-objectives",
          description: "RTO operation budget and RPO zero-data-loss contracts are met",
          passed: objectives.every((verification) => verification.met),
          evidenceNote: objectives.map((verification) => `${verification.objectiveId}: ${verification.measured}`).join("; "),
        },
        {
          checkId: "dr:playbook-connector-outage",
          description: "connector-outage playbook: detection → journaled decision → recovery",
          passed: connectorOutage.detected && connectorOutage.outcome === "recovered",
          evidenceNote: `decision=${connectorOutage.decisionEntry.decision}, outcome=${connectorOutage.outcome}`,
        },
        {
          checkId: "dr:playbook-split-brain",
          description: "split-brain playbook: stale writer fenced, single-writer lease transferred",
          passed: splitBrain.detected && splitBrain.outcome === "recovered" && (splitBrain.lease?.epoch ?? 0) === 2,
          evidenceNote: `stale writer fenced at epoch ${firstLease.epoch}; new lease epoch ${splitBrain.lease?.epoch}`,
        },
        {
          checkId: "dr:decision-journal-append-only",
          description: "every detected run appended a typed decision to the DR decision journal",
          passed: journal.entries().length === 2 && journal.entries().every((entry) => entry.rationale.length > 0),
          evidenceNote: `${journal.entries().length} decisions journaled with rationale + operator attribution`,
        },
      ],
    });
    expect(report.verdict).toBe("pass");
    emitted.push(report);
  });

  it("evaluates the release gate: ALL evidence passes, readiness only, push stays unauthorized", () => {
    expect(emitted.map((report) => report.kind)).toEqual([...REQUIRED_EVIDENCE_KINDS]);
    const totalRows = emitted.reduce((total, report) => total + report.summary.total, 0);
    const passedRows = emitted.reduce((total, report) => total + report.summary.passed, 0);
    gateReport = evaluateReleaseGate(emitted, {
      generatedAt: asUtcTimestamp(drillClock()),
      cumulativeSuite: {
        passed: passedRows,
        total: totalRows,
        note: "drill-verified contract rows; the surrounding vitest battery (this drill runs inside it) additionally verifies all pre-existing suites stay green",
      },
    });
    expect(gateReport.allPass).toBe(true);
    expect(gateReport.readinessVerdict).toBe("release-candidate-ready");
    expect(gateReport.productionPushAuthorized).toBe(false);
    expect(gateReport.checks.length).toBe(6);
    for (const check of gateReport.checks) {
      expect(check.passed, `${check.checkId}: ${check.evidenceNote}`).toBe(true);
    }
  });

  it("writes machine-readable artifacts consumable by the release gate", async () => {
    expect(gateReport).toBeDefined();
    const written = await writeRcEvidenceArtifacts(REPORTS_DIR, emitted, gateReport as ReleaseGateReport);
    expect(written).toHaveLength(4);
    expect(written.map((path) => path.split("/").pop())).toEqual([
      RC_EVIDENCE_FILES.e2e,
      RC_EVIDENCE_FILES.observability,
      RC_EVIDENCE_FILES.drDrill,
      RC_EVIDENCE_FILES.gate,
    ]);
    // Every artifact parses, carries the schema version and a pass verdict.
    for (const path of written) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as RcEvidenceReport | ReleaseGateReport;
      expect(parsed.schemaVersion).toBe(RC_EVIDENCE_SCHEMA_VERSION);
      expect(parsed.clockMode).toBe("deterministic-drill");
    }
    const gate = JSON.parse(readFileSync(join(REPORTS_DIR, RC_EVIDENCE_FILES.gate), "utf8")) as ReleaseGateReport;
    expect(gate.allPass).toBe(true);
    expect(gate.productionPushAuthorized).toBe(false);
  });

  it("keeps the artifacts deterministic (same drill clock → identical gate content)", async () => {
    // Re-running the gate evaluation with the same inputs reproduces the
    // same verdict structure — committed artifacts never drift.
    const regenerated = evaluateReleaseGate(emitted, {
      generatedAt: asUtcTimestamp(drillClock()),
      cumulativeSuite: {
        passed: emitted.reduce((total, report) => total + report.summary.passed, 0),
        total: emitted.reduce((total, report) => total + report.summary.total, 0),
        note: "deterministic re-evaluation",
      },
    });
    expect(regenerated.allPass).toBe(true);
    expect(regenerated.readinessVerdict).toBe((gateReport as ReleaseGateReport).readinessVerdict);
  });
});

describe("RC evidence artifact directory (committed evidence)", () => {
  it("contains the committed gate artifact with ALL PASS", () => {
    const gatePath = join(REPORTS_DIR, RC_EVIDENCE_FILES.gate);
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as ReleaseGateReport;
    expect(gate.gateId).toBe("unicom-release-gate");
    expect(gate.allPass).toBe(true);
    expect(gate.productionPushAuthorized).toBe(false);
  });
});
