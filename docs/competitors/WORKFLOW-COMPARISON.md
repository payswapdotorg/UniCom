# W3-014 Workflow-Level Comparison — Matched Commerce Tasks

Per frozen task pack `task-pack.json` (TP-01…TP-19). One table per workflow. **No aggregate winner is claimed** — different incumbents lead different commerce tasks, and evidence depth varies by access. UNiCOM's row is stated honestly at contract level only.

## Reading the tables
- Status: `offered` (per captured evidence; *partial* = subset of the task), `not_verified`, `not_accessible` (evaluator blocked — not proof of absence), `not_applicable` (outside incumbent category). Class: A/B/C/D (see EVIDENCE-LEDGER.md; **A=0 everywhere; D supports no claim**).
- Blanks mean no entry; use the evidence ledger for the full quote and limitation. UNiCOM: contract-level surfaces exist per FROZEN-ARCHITECTURE §19 but no rendered UI exists yet — every UNiCOM row is therefore **not observable as UI in this phase**.

## UNiCOM honest status (applies to every table below)

> UNiCOM (as of 2026-10-09): commerce experience surfaces exist ONLY as typed view contracts + runtime constructors (packages/experience/src/surfaces/*.ts) with NO rendered host UI (TL Gate-0 scouting; docs/development-state/post-v3-validation-state.json). V3 'GUI' evidence was fixture-level (typed harness), certified as such.
>
> No UNiCOM UI-level capability or timing claim is made in this report. Rendered-browser evidence is W1-010's lane (packages/experience/test/browser/). Any UNiCOM capability below is CONTRACT-LEVEL (typed surface + fixture harness), not an observed UI.
>
> V3 adoption scores are SYNTHETIC SIMULATION ESTIMATES, labelled synthetic; never blended with human or incumbent evidence.


## TP-01 — Supplier/vendor discovery & sourcing

*Journey registry: J2, J11. Task: buyer discovers candidate sellers with trust/availability signals.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered` | C | module-level documentation; no UI interaction; supplier-discovery depth (search/marketplace) not exercised |
| ariba — SAP Ariba Buying and Invoicing (Procure- | `offered` | C | procure-to-pay page only; supplier discovery/search not exercised |
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered` | B | public RFQ surface observed via content extraction; no interaction/transaction; login surfaces not entered |
| gsa — GSA Advantage! / GSA eBuy / GSA Global S | `offered (partial)` | C | nav-level listing of acquisition systems on official buy.gsa.gov; eBuy/eLibrary detail not read |
| joor — JOOR digital wholesale platform (buyer s | `offered (partial)` | C | discovery framed for brands finding retailers (reverse direction); buyer discovery of brands not directly evid |
| toast — Toast POS Inventory Management | `offered (partial)` | C | vendor catalog management; supplier discovery/marketplace not claimed |
| mcmaster — McMaster-Carr catalog and ordering site | `offered` | B | live public catalog UI observed; search/checkout not exercised |
| cdw — CDW business IT purchasing site | `offered (partial)` | C | account-team-assisted sourcing; self-serve supplier discovery not evidenced |
| ghx — GHX Marketplace (order automation) | `offered` | C | provider-supplier network described |
| xometry — Xometry on-demand manufacturing marketpl | `offered (partial)` | C | manufacturing capability discovery; supplier search not evidenced |
| grainger — Grainger MRO industrial supply (online o | `not_accessible` | D | both page reads returned JS-walled stub (12 chars); official URLs identified from official-domain search resul |
| medline — Medline medical supplies ordering (incl. | `not_accessible` | D | both reads returned stub (11 chars); JS-walled; no capability claim made; not proof of absence |
| sysco — Sysco Shop online ordering | `not_accessible` | D | read returned JS-disabled stub: …please enable JS to make this app work…; login-walled ordering app; no capabi |
| thomasnet — Thomasnet B2B sourcing platform | `not_accessible` | D | three reads failed/JS-walled; no capability claim made; not proof of absence |
| instacart — Instacart Platform (grocery e-commerce) | `not_accessible` | D | two read attempts failed (timeout); no capability claim made; not proof of absence |
| nuorder — NuORDER B2B wholesale platform | `not_accessible` | D | read attempt failed; no capability claim made; not proof of absence |

## TP-02 — Offer/quote comparison across sellers

*Journey registry: J2, J11. Task: compare >=2 offers on total cost, lead time, quality, recourse.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered` | C | quote-comparison workflow documented at product level; line-level comparison UI not observed |
| ariba — SAP Ariba Buying and Invoicing (Procure- | `not_verified` | D | page not read; official-domain snippet only |
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered` | B | comparison mechanics observed as described capability on public UI; side-by-side UI not exercised |
| xometry — Xometry on-demand manufacturing marketpl | `offered (partial)` | C | single-marketplace instant quote; multi-vendor comparison not evidenced |

*Not verified (evidence insufficient):* see table rows and gap register.

## TP-03 — Buyer intent capture with constraints

*Journey registry: J1. Task: record budget/deadline/quality/delivery/substitute constraints; later shopping respects them.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered` | C | requisition/budget constraint documented; natural-language intent canvas not claimed |
| ariba — SAP Ariba Buying and Invoicing (Procure- | `offered` | C | requisition + approval documented |
| ambiz — Amazon Business (Guided Buying, Approval | `offered` | C | guided-buying page read; constraint dimensions beyond policy/approval not evidenced |
| shopify — Shopify B2B (help-center capability list | `offered (partial)` | C | quantity constraints only; budget/deadline/substitute intent not evidenced |

## TP-04 — Buy-now-vs-wait, price timing, substitution, negotiation

*Journey registry: J3, J8. Task: act on price/inventory timing or negotiate/substitute within constraints.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered (partial)` | C | negotiation dimension only; buy-vs-wait price timing and substitution not evidenced |
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered (partial)` | C | negotiation documented in official buying guide; price-wait timing not evidenced |

## TP-05 — Discover & join existing group buy with visible commitment rules

*Journey registry: J4. Task: find existing group deal and join/leave with explicit rules.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|

*Not applicable (category scope):* coupa, ariba, gsa, faire, joor, nuorder, square, lightspeed, toast, marketman, poshmark, depop, grainger, mcmaster, cdw, ghx, medline, sysco, thomasnet, xometry.

## TP-06 — Latent-demand group buy: recruit + merchant proposal

*Journey registry: J5. Task: detect demand, recruit participants, propose group deal to merchant; merchant accepts/rejects/counters.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|

*Not applicable (category scope):* coupa, ariba, ambiz, gsa, faire, joor, nuorder, shopify, square, lightspeed, toast, marketman, ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals, grainger, mcmaster, cdw, ghx, medline, sysco, thomasnet, xometry, instacart.

## TP-07 — Rent/borrow vs buy

*Journey registry: J6. Task: compare rental vs purchase: availability, period, deposit, condition, recourse.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| sharegrid — ShareGrid gear rental marketplace | `offered` | B | public rental marketplace UI observed; booking flow not exercised |
| kitsplit — KitSplit equipment rental marketplace | `not_accessible` | D | official site returned a maintenance stub at observation time; no capability claim; not proof of absence |
| unitedrentals — United Rentals My Equipment / Total Cont | `offered` | C | page largely navigation; My Equipment portal described; booking flow not exercised |

*Not applicable (category scope):* coupa, ariba, gsa, faire, joor, nuorder, marketman, ghx, medline, sysco.

## TP-08 — Resale/consignment of under-used assets

*Journey registry: J7. Task: list/resell/consign asset with user-controlled pricing; or buy used with condition evidence.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| ebay — eBay marketplace + Money Back Guarantee | `offered` | C | resale listing advertised on official policy page; listing flow not exercised |
| poshmark — Poshmark marketplace (seller shipping gu | `offered` | C | official seller shipping guide read; full listing flow not read |
| depop — Depop marketplace | `offered` | B | public marketplace homepage observed; thin content captured; no interaction |
| sharegrid — ShareGrid gear rental marketplace | `offered` | B | member resale listings observed on public UI |

*Not applicable (category scope):* coupa, ariba, gsa, joor, nuorder, ghx, medline, sysco.

## TP-09 — Bounded multi-hop trade cycle >=3 participants, per-leg consent

*Journey registry: J9. Task: execute trade cycle across >=3 participants with per-leg authorization and proof.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|

*Not applicable (category scope):* coupa, ariba, ambiz, alibaba, gsa, faire, joor, nuorder, shopify, square, lightspeed, toast, marketman, ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals, grainger, mcmaster, cdw, ghx, medline, sysco, thomasnet, xometry, instacart.

## TP-10 — Procurement: approvals, PO, receiving, invoice matching

*Journey registry: J11. Task: requisition to approval to PO to partial receiving to invoice matching to credit.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered` | C | product-page level; partial receiving and 3-way match detail not read |
| ariba — SAP Ariba Buying and Invoicing (Procure- | `offered` | C | product-page level |
| gsa — GSA Advantage! / GSA eBuy / GSA Global S | `not_verified` | D | page not read |
| shopify — Shopify B2B (help-center capability list | `offered (partial)` | C | PO numbering at checkout only; approval/receiving/invoice-match workflow not evidenced |
| square — Square for Retail POS | `offered (partial)` | C | retail-scale procurement subset; approvals not evidenced |
| lightspeed — Lightspeed Retail POS inventory manageme | `offered (partial)` | C | PO + receiving subset; approvals/invoice matching not evidenced |
| toast — Toast POS Inventory Management | `offered (partial)` | C | purchasing/invoicing subset; approvals not evidenced |
| marketman — MarketMan purchasing & order management | `offered` | C | multi-unit purchasing/receiving documented; approval workflow not evidenced |
| unitedrentals — United Rentals My Equipment / Total Cont | `not_verified` | D | fleet-management/requisition detail not accessible; not proof of absence |
| mcmaster — McMaster-Carr catalog and ordering site | `offered (partial)` | B | punchout (e-procurement integration) present on public UI; integration depth not verified |
| ghx — GHX Marketplace (order automation) | `offered` | C | contract-compliance procurement documented; approval detail not read |

*Not applicable (category scope):* alibaba, faire, ebay, poshmark, depop, sharegrid, kitsplit, instacart.

*Not verified (evidence insufficient):* see table rows and gap register.

## TP-11 — Orders, fulfilment, delivery/pickup, returns, refunds, recourse

*Journey registry: J10. Task: order lifecycle incl. returns/refunds and dispute recourse.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered (partial)` | C | procurement order tracking; consumer-style returns/refunds not in scope of read pages |
| ariba — SAP Ariba Buying and Invoicing (Procure- | `offered (partial)` | C | order lifecycle on procurement side |
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered` | B | order-protection claims observed on public UI; claims flow not exercised |
| gsa — GSA Advantage! / GSA eBuy / GSA Global S | `offered` | C | official description of GSA Advantage! ordering |
| ebay — eBay marketplace + Money Back Guarantee | `offered` | C | returns/refund steps documented on Money Back Guarantee page |
| cdw — CDW business IT purchasing site | `offered (partial)` | C | order tracking + asset management claims |
| xometry — Xometry on-demand manufacturing marketpl | `offered` | C | online ordering documented |

## TP-12 — Storefront/catalog/price/promotion (merchant side)

*Journey registry: J10. Task: merchant lists products/variants, sets price/promotions, manages storefront.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| joor — JOOR digital wholesale platform (buyer s | `offered (partial)` | C | brand-side platform claim; catalog management detail not read |
| shopify — Shopify B2B (help-center capability list | `offered (partial)` | C | marketing-level storefront claim; admin capability detail not read |

*Not applicable (category scope):* coupa, ariba, alibaba, gsa, ebay, poshmark, depop, unitedrentals, ghx, medline, sysco, xometry, instacart.

## TP-13 — B2B/wholesale channel: catalogs, quotes, bulk orders

*Journey registry: J12. Task: B2B price lists, quotes, bulk ordering, buyer-vendor connections.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered` | C | B2B listing mechanics documented |
| faire — Faire wholesale marketplace | `not_accessible` | D | evaluator could not access page content (ad-tracker stub returned twice); no capability claim made; not proof  |
| joor — JOOR digital wholesale platform (buyer s | `offered` | C | buyer-side page read; ordering workflow detail not exercised |
| shopify — Shopify B2B (help-center capability list | `offered` | C | official help-center capability checklist read |

*Not applicable (category scope):* gsa, ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals, ghx, medline, sysco, instacart.

## TP-14 — Inventory, POS, replenishment, multi-location, reconciliation (no-RFID incl.)

*Journey registry: J16. Task: count/receive/replenish stock, POS checkout, multi-location, reconcile incl. barcode/camera/weighted/file modes.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| shopify — Shopify B2B (help-center capability list | `offered (partial)` | C | nav-level POS inventory claim; barcode/count/reconciliation detail not read |
| square — Square for Retail POS | `offered` | C | product-page level; offline mode and weighted goods not evidenced |
| lightspeed — Lightspeed Retail POS inventory manageme | `offered` | C | inventory/purchase-order features documented; no-RFID reconciliation detail not evidenced |
| toast — Toast POS Inventory Management | `offered` | C | product-page level |
| marketman — MarketMan purchasing & order management | `offered` | C | inventory module documented on purchasing page |
| ghx — GHX Marketplace (order automation) | `offered (partial)` | C | inventory services named; detail not read |

*Not applicable (category scope):* coupa, ariba, alibaba, gsa, faire, joor, nuorder, ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals, xometry.

## TP-15 — Proactive opportunity discovery

*Journey registry: J8. Task: surfaced opportunities: price drop, warranty, subscription savings, loyalty, shared logistics.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| ambiz — Amazon Business (Guided Buying, Approval | `offered (partial)` | C | reporting-driven insights; proactive opportunity surfacing (price timing, resale, shared logistics) not eviden |
| square — Square for Retail POS | `offered (partial)` | C | loyalty dimension only; price timing/resale/shared logistics not evidenced |

## TP-16 — Trust/safety: fraud handling, evidence, recourse

*Journey registry: J17. Task: review fraud, counterfeit/wrong-item, refund abuse, evidence trails, dispute resolution.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| coupa — Coupa Procurement (Procure-to-Order) + C | `offered (partial)` | C | nav-level label only; fraud workflow detail not read |
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered` | C | Trade Assurance documented; dispute resolution detail not read |
| ebay — eBay marketplace + Money Back Guarantee | `offered` | C | buyer/seller protection documented; dispute adjudication detail not read |
| sharegrid — ShareGrid gear rental marketplace | `offered (partial)` | B | insurance offering present; recourse workflow detail not read |

## TP-17 — User-visible failure/recovery: stale/UNKNOWN, duplicates, idempotency, missing approval

*Journey registry: J18. Task: stale indicators, UNKNOWN states, duplicate submission handling, approval errors visible to user.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| ambiz — Amazon Business (Guided Buying, Approval | `offered (partial)` | C | policy surfacing at product pages; stale/UNKNOWN/idempotency behavior not evidenced |
| mcmaster — McMaster-Carr catalog and ordering site | `offered (partial)` | B | support SLA statement only; failure/idempotency behavior not evidenced |
| ghx — GHX Marketplace (order automation) | `offered (partial)` | C | AI problem detection described; user-visible recovery flow not evidenced |

*Not applicable (category scope):* faire, joor, nuorder.

## TP-18 — Bounded autonomous/assisted store actions under limits

*Journey registry: J13. Task: assisted purchasing or store operations under budget/margin/approval limits with stop conditions.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|
| alibaba — Alibaba.com B2B marketplace (RFQ, Trade  | `offered (partial)` | B | AI sourcing assistant advertised on public UI; bounded autonomy/limits not evidenced |

*Not applicable (category scope):* ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals.

## TP-19 — What-if/counterfactual commerce planning, non-mutating

*Journey registry: J14. Task: scenario planning (demand, pricing, inventory) with no canonical state mutation.*

| UNiCOM | contract-level surface exists; **no rendered UI** → not observable as UI this phase; rendered-browser evidence = W1-010 lane; V3 scores synthetic | — | fixture/contract-level only; no timing |
|---|---|---|---|

*Not applicable (category scope):* coupa, ariba, ambiz, alibaba, gsa, faire, joor, nuorder, shopify, square, lightspeed, toast, marketman, ebay, poshmark, depop, sharegrid, kitsplit, unitedrentals, ghx, medline, sysco, xometry, instacart.

## Coverage summary (offered/not-accessible observations per task)

| Task | incumbent observations |
|---|---|
| TP-01 SRC | 16 |
| TP-02 CMP | 4 |
| TP-03 INT | 4 |
| TP-04 BNW | 2 |
| TP-05 GBD | 0 |
| TP-06 GBG | 0 |
| TP-07 RNT | 3 |
| TP-08 RSC | 4 |
| TP-09 MHT | 0 |
| TP-10 PRC | 11 |
| TP-11 ORD | 7 |
| TP-12 STF | 2 |
| TP-13 B2B | 4 |
| TP-14 INV | 6 |
| TP-15 OPP | 2 |
| TP-16 TRS | 4 |
| TP-17 REC | 3 |
| TP-18 AUT | 1 |
| TP-19 TWIN | 0 |

## Negative findings retained (both sides)

**UNiCOM negatives (retained, not hidden):**
- No rendered commerce UI exists (contract-only surfaces) — every workflow comparison at UI level is currently UNiCOM-not-observable, not UNiCOM-superior.
- No timing claims possible (no comparable rendered surface).
- V3 willingness/adoption numbers are synthetic estimates; they cannot support real-world superiority claims.

**Incumbent negatives (retained):**
- No incumbent showed evidence (in captured classes) for: latent-demand group buys with merchant proposals (TP-06) or bounded multi-hop trade cycles (TP-09) — these are *not verified as absent*, and no absence claim is made beyond category-level not-applicable judgments; proving absence would require A-class account access.
- Subscription-savings/warranty-recovery/shared-logistics proactive discovery (TP-15 breadth) was only partially matched (Amazon Business spend insights, Square loyalty).
- User-visible failure/idempotency/UNKNOWN behavior (TP-17) was largely not evidenced in any incumbent capture (best: GHX AI problem detection; Amazon Business policy messages at product pages).


## Fairness notes
- This is a toolset comparison, not a single-vendor tournament; the matrix's per-industry incumbent baselines (spreadsheets, email, manual processes) remain the true baseline for many firms.
- Replacement vs orchestration is NOT decided here: UNiCOM may act as a main interface while incumbent procurement/POS/marketplace systems remain connected (per the matrix's fairness boundaries).
- No market-wide or universal superiority claim is inferred from any of these tables.
