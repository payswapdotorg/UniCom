# W1-009 — Industry Project, Procurement and Outcome Scenario Portfolio

This directory is **Worker-1's write surface** for the V3 Cross-Industry Simulation
program. It contains the deterministic scenario portfolio consumed by:

- **W2 (personas/benchmarks)** — reads `manifest.json`, `industries.json`,
  `roles.json`, `journey-families.json` to assign synthetic personas to firm
  cohorts and benchmark incumbents against the same task goals.
- **W3 (GUI-only runner)** — reads each project's `outcomeOracle` to learn the
  task goal, the required GUI-facing interaction surface, and the
  post-journey assertions it must satisfy. **W3 marks the journey successful;
  fixtures never do.**

## Authoritative surfaces

| File | Purpose |
|---|---|
| `SCHEMA.md` | Human-readable contract for W2/W3 consumption. |
| `scenario-manifest.schema.json` | JSON Schema for a single `ProjectManifest`. |
| `outcome-oracle.schema.json` | JSON Schema for a single `OutcomeOracle`. |
| `seed-namespaces.schema.json` | JSON Schema for the baseline/holdout split. |
| `manifest.json` | Top-level portfolio manifest: counts, seed namespaces, generator version. |
| `industries.json` | 13 industries × 3 sizes = 39 firm-cohort descriptors. |
| `roles.json` | ≥8 role families per industry; role-mix table. |
| `journey-families.json` | 19 mandatory journey families × industry applicability matrix. |
| `no-rfid-coverage.json` | Weighted grocery/no-RFID journey assignments per W3-004. |
| `README.md` | This file. |

The 7,800 per-project manifests themselves are **generated** by
`packages/commerce/src/test/w1-009/portfolio/generator.ts` from compact
deterministic descriptors. The generator is reproducible: identical seed ⇒
byte-identical manifest set. The enumeration reconciles to exactly 7,800
(`13 industries × 3 sizes × 200 projects`). The contract test
`portfolio-reconciliation.test.ts` asserts that reconciliation at every test
run.

## Laws (binding)

1. **Deterministic.** Canonical commerce state is reproducible from seeds. No
   `Date.now()`, no `Math.random()` — only `seededRng(seed)`.
2. **Commerce workloads only.** A synthetic firm may have a complex project,
   but the manifest models only the commerce inside that project (supplier
   discovery, purchasing, quotes, receiving, substitutions, returns,
   approvals, evidence). No general PM/engineering/clinical/dispatch/creative/
   legal operations are scored.
3. **Architecture is frozen.** All code under `packages/commerce/src/test/w1-009/**`
   is additive test/fixture code. No commerce-kernel semantic changes.
4. **No float money.** All money values are integer minor units (BigInt-safe).
5. **Twin/prediction stays non-authoritative.** Predictive entries in the
   oracle are tagged `predictive: true` and never asserted as canonical.
6. **Fixtures never mark journeys successful.** An `OutcomeOracle` only
   asserts expected *post-journey* state. Whether the journey itself succeeded
   is determined by the W3 GUI runner performing the task and the W2 adoption
   instrument scoring the result.
7. **V1/V2 registries immutable.** This portfolio never edits
   `docs/development-state/v1-work-order-state.json`,
   `docs/development-state/v2-work-order-state.json`, or
   `docs/development-state/v3-simulation-state.json` (TL-only).

## Generator entrypoint

```ts
import { generatePortfolio } from "@unicom/commerce/test/w1-009/portfolio/generator.js";

const portfolio = generatePortfolio({
  namespace: "baseline", // "baseline" | "holdout"
  industries: "all",    // "all" or a single industry id
  sizes: ["small", "medium", "large"],
  projectsPerFirm: 200,
});

// portfolio.manifests.length === 7800 (when namespace=all is not used; baseline+holdout = 15600)
```

The generator is **pure**: same inputs ⇒ identical output bytes (validated by
`canonicalJson` from the commerce kernel).
