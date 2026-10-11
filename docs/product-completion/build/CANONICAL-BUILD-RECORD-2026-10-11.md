# Canonical Vite Production-Build Record — 2026-10-11

**Work order:** `docs/work-orders/W1-013.md` (Product Completion & Build Readiness, issue #12)
**Lane:** worker-1 (`work/w1-013`) · **Status: PASS evidence captured — pending TL independent sign-off**
**State authority:** `docs/development-state/product-completion-state.json` (BUILD acceptance gate)

## 1. Outcome in one line

The **canonical, unchanged** production build — `pnpm --filter @zcode/web build`,
i.e. `vite build` under `packages/web/vite.config.ts`'s production posture with
**hidden sourcemaps** — completed with **exit code 0** on a GitHub-hosted
`ubuntu-latest` runner with a **measured free-memory floor of 10,372 MB**
(minimum `MemAvailable` across the whole job, sampled every 2 s), which exceeds
the work order's ≥3,072 MB (3 GB) requirement by 3.4×. The full output
inventory, per-file SHA-256 manifest and deterministic whole-output digest are
retained below; nothing about the build or its configuration was changed.
A second run (final lane head, §4a) reproduced the result with a floor of
**10,624 MB**, exit 0, and a byte-identical path set — 6,196/6,200 files
byte-identical across the two independent runs.

## 2. Exact command, commit and environment

| Item | Value |
|---|---|
| Exact command | `pnpm --filter @zcode/web build` (run by the workflow verbatim; resolves to `vite build` in `packages/web`, mode `production`) |
| Workflow file | `.github/workflows/canonical-web-build.yml` (sha256 `198d92877e985b1c73814ada719f7b6fcf88034862c90a05a1519a6c7db29998`), introduced by branch commit `438c961760a069e945b860e39328fb9a405348df` |
| CI run | [`38122630570`](https://github.com/payswapdotorg/UniCom/actions/runs/38122630570) — workflow `canonical-web-build`, event `pull_request` (PR [#13](https://github.com/payswapdotorg/UniCom/pull/13)), attempt 1, conclusion **success** |
| Checked-out commit (`GITHUB_SHA`) | `67655115a02e373b949dec412267340ec1054c7d` — the PR merge ref `refs/pull/13/merge` (head `438c9617` merged into base `558a4f0`; the base delta is a docs-only registry commit, lane content identical) |
| Job | `114420337128` — started 2026-10-11T07:48:47Z, completed 2026-10-11T07:50:01Z (**74 s**, all 12 workflow steps success) |
| Runner | GitHub Actions `ubuntu-latest`, image `ubuntu24/20261004.327.1`, Ubuntu 24.04.5 LTS, `nproc` = 4 (public-repo standard runner: 4 vCPU / 16 GB) |
| Node | `v24.21.0` (setup-node pinned by major `24`; root `engines: >=24.0.0`) |
| pnpm | `10.33.2` via corepack (repo `packageManager` field; the workflow asserts the exact version and fails on drift) |
| Vite (web-resolved) | `8.0.8` (`packages/web/node_modules/vite/package.json`; rolldown-based Vite) |
| TypeScript (root) | `6.0.2` |
| Install | `pnpm install --frozen-lockfile` — 07:48:56Z → 07:49:33Z (37.1 s), `.npmrc` `node-linker=hoisted` respected, all lifecycle scripts ran normally (husky `prepare`, `node-pty` install, electron/esbuild/protobufjs/msw postinstalls, `packages/desktop` node-pty electron-rebuild: `✔ Rebuild Complete`) |

### Timings (UTC, from the job log / evidence summary)

- Job start 07:48:47Z · install 07:48:56Z → 07:49:33Z ·
  **build start 07:49:33Z → build end 07:49:49Z** (vite reports `✓ built in 14.59s`)
  · job end 07:50:01Z.
- Build phase detail: `vite v8.0.8 building client environment for production...`
  → `✓ 8137 modules transformed.` → `✓ built in 14.59s`.
- Exit code: **0** (`CANONICAL_BUILD_EXIT_CODE=0` printed into the job log and
  the evidence-summary artifact; the step, job and run all concluded `success`).

## 3. Measured memory floor (the ≥3 GB law)

A background sampler inside the job logged `/proc/meminfo` `MemAvailable` every
2 s for the job's whole active window (27 datapoints, 07:48:55Z → 07:49:50Z —
covering install **and** the canonical build, including the sourcemap-generation
phase that OOM-kills the pod). The minimum datapoint is the floor:

```
MEASURED_MEMORY_FLOOR_KB=10621832     (= 10,621,832 kB)
MEASURED_MEMORY_FLOOR_MB=10372        (= 10,372 MB ≈ 10.1 GiB)
MEMORY_FLOOR_AT_LEAST_3GB=yes         (requirement: ≥ 3,072 MB)
```

- The minimum datapoint (10,621,832 kB) lands at ~07:49:46Z — **during the
  canonical build's sourcemap/rendering phase** (build window 07:49:33Z →
  07:49:49Z), i.e. the floor is measured at the build's peak pressure, not at
  idle. `MemAvailable` before the job: ~14,772 MB (runner total 16 GB).
