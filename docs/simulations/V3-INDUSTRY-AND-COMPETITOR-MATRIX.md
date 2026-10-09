# V3 Industry Benchmark Matrix — Commerce Capabilities Only

Purpose: compare UNiCOM only with products, marketplaces, supplier portals, POS/inventory systems and procurement tools that companies use to perform the same commerce capabilities UNiCOM provides or explicitly intends to provide. This is NOT an industry-software replacement bake-off.

## Absolute scope rule

**Do not benchmark UNiCOM against general industry operating software whose primary purpose is outside commerce.**

Specifically, do NOT score Autodesk, Procore, Jira, ServiceNow, Epic, Oracle OPERA, Samsara, Motive, Adobe, Clio, iManage, Deltek Costpoint or comparable vertical project/clinical/fleet/creative/legal/defense operations platforms as overall competitors merely because a synthetic firm uses them. They may be part of a company's wider stack, but they are outside this comparison unless a distinct, verifiable feature is being used specifically for an in-scope commerce task—and the benchmark must isolate only that task. In the industry rows below, do not treat those broader vertical systems as incumbent baselines.

The comparisons are limited to workflows UNiCOM provides or intends to provide, such as:

- product/catalog, storefront, listing and channel distribution;
- supplier discovery, sourcing, purchasing, quote comparison, negotiation and procurement approvals;
- buyer intent, constrained shopping, buy-now-versus-wait and substitution;
- connected marketplace/channel search, checkout/order execution and order status;
- price comparison, price-drop timing, promotions, budgets and loyalty/value recovery;
- inventory, POS, purchasing/receiving, replenishment, multi-location stock and reconciliation;
- fulfillment, delivery/pickup, returns, refunds, exchanges and recourse;
- B2B wholesale, merchant proposals and connected supplier relationships;
- existing group-buy discovery, group formation/recruitment, merchant demand-generated group-buy proposals and explicit commitments;
- purchase-versus-rent/borrow, item rental, resale, consignment and trade/swap;
- bounded multi-hop trade cycles across multiple willing participants;
- proactive opportunity discovery: price timing, resale/rental, unused-item value recovery, warranty/recourse, subscription savings, local pickup, shared logistics, loyalty and future-demand opportunities;
- live commerce where buying, selling, auction, inventory or order execution is the actual capability;
- trust/proof and commerce fraud/abuse mitigation;
- no-RFID physical retail using POS, files, receipts, barcode/camera, weighted goods and LocalCommerceEdge;
- merchant analytics, demand forecasting, pricing/promotion and bounded autonomous-store actions;
- connector/API/SDK/protocol/feed/file paths only insofar as they enable these commerce workflows.

Do not compare broad project management, clinical records, fleet dispatch, creative production, legal matter management, security operations or generic CRM functions that UNiCOM does not claim to replace. They can be context for the project; only the commerce tasks are scored.

## Cohort design

Each industry is represented by three synthetic firms:

| Firm tier | Synthetic staff personas | Projects per firm | Primary commerce stressor |
|---|---:|---:|---|
| Small | 25 | 200 | Low purchasing/admin capacity, price sensitivity, manual supplier/channel workflows |
| Medium | 150 | 200 | Cross-team purchasing, supplier coordination, multi-location/channel handoffs |
| Large | 1,000 | 200 | Procurement governance, segregation of duties, multi-entity purchasing and exception volume |

Total: 13 industries × 3 sizes = 39 firms; 39 × 200 = 7,800 projects; persona target = 15,275. These are simulation design targets, not results.

## Common incumbent baseline for every firm

For each synthetic firm, freeze the actual category of tools it currently uses for commerce tasks, for example:

