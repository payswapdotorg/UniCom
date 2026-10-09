# W3-014 Completion Report — Commerce Incumbent Evidence and Human-Validation Readiness

Worker: W3-014 (subagent, docs/evidence lane — no build environment required or used)
Branch: work/w3-014 (base eb1ceca)
Date: 2026-10-09
Work order: docs/work-orders/W3-014.md · Handoff: docs/FINAL-TL-HANDOFF-POST-V3-REAL-WORLD-VALIDATION-2026-10-09.md · Matrix: docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md

## 1. What was delivered

**Scope A — incumbent comparison evidence (docs/competitors/)**
1. `TASK-PACK.md` + `task-pack.json` — frozen equivalent task pack: 19 matched commerce capabilities (TP-01…TP-19) mapped to the journey registry (V3-EXPERIMENT-PROTOCOL §10, J1–J19), committed BEFORE any evidence capture (commit f3b0042 precedes the ledger commit).
2. `EVIDENCE-LEDGER.md` + `ledger.json` — versioned incumbent evidence ledger: 28 incumbents, 73 observations, every claim with vendor/product/edition, observation date (2026-10-09), access mode, URL, observed workflow, preconditions, evidence pointer (capture file + verbatim quote) and limitations.
3. `WORKFLOW-COMPARISON.md` — per-workflow comparison tables (19 tables, one per task-pack capability), UNiCOM row honestly stated at contract level (no rendered UI — TL Gate-0 finding), negative findings retained on both sides, no aggregate winner.
4. `EVIDENCE-GAP-REGISTER.md` + `gap-register.json` — gaps grouped by all 13 matrix industries, by capability (TP-01…TP-19), and by evidence class.
5. `BLOCKED-TASKS.md` — explicit blocked list by account access (12 items), site access (10 items, class D), study authorization (2), environment/UNiCOM side (2, owned by W1-010/W2-010 lanes).
6. `captures/` — 30 raw web-search JSONs + 32 raw page-read JSONs + 32 extracted text captures committed as inspectable evidence (18 MB).

**Scope B — human-validation readiness (docs/human-validation/)**
7. `STUDY-PROTOCOL.md` — reviewable protocol: research questions, mixed-methods design, recruitment criteria, role×industry×firm-size sampling plan (13 industries × 3 strata), task-script mapping to the frozen task pack, success/failure measure vocabulary (PASS / PASS-WITH-HELP / FAIL / BLOCKED-ENV / ABSENT-UI / NOT-APPLICABLE / MISSING), bias register (B1–B10), withdrawal process, privacy/data-retention, denominators + missing-data plan, descriptive-first analysis plan.
8. `CONSENT-AND-RESEARCH-MATERIALS.md` — screener, informed-consent template, 18 facilitator task-script cards mapped to TP/Journey IDs, interview/usability question sets, sampling tracker template, withdrawal script, mandatory labels separating synthetic / incumbent-evidence / human data.
9. `package-manifest.json` — machine-readable package map + element-coverage checklist.
**PREPARE-ONLY honored: no recruitment, no contact, no participant data, nothing executed.**

## 2. Actual research process (tools and sources)

- Toolchain: `z-ai` CLI — `web_search` (30 queries → official-domain URLs per incumbent) and `page_reader` (37 read attempts across 32 URLs; content extraction, no login, no interaction, no transaction, no vendor outreach, no account creation).
- Observation window: 2026-10-09 ~15:30–17:20 UTC, recorded per incumbent.
- Sources: vendor official product/help/policy pages (Coupa, SAP, Amazon Business, GSA/buy.gsa.gov, JOOR, Shopify help center, Square, Lightspeed, Toast, MarketMan, eBay policy, Poshmark guide, GHX, Xometry, CDW, United Rentals, McMaster-Carr, Alibaba smartbuy guide) and public commerce surfaces observed via content extraction (Alibaba RFQ, ShareGrid, Depop, McMaster-Carr catalog).
- Access failures recorded honestly as class D: Faire (ad-tracker stub ×2), KitSplit (maintenance stub), Grainger/Medline (JS-walled ×2 each), Sysco Shop (JS/login-walled), Thomasnet (×3), Instacart (timeouts ×2), NuORDER, United Rentals Total Control sub-page.

