/**
 * procurement-supply purchase-order section — split out of component.tsx
 * for the oxlint max-lines gate (pure code motion; the JSX is
 * byte-identical).
 *
 * The real-kernel purchase-order lifecycle surface (approvals, supplier
 * confirmation, partial receiving, over-receipt refusals, duplicate replay,
 * substitution refusal); composed by component.tsx.
 */

import type { JSX } from "react";

import { makeId } from "@unicom/commerce";
import type { PurchaseOrder } from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import {
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
} from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import type { CommandExecution } from "@unicom/commerce";
import { SUBSTITUTE_SKU } from "./fixtures.js";
import { PO_1, PO_3, PO_4, type KernelRun } from "./seed.js";

export function PurchaseOrdersSection({
  view,
  host,
  runCommand,
  receivePartial,
  receiveKeys,
  lastOutcome,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
  readonly receivePartial: (po: PurchaseOrder) => Promise<void>;
  readonly receiveKeys: {
    readonly commandId: string;
    readonly idempotencyKey: string;
  } | null;
  readonly lastOutcome: CommandExecution | null;
}): JSX.Element {
  return (
    <section aria-label="Purchase orders">
      <h2 className="cm-section-title">Purchase orders (real kernel state)</h2>
      <div className="cm-stack">
        {view.allPurchaseOrders().map((po) => (
          <div key={po.purchaseOrderId} className="cm-journey-item">
            <span className="cm-journey-name">{po.purchaseOrderId}</span>
            <StatusChip status={po.state} note="Purchase-order state (deterministic lifecycle)" />
            <span className="cm-env-note">
              supplier {po.supplierId} · destination {po.destinationLocationId} · revision{" "}
              {po.revision}
            </span>
            <span className="cm-journey-summary">
              {po.lines
                .map((line) => `${line.skuId}: expected ${line.orderedUnits} · received ${line.receivedUnits}`)
                .join(" · ")}
            </span>
            <span className="cm-row">
              {po.state === "DRAFT" ? (
                <PermissionBoundary host={host} permission="procurement.approve-po">
                  <ConfirmableAction
                    actionLabel={`Submit PO ${po.purchaseOrderId}`}
                    confirmLabel={`Submit ${po.purchaseOrderId} now`}
                    statement={`Hands SUBMIT to the kernel for ${po.purchaseOrderId}: the DRAFT becomes a SUBMITTED purchase order under your approval (procurement.approve-po). This is the approval boundary — it is shown before anything commits.`}
                    onExecute={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "ADVANCE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        trigger: "SUBMIT",
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="cm-button"
                    onClick={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "ADVANCE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        trigger: "CANCEL",
                      });
                    }}
                  >
                    Cancel PO (recoverable exit)
                  </button>
                </PermissionBoundary>
              ) : null}
              {po.state === "SUBMITTED" ? (
                <PermissionBoundary host={host} permission="procurement.approve-po">
                  <ConfirmableAction
                    actionLabel={`Supplier confirms ${po.purchaseOrderId} (demo signal)`}
                    confirmLabel="Record supplier confirmation"
                    statement={`Hands SUPPLIER_CONFIRM to the kernel for ${po.purchaseOrderId} — a deterministic demo supplier signal, never a live portal call.`}
                    onExecute={() => {
                      void runCommand(DEMO_SYSTEM_ACTOR, {
                        type: "ADVANCE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        trigger: "SUPPLIER_CONFIRM",
                      });
                    }}
                  />
                </PermissionBoundary>
              ) : null}
              {po.state === "CONFIRMED" ? (
                <PermissionBoundary host={host} permission="receiving.receive-delivery">
                  <ConfirmableAction
                    actionLabel={`Receive partial against ${po.purchaseOrderId} (scripted)`}
                    confirmLabel="Receive now"
                    statement={`Hands RECEIVE_PURCHASE_ORDER to the kernel for ${po.purchaseOrderId}: the scripted scan receives ${Math.max(0, po.lines[0]!.orderedUnits - po.lines[0]!.receivedUnits - 12)} of the outstanding units — partial receiving is a first-class state, not an error.`}
                    onExecute={() => {
                      void receivePartial(po);
                    }}
                  />
                  <button
                    type="button"
                    className="cm-button"
                    onClick={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "RECEIVE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        lines: [{ skuId: po.lines[0]!.skuId, units: po.lines[0]!.orderedUnits + 4 }],
                      });
                    }}
                  >
                    Try receiving beyond tolerance (see the refusal)
                  </button>
                </PermissionBoundary>
              ) : null}
              {po.state === "PARTIALLY_RECEIVED" ? (
                <PermissionBoundary host={host} permission="receiving.receive-delivery">
                  <ConfirmableAction
                    actionLabel={`Receive remaining units of ${po.purchaseOrderId}`}
                    confirmLabel="Receive remaining now"
                    statement={`Hands RECEIVE_PURCHASE_ORDER to the kernel for ${po.purchaseOrderId}: the still-outstanding units arrive and the PO completes (RECEIVED).`}
                    onExecute={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "RECEIVE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        lines: po.lines.map((line) => ({
                          skuId: line.skuId,
                          units: Math.max(0, line.orderedUnits - line.receivedUnits),
                        })),
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="cm-button"
                    onClick={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "ADVANCE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        trigger: "CLOSE",
                      });
                    }}
                  >
                    Close PO with shortfall recorded
                  </button>
                </PermissionBoundary>
              ) : null}
              {po.state === "RECEIVED" ? (
                <PermissionBoundary host={host} permission="procurement.approve-po">
                  <button
                    type="button"
                    className="cm-button"
                    onClick={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "ADVANCE_PURCHASE_ORDER",
                        purchaseOrderId: po.purchaseOrderId,
                        trigger: "CLOSE",
                      });
                    }}
                  >
                    Close PO
                  </button>
                </PermissionBoundary>
              ) : null}
            </span>
          </div>
        ))}
        <div className="cm-row">
          <PermissionBoundary host={host} permission="receiving.receive-delivery">
            <button
              type="button"
              className="cm-button"
              onClick={() => {
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "RECEIVE_PURCHASE_ORDER",
                  purchaseOrderId: PO_1,
                  lines: [{ skuId: makeId<"SkuId">(SUBSTITUTE_SKU), units: 5 }],
                });
              }}
            >
              Try receiving the substitute SKU against po-demo-1 (see the refusal)
            </button>
          </PermissionBoundary>
          {receiveKeys ? (
            <button
              type="button"
              className="cm-button"
              data-testid="cm-duplicate-recv"
              onClick={() => {
                void runCommand(
                  DEMO_MERCHANT_ACTOR,
                  {
                    type: "RECEIVE_PURCHASE_ORDER",
                    purchaseOrderId: PO_3,
                    lines: [{ skuId: makeId<"SkuId">("sku-proc-envelopes"), units: 18 }],
                  },
                  { commandId: receiveKeys.commandId, idempotencyKey: receiveKeys.idempotencyKey },
                );
              }}
            >
              Replay exact same receiving command (duplicate)
            </button>
          ) : null}
        </div>
        <p className="cm-card-sub">
          A substitute SKU is never silently absorbed into the original line: the kernel refuses
          it deterministically (UNKNOWN_LINE) — the canonical route is the substitution&apos;s own
          purchase order ({PO_4} below) through the same approval boundary.
        </p>
        {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
      </div>
    </section>
  );
}
