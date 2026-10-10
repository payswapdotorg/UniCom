# MERGED-GATE REPORT — UniCom rendered-commerce-UI phase (Task 33)

**Lineage under gate:** merged `fe1133c` (W1-011 rendered commerce host + W2-012 buyer/peer lane + W3-015 merchant/procurement/physical/trust lane) — 21 modules, all 19 journey families expected READY.
**Gate:** 19-journey ordinary-nav BROWSER walk + 5-item SAFETY slice, run by `packages/web/test/browser/run-merged-gate-evidence.mjs` against the vite DEV server ONLY (no ZCode server), Playwright headless chromium.
**Final outcome: 19/19 journeys PASS · 18 interactions PASS + 1 honest ABSENT (J18, by design) · SAFETY 5/5 PASS · walk steps 6/6 PASS · zero drift on every denominator · 104/104 evidence pointers resolve · manifest validation valid.**

## 1. How this report was produced (honesty first)

This gate was completed in **one full-gate run + three labelled targeted re-runs**, all recorded:

| run | kind | harness commit | scope | result |
|---|---|---|---|---|
| run 1 `…T134131100Z` | **the full gate** (30 planned steps) | `6d4ecc3` (+ uncommitted evidence) | all 19 journeys + safety | 8 PASS / 4 FAIL / 7 BLOCKED; safety 5/5 PASS |
| re-run 1 `…T140353962Z` | labelled targeted probe (`--only`, `selectedSteps` recorded) | `950577e` | J1–J7, J9, J11, J17, J19 + discovery + role holds | 9 PASS / J2 FAIL (count() race) / J7 honest ABSENT (2 further harness defects found) |
| re-run 2 `…T140753885Z` | labelled targeted probe | `950577e` + J7 harness fix (dirty tree, harness file only) | J7 | PASS |
| re-run 3 `…T141223939Z` | labelled targeted probe | `950577e` + J2 harness fix (dirty tree, harness file only) | J2 | PASS |

- The **original outcomes stay recorded** in the final manifest (per journey: `.original.outcome`), the **re-run supersedes** (`.reRun` with its runId + selectedSteps) — both visible, never silently rewritten. Run 1's manifest is archived unchanged as `commerce-merged-gate-manifest.run1-partial.json`.
- **Ordinary-nav discovery law held in every run:** each run walked the ordinary landing `/` (honest connect wall) → visible "UNiCOM Commerce →" button → `/commerce`. No deep link was ever used for discovery. The only targeted deep link in the whole gate is run 1's labelled J5-merchant-desk visit (`/commerce/merchant/group-buy-review`, after ordinary discovery — no shell nav entry exists to the merchant J5 side; recorded in `deepLinkPolicy`).
- The re-runs used **no deep links at all** (their `walkSteps` record the ordinary landing → entry click → home flow).
- **No app/module code was changed at any point** — verified: `git diff fe1133c..HEAD -- packages/web/src packages/experience packages/commerce packages/agent` is empty. All changes are harness (`packages/web/test/browser/**`) + evidence/docs.

## 2. Journey × result matrix (final; original → re-run where re-run)