- Raw sampler log retained at `logs/run-38122630570-memfloor.log`; the floor
  computation is step 10 of the job log (`logs/run-38122630570-full-job-log.txt`).

## 4. Output inventory (canonical posture, nothing weakened)

| Metric | Value |
|---|---|
| Emitted files (`packages/web/dist`, all types) | **6,200** |
| Total output size | **136,479,625 bytes** (~130.1 MB) |
| `.map` files emitted | **2,277** — hidden sourcemaps **are generated** (canonical posture) |
| `sourceMappingURL` comments in emitted `.js`/`.mjs`/`.css` | **absent** — the maps are *hidden* (generated, not referenced), exactly the config's `sourcemap: mode === "production" ? "hidden" : true` |
| Per-file SHA-256 manifest | `logs/run-38122630570-dist-manifest-sha256.txt` — 6,200 lines, `sha256<TAB>path`, path-sorted |
| Deterministic whole-output digest | `ccd620a9fcda25b084ccf8edf2e6ac9cf07fd38fb9ee1c4e92151829f6a57551` — computed with the repo's own `scripts/deterministic-tar-archive.mjs` (`computeDeterministicSourceSha256('packages/web/dist')`) |
| Key entries | `index.html` = `5f918523b52e66c98fbd8e77b50cd5439d22cc24b403c617d1070c8c4dece50b`; `THIRD-PARTY-NOTICES.md` = `874bf7c10bdcadd0df0b50fc782f39f077669c6e41bbdbccd868409cd714dec3` |

`dist/` itself is **not** committed or uploaded — only the text manifest, the
build log, the sampler log and the evidence summary are retained (run link and
artifacts are primary). Comparison with the pod's no-sourcemap variant
(prior record): 3,921 files / 60 MB / 7,975 modules → canonical CI: 6,200 files
/ 130 MB / 8,137 modules. The module count differs because the prior record was
taken on the 2026-10-10 rendered-UI lineage; the module graph has since grown
(runtime-integration + product-completion commits), and this run is on the PR
merge ref. No further mechanism is claimed.

## 4a. Cross-run reproducibility (second run `38123005280`)

