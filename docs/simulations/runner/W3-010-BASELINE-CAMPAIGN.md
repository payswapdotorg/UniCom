# W3-010 — Baseline Campaign Execution Notes (v3-baseline)

**Status**: EXECUTED (2026-10-12, work order W3-010 — Full Baseline Campaign
Execution, V3 Wave B). This document records how the campaign was run and
how to reproduce it byte-for-byte.

## 1. What changed vs W3-009

The W3-009 runner shipped with **local-dev fixture loaders**
(`packages/experience/src/sim/local-fixtures.ts`) because W1-009/W2-009 were
in flight at its base. W3-010 replaces them with **real loaders**:

| Contract | Real source (read-only) | Loader |
| --- | --- | --- |
| W1 project manifests + outcome oracles | `packages/commerce/src/test/w1-009/portfolio/` (test-only public surface) | `packages/experience/test/sim/real-w1-w2-loader.ts` |
| W2 personas (15,275) + incumbent stacks + frozen scoring `w2-009:v1` | `@unicom/agent` `contract.w2-009` | same loader |

**The runner contract surface is UNCHANGED**: `campaign-scheduler.ts`,
`count-reconciler.ts`, `journey-evidence.ts`, `w1-w2-contracts.ts` and every
other `src/sim` file are byte-identical to W3-009 (zero edits under
`packages/experience/src`). The loader adapts real W1/W2 records INTO the
frozen `RunnerConsumedContracts` shape.

**Why the loader lives in the test tree**: W1-009's portfolio is a TEST-ONLY
surface — its header law says "No production-reachable path may import this
file" — while `packages/experience/src/sim` is production-reachable (package
export `./sim`). The W3-009 pilot already ran from the test tree
(`test/sim/cohort-pilot.test.ts`); the W3-010 campaign follows the same
discipline. The architecture checker only scans module roots (`src/`), and
W1's own certification tests consume the portfolio the same way.

## 2. Adapter rules (deterministic; no invented data)

1. **Firm-id bridge**: W1 firm id `{industryId}-{size}` ↔ W2 firm id
   `firm:{industry}:{size}` via the 13-entry industry table (both registries
   enumerate the same V3 industry matrix).
2. **Journey-family fold**: W1 registry id `negotiation-substitution` folds
   into the runner §10.3 family `buy-now-vs-wait-price-timing` (protocol
   §10.3 text subsumes "negotiation, substitution"); duplicates deduped.
   W1 publishes no §10.12 id, so the runner's
   `b2b-multi-location-supplier-coordination` (§10.12 "where supported") is
   added for firms whose W2 roster declares `b2b-multi-location` journeys
   (sales / industry-specialist personas — present in every firm cohort).
3. **W2 journey ids** map 1:1 onto the runner's 19 registry ids.
4. **Persona fields**: W2 0–1 floats → runner 0–100 integers (×100);
   `switchingAppetite = (1 − switchingCost) × 100`; seniority
   individual→junior, manager→mid, director→senior, executive→executive;
   `trainingCapacity = trainingAvailability × 10` (hours/week);
   `connectivityConstraints = []` (W2 publishes none — never invented);
   `preferredMainInterface` = W2 `preferredWorkflow` verbatim.
5. **Money**: W1 integer-minor-unit strings → integer cents (numbers);
   unsafe integers throw (never float money).
6. **MEASURED quantities** (grams string) → number via parseInt.
7. **Delivery**: SITE_DELIVERY|LOCAL_EDGE→`local-delivery`, PICKUP→`pickup`,
   SHIP_TO_LOCATION→`ship`.
8. **Recourse**: REFUND→full, CREDIT→store-credit, REPLACEMENT→partial,
   NONE→none; proofLevel = strictest line `evidenceRequired`;
   returnWindowDays = W1 `returns.windowDays`.
9. **Substitutions**: W1 substitute SKUs per line →
   `{substituteFor: line.sku, substituteItemId, qualityDelta: "equivalent"}`
   (W1 publishes no quality delta; the SUBSTITUTION oracle assertion governs).
