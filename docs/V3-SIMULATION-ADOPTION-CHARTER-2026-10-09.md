# UNiCOM V3 — Cross-Industry Simulation & Product Improvement Charter
Date: 2026-10-09
Repository: payswapdotorg/UniCom
Architecture: v1.1-frozen-2026-10-05 (unchanged)
Progress authority: docs/development-state/v3-simulation-state.json

## Mission

Run a repeatable, multi-industry simulation campaign in which synthetic professional teams from small, medium and large firms execute complex projects through UNiCOM's actual user interface while being benchmarked against representative incumbent software stacks for the same in-scope workflows.

Use the evidence to improve UNiCOM over repeated simulation cycles, then rerun a held-out cohort to determine whether those improvements increase:
1. simulated willingness to replace the in-scope incumbent stack with UNiCOM alone; and
2. simulated willingness to make UNiCOM the primary interface while retaining connected specialist systems where needed.

The app must be used as a user would use it. A feature that is not discoverable through the GUI is ABSENT for scoring, even if a service, API or internal test can reach it.

This charter extends product-completeness work only. It does not change the frozen architecture or authorize a new production push.

## Initial experiment size

- 13 industry families (see docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md).
- 3 synthetic firms per industry: small, medium and large.
- 39 firms total.
- 200 distinct project instances per firm.
- 7,800 project runs in the main full-scale baseline.
- 15,275 synthetic professional personas, using cohort sizes 25 (small), 150 (medium) and 1,000 (large) per firm.
- Each project has industry-, firm-size- and role-specific tasks, purchasing needs, dependencies, approvals, constraints and failure cases.
- Reuse deterministic seeds and scenario identifiers so baseline vs improvement comparisons are reproducible.

These are proposed minimum campaign sizes, not results. Work orders may first validate a smaller smoke cohort, but the final baseline and held-out run must satisfy the full scale or record an explicit, approved capacity-based amendment.

## Required work programme

### Wave A — parallel setup (three workers only)
- W1-009: economic/project scenario model, procurement plans, cost and operational truth.
- W2-009: synthetic professional personas, industry benchmark definitions, incumbent comparison rubric and adoption scoring.
- W3-009: GUI-only browser runner, discoverability checks, interaction telemetry and evidence capture.

The TL is coordinator, acceptance authority and iteration owner. The TL is not a fourth worker. All three work orders are pairwise-disjoint.

### Wave B — baseline simulation
After Wave A is merged and TL-accepted:
- run all 39 firm cohorts and 200 projects per firm;
- exercise the incumbent stack and UNiCOM for comparable in-scope tasks;
- use the UNiCOM GUI only for UNiCOM task completion;
- collect role-level and project-level evidence;
- report every feature miss, UI dead end, failure, unnecessary handoff and capability gap.

### Wave C — improvement cycles
Repeat until the stopping criteria are met:
1. Cluster observed failures by root cause, industry, role, firm size and interface surface.
2. Rank issues by frequency × business impact × risk × user friction.
3. Derive narrowly scoped remediation Work Orders for the existing three worker lanes.
4. Merge only after tests and TL evidence review.
5. Replay the failed scenarios and run an untouched holdout cohort.
6. Update scores and compare them with the original baseline.
7. Do not count a fix as successful if it only improves the same seed or hides a failure.

Minimum: two full improvement cycles after the initial baseline. More cycles continue if significant high-priority blockers remain and the holdout cohort has not stabilized.

### Wave D — independent confirmation
- Freeze candidate code and benchmark definitions.
- Run a pre-registered held-out set of project seeds.
- Rerun critical/high-risk paths and all baseline failures.
- Produce a final, machine-readable report with results by industry, size, role and capability.
- Record deployment scope separately from simulation outcomes.

## Guardrails and truthfulness

