# W3-014 Incumbent Evidence Ledger — Commerce Comparators

Version 1.0.0 | Observation window: 2026-10-09, ~15:30-17:20 UTC | Evaluator: W3-014 worker (no vendor accounts, no paid plans, no vendor outreach; public web only)

Frozen task pack: `docs/competitors/task-pack.json` (19 matched commerce capabilities TP-01…TP-19, mapped to journey registry J1–J19). Machine-readable ledger: `ledger.json`. Raw captures: `captures/`.

## Method and evidence classes

- **A — authorized actual account/UI/sandbox:** none produced this phase (no vendor accounts exist). Any A-class need is listed in the blocked-tasks register.
- **B — authentic official interactive demo / public UI observed:** public commerce surfaces observed via content extraction (no login, no interaction, no transaction; limitation always recorded).
- **C — official documentation read:** official product/help/policy pages read by the evaluator; depth (module-level, nav-level, marketing-level) recorded as a limitation.
- **D — unverified/not accessible:** JS-walled, login-walled, stub or timeout. Official URLs recorded as pointers. **D supports no claim, including any superiority claim, and is not proof the competitor lacks a capability.**

**Observation counts: A=0, B=11, C=51, D=11 (total 73 observations, 28 incumbents).**


Status vocabulary: `offered` (capability present per captured evidence; `coverage: partial` marks a subset), `not_verified`, `not_accessible` (evaluator blocked — NOT proof of absence), `not_applicable` (outside the incumbent's category).

No timing claims are made anywhere (no reproducible comparable-condition method exists; UNiCOM has no rendered UI in this phase).


## Coupa Software — Coupa Procurement (Procure-to-Order) + Coupa Sourcing

- Category: procurement suite | Industries (matrix rows): Finance/Banking, Technology/IT, Defense/Gov, Manufacturing, Legal/Prof Services
- Edition: not identifiable from public pages; no account access | Observed: 2026-10-09 | Access: official public web pages read via content extraction
- URLs: <https://www.coupa.com/products/procure-to-pay/procurement>, <https://www.coupa.com/products/source-to-contract/sourcing>
- Captures: `page-coupa-proc.json`, `page-coupa-sourcing.json` | Best evidence class this incumbent: **C**

- **TP-01** — status: `offered`, class **C**
  - Evidence (`captures/text-coupa-proc.txt`): "…Supplier Information & Risk Management Manage risk across suppliers…; sourcing product page: …collect supplier bids…"
  - Limitations: module-level documentation; no UI interaction; supplier-discovery depth (search/marketplace) not exercised
- **TP-02** — status: `offered`, class **C**
  - Evidence (`captures/text-coupa-sourcing.txt`): "…RFx events , such as Request for Information (RFI) , Request for Quote (RFQ)…; …evaluating multiple variables simultaneously…"
  - Limitations: quote-comparison workflow documented at product level; line-level comparison UI not observed
- **TP-03** — status: `offered`, class **C**
  - Evidence (`captures/text-coupa-proc.txt`): "…Simplify your purchase requisition and order processes, and track them in real time…; nav: …Budget management SpendGuard™…"
  - Limitations: requisition/budget constraint documented; natural-language intent canvas not claimed
- **TP-04** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-coupa-sourcing.txt`): "…of your full spending power in supplier negotiations…"
  - Limitations: negotiation dimension only; buy-vs-wait price timing and substitution not evidenced
- **TP-10** — status: `offered`, class **C**
  - Evidence (`captures/text-coupa-proc.txt`): "…Accelerate approval processes Speed up your approval processes with email and mobile approvals…; …greater visibility into purchase orders…; …Invoice-to-Pay AP Automation…"
  - Limitations: product-page level; partial receiving and 3-way match detail not read
- **TP-11** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-coupa-proc.txt`): "…track them in real time to reduce cycle times…"
  - Limitations: procurement order tracking; consumer-style returns/refunds not in scope of read pages
