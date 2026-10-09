# W3-014 Evidence Gap Register — by Industry, Capability and Evidence Class

Generated 2026-10-09 from `ledger.json`. Classes: A=0, B=11, C=51, D=11 observations. Gaps are honest limits of THIS evidence pass, not claims about the market.


## By industry (matrix rows 1–13)

### Construction/Engineering
- Covered incumbents (best class): ambiz(C), alibaba(B), unitedrentals(C), grainger(D), mcmaster(B), thomasnet(D)
- Comparator coverage gaps (matrix-named, no evidence captured): Fastenal, Ferguson, HD Supply, Sunbelt Rentals, used-equipment marketplaces (e.g., Machinery Trader)
- Access gaps (class D): grainger, thomasnet

### Finance/Banking/Accounting
- Covered incumbents (best class): coupa(C), ariba(C), ambiz(C), cdw(C)
- Comparator coverage gaps (matrix-named, no evidence captured): Oracle procurement tools, Ramp, Brex (only where exact tested procurement/approval capability)
- Access gaps (class D): none

### Sales/BusinessDevelopment
- Covered incumbents (best class): ambiz(C), alibaba(B), faire(D), joor(C), nuorder(D), shopify(C)
- Comparator coverage gaps (matrix-named, no evidence captured): WooCommerce, BigCommerce
- Access gaps (class D): faire, nuorder

### Technology/Software/IT
- Covered incumbents (best class): coupa(C), ariba(C), ambiz(C), alibaba(B), cdw(C)
- Comparator coverage gaps (matrix-named, no evidence captured): SHI, vendor storefronts (e.g., Dell/HP portals)
- Access gaps (class D): none

### Healthcare
- Covered incumbents (best class): ambiz(C), ghx(C), medline(D)
- Comparator coverage gaps (matrix-named, no evidence captured): McKesson, Cardinal Health, organization ERP procurement modules
- Access gaps (class D): medline

### Transportation/Delivery
- Covered incumbents (best class): ambiz(C), unitedrentals(C), grainger(D), mcmaster(B)
- Comparator coverage gaps (matrix-named, no evidence captured): FleetPride, NAPA Auto Parts, manufacturer/dealer parts portals
- Access gaps (class D): grainger

### Hospitality/Restaurants/Hotels
- Covered incumbents (best class): shopify(C), square(C), toast(C), marketman(C), sysco(D)
- Comparator coverage gaps (matrix-named, no evidence captured): US Foods ordering, Restaurant Depot, local wholesaler portals
- Access gaps (class D): sysco

### Fashion/Apparel/Retail
- Covered incumbents (best class): alibaba(B), faire(D), joor(C), nuorder(D), shopify(C), square(C), lightspeed(C), ebay(C), poshmark(C), depop(B)
- Comparator coverage gaps (matrix-named, no evidence captured): additional rental/consignment marketplaces (e.g., Rent the Runway B2B, The RealReal)
- Access gaps (class D): faire, nuorder

### Entertainment/Media/Production
- Covered incumbents (best class): sharegrid(B), kitsplit(D), unitedrentals(C)
- Comparator coverage gaps (matrix-named, no evidence captured): specialist gear suppliers, other used-equipment marketplaces
- Access gaps (class D): kitsplit

### Legal/ProfessionalServices
- Covered incumbents (best class): coupa(C), ambiz(C), cdw(C)
- Comparator coverage gaps (matrix-named, no evidence captured): Staples Business Advantage
- Access gaps (class D): none

### Defense/Security/GovContracting
- Covered incumbents (best class): coupa(C), ariba(C), ambiz(C), gsa(C)
- Comparator coverage gaps (matrix-named, no evidence captured): authorized unclassified supplier portals (beyond GSA)
- Access gaps (class D): none

### Manufacturing/SupplyChain
- Covered incumbents (best class): coupa(C), ariba(C), ambiz(C), alibaba(B), grainger(D), mcmaster(B), thomasnet(D), xometry(C)
- Comparator coverage gaps (matrix-named, no evidence captured): ERP purchasing/inventory modules (SAP MM, Oracle)
- Access gaps (class D): grainger, thomasnet

### Supermarkets/LocalRetail
- Covered incumbents (best class): ambiz(C), shopify(C), square(C), lightspeed(C), instacart(D)
- Comparator coverage gaps (matrix-named, no evidence captured): local grocery POS vendors, local cash-and-carry portals
- Access gaps (class D): instacart


