# W2-014 — J12 B2B Contract-to-UI Map (audit, committed first)

Work order: `docs/work-orders/W2-014.md` · lane `work/w2-014` (from `604fae5`) · architecture `1.1-frozen-2026-10-05`.
Module: `packages/web/src/commerce-modules/merchant-b2b/` (J12 · B2B & multi-location).
Prior gap record (rendered-ui FINAL-REPORT §3.4): "J12 contract-only surfaces (channel price breaks, quotes, net-terms AR) are DEMO-labeled fixtures; live AR/credit honestly unavailable."

Truth sources audited (no inference from types alone — every symbol below was opened and read):
`packages/commerce/src/contract.ts` (the only public entrypoint), `packages/commerce/src/domain/b2b.ts`,
`packages/commerce/src/domain/orders.ts`, `packages/commerce/src/domain/payments.ts`,
`packages/commerce/src/runtime/handler-commerce.ts` (the `PLACE_ORDER` minimum-order gate),
`packages/commerce/src/runtime/handler-payment.ts` (`CREATE_PAYMENT_INTENT` → order payment effects),
`packages/commerce/src/test/runtime/runtime-circular.test.ts` (the kernel's own canonical B2B flow:
`negotiatedPrice` → `ADD_CART_LINE` with the negotiated unit price → `PLACE_ORDER` under a
`minimumOrderPolicy` → net-terms bank-transfer mandate), and the W3-015 merchant-shared harness
(`demo-runtime.ts` `DemoCommerceRuntime`/`DemoPaymentBoundary`, `ui.tsx` permission/confirm primitives).

## 1. Element-by-element map (state at lane start)

