# W3-010 — v3-baseline Full Campaign Report

**Status**: COMPLETE — 39/39 firms, 3900 project runs, GUI-only law clean, drift 0.

## Scale ruling (verbatim — required header)

> TL scale ruling (2026-10-09): the baseline campaign executes 3,900 project runs — every W1-009-B-* project exactly once across all 39 firms. The charter's 7,800 total covers baseline + held-out final run; the W1-009 invariant governs.
>
> "Each firm manifest declares 200 project ids (7,800 total) and deterministic seed. (W1-009 acceptance criteria §2)"
>
> "13 × 3 × 200 = 7,800 grand total (200 per firm = 100 baseline + 100 holdout). (docs/simulations/scenarios/SCHEMA.md §5)"
>
> The holdout namespace (W1-009-H-*) is NOT executed in this campaign — it is reserved for the held-out final run (protocol §7 anti-overfitting).

## Build / run identifiers

| Field | Value |
| --- | --- |
| experimentId | `v3-baseline` |
| seedNamespace | `baseline` (W1-009-B-* only; W1-009-H-* never loaded) |
| buildCommit | `c51703e4df2919859a56d5b24f8fda2bd4283c00` (the campaign runner code commit — later commits on the branch only add evidence artifacts, never runner code) |
| deploymentTarget | `local-dev-real-contracts` (local-dev isolated; no production, no live accounts, no provider credentials, no live payment rails) |
| generatedAt / clockStart | 2026-10-12T00:00:00Z (frozen injected clock — no wall-clock in any record) |
| W1 source | real W1-009 portfolio manifests + outcome oracles (`packages/commerce/src/test/w1-009/portfolio/`) |
| W2 source | real W2-009 persona cohorts + frozen scoring contract `w2-009:v1` (`@unicom/agent` contract.w2-009) |

## Loader integration (W3-010 scope)

The W3-009 local-dev fixture loaders were replaced by REAL loaders
(`packages/experience/test/sim/real-w1-w2-loader.ts`) without changing the
runner contract surface (campaign-scheduler.ts, count-reconciler.ts,
journey-evidence schema untouched; zero edits under src/sim). The loader
lives in the TEST TREE because W1-009's portfolio is a test-only surface
("No production-reachable path may import this file") while
`packages/experience/src/sim` is production-reachable.

Adapter rules (deterministic, documented in the loader header):
- Firm-id bridge: W1 `{industryId}-{size}` ↔ W2 `firm:{industry}:{size}` (13-entry table).
- Journey-family fold: W1 `negotiation-substitution` → runner §10.3 `buy-now-vs-wait-price-timing` (protocol §10.3 subsumes negotiation/substitution); runner §10.12 `b2b-multi-location-supplier-coordination` added where the firm's W2 roster declares `b2b-multi-location` journeys (sales / industry-specialist — every firm).
- W2 persona floats (0–1) → runner integers (0–100); seniority bands mapped; no connectivity constraints invented (W2 publishes none).

## Count reconciliation (the denominator invariant)

```
totalPlanned = executed + blocked + skipped
3900 = 3900 + 0 + 0
drift = 0 — reconciled: YES
```

Skipped/blocked never leave the denominator (W3-009 acceptance §9). All 39
per-cohort reconciliations are in
[counts-reconciliation.json](./counts-reconciliation.json) (overall +
byJourneyFamily + byOutcome + per-firm).

## Firm table (39 batches)

