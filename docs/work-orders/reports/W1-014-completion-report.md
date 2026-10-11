# W1-014 — Commerce-Plane Linking Stage 0: Executable Linking-Law Specifications

**Phase:** Commerce Plane Integration, issue #14
**Branch:** `work/w1-014` (from `64e69b2`)
**Lane:** Commerce kernel test specifications (test-only)
**Write surface held:** `packages/commerce/src/test/**` (6 new test files) + this report. Nothing else.

## 1. BRANCH

`work/w1-014` @ `<final SHA — see git log>` (pushed: yes)

## 2. WHAT WAS SPECIFIED

The seven commerce-plane linking laws (decision packet §2) encoded as executable kernel test specifications against the CURRENT command surface. Six new test files, one per coherent law-cluster, following the existing suite's conventions (typed imports from `../contract.js`, the runtime support helpers, fixture vocabulary from J5/J9, table-driven assertion style where the codebase uses it). Every test PASSES against the current kernel unchanged. Where a law's sub-aspect requires a future-stage command that does not exist yet, a precisely-documented `describe.skip` block records the gap — never faked, never the kernel touched.

| Law # | Law (short) | Test file | Test names | Pass / todo-skip |
|---|---|---|---|---|
| 1 | Formation/execution truth ≠ downstream commitments | `linking-law-separation.test.ts` | forming a GroupBuy creates the formation truth only — no order, payment, reservation, dispute, chargeback, refund, capture, return or fulfillment is created · recording and withdrawing interest creates no downstream commitment (interest is never commitment) · closing a formed GroupBuy and expiring a held GroupBuy create no downstream commitment (formation truth, not commerce commitment) · executing a TradeCycle (ATOMIC COMMIT) creates the execution truth only — no order, payment, reservation or recourse object appears · executing a STAGED_WITH_RECOURSE leg creates no downstream commitment; rolling back preserves the boundary · refusing or lapsing a TradeCycle leg creates no downstream commitment (no leg commits, no object appears) · the boundary survives the full journal fold: reconstructing authoritative state from events alone yields the same empty downstream collections | **7 pass** / 0 skip |
| 2 | Per-side-effect authorization | `linking-law-authorization.test.ts` (laws 2+4 cluster) | a GroupBuy participant's interest consent does not authorize an order — placing an order requires a SEPARATE PLACE_ORDER command with its own idempotency key · a TradeCycle leg's execution consent does not authorize inventory reservation — reserving inventory requires a SEPARATE RESERVE_INVENTORY command | 2 pass / 0 skip |
| 4 | Actor authority derives from the aggregate's own actor laws | `linking-law-authorization.test.ts` (laws 2+4 cluster) | a GroupBuy participant cannot form the deal (organizer-only) — the participant's join consent does not grant formation authority · a TradeCycle giver cannot execute the cycle (initiator-only) — the giver's leg consent does not grant execution authority · a spoofed authorization (actor ≠ authorizingRef) is rejected at the kernel boundary — consent cannot be forged · a non-organizer cannot decide the proposal (organizer-only) — the initiator's open consent does not grant decision authority · the downstream command's actor is independent of the upstream command's actor — different principals issue the downstream command under their own authority | 5 pass / 0 skip |
| 2/4 | (Stage 2 future surface) | `linking-law-authorization.test.ts` → `describe.skip("… Stage 2 LINK_GROUPBUY_TO_ORDER_DRAFT authority (future surface)")` | FUTURE: only the organizer may propose a linked order draft from a formed GroupBuy · FUTURE: only a consenting participant may consent to a draft derived from their share · FUTURE: a withdrawn / never-enrolled participant cannot consent to a draft on their behalf | 0 pass / **3 skip** (Stage 2 — decision packet §4, §7) |
| 3 | Idempotency | `linking-law-idempotency.test.ts` | duplicate PLACE_ORDER returns the original receipt with zero new effects; a different command under the same key conflicts hard · duplicate CREATE_PAYMENT_INTENT returns the original receipt with zero new effects · duplicate COMPLETE_CHECKOUT returns the original receipt with zero new effects (no torn half-checkouts) · duplicate REFUND_PAYMENT returns the original receipt with zero new effects (no double-refund via replay) · duplicate RESERVE_INVENTORY returns the original receipt with zero new effects (no double-reservation) · duplicate FORM_GROUP_BUY returns the original receipt with zero new effects (formation is exactly-once) · duplicate EXECUTE_TRADE_CYCLE returns the original receipt with zero new effects (execution is exactly-once) · a downstream command replayed after subsequent upstream commands affects nothing upstream — the idempotency ledger is global | **8 pass** / 0 skip |
| 5 | Cancellation/compensation separation | `linking-law-compensation.test.ts` | cancelling an order (CANCEL_ORDER) does NOT auto-refund the payment — REFUND_PAYMENT is a separate authorized command · closing a formed GroupBuy and expiring a held GroupBuy create NO refund (no compensation command was issued) · ATOMIC refusal of a TradeCycle creates NO rollback — compensation is not automatic; legs are preserved (REFUSED/CONSENTED/PENDING), none ROLLED_BACK · STAGED_WITH_RECOURSE refusal OPENS RECOURSE but does NOT auto-rollback — ROLLBACK_TRADE_CYCLE_LEG is a separate authorized command · voiding a payment (VOID_PAYMENT) and refunding (REFUND_PAYMENT) are DISTINCT commands — void is not a refund, refund is not a void · releasing a reservation (RELEASE_RESERVATION) is a separate command from cancelling an order — the reservation stays OPEN until its own release | **6 pass** / 0 skip |
| 5 | (Stage 2 future surface) | `linking-law-compensation.test.ts` → `describe.skip("… Stage 2 linked-draft cancellation cascade (future surface)")` | FUTURE: closing a formed GroupBuy marks linked order drafts CANCELLED (never committed, never auto-refunded) · FUTURE: a TradeCycle stop marks linked settlement drafts CANCELLED (never committed, never auto-compensated) | 0 pass / **2 skip** (Stage 2) |
| 6 | UNKNOWN is not FAILED | `linking-law-unknown.test.ts` | resolveAmbiguousPayment maps an ambiguous provider outcome to UNKNOWN — never FAILED — and preserves the native status verbatim · a payment intent created against the scripted double surfaces AUTHORIZED (the canonical happy path) — never flattened to FAILED · a payment intent with an ambiguous provider outcome surfaces UNKNOWN — never FAILED — through the scripted double · the OrderPaymentStatus vocabulary preserves UNKNOWN as a first-class state (never flattened to a failure code) · a TradeCycle leg with ambiguous attribution (a non-giver attempts to authorize) is held UNKNOWN — never FAILED, never silently passed · UNKNOWN legs are NOT authorizations — execution is honestly rejected (NOT_ALL_LEGS_AUTHORIZED), not silently passed · an ambiguous action against a CONSENTED leg is rejected (AMBIGUOUS_ACTION_ON_CONSENTED_LEG) — standing consent is never destroyed by an unattributable actor · a lapsed UNKNOWN leg surfaces EXPIRED (an honest stop) — never FAILED · UNKNOWN disambiguates on the giver's clear action — the leg clears to CONSENTED, the ambiguity is cleared (never a permanent failure) · a captured payment whose settlement observation is unscripted surfaces UNKNOWN — never FAILED — and the captured total is preserved | **10 pass** / 0 skip |
| 6 | (Stage 2 future surface) | `linking-law-unknown.test.ts` → `describe.skip("… Stage 2 linked-draft UNKNOWN recovery (future surface)")` | FUTURE: a linked order draft with a pending placement result surfaces UNKNOWN (never FAILED) · FUTURE: retrying a linked draft's observation when the result resolves returns the original receipt (zero new effects) | 0 pass / **2 skip** (Stage 2) |
| 7 | Refusal must not commit other legs | `linking-law-refusal-isolation.test.ts` | ATOMIC: refusing one leg stops the cycle with NO leg committed (all-or-nothing) · ATOMIC: a pending leg's lapse stops the cycle with NO leg committed (the consenting leg's consent stands, nothing committed) · STAGED_WITH_RECOURSE: refusing one leg after a commit OPENS RECOURSE — the committed leg stays COMMITTED until a separate rollback command · a GroupBuy participant's withdrawal does not cancel or un-commit other participants' interest — each participant's interest is independent · a withdrawal demotes HELD → MONITORING honestly (the pool reflects the live roster) but does not cancel others' interest · formation freezes the consenting-only roster — withdrawn participants are excluded, others are included (refusal/withdrawal isolates the refusing party) · a TradeCycle withdrawal (consented → WITHDRAWN) stops the cycle but preserves the other legs' consent states exactly · the J9 re-plan: refusing Cycle A does not commit Cycle B — each cycle's legs are isolated by cycle id | **8 pass** / 0 skip |
| 7 | (Stage 2 future surface) | `linking-law-refusal-isolation.test.ts` → `describe.skip("… Stage 2 LINK leg isolation (future surface)")` | FUTURE: refusing to LINK one leg's settlement draft leaves the other legs' drafts unlinked · FUTURE: cancelling one leg's linked draft does NOT cancel the other legs' linked drafts (per-draft compensation) | 0 pass / **2 skip** (Stage 2) |