| J | family | module | final journey | final interaction | original (run 1) | re-run |
|---|---|---|---|---|---|---|
| J1 | Buyer intent canvas | buyer-intent | **PASS** | PASS — facet edit + plan review | BLOCKED (harness crash) | PASS (re-run 1) |
| J2 | Offer sourcing & comparison | buyer-compare | **PASS** | PASS — stale→verified re-check | BLOCKED (harness crash) | PASS (re-run 3) |
| J3 | Buy now / wait / negotiate / substitute | buyer-decide | **PASS** | PASS — counter-offer gate → OFFERED → countered | BLOCKED (harness crash) | PASS (re-run 1) |
| J4 | Group buying — join, leave | buyer-groupbuy | **PASS** | PASS — interest gate (interest ≠ commitment) | BLOCKED (harness crash) | PASS (re-run 1) |
| J5 | Latent-demand group buys (buyer side) | buyer-groupbuy + merchant review desk | **PASS** | PASS — proposal gate → OFFERED; merchant side PASS (run 1 safety slice) | BLOCKED (harness crash) | PASS (re-run 1) |
| J6 | Rent or borrow vs buy | peer-rent | **PASS** | PASS — request gate → start → return → deposit settlement | BLOCKED (harness crash) | PASS (re-run 1) |
| J7 | Resale / consignment of owned items | peer-resale | **PASS** | PASS — prepare track → publish gate → ACTIVE | BLOCKED (harness crash) | PASS (re-run 2) |
| J8 | Proactive economic opportunities | buyer-opportunities | **PASS** | PASS — mark interested (never a commitment) | PASS | — |
| J9 | Bounded multi-hop trades (TradeCycle) | peer-tradecycle | **PASS** | PASS — own-leg consent gate + refusal stops the cycle | FAIL (harness selector) | PASS (re-run 1) |
| J10 | Merchant commerce lifecycle | merchant-storefront | **PASS** | PASS — cart → checkout EXECUTED + controlled refund EXECUTED | PASS | — |
| J11 | Supplier procurement & receiving | procurement-supply | **PASS** | PASS — partial receiving, expected/received visible | FAIL (harness selector) | PASS (re-run 1) |
| J12 | B2B & multi-location commerce | merchant-b2b | **PASS** | PASS — transfer DISPATCHED → RECEIVED | PASS | — |
| J13 | Autonomous store policies | merchant-autonomous | **PASS** | PASS — POLICY_DENIED refusal + journaled override EXECUTED | PASS | — |
| J14 | Commerce Twin what-if | buyer-twin | **PASS** | PASS — busy-season projection + no-history SKU → forecast UNKNOWN | PASS | — |
| J15 | Connected commerce / live commerce | merchant-connectors | **PASS** | PASS — attempt → ATTEMPTED → still DISCONNECTED (no fabricated success) | PASS | — |
| J16 | Physical no-RFID store operations | physical-store | **PASS** | PASS — offline barcode count QUEUED_OFFLINE (NOT promoted) + queue replay | PASS | — |
| J17 | Trust, security & recourse | trust-recourse | **PASS** | PASS — evidence → idempotent replay (no double effect) → uphold → refund → EXCEEDS_CAPTURED refusal | FAIL (harness needle) | PASS (re-run 1) |
| J18 | Failure/unknown/recovery states | host-states | **PASS** | **ABSENT (honest, by design)** — the reference states module provides no interactive control (0 controls in the module frame); shell Back exercised | PASS | — |
| J19 | Feature discoverability (Explore) | reference-explore | **PASS** | PASS — 7 groups / 19 cards + card navigation mounts the module | FAIL (harness race) | PASS (re-run 1) |

**Totals (final, zero drift on every denominator):**

- journeys: 19 planned = 19 executed + 0 blocked + 0 skipped = ΣbyOutcome 19 (19 PASS / 0 FAIL / 0 ABSENT / 0 BLOCKED / 0 UNKNOWN / 0 SKIPPED)
- interactions: 19 planned = 19 executed + 0 blocked + 0 skipped = ΣbyOutcome 19 (18 PASS / 1 ABSENT — the J18 honest ABSENT)
- safety: 5 planned = 5 executed (5 PASS)
- walkSteps (run 1): 6 planned = 6 executed (6 PASS — landing wall, entry click, commerce home, 3 role holds)

## 3. SAFETY slice (all from run 1 — none needed re-running)

| safety item | outcome | evidence of |
|---|---|---|
| role-denied | **PASS** | a role-gated action renders a visible, accessible denial naming the missing permission + every role that holds it — never hidden, never disabled silently |
| unknown-not-failed | **PASS** | UNKNOWN/pending states render as NOT-failed (distinct vocabulary, no failure styling) |
| j5-merchant-desk | **PASS** | merchant accept/counter/reject desk with the no-binding-effect label (labelled targeted deep link, post-discovery) |
| j5-dual-claim | **PASS** | the J5 dual-claim tolerated by the shell with zero registry warnings |
| demo-mode-and-reset | **PASS** | DEMO indicator always visible + deterministic demo reset (run LAST, against a non-default state) |

