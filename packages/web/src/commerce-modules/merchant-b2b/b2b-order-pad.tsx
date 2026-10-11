/**
 * merchant-b2b wholesale order pad (J12, W2-014) — the channel price-break
 * surface made interactive through the EXISTING public B2B contract:
 *
 * - the committed per-account `B2BPriceList` fixtures are resolved with the
 *   REAL `negotiatedPrice` contract (min-quantity gate, honest
 *   QUANTITY_BELOW_MINIMUM / ENTRY_NOT_FOUND refusals, exact line totals);
 * - the placement travels as REAL kernel commands (ADD_CART_LINE with the
 *   negotiated unit price → PLACE_ORDER), and the kernel's own
 *   `minimumOrderPolicy` gate enforces the wholesale minimum (below → the
 *   honest BELOW_MINIMUM_ORDER refusal; at/above → a PENDING order);
 * - a net-terms bank-transfer MANDATE can be recorded per order
 *   (CREATE_PAYMENT_INTENT, BANK_TRANSFER): authorization in the DEMO rail —
 *   funds are NEVER collected here (collection stays honestly unavailable);
 *   an ambiguous rail run resolves the mandate UNKNOWN — preserved, not failed;
 * - every value is synthetic DEMO kernel state: never a live purchase order,
 *   payment or commitment. Reset restores the committed fixtures.
 */

import type { JSX } from "react";