- **TP-16** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-coupa-proc.txt`): "…Fraud Protection Detect and prevent…"
  - Limitations: nav-level label only; fraud workflow detail not read

## SAP — SAP Ariba Buying and Invoicing (Procure-to-Pay)

- Category: procurement suite | Industries (matrix rows): Finance/Banking, Technology/IT, Defense/Gov, Manufacturing
- Edition: not identifiable from public pages | Observed: 2026-10-09 | Access: official public web page read
- URLs: <https://www.sap.com/products/spend-management/procure-to-pay.html>
- Captures: `page-ariba-p2p.json` | Best evidence class this incumbent: **C**

- **TP-01** — status: `offered`, class **C**
  - Evidence (`captures/text-ariba-p2p.txt`): "…improved supplier collaboration, and greater spend coverage…"
  - Limitations: procure-to-pay page only; supplier discovery/search not exercised
- **TP-03** — status: `offered`, class **C**
  - Evidence (`captures/text-ariba-p2p.txt`): "…Requisition monitoring and approval on the go…"
  - Limitations: requisition + approval documented
- **TP-10** — status: `offered`, class **C**
  - Evidence (`captures/text-ariba-p2p.txt`): "…order fulfillments and status updates, invoice processing, discounts optimization, and payment visibility…; …Touchless invoice reconciliation…; …Real-time tax, budget, and inventory checks…"
  - Limitations: product-page level
- **TP-11** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-ariba-p2p.txt`): "…order fulfillments and status updates…"
  - Limitations: order lifecycle on procurement side
- **TP-02** — status: `not_verified`, class **D**
  - Evidence (`captures/search-ariba.json`): "official sourcing page URL identified (sap.com/products/spend-management/ariba-sourcing.html); RFx content not read"
  - Limitations: page not read; official-domain snippet only

## Amazon — Amazon Business (Guided Buying, Approvals)

- Category: B2B marketplace + purchasing controls | Industries (matrix rows): Construction, Finance/Banking, Sales/BD, Technology/IT, Transportation, Healthcare, Legal/Prof Services, Defense/Gov, Manufacturing, Supermarkets
- Edition: not identifiable; no Business account | Observed: 2026-10-09 | Access: official public web page read
- URLs: <https://business.amazon.com/en/solutions/compliance-management/guided-buying>
- Captures: `page-ambiz-guided.json` | Best evidence class this incumbent: **C**

- **TP-03** — status: `offered`, class **C**
  - Evidence (`captures/text-ambiz-guided.txt`): "…Guided Buying - Buying Policies and Approvals…; …Build approval workflows Create approval workflows with Approvals to establish checkpoints around orders…"
  - Limitations: guided-buying page read; constraint dimensions beyond policy/approval not evidenced
- **TP-15** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-ambiz-guided.txt`): "…Spend insights Use pre-built or custom reports to help improve purchase planning…"
  - Limitations: reporting-driven insights; proactive opportunity surfacing (price timing, resale, shared logistics) not evidenced
- **TP-17** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-ambiz-guided.txt`): "…These messages show up on any individual product detail pages… (buying-policy messages shown at point of purchase)"
  - Limitations: policy surfacing at product pages; stale/UNKNOWN/idempotency behavior not evidenced

## Alibaba Group — Alibaba.com B2B marketplace (RFQ, Trade Assurance)

- Category: B2B marketplace | Industries (matrix rows): Sales/BD, Fashion/Apparel, Manufacturing, Construction, Technology/IT
- Edition: public site | Observed: 2026-10-09 | Access: public RFQ UI observed via content extraction + official buying guide read
- URLs: <https://rfq.alibaba.com>, <https://smartbuy.alibaba.com/b2b/how-does-alibaba-b2b-work>
- Captures: `page-alibaba-rfq.json`, `page-alibaba-how.json` | Best evidence class this incumbent: **B**

- **TP-01** — status: `offered`, class **B**
  - Evidence (`captures/text-alibaba-rfq.txt`): "…M+ buyers already source from verified suppliers here, on a B2B marketplace powered by AI sourcing assistants…"
  - Limitations: public RFQ surface observed via content extraction; no interaction/transaction; login surfaces not entered
- **TP-02** — status: `offered`, class **B**
  - Evidence (`captures/text-alibaba-rfq.txt`): "…Accurate supplier matching, fast price comparison Learn about RFQ…"
  - Limitations: comparison mechanics observed as described capability on public UI; side-by-side UI not exercised
