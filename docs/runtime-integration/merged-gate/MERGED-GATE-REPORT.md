# MERGED-GATE REPORT — UniCom runtime-integration phase

**Lineage under gate:** merged `main` at `04a0b7d` (three-way merge of W1-012 `work/w1-012` + W2-013 `work/w2-013` + W3-016 `work/w3-016` at `002ac3f`/`792161f`/`b975819`, plus the registered one-line J9 lint fix `04a0b7d`) with the gate-harness expectation updates for the kernel-driven surfaces (committed together with this evidence).
**Gate:** 19-journey ordinary-nav BROWSER walk + 5-item SAFETY slice, run by `packages/web/test/browser/run-merged-gate-evidence.mjs` against the vite DEV server ONLY (no ZCode server), Playwright headless chromium, memory-gated (heap cap + GOMEMLIMIT + pre-vite floor + per-step telemetry).
**Final outcome (the promoted manifest, run `merged-gate-commerce-evidence-2026-10-11T034534437Z`): 19/19 journeys PASS · 18 interactions PASS + 1 honest ABSENT (J18, by design) · SAFETY 5/5 PASS · walk steps 6/6 PASS · zero drift on every denominator · 92/92 evidence pointers resolve · manifest validation valid · memory floor during the walk 751 MB.**

## 1. How this gate was produced (honesty first — every attempt recorded)

The gate for this phase spans two sessions and five recorded runs. Nothing was silently rewritten; every superseded outcome stays on disk.

### Prior-session attempt (2026-10-10, context-exhausted mid-flight — recovered by this session)

| run | kind | scope | result |
|---|---|---|---|
| `…2026-10-10T222914384Z` | full gate (30 planned steps) | all 19 journeys + safety | 18/19 journeys PASS (J9 FAIL), 4/5 safety PASS (j5-merchant-desk FAIL) — both FAILs were the harness still expecting the rendered-UI-phase boundary strings ("Not wired (blocker)", "no binding effect"/"LOCAL DEMO STATE ONLY") against the now kernel-driven surfaces |
| `…2026-10-10T223328541Z` | labelled targeted probe (`journey-J9,safety-j5-merchant-desk`) | the two FAILs | both PASS (the J9 + J5-merchant expectation updates were correct) |

That session died before merging/committing; its artifacts (never committed, on the then-dirty tree) are preserved **unchanged** at `docs/runtime-integration/prior-session-2026-10-10/` (manifests + evidence, 36/36 pointers resolve in place). Its uncommitted harness diff is exactly the expectation update this session audited line-by-line against the merged sources, completed, and committed here.

### This session — attempt 1 (the merged-tree run with memory pressure)

