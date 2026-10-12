# W2-026 — Verification Hardening II: the Agent Package's Fresh-Environment Clean Build

**Lane:** Verification Hardening (the program's recorded-debt closure), tracking issue #19
**Branch:** `work/w2-026` @ final SHA (pushed: yes)
**Branched from:** `origin/main` (`fa4650c`)

## 1. BRANCH

`work/w2-026` @ final SHA (pushed: yes)

## 2. THE ERROR-CLASS TABLE

The work order described the debt as "~40 TS2339 errors in `scripted-model.ts`." The actual fresh-clone state shows a DIFFERENT error profile — the errors are a TS2307 cascade from unbuilt workspace dependencies, not TS2339 type-definition errors. The detailed breakdown:

| Error class | Count (fresh) | Root cause | The fix |
|---|---|---|---|
| TS2307 (Cannot find module) | 26 | `@zcode/contracts`, `@unicom/agent-kernel`, `@zcode/core` packages not built on fresh install (their `dist/` dirs are gitignored) | Build the dependency chain (`shared-types` → `dynamic-workflow` → `core` → `contracts` → `agent-kernel`) — this is an environment setup step, NOT a code change |
| TS7006 (implicit any) | 9 | Cascaded from TS2307: when imported types are `any`, callback parameters lose their inferred types | Fixed automatically when the TS2307 cascade is resolved (the deps provide the real types) |
| TS2339 (Property does not exist) | 3 | `providerId`, `modelId`, `generateText` on `ScriptedModel` — cascaded from `Model` being `any` when `@zcode/contracts` can't be resolved | Fixed automatically when `@zcode/contracts` is built (the `Model` type becomes resolvable, `ScriptedModel extends Model` inherits the fields) |
| TS2353 (Object literal may only specify known properties) | 1 | `providerId` in the `createScriptedModel` return — same cascade as TS2339 | Fixed automatically when the TS2307 cascade is resolved |

### The ONE type-level fix (in the write surface)

| Error site | The fix | The intent note |
|---|---|---|
| `packages/agent/test/runtime/support/harness.ts:30` — `import type { AgentRuntime, ToolRegistry } from "@zcode/core"` (TS2307) | Replaced the `@zcode/core` import with type aliases derived from `UnicomInstalledRuntime`: `type AgentRuntime = UnicomInstalledRuntime["runtime"]; type ToolRegistry = UnicomInstalledRuntime["registry"];` | `AgentRuntime` and `ToolRegistry` are used ONLY as type annotations on the `RuntimeHarness` interface (lines 162, 164). The actual values come from `installed.runtime` and `installed.registry` (from `UnicomInstalledRuntime`). Deriving the types from `UnicomInstalledRuntime` preserves the exact runtime type contract without depending on `@zcode/core`'s dist. This is a type-level fix — zero behavior change. The `@zcode/core` package has its own TS7006 src errors (out of this lane's surface) that prevent it from building on a fresh install; the derived type eliminates the direct dependency. |

## 3. THE FRESH-CLONE PROOF

**The exact commands + before/after:**

```bash
# Step 0: fresh clone + install (the fresh worktree)
git clone https://github.com/payswapdotorg/UniCom.git && cd UniCom
corepack pnpm install --frozen-lockfile

# Step 1: BEFORE — agent tsc on fresh install (no deps built)
corepack pnpm --filter @unicom/agent exec tsc -p .
# Result: 39 errors (26 TS2307 + 9 TS7006 + 3 TS2339 + 1 TS2353), exit 2

# Step 2: build the dependency chain (the environment setup — NOT code changes)
corepack pnpm --filter @zcode/shared-types build      # exit 0
corepack pnpm --filter @zcode/dynamic-workflow build   # exit 0
corepack pnpm --filter @zcode/core build              # exit 0
corepack pnpm --filter @zcode/contracts build          # exit 0
corepack pnpm --filter @unicom/agent-kernel build     # exit 0

# Step 3: AFTER — agent tsc with deps built + the harness.ts fix
corepack pnpm --filter @unicom/agent exec tsc -p .
# Result: 0 errors, exit 0
```

**Before:** 39 errors, exit 2.
**After:** 0 errors, exit 0.

## 4. VERIFICATION

| Check | Command | Result |
|---|---|---|
| Agent tsc (fresh, no deps built) | `pnpm --filter @unicom/agent exec tsc -p .` | **39 errors, exit 2** (the BEFORE state) |
| Agent tsc (after building deps + harness.ts fix) | `pnpm --filter @unicom/agent exec tsc -p .` | **0 errors, exit 0** |
| Agent vitest | `pnpm --filter @unicom/agent exec vitest run` | **559 passed** (57 files) — baseline 559, zero behavior changes |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — exact baseline, 0 new warnings |
| Architecture | `pnpm architecture:check` | **0 violations / 0 baseline / 0 new** |

## 5. HONEST GAPS + BOUNDARIES HELD

### Honest gaps

1. **The work order's description of the debt doesn't match reality.** The order says "~40 TS2339 errors in `scripted-model.ts`" — but the actual errors are a TS2307 cascade from unbuilt workspace dependencies. The `scripted-model.ts` file has NO type-definition errors once the deps are built; the TS2339/TS2353 errors were cascaded from `Model` being `any` when `@zcode/contracts` couldn't be resolved.

2. **The "fresh-worktree proof" requires building the dependency chain.** On a truly fresh clone (no `dist/` anywhere), `tsc -p packages/agent` fails with 39 errors because the workspace dependencies (`@zcode/contracts`, `@unicom/agent-kernel`, `@zcode/core`) aren't built. The `dist/` directories are gitignored. The fix is to build the chain: `shared-types` → `dynamic-workflow` → `core` → `contracts` → `agent-kernel` (each depends on the previous). This is an environment setup step, not a code change. The work order's battery (`tsc -p .` BEFORE/AFTER) doesn't mention this build step — it's the honest prerequisite.

3. **The `@zcode/core` package has its own TS7006 src errors** (in `apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts` etc.) that were present BEFORE this lane and are NOT fixed by this lane (out of surface — the write surface is `packages/agent/test/**` only). These errors prevent `@zcode/core` from building on a truly fresh install unless `@zcode/shared-types` and `@zcode/dynamic-workflow` are built first (the build order matters). My `harness.ts` fix removes the DIRECT `@zcode/core` import, but the INDIRECT dependency (through `@unicom/agent-kernel`'s dist) remains — so the full build chain is still needed.

4. **My `harness.ts` fix is technically not required** for the agent tsc to pass (once the deps are built, the `@zcode/core` import resolves successfully). However, the fix is still valuable: it removes a direct dependency on a package (`@zcode/core`) that has build issues, making the test files more resilient. The fix is a type-level change (replacing an import with a derived type alias) — zero behavior change.

### Boundaries held

- **Write surface:** `packages/agent/test/runtime/support/harness.ts` (the one type-level fix) + `docs/work-orders/reports/W2-026-completion-report.md` (this report). NOTHING else.
- **NEVER touched** `packages/agent/src/**` (zero src touches — the stop-and-report rule was not triggered). NEVER touched `packages/experience/**`, `packages/web/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`, `apps/zcode-cli/packages/**` (the dependency packages' src errors are out of surface).
- **Type-level fixes only:** the `harness.ts` change replaces an `import type` with a derived type alias — zero behavior change, zero refactors, zero renames, zero new abstractions, zero new dependencies.
- **The agent vitest battery is identical** (559|0 — zero behavior changes).
- **No provider names.** No token commits. Pushed only to `work/w2-026`.