- **TP-04** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-alibaba-how.txt`): "…egotiating terms (price, MOQ, shipping, payment method), and placing an order…"
  - Limitations: negotiation documented in official buying guide; price-wait timing not evidenced
- **TP-11** — status: `offered`, class **B**
  - Evidence (`captures/text-alibaba-rfq.txt`): "…Order protection Backed by secure payments, guaranteed delivery, money-back…"
  - Limitations: order-protection claims observed on public UI; claims flow not exercised
- **TP-13** — status: `offered`, class **C**
  - Evidence (`captures/text-alibaba-how.txt`): "…Each listing includes specifications, minimum order quantities (MOQs), pricing tiers, and photos…"
  - Limitations: B2B listing mechanics documented
- **TP-16** — status: `offered`, class **C**
  - Evidence (`captures/text-alibaba-how.txt`): "…secure transaction systems like Trade Assurance…"
  - Limitations: Trade Assurance documented; dispute resolution detail not read
- **TP-18** — status: `offered`, class **B** (partial coverage)
  - Evidence (`captures/text-alibaba-rfq.txt`): "…a B2B marketplace powered by AI sourcing assistants…"
  - Limitations: AI sourcing assistant advertised on public UI; bounded autonomy/limits not evidenced

## U.S. General Services Administration — GSA Advantage! / GSA eBuy / GSA Global Supply (buy.gsa.gov)

- Category: government purchasing portal | Industries (matrix rows): Defense/Gov
- Edition: public federal system | Observed: 2026-10-09 | Access: official .gov page read
- URLs: <https://buy.gsa.gov/buy-now>
- Captures: `page-gsa-buynow.json` | Best evidence class this incumbent: **C**

- **TP-01** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-gsa-buynow.txt`): "…GSA Advantage! GSA eBuy GSA eBuy Open GSA eLibrary GSA Global Supply…"
  - Limitations: nav-level listing of acquisition systems on official buy.gsa.gov; eBuy/eLibrary detail not read
- **TP-11** — status: `offered`, class **C**
  - Evidence (`captures/text-gsa-buynow.txt`): "…GSA Advantage!®, the online shopping and ordering system that provides access to contractors and products and services…"
  - Limitations: official description of GSA Advantage! ordering
- **TP-10** — status: `not_verified`, class **D**
  - Evidence (`captures/search-gsa.json`): "official GSA Global Supply requisition program URL identified; content not read"
  - Limitations: page not read

## Faire — Faire wholesale marketplace

- Category: B2B wholesale marketplace | Industries (matrix rows): Sales/BD, Fashion/Apparel
- Edition: unknown | Observed: 2026-10-09 | Access: page-read attempts returned ad-tracker stub; search-only
- URLs: <https://www.faire.com>, <https://www.faire.com/discover/apply-for-net-60>
- Captures: `page-faire-home.json`, `search-faire.json` | Best evidence class this incumbent: **D**

- **TP-13** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-faire.json`): "official URLs identified: faire.com (Wholesale Marketplace), faire.com/discover/apply-for-net-60, faire.com/support/articles/360016658851; page reads returned tracker stub, no content"
  - Limitations: evaluator could not access page content (ad-tracker stub returned twice); no capability claim made; not proof of absence

## JOOR — JOOR digital wholesale platform (buyer side)

- Category: B2B wholesale platform | Industries (matrix rows): Fashion/Apparel, Sales/BD
- Edition: not identifiable | Observed: 2026-10-09 | Access: official public web page read
- URLs: <https://www.joor.com/retailers>
- Captures: `page-joor-retail.json` | Best evidence class this incumbent: **C**

- **TP-13** — status: `offered`, class **C**
  - Evidence (`captures/text-joor-retail.txt`): "…Retailers frequently use JOOR to browse catalogs and place orders with our vast network of leading global brands…"
  - Limitations: buyer-side page read; ordering workflow detail not exercised
- **TP-01** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-joor-retail.txt`): "…Use JOOR Discover to expand your reach and find new retail partne[r]s…"
  - Limitations: discovery framed for brands finding retailers (reverse direction); buyer discovery of brands not directly evidenced
- **TP-12** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-joor-retail.txt`): "…the all-in-one platform for fashion brands…"
  - Limitations: brand-side platform claim; catalog management detail not read

## Shopify — Shopify B2B (help-center capability list) + Shopify POS

- Category: storefront platform + POS | Industries (matrix rows): Sales/BD, Fashion/Apparel, Supermarkets, Hospitality
- Edition: B2B features documented incl. Plus-only items | Observed: 2026-10-09 | Access: official help-center page + product page read
- URLs: <https://help.shopify.com/en/manual/b2b/getting-started/features>, <https://www.shopify.com/pos>
- Captures: `page-shopify-b2bfeat.json`, `page-shopify-pos.json` | Best evidence class this incumbent: **C**

- **TP-13** — status: `offered`, class **C**
  - Evidence (`captures/text-shopify-b2bfeat.txt`): "…Shopify B2B is a suite of features that allows you to sell business-to-business (B2B) through the Shopify admin and online store…; …curated product catalogs and price lists…"
  - Limitations: official help-center capability checklist read
- **TP-03** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-shopify-b2bfeat.txt`): "…quantity rules to minimum, maximum, or increments that a variant can be ordered in…"
  - Limitations: quantity constraints only; budget/deadline/substitute intent not evidenced
