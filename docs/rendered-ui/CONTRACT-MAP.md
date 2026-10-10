# Rendered Commerce UI — Contract & Component Map (MAP gate preparation)

Date: 2026-10-10
Author: resident TL (Z.ai Code)
Status: **PRE-AUTHORIZATION PREPARATION** — produced under the Final TL Handoff §2 allowance ("TL may do read-only repo inspection and refine an implementation map; TL may verify existing contracts and create a non-mutating component inventory"). No product code was touched; this document is docs-only. Formal MAP-gate acceptance belongs to the post-AUTH implementation sequence (handoff §5 step 1).
Phase registry: docs/development-state/rendered-commerce-ui-state.json (AWAITING_OPERATOR_AUTHORIZATION)

## 1. Host integration facts (verified read-only)

| Fact | Value | Source |
|---|---|---|
| Reachable web app | `packages/web` (`@zcode/web`): `src/main.tsx` renders the ZCode connect wall; `src/auth/WebCallbackPage.tsx` (OAuth callback); `src/share/ConversationShareLandingPage.tsx` (share landing) | POST-V3 W1-010 real-browser evidence (57/57 ABSENT) |
| React target for the host | `packages/web` (React 19.2.4 already a dependency; Vite + Tailwind + @vitejs/plugin-react in devDeps) | `packages/web/package.json` |
| Component library to consume | `@zcode/ui` (`packages/ui` — AlertDialogHost, BotsDialog, App shell patterns, …) | W1-011 requirement "prefer consuming @zcode/ui" |
| Current `@unicom/*` deps of web | **none** (`@zcode/client`, `@zcode/shared`, `@zcode/ui` only) | `packages/web/package.json` |
| Dependency-direction ruling | web → `@unicom/experience` / `@unicom/commerce` via **public entrypoints only** (`packages/experience/src/contract.ts`, `packages/experience/src/runtime/index.ts`, `packages/commerce/src/contract.ts`) is the architecture's intended consumer direction — `forbidDeepImports` + `publicEntrypoints` govern it; no cycle is possible (experience requires agent; nothing requires web). **Adding these workspace deps to `@zcode/web` is USE of the frozen architecture, not a change to it.** React must NOT be added to `experience`/`commerce`/`agent` (domain/runtime-only). | `architecture-policy.yaml` (modules web/experience/commerce; global rules) |
| Demo mode | deterministic synthetic fixtures, committed, `DEMO`-labelled, resettable; no provider credentials required | W1-011 scope §7–8; W2-012/W3-015 rules |

## 2. Experience-plane inventory (non-mutating; 16 surface files, 84 typed view interfaces, 7 runtime view constructors)

| Surface file | Interfaces | Constructors / config | Covers (journey IDs) |
|---|---|---|---|
| `intent-canvas.ts` | 5 | `INTENT_CONSTRAINT_FIELDS` (deadline, time-window, max-total-cost, …) | J1 |
| `explore.ts` | 4 | `EXPLORE_GROUPS` (buy / sell / operate …) — the natural ordinary-navigation taxonomy | J2, J3, J19 |
| `opportunity-inbox.ts` | 3 | — | J4, J5 (buyer side), J8 |
| `decision-card.ts` | 12 | — | J3, J6, J7, J9, J14 |
| `decision-card-render.ts` | 2 | `DECISION_CARD_RENDER_SECTIONS` | J14, J18 |
| `storefront.ts` | 10 | — | J10, J12 |
| `operations.ts` | 8 | — | J11, J16 |
| `autonomous-store.ts` | 6 | — | J13 |
| `connector-studio.ts` | 6 | — | J15 |
| `live-commerce-ux.ts` | 9 | — | J15 (live-commerce) |
| `w3-007-surfaces.ts` | 9 | `buildApiExplorerView`, `buildProtocolAdapterStudioView`, `buildIngestionMonitorView`, `buildPhysicalCaptureView` | J15, J16 |
| `trust-security.ts` | 3 | — | J17 |
| `command-center.ts` | 6 | — | J13, J14 (merchant cockpit) |
| `surface-state.ts` | 8 | — | J18 shared state vocabulary (preserved non-failure states: OFFERED, PENDING, ATTEMPTED, OVERDUE, SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN, FAILED, DENIED, COMPLETED) |
| `surface-state-manifests.ts` | 0 | manifest helpers | J18/J19 evidence manifests |
| `app-extensions-studio.ts` | 3 | `buildAppExtensionsStudioView`, `buildAiGeneratedAppRequestView`, `buildAgentGeneratedToolView` | extension surface (adjacent, not a scored journey) |

