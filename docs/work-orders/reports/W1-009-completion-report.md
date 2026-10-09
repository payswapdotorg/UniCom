# W1-009 Completion Report

Status: **COMPLETE** (TL acceptance under the local-chain doctrine — worker vehicle died after milestone-3 push; TL completed the report and re-ran every gate on the delivered branch)
Branch: `work/w1-009` (3 commits pushed: scenario-manifest + oracle SCHEMA → portfolio generator + outcome oracle + contract tests → architecture split for max-file-lines)
Base: `5958ebc` (WAVE-009 activation; W2-009 / W3-009 dispatched in parallel — NOT at base)
Owner: worker-1 (lane: `project-procurement-economics-scenarios`)

## 1. VERDICT

**COMPLETE** — deterministic industry/procurement scenario portfolio delivered:
39 firm cohorts × 200 project instances = 7,800 machine-readable project
manifests (3,900 baseline + 3,900 holdout, disjoint seed namespaces), with
a non-vacuous outcome oracle, contract tests proving determinism/idempotency/
UNKNOWN preservation, no-RFID supermarket coverage, and role-mix ≥ 8 role
families per industry across 19 mandatory journey families. All ten WO
acceptance criteria verified; every gate green; zero regressions.

## 2. Acceptance criteria → evidence map

| # | Criterion | Evidence |
|---|---|---|
| 1 | 39 firm cohorts | `manifest.counts.firms = 39` (13 industries × 3 sizes); reconciled by `portfolio-reconciliation.test.ts` |
| 2 | 200 project ids/firm, 7,800 total, deterministic seed | `counts.totalProjects = 7800` (3,900 baseline `W1-009-B-` + 3,900 holdout `W1-009-H-`, seed prefixes 106816/176337, disjointness asserted); `portfolio-reconciliation.test.ts` (13 tests) |
| 3 | Role mix ≥ 8 families/industry | `roles.json`: `allIndustriesMeetMinimum = true`, `minimumRoleFamiliesPerIndustry = 8`; `portfolio-roles-journeys.test.ts` (12 tests) |
| 4 | Scenario coverage (supplier comparison, budget/deadline/quality conflict, approvals, substitution, partial availability, delivery, return/recourse, evidence) | `journey-families.json`: 19 mandatory families covered; `portfolio-assertions.test.ts` (21 tests) |
| 5 | No-RFID supermarket passes W3-004 contracts + SUPERMARKET-WITHOUT-RFID.md | `no-rfid-coverage.json` (600 supermarket projects, 300/namespace); `portfolio-no-rfid.test.ts` (8 tests) |
| 6 | Machine-readable, non-vacuous expected outcomes | `outcome-oracle.schema.json` + `oracle.ts` (310L); `portfolio-assertions.test.ts` locks non-vacuity |
| 7 | No real production state / live payment rail | portfolio is generator-local, integer minor units only (S11), zero network calls |
| 8 | Deterministic reproduction, idempotency, UNKNOWN preservation | certification S2/S3/S4/S9; `rng.ts` seeded LCG; byte-identical regeneration test |
| 9 | Fixtures never mark journeys successful | certification S12 — oracle is assertion-only; `schema.ts` separates fixture from journey result |
| 10 | Integration report with file pointers, counts, seeds, tests | this report + `packages/commerce/reports/w1-009-portfolio-certification.json` (13/13 PASS) |

## 3. Commands run + verbatim tail outputs (TL re-run on branch da8d122)

### `pnpm vitest run packages/commerce/src/test/w1-009`
```
 Test Files  5 passed (5)
      Tests  56 passed (56)
   Duration  4.01s
```
Exit code: 0. (21 assertions + 13 reconciliation + 12 roles-journeys + 8 no-rfid + 2 certification)

### `pnpm exec tsc -b packages/shared packages/rpc packages/provider packages/provider-node packages/services packages/client packages/server packages/zcode-server-cli packages/agent packages/commerce packages/experience packages/desktop/tsconfig.host.json`
```
TSC EXIT: 0
```
12/12 branch-reachable projects clean (after building `@zcode/contracts` and
`@unicom/agent-kernel` workspace artifacts — fresh-install requirement, not
branch-specific). `packages/ui` + `packages/web` excluded: OOM at the sandbox
4GB RAM ceiling, differentially identical on main (environmental — the W2-009
acceptance precedent). The `tsc -b packages/commerce` scoped run (which
includes `src/test/w1-009/**` via `include: ["src"]`) exits 0.

### `pnpm lint`
```
Found 97 warnings and 0 errors.
Finished in 1.4s on 3165 files using 2 threads.
```
Exit code: 0. 0 warnings in W1-009 files.

### `pnpm architecture:check`
```
architecture: OK
violations: 0
baseline: 0
new: 0
```
Exit code: 0.

### Branch-base battery (chunked; base 5958ebc predates W2/W3 merges)
```
packages/commerce:   Tests  405 passed (405)   # 349 base + 56 W1-009 — exactly additive
packages/agent:      Tests  497 passed (497)   # identical to base
packages/experience: Tests  488 passed (488)   # identical to base
```
Zero regressions. (Merged-lineage battery recorded in the acceptance merge commit.)

## 4. File pointers

- Contract docs: `docs/simulations/scenarios/` (README, SCHEMA, manifest.json,
  industries.json, roles.json, journey-families.json, no-rfid-coverage.json,
  outcome-oracle.schema.json, scenario-manifest.schema.json, seed-namespaces.{json,schema.json})
- Source (all under `packages/commerce/src/test/w1-009/portfolio/`): generator.ts,
  oracle.ts, schema.ts, rng.ts, industries.ts, templates*.ts, no-rfid.ts,
  registries.ts, index.ts, w1-009-portfolio-report.ts (26 source files within
  the 33-file additive diff, 5,286 lines total, all additive)
- Tests: portfolio-assertions / portfolio-reconciliation / portfolio-roles-journeys /
  portfolio-no-rfid / w1-009-certification (56 tests)
- Generator entry: `packages/commerce/scripts/generate-w1-009-portfolio.ts`
- Certification artifact: `packages/commerce/reports/w1-009-portfolio-certification.json`

## 5. Honest limitations

- The outcome oracle is assertion-only by design: it validates state AFTER the
  GUI runner performs a task; it can never generate a successful journey result
  (S12). Baseline execution is the W3-009 runner's job under cycles.baseline.
- `generatedAt` is pinned (`2026-10-09T00:00:00Z`) for byte-reproducibility of
  the certification artifact; it is not the actual generation wall-clock time.
- Supermarket/no-RFID coverage is weighted (600 projects) per the WO scope, not
  uniformly distributed across industries.
- The portfolio models commerce workloads only (the commerce-only clarification);
  out-of-scope regulated functions are explicitly excluded in fixtures.

## 6. Next frontier

Wave A is complete with this acceptance (W1 + W2 + W3 all merged). The next
step is **Wave B — the full baseline campaign** (all 39 firm cohorts, 200
projects per firm through the GUI-only runner), per the charter's campaign
design and the experiment protocol.
