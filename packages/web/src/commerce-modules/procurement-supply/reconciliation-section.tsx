/**
 * procurement-supply reconciliation section — split out of component.tsx
 * for the oxlint max-lines gate (pure code motion; the JSX and the
 * observation/levelOf helpers are byte-identical).
 *
 * The reconciliation-gated stock-update panel: observations never silently
 * promote (within tolerance → PROMOTED, beyond → DISCREPANCY_HOLD,
 * supplier-reported → NOT_PROMOTED_KIND, UNKNOWN → NOT_PROMOTED_UNKNOWN).
 */

import type { JSX } from "react";

import { makeId } from "@unicom/commerce";
import type {
  InventoryCountObservation,
  ReconciliationRecord,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import {
  DEMO_MERCHANT_ACTOR,
  DemoCommerceRuntime,
} from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import { DEMO_COUNT_POLICY, WAREHOUSE_LOCATION } from "./fixtures.js";
import type { KernelRun } from "./seed.js";

export function ReconciliationSection({
  view,
  host,
  runCommand,
  runtime,
  reconciliationRecords,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
  readonly runtime: DemoCommerceRuntime;
  readonly reconciliationRecords: readonly ReconciliationRecord[];
}): JSX.Element {
  const observation = (
    suffix: string,
    skuId: string,
    kind: InventoryCountObservation["kind"],
    sourceType: "SCANNER" | "SUPPLIER" | "EDGE_DEVICE",
    resolution: InventoryCountObservation["resolution"],
  ): InventoryCountObservation => ({
    observationId: makeId<"ObservationId">(runtime.nextId(`obs-${suffix}`)),
    kind,
    skuId: makeId<"SkuId">(skuId),
    locationId: WAREHOUSE_LOCATION,
    observedAt: runtime.now,
    source: { sourceType, sourceRef: `${sourceType.toLowerCase()}-demo-1` },
    resolution,
  });

  const levelOf = (skuId: string) =>
    view.level(makeId<"SkuId">(skuId), WAREHOUSE_LOCATION)?.onHand ?? 0;

  return (
    <section aria-label="Reconciliation">
      <h2 className="cm-section-title">
        Reconciliation-gated stock updates (observations never silently promote)
      </h2>
      <div className="cm-stack">
        <div className="cm-row">
          <PermissionBoundary host={host} permission="receiving.count-stock">
            <ConfirmableAction
              actionLabel="Reconcile barcode count — A3 paper (within tolerance)"
              confirmLabel="Reconcile now"
              statement="Hands RECONCILE_COUNT_OBSERVATION to the kernel: a barcode scan one unit under canonical stock. Within the ±2 tolerance it PROMOTES — canonical on-hand moves by the variance and the revision bumps."
              onExecute={() => {
                const onHand = levelOf("sku-proc-a3-paper");
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "RECONCILE_COUNT_OBSERVATION",
                  observation: observation(
                    "barcode-ok",
                    "sku-proc-a3-paper",
                    "BARCODE_COUNT",
                    "SCANNER",
                    { resolved: "OBSERVED", value: Math.max(0, onHand - 1) },
                  ),
                  policy: DEMO_COUNT_POLICY,
                });
              }}
            />
            <ConfirmableAction
              actionLabel="Reconcile barcode count — envelopes (beyond tolerance)"
              confirmLabel="Reconcile now"
              statement="Hands RECONCILE_COUNT_OBSERVATION to the kernel: a barcode scan nine units OVER canonical stock. Beyond the ±2 tolerance it becomes a DISCREPANCY_HOLD — canonical stock does NOT change until someone reviews."
              onExecute={() => {
                const onHand = levelOf("sku-proc-envelopes");
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "RECONCILE_COUNT_OBSERVATION",
                  observation: observation(
                    "barcode-hold",
                    "sku-proc-envelopes",
                    "BARCODE_COUNT",
                    "SCANNER",
                    { resolved: "OBSERVED", value: onHand + 9 },
                  ),
                  policy: DEMO_COUNT_POLICY,
                });
              }}
            />
            <ConfirmableAction
              actionLabel="Reconcile supplier report — ink (never promotes)"
              confirmLabel="Reconcile now"
              statement="Hands RECONCILE_COUNT_OBSERVATION to the kernel with a SUPPLIER_REPORT observation: supplier-reported data is an observation, so the disposition is NOT_PROMOTED_KIND — it never changes canonical stock on its own."
              onExecute={() => {
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "RECONCILE_COUNT_OBSERVATION",
                  observation: observation("supplier-ink", "sku-proc-ink", "SUPPLIER_REPORT", "SUPPLIER", {
                    resolved: "OBSERVED",
                    value: 15,
                  }),
                  policy: DEMO_COUNT_POLICY,
                });
              }}
            />
            <ConfirmableAction
              actionLabel="Reconcile UNKNOWN offline observation — A3 paper"
              confirmLabel="Reconcile now"
              statement="Hands RECONCILE_COUNT_OBSERVATION to the kernel with an UNKNOWN resolution (an offline scan that could not be verified). The disposition is NOT_PROMOTED_UNKNOWN — not a failure, and never a promotion."
              onExecute={() => {
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "RECONCILE_COUNT_OBSERVATION",
                  observation: observation("unknown-a3", "sku-proc-a3-paper", "BARCODE_COUNT", "EDGE_DEVICE", {
                    resolved: "UNKNOWN",
                    reason: "AMBIGUOUS",
                  }),
                  policy: DEMO_COUNT_POLICY,
                });
              }}
            />
          </PermissionBoundary>
        </div>
        {reconciliationRecords.length === 0 ? (
          <p className="cm-card-sub">No reconciliation records yet — nothing has been promoted.</p>
        ) : (
          reconciliationRecords.map((record) => (
            <div key={record.reconciliationRecordId} className="cm-journey-item">
              <span className="cm-journey-name">{record.reconciliationRecordId}</span>
              <StatusChip
                status={record.disposition}
                note={
                  record.disposition === "NOT_PROMOTED_UNKNOWN"
                    ? "The observation resolved UNKNOWN — not a failure, and not promoted (J18 law)"
                    : "Reconciliation disposition (deterministic)"
                }
              />
              <span className="cm-env-note">
                {record.skuId} · observation {record.observationId} ·{" "}
                {record.varianceUnits !== undefined ? `variance ${record.varianceUnits}` : "no variance recorded"} ·{" "}
                {record.recordedAt}
              </span>
              {record.disposition === "NOT_PROMOTED_UNKNOWN" ? (
                <span className="cm-env-note" data-testid="cm-not-promoted-unknown-note">
                  The observation resolved UNKNOWN — not a failure, and not promoted (J18 law).
                </span>
              ) : null}
            </div>
          ))
        )}
        <p className="cm-card-sub">
          UNKNOWN observations stay NOT_PROMOTED_UNKNOWN — preserved verbatim, never rendered as
          failed, never silently promoted.
        </p>
      </div>
    </section>
  );
}
