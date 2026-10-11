# W1-013 Completion Report — Canonical Vite Production-Build Evidence

Work order: `docs/work-orders/W1-013.md` · Lane: worker-1 · Branch:
`work/w1-013` (base `604fae5` = the operator handoff state; `438c961` workflow
+ evidence commits beneath this report). Status: lane work COMPLETE, pushed to
origin, **PR [#13](https://github.com/payswapdotorg/UniCom/pull/13) open — not
merged (TL owns merges)**.

Phase: Product Completion & Build Readiness (issue #12). State authority:
`docs/development-state/product-completion-state.json` (BUILD acceptance gate).
Canonical evidence record:
`docs/product-completion/build/CANONICAL-BUILD-RECORD-2026-10-11.md`.

## 1. What this lane delivered

Proof that the **canonical, unchanged** Vite production build —
`pnpm --filter @zcode/web build` (hidden sourcemaps per
`packages/web/vite.config.ts` production posture) — **succeeds with exit code 0
in an environment whose measured free-memory floor is 10,372 MB**, captured as
a reproducible, build-only GitHub Actions workflow with full run evidence.

The development pod cannot produce this evidence (measured absolute ceiling
2,550 MB `MemAvailable`; 13 OOM-killed local attempts preserved in
`docs/rendered-ui/vite-build/VITE-PRODUCTION-BUILD-RECORD-2026-10-10.md`), so
the primary path chosen — exactly as the TL's dispatch log anticipated — is a
**build-only workflow on the public repo's `ubuntu-latest` runners**
(4 vCPU / 16 GB, free, no paid infrastructure).

## 2. Evidence table (all numbers personally observed from the run logs)

| Evidence item | Value |
|---|---|
| Exact command | `pnpm --filter @zcode/web build` (no overrides, no `NODE_OPTIONS`, no env changes) |
| Workflow commit (branch) | `438c961760a069e945b860e39328fb9a405348df` |
| CI run / conclusion | Run [`38122630570`](https://github.com/payswapdotorg/UniCom/actions/runs/38122630570) — **success**, attempt 1/1, event `pull_request` (PR #13), all 12 steps green |
| Build commit (checked out) | `67655115a02e373b949dec412267340ec1054c7d` (`refs/pull/13/merge` = `438c961` into base `558a4f0`, docs-only base delta) |
| Runner | `ubuntu-latest`, image `ubuntu24/20261004.327.1`, Ubuntu 24.04.5 LTS, `nproc`=4, 16 GB (public-repo standard runner) |
| Toolchain | Node `v24.21.0` (major-pinned 24) · pnpm `10.33.2` (corepack, repo `packageManager`, version-asserted) · Vite `8.0.8` (web-resolved) · TypeScript `6.0.2` |
| Start / end (UTC) | Job 07:48:47Z → 07:50:01Z (74 s); build phase 07:49:33Z → 07:49:49Z (`✓ built in 14.59s`); install 37.1 s |
| Exit code | **0** (`CANONICAL_BUILD_EXIT_CODE=0` in job log + artifacts) |
| **Measured memory floor** | **10,372 MB** (min `MemAvailable` 10,621,832 kB over 27 × 2 s samples spanning install **and** build; minimum lands ~07:49:46Z, inside the build's sourcemap/rendering phase; requirement ≥3,072 MB → met at 3.4×) |
| Output inventory | 6,200 files · 136,479,625 bytes (~130.1 MB) · 2,277 `.map` files · **zero** `sourceMappingURL` references in emitted js/mjs/css (hidden-sourcemap posture **confirmed, not weakened**) |
| Manifest / digest | 6,200-line per-file SHA-256 manifest retained; deterministic whole-output digest `ccd620a9fcda25b084ccf8edf2e6ac9cf07fd38fb9ee1c4e92151829f6a57551` (repo's own `scripts/deterministic-tar-archive.mjs`) |
| Warnings | 5 non-fatal classes (node-builtin externalization from the Node-only experience-runtime adapters — the known J15 boundary; `INEFFECTIVE_DYNAMIC_IMPORT`; chunk-size >500 kB; `PLUGIN_TIMINGS`; a pre-existing pnpm engine WARN: `apps/zcode-cli` pins exactly `node 24.14.0` vs runner 24.21.0 — root `engines >=24.0.0` satisfied, install continued, build unaffected) |
| Artifacts | `canonical-build-evidence` (id 11696235500, 335,133 B): evidence-summary, build.log, memfloor.log, dist-manifest (90-day retention); **`dist/` never uploaded/committed** |
| Raw logs retained | `docs/product-completion/build/logs/run-38122630570-*` (full job log 446 KB, build log 312 KB, memfloor 27 samples, evidence summary, dist manifest 620 KB) + run-2 summary/memfloor + cross-run diff |
| Second run (reproducibility) | Run [`38123005280`](https://github.com/payswapdotorg/UniCom/actions/runs/38123005280) on final lane head `dec078b` (merge ref `4d4b205`): **success**, exit 0, floor **10,624 MB**, same 6,200 files / 136,479,625 bytes / 2,277 maps — **6,196/6,200 files byte-identical** across the two independent runners (only 4 `.js.map` files differ; JS/CSS bytes + chunk names stable; whole-output digest differs cross-run: `899c570c…4120` vs `ccd620a9…7551`) |

## 3. Workflow self-audit (build-only laws — quoted facts)

`.github/workflows/canonical-web-build.yml` (sha256
`198d92877e985b1c73814ada719f7b6fcf88034862c90a05a1519a6c7db29998`):

- `permissions: contents: read` — the **only** permission in the file.
- Uses exactly three actions: `actions/checkout@v7`, `actions/setup-node@v7`,
  `actions/upload-artifact@v7` — no deploy/publish/push/registry actions.
- **Zero** `secrets.*` references (grep-verified); no credentials; no external
  side effects; no cache writes; no paid runners; `timeout-minutes: 30`.
- Triggers: `push: [main]`, `pull_request: [main]`, `workflow_dispatch` only.
- The canonical build step contains **no** CLI/env overrides: the emitted
  inventory (2,277 maps, zero sourceMappingURL comments) is mechanical proof
  the hidden-sourcemap policy stayed on.

## 4. Attempt history + honest gaps / limitations

1. **Two workflow runs, zero workflow fixes** — both first-attempt successes
   (run 1 on the workflow commit's merge ref, run 2 auto-fired by the evidence
   push on the final lane head). The attempt table in the canonical record has
   two rows, both SUCCESS; nothing was retried-away or hidden. Docs-only pushes
   re-trigger the PR workflow by design — every run is observable on the run
   page.
2. **The run is on the PR merge ref** (`6765511` = `438c961` + the docs-only
   base `558a4f0`), not on a merged-main commit. The lane was forbidden from
   merging; the definitive gate run on the final merged commit is the TL's
   (§5). The content difference vs the branch head is a registry-JSON/docs
   commit — no build-input difference — but this is disclosed rather than
   glossed.
3. **Module count differs from the prior pod record** (8,137 here vs 7,975 on
   2026-10-10): the prior record's lineage predates the runtime-integration
   merge and this run includes it. Disclosed as lineage difference; no
   mechanism claimed.
4. **Cross-run output reproducibility is observed, not just asserted**: two
   independent runners produced identical path sets, identical total byte
   count and 6,196/6,200 byte-identical files; exactly 4 `.js.map` sourcemaps
   differ between runs (their `.js` twins are byte-identical), so the
   whole-output deterministic digest is run-sensitive. The mechanism of the
   map volatility is plausible-but-unverified and **no mechanism is claimed**;
   the differing entries are preserved in
   `docs/product-completion/build/logs/cross-run-manifest-diff.txt`. A digest
   comparison across runs must therefore use the per-file manifest (stable)
   rather than the whole-output digest.
5. **The pod's canonical-build blocker stands as recorded** — this lane did
   not (and could not) run the canonical build locally; the 13-attempt
   immutable record remains the local truth and CI is the canonical
   environment (§7 of the canonical record).
6. **No source changes at all**: the write surface actually used was
   `.github/workflows/canonical-web-build.yml` +
   `docs/product-completion/build/**` + this report. `packages/**`,
   `vite.config.ts`, build scripts and sourcemap policy untouched.

## 5. Merge-time notes for the TL

1. **Merging PR #13 auto-triggers a fresh canonical run on the merged main
   commit** (the workflow's `push: [main]` trigger). The TL **must capture that
   run** as the definitive BUILD-gate evidence for the final merged lineage
   (W1-013 acceptance: "independently rerun the final command on the final
   merged commit") — expect it to supersede run `38122630570`, which stays
   preserved as the lane's PR-merge-ref evidence. Suggested capture: run URL +
   floor + exit code + digest appended to the canonical record's lineage (the
   record's §10 already reserves this).
2. TL sign-off sequence per the work order: verify this record's numbers
   against the run page/artifacts, then mark the BUILD gate. The measured
   floor criterion (≥3,072 MB) is met at 10,372 MB with exit 0.
3. `workflow_dispatch` is available on `main` after merge for repeatable
   reproduction at any time; the deterministic digest makes cross-run output
   comparison mechanical.
4. Optional TL cleanup, **not** required by this lane: the pre-existing
   `apps/zcode-cli` exact engine pin (`node 24.14.0`) produces a non-fatal
   pnpm WARN on any Node ≥ 24.15 runner. It is outside this lane's write
   surface; recorded here so the TL can decide (widen to `>=24.14.0` or
   leave as-is).

## 6. Boundaries held

Write surface: `.github/workflows/canonical-web-build.yml`,
`docs/product-completion/build/**` (record + raw logs) and this report only.
No application source, no `vite.config.ts`/build-script/sourcemap changes, no
deploy/publish/secrets/paid infra, no mutations of production anything, no
push to `main`, PR left open for the TL, no edits to
`docs/development-state/**` or other lanes' files, prior-phase records linked
never rewritten. All reported numbers were personally observed in the run
logs/artifacts downloaded from the GitHub API.
