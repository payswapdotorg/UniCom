# W1-010 — Baseline Campaign Oracle Certification + Integrity Report

**Work order**: W1-010 (V3 Wave B, Worker 1 — Commerce truth / Economic execution)
**Harness**: `packages/commerce/src/test/w1-010/` (test-only; the oracle stays
assertion-only — it NEVER mutates campaign evidence, proven by before/after
sha256 hashes recorded in every report).
**Runner**: `npx tsx packages/commerce/scripts/run-w1-010-certification.ts`
(deterministic — re-running over the same evidence yields byte-identical
artifacts, verified in-process and cross-process).

## Status

| Source | Status | Records | Evidence |
| --- | --- | --- | --- |
| `pilot/` | **CERTIFIED** (W3-009 pilot evidence, experiment `v3-baseline`) | 1,092 / 1,092 | `packages/experience/reports/sim/pilot-summary.json` (base SHA `47c07ce`) |
| `campaign-smoke/` | **CERTIFIED** (W3-010 smoke campaign evidence, experiment `v3-w3-010-baseline`, branch `work/w3-010` @ `80fd2f9`) | 507 / 507 | `campaign-smoke/evidence/campaign-smoke-cert-surface.json` + committed report copy |
| `campaign-full/` | **PENDING** — the full 3,900-project W3-010 run has not landed on `work/w3-010` yet (branch carries the 39-project smoke run with "run full campaign" as its stated continuation). The harness is built + pilot/smoke-proven; when the full evidence is available, re-run: harvest (`campaign-smoke/harvest-script.ts`, `--sample-mode=full`) → `run-w1-010-certification.ts` with the full-evidence paths. | — | — |

## Certification results (summary)

| Guard | pilot | campaign-smoke |
| --- | --- | --- |
| Oracle verdicts | pass 1,092 · fail 0 · unknown-preserved 0 | pass 468 · fail 0 · unknown-preserved 39 (blocked preserved) |
| Uncertified executed records | 0 | 0 |
| Holdout leakage (`W1-009-H-*`) | 0 | 0 |
| Baseline/holdout seed disjointness | proven (1,176 seed re-derivations) | proven (39/39 numeric re-derivations, 0 range violations, 0 holdout-set intersections) |
| Manifest↔execution reconciliation | 3/3 firms, drift 0 | 39/39 firms, drift 0 (3,900-project inventory; 39-project run scope disclosed) |
| UNKNOWN preservation (S4/S9) | 0 conversions | 0 conversions (39 blocked records preserved through every aggregation layer) |
| Money integrity (S11) | 0 float money (pilot evidence carries no money-valued fields — vacuous, disclosed) | 0 float money over 51,712 money values (W1 portfolio manifests + oracles + reports) |
| Determinism audit | schedules re-derived byte-identical (4,305 canonical fields, clock fields excluded) | schedule re-derived byte-identical (1,643,623 canonical fields, clock fields excluded) |
| Reproducibility | byte-identical re-run (in-process + cross-process) | byte-identical re-run (in-process + cross-process) |
| Evidence immutability | sha256 before = after | sha256 before = after |

## Artifacts (per source directory)

- `certification-report.json` — the machine-readable authority: per-record
  verdicts, per-firm + overall reconciliation, all guards, determinism
  audits, integrity + reproducibility proofs, lineage, notes.
- `leakage-guard.json` — holdout-leakage + seed-disjointness machine proof.
- `reconciliation.json` — manifest↔execution tables (per firm + overall).
- `determinism-audit.json` — schedule re-derivation audits.
- `reproducibility.json` — re-run byte-identity proof + artifact digests.
- `SUMMARY.md` — human-readable summary.

## Honest-findings register (surfaced by the harness, none fabricated)

1. **Assertion vocabulary gap (campaign)**: the W3-010 runner records
   runner-local assertion ids (`{projectId}-assert-budget`) rather than the
   W1-009 oracle's semantic ids (`cost-validity`, `budget-constraint`, …).
   Verdicts certify the recorded after-journey assertions; the per-record
   `oracleAssertionCount` discloses the full oracle inventory, and the gap
   is flagged for the W3 runner continuation.
2. **Schedule seed convention (campaign)**: the W3-010 schedule's per-project
   `seed` field carries the FIRM-level seed material; blocked records anchor
   that firm-level seed (38 of 39 blocked records in the smoke scope, all
   disclosed per record via `blockedRecordFirmSeedAnchors`). Pass records
   anchor the project's own material. Both re-derive exactly.
3. **Committed-report fingerprint (campaign)**: the W3-010 report's
   `determinismFingerprint` embeds 8 machine-absolute `loadedFromPath`
   values, so it differs across checkout locations while every semantic
   field (artifact sha256s, byte lengths, counts, aggregates,
   reconciliations) matches exactly. Flagged for the W3 continuation
   (loadedFromPath should be repo-relative).
4. **Smoke scope (campaign)**: the W3-010 branch currently carries the
   39-project smoke run (first 39 scheduled projects — 1 firm); 3,861
   scheduled projects remain untouched pending the full run. The scope
   prefix property is verified structurally, and the manifest inventory is
   disclosed per firm.
5. **Pilot money scope**: the W3-009 pilot evidence carries no money-valued
   fields (fixture money lives in project manifests, not journey records);
   money integrity is proven non-vacuously on the campaign evidence set.

## Laws honored

- **S12** (fixtures never mark journeys successful): verdicts derive only
  from recorded outcomes + recorded after-journey assertion refs; the
  harness adds an `oracleS12Conformance` check on every consumed oracle.
- **S4/S9** (UNKNOWN/blocked preserved): any aggregate re-labeling or
  record-level adoption/completion claim on a non-resolved journey is a
  hard conversion failure.
- **S11** (integer minor units): money-keyed leaves must be digit strings
  or integers; floats are counted as violations.
- **§7 anti-overfitting**: the holdout namespace is generated for the
  disjointness proof only — never executed, never scheduled, never scored.
- **Assertion-only oracle**: evidence files are read-only; immutability is
  proven by before/after hashes in every report.
