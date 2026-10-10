/**
 * procurement-supply presentational parts — split out of component.tsx for
 * the oxlint max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * The fixture-backed sections (suppliers/quotes, quantity differences,
 * substitutions, evidence, warehouse stock, audit trail); composed by
 * component.tsx, which remains the module's public surface.
 */

import type { JSX } from "react";

import type { ReconciliationRecord } from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { DemoCommerceRuntime, fmtMoney } from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  EventTrail,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  DEMO_EVIDENCE,
  DEMO_SUBSTITUTIONS,
  DEMO_SUPPLIERS,
  DEMO_SUPPLIER_REPORTED,
  QUOTE_REQUESTED_AT,
  WAREHOUSE_LOCATION,
  evidenceAmount,
} from "./fixtures.js";
import { bestQuotePerSku } from "./seed.js";

export function SuppliersQuotesSection({
  host,
  quotesRequested,
  setQuotesRequested,
}: {
  readonly host: CommerceHostServices;
  readonly quotesRequested: boolean;
  readonly setQuotesRequested: (value: boolean) => void;
}): JSX.Element {
  return (
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
  );
}

export function QuantityDifferencesSection({
  view,
  reconciliationRecords,
}: {
  readonly view: KernelView;
  readonly reconciliationRecords: readonly ReconciliationRecord[];
}): JSX.Element {
  return (
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
  );
}

export function SubstitutionsSection(): JSX.Element {
  return (
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
  );
}

export function EvidenceSection(): JSX.Element {
  return (
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
  );
}

export function WarehouseStockSection({ view }: { readonly view: KernelView }): JSX.Element {
  const warehouseLevels = view.allLevels().filter((level) => level.locationId === WAREHOUSE_LOCATION);
  return (
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
  );
}

export function AuditTrailSection({
  runtime,
}: {
  readonly runtime: DemoCommerceRuntime;
}): JSX.Element {
  return (
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
  );
}
