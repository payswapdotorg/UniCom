# W1-012 Completion Report — Commerce-Kernel Execution Aggregates (TradeCycle execution, GroupBuy formation)

Lane: Worker 1 — Commerce Truth / Economic Execution (continuation vehicle 2)
Branch: `work/w1-012` — commits `1f034e5` (seam, prior vehicle) → `a82c015` (runtime wiring + twin projection) → `7099dc3` (scenario tests) → the report commit (this file)
Work order: `docs/work-orders/W1-012.md` · Phase registry: `docs/development-state/runtime-integration-state.json`

## 1. What landed

Both execution aggregates are kernel truth on top of the committed seam (`1f034e5`,
TL-verified: domain types + typed command payloads + 14 domain machine tests):

- **GroupBuy formation aggregate (Scope A)** — full command surface, kernel fold,
  snapshot collection, and the J5 fixture space as kernel scenarios.
- **TradeCycle execution aggregate (Scope B)** — full command surface, kernel fold,
  snapshot collection, and the J9 fixture space as kernel scenarios.
- **Twin projection extension (the shared surface the prior vehicle missed)** —
  the kernel snapshot extension alone left the Commerce Twin (the derived mirror
  whose canonical equivalence the certification battery proves) unaware of the
  three new collections, breaking **83 twin-equivalence tests**. Extended per the
  twin discipline: an independent twin-side fold, the COLLECTIONS comparison list,
  and a zero-semantic-change mechanical extraction (`twin-order-fold.ts`) that
  holds `twin-state.ts` under the architecture 400-line law.

## 2. New command surfaces (for W2-013 / W3-016 consumption)

All commands are dispatched through `CommerceKernel.execute(commandEnvelope(...))`
with typed idempotency keys on the envelope (replays return `DUPLICATE` with the
original receipt; key reuse for a different command is an
`IDEMPOTENCY_KEY_CONFLICT` rejection). Payload types are re-exported from the one
public seam `@unicom/commerce` `contract.ts` (`GroupBuyCommandPayload`,
`TradeCycleCommandPayload` — members of `RuntimeCommandPayload`).

### 2.1 GroupBuy formation (subject `GROUP_BUY`; helpers `groupBuySubject(id)`)

| Command type | Payload shape (required fields) | Actor law |
|---|---|---|
| `OPEN_GROUP_BUY_PROPOSAL` | `{ type, groupBuy: GroupBuyAggregate }` — must open `PENDING` at revision 1; thresholds positive integers; one currency across proposed/list price; `windowClosesAt` ISO instant | the initiator (`groupBuy.initiatorRef`) only |
| `RECORD_GROUP_BUY_INTEREST` | `{ type, groupBuyId, participantRef, quantity: CountQuantity, consentTerms: string }` — units > 0, non-empty consent terms | the participant themself (actor = `participantRef`) |
| `WITHDRAW_GROUP_BUY_INTEREST` | `{ type, groupBuyId, participantRef }` | the participant themself; only before formation (the second confirmation) |
| `DECIDE_GROUP_BUY_PROPOSAL` | `{ type, groupBuyId, trigger: "ACCEPT" \| "ACCEPT_COUNTER" \| "COUNTER" \| "REJECT", counterTerms?, rejectionReason? }` — COUNTER requires counter terms (same currency); REJECT requires a reason; ACCEPT_COUNTER never smuggles replacement terms | organizer for ACCEPT/COUNTER/REJECT; initiator for ACCEPT_COUNTER |
| `FORM_GROUP_BUY` | `{ type, groupBuyId, groupPrice: Money }` — only from HELD (threshold met), same currency; freezes exact pool value + consenting-only roster | the organizer only (explicit step, never automatic) |
| `CLOSE_GROUP_BUY` | `{ type, groupBuyId, reason? }` | the organizer only |
| `EXPIRE_GROUP_BUY` | `{ type, groupBuyId }` | the organizer or SYSTEM (window close observation) |

