# W2-012 — Buyer / Opportunities / Group & Peer Commerce: Fixture-State Manifest + Journey Matrix

Date: 2026-10-12
Lane: Worker 2 (work order `docs/work-orders/W2-012.md`), branch `work/w2-012`
Scope: J1, J2, J3, J4, J5 (buyer side), J6, J7, J8, J9, J14 + the buyer-facing portions of J18.
Write surface held: `packages/web/src/commerce-modules/buyer-*/`, `peer-*/` (+ this doc). No host/router/contract file was edited by this lane.

## 1. Commit lineage (this lane, oldest first)

| Commit | Subject |
|---|---|
| `1cdc66a` | buyer-support demo vocabulary + buyer-intent J1 (17-facet typed constraint editor, predictive wait-or-buy, plan options, gated editor, 6 tests) |
| `94b93c7` | buyer-compare J2 (four freshness classes visibly distinct, runtime-priced verified/stale offers, UNKNOWN never a price, stale recovery, typed empty state, gated shortlist, 7 tests) |
| `86df527` | buyer-decide J3 (complete typed decision card, price-timing predictive panel, multi-merchant negotiation + gate + cancellation, substitution blend math, 6 tests) |
| `5ed7786` | buyer-groupbuy J4+J5 (threshold/deadline/eligibility/consent/commitment terms, interest-never-commitment join+withdraw gates, denial, consenting-only latent-demand recruitment, proposal accept/counter/reject, 10 tests) |
| `48ca549` | peer-rent J6 (duration/availability/deposit/condition/return/damage/recourse, runtime rental state machine, exact depositReturn wear math, UNKNOWN-availability block, denial, 9 tests) |
| `0c95f52` | peer-resale J7 (explicit owner action before listing/commit, evidence-backed comps with freshness, UNKNOWN comps never a price, runtime listing/consignment machines + exact 60/40 payout, TERMINATE recovery, denial, typed empty, 10 tests) |
| `85dcaf9` | peer-tradecycle J9 (3 synthetic participants + re-plan alternative, per-leg individual consent with own-leg gate, refusal/dropout/expiry stop without committing other legs, execution hand-off boundary, agent-lane engine blocker visible, denial, 9 tests) |
| `9ba9127` | buyer-opportunities J8 (typed OpportunityInboxView, why-suggested separation, evidence provenance + capture times, visible expiry, safe next actions, real computeDemandForecast labelled non-authoritative, expired + UNKNOWN-capacity, denial, typed empty, 8 tests) |
| `566cb47` | buyer-twin J14 (ink-shift counterfactual via real advisory runtime + exact blend math, rent-vs-own projection, PREDICTIVE-never-canonical on every panel with OPERATIONAL side-by-side, no-history UNKNOWN, structural write-block with no apply/confirm path, denial, 8 tests) |

Base: W1-011 host tip `7b29529` (contract publication `e6f2f58`, fixtures/state model `baca779`, shared state seam + host-states `a92e725`, host shell `7b29529`).

## 2. Module registry (auto-discovered by convention; no host file edited)

| moduleId | Journeys | Nav entry(ies) | Roles required (nav) | In-surface permission gates | Tests |
|---|---|---|---|---|---|
| `buyer-intent` | J1 | `/commerce/buyer/intent` — "Intent canvas" | buyer, requester | `intent.create` (constraint editor) | 6 |
| `buyer-compare` | J2 | `/commerce/buyer/compare` — "Compare offers" | buyer, requester, procurement | `offers.compare` (shortlisting) | 7 |
| `buyer-decide` | J3 | `/commerce/buyer/decide` — "Buy now vs wait" | buyer, requester | `intent.create` (draft editing) | 6 |
| `buyer-groupbuy` | J4, J5 | `/commerce/buyer/group-buy` + `/commerce/buyer/group-buy/latent-demand` | buyer | `groupbuy.express-interest` (join/leave) | 10 |
| `peer-rent` | J6 | `/commerce/rent` — "Rent or borrow" | buyer, merchant | `rental.request` (rental flow) | 9 |
| `peer-resale` | J7 | `/commerce/resale` — "Resale & consignment" | buyer, merchant | `resale.list-own-items` (listing/consignment) | 10 |
| `peer-tradecycle` | J9 | `/commerce/trade-cycle` — "Trade cycles" | buyer, merchant | `tradecycle.consent-leg` (all consent controls) | 9 |
| `buyer-opportunities` | J8 | `/commerce/opportunities` — "Opportunity inbox" | buyer, requester, merchant | `opportunities.view` (inbox) | 8 |
| `buyer-twin` | J14 | `/commerce/twin` — "Commerce Twin (what-if)" | buyer, merchant | `twin.run-what-if` (both what-ifs) | 8 |