## 4. The J1–J7 diagnosis (what crashed, the fix)

**Symptom (run 1):** the journeys-a stage produced no step evidence for J1–J7 (no `05-…`–`11-…` captures); every one of the seven steps errored in ~0.5s with `TypeError: fn is not a function` and was classified BLOCKED. The `99-journey-J{1..7}-error.png` shots + `run-log.txt` lines 12–25 are the record. The vite server never crashed and the walk continued (J8 onward ran normally) — this was **not** an environment failure.

**Root cause:** a harness-only arity bug in `merged-gate-journeys-a.mjs`. The step factory was declared `step(journeyId, moduleId, shotBase, fn)` (four parameters — `shotBase` a vestige of an earlier draft; each step already hardcodes its own shot base) while **every one of the seven call sites passed three arguments** `(journeyId, moduleId, asyncFn)`. The async callback therefore landed in `shotBase`, `fn` was `undefined`, and the factory's inner `await fn({ page, cap, outDir, navPathTaken })` threw `TypeError: fn is not a function` **before any navigation happened**. Journeys B/C used the correct 3-arg shape — which is why only J1–J7 died.

**Fix:** the factory now takes `(journeyId, moduleId, fn)` (commit `950577e`), matching B/C. Verified by re-run 1: J1–J6 all PASS with full surface + interaction evidence.

## 5. Harness fixes disclosed (all defects were in the harness; the app was never touched)

1. **journeys-a factory arity** (J1–J7 crash) — §4 above.
2. **J9 wrong leg + wrong refuser:** the harness waited for the CONSENTED chip on `cm-tradecycle-leg-1`, but the cycle's legs are **0-indexed and Harbor Lane's own giving leg is legIndex 2** (`cm-tradecycle-leg-2`; leg 1 is Northlight→Two Harbors and stays UNCONSENTED). It also tried to click "Ferry Road Press refuses — stop the cycle", but Ferry Road Press is the **re-plan alternative, not a participant of the initial Cycle A**. Fixed to leg-2 + "Northlight Atelier refuses — stop the cycle". Re-run 1: own leg CONSENTED, cycle stopped — STOPPED_REFUSAL, "No other leg was committed" all verified.
3. **J11 wrong row class:** the PO rows render as `.cm-journey-item`, not `.cm-state-item` — the run-1 locator never matched and `.textContent()` hit its 30s default timeout. Fixed. Re-run 1: `po-demo-3` PARTIALLY_RECEIVED with the `expected 30 · received 18` difference line verified.
4. **J17 wrong assertion needle:** run 1 polled for "Refunds" (capital R); the module renders "Controlled **refunds** (bounded by captured funds)" — the refund itself **did execute** in run 1 (body evidence: `captured USD 48.00 · refunded USD 24.00`), only the needle never matched. Fixed to poll the post-state that proves the refund: the refunded-total flip to `refunded USD 24.00`. Module code untouched.
5. **J19 lazy-chunk race:** the harness's single immediate `evaluate` for "J1 · Intent canvas" raced the lazily-loaded module chunk (run-1 body evidence shows the card navigation DID land on the module frame — still "Loading the commerce module…"). Fixed to poll (`waitBodyText`, 45s). Re-run 1: card click → module heading rendered, PASS.
6. **J7 (found in re-run 1, fixed for re-run 2):** two defects — (a) the listing track does not exist until the owner commits an asset via the visible "Prepare a resale listing…" button, so "Publish this listing (with authorization)" never rendered; (b) the `rendered` needle said "Your under-use assets" but the section heading is "Your under-**used** assets" (the dropped `d` classified the rendered surface ABSENT). Also, the consignment-track surface check now prepares the consignment track on a second asset (visible click) so it asserts a rendered track, not just the entry button. Re-run 2: PASS with "Resale listing — Vinyl cutting plotter", ACTIVE chip, "Hand over to consignment (with authorization)".
7. **J2 (found in re-run 1, fixed for re-run 3):** `locator.count()` never auto-waits — the initial verified-offer count raced the lazily-loading module and read 0 on a still-mounting surface (`verifiedBefore=0` although Meridian renders VERIFIED against the fixed demo clock). Fixed to wait for the stale offer card first (it is the re-check target anyway). Re-run 3: `verified=1 → 2` with the stale class cleared, PASS.