1. **Purchasing/procurement and supplier sourcing:** Coupa, SAP Ariba, Oracle procurement tools, Amazon Business, Alibaba.com or industry-specific supplier portals, only for the purchasing/sourcing functions being tested.
2. **Storefront/catalog/checkout/merchant operations:** Shopify, WooCommerce, BigCommerce, Square, Lightspeed or the firm's actual comparable commerce/POS platform, where applicable.
3. **Wholesale/B2B and merchant discovery:** Faire, JOOR, NuORDER, Alibaba.com, Thomasnet, Xometry or relevant supplier/wholesaler portals, where applicable.
4. **Resale/rental/peer commerce:** eBay, Depop, Poshmark, relevant rental marketplaces, ShareGrid or KitSplit where the task genuinely concerns item rental/resale; use only the comparable journey.
5. **Local/physical commerce:** the existing POS, supplier portal, spreadsheet/CSV, receipts, scanner/camera count and local delivery/pickup workflow.
6. **Supporting tools:** spreadsheets, email and manual processes may be recorded as the incumbent workflow where there is no dedicated tool. They must not be disguised as a full competing software product.

This is a toolset comparison, not a single-vendor tournament. Different incumbents may be best at different commerce tasks. The benchmark must state where UNiCOM replaces, orchestrates or still depends on each incumbent.

## Commerce-only industry rows

### 1. Construction / engineering / contractors — purchasing only
Commerce tasks: materials and parts sourcing; quote comparison; bulk and split purchasing; equipment purchase vs rental; used-tool resale; supplier lead time/availability; delivery to a site; change in quantities/budget; returns/credit/recourse; local supplier pickup.
Representative commerce comparators: Amazon Business, Grainger, Fastenal, Ferguson, HD Supply and the firm's actual trade-supplier ordering portals; United Rentals or Sunbelt Rentals only for rental purchase journeys; used-equipment marketplaces for resale.
Excluded comparators: construction project-management, BIM, design, RFI/submittal and scheduling suites. Do not score Autodesk or Procore as general competitors.

### 2. Finance / banking / accounting — organizational purchasing only
Commerce tasks: approved buying, vendor/supplier discovery, procurement budgets, quote comparison, purchase authorization, invoice/PO matching, renewal savings and evidence for purchase approvals.
Representative commerce comparators: Coupa, SAP Ariba, Amazon Business and purchasing/expense-control workflows in tools such as Ramp or Brex only where they perform the exact tested procurement/approval capability.
Excluded comparators: core banking, accounting ledgers, tax preparation, investment and general finance functions.

### 3. Sales / business development — buying and selling commerce
Commerce tasks: customer/merchant product offers; B2B catalog and quote; discount and promotion; order creation; wholesale buyer discovery; deal-specific procurement; negotiation; group-buy proposals; post-sale returns/recourse.
Representative commerce comparators: Shopify B2B, Faire, Alibaba.com, Amazon Business, wholesale supplier portals and the firm's actual storefront/catalog/order tool. CRM may be included only for a commerce-specific quote/order/offer journey.

### 4. Technology / software / IT services — business purchasing
Commerce tasks: hardware/device and accessory procurement, SaaS/tool subscription purchase or renewal savings, supplier quotes, license/vendor purchasing, replacement/resale/rental, approvals and delivery/inventory tracking.
Representative commerce comparators: CDW, SHI, Amazon Business, vendor storefronts/marketplaces and Coupa/SAP Ariba where actually used for purchasing.
Excluded comparators: issue tracking, source hosting, ITSM and generic project-management tools.

### 5. Healthcare organizations — supplies/equipment procurement only
Commerce tasks: medical and facilities supplies, approved device procurement, catalog/contract pricing, purchase orders, stock/replenishment, vendor availability, recall-related purchasing holds and returns/credits.
Representative commerce comparators: GHX, McKesson, Medline, Cardinal Health or the organization's actual supplier portals and procurement systems; only the purchasing/inventory/order workflows are compared.
Excluded comparators: EHRs, clinical decision systems, patient administration and care delivery. No patient data or clinical decisions in the simulation.

### 6. Transportation / delivery — fleet and transport purchasing only
Commerce tasks: vehicle parts, tires, maintenance supplies, fuel/consumables procurement, rental vs purchase of equipment, parts availability across depots, supplier choice, emergency sourcing, returns/credits and local pickup.
Representative commerce comparators: FleetPride, NAPA Auto Parts, Grainger, Amazon Business, manufacturer/dealer portals and relevant truck/vehicle/equipment rental channels.
Excluded comparators: telematics, GPS, fleet dispatch and route-optimization platforms except where a commerce-specific procurement or ordering feature is explicitly isolated.

