# W1-026 Completion Report — UNiCOM Product Home and Buyer/Merchant First Journeys

- **Work order:** W1-026 (phase: Default UNiCOM Experience, tracking issue #22)
- **Owner lane:** Worker 1 — Commerce Truth / Economic Execution
- **Dispatch baseline:** `main` @ `82d2d68ec465c19bd177a7567ba5b676843b5ece` (verified: `16bd4680073fed0a3c36ef61a39d270b95872d17` is an ancestor of the dispatch baseline; branch created from `82d2d68`)
- **Delivered branch:** `work/w1-026` (pushed; NEVER touched `main`)
- **Delivered branch tip (code):** `3b98c4d49cf464c269318cd41a821f018c114123` — the commit the browser evidence manifest records as its clean build identity
- **Delivered branch tip (final):** the commit that adds this report (the report and this file only; all code and evidence precede it — see the commit map in §6)

## 1. What was delivered

The commerce host home (`/commerce`) is now a role-aware UNiCOM front door instead of a reference/status index, and the two first journeys were upgraded to carry it. Everything reuses the existing host, module registry, role model and frozen public contracts — no restart, no static marketing pages, no new host.

1. **Front door (HomeSurface + HomeSurfaceParts + 11 tests).** A first-time buyer immediately sees the Buyer Intent Canvas path: the shared scenario draft as a mini canvas, the six essentials it understands explained in plain language (deadline, total-cost limit, quality, trust/privacy, delivery/pickup, acceptable substitutes), and a one-click primary CTA to the canvas. A merchant immediately sees the Command Center path: honest current business state, active work/proposals, and high-value next actions. The default emphasis respects the selected role (published `set-active-role` action, held roles only); switching emphasis visibly never changes identity or grants authority. A three-truths strip keeps authoritative operational state, provider/physical observations and model predictions distinct. The 19-journey registry moved into a collapsed `<details>` whose summary carries the honest registry-derived count — one click away, no longer dominating the first screen; Explore stays one click away (hero button + header nav).
2. **Buyer Intent Canvas first journey (buyer-intent + 4 tests).** A first-time explainer before the editor; a plain-language help line under every one of the 17 frozen facets (`field-help.ts` — the `INTENT_CONSTRAINT_FIELDS` contract stays the source of truth); an essentials marker on the seven facets buyers start with; the home-canvas draft carry-over stated on the surface. Every facet stays optional.
3. **Compare-offers first journey (buyer-compare + 3 tests).** The comparison now answers *your* intent (draft excerpt + one click back to the canvas; hidden honestly when no intent exists) and teaches the three truth classes it separates before any offer is read.
4. **Merchant Command Center first journey (merchant-storefront + 3 tests).** The J10 module now opens with a Command Center: where the store stands right now (orders / payments-UNKNOWN / returns-in-flight / inventory — all derived live from the seeded deterministic kernel's `view()` projections), work in flight with what each item is waiting for (the in-flight exchange return with its deterministic next step, the UNKNOWN payment preserved verbatim, the queued offline count as a not-yet-canonical observation), and high-value next actions handed off to the real merchant surfaces through the host navigate service. Zero connected integrations stated; no predictions claimed on the surface; the Twin link is labelled predictive.

## 2. Exact commands run and denominators (before / after)

All commands run from the repo root on the delivered branch. "Before" = branch point `82d2d68` (verified before any edit); "after" = delivered branch.

| Check | Exact command | Before | After |
|---|---|---|---|
| Web unit/component battery | `corepack pnpm --filter @zcode/web exec vitest run` | **392 / 392 passed (36 files)** | **413 / 413 passed (37 files)** |
| Scoped web TypeScript | `./node_modules/.bin/tsc -p packages/web/tsconfig.scoped.json` | exit 0, clean | exit 0, clean |
| Lint (repo) | `corepack pnpm lint` | 103 warnings / 0 errors | **103 warnings / 0 errors** (identical denominator; write surface itself 0/0) |
| Architecture check | `corepack pnpm architecture:check` | OK · violations 0 · baseline 0 · new 0 | OK · violations 0 · baseline 0 · new 0 |
| Browser evidence walk | `node packages/web/test/browser/warm-vite-deps.mjs --port 5199` then `node docs/unicom-default-experience/w1-026/run-browser-evidence.mjs --start-env --port 5199` | n/a (new) | **8 / 8 steps PASS** (FAIL 0 · BLOCKED 0 · zero drift); all four requirement outcomes PASS; 25 / 25 evidence pointers resolve |

**Failing-case history (honest).** No committed test ever failed on this branch: every commit was battery-green at commit time. Four assertion mismatches were found and fixed *before* committing the affected tests (all test-side text/count corrections, no production-code change): (1) `delivery` → `delivered` in a buyer-intent help assertion; (2) the essentials-chip count included the intro legend chip (now counts field cards only); (3) the merchant seeded exchange return is REQUESTED (next step AUTHORIZE / REJECT), not AUTHORIZED/SHIP_BACK; (4) the home draft-typing test needed the native prototype setter (React value tracker), matching the repo's existing `fillInput` pattern. One transient lint warning (unused `readFileSync` import in the evidence runner) appeared after the first evidence run and was removed before the report (commit `31840f2`) — final lint denominator is exactly the accepted baseline. Two browser-evidence iterations before the final run: (a) the honest count sentence lived inside the collapsed `<details>` (browsers' `innerText` hides collapsed content) — fixed by carrying the count in the always-visible summary (commit `80c0ccd`); (b) two manifest re-runs so the recorded build identity is clean and matches the committed runner (`3b98c4d`, dirty=false).

## 3. Browser evidence (required gate — real browser, ordinary flow)

Runner: `docs/unicom-default-experience/w1-026/run-browser-evidence.mjs` (reuses the committed W1-011 harness modules `commerce-evidence-env.mjs` / `commerce-evidence-capture.mjs` unchanged). Vite dev server for `@zcode/web` only, headless chromium (playwright 1.57.0), **no ZCode server, no deep links for discovery** (landing `/` → visible "UNiCOM Commerce →" wall button → `/commerce`). Manifest: `docs/unicom-default-experience/w1-026/w1-026-evidence-manifest.json`; per-step PNG + body-text + console evidence under `docs/unicom-default-experience/w1-026/evidence/`.

| Step | Evidence for | Result |
|---|---|---|
| 01 landing connect wall | ordinary surface carries the commerce entry | PASS |
| 02 first-discovery entry click | ordinary flow reaches /commerce (no deep link) | PASS |
| 03 home buyer front door | buyer path leads by default; mini canvas seeded with the scenario draft; six essentials explained; three truth classes; registry collapsed with honest count; Explore one click away; held roles Buyer+Merchant | PASS |
| 04 buyer intent canvas | **(a) first-time buyer path reaching the Intent Canvas**; first-time explainer; per-facet help; home draft carried over; DEMO labelling | PASS |
| 05 emphasis switch to Merchant | **(c) role switching**; merchant path leads; identity/authority unchanged ("You hold: Buyer, Merchant"); emphasis-never-grants-authority note; zero connected integrations; SETTLEMENT-UNKNOWN and NOT-PROMOTED-UNKNOWN preserved | PASS |
| 06 merchant command center | **(b) first-time merchant path reaching the Command Center/store**; kernel-derived stats (3 orders, 1 payment UNKNOWN, 1 open return); work in flight with next step; no predictions claimed; UNKNOWN never paid/failed | PASS |
| 07 emphasis cleared | role switching to neutral; both paths weighted equally; identity unchanged | PASS |
| 08 registry + Explore | 19-row registry expands on one click; Explore reaches the J19 taxonomy in one click | PASS |

Requirement outcomes (manifest `requirements`): `buyerIntentCanvasFirstJourney` PASS · `merchantCommandCenterFirstJourney` PASS · `roleSwitching` PASS · `unknownAndDemoStates` PASS. **(d) explicit UNKNOWN/demo states** are proven twice: on the home merchant card (SETTLEMENT-UNKNOWN "never rendered as paid or failed", NOT-PROMOTED-UNKNOWN, zero connected integrations, DEMO tags) and inside the Command Center (payment UNKNOWN preserved verbatim, DEMO-labelled kernel state).

## 4. Changed files mapped to contract / capability

| File | Contract / capability it serves |
|---|---|
| `packages/web/src/commerce-host/shell/surfaces/HomeSurface.tsx` | The front door composition. Consumes: module registry `resolveJourneyCoverage()` (honest counts, journey routes), contract roles (`commerceRole`, `COMMERCE_ROLE_FAMILIES`), host-state actions `set-active-role` / `update-intent-draft` / `navigate` (published reducer, no new state), host demo fixtures (`DEMO_CONNECTED_INTEGRATIONS`, scenario), `EnvironmentBadge`. W1-011 J19 discovery law preserved (all 19 journey entries + Explore; exact count sentence pinned by `CommerceHostApp.test.tsx`). |
| `packages/web/src/commerce-host/shell/surfaces/HomeSurfaceParts.tsx` (new) | Presentation split of the same surface for the repo's oxlint max-lines gate (same pattern as `merchant-storefront/component-parts.tsx`). Renders the buyer path (mini canvas bound to `scenario.intentDraft`), the merchant path (fixture-derived `LifecycleStateItem`s from `DEMO_STATE_RECORDS`), the emphasis bar, the truth strip, the journey registry row. No new state, no new vocabulary. |
| `packages/web/src/commerce-host/shell/surfaces/HomeSurface.test.tsx` (new, 11 tests) | Pins: both paths render; buyer-leads default; canvas/compare/storefront routes reachable in one click; emphasis switch + clear (identity and held roles unchanged); draft carry-over to the Roles surface; merchant card honesty (zero connected integrations, preserved UNKNOWN/OFFLINE/DENIED); registry collapsed with 19 rows and honest count; Explore one click. |
| `packages/web/src/commerce-modules/buyer-intent/field-help.ts` (new) | Plain-language layer over the frozen `INTENT_CONSTRAINT_FIELDS` catalog (`@unicom/experience` public entrypoint, unchanged). Presentation-only: no contract edit, no new facet, no new vocabulary. |
| `packages/web/src/commerce-modules/buyer-intent/component.tsx` | J1 first journey: first-time explainer, per-facet help, essentials chips, home-draft carry-over note. Same typed catalog rendering, same `PermissionGate` on `intent.create`, same plan-option navigation map (all prior J1 tests pass unchanged). |
| `packages/web/src/commerce-modules/buyer-intent/component.test.tsx` (+4 tests) | First-time explainer; draft carry-over; per-facet help for the W1-026 essentials; optionality. |
| `packages/web/src/commerce-modules/buyer-compare/component.tsx` | J2: intent-context card (`host.scenario.intentDraft` + `host.navigate("/commerce/buyer/intent")`; hidden when empty — honest empty beats fake context) and the three-truths legend (authoritative prices via `lookupPrice` runtime; provider observations with source timestamps; model predictions labelled). |
| `packages/web/src/commerce-modules/buyer-compare/component.test.tsx` (+3 tests) | Intent context + hand-back; truth-classes legend; honest absence without intent. |
| `packages/web/src/commerce-modules/merchant-storefront/command-center.tsx` (new) | The Command Center section. Reads ONLY the deterministic kernel's read-side projections (`KernelView`: `allOrders`, `allReturns`, `allLevels`, `allPaymentIntents`) through the existing seeded runtime, plus `RETURN_TRIGGERS_BY_STATE` (seed.ts) and `LifecycleStateItem`/`StatusChip` shared components. Next actions call `host.navigate` to existing registered routes. Zero new commands, zero canonical mutation. |
| `packages/web/src/commerce-modules/merchant-storefront/component.tsx` | Mounts `CommandCenterSection` as the module's first section (3-line change). |
| `packages/web/src/commerce-modules/merchant-storefront/module.ts` | Nav label → "Merchant command center" (same `moduleId`, `owner: W3-015`, `journeys: ["J10"]`, route `/commerce/merchant/storefront`, status ready). |
| `packages/web/src/commerce-modules/merchant-storefront/component.test.tsx` (+3 tests, `mountWithNav` helper) | Command center honesty (kernel-derived stats, zero connected integrations, no predictions), work-in-flight preservation, next-action hand-offs. |
| `docs/unicom-default-experience/w1-026/**` | Lane evidence only: the browser-evidence runner + per-step PNG/body/console artifacts + vite dev log + zero-drift manifest (see §3). |

**Write surface audit:** `git diff --name-only 82d2d68..HEAD` filtered against the allowed prefixes yields **zero files outside the write surface**. No web/desktop boot entrypoints, no `CommerceHostApp.tsx`, no shared shell CSS/navigation, no W2-owned module files, no package manifests/lockfiles, no architecture contracts were touched. Read-only consumption: `buyer-support/*` and `merchant-shared/*` (W2/W3 lane-shared helpers) are imported but never modified.

## 5. Honesty invariants honored

- UNKNOWN ≠ FAILED everywhere (SETTLEMENT-UNKNOWN / NOT-PROMOTED-UNKNOWN / payment UNKNOWN preserved verbatim on home, command center and compare; never rendered as paid, failed or a price).
- Stale ≠ fresh (compare freshness classes with source timestamps — unchanged); proposed ≠ committed (OFFERED group-buy proposal shown as "no commitment exists yet").
- Every synthetic value carries a visible DEMO marker (tags, EnvironmentBadge, fixture ids); no live purchase, payment, group commitment, rental, swap or trade leg exists anywhere on this branch.
- Zero connected integrations, stated — never implied live. The command center renders observed kernel state only and claims no live orders/inventory/connectivity; it shows no predictions (the Twin link is labelled predictive).
- Capabilities without execution paths render as honest status/proposal views (unchanged W2/W3 module behaviors; no fake success introduced).
- The UI invokes only existing supported contracts/commands: `set-active-role`, `update-intent-draft`, `navigate` (host reducer), `lookupPrice`/kernel read projections, and typed kernel command envelopes inside the pre-existing J10 flows. No new architecture edge, dependency, public export or domain abstraction (architecture:check 0 violations).

## 6. Commit map (branch `work/w1-026`, oldest first)

| SHA | Change |
|---|---|
| `cf31c80` | role-aware UNiCOM front door (HomeSurface + 11 tests) |
| `8c70ed4` | buyer-intent first-journey understandability (field-help + 4 tests) |
| `c4e0ba6` | buyer-compare intent continuity + truth classes (+3 tests) |
| `e333745` | merchant-storefront command center (+3 tests) |
| `f9e3eb0` | HomeSurfaceParts split (oxlint max-lines gate) |
| `80c0ccd` | honest registry count moved into the collapsed summary (innerText law) |
| `dcc705b` | first browser-evidence commit (8/8 PASS) |
| `31840f2` | evidence-runner unused-import fix (lint baseline exact) |
| `3b98c4d` | final browser evidence, clean identity `3b98c4d` (the manifest's buildCommit) |
| (this commit) | completion report |

## 7. Remaining gaps (honest, none blocking acceptance criteria)

1. **The home merchant card's "active work" items are host-level J18 demo fixtures** (`DEMO_STATE_RECORDS`), not the storefront kernel's live state. Deliberate design: the host shell stays decoupled from module internals (the kernel loads lazily inside J10). The kernel-derived business state renders inside the Command Center only; both are DEMO-labelled and honest about their source.
2. **The Command Center is demo-kernel state.** It is the operational truth of the *demo* store. No live store, channel or provider exists (integrations: 0, stated); live-provider connection remains an operator decision outside this lane.
3. **Home emphasis quick-switch covers held roles only** (the published `set-active-role` action). Holding/dropping roles — the only path that changes authority — stays on the Roles surface; this is by design (authority changes never originate from the front door) but is a scope boundary worth naming.
4. **Intent constraint values remain local demo state** (never sent anywhere); the typed `IntentDraftSubmission` hand-off to the canonical intent parser is still unwired (pre-existing W2 lane boundary, unchanged by this work).
5. **Vite production build smoke not re-run in this lane** — packaging is W3-024's surface and the prior phase's environmental OOM record stands; the dev-server real-browser walk is this lane's evidence vehicle per the work order ("dev server is fine for EVIDENCE — this lane does not own packaging").
6. **Root `pnpm typecheck` still OOMs on this pod** (known environmental limit recorded since POST-V3); the scoped web config is the authoritative web check (clean), consistent with the accepted prior-phase practice.
7. **Buyer-surface breadth:** the front door links buyer secondaries (compare) and the registry/Explore for the rest; no new buyer journeys were added beyond the three upgraded surfaces — out of this work order's scope.

## 8. Reproduction (TL re-runnable)

```bash
# 1. unit/component battery (no browser)
corepack pnpm install --frozen-lockfile   # pnpm 10.33.2, Node 24
corepack pnpm --filter @zcode/web exec vitest run        # expect 413/413

# 2. scoped web typecheck (from repo root)
./node_modules/.bin/tsc -p packages/web/tsconfig.scoped.json   # expect exit 0

# 3. lint + architecture (from repo root)
corepack pnpm lint               # expect 103 warnings / 0 errors
corepack pnpm architecture:check # expect violations 0, new 0

# 4. browser evidence (real chromium, ordinary flow; ~2-3 min)
node packages/web/test/browser/warm-vite-deps.mjs --port 5199
node docs/unicom-default-experience/w1-026/run-browser-evidence.mjs \
  --start-env --port 5199 \
  --out docs/unicom-default-experience/w1-026/evidence \
  --manifest docs/unicom-default-experience/w1-026/w1-026-evidence-manifest.json
# expect: 8/8 steps PASS; requirements all PASS; pointers all resolve
```
