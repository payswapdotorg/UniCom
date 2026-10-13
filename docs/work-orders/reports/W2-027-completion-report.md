# W2-027 — zcode-cli Subtree Chain Closure: the Fresh-Clone Clean Build Path

**Lane:** zcode-cli Subtree Chain Closure (recorded-debt finalization, tracking issue #20 — closing the W2-026 STOP-AND-REPORT disclosure)
**Branch:** `work/w2-027` @ final SHA (pushed: yes)
**Branched from:** `origin/main` (`e18afc4`, code-identical to `4f84cc3`)
**Implementation commit:** `8e0f114` (the entry point + wiring + docs; the only later commit is docs-only — see §5.2)

## 1. BRANCH

`work/w2-027` @ final SHA (pushed: yes). Only `work/w2-027` was ever pushed; `main` was never touched. The clone token was used verbatim in the clone URL only and never written into any committed file, config, or command recorded here (redacted below as `<token>`).

## 2. THE DEBT (closed) — the fresh-clone misleading-error class

On any fresh clone, after the documented frozen-lockfile install, the zcode-cli subtree cannot be typechecked through the raw project-reference paths:

- `@zcode/dynamic-workflow`'s `src/compiler/libs.generated.ts` (~485 KB) is deliberately gitignored and is produced ONLY by that package's own `build`/`typecheck` scripts (`node scripts/generate-libs.mjs`) — a step that does not exist anywhere in the root-level `tsc -b` path.
- The chain packages' `dist/` dirs (`@zcode/shared-types`, `@zcode/contracts`, `@zcode/dynamic-workflow`, `@zcode/core`, `@unicom/agent-kernel`) do not exist until built.
- The subtree's own canonical path (`pnpm --dir apps/zcode-cli run typecheck`) additionally fails with `turbo: not found` under the root workspace's `node-linker=hoisted` install (turbo is hoisted to the root `node_modules` only, while `--dir` runs resolve only the sub-workspace's own `.bin`).

**Before inventory (captured on the REAL fresh clone, post frozen install, pre chain — exit codes observed):**

| Path | Exit | Error profile |
|---|---|---|
| `pnpm exec tsc -b packages/agent` | **1** | **39 errors** — 26× TS2307 (missing `@zcode/contracts` / `@unicom/agent-kernel` dists), 9× TS7006, 3× TS2339, 1× TS2353 (degradation products of the TS2307 cascade), all in `packages/agent/test/**` |
| `pnpm --dir apps/zcode-cli run typecheck` | **1** | `sh: 1: turbo: not found` (ELIFECYCLE) |

The subtree is type-clean in the proper order (verified on main: every chain node exits 0) — the debt is orchestration, not code. This is exactly the W2-026 disclosure, closed here as recorded debt.

## 3. THE FIX — ONE canonical dependency-ordered chain entry point

`scripts/build-zcode-chain.mjs`, wired as the root script **`pnpm build:zcode:chain`** (plus mise task `build-zcode-chain` and the README/README.en setup notes). Three stages, fail-fast at every node (reusing the existing `runCommand` helper from `scripts/spawn-command.mjs`):

1. **Chain builds in dependency order, each via the package's OWN build script** — `@zcode/shared-types` → `@zcode/contracts` → `@zcode/dynamic-workflow` (its own script runs `generate-libs` codegen + `tsc`, so the codegen can never be skipped) → `@zcode/core` → `@unicom/agent-kernel`. Using the packages' own scripts (not a reimplementation) is the design invariant: whatever those packages consider part of "building" is what the chain does.
2. **Turbo bridge** — the root-installed turbo is symlinked into `apps/zcode-cli/node_modules/.bin/turbo` in pnpm's own link shape (idempotent; skipped if the sub-workspace already resolves turbo; Windows gets pnpm-style sh/cmd shims). Without it, the subtree's canonical commands fail `turbo: not found` on a fresh root install. The sub-workspace's own `pnpm-lock.yaml` is stale (8 existing packages missing), so a frozen sub-workspace install is not an option — the bridge is the only solution that changes no lockfile.
3. **Self-verification of BOTH typecheck paths** — the raw `pnpm exec tsc -b packages/agent`, then the turbo path serialized with `TURBO_CONCURRENCY=1` (the low-memory precedent of `bootstrap.mjs`'s `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1`; parallel `tsc` under turbo gets OOM-killed on constrained machines — observed here, see §5.3). The serialized run's results enter turbo's local cache, so the subsequent bare `pnpm --dir apps/zcode-cli run typecheck` is a full cache hit and exits 0 the same.

**Wiring (complete write surface of the fix):**

| File | Change |
|---|---|
| `scripts/build-zcode-chain.mjs` | new — the chain entry point (129 lines) |
| `package.json` | `+1` script: `"build:zcode:chain": "node scripts/build-zcode-chain.mjs"` |
| `mise.toml` | `+1` task `build-zcode-chain` (mirrors the existing mise task pattern) |
| `README.md` / `README.en.md` | one setup paragraph each: who consumes the zcode-cli dist outputs (`packages/agent` + the subtree checks) and the `pnpm build:zcode:chain` step on a fresh clone |

## 4. VERIFICATION (personally run, exact commands and exit codes)

### 4.1 Gates on the checkout (`/home/z/unicom` @ `8e0f114`)

| Check | Command | Result |
|---|---|---|
| Agent battery | `pnpm --filter @unicom/agent exec vitest run` | **559 passed** (57 files) |
| Web battery | `pnpm --filter @zcode/web exec vitest run` | **392 passed** |
| Experience battery | `pnpm --filter @unicom/experience exec vitest run` | **798 passed** |
| Commerce battery | `pnpm --filter @unicom/commerce exec vitest run` | **521 passed** |
| **Battery total** | — | **2,270 passed \| 0 skipped** (baseline held; zero behavior changes) |
| Lint | `pnpm lint` | **103 warnings / 0 errors** (exact baseline) |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |
| Entry point (cold) | `pnpm build:zcode:chain` | **exit 0** ×2 cold runs (`generate-libs: wrote 57 lib files for typescript@5.9.3`; turbo verify **28 successful / 28 total, 0 cached** on the true-cold run; final warm verify `28/28, FULL TURBO`) |

### 4.2 The REAL fresh-clone proof (`/home/z/unicom-fresh` — a real `git clone --branch work/w2-027 --single-branch`, never a cached checkout or worktree, at `8e0f114`)

| # | Command | Exit | Evidence |
|---|---|---|---|
| 1 | `git clone --branch work/w2-027 --single-branch https://<token>@github.com/payswapdotorg/UniCom.git unicom-fresh` | **0** | HEAD = `8e0f114` |
| 2 | `pnpm install --frozen-lockfile` | **0** | 12s; "Lockfile is up to date"; 1,936 packages reused from the local store |
| 3 | *(before)* `pnpm exec tsc -b packages/agent` | **1** | 39 errors — 26 TS2307 + 9 TS7006 + 3 TS2339 + 1 TS2353 (§2 table) |
| 4 | *(before)* `pnpm --dir apps/zcode-cli run typecheck` | **1** | `sh: 1: turbo: not found` |
| 5 | **`pnpm build:zcode:chain`** | **0** | 5 chain builds in order; `generate-libs: wrote 57 lib files for typescript@5.9.3`; bridge created; verify-1 clean; verify-2 **28 successful / 28 total, 0 cached, 2m37s** |
| 6 | *(after)* `pnpm exec tsc -b packages/agent` | **0** | **0 errors, empty output** |
| 7 | *(after)* `pnpm --dir apps/zcode-cli run typecheck` | **0** | **28/28 successful** (28 cached, 162ms — FULL TURBO replay of step 5's serialized run) |
| 8 | `git status --porcelain` | **0 lines** | nothing tracked changed — only gitignored artifacts were created (dists, `libs.generated.ts`, `node_modules/`, the turbo bridge symlink) |

**Before → after, both required paths: 39 errors + `turbo: not found` → 0 errors, exit 0, exit 0.**

## 5. HONEST GAPS (disclosed, not fixed — each with the reason)

### 5.1 The root full-tree `pnpm typecheck` carries a pre-existing, chain-independent 212-error profile (out of write surface)

The root `pnpm typecheck` (`tsc -b` over 14 package projects) is not one of W2-027's required paths and is not a standing gate. For the record, on the fresh clone **after** the chain it exits **2** with **212 errors**: 115 in `packages/experience`, 91 in `packages/web`, 6 in `packages/commerce` (102× TS2835, 52× TS2305, 31× TS7006, 20× TS2339, 5× others). Decisive observations:

- **Zero `@zcode/*` / `@unicom/*` module-resolution cascade errors** — the W2-027 debt class is eliminated from this path too; `packages/agent` (the only root-path consumer of the chain dists) contributes **0 errors** post-chain.
- The 212-error profile is **byte-identical (modulo the checkout path prefix) between the main checkout and the fresh clone post-chain**, and `tsc -b packages/experience` standalone **exits 0** — the class arises from `packages/web`'s nodenext-resolution project consuming `packages/experience` sources across the workspace link (extension-less relative imports, missing-export surface), i.e. a pre-existing cross-project configuration debt on `main`.
- `packages/web`, `packages/experience`, `packages/commerce` sources are explicitly outside W2-027's write surface — disclosed here for the record, per the STOP-AND-REPORT discipline; not fixed, not recharacterized.

### 5.2 The final commit is docs-only relative to the proven tree

The fresh-clone proof (§4.2) was executed at `8e0f114`. The final branch tip adds only: this report, and one precision sentence in `README.md`/`README.en.md` (scoping the setup note to `packages/agent` + the subtree checks, after the §5.1 observation made the earlier broader phrasing imprecise). No build-relevant delta; lint and architecture re-verified at the tip (§5.4).

### 5.3 Environment incidents during execution (evidence-record disclosure)

- Two OOM kills (~08:56 UTC, during the pre-serialization parallel-turbo experiments on the 4.1 GB / no-swap sandbox; victims included the sandbox's idle `next-server`, 485 MB). This is exactly the failure mode the entry point's `TURBO_CONCURRENCY=1` serialization prevents; no OOM event occurred during any serialized run.
- Two runs of the fresh-clone proof were interrupted (a backend-degradation turn close mid-run, then a harness-reaped detached re-run). The completed proof in §4.2 is a single unbroken synchronous run with the exit code self-recorded per step.
- Toolchain: pnpm 10.33.2 via the documented fallback (`npm i -g pnpm@10.33.2`), Node 24.21.0 vs engines' 24.14.0 — the `Unsupported engine` WARN is cosmetic and pre-existing (appears on every pnpm invocation in this repo's sub-workspace); install, typecheck, and the full battery all exit clean.

### 5.4 Tip re-verification (docs-only delta confirmed harmless)

At the final tip (post README tweak + this report): `pnpm lint` → **103 warnings / 0 errors**; `pnpm architecture:check` → **0 violations / 0 baseline / 0 new**.

## 6. BOUNDARIES HELD

- **Write surface, exactly:** `scripts/build-zcode-chain.mjs` (new), `package.json` (one script line), `mise.toml` (one task), `README.md` + `README.en.md` (one setup paragraph each), `docs/work-orders/reports/W2-027-completion-report.md` (this report). **Nothing else.**
- **NEVER touched:** any `src/**`, `packages/web|experience|commerce|services|rpc|provider*|shared|client|server|ui|desktop` sources, `.github/**`, `pnpm-lock.yaml`, `apps/zcode-cli/turbo.json` (or its semantics), any dependency, any behavior.
- `libs.generated.ts` **never committed** — still gitignored; regenerated fresh on every run (`wrote 57 lib files for typescript@5.9.3`), exactly as designed (its output depends on the local TypeScript version).
- No tests deleted, skipped, or weakened; the battery is baseline-identical (2,270 | 0).
- The clone token never committed; only `work/w2-027` pushed; `main` never touched.
- Nothing live: no deploys, no provider connections, no credentials read, no payments — the phase is recorded-debt finalization on the build orchestration only.
