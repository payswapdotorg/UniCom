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
 */

import type { JSX } from "react";


import { useState } from "react";
import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  CountObservationKind,
  InventoryCountObservation,
  ObservationSourceType,
  PrincipalRef,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR, DemoCommerceRuntime, demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  DemoTag,
  EventTrail,
  PermissionBoundary,
  StatusChip,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  DEMO_COUNT_POLICY,
  MARKET_LOCATION,
  OPENING_STOCK,
  PHYSICAL_FIXTURES_ID,
  PHYSICAL_SKUS,
  STORE_STAFF_ACTOR,
  SUPPLIER_DELIVERY_NOTES,
  seededOfflineObservation,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

/** One locally queued offline observation (pre-kernel by design). */
interface QueuedCount {
  readonly localId: string;
  readonly observation: InventoryCountObservation;
  readonly via: string;
}

async function seedPhysicalStoreDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();
  for (const line of OPENING_STOCK) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(line.skuId),
      locationId: MARKET_LOCATION,
      units: line.units,
      reason: "MANUAL",
    });
  }
  return runtime;
}

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

      <section aria-label="Count capture">
        <h2 className="cm-section-title">Count stock — four no-RFID paths</h2>
        <div className="cm-stack">
          <div className="cm-row">
            <label className="cm-env-note" htmlFor="cm-offline-mode">
              <input
                id="cm-offline-mode"
                type="checkbox"
                aria-label="Simulate offline mode (queue observations locally)"
                checked={offline}
                onChange={(event) => setOffline(event.target.checked)}
              />{" "}
              Simulate offline mode (captures queue locally — never promoted until replay)
            </label>
          </div>
          <div className="cm-row">
            <PermissionBoundary host={host} permission="receiving.count-stock">
              <ConfirmableAction
                actionLabel="Scan barcode — sourdough loaf (count 28)"
                confirmLabel="Capture now"
                statement="A barcode scan of the bread shelf: 28 loaves counted against the barcode path (no RFID). Online it reconciles immediately; offline it queues locally first."
                onExecute={() => {
                  void capture(
                    "barcode scan",
                    buildObservation("barcode-bread", "sku-phys-bread", "BARCODE_COUNT", "SCANNER", 28),
                  );
                }}
              />
              <ConfirmableAction
                actionLabel="Manual count — house blend coffee (15)"
                confirmLabel="Capture now"
                statement="A staff walk-through count: 15 coffee bags on the shelf. Manual entry is a first-class no-RFID path."
                onExecute={() => {
                  void capture(
                    "manual count",
                    buildObservation("manual-coffee", "sku-phys-coffee", "EMPLOYEE_COUNT", "EMPLOYEE", 15),
                  );
                }}
              />
              <ConfirmableAction
                actionLabel="Weigh-station count — apples, per kg (49)"
                confirmLabel="Capture now"
                statement="The weigh-station reports 49 weighed units of apples (priced per kg — the scale is a SCALE observation source, not an RFID reader)."
                onExecute={() => {
                  void capture(
                    "weigh station",
                    buildObservation("weigh-apples", "sku-phys-apples", "CYCLE_COUNT", "SCALE", 49),
                  );
                }}
              />
              <ConfirmableAction
                actionLabel="CSV import line — oat milk (23)"
                confirmLabel="Capture now"
                statement="One row of a stocktake CSV: 23 oat milks. CSV import is an IMPORT_FILE observation source — data, never a trusted instruction."
                onExecute={() => {
                  void capture(
                    "CSV import",
                    buildObservation("csv-oatmilk", "sku-phys-oatmilk", "CYCLE_COUNT", "IMPORT_FILE", 23),
                  );
                }}
              />
              <ConfirmableAction
                actionLabel="Manual recount — sourdough loaf (29)"
                confirmLabel="Capture now"
                statement="A second, later manual recount of the bread shelf: 29 loaves. Captured offline together with the barcode scan it makes the conflict visible in the queue below."
                onExecute={() => {
                  void capture(
                    "manual recount",
                    buildObservation("manual-bread-2", "sku-phys-bread", "EMPLOYEE_COUNT", "EMPLOYEE", 29),
                  );
                }}
              />
            </PermissionBoundary>
          </div>
          {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
        </div>
      </section>

      <section aria-label="Offline queue">
        <h2 className="cm-section-title">Offline observation queue (local, not canonical)</h2>
        <div className="cm-stack">
          {queue.length === 0 ? (
            <p className="cm-card-sub">The offline queue is empty — every captured count has been replayed.</p>
          ) : (
            queue.map((item) => {
              const counted = item.observation.resolution.resolved === "OBSERVED" ? item.observation.resolution.value : -1;
              const conflicting = conflictingSkus.has(item.observation.skuId);
              return (
                <div key={item.localId} className="cm-journey-item">
                  <span className="cm-journey-name">{item.localId}</span>
                  <StatusChip
                    status="QUEUED_OFFLINE"
                    note="Captured while offline — has NOT changed canonical stock and may be superseded"
                  />
                  {conflicting ? (
                    <StatusChip
                      status="CONFLICTING_OBSERVATIONS"
                      note="Two queued counts disagree for this SKU — both are kept; replay reconciles each against canonical stock in order"
                    />
                  ) : null}
                  <span className="cm-journey-summary">
                    {item.observation.skuId} · counted {counted} · via {item.via} ·{" "}
                    {item.observation.source.sourceType}
                  </span>
                  <span className="cm-env-note">
                    queued, NOT promoted — it has not changed canonical stock and may be superseded
                  </span>
                </div>
              );
            })
          )}
          {queue.length > 0 ? (
            <div className="cm-row">
              <PermissionBoundary host={host} permission="receiving.count-stock">
                <ConfirmableAction
                  actionLabel="Replay offline queue now"
                  confirmLabel="Replay the whole queue"
                  statement={`Hands every queued observation (${queue.length}) to the kernel in order as RECONCILE_COUNT_OBSERVATION commands — each is judged against canonical stock as it stands at its turn; later counts supersede earlier promotions deterministically.`}
                  onExecute={() => {
                    void replayQueue();
                  }}
                />
                <button
                  type="button"
                  className="cm-button"
                  onClick={() => setQueue([])}
                >
                  Discard offline queue (safe exit)
                </button>
              </PermissionBoundary>
            </div>
          ) : null}
          <p className="cm-card-sub">
            Conflict visibility: when two queued counts disagree for a SKU, both stay visible with
            a CONFLICTING_OBSERVATIONS marker — nothing is silently merged. Replay reconciles
            each in order; the journal records every disposition.
          </p>
        </div>
      </section>

      <section aria-label="POS sync">
        <h2 className="cm-section-title">POS sync — sold units leave stock deterministically</h2>
        <div className="cm-stack">
          <div className="cm-row">
            <PermissionBoundary host={host} permission="orders.process">
              <ConfirmableAction
                actionLabel="Apply POS sync — sourdough loaves sold 6"
                confirmLabel="Apply POS sync"
                statement="Hands RECONCILE_POS_SYNC to the kernel: the till reports 6 loaves sold since the last sync; a POS delta is a receipt-backed economic fact and applies deterministically."
                onExecute={() => {
                  void runCommand(STORE_STAFF_ACTOR, {
                    type: "RECONCILE_POS_SYNC",
                    observation: {
                      observationId: makeId<"ObservationId">(runtime.nextId("obs-pos-bread")),
                      kind: "POS_SYNC",
                      skuId: makeId<"SkuId">("sku-phys-bread"),
                      locationId: MARKET_LOCATION,
                      observedAt: runtime.now,
                      source: { sourceType: "POS", sourceRef: "pos-demo-till-1" },
                      resolution: { resolved: "OBSERVED", value: { unitsSold: 6 } },
                    },
                  });
                }}
              />
              <button
                type="button"
                className="cm-button"
                onClick={() => {
                  void runCommand(STORE_STAFF_ACTOR, {
                    type: "RECONCILE_POS_SYNC",
                    observation: {
                      observationId: makeId<"ObservationId">(runtime.nextId("obs-pos-bread-neg")),
                      kind: "POS_SYNC",
                      skuId: makeId<"SkuId">("sku-phys-bread"),
                      locationId: MARKET_LOCATION,
                      observedAt: runtime.now,
                      source: { sourceType: "POS", sourceRef: "pos-demo-till-1" },
                      resolution: { resolved: "OBSERVED", value: { unitsSold: 999 } },
                    },
                  });
                }}
              >
                Try POS sync beyond stock (see the discrepancy)
              </button>
            </PermissionBoundary>
          </div>
          <p className="cm-card-sub">
            A POS delta that would drive canonical stock negative is a DISCREPANCY_NEGATIVE —
            never a negative level, never a silent clamp, never a silent failure.
          </p>
        </div>
      </section>

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