- **TP-10** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-shopify-b2bfeat.txt`): "…Purchase order numbers Allow B2B customers to add purchase order (PO) numbers to an order…"
  - Limitations: PO numbering at checkout only; approval/receiving/invoice-match workflow not evidenced
- **TP-14** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-shopify-pos.txt`): "…Orders & Inventory…; …POS inventory system…"
  - Limitations: nav-level POS inventory claim; barcode/count/reconciliation detail not read
- **TP-12** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-shopify-pos.txt`): "…You could be selling by tomorrow. Switch to Shopify…; …Omnichannel selling…"
  - Limitations: marketing-level storefront claim; admin capability detail not read

## Block, Inc. — Square for Retail POS

- Category: POS/inventory | Industries (matrix rows): Supermarkets, Fashion/Apparel, Hospitality
- Edition: not identifiable from public page | Observed: 2026-10-09 | Access: official product page read
- URLs: <https://squareup.com/us/en/point-of-sale/retail>
- Captures: `page-square-retail.json` | Best evidence class this incumbent: **C**

- **TP-14** — status: `offered`, class **C**
  - Evidence (`captures/text-square-retail.txt`): "…Create purchase orders and vendor profiles to easily order, track, and receive inventory…; …Print barcode labels…; …track…in real time across locations and channels, so you never oversell…"
  - Limitations: product-page level; offline mode and weighted goods not evidenced
- **TP-10** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-square-retail.txt`): "…Create purchase orders and vendor profiles to easily order, track, and receive inventory…"
  - Limitations: retail-scale procurement subset; approvals not evidenced
- **TP-15** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-square-retail.txt`): "…Explore Square Loyalty Keep customers eng[aged]…"
  - Limitations: loyalty dimension only; price timing/resale/shared logistics not evidenced

## Lightspeed Commerce — Lightspeed Retail POS inventory management

- Category: POS/inventory | Industries (matrix rows): Supermarkets, Fashion/Apparel
- Edition: not identifiable | Observed: 2026-10-09 | Access: official product page read
- URLs: <https://www.lightspeedhq.com/pos/retail/inventory-management-software>
- Captures: `page-lightspeed-inv.json` | Best evidence class this incumbent: **C**

- **TP-14** — status: `offered`, class **C**
  - Evidence (`captures/text-lightspeed-inv.txt`): "…Create and manage purchase orders right from your POS inventory system…; …designed for growing, multi-location retailers…; …set reorder points or ideal minimum/maximum stock levels…; …Order, receive and transfer inventory in a few taps…"
  - Limitations: inventory/purchase-order features documented; no-RFID reconciliation detail not evidenced
- **TP-10** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-lightspeed-inv.txt`): "…Create and manage purchase orders right from your POS inventory system…"
  - Limitations: PO + receiving subset; approvals/invoice matching not evidenced

## Toast, Inc. — Toast POS Inventory Management

- Category: restaurant POS/inventory | Industries (matrix rows): Hospitality
- Edition: not identifiable | Observed: 2026-10-09 | Access: official product page read
- URLs: <https://pos.toasttab.com/products/inventory-management>
- Captures: `page-toast-inv.json` | Best evidence class this incumbent: **C**

- **TP-14** — status: `offered`, class **C**
  - Evidence (`captures/text-toast-inv.txt`): "…turns sales and purchasing data into inventory and cost insights…"
  - Limitations: product-page level
- **TP-10** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-toast-inv.txt`): "…combines invoice automation, recipe costing, vendor management, ordering, product catalogs, and Toast POS sales data…"
  - Limitations: purchasing/invoicing subset; approvals not evidenced
- **TP-01** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-toast-inv.txt`): "…vendor management, ordering, product catalogs…"
  - Limitations: vendor catalog management; supplier discovery/marketplace not claimed