## By capability (task pack TP-01…TP-19)

| Task | Name | Offered(B) | Offered(C) | Not verified / not accessible | UNiCOM status |
|---|---|---|---|---|---|
| TP-01 | Supplier/vendor discovery & sourcing | alibaba, mcmaster | coupa, ariba, gsa, joor, toast, cdw, ghx, xometry | grainger, medline, sysco, thomasnet, instacart, nuorder | contract-only; no rendered UI |
| TP-02 | Offer/quote comparison across sellers | alibaba | coupa, xometry | ariba | contract-only; no rendered UI |
| TP-03 | Buyer intent capture with constraints | — | coupa, ariba, ambiz, shopify | — | contract-only; no rendered UI |
| TP-04 | Buy-now-vs-wait, price timing, substit | — | coupa, alibaba | — | contract-only; no rendered UI |
| TP-05 | Discover & join existing group buy wit | — | — | — | contract-only; no rendered UI |
| TP-06 | Latent-demand group buy: recruit + mer | — | — | — | contract-only; no rendered UI |
| TP-07 | Rent/borrow vs buy | sharegrid | unitedrentals | kitsplit | contract-only; no rendered UI |
| TP-08 | Resale/consignment of under-used asset | depop, sharegrid | ebay, poshmark | — | contract-only; no rendered UI |
| TP-09 | Bounded multi-hop trade cycle >=3 part | — | — | — | contract-only; no rendered UI |
| TP-10 | Procurement: approvals, PO, receiving, | mcmaster | coupa, ariba, shopify, square, lightspeed, toast, marketman, ghx | gsa, unitedrentals | contract-only; no rendered UI |
| TP-11 | Orders, fulfilment, delivery/pickup, r | alibaba | coupa, ariba, gsa, ebay, cdw, xometry | — | contract-only; no rendered UI |
| TP-12 | Storefront/catalog/price/promotion (me | — | joor, shopify | — | contract-only; no rendered UI |
| TP-13 | B2B/wholesale channel: catalogs, quote | — | alibaba, joor, shopify | faire | contract-only; no rendered UI |
| TP-14 | Inventory, POS, replenishment, multi-l | — | shopify, square, lightspeed, toast, marketman, ghx | — | contract-only; no rendered UI |
| TP-15 | Proactive opportunity discovery | — | ambiz, square | — | contract-only; no rendered UI |
| TP-16 | Trust/safety: fraud handling, evidence | sharegrid | coupa, alibaba, ebay | — | contract-only; no rendered UI |
| TP-17 | User-visible failure/recovery: stale/U | mcmaster | ambiz, ghx | — | contract-only; no rendered UI |
| TP-18 | Bounded autonomous/assisted store acti | alibaba | — | — | contract-only; no rendered UI |
| TP-19 | What-if/counterfactual commerce planni | — | — | — | contract-only; no rendered UI |

Capabilities with the weakest incumbent evidence (0–2 offered observations): TP-05 (group-buy discovery), TP-06 (latent-demand group buys), TP-09 (multi-hop trades), TP-19 (what-if twin) — consistent with category-level expectations, but absence is NOT claimed (would need A-class access to verify absence).


## By evidence class

- **A (0)** — authorized account/sandbox sessions — NONE exist this phase; requires operator-provided accounts or vendor sandboxes

- **B (11)** — public UI observations limited to content extraction; no interaction, no transaction flows, no authenticated surfaces

- **C (51)** — official pages read; many at product/nav/marketing level (limitations recorded per observation in ledger.json)

- **D (11)** — JS-walled/login-walled/down/timeout: Grainger, Medline, Sysco, Thomasnet, Instacart, NuORDER, Faire, KitSplit, United Rentals Total Control sub-page, Coupa invoice-detail, GSA eBuy detail


## Cross-cutting gaps
- No A-class evidence exists at all (no accounts/sandboxes) — every workflow-level claim is B/C limited; performance/latency/timing comparisons are impossible this phase.
- B-class observations are content-extraction only (no interaction).
- C-class observations vary from capability checklists (Shopify B2B help center) to nav-level labels (Coupa fraud protection, GSA system list, United Rentals My Equipment) — limitations recorded per observation.
- D-class: 8 incumbents + 2 sub-pages not accessible; official URLs retained for a follow-up pass (see BLOCKED-TASKS.md).