Pushing the evidence commit to the PR branch fired the workflow a second time
(`pull_request` synchronize). Run
[`38123005280`](https://github.com/payswapdotorg/UniCom/actions/runs/38123005280)
on the final lane head `dec078b12ba953a48480bc848588808324f7091d` (merge ref
`4d4b205b9e906e06a947fbdc6ef4f4feb41efc8c`, checked out as `GITHUB_SHA`;
run started 2026-10-11T07:55:19Z, completed 07:56:42Z, attempt 1, conclusion
**success**, all steps green) — a second, fully independent runner (runner id
1000024310 vs 1000024307, same image `ubuntu24/20261004.327.1`):

- Same toolchain (node v24.21.0, pnpm 10.33.2, vite 8.0.8, TypeScript 6.0.2),
  same runner image, **exit code 0**, `✓ built in` ~15 s.
- **Measured memory floor 10,624 MB** (min `MemAvailable` 10,879,868 kB over 28
  samples; ≥3,072 MB met at 3.5×).
- Output inventory **identical in shape**: 6,200 files, 136,479,625 bytes total
  (byte-for-byte the same total), 2,277 `.map` files, no `sourceMappingURL`
  references.
- Per-file cross-run comparison (both 6,200-line manifests joined on path):
  **6,196 of 6,200 files byte-identical (99.94 %)**. Exactly **4 files differ**
  — all four `.js.map` sourcemaps (`index-8QYfF3oL.js.map`,
  `pdf-viewer-dTT1arnd.js.map`, `previewPaneOfficeLegacyDocContent-guzpWPlW.js.map`,
  `previewPaneOfficeXlsxContent-DU4V7AUs.js.map`), whose emitted `.js` twins
  are byte-identical under the same content-hashed filenames. The differing
  entries are preserved in `logs/cross-run-manifest-diff.txt`.
- Consequently the **whole-output deterministic digest differs across runs**
  (run 1 `ccd620a9…7551`, run 2 `899c570c…4120`): the digest is reproducible
  for identical output but is sensitive to those 4 volatile map files. The
  mechanism of the map volatility (e.g. map-internal ordering in sourcemap
  generation) is **plausible but unverified** — no mechanism is claimed. All
  emitted JS/CSS bytes and chunk names are stable across runs.

Run 2's evidence summary and sampler log are retained as
`logs/run-38123005280-evidence-summary.txt` / `-memfloor.log`; its full
artifacts are `canonical-build-evidence` id `11695208912` (334,953 bytes zip,
90-day retention) on the run page.

## 5. Warnings (all non-fatal; exit 0)

From `logs/run-38122630570-build.log` and the job log, exactly:

1. **Node-builtin externalization** (`rolldown:vite-resolve`): `node:crypto`,
   `node:fs/promises`, `node:path`, `node:child_process`, `node:util`,
   `node:http` externalized for browser compatibility — all imported by
   `packages/experience/src/runtime/deployment/*` (journal-chain, rc-evidence,
   target-adapter) and `providers/jumia.ts`. This is the **known, deliberate**
   Node-only adapter isolation of the experience runtime (the J15
   browser-boundary design); externalization stubs are how the browser bundle
   stays safe. Not a new condition introduced by this run.
2. `INEFFECTIVE_DYNAMIC_IMPORT` — `../ui/src/previewPanePdfContent.tsx`
   dynamically imported by `WorkflowArtifactBody.tsx` but also statically
   imported by `previewPaneContent.tsx`.
3. **Chunk size** — "Some chunks are larger than 500 kB after minification"
   (pre-existing posture of the app bundle).
4. `PLUGIN_TIMINGS` — plugin time breakdown (vite:asset 45 %, vite:worker 29 %,
   vite:css-post 23 %).
5. **pnpm engine WARN during install** (not the build):
   `apps/zcode-cli | WARN Unsupported engine: wanted: {"node":"24.14.0"}
   (current: {"node":"v24.21.0"})` — `apps/zcode-cli/package.json` pins an exact
   engine (`"node": "24.14.0"`); the runner's Node 24.21.0 does not satisfy the
   exact pin. The **root** `engines: >=24.0.0` is satisfied; pnpm
   `engine-strict` is off by default, so this is a non-fatal warning on a
   pre-existing repo condition, documented here for honesty. It did not affect
   the build (exit 0).

No error of any kind appeared; no sourcemap, minify or verification setting was
changed by anyone — the workflow runs the repository's build script verbatim.

## 6. Attempt history (full, per the evidence laws)

| # | When (UTC) | What | Outcome |
|---|---|---|---|
| 1 | 2026-10-11 07:48:44Z | Workflow iteration 1 (branch commit `438c961`, PR #13 merge ref `6765511`): checkout → node 24 → corepack pnpm 10.33.2 → identity → sampler → `pnpm install --frozen-lockfile` → **`pnpm --filter @zcode/web build`** → sampler stop/floor → inventory → artifact upload | **SUCCESS** — run `38122630570`, all steps green, exit 0, floor 10,372 MB |
| 2 | 2026-10-11 07:55:19Z | Same workflow (no changes), re-fired by the evidence-docs push (`pull_request` synchronize; head `dec078b`, merge ref `4d4b205`) | **SUCCESS** — run `38123005280`, all steps green, exit 0, floor 10,624 MB, output shape identical (§4a) |

There were exactly **two** workflow runs on this lane — same workflow file,
zero fixes/retries — both first-attempt successes. (Docs-only pushes to the PR
branch re-trigger the workflow by design; every future run is observable on
the run page and the TL's merge of PR #13 will fire the definitive one on
`main` — see §10.) (The prior **local** attempt history — 13 OOM-killed pod
attempts — is the immutable record
`docs/rendered-ui/vite-build/VITE-PRODUCTION-BUILD-RECORD-2026-10-10.md` and is
incorporated by reference in §7, not duplicated or rewritten here.)

## 7. Why CI is the canonical environment (pod limitation, restated honestly)

The development pod **cannot** produce this evidence, and that is recorded
fact, not speculation: its measured **absolute ceiling is 2,550 MB
`MemAvailable`** with every pausable infrastructure component paused (CDP
chrome ring + all replay watch daemons; only the mandated `:3000` console dev
server and `replayd :3100` remain). The canonical build completes the
`transforming` phase and is then killed by the pod's global OOM killer during
chunk rendering / hidden-sourcemap generation — **reproducibly, in 13 attempts**
across heap caps 1,024–2,800 MB and thread limits; the isolated cause is the
hidden-sourcemap generation phase, which the `--sourcemap false` variant
avoids (that variant succeeds in ~11 s but is **not** canonical evidence —
`docs/rendered-ui/vite-build/VITE-PRODUCTION-BUILD-RECORD-2026-10-10.md`).

The repo is public with GitHub Actions enabled, so the standard
`ubuntu-latest` runner (4 vCPU / 16 GB, free for public repos, no paid
infrastructure) is the canonical evidence environment. The measured floor on
that runner (10,372 MB) is **4.07×** the pod's absolute ceiling — the exact
headroom gap the sourcemap phase needs.

## 8. Build-only workflow — self-audit (what the workflow can never do)

The workflow (`.github/workflows/canonical-web-build.yml`, quoted facts):

- `permissions: contents: read` — the **only** permission granted; the job
  never mutates the repository.
- The three action uses are `actions/checkout@v7` (read-only checkout),
  `actions/setup-node@v7` (toolchain) and `actions/upload-artifact@v7`
  (evidence upload) — **no** deploy/publish/push/registry actions, **no**
  `secrets.*` reference anywhere in the file (grep-verified), **no** external
  services, **no** caches written, **no** paid runners (`ubuntu-latest`).
- Triggers: `push: branches: [main]`, `pull_request: branches: [main]`,
  `workflow_dispatch` — nothing else.
- `timeout-minutes: 30`.
- The build step runs `pnpm --filter @zcode/web build` with **no** CLI
  overrides, **no** env overrides (no `ZCODE_ENV`, no `NODE_OPTIONS`), and the
  config's sourcemap policy is untouched: the emitted inventory in §4 proves
  2,277 `.map` files exist with zero `sourceMappingURL` references — hidden
  sourcemaps **on**, exactly canonical.
- Uploaded artifacts are four small text files (`evidence-summary.txt`,
  `build.log`, `memfloor.log`, `dist-manifest-sha256.txt`; 335,133 bytes
  zipped, 90-day retention). `dist/` is never uploaded, never committed.

## 9. Evidence pointers

- **CI run (primary):** https://github.com/payswapdotorg/UniCom/actions/runs/38122630570 —
  conclusion `success`, attempt 1, all steps green. Per-step log available via
  the run page and the API logs endpoint.
- **PR:** https://github.com/payswapdotorg/UniCom/pull/13 (open; the TL owns
  the merge — see §10).
- **Artifacts:** `canonical-build-evidence` (id `11696235500`,
  335,133 bytes): `evidence-summary.txt`, `build.log` (312,377 B),
  `memfloor.log` (756 B), `dist-manifest-sha256.txt` (620,559 B). Download
  via the run page or
  `https://api.github.com/repos/payswapdotorg/UniCom/actions/artifacts/11696235500/zip`.
- **Retained raw logs (this directory):**
  - `logs/run-38122630570-full-job-log.txt` — the complete job log with
    timestamps (446,509 B).
  - `logs/run-38122630570-build.log` — the tee'd canonical build output
    (312,377 B; includes the `✓ 8137 modules transformed` / `✓ built in
    14.59s` lines and every warning of §5).
  - `logs/run-38122630570-memfloor.log` — the 27 raw `MemAvailable` samples.
  - `logs/run-38122630570-evidence-summary.txt` — the workflow's own summary
    sheet (identity + timings + floor + inventory + digest).
  - `logs/run-38122630570-dist-manifest-sha256.txt` — all 6,200 per-file
    SHA-256 hashes.
- **Prior immutable record (incorporated by reference):**
  `docs/rendered-ui/vite-build/VITE-PRODUCTION-BUILD-RECORD-2026-10-10.md`.

## 10. TL merge-time obligations (gate sign-off)

1. **The definitive gate run is on the merged commit.** Merging PR #13 to
   `main` fires the workflow's `push` trigger automatically on the merge
   commit; that run (not this PR-merge-ref run) is the evidence the TL should
   capture for the BUILD acceptance gate on the final merged lineage, per
   W1-013's "independently rerun the final command on the final merged commit".
   This record's run already proves the canonical command + environment
   capability; the merged-commit run closes the loop.
2. The TL independently verifies this record's numbers against the run page /
   artifacts before marking BUILD PASS (work-order acceptance: "TL
   independently reproduces and signs off").
3. Optional additional evidence at merge time: `workflow_dispatch` re-runs are
   available on `main` after merge for repeatable reproduction; the
   deterministic digest (`ccd620a9…7551`) is reproducible for identical
   content on the same lineage (content-hash inputs: file bytes, sorted paths,
   types, modes — see `scripts/deterministic-tar-archive.mjs`).
4. If the TL instead judges the PR-merge-ref run insufficient (base `558a4f0`
   is docs-only, lane content identical), the merged-commit run from (1)
   supersedes it; both are preserved — this record is never rewritten.

## 11. What is and is not claimed

**Claimed:** the unchanged canonical production build command, with the
repository's unchanged vite configuration (hidden sourcemaps ON), exits 0 in
74 s wall-clock job time (16 s build phase) on a clean GitHub-hosted
`ubuntu-latest` runner, with a measured free-memory floor of **10,372 MB**
(≥ 3,072 MB required) during the build's peak phase, producing 6,200 files /
136,479,625 bytes including 2,277 hidden sourcemaps, fully inventoried by
per-file SHA-256 and a deterministic whole-output digest.

**Not claimed:** production readiness, deployment, or any change to the build
policy (none was made or needed); nothing here modifies `packages/**`,
`vite.config.ts`, or any build script. The BUILD acceptance gate's PASS/FAIL
marking belongs to the TL per the work-order acceptance criteria; this record
supplies the required evidence in full.

## 11. DEFINITIVE final-merged-commit run (TL-captured at closeout)

The phase's three lanes were merged to `main` (three `--no-ff` merge commits + the THIRD-PARTY-NOTICES record, final lineage **`29c7ae7`**), the merged regression battery + real-browser gates were run on that tree (see `../merged-gate/`), and pushing `main` auto-fired the workflow's `push` trigger on exactly that commit:

| Field | Value |
|---|---|
| Run / job | [38131004309](https://github.com/payswapdotorg/UniCom/actions/runs/38131004309) / job 114445145053 |
| Head commit | `29c7ae7` (the final merged lineage — the gate-relevant tree, identical module sources to the battery/browser-gate tree) |
| Command | `pnpm --filter @zcode/web build` (unchanged canonical config, hidden sourcemaps) |
| Exit code | **0** |
| Measured memory floor | **10,873 MB** (≥3,072 MB required — 3.5×) |
| Modules / build time | 8,144 transformed / ✓ built in 14.27 s |
| Output inventory | 6,200 files / 137,124,002 bytes (~130.8 MB) |
| Source-map posture | `SOURCEMAP_URL_COMMENTS=absent (hidden sourcemap posture confirmed)` — zero `sourceMappingURL` references |
| Deterministic dist SHA-256 | `5f5e5248bdc9953e1455f80905e1d92470638ff6a0200d1a051de0d803768deb` |
| Job window | 2026-10-11T10:10:36Z → 10:11:50Z (74 s) |

The lane-content runs 1–3 (§10) plus this final-commit run together demonstrate the canonical build reproducibly succeeds at 10.3–10.9 GB measured free memory — the pod-local blocker (2,550 MB ceiling, 13 OOM-killed attempts preserved in `docs/rendered-ui/vite-build/`) is superseded by CI evidence on the public-repo runner. The BUILD gate is recorded PASSED on this evidence.