## MarketMan — MarketMan purchasing & order management

- Category: restaurant purchasing/inventory | Industries (matrix rows): Hospitality
- Edition: not identifiable | Observed: 2026-10-09 | Access: official product page read
- URLs: <https://www.marketman.com/platform/restaurant-purchasing-software-and-order-management>
- Captures: `page-marketman-purch.json` | Best evidence class this incumbent: **C**

- **TP-10** — status: `offered`, class **C**
  - Evidence (`captures/text-marketman-purch.txt`): "…Chefs and managers can submit purchase orders, check statuses, and manage vendors from one unified platform…; …Purchasing and Receiving Multi-Unit & Commissary…"
  - Limitations: multi-unit purchasing/receiving documented; approval workflow not evidenced
- **TP-14** — status: `offered`, class **C**
  - Evidence (`captures/text-marketman-purch.txt`): "…Restaurant Inventory Management…; …10M+ Invoices Processed…"
  - Limitations: inventory module documented on purchasing page

## eBay Inc. — eBay marketplace + Money Back Guarantee

- Category: consumer resale marketplace | Industries (matrix rows): Fashion/Apparel, Construction (used tools), Entertainment (used gear), Transportation (used parts)
- Edition: public site | Observed: 2026-10-09 | Access: official policy/help page read
- URLs: <https://pages.ebay.com/ebay-money-back-guarantee>
- Captures: `page-ebay-mbg.json` | Best evidence class this incumbent: **C**

- **TP-08** — status: `offered`, class **C**
  - Evidence (`captures/text-ebay-mbg.txt`): "…Turn your pre-loved items into extra cash. Listing is easy, and faster than ever in the app…"
  - Limitations: resale listing advertised on official policy page; listing flow not exercised
- **TP-11** — status: `offered`, class **C**
  - Evidence (`captures/text-ebay-mbg.txt`): "…Need to Return an Item? It’s easy to do on eBay…; …Follow these steps to get your refund…"
  - Limitations: returns/refund steps documented on Money Back Guarantee page
- **TP-16** — status: `offered`, class **C**
  - Evidence (`captures/text-ebay-mbg.txt`): "…eBay Money Back Guarantee…; …Seller protections and secure payments…"
  - Limitations: buyer/seller protection documented; dispute adjudication detail not read

## Poshmark — Poshmark marketplace (seller shipping guide)

- Category: consumer resale marketplace | Industries (matrix rows): Fashion/Apparel
- Edition: public site | Observed: 2026-10-09 | Access: official guide page read
- URLs: <https://poshmark.com/posh_guide/how_to_ship>
- Captures: `page-poshmark-guide.json` | Best evidence class this incumbent: **C**

- **TP-08** — status: `offered`, class **C**
  - Evidence (`captures/text-poshmark-guide.txt`): "…your pre-paid, pre-addressed shipping label. Remember, the postage has already been paid for!…"
  - Limitations: official seller shipping guide read; full listing flow not read

## Depop — Depop marketplace

- Category: consumer resale marketplace | Industries (matrix rows): Fashion/Apparel
- Edition: public site | Observed: 2026-10-09 | Access: public homepage observed via content extraction
- URLs: <https://www.depop.com>
- Captures: `page-depop-home.json` | Best evidence class this incumbent: **B**

- **TP-08** — status: `offered`, class **B**
  - Evidence (`captures/text-depop-home.txt`): "…Depop - buy, sell, discover unique fashion…"
  - Limitations: public marketplace homepage observed; thin content captured; no interaction

## ShareGrid — ShareGrid gear rental marketplace

- Category: rental marketplace | Industries (matrix rows): Entertainment/Media, Construction (equipment)
- Edition: public site | Observed: 2026-10-09 | Access: public marketplace UI observed via content extraction
- URLs: <https://www.sharegrid.com>
- Captures: `page-sharegrid-home.json` | Best evidence class this incumbent: **B**

- **TP-07** — status: `offered`, class **B**
  - Evidence (`captures/text-sharegrid-home.txt`): "…Affordable Rentals for Cameras, Lenses, and Production Gear…; …$149 /day Instant Book…"
  - Limitations: public rental marketplace UI observed; booking flow not exercised
- **TP-08** — status: `offered`, class **B**
  - Evidence (`captures/text-sharegrid-home.txt`): "…Newly Listed for Sale Shop latest arrivals from ShareGrid members…; nav: …Selling Gear › Buying Gear ›…"
  - Limitations: member resale listings observed on public UI