Lane support (deliberately NOT a module — no `module.ts`, never discovered): `buyer-support/` — `demo-data.ts` (fixture vocabulary: `DEMO_NOW` fixed demo clock, `classifyFreshness`, exact-money helpers, `W2_DEMO_FIXTURES_ID`), `ui.tsx` (`DemoTag`, `FreshnessChip`, `PermissionGate`, `TermLine`, `CommitmentGate`, `FieldRow`), `test-host.ts`, `test-inputs.ts`.

Total lane component tests: **73** (9 files), all green.

## 3. Journey-by-journey status

| Journey | Status | What is rendered | Runtime used (public entrypoints only) |
|---|---|---|---|
| J1 buyer intent | **rendered** | Scenario-seeded draft; the canonical 17-facet constraint catalog (`INTENT_CONSTRAINT_FIELDS` from `@unicom/experience`) with deadline/budget/quality/trust/delivery-pickup/substitutions + evidence & recourse terms; predictive wait-or-buy guidance (labelled predictive); plan options handed to sibling surfaces via the host navigate service; typed empty state with first action. | typed views `@unicom/experience` (intent-canvas); plan guidance labelled predictive, never a promise |
| J2 offer comparison | **rendered** | Four demo sellers; verified / stale / UNKNOWN / unavailable kept visibly distinct; source timestamp + age on every offer (fixed demo clock); UNKNOWN never rendered as a price; stale recovery via re-check; shortlist; typed empty state; permission-gated shortlisting. | `lookupPrice`, `multiplyMoneyByInteger` (`@unicom/commerce`) — verified/stale prices come from the deterministic price-book runtime |
| J3 decide | **rendered** | COMPLETE typed DecisionCard (every contract section: objective, state, evidence, alternatives, predictions, risk, organization, authority, action, history) with predictive vs operational truth separated; price-timing panel; multi-merchant negotiation (draft → review gate → OFFERED → accepted / countered / rejected; cancel from gate); substitution path with exact blend math. | `multiplyMoneyByInteger`, `subtractMoney` (`@unicom/commerce`); typed DecisionCard views `@unicom/experience` |
| J4 group buy | **rendered** | Threshold, deadline, eligibility, consent AND commitment terms visible before joining; join/withdraw each behind explicit authorization gates; cancel-out without recording; formation-engine boundary stated honestly (no simulated live outcome); interest ≠ commitment everywhere. | exact-money primitives; group-buy formation engine boundary labelled (demo state is local) |
| J5 latent demand (buyer) | **rendered** | Recruit only consenting demo participants (declining studio visibly excluded); propose merchant terms through a commitment gate; OFFERED (pending ≠ settled) → accepted / countered / rejected merchant response states; routing between J4/J5 surfaces. | exact-money primitives; merchant review side is W3-015's (fixtures namespaced to buyer side) |
| J6 rent/borrow | **rendered** | Three offers with duration, availability, deposit, condition, return, damage, recourse terms + buy-vs-rent reference; UNKNOWN availability blocks the request honestly (never a bookable calendar); full lifecycle with commitment gate; OVERDUE preserved (not a failure) with late-return recovery; damage-beyond-wear and fair-wear settlements with exact math; cancel + gate dismissal. | `advanceRental`, `depositReturn` (`@unicom/commerce`) — the real deterministic rental state machine REQUESTED→ACTIVE→[OVERDUE]→RETURNED→COMPLETED/CANCELLED, rendered read-side |
| J7 resale/consignment | **rendered** | Owned assets with evidence-backed estimates (comparable sales with freshness timestamps; UNKNOWN comps never a price); explicit owner action + commitment gate before ANY listing/consignment; listing machine DRAFT→ACTIVE→RESERVED→SOLD / ENDED / CANCELLED without losing ownership; consignment PROPOSED→ACTIVE→SETTLED with exact 60/40 payout split; TERMINATE recovery (no sale, nothing owed, item returned); withdraw proposal (cancellation); typed empty state with J6 next action. | `advanceListing`, `advanceConsignment`, `consignmentPayout`, `percentageBpsOfMoney`, `subtractMoney` (`@unicom/commerce`) |
| J8 opportunities | **rendered** | Typed `OpportunityInboxView` — why-suggested separated into observation / inference / prediction / recommendation; evidence with provenance + capture times; visible expiry (expired ⇒ NO next action); UNKNOWN capacity never an estimate-as-fact; interest marks safe (never a commitment); safe next actions navigate to owning surfaces (J4, J7); typed empty state after dismiss-all. | `computeDemandForecast` (`@unicom/commerce`) — real advisory runtime for the price-timing prediction, visibly non-authoritative |
| J9 trade cycles | **rendered** | 3-hop demo cycle (+ re-plan alternative candidate); per-leg terms, proof levels (`PROOF_LEVELS` from `@unicom/experience`), privacy; per-leg individual consent from the GIVING participant only with own-leg gate; refusal / dropout / expiry each stop the cycle without committing other legs, then re-plan with fresh consents; execution hand-off request recorded WITHOUT simulating a live trade; honest no-further-re-plan state. | consent lifecycle is a deterministic local machine mirroring the engine's laws — the TradeCycle engine (`discoverTradeCycles`/`validateTradeCycle`) lives in `@unicom/agent`, not reachable from the web host (see blockers) |
| J14 Commerce Twin | **rendered** | Ink-shift counterfactual (share × demand-scenario editor, brand-new-SKU toggle) and rent-vs-own projection; every panel wears PREDICTIVE—never-canonical chips with OPERATIONAL canonical facts side-by-side; no-history SKU → forecast UNKNOWN honestly (never zero, never failed); deterministic recompute; structural write-block panel (no apply/confirm/order path exists anywhere on the surface). | `computeDemandForecast`, `multiplyMoneyByInteger`, `percentageBpsOfMoney`, `subtractMoney` (`@unicom/commerce`) |
| J18 buyer portions | **rendered (per-module)** | Stale (J2 stale class + J7 comp freshness), UNKNOWN (J2/J6/J7/J8/J14), denial (every module's PermissionGate names the permission + every holder role), cancellation (J3 gate-cancel, J4 withdraw, J6 cancel/dismiss, J7 withdraw/END, J9 stop), recovery (J2 re-check, J6 late-return + damage settlement, J7 TERMINATE, J9 re-plan). | W1-011 shared components reused (`EmptyStatePanel`, host state vocabulary); no new state vocabulary invented |

## 4. Fixture-state manifest (work order deliverable)

- Identity: `W2_DEMO_FIXTURES_ID = "w2-012-buyer-peer-fixtures@1"` — namespaced to this lane; never touches W1's host demo fixtures or W3's directories.
- Deterministic: all fixtures are committed literals (files: `buyer-support/demo-data.ts`, `buyer-twin/twin-data.ts`, `peer-resale/resale-data.ts`, `peer-tradecycle/tradecycle-data.ts`, `buyer-opportunities/opportunities-data.ts`, plus inline component fixtures in `buyer-intent`, `buyer-compare`, `buyer-decide`, `buyer-groupbuy`).
- Demo clock: freshness classifications are computed against the FIXED `DEMO_NOW = 2026-10-12T09:00:00Z` (rendered on the surfaces) — verified→stale can never drift between renders or test runs.
- Money: every displayed amount flows through `@unicom/commerce` exact-money primitives (`money`, `formatMoney`, `multiplyMoneyByInteger`, `subtractMoney`, `percentageBpsOfMoney`) — no floats, ever.
- DEMO labelling: `DemoTag` on every fixture-derived value; the lane surfaces state "Current mode: demo — synthetic fixtures only"; all fixtures resettable (module state is component-local; nothing persists).
- Principals: fixed synthetic buyer "Harbor Lane Print Studio (demo buyer)" (matches the W1 host scenario); synthetic counterparties, merchants, consignment partner and trade participants are named honestly as demo fixtures throughout.
- No live anything: no purchase, payment, refund, rental commitment, group-buy commitment or trade leg is ever sent; demo confirmations mutate ONLY component-local state (the `CommitmentGate` states this on every gate).

## 5. Test coverage per journey family (non-happy states included)

| Module | Ordinary | Empty | Stale / UNKNOWN | Denial | Cancellation | Recovery |
|---|---|---|---|---|---|---|
| buyer-intent | seeded canvas + capture + plan guidance | typed empty + first action | predictive-labelled guidance (never a promise) | `intent.create` gate | — | navigate handoff to siblings |
| buyer-compare | 4 sellers, runtime-priced | typed empty (→ intent canvas) | stale class + UNKNOWN-never-a-price + unavailable | `offers.compare` shortlist gate | — | stale re-check → verified |
| buyer-decide | negotiation draft→gate→OFFERED→accepted | — | countered/rejected as honest outcomes | — | cancel from review gate | substitution path |
| buyer-groupbuy | join through authorization gate | — | formation-engine boundary honest; OFFERED pending ≠ settled | `groupbuy.express-interest` | withdraw interest; cancel out of gate | declining participant excluded; accept/counter/reject states |
| peer-rent | full runtime lifecycle to COMPLETED | — | UNKNOWN availability blocks request; OVERDUE preserved | `rental.request` | runtime CANCEL; gate dismissal | late return from OVERDUE; damage & fair-wear settlement |
| peer-resale | listing to SOLD; consignment to SETTLED | typed empty (→ J6) | UNKNOWN comps never a price; comp freshness | `resale.list-own-items` | END listing; withdraw proposal | TERMINATE consignment recovery |
| peer-tradecycle | consent per leg → ALL_LEGS_CONSENTED | honest no-re-plan-candidate | execution hand-off never simulates a trade | `tradecycle.consent-leg` | — (stops are not cancellations) | refusal stop + re-plan; dropout stop; expiry stop |
| buyer-opportunities | every suggestion w/ why+evidence+expiry | typed empty after dismiss-all | expired ⇒ no next action; UNKNOWN capacity ≠ promise | `opportunities.view` | — (interest never commits) | safe next actions to owning surfaces |
| buyer-twin | default counterfactual + rent-vs-own | — (editor always has inputs) | no-history → forecast UNKNOWN; PREDICTIVE labels everywhere | `twin.run-what-if` | — (nothing to cancel — structural write-block) | deterministic recompute; no apply path to cancel |

## 6. Blocker / gap register + decision requests

1. **DECISION REQUEST (W1 lane / TL) — stale phase-time assertions in the W1-owned shell test file.** `packages/web/src/commerce-host/shell/CommerceHostApp.test.tsx` (W1-011 write surface — NOT edited by this lane, per the hard boundary) contains three assertions that pinned the W1-acceptance-time state and are now stale:
   - "marks covered journeys ready…" expects `"2 of the 19 journey families are rendered right now."` — the honest dynamic count is now **12 of 19** (W2-012 shipped J1–J9 + J14). **Already failing at base `9ba9127`** (before this lane's last commit).
   - "renders an honest in-development panel for a journey whose module has not shipped (J1 → W2-012)" — J1 shipped (`1cdc66a`); the in-development panel correctly no longer exists for J1 (W3-owned journeys J10–J13, J15–J17 still render one). **Already failing at base.**
   - "lazy-loads the reference-explore module … expects `"coming soon · lane W2-012"`" — after J14 shipped (`566cb47`) no journey is "coming soon · lane W2-012" anymore; the premise (a W2-012 journey remains unshipped) is unsatisfiable while this lane's mission is complete. **Flipped by this lane's final commit.**
   Suggested W1-side fix (for the TL to route): derive the count expectation from the registry and retarget the in-development test at a W3-owned journey (e.g. J10 → W3-015). This lane cannot make the change (host file).
2. **Lane blocker (J9): TradeCycle discovery/validation engine not reachable from the web host.** `discoverTradeCycles` / `authorizeTradeCycleCandidate` / `validateTradeCycle` live in `@unicom/agent`; the web host's permitted dependency entrypoints are `@unicom/commerce` and `@unicom/experience` (CONTRACT-MAP §1 architecture ruling). The module therefore renders committed demo candidates and a deterministic local consent machine mirroring the engine's laws, with the boundary visible on the surface ("Not wired (blocker)"). No live trade is ever simulated.
3. **Demo-only (honest, by design): GroupBuy formation engine outcomes.** The formation engine is runtime-proven at the fixture level (W2-010) but the web lane renders its own committed pools through gates with local state only; the surface states this boundary explicitly (no simulated live outcome).
4. **Not rendered by this lane (ownership boundary, not a gap):** J5 merchant review side (W3-015 `command-center.ts`), J10–J13, J15–J17 (W3-015). The host home surface continues to show honest "in development · lane W3-015" panels for those.

## 7. Verification record (committed state, 2026-10-12)

- `NODE_OPTIONS="--max-old-space-size=2800" corepack pnpm exec tsc -p packages/web/tsconfig.scoped.json` → **clean (exit 0)**.
- `corepack pnpm lint` → **99 warnings / 0 errors** (exact repo baseline).
- `corepack pnpm architecture:check` → **0 violations**.
- `corepack pnpm --filter @zcode/web exec vitest run` → **155 passed / 3 failed / 158 total (18 files: 17 green, 1 red)** — the 3 failures are exactly the stale W1-owned shell assertions in §6.1 (2 already failing at base `9ba9127`; the third flips when J14 ships). All 73 W2-012 lane tests green; all inherited W1 tests green except those three stale shell assertions.
