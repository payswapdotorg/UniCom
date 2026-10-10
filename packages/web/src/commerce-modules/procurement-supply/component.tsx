/**
 * procurement-supply component — the J11 surface (lazily loaded).
 *
 * REAL deterministic kernel state: purchase orders, the approval lifecycle,
 * partial receiving (over-receipt refused, never absorbed), substitution-line
 * refusals, reconciliation dispositions and canonical warehouse stock — all
 * driven through typed command envelopes. DEMO fixtures (honestly labelled):
 * supplier quote sheets, substitution records and document evidence (the
 * kernel has no aggregates for these yet; nothing here contacts a supplier).
 */

import type { JSX } from "react";


import { useState } from "react";
import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  InventoryCountObservation,
  PrincipalRef,
  PurchaseOrder,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import {
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
  fmtMoney,
} from "../merchant-shared/demo-runtime.js";
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
  DEMO_EVIDENCE,
  DEMO_SUBSTITUTIONS,
  DEMO_SUPPLIERS,
  DEMO_SUPPLIER_REPORTED,
  PROCUREMENT_FIXTURES_ID,
  QUOTE_REQUESTED_AT,
  SUBSTITUTE_SKU,
  WAREHOUSE_LOCATION,
  evidenceAmount,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

const PO_1 = makeId<"PurchaseOrderId">("po-demo-1");
const PO_2 = makeId<"PurchaseOrderId">("po-demo-2");
const PO_3 = makeId<"PurchaseOrderId">("po-demo-3");
const PO_4 = makeId<"PurchaseOrderId">("po-demo-4");