**Totals across the 6 new test files:** 46 passing tests + 9 skipped (Stage 2 future-surface `describe.skip` blocks) = 55 net-new tests.

## 3. VERIFICATION

All four battery commands run personally on the committed tree; exact output numbers below (never estimated).

| Check | Command | Result |
|---|---|---|
| Commerce tests | `corepack pnpm --filter @unicom/commerce exec vitest run` | **Test Files 75 passed (75) · Tests 476 passed \| 9 skipped (485)** — baseline 430/430 (69 files) + 6 net-new files (46 passing + 9 skipped Stage-2 future-surface todos). Every test PASSES against the current kernel unchanged. |
| Web tests (untouched proof) | `corepack pnpm --filter @zcode/web exec vitest run` | **Test Files 1 failed \| 27 passed (28) · Tests 306 passed (306)**. The 1 failing file is `src/commerce-modules/physical-store/scan.test.tsx` — a PRE-EXISTING environmental failure on `main` (`64e69b2`), NOT caused by this lane: it requires `nodeRequire("/home/z/battery/w3-017/node_modules/qrcode")`, a hardcoded path from the W3-017 lane's environment that does not exist in this worker's pod. I touched ZERO files under `packages/web/**` (verified by `git status`); the 306 passing tests and the 1 environmental file-failure are identical to the baseline observed on `main` before any code was written. |
| Lint | `corepack pnpm lint` | **103 warnings / 0 errors** — identical to the phase baseline; **zero** warnings from the 6 new `linking-law-*.test.ts` files. |
| Architecture | `corepack pnpm architecture:check` | **architecture: OK · violations: 0 · baseline: 0 · new: 0**. All 6 new test files are ≤ 400 lines (max: 399 — `linking-law-refusal-isolation.test.ts`; all others ≤ 393). |