- **TP-16** — status: `offered`, class **B** (partial coverage)
  - Evidence (`captures/text-sharegrid-home.txt`): "nav: …Insurance › Support Center ›…"
  - Limitations: insurance offering present; recourse workflow detail not read

## KitSplit — KitSplit equipment rental marketplace

- Category: rental marketplace | Industries (matrix rows): Entertainment/Media
- Edition: unknown | Observed: 2026-10-09 | Access: site returned maintenance stub at observation time
- URLs: <https://kitsplit.com>
- Captures: `page-kitsplit-home.json` | Best evidence class this incumbent: **D**

- **TP-07** — status: `not_accessible`, class **D**
  - Evidence (`captures/text-kitsplit-home.txt`): "…Stay tuned! We will be back shortly…"
  - Limitations: official site returned a maintenance stub at observation time; no capability claim; not proof of absence

## United Rentals — United Rentals My Equipment / Total Control

- Category: equipment rental (enterprise) | Industries (matrix rows): Construction, Entertainment/Media, Transportation
- Edition: public site | Observed: 2026-10-09 | Access: official feature page read (nav-heavy)
- URLs: <https://www.unitedrentals.com/features/my-equipment>
- Captures: `page-united-my equip.json` | Best evidence class this incumbent: **C**

- **TP-07** — status: `offered`, class **C**
  - Evidence (`captures/text-united-my equip.txt`): "…Introducing: My Equipment | United Rentals…; nav: …Total Control ® Pay Invoices…"
  - Limitations: page largely navigation; My Equipment portal described; booking flow not exercised
- **TP-10** — status: `not_verified`, class **D**
  - Evidence (`captures/text-united-my equip.txt`): "nav shows Total Control® and Pay Invoices; Total Control page read returned tracker stub (captures/page-ur-totalcontrol.json)"
  - Limitations: fleet-management/requisition detail not accessible; not proof of absence

## McMaster-Carr — McMaster-Carr catalog and ordering site

- Category: industrial supplier catalog | Industries (matrix rows): Manufacturing, Construction, Transportation
- Edition: public site | Observed: 2026-10-09 | Access: live public catalog UI observed via content extraction
- URLs: <https://www.mcmaster.com>
- Captures: `page-mcmaster-home.json` | Best evidence class this incumbent: **B**

- **TP-01** — status: `offered`, class **B**
  - Evidence (`captures/text-mcmaster-home.txt`): "…Order Order History Choose a Category Abrading & Polishing Building & Grounds Electrical & Lighting…"
  - Limitations: live public catalog UI observed; search/checkout not exercised
- **TP-10** — status: `offered`, class **B** (partial coverage)
  - Evidence (`captures/text-mcmaster-home.txt`): "…Punchout Log in Create login…"
  - Limitations: punchout (e-procurement integration) present on public UI; integration depth not verified
- **TP-17** — status: `offered`, class **B** (partial coverage)
  - Evidence (`captures/text-mcmaster-home.txt`): "…we’ll respond to your message within an hour… (support responsiveness on public page)"
  - Limitations: support SLA statement only; failure/idempotency behavior not evidenced

## CDW Corporation — CDW business IT purchasing site

- Category: IT reseller | Industries (matrix rows): Technology/IT, Legal/Prof Services, Finance/Banking
- Edition: not identifiable; no account | Observed: 2026-10-09 | Access: official homepage read
- URLs: <https://www.cdw.com>
- Captures: `page-cdw-home.json` | Best evidence class this incumbent: **C**

- **TP-01** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-cdw-home.txt`): "…Your account team is here to help…; …Track orders, manage IT assets and get personalized pricing all in one place…"
  - Limitations: account-team-assisted sourcing; self-serve supplier discovery not evidenced
- **TP-11** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-cdw-home.txt`): "…Track orders, manage IT assets and get personalized pricing all in one place…"
  - Limitations: order tracking + asset management claims

## Global Healthcare Exchange (GHX) — GHX Marketplace (order automation)

- Category: healthcare supply chain / procurement | Industries (matrix rows): Healthcare
- Edition: not identifiable; no provider account | Observed: 2026-10-09 | Access: official product page read
- URLs: <https://www.ghx.com/order-automation-providers/marketplace>
- Captures: `page-ghx-market.json` | Best evidence class this incumbent: **C**

