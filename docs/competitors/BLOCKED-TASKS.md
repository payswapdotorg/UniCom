# W3-014 Blocked-Tasks List — Access, Paid-Plan, Permission and Demo-Availability Blockers

Date: 2026-10-09. Honest record of what could NOT be evidenced this phase and the exact prerequisite for unblocking. An entry here is NOT evidence that a competitor lacks a capability.

## 1. Blocked by vendor account / customer status (Class A unavailable)

No vendor accounts, sandboxes or paid plans exist in this program. The following tasks are blocked pending operator-provided access or authorized vendor sandbox programs (each would upgrade the corresponding ledger entries from B/C/D to A):

| # | Blocked task | Incumbent(s) | Prerequisite |
|---|---|---|---|
| A-1 | Observe requisition→approval→PO→receiving→invoice-match workflow in a live tenant | Coupa, SAP Ariba | Demo tenant / vendor-arranged sandbox / customer co-validation agreement |
| A-2 | Observe Guided Buying policies, approval chains and PO workflows in-session | Amazon Business | Business account with admin-configured policies |
| A-3 | Observe GSA eBuy RFQ flow (schedule-holder quoting) | GSA eBuy | Federal contracting role; restricted system |
| A-4 | Observe Faire wholesale order flow, Net-60 terms, returns (Fresh Dance program) | Faire | Retailer account approval |
| A-5 | Observe JOOR/NuORDER order sheets, line sheets, order tracking | JOOR, NuORDER | Brand/retailer account |
| A-6 | Observe Shopify B2B store + POS in-session (catalogs, price lists, quantity rules, PO numbers) | Shopify | Store with Plus trial / dev store |
| A-7 | Observe Square for Retail / Lightspeed / Toast / MarketMan inventory, PO, receiving, count, reconciliation flows | Square, Lightspeed, Toast, MarketMan | Free trials exist but require account signup + business data — operator authorization required before creating any accounts |
| A-8 | Observe GHX order automation / contract compliance in-session | GHX | Provider/supplier relationship |
| A-9 | Observe Sysco Shop ordering, pricing, delivery windows | Sysco | Sysco customer account |
| A-10 | Observe Grainger/McMaster CDW-style account purchasing (shared account lists, punchout live) | Grainger, McMaster-Carr, CDW | Business account; punchout requires e-procurement integration |
| A-11 | Observe United Rentals Total Control (rental fleet management, requisitions) | United Rentals | Total Control account |
| A-12 | Observe eBay/Poshmark/Depop seller flows end-to-end (listing, offers, returns, disputes) | eBay, Poshmark, Depop | Seller accounts; creating them = participant actions requiring operator authorization |

## 2. Blocked by site access at observation time (Class D — content not readable)

| # | Incumbent | What happened | What is still citable |
|---|---|---|---|
| D-1 | Faire (faire.com) | two page reads returned an ad-tracker stub instead of content | official URLs in `captures/search-faire.json` |
| D-2 | KitSplit (kitsplit.com) | site returned a maintenance stub ("Stay tuned! We will be back shortly") | stub captured in `captures/text-kitsplit-home.txt` |
| D-3 | Grainger (grainger.com) | two reads returned a 12-char JS-walled stub | official URLs in `captures/search-grainger.json` |
| D-4 | Medline (medline.com) | two reads returned an 11-char stub | official URLs in `captures/search-medline.json` |
| D-5 | Sysco Shop (shop.sysco.com) | read returned "please enable JS to make this app work" (login-walled SPA) | official URL in `captures/search-sysco.json` |
| D-6 | Thomasnet (thomasnet.com) | three read attempts (home, /procurement, official blog) failed or returned stubs | official URLs in `captures/search-thomasnet.json` |
| D-7 | Instacart Platform (company.instacart.com) | two read attempts failed (timeout) | official URLs in `captures/search-instacart.json` |
| D-8 | NuORDER (nuorder.com) | read attempt failed | official URLs in `captures/search-nuorder.json` |
| D-9 | United Rentals Total Control sub-page | read returned tracker stub | parent page evidence retained (`captures/text-united-my equip.txt`) |
| D-10 | SAP Ariba Sourcing detail (RFx) | page not read this pass; URL identified | `captures/search-ariba.json` |

Remedies: retry with a JS-rendering browser (agent-browser) in a follow-up pass; or request A-class access per §1.

## 3. Blocked by study authorization (human-validation related)

| # | Blocked task | Prerequisite |
|---|---|---|
| H-1 | Any recruitment, contact or scheduling of professional participants | Operator authorization + ethics/consent approvals (Scope B is PREPARE-ONLY; see docs/human-validation/) |
| H-2 | Any real orders, quotes requests to vendors, RFQ submissions, or marketplace transactions as part of competitor evidence | Operator authorization (would constitute live commerce mutation — prohibited by the handoff) |

## 4. Blocked by environment (UNiCOM side — recorded for the comparison, owned by other lanes)

| # | Blocked task | Owner |
|---|---|---|
| U-1 | Rendered-browser UNiCOM workflow evidence (screenshots, navigation, timings) — required before ANY head-to-head UI or timing comparison | W1-010 lane (packages/experience/test/browser/); prerequisite: a rendered host UI for the experience plane |
| U-2 | UNiCOM resilience/failure/UNKNOWN user-visible behavior | W2-010 lane (packages/experience/test/resilience/) |

## 5. Explicitly NOT blocked (no action needed)

- Web research on official public pages (completed for 28 incumbents, 73 observations).
- Synthetic-label discipline: all V3 numbers referenced in deliverables are labelled synthetic.
