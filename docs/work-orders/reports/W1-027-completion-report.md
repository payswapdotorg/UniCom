# W1-027 Completion Report — The UNiCOM Command Center as the Commerce Home

Work order: W1-027 (Both-Worlds Correction, operator authority 2026-10-24)
Worker: Worker 1 — Product Home / Commerce Modules (lane W1-027)
Status: COMPLETE (all in-scope acceptance items delivered; honest gaps and port notes in §8/§9)

## 1. Identity

| Item | Value |
|---|---|
| Dispatch baseline (main) | `cb869f339e124f15f2e63efaeeb9e629831df135` (the BW-0 recorded baseline; branch base of this lane) |
| Branch | `work/w1-027` |
| Lane commits | `22f5ef9` (the Command Center implementation, 23 files) → `c30c360` (api.test fix — typecheck back to the exact baseline) → `066ba88` (section + zero-network evidence) → `895986a` (prior session's clean-tree merged-gate rerun) → final commit (this session: fresh first-hand merged-gate run + session-3 zero-network proof + this report) |
| Code the artifacts render | the tree is code-identical from `c30c360` onward (`066ba88`… are docs/evidence-only) |
| Toolchain | Node v24.22.1, corepack pnpm 10.33.2 (`--frozen-lockfile` install OK), Vite 8.0.8 dev server, Playwright 1.57.0 + Chromium 143.0.7499.4 (resolved via `import:playwright`), Debian 13 trixie sandbox, 4.1 GiB RAM / 2 CPUs |
| Prior-session continuity | The lane's prior sessions delivered the implementation (`22f5ef9`, `c30c360`) and the evidence rounds (`066ba88`, `895986a`) then went silent before the report/push. This completion session verified the implementation against the work order requirement-by-requirement, re-ran EVERY gate first-hand (including a fresh merged-gate run from the committed clean tree and a fresh demo-mode zero-network browser proof), and wrote this report. |

## 2. Port source (verified against the work order's cited reference)

The work order's port source is the public repo `github.com/payswapdotorg/unicom-console` — the operator-approved 2026-10-23 state. The live `/home/z/my-project` tree has since evolved past it (FE2/FE3 waves) and no longer carries `README.md` / `docs/BACKEND-ARCHITECTURE.md`, so this session cloned the reference fresh (`72eca33` ← `807035f` "Base: operator-approved UNiCOM UI + Wave-1 backend contracts") and verified the port against it:

- `src/lib/product/data.ts` — the delivered `data.ts` carries the approved seeds **byte-for-byte in value**: the three stores (halcyon `28450` / mountain-reads `8120` / kaia `4390`, same domains/platforms/health/installed-skills), the three missions (same lanes, workers, evidence chips), the three decisions, the five watch events, the six skills, the morning brief (same date/summary/checks/numbers), the same platform set (6 platforms — the later "local" platform is a post-approval FE addition, correctly NOT ported).
- `src/lib/product/store.ts` — the interaction model is ported as a pure reducer (`state-model.ts`) + React wiring (`state.tsx`): the seven sections, the 3-step connect wizard (900ms per step, 250ms landing), decision resolution (approve/decline → resolved list + review event), skill toggle (dispatch event on install, silent uninstall), Commander chat (700ms reply, 4-step plan, 900ms ticks), toasts. No zustand, no new dependencies.
- `docs/BACKEND-ARCHITECTURE.md` — the API seam (`api.ts`) matches the Wave-1 route contracts exactly (§4 below).
- Ported the EXPERIENCE, not the pixels: tailwind/shadcn classes were translated into the repo's design system (`command-center.css`, cmcc-* classes, host `cm-*` chips/buttons), per the work order's port rule.

## 3. What was delivered

### 3.1 The home surface IS the Command Center (requirement 1)

`/commerce` (and `/` canonicalizing to it on this branch's W3-024 default) renders the operator-approved Command Center as the commerce host's HOME surface:

- **Seven sections** — Command (morning brief), Stores (connection hub + wizard), Missions, Commander, Decisions, Watch, Skills — switched by a **rail on desktop (≥900px) / bottom nav on narrow viewports (<900px)**, one section rendered at a time (`sections.tsx`).
- **The heartbeat strip is always visible** (mounted above the switcher, never unmounts while the Command Center is on screen; pinned by tests).
- **Honest DEMO labeling** per the host's EnvironmentBadge law: the host header keeps the DEMO badge; every section header carries a `cm-demo-tag` DEMO tag; the Command section states the deterministic-seed basis and the `UNICOM_COMMERCE_API` seam; the heartbeat strip's mode chip reads `demo` (or `live seam · demo data` / `live`).
- The host's own header (brand · Home/Explore/Roles/System) stays above it — Roles and System surfaces stay reachable in the host nav.

### 3.2 J19 discovery stays pinned on the home surface (requirement 2)

The Command section carries the pinned home DNA (ported from the W1-026 home into `explore-area.tsx`): the **19-journey registry** (collapsed `<details data-testid="cm-journey-registry">` with all 19 `.cm-journey-item` rows — the DOM contract the walkers pin — plus the honest "N of the 19 journey families are rendered right now" count), the **Explore capabilities / Switch role / System** buttons, the **buyer quick start** (mini intent canvas; the draft carries across roles), the **merchant path** (command center + next actions), the **role-emphasis quick switch** (emphasis changes which path leads, never identity or authority), and the **scenario card** (Harbor Lane Print Studio + the three-kinds-of-truth distinction). Nothing became deep-link-only; Roles/System stay in the host header nav.

### 3.3 Interactions ported faithfully (requirement 3)

- **3-step connect wizard**: platform picker (glyph + catalog per platform) → credentials/name form (defaults when left blank) → progress (Authorize → Sync → Watch) → **the connected store joins the ring with its fabricated initial catalog** (deterministic 40–120 products — the backend demo-adapter contract; §9 note 3) + toast + watch-ring event.
- **Decisions**: approve/decline with evidence chips, detail rows, impact line and expiry; the resolved list ("Handled today") below the queue; each verdict lands a review event in the ring.
- **Skills**: per-store install/uninstall (one visible toggle per connected store per skill card), installed-on chips, dispatch event + toast on install, honest risk tiers.
- **Commander chat**: suggestion chips + composer; agent reply with a 4-step plan that ticks off (900ms per step, active-step cursor) and evidence chips per executed step; the thinking state between send and reply.
- **Missions**: per-lane progress bars + status chips + workers, and the evidence drawer (every lane's chips, verbatim).

### 3.4 Deterministic demo data (requirement 4)

The approved seeds, byte-for-byte (§2). Zero `Math.random` in any render/data path; the wizard's catalog fabrication is a pure function of its inputs (char-code sum → same inputs, same catalog — test-pinned); local entity ids come from a monotonic counter (never `Date.now()` for ids). Fixtures stay DEMO-labelled everywhere.

### 3.5 The inert commerce API seam (requirement 5)

- **Single module-level configuration**: the commerce API base URL from `VITE_UNICOM_COMMERCE_API` or `UNICOM_COMMERCE_API` (absent/blank ⇒ demo mode; trailing slashes trimmed; `api.test.ts` pins the resolution).
- **Typed fetchers matching the port source's `docs/BACKEND-ARCHITECTURE.md` Wave-1 routes**: `GET /api/stores` → `{stores}`; `POST /api/stores/demo` `{platform,name?,domain?}` → `{store}`; `GET /api/decisions?status=open` → `{decisions}`; `POST /api/decisions/:id/resolve` `{verdict}` → `{decision:{id,status}}`; `GET /api/missions`; `GET /api/watch?limit=50` → `{events}`; `GET /api/heartbeat` (typed strip payload); `GET /api/skills`; `POST /api/skills/:id/install` `{storeId,on}` → `{skill}`; `GET /api/brief` → `{brief}`; `POST /api/commander/chat` `{text}` → `{message}`; `GET /api/commander/history?limit=50` → `{messages}`; `GET /api/commander/messages/:id` (paced plan reveal). 10s per-call abort budget (the architecture's fetch-timeout law).
- **Demo mode makes ZERO network calls** — every fetcher refuses BEFORE touching the injected fetch (`DEMO_REFUSAL`), test-pinned with a call-recording fake, and proven live in the browser (§5).
- **Graceful fallback**: every fetcher returns an honest `{ok:false,error}` (HTTP error envelope, unreachable, malformed JSON, missing fields) — never a thrown exception, never a fake success; live-mode boot hydration swaps the seeds only when ALL required reads land, and every mutation applies locally first with a fire-and-forget API call whose failure leaves local state as the UI truth.
- **Seam injection**: `FetchLike` + config are injectable (`CommandCenterProvider` props) — the unit tests hydrate from fakes and fail-soft from rejected fakes.

### 3.6 DESIGN.md laws (requirement 6)

- Type scale: `command-center.css` derives `--cmcc-text-{xl,lg,base,caption,sm,xs}` from `--ui-font-size` with the SAME steps as the `text-ui-*` scale; no font-size outside these steps; no arbitrary pixel sizes.
- Calm/dense/operational; light + dark themes via `prefers-color-scheme` (same law as `commerce.css`); no marketing spacing.
- i18n-safe plain UI strings (the host's existing localization approach — the commerce host carries no i18n framework; all labels are plain strings like the rest of the host).
- Warm ink/paper + emerald primary + amber decisions, dark-first — ported as host CSS variables, not tailwind classes; zero tailwind/shadcn in the lane.

### 3.7 Module registration (requirement 7)

The `command-center` module family registers through the existing module contract (`module.ts` — `defineCommerceModule`, discovered by the registry's `import.meta.glob` convention): listed on the System registry, served at `/commerce/command-center` inside the standard module surface frame (the same `CommandCenterView` the home mounts — one implementation, zero drift), claims NO journey family (the 19-journey discovery stays owned by the journey modules + the home registry rows), zero registry warnings. The host router/registry tests keep passing (§5).

## 4. Exact commands run (re-runnable by the TL; all run first-hand by this session)

```
corepack pnpm --filter @zcode/web exec vitest run                 # 40 files / 476 tests PASS
corepack pnpm --filter @zcode/web exec vitest run \
  src/commerce-modules/command-center \
  src/commerce-host/shell/surfaces/HomeSurface.test.tsx           # api.test.ts 15 · component.test.tsx 12 · HomeSurface.test.tsx 11 — all PASS
corepack pnpm run typecheck > /tmp/w1-027-typecheck.txt 2>&1      # exit 2: 252 pre-existing errors
  # error-set diff vs the 252-error baseline (paths normalized): 0 additions, 0 resolved
corepack pnpm run architecture:check                              # OK — violations 0, baseline 0, new 0
corepack pnpm run dep:graph                                       # nodes=3082 edges=12222 (baseline 3064/12176)
corepack pnpm exec oxlint <23 changed files>                      # 0 warnings, 0 errors (21 lintable files)
node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env \
  --out docs/rendered-ui/command-center/merged-gate/evidence \
  --manifest docs/rendered-ui/command-center/merged-gate/commerce-merged-gate-manifest.json
  # exit 0 — journeys 19/19 PASS, interactions 18 PASS + 1 ABSENT-by-design, safety 5/5 PASS,
  # walk steps 6/6 PASS, zero drift on all four denominators, manifest valid, 93/93 pointers,
  # buildCommit 895986a dirty=false (runId merged-gate-commerce-evidence-2026-10-28T035740252Z)
```

Browser first-hand session (demo-mode proof + section verification), vite dev on `:5190` (this lane's own server, heap-capped + GOMEMLIMIT, killed after — the operator's `:3000/:3030` stack untouched):

```
agent-browser --session w1-027c open http://localhost:5190/       # → /commerce, "UNiCOM Commerce — Demo"
# exercised: all 7 rail sections · connect wizard (Shopify, "Sable And Fir Supply") → store joined the ring
# (96 products, demo-fabricated) · Decisions approve d-1 + decline d-2 · Skills install Stock Scout on
# Halcyon · Commander chat (4-step plan ticked 4/4) · Watch ring (every flow recorded) · 390px narrow
# (bottomnav grid, rail none) · light theme · 19 registry rows (collapsed)
agent-browser --session w1-027c network requests                  # 467 requests — ALL localhost/127.0.0.1:5190 or data:, ZERO external
agent-browser --session w1-027c console / errors                  # only the React DevTools info line; zero page errors
```

Note on the typecheck capture: the brief's `2>`-only redirect misses the errors (tsc writes them to stdout); the run above captures stdout+stderr. The raw diff against the baseline shows 14 message-only shifts because the TS2339 messages embed the absolute worktree path (baseline captured in `/home/z/UniCom`, this lane in `/home/z/w1-027`); with paths normalized — the same normalization the W3-025 lane used — the error set is **exactly the 252-line baseline: 0 additions, 0 resolved**. The brief's referenced copy `/home/z/w1-027/baseline-typecheck.txt` does not exist on disk; the 252-error baseline error-set lives at `/tmp/baseline-typecheck-full.txt` (as recorded by the BW-0 worklog entry) and is what the diff used.

## 5. Denominators and failing-case history

| Suite | Baseline (main cb869f3) | Delivered (this session, first-hand) | Failing-case history |
|---|---|---|---|
| Web vitest | 38 files / 449 tests PASS | **40 files / 476 tests PASS** (+2 files/+27 tests: `command-center/api.test.ts` 15, `command-center/component.test.tsx` 12; `HomeSurface.test.tsx` rewritten for the new home — 11) | none this session — all green on the first run |
| Root typecheck | exit 2, 252 pre-existing errors | exit 2, **252 errors — identical set** (paths normalized): **0 additions**, 0 resolved | the prior session's `c30c360` fixed the one real regression (api.test missing 3rd args) — re-verified first-hand here |
| Architecture check | OK 0/0/0 | **OK — violations 0, baseline 0, new 0** | none |
| dep:graph | nodes 3064 / edges 12176 | nodes 3082 / edges 12222 — name-normalized diff: **+19 nodes (all `command-center/*`), −1 node (deleted `HomeSurfaceParts.tsx`), +55/−9 edges ALL intra-`packages/web`; zero new package-direction edges** | none |
| oxlint (23 changed files) | — | **0 warnings, 0 errors** | none |
| Merged browser gate (fresh, committed clean tree) | journeys 19/19 required | **journeys 19/19 PASS · interactions 18 PASS + 1 ABSENT-by-design (J18 has no interactive control) · safety 5/5 PASS · walk steps 6/6 PASS — zero drift on all four denominators; manifest valid; 93/93 evidence pointers resolve; exit 0** (69.5s total, 13.3s cold-boot warmup, min freeMem 1400MB) | prior sessions' history, kept in the repo: run 1 partial (journeys+walk green, 3/5 safety BLOCKED at min 214MB free — sandbox memory pressure) + a targeted safety-only rerun (3/5, dirty tree), both superseded by clean full runs (the prior session's `066ba88`-based run and this session's fresh `895986a`-based run — identical denominators). This session's run needed no retries, no healing, no deep links for discovery (ordinary landing → visible UNiCOM Commerce entry). |
| Demo-mode zero-network (browser, first-hand) | — | **467 requests — all `http://localhost:5190` / `http://127.0.0.1:5190` (this lane's own vite) or `data:` URIs; ZERO external requests; console clean (React DevTools info line only); zero page errors** — captured across the full flow battery (all sections, wizard, decisions, skills, chat, narrow, light) | none |
| Section evidence | — | prior session's 28 captures at `066ba88` — the code is unchanged since (evidence-only commits after `c30c360`), so they match the delivered state; **re-verified live first-hand** this session (the `99-verify3-*` captures + the network/console proofs) | prior session's verify rounds (`99-verify*`, `99-verify2-*`) document its own first-hand session |

**Walker repairs: none needed.** The home-surface change preserved the pinned DOM contract (`.cm-journey-item` rows, `details[data-testid="cm-journey-registry"]`, `.cm-intent-draft`, the header nav), so the committed walkers followed the new ordinary flow unmodified — zero `test/browser/*` changes in this lane, and the fresh gate run passed with zero drift.

## 6. Evidence map (all committed on this branch)

- `docs/rendered-ui/command-center/sections/` — the seven sections desktop (`01`–`07`) + narrow (`20`–`26`), connect wizard steps 1–3 + store-joined-ring (`08`–`11`), decision approve/decline (`12`–`13`), skill install/uninstall (`14`–`15`), Commander plan-tick mid/complete (`16`–`17`), watch after flows (`18`), missions evidence drawer (`19`), J19 Explore-journeys registry from home (`27`), light theme (`28`); the prior session's verify captures (`99-verify*`, `99-verify2-*`); **this session's first-hand proofs**: `99-verify3-command-desktop.png`, `99-verify3-command-light-theme.png`, `99-verify3-narrow-390-bottomnav.png`, `network-requests-demo-mode-session3.txt` (467 requests, zero external, classification header), `console-log-demo-mode-session3.txt`; the prior session's `network-requests-demo-mode{,-session2}.txt` + `console-log-demo-mode{,-session2}.txt`.
- `docs/rendered-ui/command-center/merged-gate/` — the fresh full-gate manifest (`commerce-merged-gate-manifest.json`, runId `merged-gate-commerce-evidence-2026-10-28T035740252Z`, buildCommit `895986a…` dirty=false, identity law satisfied) + `evidence/` (per-step png/body/console, run log, vite log, walk console) + the prior run-1 partial manifest kept as history (`commerce-merged-gate-manifest.run1-partial.json`).
- `docs/rendered-ui/command-center/merged-gate-rerun/` — the prior targeted safety rerun manifest (history; superseded by the full clean-tree runs).
- This report.

## 7. Changed files (branch vs main cb869f3)

- `packages/web/src/commerce-host/shell/surfaces/HomeSurface.tsx` — rewritten: the home mounts the Command Center view through the module registry lookup (one implementation, zero drift; honest fallback if the module ever stops registering).
- `packages/web/src/commerce-host/shell/surfaces/HomeSurfaceParts.tsx` — DELETED (the W1-026 path cards split; their pinned laws live on inside `command-center/explore-area.tsx`).
- `packages/web/src/commerce-host/shell/surfaces/HomeSurface.test.tsx` — rewritten for the new home (the pinned laws re-pinned: J19 registry, scenario card, buyer quick start, merchant path, emphasis, heartbeat, header-home return).
- `packages/web/src/commerce-modules/command-center/**` (19 new files) — `module.ts` (module-contract registration), `component.tsx` (provider-wrapped view for home + module surface), `sections.tsx` (rail/bottom-nav layout + toasts), `heartbeat.tsx`, `section-{command,stores,missions,chat,decisions,watch,skills}.tsx`, `explore-area.tsx` (the J19 home DNA), `state-model.ts` (pure reducer — the approved interaction model), `state.tsx` (React wiring + the API seam), `data.ts` (types + approved seeds + pure fabrication), `api.ts` (the inert commerce API seam), `ui.tsx` (shared presentation bits), `command-center.css` (the ported visual language in host CSS), `api.test.ts` + `component.test.tsx` (focused tests).
- `docs/rendered-ui/command-center/**` (evidence, §6) and this report.

Untouched (per contract): `main.tsx` / `commerceEntry.tsx` (W3-025-owned), every `@zcode/*` package, `@unicom/commerce` / `@unicom/experience` sources, package manifests/lockfiles, architecture specs, every existing commerce module, `test/browser/*` (walkers), the operator's live stack.

## 8. Forbidden-list compliance

- **No weakening of the 19-journey discovery** — all 19 families keep visible entries from the home surface (registry rows, one click, collapsed) AND the Explore taxonomy; test-pinned (19 rows, honest count) and gate-proven (journeys 19/19, first discovery via the ordinary flow, zero deep links for discovery).
- **No weakening of Roles/System** — both stay in the host header nav; role-emphasis semantics unchanged (emphasis never changes identity/authority).
- **No existing commerce module touched** — the lane's diff contains zero edits outside the home surface + the new module family.
- **No pixel-copying, no tailwind/shadcn, no new dependencies** — the port is pure React + host CSS conventions; dep:graph shows zero new package-direction edges; `package.json`/lockfile untouched.
- **No W3-025-owned files, no frozen packages, no architecture-spec edits.**
- **No live credentials/connections, no commerce mutations, no production deployment, no human research** — demo mode only, zero network calls (unit-pinned + browser-proven), every synthetic object DEMO-labelled.

## 9. Honest remaining gaps / port notes

1. **Port-source live-tree drift**: the live `/home/z/my-project` tree has evolved past the operator-approved 2026-10-23 state (FE2/FE3 waves) and no longer carries `README.md`/`docs/BACKEND-ARCHITECTURE.md`; verification used the public `unicom-console` repo (the work order's cited reference) cloned fresh at `72eca33`. The approved design's later FE evolution (e.g. the "local" platform, real connectors) is intentionally NOT ported — this lane ports the 2026-10-23 approved experience.
2. **The connect-flow ring event uses a sixth `WatchEventKind` `"connect"`** — the approved 2026-10-23 store recorded a finished connect as kind `"heal"` (rendered "self-heal"), and the backend contract's server-side demo-store event is also `"heal"`. The delivered type/chip map is a strict superset (both kinds render correctly) and the local event honestly labels its basis ("demo-fabricated" / "connected live — first sync landed from the commerce API"); a connect never mislabels as a self-heal. Disclosed as a deliberate port deviation for the TL to accept or redirect.
3. **The wizard's fabricated initial catalog** (deterministic 40–120 products) follows this work order's explicit requirement ("connected store joins the ring with its fabricated initial catalog") and the backend demo-adapter contract; the approved 2026-10-23 UI fabricated 0 products ("initial catalog sync queued (0 products)"). The work order supersedes the older behavior.
4. **The connect dialog stays open after the store lands** (it returns to the platform picker; the toast confirms behind it) — this matches the approved interaction model exactly, but differs from what a reader might expect (auto-close).
5. **W1-026 home informational blocks were condensed by the redesign** (its write surface — the W1-027 order replaces the home's content): the six-essentials help list now lives on the Intent Canvas destination (J1 fields), the work-in-flight lifecycle records remain rendered by the J18/merchant modules (the home no longer duplicates them), the three-truth strip became the scenario card's condensed three-truths sentence, and the group-buy-review quick action was replaced by the merchant command-center action (J4 keeps its 19-registry row + module nav). Every W1-026 pinned law survives on the new home (verified: buyer/merchant paths, three-truths distinction, J19 one click away, DEMO labels, emphasis switch, scenario card).
6. **Root typecheck still fails with 252 pre-existing errors** (a baseline condition of the merged lineage; zero added by this lane — error-set-identical after worktree-path normalization).
7. **`maxFileLines 400` does not apply to this lane's files**: the architecture policy's global rule is `managedOnly: true` and the `web` module is `managed: false`; the largest lane files are `command-center.css` (762 lines), `data.ts` (434), `section-stores.tsx` (312). `architecture:check` reports 0 violations. Noted because the dispatch brief asked for the check.
8. **Live mode is exercised only through fetch fakes** — no commerce backend exists yet; the seam is ready-but-inert by design (boot hydration, live mutations with graceful fallback, and the paced plan-reveal route are unit-tested; demo mode is the only runtime mode today).
9. **The section screenshots (`01`–`28`) are the prior session's captures** at `066ba88`; the code is unchanged since, so they match the delivered state — this session re-verified the same surfaces live (fresh `99-verify3-*` captures + the network/console proofs) rather than re-capturing all 28.
10. **The brief's baseline-copy path** (`/home/z/w1-027/baseline-typecheck.txt`) does not exist; the 252-error baseline error-set lives at `/tmp/baseline-typecheck-full.txt` (BW-0 worklog) — used for the typecheck diff (§4 note).

## 10. TL acceptance pointers

- Open the branch's dev server (`corepack pnpm --filter @zcode/web dev`) and land on `/` → `/commerce`: the first screen is the Command Center (morning brief, heartbeat strip, rail). Switch all seven sections; at ~390px the bottom nav replaces the rail; toggle light theme.
- Run the flows: connect a store (watch it join the ring with its fabricated catalog), approve/decline decisions (resolved list), install/remove a skill per store, ask the Commander (plan ticks 4/4) — each leaves its toast + watch-ring event, and the network tab stays localhost-only.
- Re-run the gates per §4 (one command each; all denominators reappear, including the merged-gate manifest with fresh identity).
- The J19 proof: the home's collapsed registry lists all 19 families with the honest ready-count; every row opens its module through ordinary navigation; Explore/Roles/System stay one click away in the host header.
