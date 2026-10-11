# W2-014 — J12 B2B Rendered-Flow Completion (lane manifest)

**Phase:** Product Completion & Build Readiness, issue #12
**Branch:** `work/w2-014` (from `604fae5`) · **Commits:** `2bdbbb9` (contract-to-UI map) → `d946310` (implementation + tests) → `0f2825a` (TL merge-prep fix)
**Vehicle history (honest):** worker vehicle 1 was interrupted by an agent-context deadline mid-implementation (the audit map was committed first per the work order); worker vehicle 2 (continuation) aligned the test expectations, committed the implementation, and was interrupted during verification; the TL harvested the lane — applied the one-line merge-prep fix (unused `B2B_QUOTES` import), ran the full verification battery, and produced the real-browser evidence below. All numbers in this report were observed by the TL on the committed tree.

## 1. What the audit found (committed first: `docs/product-completion/w2-014/CONTRACT-TO-UI-MAP.md`)

Seven J12 elements mapped against `packages/commerce/src/contract.ts` (the only public commerce entrypoint) with no inference from types alone:

| # | Element | Audit verdict | Outcome |
|---|---|---|---|
| 1 | Multi-location stock | kernel-driven, complete | unchanged |
| 2 | Inter-location transfers | kernel-driven, complete | unchanged |
| 3 | Channel price breaks | **contract-only** (`negotiatedPrice` / `enforceMinimumOrder` / `MinimumOrderPolicy` had zero rendered consumers) | completed: interactive wholesale order pad |
| 4 | B2B quote queue | partial (approve-only local demo state) | completed as a review desk (accept/counter/reject-with-reason) |
| 5 | Net-terms AR | static fixture illustration | completed: aging roll-up with the contract's pure day arithmetic |
| 6 | Net-terms payment on an order | **absent** (`CREATE_PAYMENT_INTENT` + bank-transfer mandate never rendered) | completed inside the order pad (mandate rails) |
| 7 | Live credit checks / AR collection / live portals | no contract exists | stays honestly unavailable (no substitute built) |

## 2. What was implemented (map §2, all inside the frozen architecture)

