# W2-013 Completion Report — Buyer & Peer Commerce Runtime Wiring (J5 buyer, J9)

Work order: `docs/work-orders/W2-013.md` · Lane: worker-2 · Branch: `work/w2-013`
(base `1f034e5` = the W1-012 seam → `9d31097` J9 → `8e3eca8` J5, this report's
commit beneath it). Status: lane work COMPLETE, not pushed (TL harvests).

Phase: Runtime Integration (operator review 2026-10-10, recommendations 2–3).
State authority: `docs/development-state/runtime-integration-state.json` (WIRE_BUYER
gate). Tracking issue: #11.

## 1. What this lane delivered

Both W2-owned buyer/peer surfaces are now **kernel-driven**: their formation /
execution truth is the commerce kernel's `GroupBuy` formation aggregate and
`TradeCycle` execution aggregate (W1-012 domain machines), consumed **only**
through the `@unicom/commerce` public entrypoint (`contract.ts`), exactly like
the committed J9 pattern that set this lane's quality bar.

| Module | Journey | Commit | What changed |
|---|---|---|---|
| `peer-tradecycle` | J9 | `9d31097` (inherited, committed by vehicle ≤3) | Local consent machine superseded by the kernel's TradeCycle execution aggregate |
| `buyer-groupbuy` | J4 + J5 buyer | `8e3eca8` (this vehicle, finishing inherited vehicle-3 partials) | Local demo formation state superseded by the kernel's GroupBuy formation aggregate |

Both modules use the same lane-local executor pattern: a module-sibling
`kernel.ts` that registers fixture candidates through the seam's typed command
payloads and dispatches every mutation to the CANONICAL domain machines
(`applyTradeCycleLegAction` / `executeTradeCycle` / … and
`recordGroupBuyInterest` / `withdrawGroupBuyInterest` / `decideGroupBuyProposal`
/ `formGroupBuy` / `closeOrExpireGroupBuy`), behind the kernel's
`CommandExecution` result shape (EXECUTED / DUPLICATE / REJECTED) with
idempotency receipts and the seam's actor-identity laws. **Why lane-local and
not the W1-012 runtime handlers:** the runtime handlers (`a82c015`+) live on
`work/w1-012`, which this lane does not merge (merge-time integration is the
TL's). This branch carries the published seam (`1f034e5`: domain machines +
typed payloads), and the lane drives exactly those machines — the same code the
kernel runtime dispatches to — so the merge swaps the executor's dispatch core
for the kernel's `execute` API with zero surface change (see §6 merge notes).

## 2. Kernel-driven vs fixture-supplied (the honest map)

### Kernel-driven (runtime truth through the seam's domain machines)

- **J4 pool lifecycle**: every discovered pool opens through the kernel command
  path (OPEN by its fixture initiator, ACCEPT by its fixture organizer, seeded
  shares as RECORD_GROUP_BUY_INTEREST by each fixture participant) — the seed
  fails honestly if the kernel does not land w2gb-01 in MONITORING (48/60 from
  3 studios) and w2gb-02 in HELD (24/24 from 2 studios).
- **J4 join/leave**: RECORD/WITHDRAW_GROUP_BUY_INTEREST by the buyer principal
  with their consent terms; threshold completion (60/60 from 4 studios) and the
  HELD demotion on withdrawal are kernel-reconciled, rendered from kernel truth.
- **J4 formation**: FORM_GROUP_BUY by the organizer from HELD only — final
  terms (exact group price, exact kernel-computed pool value) + consenting-only
  roster frozen; the FORMED panel renders `aggregate.formation`.
- **J5 proposal lifecycle**: OPEN_GROUP_BUY_PROPOSAL by the buyer; the three
  consenting studios' interests as kernel commands (the declining studio is
  never recorded); the merchant's deterministic reply as a fixture-scripted
  DECIDE_GROUP_BUY_PROPOSAL by the organizer (ACCEPT / COUNTER with counter
  terms on record / REJECT with the kernel-required reason); ACCEPT_COUNTER by
  the initiator (recorded terms only — replacement terms refused by the domain
  machine); MONITORING → HELD on the buyer's 4-box share; FORM_GROUP_BUY with
  final terms = the second confirmation.
- **J9 execution**: per-leg AUTHORIZE/REFUSE/WITHDRAW/LAPSE and the ATOMIC
  EXECUTE/EXECUTE_LEG/ROLLBACK — CONSENTED / REFUSED / STOPPED_REFUSAL /
  STAGED_WITH_RECOURSE / ambiguity-UNKNOWN outcomes and "No other leg was
  committed" computed from the aggregate (committed at `9d31097`).

### Fixture-supplied (deterministic DEMO-labelled, committed in-module)

- The identities (studios, merchants, principals), the pools and their terms
  (thresholds, deadlines, prices, eligibility/consent/commitment copy), the
  seeded shares, the J5 consenting roster + the declining Northlight Atelier,
  the Oct 20 18:00 pool close, the J9 Cycle A / re-plan Cycle B candidates with
  their items/proof levels/privacy notes.