| # | Cohort | Size | Planned | Executed | Blocked | Skipped | Evidence records | No-RFID path runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `baseline-construction-small` | small | 100 | 100 | 0 | 0 | 1300 | — |
| 1 | `baseline-construction-medium` | medium | 100 | 100 | 0 | 0 | 1300 | — |
| 2 | `baseline-construction-large` | large | 100 | 100 | 0 | 0 | 1300 | — |
| 3 | `baseline-finance-banking-accounting-small` | small | 100 | 100 | 0 | 0 | 900 | — |
| 4 | `baseline-finance-banking-accounting-medium` | medium | 100 | 100 | 0 | 0 | 900 | — |
| 5 | `baseline-finance-banking-accounting-large` | large | 100 | 100 | 0 | 0 | 900 | — |
| 6 | `baseline-sales-business-development-small` | small | 100 | 100 | 0 | 0 | 1700 | — |
| 7 | `baseline-sales-business-development-medium` | medium | 100 | 100 | 0 | 0 | 1700 | — |
| 8 | `baseline-sales-business-development-large` | large | 100 | 100 | 0 | 0 | 1700 | — |
| 9 | `baseline-technology-software-it-services-small` | small | 100 | 100 | 0 | 0 | 1300 | — |
| 10 | `baseline-technology-software-it-services-medium` | medium | 100 | 100 | 0 | 0 | 1300 | — |
| 11 | `baseline-technology-software-it-services-large` | large | 100 | 100 | 0 | 0 | 1300 | — |
| 12 | `baseline-healthcare-organizations-small` | small | 100 | 100 | 0 | 0 | 900 | — |
| 13 | `baseline-healthcare-organizations-medium` | medium | 100 | 100 | 0 | 0 | 900 | — |
| 14 | `baseline-healthcare-organizations-large` | large | 100 | 100 | 0 | 0 | 900 | — |
| 15 | `baseline-transportation-delivery-small` | small | 100 | 100 | 0 | 0 | 1000 | — |
| 16 | `baseline-transportation-delivery-medium` | medium | 100 | 100 | 0 | 0 | 1000 | — |
| 17 | `baseline-transportation-delivery-large` | large | 100 | 100 | 0 | 0 | 1000 | — |
| 18 | `baseline-hospitality-restaurants-hotels-small` | small | 100 | 100 | 0 | 0 | 1500 | — |
| 19 | `baseline-hospitality-restaurants-hotels-medium` | medium | 100 | 100 | 0 | 0 | 1500 | — |
| 20 | `baseline-hospitality-restaurants-hotels-large` | large | 100 | 100 | 0 | 0 | 1500 | — |
| 21 | `baseline-fashion-apparel-retail-brands-small` | small | 100 | 100 | 0 | 0 | 1700 | — |
| 22 | `baseline-fashion-apparel-retail-brands-medium` | medium | 100 | 100 | 0 | 0 | 1700 | — |
| 23 | `baseline-fashion-apparel-retail-brands-large` | large | 100 | 100 | 0 | 0 | 1700 | — |
| 24 | `baseline-entertainment-media-production-small` | small | 100 | 100 | 0 | 0 | 1200 | — |
| 25 | `baseline-entertainment-media-production-medium` | medium | 100 | 100 | 0 | 0 | 1200 | — |
| 26 | `baseline-entertainment-media-production-large` | large | 100 | 100 | 0 | 0 | 1200 | — |
| 27 | `baseline-legal-professional-services-small` | small | 100 | 100 | 0 | 0 | 900 | — |
| 28 | `baseline-legal-professional-services-medium` | medium | 100 | 100 | 0 | 0 | 900 | — |
| 29 | `baseline-legal-professional-services-large` | large | 100 | 100 | 0 | 0 | 900 | — |
| 30 | `baseline-defense-security-government-contracting-small` | small | 100 | 100 | 0 | 0 | 900 | — |
| 31 | `baseline-defense-security-government-contracting-medium` | medium | 100 | 100 | 0 | 0 | 900 | — |
| 32 | `baseline-defense-security-government-contracting-large` | large | 100 | 100 | 0 | 0 | 900 | — |
| 33 | `baseline-manufacturing-supply-chain-small` | small | 100 | 100 | 0 | 0 | 1400 | — |
| 34 | `baseline-manufacturing-supply-chain-medium` | medium | 100 | 100 | 0 | 0 | 1400 | — |
| 35 | `baseline-manufacturing-supply-chain-large` | large | 100 | 100 | 0 | 0 | 1400 | — |
| 36 | `baseline-supermarkets-local-retail-small` | small | 100 | 100 | 0 | 0 | 1800 | 600 |
| 37 | `baseline-supermarkets-local-retail-medium` | medium | 100 | 100 | 0 | 0 | 1800 | 600 |
| 38 | `baseline-supermarkets-local-retail-large` | large | 100 | 100 | 0 | 0 | 1800 | 600 |

## Journey family coverage (protocol §10 — all 19 mandatory)

Covered: **19/19** families (planned > 0). Per-family
counts across the campaign:

