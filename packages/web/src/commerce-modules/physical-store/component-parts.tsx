/**
 * physical-store presentational parts — split out of component.tsx for
 * the oxlint max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * The four no-RFID count-capture paths (with the offline-mode toggle), the
 * local offline observation queue (with conflict visibility and the
 * deterministic replay) and the POS-sync panel; composed by component.tsx,
 * which remains the module's public surface.
 */

import type { JSX } from "react";

import type { Dispatch, SetStateAction } from "react";
import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  CountObservationKind,
  InventoryCountObservation,
  ObservationSourceType,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { DemoCommerceRuntime } from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import { MARKET_LOCATION, STORE_STAFF_ACTOR } from "./fixtures.js";
import type { KernelRun, QueuedCount } from "./seed.js";

export function CountCaptureSection({
  host,
  offline,
  setOffline,
  capture,
  buildObservation,
  lastOutcome,
}: {
  readonly host: CommerceHostServices;
  readonly offline: boolean;
  readonly setOffline: Dispatch<SetStateAction<boolean>>;
  readonly capture: (via: string, observation: InventoryCountObservation) => Promise<void>;
  readonly buildObservation: (
    suffix: string,
    skuId: string,
    kind: CountObservationKind,
    sourceType: ObservationSourceType,
    counted: number,
  ) => InventoryCountObservation;
  readonly lastOutcome: CommandExecution | null;
}): JSX.Element {
  return (
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
  );
}

export function OfflineQueueSection({
  host,
  queue,
  conflictingSkus,
  replayQueue,
  setQueue,
}: {
  readonly host: CommerceHostServices;
  readonly queue: readonly QueuedCount[];
  readonly conflictingSkus: ReadonlySet<string>;
  readonly replayQueue: () => Promise<void>;
  readonly setQueue: Dispatch<SetStateAction<QueuedCount[]>>;
}): JSX.Element {
  return (
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
  );
}

export function PosSyncSection({
  host,
  runCommand,
  runtime,
}: {
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
  readonly runtime: DemoCommerceRuntime;
}): JSX.Element {
  return (
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
  );
}
