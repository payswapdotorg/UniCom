# W1-011 — vite build smoke record (BLOCKED: pod OOM)

Task law for the finishing vehicle: "`corepack pnpm --filter @zcode/web build`
succeeds; record output size." The honest outcome on this pod is **BLOCKED** —
the build is OOM-killed at the OS level in every attempt, by the global OOM
killer, after the full 7812-module transform completes. This record is the
evidence; no output size exists to record because no bundle was emitted.

## Attempts (all real, all logged in this session, 2026-10-10 ~11:05–11:20Z)

| # | command variant | heap cap | failure point | exit |
|---|---|---|---|---|
| 1 | `corepack pnpm --filter @zcode/web build` | 2800 MB | after `✓ 7812 modules transformed`, output phase | 137 (SIGKILL) |
| 2 | same | 2048 MB | same point | 137 (SIGKILL) |
| 3 | same | 1536 MB | same point | 137 (SIGKILL) |
| 4 | `vite build --sourcemap false` (CLI overrides the config's hidden sourcemaps) | 1536 MB | `rendering chunks…` | SIGKILL |
| 5 | `vite build --sourcemap false --minify false` (bundleability-only variant) | 1536 MB | `rendering chunks…` | SIGKILL |

`dmesg` (pod, same window):

```
oom-kill:constraint=CONSTRAINT_NONE,…,global_oom,task=MainThread,pid=14563,uid=1001
Out of memory: Killed process 14563 (MainThread) total-vm:31432912kB, anon-rss:1866208kB,…
```

i.e. the build process reached ~1.87 GB anon-RSS and was killed by the pod's
global OOM killer. Attempts 4–5 prove the block is NOT the sourcemap policy or
the minifier: chunk rendering of the 7812-module app graph itself exceeds the
RAM available in this pod.

## Environment context (why ~1.9 GB is the ceiling)

- Pod: 4041 MB total; ~1900–2000 MB `MemAvailable` throughout the attempts.
- Standing sibling load (NOT this lane's to touch): replay2 ring (Replay
  Console next-server ~1.0 GB + the CDP chrome ring ~0.7 GB) + custodian daemons.
- `packages/web` is the whole ZCode web app (pdf.js cmaps, recharts, the
  desktop-scale graph) — 7812 modules; `vite.config.ts` sets
  `build.sourcemap: mode === "production" ? "hidden" : true` (an intentional
  product posture — not modified by this lane).

## What IS proven despite the block

- The browser evidence run (same session, `commerce-evidence-manifest.json`,
  runId `w1-011-commerce-evidence-2026-10-10T111145946Z`) transformed and
  rendered every commerce-host surface through the vite dev server with a real
  headless chromium — 29/29 PASS, zero console errors on every commerce
  surface. So the module graph this lane owns resolves, transforms and renders.
- Scoped `tsc` (the authoritative commerce type check) is clean; vitest, lint
  and architecture:check are green — see the lane's final verification record
  in the worklog (Task ID 30).

## Decision request (TL)

Run the canonical `corepack pnpm --filter @zcode/web build` at TL acceptance
on a machine with ≥3 GB free RAM (or after pausing the replay2 ring), record
the output size, and close this BLOCKED item. No code change is expected to be
needed — every attempt died in bundler memory pressure, not in a compile,
resolve or type error.
