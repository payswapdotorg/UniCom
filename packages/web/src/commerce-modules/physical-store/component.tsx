/**
 * physical-store component — the J16 surface (lazily loaded).
 *
 * The no-RFID supermarket: barcode scanning, manual entry, weighted goods and
 * CSV imports feed OBSERVATIONS; an offline queue holds them locally
 * (visible, superseded-able, never promoted) until a deterministic replay
 * hands them to the kernel; POS syncs apply sold units; canonical stock moves
 * only through reconciliation outcomes (PROMOTED / DISCREPANCY_HOLD /
 * DISCREPANCY_NEGATIVE / NOT_PROMOTED_UNKNOWN). No RFID identifier or device
 * is ever required or requested.
 *
 * Split for the oxlint max-lines gate (pure code motion, zero behavior
 * change): the seed + queue types live in ./seed.ts, the count-capture /
 * offline-queue / POS-sync sections in ./component-parts.tsx. This file
 * remains the module's public surface (module.ts imports it).
 */

import type { JSX } from "react";


import { useState } from "react";
import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  CountObservationKind,
  InventoryCountObservation,
  ObservationSourceType,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  DemoTag,
  EventTrail,
  StatusChip,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  DEMO_COUNT_POLICY,
  MARKET_LOCATION,
  PHYSICAL_FIXTURES_ID,
  PHYSICAL_SKUS,
  STORE_STAFF_ACTOR,
  SUPPLIER_DELIVERY_NOTES,
  seededOfflineObservation,
} from "./fixtures.js";
import { seedPhysicalStoreDemo, type KernelRun, type QueuedCount } from "./seed.js";
import {
  CountCaptureSection,
  OfflineQueueSection,
  PosSyncSection,
} from "./component-parts.js";

