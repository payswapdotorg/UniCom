# W2-015 — Commerce-Plane Linking Stage 1: Host-Side Human-Confirmed Linked Order Drafts

**Phase:** Commerce Plane Integration, issue #14
**Branch:** `work/w2-015` (from `318c737`)
**Lane:** Web host surfaces (rendered linking affordance)
**Write surface held:** `packages/web/src/commerce-modules/{buyer-groupbuy,peer-tradecycle,merchant-groupbuy-review}/**` + this report. The shared helper lives INSIDE `buyer-groupbuy/linking-draft.ts` (per the work order's explicit allowance) and is imported read-only by the other two modules. Nothing else.

## 1. BRANCH

`work/w2-015` @ `<final SHA — see git log>` (pushed: yes)

## 2. CONTRACT-TO-SURFACE MAP

The affordance prefills the EXISTING typed kernel command path — it issues NO new kernel command. The prefill is a display object that renders the shape of the existing `ADD_CART_LINE` → `PLACE_ORDER` commands (the same path the J12 wholesale order pad and the J10 storefront use today), pre-filled with the source aggregate's facts. Placement still requires the existing human confirmation flow unchanged.

| Surface | Source aggregate state | Prefill source | Commands prefilled (display only) | Role gating (permission) | Where the affordance renders |
|---|---|---|---|---|---|
| `buyer-groupbuy` (J4 — open pools) | GroupBuy FORMED | `groupBuyDraftPrefillOf(aggregate, share, buyerPrincipal)` — derives sku, group price (frozen at formation), the buyer's share units, a DEMO cart id | `ADD_CART_LINE` (cart, sku, units, unit price) → `PLACE_ORDER` (cart, merchant) | `groupbuy.express-interest` (Buyer) | Inside the FORMED block (`FormedGroupBuyPanel` in `formed-panel.tsx`), only when the buyer is in the frozen roster |
| `buyer-groupbuy` (J5 — latent demand) | GroupBuy FORMED | same as above (the latent-demand path forms `w2ld-prop-1` with the buyer in the roster) | same as above | `groupbuy.express-interest` (Buyer) | Inside `FormedDealPanel` in `latent-demand-pool.tsx` |
| `peer-tradecycle` (J9 — multi-hop trades) | TradeCycle leg COMMITTED | `tradeCycleLegDraftPrefillOf(cycle, leg, actingPrincipal)` — derives the leg's offered item ref, units=1, price=0 (the trade-cycle aggregate carries no money — the human fills the price under their own authority) | `ADD_CART_LINE` → `PLACE_ORDER` | `tradecycle.consent-leg` (Buyer) | Inside each `LegCard` in `leg-cards.tsx`, only when `leg.consentState === "COMMITTED"` — per-leg (law 7) |
| `merchant-groupbuy-review` (J5 — merchant desk) | GroupBuy FORMED | `groupBuyDraftPrefillOf(aggregate, roster[0], DEMO_MERCHANT_ACTOR)` — the organizer may draft a linked order on behalf of the first consenting participant | `ADD_CART_LINE` → `PLACE_ORDER` | `groupbuy.review-proposal` (Merchant, Approver) | Inside `FormedMerchantPanel` in `formed-section.tsx`, only for the FORMED pool (`w3gr-prop-8`) |

**Provenance on-surface:** every affordance renders the source aggregate id, the source kind (`GROUP_BUY_FORMED` / `TRADECYCLE_LEG_EXECUTED`), the acting principal, and the consent basis — all visible to the human before they confirm.

**Metadata boundary (honest gap):** the existing typed `PLACE_ORDER` command carries no metadata field for a source aggregate id. The prefill renders the reference on-surface and in the eventual receipt's subject line (the `cartId` is DEMO-labelled `cart-link-gb-{aggregateId}` / `cart-link-tc-{cycleId}-leg-{n}`). The kernel contract is NOT extended (forbidden by the work order).

## 3. SEVEN-LAW SELF-AUDIT

1. **Formation/execution truth is separate from downstream commitments** — The affordance ONLY ever prefills the existing `ADD_CART_LINE` / `PLACE_ORDER` command surface; it issues NO new kernel command itself. The `groupBuyDraftPrefillOf` helper throws if the aggregate is NOT FORMED; `tradeCycleLegDraftPrefillOf` throws if the leg is NOT COMMITTED — formation/execution truth must exist before a prefill is even derived. The recorded draft is local DEMO state (a `LinkedDraftLedger`), never kernel truth. ✅
2. **Per-side-effect authorization** — The draft's prefill carries the acting principal and consent basis as on-surface provenance (text only — NOT an authorization token). Placing the order still requires a SEPARATE `PLACE_ORDER` command under the acting human's own authority and idempotency key (the existing confirmation flow, unchanged). The GroupBuy participant's join consent does NOT authorize the order; the TradeCycle leg's execution consent does NOT authorize inventory reservation. Each downstream object requires its own actor-authorized command. ✅
3. **Idempotency** — The draft itself carries no idempotency key (it's not a command). The eventual `PLACE_ORDER` (if the human proceeds) uses the existing kernel idempotency semantics: the same envelope replayed returns the ORIGINAL receipt and produces zero new effects (certified in W1-014 law 3 and the existing `certification-idempotency` suite). The `LinkedDraftLedger.record` is idempotent by cart id (re-recording the same cart id overwrites the prior entry — DEMO state, not a command). ✅
4. **Actor authority** — The affordance renders ONLY for actors whose role permits order placement: `groupbuy.express-interest` (buyer side), `groupbuy.review-proposal` (merchant side), `tradecycle.consent-leg` (participant side). Insufficient role = honest unavailable state via the established `PermissionGate` pattern (not silent absence). The buyer's share must be in the frozen roster (they consented); a non-consenting/withdrawn participant sees no draft. The organizer may draft on behalf of a consenting participant, but placing still requires the participant's own `PLACE_ORDER` authority. ✅
5. **Cancellation/compensation separation** — The draft is a DRAFT: placing the order still requires the existing confirmation flow unchanged (a draft is not a commitment). Cancelling the draft (or the upstream aggregate) creates NO refund/unreserve — those remain separately-authorized commands (`REFUND_PAYMENT`, `RELEASE_RESERVATION`, `ROLLBACK_TRADE_CYCLE_LEG`). The recorded draft states explicitly: "The draft created NO order, NO payment, NO reservation, NO recourse case." ✅
6. **UNKNOWN is not FAILED** — The draft adds nothing to the payment/observation surface. If a downstream result is pending (e.g. a payment intent's status), it surfaces UNKNOWN through the existing payment-boundary vocabulary (unchanged). The draft's prefill carries the aggregate's frozen facts (GroupBuy formation) or the leg's item ref (TradeCycle execution) — both are deterministic kernel truth, never ambiguous. ✅
7. **Refusal must not commit other legs** — The TradeCycle leg affordance is per-leg: it renders ONLY on `leg.consentState === "COMMITTED"`. A stopped cycle (REFUSAL/WITHDRAWAL/EXPIRY) renders NO affordance on any leg (no leg is committed). Refusing to draft one leg never drafts another — each leg's affordance is independent. The GroupBuy affordance is per-share: only the buyer's own share (if in the frozen roster) triggers a draft. ✅

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **32 files · 349 passed (349)** — baseline 323/323 (28 files) + 4 net-new files (26 tests: 5 buyer-groupbuy + 4 peer-tradecycle + 4 merchant-groupbuy-review + 13 helper unit). Every test PASSES. |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to the phase baseline; **zero** warnings from the new `linking-draft*` files. |
| Architecture | `pnpm architecture:check` | **architecture: OK · violations: 0 · baseline: 0 · new: 0**. All new files ≤ 400 effective lines (max: 284 — `latent-demand-pool.tsx` modified). |
| Commerce tests (untouched proof) | `pnpm --filter @unicom/commerce exec vitest run` | **75 files · 476 passed \| 9 skipped (485)** — identical to the W1-014 baseline. I touched ZERO files in `packages/commerce/**`. |

**Browser evidence:** this worker's sandbox has NO browser available (headless Chromium cannot launch in this pod). The vitest coverage above is thorough (26 tests across the three surfaces + the helper). The TL will capture the real-browser lane evidence in the W1-010 format (step list, body-text expectations, screenshots, `-console.txt` captures) against the committed tree.

## 5. KILL SWITCH + DEMO LABELLING

**Kill switch:** `LINKING_DRAFT_ENABLED` is a single module-level constant in `packages/web/src/commerce-modules/buyer-groupbuy/linking-draft.ts`. When `false`, every affordance panel (`GroupBuyLinkedDraftAffordance` / `TradeCycleLegLinkedDraftAffordance`) renders the honest `LINKING_DISABLED_LABEL` ("Linked-order drafting is disabled on this surface (kill switch OFF).") instead of the affordance — never a silent absence. The helper unit tests verify the constant is a boolean and the label is non-empty. Setting it to `false` is the one-line kill switch; re-enabling is the same line.

**Demo labelling:** every prefill value is DEMO-labelled via the existing `DemoTag` component (the established on-surface convention). The recorded draft states "DEMO state — no command issued". The cart ids are DEMO-labelled (`cart-link-gb-{aggregateId}` / `cart-link-tc-{cycleId}-leg-{n}`). The `LinkedDraftLedger` is local DEMO state, reset by the existing "Reset demo" button on each surface. No live commerce side effects of any kind.

## 6. HONEST GAPS

1. **Metadata boundary:** the existing typed `PLACE_ORDER` command carries no metadata field for a source aggregate id. The prefill renders the reference on-surface (provenance: source aggregate id, acting principal, consent basis) and the cart id is DEMO-labelled with the aggregate id embedded. The receipt/order does NOT carry the source aggregate id in a typed metadata field — the reference is on-surface only. The kernel contract is NOT extended (forbidden). Stage 2 (decision packet §4) may introduce kernel-native `LINK_GROUPBUY_TO_ORDER_DRAFT` / `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT` commands that carry the reference as a typed field; until then, the boundary is honest.

2. **TradeCycle price prefill:** the TradeCycle aggregate carries no `Money` (items are opaque refs). The prefill records `unitPrice: 0` and `units: 1` — the human MUST fill in the price under their own authority (the draft is a DRAFT, not a commitment, and the price is the acting human's to set). This boundary is rendered on-surface ("The price is the acting human's to set (the trade-cycle aggregate carries no money).") and in the consent basis.

3. **Merchant-side draft is per-share but renders only the first consenting participant's share:** the merchant organizer may draft a linked order on behalf of ANY consenting participant, but the surface currently renders only the first share in the roster (`roster[0]`). A future iteration could render a per-participant draft picker; for Stage 1, the first-share draft demonstrates the law (per-side-effect authorization — each participant's share is its own separately-authorized draft). This is a UX scope decision, not a law gap.

4. **No real-browser lane evidence captured by this worker:** the sandbox has no headless browser. The vitest coverage (26 tests) is thorough; the TL will capture the W1-010-format evidence against the committed tree.

5. **`pnpm` availability required a user-local corepack shim** (same as W1-014): `corepack enable` failed (no root); I used `corepack prepare pnpm@10.33.2 --activate` into a writable `COREPACK_HOME` + wrapper. The lockfile was respected (`--frozen-lockfile`); zero dependency changes. This is a local environment accommodation, not a write-surface boundary violation.

## 7. BOUNDARIES HELD

`git status --short` shows writes ONLY inside the allowed surface:

**New files (all inside `packages/web/src/commerce-modules/{buyer-groupbuy,peer-tradecycle,merchant-groupbuy-review}/**`):**
- `buyer-groupbuy/linking-draft.ts` — the shared helper (feature flag, prefill model, provenance, ledger)
- `buyer-groupbuy/linking-draft-panel.tsx` — the affordance panel components (GroupBuy + TradeCycle)
- `buyer-groupbuy/formed-panel.tsx` — the extracted FORMED panel (buyer side, J4)
- `buyer-groupbuy/component-gates.tsx` — the extracted commitment gates (pure code motion from component.tsx)
- `buyer-groupbuy/linking-draft.test.tsx` — 5 component tests
- `buyer-groupbuy/linking-draft.helper.test.ts` — 13 unit tests
- `merchant-groupbuy-review/formed-section.tsx` — the extracted FORMED section (merchant side)
- `merchant-groupbuy-review/linking-draft.test.tsx` — 4 component tests
- `peer-tradecycle/linking-draft.test.tsx` — 4 component tests

**Modified files (all inside the allowed surface):**
- `buyer-groupbuy/component.tsx` — wired the ledger + `FormedGroupBuyPanel`; extracted gates (net −147 lines)
- `buyer-groupbuy/latent-demand.tsx` — wired the ledger + `FormedDealPanel` props
- `buyer-groupbuy/latent-demand-pool.tsx` — added affordance to `FormedDealPanel`
- `peer-tradecycle/component.tsx` — wired the ledger + `draftLedger` prop to `LegCard`
- `peer-tradecycle/leg-cards.tsx` — added `TradeCycleLegLinkedDraftAffordance` on COMMITTED legs
- `merchant-groupbuy-review/component.tsx` — wired the ledger + `PoolStateDetail` props
- `merchant-groupbuy-review/component-parts.tsx` — extracted FORMED block to `FormedMerchantPanel`

- ZERO modifications to `packages/commerce/**` (kernel) — verified by the commerce test battery (476 passed | 9 skipped, identical to W1-014 baseline).
- ZERO modifications to `packages/experience/**`.
- ZERO modifications to other web modules (`merchant-storefront`, `merchant-b2b` — READ-ONLY precedents).
- ZERO modifications to existing tests outside my modules.
- ZERO modifications to `package.json`/`pnpm-lock.yaml`, `.github/**`, `docs/development-state/**`.
- ZERO new kernel commands, ZERO contract changes, ZERO payments/reservations/recourse automation, ZERO automatic linking.
- ZERO new dependencies (lockfile respected via `--frozen-lockfile`).
- ZERO production deploy, ZERO provider credentials, ZERO live commerce side effects.
- The token was NEVER committed or echoed. Pushed ONLY to `work/w2-015` (never `main`).
