# V3 Simulation Runner — `docs/simulations/runner/`

Owner: **Worker 3** (lane `gui-only-browser-runner-evidence`, branch `work/w3-009`).
Source work order: [`docs/work-orders/W3-009.md`](../../work-orders/W3-009.md).
Program directive: [`docs/FINAL-TL-HANDOFF-V3-SIMULATIONS-2026-10-09.md`](../../FINAL-TL-HANDOFF-V3-SIMULATIONS-2026-10-09.md).
Method: [`docs/simulations/V3-EXPERIMENT-PROTOCOL.md`](../V3-EXPERIMENT-PROTOCOL.md).
Cohorts: [`docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md`](../V3-INDUSTRY-AND-COMPETITOR-MATRIX.md).

This directory holds W3-009's runner design + integration contracts + pilot
evidence. The runner code lives under `packages/experience/src/sim/`; the
tests under `packages/experience/test/sim/`; the pilot evidence artifacts
under `packages/experience/reports/sim/` and `docs/simulations/runner/reports/`.

## What the runner is

A **GUI-only browser runner** that proves a user can discover and complete
UNiCOM capabilities through the ordinary GUI. It starts at the public
homepage or ordinary role landing view, discovers workflows ONLY via visible
navigation / universal intent / onboarding / contextual opportunity, and
completes tasks through real clicks, keyboard, form controls and visible
approvals. It never satisfies a task via direct API/service/DB/hidden-route
actions (the GUI-ONLY law, [`NON-NEGOTIABLE LAWS`](#non-negotiable-laws) §1).

The runner drives the **REAL experience-plane runtimes** — the same
Connector Runtime, Commerce Kernel lane, Live Session runtime, Universal
Intent resolver, Decision Card renderer, Surface State runtime,
Observability Projector, Local Commerce Edge and Physical Journey runtime
the production code path uses. No surface under test is mocked. This
matches the W3-006 e2e harness pattern; W3-009 extends it with
journey-evidence capture, deterministic campaign scheduling, multi-role
access-control tests, no-RFID supermarket GUI paths, failure-variant
journeys and the S+M+L pilot cohorts.

## Files

| File | Purpose |
| --- | --- |
| [`JOURNEY-EVIDENCE-SCHEMA.md`](./JOURNEY-EVIDENCE-SCHEMA.md) | **First-push** — the journey-evidence record SCHEMA (the typed contract every journey writes). |
| [`RUNNER-INTEGRATION-CONTRACTS.md`](./RUNNER-INTEGRATION-CONTRACTS.md) | **First-push** — the W1/W2 contract surface this runner consumes (read-only — never creates new capability vocabulary). |
| [`CAMPAIGN-CONFIG.md`](./CAMPAIGN-CONFIG.md) | Campaign config surface: 200 projects/firm, scheduling, baseline/holdout seed namespaces, S+M+L pilot cohorts, count reconciliation rule. |
| [`PILOT-COHORTS.md`](./PILOT-COHORTS.md) | The S+M+L pilot cohort definitions and pointers to evidence artifacts. |
| [`ZERO-ORPHAN-FEATURE-MATRIX.md`](./ZERO-ORPHAN-FEATURE-MATRIX.md) | Every `FEATURE_MATRIX` row mapped to a discoverable surface + actual GUI journey or marked `FAIL`/`ABSENT` (the zero-orphan law). |
| [`reports/pilot/`](./reports/pilot/) | Pilot evidence artifacts (machine-readable JSON). |

## Non-negotiable laws

1. **GUI-ONLY** — `not discoverable means ABSENT`, even if backend tests pass.
   A hidden route, direct API, internal tool call, direct service invocation
   or DB manipulation NEVER counts as task completion.
2. **Evidence for every journey** — including failures, blocked journeys and
   UNKNOWN outcomes. Missing evidence is not PASS.
3. **No fabricated competitor UI observations** — unavailable real UI
   performance stays `UNKNOWN`. Competitor evidence class `D` is excluded
   from performance/superiority claims.
4. **Setup/reset ONLY as declared preconditions** — outside the timed
   journey; never counted as task success; never fabricating outcomes.
5. **No production purchases/mutations/live accounts** — no credentials or
   screenshots with sensitive values in evidence stores.
6. **V1/V2 registries immutable** — never edit ANY state file
   (`v3-simulation-state.json` is TL-only).
7. **Write surface** — `docs/simulations/runner/**` + additive code/tests
   under `packages/experience/**`. Do NOT touch `packages/commerce/**`
   scenario surfaces (W1), `packages/agent/**` persona surfaces (W2),
   `docs/work-orders/**`, or any state file.

## Pilot law (gate before full campaign)

At least one complete **small + medium + large** cohort runs end-to-end with
evidence BEFORE the full 7,800-project campaign launches. The full campaign
counts must reconcile:

```
planned = executed + blocked + skipped
```

Skipped/blocked never disappear from the denominator (the count-reconciler
enforces this — see [`CAMPAIGN-CONFIG.md`](./CAMPAIGN-CONFIG.md)).

The pilot cohort evidence pointers live in
[`reports/pilot/pilot-summary.json`](./reports/pilot/pilot-summary.json) and
the same artifact is mirrored at
`packages/experience/reports/sim/pilot-summary.json` for the test battery.
