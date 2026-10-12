# W4-024 — Deployment Integrity IV: the Fixture-Mirror Update (the operator surface mirrors the REAL-dist artifact)

**Lane:** Deployment Integrity IV (the fixture-mirror update)
**Branch:** `work/w4-024` @ final SHA (pushed: yes)
**Branched from:** `origin/main` (`43ca918` — post-W3-023 merge + the TL's REAL-dist evidence commit `210b8b9`)

## 1. BRANCH

`work/w4-024` @ final SHA (pushed: yes)

## 2. THE MIRROR-FIDELITY SELF-CHECK (each value: fixture == artifact, verbatim)

Programmatically verified — each value read from the artifact at `packages/experience/reports/deployment/deployment-readiness.json` on my tree and confirmed present verbatim in the fixture source:

| Value | Artifact (at 210b8b9 / lineage b7ab4c0) | Fixture | Status |
|---|---|---|---|
| `generatedAt` | `2026-10-12T14:53:38.280Z` | `2026-10-12T14:53:38.280Z` | **PASS** |
| `lineage.commit` | `b7ab4c07f3edd6a039fe8964e0c176ad32e58b98` | `b7ab4c07f3edd6a039fe8964e0c176ad32e58b98` | **PASS** |
| `bundle.inventorySummary.inventoryDigest` | `sha256:3a8de191d6972b87` | `sha256:3a8de191d6972b87` | **PASS** |
| `dist.mode` | `ci-evidence-manifest` | `ci-evidence-manifest` | **PASS** |
| `dist.digest` | `sha256:0508acfe8e87a989` | `sha256:0508acfe8e87a989` | **PASS** |
| `dist.fileCount` | `6204` | `6204` | **PASS** |
| `dist.provenance.source` | `ci-evidence` | `ci-evidence` | **PASS** |
| `dist.provenance.lineage` | `b7ab4c07f3edd6a039fe8964e0c176ad32e58b98` | `b7ab4c07f3edd6a039fe8964e0c176ad32e58b98` | **PASS** |

**ALL 8 VALUES MIRROR VERBATIM.** The fixture now carries the REAL canonical-build CI evidence (run 38259561304, commit 29f037d — 6,204 files), not the fixture-labelled snapshot. The mode chip renders **CI-EVIDENCE** (provenance.source `"ci-evidence"`); the CHAIN VERIFIED chip renders (all 3 dist checks PASS in the mirrored verification array).

## 3. VERIFICATION (personally run, exact numbers)

| Check | Command | Result |
|---|---|---|
| Web vitest | `pnpm --filter @zcode/web exec vitest run` | **392 passed** (36 files) — baseline 392, 0 net-new (the 2 updated assertions pin the new values) |
| Scoped tsc | `tsc --noEmit -p tsconfig.scoped.json` (from packages/web) | **EXIT 0** |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — exact baseline, 0 new warnings |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |

## 4. HONEST GAPS

1. **The `as const` on the fixture narrows `dist.provenance.source` to the literal `"ci-evidence"`, which made TypeScript flag the `=== "committed-fixture"` comparison in SystemSurface.tsx (line 249) as unreachable (TS2367 — the types have no overlap).** The fix: a type annotation in the fixture widening `source` to the union `"ci-evidence" | "dist-root-walk" | "committed-fixture" | "source-only"` (matching the `DistSection` interface in bundle-definition.ts). This is a type-level annotation in the fixture (my write surface) — the chip logic in SystemSurface.tsx is unchanged (the `committed-fixture` branch is dead at runtime but remains type-valid; the chip renders "CI-EVIDENCE" because `provenance.source === "ci-evidence"` and `mode === "ci-evidence-manifest"`). The work order forbids changing the chip/chain logic — this annotation preserves the logic without modification.

2. **No new tests added.** The 2 existing test assertions (the mode-chip test + the fixture-fidelity test) were updated to pin the new values (CI-EVIDENCE instead of FIXTURE; the new digest/fileCount/provenance). The rest of the test suite references the fixture dynamically (via `DEPLOYMENT_READINESS_FIXTURE.*`), so they follow the fixture change automatically.

## 5. BOUNDARIES HELD

- **Write surface (exactly the ordered files, no others):**
  - `packages/web/src/commerce-host/shell/fixtures/deployment-readiness-fixture.ts` — the 8 mirrored values updated + the provenance header comment + the type annotation
  - `packages/web/src/commerce-host/shell/SystemSurface.test.tsx` — 2 test assertions updated (the mode-chip test name + expectation; the fixture-fidelity assertions)
  - `docs/work-orders/reports/W4-024-completion-report.md` — this report
- **NEVER touched** `packages/experience/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`, `SystemSurface.tsx` (the chip/chain logic unchanged — only a type-level annotation in the fixture).
- **NEVER fabricated a value** — every value read from the artifact on my tree and copied verbatim (programmatically verified).
- **The kill switch `DEPLOYMENT_READINESS_SECTION_ENABLED`** unchanged. Every existing row/behavior unchanged.
- **No provider names.** No new dependencies. Token never committed. Pushed only to `work/w4-024`.
