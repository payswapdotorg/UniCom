# W3-012 — Baseline Amendment 2 Record

> **MEASUREMENT REPAIR, NOT PRODUCT IMPROVEMENT** (the charter's anti-overfitting law). This amendment re-measures the campaign after the W3-012 harness repair: the persona journey coverage repair: the campaign's `personaIds[0]` single-attribution left 15,236/15,275 personas with empty evidence bundles (score ~4), and the W2 persona `applicableJourneys` vocabulary was never reconciled with the W1 authoritative family ids (the third seam). Now every persona is measured over their mapped applicable journeys, executed per role family with real roles on every record. The product is unchanged.

## Before/after — journey-family evidence

| family | before (runs/pass/blocked) | after (runs/pass/blocked) | changed |
|---|---|---|---|
| autonomous-store-policy | 300/300/0 | 600/600/0 | YES |
| bounded-multi-hop-trade-cycle | 600/600/0 | 1800/1800/0 | YES |
| buy-now-vs-wait-price-timing | 2700/2700/0 | 13500/13500/0 | YES |
| buyer-intent-constraints | 3900/3900/0 | 19500/19500/0 | YES |
| commerce-twin-what-if | 1500/1500/0 | 6000/6000/0 | YES |
| connected-commerce-channels-and-live-commerce | 2100/2100/0 | 4200/4200/0 | YES |
| existing-group-buy | 1200/1200/0 | 2400/2400/0 | YES |
| failure-unknown-idempotency-recovery | 3900/3900/0 | 19500/19500/0 | YES |
| gui-feature-discoverability | 3900/3900/0 | 35100/35100/0 | YES |
| latent-demand-merchant-group-buy-proposal | 1200/1200/0 | 2400/2400/0 | YES |
| merchant-commerce-lifecycle | 2400/2400/0 | 4800/4800/0 | YES |
| negotiation-substitution | 3900/0/3900 | 19500/19500/0 | YES |
| offer-sourcing-comparison | 3900/3900/0 | 19500/19500/0 | YES |
| physical-no-rfid-supermarket | 600/600/0 | 3000/3000/0 | YES |
| proactive-economic-opportunities | 3600/3600/0 | 10800/10800/0 | YES |
| rent-borrow-vs-buy | 3000/3000/0 | 9000/9000/0 | YES |
| resale-rental-consignment | 2100/2100/0 | 6300/6300/0 | YES |
| supplier-procurement-receiving | 3900/3900/0 | 11700/11700/0 | YES |
| trust-security-fraud-and-recourse | 3600/3600/0 | 7200/7200/0 | YES |

- First measurement: `baseline-report.json` (build commit recorded therein, determinism fingerprint preserved)
- Amendment 1 (W3-011): `baseline-report.amended-1.json` — the journey-registry reconciliation; its per-family before/after table carries the amendment-1 column for every family below (48,300/48,300 pass at that amendment)
- This amendment: `baseline-report.amended-2.json` (build commit 3fcd39bf)
- Root cause (this amendment): the campaign's `personaIds[0]` single-attribution — only 39/15,275 personas ever accumulated evidence (empty bundles score ~4) — plus the W2 `applicableJourneys` vocabulary never reconciled with the W1 authoritative family ids (the third seam). The amendment-1 root cause (negotiation-substitution absent from the W3-009 journey registry) is recorded in `BASELINE-REPORT-AMENDED-1.md`.
- The four adoption outputs below are the AMENDED measurement (still synthetic simulation estimates) — the first measurement's outputs are a lower bound, superseded by this amendment.

---
# W3-010 — Baseline Campaign Report (cycles.baseline)

> **SYNTHETIC SIMULATION ESTIMATE** — Every willingness number in this report is a synthetic simulation estimate, NOT a human survey result. Later validation with consenting real professionals is required before any user-facing adoption claim.

## §0 Build + commit + timestamps

- **Work order**: W3-010 (cycles.baseline)
- **Build commit**: `3fcd39bf7a03c041695b60b6440908eccea1c1e2`
- **Build branch**: `work/w3-012`
- **Generated at (UTC)**: 2026-10-09T08:55:00Z
- **Deployment target**: `local-dev-fixture` (local-dev fixture — isolated from production)
- **Namespace**: `baseline` (BASELINE ONLY — holdout namespace never executed per §7 anti-overfitting)
- **Frozen adoption contract**: `w2-009:v1` (byte-identical at end of branch)
- **Synthetic-estimate qualifier**: `synthetic simulation estimate`

## §1 Planned vs executed counts (reconciliation law)

Reconciliation law: `planned = executed + blocked + skipped` for projects AND journey runs; drift 0; blocked/skipped never leave the denominator.

### Project reconciliation

| planned | executed | blocked | skipped | drift | reconciled |
|---|---|---|---|---|---|
| 3900 | 3900 | 0 | 0 | 0 | YES |

### Journey reconciliation

| planned | executed | blocked | skipped | drift | reconciled |
|---|---|---|---|---|---|
| 196800 | 196800 | 0 | 0 | 0 | YES |

## §2 Cohort definitions (firm + persona counts)

- **Industries**: 13
- **Firm sizes**: 3 (small, medium, large)
- **Firms**: 39 (13 industries × 3 sizes = 39)
- **Personas**: 15275 (small=25, medium=150, large=1000 per firm → 1,175 per industry × 13 = 15,275)
- **Projects per firm**: 100 (baseline namespace)
- **Baseline projects**: 3900 (13 × 3 × 100)
- **Holdout projects**: 0 (MUST be 0 — never executed, scheduled, or scored)

## §3 Pass/fail/blocked/absent/unknown counts

| pass | fail | blocked | absent | unknown |
|---|---|---|---|---|
| 196800 | 0 | 0 | 0 | 0 |

## §4 Industry × size × role results

Per-industry×size×role aggregate rows (each row shows the four adoption outputs with denominator, eligible count, eligible %, and mean score).

| industry | size | role | denominator | (a) full-switch | (b) willing-switch | (c) main-interface | (d) willing-main |
|---|---|---|---|---|---|---|---|
| construction | large | approver-executive | 28 | 28 (100.0%) | 28 (100.0%) score=83.0 | 28 (100.0%) | 28 (100.0%) score=83.0 |
| construction | large | compliance-audit | 58 | 58 (100.0%) | 58 (100.0%) score=84.0 | 58 (100.0%) | 58 (100.0%) score=84.0 |
| construction | large | field-ops | 155 | 155 (100.0%) | 155 (100.0%) score=83.0 | 155 (100.0%) | 155 (100.0%) score=83.0 |
| construction | large | finance-accounting | 96 | 96 (100.0%) | 96 (100.0%) score=83.0 | 96 (100.0%) | 96 (100.0%) score=83.0 |
| construction | large | industry-specialist | 192 | 192 (100.0%) | 192 (100.0%) score=83.0 | 192 (100.0%) | 192 (100.0%) score=83.0 |
| construction | large | it | 77 | 77 (100.0%) | 77 (100.0%) score=86.0 | 77 (100.0%) | 77 (100.0%) score=86.0 |
| construction | large | procurement | 154 | 154 (100.0%) | 154 (100.0%) score=83.0 | 154 (100.0%) | 154 (100.0%) score=83.0 |
| construction | large | project-program-mgmt | 115 | 115 (100.0%) | 115 (100.0%) score=82.0 | 115 (100.0%) | 115 (100.0%) score=82.0 |
| construction | large | sales | 125 | 125 (100.0%) | 125 (100.0%) score=84.0 | 125 (100.0%) | 125 (100.0%) score=84.0 |
| construction | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| construction | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| construction | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=84.0 | 20 (100.0%) | 20 (100.0%) score=84.0 |
| construction | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=83.0 | 14 (100.0%) | 14 (100.0%) score=83.0 |
| construction | medium | industry-specialist | 29 | 29 (100.0%) | 29 (100.0%) score=84.0 | 29 (100.0%) | 29 (100.0%) score=84.0 |
| construction | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=86.0 | 12 (100.0%) | 12 (100.0%) score=86.0 |
| construction | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=83.0 | 23 (100.0%) | 23 (100.0%) score=83.0 |
| construction | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| construction | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=84.0 | 17 (100.0%) | 17 (100.0%) score=84.0 |
| construction | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=82.0 | 3 (100.0%) | 3 (100.0%) score=82.0 |
| construction | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=87.0 | 1 (100.0%) | 1 (100.0%) score=87.0 |
| construction | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| construction | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| construction | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=85.0 | 5 (100.0%) | 5 (100.0%) score=85.0 |
| construction | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| construction | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| construction | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| construction | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| defense | large | approver-executive | 27 | 27 (100.0%) | 27 (100.0%) score=83.0 | 27 (100.0%) | 27 (100.0%) score=83.0 |
| defense | large | compliance-audit | 57 | 57 (100.0%) | 57 (100.0%) score=85.0 | 57 (100.0%) | 57 (100.0%) score=85.0 |
| defense | large | field-ops | 152 | 152 (100.0%) | 152 (100.0%) score=83.0 | 152 (100.0%) | 152 (100.0%) score=83.0 |
| defense | large | finance-accounting | 94 | 94 (100.0%) | 94 (100.0%) score=83.0 | 94 (100.0%) | 94 (100.0%) score=83.0 |
| defense | large | industry-specialist | 208 | 208 (100.0%) | 208 (100.0%) score=83.0 | 208 (100.0%) | 208 (100.0%) score=83.0 |
| defense | large | it | 75 | 75 (100.0%) | 75 (100.0%) score=85.0 | 75 (100.0%) | 75 (100.0%) score=85.0 |
| defense | large | procurement | 151 | 151 (100.0%) | 151 (100.0%) score=83.0 | 151 (100.0%) | 151 (100.0%) score=83.0 |
| defense | large | project-program-mgmt | 113 | 113 (100.0%) | 113 (100.0%) score=82.0 | 113 (100.0%) | 113 (100.0%) score=82.0 |
| defense | large | sales | 123 | 123 (100.0%) | 123 (100.0%) score=84.0 | 123 (100.0%) | 123 (100.0%) score=84.0 |
| defense | medium | approver-executive | 8 | 8 (100.0%) | 8 (100.0%) score=84.0 | 8 (100.0%) | 8 (100.0%) score=84.0 |
| defense | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| defense | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=83.0 | 20 (100.0%) | 20 (100.0%) score=83.0 |
| defense | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=84.0 | 14 (100.0%) | 14 (100.0%) score=84.0 |
| defense | medium | industry-specialist | 31 | 31 (100.0%) | 31 (100.0%) score=84.0 | 31 (100.0%) | 31 (100.0%) score=84.0 |
| defense | medium | it | 11 | 11 (100.0%) | 11 (100.0%) score=85.0 | 11 (100.0%) | 11 (100.0%) score=85.0 |
| defense | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=84.0 | 23 (100.0%) | 23 (100.0%) score=84.0 |
| defense | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| defense | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=84.0 | 17 (100.0%) | 17 (100.0%) score=84.0 |
| defense | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| defense | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=87.0 | 1 (100.0%) | 1 (100.0%) score=87.0 |
| defense | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| defense | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| defense | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=85.0 | 5 (100.0%) | 5 (100.0%) score=85.0 |
| defense | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| defense | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| defense | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| defense | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| entertainment | large | approver-executive | 28 | 28 (100.0%) | 28 (100.0%) score=83.0 | 28 (100.0%) | 28 (100.0%) score=83.0 |
| entertainment | large | compliance-audit | 58 | 58 (100.0%) | 58 (100.0%) score=85.0 | 58 (100.0%) | 58 (100.0%) score=85.0 |
| entertainment | large | field-ops | 155 | 155 (100.0%) | 155 (100.0%) score=83.0 | 155 (100.0%) | 155 (100.0%) score=83.0 |
| entertainment | large | finance-accounting | 96 | 96 (100.0%) | 96 (100.0%) score=83.0 | 96 (100.0%) | 96 (100.0%) score=83.0 |
| entertainment | large | industry-specialist | 192 | 192 (100.0%) | 192 (100.0%) score=83.0 | 192 (100.0%) | 192 (100.0%) score=83.0 |
| entertainment | large | it | 77 | 77 (100.0%) | 77 (100.0%) score=85.0 | 77 (100.0%) | 77 (100.0%) score=85.0 |
| entertainment | large | procurement | 154 | 154 (100.0%) | 154 (100.0%) score=83.0 | 154 (100.0%) | 154 (100.0%) score=83.0 |
| entertainment | large | project-program-mgmt | 115 | 115 (100.0%) | 115 (100.0%) score=82.0 | 115 (100.0%) | 115 (100.0%) score=82.0 |
| entertainment | large | sales | 125 | 125 (100.0%) | 125 (100.0%) score=84.0 | 125 (100.0%) | 125 (100.0%) score=84.0 |
| entertainment | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| entertainment | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| entertainment | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=83.0 | 20 (100.0%) | 20 (100.0%) score=83.0 |
| entertainment | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=83.0 | 14 (100.0%) | 14 (100.0%) score=83.0 |
| entertainment | medium | industry-specialist | 29 | 29 (100.0%) | 29 (100.0%) score=83.0 | 29 (100.0%) | 29 (100.0%) score=83.0 |
| entertainment | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=85.0 | 12 (100.0%) | 12 (100.0%) score=85.0 |
| entertainment | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=83.0 | 23 (100.0%) | 23 (100.0%) score=83.0 |
| entertainment | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| entertainment | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=85.0 | 17 (100.0%) | 17 (100.0%) score=85.0 |
| entertainment | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=82.0 | 3 (100.0%) | 3 (100.0%) score=82.0 |
| entertainment | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=84.0 | 1 (100.0%) | 1 (100.0%) score=84.0 |
| entertainment | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| entertainment | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| entertainment | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=84.0 | 5 (100.0%) | 5 (100.0%) score=84.0 |
| entertainment | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| entertainment | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=85.0 | 4 (100.0%) | 4 (100.0%) score=85.0 |
| entertainment | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| entertainment | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| fashion | large | approver-executive | 27 | 27 (100.0%) | 27 (100.0%) score=83.0 | 27 (100.0%) | 27 (100.0%) score=83.0 |
| fashion | large | compliance-audit | 57 | 57 (100.0%) | 57 (100.0%) score=84.0 | 57 (100.0%) | 57 (100.0%) score=84.0 |
| fashion | large | field-ops | 152 | 152 (100.0%) | 152 (100.0%) score=83.0 | 152 (100.0%) | 152 (100.0%) score=83.0 |
| fashion | large | finance-accounting | 94 | 94 (100.0%) | 94 (100.0%) score=83.0 | 94 (100.0%) | 94 (100.0%) score=83.0 |
| fashion | large | industry-specialist | 208 | 208 (100.0%) | 208 (100.0%) score=84.0 | 208 (100.0%) | 208 (100.0%) score=84.0 |
| fashion | large | it | 75 | 75 (100.0%) | 75 (100.0%) score=86.0 | 75 (100.0%) | 75 (100.0%) score=86.0 |
| fashion | large | procurement | 151 | 151 (100.0%) | 151 (100.0%) score=83.0 | 151 (100.0%) | 151 (100.0%) score=83.0 |
| fashion | large | project-program-mgmt | 113 | 113 (100.0%) | 113 (100.0%) score=82.0 | 113 (100.0%) | 113 (100.0%) score=82.0 |
| fashion | large | sales | 123 | 123 (100.0%) | 123 (100.0%) score=86.0 | 123 (100.0%) | 123 (100.0%) score=86.0 |
| fashion | medium | approver-executive | 8 | 8 (100.0%) | 8 (100.0%) score=84.0 | 8 (100.0%) | 8 (100.0%) score=84.0 |
| fashion | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| fashion | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=84.0 | 20 (100.0%) | 20 (100.0%) score=84.0 |
| fashion | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=84.0 | 14 (100.0%) | 14 (100.0%) score=84.0 |
| fashion | medium | industry-specialist | 31 | 31 (100.0%) | 31 (100.0%) score=84.0 | 31 (100.0%) | 31 (100.0%) score=84.0 |
| fashion | medium | it | 11 | 11 (100.0%) | 11 (100.0%) score=86.0 | 11 (100.0%) | 11 (100.0%) score=86.0 |
| fashion | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=84.0 | 23 (100.0%) | 23 (100.0%) score=84.0 |
| fashion | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| fashion | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=86.0 | 17 (100.0%) | 17 (100.0%) score=86.0 |
| fashion | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| fashion | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=86.0 | 1 (100.0%) | 1 (100.0%) score=86.0 |
| fashion | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| fashion | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| fashion | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=86.0 | 5 (100.0%) | 5 (100.0%) score=86.0 |
| fashion | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| fashion | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| fashion | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| fashion | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| finance | large | approver-executive | 30 | 30 (100.0%) | 30 (100.0%) score=83.0 | 30 (100.0%) | 30 (100.0%) score=83.0 |
| finance | large | compliance-audit | 60 | 60 (100.0%) | 60 (100.0%) score=85.0 | 60 (100.0%) | 60 (100.0%) score=85.0 |
| finance | large | field-ops | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| finance | large | finance-accounting | 100 | 100 (100.0%) | 100 (100.0%) score=83.0 | 100 (100.0%) | 100 (100.0%) score=83.0 |
| finance | large | industry-specialist | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| finance | large | it | 80 | 80 (100.0%) | 80 (100.0%) score=85.0 | 80 (100.0%) | 80 (100.0%) score=85.0 |
| finance | large | procurement | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| finance | large | project-program-mgmt | 120 | 120 (100.0%) | 120 (100.0%) score=82.0 | 120 (100.0%) | 120 (100.0%) score=82.0 |
| finance | large | sales | 130 | 130 (100.0%) | 130 (100.0%) score=84.0 | 130 (100.0%) | 130 (100.0%) score=84.0 |
| finance | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| finance | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| finance | medium | field-ops | 21 | 21 (100.0%) | 21 (100.0%) score=82.0 | 21 (100.0%) | 21 (100.0%) score=82.0 |
| finance | medium | finance-accounting | 15 | 15 (100.0%) | 15 (100.0%) score=84.0 | 15 (100.0%) | 15 (100.0%) score=84.0 |
| finance | medium | industry-specialist | 24 | 24 (100.0%) | 24 (100.0%) score=83.0 | 24 (100.0%) | 24 (100.0%) score=83.0 |
| finance | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=85.0 | 12 (100.0%) | 12 (100.0%) score=85.0 |
| finance | medium | procurement | 24 | 24 (100.0%) | 24 (100.0%) score=82.0 | 24 (100.0%) | 24 (100.0%) score=82.0 |
| finance | medium | project-program-mgmt | 18 | 18 (100.0%) | 18 (100.0%) score=83.0 | 18 (100.0%) | 18 (100.0%) score=83.0 |
| finance | medium | sales | 18 | 18 (100.0%) | 18 (100.0%) score=85.0 | 18 (100.0%) | 18 (100.0%) score=85.0 |
| finance | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| finance | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=84.0 | 1 (100.0%) | 1 (100.0%) score=84.0 |
| finance | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| finance | small | finance-accounting | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| finance | small | industry-specialist | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| finance | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| finance | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| finance | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| finance | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| healthcare | large | approver-executive | 27 | 27 (100.0%) | 27 (100.0%) score=83.0 | 27 (100.0%) | 27 (100.0%) score=83.0 |
| healthcare | large | compliance-audit | 57 | 57 (100.0%) | 57 (100.0%) score=85.0 | 57 (100.0%) | 57 (100.0%) score=85.0 |
| healthcare | large | field-ops | 152 | 152 (100.0%) | 152 (100.0%) score=82.0 | 152 (100.0%) | 152 (100.0%) score=82.0 |
| healthcare | large | finance-accounting | 94 | 94 (100.0%) | 94 (100.0%) score=83.0 | 94 (100.0%) | 94 (100.0%) score=83.0 |
| healthcare | large | industry-specialist | 208 | 208 (100.0%) | 208 (100.0%) score=82.0 | 208 (100.0%) | 208 (100.0%) score=82.0 |
| healthcare | large | it | 75 | 75 (100.0%) | 75 (100.0%) score=85.0 | 75 (100.0%) | 75 (100.0%) score=85.0 |
| healthcare | large | procurement | 151 | 151 (100.0%) | 151 (100.0%) score=82.0 | 151 (100.0%) | 151 (100.0%) score=82.0 |
| healthcare | large | project-program-mgmt | 113 | 113 (100.0%) | 113 (100.0%) score=83.0 | 113 (100.0%) | 113 (100.0%) score=83.0 |
| healthcare | large | sales | 123 | 123 (100.0%) | 123 (100.0%) score=84.0 | 123 (100.0%) | 123 (100.0%) score=84.0 |
| healthcare | medium | approver-executive | 8 | 8 (100.0%) | 8 (100.0%) score=83.0 | 8 (100.0%) | 8 (100.0%) score=83.0 |
| healthcare | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| healthcare | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=83.0 | 20 (100.0%) | 20 (100.0%) score=83.0 |
| healthcare | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=84.0 | 14 (100.0%) | 14 (100.0%) score=84.0 |
| healthcare | medium | industry-specialist | 31 | 31 (100.0%) | 31 (100.0%) score=83.0 | 31 (100.0%) | 31 (100.0%) score=83.0 |
| healthcare | medium | it | 11 | 11 (100.0%) | 11 (100.0%) score=86.0 | 11 (100.0%) | 11 (100.0%) score=86.0 |
| healthcare | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=83.0 | 23 (100.0%) | 23 (100.0%) score=83.0 |
| healthcare | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=83.0 | 17 (100.0%) | 17 (100.0%) score=83.0 |
| healthcare | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=84.0 | 17 (100.0%) | 17 (100.0%) score=84.0 |
| healthcare | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| healthcare | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=86.0 | 1 (100.0%) | 1 (100.0%) score=86.0 |
| healthcare | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| healthcare | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| healthcare | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=84.0 | 5 (100.0%) | 5 (100.0%) score=84.0 |
| healthcare | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| healthcare | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| healthcare | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| healthcare | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| hospitality | large | approver-executive | 28 | 28 (100.0%) | 28 (100.0%) score=83.0 | 28 (100.0%) | 28 (100.0%) score=83.0 |
| hospitality | large | compliance-audit | 58 | 58 (100.0%) | 58 (100.0%) score=85.0 | 58 (100.0%) | 58 (100.0%) score=85.0 |
| hospitality | large | field-ops | 155 | 155 (100.0%) | 155 (100.0%) score=83.0 | 155 (100.0%) | 155 (100.0%) score=83.0 |
| hospitality | large | finance-accounting | 96 | 96 (100.0%) | 96 (100.0%) score=83.0 | 96 (100.0%) | 96 (100.0%) score=83.0 |
| hospitality | large | industry-specialist | 192 | 192 (100.0%) | 192 (100.0%) score=84.0 | 192 (100.0%) | 192 (100.0%) score=84.0 |
| hospitality | large | it | 77 | 77 (100.0%) | 77 (100.0%) score=86.0 | 77 (100.0%) | 77 (100.0%) score=86.0 |
| hospitality | large | procurement | 154 | 154 (100.0%) | 154 (100.0%) score=83.0 | 154 (100.0%) | 154 (100.0%) score=83.0 |
| hospitality | large | project-program-mgmt | 115 | 115 (100.0%) | 115 (100.0%) score=82.0 | 115 (100.0%) | 115 (100.0%) score=82.0 |
| hospitality | large | sales | 125 | 125 (100.0%) | 125 (100.0%) score=86.0 | 125 (100.0%) | 125 (100.0%) score=86.0 |
| hospitality | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=82.0 | 9 (100.0%) | 9 (100.0%) score=82.0 |
| hospitality | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| hospitality | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=83.0 | 20 (100.0%) | 20 (100.0%) score=83.0 |
| hospitality | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=84.0 | 14 (100.0%) | 14 (100.0%) score=84.0 |
| hospitality | medium | industry-specialist | 29 | 29 (100.0%) | 29 (100.0%) score=84.0 | 29 (100.0%) | 29 (100.0%) score=84.0 |
| hospitality | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=86.0 | 12 (100.0%) | 12 (100.0%) score=86.0 |
| hospitality | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=83.0 | 23 (100.0%) | 23 (100.0%) score=83.0 |
| hospitality | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| hospitality | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=86.0 | 17 (100.0%) | 17 (100.0%) score=86.0 |
| hospitality | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| hospitality | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=84.0 | 1 (100.0%) | 1 (100.0%) score=84.0 |
| hospitality | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| hospitality | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| hospitality | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=85.0 | 5 (100.0%) | 5 (100.0%) score=85.0 |
| hospitality | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| hospitality | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| hospitality | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| hospitality | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| legal | large | approver-executive | 30 | 30 (100.0%) | 30 (100.0%) score=83.0 | 30 (100.0%) | 30 (100.0%) score=83.0 |
| legal | large | compliance-audit | 60 | 60 (100.0%) | 60 (100.0%) score=85.0 | 60 (100.0%) | 60 (100.0%) score=85.0 |
| legal | large | field-ops | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| legal | large | finance-accounting | 100 | 100 (100.0%) | 100 (100.0%) score=83.0 | 100 (100.0%) | 100 (100.0%) score=83.0 |
| legal | large | industry-specialist | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| legal | large | it | 80 | 80 (100.0%) | 80 (100.0%) score=86.0 | 80 (100.0%) | 80 (100.0%) score=86.0 |
| legal | large | procurement | 160 | 160 (100.0%) | 160 (100.0%) score=82.0 | 160 (100.0%) | 160 (100.0%) score=82.0 |
| legal | large | project-program-mgmt | 120 | 120 (100.0%) | 120 (100.0%) score=82.0 | 120 (100.0%) | 120 (100.0%) score=82.0 |
| legal | large | sales | 130 | 130 (100.0%) | 130 (100.0%) score=84.0 | 130 (100.0%) | 130 (100.0%) score=84.0 |
| legal | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| legal | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| legal | medium | field-ops | 21 | 21 (100.0%) | 21 (100.0%) score=83.0 | 21 (100.0%) | 21 (100.0%) score=83.0 |
| legal | medium | finance-accounting | 15 | 15 (100.0%) | 15 (100.0%) score=83.0 | 15 (100.0%) | 15 (100.0%) score=83.0 |
| legal | medium | industry-specialist | 24 | 24 (100.0%) | 24 (100.0%) score=83.0 | 24 (100.0%) | 24 (100.0%) score=83.0 |
| legal | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=85.0 | 12 (100.0%) | 12 (100.0%) score=85.0 |
| legal | medium | procurement | 24 | 24 (100.0%) | 24 (100.0%) score=82.0 | 24 (100.0%) | 24 (100.0%) score=82.0 |
| legal | medium | project-program-mgmt | 18 | 18 (100.0%) | 18 (100.0%) score=83.0 | 18 (100.0%) | 18 (100.0%) score=83.0 |
| legal | medium | sales | 18 | 18 (100.0%) | 18 (100.0%) score=85.0 | 18 (100.0%) | 18 (100.0%) score=85.0 |
| legal | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=82.0 | 3 (100.0%) | 3 (100.0%) score=82.0 |
| legal | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=85.0 | 1 (100.0%) | 1 (100.0%) score=85.0 |
| legal | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| legal | small | finance-accounting | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| legal | small | industry-specialist | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| legal | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| legal | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| legal | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| legal | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| manufacturing | large | approver-executive | 28 | 28 (100.0%) | 28 (100.0%) score=83.0 | 28 (100.0%) | 28 (100.0%) score=83.0 |
| manufacturing | large | compliance-audit | 58 | 58 (100.0%) | 58 (100.0%) score=84.0 | 58 (100.0%) | 58 (100.0%) score=84.0 |
| manufacturing | large | field-ops | 155 | 155 (100.0%) | 155 (100.0%) score=83.0 | 155 (100.0%) | 155 (100.0%) score=83.0 |
| manufacturing | large | finance-accounting | 96 | 96 (100.0%) | 96 (100.0%) score=83.0 | 96 (100.0%) | 96 (100.0%) score=83.0 |
| manufacturing | large | industry-specialist | 192 | 192 (100.0%) | 192 (100.0%) score=83.0 | 192 (100.0%) | 192 (100.0%) score=83.0 |
| manufacturing | large | it | 77 | 77 (100.0%) | 77 (100.0%) score=86.0 | 77 (100.0%) | 77 (100.0%) score=86.0 |
| manufacturing | large | procurement | 154 | 154 (100.0%) | 154 (100.0%) score=83.0 | 154 (100.0%) | 154 (100.0%) score=83.0 |
| manufacturing | large | project-program-mgmt | 115 | 115 (100.0%) | 115 (100.0%) score=82.0 | 115 (100.0%) | 115 (100.0%) score=82.0 |
| manufacturing | large | sales | 125 | 125 (100.0%) | 125 (100.0%) score=84.0 | 125 (100.0%) | 125 (100.0%) score=84.0 |
| manufacturing | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| manufacturing | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=84.0 | 9 (100.0%) | 9 (100.0%) score=84.0 |
| manufacturing | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=84.0 | 20 (100.0%) | 20 (100.0%) score=84.0 |
| manufacturing | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=83.0 | 14 (100.0%) | 14 (100.0%) score=83.0 |
| manufacturing | medium | industry-specialist | 29 | 29 (100.0%) | 29 (100.0%) score=84.0 | 29 (100.0%) | 29 (100.0%) score=84.0 |
| manufacturing | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=85.0 | 12 (100.0%) | 12 (100.0%) score=85.0 |
| manufacturing | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=84.0 | 23 (100.0%) | 23 (100.0%) score=84.0 |
| manufacturing | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=82.0 | 17 (100.0%) | 17 (100.0%) score=82.0 |
| manufacturing | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=85.0 | 17 (100.0%) | 17 (100.0%) score=85.0 |
| manufacturing | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| manufacturing | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=86.0 | 1 (100.0%) | 1 (100.0%) score=86.0 |
| manufacturing | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| manufacturing | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| manufacturing | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=85.0 | 5 (100.0%) | 5 (100.0%) score=85.0 |
| manufacturing | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| manufacturing | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| manufacturing | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| manufacturing | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| sales | large | approver-executive | 30 | 30 (100.0%) | 30 (100.0%) score=83.0 | 30 (100.0%) | 30 (100.0%) score=83.0 |
| sales | large | compliance-audit | 60 | 60 (100.0%) | 60 (100.0%) score=84.0 | 60 (100.0%) | 60 (100.0%) score=84.0 |
| sales | large | field-ops | 160 | 160 (100.0%) | 160 (100.0%) score=84.0 | 160 (100.0%) | 160 (100.0%) score=84.0 |
| sales | large | finance-accounting | 100 | 100 (100.0%) | 100 (100.0%) score=83.0 | 100 (100.0%) | 100 (100.0%) score=83.0 |
| sales | large | industry-specialist | 160 | 160 (100.0%) | 160 (100.0%) score=84.0 | 160 (100.0%) | 160 (100.0%) score=84.0 |
| sales | large | it | 80 | 80 (100.0%) | 80 (100.0%) score=86.0 | 80 (100.0%) | 80 (100.0%) score=86.0 |
| sales | large | procurement | 160 | 160 (100.0%) | 160 (100.0%) score=83.0 | 160 (100.0%) | 160 (100.0%) score=83.0 |
| sales | large | project-program-mgmt | 120 | 120 (100.0%) | 120 (100.0%) score=82.0 | 120 (100.0%) | 120 (100.0%) score=82.0 |
| sales | large | sales | 130 | 130 (100.0%) | 130 (100.0%) score=86.0 | 130 (100.0%) | 130 (100.0%) score=86.0 |
| sales | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| sales | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=84.0 | 9 (100.0%) | 9 (100.0%) score=84.0 |
| sales | medium | field-ops | 21 | 21 (100.0%) | 21 (100.0%) score=84.0 | 21 (100.0%) | 21 (100.0%) score=84.0 |
| sales | medium | finance-accounting | 15 | 15 (100.0%) | 15 (100.0%) score=84.0 | 15 (100.0%) | 15 (100.0%) score=84.0 |
| sales | medium | industry-specialist | 24 | 24 (100.0%) | 24 (100.0%) score=84.0 | 24 (100.0%) | 24 (100.0%) score=84.0 |
| sales | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=86.0 | 12 (100.0%) | 12 (100.0%) score=86.0 |
| sales | medium | procurement | 24 | 24 (100.0%) | 24 (100.0%) score=84.0 | 24 (100.0%) | 24 (100.0%) score=84.0 |
| sales | medium | project-program-mgmt | 18 | 18 (100.0%) | 18 (100.0%) score=83.0 | 18 (100.0%) | 18 (100.0%) score=83.0 |
| sales | medium | sales | 18 | 18 (100.0%) | 18 (100.0%) score=86.0 | 18 (100.0%) | 18 (100.0%) score=86.0 |
| sales | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| sales | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=86.0 | 1 (100.0%) | 1 (100.0%) score=86.0 |
| sales | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| sales | small | finance-accounting | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| sales | small | industry-specialist | 4 | 4 (100.0%) | 4 (100.0%) score=85.0 | 4 (100.0%) | 4 (100.0%) score=85.0 |
| sales | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| sales | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=85.0 | 4 (100.0%) | 4 (100.0%) score=85.0 |
| sales | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| sales | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| supermarket | large | approver-executive | 27 | 27 (100.0%) | 27 (100.0%) score=83.0 | 27 (100.0%) | 27 (100.0%) score=83.0 |
| supermarket | large | compliance-audit | 57 | 57 (100.0%) | 57 (100.0%) score=84.0 | 57 (100.0%) | 57 (100.0%) score=84.0 |
| supermarket | large | field-ops | 152 | 152 (100.0%) | 152 (100.0%) score=83.0 | 152 (100.0%) | 152 (100.0%) score=83.0 |
| supermarket | large | finance-accounting | 94 | 94 (100.0%) | 94 (100.0%) score=84.0 | 94 (100.0%) | 94 (100.0%) score=84.0 |
| supermarket | large | industry-specialist | 208 | 208 (100.0%) | 208 (100.0%) score=84.0 | 208 (100.0%) | 208 (100.0%) score=84.0 |
| supermarket | large | it | 75 | 75 (100.0%) | 75 (100.0%) score=86.0 | 75 (100.0%) | 75 (100.0%) score=86.0 |
| supermarket | large | procurement | 151 | 151 (100.0%) | 151 (100.0%) score=83.0 | 151 (100.0%) | 151 (100.0%) score=83.0 |
| supermarket | large | project-program-mgmt | 113 | 113 (100.0%) | 113 (100.0%) score=82.0 | 113 (100.0%) | 113 (100.0%) score=82.0 |
| supermarket | large | sales | 123 | 123 (100.0%) | 123 (100.0%) score=85.0 | 123 (100.0%) | 123 (100.0%) score=85.0 |
| supermarket | medium | approver-executive | 8 | 8 (100.0%) | 8 (100.0%) score=83.0 | 8 (100.0%) | 8 (100.0%) score=83.0 |
| supermarket | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=84.0 | 9 (100.0%) | 9 (100.0%) score=84.0 |
| supermarket | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=84.0 | 20 (100.0%) | 20 (100.0%) score=84.0 |
| supermarket | medium | finance-accounting | 14 | 14 (100.0%) | 14 (100.0%) score=84.0 | 14 (100.0%) | 14 (100.0%) score=84.0 |
| supermarket | medium | industry-specialist | 31 | 31 (100.0%) | 31 (100.0%) score=84.0 | 31 (100.0%) | 31 (100.0%) score=84.0 |
| supermarket | medium | it | 11 | 11 (100.0%) | 11 (100.0%) score=86.0 | 11 (100.0%) | 11 (100.0%) score=86.0 |
| supermarket | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=84.0 | 23 (100.0%) | 23 (100.0%) score=84.0 |
| supermarket | medium | project-program-mgmt | 17 | 17 (100.0%) | 17 (100.0%) score=83.0 | 17 (100.0%) | 17 (100.0%) score=83.0 |
| supermarket | medium | sales | 17 | 17 (100.0%) | 17 (100.0%) score=86.0 | 17 (100.0%) | 17 (100.0%) score=86.0 |
| supermarket | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| supermarket | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=84.0 | 1 (100.0%) | 1 (100.0%) score=84.0 |
| supermarket | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| supermarket | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| supermarket | small | industry-specialist | 5 | 5 (100.0%) | 5 (100.0%) score=85.0 | 5 (100.0%) | 5 (100.0%) score=85.0 |
| supermarket | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=87.0 | 2 (100.0%) | 2 (100.0%) score=87.0 |
| supermarket | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| supermarket | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| supermarket | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| technology | large | approver-executive | 30 | 30 (100.0%) | 30 (100.0%) score=83.0 | 30 (100.0%) | 30 (100.0%) score=83.0 |
| technology | large | compliance-audit | 60 | 60 (100.0%) | 60 (100.0%) score=84.0 | 60 (100.0%) | 60 (100.0%) score=84.0 |
| technology | large | field-ops | 160 | 160 (100.0%) | 160 (100.0%) score=83.0 | 160 (100.0%) | 160 (100.0%) score=83.0 |
| technology | large | finance-accounting | 100 | 100 (100.0%) | 100 (100.0%) score=83.0 | 100 (100.0%) | 100 (100.0%) score=83.0 |
| technology | large | industry-specialist | 160 | 160 (100.0%) | 160 (100.0%) score=83.0 | 160 (100.0%) | 160 (100.0%) score=83.0 |
| technology | large | it | 80 | 80 (100.0%) | 80 (100.0%) score=85.0 | 80 (100.0%) | 80 (100.0%) score=85.0 |
| technology | large | procurement | 160 | 160 (100.0%) | 160 (100.0%) score=83.0 | 160 (100.0%) | 160 (100.0%) score=83.0 |
| technology | large | project-program-mgmt | 120 | 120 (100.0%) | 120 (100.0%) score=82.0 | 120 (100.0%) | 120 (100.0%) score=82.0 |
| technology | large | sales | 130 | 130 (100.0%) | 130 (100.0%) score=84.0 | 130 (100.0%) | 130 (100.0%) score=84.0 |
| technology | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| technology | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=85.0 | 9 (100.0%) | 9 (100.0%) score=85.0 |
| technology | medium | field-ops | 21 | 21 (100.0%) | 21 (100.0%) score=83.0 | 21 (100.0%) | 21 (100.0%) score=83.0 |
| technology | medium | finance-accounting | 15 | 15 (100.0%) | 15 (100.0%) score=84.0 | 15 (100.0%) | 15 (100.0%) score=84.0 |
| technology | medium | industry-specialist | 24 | 24 (100.0%) | 24 (100.0%) score=84.0 | 24 (100.0%) | 24 (100.0%) score=84.0 |
| technology | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=85.0 | 12 (100.0%) | 12 (100.0%) score=85.0 |
| technology | medium | procurement | 24 | 24 (100.0%) | 24 (100.0%) score=84.0 | 24 (100.0%) | 24 (100.0%) score=84.0 |
| technology | medium | project-program-mgmt | 18 | 18 (100.0%) | 18 (100.0%) score=83.0 | 18 (100.0%) | 18 (100.0%) score=83.0 |
| technology | medium | sales | 18 | 18 (100.0%) | 18 (100.0%) score=85.0 | 18 (100.0%) | 18 (100.0%) score=85.0 |
| technology | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| technology | small | compliance-audit | 1 | 1 (100.0%) | 1 (100.0%) score=86.0 | 1 (100.0%) | 1 (100.0%) score=86.0 |
| technology | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| technology | small | finance-accounting | 3 | 3 (100.0%) | 3 (100.0%) score=85.0 | 3 (100.0%) | 3 (100.0%) score=85.0 |
| technology | small | industry-specialist | 4 | 4 (100.0%) | 4 (100.0%) score=85.0 | 4 (100.0%) | 4 (100.0%) score=85.0 |
| technology | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| technology | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| technology | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=83.0 | 3 (100.0%) | 3 (100.0%) score=83.0 |
| technology | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| transportation | large | approver-executive | 29 | 29 (100.0%) | 29 (100.0%) score=82.0 | 29 (100.0%) | 29 (100.0%) score=82.0 |
| transportation | large | compliance-audit | 59 | 59 (100.0%) | 59 (100.0%) score=83.0 | 59 (100.0%) | 59 (100.0%) score=83.0 |
| transportation | large | field-ops | 157 | 157 (100.0%) | 157 (100.0%) score=83.0 | 157 (100.0%) | 157 (100.0%) score=83.0 |
| transportation | large | finance-accounting | 98 | 98 (100.0%) | 98 (100.0%) score=83.0 | 98 (100.0%) | 98 (100.0%) score=83.0 |
| transportation | large | industry-specialist | 176 | 176 (100.0%) | 176 (100.0%) score=83.0 | 176 (100.0%) | 176 (100.0%) score=83.0 |
| transportation | large | it | 78 | 78 (100.0%) | 78 (100.0%) score=86.0 | 78 (100.0%) | 78 (100.0%) score=86.0 |
| transportation | large | procurement | 157 | 157 (100.0%) | 157 (100.0%) score=83.0 | 157 (100.0%) | 157 (100.0%) score=83.0 |
| transportation | large | project-program-mgmt | 118 | 118 (100.0%) | 118 (100.0%) score=82.0 | 118 (100.0%) | 118 (100.0%) score=82.0 |
| transportation | large | sales | 128 | 128 (100.0%) | 128 (100.0%) score=84.0 | 128 (100.0%) | 128 (100.0%) score=84.0 |
| transportation | medium | approver-executive | 9 | 9 (100.0%) | 9 (100.0%) score=83.0 | 9 (100.0%) | 9 (100.0%) score=83.0 |
| transportation | medium | compliance-audit | 9 | 9 (100.0%) | 9 (100.0%) score=84.0 | 9 (100.0%) | 9 (100.0%) score=84.0 |
| transportation | medium | field-ops | 20 | 20 (100.0%) | 20 (100.0%) score=83.0 | 20 (100.0%) | 20 (100.0%) score=83.0 |
| transportation | medium | finance-accounting | 15 | 15 (100.0%) | 15 (100.0%) score=84.0 | 15 (100.0%) | 15 (100.0%) score=84.0 |
| transportation | medium | industry-specialist | 26 | 26 (100.0%) | 26 (100.0%) score=84.0 | 26 (100.0%) | 26 (100.0%) score=84.0 |
| transportation | medium | it | 12 | 12 (100.0%) | 12 (100.0%) score=86.0 | 12 (100.0%) | 12 (100.0%) score=86.0 |
| transportation | medium | procurement | 23 | 23 (100.0%) | 23 (100.0%) score=83.0 | 23 (100.0%) | 23 (100.0%) score=83.0 |
| transportation | medium | project-program-mgmt | 18 | 18 (100.0%) | 18 (100.0%) score=83.0 | 18 (100.0%) | 18 (100.0%) score=83.0 |
| transportation | medium | sales | 18 | 18 (100.0%) | 18 (100.0%) score=84.0 | 18 (100.0%) | 18 (100.0%) score=84.0 |
| transportation | small | approver-executive | 3 | 3 (100.0%) | 3 (100.0%) score=82.0 | 3 (100.0%) | 3 (100.0%) score=82.0 |
| transportation | small | compliance-audit | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |
| transportation | small | field-ops | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| transportation | small | finance-accounting | 2 | 2 (100.0%) | 2 (100.0%) score=84.0 | 2 (100.0%) | 2 (100.0%) score=84.0 |
| transportation | small | industry-specialist | 4 | 4 (100.0%) | 4 (100.0%) score=85.0 | 4 (100.0%) | 4 (100.0%) score=85.0 |
| transportation | small | it | 2 | 2 (100.0%) | 2 (100.0%) score=86.0 | 2 (100.0%) | 2 (100.0%) score=86.0 |
| transportation | small | procurement | 4 | 4 (100.0%) | 4 (100.0%) score=84.0 | 4 (100.0%) | 4 (100.0%) score=84.0 |
| transportation | small | project-program-mgmt | 3 | 3 (100.0%) | 3 (100.0%) score=84.0 | 3 (100.0%) | 3 (100.0%) score=84.0 |
| transportation | small | sales | 2 | 2 (100.0%) | 2 (100.0%) score=85.0 | 2 (100.0%) | 2 (100.0%) score=85.0 |

> **SYNTHETIC SIMULATION ESTIMATE** — All willingness percentages and scores above are synthetic simulation estimates, not human survey results.

## §5 Four adoption outputs (global, with formulas/weights/thresholds/sensitivity)

The four adoption outputs (a/b/c/d) are computed under the FROZEN `w2-009:v1` contract. **Never merged into a single adoption metric.**

### Frozen weights (verbatim from `adoption-contract.json`)

| component | weight |
|---|---|
| journeyCompletion | 0.30 |
| usabilityFriction | 0.15 |
| outcomeVsBenchmark | 0.20 |
| trustProof | 0.15 |
| integrationQuality | 0.10 |
| switchingCostFit | 0.05 |
| preferenceFit | 0.05 |

### Frozen thresholds

| threshold | value |
|---|---|
| fullSwitchThreshold | 65 |
| mainInterfaceThreshold | 55 |
| fullSwitchJourneyCompletionFloor | 1.0 |
| mainInterfaceJourneySupervisionFloor | 0.8 |

### Frozen veto categories (critical-failure veto is enforced FIRST)

- security
- authority
- financial-truth
- privacy
- data-integrity

### Global four-adoption-output results

| output | label | denominator | eligible | eligible% | mean score | threshold | rule |
|---|---|---|---|---|---|---|---|
| (a) | Technical full-switch eligibility | 15275 | 15275 | 100.0% | n/a | n/a | no veto AND all applicable journeys discoverable+completable AND no missing-capability reason codes AND no blocker reason codes |
| (b) | Simulated stated willingness to switch completely | 15275 | 15275 | 100.0% | 83.0 | 65 | no veto AND technical-full-switch-eligible AND weighted score >= FULL_SWITCH_THRESHOLD (65) |
| (c) | Main-interface eligibility | 15275 | 15275 | 100.0% | n/a | n/a | no veto AND >= 80% of applicable journeys can start/be supervised from UNiCOM AND no main-interface-blocking reason codes |
| (d) | Simulated stated willingness to use as main interface | 15275 | 15275 | 100.0% | 83.0 | 55 | no veto AND main-interface-eligible AND weighted score >= MAIN_INTERFACE_THRESHOLD (55) |

> **SYNTHETIC SIMULATION ESTIMATE** — All willingness numbers above are synthetic simulation estimates, not human survey results.

### Sensitivity ranges (W2 sensitivity helpers)

- **Seed count**: 5
- **Perturbation magnitude**: 0.05
- **Note**: Critical-failure vetoes are preserved (not perturbed). Components stay in [0,1].

## §6 Journey evidence pointers + top friction causes

### Top friction causes (with evidence pointers)

| cause | count | evidence pointer |
|---|---|---|

### Per-journey-family evidence summaries

| family | total runs | pass | fail | blocked | absent | unknown | reconciled |
|---|---|---|---|---|---|---|---|
| autonomous-store-policy | 600 | 600 | 0 | 0 | 0 | 0 | YES |
| bounded-multi-hop-trade-cycle | 1800 | 1800 | 0 | 0 | 0 | 0 | YES |
| buy-now-vs-wait-price-timing | 13500 | 13500 | 0 | 0 | 0 | 0 | YES |
| buyer-intent-constraints | 19500 | 19500 | 0 | 0 | 0 | 0 | YES |
| commerce-twin-what-if | 6000 | 6000 | 0 | 0 | 0 | 0 | YES |
| connected-commerce-channels-and-live-commerce | 4200 | 4200 | 0 | 0 | 0 | 0 | YES |
| existing-group-buy | 2400 | 2400 | 0 | 0 | 0 | 0 | YES |
| failure-unknown-idempotency-recovery | 19500 | 19500 | 0 | 0 | 0 | 0 | YES |
| gui-feature-discoverability | 35100 | 35100 | 0 | 0 | 0 | 0 | YES |
| latent-demand-merchant-group-buy-proposal | 2400 | 2400 | 0 | 0 | 0 | 0 | YES |
| merchant-commerce-lifecycle | 4800 | 4800 | 0 | 0 | 0 | 0 | YES |
| negotiation-substitution | 19500 | 19500 | 0 | 0 | 0 | 0 | YES |
| offer-sourcing-comparison | 19500 | 19500 | 0 | 0 | 0 | 0 | YES |
| physical-no-rfid-supermarket | 3000 | 3000 | 0 | 0 | 0 | 0 | YES |
| proactive-economic-opportunities | 10800 | 10800 | 0 | 0 | 0 | 0 | YES |
| rent-borrow-vs-buy | 9000 | 9000 | 0 | 0 | 0 | 0 | YES |
| resale-rental-consignment | 6300 | 6300 | 0 | 0 | 0 | 0 | YES |
| supplier-procurement-receiving | 11700 | 11700 | 0 | 0 | 0 | 0 | YES |
| trust-security-fraud-and-recourse | 7200 | 7200 | 0 | 0 | 0 | 0 | YES |

## §7-cycle-1 readiness (documentation only — fixes NOT started)

> This section MUST NOT start cycle-1 fixes. It documents the baseline failure list, root-cause clusters, and the untouched-holdout confirmation only.

- **Baseline failure count**: 0
- **Root-cause clusters**: 0
- **Untouched holdout confirmation**: namespaceGuardPassed = true
- **Cycle 1 started**: false (must be `false`)

## §8 Limitations + confidence warnings

- Simulated willingness is NOT human survey intent. Later validation with consenting real professionals is required.
- Incumbent comparisons are commerce-only. Broad vertical software is excluded from performance claims (evidence class C or D only).
- Local-dev fixture deployment — no production systems or live provider accounts.
- No-RFID supermarket paths are exercised only for the supermarket cohort (300 baseline projects).
- Decision-quality outcomes (Reality/Lab seven-way configurations) are reported separately and do NOT enter the willingness formula.
- Sampled journey families per project; the cohort collectively covers all 19 §10 families.
- Throughput block is excluded from the determinism fingerprint (wall-clock timing is non-deterministic).

## §9 Determinism

- **Determinism fingerprint** (sha256 of canonical JSON modulo the isolated throughput block): `e485b624da2bf73f`
- **Throughput block** (ISOLATED from the fingerprint — wall-clock timing is non-deterministic):
  - totalDurationMs: 6142
  - totalProjects: 3900
  - totalJourneyRuns: 196800
  - wallClockStartedAt: 2026-10-09T11:02:31.920Z
  - wallClockEndedAt: 2026-10-09T11:02:38.062Z

## §10 Artifact fingerprints

| artifact | sha256 (16 hex) | bytes | loaded from |
|---|---|---|---|
| W1 manifest | `dc3b44918e8772ed` | 2214 | /home/z/UniCom/docs/simulations/scenarios/manifest.json |
| W1 industries | `63af720f1ee83f4b` | 16696 | /home/z/UniCom/docs/simulations/scenarios/industries.json |
| W1 roles | `391be42307a7f0e3` | 2846 | /home/z/UniCom/docs/simulations/scenarios/roles.json |
| W1 journey families | `2db4e2026a6b513d` | 5512 | /home/z/UniCom/docs/simulations/scenarios/journey-families.json |
| W1 no-RFID coverage | `c5743c85abaf4e41` | 5524 | /home/z/UniCom/docs/simulations/scenarios/no-rfid-coverage.json |
| W1 seed namespaces | `d244182e33b80498` | 891 | /home/z/UniCom/docs/simulations/scenarios/seed-namespaces.json |
| W2 cohort manifest | `bb5478d38d99a413` | 64816 | /home/z/UniCom/docs/simulations/personas/cohort-manifest.json |
| W2 adoption contract | `ee652a3961b0cdb5` | 3738 | /home/z/UniCom/docs/simulations/personas/adoption-contract.json |
| W1 baseline portfolio | `5a5ba45fa452e3cf` | 70201 | packages/commerce/src/test/w1-009/portfolio/generator.ts |
| W2 persona cohort | `63229bcba5fa7bde` | 744911 | packages/agent/src/persona-cohort.ts |

## §11 Next frontier

- TL accepts `cycles.baseline` and dispatches improvement cycle 1 from the reported failure/friction list.
- Improvement cycle 1 reproduces each baseline failure, clusters by root cause, fixes through the correct worker lane, and adds a regression test + GUI acceptance journey for each repaired failure.
- The 3,900 holdout-namespace projects remain untouched until the held-out final run (protocol §7).