- **TP-01** — status: `offered`, class **C**
  - Evidence (`captures/text-ghx-market.txt`): "…GHX connects providers and suppliers across millions of transactions…"
  - Limitations: provider-supplier network described
- **TP-10** — status: `offered`, class **C**
  - Evidence (`captures/text-ghx-market.txt`): "…Order Automation Automate and standardize order processes to drive more perfect orders…; …Drives purchase activity to contracted items and preferred vendors…; …Drive item and price compliance across the procure-to-pay lifecycle…"
  - Limitations: contract-compliance procurement documented; approval detail not read
- **TP-14** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-ghx-market.txt`): "…Inventory Ma[nagement]… (Inventory Services section)"
  - Limitations: inventory services named; detail not read
- **TP-17** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-ghx-market.txt`): "…using AI to help teams catch problems early…"
  - Limitations: AI problem detection described; user-visible recovery flow not evidenced

## Xometry — Xometry on-demand manufacturing marketplace

- Category: manufacturing marketplace (custom parts) | Industries (matrix rows): Manufacturing
- Edition: public site | Observed: 2026-10-09 | Access: official homepage read
- URLs: <https://www.xometry.com>
- Captures: `page-xometry-home.json` | Best evidence class this incumbent: **C**

- **TP-02** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-xometry-home.txt`): "…Upload your files, get an instant quote, and order online…"
  - Limitations: single-marketplace instant quote; multi-vendor comparison not evidenced
- **TP-11** — status: `offered`, class **C**
  - Evidence (`captures/text-xometry-home.txt`): "…get an instant quote, and order online…"
  - Limitations: online ordering documented
- **TP-01** — status: `offered`, class **C** (partial coverage)
  - Evidence (`captures/text-xometry-home.txt`): "…Custom Manufacturing on Demand | Production Parts and Prototypes | Xometry…; instant-quote manufacturing marketplace"
  - Limitations: manufacturing capability discovery; supplier search not evidenced

## W.W. Grainger — Grainger MRO industrial supply (online ordering)

- Category: industrial supplier catalog | Industries (matrix rows): Construction, Manufacturing, Transportation, Healthcare (facilities)
- Edition: unknown | Observed: 2026-10-09 | Access: read attempts JS-walled; search-only
- URLs: <https://www.grainger.com>, <https://www.grainger.com/content/online-purchasing-solutions>
- Captures: `search-grainger.json`, `page-grainger-purch.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-grainger.json`): "official URLs identified: grainger.com, grainger.com/content/online-purchasing-solutions"
  - Limitations: both page reads returned JS-walled stub (12 chars); official URLs identified from official-domain search results; no capability claim made; not proof of absence

## Medline Industries — Medline medical supplies ordering (incl. order tutorial)

- Category: healthcare supplier portal | Industries (matrix rows): Healthcare
- Edition: unknown | Observed: 2026-10-09 | Access: read attempts JS-walled; search-only
- URLs: <https://www.medline.com>, <https://www.medline.com/help/tutorials/placing-an-order-2>
- Captures: `search-medline.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-medline.json`): "official URLs identified: medline.com, medline.com/help/tutorials/placing-an-order-2"
  - Limitations: both reads returned stub (11 chars); JS-walled; no capability claim made; not proof of absence

## Sysco — Sysco Shop online ordering

- Category: foodservice supplier portal | Industries (matrix rows): Hospitality
- Edition: unknown; login-walled | Observed: 2026-10-09 | Access: read returned JS-disabled stub; search-only
- URLs: <https://shop.sysco.com>
- Captures: `search-sysco.json`, `page-sysco-shop.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-sysco.json`): "official URLs identified: shop.sysco.com"
  - Limitations: read returned JS-disabled stub: …please enable JS to make this app work…; login-walled ordering app; no capability claim made; not proof of absence

## Thomas — Thomasnet B2B sourcing platform

- Category: B2B sourcing/discovery platform | Industries (matrix rows): Manufacturing, Construction
- Edition: unknown | Observed: 2026-10-09 | Access: three read attempts failed/JS-walled; search-only
- URLs: <https://www.thomasnet.com>, <https://www.thomasnet.com/procurement>
- Captures: `search-thomasnet.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-thomasnet.json`): "official URLs identified: thomasnet.com, thomasnet.com/procurement, blog.thomasnet.com/connects-us-buyers-suppliers"
  - Limitations: three reads failed/JS-walled; no capability claim made; not proof of absence

## Instacart — Instacart Platform (grocery e-commerce)

- Category: grocery commerce platform | Industries (matrix rows): Supermarkets
- Edition: unknown | Observed: 2026-10-09 | Access: read attempts failed; search-only
- URLs: <https://company.instacart.com/updates/the-instacart-platform-powering-the-future-of-grocery>
- Captures: `search-instacart.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-instacart.json`): "official URLs identified: company.instacart.com/updates/the-instacart-platform-powering-the-future-of-grocery"
  - Limitations: two read attempts failed (timeout); no capability claim made; not proof of absence

## NuORDER (LBMB) — NuORDER B2B wholesale platform

- Category: B2B wholesale platform | Industries (matrix rows): Fashion/Apparel, Sales/BD
- Edition: unknown | Observed: 2026-10-09 | Access: read attempt failed; search-only
- URLs: <https://www.nuorder.com>, <https://www.nuorder.com/wholesale>
- Captures: `search-nuorder.json` | Best evidence class this incumbent: **D**

- **TP-01** — status: `not_accessible`, class **D**
  - Evidence (`captures/search-nuorder.json`): "official URLs identified: nuorder.com, nuorder.com/wholesale"
  - Limitations: read attempt failed; no capability claim made; not proof of absence

## Not-applicable entries (category scope)

- coupa (Coupa Procurement (Procure-to-Order) + Coupa Sourcing): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-14, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- ariba (SAP Ariba Buying and Invoicing (Procure-to-Pay)): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-14, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- ambiz (Amazon Business (Guided Buying, Approvals)): TP-06, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- alibaba (Alibaba.com B2B marketplace (RFQ, Trade Assurance)): TP-09, TP-10, TP-12, TP-14, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- gsa (GSA Advantage! / GSA eBuy / GSA Global Supply (buy.gsa.gov)): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-13, TP-14, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- faire (Faire wholesale marketplace): TP-05, TP-06, TP-07, TP-09, TP-10, TP-14, TP-17, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- joor (JOOR digital wholesale platform (buyer side)): TP-05, TP-06, TP-07, TP-08, TP-09, TP-14, TP-17, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- nuorder (NuORDER B2B wholesale platform): TP-05, TP-06, TP-07, TP-08, TP-09, TP-14, TP-17, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- shopify (Shopify B2B (help-center capability list) + Shopify POS): TP-06, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- square (Square for Retail POS): TP-05, TP-06, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- lightspeed (Lightspeed Retail POS inventory management): TP-05, TP-06, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- toast (Toast POS Inventory Management): TP-05, TP-06, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- marketman (MarketMan purchasing & order management): TP-05, TP-06, TP-07, TP-09, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- ebay (eBay marketplace + Money Back Guarantee): TP-06, TP-09, TP-10, TP-12, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- poshmark (Poshmark marketplace (seller shipping guide)): TP-05, TP-06, TP-09, TP-10, TP-12, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- depop (Depop marketplace): TP-05, TP-06, TP-09, TP-10, TP-12, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- sharegrid (ShareGrid gear rental marketplace): TP-06, TP-09, TP-10, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- kitsplit (KitSplit equipment rental marketplace): TP-06, TP-09, TP-10, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- unitedrentals (United Rentals My Equipment / Total Control): TP-06, TP-09, TP-12, TP-13, TP-14, TP-18, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- grainger (Grainger MRO industrial supply (online ordering)): TP-05, TP-06, TP-09 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- mcmaster (McMaster-Carr catalog and ordering site): TP-05, TP-06, TP-09 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- cdw (CDW business IT purchasing site): TP-05, TP-06, TP-09 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- ghx (GHX Marketplace (order automation)): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-13, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- medline (Medline medical supplies ordering (incl. order tutorial)): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-13, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- sysco (Sysco Shop online ordering): TP-05, TP-06, TP-07, TP-08, TP-09, TP-12, TP-13, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- thomasnet (Thomasnet B2B sourcing platform): TP-05, TP-06, TP-09 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- xometry (Xometry on-demand manufacturing marketplace): TP-05, TP-06, TP-09, TP-12, TP-14, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim
- instacart (Instacart Platform (grocery e-commerce)): TP-06, TP-09, TP-10, TP-12, TP-13, TP-19 — outside incumbent product category per task-pack applicability guidance; category-level judgment, not an evidence-backed absence claim