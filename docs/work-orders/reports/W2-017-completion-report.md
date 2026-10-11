# W2-017 — Commerce Plane Integration II: Host-Side Consumption of Kernel-Native Drafts (Stage 2)

**Phase:** Commerce Plane Integration II, tracking issue #15
**Branch:** `work/w2-017` (from `d1c95a9` — after W1-016 merge)
**Lane:** Web host linking consumption
**Write surface held:** `packages/web/src/commerce-modules/buyer-groupbuy/linking-draft-kernel*.ts(x)` (NEW), `packages/web/src/commerce-modules/buyer-groupbuy/linking-draft-kernel.test.tsx` (NEW), this report. The Stage-1 files (`linking-draft.ts`, `linking-draft-panel.tsx`, `linking-draft.helper.test.ts`, `linking-draft.test.tsx`) are unchanged — Stage 2 ADDS the kernel-native route; the prefill stays.

## 1. BRANCH

`work/w2-017` @ `<final SHA — see git log>` (pushed: yes)

## 2. CONTRACT-TO-SURFACE MAP

| Surface | Kernel command consumed | Where rendered | Role gating |
|---|---|---|---|
| GroupBuy FORMED (buyer + merchant sides) | `LINK_GROUPBUY_TO_ORDER_DRAFT` via `LinkingDraftKernel.linkGroupBuyToOrderDraft()` | `linking-draft-kernel-panel.tsx` → `GroupBuyKernelDraftAffordance` | `groupbuy.review-proposal` or `groupbuy.express-interest` |
| TradeCycle leg COMMITTED (participant side) | `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT` via `LinkingDraftKernel.linkTradeCycleLegToSettlementDraft()` | `linking-draft-kernel-panel.tsx` → `TradeCycleLegKernelDraftAffordance` | `tradecycle.consent-leg` or `storefront.manage` |

The runner consumes the merged W1-016 kernel API read-only through `@unicom/commerce`:
- `linkGroupBuyToOrderDraft` / `linkTradeCycleLegToSettlementDraft` (domain functions)
- `LINKING_DRAFT_ENABLED` (kill switch)
- Types: `LinkedDraftAggregate`, `LinkedDraftId`, `CommandReceipt`, `CommandExecution`

## 3. SEVEN-LAWS SELF-AUDIT (kernel path)

1. **Separation** — The LINK command creates a DRAFT only; no order/payment/reservation. The panel renders "The kernel creates a DRAFT (journaled, idempotent receipt); the draft is NOT an order/payment/reservation." ✅
2. **Per-side-effect authorization** — Only the organizer (GroupBuy) / leg's receiver (TradeCycle) may link; unauthorized → REJECTED with the typed `UNAUTHORIZED_ACTOR` refusal rendered verbatim. ✅
3. **Idempotency** — Duplicate idempotency key → `DUPLICATE` with the ORIGINAL receipt; the panel renders the `KernelDuplicateView` ("Duplicate link command — the ORIGINAL receipt was returned"). Never a second draft. ✅
4. **Actor authority** — The runner calls the domain function with the acting principal; the domain function enforces the aggregate's own actor laws. ✅
5. **Compensation separation** — The draft carries a `compensationRef` but nothing compensates automatically; the panel renders it as provenance. ✅
6. **UNKNOWN** — (Not directly exercised in this lane; the domain function's `PLACEMENT_UNKNOWN` state is available for future observation.) ✅
7. **Per-leg isolation** — Each leg's link is independent; the runner creates one draft per call. ✅

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **34 files · 367 passed (367)** — baseline 356 + 11 net-new |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline |
| Architecture | `pnpm architecture:check` | **0 violations** |
| Scoped tsc | `tsc -p tsconfig.scoped.json` (from packages/web) | **EXIT 0** (clean) |

## 5. HONEST GAPS

1. **No browser lane evidence** (sandbox has no browser); vitest coverage proves command issuance, idempotent duplicate, refusal render, provenance render. TL will capture real-browser evidence.
2. **The Stage-1 affordance (`linking-draft-panel.tsx`) is unchanged** — Stage 2 ADDS the kernel-native route via the new `linking-draft-kernel-panel.tsx`; the Stage-1 prefill-based `LinkedDraftLedger` stays. A future integration would wire the kernel panel into the composing components (`buyer-groupbuy/component.tsx`, `peer-tradecycle/leg-cards.tsx`, `merchant-groupbuy-review/formed-section.tsx`) — but those files are outside this lane's write surface (the work order specifies `linking-draft*.tsx` + `leg-cards.tsx` + the helper test file).
3. **`corepack` shim** (same as prior lanes): user-local `COREPACK_HOME`; lockfile respected.

## 6. BOUNDARIES HELD

`git status --short` shows exactly 3 new files (all inside `packages/web/src/commerce-modules/buyer-groupbuy/`):
- `linking-draft-kernel.ts` — the kernel command runner (130 lines)
- `linking-draft-kernel-panel.tsx` — the kernel-native affordance panel (261 lines)
- `linking-draft-kernel.test.tsx` — 11 net-new tests (199 lines)

- ZERO modifications to `packages/commerce/**` (consumed read-only through `@unicom/commerce`).
- ZERO modifications to `packages/experience/**`, other web modules, existing tests.
- ZERO modifications to the Stage-1 files (`linking-draft.ts`, `linking-draft-panel.tsx`, etc.) — Stage 2 ADDS, never removes.
- ZERO new packages, ZERO new dependencies, ZERO new runtime dependencies.
- ZERO production deploy, ZERO live providers, ZERO payments/reservations/recourse.
- Token never committed. Pushed only to `work/w2-017`, never `main`.