## 3. Evidence-class counts

| Class | Observations | Meaning in this pass |
|---|---:|---|
| A | **0** | No authorized accounts/sandboxes exist; all A-dependent work is in BLOCKED-TASKS.md |
| B | **11** | Public UIs observed via content extraction only (no interaction/transaction) |
| C | **51** | Official documentation pages read; depth limits (nav-level/marketing/module-level) recorded per observation |
| D | **11** | Not accessible/not verified; official URLs retained as pointers; supports no claim |

Capability coverage (incumbent side, offered-with-evidence observations): TP-01 sourcing ×7, TP-02 ×4, TP-03 ×4, TP-04 ×3, TP-07 rental ×3, TP-08 resale ×4, TP-10 procurement ×9, TP-11 orders ×8, TP-12 ×3, TP-13 B2B ×5, TP-14 inventory ×7, TP-15 ×3 (partial), TP-16 ×5, TP-17 ×3 (partial), TP-18 ×1 (partial). Weakest (0–2 offered, consistent with category expectations, absence never claimed): TP-05, TP-06, TP-09, TP-19.

## 4. Honesty and scope compliance

- No fabrication: every incumbent claim cites a committed capture + verbatim quote + class; no prices, latency, market share/position, or invented UI actions anywhere; **no timing claims at all** (no reproducible comparable-condition method exists — UNiCOM has no rendered UI this phase).
- Categories kept separate: `offered / not_verified / not_accessible / not_applicable`; an inaccessible tool is never treated as proof the competitor lacks a feature.
- Commerce-only scope per the matrix: no comparisons against Autodesk/Procore/EHR/fleet/legal/creative platforms; UNiCOM's surfaces reported honestly as contract-level (negative finding retained in every comparison table header).
- Synthetic labels: V3 numbers referenced anywhere are labelled "synthetic simulation estimate"; no blending with human or incumbent evidence; human-validation package prepared but not executed.
- V3 artifacts and all state files untouched; no writes to W1-010's (packages/experience/test/browser/) or W2-010's (packages/experience/test/resilience/) surfaces.

## 5. Deviations from the work order

1. B-class observations are content-extraction observations of public UIs, not interactive sessions — the class B definition is met ("authentic official interactive demo/public UI observed") with an explicit limitation recorded on each (no interaction exercised). If the TL rules these should be C, 11 observations reclassify to C (ledger field `evidence_class` is per-observation and trivially re-mappable).
2. Workflow tables cover 28 incumbents; the matrix names additional comparators (Fastenal, Ferguson, HD Supply, McKesson, Cardinal Health, US Foods, Restaurant Depot, NAPA, FleetPride, SHI, Staples Business Advantage, Sunbelt, WooCommerce, BigCommerce, Ramp/Brex, Oracle) that are registered as industry-level coverage gaps rather than half-evidenced entries (see EVIDENCE-GAP-REGISTER.md).
3. No A-class evidence was producible (no accounts exist) — this is the expected honest outcome, not a shortfall against the work order, which anticipates B/C/D realism.

## 6. Next frontier (recommendations)

1. Operator decision on class-B treatment (§5.1) — one field flip in ledger.json if reclassification is ordered.
2. A follow-up JS-rendering pass (agent-browser) could convert the 10 class-D site-access blocks into B/C without any accounts.
3. A-class program: a small set of free-trial/self-serve products (Shopify, Square, Lightspeed, Toast, MarketMan) could yield real A-class evidence — but requires operator authorization to create accounts (listed in BLOCKED-TASKS.md A-7).
4. Human-validation package → operator review → authorization gates (Study Protocol §0) — its rendered-UI precondition depends on W1-010's lane.
5. Merge order suggestion: after TL evidence inspection, before G3 expansion, so expanded-suite comparators can reuse the frozen task pack.