**State machine** (`GroupBuyFormationState`): proposal states PENDING →
ACCEPT→MONITORING | COUNTER→COUNTERED→ACCEPT_COUNTER→MONITORING | REJECT→REJECTED
(reason) | EXPIRE→EXPIRED; pool states MONITORING ⇄ HELD (THRESHOLD_MET /
THRESHOLD_LOST derived from live interest — BOTH participant count and unit
count must hold), HELD → FORM→FORMED | EXPIRE/CLOSE. FORMED freezes
`GroupBuyFormationTerms { groupPrice, poolValue = groupPrice × live units (exact
integer math), formedAt }` + the consenting-only roster (live, non-withdrawn
interests). REJECTED/EXPIRED/CLOSED/FORMED are terminal for their tracks.
Interest is NEVER commitment — no order, payment or reservation is created.

**Kernel reads**: `kernel.view().executionOps()` → `groupBuy(id)`,
`allGroupBuys()`, `interestOf(groupBuyId, principalKey)`, `interestsFor(groupBuyId)`,
`allGroupBuyInterests()`; `kernel.snapshot().groupBuys / .groupBuyInterests`.

### 2.2 TradeCycle execution (subject `TRADE_CYCLE`; helpers `tradeCycleSubject(id)`)

| Command type | Payload shape (required fields) | Actor law |
|---|---|---|
| `OPEN_TRADE_CYCLE` | `{ type, cycle: TradeCycleExecution }` — must open `OPEN` at revision 1; legs validated: ≥1 leg, ≤ `bounds.maxHops`, canonical 0-based indexes, every leg PENDING with non-empty `offeredItemRef`, closed cycle (each receiver is the next giver, cyclically); STAGED_WITH_RECOURSE requires a `recoursePlanRef` | the initiating principal only |
| `AUTHORIZE_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex, authorizingRef, authorizationRef: string }` — non-empty authorization reference | actor = `authorizingRef`; the kernel then decides clear (giver) vs ambiguous attribution |
| `REFUSE_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex, refusingRef, reason? }` | actor = `refusingRef`; clear vs ambiguous decided against the leg's giver |
| `WITHDRAW_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex, withdrawingRef }` | actor = `withdrawingRef`; only a CONSENTED giver may withdraw |
| `LAPSE_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex }` — consent-window observation (PENDING or still-UNKNOWN legs) | any principal may record |
| `EXECUTE_TRADE_CYCLE` | `{ type, cycleId }` — ATOMIC only; requires ALL_LEGS_AUTHORIZED; commits every leg together | the initiating principal only |
| `EXECUTE_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex }` — STAGED_WITH_RECOURSE only; one CONSENTED leg commits | the initiating principal only |
| `ROLLBACK_TRADE_CYCLE_LEG` | `{ type, cycleId, legIndex, reason: string }` — non-blank reason; only in RECOURSE_OPEN; last committed leg rolled back completes the rollback | the initiating principal only |

**State machines**: cycle `TradeCycleExecutionState` OPEN/ALL_LEGS_AUTHORIZED →
COMMITTED (COMMIT_ALL) | STOPPED_REFUSAL / STOPPED_WITHDRAWAL / STOPPED_EXPIRY |
RECOURSE_OPEN → ROLLED_BACK (all terminal except the recourse path). Leg
`TradeCycleLegState` PENDING → CONSENTED (AUTHORIZE, giver only, reference
required) / REFUSED / EXPIRED (LAPSE) / UNKNOWN (MARK_UNKNOWN); CONSENTED →
COMMITTED / WITHDRAWN / REFUSED; COMMITTED → ROLLED_BACK. ATOMIC refusal stops
with **no leg committed**; STAGED refusal/withdrawal/lapse with committed legs
opens RECOURSE instead of a bare stop. **UNKNOWN ≠ FAILED**: an action that
cannot be attributed to the leg's giver (participant mismatch or unknown
participant) holds the leg UNKNOWN with the ambiguity journaled
(`TradeCycleLegAmbiguity { kind, attemptedBy, reason, authorizationRef?,
recordedAt }`) — accepted as commands, never passed, never collapsed into
failures; disambiguation is the true giver's clear action; an ambiguous action
against a CONSENTED leg is rejected (standing consent is never destroyed).

**Kernel reads**: `kernel.view().executionOps().tradeCycle(id) /
allTradeCycles()`; `kernel.snapshot().tradeCycles`.