| run | kind | scope | result |
|---|---|---|---|
| run 1 `…2026-10-11T032727287Z` | **the full gate** | all 19 journeys + safety | **19/19 journeys PASS, 19/19 interactions (18 PASS + J18 ABSENT)**; safety 4/5 (j5-merchant-desk BLOCKED); walk 5/6 (first-discovery-entry-click BLOCKED) — both BLOCKEDs were page crashes at 93–264 MB free (the pod's memory ceiling under the resident replay stack; the harness classified them BLOCKED, never hid them). Run-1 manifest archived unchanged as `commerce-merged-gate-manifest.run1-partial.json`. |
| re-run 1 `…T033056851Z` | labelled probe (`first-discovery-entry-click,safety-j5-merchant-desk`) | the two BLOCKEDs | both BLOCKED again (memory crashes at 260–565 MB free) |
| re-run 2 `…T033530047Z` | labelled probe (same scope) | same | j5-merchant-desk **PASS**; first-discovery-entry-click FAIL — **diagnosed as a probe-scope artifact, not a product defect**: the step clicks the landing entry button but does not navigate to `/` first (it is designed to follow `landing-connect-wall`), and a targeted probe starts on a fresh blank context after the warm-up context is closed. Evidence: the same step PASSes whenever the landing step precedes it (run 1's landing-connect-wall PASS with the button found; re-run 3; and the final full run). |
| re-run 3 `…T033833868Z` | labelled probe, corrected scope (`landing-connect-wall,first-discovery-entry-click,safety-j5-merchant-desk`) | fair re-run | **3/3 PASS** |

Attempt 1's merge (via `merge-merged-gate-rerun.mjs`, extended this session to supersede safety + walk items under the same history-preserving law as journeys) reached all-green: `safety j5-merchant-desk: BLOCKED → PASS · walk first-discovery-entry-click: BLOCKED → PASS`, 94/94 pointers. The merged attempt-1 manifest + all probe manifests + evidence dirs are preserved in this directory.

### This session — attempt 2 (the clean full run, promoted as final)

Between the attempts the environment was repaired (not the product): the sandbox's accumulated dispatch-era CDP tabs were closed (7 → 1 page, the active chat.z.ai tab) and the replay console's next-server (ballooned to 882 MB) was restarted through its supervisor ring's own recovery path. Free memory roughly doubled (floor during the walk: 751 MB vs 93 MB).

| run | kind | scope | result |
|---|---|---|---|
| `…2026-10-11T034534437Z` | **the full gate** (the promoted final manifest) | all 30 planned steps | **ALL GREEN IN ONE PASS** — journeys 19/19 PASS · interactions 18 PASS + 1 ABSENT (J18 by design) · safety 5/5 PASS · walk 6/6 PASS · zero drift everywhere · 92/92 pointers · validation valid |

This single clean run — not a merge — is the final `commerce-merged-gate-manifest.json` (copied verbatim from `commerce-merged-gate-manifest.full2.json`; `selectedSteps: null`, a true full gate). The attempt-1 files stay beside it as the disclosed history.

## 2. What the gate verified for THIS phase (beyond regression)

- **J9 (TradeCycle execution, W2-013):** own-leg consent through the commitment gate ("Consenting authorizes ONLY this leg"), the refusal path stopping the cycle with **"No other leg was committed"**, per-leg consent authority ("only the giving participant may authorize this leg"), consent windows, and the new honest wired state — **"Executed by the commerce kernel"** (each consent an `AUTHORIZE_TRADE_CYCLE_LEG` command; `EXECUTE_TRADE_CYCLE` commits all legs atomically; non-giver attribution holds the leg UNKNOWN, never fails it).
- **J4/J5 buyer (GroupBuy formation, W2-013):** interest ≠ commitment through the gate, `OFFERED` pending state, consenting-only roster with the declining studio visibly excluded, and the kernel-driven boundary ("Interest is never commitment; a threshold-met pool is HELD until the organizer's explicit formation … no group-buy commitment is ever created by this aggregate").
- **J5 merchant (W3-016, safety slice):** the review desk renders kernel truth and every action is a kernel transition — **"kernel-journaled facts, no longer local demo state"**, the desk "never overrides buyer consent … and creates no commitment"; the accept interaction moves the pool to ACCEPTED — threshold monitoring (kernel revisioned state rendered), counter/reject-with-reason offered, threshold state visible before any decision.
- **J15 (connector runtime, W3-016):** connected = **none** honestly; the one **REGISTERED** adapter (real `createShopifyAdapter` from `@unicom/experience/runtime`) deliberately NOT connected; the committed safe-exercise record rendered verbatim (lifecycle registered, 0 connected instances, health **UNKNOWN** honestly — "adapter has no connected instance yet", the read-only catalog-observation journey refused **by the canonical gate** `CATALOG_ONLY_NO_CONNECTED_INSTANCE`, **0 provider HTTP calls** (tripwire port), **0 sealed credentials**, live = NONE); the connection attempt journeys ATTEMPTED → DISCONNECTED, never a fabricated success.
- **Regression (the other 15 journeys + remaining safety items):** all PASS with their rendered-UI-phase honest behaviors unchanged (J1–J3, J6–J8, J10–J14, J16, J17, J19; role-denied, UNKNOWN≠FAILED, J5 dual-claim, demo-mode-and-reset).

## 3. Journey × result matrix (final run, all first-pass)

| J | family | module | journey | interaction |
|---|---|---|---|---|
| J1–J8 | buyer/peer families (intent, compare, decide, groupbuy, latent-demand, rent, resale, opportunities) | 8 modules | PASS | PASS |
| J9 | bounded multi-hop trades (TradeCycle) | peer-tradecycle (kernel-driven) | PASS | PASS — own-leg consent gate + refusal stops the cycle |
| J10–J14 | merchant storefront, procurement, B2B, autonomous, twin | 5 modules | PASS | PASS |
| J15 | connected commerce | merchant-connectors (runtime-wired) | PASS | PASS — attempt → ATTEMPTED → still DISCONNECTED |
| J16 | physical no-RFID store | physical-store | PASS | PASS — offline queue NOT promoted + replay |
| J17 | trust & recourse | trust-recourse | PASS | PASS — idempotent replay, controlled refund |
| J18 | failure/unknown/recovery states | host-states | PASS | **ABSENT (honest, by design)** — the reference states module provides no interactive control (unchanged from the rendered-UI phase) |
| J19 | feature discoverability (Explore) | reference-explore | PASS | PASS — 7 groups / 19 cards + card navigation |

**Totals (zero drift on every denominator):** journeys 19 = 19 executed (19 PASS) · interactions 19 = 19 executed (18 PASS / 1 ABSENT) · safety 5 = 5 executed (5 PASS) · walkSteps 6 = 6 executed (6 PASS).

## 4. SAFETY slice (5/5 PASS)

| safety item | outcome | evidence of |
|---|---|---|
| role-denied | PASS | visible, accessible denial naming the missing permission + every role that holds it |
| unknown-not-failed | PASS | UNKNOWN/pending rendered as NOT-failed (distinct vocabulary) |
| j5-merchant-desk | PASS | kernel-journaled desk facts + "creates no commitment" + the accept interaction with revisioned kernel state |
| j5-dual-claim | PASS | dual-claim tolerated by the shell (zero registry warnings) |
| demo-mode-and-reset | PASS | DEMO indicator + deterministic reset |

## 5. Harness changes committed with this gate (disclosed)

1. `merged-gate-journeys-b.mjs` / `merged-gate-safety.mjs`: the J9 + J5-merchant expectation updates from the prior session (audited line-by-line against the merged sources this session — every new string renders visibly in the merged tree; the superseded boundary statements are recorded beside their replacements in the lane manifests).
2. `merge-merged-gate-rerun.mjs`: extended so labelled re-runs supersede **safety + walk items** under the same law as journeys (`.original` preserved, `.reRun` + `.reRunHistory` visible; totals recomputed on final outcomes) — needed because this phase's environmental blocks hit a safety item, which the prior-phase script could not supersede. Also: a self-copy guard for re-merging from the archived run-1 file, and the run-1 note now derives from the original manifest's own outcomes instead of a prior-phase hardcoded story.
3. `run-merged-gate-evidence.mjs` / `merged-gate-manifest.mjs`: a `--lineage` flag (the manifest's lineage field was a rendered-UI-phase constant; this phase's manifests now carry their own true lineage — the final run used it).

No application or module code changed at any point during the gate: `git diff 04a0b7d -- packages/web/src packages/web/../commerce/src packages/experience/src packages/agent` is empty across all gate commits (only `packages/web/test/browser/**` + `docs/runtime-integration/**`).

## 6. Honest limitations

1. **Memory ceiling:** the gate runs on a 4 GB pod that also hosts the resident replay stack (the operator's live console, replayd, CDP chrome). Attempt 1's two BLOCKEDs and re-run 1's blocks were page crashes at 93–565 MB free — environmental, classified honestly by the harness. The final run's floor was 751 MB after the environment repairs (stale-tab cleanup + console restart through its supervisor ring). The canonical vite **production** build remains a separate, previously-closed frontier item (needs ≥3 GB free; the no-sourcemap variant built exit-0 in the rendered-UI phase).
2. **J18's interaction ABSENT is by design** (the reference states module renders states, offers no controls) — unchanged from the rendered-UI phase, recorded as an honest ABSENT, never a PASS.
3. **The J15 runtime panels in a browser render the committed safe-exercise record** (test-pinned against the real runtime), not a live runtime evaluation — the browser-safe experience sub-entrypoint remains the registered TL decision request from W3-016 (an experience-package change outside this phase's write surface).
