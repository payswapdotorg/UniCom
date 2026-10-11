/**
 * merchant-b2b quote review desk (J12, W2-014) — the quote queue completed
 * from a blind approve button into a request → review → accept / counter /
 * reject desk. Honest boundary: there is NO commerce aggregate for the quote
 * queue itself, so decisions land in LOCAL DEMO STATE (resettable,
 * DEMO-labelled, never binding) — but every price inside a decision is
 * computed by the REAL public contracts (`negotiatedPrice` on the account's
 * current list, `enforceMinimumOrder` on the would-be offer), and an accepted
 * tier is applied to the account's LOCAL DEMO price list, which the wholesale
 * order pad immediately resolves.
 */

import type { JSX } from "react";


import { useState } from "react";
import { enforceMinimumOrder, makeId, multiplyMoneyByInteger, negotiatedPrice } from "@unicom/commerce";
import type { B2BPriceList } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { fmtMoney } from "../merchant-shared/demo-runtime.js";
import { ConfirmableAction, DemoTag, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import {
  B2B_MINIMUM_ORDER_POLICY,
  B2B_QUOTES,
  B2B_UNAVAILABLE_NOTE,
  QUOTE_REJECT_REASONS,
  type B2bQuoteDecision,
  type B2bQuoteFixture,
} from "./fixtures.js";

/** The quote review desk (storefront.manage-gated decisions). */
export function QuoteDeskSection({
  host,
  priceLists,
  decisions,
  onAccept,
  onCounter,
  onReject,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly priceLists: Readonly<Record<string, B2BPriceList>>;
  readonly decisions: Readonly<Record<string, B2bQuoteDecision>>;
  readonly onAccept: (quote: B2bQuoteFixture) => void;
  readonly onCounter: (quote: B2bQuoteFixture) => void;
  readonly onReject: (quote: B2bQuoteFixture, reason: string) => void;
}): JSX.Element {
  const [rejectReasons, setRejectReasons] = useState<Readonly<Record<string, string>>>({});

  return (
    <section aria-label="B2B quotes">
      <h2 className="cm-section-title">B2B quote requests (DEMO fixtures, local review state)</h2>
      <div className="cm-stack">
        <p className="cm-card-sub">
          Every price below is resolved by the real <code>negotiatedPrice</code> contract on the
          account&apos;s committed price list; the decision itself lands in LOCAL DEMO STATE only
          (no quote aggregate exists in the kernel yet — never binding, reset restores the
          committed queue). An accepted tier updates the account&apos;s LOCAL DEMO price list, which
          the wholesale order pad resolves immediately.
        </p>
        {B2B_QUOTES.map((quote) => {
          const decision = decisions[quote.quoteId];
          const status = decision
            ? decision.kind === "ACCEPTED"
              ? "OFFERED"
              : decision.kind === "COUNTERED"
                ? "COUNTERED"
                : "DECLINED"
            : quote.status;
          const list = priceLists[quote.companyAccountId];
          const current = list ? negotiatedPrice(list, makeId<"SkuId">(quote.skuId), quote.units) : null;
          const requestedTotal = multiplyMoneyByInteger(quote.requestedTier.negotiatedPrice, quote.units);
          const requestedGate = enforceMinimumOrder(B2B_MINIMUM_ORDER_POLICY, requestedTotal);
          const selectedReason = rejectReasons[quote.quoteId];
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
              {decision ? (
                <p className="cm-state-item-detail" data-testid={`cm-quote-decision-${quote.quoteId}`}>
                  {decision.note}
                  {decision.kind === "REJECTED" && decision.reason ? ` Reason on record: ${decision.reason}.` : ""}{" "}
                  Local demo state — reset restores the committed queue.
                </p>
              ) : status === "PENDING" ? (
                <>
                  <p className="cm-state-item-detail">
                    {current?.ok ? (
                      <>
                        Current terms (contract-resolved): {fmtMoney(current.value)}/unit (min{" "}
                        {list?.entries.find((entry) => entry.skuId === quote.skuId)?.minQuantity ?? "?"}) —{" "}
                        {quote.units} × {fmtMoney(current.value)} = {fmtMoney(multiplyMoneyByInteger(current.value, quote.units))}.
                      </>
                    ) : (
                      <>The current list refuses this quantity ({current && !current.ok ? current.error.code : "no list"}) — the request itself is the ask.</>
                    )}{" "}
                    Requested: {fmtMoney(quote.requestedTier.negotiatedPrice)}/unit from{" "}
                    {quote.requestedTier.minQuantity} units — {quote.units} ×{" "}
                    {fmtMoney(quote.requestedTier.negotiatedPrice)} = {fmtMoney(requestedTotal)}
                    {requestedGate.ok
                      ? ""
                      : ` (below the ${fmtMoney(B2B_MINIMUM_ORDER_POLICY.minimumOrderValue)} wholesale minimum — orders at these terms need more units)`}
                    .
                  </p>
                  <PermissionBoundary host={host} permission="storefront.manage">
                    <div className="cm-row">
                      <ConfirmableAction
                        actionLabel={`Accept the requested break for ${quote.account}`}
                        confirmLabel="Record the acceptance (local demo state)"
                        statement={`Records the merchant's acceptance in LOCAL DEMO STATE only: ${quote.account}'s local demo price list gains ${quote.skuId} at ${fmtMoney(quote.requestedTier.negotiatedPrice)}/unit from ${quote.requestedTier.minQuantity} units, and the quote flips to OFFERED at ${fmtMoney(requestedTotal)} (contract-computed). It binds no account, reserves no stock and moves no money — a real quote contract would need a kernel aggregate that does not exist yet.`}
                        onExecute={() => onAccept(quote)}
                      />
                      <ConfirmableAction
                        actionLabel={`Counter ${quote.account} at the standing tier`}
                        confirmLabel="Record the counter (local demo state)"
                        statement={`Records a formal COUNTER at the account's CURRENT negotiated tier${
                          current?.ok ? ` (${fmtMoney(current.value)}/unit — ${quote.units} × ${fmtMoney(current.value)} = ${fmtMoney(multiplyMoneyByInteger(current.value, quote.units))}, contract-computed)` : ""
                        }: the requested break is not granted, the local price list is unchanged, and the quote flips to COUNTERED in LOCAL DEMO STATE only. The account can accept the standing terms or re-request.`}
                        onExecute={() => onCounter(quote)}
                      />
                    </div>
                    <div className="cm-row">
                      <span className="cm-env-note">Reject with a recorded reason (the account sees the reason):</span>
                      {QUOTE_REJECT_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          className="cm-button"
                          aria-pressed={selectedReason === reason}
                          onClick={() =>
                            setRejectReasons((currentReasons) => ({
                              ...currentReasons,
                              [quote.quoteId]: reason,
                            }))
                          }
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <ConfirmableAction
                      actionLabel={`Reject ${quote.quoteId} — record the reason`}
                      confirmLabel="Record the rejection (local demo state)"
                      disabled={!selectedReason}
                      statement={`Records the merchant's rejection in LOCAL DEMO STATE only: ${quote.quoteId} flips to DECLINED with the reason on record${
                        selectedReason ? ` ("${selectedReason}")` : " (select a reason first)"
                      }. Nothing is journaled to the kernel and no account is bound — the account can re-request next season.`}
                      onExecute={() => {
                        if (selectedReason) onReject(quote, selectedReason);
                      }}
                    />
                  </PermissionBoundary>
                </>
              ) : (
                <p className="cm-state-item-detail">
                  Offered on the standing tier — {quote.note} (committed fixture state; local demo.)
                </p>
              )}
            </div>
          );
        })}
        <p className="cm-card-sub">{B2B_UNAVAILABLE_NOTE}</p>
      </div>
    </section>
  );
}
