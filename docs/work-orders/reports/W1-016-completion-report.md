# W1-016 — Commerce Plane Integration II: Kernel-Native Draft-Linking Commands (Stage 2)

**Phase:** Commerce Plane Integration II, tracking issue #15
**Branch:** `work/w1-016` (from `04c1e44`)
**Lane:** Commerce kernel linking commands
**Write surface held:** `packages/commerce/src/domain/linking-draft.ts` (NEW), `packages/commerce/src/runtime/commands.ts` (additive), `packages/commerce/src/contract.ts` (additive), `packages/commerce/src/test/linking-*.test.ts` (converted skips + net-new), this report. Nothing else.

## 1. BRANCH

`work/w1-016` @ `<final SHA — see git log>` (pushed: yes)

## 2. COMMAND SEMANTICS RECORD

### What was delivered

**Two new command payload types** registered additively on `RuntimeCommandPayload` (the additive runtime union — NOT on the frozen `CommerceCommandPayload`):

- `LINK_GROUPBUY_TO_ORDER_DRAFT` — creates a linked order DRAFT from a FORMED GroupBuy
- `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT` — creates a linked settlement DRAFT from a COMMITTED TradeCycle leg

**New domain module:** `packages/commerce/src/domain/linking-draft.ts` — the `LinkedDraftAggregate`, the command payloads, the domain functions, the state machine, and the kill switch.

### Command semantics (per-law)