async function seedProcurementDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();

  // PO-1 (Riverstone): submitted, supplier-confirmed, PARTIALLY received —
  // the seeded wrong-quantity case (supplier said 20 envelopes, 12 scanned).
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_1,
      supplierId: makeId<"SupplierId">("sup-demo-riverstone"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [
        { skuId: makeId<"SkuId">("sku-proc-a3-paper"), orderedUnits: 40, receivedUnits: 0 },
        { skuId: makeId<"SkuId">("sku-proc-envelopes"), orderedUnits: 20, receivedUnits: 0 },
      ],
      state: "DRAFT",
      revision: 1,
    },
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_1, trigger: "SUBMIT" });
  await runtime.run(DEMO_SYSTEM_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_1, trigger: "SUPPLIER_CONFIRM" });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "RECEIVE_PURCHASE_ORDER",
    purchaseOrderId: PO_1,
    lines: [
      { skuId: makeId<"SkuId">("sku-proc-a3-paper"), units: 40 },
      { skuId: makeId<"SkuId">("sku-proc-envelopes"), units: 12 },
    ],
  });

  // PO-2 (Apex, ink): DRAFT — awaiting the approval boundary below.
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_2,
      supplierId: makeId<"SupplierId">("sup-demo-apex"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">("sku-proc-ink"), orderedUnits: 15, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });

  // PO-3 (BlueMagpie, envelopes): CONFIRMED — ready for the live partial
  // receiving + duplicate-replay demo.
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_3,
      supplierId: makeId<"SupplierId">("sup-demo-bluemagpie"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">("sku-proc-envelopes"), orderedUnits: 30, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_3, trigger: "SUBMIT" });
  await runtime.run(DEMO_SYSTEM_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_3, trigger: "SUPPLIER_CONFIRM" });

  // PO-4: the APPROVED substitution's own line — the canonical route for a
  // substitute SKU (DRAFT, awaiting approval; it can never ride PO-1's lines).
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_4,
      supplierId: makeId<"SupplierId">("sup-demo-riverstone"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">(SUBSTITUTE_SKU), orderedUnits: 10, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });

  return runtime;
}

/** Best quote per SKU (exact minor units; deterministic tiebreak on lead time). */
function bestQuotePerSku() {
  return DEMO_SUPPLIERS[0]!.quotes.map((quote) => {
    const best = DEMO_SUPPLIERS.flatMap((supplier) =>
      supplier.quotes
        .filter((entry) => entry.skuId === quote.skuId)
        .map((entry) => ({ supplier, entry })),
    ).sort(
      (a, b) =>
        Number(BigInt(a.entry.unitPriceMinor) - BigInt(b.entry.unitPriceMinor)) ||
        a.entry.leadTimeDays - b.entry.leadTimeDays,
    )[0]!;
    return { skuId: quote.skuId, skuTitle: quote.skuTitle, best };
  });
}

export default function ProcurementSupplyComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedProcurementDemo);
  const { version, refresh } = useRefresh();
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);
  const [quotesRequested, setQuotesRequested] = useState(false);
  const [receiveKeys, setReceiveKeys] = useState<{
    readonly commandId: string;
    readonly idempotencyKey: string;
  } | null>(null);

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
          <h1 className="cm-card-title">J11 · Procurement &amp; supply</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (four purchase orders, a partial receipt,
            reconciliation records)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const warehouseLevels = view.allLevels().filter((level) => level.locationId === WAREHOUSE_LOCATION);
  const reconciliationRecords = view.allReconciliationRecords();
  const receivePartial = async (po: PurchaseOrder): Promise<void> => {
    const remaining = po.lines[0]!.orderedUnits - po.lines[0]!.receivedUnits;
    const units = Math.max(0, remaining - 12);
    const commandId = `cmd-recv-${po.purchaseOrderId}-partial`;
    const idempotencyKey = `idem-recv-${po.purchaseOrderId}-partial`;
    const outcome = await runCommand(
      DEMO_MERCHANT_ACTOR,
      {
        type: "RECEIVE_PURCHASE_ORDER",
        purchaseOrderId: po.purchaseOrderId,
        lines: [{ skuId: po.lines[0]!.skuId, units }],
      },
      { commandId, idempotencyKey },
    );
    if (outcome.status === "EXECUTED") setReceiveKeys({ commandId, idempotencyKey });
  };

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
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J11 · Procurement &amp; supply — suppliers to reconciled stock</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Harbor Lane Print Studio (demo firm). Suppliers, quote comparison, approvals, purchase
          orders, partial receiving, substitutions, receipt/invoice evidence and
          reconciliation-gated stock updates — built from committed fixtures{" "}
          <code>{PROCUREMENT_FIXTURES_ID}</code>. Purchase orders, receiving, over-receipt
          refusals, reconciliation dispositions and warehouse stock are REAL deterministic
          commerce-kernel state. Quote sheets, substitution records and document cards are DEMO
          fixtures: the kernel has no supplier-quote or substitution aggregate yet, and nothing
          here ever contacts a supplier.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              setLastOutcome(null);
              setQuotesRequested(false);
              setReceiveKeys(null);
              reset();
            }}
          >
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no supplier contact
          </span>
        </div>
      </section>

      <section aria-label="Suppliers and quotes">
        <h2 className="cm-section-title">Suppliers &amp; quotes (DEMO fixture sheets)</h2>
        <div className="cm-stack">
          {DEMO_SUPPLIERS.map((supplier) => (
            <div key={supplier.supplierId} className="cm-journey-item">
              <span className="cm-journey-name">{supplier.name}</span>
              <span className="cm-chip cm-chip-muted">{supplier.country}</span>
              <span className="cm-chip cm-chip-muted">terms {supplier.terms}</span>
              <span className="cm-journey-summary">
                {supplier.quotes
                  .map(
                    (quote) =>
                      `${quote.skuId}: ${fmtMoney(evidenceAmount(quote.unitPriceMinor))} · lead ${quote.leadTimeDays}d`,
                  )
                  .join(" · ")}
              </span>
            </div>
          ))}
          <div className="cm-row">
            <PermissionBoundary host={host} permission="procurement.request-quotes">
              <ConfirmableAction
                actionLabel="Request fresh quotes (demo)"
                confirmLabel="Re-read fixture quotes"
                statement="Re-reads the COMMITTED demo quote sheets — no supplier is contacted, no live request leaves this screen (the kernel has no quote aggregate yet)."
                onExecute={() => setQuotesRequested(true)}
              />
            </PermissionBoundary>
            {quotesRequested ? (
              <span className="cm-env-note">
                Quotes received (fixture re-read) at {QUOTE_REQUESTED_AT} — statuses stay OFFERED;
                this is demo state only.
              </span>
            ) : (
              <span className="cm-env-note">
                No quote request sent yet — the sheets below are the committed fixture state.
              </span>
            )}
          </div>
          <div className="cm-card">
            <h3 className="cm-card-title">Best unit price per SKU (exact minor units)</h3>
            <ul className="cm-perm-list">
              {bestQuotePerSku().map((row) => (
                <li key={row.skuId}>
                  {row.skuTitle} — best {fmtMoney(evidenceAmount(row.best.entry.unitPriceMinor))}{" "}
                  from <strong>{row.best.supplier.name}</strong> · lead{" "}
                  {row.best.entry.leadTimeDays} days · <span className="cm-chip cm-chip-muted">OFFERED</span>
                </li>
              ))}
            </ul>
            <p className="cm-card-sub">
              Comparison math is exact and deterministic (minor units; lead-time tiebreak). Quote
              data is fixture provenance — never a live offer.
            </p>
          </div>
        </div>
      </section>

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

      <section aria-label="Quantity differences">
        <h2 className="cm-section-title">Quantity differences — the four truths, kept separate</h2>
        <div className="cm-stack">
          {view.allPurchaseOrders().flatMap((po) =>
            po.lines.map((line) => {
              const supplierSaid = DEMO_SUPPLIER_REPORTED.find(
                (report) => report.purchaseOrderId === po.purchaseOrderId && report.skuId === line.skuId,
              )?.units;
              const reconciled = reconciliationRecords.find(
                (record) => record.skuId === line.skuId,
              );
              return (
                <div key={`${po.purchaseOrderId}-${line.skuId}`} className="cm-journey-item">
                  <span className="cm-journey-name">{line.skuId}</span>
                  <span className="cm-env-note">{po.purchaseOrderId}</span>
                  <span className="cm-journey-summary">
                    expected {line.orderedUnits} · scanned {line.receivedUnits} · supplier said{" "}
                    {supplierSaid ?? "—"} ·{" "}
                    {reconciled ? (
                      <>
                        reconciled <StatusChip status={reconciled.disposition} />
                      </>
                    ) : (
                      "reconciled: not yet (no reconciliation record)"
                    )}
                  </span>
                </div>
              );
            }),
          )}
          <p className="cm-card-sub">
            Expected = the ordered line (kernel). Scanned = what the receiving path actually
            accepted (kernel). Supplier said = the supplier-reported observation (fixture — it
            never promotes on its own). Reconciled = the disposition of a reconciliation record
            (kernel); until one exists, nothing is claimed.
          </p>
        </div>
      </section>

      <section aria-label="Substitutions">
        <h2 className="cm-section-title">Substitutions (DEMO records, full provenance)</h2>
        <div className="cm-stack">
          {DEMO_SUBSTITUTIONS.map((sub) => (
            <div key={sub.substitutionId} className="cm-journey-item">
              <span className="cm-journey-name">{sub.substitutionId}</span>
              <StatusChip status={sub.state} note="Substitution decision (demo record)" />
              <span className="cm-journey-summary">
                {sub.units} × {sub.substituteTitle} ({sub.substituteSkuId}) instead of{" "}
                {sub.originalSkuId} on {sub.purchaseOrderId} — reason: {sub.reason}
              </span>
              <span className="cm-env-note">
                requested by {sub.requestedBy} · decided by {sub.decidedBy} · follow-up PO:{" "}
                {sub.followUpPurchaseOrderId}
              </span>
            </div>
          ))}
          <p className="cm-card-sub">
            Substitution decisions are DEMO records (no kernel aggregate): they never mutate PO
            lines. Stock for a substitute arrives only through its own PO and the deterministic
            receiving path — the refusal button above shows the kernel enforcing exactly that.
          </p>
        </div>
      </section>

      <section aria-label="Evidence">
        <h2 className="cm-section-title">Receipt &amp; invoice evidence (DEMO documents, real journal)</h2>
        <div className="cm-stack">
          {DEMO_EVIDENCE.map((evidence) => (
            <div key={evidence.evidenceId} className="cm-journey-item">
              <span className="cm-journey-name">{evidence.reference}</span>
              <span className="cm-chip cm-chip-muted">{evidence.kind}</span>
              <StatusChip status={evidence.status} note="Document status (demo fixture)" />
              <span className="cm-env-note">
                {evidence.purchaseOrderId}
                {BigInt(evidence.amountMinor) > 0n
                  ? ` · ${fmtMoney(evidenceAmount(evidence.amountMinor))}`
                  : ""}
              </span>
            </div>
          ))}
          <p className="cm-card-sub">
            Document cards are DEMO attachments. The kernel&apos;s own evidence — every
            PURCHASE_ORDER_OPENED / STATE_CHANGED / RECEIVED and INVENTORY_RECEIVED fact — is the
            append-only journal shown in the audit trail below; nothing on this screen can forge
            it.
          </p>
        </div>
      </section>

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

      <section aria-label="Canonical warehouse stock">
        <h2 className="cm-section-title">Canonical stock at the demo warehouse</h2>
        <div className="cm-stack">
          {warehouseLevels.length === 0 ? (
            <p className="cm-card-sub">No stock recorded at the warehouse yet.</p>
          ) : (
            warehouseLevels.map((level) => (
              <div key={level.skuId} className="cm-journey-item">
                <span className="cm-journey-name">{level.skuId}</span>
                <span className="cm-chip cm-chip-muted">on hand {level.onHand}</span>
                <span className="cm-chip cm-chip-muted">reserved {level.reserved}</span>
                <span className="cm-env-note">
                  revision {level.revision} · updated {level.updatedAt}
                </span>
              </div>
            ))
          )}
          <p className="cm-card-sub">
            Canonical truth changes only through the deterministic paths above (receiving,
            reconciliation promotion) — an observation alone never moves these numbers.
          </p>
        </div>
      </section>

      <section aria-label="Audit trail">
        <h2 className="cm-section-title">Audit trail (append-only journal)</h2>
        <EventTrail
          events={runtime
            .events()
            .slice(-24)
            .map((event) => ({
              kind: event.kind,
              subjectId: event.subject.subjectId,
              at: event.occurredAt,
            }))}
          limit={24}
        />
      </section>
    </div>
  );
}