### 7. Hospitality / restaurants / hotels — goods, stock and supplier ordering
Commerce tasks: food/beverage/linen/amenities ordering, POS-to-inventory purchasing, supplier quote/availability, weighted/dated goods, peak-demand stock planning, equipment rental, event group-buy, replenishment, returns/credits and guest-facing sale/refund where in scope.
Representative commerce comparators: Sysco Shop, US Foods ordering, Restaurant Depot or local wholesaler portals, MarketMan purchasing/inventory workflows, and Toast/Square/Shopify POS where the task is POS/catalog/order/stock.
Excluded comparators: hotel property management or generic reservation/operations software unrelated to a commerce task.

### 8. Fashion / apparel / retail brands — product, wholesale and circular commerce
Commerce tasks: catalog and channel listings, wholesale buying/selling, supplier/trims procurement, size/variant availability, dynamic promotions, markdown timing, group purchase, rental/resale/consignment and fulfillment/returns.
Representative commerce comparators: Shopify/Shopify B2B, Faire, JOOR, NuORDER, Alibaba.com, eBay, Depop, Poshmark and relevant rental/consignment marketplaces. Score each product only on the relevant commerce journey.
Excluded comparators: general product-lifecycle/design software and creative work tools.

### 9. Entertainment / media / production — equipment and merchandise commerce
Commerce tasks: buy vs rent cameras/audio/lighting/set equipment, compare rental terms/deposits, book available equipment, procure event/production supplies, resale used equipment, merchandise catalog/orders, group purchase and returns/claims.
Representative commerce comparators: ShareGrid, KitSplit, relevant equipment-rental/used-equipment marketplaces, Amazon Business, specialist gear suppliers and the producer's actual merchandise storefront/checkout.
Excluded comparators: creative suites, media review, editing, asset management and production scheduling.

### 10. Legal / professional services — office, equipment and service procurement
Commerce tasks: approved office/device/software purchases where applicable, external expert/vendor sourcing, supplier quotes, subscriptions/renewal savings, bulk purchasing, rentals, invoice/PO evidence and returns/recourse.
Representative commerce comparators: Amazon Business, Staples Business Advantage, procurement suites and relevant specialist supplier portals actually used by the simulated firm.
Excluded comparators: legal practice management, legal research, matter-management and privileged document/email systems.

### 11. Defense / security / government contracting — authorized unclassified procurement only
Commerce tasks: compliant unclassified supply sourcing, approved supplier/catalog lookup, purchase authorizations, budget and quote comparison, equipment purchasing/rental, order/receiving evidence and returns/credit.
Representative commerce comparators: GSA Advantage, authorized unclassified supplier portals, Amazon Business where permitted, and purchasing/procurement tools such as SAP Ariba/Coupa where permitted.
Excluded comparators: command-and-control, classified systems, cyber-operations platforms and defense project/accounting systems unrelated to the commerce task. Use synthetic unclassified data only; no restricted or classified actions.

### 12. Manufacturing / supply chain — procurement and inventory commerce
Commerce tasks: BOM and component sourcing, supplier discovery, quote comparison, substitutes/approved alternates, purchase-order release/receiving, inventory replenishment, lot/serial evidence, rental vs purchase of tooling, surplus resale, supplier dispute and multi-site stock.
Representative commerce comparators: SAP Ariba, Coupa, Thomasnet, Xometry, Alibaba.com, Grainger, McMaster-Carr, manufacturer/supplier portals and the firm's relevant ERP purchasing/inventory module. Compare only the commerce function.
Excluded comparators: CAD, PLM, MES and generic engineering execution outside purchasing, supplier commerce and inventory.

