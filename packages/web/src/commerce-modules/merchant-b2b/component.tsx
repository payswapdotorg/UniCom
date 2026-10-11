/**
 * merchant-b2b component — the J12 surface (lazily loaded).
 *
 * Multi-location truth: the seed stocks the warehouse through the kernel and
 * opens one requested transfer; dispatch moves units OUT of the source,
 * confirming receipt moves them INTO the destination, and a cancellation is
 * a deliberate act whose units never left. W2-014 completes the B2B plane on
 * top of the EXISTING public contracts: the wholesale order pad resolves
 * committed per-account price lists with the real `negotiatedPrice` /
 * `enforceMinimumOrder` contracts and places orders through the kernel's own
 * B2B minimum-order gate (net-terms bank-transfer mandate, UNKNOWN preserved),
 * the quote desk reviews requests with contract-computed offers (accept /
 * counter / reject — LOCAL DEMO STATE, never binding), and the net-terms AR
 * section ages fixture invoices + on-terms orders at the fixed demo date
 * (finance-visibility-gated). Channels and the quote queue itself remain
 * committed DEMO fixtures — labelled, never passed off as live.
 */

import type { JSX } from "react";


import { useState } from "react";
import { makeId, negotiatedPrice, multiplyMoneyByInteger } from "@unicom/commerce";
import type { B2BPriceList, CommandExecution } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR, DemoCommerceRuntime, demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  DemoTag,
  EventTrail,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  B2B_FIXTURES_ID,
  B2B_MINIMUM_ORDER_POLICY,
  B2B_SKUS,
  B2B_QUOTES,
  CHANNELS,
  COMPANY_ACCOUNTS,
  DEFAULT_COMPANY_ACCOUNT,
  OPENING_STOCK,
  PRICE_BREAKS,
  SEEDED_TRANSFER,
  STOREFRONT_LOCATION,
  WAREHOUSE_LOCATION,
  initialPriceLists,
  withNegotiatedEntry,
  type B2bQuoteDecision,
  type B2bQuoteFixture,
} from "./fixtures.js";
import type { KernelRun } from "./kernel-run.js";
import { TransfersSection } from "./component-parts.js";
import { WholesaleOrderPadSection, type B2bOrderRow } from "./b2b-order-pad.js";
import { QuoteDeskSection } from "./b2b-quotes.js";
import { NetTermsArSection } from "./b2b-ar.js";

async function seedB2bDemo(): Promise<DemoCommerceRuntime> {
  // The kernel's own B2B minimum-order gate (the contract's minimumOrderPolicy
  // option) — enforced at PLACE_ORDER, exercised exactly as the kernel's own
  // B2B scenario documents.
  const runtime = new DemoCommerceRuntime({ minimumOrderPolicy: B2B_MINIMUM_ORDER_POLICY });
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
  const [priceLists, setPriceLists] = useState<Record<string, B2BPriceList>>(() => initialPriceLists());
  const [quoteDecisions, setQuoteDecisions] = useState<Readonly<Record<string, B2bQuoteDecision>>>({});
  const [placements, setPlacements] = useState<Readonly<Record<string, string>>>({});

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

  const b2bOrders: readonly B2bOrderRow[] = view
    .allOrders()
    .filter((order) => order.cartId?.startsWith("cart-b2b-") === true)
    .map((order) => {
      const account =
        COMPANY_ACCOUNTS.find(
          (entry) => order.cartId !== undefined && entry.companyAccountId === placements[order.cartId],
        ) ?? DEFAULT_COMPANY_ACCOUNT;
      return { order, account };
    });

  const acceptQuote = (quote: B2bQuoteFixture): void => {
    const base = priceLists[quote.companyAccountId];
    if (!base) return;
    const updated = withNegotiatedEntry(base, quote.requestedTier);
    setPriceLists((current) => ({ ...current, [quote.companyAccountId]: updated }));
    const offer = negotiatedPrice(updated, makeId<"SkuId">(quote.skuId), quote.units);
    const note = offer.ok
      ? `Accepted — the local demo price list now carries ${quote.skuId} at ${fmtMoney(offer.value)}/unit from ${quote.requestedTier.minQuantity} units; the offered basket is ${quote.units} × ${fmtMoney(offer.value)} = ${fmtMoney(multiplyMoneyByInteger(offer.value, quote.units))} (contract-computed). The wholesale order pad resolves this tier immediately.`
      : "Accepted, but the contract refused to resolve the offered quantity against the updated list.";
    setQuoteDecisions((current) => ({ ...current, [quote.quoteId]: { kind: "ACCEPTED", note } }));
  };

  const counterQuote = (quote: B2bQuoteFixture): void => {
    const base = priceLists[quote.companyAccountId];
    const current = base ? negotiatedPrice(base, makeId<"SkuId">(quote.skuId), quote.units) : null;
    const note = current?.ok
      ? `Countered at the standing tier (contract-resolved): ${fmtMoney(current.value)}/unit — ${quote.units} × ${fmtMoney(current.value)} = ${fmtMoney(multiplyMoneyByInteger(current.value, quote.units))}. The requested break was not granted; the local price list is unchanged and the account can accept or re-request.`
      : "Countered — the standing tier could not be resolved by the contract for this quantity.";
    setQuoteDecisions((currentDecisions) => ({
      ...currentDecisions,
      [quote.quoteId]: { kind: "COUNTERED", note },
    }));
  };

  const rejectQuote = (quote: B2bQuoteFixture, reason: string): void => {
    setQuoteDecisions((current) => ({
      ...current,
      [quote.quoteId]: { kind: "REJECTED", reason, note: `Declined the requested break for ${quote.account}.` },
    }));
  };

  const resetDemo = (): void => {
    setLastOutcome(null);
    setPriceLists(initialPriceLists());
    setQuoteDecisions({});
    setPlacements({});
    reset();
  };

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
          once. The wholesale order pad resolves committed per-account price lists with the real
          B2B contracts and places orders through the kernel&apos;s minimum-order gate (synthetic
          demo state, never a live purchase order). The channel tier ladder and the quote-decision
          queue are committed DEMO fixtures (no kernel aggregate exists for them yet) — labelled,
          never passed off as live.
        </p>
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={resetDemo}>
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

      <TransfersSection host={host} transfers={transfers} runCommand={runCommand} />

      <WholesaleOrderPadSection
        host={host}
        runtime={runtime}
        runCommand={runCommand}
        priceLists={priceLists}
        orders={b2bOrders}
        onPlaced={(cartId, accountId) => setPlacements((current) => ({ ...current, [cartId]: accountId }))}
      />

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
            aggregate yet) — the per-account negotiated lists the order pad resolves, and the J10
            storefront / J13 autonomous price book, are the contract-priced surfaces.
          </p>
        </div>
      </section>

      <QuoteDeskSection
        host={host}
        priceLists={priceLists}
        decisions={quoteDecisions}
        onAccept={acceptQuote}
        onCounter={counterQuote}
        onReject={rejectQuote}
      />

      <NetTermsArSection host={host} orders={b2bOrders} />

      {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}

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
