/**
 * procurement-supply component — the J11 surface (lazily loaded).
 *
 * REAL deterministic kernel state: purchase orders, the approval lifecycle,
 * partial receiving (over-receipt refused, never absorbed), substitution-line
 * refusals, reconciliation dispositions and canonical warehouse stock — all
 * driven through typed command envelopes. DEMO fixtures (honestly labelled):
 * supplier quote sheets, substitution records and document evidence (the
 * kernel has no aggregates for these yet; nothing here contacts a supplier).
 *
 * Split for the oxlint max-lines gate (pure code motion, zero behavior
 * change): the seed + quote helper live in ./seed.ts, the fixture-backed
 * sections in ./component-parts.tsx, the purchase-order lifecycle in
 * ./po-sections.tsx and the reconciliation panel in
 * ./reconciliation-section.tsx. This file remains the module's public
 * surface (module.ts imports it).
 */

import type { JSX } from "react";


import { useState } from "react";
import type {
  CommandExecution,
  PurchaseOrder,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR } from "../merchant-shared/demo-runtime.js";
import { DemoTag, useRefresh, useSeededRuntime } from "../merchant-shared/ui.js";
import { PROCUREMENT_FIXTURES_ID } from "./fixtures.js";
import { seedProcurementDemo, type KernelRun } from "./seed.js";
import {
  AuditTrailSection,
  EvidenceSection,
  QuantityDifferencesSection,
  SubstitutionsSection,
  SuppliersQuotesSection,
  WarehouseStockSection,
} from "./component-parts.js";
import { PurchaseOrdersSection } from "./po-sections.js";
import { ReconciliationSection } from "./reconciliation-section.js";

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

      <SuppliersQuotesSection
        host={host}
        quotesRequested={quotesRequested}
        setQuotesRequested={setQuotesRequested}
      />

      <PurchaseOrdersSection
        view={view}
        host={host}
        runCommand={runCommand}
        receivePartial={receivePartial}
        receiveKeys={receiveKeys}
        lastOutcome={lastOutcome}
      />

      <QuantityDifferencesSection view={view} reconciliationRecords={reconciliationRecords} />

      <SubstitutionsSection />

      <EvidenceSection />

      <ReconciliationSection
        view={view}
        host={host}
        runCommand={runCommand}
        runtime={runtime}
        reconciliationRecords={reconciliationRecords}
      />

      <WarehouseStockSection view={view} />

      <AuditTrailSection runtime={runtime} />
    </div>
  );
}