10. **Score schema**: verbatim W2 `FROZEN_SCORE_WEIGHTS` / thresholds /
    critical-failure vetoes / `SCORING_CONTRACT_VERSION`. `frozenAtUtc` =
    2026-10-09T00:00:00Z (W2-009 STATE acceptance date, commit e88a784).
11. **Adoption instrument**: assembled from W2's four published adoption
    outputs + `REASON_CODES` (W2 publishes no separate question module).

## 3. Campaign shape (TL scale ruling 2026-10-09)

- experimentId `v3-baseline`, seedNamespace `baseline`.
- ALL 39 firms × 100 `W1-009-B-*` projects = **3,900 project runs**; every
  baseline project exactly once; holdout (`W1-009-H-*`) NEVER loaded.
- Batch order (deterministic): W1 industry registry order × firm sizes
  small/medium/large — batches 0..38.
- Per project: all applicable journey families (industry applicability
  folded per rule 2); deterministic role-appropriate persona pick
  (`fnv1a32(projectId::familyId)` over W2-declared candidates, fallback full
  roster); one failure variant (§10.18 law, deterministic index
  `parseInt(projectId[-4:]) % 20`); supermarket firms additionally run the
  six no-RFID GUI paths per project (300 supermarket projects total).
- Per firm: 7 role-access switch transitions (8-role vocabulary — the
  runner's frozen role-access surface).

## 4. Determinism

- Frozen injected clock (`2026-10-12T00:00:00Z`), fixed `generatedAt`, and
  `W3_BUILD_COMMIT` pinned to the campaign code commit for every batch.
- Evidence NDJSON is serialized with `JSON.stringify` per record (stable key
  order by construction) and gzipped with `zlib.gzipSync(level: 9)` — the
  gzip header MTIME field is 0 (verified: two gzip runs of identical input
  produce identical bytes).
- The determinism proof re-runs one full firm from the same schedule and
  compares the evidence NDJSON sha256 + schedule digest + reconciliation
  (`docs/simulations/results/baseline/determinism-proof.json`).

## 5. Reproduction commands

```bash
# from the repo root, on branch work/w3-010 at the campaign code commit:
export W3_BUILD_COMMIT=$(git rev-parse HEAD)   # pin the campaign build

# loader contract tests (fast — part of the normal battery):
pnpm --filter @unicom/experience exec vitest run test/sim/v3-baseline-campaign.test.ts

# full campaign, batch by firm (39 batches, each ~1-2 s):
for i in $(seq 0 38); do
  W3_FIRM=$i W3_BUILD_COMMIT=$W3_BUILD_COMMIT \
    pnpm --filter @unicom/experience exec vitest run test/sim/v3-baseline-campaign.test.ts
done

# assembly (campaign report + reconciliation + determinism proof):
W3_ASSEMBLE=1 W3_BUILD_COMMIT=$W3_BUILD_COMMIT \
  pnpm --filter @unicom/experience exec vitest run test/sim/v3-baseline-campaign.test.ts
```

Batch artifacts:
- Evidence: `packages/experience/reports/sim/v3-baseline/evidence/<cohortId>.ndjson.gz`
- Per-firm reports: `docs/simulations/results/baseline/firms/<cohortId>.json`
- Ledger: `docs/simulations/results/baseline/campaign-state.json`
- Final reports: `docs/simulations/results/baseline/` (CAMPAIGN-REPORT.md,
  counts-reconciliation.json, journey-family-coverage.json,
  determinism-proof.json)

## 6. Scope guards (honored)

- No production purchases, no live accounts, no provider credentials, no
  live payment rails (deploymentTarget `local-dev-real-contracts`).
- No edits to `packages/commerce/**` or `packages/agent/**` (read-only).
- No edits to `v3-simulation-state.json` (TL-only).
- A journey that did not run is `skipped`/`blocked` — never `passed`. In
  this campaign every scheduled journey ran; blocked/skipped counts are 0
  with the failure-variant battery (one per project) exercising
  fail/blocked/unknown/absent outcomes under §10.18.