## 3. Scenario mapping to the fixture spaces

- **J5 (GroupBuy)** — `scenario-groupbuy-formation.test.ts`: the three
  consenting studios (Ferry Road Press, Two Harbors Design, Quayside Studio) +
  the excluded Northlight Atelier (interest recorded then withdrawn, history
  preserved, never enrolled) + the Oct 20 18:00Z pool close (SYSTEM expiry on a
  HELD pool) + threshold HELD until the organizer's explicit formation with
  final terms (exact 1080¢ × 54 units = 58,320¢ pool value, five-studio
  consenting-only roster). Mirrors the web fixtures' proposal/counter/rejection
  space (`w3gr-prop-*`, `w3gr-ctr-*` mirrors: COUNTER at 1160¢/36 boxes,
  ACCEPT_COUNTER, REJECT with reason).
- **J9 (TradeCycle)** — `scenario-tradecycle-execution.test.ts`: Cycle A
  (Harbor Lane Print Studio ⇄ Two Harbors Design ⇄ Northlight Atelier, the J9
  initial refuser is Northlight): refusal stops everything with "no other leg
  was committed" (consent stands, nothing commits, terminal rejections). Re-plan
  Cycle B with Ferry Road Press instead of Northlight: all legs authorized →
  ATOMIC COMMIT. Legs are expressed in the kernel's canonical chain order
  (leg i's receiver is leg i+1's giver — same economic cycle as the rendered
  fixture; the demo fixture's display order is preserved by the web lane, not
  the kernel). Plus STAGED_WITH_RECOURSE progression/rollback and UNKNOWN
  preservation (PARTICIPANT_MISMATCH by a non-giver participant;
  UNKNOWN_PARTICIPANT by an outsider), with the journaled event kinds
  `TRADE_CYCLE_LEG_AUTHORIZATION_UNKNOWN` / `TRADE_CYCLE_LEG_REFUSAL_UNKNOWN`.
- **Twin verification** — `twin-verification-w1-012.test.ts`: interleaved
  GroupBuy+TradeCycle journey with twin ≡ kernel (canonical bytes) after every
  step; anti-vacuity (new collections populated; corrupted twin collections
  caught); checkpoint/resume ≡ full rebuild; journal-only reconstruction.

## 4. Verification battery (real numbers, this lane branch)

| Check | Result |
|---|---|
| `corepack pnpm --filter @unicom/commerce exec vitest run` | **430/430 passed (69 files)** — seam baseline 419 + 11 new runtime/projection tests |
| `corepack pnpm --filter @unicom/commerce exec tsc --noEmit` | **clean (0 errors)** |
| `corepack pnpm --filter @zcode/web exec vitest run` | **275/275 passed (27 files)** — full green at this worktree's baseline (see note) |
| `corepack pnpm lint` | **0 errors** (101 warnings — see note; zero from W1-012 files) |
| `corepack pnpm architecture:check` | **0 violations** (baseline 0, new 0) |

