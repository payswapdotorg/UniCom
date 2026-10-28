# W3-025 Completion Report — The Both-Worlds Default Experience (operator correction)

Work order: W3-025 (Both-Worlds Correction, follow-on to W3-024, tracking issue #22 era)
Worker: Worker 3 — Experience / Deployment (lane W3-025, Task ID BW-a)
Status: COMPLETE (all in-scope acceptance items delivered; honest gaps listed in §9)

## 1. Identity

| Item | Value |
|---|---|
| Dispatch baseline (main) | `cb869f339e124f15f2e63efaeeb9e629831df135` (merge-base verified; W3-024's commerce-first default was the state this order reverses at the routing level) |
| Branch | `work/w3-025` (pushed; all 15 lane commits listed in §7) |
| Evidence-producing tips | web both-worlds `aede7c0` (manifest identity `f640c61`, dirty=false) · merged gate `0dbe913` (manifest identity `38d1c8c`, dirty=false) · desktop `7f112e0` (manifest identity `aede7c0`, dirty=true — the dev-app shim, §9.3) |
| Toolchain | Node v24.22.1, corepack pnpm 10.33.2, Playwright 1.57.0 (`import:playwright`) + its bundled Chromium for web evidence, Electron dev runtime (`node_modules/electron/dist/electron`) under Xvfb `:101` driven over CDP `:9229` for desktop evidence, Debian sandbox 4 GiB RAM / 2 CPUs |

Session continuity (disclosed): the lane spans two worker sessions on the same branch. The prior session delivered the implementation (`dd40c22`), the evidence harness (`2c28a26`) and evidence rounds 1–3; this session independently re-verified every gate first-hand, hardened the desktop evidence runner after a failed round 4 (§5), and re-ran all three evidence suites from the committed tips. Every denominator in §4 was produced by a command run in this branch's worktree and is re-runnable per §4.

## 2. What was delivered

### 2.1 Web default experience (`packages/web`) — the reversal

- **`/` (and `""`) boots the FULL ZCode workspace** — the ordinary first landing is the original product experience: sidebar with grouped tasks/projects, agents, chat, settings with every section (Automations, Commands, Hooks, MCP, ComputerUse, Browser, OffPeak, plugins). No auth-wall or commerce surface ahead of it beyond what upstream zcode itself does. The routing decision is centralized and test-pinned in `commerceEntry.tsx` (`resolveWebEntrySurface`, deliberate order): OAuth callback and conversation-share routes keep their specialized behavior and are never redirected; `/commerce` deep links keep working unchanged (compat); the explicit `unicomSurface=commerce` override keeps serving embedded frames; `/workspace` and legacy `?remote=` deep links keep the ZCode app bootstrap — now equivalent to the default root (history/back sanity is browser-evidenced).
- **UNiCOM Commerce is one PROMINENT, LABELLED, DOCKED click away** — `CommerceEntryDock` (new in this lane, rendered from the web package, mounted in `main.tsx` alongside `Root`): a clearly visible bottom-right docked entry (292 px wide, UNiCOM "U" badge, "UNiCOM Commerce" + "Store operations & journeys · demo" + "→", `title` tooltip, `data-testid="unicom-commerce-entry"`) that navigates to `/commerce`. This is the W3-024 floating `CommerceEntryOverlay` pill promoted to a docked, labelled, visible entry — NO `@zcode/ui` edits (the work order's suggested path; no decision packet was needed). The bootstrap-failure wall keeps its labelled commerce entry (W1-011, retained).
- **Both directions labelled**: the commerce surface keeps its "ZCode Agent Workspace →" entry (`WorkspaceEntryOverlay`). In an embedded frame (the packaged desktop app) that entry `postMessage`s the embedding window (`unicom:open-workspace`) instead of navigating the frame; in a top-level browser window it navigates to `/workspace`.
- **Product identity (W3-024) stays**: browser titles remain UNiCOM ("UNiCOM — Web", "UNiCOM Commerce — Demo", "UNiCOM — Sign In", "UNiCOM Conversation Share"); the `/commerce` mount keeps the W3-024 URL law (canonicalize to `/commerce` via `replaceState` before mounting in top-level windows; neutralize `history.pushState` in embedded `file://` frames).
- Focused tests: `commerceEntry.test.tsx` — 15 tests (9 resolver branches incl. root→workspace, /commerce→commerce, /workspace→workspace, share/callback→specialized, `?remote=`→workspace, `unicomSurface=commerce`→commerce, legacy catch-all; 5 workspace-entry affordance tests incl. the prominent docked entry; 1 compat helper).

### 2.2 Desktop default experience (`packages/desktop`) — the mirror

- **After native startup admission, every window opens the native ZCode workspace as the primary experience** — `shouldOpenWorkspaceFirst` now always returns `true`, reversing W3-024's commerce-first boot: the app-managed conversation backing workspace the host passes on ordinary launches (`initialWorkspacePurpose === "conversation"`) is agent cwd plumbing and opens the workspace like any ordinary launch; user-directed launches (`purpose === "project"`, `unavailableWorkspacePath`) are unchanged. The startup path itself is untouched (verified: **zero diff** on `src/main`, `src/host`, `src/preload`, `src/scheduler` vs baseline — admission/retry/exit, database readiness, message ports, host bridges, telemetry, remote-workspace registration, update-status window all preserved).
- **UNiCOM Commerce is one prominent labelled action away**: the workspace surface keeps the persistent labelled "UNiCOM Commerce →" entry (`UnicomWorkspaceReturnEntry`); it opens `UnicomCommerceSurface` — the SAME rendered commerce host the web app serves, either the staged `web-dist` bundle (packaged runtime, `unicomSurface=commerce` override) or a real dev-server embed (`VITE_UNICOM_COMMERCE_DEV_ORIGIN`, used by the lane evidence to embed the REAL host in unpackaged dev runs), with the minimal Linux frameless titlebar (drag + minimize/maximize/close via `DesktopCommandIds`, maximized-state synced from the same chrome-state source as the workspace shell). Without a dev origin the honest fallback panel stays (no fake commerce). The embedded host's labelled "ZCode Agent Workspace →" entry `postMessage`s the renderer (`unicom:open-workspace`) and the app swaps back to the native `Root` tree — services/ports reused across both surfaces.
- Focused tests: `unicomDefaultExperience.test.mjs` — 7 tests (workspace-first for ordinary + user-directed launches, staged-bundle/dev-origin/honest-fallback resolution, and the two cross-package contract tests keeping the desktop `unicom:open-workspace` / `unicomSurface` constants in sync with the web resolver).

### 2.3 Harness (write surface)

- New web evidence suite: `packages/web/test/browser/w3-025-both-worlds-{evidence,steps,env}.mjs` + `w3-025-vite-ports-config.mjs` — boots a REAL lane-private ZCode server (:3130, isolated `ZCODE_DATA_BASE_DIR`, seeded first-run home) because the W3-025 root landing is the full workspace, and serves the web app via `vite preview` of the committed production build (marker-verified to carry the W3-025 routing before any capture) with a lane proxy config — the sandbox memory law.
- Merged-gate walkers repaired to the NEW ordinary flow (harness-follows-flow, W3-024 precedent): first discovery lands the FULL workspace at `/`, the labelled docked commerce entry is the ordinary path into the host (no typed deep link), then the `/commerce` compat deep link + in-host history back are exercised. Preview-mode memory law, dual cold-boot warm-ups and inotify polling retained.
- Desktop CDP evidence: `docs/unicom-default-experience/w3-025/desktop-evidence/{boot-and-run-desktop-evidence.sh,run-desktop-evidence.mjs}` — boots Xvfb, the commerce dev origin (`vite preview` :5181), the renderer `vite dev` (:5174, started WITH `VITE_UNICOM_COMMERCE_DEV_ORIGIN` so `import.meta.env` bakes it), a fresh seeded isolated home, and the unpackaged electron dev runtime via a dev app-path shim (the semver fix, §9.5); the hardened runner drives the real app over CDP with every capture bounded (§5).

## 3. Decision packets for the TL

**None required.** The work order anticipated a possible STOP clause ("a workspace-sidebar-native commerce entry inside `@zcode/ui`"); the delivered design avoided it exactly as the order suggested — the docked labelled entry renders from the web package at the bootstrap level, so no frozen-package edit, no architecture change, and no new dependency edge was needed. Zero `@zcode/ui` / `@zcode/*` / `@unicom/*` sources, package manifests, lockfiles or architecture specs were touched.

## 4. Exact commands run (re-runnable by the TL)

All from `/home/z/w3-025` (branch `work/w3-025`). Focused/static gates (run this session from tip `7f112e0`/`0dbe913` — no product-code commits after `dd40c22`):

```
corepack pnpm --filter @zcode/web exec vitest run                 # 38 files / 450 tests PASS
node --test packages/desktop/scripts/desktop-product-identity.test.mjs \
                packages/desktop/src/renderer/src/unicomDefaultExperience.test.mjs \
                packages/desktop/electron-builder.config.test.mjs  # 21 tests PASS / 0 fail
corepack pnpm run typecheck                                       # exit 2; 235 "error TS" (pre-existing)
grep "error TS" <output> | sed 's|/home/z/w3-025|REPO|g' | sort   # diff vs baseline → 0 additions (§5)
corepack pnpm run architecture:check                              # OK — violations 0, baseline 0, new 0
corepack pnpm run dep:graph                                       # nodes=3064, edges=12176 (== baseline);
                                                                  # sorted full-graph diff vs /tmp/baseline-dep-graph.mmd: EMPTY
corepack pnpm exec oxlint <16 changed code files>                 # 0 warnings, 0 errors (two runs: 10 + 6 files)
```

Browser evidence (web — all lane-private ports; the operator's live view on :3000/:3030 was never touched):

```
node packages/web/test/browser/w3-025-both-worlds-evidence.mjs --start-env \
  --out docs/unicom-default-experience/w3-025/browser-evidence \
  --manifest docs/unicom-default-experience/w3-025/both-worlds-web-manifest.json
# 8/8 steps PASS — 43/43 checks; identity buildCommit f640c61, dirty=false

node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env --preview \
  --out docs/unicom-default-experience/w3-025/merged-gate/evidence \
  --manifest docs/unicom-default-experience/w3-025/merged-gate/commerce-merged-gate-manifest.json
# journeys 19/19 PASS, interactions 18 PASS + 1 ABSENT-by-design (J18 has no interactive control),
# safety 5/5 PASS, walk steps 6/6 PASS, zero drift, manifest valid, 94/94 evidence pointers resolve;
# identity buildCommit 38d1c8c, dirty=false. (An additional dev-mode pass at 02:57Z — same 19/19+5/5+6/6 —
# verified the flows under the live dev transform; its orphaned 99-* error captures from a self-healed
# transient were dropped, commit 38d1c8c.)
```

Desktop evidence (DEV desktop under Xvfb — the lane's documented choice, see §9.1):

```
bash docs/unicom-default-experience/w3-025/desktop-evidence/boot-and-run-desktop-evidence.sh
# boots: Xvfb :101 (reused), vite preview :5181 (commerce dev origin), renderer vite dev :5174 with
#        VITE_UNICOM_COMMERCE_DEV_ORIGIN, fresh seeded isolated home, unpackaged electron (CDP 9229)
#        via the dev app-path shim; runs the hardened CDP runner; tears the lane env down
# 3/3 steps PASS — 12/12 checks; identity buildCommit aede7c0, dirty=true (the dev-app shim only);
# duration 28.7 s; zero render-process-gone this round
```

## 5. Denominators and failing-case history

| Suite | Baseline (main cb869f3) | Delivered (this lane, re-verified this session) | Failing-case history |
|---|---|---|---|
| Web vitest | 38 files / 449 tests PASS | **38 files / 450 tests PASS** (lane +1: the prominent docked commerce entry test) | none — all pass |
| Desktop `node --test` (3 files) | 20/20 PASS | **21/21 PASS** (lane +1: ordinary-launch workspace-first test) | none — all pass |
| Root typecheck | exit 2, 252 pre-existing errors | exit 2, **235 errors**; error-set diff vs baseline (paths normalized): **0 additions**, 17 baseline-only (the packages/agent `@unicom/contracts` set resolved as a side effect of built project outputs — the same 17 W3-024 observed); delivered set byte-identical to the lane's committed sidecar after path normalization | none added by this lane |
| Architecture check | OK, 0 violations | **OK — violations 0, baseline 0, new 0** | none |
| dep:graph | nodes=3064, edges=12176 | **nodes=3064, edges=12176; sorted full-graph diff vs the baseline snapshot: EMPTY** — zero new edges at any level (no desktop→web source-level edge; the desktop consumes the staged artifact + the postMessage contract) | none |
| oxlint (16 changed code files) | — | **0 warnings, 0 errors** | none |
| Web both-worlds browser evidence | n/a (new suite) | **8/8 steps, 43/43 checks PASS** (identity `f640c61`, dirty=false) | rounds 1–2 in the prior session (superseded manifests); this session's re-run passed first try |
| Merged browser gate | 19 journeys BLOCKED at the W3-024 dispatch baseline (broken at main by W1-026/W2-029, repaired by W3-024) | **journeys 19/19 + interactions 18 PASS + 1 ABSENT-by-design + safety 5/5 + walk steps 6/6 PASS, zero drift, 94/94 pointers** (identity `38d1c8c`, dirty=false) | walkers repaired to the new ordinary flow (root lands the FULL workspace; labelled docked entry is the ordinary path into the host); one transient self-healed error in the 02:57Z dev-mode pass (honest 99-* capture dropped with the superseded run, commit `38d1c8c`); final preview-mode pass clean |
| Desktop both-worlds evidence | n/a (new suite) | **3/3 steps, 12/12 checks PASS** (identity `aede7c0`, dirty=true = dev-app shim only; zero render-process-gone) | rounds 1–3 prior session (identity-stamping law iterations, each superseded); **round 4 FAILED honestly**: the app's renderer process was OOM-SIGKILLed 10 s after first paint (electron log `render-process-gone: reason 'killed', exitCode 9`) when rounds were launched back-to-back — memory contention — and the runner then hung on the unbounded `page.screenshot()` with no manifest. Fixes: (a) runner hardened (every capture bounded, null-page guards, honest CAPTURE FAILURE, manifest always written — commit `f640c61`); (b) round 5 run standalone → 3/3 PASS, no crash |

## 6. Evidence map (all committed)

- `docs/unicom-default-experience/w3-025/browser-evidence/` — 8 steps × (screenshot + body + console) + `both-worlds-web-manifest.json`: (1) root boots the FULL workspace (sidebar; grouped tasks/projects "Group / Project / Projects / w3-025 / Tasks"; the docked labelled UNiCOM Commerce entry visible; address NOT canonicalized away); (2) settings → full section nav and the Automations surface one sidebar click away (scheduled-task templates incl. the OffPeak "Keep your computer awake…" automation); (3) dock entry → commerce host + browser back returns to the workspace root; (4) `/commerce` deep link + the labelled workspace entry returns via `/workspace`; (5) OAuth callback specialized ("UNiCOM — Sign In", CSRF-honest failure state, never redirected); (6) conversation-share specialized; (7) legacy `?remote=` keeps the workspace bootstrap; (8) `unicomSurface=commerce` serves the embedded frame. Plus `server.log` / `vite-preview.log` of the lane-private env.
- `docs/unicom-default-experience/w3-025/merged-gate/` — full 19-journey gate re-run evidence + manifest (runId `merged-gate-commerce-evidence-2026-10-28T030428148Z`, zero drift, pointer integrity valid, memory telemetry; warmups: cold-boot workspace paint 1054 ms + commerce chunks paint 1144 ms with host badge).
- `docs/unicom-default-experience/w3-025/desktop-evidence/` — `desktop-both-worlds-manifest.json` (3/3 steps, 12/12 checks, 28.7 s) + per-step screenshot/state captures: (1) after admission the app opens the NATIVE workspace (sidebar, Automations entry, labelled UNiCOM Commerce entry, commerce surface NOT mounted); (2) the labelled entry opens the commerce surface — the REAL embedded commerce host (frame `http://127.0.0.1:5181/?unicomSurface=commerce`, DEMO badge, labelled workspace entry inside the frame); (3) the frame's labelled workspace entry swaps back to the native workspace (same app window, full round trip). Plus the boot orchestrator + hardened CDP runner.
- `docs/unicom-default-experience/w3-025/typecheck/` — baseline error set (252 @ cb869f3), delivered error set (235), and the comparison note (0 additions; 17 baseline-only resolved by built outputs; 14 path-only line pairs).
- Web dist provenance: the merged-gate/web-evidence `vite preview` serves the committed production build (built 2026-10-28T00:48:46Z from this lane's product code; marker `unicom-commerce-entry-dock` verified inside `dist/assets/index-DXIch9HH.js` before any capture — the runners refuse dishonest captures).

## 7. Changed files (branch `work/w3-025`, 15 commits, 171 files vs baseline)

Product code (7 files — the only product-code commit is `dd40c22`):
`packages/web/src/commerceEntry.tsx` (resolver reversed + `CommerceEntryDock` + `WorkspaceEntryOverlay` + embedded-frame URL law), `packages/web/src/commerceEntry.test.tsx` (15 tests), `packages/web/src/main.tsx` (both-worlds dispatch + dock mount), `packages/desktop/src/renderer/src/unicomDefaultExperience.ts` + `.test.mjs` (7 tests), `packages/desktop/src/renderer/src/unicomCommerceSurface.tsx`.

Harness (write surface): `packages/web/test/browser/w3-025-both-worlds-{evidence,steps,env}.mjs`, `w3-025-vite-ports-config.mjs` (new); `commerce-evidence-env.mjs`, `merged-gate-discovery.mjs`, `merged-gate-manifest.mjs`, `merged-gate-warmups.mjs`, `run-merged-gate-evidence.mjs` (walker repairs to the new ordinary flow); `docs/unicom-default-experience/w3-025/**` (evidence, runners, typecheck sidecars); this report.

Untouched (per contract — verified by empty diffs vs baseline): `packages/web/src/commerce-host/**`, `packages/web/src/commerce-modules/**` (W1-027's surface), all `@zcode/*` and `@unicom/*` package sources, `packages/desktop/src/{main,host,preload,scheduler}/**`, package manifests/lockfiles, architecture specs/checker, the ZCode runtime.

## 8. Forbidden-list compliance

- The commerce host, the 19 journey families and every UNiCOM surface are INTACT — nothing was removed or hidden to "restore" zcode; both worlds are apparent (workspace-first + commerce one prominent labelled click away, both directions labelled, `/commerce` and all deep links unchanged).
- No `@zcode/ui` / frozen-architecture package edits, no architecture-checker weakening, no frozen-spec changes (§3: no decision packet needed).
- No new package-level dependency edges (dep:graph byte-identical to baseline); the desktop consumes the staged build artifact + the `postMessage` contract, not web sources.
- Desktop startup safety fully retained: startup admission/retry/exit, database readiness, message ports, update windows and remote-workspace registration untouched (zero diff on main-process sources; the desktop evidence run exercised admission live — sidebar visible only after it).
- No live provider credentials/connections, no commerce mutations, no production deployment, no human research; the commerce host is DEMO-labelled everywhere (the desktop frame embed shows the DEMO badge).
- Honest-denominator law: every number above was produced by the commands in §4 in this worktree; the failing round-4 history is disclosed, not hidden.

## 9. Honest remaining gaps / limitations

1. **Desktop evidence is the DEV (unpackaged) runtime under Xvfb** — the documented lane choice accepted by the TL (the packaged app embeds the SAME staged `web-dist` bundle the dev run embeds via `VITE_UNICOM_COMMERCE_DEV_ORIGIN`; same rendered host, same `unicom:open-workspace` contract). No packaged artifact was rebuilt this lane; the packaged-path proof remains W3-024's 13/13-check evidence (built from the same embedding mechanism). If the TL wants a packaged re-proof of the reversed default, that is a small follow-up build+run (W3-024 §4 commands unchanged).
2. **Root typecheck still fails with 235 pre-existing errors** (baseline condition of the merged lineage, 252→235 via built outputs; **0 added** by this lane).
3. **The desktop manifest records `buildTreeDirty: true`** — the boot orchestrator creates the dev app-path shim (`packages/.w3-025-dev-app/`, untracked scratch) BEFORE the runner starts, so identity-at-start always sees it; it is the only tree dirt at capture time and is removed on teardown (verified: no residue after round 5). The shim is untracked-not-gitignored (a root `.gitignore` edit is outside this lane's write surface).
4. **The desktop dev embed depends on a lane-private `vite preview` origin** (the committed production build, marker-verified). Without `VITE_UNICOM_COMMERCE_DEV_ORIGIN` the dev runtime honestly shows the fallback panel (by design — nothing is staged in unpackaged dev); the packaged runtime resolves the staged bundle.
5. **Dev-only pre-existing condition, worked around inside the harness**: the unpackaged dev runtime dies at import with "App version is not a valid semver version: 0.0" (the desktop package.json deliberately has no version — electron-builder injects it at packaging). The boot orchestrator's dev app-path shim supplies a valid version without touching any repo file.
6. **Round-4 failure disclosed** (§5): a back-to-back evidence round OOM-SIGKILLed the renderer; the harness now degrades honestly instead of hanging, and standalone rounds pass. If the pod's memory ceiling tightens, evidence rounds should stay strictly serial.
7. The `.w3-025-dev-app` shim path name embeds the lane id; a future lane reusing the orchestrator should parameterize it.

## 10. TL acceptance pointers

- **Web, one command**: run the both-worlds runner (§4) — a fresh browser session needs ZERO clicks to see the sidebar, grouped tasks/projects and the docked labelled "UNiCOM Commerce" entry; `01-root-default-workspace.png` + `02b-automations-surface.png` are the visual proof.
- **Routing law, one command**: `corepack pnpm --filter @zcode/web exec vitest run` — the 15 `commerceEntry` tests pin root→workspace, `/commerce`→commerce, `/workspace`→workspace, share/callback→specialized, `?remote=`→workspace, `unicomSurface=commerce`→commerce (embedded frame).
- **Merged gate, one command**: the preview-mode runner (§4) reproduces 19/19 + 18+1-by-design + 5/5 + 6/6 with zero drift.
- **Desktop, one command**: `bash docs/unicom-default-experience/w3-025/desktop-evidence/boot-and-run-desktop-evidence.sh` — boots the lane env, proves workspace-first + commerce one labelled action away + the full round trip, tears everything down (nothing on :3000/:3030 is touched).
- Every manifest carries git identity for staleness detection; re-verification of every number here is one command away per §4.
