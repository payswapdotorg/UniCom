/**
 * merchant-b2b transfers section — split out of component.tsx for the oxlint
 * max-lines gate (pure code motion from the W3-015 original, zero behavior
 * change). The inter-location transfer lifecycle is REAL kernel state:
 * dispatch moves units OUT of the warehouse, confirming receipt moves them INTO
 * the storefront, and a cancellation is a deliberate act whose units never
 * left. Every action is a typed kernel command with a confirm-first boundary.
 */

import type { JSX } from "react";


import { makeId } from "@unicom/commerce";
import type { StockTransfer } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR } from "../merchant-shared/demo-runtime.js";
import { ConfirmableAction, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import { SEEDED_TRANSFER, STOREFRONT_LOCATION, WAREHOUSE_LOCATION } from "./fixtures.js";
import type { KernelRun } from "./kernel-run.js";

/** The inter-location transfers section (kernel truth, orders.process-gated). */
export function TransfersSection({
  host,
  transfers,
  runCommand,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly transfers: readonly StockTransfer[];
  readonly runCommand: KernelRun;
}): JSX.Element {
  return (
    <section aria-label="Transfers">
      <h2 className="cm-section-title">Inter-location transfers (real kernel state)</h2>
      <div className="cm-stack">
        {transfers.map((transfer) => (
          <div key={transfer.transferId} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">{transfer.transferId}</span>
              {transfer.state === "CANCELLED" ? (
                <span className="cm-chip cm-chip-muted" title="A deliberate cancellation — not a failure">
                  CANCELLED
                </span>
              ) : (
                <StatusChip status={transfer.state} note="Transfer lifecycle: REQUESTED → DISPATCHED → RECEIVED (or CANCELLED)" />
              )}
              <span className="cm-journey-summary">
                {transfer.lines
                  .map((line) => `${line.skuId} ×${line.units}`)
                  .join(", ")} ·{" "}
                {transfer.fromLocationId} → {transfer.toLocationId} · revision {transfer.revision}
              </span>
            </div>
            {transfer.state === "CANCELLED" ? (
              <p className="cm-state-item-detail">
                Cancelled by choice while still requested — the units never left the warehouse,
                so nothing had to come back. A deliberate act, not a failure.
              </p>
            ) : null}
            <div className="cm-row">
              <PermissionBoundary host={host} permission="orders.process">
                {transfer.transferId === SEEDED_TRANSFER.transferId && transfer.state === "REQUESTED" ? (
                  <ConfirmableAction
                    actionLabel="Dispatch the requested transfer (12 syrups leave the warehouse)"
                    confirmLabel="Dispatch it"
                    statement="ADVANCE_TRANSFER DISPATCH: 12 cold-brew concentrates leave the warehouse canonically (TRANSFER_OUT) and the transfer becomes DISPATCHED. The storefront does NOT get them until receipt is confirmed."
                    onExecute={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "ADVANCE_TRANSFER",
                        transferId: transfer.transferId,
                        trigger: "DISPATCH",
                      });
                    }}
                  />
                ) : null}
                {transfer.transferId === SEEDED_TRANSFER.transferId && transfer.state === "DISPATCHED" ? (
                  <>
                    <ConfirmableAction
                      actionLabel="Confirm receipt at the storefront (12 syrups arrive)"
                      confirmLabel="Confirm the receipt"
                      statement="ADVANCE_TRANSFER CONFIRM_RECEIPT: the storefront's canonical stock gains the 12 units (TRANSFER_IN). In-transit and on-shelf stay distinguishable because the effect lands only here."
                      onExecute={() => {
                        void runCommand(DEMO_MERCHANT_ACTOR, {
                          type: "ADVANCE_TRANSFER",
                          transferId: transfer.transferId,
                          trigger: "CONFIRM_RECEIPT",
                        });
                      }}
                    />
                    <ConfirmableAction
                      actionLabel="Try to re-dispatch the in-flight transfer (see the refusal)"
                      confirmLabel="Attempt the invalid dispatch"
                      statement="The transfer is DISPATCHED — re-dispatching is an invalid lifecycle transition. The kernel refuses it deterministically with the transition error; nothing is partially applied."
                      onExecute={() => {
                        void runCommand(DEMO_MERCHANT_ACTOR, {
                          type: "ADVANCE_TRANSFER",
                          transferId: transfer.transferId,
                          trigger: "DISPATCH",
                        });
                      }}
                    />
                  </>
                ) : null}
                {transfer.transferId === SEEDED_TRANSFER.transferId && transfer.state === "RECEIVED" ? (
                  <p className="cm-card-sub">
                    Transfer complete: 12 units are on the storefront&apos;s canonical shelf.
                    Dispatch and receipt each happened exactly once.
                  </p>
                ) : null}
              </PermissionBoundary>
            </div>
          </div>
        ))}
        <div className="cm-row">
          <PermissionBoundary host={host} permission="orders.process">
            <ConfirmableAction
              actionLabel="Open a second transfer (10 greens cases warehouse → storefront)"
              confirmLabel="Open the transfer"
              statement="OPEN_TRANSFER creates a NEW requested transfer for 10 salad-green cases. It moves nothing yet — dispatch decides when units leave; cancelling while requested means they never do."
              onExecute={() => {
                void runCommand(DEMO_MERCHANT_ACTOR, {
                  type: "OPEN_TRANSFER",
                  transfer: {
                    transferId: makeId<"TransferId">("trf-demo-b2b-2"),
                    fromLocationId: WAREHOUSE_LOCATION,
                    toLocationId: STOREFRONT_LOCATION,
                    lines: [{ skuId: makeId<"SkuId">("sku-b2b-greens"), units: 10 }],
                    state: "REQUESTED",
                    revision: 1,
                  },
                });
              }}
            />
          </PermissionBoundary>
        </div>
        {transfers
          .filter((entry) => entry.transferId !== SEEDED_TRANSFER.transferId && entry.state === "REQUESTED")
          .map((entry) => (
            <div key={entry.transferId} className="cm-row">
              <PermissionBoundary host={host} permission="orders.process">
                <ConfirmableAction
                  actionLabel={`Cancel the requested ${entry.transferId} while it has not shipped`}
                  confirmLabel="Cancel it (units stay)"
                  statement="ADVANCE_TRANSFER CANCEL_REQUEST from REQUESTED: the transfer is cancelled and the 10 cases never leave the warehouse — a deliberate cancellation, journaled, not a failure."
                  onExecute={() => {
                    void runCommand(DEMO_MERCHANT_ACTOR, {
                      type: "ADVANCE_TRANSFER",
                      transferId: entry.transferId,
                      trigger: "CANCEL_REQUEST",
                    });
                  }}
                />
              </PermissionBoundary>
            </div>
          ))}
      </div>
    </section>
  );
}
