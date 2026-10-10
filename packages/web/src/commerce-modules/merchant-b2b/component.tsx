/**
 * merchant-b2b component — the J12 surface (lazily loaded).
 *
 * Multi-location truth: the seed stocks the warehouse through the kernel and
 * opens one requested transfer; dispatch moves units OUT of the source,
 * confirming receipt moves them INTO the destination, and a cancellation is
 * a deliberate act whose units never left. Channel price breaks, the B2B
 * quote queue and net-terms invoices are committed DEMO fixtures — the
 * boundary is stated on the surface, and quote decisions land in LOCAL DEMO
 * STATE only.
 */

import type { JSX } from "react";


import { useState } from "react";
import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
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
  B2B_QUOTES,
  B2B_SKUS,
  B2B_UNAVAILABLE_NOTE,
  B2B_FIXTURES_ID,
  CHANNELS,
  NET_TERMS_INVOICES,
  OPENING_STOCK,
  PRICE_BREAKS,
  SEEDED_TRANSFER,
  STOREFRONT_LOCATION,
  WAREHOUSE_LOCATION,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

async function seedB2bDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();
  for (const line of OPENING_STOCK) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(line.skuId),
      locationId: WAREHOUSE_LOCATION,
      units: line.units,
      reason: "MANUAL",
    });
  }
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_TRANSFER",
    transfer: SEEDED_TRANSFER,
  });
  return runtime;
}