## 6. Environment identity

- **App lineage:** merged `fe1133c` (W1-011 + W2-012 + W3-015); **no app/module code changed in any run** (diff-verified, §1).
- **Harness commits:** original gate `6d4ecc3`; fixes `950577e` (run-1 defects: factory arity, J9, J11, J17, J19), `3c3ba87` (J7 + the re-run-1 evidence), and the J2 count-race fix (merged with the final artifacts). Run 1 identity `6d4ecc3+dirty(evidence)`, re-run 1 `950577e(clean)`, re-runs 2–3 `950577e+dirty(harness file only)`.
- **vite dev ONLY** (`corepack pnpm --filter @zcode/web dev --port 5199 --strictPort`, free port picked, `NODE_OPTIONS=--max-old-space-size=512`, `GOMEMLIMIT=384MiB`); no ZCode server was ever started; server + browser killed between runs.
- node `v24.21.0` · pnpm `10.33.2` (via corepack) · playwright `1.63.0` (resolved `import:playwright`) · chromium `153.0.8010.12` · linux x64 · headless flags `--disable-dev-shm-usage --disable-gpu --no-sandbox`.
- **Timings / memory (per run):** run 1 total 176,751ms (cold-boot warm-up 26,215ms; freeMem 1817→1294MB; min during walk 238MB); re-run 1 total 75,470ms (warm-up 16,662ms; 1569→1349MB; min 324MB); re-run 2 total 47,671ms (17,678ms; 1524→1317MB; min 323MB); re-run 3 total 50,754ms (19,754ms; 1511→1285MB; min 247MB).
- **RAM workaround (disclosed):** vite 8.0.8's dep optimizer (rolldown, native) balloons to ~1.5GB+ RSS that `--max-old-space-size` cannot cap; under the pod's ~2.2GB platform baseline the OOM killer SIGKILLed it mid-bundling (exit 137; nine stale `deps_temp_*` dirs were found on this worktree). `warm-vite-deps.mjs` (harness addition, committed) warms the persistent dep cache with rolldown/tokio/rayon parallelism pinned to 1 before any gate run; later vite boots skip bundling entirely. All four runs above booted vite on attempt 1 against the warmed cache.

## 7. Evidence map

- **Final manifest:** `commerce-merged-gate-manifest.json` (merged: original + all re-runs; validation valid; 104 pointers, 0 missing).
- **Run-1 archive (unchanged):** `commerce-merged-gate-manifest.run1-partial.json`.
- **Re-run probe manifests (selectedSteps recorded, labelled — never the gate):** `commerce-merged-gate-rerun-manifest.json` (re-run 1), `commerce-merged-gate-rerun2-manifest.json` (J7), `commerce-merged-gate-rerun3-manifest.json` (J2).
- **Evidence dirs:** `evidence/` (run 1: 32 PNGs + body/console per step + `run-log.txt` + `vite-dev.log` + `walk-console-full.txt`), `evidence-rerun/` (18 PNGs), `evidence-rerun-2/` (4), `evidence-rerun-3/` (4).
- **Key screenshots (TL spot-check pointers):**
  - `evidence-rerun/05-journey-J1-buyer-intent.png` — the intent canvas after the Group-deal facet edit (counter "1 of 17 constraint facets captured") + the "Plan options" panel after the review click.
  - `evidence-rerun/13-journey-J9-peer-tradecycle.png` — leg 3 (Harbor Lane's giving leg) chip CONSENTED, Northlight's leg REFUSED, the stopped panel: "Cycle stopped — STOPPED_REFUSAL · No other leg was committed."
  - `evidence-rerun/16-journey-J11-procurement-supply.png` — `po-demo-3` PARTIALLY_RECEIVED with the "sku-proc-envelopes: expected 30 · received 18" quantity-difference line.
  - `evidence-rerun/23-journey-J17-trust-recourse.png` — case-1 dispute RESOLVED_ACCEPTED, "captured USD 48.00 · refunded USD 24.00", the EXCEEDS_CAPTURED refusal line, DUPLICATE — original receipt returned.
  - `evidence-rerun-2/11-journey-J7-peer-resale.png` — "Resale listing — Vinyl cutting plotter" with the ACTIVE chip, the fee/net exact-math lines, and the consignment track with its authorization gate entry.
  - `evidence-rerun/03b-explore-card-navigation.png` — the J1 card's Open button navigated to the rendered buyer-intent module (J19's card-navigation interaction).
  - `evidence/27-safety-j5-dual-claim.png`, `evidence/24-safety-unknown-not-failed.png`, `evidence/05-safety-role-denied.png` — the safety slice's visible-denial / unknown-≠-failed / dual-claim evidence.
  - `evidence/99-journey-J1-error.png` … `99-journey-J7-error.png` — run 1's honest BLOCKED record for J1–J7 (the error shots the factory bug produced).