- The merchant review *behaviors* on J5 (which fixture merchant accepts /
  counters / rejects) — deterministic scripts that choose which kernel command
  the fixture organizer submits; the command path and its laws are kernel truth.
- The demo clock (fixed epoch 2026-10-12T09:00:00Z, stepped deterministically —
  never wall time) and the module-level deterministic resets
  ("Reset the demo kernel (fresh pools)" / "Start a new proposal round" / J9's
  "Reset the demo kernel (fresh Cycle A)").

## 3. Selector-preservation proof (rendered-UI certification intact)

Every browser-evidenced selector from the rendered-UI phase's merged-gate
evidence survives, verified against the committed tests:

- J4/J5 buyer: `cm-groupbuy-w2gb-01` / `cm-groupbuy-w2gb-02` pool cards,
  `cm-groupbuy-interested`, `cm-commitment-gate`, `cm-participant-consented`,
  `cm-participant-declined`, `cm-proposal-offered`, `cm-proposal-accepted`,
  `cm-proposal-countered`, `cm-proposal-rejected`, plus the new kernel-truth
  testids `cm-groupbuy-formed`, `cm-latent-pool`, `cm-latent-your-interest`.
- Copy preserved verbatim: the two-step commitment law ("interest is never a
  commitment", "confirm a SECOND time"), threshold/deadline/eligibility /
  consent-terms / commitment-terms lines, the join/leave gate titles
  ("Authorize recording your interest (this is NOT a commitment)" /
  "Withdraw your interest"), button labels ("Express interest (with
  authorization)", "Record my interest (not a commitment)", "Withdraw my
  interest", "Withdraw interest", "Review proposal before sending", "Send
  proposal to the merchant", "Reveal merchant review outcome (demo)", "Accept
  the counter…", "Start a new proposal round", "Propose a group deal (J5)"),
  "48/60 toward the threshold" / "threshold met — formation pending" chips, the
  fixture notes (organizer notes, merchant reply notes), DEMO tags everywhere.
- J9 (committed): `cm-tradecycle-leg-0..2` display order (own leg =
  `cm-tradecycle-leg-2`), `cm-tradecycle-cycle` / `-stopped` / `-committed` /
  `-execute`, consent/refuse/lapse/withdraw button labels, gate needle
  "Consenting authorizes ONLY this leg", STOPPED_REFUSAL + "No other leg was
  committed" copy (now kernel-computed).
- Superseded honestly (per the work order): the J4 "Not wired" boundary
  statement and the J5 "deliberately not wired … formation engine" note are
  replaced by the wired state ("Executed by the commerce kernel" / "Real
  (kernel-driven): Formation…"); the old test expectation "states the
  formation-engine boundary honestly (no simulated live outcome)" is superseded
  by the kernel-driven assertions (`not.toContain("Not wired")` + the
  kernel-truth state labels), exactly as W2-013.md directs.
- Permission gates: `groupbuy.express-interest` (buyer) for join/leave/interest;
  `groupbuy.review-proposal` (merchant, approver) for the fixture-scripted
  organizer advances (reveal review / form the deal) — denials name every
  holder ("Held by Merchant, Approver") and the held roles. J9:
  `tradecycle.consent-leg` unchanged.
- Accessibility: every actionable control keeps its accessible shape (labelled
  select, text buttons, `role="alert"` on the honest-rejection banners —
  additive), UNKNOWN-never-FAILED preserved (J9 ambiguity legs; GroupBuy has no
  UNKNOWN domain state — pending is PENDING/MONITORING, never an error).

## 4. Tests (kernel-driven scenarios)

`buyer-groupbuy/component.test.tsx`: 10 → **18** tests —
J4 (8): render with kernel states; join through the gate completing the pool to
HELD (kernel receipt rendered); withdraw-before-second-confirmation with honest
HELD→MONITORING demotion; gate cancel (no kernel effect); HELD-at-discovery
explicit formation with final terms + frozen consenting-only roster;
express-interest denial (requester); review-proposal denial naming holders;
deterministic reset. J5 (7): fixture-space render (3 consenting studios,
Northlight excluded, 36 boxes, 448.00 USD reference cost, Oct 20 close);
send→PENDING→accepted→MONITORING (36/40); your-share gate completing 40/40 →
HELD → FORM_GROUP_BUY with final terms + roster incl. your studio;
withdraw-before-formation + re-express (interest is never commitment);
countered/rejected as distinct kernel states (counter terms on record,
kernel-required rejection reason); organizer-control denial; route split.
Kernel seam (3): duplicate idempotency (DUPLICATE with the ORIGINAL receipt, no
new effect); honest kernel rejections (actor-identity POLICY_DENIED, premature
formation NOT_HELD, double interest INTEREST_ALREADY_EXPRESSED,
withdraw-after-formation GROUP_BUY_NOT_OPEN_FOR_INTEREST, exact pool value
`114800` = 41.00 × 28 sets); declining studio never recorded + consenting-only
roster (pool value `44800` = 11.20 × 40).

`peer-tradecycle/component.test.tsx`: 12 tests (committed at `9d31097`) —
atomic execution with receipt, refusal stops without committing other legs,
UNKNOWN non-giver attribution + disambiguation, duplicate idempotency, kernel
identity/shape rejections, reset.

## 5. Verification (real numbers, on the committed tree `8e3eca8`)

- `corepack pnpm --filter @zcode/web exec vitest run` — **286/286 passed, 27
  files** (baseline at `9d31097` = 278; the +8 is this lane's J5 test delta
  10 → 18; J9's 12 unchanged).
- `corepack pnpm lint` — **0 errors / 102 warnings**. Warnings are unchanged
  from the inherited HEAD state: the J9 commit message recorded "101w", but the
  committed tree measures **102** — the 102nd is an unused `TradeCycleId` type
  import in the committed J9 `tradecycle-data.ts:18` (inherited from vehicle ≤3;
  left untouched per the "peer-tradecycle is DONE — do not touch" boundary).
  **Zero warnings from any file this vehicle wrote.**
- `corepack pnpm architecture:check` — **0 violations** (baseline 0, new 0).
- Scoped tsc (`NODE_OPTIONS=--max-old-space-size=2800 corepack pnpm --filter
  @zcode/web exec tsc -p tsconfig.scoped.json`) — **clean (exit 0)**. (The
  prior-lane failure mode — vitest-green but scoped-tsc-broken partials — was
  checked explicitly and does not occur here.)

## 6. Inherited-partials disclosure + honest gaps / merge-time notes

**Vehicle history (worklog honesty):** vehicles 1–2 (Task IDs 40/41-class)
committed the seam-adjacent J9 work (`9d31097`, never worklogged — their
entries died with them); vehicle 3 (21:39–21:51) wrote the J5 partials
(3 modified + 4 new files) and died before any verification or commit; this
vehicle (4) inherited them **unverified**.

**What this vehicle verified vs fixed vs changed in the inherited J5 partials:**

- Verified line-by-line and kept (correct against the seam's domain machines,
  the host contract and the work order): `kernel.ts` (executor, actor-identity
  laws, idempotency, opening shape validation), `groupbuy-data.ts` (fixtures +
  kernel view models + the honest seed), `gate.tsx` (kernel-honest commitment
  gate, byte-equivalent to the committed J9 one), `component.tsx` and
  `latent-demand.tsx` structure, all preserved selectors/copy, the permission
  gates (host-contract permission ids, not the work order's shorthand
  "groupbuy.join/organize" — the host contract is the authority), the whole
  kernel-driven scenario suite (it passed on first run: 286/286, scoped tsc
  clean — the partials' latent risk was lint, not tests or types).
- Fixed: **1 defect** — `latent-demand-parts.tsx` exceeded the 400-effective-line
  law (429 effective / 466 raw; `max-lines` ERROR). Split mechanically into
  `latent-demand-parts.tsx` (review-state panels, 238 raw) +
  `latent-demand-pool.tsx` (threshold-pool gates + FORMED panel, 254 raw) —
  pure code motion, zero behavior change, module suite re-verified green.
- Changed additively: the J5 header comment now names both sibling files;
  nothing else outside the split was rewritten.

**Honest gaps / decision requests for the TL:**

1. **Executor is lane-local by design** (the drought-safe pattern): the kernel
   runtime handlers are on `work/w1-012` (`a82c015`), not merged here. At merge
   time the TL may swap the two `kernel.ts` dispatch cores for the real
   handlers' `execute` API — the surfaces, commands, payloads and receipts are
   already the seam's shapes, so no surface change is required. The W1-012
   manifest's decision requests (no scheduler semantics; observation-command
   expiry; open-commands embed the initial aggregate) apply to this lane's
   semantics identically.
2. **Inherited lint warning** (see §5): one unused import in the committed J9
   `tradecycle-data.ts` — a one-line fix the TL may take at merge (this vehicle
   was forbidden from touching peer-tradecycle). If fixed, warnings return to
   the documented 101 baseline.
3. **Fixture-scripted organizer**: the J5 merchant replies and the J4/J5 "form
   the deal" demo advances are fixture-scripted organizer commands (labelled
   "(demo advance)"), gated behind `groupbuy.review-proposal`. A live merchant
   actor is out of scope (no live anything in this phase).
4. **No group-buy commitment is ever created** — kernel truth by law: the
   formation aggregate never creates orders/payments; a real commitment would
   live on the commerce planes after the second confirmation (stated on both
   surfaces). Linking formation to commerce-plane orders remains a
   separately-gated operator decision.
5. **Browser evidence**: not this lane's (RAM ceiling; the merged-lineage
   BROWSER gate over J5 buyer+merchant, J9, J15 is the phase plan's authority).
   The superseded local-state expectations are recorded here beside their
   kernel-driven replacements per the evidence laws.

## 7. Boundaries held

Write surface: `packages/web/src/commerce-modules/buyer-groupbuy/**` (+ its
tests) and this report only. `peer-tradecycle` untouched by this vehicle
(`9d31097` inherited as-is); no host/router/shared-contract edits; no
merchant-* edits; no `packages/commerce|experience|agent` edits; no
package.json/lockfile changes; `@unicom/commerce` consumed via the public
entrypoint only; no live commerce side effects; no browser runs; nothing
pushed.
