# Runner Integration Contracts (W3-009 first push)

**Status**: PUBLISHED (first push of `work/w3-009`).

This is the **W1/W2 contract surface** the GUI-only runner consumes.
W3-009 NEVER creates new capability vocabulary (law §7) — it reads the
contracts W1-009 and W2-009 publish and emits evidence under
[`JOURNEY-EVIDENCE-SCHEMA.md`](./JOURNEY-EVIDENCE-SCHEMA.md).

The TypeScript surface lives at
`packages/experience/src/sim/w1-w2-contracts.ts`. The runner imports from
there only. The consumed files are read-only contracts.

## 1. W1-009 — project manifests + outcome oracle

W1-009 owns the deterministic synthetic scenario portfolio. The runner
consumes:

| Contract | Source (W1) | Consumed by runner as |
| --- | --- | --- |
| `W1IndustryMatrix` | `packages/commerce/src/scenario/industry-matrix.ts` | `W1_INDUSTRY_MATRIX` (13 industries × 3 sizes × 39 firms) |
| `W1FirmManifest` | `packages/commerce/src/scenario/firm-manifest.ts` | `W1FirmManifest` (200 projects/firm, deterministic seed) |
| `W1ProjectManifest` | `packages/commerce/src/scenario/project-manifest.ts` | `W1ProjectManifest` (project id, purchasing list, budget, deadline, approvals, substitutions, delivery, returns/recourse, required evidence) |
| `W1OutcomeOracle` | `packages/commerce/src/scenario/outcome-oracle.ts` | `W1OutcomeOracle` (assertions checked AFTER the GUI journey only) |
| `W1ScenarioManifest` | `packages/commerce/src/scenario/manifest.ts` | the top-level scenario manifest (39 firms, baseline/holdout namespaces) |

### Hard rules for the runner

- The runner consumes W1's stable project ids, deterministic seeds and
  outcome oracle assertions. It NEVER calls a W1 service to manufacture a
  successful outcome (law §1, §4).
- Outcome oracle assertions are checked AFTER the GUI journey only
  (`commerceAssertionRefs.checkedAfterJourney === true`). The runner
  refuses to attach a pre-journey assertion as journey success evidence.
- A W1 fixture or oracle cannot mark a user journey successful — it can
  only assert expected state after the GUI runner performed the task.

### When W1-009 is not yet merged at base

W3-009 dispatched in parallel with W1-009 from base `5958ebc`. If the W1
artifacts are not yet at base, the runner consumes a **self-declared local
dev fixture** (`packages/experience/src/sim/local-fixtures.ts`) covering
the same contract shape with synthetic firms/projects/oracle entries. The
fixture is explicitly labelled `localDevFixture: true` and is replaced by
a loader for the real W1 artifact when W1-009 lands on main. This mirrors
the W3-008 self-regeneration pattern (see W3-008 completion report
deviation §1).

## 2. W2-009 — personas + incumbent baselines + adoption score schema

W2-009 owns the synthetic professional personas and the adoption
measurement contract. The runner consumes:

| Contract | Source (W2) | Consumed by runner as |
| --- | --- | --- |
| `W2Persona` | `packages/agent/src/adoption/persona.ts` | `W2Persona` (15,275 seeded personas; role seniority, tool familiarity, budget sensitivity, risk tolerance, switching appetite, compliance sensitivity, connectivity constraints, training capacity, main-interface preference) |
| `W2IncumbentStack` | `packages/agent/src/adoption/incumbent-stack.ts` | `W2IncumbentStack` (commerce-only; evidence class A/B/C/D) |
| `W2AdoptionScoreSchema` | `packages/agent/src/adoption/score-schema.ts` | `W2AdoptionScoreSchema` (frozen weights + thresholds) |
| `W2AdoptionInstrument` | `packages/agent/src/adoption/instrument.ts` | the post-task adoption instrument (questions from protocol §5) |

### Hard rules for the runner

- The runner consumes W2's stable persona ids, role assignments and the
  frozen score schema. It NEVER re-weights or merges the A/B/C labels into
  a single adoption metric (law §5 — adoption metric separation).
- The `PostTaskAdoptionResponse` in the journey-evidence record is filled
  by invoking W2's `W2AdoptionInstrument` — never by hand-tuning the
  persona to prefer UNiCOM (W2 law §7).
- Persona `syntheticEstimateLabel === true` is the hard boolean in every
  record (the human-willingness-not-inferred gate).

### When W2-009 is not yet merged at base

Same self-regeneration pattern as W1: a local dev fixture at
`packages/experience/src/sim/local-fixtures.ts` covers the W2 contract
shape with synthetic personas, an incumbent stack and a frozen score
schema. Replaced by a loader when W2-009 lands on main.

## 3. Contracts the runner PUBLISHES (consumed by W1/W2 + TL)

The runner publishes its own evidence contract surface so W1, W2 and the
TL can read journey results back without coupling to runner internals:

| Published contract | Path | Consumed by |
| --- | --- | --- |
| `JourneyEvidenceRecord` | `packages/experience/src/sim/journey-evidence.ts` | W2 (adoption scoring) + TL (campaign report) |
| `JourneyFamilyId` (19 ids) | `packages/experience/src/sim/journey-registry.ts` | W1 (project manifest maps applicable journey families), W2 (journey coverage per persona) |
| `PilotSummaryReport` | `packages/experience/src/sim/cohort-pilot.ts` | TL (pilot law acceptance) |
| `ZeroOrphanFeatureMatrixMap` | `packages/experience/src/sim/zero-orphan-map.ts` | TL (zero-orphan law) |
| `CountReconciliationReport` | `packages/experience/src/sim/count-reconciler.ts` | TL (planned = executed + blocked + skipped) |
| `CampaignSchedule` | `packages/experience/src/sim/campaign-scheduler.ts` | W1 (project schedule), W2 (persona schedule), TL (campaign launch gate) |

The runner NEVER edits W1/W2 source files. The runner NEVER edits
`v3-simulation-state.json` (TL-only).

## 4. Build / seed identifier recording

Per W3-009 acceptance criterion §5 ("The runner consumes stable W1/W2
scenario ids and records build and seed identifiers"), every
`JourneyEvidenceRecord` carries:

- `buildCommit` — git sha at run time (read from `process.env.GIT_SHA` or
  `git rev-parse HEAD` at runner init; falls back to the constant
  `"unknown-commit"` if neither is available — never an empty string).
- `deploymentTarget` — `"local-dev-fixture"` for the pilot; the full
  campaign config declares per-cohort deployment targets (always local-dev
  isolated; never production).
- `deterministicSeed` — hex; reproduced exactly by the scheduler for the
  same `experimentId` + `cohortId` + `projectId`.
- `experimentId` — `"v3-baseline"` for the pilot; `"v3-improvement-1"`,
  `"v3-improvement-2"`, `"v3-held-out-final"` for subsequent cycles.

The build/seed identifiers are written to the pilot summary report and
reconciled against the scheduler's planned schedule — drift is a hard
failure (the count-reconciler enforces it).