### 13. Supermarkets / local retail — no-RFID is mandatory
Commerce tasks: catalog/product pricing, promotions, POS orders, supplier ordering, purchase orders/receiving, weighted goods, barcode/camera stock count, inventory reconciliation, replenishment, expiry/recall purchasing, local delivery/pickup, customer intent, group buying, merchant group-buy offers, substitutions, resale/consignment where relevant, refunds and fraud/recourse.
Representative commerce comparators: Square POS, Shopify POS, Lightspeed where applicable, local grocery POS, wholesale portals (for example local cash-and-carry/supplier portals), Instacart where the task is shopper ordering/availability, and spreadsheet/CSV/receipt workflows.
No-RFID cohort requirements: POS/file-only/browser-only modes, barcode/mobile camera, weighted goods, offline queue and reconciliation. RFID, smart shelves and advanced sensors are optional only.

## All major UNiCOM user journeys must be simulated

Do not restrict the campaign to procurement or conventional shopping. Every industry cohort must receive journeys relevant to its role and commerce scope from the feature matrix:

1. Buyer intent with deadline, maximum total cost, quality, privacy, security, delivery/pickup and acceptable substitutes.
2. Source and compare offers across connected merchants/providers; explain uncertainty and provider state.
3. Buy now vs wait for price or inventory; negotiate or substitute while respecting hard constraints.
4. Discover an existing group-buy; join only after visible user authorization.
5. Detect latent buyer demand, recruit willing participants and send a group-buy proposal to a merchant agent; merchant accepts, rejects or counters terms.
6. Rent/borrow vs buy; compare availability, rental period, deposit, condition and recourse.
7. Discover resale, rental, consignment and under-used-item opportunities; produce evidence and user-controlled listing/action.
8. Discover price-drop timing, warranty/recourse, subscription savings, loyalty, local pickup and shared-logistics opportunities.
9. Execute a bounded multi-hop trade cycle among at least three synthetic users. Each leg requires individual authorization and proof; test missing consent, privacy leakage, cycle-length limits and a participant dropping out.
10. Merchant journeys: storefront, catalog, price/promotion, inventory, order, fulfillment, return/refund, B2B, multi-location, supplier buying and customer support.
11. Autonomous-store recommendation/execution under margin, spend, inventory, promotion and approval limits.
12. Commerce Twin what-if/counterfactual scenarios; ensure prediction is never treated as canonical truth.
13. Connect or operate through API/SDK, marketplace, supplier portal, browser-only, feed/file and live-commerce paths as relevant to the firm's commerce tools.
14. Physical retail and supermarket journeys without RFID.
15. Trust/security: fake review/ring, counterfeit or wrong-item shipment, false non-delivery/item-mismatch claim, return/refund abuse, connector compromise, capability-scope abuse and prompt injection from third-party commerce content.
16. Cross-channel order lifecycle, partial failures, stale/UNKNOWN provider responses, duplicate action/idempotency, evidence and recourse.
17. Feature discovery: every tested feature must be found through visible navigation, universal intent, contextual opportunity or onboarding, starting from an ordinary landing screen.

For each required journey record role applicability. Do not force physically irrelevant tasks onto every role, but ensure all 17 families appear in the campaign and all relevant journeys appear for each industry. A missing GUI path is scored as ABSENT.

## Comparator evidence classes

- A: authorized direct user interaction with an actual incumbent UI/account/sandbox.
- B: official interactive demo or authentic public interactive UI observed.
- C: official product documentation used as a capability checklist only.
- D: unverified, inaccessible or hearsay. D must not contribute to performance superiority claims.

Never invent competitor GUI sessions, pricing, market share or timing. Compare identical tasks and known inputs. If the incumbent system cannot be run, report capability coverage only and leave performance comparison UNKNOWN.

## Fairness and scope boundaries

- Freeze in-scope capabilities before examining scores.
- Compare the commerce task—not the whole industry system.
- Do not assume UNiCOM replaces core banking, statutory ledgers, EHRs, legal matter repositories, project-management systems or classified systems.
- Distinguish replacement from orchestration: UNiCOM may win as main interface while specialist commerce/provider systems remain connected.
- No real orders, payments, vendor outreach, private company datasets or live production mutation.
- All adoption rates are synthetic estimates until validated with consenting real professionals.
