# UNiCOM Real-Human Validation — Study Protocol (PREPARE-ONLY, v1.0 for Operator Review)

Status: **DRAFT FOR OPERATOR REVIEW — NOT AUTHORIZED FOR EXECUTION.** No recruitment, contact, scheduling, recording or analysis of identifiable participants has occurred or will occur under this work order. This package exists so the operator can review, amend and (only then) authorize a study.

Prepared by: W3-014 worker, 2026-10-09
Scope authority: docs/work-orders/W3-014.md §Scope B; docs/FINAL-TL-HANDOFF-POST-V3-REAL-WORLD-VALIDATION-2026-10-09.md
Evidence-separation law: **synthetic V3 persona/simulation outputs and real-human observations are stored, reported and labelled separately and are never blended.** Every artifact that shows V3 numbers carries the label "synthetic simulation estimate — not human data".

## 0. Preconditions before ANY study activity (operator-owned gates)

1. Operator explicitly authorizes the study in writing (scope, dates, budget).
2. Informed-consent materials approved (this package or amended version).
3. Privacy/data-protection approach reviewed for the jurisdictions involved; a lawful basis and, where required, IRB/ethics-board or institutional approval is obtained.
4. UNiCOM validation environment is a rendered-browser UI with reproducible build identity and safe synthetic fixtures (depends on W1-010's lane outcome). **If no rendered UI exists at study time, tasks that need it are BLOCKED and reported as such — no API-level substitution, no hidden routes.**
5. Compensation policy approved (fair hourly-equivalent compensation; amounts set by operator).
6. A named study director and data custodian are appointed.

## 1. Research questions

RQ1 (usability): Can representative commerce users complete the in-scope UNiCOM commerce journeys (task pack TP-01…TP-19, journey registry J1–J19) in a rendered UI, starting from ordinary landing surfaces, without hidden-route shortcuts?
RQ2 (adoption): How do participants evaluate UNiCOM's commerce capabilities against the tools they actually use today, on matched commerce tasks only (per the frozen task pack)?
RQ3 (recourse/safety behavior): How do participants perceive and use failure, UNKNOWN, authority-denial and recourse behavior when things go wrong?
RQ4 (opportunity features): Which proactive capabilities (group buys, latent-demand proposals, multi-hop trades, resale/rental recovery) do participants judge valuable/credible enough to consider adopting, and under what trust conditions?

Explicitly NOT researched: market share, revenue forecasts, pricing willingness-to-pay studies, or any claim that "companies would switch" (V3 synthetic scores cannot be used for such claims; human data can only speak to observed tasks and stated perceptions).

## 2. Design overview

- Mixed-methods moderated usability + semi-structured interview study.
- Two sessions per participant (Session A: core journeys; Session B: resilience/recourse + opportunity features), each 60–90 minutes, remote or in-person, screen-recorded with consent.
- Think-aloud protocol for task segments; post-task ratings (1–5 Likert + single Ease-of-Use item per task); post-session semi-structured interview.
- Comparison condition: for RQ2, participants first describe their incumbent workflow for the same matched task (from the frozen task pack), then perform the UNiCOM task. Incumbent side is self-reported workflow description + (optional) participant-shared screenshot of their own tool — no incumbent accounts are created by the study team.
- Timing: task-level completion times are recorded for UNiCOM sessions only. **No comparative timing claims vs incumbents** unless a future phase defines a reproducible comparable-condition protocol (per W3-014 comparison rules); the incumbent side is qualitative.

## 3. Recruitment criteria

Inclusion (all must hold):
- Age 18+; able to consent; working professional with decision-relevant commerce responsibilities in one of the 13 matrix industries.
- Within the last 12 months, personally performed at least one in-scope commerce task family (sourcing/procurement, storefront/order ops, POS/inventory, B2B wholesale, rental/resale) — screened per task-pack mapping.
- Comfortable with a screen-share session in the working language(s) of the study.
- Not employed by, or contracting for, a directly competing commerce-platform vendor in an adjacent product area, and not a UNiCOM project participant.

Exclusion:
- No commerce decision or execution role (e.g., purely administrative with no purchasing/order/inventory involvement).
- Prior participation in a UNiCOM research session.
- Any conflict disclosed at screening that the study director judges material.

Screening script (template only — do not use until §0 gates pass): see CONSENT-AND-RESEARCH-MATERIALS.md §S.

## 4. Sampling plan (role × industry × firm size)

Target: 39 sessions planned (13 industries × 3 firm-size strata × 1 participant), minimum 26 completions for the first wave (2 of 3 strata in every industry). Strata follow the V3 cohort design (small ≈ 25 staff, medium ≈ 150, large ≈ 1,000) so that qualitative human findings can be DISCUSSED next to — never pooled with — synthetic strata results.

Role quotas per industry (participant roles map to the task pack):
- Buyer/requester roles (TP-01–TP-08, TP-15): ≥1 per industry.
- Merchant/store-owner or category/pricing roles (TP-12, TP-13, TP-18): ≥1 per applicable industry.
- Procurement/operations roles (TP-10, TP-11, TP-14, TP-17): ≥1 per applicable industry.
- Owner/safety roles (TP-16): opportunistic, not forced.

Sampling method: purposive stratified recruitment via professional networks, industry associations and (where permitted) recruitment panels; snowball limited to one degree with disclosure recorded. Sampling continues per stratum until the quota is met or the authorized window closes; strata that close short are reported with unfilled denominators, never dropped silently.

## 5. Task scripts (mapped to the frozen task pack)

Full script cards in CONSENT-AND-RESEARCH-MATERIALS.md §T. Each task script states: setup state, participant-facing instruction, expected observable journey (journey registry family), task-pack ID, success criteria, and allowed facilitator probes. Scripts use the SAME task definitions as the incumbent comparison lane (docs/competitors/task-pack.json) so evidence stays matched. Representative coverage:

| Session | Task script | Task-pack ID | Journey family |
|---|---|---|---|
| A | Record a constrained purchase intent (budget, deadline, substitutes, pickup preference) | TP-03 | J1 |
| A | Discover and compare supplier offers for a needed item | TP-01, TP-02 | J2/J11 |
| A | Decide buy-now vs wait / negotiate or substitute within constraints | TP-04 | J3/J8 |
| A | Discover and join an existing group buy with visible commitment rules | TP-05 | J4 |
| A | Rent-vs-buy comparison with deposit/period/recourse | TP-07 | J6 |
| A | List an under-used asset for resale with user-controlled action | TP-08 | J7 |
| A | Merchant-side: list a product, set price/promotion, view incoming order | TP-12 | J10 |
| A | Procurement: requisition → approval → PO → partial receiving | TP-10 | J11 |
| A | Order → track → return/refund with evidence | TP-11 | J10 |
| A | B2B wholesale quote/order with price list | TP-13 | J12 |
| A | POS/inventory: receive stock, count with barcode, reconcile mismatch | TP-14 | J16 |
| B | Latent-demand group buy: recruit participants, send merchant proposal, merchant counter | TP-06 | J5 |
| B | Multi-hop trade cycle with per-leg consent, incl. a missing-consent probe | TP-09 | J9 |
| B | Failure probes: stale provider, UNKNOWN status, duplicate submission, missing approval | TP-17 | J18 |
| B | Recourse: wrong-item/counterfeit path, refund-abuse decision | TP-16 | J17 |
| B | Opportunity review: price-drop timing, warranty recovery, subscription savings surfaced | TP-15 | J8 |
| B | Bounded autonomy: store recommendation within spend/approval limits + stop condition | TP-18 | J13 |
| B | What-if planning that must not mutate canonical state | TP-19 | J14 |

Task applicability is role-filtered per §4; every excluded task is recorded as "not applicable (role)" in that participant's row — not missing data.

## 6. Measures — success, failure, and denominators

Per task, per participant, the outcome is exactly one of:
- **PASS** — completed via visible UI from an ordinary landing surface; all required evidence captured.
- **PASS-WITH-HELP** — completed after facilitator help (help type logged); counted separately, never as clean PASS.
- **FAIL** — not completed; where the journey stopped (and error/UNKNOWN behavior shown) recorded.
- **BLOCKED-ENV** — blocked by study environment defect (logged with defect ID); excluded from usability PASS-rate numerator, retained in the denominator.
- **ABSENT-UI** — task has no rendered UI at study time; recorded, never silently dropped.
- **NOT-APPLICABLE (role)** — task not in this role's script.

Primary quantitative endpoints (per task, per journey family, per industry stratum): task success rate (PASS and PASS-WITH-HELP reported separately), help rate, error/UNKNOWN recovery rate (Session B), task time (UNiCOM only). Secondary: post-task ease ratings, post-session comparison perceptions (RQ2), trust ratings for autonomy/group-buy/multi-hop features.

Qualitative endpoints: observed strategies vs incumbent workflow descriptions; spontaneous trust/safety concerns; recourse expectations; feature-value judgments with reasoning.

**Denominator discipline:** every report states N attempted, N completed, N pass, N pass-with-help, N fail, N blocked-env, N absent-UI, N not-applicable, N missing (see §8). No denominator changes after the fact; any correction is versioned and explained.

## 7. Interview and usability question sets

Post-session interview and per-task rating instruments: CONSENT-AND-RESEARCH-MATERIALS.md §I. Interview domains: current incumbent workflow for each matched task (verbatim first, tool names second); perceived value and credibility of UNiCOM capabilities; trust conditions for autonomy and group commitments; recourse expectations; willingness to continue in a follow-up session; demographics coded at industry/role/firm-size only.

## 8. Missing-data plan

- All withdrawals, technical failures and non-responses are logged with reason codes (consent-withdrawn, environment-fault, participant-no-show, task-skipped-time, facilitator-error, other-free-text).
- Missing task outcomes are reported in the denominator as MISSING(reason); never imputed; never converted to fail.
- Missing interview items are shown per item; summaries state item-level N.
- Sessions with <50% of scripted tasks attempted are flagged and analyzed as partial, with sensitivity analysis excluding them.

## 9. Bias and limitations register

| # | Bias / limitation | Mitigation |
|---|---|---|
| B1 | Sampling bias: volunteers likelier tech-forward | report recruitment channel per participant; purposive quotas; limitations stated in every finding |
| B2 | Facilitator expectancy effects | scripted neutral probes only; sessions double-moderated or recorded for later reliability check on a 10% sample |
| B3 | Novelty effect (UNiCOM is new; incumbents are habit) | within-participant comparison framed on tasks, not products; incumbent workflow described first; no performance claims from self-report |
| B4 | Synthetic-vs-human contamination | separate data stores, separate report sections, mandatory labels; V3 numbers cited only as "synthetic simulation estimate" |
| B5 | Single-session constraints | two sessions; task order counterbalanced between participants |
| B6 | Sponsorship bias (participants paid) | compensation independent of performance; disclosure in consent |
| B7 | Environment realism gap (fixtures, synthetic data) | disclosed in every session intro; findings framed as lab-task usability, not field adoption |
| B8 | Observer effect on safety/recourse behavior | think-aloud paused during critical decisions where it interferes; behavior still coded from recording |
| B9 | Language/interpretation | glossary of commerce terms in materials; professional interpretation if needed |
| B10 | Non-response/dropout asymmetry across strata | denominator reporting per stratum; unfilled strata never dropped |

## 10. Withdrawal process

- Consent is revocable at any time, without reason and without penalty, verbally or in writing (contact channels in the consent form).
- On withdrawal: session stops immediately; the participant chooses data disposition — (a) delete everything including recordings, (b) keep anonymized aggregates already published, (c) retain recording but exclude from analysis. Choice logged with time and initials of the custodian.
- Withdrawal does not affect agreed compensation.
- Withdrawal counts and disposition are reported in the denominators (reason code consent-withdrawn).

## 11. Privacy and data retention

- Personally identifying data is minimized: name/contact needed only for scheduling and compensation; stored in an access-controlled study register OUTSIDE this repository; destroyed after the compensation-dispute window (default 90 days) unless law requires longer.
- Recordings and transcripts are pseudonymized (participant ID) before analysis; stored encrypted, access limited to named analysts.
- NO participant personal data, credentials, recordings, or verbatim-identifying quotes are committed to this repository. Only aggregate tables and pseudonymized findings, reviewed for re-identification risk, are published.
- Retention: raw recordings 12 months from study close, then deletion; anonymized transcripts and codebooks 36 months; aggregates retained with the program archive. Deletion is logged without retaining content.
- Data processing lawful basis and cross-border handling are confirmed by the operator's privacy review before launch (§0 gate 3).

## 12. Analysis plan (descriptive-first)

- Quantitative: per-task/stratum proportions with exact denominators; no inferential tests on the first wave (n is small; tests risk overclaiming). Distributions and confidence intervals only where n ≥ 8 per cell.
- Qualitative: two analysts independently code a 20% sample of transcripts; disagreements reconciled; codebook versioned.
- Comparison outputs: capability-by-stratum human findings tables laid out NEXT TO (never merged with) the incumbent evidence ledger's B/C/D tables and the synthetic V3 strata results.

## 13. Ethics and compliance

- Voluntary participation; written or recorded verbal consent; compensation independent of outcomes.
- No deceptive tasks; failure probes are disclosed as "we will simulate some problems" without specifics.
- No real commerce actions: all tasks run on the isolated validation environment with synthetic identities/fixtures (per the handoff's frozen decisions).
- No incumbent accounts are created by the study team; participants only describe (and optionally show) their own tools.
- Incident handling: distress → pause/stop per participant choice; safety concerns about real fraud/harm → study director escalation path defined before launch.

## 14. Deliverables after (only if authorized and executed) a study

1. Human-evidence report (aggregate, pseudonymized) with full denominator tables.
2. Anonymized task-level outcome dataset (no free-text that could re-identify).
3. Deviations log and limitations addendum.
4. Updated evidence-gap register (human-evidence rows added, kept separate from competitor B/C/D rows).

## 15. What this package explicitly does NOT contain

- No participant names, contacts, screening responses, recordings, or transcripts.
- No recruitment emails sent, no panels engaged, no calendar invites.
- No human data of any kind. Synthetic V3 outputs are referenced only with the mandatory synthetic label.