| # | J12 element | Exact public contract (`@unicom/commerce`) | Rendered consumer at start | Role / permission | State provenance | Interactions at start | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Multi-location stock | `RECEIVE_STOCK` (kernel cmd), `CanonicalInventoryLevel` via `view().level()` | "Multi-location stock" section | `orders.process` (actions) | KERNEL (runtime-integration seam: deterministic demo kernel) | seeded only (visible) | COMPLETE (no change) |
| 2 | Inter-location transfers | `StockTransfer`, `advanceTransfer`, `OPEN_TRANSFER` / `ADVANCE_TRANSFER` kernel cmds | "Inter-location transfers (real kernel state)" section | `orders.process` | KERNEL | dispatch / confirm-receipt / invalid re-dispatch refusal / open second transfer / cancel | COMPLETE (no change) |
| 3 | Channel price breaks | `B2BPriceList` / `B2BPriceListEntry` / `negotiatedPrice` / `B2BPriceError` + `MinimumOrderPolicy` / `enforceMinimumOrder` + kernel `minimumOrderPolicy` option enforced at `PLACE_ORDER` (`handler-commerce.ts` §B2B minimum-order gate) | STATIC fixture list only (`PRICE_BREAKS` rows, DEMO-tagged) — the `negotiatedPrice` / `enforceMinimumOrder` contracts had **zero consumers anywhere in `packages/web`** (verified by search) | none (no action) | FIXTURE (ladder) | none — read-only illustration | **CONTRACT-ONLY → completed**: interactive wholesale order pad (see §2A) |
| 4 | B2B quote queue | none for quotes (no customer-side quote aggregate exists in commerce; the group-buy proposal machine is a different domain). Pricing inside a quote IS contract-supported (`negotiatedPrice`, `enforceMinimumOrder`) | quote rows with a local-state "Approve" button (OFFERED fixture + one approve action); statuses PENDING/OFFERED/DECLINED | `storefront.manage` | FIXTURE + LOCAL demo state | approve only (no counter, no reject) | **PARTIAL → completed as a review desk** with contract-computed offers; the decision queue itself stays LOCAL DEMO STATE (no aggregate — see §3) |
| 5 | Net-terms AR | `CompanyAccount` (incl. `paymentTerms: PaymentTerms`, optional `creditLimit: Money`), `PaymentTerms` vocabulary, `epochDayOf` (pure day arithmetic), order snapshot (`paymentStatus`, `totals`) | static fixture invoice rows (OVERDUE/PENDING chips) + honest "collection unavailable" note | none (no action) | FIXTURE | none | **CONTRACT-SUPPORTED VIEW → completed**: AR aging roll-up (see §2C), fixture + kernel-order-derived invoices, honest credit boundary |
| 6 | Net-terms payment on an order | `CREATE_PAYMENT_INTENT` with `PaymentMethodKind "BANK_TRANSFER"` + mandate `tokenRef` (the kernel test's canonical net-terms mandate), order `paymentStatus` vocabulary (`NOT_PAID`/`AUTHORIZED`/`UNKNOWN`…), `DemoPaymentBoundary` ambiguity scripting | ABSENT | — | — | none | **ABSENT → completed** inside the order pad (mandate step, see §2A) |
| 7 | Live credit checks / AR collection / live portal accounts | none (no credit-decisioning contract; `PaymentBoundary` is a port, no live provider; the commerce-plane linking decision is separately gated) | honest "unavailable, never simulated" note | — | — | none | STAYS honestly unavailable (no substitute built — §3) |

## 2. What this lane completes (the narrowest useful set the contracts support)

### A. Wholesale order pad — channel price-break application to a real cart/order (+ net-terms mandate)
Permission: `orders.process` (held by merchant, store-operator, approver, support). New section.
- Company accounts are committed `CompanyAccount` fixtures (Café Luna `NET_30`, Green Grocer Co-op `NET_30`) with per-account `B2BPriceList` fixtures (one negotiated entry per SKU — exactly the shape `negotiatedPrice` resolves, `find()` by `skuId` + `minQuantity` gate).
- Pick account + SKU + quantity → `negotiatedPrice(list, skuId, qty)` resolves the tiered unit price live: ok → unit price + line total (`multiplyMoneyByInteger`); `QUANTITY_BELOW_MINIMUM` → honest pre-refusal (nothing sent to the kernel, `minQuantity` named).
- ConfirmableAction places the order through the REAL kernel: `ADD_CART_LINE` (negotiated unit price, `countQuantity`) → `PLACE_ORDER`. The seed configures the kernel's `minimumOrderPolicy` (USD 150.00 wholesale minimum) so the kernel itself enforces the B2B minimum: below → honest `REJECTED` `B2B minimum order: BELOW_MINIMUM_ORDER` (nothing partial); at/above → a PENDING order with exact kernel totals (kernel truth, DEMO-labelled — a synthetic demo order, never a live purchase order).
- Idempotency: after a placement, "Resubmit the exact same placement" replays the same `commandId` + `idempotencyKey` → kernel `DUPLICATE` with the original receipt, no new effect.
- Net-terms mandate per placed order: `CREATE_PAYMENT_INTENT` with `BANK_TRANSFER` + mandate `tokenRef` → order `paymentStatus` AUTHORIZED (mandate recorded, funds NOT collected — collection stays unavailable). A rail-mode selector offers an ambiguous mandate (`PROCESSING_STATE_UNCLEAR`) → order payment `UNKNOWN` — preserved, never failed (J18 law).
- Placed orders list: kernel `view().allOrders()` for the pad's carts (state, payment status incl. UNKNOWN, terms, due date = placedAt + terms days).

### B. B2B quote review desk — request → review → accept / counter / reject
Permission: `storefront.manage` (held by merchant, store-operator). Existing section, completed.
- Section heading preserved verbatim (`B2B quote requests (DEMO fixtures, local review state)`) — TL gate expectations stay valid.
- Each PENDING quote renders a contract-computed review: the account's CURRENT negotiated price for the requested quantity (`negotiatedPrice` on the current list), the requested break, and the would-be totals.
- Accept → the requested tier entry is applied to the account's LOCAL DEMO price list (labelled; resettable) and the quote flips OFFERED with the contract-computed offer (unit price × units). Counter → the standing tier is formally offered (COUNTERED, contract-computed). Reject → a committed reason set (aria-pressed toggles, J5-desk pattern) then DECLINED with the reason on record.
- The order pad immediately resolves prices from the updated local list (accept → the case-of-24 break at 24+ units).
- Honest boundary preserved: decisions land in LOCAL DEMO STATE only — never kernel truth, never a binding quote contract (no aggregate exists — §3).

### C. Net-terms AR — viewing + aging with the honest unavailable-credit boundary
Permission for the new control: `finance.view-settlements` (held by finance, trust). Existing section, completed; the fixture invoice rows stay visible to every role exactly as before (no regression).
- Section heading preserved verbatim (`Net-terms invoices (DEMO fixtures — AR, not live)`).
- "Run the aging roll-up" (ConfirmableAction, finance-gated): deterministic aging at the committed demo date `2026-10-17T09:00:00Z` over fixture invoices + every kernel-placed on-terms order (amount = order grand total, issued = `placedAt`, due = issued + `PaymentTerms` days, day arithmetic via the contract's `epochDayOf`): buckets not-yet-due / 1-30 / 31-60 / 61-90 / 90+ days past due (empty buckets rendered honestly), per-account outstanding totals (`sumMoney`), per-account fixture `creditLimit` with exposure-vs-limit as labelled fixture math.
- Honest boundary (unchanged law, restated): live credit checks and AR collection do not exist here — shown as unavailable, never simulated; no capture control exists anywhere in the module.

## 3. What stays demo-labelled / blocked, and why (honest gaps)

1. **The quote decision queue itself has no commerce aggregate** — there is no customer-side quote/counter state machine in `@unicom/commerce` (audited: `contract.ts` exports no quote aggregate; the kernel's B2B surface is pricing + cart/order + payment terms). Decisions therefore land in LOCAL DEMO STATE (resettable, DEMO-labelled) with the PRICING inside each decision computed by the real `negotiatedPrice` / `enforceMinimumOrder` contracts. Building a substitute commitment machine would violate the work order; a real quote aggregate needs a contract change (out of scope under frozen architecture).
2. **Live credit checks / AR collection / live wholesale-portal accounts** — no contract, no provider, honestly unavailable (never simulated). The mandate step records a DEMO bank-transfer authorization; it never collects.
3. **Commerce-plane linking** — a formed GroupBuy / executed TradeCycle still creates no order/payment/reservation (separately gated operator decision, `docs/development-state/runtime-integration-state.json` frontier). This lane does not touch it: the order pad places orders DIRECTLY through the cart/order aggregate (the kernel's own documented B2B path), it does not link any other aggregate.
4. **Channel entities** (`CHANNELS` rows) remain fixture descriptions (no channel aggregate in the contract).

## 4. Laws held

- Web imports only `@unicom/commerce` public exports (via the merchant-shared `demo-runtime`/`ui` harness that is already inside the web package); no new dependency edges; no kernel changes (the `minimumOrderPolicy` kernel option is pre-existing public API, exercised exactly as the kernel's own B2B test documents).
- Transfers (unchanged) + the new orders/mandates are deterministic DEMO kernel state — synthetic, never represented as live purchase orders/payments/commitments; every new surface carries the DEMO tag and honest boundary copy.
- `UNKNOWN ≠ FAILED`: the ambiguous-mandate path renders order payment UNKNOWN (unknown tone, preserved, retriable); aging empty buckets and COUNTERED/CANCELLED-style non-failures never collapse into errors.
- Role law: every new action is inside `PermissionBoundary` with the missing permission + holders named (10 roles / 22 permissions model unchanged).
- 400-effective-line law: the module splits into parts files (`b2b-order-pad.tsx`, `b2b-quotes.tsx`, `b2b-ar.tsx`) following the `merchant-storefront/component-parts.tsx` precedent; test file max-lines is exempt (`.oxlintrc.json`).
- Existing gate-pinned strings preserved verbatim (section headings, transfer button labels) so the TL-owned merged-gate expectations do not drift; new selectors for the TL to register are listed in the completion report.
