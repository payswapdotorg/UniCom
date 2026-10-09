# Post-V3 Real-World Validation and Resilience — Final Report (G4)

Date: 2026-10-09
Program: Post-V3 Real-World Validation and Resilience
Progress authority: `docs/development-state/post-v3-validation-state.json` (this report's summary is bound there)
Prior phase: V3 `PROGRAM_COMPLETE_CERTIFIED` (untouched and immutable, as required)

## 1. The verdict

**The follow-up phase executed all three work orders end-to-end with every
result reconciled and every claim evidence-bound.** The gates G0–G2 are
COMPLETE; G3's acceptance substance is delivered (every declared scenario maps
to an observed result; tests rerun from the merged lineage: **1,692/1,692**);
this report is G4. The phase's defining finding is honest and structural:

> **The commerce experience surfaces have no rendered UI.** The product's
> reachable rendered surface is the ZCode agent connect wall (three auth
> buttons, zero commerce markers in the DOM — real chromium evidence,
> 32-marker scan, all false). The 19-family commerce journey registry exists
> as typed view contracts + runtime constructors
> (`packages/experience/src/surfaces/*.ts`) with **zero non-test consumers**.
> The V3 certification's "fixture level of simulation" caveat is now
> precisely characterized: the fixture harness was not a shortcut — there is
> nothing rendered to shortcut to.

Everything else in this report is read in that light: the resilience and
comparator dimensions completed at the contract/evidence level; the
rendered-browser dimension completed as an evidence-backed absence proof with
the exact missing prerequisite documented.

## 2. The work record

| WO | Scope | Verdict | Merged | Evidence |
|---|---|---|---|---|
| W1-010 | Rendered-browser commerce journey validation (G0+G1) | ACCEPT | 9b785b4 | Real chromium 153.0.8010.12 / Playwright 1.63.0; 19-family × S/M/L first-discovery walk = **57/57 ALL ABSENT, zero drift**; 13 artifacts + manifest + reproducible runner + 39 tests |
| W2-010 | GUI-visible resilience, authority, recourse | ACCEPT | 86d8d93 | **11 families / 63 scenarios ALL PASS** (21 expected-success + 42 expected-block); 7 invariants proven; matrix + oracle + adapters + results + registers |
| W3-014 | Commerce incumbent evidence + human-validation readiness | ACCEPT | d531ea1 | **28 incumbents / 73 observations, A0/B11/C51/D11**; frozen task pack (19 capabilities → journey registry); 19 workflow tables; gap register; PREPARE-ONLY study package |

Merged-lineage battery (commit 86d8d93): experience **728/728** + commerce
**405/405** + agent **559/559** = **1,692/1,692** (V3-era baseline 1,590 +
102 additive, zero regressions); lint 99w/0e (baseline); architecture 0
violations; typecheck differentially identical to the pristine base (40
pre-existing environmental errors in agent test support — unbuilt workspace
dists; zero new from this phase).

## 3. What was actually established (by dimension)

### 3.1 Rendered-browser journeys (W1-010 — evidence of absence)

- The browser genuinely launched and painted the application
  (`document.title = "ZCode - Web + Server"`; screenshots + console logs
  committed).
- The ordinary landing surface is the ZCode agent connect wall: "Connect to
  Z.ai / Connect to BigModel / Use API key" — no navigation, no commerce
  vocabulary, **all 32 commerce markers false** on every examined surface
  (root, onboarding panel, share pages).
- **All 19 journey families are ABSENT from the rendered UI** (19 × 3 firm
  profiles = 57 attempts, zero drift, GUI-only law held: no deep links, no
  API/DB shortcuts, `guiOnlyProof.violations = []`).
- The desktop Electron app is environment-blocked here (no electron binary;
  verification recorded) — and independently, the desktop renderer mounts the
  agent workspace with **no @unicom/\* imports**, so the §10 outcome would be
  unchanged.
- **The exact missing prerequisite:** a rendered host UI for the
  experience-plane surfaces (React components / host registration rendering
  the typed view contracts inside a reachable shell). Building it is a
  product-scope decision the operator owns; this phase was not authorized to
  build product UI.

### 3.2 Resilience, authority, recourse (W2-010 — contract-level, all green)