## 8. Known gaps / honest notes

- **J18's interaction is ABSENT by design, not a miss:** the host-states reference module renders the shared state vocabulary (SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN, failed vs unknown visually distinct, DEMO-labelled fixtures) and provides **no interactive control** (0 controls inside the module frame). The shell Back exit was exercised and recorded as a working exit, never claimed as a module interaction.
- **J5 merchant side:** the J5 home/Explore entry deterministically renders the BUYER side (registry sort); the merchant review desk has **no shell nav entry today**. Its evidence is run 1's labelled targeted deep link (safety slice, PASS) and is carried into the final J5 record as original evidence — the desk was not re-run (nothing changed in it).
- **J9 engine boundary:** the tradecycle surface itself states execution is "Not wired (blocker)" — the agent-lane seam is unreachable from the web host. The gate verifies the per-leg consent/refusal mechanics and the honest hand-off boundary, never a simulated executed trade.
- **J15 connectors:** connected = none, honestly — the interaction proves an attempt renders ATTEMPTED → DISCONNECTED, never a fabricated success.
- **Harness defects, not product defects:** every FAIL/BLOCKED in run 1 traced to the seven harness bugs in §4–§5; after the fixes every journey passed on a real rendered surface with real clicks. No outcome in this report was produced by weakening an assertion — each fix made the harness target what the module actually renders (module sources were read, never edited).
- **Demo state scope:** all interactions run on committed demo fixtures in local screen state (DEMO-labelled everywhere); no live marketplace, payment rail, supplier portal or accounting backend is contacted — the surfaces state this themselves.
- The pod hosts the platform's own chromium (replay stack, CDP :9222) — untouched; the gate's chromium is a separate headless instance killed after every run.

## 9. Reproduction

```bash
# one-time per worktree: warm the vite dep cache (RAM ceiling — see §6)
node packages/web/test/browser/warm-vite-deps.mjs

# the full gate (writes evidence/ + commerce-merged-gate-manifest.json)
node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env \
  --out docs/rendered-ui/merged-gate/evidence \
  --manifest docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.json

# a labelled targeted probe (recorded as selectedSteps — never the gate)
node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env \
  --out docs/rendered-ui/merged-gate/evidence-rerun \
  --manifest docs/rendered-ui/merged-gate/commerce-merged-gate-rerun-manifest.json \
  --only 'journey-J9,…'

# merge original + labelled re-runs into the final manifest
node packages/web/test/browser/merge-merged-gate-rerun.mjs \
  --original docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.run1-partial.json \
  --rerun   docs/rendered-ui/merged-gate/commerce-merged-gate-rerun-manifest.json \
  --rerun   docs/rendered-ui/merged-gate/commerce-merged-gate-rerun2-manifest.json \
  --rerun   docs/rendered-ui/merged-gate/commerce-merged-gate-rerun3-manifest.json \
  --out     docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.json
```
