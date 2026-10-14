# W2-029 Completion Report — Main-Agent, Autonomy, Decisions and Trust UX

**Work order:** docs/work-orders/W2-029.md (tracking issue #22)
**Owner:** Worker 2 — Agent / Trust / Lab / Security
**Branch:** `work/w2-029`
**Baseline SHA:** `82d2d68ec465c19bd177a7567ba5b676843b5ece` (verified: clone HEAD == dispatch baseline; the work-order baseline `16bd468…` is an ancestor of it — docs-only commits in between)
**Delivered branch tip SHA:** see `git rev-parse work/w2-029` at review time (recorded below in §Delivered)
**Toolchain:** Node v24.21.0, `corepack pnpm` v10.33.2, frozen lockfile install

---

## 1. What was delivered

All changes are inside the exclusive write surface (`packages/web/src/commerce-modules/buyer-twin/**`, `merchant-autonomous/**`, `trust-recourse/**`, `packages/web/src/commerce-host/shell/surfaces/SystemSurface.tsx` + its test file `shell/SystemSurface.test.tsx`, this report, and `docs/unicom-default-experience/w2-029/**`). No app boot entrypoints, no `CommerceHostApp.tsx`, no shared shell navigation/CSS, no W1-owned modules, no desktop packaging files were touched.

1. **buyer-twin (J14) — the Main Agent surface.** New `agent-views.ts` (module-local contract mirrors + committed DEMO fixtures) and `main-agent-panel.tsx`: the user's goal in plain language, the eight Goal → Observe → Plan → Simulate → Approve → Execute → Verify → Learn phases as presentation (each phase either backed by the frozen `WorkGraphNodeStatus` vocabulary — planning / awaiting-approval / idle — or honestly marked "presentation only" / "not wired on this surface"), the evidence panel (operational / observed / historical truth classes; verified / stale / UNKNOWN freshness with deterministic ages against the fixed demo clock; proof-level refs), the proposed plan (every step "PROPOSED — not committed"; hand-off surfaces named), simulation-only predictions (numbers computed by the REAL advisory runtime `computeDemandForecast` through `runInkWhatIf`), the approvals panel (one PENDING, one DENIED authority — each with reason and safe next option; no override/retry affordance), and a work-graph panel using contract statuses with no executing/verifying nodes. The pre-existing what-if counterfactuals and the structural write-block are unchanged and are referenced as the Simulate-phase output.
2. **merchant-autonomous (J13) — autonomy status + honest control availability.** New `autonomy-controls.tsx`: the run presentation derived from journaled kernel state (`stopped` while the halt holds, with the deterministic-halt note), the honest objectives section ("NOT REPRESENTED — no autonomous-store objective type exists in the current contracts… none is simulated") alongside the boundary inventory rendered verbatim from the revision in force (budget, margin floor, approval thresholds, stop conditions, operations and restock rules), and all six override points with their REAL wired status: `approve-pending-action` WIRED (the journaled `RECORD_HUMAN_OVERRIDE` path already on the surface); `pause-autonomy`, `resume-autonomy`, `stop-store`, `tighten-limits`, `loosen-limits` NOT WIRED with exact reasons (no pause/resume/stop verbs in the commerce runtime; policy revision is kernel-side with no surface editor). No clickable control exists for unwired points.
3. **trust-recourse (J17) — the four-plane trust ledger + the security pipeline.** New `trust-plane-data.ts` + `trust-planes.tsx`: four SEPARATE planes — UserTrust, AgentTrust, Capability/ProviderTrust, TransactionProof — each an explainable card carrying the signal → risk → policy outcome → evidence → mitigation/next-step chain; the P0–P5 proof legend with "what proof is NOT: any trust signal"; "never one score" (the trust view contract has no score field) stated on the surface; and one BLOCKED security incident rendered through every pipeline stage (signal → classification → policy-decision → mitigation → evidence → defensive-broadcast → learning) where BLOCK is final and deterministic (`BLOCK_IS_FINAL_DETERMINISTIC`), no override affordance exists (and none may exist), and defensive content is indicators/mitigations only — never weaponized payloads.
4. **SystemSurface — truthful state summary.** A new "Agent, autonomy & trust state" section: the three surfaces with their honesty statements (plans and simulations are proposals that never change canonical commerce state; unwired owner controls marked unavailable, never simulated; four separate trust planes; a trust signal is never transaction proof; no live agent runtime is connected in demo mode; UNKNOWN preserved) and real SPA deep links to J14 / J13 / J17.

**Module-local contract mirrors.** `@unicom/experience` view types (DecisionCard-family vocabulary, `WorkGraphNode*`, `AuthorizationStatus`, `TruthClass`, `EvidenceReference`, `AutonomousStoreRunPresentation`/override kinds, `TrustComponentView`/`SecurityIncidentView`/`PROOF_LEVELS`) are mirrored field-for-field as module-local structural types in `agent-views.ts`, `autonomy-controls.tsx` and `trust-plane-data.ts`, each with a header note explaining why: the package's root barrel (`packages/experience/src/contract.ts`) uses extension-less relative re-exports, which fail TS2835 under `moduleResolution: nodenext`, so the whole `@unicom/experience` root surface resolves EMPTY to `tsc` from `packages/web` (91 pre-existing web TS2305s at the dispatch baseline — see §5). Importing those types would add new type errors; mirroring keeps this lane at zero new errors while preserving the frozen field vocabulary 1:1. Fixing the barrel is outside this lane's write surface (§7 gaps).

---

## 2. Exact commands run and results

| # | Command (run from repo root, unless noted) | Before (dispatch baseline) | After (branch tip) |
|---|---|---|---|
| 1 | `corepack pnpm install --frozen-lockfile` | — | exit 0, 51.3 s (pnpm 10.33.2) |
| 2 | `corepack pnpm --filter @zcode/web exec vitest run` | **392 passed / 392 (36 files)**, exit 0 | **414 passed / 414 (36 files)**, exit 0 |
| 3 | `corepack pnpm run lint` (oxlint) | 103 warnings / 0 errors | 103 warnings / 0 errors (identical count) |
| 3b | `corepack pnpm --filter @zcode/web exec oxlint src/commerce-modules/buyer-twin src/commerce-modules/merchant-autonomous src/commerce-modules/trust-recourse src/commerce-host/shell/surfaces/SystemSurface.tsx` | — | **0 warnings / 0 errors** (22 files) |
| 4 | `corepack pnpm --filter @zcode/web exec tsc -p tsconfig.json --noEmit` (scoped web typecheck) | 206 errors — all pre-existing | 206 errors — **byte-identical sorted list** (`comm -13` empty; `comm -23` empty); **zero errors touch the write surface** |
| 5 | `corepack pnpm run typecheck` (root, the repo's own script) | 251 errors, exit 1 — **pre-existing at the dispatch baseline** (experience 115 / web 91 / agent 39 / commerce 6; full sorted list captured at `/tmp/typecheck-baseline-errors.txt` — see §5 for the root cause) | 251 errors — byte-identical sorted list, **zero new** |
| 6 | `corepack pnpm run architecture:check` | violations: 0, baseline: 0, new: 0 | violations: 0, baseline: 0, new: 0 |
| 7 | `node docs/unicom-default-experience/w2-029/run-lane-evidence.mjs` (with `ulimit -n 8192`; the script boots its own vite on a free port and tears it down) | — | **9/9 steps PASS, console 0 errors** |

**Test denominators and failing-case history.** Before: 392/392 across 36 files — zero failing cases at baseline. After: 414/414 across 36 files (+22 tests: buyer-twin 15 total, merchant-autonomous 13 total, trust-recourse 20 total, SystemSurface 18 total) — zero failing cases. No test was deleted or weakened; three test-iteration fixes were needed during development (assertion-wording alignment in buyer-twin's work-graph note; moving one assertion from the incident card to the pipeline block in trust-recourse; the merchant loading-marker race — the loading card shares its title with the loaded surface). Two pre-existing J13 tests were re-synchronized onto observable postconditions (`unit price USD 46.00` / `planned value USD 60.00`) because their generic `OVERRIDE` / `HUMAN_OVERRIDE` wait markers became ambiguous against the new override-availability section's static text (`kernel:RECORD_HUMAN_OVERRIDE`) — the new synchronization is strictly stronger (it waits for the actual outcome of the async kernel command instead of a substring that now also appears statically).

---

## 3. Contract-to-UI map (every changed action/control)

Legend: **real** = backed by the deterministic commerce kernel / advisory runtime through public entrypoints; **fixture-backed** = committed DEMO fixtures rendered in frozen contract vocabulary, DEMO-labelled; **local-only** = presentation over module-local state only; **unavailable** = honestly rendered as not wired; **blocked** = refused by a deterministic boundary.

### buyer-twin (J14)

| UI element | Contract basis | Map |
|---|---|---|
| Goal statement / goal echo | presentation of the user's intent (agent-plane `EconomicGoal` is an opaque ref — recorded spec gap) | fixture-backed (demo intent draft) |
| Eight loop phases (Goal…Learn) | FROZEN-ARCHITECTURE §1/§22 prose; `WorkGraphNodeStatus` vocabulary for backed phases | fixture-backed presentation — no runtime loop type exists and none is invented |
| Loop phase chips (planning / awaiting-approval / idle) | `WorkGraphNodeStatus` (experience command-center contract) | fixture-backed |
| Execute / Verify / Learn rows ("not wired", "nothing to verify", "presentation only") | honest unavailability | unavailable (by design) |
| Evidence items (truth classes OPERATIONAL/OBSERVED/HISTORICAL; freshness verified/stale/UNKNOWN; proof refs P0–P2) | `TruthClass`, freshness vocabulary, `PROOF_LEVELS` display registry | fixture-backed (freshness computed deterministically against the fixed DEMO_NOW clock) |
| Plan steps ("PROPOSED — not committed", hand-off surfaces J1/J4/J6/J7) | proposal-ness per contract family (Strategy is agent-plane, not wired to web) | local-only presentation; nothing commits |
| Predicted outcomes (48.00/96.00 USD per 4 weeks; plotter break-even) | `runInkWhatIf` → REAL `computeDemandForecast` + exact-money primitives via `@unicom/commerce` | **real** (advisory runtime, deterministic, read-only) |
| Pending approval card (pool participation) | `ApprovalRequirement`/`AuthorizationStatus` vocabulary | fixture-backed; the real action lives on J4 |
| DENIED authority card (autonomous purchase) | authority boundary (web plane has no spending command path by frozen design) | fixture-backed denial + safe next option; no override/retry affordance |
| Ink / rent-vs-own what-if panels + write-block (unchanged) | REAL advisory runtime + structural write-block | **real** (pre-existing, baseline) |

### merchant-autonomous (J13)

| UI element | Contract basis | Map |
|---|---|---|
| Run presentation "STOPPED" + deterministic-halt note | `AutonomousStoreRunPresentation` mirror, derived from the journaled halted policy revision | **real** (kernel state; demo kernel instance) |
| Objectives "NOT REPRESENTED" | no autonomous-store objective type exists in the contracts | unavailable (honestly; nothing simulated) |
| Boundary inventory (spend limit, promotion budget, margin floor, approval thresholds, stop conditions, operations/restock rules) | `AutonomousStorePolicy` rendered verbatim (revision in force) | **real** (kernel state) |
| Override point: approve-pending-action → WIRED (`kernel:RECORD_HUMAN_OVERRIDE`) | `RECORD_HUMAN_OVERRIDE` typed command (journaled, on-behalf-of) | **real** command path on this surface |
| Override points: pause/resume/stop-store → NOT WIRED | no PAUSE/RESUME/STOP verbs in the commerce runtime | unavailable (reasons rendered; no clickable control) |
| Override points: tighten/loosen-limits → NOT WIRED | `revisePolicy` is contract-supported but kernel-side; no surface editor | unavailable (not simulated as editable) |
| In-band adjustment while halted → `POLICY_DENIED` + `STOP_CONDITION_TRIGGERED` + safe next option (unchanged flow, new browser evidence) | kernel policy gate | **real** (blocked — deterministic refusal) |
| Policy previews / escalations / price book / restock / audit trail / journal (unchanged) | `evaluateAutonomousPolicy`, typed commands, journal | **real** (pre-existing, baseline) |

### trust-recourse (J17)

| UI element | Contract basis | Map |
|---|---|---|
| Four trust planes (UserTrust / AgentTrust / CapabilityTrust / TransactionProof) | frozen trust taxonomy (canonical records live in `@unicom/agent` — unimportable from web by frozen architecture) | fixture-backed mirrors of the frozen field vocabulary, DEMO-labelled on every card |
| signal → risk → policy outcome → evidence → mitigation/next-step chains | experience trust/security view vocabulary | fixture-backed |
| "never one score" / "a trust signal is never transaction proof" | trust view contract has no aggregate score field (law) | stated on the surface; asserted by tests |
| P0–P5 proof legend + "what proof is NOT" | `PROOF_LEVELS` display registry mirror | fixture-backed (presentation-only mirror) |
| BLOCKED incident + 7-stage pipeline, `BLOCK_IS_FINAL_DETERMINISTIC`, defensive-only content | security immune-system contracts (agent plane, opaque to web) | fixture-backed presentation; **no override affordance exists** (asserted by tests) |
| Kernel-backed actions: evidence submission, dispute resolution, refunds, chargebacks, settlement observation/window close, return lifecycle (unchanged) | typed commerce commands through the kernel | **real** (pre-existing, baseline) |

### SystemSurface

| UI element | Contract basis | Map |
|---|---|---|
| "Agent, autonomy & trust state" summary section | truthful state presentation (work-order scope) | fixture-backed claims only; honesty statements asserted by tests |
| Deep-link buttons to /commerce/twin, /commerce/autonomous/store, /commerce/trust/recourse | host `dispatch({type:"navigate"})` | **real** (SPA navigation; browser-verified) |

Nothing in any changed UI indicates that a plan or simulation changed canonical commerce state; every synthetic value is DEMO-labelled; no live provider connection, credential, order, payment, refund, group-buy commitment or trade-cycle execution exists anywhere in the lane (the only kernel writes are the demo fixtures' own seeding and the surface actions that pre-existed at baseline, each behind confirmation gates and permission boundaries).

---

## 4. Browser evidence (real browser, repo's own scripts)

Runner: `docs/unicom-default-experience/w2-029/run-lane-evidence.mjs` — the W2-017/W1-018 lane format (own heap-capped vite dev server on a free port, playwright chromium headless, per-step `NN-*.png` + `NN-*-body.txt` + `NN-*-console.txt`, `lane-console.txt`, `lane-evidence-manifest.json`, `vite.log`). Run: `node docs/unicom-default-experience/w2-029/run-lane-evidence.mjs` → **9/9 PASS, console 0 errors**.

| Required path | Evidence |
|---|---|
| Decision/simulation path | `evidence/03-twin-main-agent.*` (loop, evidence, plan, predictions, approvals) and `evidence/03b-twin-what-if-recompute.*` (interactive busy-season recompute: 3→4 sets/week, 588→784 USD current-plan, delta 48→64 USD — simulation only) |
| Denied/approval-boundary path (reason + safe next option) | `evidence/04b-autonomous-denied.*` (kernel `Command refused: POLICY_DENIED`, reason `STOP_CONDITION_TRIGGERED`, safe next option "Review the policy bounds on this surface") and the DENIED authority card in `03-*` ("holds no purchasing authority… the boundary working"; safe next option to J4/J1) |
| Trust/proof explanation | `evidence/05-trust-proof.*` (four planes with the five-step chains, P0–P5 legend, BLOCK final pipeline) |
| Supporting | `evidence/01-roles-held.*` (merchant role held), `evidence/02-system-agent-state.*` + `02b` (System-surface summary + SPA deep link), `evidence/lane-console.txt` (0 errors), `evidence/lane-evidence-manifest.json` (9/9) |

---

## 5. Pre-existing baseline drift (NOT introduced by this lane; documented for the TL)

The root `corepack pnpm run typecheck` **fails at the dispatch baseline** (`82d2d68e`) with 251 errors (experience 115, web 91, agent 39, commerce 6). Root cause for the experience/web families: `packages/experience/src/contract.ts` (and other experience modules) use extension-less relative re-exports (`export * from "./common/values"`), which are unresolved under the repo's `moduleResolution: nodenext` (TS2835) — therefore the entire `@unicom/experience` root export surface resolves EMPTY to `tsc` from `packages/web`, producing TS2305 "no exported member" for every existing `@unicom/experience` import in web (91 errors across ~40 files, including files owned by other lanes). Vite/vitest use bundler-style resolution, which tolerates the extension-less form — that is why the app runs and all 392 baseline tests passed at the same SHA. The `packages/agent` errors are missing `@zcode/contracts` / `@unicom/agent-kernel` modules (a dangling devDependency — the same class of pre-existing breakage noted in prior phase records); the 6 commerce errors are in commerce test files. **This lane added zero new errors** (byte-identical before/after sorted lists, both for the root run and the scoped web run `tsc -p packages/web --noEmit`).

---

## 6. Acceptance checklist (work order)

- [x] Targeted tests cover loading, empty, blocked, UNKNOWN, stale, simulation-only, denied authority, and available recovery/recourse states — loading: merchant-autonomous + trust-recourse seeding cards; empty: no-refunds/registry-empty states; blocked: permission-denied tests in all three modules; UNKNOWN: no-history forecast UNKNOWN, settlement UNKNOWN, freshness UNKNOWN evidence row; stale: the 18 h-old pool-threshold observation; simulation-only: predictive labels + interactive recompute; denied authority: the DENIED approval card + POLICY_DENIED kernel refusal; recovery/recourse: journaled human overrides, escalation lifecycle, escalation-ladder rungs, safe-next-option rows.
- [x] Scoped TypeScript, lint and architecture checks pass with no new errors/warnings or architecture violations (§2).
- [x] Browser evidence demonstrates one decision/simulation path, one denied/approval-boundary path, and trust/proof explanation (§4).
- [x] Contract-to-UI map states for each changed action whether it is real, local-only, fixture-backed, blocked or unavailable (§3).
- [x] No UI indicates that a plan or simulation changed canonical commerce state (write-block unchanged; plans/predictions labelled; asserted by tests).
- [x] Completion report records commands, denominators, baseline SHA, delivered SHA, evidence pointers and honest gaps (this report).
- [ ] TL independently verifies behavior and relevant authority/security invariants before acceptance (the TL's step).

---

## 7. Honest remaining gaps

1. **The experience-barrel typecheck defect is unfixed** (§5) — the fix (adding `.js` extensions to ~40 experience source files / 102 TS2835 sites) is outside this lane's write surface. Until it lands, web modules cannot import `@unicom/experience` types without adding baseline errors. **Requested TL coordination:** a non-overlapping handoff to the experience owner; once fixed, the three module-local mirrors (`agent-views.ts`, `autonomy-controls.tsx`, `trust-plane-data.ts`) should be replaced by direct imports (mechanical follow-up, tests unaffected — they assert rendered copy and testids, not types).
2. **Module-local structural mirrors duplicate the frozen field vocabulary** (deliberate workaround for gap 1, field-for-field, documented in each file header). They are presentation-only and add no domain semantics, but they are duplicates until gap 1 lands.
3. **The loop phases have no runtime backing by design** — the frozen contracts define no AgentLoopPhase type (the loop exists as FROZEN §1 prose + `WorkGraphNodeStatus` vocabulary). The stepper is presentation and says so; no runtime capability is simulated.
4. **Trust-plane values are DEMO fixtures, not derived from the agent-plane trust journal** — `@unicom/agent` is unimportable from web by frozen architecture; the canonical `UserTrust`/`AgentTrust`/`CapabilityTrust`/`TransactionProof` records cannot be read from this plane. Every card is DEMO-labelled and the boundary is stated on the surface.
5. **CapabilityTrust plane renders "not connected"** honestly (J15 connected integrations: none) — no provider implementation exists, so no execution-success value is shown.
6. **Evidence capture sandbox note:** each dev-mode full page load re-requests the ~300-module graph and this sandbox's chromium exhausts its socket pool after ~5 full loads (`net::ERR_INSUFFICIENT_RESOURCES`; the sandbox `ulimit -n` soft limit is 1024 — the lane was run under `ulimit -n 8192`). The walk was restructured to prefer SPA navigation (also more realistic evidence). This is an environment property, not an app defect; the final run has 0 console errors.
7. **Two pre-existing J13 tests were re-synchronized** onto postconditions (§2) — strictly stronger waits, but they are edits to pre-existing tests and the TL should eyeball them.
8. **Module `owner` tags unchanged** (`buyer-twin`: W2-012; `merchant-autonomous`/`trust-recourse`: W3-015) — the registry's `CommerceModuleOwner` union is frozen (`W1-011 | W2-012 | W3-015`); a `W2-029` owner value is not constructible without a contract change, so the lane left the ownership metadata as-is and records provenance in module header comments instead.

---

## 8. Delivered

Branch `work/w2-029`. Implementation + evidence tip (verified battery + re-run lane at this SHA): `59137a4c24f87e4cc552dfa9a90ede6c2c761a98`; this report commit follows it and is the branch tip at push — a commit cannot contain its own hash, so the exact pushed tip is stated in the dispatch reply and verifiable with `git rev-parse origin/work/w2-029`. `main` untouched; no PR opened (the TL merges after independent acceptance).

Commits (oldest → newest): implementation (feat(web): W2-029 Main-Agent loop, autonomy control availability, four-plane trust ledger) → evidence (docs: W2-029 browser evidence lane — 9/9 PASS) → this report (+ a dead-variable removal in the lane script, after which the lane was re-run end-to-end at tip: 9/9 PASS, 0 console errors — the evidence committed here is that re-run).
