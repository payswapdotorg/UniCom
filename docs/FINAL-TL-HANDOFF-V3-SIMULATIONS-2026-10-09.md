# Final TL Handoff — V3 Cross-Industry Simulation and Adoption Optimization
Date: 2026-10-09
Repo: payswapdotorg/UniCom
Program state: docs/development-state/v3-simulation-state.json

## Directive

Execute the V3 simulation charter. The goal is to measure and improve UNiCOM's ability to become (A) the only tool required for in-scope workflows and (B) the user's main interface across complex business projects.

The product must be experienced through its UI exactly as an end user would experience it. A feature not discoverable in the GUI is ABSENT for the simulation score, even if it exists in a service/API, a direct link or a test helper.

This is a new simulation/improvement programme. It does not alter the frozen architecture. It does not authorize a V2 production push or production mutations.

## Immediate dispatch

Activate these three READY Work Orders in parallel after recording activation in the V3 state file:

- W1-009 — project/procurement scenarios and deterministic outcome oracle.
- W2-009 — synthetic professional personas, representative incumbent benchmarks and adoption measurement.
- W3-009 — GUI-only browser runner, interaction evidence and discoverability checks.

Exactly three workers maximum. The TL is the orchestration/acceptance lane, not a fourth worker.

## Scale target

39 synthetic firms:
- 13 industry families;
- small / medium / large for each;
- 200 distinct project instances per firm;
- 7,800 project runs total;
- 15,275 synthetic professional personas.

If the full campaign is too large for the available runner, first run a declared pilot and derive a measured throughput/cost plan. Do not silently reduce the target or report a pilot as the full study. The final run must reconcile planned, completed, blocked and skipped counts.

## Required benchmarking

Use docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md.

Benchmark identical in-scope task goals against a representative incumbent stack per firm. Test incumbent software through authentic authorized UI where possible. Every competitor observation gets evidence class A (real UI trial), B (official interactive demo/UI), or C (documentation capability baseline).

Do not state or imply that all competitor GUIs were tested if they were not accessible. No undocumented price, market share, task speed or capability claims.

## GUI-only law

For UNiCOM, a scored task must start from the homepage or the ordinary role landing screen and complete via visible user interactions. No direct internal service/API operation, direct DB mutation, hidden route or test helper may complete a scored task. First-discovery journeys cannot deep-link to target features. Missing/undiscoverable GUI paths score as absent.

Every journey must save evidence, including failed journeys, blocked connections, approval states, task outcomes and recovery. Missing evidence is not PASS.

## Measure adoption properly

Produce four separate numbers:
1. Technical full-switch eligible people.
2. Simulated stated willingness to switch to UNiCOM alone for the defined scope.
3. Main-interface eligible people.
4. Simulated stated willingness to use UNiCOM as their default/main interface.

Report counts and percentages by industry, firm size and role, with denominators and sensitivity across seeds. Separate strict replacement of in-scope tools from main-interface use with connected specialists.

Synthetic personas generate simulation estimates, not validated human preferences. All reports must include this caveat prominently.

## Improvement loop

After baseline:
1. TL reads every failure cluster and examines the GUI evidence.
2. Rank root causes using frequency × impact × risk × friction.
3. Derive specific, pairwise-disjoint remediation orders across the three lanes.
4. Require tests and GUI journey evidence for every fix.
5. Replay baseline failures and run an untouched holdout.
6. Repeat for at least two improvement cycles.
7. Stop only after frozen quality/safety gates pass and the held-out results stabilize, or document unresolved blockers.

Do not optimize only for aggregate averages; check the small-firm, large-firm and regulated-workflow tails.

## Acceptance / governance

The TL is the only party who can set a Work Order COMPLETE after rerunning its gates on the merged lineage.

Each work order's report must list actual commands, test outputs, commits, screenshots/evidence pointers, scenario counts, blocked/UNKNOWN counts and next frontier.

Never let a green architecture check substitute for a journey. Never let a high simulated adoption score hide a critical security, authority, financial truth, privacy or data-integrity failure.

Keep V1/V2 progress state immutable. Update only docs/development-state/v3-simulation-state.json for this programme.

## Final output expected

Produce a committed graph and executive report containing:
- work-order progress with green ticks;
- baseline vs each improvement cycle;
- all 13 industries and 3 firm sizes;
- technical full-switch eligibility;
- simulated willingness to switch entirely;
- main-interface eligibility;
- simulated willingness to use UNiCOM as main interface;
- top adoption blockers and evidence;
- changes made with links to merged commits and regression tests;
- holdout performance;
- competitor evidence quality;
- limitations and required human validation.

Do not invent results before the browser campaign actually runs.

## Sources and specs

- Charter: docs/V3-SIMULATION-ADOPTION-CHARTER-2026-10-09.md
- Method: docs/simulations/V3-EXPERIMENT-PROTOCOL.md
- Cohorts: docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md
- State: docs/development-state/v3-simulation-state.json
- Frozen architecture: spec/architecture/FROZEN-ARCHITECTURE.md
- Invariants: spec/architecture/INVARIANTS.md
- Feature matrix: docs/FEATURE-COMPLETENESS-MATRIX.md
- No-RFID supermarket: docs/SUPERMARKET-WITHOUT-RFID.md
## Operator correction — binding benchmark scope amendment (2026-10-09)

UNiCOM is commerce-only. Do not compare it against Autodesk, Procore or other broad vertical project/operations tools as overall competitors. Those may exist in a firm's environment, but only purchasing, supplier sourcing, POS/inventory, storefront/catalog, order/fulfillment, procurement, marketplace, rental/resale, group-buy, trade and other in-scope commerce tasks are to be compared. Use the revised industry matrix as the authoritative set of commerce-only incumbents and evidence classes.

The simulation must explore ALL major UNiCOM journeys, not just ordinary item procurement:
- buyer intent, constraint satisfaction, buy-vs-wait, price timing, negotiation and substitution;
- current offer/provider comparison and explicit uncertainty;
- finding/joining existing GroupBuy;
- latent buyer-demand detection, merchant group-buy proposal, merchant counter-proposal and willing-buyer commitments;
- rent/borrow vs buy;
- resale/rental/consignment and under-used-item value recovery;
- proactive price, warranty, subscription, loyalty, local pickup and shared-logistics opportunities;
- bounded multi-hop TradeCycle for at least three participants with per-leg authorization, proof, privacy and recourse;
- merchant catalog, pricing, promotions, inventory, checkout/orders, B2B, fulfilment, returns and refunds;
- supplier discovery, quotes, purchasing/receiving/reconciliation;
- autonomous-store policy and Commerce Twin what-if;
- connectors/live commerce;
- trust/security/fraud and dispute paths;
- supermarket and physical commerce with NO RFID as a required path.

The complete list and acceptance requirements are in docs/simulations/V3-EXPERIMENT-PROTOCOL.md §10 and the revised industry matrix. Role-specific tests must be relevant, but the entire journey registry must be covered across the campaign.

These requirements supersede any broader industry competitor descriptions in the first V3 draft. The 13 industries remain scenario contexts; UNiCOM is judged only on the commerce capability within each scenario. Maintain GUI-only scoring: not discoverable means ABSENT. Do not invent incumbent UI trials or market-share claims.
