# Final TL Handoff — Post-V3 Real-World Validation and Resilience

Date: 2026-10-09  
Repo: payswapdotorg/UniCom  
Dispatch issue: https://github.com/payswapdotorg/UniCom/issues/9  
Progress authority: docs/development-state/post-v3-validation-state.json  
Prior certification: docs/simulations/results/final/PROGRAM-CERTIFICATION.md  
Independent audit: docs/simulations/results/final/PROGRAM-VERIFICATION-ADDENDUM.md

## Mission

V3 is COMPLETE_CERTIFIED. Do not reopen, rewrite or downgrade its state. Start a separate follow-up phase that validates what the V3 report explicitly did not establish:

1. user journeys in a real, rendered browser against a safe local/staging UNiCOM application;
2. failure, UNKNOWN, authority-denial, security, idempotency, recourse and recovery behavior visible to users;
3. evidence-backed comparisons with commerce tools companies use for the same in-scope workflows;
4. a consent-ready human-validation protocol to test adoption assumptions with real professionals once the operator authorizes and organizes the research.

This is not permission for a production deployment or live commerce mutation.

## Frozen decisions

- Architecture stays at 1.1-frozen-2026-10-05 unless the operator grants a separate explicit change authorization.
- Preserve docs/development-state/v3-simulation-state.json and all V3 baseline/amendment/holdout/certification artifacts unchanged.
- The post-V3 state file is the sole authority for this follow-up phase.
- Maximum three workers; TL is the coordinator and acceptance authority, not a fourth worker.
- Use synthetic identities and isolated fixtures for tests. No production orders, payments, refunds, rentals, group-buy commitments or trade legs.
- A task counts as GUI-complete only when real browser evidence shows visible user actions against a rendered UI. Direct service/API/database calls, hidden routes, fixture graphs or manufactured pass records cannot satisfy GUI acceptance.
- Synthetic V3 willingness scores are not human market research. Do not use them to claim that real companies would switch.
- Keep all result categories visible: pass, fail, blocked, absent, UNKNOWN and skipped. No hidden denominator changes.

## Parallel dispatch — exactly three worker lanes

Dispatch the following work orders concurrently after verifying their dependencies and updating the post-V3 state registry:

1. W1-010 — Rendered-browser commerce journey validation. Establish a real browser run against the discovered, safe UI environment; start ordinary discovery at the homepage/role landing surface; capture screenshots/traces, navigation, timings, browser/build identity and every task outcome.
2. W2-010 — GUI-visible resilience, authority and recourse journeys. Build a controlled failure matrix and use safe fault injection to test stale/unavailable providers, UNKNOWN, interruptions, missing approvals, duplicate submissions, group-buy dropout, per-leg multi-hop consent, supply/receiving mismatches, rentals, fraud and no-RFID reconciliation.
3. W3-014 — Commerce incumbent evidence and human-validation readiness. Benchmark only comparable commerce workflows, capture A/B/C/D evidence, mark access gaps honestly, and prepare (but do not execute without authorization) a consent-ready professional validation protocol.

The packets have pairwise-separated primary deliverables. Workers must communicate interface/contract needs through the repo and avoid overlapping writes. TL owns the shared progress registry and final certification report.

## Execution sequence

### Gate 0 — establish the real environment
Inspect the repository and available deployment metadata; determine the current working UI, safe local/staging target, browser runner and seed/reset mechanism. Record the exact commit, target and test identity. Never guess a URL or claim a deployed UI was tested without evidence. If the safe UI or browser runtime is unavailable, report BLOCKED and the missing operator/environment prerequisite.

### Gate 1 — small rendered-browser pilot
Run a deliberately labelled pilot across small, medium and large firm profiles. Select critical journeys including buyer intent/offer comparison, group buy, rental/borrow, multi-hop trade with per-leg consent, merchant/supplier lifecycle and physical/no-RFID commerce. Verify the evidence bundle is usable by a reviewer. Fix runner defects before expanding scope.

### Gate 2 — resilience and competitor evidence
Use the same task IDs wherever comparisons can be made. Keep actual UNiCOM browser evidence, competitor evidence, fixture-only results and documentation-only claims separate. No unmatched timing or blanket competitive claims. Critical security, authority or data-integrity failure blocks a pass.

### Gate 3 — expanded suite and independent acceptance
Expand to the applicable mandatory journey set, publish all denominators and evidence links, rerun tests from the merged lineage, check that every declared scenario maps to an observed result, and independently inspect a sample of traces. TL records acceptance only after inspecting evidence—not from a worker status message alone.

### Gate 4 — final handoff
Commit a human-readable report, machine-readable result manifest, blocker/remediation register and a concise next-step decision. Leave V3 certification intact. Clearly separate verified actual-browser findings, comparator evidence classes, fixture-level evidence, synthetic outputs, and operator-owned actions.

## Acceptance gates

- Real browser launch and visible UI proof tied to a reproducible build/environment.
- No hidden-route/direct-API shortcuts counted as journey completion.
- Core commerce journey evidence includes group purchases, proactive opportunity discovery, renting/borrowing, bounded multi-hop trades and recourse.
- Failure/UNKNOWN/recovery dimension tested in isolation, with all attempted results reconciled.
- No production side effects, no critical authority or data-integrity violations, and idempotency behavior verified.
- Competitor claims have explicit evidence class and captured source; unavailable evidence remains unknown.
- Human research is only prepared until operator approval, recruitment and informed consent are complete.
- CI/test battery, typecheck, lint and architecture checks rerun on the final merged lineage; failures and environmental exceptions are disclosed.
- State registry, work orders, evidence artifacts and final report agree. The frontier is empty only when all acceptance criteria are met or a blocker is explicitly operator-owned; blocked work must never be marked complete.

## Reporting format

At every progress update, show a graph with green ticks only for independently evidenced completion, amber markers for partial/in-progress, and red/blocked markers for unmet prerequisites. Report worker ID, branch/commit, merged commit, tests run, evidence pointers, deviations and next dependency. Keep completed V3 records immutable.

## Current status

This handoff and its three work-order definitions are READY_FOR_TL_DISPATCH. This commit does not imply that any worker has started or that a real-browser validation run has occurred. The TL must record actual activation and evidence in docs/development-state/post-v3-validation-state.json.
