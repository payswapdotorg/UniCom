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
| `campaign-full/` | **CERTIFIED** (W3-010 FULL campaign evidence — the full 3,900-project run landed on main at `7f52ac4`/`efb5734` while this work order executed; harvested from the `work/w3-010` runner at the recorded buildCommit `80fd2f9` with the full-run committed report's recorded inputs) | **48,300 / 48,300** | `campaign-full/evidence/` (schedule surface committed; 48,300-record JSONL on disk, sha256-bound; committed report copy) |

## Certification results (summary)

| Guard | pilot | campaign-smoke | campaign-full |
| --- | --- | --- | --- |
| Oracle verdicts | pass 1,092 · fail 0 · unknown-preserved 0 | pass 468 · fail 0 · unknown-preserved 39 (blocked preserved) | pass 44,400 · fail 0 · unknown-preserved 3,900 (the negotiation-substitution blocked cluster, preserved) |
| Uncertified executed records | 0 | 0 | 0 |
| Holdout leakage (`W1-009-H-*`) | 0 | 0 | 0 |
| Baseline/holdout seed disjointness | proven (1,176 seed re-derivations) | proven (39/39 numeric re-derivations) | proven (3,900/3,900 numeric re-derivations, 0 range violations, 0 holdout-set intersections) |
| Manifest↔execution reconciliation | 3/3 firms, drift 0 | 39/39 firms, drift 0 (3,900-project inventory; 39-project run scope disclosed) | **39/39 firms, planned 3,900 = executed 3,900, drift 0, inventory 3,900** |
| UNKNOWN preservation (S4/S9) | 0 conversions | 0 conversions (39 blocked preserved) | 0 conversions (3,900 blocked preserved through all 89 aggregation checks) |
| Money integrity (S11) | 0 float money (pilot evidence carries no money-valued fields — vacuous, disclosed) | 0 float money over 51,712 money values | 0 float money over 51,712 money values (W1 portfolio manifests + oracles + full evidence set + reports) |
| Determinism audit | schedules re-derived byte-identical (4,305 canonical fields, clock fields excluded) | schedule re-derived byte-identical (1,643,623 canonical fields, clock fields excluded) | schedule re-derived byte-identical (1,643,623 canonical fields, clock fields excluded; 39/39 persona-roster checks) |
| Reproducibility | byte-identical re-run (in-process + cross-process) | byte-identical re-run (in-process + cross-process) | byte-identical re-run (in-process + cross-process); full verdict list digest-bound (`perRecordSha256`) |
| Evidence immutability | sha256 before = after | sha256 before = after | sha256 before = after (records JSONL bound by sha256) |

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
4. **Full-campaign blocked cluster (the headline finding)**: all 3,900
   negotiation-substitution journey records are blocked — the accepted
   W3-010 root cause (the journey family is absent from the W3-009 runner
   registry; a harness gap, not a product failure). The certification
   preserves every one as an unknown-preserved (blocked) verdict with zero
   conversions; the W3-011 remediation (registry reconciliation + driver +
   amended re-run) is already dispatched on main.
5. **Smoke scope (campaign-smoke)**: the smoke run covers the first 39
   scheduled projects (1 firm); the prefix property is verified structurally
   and the manifest inventory is disclosed per firm. The full run
   (campaign-full) supersedes it with the complete 3,900-project scope.
6. **Pilot money scope**: the W3-009 pilot evidence carries no money-valued
   fields (fixture money lives in project manifests, not journey records);
   money integrity is proven non-vacuously on the campaign evidence set.
7. **Pilot evidence lineage**: the pilot certification runs over the pilot
   summary as committed at this branch's base `47c07ce`. A later main commit
   (`7f52ac4`, lint cleanup) adjusted the pilot summary's wall-clock
   `throughput.totalDurationMs` (45→34) — outside the certification surface;
   the certified bytes are bound by the recorded evidence sha256.

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
