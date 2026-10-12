# W1-018 — Commerce Plane Integration III: Linking Observation Completeness (Draft Ledger + UNKNOWN Recovery)

**Phase:** Commerce Plane Integration III, tracking issue #16
**Branch:** `work/w1-018` (from `8b35971`)
**Lane:** Web linking observation surfaces
**Write surface held:** `packages/web/src/commerce-modules/buyer-groupbuy/linking-draft-kernel*.ts(x)`, all composing component files, `packages/web/src/commerce-host/shell/surfaces/SystemSurface.tsx`, test files, this report. Nothing else.

## 1. BRANCH

`work/w1-018` @ `<final SHA — see git log>` (pushed: yes)

## 2. SINGLETON DESIGN RECORD

**Before W1-018:** each composing component (`buyer-groupbuy/component.tsx`, `buyer-groupbuy/latent-demand.tsx`, `merchant-groupbuy-review/component.tsx`, `peer-tradecycle/component.tsx`) created its own `useState<LinkingDraftKernel>(() => new LinkingDraftKernel())`. This meant each surface had its own private set of drafts — the System-surface ledger would have been a lie (it would only see one fragment, not the whole truth).

**After W1-018:** exactly ONE module-level singleton (`sharedLinkingDraftKernel`) exported from `linking-draft-kernel.ts` serves all composing surfaces. Every component imports the singleton instead of creating its own `useState` instance. The System surface's "Reset demo fixtures" button calls `sharedLinkingDraftKernel.reset()` alongside the host's `dispatch({ type: "reset-demo" })` so the reset clears drafts + receipts with the same discipline. Per-component reset paths only clear the Stage-1 local `LinkedDraftLedger` (host-side DEMO state); the shared singleton persists across component unmounts so the System ledger stays truthful.

## 3. LEDGER + UNKNOWN SELF-AUDIT (against the seven laws)

1. **Separation** — The ledger lists DRAFTs only; no orders/payments/reservations appear. ✅
2. **Per-side-effect authorization** — Every draft's provenance includes the acting principal; unauthorized attempts are REJECTED (rendered verbatim). ✅
3. **Idempotency** — The singleton's receipt map ensures duplicate commands return the original receipt; the ledger shows the same draft. ✅
4. **Actor authority** — Provenance names the acting principal on every draft entry. ✅
5. **Compensation separation** — `cancelDraft` marks `CANCELLED_BUT_NEVER_COMMITTED`; the compensation ref is displayed; nothing auto-compensates. ✅
6. **UNKNOWN is not FAILED** — `markUnknown` transitions to `PLACEMENT_UNKNOWN`; the panel renders "never FAILED, never guessed"; `resolveUnknown` returns to DRAFT for retry. ✅
7. **Per-leg isolation** — Each leg's draft is independent; the ledger shows legIndex for TradeCycle drafts. ✅
9. **Provenance** — Every ledger entry shows source aggregate id, kind, acting principal, consent basis, compensation ref. ✅

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **35 files · 376 passed** — baseline 367 + 9 net-new |
| Commerce (untouched proof) | `pnpm --filter @unicom/commerce exec vitest run` | **521 passed** — identical to baseline |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline |
| Architecture | `pnpm architecture:check` | **0 violations** |
| Scoped tsc | `tsc -p tsconfig.scoped.json` | **EXIT 0** (clean) |

## 5. HONEST GAPS

1. **No browser lane evidence** (sandbox has no browser); vitest coverage proves the singleton, the ledger render + empty state, the UNKNOWN resolve flow, and the demo-trigger honesty.
2. **The mark-UNKNOWN DEMO trigger** is visibly labelled "Simulate an unknown placement outcome (DEMO)" — the real unknown-arrival path is future placement-plane work.
3. **`corepack` shim** (same as prior lanes): user-local `COREPACK_HOME`; lockfile respected.

## 6. BOUNDARIES HELD

- ZERO modifications to `packages/commerce/**` (consumed read-only through `@unicom/commerce`).
- ZERO modifications to `host-states/**` (J18 ABSENT-by-design untouched).
- ZERO modifications to the Stage-1 prefill or the commitment-gate semantics.
- ZERO auto-firing commands; ZERO payments/reservations/recourse.
- Token never committed. Pushed only to `work/w1-018`, never `main`.