**Zero non-test consumers confirmed** (grep over `packages/`, `apps/` excluding tests) — the POST-V3 finding holds today; the UI phase creates the first real consumer.

## 3. Runtime inventory (the deterministic commerce truth paths — UI must go through these, never around)

- **`@unicom/commerce` runtime handlers** (packages/commerce/src/runtime/): `commands.ts`, `event-journal.ts`, `handler-commerce`, `handler-checkout`, `handler-payment`, `handler-fulfillment`, `handler-inventory`, `handler-price-book`, `handler-circular` (TradeCycle), `handler-recourse`, `handler-marketing`, `handler-crm`, `handler-forecasting`, `handler-autonomous-ops` + `autonomous-ops-core`. Public entrypoint: `contract.ts`.
- **`@unicom/commerce` domain** (packages/commerce/src/domain/): catalog, cart, orders, b2b, circular, inventory, marketing, crm, forecasting, opportunity, observation, money/decimal, ids, events, commands …
- **`@unicom/experience` runtime** (packages/experience/src/): `runtime/` (journey dispatch — proven by W2-010's 63 fixture-contract scenarios), `navigation/`, `connector/`, `edge/` (offline queue), `api/`, `deployment/`, `sim/` (campaign/discovery/failure-variants machinery — reusable for the browser gate).
- **Proven invariants to preserve in UI** (W2-010, all 7): UNKNOWN≠failure; no pending-as-settled; no side effects without authority (approvals, merchant authorization, per-leg TradeCycle consent, refund bands, connector scopes); predictions never mutate canonical truth; no duplicate effects; isolation.

## 4. The 19-journey implementation map (journey → contract → runtime → module → evidence)

| ID | Family (protocol §10) | Existing contract | Runtime capability | Rendered component owner | Evidence requirement (browser gate) |
|---|---|---|---|---|---|
| J1 | Buyer Intent Canvas | `intent-canvas.ts` + field descriptors | commerce catalog/quote commands + agent intent | **W2-012** | ordinary discovery from EXPLORE → buy; visible constraint capture + evidence/recourse terms |
| J2 | Compare offers; live/stale/UNKNOWN | `explore.ts` | price-book handler; freshness timestamps | **W2-012** | visible state separation (verified / stale / UNKNOWN / unavailable) with source timestamps |
| J3 | Buy-vs-wait, negotiation, substitution | `explore.ts` + `decision-card.ts` | handler-commerce + price-book | **W2-012** | decision card interactions; negotiation/substitution paths incl. multi-merchant |
| J4 | GroupBuy discovery/join/leave | `opportunity-inbox.ts` | commerce GroupBuy formation engine (W2-010-proven) | **W2-012** | threshold, deadline, eligibility, consent, commitment terms visible; interest ≠ commitment |
| J5 | Latent-demand group buy | `opportunity-inbox.ts` (buyer) / `command-center.ts` (merchant review) | opportunity domain + groupbuy engine | **W2-012** (buyer) + **W3-015** (merchant accept/reject/counter) | no silent enrollment; per-side states; both sides browser-evidenced |
| J6 | Rent/borrow vs buy | `decision-card.ts` | commerce circular domain (rental/deposit) | **W2-012** | duration, availability, deposit, condition, return, damage, recourse states |
| J7 | Resale/rental/consignment | `decision-card.ts` | circular domain | **W2-012** | explicit user action before listing/commit; evidence + outcome estimate |
| J8 | Proactive opportunities | `opportunity-inbox.ts` | opportunity + forecasting handlers | **W2-012** | why-suggested, provenance, expiry, safe next action |
| J9 | Multi-hop TradeCycle | `decision-card.ts` | handler-circular (per-leg consent proven) | **W2-012** | ≥3 synthetic participants, per-leg consent, refusal/dropout → re-plan without silent commits |
| J10 | Merchant lifecycle | `storefront.ts` | catalog/orders/checkout/payment/fulfillment handlers | **W3-015** | full lifecycle incl. returns/exchanges/refunds/support |
| J11 | Procurement lifecycle | `operations.ts` | orders/inventory/observation | **W3-015** | quotes → approvals → PO → partial receiving → substitution → reconciliation-gated stock update |
| J12 | B2B / multi-location | `storefront.ts` + `operations.ts` | b2b domain | **W3-015** | channel/location coordination where supported; honest unavailability otherwise |
| J13 | Autonomous store | `autonomous-store.ts` + `command-center.ts` | autonomous-ops-core + handler | **W3-015** | policies, spend/margin floors, stop conditions, approval gates, audit trail |
| J14 | Commerce Twin what-if | `command-center.ts` + `decision-card-render.ts` | forecasting handler (INV: forecasts never mutate) | **W2-012** | visibly non-authoritative predictions; write-block to canonical truth |
| J15 | Connectors / integration surfaces | `connector-studio.ts`, `live-commerce-ux.ts`, `w3-007-surfaces.ts` (4 constructors) | experience connector runtime | **W3-015** | connected vs demo vs unavailable differentiated accurately; provider state + UNKNOWN preserved |
| J16 | Physical / no-RFID supermarket | `w3-007-surfaces.ts` (`buildPhysicalCaptureView`) + `operations.ts` | observation + inventory + edge offline queue (W2-010-proven) | **W3-015** | barcode/manual/weighted counts, offline replay, conflict visibility, reconciliation; no RFID dependency |
| J17 | Trust / security / recourse | `trust-security.ts` | recourse + sanitizer handlers (W2-010-proven) | **W3-015** | evidence, decision status, policy reason, appeal/escalation, controlled refund/return |
| J18 | Failure & recovery | `surface-state.ts` + `decision-card*.ts` | event-journal + idempotency + offline queue (7 invariants) | **W1-011** (shared state components) + both feature lanes | stale/UNKNOWN/denied/duplicate/interruption states preserved distinctly — never collapsed into errors (POST-V3 remediation P2) |
| J19 | Discovery-only | `explore.ts` (`EXPLORE_GROUPS`) + host navigation | experience navigation runtime | **W1-011** (all 19 visible entry points) | ordinary homepage/role-surface discovery, **no deep links**; route/surface discovery manifest |

## 5. Write-surface boundaries (pairwise disjoint, per the work orders)

- **W1-011**: host shell/router/role registry/shared primitives/module contract + host tests — under `packages/web` (host integration). Publishes the **feature-module contract first** (small commit) for W2/W3 to branch from.
- **W2-012**: buyer/opportunity/peer module directory + tests (`packages/web`, own directory; no router/shared edits).
- **W3-015**: merchant/procurement/physical/trust module directory + tests (`packages/web`, own directory; no router/shared edits).
- **TL**: registry, acceptance, merged-lineage battery, evidence inspection, final report. TL is not a fourth worker.

## 6. Evidence law for the browser gate (reuse, do not reinvent)

- Reuse the **W1-010 browser-pilot format** (`docs/simulations/post-v3/w1-010/` runner + manifest + 13-artifact evidence pattern; schema base: `docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md` with the browser extension fields: screenshots/traces, build+env identity, navigation path, timings).
- Ordinary-surface discovery law (J19): first discovery from homepage/role landing only; deep links invalidate the discovery claim but may be used afterwards for targeted reruns (clearly labelled).
- Outcome vocabulary recorded separately: **PASS / FAIL / ABSENT / BLOCKED / UNKNOWN / SKIPPED** — denominators published with zero drift.
- Resilience gate: adapt the **W2-010 matrix** (11 families / 63 scenarios + 7 invariants) to browser-driven evidence; contract-only results remain labelled contract-only until re-tested through the browser.
- Demo/synthetic labelling on every fixture-derived value; no live purchases, payments, refunds, rentals, GroupBuy commitments or trade legs.

## 7. Known risks / decisions the implementation must respect

1. **State vocabulary preservation** (POST-V3 blocker register #7): the rendered UI must keep preserved non-failure states (OVERDUE, ATTEMPTED, SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN …) visually distinct from failures — `surface-state.ts` is the source of truth.
2. **Architecture stop-condition**: if any journey turns out to require a dependency direction, authority or canonical-behavior change beyond frozen baseline 1.1, the worker stops and files the smallest explicit decision request (handoff §3, W1-011).
3. **Contract-only capabilities**: where a typed contract exists but no working runtime behavior, the UI shows an honest unavailable/demo-only state + blocker entry — never a simulated live outcome.
4. **Worker-vehicle drought risk** (POST-V3 lesson): the Task-tool subagent vehicle failed 4× last phase; if it fails again, the disclosed local-chain recovery doctrine conflicts with `tl_is_worker: false` — in that case the TL records the blocker and re-dispatches rather than absorbing the lane (the operator may waive this in the moment).

## 8. Readiness statement

The repository is ready for the rendered-UI phase: typed surface contracts (16 files / 84 interfaces), deterministic commerce runtime (15+ handlers / 20+ domain modules), proven safety invariants, a real browser runner + evidence format, a 63-scenario resilience matrix, and a frozen architecture that already permits the web host to consume the experience plane through public entrypoints. The single missing piece — the rendered host + feature modules — is exactly what W1-011/W2-012/W3-015 will build once the operator records the authorization.