- **`b2b-order-pad.tsx`** — per-account committed price lists resolved with the REAL `negotiatedPrice` contract (minimum-quantity gate, exact totals); placement travels as typed kernel commands (`ADD_CART_LINE` at the negotiated unit price → `PLACE_ORDER` under the kernel's `minimumOrderPolicy`); `BELOW_MINIMUM_ORDER` is surfaced as an honest refusal (nothing partial); per-order net-terms bank-transfer mandate rails (normal → `AUTHORIZED`, ambiguous → `UNKNOWN` preserved, never FAILED) using the kernel's own canonical net-terms mandate shape; duplicate placement returns the original receipt (no new effect).
- **`b2b-quotes.tsx`** — quote review desk: every price contract-resolved on the account's committed list; decisions (accept the requested break / counter at the standing tier / reject with a committed reason) land in LOCAL DEMO STATE only (no quote aggregate exists in the kernel — labelled, never binding; reset restores the committed queue); an accepted tier updates the account's LOCAL DEMO price list which the order pad resolves immediately.
- **`b2b-ar.tsx`** — AR aging roll-up: two committed fixture invoices plus every wholesale order placed on terms (kernel demo state derived into an AR view — never a live AR document); aging computed at the fixed demo date with `epochDayOf` (not-yet-due never collapses into overdue; OVERDUE stays a fact about time); collecting an invoice stays honestly unavailable (a live payment action does not exist here).
- **`component-parts.tsx`, `kernel-run.ts`, refactored `component.tsx`/`fixtures.ts`/`module.ts`** — the 400-effective-line law respected (parts split); fixtures bumped with deterministic reset, fixed demo clock, DEMO labels everywhere; role/permission laws preserved (order pad + quotes gated by their module permissions; AR aging gated by `finance.view-settlements` — held by finance, trust).
- **Channel tier ladder** stays a committed DEMO fixture illustration (no per-channel price-book aggregate exists) — labelled, with the per-account negotiated lists named as the contract-priced surfaces.

## 3. Real-browser evidence (TL-captured, W1-010 format: numbered `.png` + `-body.txt` + `-console.txt`)

`docs/product-completion/w2-014/evidence/` — 11 steps, dedicated headless Chromium (Playwright `chromium.launch`, the committed harness modules imported read-only; vite dev on a free port served THIS worktree):

| Steps | Story |
|---|---|
| 01 | roles held: `store-operator` + `finance` (visible role checkboxes, `data-held=true`) |
| 02 | J12 surface (order pad + quote desk + AR rendered) |
| 03 | order pad resolve: Café Luna · syrup ×30 → negotiated USD 5.20/unit (min 5), 30 × 5.20 = **156.00 meets the 150.00 wholesale minimum** |
| 04 | placement through the kernel (synthetic DEMO kernel state — never a live purchase order) |
| 05 | net-30 mandate recorded — normal rail: **AUTHORIZED, never collected** |
| 06 | AR aging roll-up incl. the kernel-derived invoice; OVERDUE a fact about time |
| 07 | quote-b2b-1 acceptance recorded (LOCAL DEMO STATE) |
| 08–09 | below-minimum: 24 × 5.20 = 124.80 — the pad warns BEFORE placement, the kernel's own gate refuses honestly (**BELOW_MINIMUM_ORDER**, no order) |
| 10 | fresh context, NO roles held — the order pad is absent and the AR section renders the honest permission block (`Blocked: requires finance.view-settlements — held by finance, trust`) |
| 11 | quote rejection with a committed reason (recorded with the DECLINED state, local demo state) |

All 11 `-console.txt` captures: zero errors / zero pageerrors.

## 4. Verification (TL-observed on the committed tree `0f2825a`)

| Check | Result |
|---|---|
| `corepack pnpm --filter @zcode/web exec vitest run` | **306 passed / 306** (27 files; baseline 293 + 13 net-new J12 tests; module suite 21/21) |
| `corepack pnpm lint` | **103 warnings / 0 errors** — identical to the phase baseline; **zero** warnings from merchant-b2b files |
| `corepack pnpm architecture:check` | **0 violations** (baseline 0, new 0) |
| scoped `tsc -p tsconfig.scoped.json` (2048 MB heap, ring paused) | **clean** (exit 0) |

## 5. Honest gaps / merge-time notes for the TL

- The quote-decision queue and the channel tier ladder remain LOCAL DEMO STATE / committed fixtures — no kernel aggregate exists for them; building one is out of scope (the commerce-plane linking decision is separately gated by the operator).
- Live credit checks, AR collection and real wholesale-portal accounts stay honestly unavailable — no substitute was built.
- New selectors/states the TL should register in the merged browser gate: `#cm-b2b-account`, `#cm-b2b-sku`, `#cm-b2b-units`, `#cm-b2b-rail`, action labels `Place the wholesale order (…)`/`Place the order (kernel)`, `Record the net 30 bank-transfer mandate for …`/`Record the mandate (demo rail)`, `Run the aging roll-up (as of 2026-10-17, the fixed demo date)`/`Run the roll-up`, quote actions `Accept the requested break for …`/`Counter … at the standing tier`/`Reject quote-b2b-1 — record the reason` (+ reason radios), surface headings `Wholesale order pad — price breaks → kernel order`, `B2B quote requests (DEMO fixtures, local review state)`, `Net-terms invoices (DEMO fixtures — AR, not live)`, the honest refusal copy `BELOW_MINIMUM_ORDER`, and the finance permission block `Blocked: requires finance.view-settlements`.
- Environmental note: the pod's scoped-tsc and lane evidence both required pausing the resident CDP ring (established precedent, restored cleanly after); the lane vitest/lint/architecture runs needed no pausing.