| Journey family | Planned | Executed | Blocked | Skipped |
| --- | --- | --- | --- | --- |
| `buyer-intent-constraints` | 3900 | 3900 | 0 | 0 |
| `offer-sourcing-comparison` | 3900 | 3900 | 0 | 0 |
| `buy-now-vs-wait-price-timing` | 3900 | 3900 | 0 | 0 |
| `existing-group-buy` | 1200 | 1200 | 0 | 0 |
| `latent-demand-merchant-group-buy-proposal` | 1200 | 1200 | 0 | 0 |
| `rent-borrow-vs-buy` | 3000 | 3000 | 0 | 0 |
| `resale-rental-consignment` | 2100 | 2100 | 0 | 0 |
| `proactive-economic-opportunities` | 3600 | 3600 | 0 | 0 |
| `bounded-multi-hop-trade-cycle` | 600 | 600 | 0 | 0 |
| `merchant-commerce-lifecycle` | 2400 | 2400 | 0 | 0 |
| `supplier-procurement-receiving` | 3900 | 3900 | 0 | 0 |
| `b2b-multi-location-supplier-coordination` | 3900 | 3900 | 0 | 0 |
| `autonomous-store-policy` | 300 | 300 | 0 | 0 |
| `commerce-twin-what-if` | 1500 | 1500 | 0 | 0 |
| `connected-commerce-channels-and-live-commerce` | 2100 | 2100 | 0 | 0 |
| `physical-no-rfid-supermarket` | 600 | 600 | 0 | 0 |
| `trust-security-fraud-and-recourse` | 3600 | 3600 | 0 | 0 |
| `failure-unknown-idempotency-recovery` | 3900 | 3900 | 0 | 0 |
| `gui-feature-discoverability` | 3900 | 3900 | 0 | 0 |

## By outcome (evidence records)

| Outcome | Records |
| --- | --- |
| pass | 49500 |
| fail | 0 |
| blocked | 0 |
| absent | 0 |
| unknown | 0 |
| **total** | **49500** |

## No-RFID supermarket battery

Supermarket-industry cohorts: `baseline-supermarkets-local-retail-small`, `baseline-supermarkets-local-retail-medium`, `baseline-supermarkets-local-retail-large`.
All **300** baseline supermarket projects ran
the six no-RFID GUI paths (POS/file import, barcode/camera count, weighted
item, offline observation queue, receiving, reconciliation) —
**1800** path runs. No supermarket project requires RFID
(W1-009 no-Rfid law; INVARIANT 46). The `physical-no-rfid-supermarket`
journey family also runs for the hospitality cohort per W1 applicability.

## Failure variants (§10.18 law — one per project)

3900 failure-variant runs (one per project, deterministic selection). Outcome distribution:

| Outcome | Runs |
| --- | --- |
| absent | 195 |
| blocked | 1950 |
| fail | 975 |
| pass | 195 |
| unknown | 585 |

## Role-access switch tests

273 role switch transitions (7 per firm across the
8 runner role-access vocabulary roles: project-owner, procurement, finance,
ops, end-user, approver, supplier, auditor). Results recorded in the per-firm
reports.

## GUI-only law (§1) — clean

- `guiOnlyProof.violations === []` on every record: **0 violations across 49500 records**
- `deepLinkUsedForDiscovery === false` on every record: **0 violations**
- `sensitiveValueScrubbed === true` on every record
- All journeys completed through registered visible-UI drivers; no direct API / service / DB / hidden-route completion path exists in the runner.

## Holdout leakage — zero

Every executed projectId starts with `W1-009-B-`. W1-009-H-* (holdout) was
never loaded by the loader (provenance: `holdoutLoaded: false`) and never
appears in any evidence record: **0 holdout records**.

## Determinism proof (protocol §7)

Re-ran firm batch 0 (`baseline-construction-small`) from the same schedule
with the campaign's buildCommit `c51703e4df2919859a56d5b24f8fda2bd4283c00`:

- evidence NDJSON sha256: `98427b70322c14a3c7f7deabd2b55f696edb86637cc6b3aa205dfee56363aab5` vs `98427b70322c14a3c7f7deabd2b55f696edb86637cc6b3aa205dfee56363aab5` → **byte-identical**
- schedule digest: **identical**
- reconciliation deep-equal: **yes**
- records: 1300 vs 1300

Full proof: [determinism-proof.json](./determinism-proof.json). (The gzip
container is deterministic too — zlib gzip header MTIME is 0; verified in the
W3-010 execution notes.)

## Evidence artifacts

- Per-firm evidence (full GUI journey records, NDJSON + deterministic gzip): `packages/experience/reports/sim/v3-baseline/evidence/<cohortId>.ndjson.gz` (39 files; inspect with `gunzip -c <file> | head`).
- Per-firm reports: `docs/simulations/results/baseline/firms/<cohortId>.json` (39 files).
- Batch ledger: `docs/simulations/results/baseline/campaign-state.json`.

## Limitations (honest reporting)

- Simulated willingness numbers inside the adoption responses are SYNTHETIC
  simulation estimates, never human survey intent (W2 law §3; the
  syntheticEstimateLabel boolean is on every record).
- The campaign runs on the W3-009 GUI-only simulation runner accepted by the
  TL at the pilot gate; journey outcomes reflect that engine at full scale,
  not a production deployment.
- Adoption aggregation by industry/size/role (W2's four outputs) is deferred
  to the W2 scoring lane per the W3-009 integration contract; this campaign
  delivers journey evidence + counts reconciliation only.
