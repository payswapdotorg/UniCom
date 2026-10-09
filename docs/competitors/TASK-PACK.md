# W3-014 Frozen Equivalent Task Pack — Commerce Capability Comparison

Frozen: 2026-10-09 (before any incumbent evidence capture in this lane)
Authority: docs/work-orders/W3-014.md §Scope A.2; docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md (commerce-only scope); journey registry = docs/simulations/V3-EXPERIMENT-PROTOCOL.md §10 (families J1–J19).
Machine-readable companion: docs/competitors/task-pack.json

## Purpose and freeze discipline

This task pack defines the matched commerce tasks against which UNiCOM and commerce incumbents are compared. It was frozen BEFORE any incumbent evidence was captured (see git history: this file is committed before the evidence ledger). Capability definitions must not be reshaped after seeing incumbent scores.

## Scope rules inherited from the matrix

- Commerce-only comparison. Broad non-commerce industry platforms (Autodesk, Procore, EHR, fleet telematics, creative suites, legal matter management, etc.) are NEVER scored as overall competitors.
- Each incumbent is scored ONLY on the commerce tasks its product category actually addresses. "Not applicable" is a legitimate outcome.
- Categories are kept strictly separate: `offered` (capability present per evidence), `not_verified` (no sufficient evidence), `not_accessible` (evaluator could not access; NOT proof of absence), `not_applicable` (outside this incumbent's category).
- A task unsupported by evidence class A/B/C remains UNKNOWN for that incumbent. Class D supports no claim.

## UNiCOM-side status (honest negative framing, retained)

Per the TL's Gate-0 scouting record (2026-10-09, in docs/development-state/post-v3-validation-state.json): UNiCOM's commerce experience surfaces (Command Center, Intent Canvas, Storefront, Opportunity Inbox, Trust/Security, etc.) currently exist as typed view contracts + runtime constructors under packages/experience/src/surfaces/*.ts with NO rendered host UI (no React renderer / host registration; commerce+agent+experience packages form an isolated subgraph consumed only by the fixture harness). Consequences for this comparison:

- UNiCOM today has NO operator-visible rendered commerce UI; its V3 "GUI" evidence was fixture-level (typed harness), certified as such.
- Therefore this lane makes NO UNiCOM UI-level capability or timing claims. Rendered-browser UNiCOM evidence is W1-010's lane (packages/experience/test/browser/); UNiCOM's column in workflow tables cites the contract-level surface definitions and W1-010's findings, marked as fixture/contract-level, never as observed UI.
- Any UNiCOM "advantage" recorded by V3 is a SYNTHETIC SIMULATION ESTIMATE and is labelled synthetic wherever referenced. It is never blended with human or incumbent-observation evidence.

## Capability codes and task definitions

Each task: neutral definition (vendor-agnostic), preconditions, inputs, observable outcome, journey-registry mapping, incumbent applicability.

| ID | Code | Capability task | Journey ref |
|----|------|-----------------|-------------|
| TP-01 | SRC | Supplier/vendor discovery & sourcing | J2, J11 |
| TP-02 | CMP | Offer/quote comparison across sellers | J2, J11 |
| TP-03 | INT | Buyer intent capture: budget, deadline, quality, delivery, substitutes | J1 |
| TP-04 | BNW | Buy-now-vs-wait, price timing, substitution, negotiation | J3, J8 |
| TP-05 | GBD | Discover & join an existing group buy with visible commitment rules | J4 |
| TP-06 | GBG | Latent-demand group buy: recruit participants, merchant proposal, accept/reject/counter | J5 |
| TP-07 | RNT | Rent/borrow vs buy: availability, period, deposit, condition, recourse | J6 |
| TP-08 | RSC | Resale/consignment of under-used assets with user-controlled listing | J7 |
| TP-09 | MHT | Bounded multi-hop trade cycle across ≥3 participants, per-leg authorization | J9 |
| TP-10 | PRC | Procurement: approvals, PO, partial receiving, invoice/PO matching | J11 |
| TP-11 | ORD | Orders, fulfilment, delivery/pickup, returns, refunds, recourse | J10 |
| TP-12 | STF | Storefront/catalog/variants, price & promotion management (merchant side) | J10 |
| TP-13 | B2B | B2B/wholesale channel: catalogs, quotes, bulk pricing, wholesale orders | J12 |
| TP-14 | INV | Inventory, POS, replenishment, multi-location stock, reconciliation (incl. no-RFID local edge) | J16 |
| TP-15 | OPP | Proactive opportunity discovery: price drop, warranty, subscription savings, loyalty, shared logistics | J8 |
| TP-16 | TRS | Trust/safety: fraud/abuse handling, evidence, recourse workflow | J17 |
| TP-17 | REC | User-visible failure/recovery: stale/UNKNOWN state, duplicate submission, idempotency, missing approval | J18 |
| TP-18 | AUT | Bounded autonomous/assisted store actions under spend/margin/approval limits | J13 |
| TP-19 | TWIN | What-if/counterfactual planning (commerce twin), never mutating canonical state | J14 |

Full neutral definitions:

- **TP-01 SRC** — As a buyer, discover candidate sellers/suppliers for a needed item/service and view their profile, ratings/trust signals and stock/lead-time state. Preconditions: authenticated buyer context where the incumbent requires one; item spec known. Observable: search/discovery surface listing sellers with distinguishing trust/availability signals.
- **TP-02 CMP** — Compare ≥2 offers for the same need side by side: total cost, lead time/availability, quality/condition, recourse terms. Observable: a comparison surface or a documented quote-comparison workflow (e.g., RFx line-level comparison).
- **TP-03 INT** — Record a purchase intent with constraints (max total cost, deadline, acceptable substitutes, delivery/pickup preference, privacy/security preference) and have later shopping respect them. Observable: persistent intent/constraint surface, or documentation that constrained purchasing/requisitions exist.
- **TP-04 BNW** — Decide and act on buy-now vs wait (price/inventory timing), or negotiate/substitute within hard constraints. Observable: price-tracking/wait mechanics, negotiation workflow (quote negotiation, best-offer), substitution/alternates suggestion.
- **TP-05 GBD** — Find an existing group-buy/deal-window and join with visible commitment/threshold rules; leave before commitment where rules allow. Observable: group-buy or shared-purchase surface with explicit commitment rules; deal-window mechanics. (Incumbent group-buy mechanics, e.g., group deals in marketplaces, qualify only if commerce-transactional.)
- **TP-06 GBG** — Detect demand across buyers, recruit participants, and send a merchant proposal for a group deal; merchant accepts/rejects/counters. Observable: any buyer-aggregation → merchant-proposal workflow. Expected rare in incumbents; absence is only claimable with A/B/C evidence of the absence.
- **TP-07 RNT** — Compare rental vs purchase for an item: availability, period, deposit, condition, delivery, return terms, recourse. Observable: rental marketplace/catalog surface with period/deposit terms, or rental company booking flow.
- **TP-08 RSC** — List/resell/consign an under-used asset with user-controlled pricing and evidence; or buy a used/refurbished item with condition evidence. Observable: seller listing flow, consignment workflow, used/refurbished channel.
- **TP-09 MHT** — Execute a bounded multi-hop trade cycle among ≥3 participants with per-leg authorization and proof. Observable: any documented multi-party barter/trade-chain mechanism. Expected absent in mainstream incumbents; recorded as not-applicable/not-verified honestly.
- **TP-10 PRC** — Requisition → approval → PO release → partial receiving → invoice matching → credit/returns evidence. Observable: procurement suite modules (requisition, PO, receiving, invoice matching) or supplier-portal PO workflows.
- **TP-11 ORD** — Place order, track fulfilment/delivery/pickup, execute return/exchange/refund, access recourse (dispute/evidence). Observable: order lifecycle surfaces incl. buyer-facing returns/refunds and dispute paths.
- **TP-12 STF** — Merchant creates/lists products, variants, prices, promotions; manages online storefront presentation. Observable: merchant admin docs/demo for catalog, variants, pricing, discounts.
- **TP-13 B2B** — Wholesale channel: B2B catalog/price lists, quotes, bulk ordering, buyer-vendor connections. Observable: B2B/wholesale channel documentation or public wholesale marketplace surface.
- **TP-14 INV** — Inventory count/receive/replenish, POS checkout, multi-location stock, reconciliation incl. no-RFID modes (barcode/camera, weighted goods, file import, offline). Observable: POS/inventory product docs or demo.
- **TP-15 OPP** — Proactive opportunities surfaced to the user without asking: price-drop timing, warranty/recourse recovery, subscription savings, loyalty, local pickup, shared logistics. Observable: documented proactive features (price-drop alerts, deal feeds, loyalty programs, savings recommendations).
- **TP-16 TRS** — Commerce trust/safety: review authenticity/fraud handling, counterfeit/wrong-item recourse, refund-abuse controls, evidence trails. Observable: documented buyer/seller protection, dispute resolution, fraud detection features.
- **TP-17 REC** — User-visible failure handling: stale data indicators, UNKNOWN states, duplicate-submission/idempotency behavior, missing-approval surfacing. Observable: docs/demos of order state handling, retry, approval workflow errors.
- **TP-18 AUT** — Assisted/autonomous purchasing or store operations under explicit limits (budget, margin, approval thresholds, stop conditions). Observable: documented agentic/AI purchasing assistants with limits, or autonomous replenishment/pricing features.
- **TP-19 TWIN** — What-if/counterfactual commerce planning (demand, pricing, inventory scenarios) with no canonical-state mutation. Observable: documented scenario planning/simulation features (demand forecasting, price simulation) with clear non-mutating use.

## Incumbent applicability guidance (by category)

| Incumbent category | Tasks expected applicable | Tasks expected N/A |
|---|---|---|
| Procurement suites (Coupa, SAP Ariba, Oracle) | TP-01,02,03,04,10,16,17 (+TP-11,13 where module evidence exists) | TP-05,06,07,08,09,12,14,19 mostly; TP-15 varies |
| B2B marketplaces (Amazon Business, Alibaba.com) | TP-01,02,03,04,08,11,13,15,16,17 | TP-05,06,07,09,10,12,14,18,19 vary |
| B2B wholesale platforms (Faire, JOOR, NuORDER) | TP-01,02,04,11,12,13 | TP-05..10,14,18,19 mostly |
| Supplier/MRO catalogs (Grainger, McMaster-Carr, Fastenal, Ferguson, FleetPride, NAPA, CDW, SHI, Staples BA, Thomasnet, Xometry) | TP-01,02,04,11,15,16 | TP-05,06,09; TP-07/08/10/13/14 where evidenced |
| Healthcare suppliers (GHX, McKesson, Medline) | TP-01,02,10,11,14 | most consumer-circular tasks |
| Foodservice (Sysco, US Foods, Restaurant Depot, MarketMan) | TP-01,02,10,11,14 | consumer-circular tasks |
| POS/inventory (Square, Shopify POS, Lightspeed, Toast) | TP-11,12,14,16,17 (+TP-10,13 where evidenced) | TP-05..09 mostly |
| Storefront platforms (Shopify, Square Online, BigCommerce, WooCommerce) | TP-11,12,13,16,17 (+TP-08 resale channels) | TP-05,06,09 mostly |
| Rental marketplaces (ShareGrid, KitSplit, United Rentals) | TP-01,07,11,16 (+TP-08 used-gear sales) | TP-03,05,06,09,10,13,14,18,19 mostly |
| Consumer resale (eBay, Depop, Poshmark) | TP-01,02,04,08,11,15,16 | TP-05,06,09,10,12,13,14,18,19 mostly |
| Government (GSA Advantage!) | TP-01,02,03,10,11,16 | commercial-only mechanics |
| Grocery/ shopper (Instacart) | TP-01,02,04,11,14,15,16 | most B2B/circular tasks |

This guidance is a hypothesis about applicability only; actual per-incumbent outcomes are recorded in the evidence ledger with evidence classes, never assumed.

## Timing rule

No timing claims are made anywhere in this lane. No reproducible method exists to compare UNiCOM (no rendered UI) against incumbents under comparable conditions in this phase. Performance comparisons remain UNKNOWN.
