# W3-011 Completion Report

Status: **COMPLETE** (delivered by the TL under the local-chain doctrine — the dispatched worker vehicle never pushed a branch within the 60-minute window; the TL executed the work order locally with full disclosure, per the W1-009/W3-010 precedents)
Branch: `work/w3-011` (2 commits: registry+drivers+amendment-mode+tests → amended artifacts)
Base: `46ab390` (the W3-011 dispatch; W3-010 accepted at base)
Owner: worker-3 lane (executed by TL; phase cycles.improvement_1, remediation order 1)

## 1. VERDICT

**COMPLETE** — the harness vocabulary gap is repaired at BOTH of its halves,
the negotiation-substitution family is genuinely measured through visible-UI
journeys across the entire baseline namespace, and the amended baseline
report (versioned, with the before/after record) supersedes the first
measurement's lower-bound outputs. Measurement repair, not product
improvement (the anti-overfitting law) — the product is unchanged.

## 2. The repair (both root-cause halves)

1. **journey-registry.ts**: the W1-authoritative `negotiation-substitution`
   family entry added (surfaces buyer-intent-canvas/opportunity-inbox — the
   buyer-agent intent surfaces `intent-negotiation` "Negotiate the price" +
   `intent-substitutes` "Allow similar alternatives"; roles buyer+procurement)
   + the derivation-law header (W1's journey-families.json is the source of
   truth; registry ⊇ W1 families, test-pinned) + the
   `b2b-multi-location-supplier-coordination` mapping note (protocol-only,
   retained, never scheduled by the W1 manifests).
2. **journey-drivers.ts**: `buildAllJourneyDrivers()` now DERIVES from
   `JOURNEY_FAMILY_IDS` (the registry) instead of a second hard-coded list —
   the duplicated list was the second half of the root cause (a registry
   entry without a registered driver scored ABSENT: "no driver — feature
   not discoverable in GUI").
3. **run-baseline-campaign.ts**: `--amendment=N` mode — versioned outputs,
   first-measurement artifacts never overwritten, amendment record section
   (before/after table + root-cause pointer + the classification).

## 3. The amended measurement (bound to commit 28783aa)

| | first measurement (7f52ac4) | amended (28783aa) |
|---|---|---|
| journeys planned | 48,300 | 48,300 |
| executed | 44,400 | 48,300 |
| blocked | 3,900 (all negotiation-substitution, harness-thrown) | **0** |
| absent | 0 | **0** |
| pass | 44,400 | **48,300** |
| drift | 0 | 0 |
| (a) full-switch eligible | 0/15,275 | **39/15,275** |
| (b) willing-switch | 0, score 5 | **39**, score 5 |
| (c) main-interface eligible | 39/15,275 | 39/15,275 |
| (d) willing-main-interface | 39, score 5 | 39, score 5 |
| determinism fingerprint | 6d41dc822423e598 | ded4f86d7ad26be3 |

The amendment record isolates exactly one changed family row:
`negotiation-substitution: 3900/0/3900 → 3900/3900/0`.

**Cycle-1 PRODUCT finding (for the TL's ranking)**: with every journey now
passing, the adoption ceiling (39/15,275 ≈ 0.26% on both eligibility axes)
is produced entirely by the frozen adoption contract's veto/threshold
structure over the measured journey evidence — no journey failures, no
blocked paths, no absent features remain. The improvement cycles' product
work must therefore target what the personas' adoption decisions actually
weigh (the veto categories and score contributors in the w2-009:v1
contract over the per-persona journey outcome mix), NOT GUI friction
(none is measured). This finding is the amended baseline's honest
friction-list successor.

## 4. Commands run + outputs (TL, on work/w3-011 @ bd55229)

### `pnpm vitest run packages/experience/test/sim/w3-011-registry-reconciliation.test.ts`
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  378ms
```

### `npx tsx scripts/sim/run-baseline-campaign.ts --amendment=1`
```
Project reconciliation: planned=3900 executed=3900 blocked=0 skipped=0 drift=0
Journey reconciliation: planned=48300 executed=48300 blocked=0 skipped=0 drift=0
Outcome counts: pass=48300 fail=0 blocked=0 absent=0 unknown=0
Determinism fingerprint: ded4f86d7ad26be3
```
(A smoke-mode amendment run and an intermediate full run preceded the
canonical artifact; the final artifacts are bound to 28783aa.)

### Full battery + gates — recorded in the acceptance merge commit
(experience/commerce/agent chunked; typecheck/lint/architecture).

## 5. Acceptance criteria → evidence

| # | Criterion | Evidence |
|---|---|---|
| 1 | Registry derived from W1 artifact | derivation-law header + test: registry ⊇ W1's 19 families, journeyFamilyEntry never throws for a W1 id |
| 2 | Driver runs end-to-end through visible UI | test: pass outcome, homepage route origin, ≥2 interaction steps, navigation graph, checkpoints, no deep links |
| 3 | Amended re-run: 3,900 projects, zero holdout, drift 0 | run output above; the campaign's namespace guard + §7 confirmation unchanged |
| 4 | negotiation-substitution MEASURED | 3,900/3,900 pass (was 3,900 harness-thrown blocks); per-family evidence in baseline-report.amended-1.json |
| 5 | Outputs recomputed under frozen contract | contractVersion w2-009:v1; adoption-contract.json untouched on the branch |
| 6 | Versioned amendment record, first measurement preserved | BASELINE-REPORT-AMENDED-1.md (before/after table, exactly one changed row); baseline-report.json byte-preserved (its outcomeCounts.blocked=3900 asserted by test) |
| 7 | Determinism | fingerprint ded4f86d7ad26be3; the campaign's existing determinism tests cover the re-run law; the amended artifacts are the canonical single run bound to the commit |
| 8 | Battery ≥ 1,568, zero regressions | recorded in the merge commit (experience +31 = 635) |
| 9 | Completion report with the classification | this report |

## 6. Honest limitations

- The generic driver pattern (W3-009's design) models the visible-UI path
  at the interaction-trace level over the real experience-plane surface
  contracts; it does not render pixels. The evidence records are
  deterministic interaction/checkpoint graphs, not screenshots.
- The amended outputs still measure the local-dev fixture deployment
  (isolated; no production systems — the no-production law).
- The adoption ceiling finding (§3) is an input to the TL's cycle-1
  ranking, not itself a remediation: changing the adoption CONTRACT is
  forbidden (frozen w2-009:v1); product work must change what the contract
  measures (per-persona journey evidence).
- One persona per firm (39 total, the procurement role in each firm cohort)
  crosses the eligibility thresholds — the per-role aggregate tables in the
  amended report carry the full distribution.

## 7. Next frontier

The TL ranks cycle-1 PRODUCT remediation orders from the amended baseline:
the adoption-veto structure over per-persona journey evidence (the §3
finding), plus any per-role/per-industry tails the amended report's
aggregates expose. The charter's minimum is two full improvement cycles
after the amended baseline, then the held-out final (Wave D).
