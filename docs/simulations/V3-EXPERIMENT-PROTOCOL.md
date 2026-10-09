# V3 Experiment Protocol — GUI-Only, Reproducible, Adoption-Aware

## 1. Principle

A user must be able to discover the capability and complete the task from the actual UNiCOM interface. A backend method, API, tool registry entry, hidden route or direct state mutation cannot satisfy GUI journey acceptance.

## 2. Journey execution

Every project run includes:
1. Login/role selection using the product's visible entry point, or visible test-account switching.
2. Start at the public homepage or role landing view.
3. Discover the workflow through visible navigation, universal intent/command, onboarding or a contextual opportunity.
4. Execute task steps through browser user actions (click, keyboard, form entry, drag where applicable).
5. Observe status and evidence in the GUI.
6. Handle authorization and approval in the UI.
7. Reconcile and verify outcome in the GUI.
8. Inspect history, decision/evidence and recovery state when relevant.
9. Answer the simulated post-task adoption instrument.

For first-discovery tests, the runner must not start from a deep link to the target feature. Deep links may be used only as secondary route-health probes, never as proof of discoverability.

Allowed test instrumentation may observe browser events, screenshots, accessibility tree, console/network errors and elapsed time. It may not execute commerce operations via service/API, access a DB to manufacture successful outcomes, or bypass visible approval controls.

Declared setup/reset fixtures are allowed outside the timed journey. They must be described and may not fabricate the journey result. Project/task completion itself must use the GUI.

## 3. Evidence captured per journey

- experimentId, cohortId, industry, firm size, role, projectId and deterministic seed;
- build commit and deployment target;
- route/navigation starting point;
- visible controls and interaction trace;
- screenshots at start, critical decisions, terminal success/failure;
- successful task steps and failed/blocked steps;
- UI discovery path (navigation, intent command, contextual surface, onboarding);
- time-to-complete and visible interaction count;
- backtracks, repeated entry, dead ends, task abandonment and help invocation;
- approval and evidence state;
- connector/provider state (including UNKNOWN);
- data/commerce assertions checked only after the user journey;
- error and recovery trace;
- incumbent evidence class A/B/C and task trace when accessible;
- post-task user-model responses and scoring explanation.

Sensitive values must be scrubbed; synthetic company/user ids only.

## 4. No-RFID and failure variants

For each relevant retail/supermarket cohort, include:
- no RFID hardware;
- POS connected, file-only, browser-only and minimally integrated modes;
- barcode/mobile-camera count;
- weighted item;
- purchase order and receiving;
- offline observation queue and replay;
- conflicting POS/count observations;
- stale provider data;
- local edge disconnected/reconnected;
- explicit reconciliation before canonical stock changes.

Additional variants across industries:
- unavailable provider/auth scope;
- stale observation;
- partial action success;
- duplicate/replayed operation;
- payment or purchase settlement UNKNOWN;
- supplier sends malicious/injected description;
- missing approval;
- user lacks authority;
- security block;
- budget/quality/deadline conflict;
- hidden or missing UI feature;
- interrupted session/recovery;
- disconnected specialist incumbent;
- very large project portfolio.

## 5. Adoption instruments and calculation

Each persona has frozen, seeded attributes: role seniority, tool familiarity, budget sensitivity, risk tolerance, switching appetite, compliance sensitivity, connectivity constraints, training capacity and preference for one main interface. Values are synthetic and documented.

After each completed project, ask the persona through a simulated post-trial instrument:
- Would you switch the incumbent tools in the defined evaluation scope for UNiCOM alone?
- Would you use UNiCOM as your default/main interface while keeping specialist tools connected?
- Which workflows would prevent switching?
- What caused friction or reduced trust?
- Which missing capability is a hard blocker vs a preference?

Compute two distinct labels:

A. Technical full-switch eligibility:
- all required in-scope role journeys are discoverable and successful;
- no mandatory incumbent-only task remains;
- no critical safety/compliance/security/data/authority issue;
- correct approvals and evidence are preserved.

B. Simulated stated willingness:
- a declared score from 0–100 combining successful journey completion, usability friction, outcomes vs benchmark, trust/proof, integration quality, switching cost and persona-specific preferences.
- Freeze weights and thresholds before baseline. Version any change, and recompute old/new cohorts if weights change.
- Show score components and sensitivity analysis. Don't hide a failed critical capability behind a weighted average.
- Report willing headcount and percentage separately for each role/firm/industry, with denominators and confidence/simulation-seed variation.

C. Main-interface eligibility and willingness:
- journeys can start from visible UNiCOM surfaces and cross-system handoff is transparent;
- target >=80% of evaluated in-scope journeys can start/be supervised from UNiCOM;
- the remaining work may stay in explicitly connected specialist systems;
- critical blockers must be absent.

Do not merge A/B/C into a single "adoption" metric.

## 6. Competitive comparison methodology

Compare identical task goals and input facts against the firm's representative incumbent stack.
- If a real product sandbox/trial is available and authorized, interact with its actual GUI.
- If only an official demo is accessible, use it and mark evidence B.
- If only public vendor documentation is available, use it as a capability checklist (C), not as measured interaction performance.
- Mark commercial access, unsupported tasks and account setup separately.
- Do not pretend to have tested a competitor UI if that did not happen.

Fairness checks include equivalent dataset, task complexity, user expertise, starting state, role authority, elapsed-time instrumentation and success criteria.

## 7. Iteration and anti-overfitting

Baseline cohort and held-out cohort must use disjoint seed namespaces and project ids.

For each cycle:
1. Reproduce every baseline failure.
2. Cluster by root cause.
3. Fix through the correct worker lane.
4. Add a regression test and GUI acceptance journey for each repaired failure.
5. Re-run the full affected test suite and regression journey set.
6. Re-run the old baseline failure seeds.
7. Run untouched holdout projects.
8. Compare by industry, size and role.
9. Record regressions, even if the aggregate score increases.
10. TL accepts the cycle only after evidence is committed.

A scenario is not fixed if only a unit test passes but a fresh user cannot discover and execute the path.

## 8. Reporting

Every report includes:
- exact build/commit, environment and run timestamps;
- planned vs executed project counts;
- firm/persona counts and cohort definitions;
- success/failure/blocked/UNKNOWN counts;
- industry × size × role results;
- UNiCOM results vs incumbent evidence classes;
- full-switch eligible and simulated willing counts;
- main-interface eligible and simulated willing counts;
- all formulas, weights, thresholds and sensitivity ranges;
- user journey evidence links;
- top friction causes and evidence-backed fixes;
- post-fix comparison and untouched holdout results;
- limitations, unsupported incumbent comparisons and confidence warnings.

No "X% of professionals will switch" statement may appear without the qualifier "synthetic simulation estimate" unless validated with actual consenting professionals.

## 9. Stop / continue criteria

Continue cycles when:
- critical/major GUI blockers remain;
- important features are still undiscoverable;
- holdout performance regresses;
- full-switch eligibility is blocked by high-frequency in-scope gaps;
- main-interface adoption is lost to navigation or trust friction;
- industry/size cohorts have materially uneven performance.

Only recommend broad user adoption after:
- critical constraints pass;
- a holdout cohort meets frozen quality gates;
- key metrics are stable across seeds;
- known gaps and integration preconditions are visible;
- a separate human-user study is planned or completed.