import { useState } from "react";
import { countQuantity, makeId, multiplyMoneyByInteger, negotiatedPrice, enforceMinimumOrder } from "@unicom/commerce";
import type { B2BPriceList, CompanyAccount, OrderSnapshot } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR, DemoCommerceRuntime, fmtMoney } from "../merchant-shared/demo-runtime.js";
import { ConfirmableAction, DemoTag, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import {
  B2B_MINIMUM_ORDER_POLICY,
  B2B_SKUS,
  COMPANY_ACCOUNTS,
  DEFAULT_COMPANY_ACCOUNT,
  PAYMENT_TERMS_DAYS,
  addDaysIso,
  paymentTermsLabel,
} from "./fixtures.js";
import type { KernelRun } from "./kernel-run.js";

/** One placed wholesale order joined with its (fixture) company account. */
export interface B2bOrderRow {
  readonly order: OrderSnapshot;
  readonly account: CompanyAccount;
}

/**
 * The wholesale order pad. `orders` are the pad's kernel orders (component.tsx
 * derives them); `onPlaced` records the cart→account join for that derivation.
 */
export function WholesaleOrderPadSection({
  host,
  runtime,
  runCommand,
  priceLists,
  orders,
  onPlaced,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly runtime: DemoCommerceRuntime;
  readonly runCommand: KernelRun;
  readonly priceLists: Readonly<Record<string, B2BPriceList>>;
  readonly orders: readonly B2bOrderRow[];
  readonly onPlaced: (cartId: string, accountId: string) => void;
}): JSX.Element {
  const [accountId, setAccountId] = useState<string>(DEFAULT_COMPANY_ACCOUNT.companyAccountId);
  const [skuId, setSkuId] = useState<string>(B2B_SKUS[0].skuId);
  const [unitsText, setUnitsText] = useState<string>("24");
  const [railMode, setRailMode] = useState<"ok" | "ambiguous">("ok");
  const [nextCart, setNextCart] = useState<number>(1);
  const [lastPlacement, setLastPlacement] = useState<{
    readonly cartId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
  } | null>(null);

  const account =
    COMPANY_ACCOUNTS.find((entry) => entry.companyAccountId === accountId) ?? DEFAULT_COMPANY_ACCOUNT;
  const list = priceLists[account.companyAccountId];
  const units = Number(unitsText);
  const unitsValid = Number.isInteger(units) && units >= 1;
  const resolution = unitsValid && list ? negotiatedPrice(list, makeId<"SkuId">(skuId), units) : null;
  const lineTotal = resolution?.ok ? multiplyMoneyByInteger(resolution.value, units) : null;
  const gate = lineTotal ? enforceMinimumOrder(B2B_MINIMUM_ORDER_POLICY, lineTotal) : null;
  const cartId = `cart-b2b-${nextCart}`;

  const placeOrder = async (): Promise<void> => {
    if (!resolution?.ok) return;
    const addCommandId = `cmd-b2b-add-${cartId}`;
    const addIdemKey = `idem-b2b-add-${cartId}`;
    const placeCommandId = `cmd-b2b-place-${cartId}`;
    const placeIdemKey = `idem-b2b-place-${cartId}`;
    const added = await runCommand(
      DEMO_MERCHANT_ACTOR,
      {
        type: "ADD_CART_LINE",
        cartId: makeId<"CartId">(cartId),
        skuId: makeId<"SkuId">(skuId),
        quantity: countQuantity(units),
        unitPrice: resolution.value,
      },
      { commandId: addCommandId, idempotencyKey: addIdemKey },
    );
    if (added.status === "EXECUTED") {
      const placed = await runCommand(
        DEMO_MERCHANT_ACTOR,
        {
          type: "PLACE_ORDER",
          cartId: makeId<"CartId">(cartId),
          merchantId: DEMO_MERCHANT_ACTOR.merchantId,
        },
        { commandId: placeCommandId, idempotencyKey: placeIdemKey },
      );
      if (placed.status === "EXECUTED") {
        onPlaced(cartId, account.companyAccountId);
        setLastPlacement({ cartId, commandId: placeCommandId, idempotencyKey: placeIdemKey });
      }
    }
    setNextCart((current) => current + 1);
  };

  const recordMandate = async (row: B2bOrderRow): Promise<void> => {
    if (railMode === "ambiguous") runtime.payments.makeNextOutcomeAmbiguous("PROCESS_STATE_UNCLEAR");
    await runCommand(DEMO_MERCHANT_ACTOR, {
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: row.order.totals.grandTotal,
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(row.order.orderId) },
        method: {
          methodKind: "BANK_TRANSFER",
          tokenRef: `mandate-${paymentTermsLabel(row.account.paymentTerms).replace(" ", "-")}-${row.order.orderId}`,
        },
      },
    });
  };

  return (
    <section aria-label="Wholesale order pad">
      <h2 className="cm-section-title">Wholesale order pad — price breaks → kernel order</h2>
      <div className="cm-stack">
        <p className="cm-card-sub">
          The committed per-account price lists are resolved with the REAL <code>negotiatedPrice</code>{" "}
          contract (minimum-quantity gate, exact totals); the placement travels as typed kernel
          commands and the kernel&apos;s own B2B minimum-order gate decides (BELOW_MINIMUM_ORDER is
          an honest refusal, nothing partial). Orders here are synthetic DEMO kernel state — never a
          live purchase order.
        </p>
        <PermissionBoundary host={host} permission="orders.process">
          <div className="cm-card">
            <div className="cm-row">
              <label htmlFor="cm-b2b-account">Company account:</label>
              <select
                id="cm-b2b-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {COMPANY_ACCOUNTS.map((entry) => (
                  <option key={entry.companyAccountId} value={entry.companyAccountId}>
                    {entry.name} · {paymentTermsLabel(entry.paymentTerms)}
                  </option>
                ))}
              </select>
              <label htmlFor="cm-b2b-sku">SKU:</label>
              <select id="cm-b2b-sku" value={skuId} onChange={(event) => setSkuId(event.target.value)}>
                {B2B_SKUS.map((sku) => (
                  <option key={sku.skuId} value={sku.skuId}>
                    {sku.skuId} — {sku.title}
                  </option>
                ))}
              </select>
              <label htmlFor="cm-b2b-units">Units:</label>
              <input
                id="cm-b2b-units"
                type="number"
                min={1}
                step={1}
                value={unitsText}
                onChange={(event) => setUnitsText(event.target.value)}
              />
            </div>
            <p className="cm-card-sub" data-testid="cm-b2b-resolve" aria-live="polite">
              {!unitsValid ? (
                <>Enter a whole number of units (1 or more).</>
              ) : resolution === null ? (
                <>No price list for this account.</>
              ) : !resolution.ok ? (
                <>
                  The contract refuses: <code>{resolution.error.code}</code> —{" "}
                  {resolution.error.code === "ENTRY_NOT_FOUND"
                    ? `${account.name} has no negotiated entry for ${skuId} (honest refusal, nothing sent to the kernel).`
                    : resolution.error.code === "QUANTITY_BELOW_MINIMUM"
                      ? `${skuId} needs at least ${resolution.error.minQuantity} units at ${account.name}'s terms (you asked ${units}) — nothing sent to the kernel.`
                      : `the price list's currency does not match the entry's (${resolution.error.list} vs ${resolution.error.entry}).`}
                </>
              ) : (
                <>
                  Negotiated price {fmtMoney(resolution.value)}/unit (min{" "}
                  {list?.entries.find((entry) => entry.skuId === skuId)?.minQuantity ?? "?"}) ·{" "}
                  {units} × {fmtMoney(resolution.value)} = <strong>{fmtMoney(lineTotal ?? resolution.value)}</strong>{" "}
                  {gate?.ok
                    ? `— meets the ${fmtMoney(B2B_MINIMUM_ORDER_POLICY.minimumOrderValue)} wholesale minimum.`
                    : `— below the ${fmtMoney(B2B_MINIMUM_ORDER_POLICY.minimumOrderValue)} wholesale minimum: the kernel will refuse this placement (BELOW_MINIMUM_ORDER).`}
                </>
              )}
            </p>
            <div className="cm-row">
              <ConfirmableAction
                actionLabel={`Place the wholesale order (${account.name} · ${skuId} ×${unitsValid ? units : "?"})`}
                confirmLabel="Place the order (kernel)"
                disabled={!resolution?.ok}
                statement={`ADD_CART_LINE adds ${skuId} ×${units} at the contract-resolved ${resolution?.ok ? fmtMoney(resolution.value) : "—"} to ${cartId}, then PLACE_ORDER hands the cart to the kernel: the ${fmtMoney(B2B_MINIMUM_ORDER_POLICY.minimumOrderValue)} B2B minimum-order gate decides — ${
                  gate?.ok
                    ? "this placement meets it and a PENDING order is created (demo kernel state)"
                    : "this placement is below it and the kernel refuses with BELOW_MINIMUM_ORDER (nothing partial)"
                }. Synthetic DEMO state — never a live purchase order.`}
                onExecute={() => {
                  void placeOrder();
                }}
              />
              {lastPlacement ? (
                <button
                  type="button"
                  className="cm-button"
                  data-testid="cm-b2b-duplicate-submit"
                  onClick={() => {
                    const keys = lastPlacement;
                    if (!keys) return;
                    void runCommand(
                      DEMO_MERCHANT_ACTOR,
                      {
                        type: "PLACE_ORDER",
                        cartId: makeId<"CartId">(keys.cartId),
                        merchantId: DEMO_MERCHANT_ACTOR.merchantId,
                      },
                      { commandId: keys.commandId, idempotencyKey: keys.idempotencyKey },
                    );
                  }}
                >
                  Resubmit the exact same placement (duplicate)
                </button>
              ) : null}
            </div>
          </div>
        </PermissionBoundary>
        <div className="cm-stack">
          <div className="cm-row">
            <h3 className="cm-card-title">Orders on terms (kernel demo state)</h3>
            <label htmlFor="cm-b2b-rail" className="cm-env-note">
              Mandate rail simulation:
            </label>
            <select
              id="cm-b2b-rail"
              value={railMode}
              onChange={(event) => setRailMode(event.target.value === "ambiguous" ? "ambiguous" : "ok")}
            >
              <option value="ok">normal — mandate authorizes</option>
              <option value="ambiguous">ambiguous — mandate state resolves UNKNOWN</option>
            </select>
          </div>
          {orders.length === 0 ? (
            <p className="cm-card-sub">
              No wholesale orders yet — resolve a price above and place one (the honest empty state;
              refused placements leave no order).
            </p>
          ) : (
            orders.map((row) => (
              <div key={row.order.orderId} className="cm-state-item" data-testid="cm-b2b-order">
                <div className="cm-row">
                  <span className="cm-state-item-label">{row.order.orderId}</span>
                  <StatusChip status={row.order.state} note="Kernel order lifecycle: PENDING → … (demo state)" />
                  <StatusChip
                    status={row.order.paymentStatus}
                    note={
                      row.order.paymentStatus === "UNKNOWN"
                        ? "The mandate state is unclear — UNKNOWN, preserved, never failed"
                        : row.order.paymentStatus === "AUTHORIZED"
                          ? "Net-terms mandate recorded (demo rail) — funds NOT collected"
                          : "No mandate recorded yet — the invoice is open on terms"
                    }
                  />
                  <span className="cm-journey-summary">
                    {row.order.lines
                      .map((line) =>
                        line.kind === "UNIT_LINE"
                          ? `${line.skuId} ×${line.quantity.units}`
                          : `${line.skuId} (measured)`,
                      )
                      .join(", ")} ·{" "}
                    <strong>{fmtMoney(row.order.totals.grandTotal)}</strong> · {row.account.name} ·{" "}
                    {paymentTermsLabel(row.account.paymentTerms)} · due{" "}
                    {addDaysIso(row.order.placedAt, PAYMENT_TERMS_DAYS[row.account.paymentTerms]).slice(0, 10)}
                  </span>
                  <DemoTag />
                </div>
                <div className="cm-row">
                  <PermissionBoundary host={host} permission="orders.process">
                    {row.order.paymentStatus === "NOT_PAID" ? (
                      <ConfirmableAction
                        actionLabel={`Record the ${paymentTermsLabel(row.account.paymentTerms)} bank-transfer mandate for ${row.order.orderId}`}
                        confirmLabel="Record the mandate (demo rail)"
                        statement={`CREATE_PAYMENT_INTENT with a BANK_TRANSFER mandate against ${row.order.orderId} for ${fmtMoney(row.order.totals.grandTotal)}: the DEMO rail authorizes the mandate — funds are NOT collected (collection stays unavailable here)${
                          railMode === "ambiguous"
                            ? "; this run is scripted ambiguous, so the mandate state resolves UNKNOWN — preserved, never failed"
                            : ""
                        }. Synthetic DEMO state, never a live payment.`}
                        onExecute={() => {
                          void recordMandate(row);
                        }}
                      />
                    ) : (
                      <p className="cm-card-sub">
                        {row.order.paymentStatus === "AUTHORIZED"
                          ? "Mandate recorded in the demo rail — authorized, not collected; the invoice ages below."
                          : "Mandate state UNKNOWN (ambiguous demo rail) — preserved, retriable, never failed."}
                      </p>
                    )}
                  </PermissionBoundary>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
