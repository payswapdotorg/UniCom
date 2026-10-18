# W3-024 Completion Report — Default Web + Ubuntu Desktop UNiCOM Launch Experience

Work order: W3-024 (Default UNiCOM Experience phase, tracking issue #22)
Worker: Worker 3 — Experience / Connectors / Physical / Deployment
Status: COMPLETE (all in-scope acceptance items delivered; honest gaps listed in §9)

## 1. Identity

| Item | Value |
|---|---|
| Dispatch baseline (main) | `b8f1803ac6286775ba49009497db6a7e883a1d18` (verified at clone; W1-026 `a3e135d` and W2-029 `e440cd1` confirmed merged) |
| Branch | `work/w3-024` |
| Code tip the artifacts were built from | `d23b8a7` (buildCommitId recorded in `packages/desktop/out/metadata/build-meta.json`; every commit on the branch after `d23b8a7` is docs/evidence-only) |
| Toolchain | Node v24.21.0, corepack pnpm 10.33.2 (`--frozen-lockfile` install OK, 54s), Electron 41.0.3 (runtime Chrome 146.0.7680.80), electron-builder 26.8.1, Debian 13 trixie sandbox, 4.1 GiB RAM / 2 CPUs |

## 2. Packaged artifact identity (Ubuntu, x64)

| Artifact | Size (bytes) | SHA-256 |
|---|---|---|
| `UNiCOM Preview-3.14.3-linux-amd64_TEST.deb` | 153,439,612 | `d6360578c214cf0bbb7854cb968bf10d13fd1dc20fda9971005754bb8ede7d16` |
| `UNiCOM Preview-3.14.3-linux-x86_64_TEST.AppImage` | 204,537,078 | `21f7cd7e912e2871836af8279643a378974f3fcf7c7b77624df527cf0012d74d` |

Identity fields (verified live on the artifacts):

- DEB control: `Package: unicom-preview`, `Version: 3.14.3`, `Maintainer: UNiCOM <payswapdotorg@users.noreply.github.com>`, `Homepage: https://github.com/payswapdotorg/UniCom`, `Architecture: amd64`.
- Desktop entry `/usr/share/applications/unicom-preview.desktop`: `Name=UNiCOM Preview`, `Exec="/opt/UNiCOM Preview/unicom-preview" %U`, `Icon=unicom-preview`, `Categories=Office`, `Comment=UNiCOM — the AI-native Commerce Operating System desktop app`, hicolor icons at `/usr/share/icons/hicolor/512x512/apps/unicom-preview.png` (UNiCOM mark, generated + committed at `packages/desktop/build/unicom/icon.png`).
- Product identity: `productName=UNiCOM Preview`, `appId=org.payswapdotorg.unicom.preview`, executable `unicom-preview`, package `unicom-preview` (preview flavor, ambient test backend — see §9 gap 4; the production flavor maps to `UNiCOM`/`unicom`/`org.payswapdotorg.unicom`, proven by the identity test suite).
- Window title at runtime: `UNiCOM` (verified live over CDP inside the packaged app).
- The staged commerce bundle (`resources/web-dist/`) and the UNiCOM launcher icons are inside both artifacts; the packaged `app.asar` retains upstream third-party notices (`THIRD-PARTY-NOTICES.md` staged unchanged).

## 3. What was delivered

### 3.1 Web default experience (`packages/web`)

- **`/` now renders the UNiCOM commerce experience directly** — the ordinary first landing is the product. The W1-011 floating overlay is demoted to the workspace surface only (the labelled way back to the product).
- Routing is centralized and test-pinned in `commerceEntry.tsx` (`resolveWebEntrySurface`): OAuth callback and conversation-share routes keep their specialized behavior and are never redirected into the commerce host; `/commerce` deep links keep working (compat); the retained ZCode workspace is reachable through the deliberate `/workspace` route plus a visible "ZCode Agent Workspace →" entry on the commerce surface; legacy paths and `?remote=` deep links keep the ZCode app bootstrap (zero regression); `unicomSurface=commerce` serves embedded frames.
- Browser titles identify UNiCOM ("UNiCOM" document title; "UNiCOM Commerce — Demo" on the host; "UNiCOM — Sign In"; "UNiCOM Conversation Share"; "UNiCOM — Web"); `index.html` title + a UNiCOM wordmark on the startup loading screen (the ZCode-derived glyph is gone).
- URL law: landing on `/` canonicalizes the address to `/commerce` via `replaceState` BEFORE mounting, so the W1-owned shell's shareable-links `UrlSync` performs no same-document pushState — a push there would strand the browser Back button (root → popstate → re-push loop). In the embedded desktop frame, `history.pushState` is neutralized because `pushState("/commerce")` from a `file://` document throws `SecurityError` (verified on Chromium) and would crash the host mount.

### 3.2 Desktop default experience (`packages/desktop`)

- The renderer keeps the full native startup path untouched — database admission (`GlobalDatabaseStartupLoading`, retry/exit, 30s channel timeout), message ports, host bridges, telemetry, remote-workspace registration — and after admission renders the **UNiCOM commerce surface as the first screen**: the SAME rendered commerce host (W1-011 shell + module registry + the 19 journey families), staged at packaging time from the `packages/web` build, embedded in a same-process frame.
- A minimal Linux frameless titlebar keeps drag + minimize/maximize/close (the packaged window is frameless on Linux; controls issue `DesktopCommandIds` through the platform bridge; maximized-state class synced from the same chrome-state source the workspace shell uses).
- The deliberate route into the retained ZCode workspace: the staged host's "ZCode Agent Workspace →" button `postMessage`s the embedding window (`unicom:open-workspace`), the renderer swaps to the untouched `Root` tree (services/ports reused), and a labelled "UNiCOM Commerce →" return entry swaps back. Verified live in the packaged app (13/13 checks).
- Workspace-first only for user-directed launches: `initialWorkspacePurpose === "project"` (open-with/CLI folder) or an unavailable-workspace restore. The app-managed conversation backing workspace the host passes on every ordinary first launch (purpose `"conversation"`, agent cwd plumbing) opens the product, not the workspace.
- Update-status window, resource-manager and CUA permission panel entries are unchanged.
- Development (unpackaged) runtime honestly reports that the commerce bundle is staged at packaging time (fallback panel) — no fake commerce.

### 3.3 Product identity

- `desktop-product-identity.mjs`: production `UNiCOM` / `unicom` / `org.payswapdotorg.unicom`; preview `UNiCOM Preview` / `unicom-preview` / `org.payswapdotorg.unicom.preview`. The environment axis (`ZCODE_ENV` → `_TEST` artifact suffix) and the identity axis (`ZCODE_PREVIEW_IDENTITY`) are unchanged semantics; packaged Windows AUMIDs follow the new appIds (dev AUMID unchanged by design).
- electron-builder config: UNiCOM maintainer/homepage/author/description (description override fixes the DEB Description and `.desktop` Comment, which flow from the untouchable package manifest), Linux category `Office`, UNiCOM launcher icons, and the `web-dist` staging resource (fail-fast if the web build is missing).

### 3.4 Desktop seam — architecture decision packet (requirement 6)

The architecture gate was performed before implementation (FROZEN-ARCHITECTURE.md, INVARIANTS.md, dependency-graph.md, `scripts/dependency-graph.mjs`, `scripts/architecture/*`, public package entrypoints). Options considered for bringing the commerce host to the desktop:

1. **Relative source import desktop → web** — REJECTED: a new desktop→web implementation dependency-graph edge, explicitly forbidden.
2. **Add `@unicom/experience` / `@unicom/commerce` to the desktop manifest** — REJECTED: package manifests are untouchable in this lane.
3. **Load the web build as the main window document** — REJECTED: would discard the renderer's message ports, admission flow and platform bridges.
4. **Duplicate the host/19 journeys inside desktop** — REJECTED by requirement 5.
5. **CHOSEN — artifact-level reuse**: the desktop packages the SAME rendered commerce host (built from `packages/web` with `--base ./`, staged by electron-builder `extraResources` into `resources/web-dist`) and the renderer embeds it after admission. Zero new source-level dependency edges; the packaging surface (`electron-builder.config.js`) is in the write surface and already stages cross-package resources by the same mechanism (notices, config, provider config, agent bundle). The web build for staging uses `vite build --base ./ --sourcemap false` (relative base is mandatory for `file://` loading; sourcemaps are pruned by packaging anyway) — a disclosed build-flag variant; the canonical CI build is untouched.

## 4. Exact commands run (re-runnable by the TL)

Install: `corepack pnpm install --frozen-lockfile` — exit 0.

Focused tests:

```
corepack pnpm --filter @zcode/web exec vitest run                     # 38 files / 449 tests PASS (incl. 14 new)
node --test packages/desktop/scripts/desktop-product-identity.test.mjs \
                packages/desktop/src/renderer/src/unicomDefaultExperience.test.mjs \
                packages/desktop/electron-builder.config.test.mjs     # 20 tests PASS (all new; desktop had none)
corepack pnpm exec tsc -b packages/desktop/tsconfig.renderer.json     # exit 1 with the SAME 125 pre-existing errors as baseline; zero errors in this lane's files
corepack pnpm run typecheck                                           # exit 2: 235 errors, ALL pre-existing (baseline 252; 17 agent-test '@zcode/contracts' errors resolved as a side effect of built project outputs); error-set diff vs baseline: additions = 0
corepack pnpm run architecture:check                                  # OK — violations 0, baseline 0, new 0 (also with --changed)
corepack pnpm run dep:graph                                           # compared vs baseline: +7 file-level edges, all intra-package or within already-declared package-level dependencies; zero new package directions; zero desktop→web/experience/commerce/agent edges
corepack pnpm exec oxlint <19 changed files>                          # 0 errors, 3 warnings — all three present at baseline (verifyStagedKoffi, desktopElectronVersion, walkPlan)
```

Browser evidence (web, dev server — allowed for WEB evidence):

```
node packages/web/test/browser/w3-024-default-experience-evidence.mjs --start-env \
  --out docs/unicom-default-experience/w3-024/browser-evidence \
  --manifest docs/unicom-default-experience/w3-024/web-default-experience-manifest.json
# 5/5 steps PASS

node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env \
  --out docs/unicom-default-experience/w3-024/merged-gate/evidence \
  --manifest docs/unicom-default-experience/w3-024/merged-gate/commerce-merged-gate-manifest.json
# journeys 19/19 PASS, safety 5/5 PASS, walk steps 6/6 PASS, interactions 18 PASS + 1 ABSENT-by-design (J18 has no interactive control), zero drift, manifest valid, exit 0
```

Packaging (serial per the memory note; the parallel tsup+vite plan OOM-killed the renderer build once — exit 137 during chunk rendering — `--sourcemap false` on the renderer build fixed it; renderer maps are stripped by packaging anyway):

```
corepack pnpm --filter @zcode/web exec vite build --base ./ --sourcemap false          # exit 0 (staged commerce bundle)
cd packages/desktop && corepack pnpm prepare:build-meta                                # exit 0
cd packages/desktop && NODE_ENV=production corepack pnpm exec tsup                     # exit 0
cd packages/desktop && NODE_ENV=production NODE_OPTIONS=--max-old-space-size=2800 \
    corepack pnpm exec vite build --sourcemap false                                    # exit 0
cd packages/desktop && PATH=<pnpm-shim>:$PATH corepack pnpm prepare:runtime-assets     # exit 0 (needs a pnpm PATH shim; spawnSync pnpm ENOENT otherwise)
cd packages/desktop && PATH=<pnpm-shim>:$PATH ZCODE_TARGET_OS=linux ZCODE_TARGET_ARCH=x64 \
    corepack pnpm exec electron-builder --config electron-builder.config.js --linux deb AppImage --x64   # exit 0
sha256sum dist/*.AppImage dist/*.deb                                                   # values in §2
```

Packaged-artifact run (the sandbox has no FUSE and no root password, see §9):

```
cd packages/desktop/dist && "./UNiCOM Preview-3.14.3-linux-x86_64_TEST.AppImage" --appimage-extract   # exit 0
DISPLAY=:97 ./squashfs-root/unicom-preview --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9333
# Xvfb :97 1600x1000x24 (xvfb-run needs xauth, absent); CDP evidence via Playwright connectOverCDP
# 13/13 checks PASS (docs/unicom-default-experience/w3-024/desktop-evidence/packaged-app-evidence-manifest.json)
```

## 5. Denominators and failing-case history

| Suite | Baseline | Delivered | Failing-case history |
|---|---|---|---|
| Web vitest | 37 files / 435 tests (all pass; no dedicated main/commerceEntry routing tests existed) | 38 files / 449 tests, all pass | none — `commerceEntry.test.tsx` 14/14 from first run |
| Desktop tests | none existed | 20/20 pass (`node --test`) | one authoring bug fixed pre-commit (`assert.doesMatch` → `doesNotMatch`), then 20/20 |
| Root typecheck | 252 pre-existing errors (fails at baseline) | 235 errors — identical set minus 17 resolved by built outputs; **0 new** | none added by this lane |
| Renderer typecheck | 125 pre-existing errors (project never clean standalone) | 125 — same set; **0 new** | none added by this lane |
| Architecture check | OK, 0 violations | OK, 0 violations, 0 new | none |
| Merged browser gate | **broken at baseline** (W1-026 collapsed `<details>` journey registry made row buttons invisible; W2-029 renamed the J14 heading) — 19 journeys BLOCKED when run at the dispatch baseline | 19/19 journeys + 5/5 safety + 6/6 walk steps PASS | two harness repairs inside my write surface (`commerce-evidence-capture.mjs` opens the registry with the ordinary summary click; `merged-gate-journeys-b.mjs` expects the current J14 heading) — both pre-existing breaks are evidenced, not silent |
| Web default-experience evidence | n/a (new) | 5/5 steps PASS | development iterations: screenshot races fixed by commerce-host mount waits + fresh-page-per-step (renderer crashes on a long-lived mixed page) |
| Packaged-app evidence | n/a (new) | 13/13 checks PASS | two iterations: the remote-debugging wait window was too short for cold startup (bumped to 210s); the workspace-first rule initially fired on the app-managed conversation workspace (rule corrected to purpose `project`/unavailable only, renderer + artifacts rebuilt, evidence re-run) |

## 6. Evidence map (all committed)

- `docs/unicom-default-experience/w3-024/browser-evidence/` — 5 steps × (screenshot + body + console) + `web-default-experience-manifest.json` + vite dev-server log: root default UNiCOM landing (URL canonicalized to `/commerce` per the host's shareable-links law), `/commerce` deep link + in-host history back, auth-callback NOT redirected ("UNiCOM — Sign In", CSRF-honest failure state), conversation-share NOT redirected ("UNiCOM Conversation Share", honest network-failure state), deliberate workspace route (honest bootstrap-failure wall without a server + labelled commerce return entry).
- `docs/unicom-default-experience/w3-024/merged-gate/` — full 19-journey gate re-run evidence + manifest (runId `merged-gate-commerce-evidence-2026-10-17T104102566Z`, zero drift, pointer integrity valid).
- `docs/unicom-default-experience/w3-024/desktop-evidence/` — packaged-app run: 4 screenshots (first screen = UNiCOM commerce; workspace opened; back to commerce; final state), app console log, `packaged-app-evidence-manifest.json` (13/13), `packaging-run-summary.json` (toolchain, exact commands, OOM note, hashes, launch environment), `vision-verification.json` (independent VLM reads of the screenshots).
- Prior-lane evidence referenced: `docs/development-state/rendered-commerce-ui-state.json`, `docs/rendered-ui/CONTRACT-MAP.md`, `docs/rendered-ui/FINAL-REPORT.md`.

## 7. Changed files

Web (write surface): `src/commerceEntry.tsx` (rewritten as the default-experience module), `src/main.tsx` (dispatch + titles), `index.html` (title + wordmark), `src/commerceEntry.test.tsx` (new), `test/browser/w3-024-default-experience-evidence.mjs` (new), `test/browser/{merged-gate-discovery,commerce-evidence-walk-steps,commerce-evidence-walk,run-commerce-evidence,run-merged-gate-evidence}.mjs` (ordinary-flow discovery updates), `test/browser/commerce-evidence-capture.mjs` (journey-registry `<details>` open fix), `test/browser/merged-gate-journeys-b.mjs` (J14 heading fix).

Desktop (write surface): `src/renderer/src/main.tsx` (boot route), `src/renderer/src/unicomDefaultExperience.ts` + `.test.mjs` (new), `src/renderer/src/unicomCommerceSurface.tsx` (new), `src/renderer/index.html` (title + wordmark), `scripts/desktop-product-identity.mjs` + `.test.mjs` (UNiCOM identities + suite), `electron-builder.config.js` + `.test.mjs` (metadata/icons/web-dist + suite), `build/unicom/icon.png` (new launcher icon, allowed as launcher/icon addition within packaging conventions).

Docs: `docs/unicom-default-experience/w3-024/**` (evidence), this report.

Untouched (per contract): `CommerceHostApp.tsx`, `HomeSurface*.tsx`, W1/W2-owned modules, package manifests/lockfiles, architecture specs, the architecture checker, the ZCode runtime.

## 8. Forbidden-list compliance

- No architecture checker weakening, no frozen-spec changes, no new public package exports, no new package-level dependency edges (dep-graph diff in §4).
- Commerce journeys are the SAME rendered host — no placeholders, no duplication of the 19 journey families.
- Desktop startup safety fully retained (admission/retry/exit paths untouched; update-status window untouched; message ports/task runtime/remote-workspace registration preserved — the packaged run exercised admission and the host process live).
- No live provider credentials/connections, no purchases/payments/refunds/commitments/trade executions, no production deployment, no human research. The commerce host is DEMO-labelled everywhere; the packaged run shows the DEMO badge.
- Environment-vs-product identity separation preserved: test backend ⇒ Preview identity + `_TEST` suffix, unmistakable from production identity.
- All claims above are backed by committed, re-runnable evidence; the packaged build was verified by RUNNING the packaged artifact (not a dev server, not source-only, not the window title alone), with screenshot/DOM/console/CDP proof and independent VLM verification.

## 9. Honest remaining gaps / limitations

1. **DEB not installed in the sandbox** — non-root uid 1001 and password-gated `sudo`; verified instead by `dpkg-deb -I/-c/-x` (control fields, `/opt/UNiCOM Preview/unicom-preview`, desktop entry, hicolor icon) and by RUNNING the AppImage content. The TL's launch-verify on a real Ubuntu desktop should `sudo apt install ./…TEST.deb` (or `dpkg -i`) to close this last mile.
2. **AppImage executed from the extracted tree** — no `/dev/fuse`/fusermount in the sandbox. Direct `./…AppImage` execution needs FUSE on the operator machine; otherwise the same extract-and-run path used here works.
3. **RPM and pacman targets were NOT built** (no rpmbuild/pacman tooling here). The config's Linux target list is unchanged; these absent targets are NOT DEB/AppImage failures and are not counted as such.
4. **Artifact flavor is preview/test** — ambient `ZCODE_ENV` unset ⇒ test backend ⇒ the identity law mandates Preview (`unicom-preview`, `_TEST` suffix). A production-identity build (`ZCODE_ENV=production`) maps to `UNiCOM`/`unicom`, proven by the identity suite; the TL chooses the flavor for the published release.
5. **Internal runtime naming retains upstream identifiers outside this lane's write surface**: `app.setName(runtimeApplicationName)` (userData dir naming) and `process.title` come from `@zcode/shared`/main-process code; the `zcode://` deep-link scheme and the user-level `zcode.desktop` deep-link registration file (main process) are unchanged for compat. User-facing product identity (title, launcher, package, executable, icons, boot screens) is UNiCOM.
6. **The conversation-share page's in-page heading** still reads "ZCode Conversation Share" (in `ConversationShareLandingPage.tsx`, outside the write surface); the browser/document title is now "UNiCOM Conversation Share" (fixed in `main.tsx`).
7. **Root typecheck still fails with pre-existing errors** (235 vs baseline 252 — a baseline condition of the merged lineage, zero added by this lane).
8. **Desktop dev runtime shows an honest fallback panel** instead of the commerce host (nothing is staged in unpackaged dev); the packaged app embeds the real host.
9. **macOS/Windows icon sets remain upstream** (Linux lane scope; `icon_windows.png`/`icon.ico`/`.icns` untouched) — a cross-platform refresh belongs to a future lane.
10. The `03-back-to-unicom-commerce` screenshot caught the commerce surface during the staged frame's reload (transitional frame); the manifest's DOM checks for the round trip passed, and the `99-final-state` capture shows the settled state.

## 10. TL acceptance pointers

- Independent launch: build per §4 (or reuse the artifacts in §2 by SHA-256), then run per §4's packaged-artifact block — the first visible screen after startup admission is the UNiCOM commerce host (see `01-first-screen-unicom-commerce.png` and `vision-verification.json`), the window title is `UNiCOM`, and the workspace round trip works.
- Web acceptance: the two browser runners in §4 re-produce 5/5 and 19/19+5/5+6/6 with zero drift.
- Re-verification of every number in this report is one command away per §4; the manifests carry git identity for staleness detection.