All 63 scenarios across 11 families pass against the REAL runtimes
(CommerceKernel, journey dispatch, offline queue, weighted pricing, sanitizer,
policy engine, GroupBuy formation engine), driven through the typed view
contracts a rendered UI would consume. The seven invariants hold with proofs:
UNKNOWN never silently becomes failure or success; no pending state is
presented as settled; no side effects without explicit authority (approvals,
merchant authorization, per-leg TradeCycle consent, refund bands, connector
scopes); predictions never mutate canonical truth; repeated submissions
create no duplicate effects. Every result is honestly labelled
`fixture-contract` — the browser-labelled rerun is the follow-up once the
rendered UI exists (the matrix, oracles, adapters and evidence format are
already in place for it).

### 3.3 Competitor evidence (W3-014 — inspectable, classed, honest)

73 observations across 28 incumbents, every claim pointing to a committed
capture + verbatim quote + explicit class (A0 — no accounts exist, honestly;
B11 — public-UI content observation with per-record no-interaction limitation
(TL ruling: B stands); C51 — official documentation; D11 — inaccessible,
never treated as proof of absence). 19 workflow-level comparison tables (no
aggregate winner; UNiCOM's rows honestly contract-level). The gap register
covers all 13 industries × 19 capabilities; blocked items are blocked-listed
(A-class account access, site access, study authorization, environment).

### 3.4 Human-validation readiness (W3-014 — prepared, not executed)

The study package is complete for operator review: recruitment criteria,
13-industry × 3-strata sampling plan, 18 task cards mapped to the frozen task
pack, consent/screener materials, bias register, withdrawal process,
privacy/retention, denominators + missing-data plan. **Nothing was recruited,
contacted or recorded** — the package is PREPARE-ONLY pending operator
authorization, consent approval and the rendered-UI prerequisite.

## 4. The blocker / remediation register (consolidated)

From W2-010's register + W1-010's findings + W3-014's blocked list:

| # | Item | Severity | Owner |
|---|---|---|---|
| 1 | The rendered commerce UI does not exist (the phase-defining finding) | Critical (product scope) | **Operator decision** — authorize or decline building the rendered host UI for the experience plane |
| 2 | Browser-labelled resilience reruns await that UI | High (structural) | Follow-up program post-#1 (the 63-scenario matrix + evidence format are ready) |
| 3 | Desktop app not launchable in this sandbox (no electron binary; RAM/disk ceiling) | Medium (environment) | Environment/infra decision; the runner's `--base-url` mode applies to any provisioned staging target unchanged |
| 4 | A-class competitor evidence requires accounts (free trials listed) | Medium (access) | **Operator authorization** to create accounts |
| 5 | 10 class-D site-access blocks could convert to B/C via a JS-rendering pass | Low | Follow-up (agent-browser retry, no accounts needed) |
| 6 | Authenticated web-shell interiors untested (OAuth/API-key provisioning) | Low | **Operator-owned** account provisioning |
| 7 | Rendered-UI state vocabulary must keep preserved non-failure states (OVERDUE, ATTEMPTED, settlement UNKNOWN, NOT_PROMOTED_UNKNOWN) distinct from failures | Medium (design) | The rendered-UI program (P2 in W2-010's proposals) |

## 5. The next-step decision (concise)

**Recommended:** the operator decides on the rendered commerce UI (blocker
#1). Every downstream capability — browser-journey validation, the
browser-labelled resilience rerun, the human-validation study (whose task
scripts presuppose a visible product) — is bounded by that one decision. The
repository is ready for it: the typed surface contracts, the journey
registry, the 63-scenario resilience matrix with oracles and adapters, the
W1-010 browser runner + evidence format, the frozen competitor task pack and
the PREPARE-ONLY study package are all committed and reusable unchanged.

**If the operator declines the rendered UI**, the honest state of record is:
the commerce capability is contract-complete and invariant-safe (proven at
the fixture level), the rendered product is the ZCode agent workspace, and
every commerce journey remains ABSENT for real-browser purposes — the
certification caveats of V3 stand as the permanent characterization.

## 6. Category truthfulness (per the handoff's reporting law)

- Green ticks above are only for independently evidenced completion (the TL
  inspected evidence: the Alibaba capture vs the ledger quote; the probe DOM
  snapshots vs the marker scans; the matrix oracles vs the test assertions;
  the merged-lineage battery re-run from scratch).
- The vehicle honesty standard: W3-014 was subagent-delivered; W1-010 and
  W2-010 were completed via **TL-executed local-chain recovery** after four
  subagent backend failures — disclosed in both completion reports and the
  state dispatch_log.
- Verified actual-browser findings, comparator evidence classes,
  fixture-level evidence, synthetic outputs and operator-owned actions are
  kept separate throughout this report.
- V3 certification remains COMPLETE and unchanged; no production deployment,
  live commerce mutation or real-person research occurred or was authorized.