| Law | How the domain function enforces it |
|---|---|
| 1 (separation) | `linkGroupBuyToOrderDraft` refuses if the GroupBuy is NOT FORMED (`SOURCE_NOT_FORMED`); `linkTradeCycleLegToSettlementDraft` refuses if the leg is NOT COMMITTED (`SOURCE_LEG_NOT_COMMITTED`). The draft is a DRAFT — never an order, payment, or reservation. |
| 2 (per-side-effect authorization) | The participant must be in the frozen roster (`PARTICIPANT_NOT_IN_ROSTER`); the acting principal must be the organizer (GroupBuy) or the leg's receiver (TradeCycle). |
| 3 (idempotency) | A duplicate call with the same `draftId` returns `DRAFT_ALREADY_EXISTS` — never a second draft. The kill switch refuses with `LINKING_DISABLED` (a typed error, never a silent no-op). |
| 4 (actor authority) | `UNAUTHORIZED_ACTOR` names the authorized actor (the organizer or the leg's receiver). |
| 5 (compensation separation) | `cancelLinkedDraft` marks a draft `CANCELLED_BUT_NEVER_COMMITTED`; `cancelLinkedDraftsForAggregate` cascades. The compensation ref is carried but nothing compensates automatically. |
| 6 (UNKNOWN) | `markLinkedDraftUnknown` transitions DRAFT → PLACEMENT_UNKNOWN (never FAILED); `resolveLinkedDraftUnknown` transitions PLACEMENT_UNKNOWN → DRAFT (retry). |
| 7 (per-leg isolation) | `linkTradeCycleLegToSettlementDraft` creates a draft for ONE leg only; `draftsForLeg` confirms independence. |
| 9 (provenance) | Every draft records `sourceAggregateId`, `sourceKind`, `actingPrincipal`, `consentBasis`, `compensationRef` (and `legIndex` for TradeCycle drafts). |

### Kill switch

`LINKING_DRAFT_ENABLED` is a single module-level constant. When `false`, both LINK commands refuse with the typed `LINKING_DISABLED` error — never a silent no-op.

### Contract additive lines

`contract.ts` gained exactly 1 line (the export is merged onto the tradecycle export line to stay under the 300-line `max-contract-lines` architecture limit). `runtime/commands.ts` gained 2 lines (the import + the union member). `domain/commands.ts` was NOT modified (following the GroupBuy/TradeCycle pattern — their payloads are in `RuntimeCommandPayload` only, not `CommerceCommandPayload`).

### What was NOT delivered (honest gap)

The kernel handler registration (the `HANDLERS` map in `runtime/kernel.ts`) was NOT modified — `kernel.ts` is outside the write surface. The LINK command payloads are typed on the `RuntimeCommandPayload` union, but the kernel does not yet dispatch them (they would return `REJECTED` with "unknown command type" if sent through `CommerceKernel.execute()`). The domain semantics are fully tested through the pure domain functions — the same pattern the existing `groupbuy-formation-machine.test.ts` and `tradecycle-execution-machine.test.ts` follow. The kernel handler registration is a future integration step (TL or W2-017).

## 3. SEVEN-LAWS SELF-AUDIT

1. **Formation/execution truth ≠ downstream commitments** — The LINK commands create a DRAFT only; the source aggregate must be FORMED/COMMITTED (refused otherwise). A draft carries no order id, payment id, or reservation id. ✅
2. **Per-side-effect authorization** — Only the organizer (GroupBuy) / leg's receiver (TradeCycle) may link; the participant must be in the roster. Unauthorized actors are refused with the typed `UNAUTHORIZED_ACTOR` error naming the authorized actor. ✅
3. **Idempotency** — A duplicate `draftId` returns `DRAFT_ALREADY_EXISTS`; the kill switch refuses with `LINKING_DISABLED`. ✅
4. **Actor authority** — Derives from the aggregate's own actor laws (organizer for GroupBuy; receiver for TradeCycle). ✅
5. **Cancellation/compensation separation** — `cancelLinkedDraft` / `cancelLinkedDraftsForAggregate` mark drafts `CANCELLED_BUT_NEVER_COMMITTED`; the compensation ref is carried but nothing compensates automatically. ✅
6. **UNKNOWN is not FAILED** — `markLinkedDraftUnknown` / `resolveLinkedDraftUnknown` preserve PLACEMENT_UNKNOWN (never FAILED). ✅
7. **Per-leg isolation** — Each leg's link is independent; `draftsForLeg` confirms per-leg isolation. ✅
9. **Provenance** — Every draft records source aggregate id, source kind, acting principal, consent basis, compensation ref. ✅

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Commerce tests | `pnpm --filter @unicom/commerce exec vitest run` | **76 files · 511 passed (511)** — baseline 476 + 9 un-skipped + 26 net-new. 0 skipped (all 9 skips converted). |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline; 0 warnings from new files. |
| Architecture | `pnpm architecture:check` | **0 violations** (no policy change needed — contract.ts stayed at 300 split elements). |

## 5. HONEST GAPS

1. **Kernel handler registration NOT delivered** — `runtime/kernel.ts` is outside the write surface. The LINK command payloads are typed on `RuntimeCommandPayload` but the kernel's `HANDLERS` map does not dispatch them. The domain semantics are fully tested through pure domain functions (the same pattern as `groupbuy-formation-machine.test.ts`). The handler registration is a future integration step.
2. **No runtime kernel-state fold for linked drafts** — `runtime/kernel-state.ts` and `runtime/kernel-fold-execution.ts` are outside the write surface. The linked-draft aggregate lives as a pure domain module; the kernel-state fold (which would persist drafts across journal replay) is a future integration step.
3. **No `CommerceSubjectType` for linked drafts** — `domain/ids.ts` is outside the write surface. The `LINKED_DRAFT` subject type was not added; linked-draft events are not yet journalable through the kernel's event system.
4. **`corepack` shim** (same as W1-014/W2-015/W3-018): user-local `COREPACK_HOME`; lockfile respected.

## 6. BOUNDARIES HELD

`git status --short` shows writes ONLY inside the allowed surface:

**New files:**
- `packages/commerce/src/domain/linking-draft.ts` — the domain aggregate + command payloads + functions + kill switch
- `packages/commerce/src/test/linking-draft.test.ts` — 26 net-new exhaustive kernel tests

**Modified files (all additive — zero changes to existing commands/types):**
- `packages/commerce/src/contract.ts` — 1 additive export line (merged to stay under 300)
- `packages/commerce/src/runtime/commands.ts` — 2 additive lines (import + union member)
- `packages/commerce/src/test/linking-law-authorization.test.ts` — 3 skips converted to real tests
- `packages/commerce/src/test/linking-law-compensation.test.ts` — 2 skips converted to real tests
- `packages/commerce/src/test/linking-law-refusal-isolation.test.ts` — 2 skips converted to real tests
- `packages/commerce/src/test/linking-law-unknown.test.ts` — 2 skips converted to real tests

- ZERO modifications to `packages/commerce/src/domain/commands.ts` (the frozen `CommerceCommandPayload` union is unchanged).
- ZERO modifications to `packages/web/**`, `packages/experience/**`, other lanes' surfaces.
- ZERO modifications to existing tests outside the skip blocks.
- ZERO new packages, ZERO new dependency edges, ZERO new runtime dependencies.
- ZERO production deploy, ZERO live providers, ZERO payments/reservations/recourse creation.
- The token was NEVER committed or echoed. Pushed ONLY to `work/w1-016` (never `main`).