## 4. HONEST GAPS

1. **Stage 2 linking commands do not exist on the kernel surface.** The decision packet §4/§7 defers `LINK_GROUPBUY_TO_ORDER_DRAFT` / `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT` (Option A, kernel-native draft-linking) to Stage 2, gated on Stage 1 evidence. Nine sub-aspects of the seven laws that reference a future LINK command are recorded as `describe.skip` blocks with the exact future stage that introduces them — never faked as passing, never the kernel touched. The laws ARE observable on the existing formation/execution + downstream surface (the 46 passing tests above); only the Stage-2-specific link-draft cascade is deferred.

2. **Web `scan.test.tsx` pre-existing environmental failure (NOT my work).** The file hardcodes `nodeRequire("/home/z/battery/w3-017/node_modules/qrcode")` — a path from the W3-017 lane's environment that does not exist in this worker's pod (`/home/z/my-project/unicom/node_modules/qrcode` is where it would resolve if the path were portable). This failure is present on `main` (`64e69b2`) BEFORE this lane's work begins; I touched nothing in `packages/web/**` (forbidden by the hard boundaries). Fixing it would require either modifying `packages/web/src/commerce-modules/physical-store/scan.test.tsx` (outside my write surface) or installing `qrcode` at the hardcoded path (a system mutation). The 27 other web test files / 306 tests pass identically to baseline.

3. **`pnpm` availability required a user-local corepack shim.** `corepack enable` failed (no root for the system symlink); I prepared pnpm 10.33.2 via `corepack prepare pnpm@10.33.2 --activate` into a writable `COREPACK_HOME` and invoked it through a wrapper in `/home/z/my-project/bin/pnpm`. The lockfile was respected (`--frozen-lockfile`); no dependencies were added or changed. This is a local environment accommodation, not a write-surface boundary violation (the repo's `package.json`/`pnpm-lock.yaml` are untouched).

4. **The clone location is `/home/z/my-project/unicom` (not `/home/user/unicom`).** This worker's user is `z` with home `/home/z/my-project`; `/home/user/` is not writable. The clone location is local working state only — it does not affect the repo's write surface (the boundaries are about which paths INSIDE the repo I touched, verified by `git status` to be exactly the 6 new test files + this report).

## 5. BOUNDARIES HELD

Confirmed: ALL writes are inside the allowed surface.

```
$ git status --short
?? packages/commerce/src/test/linking-law-authorization.test.ts
?? packages/commerce/src/test/linking-law-compensation.test.ts
?? packages/commerce/src/test/linking-law-idempotency.test.ts
?? packages/commerce/src/test/linking-law-refusal-isolation.test.ts
?? packages/commerce/src/test/linking-law-separation.test.ts
?? packages/commerce/src/test/linking-law-unknown.test.ts
```

Plus this report at `docs/work-orders/reports/W1-014-completion-report.md` (committed in the same push).

- ZERO modifications to kernel source (`packages/commerce/src/domain/**`, `runtime/**`, `projection/**`).
- ZERO modifications to existing tests.
- ZERO modifications to `packages/web/**`, `packages/experience/**`, `package.json`/`pnpm-lock.yaml`, `.github/**`, `docs/development-state/**`.
- ZERO new dependencies (lockfile respected via `--frozen-lockfile`).
- ZERO production deploy, ZERO provider credentials, ZERO live API calls.
- The token was NEVER committed or echoed (the remote URL with the token was set via `git remote set-url`; `git log`/`git status` show only the public `https://github.com/payswapdotorg/UniCom.git` URL on inspection — the token is in the local git config only).
- Pushed ONLY to `work/w1-014` (never `main`).