export default function PhysicalStoreComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedPhysicalStoreDemo);
  const { version, refresh } = useRefresh();
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedCount[]>(() => [
    { localId: "queued-1", observation: seededOfflineObservation(), via: "seeded offline scan" },
  ]);
  const [captureLog, setCaptureLog] = useState<readonly { readonly skuId: string; readonly counted: number }[]>([]);

  const runCommand: KernelRun = async (actor, payload, opts) => {
    const outcome = await runtime!.run(actor, payload, opts);
    setLastOutcome(outcome);
    refresh();
    return outcome;
  };

  if (runtime === null) {
    return (
      <section className="cm-stack">
        <div className="cm-card" role="status" aria-live="polite" data-testid="cm-loading">
          <h1 className="cm-card-title">J16 · Physical store</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (opening shelf stock at the demo market)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const levelOf = (skuId: string) =>
    view.level(makeId<"SkuId">(skuId), MARKET_LOCATION)?.onHand ?? 0;

  const buildObservation = (
    suffix: string,
    skuId: string,
    kind: CountObservationKind,
    sourceType: ObservationSourceType,
    counted: number,
  ): InventoryCountObservation => ({
    observationId: makeId<"ObservationId">(runtime.nextId(`obs-${suffix}`)),
    kind,
    skuId: makeId<"SkuId">(skuId),
    locationId: MARKET_LOCATION,
    observedAt: runtime.now,
    source: { sourceType, sourceRef: `${sourceType.toLowerCase()}-demo-1` },
    resolution: { resolved: "OBSERVED", value: counted },
  });

  const capture = async (via: string, observation: InventoryCountObservation): Promise<void> => {
    if (offline) {
      setQueue((current) => [
        ...current,
        { localId: `queued-${current.length + 1}`, observation, via },
      ]);
      setCaptureLog((current) => [
        ...current,
        { skuId: observation.skuId, counted: observation.resolution.resolved === "OBSERVED" ? observation.resolution.value : 0 },
      ]);
      return;
    }
    setCaptureLog((current) => [
      ...current,
      { skuId: observation.skuId, counted: observation.resolution.resolved === "OBSERVED" ? observation.resolution.value : 0 },
    ]);
    await runCommand(STORE_STAFF_ACTOR, {
      type: "RECONCILE_COUNT_OBSERVATION",
      observation,
      policy: DEMO_COUNT_POLICY,
    });
  };

  const replayQueue = async (): Promise<void> => {
    for (const item of queue) {
      // Sequential, deterministic replay: each observation reconciles against
      // the canonical level as it stands at ITS turn — later counts
      // deterministically supersede earlier promotions within tolerance.
      await runCommand(STORE_STAFF_ACTOR, {
        type: "RECONCILE_COUNT_OBSERVATION",
        observation: item.observation,
        policy: DEMO_COUNT_POLICY,
      });
    }
    setQueue([]);
  };

  const latestCounted = (skuId: string): number | undefined => {
    const entry = [...captureLog].reverse().find((log) => log.skuId === skuId);
    return entry?.counted;
  };

  const conflictingSkus = new Set(
    PHYSICAL_SKUS.filter((sku) => {
      const values = queue
        .filter((item) => item.observation.skuId === sku.skuId)
        .map((item) => (item.observation.resolution.resolved === "OBSERVED" ? item.observation.resolution.value : -1));
      return new Set(values).size > 1;
    }).map((sku) => sku.skuId),
  );

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J16 · Physical store — the no-RFID supermarket</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Harbor Lane Market (demo corner shop). Barcode scanning, manual entry, weighted goods
          and CSV imports — plus POS syncs and an offline observation queue with deterministic
          replay — built from committed fixtures <code>{PHYSICAL_FIXTURES_ID}</code>. Canonical
          stock moves ONLY through reconciliation outcomes; an observation by itself never
          changes shelf truth.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              setLastOutcome(null);
              setOffline(false);
              setQueue([{ localId: "queued-1", observation: seededOfflineObservation(), via: "seeded offline scan" }]);
              setCaptureLog([]);
              reset();
            }}
          >
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live POS or provider
          </span>
        </div>
        <div className="cm-card">
          <div className="cm-row">
            <h3 className="cm-card-title">No-RFID capability (by construction)</h3>
            <span className="cm-chip cm-chip-ok">READY</span>
          </div>
          <p className="cm-card-sub">
            This supermarket runs entirely without RFID: barcode, manual, weigh-station and CSV
            paths cover every flow below. No RFID identifier or device is ever required,
            requested or assumed — including at receiving, counting and checkout.
          </p>
        </div>
      </section>

      <CountCaptureSection
        host={host}
        offline={offline}
        setOffline={setOffline}
        capture={capture}
        buildObservation={buildObservation}
        lastOutcome={lastOutcome}
      />

      <OfflineQueueSection
        host={host}
        queue={queue}
        conflictingSkus={conflictingSkus}
        replayQueue={replayQueue}
        setQueue={setQueue}
      />

      <PosSyncSection host={host} runCommand={runCommand} runtime={runtime} />

      <section aria-label="Count truths">
        <h2 className="cm-section-title">The four count truths, kept separate</h2>
        <div className="cm-stack">
          {PHYSICAL_SKUS.map((sku) => {
            const supplierSaid = SUPPLIER_DELIVERY_NOTES.find((note) => note.skuId === sku.skuId)?.units;
            const scanned = latestCounted(sku.skuId);
            const records = view
              .allReconciliationRecords()
              .filter((record) => record.skuId === sku.skuId);
            return (
              <div key={sku.skuId} className="cm-journey-item">
                <span className="cm-journey-name">{sku.skuId}</span>
                <span className="cm-env-note">
                  {sku.title} · {fmtMoney(demoMoney(sku.priceMinor))}
                  {sku.unit ? `/${sku.unit} (weighed)` : ""}
                </span>
                <span className="cm-journey-summary">
                  expected {levelOf(sku.skuId)} · scanned {scanned ?? "—"} · supplier said{" "}
                  {supplierSaid ?? "—"} ·{" "}
                  {records.length > 0
                    ? records.map((record) => (
                        <StatusChip key={record.reconciliationRecordId} status={record.disposition} />
                      ))
                    : "reconciled: none yet"}
                </span>
              </div>
            );
          })}
          <p className="cm-card-sub">
            Expected = canonical on-hand (kernel). Scanned/measured = the latest captured count
            (log on this screen). Supplier said = the delivery-note quantity (fixture
            observation). Reconciled = the kernel&apos;s recorded dispositions — until one
            exists, nothing is claimed.
          </p>
        </div>
      </section>

      <section aria-label="Reconciliation records">
        <h2 className="cm-section-title">Reconciliation records (every observation, judged)</h2>
        <div className="cm-stack">
          {view.allReconciliationRecords().length === 0 ? (
            <p className="cm-card-sub">No reconciliation records yet — nothing has been promoted.</p>
          ) : (
            view.allReconciliationRecords().map((record) => (
              <div key={record.reconciliationRecordId} className="cm-journey-item">
                <span className="cm-journey-name">{record.reconciliationRecordId}</span>
                <StatusChip status={record.disposition} note="Reconciliation disposition (deterministic)" />
                <span className="cm-env-note">
                  {record.skuId} · observation {record.observationId} ·{" "}
                  {record.varianceUnits !== undefined ? `variance ${record.varianceUnits}` : "no variance recorded"} ·{" "}
                  {record.recordedAt}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section aria-label="Canonical shelf stock">
        <h2 className="cm-section-title">Canonical shelf stock (the demo market)</h2>
        <div className="cm-stack">
          {view
            .allLevels()
            .filter((level) => level.locationId === MARKET_LOCATION)
            .map((level) => (
              <div key={level.skuId} className="cm-journey-item">
                <span className="cm-journey-name">{level.skuId}</span>
                <span className="cm-chip cm-chip-muted">on hand {level.onHand}</span>
                <span className="cm-chip cm-chip-muted">reserved {level.reserved}</span>
                <span className="cm-env-note">
                  revision {level.revision} · updated {level.updatedAt}
                </span>
              </div>
            ))}
        </div>
      </section>

      <section aria-label="Audit trail">
        <h2 className="cm-section-title">Audit trail (append-only journal)</h2>
        <EventTrail
          events={runtime
            .events()
            .slice(-20)
            .map((event) => ({
              kind: event.kind,
              subjectId: event.subject.subjectId,
              at: event.occurredAt,
            }))}
          limit={20}
        />
      </section>
    </div>
  );
}