export default function MerchantB2bComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedB2bDemo);
  const { version, refresh } = useRefresh();
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);
  const [quoteStatuses, setQuoteStatuses] = useState<Readonly<Record<string, "PENDING" | "OFFERED" | "DECLINED">>>(() =>
    Object.fromEntries(B2B_QUOTES.map((quote) => [quote.quoteId, quote.status])),
  );

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
          <h1 className="cm-card-title">J12 · B2B &amp; multi-location</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (warehouse stock + one requested transfer)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const transfers = view.allTransfers();
  const levelOf = (skuId: string, locationId: typeof WAREHOUSE_LOCATION): number =>
    view.level(makeId<"SkuId">(skuId), locationId)?.onHand ?? 0;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J12 · B2B &amp; multi-location commerce</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Harbor Lane runs three channels out of one warehouse (fixtures{" "}
          <code>{B2B_FIXTURES_ID}</code>). Multi-location stock and every transfer below are REAL
          deterministic kernel state — dispatch, receipt and cancellation move units exactly
          once. Channels, price breaks, quotes and net-terms AR are committed DEMO fixtures
          (no kernel aggregate exists for them yet) — labelled, never passed off as live.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              setLastOutcome(null);
              setQuoteStatuses(Object.fromEntries(B2B_QUOTES.map((quote) => [quote.quoteId, quote.status])));
              reset();
            }}
          >
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live portal or AR system
          </span>
        </div>
      </section>

      <section aria-label="Multi-location stock">
        <h2 className="cm-section-title">Multi-location stock (canonical, per location)</h2>
        <div className="cm-stack">
          {B2B_SKUS.map((sku) => (
            <div key={sku.skuId} className="cm-journey-item">
              <span className="cm-journey-name">{sku.skuId}</span>
              <span className="cm-journey-summary">{sku.title}</span>
              <span className="cm-env-note">
                warehouse on hand {levelOf(sku.skuId, WAREHOUSE_LOCATION)} ·
                storefront on hand {levelOf(sku.skuId, STOREFRONT_LOCATION)}
              </span>
            </div>
          ))}
          <p className="cm-card-sub">
            One SKU, one location, one canonical level — a transfer never blends locations.
          </p>
        </div>
      </section>

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
          {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
        </div>
      </section>

      <section aria-label="Channels">
        <h2 className="cm-section-title">Channels &amp; wholesale price breaks (DEMO fixtures)</h2>
        <div className="cm-stack">
          {CHANNELS.map((channel) => (
            <div key={channel.id} className="cm-journey-item">
              <span className="cm-journey-name">{channel.name}</span>
              <span className="cm-journey-summary">{channel.description}</span>
              <DemoTag />
            </div>
          ))}
          {PRICE_BREAKS.map((break_) => (
            <div key={`${break_.skuId}-${break_.tier}`} className="cm-journey-item">
              <span className="cm-journey-name">{break_.skuId}</span>
              <span className="cm-journey-summary">
                {break_.tier} — {fmtMoney(demoMoney(break_.unitPriceMinor))}
              </span>
              <DemoTag />
            </div>
          ))}
          <p className="cm-card-sub">
            Price breaks are committed fixture data (the per-channel price book has no kernel
            aggregate yet) — the J10 storefront and the J13 autonomous price book are the real
            kernel-priced surfaces.
          </p>
        </div>
      </section>

      <section aria-label="B2B quotes">
        <h2 className="cm-section-title">B2B quote requests (DEMO fixtures, local review state)</h2>
        <div className="cm-stack">
          {B2B_QUOTES.map((quote) => {
            const status = quoteStatuses[quote.quoteId] ?? quote.status;
            return (
              <div key={quote.quoteId} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{quote.quoteId}</span>
                  <StatusChip status={status} note="LOCAL DEMO review state — never kernel truth, never binding" />
                  <DemoTag />
                </div>
                <p className="cm-state-item-detail">
                  {quote.account} · {quote.skuId} ×{quote.units} — {quote.note}
                </p>
                <div className="cm-row">
                  <PermissionBoundary host={host} permission="storefront.manage">
                    {status === "PENDING" ? (
                      <ConfirmableAction
                        actionLabel={`Approve the wholesale break for ${quote.account} (local demo decision)`}
                        confirmLabel="Record the approval"
                        statement="Records the merchant's approval in LOCAL DEMO STATE only: the quote flips to OFFERED on this screen. It binds no account, reserves no stock and moves no money — a real quote contract would need an aggregate that does not exist yet."
                        onExecute={() => {
                          setQuoteStatuses((current) => ({ ...current, [quote.quoteId]: "OFFERED" }));
                        }}
                      />
                    ) : (
                      <p className="cm-card-sub">
                        {status === "OFFERED"
                          ? "Decision recorded (OFFERED, local demo state) — pressing approve again changes nothing: the decision is already recorded."
                          : "Declined — the account can re-request next season."}
                      </p>
                    )}
                  </PermissionBoundary>
                </div>
              </div>
            );
          })}
          <p className="cm-card-sub">{B2B_UNAVAILABLE_NOTE}</p>
        </div>
      </section>

      <section aria-label="Net terms">
        <h2 className="cm-section-title">Net-terms invoices (DEMO fixtures — AR, not live)</h2>
        <div className="cm-stack">
          {NET_TERMS_INVOICES.map((invoice) => (
            <div key={invoice.invoiceId} className="cm-state-item">
              <div className="cm-row">
                <span className="cm-state-item-label">{invoice.invoiceId}</span>
                <StatusChip status={invoice.status} note={invoice.status === "OVERDUE" ? "Past due — a fixture fact, not a live AR feed" : "Not yet due"} />
                <span className="cm-env-note">
                  {fmtMoney(demoMoney(invoice.amountMinor))} · {invoice.terms} · {invoice.account}
                </span>
              </div>
              <p className="cm-state-item-detail">{invoice.detail}</p>
            </div>
          ))}
          <p className="cm-card-sub">
            OVERDUE is a fact about time, not a failure state; collecting an invoice would be a
            live payment action, which does not exist here — the honest state is
            &quot;unavailable&quot;, never a simulated collection.
          </p>
        </div>
      </section>

      <section aria-label="Journal">
        <h2 className="cm-section-title">Journal (append-only, deterministic)</h2>
        <EventTrail
          events={runtime
            .events()
            .slice(-14)
            .map((event) => ({
              kind: event.kind,
              subjectId: event.subject.subjectId,
              at: event.occurredAt,
            }))}
          limit={14}
        />
      </section>
    </div>
  );
}
