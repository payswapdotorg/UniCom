# Campaign Configuration (W3-009)

**Status**: PUBLISHED. The campaign-config surface the runner implements.
Authoritative for the S+M+L pilot cohorts AND the planned full 7,800-project
campaign (which launches only after the TL accepts the pilot).

The TypeScript surface lives at
`packages/experience/src/sim/campaign-scheduler.ts` and
`packages/experience/src/sim/count-reconciler.ts`.

## 1. Campaign shape

| Field | Value | Source |
| --- | --- | --- |
| `industries` | 13 | `V3-INDUSTRY-AND-COMPETITOR-MATRIX.md` |
| `firmSizes` | `["small", "medium", "large"]` | W1-009 + state file |
| `firms` | 39 (13 industries × 3 sizes, exactly one firm per cell) | W1-009 acceptance §1 |
| `projectsPerFirm` | 200 | W1-009 acceptance §2 |
| `totalProjectRuns` | 7,800 (39 × 200) | state file `campaign_design.project_runs` |
| `syntheticProfessionals` | 15,275 | W2-009 acceptance §2 |
| `journeyFamilies` | 19 (the §10 registry) | `JOURNEY-EVIDENCE-SCHEMA.md` §3 |
| `baselineRequired` | true | state file `campaign_design.baseline_required` |
| `heldOutFinalRunRequired` | true | state file `campaign_design.held_out_final_run_required` |
| `minimumFullImprovementCycles` | 2 | state file `campaign_design.minimum_full_improvement_cycles` |

## 2. Pilot cohorts (S+M+L end-to-end — the pilot law)

Before the full campaign launches, exactly one **small**, one **medium**
and one **large** cohort runs end-to-end with evidence. The pilot cohorts
are deterministic subsets of the full 7,800-project schedule, NOT separate
projects. The full campaign inherits the same project ids + seeds; the
pilot simply executes the first N projects per cohort.

| Cohort | Size class | Firms | Projects per firm | Total project runs | Seed namespace |
| --- | --- | --- | --- | --- | --- |
| `pilot-S` | small | 1 | 12 | 12 | `pilot-S-baseline` |
| `pilot-M` | medium | 1 | 24 | 24 | `pilot-M-baseline` |
| `pilot-L` | large | 1 | 48 | 48 | `pilot-L-baseline` |
| **Pilot total** | — | 3 | — | **84** | — |

The pilot covers ALL 19 journey families at least once per cohort (with
the role-appropriate sampling — see W2's persona contract). The pilot
firm selection rotates across industries per cycle so the same industry
isn't always piloted (anti-overfitting — protocol §7).

For the W3-009 wave, the pilot firms are:
- `pilot-S`: industry `retail-ecommerce`, size `small` (firm id `firm-retail-S-1`)
- `pilot-M`: industry `manufacturing-supply-chain`, size `medium` (firm id `firm-manuf-M-1`)
- `pilot-L`: industry `grocery-supermarket-no-rfid`, size `large` (firm id `firm-grocery-L-1`)

The grocery/supermarket cohort is the no-RFID GUI path pilot (W3-009 §scope:
"no-RFID supermarket GUI paths: POS/file import, barcode/camera count,
weighted item, offline observation queue, receiving and reconciliation").

## 3. Scheduling determinism

The scheduler produces a `CampaignSchedule` for any `(experimentId, cohortId)`
pair. The schedule is byte-identical across re-runs with the same inputs
(protocol §7 anti-overfitting: disjoint baseline/holdout seed namespaces).

```ts
interface CampaignSchedule {
  readonly experimentId: string;          // "v3-baseline" | "v3-improvement-1" | ...
  readonly cohortId: string;               // "pilot-S" | "pilot-M" | "pilot-L" | "v3-baseline"
  readonly seedNamespace: string;          // disjoint baseline/holdout
  readonly generatedAt: string;            // UTC ISO-8601 (deterministic — clock injected)
  readonly buildCommit: string;
  readonly projects: readonly ScheduledProject[];
  readonly journeyFamilySampling: JourneyFamilySampling;   // which families × which roles per cohort
  readonly totalPlanned: number;            // projects.length
}

interface ScheduledProject {
  readonly projectId: string;              // stable W1 id
  readonly firmId: string;                 // stable W1 id
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly personaIds: readonly string[];   // stable W2 ids (≥1 per role family applicable)
  readonly seed: string;                    // hex
  readonly journeyFamilies: readonly JourneyFamilyId[];   // applicable subset of the 19
  readonly status: "scheduled" | "executed" | "blocked" | "skipped";
  readonly evidenceRecordId?: string;       // back-pointer when status === "executed"
  readonly blockReason?: string;            // when status === "blocked" or "skipped"
}
```

`status` transitions are append-only. A scheduled project can move to
`executed`, `blocked` or `skipped`; never back. The scheduler's
determinism contract: **same `(experimentId, cohortId, seedNamespace)`
produces byte-identical schedules across re-runs**, modulo the
`generatedAt` timestamp (which is injected via the clock and recorded
separately for drift detection).

## 4. Count reconciliation (the pilot law's denominator invariant)

```
totalPlanned = executed + blocked + skipped
```

Skipped/blocked NEVER disappear from the denominator (W3-009 acceptance §9).
The count-reconciler enforces this for every cohort + the overall campaign.
A cohort report that fails reconciliation is a hard failure — the pilot is
not accepted.

```ts
interface CountReconciliationReport {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly totalPlanned: number;
  readonly executed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly reconciled: boolean;            // executed + blocked + skipped === totalPlanned
  readonly drift: number;                  // totalPlanned - (executed + blocked + skipped); 0 when reconciled
  readonly byJourneyFamily: readonly {
    readonly journeyFamilyId: JourneyFamilyId;
    readonly planned: number;
    readonly executed: number;
    readonly blocked: number;
    readonly skipped: number;
  }[];
  readonly byOutcome: {
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly absent: number;
    readonly unknown: number;
  };
}
```

## 5. Deployment isolation

The pilot + full campaign run ONLY against the local-dev fixture
deployment target (`deploymentTarget: "local-dev-fixture"`). No production
purchases, no live accounts, no provider credentials, no live payment rails
(law §5). The runner's local dev fixture at
`packages/experience/src/sim/local-fixtures.ts` provides:

- 3 pilot firms (one per cohort) with their project manifests (12 + 24 + 48 projects).
- Synthetic personas for each firm (one per applicable role family).
- Synthetic connector instances (Shopify, eBay, Amazon SP-API, Jumia, Depop,
  Whatnot, browser-only, POS-import, feed-file, USB/serial/LAN) all in
  `disconnected` or `unknown` state — never live.
- A frozen score schema (W2 contract) with weights frozen before baseline.

When W1-009 and W2-009 land on main, the local dev fixture is replaced by
loaders for `packages/commerce/src/scenario/manifest.ts` and
`packages/agent/src/adoption/persona.ts` without changing the runner
contract surface.
