/**
 * merchant-b2b net-terms AR section (J12, W2-014) — AR viewing completed with
 * a deterministic aging roll-up: the two committed fixture invoices plus every
 * wholesale order placed on terms (kernel-derived, DEMO-labelled), aged at the
 * FIXED demo date with the commerce contract's pure `epochDayOf` day
 * arithmetic. Honest boundaries: live credit checks and AR collection do not
 * exist here — the credit limits are committed fixture facts, collection is
 * shown as unavailable, and no capture control exists anywhere in this module.
 * The roll-up control is finance-visibility-gated (finance.view-settlements);
 * the fixture invoice rows stay visible to every role exactly as before.
 */

import type { JSX } from "react";


import { useState } from "react";
import { epochDayOf, sumMoney } from "@unicom/commerce";
import type { Money } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import { ConfirmableAction, DemoTag, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import {
  B2B_AR_AS_OF,
  COMPANY_ACCOUNTS,
  NET_TERMS_INVOICES,
  PAYMENT_TERMS_DAYS,
  addDaysIso,
  paymentTermsLabel,
} from "./fixtures.js";
import type { B2bOrderRow } from "./b2b-order-pad.js";

/** One AR row (committed fixture sheet or kernel-placed order on terms). */
interface ArInvoice {
  readonly invoiceId: string;
  readonly account: string;
  readonly companyAccountId: string;
  readonly amount: Money;
  readonly termsLabel: string;
  readonly dueAt: string;
  readonly status: "PENDING" | "OVERDUE";
  readonly source: "committed fixture" | "kernel order";
  readonly detail: string;
}

/** The aging buckets (day arithmetic via the contract's epochDayOf). */
const AGING_BUCKETS: readonly { readonly label: string; readonly matches: (daysPastDue: number) => boolean }[] = [
  { label: "not yet due", matches: (days) => days <= 0 },
  { label: "1-30 days past due", matches: (days) => days >= 1 && days <= 30 },
  { label: "31-60 days past due", matches: (days) => days >= 31 && days <= 60 },
  { label: "61-90 days past due", matches: (days) => days >= 61 && days <= 90 },
  { label: "90+ days past due", matches: (days) => days > 90 },
];

/** Days an invoice is past due at the fixed demo date (contract day math). */
function daysPastDueAt(dueAt: string): number {
  return epochDayOf(B2B_AR_AS_OF) - epochDayOf(dueAt);
}

/** Honest total of a bucket/account (single-currency; "—" if the sum refuses). */
function fmtSum(moneys: readonly Money[]): string {
  if (moneys.length === 0) return fmtMoney(demoMoney("0"));
  const total = sumMoney(moneys);
  return total.ok ? fmtMoney(total.value) : "— (sum refused)";
}

/** The net-terms AR section with the finance-gated aging roll-up. */
export function NetTermsArSection({
  host,
  orders,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly orders: readonly B2bOrderRow[];
}): JSX.Element {
  const [agingEnabled, setAgingEnabled] = useState<boolean>(false);

  const invoices: readonly ArInvoice[] = [
    ...NET_TERMS_INVOICES.map((invoice) => ({
      invoiceId: invoice.invoiceId,
      account: invoice.account,
      companyAccountId: invoice.companyAccountId,
      amount: demoMoney(invoice.amountMinor),
      termsLabel: invoice.terms,
      dueAt: invoice.dueAt,
      status: invoice.status,
      source: "committed fixture" as const,
      detail: invoice.detail,
    })),
    ...orders.map((row) => {
      const dueAt = addDaysIso(row.order.placedAt, PAYMENT_TERMS_DAYS[row.account.paymentTerms]);
      const pastDue = daysPastDueAt(dueAt);
      return {
        invoiceId: row.order.orderId,
        account: row.account.name,
        companyAccountId: row.account.companyAccountId,
        amount: row.order.totals.grandTotal,
        termsLabel: paymentTermsLabel(row.account.paymentTerms),
        dueAt,
        status: pastDue > 0 ? ("OVERDUE" as const) : ("PENDING" as const),
        source: "kernel order" as const,
        detail: `Wholesale order placed ${row.order.placedAt.slice(0, 10)}, due ${dueAt.slice(0, 10)} — a DEMO kernel order (never a live invoice); ${
          row.order.paymentStatus === "AUTHORIZED"
            ? "mandate recorded, not collected"
            : row.order.paymentStatus === "UNKNOWN"
              ? "mandate state UNKNOWN (preserved, not failed)"
              : "open on terms, no mandate yet"
        }.`,
      };
    }),
  ];

  return (
    <section aria-label="Net terms">
      <h2 className="cm-section-title">Net-terms invoices (DEMO fixtures — AR, not live)</h2>
      <div className="cm-stack">
        <p className="cm-card-sub">
          Two committed fixture invoices plus every wholesale order placed on terms below (kernel
          demo state, derived into an AR view — never a live AR document). The aging roll-up is
          computed at the fixed demo date {B2B_AR_AS_OF.slice(0, 10)} with the commerce
          contract&apos;s pure day arithmetic: not-yet-due never collapses into overdue, and
          OVERDUE stays a fact about time.
        </p>
        {invoices.map((invoice) => (
          <div key={`${invoice.source}-${invoice.invoiceId}`} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">{invoice.invoiceId}</span>
              <StatusChip status={invoice.status} note={invoice.status === "OVERDUE" ? "Past due — a fixture fact, not a live AR feed" : "Not yet due"} />
              <span className="cm-env-note">
                {fmtMoney(invoice.amount)} · {invoice.termsLabel} · {invoice.account}
              </span>
              <DemoTag />
            </div>
            <p className="cm-state-item-detail">
              {invoice.detail} [{invoice.source}]
            </p>
          </div>
        ))}
        <PermissionBoundary host={host} permission="finance.view-settlements">
          <div className="cm-stack" data-testid="cm-b2b-aging">
            <ConfirmableAction
              actionLabel={`Run the aging roll-up (as of ${B2B_AR_AS_OF.slice(0, 10)}, the fixed demo date)`}
              confirmLabel="Run the roll-up"
              statement={`Computes the deterministic aging of every open invoice above at the fixed demo date ${B2B_AR_AS_OF.slice(0, 10)}: buckets keep not-yet-due separate from 1-30 / 31-60 / 61-90 / 90+ days past due, with per-account outstanding totals against the committed fixture credit limits. Fixture math — no live AR feed or credit bureau exists here.`}
              onExecute={() => setAgingEnabled(true)}
            />
            {agingEnabled ? (
              <div className="cm-card">
                <h3 className="cm-card-title">
                  Aging roll-up — as of {B2B_AR_AS_OF.slice(0, 10)} (fixture math, no live AR feed)
                </h3>
                <ul className="cm-perm-list" data-testid="cm-b2b-aging-buckets">
                  {AGING_BUCKETS.map((bucket) => {
                    const rows = invoices.filter((invoice) => bucket.matches(daysPastDueAt(invoice.dueAt)));
                    return (
                      <li key={bucket.label}>
                        {bucket.label}:{" "}
                        {rows.length === 0
                          ? "none (honest empty)"
                          : `${rows.length} invoice${rows.length === 1 ? "" : "s"} · ${fmtSum(rows.map((row) => row.amount))} — ${rows.map((row) => row.invoiceId).join(", ")}`}
                      </li>
                    );
                  })}
                </ul>
                <ul className="cm-perm-list">
                  {COMPANY_ACCOUNTS.map((account) => {
                    const outstanding = invoices.filter((invoice) => invoice.companyAccountId === account.companyAccountId);
                    return (
                      <li key={account.companyAccountId}>
                        {account.name} — outstanding {fmtSum(outstanding.map((row) => row.amount))} vs committed fixture credit limit{" "}
                        {account.creditLimit ? fmtMoney(account.creditLimit) : "none"} ({account.paymentTerms} terms) —
                        fixture math; live credit checks do not exist here, never simulated.
                      </li>
                    );
                  })}
                </ul>
                <p className="cm-card-sub">
                  Derived live from the invoices above — place another wholesale order on terms and
                  it appears here on the next render. Not-yet-due amounts are exposure, not
                  delinquency; nothing here collects anything.
                </p>
              </div>
            ) : null}
          </div>
        </PermissionBoundary>
        <p className="cm-card-sub">
          OVERDUE is a fact about time, not a failure state; collecting an invoice would be a
          live payment action, which does not exist here — the honest state is
          &quot;unavailable&quot;, never a simulated collection.
        </p>
      </div>
    </section>
  );
}
