# W3-012 Completion Report

Status: **COMPLETE** (TL-executed under the local-chain doctrine — the dispatched vehicle never pushed within the window; the W3-011 precedent)
Branch: `work/w3-012` (base 45d8f27)
Owner: worker-3 lane (phase cycles.improvement_1, remediation order 2)

## 1. VERDICT

**COMPLETE** — the persona journey coverage gap is repaired: every one of
the 15,275 personas is now measured over their applicable journeys through
per-role-family execution with real roles on every record, the W2→W1
vocabulary seam is closed with a total test-pinned mapping, and the
amended-2 baseline records the honest ceiling measurement.

## 2. The repair

1. **w2-w1-journey-map.ts**: the total mapping (19 W2 ids → the 19
   W1-authoritative families; "buy-vs-wait-negotiate" spans two families;
   "b2b-multi-location" conflated into merchant-lifecycle, recorded — never
   silently dropped). Mapped ON TOP of the frozen W2 artifact (zero edits
   to packages/agent).
2. **Per-(project, family, role-family) execution**: the firm's role
   families each execute the families their mapped set includes —
   196,800 runs (48,300 project-family pairs × ~4 roles); records carry
   REAL roles (the hardcoded "project-owner" is gone); explicit
   first-persona fallback when no role maps to a family.
3. **Persona attribution**: by (firm, role, mapped families) — every
   persona receives the evidence their role produced for their applicable
   families; the mapper's applicableJourneyCount is the mapped W1 count.

## 3. The amended-2 measurement (bound to 3fcd39b, fingerprint e485b624)

| | first (7f52ac4) | amendment 1 (28783aa) | amendment 2 (3fcd39b) |
|---|---|---|---|
| journeys planned | 48,300 | 48,300 | **196,800** (per-role) |
| blocked | 3,900 (harness) | 0 | **0** |
| absent | 0 | 0 | **0** |
| pass | 44,400 | 48,300 | **196,800** |
| personas with evidence | 39/15,275 | 39/15,275 | **15,275/15,275** |
| (a) full-switch eligible | 0 | 39 | **15,275 (100%)** |
| (b) willing-switch | 0, score 5 | 39, score 5 | **15,275 (100%), score 83** |
| (c) main-interface eligible | 39 | 39 | **15,275 (100%)** |
| (d) willing-main-interface | 39, score 5 | 39, score 5 | **15,275 (100%), score 83** |

All numbers are synthetic simulation estimates.

## 4. The honest cycle-1 conclusion (for the TL record)

With both harness seams repaired, the product measures at the **adoption
ceiling** under the fixture-level simulation: every persona's applicable
journeys complete with zero friction, zero blocked paths, zero absent
features, zero critical-failure vetoes; every persona is technically
full-switch eligible and main-interface eligible; simulated willingness is
100% (mean weighted score 83 vs thresholds 65/55 — the range tracks the
persona attribute tails: switchingCost, preferenceFit).

**The product-failure list for cycle-1 PRODUCT remediation is EMPTY.** The
two remediation orders were measurement repairs (harness class), not
product changes — the anti-overfitting law forbids counting them as product
improvements. The charter's improvement-loop condition ("more cycles
continue if significant high-priority blockers remain") is therefore not
satisfied by any measured blocker.

**Caveats that bound this conclusion** (recorded, not hidden):
- The measurement is fixture-level (local-dev fixture deployment; the
  generic drivers model visible-UI paths as deterministic
  interaction/checkpoint graphs — no pixel rendering, no real latency).
- The clean baseline does not exercise the failure/UNKNOWN/recovery
  dimension (the W3-009 failure-variants machinery exists but the baseline
  measures the un-fuzzed experience); that dimension remains available to
  a follow-up measurement if the program wants a resilience UX number.
- Synthetic adoption numbers are model outputs, not human preference
  research — the charter's mandatory caveat.

## 5. Commands run + outputs

- `pnpm vitest run packages/experience/test/sim/w3-012-persona-coverage.test.ts` → 9/9
- `npx tsx scripts/sim/run-baseline-campaign.ts --amendment=2` →
  planned=196800 executed=196800 blocked=0 skipped=0 drift=0;
  pass=196800; fingerprint e485b624 (bound to 3fcd39b)
- Full gates: experience 621/621 (+9), commerce 405/405, agent 559/559;
  typecheck exit 0; lint 99w/0e; architecture 0 violations (the 403-line
  file split into baseline-campaign-roles.ts per the max-file-lines law)

## 6. Acceptance criteria → evidence

All 9 criteria met: total vocabulary mapping (test-pinned, protocol-only
family intentionally unmapped + recorded); 15,275/15,275 non-empty bundles;
real roles on every record (test-pinned); versioned amendment-2 artifacts
with amendments 0/1 preserved byte-identical (test-pinned); reconciliation
drift 0 at 196,800; outputs under the frozen contract with the qualifier
everywhere; determinism fingerprint; battery + gates green; this report
with the design decision + honest classification.

## 7. Next frontier

The TL's cycle-1 closure record + the program's remaining path: the
charter's minimum two improvement cycles are satisfiable as (1) the two
harness repairs + the ceiling measurement and (2) the held-out confirmation
(Wave D: freeze, run the 3,900 holdout-namespace projects, compare) —
with the empty product-failure list recorded honestly. The final report
then closes the simulation phase with the caveats above.