Notes (honest):
- **Web baseline**: this worktree branched at `a70fcac`, before the concurrent
  W2-013 lane raised the web suite to 278. At this worktree the web baseline is
  the rendered-UI merged 275; it is fully green, so no shared surface regressed
  (W1-012's changes are commerce-internal + additive contract re-exports).
- **Lint warnings**: the repository-wide count is 101 warnings / 0 errors; it
  was 101 already at the seam commit `1f034e5` (the rendered-UI close recorded
  99; the seam brought +2, and W2-013 independently records "101w/0e unchanged"
  on its lane). My increments add **zero** new warnings; 0 errors is the law and
  it holds. The 4 warnings in `packages/commerce/src` are all in pre-existing
  files untouched by this wave.
- Per-commit greenness: `a82c015` was verified standalone (419/419 with the test
  files stashed) before the test commit landed on top.

## 5. Prior vehicle's partials — what was inherited, verified, changed

**Inherited uncommitted (vehicle 1, died mid-work after committing the seam):**

- Modified: `runtime/{commands.ts, index.ts, kernel-snapshot.ts, kernel-state.ts,
  kernel.ts, subjects.ts}` — **verified correct and kept as-is** (payload-union
  extension, fold import/routing/accessor, snapshot collections, 15 handler
  registrations, subject helpers; all consistent with the handler-circular /
  fold-module patterns).
- New: `runtime/handler-groupbuy.ts`, `runtime/handler-tradecycle.ts`,
  `runtime/kernel-fold-execution.ts` — **verified correct and kept as-is**
  (actor-identity laws, rejectInvalidCommand/rejectInvalidState discipline,
  immutable resulting-state facts; the fold's per-(group buy, participant)
  interest keying and revision-ordered getters).
- New: `test/runtime/scenario-groupbuy-formation.test.ts` — **verified and
  FIXED** (it did not compile/pass when inherited):
  1. `PrincipalRef.customerId` on a union type (2×) → narrowed via
     `principalRefKey` (the test's own key discipline).
  2. Formation pool-value arithmetic was wrong (expected 54,000¢; the walked
     pool is 54 units × 1080¢ = **58,320¢**) and the expected Money objects
     omitted `currency` → corrected.
  3. The rebuild-identity step used `env()` whose incrementing counter makes
     command ids (and therefore journal `causationId`s) differ across kernels →
     switched to explicit envelopes (byte-identical journals restored).
  4. Roster assertions: the consenting-only roster was asserted in fold-insertion
     order (folds emit revision order) → set-equality via `principalRefKey`; the
     snapshot interest-collection expectation listed 5 of the 6 journaled
     per-participant records (two-harbors was missing) → corrected to 6.

**What vehicle 2 added on top:**

- The twin projection extension (the 83-test breakage the partials caused by
  extending the kernel snapshot without the twin: `twin-execution-state.ts` new,
  `twin-state.ts` / `twin-snapshot.ts` / `twin-verify.ts` extended, plus the
  mechanical `twin-order-fold.ts` extraction to hold the 400-line law).
- `scenario-tradecycle-execution.test.ts` (5 tests) and
  `twin-verification-w1-012.test.ts` (3 tests).
- This report + the worklog entry.

## 6. Honest gaps / decision requests

1. **No scheduling semantics** (by design, unchanged): window close
   (`windowClosesAt`, consent expiry) is an honest observation command
   (`EXPIRE_GROUP_BUY` by organizer/SYSTEM; `LAPSE_TRADE_CYCLE_LEG` by any
   principal) — the kernel has no wall-clock scheduler; whoever observes the
   window records the fact. A later phase may want a deterministic sweep
   command; none is needed for W2-013/W3-016.
2. **TradeCycle ↔ commerce-plane linking is deliberately absent**: a committed
   leg does not create orders/payments/reservations. The aggregate is the
   execution-consent truth with opaque item refs; converting a COMMITTED cycle
   into commerce-plane effects (or group-buy formation into orders) is a
   separate, explicitly-gated decision (no live commerce side effects this
   phase — registry law). No decision needed now; flagged so nobody assumes
   linking exists.
3. **`OPEN_*` payload embeds the aggregate**: the open commands carry the full
   initial aggregate (validated at the boundary: PENDING/OPEN at revision 1 +
   shape laws). This matches the existing kernel pattern for journaled
   first-fact commands and keeps W2/W3 in control of identity minting; an
   alternative (kernel-minted ids via `ctx.mint`) was considered and rejected as
   a larger surface than the work order asks.
4. **`twin-order-fold.ts` is a prior-phase-code reorganization** (mechanical,
   zero semantic change, proven by the full twin/certification battery). The TL
   should be aware the order-family fold moved out of `twin-state.ts`; the
   extraction is the `recourseBag`/`storeOpsBag` pattern applied consistently.
5. **Wiring lanes**: W2-013/W3-016 code against `contract.ts` only (the public
   entrypoint). `KernelExecutionFold`/handlers are runtime-internal; the twin's
   execution collections are reachable via `CommerceTwin.state().executionCollections()`
   (already exported from the contract seam).

## 7. Gate status proposed to the TL

- **KSEAM** — already met by `1f034e5` (TL verified).
- **KERNEL** — this lane's work (both aggregates + exhaustive tests + fold +
  snapshot + twin equivalence): commerce 430/430, tsc clean, arch 0, lint 0
  errors. Proposed: PASSED pending TL independent verification.