- All people, companies, data, prices, contracts, orders and projects are synthetic unless explicitly labelled as public incumbent evidence.
- Do not use real patient records, regulated account data, classified information, private client data, credentials or production commerce transactions.
- Healthcare simulations are non-clinical operations/supply/procurement only. Defense/security simulations use synthetic unclassified data only.
- Do not send payments, place real orders, contact vendors or mutate real customer accounts.
- Production remains read-only during experiments; prefer an isolated staging/simulation deployment.
- Never call an internal service, API, direct database write or hidden route to complete a user task that is scored as a GUI journey.
- Initial fixture setup may use a declared reset mechanism, but every task under evaluation must be completed through visible user controls.
- Existing connected systems are not silently assumed available. A missing credential, provider sandbox or capability must be marked blocked/UNKNOWN, not passed.
- Use no fake competitor GUI. For each incumbent, classify evidence: A = live licensed/sandbox GUI tested; B = official interactive demo/UI observed; C = official documentation capability baseline only. Only A results count as direct observed incumbent task performance.
- Vendor materials are sources for selecting representative tools, not proof that those products are market leaders in every geography. Do not invent market-share rankings.
- Synthetic adoption numbers are model outputs, not real human preference research. Clearly label them "simulated willingness". Actual willingness requires recruited humans and consented user research.

## Adoption definitions (freeze before the first baseline)

### 1. Willingness to switch to UNiCOM alone
A synthetic professional is a "full-switch candidate" only if:
- the tasks claimed by UNiCOM for that role and project are discoverable and completed in its GUI;
- no mandatory in-scope workflow depends on an incumbent-only path;
- all required policy, approval, evidence and reconciliation controls pass;
- there is no critical security, compliance, data-integrity, financial-truth or operational blocker;
- the persona's post-trial adoption model crosses the declared threshold.

Report both: (a) technical full-switch eligibility, and (b) simulated stated willingness. Never combine them into one count.

"Alone" means replacing incumbent tools within the declared UNiCOM evaluation scope—not replacing core banking rails, clinical records, legal case repositories, classified command systems or other out-of-scope regulated systems.

### 2. Willingness to use UNiCOM as main interface
A synthetic professional is a "main-interface candidate" only if:
- they can start tasks from a primary navigation path or universal intent/command, not a hidden route;
- UNiCOM can orchestrate or visibly hand off the necessary connected specialists;
- at least 80% of evaluated in-scope work journeys can start or be supervised from UNiCOM;
- critical blockers are absent and authority/proof/failure states remain visible;
- the persona's post-trial adoption model crosses the declared threshold.

A main-interface candidate may continue using specialist incumbent systems as connected backends. This is not the same as a full replacement.

## Metrics

Per project, role and firm:
- task completion and critical-path completion;
- discovery success from homepage/navigation/intent;
- time-to-completion and visible interaction count;
- backtracks, repeated entries, dead ends and help requests;
- percentage of steps requiring a specialist incumbent;
- connector success, stale/UNKNOWN state handling and recovery;
- approval burden and evidence completeness;
- security/privacy/compliance blockers;
- project cost, purchase-price/constraint validity and deadline success;
- task abandonment and reasons;
- full-switch eligibility;
- simulated willingness to switch entirely;
- simulated willingness to use UNiCOM as the main interface.

Report exact denominators, missing/blocked runs, confidence intervals or seed variability, and results by industry × firm size × job role. No aggregate-only success report.

## Success / stopping criteria

Do not define success as "the UI loaded" or "tests passed". The TL sets numerical gates before running the baseline using the frozen experiment protocol.

At minimum:
- 100% of matrix-required capabilities are tested for GUI discoverability.
- Zero critical security/authority/data-integrity violations.
- Zero silent action failures.
- Zero hidden-route-only features counted as present.
- 100% of declared critical scenarios have evidence.
- No severe high-frequency GUI blocker remains without a documented mitigation.
- Improvements must increase or maintain held-out task success and must not worsen safety, reconciliation or unauthorized-action rates.
- Report full-switch and main-interface estimates separately with sensitivity ranges; never manufacture real market willingness from synthetic agents.

## Required output artifacts

- docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md
- docs/simulations/V3-EXPERIMENT-PROTOCOL.md
- docs/simulations/results/baseline/ (machine-readable reports + summary)
- docs/simulations/results/cycles/ (per-cycle reports, failures and fixes)
- docs/simulations/results/final/ (held-out report and comparison)
- docs/development-state/v3-simulation-state.json
- per-Work-Order completion and acceptance reports
- an executive graph: green = evidenced, amber = active/blocked, red = failed
