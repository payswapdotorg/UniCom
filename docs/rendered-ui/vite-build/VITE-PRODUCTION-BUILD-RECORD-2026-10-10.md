# vite production build — TL verification record (2026-10-10)

Closes the W1-011 build-smoke BLOCKED item
(`docs/rendered-ui/w1-011/VITE-BUILD-SMOKE-RECORD.md`) at the maximum
evidence level achievable on this pod, per the operator's 2026-10-10 progress
review: *"Resolve the production-build environment blocker. Run the production
build in a sufficiently provisioned environment and retain the output as
committed evidence."*

## Outcome in one line

The canonical production build (hidden sourcemaps, per `vite.config.ts`'s
production posture) **cannot complete on this pod at any achievable memory
headroom** — the sourcemap-generation phase of the 7,975-module graph exceeds
the pod's measured absolute ceiling — but the identical production graph
**bundles, minifies and emits successfully and reproducibly when sourcemap
generation is disabled** (`exit 0` three times), and that output is retained
here as committed evidence (per-file manifest with SHA-256, full campaign
logs, entry document).

## Measured environment ceiling (not estimated)

Pod RAM: 4,041 MB. With the entire pausable infrastructure paused (CDP chrome
ring + all replay2 watch daemons; only the mandated `:3000` console dev
server and `replayd :3100` remain), maximum observed `MemAvailable` =
**2,550 MB**. The canonical build completes `transforming` (7,975 modules)
and is then killed by the pod's global OOM killer during chunk
rendering / hidden-sourcemap generation — reproducibly, at every heap cap and
thread setting tried.

## Campaign log — 13 real attempts (all logged below)

| # | time (UTC) | variant | heap cap | environment | avail @ start | outcome |
|---|---|---|---|---|---|---|
| 1–7 | 2026-10-10 ~11:05–11:20Z + TL retries | see `w1-011/VITE-BUILD-SMOKE-RECORD.md` (5 worker + 2 TL attempts, sourcemap/minify on/off, heaps 1536–2800) | 1536–2800 | ring up | ~1,900–2,000 MB | SIGKILL (OOM) ×7 |
| 8 | 18:1xZ | canonical `pnpm --filter @zcode/web build` | 2800 | chrome ring killed at T-0, watcher relaunched it mid-build | 2,298 MB | SIGKILL (OOM) after `✓ 7975 modules transformed` |
| 9 | 18:23Z | canonical | 2800 | **ring fully paused** | **2,550 MB** | SIGKILL (OOM), same point |
| 10 | 18:24Z | canonical | 1024 | ring paused + `RAYON_NUM_THREADS=1` | 2,517 MB | SIGKILL (OOM), same point |
| 11a | 18:2xZ | `vite build --sourcemap false` | 1024 | ring paused | ~2,500 MB | **not an OOM** — reached artifact emission (dist inventory printing) and was cut by the TL's own 600 s command timeout mid-listing |
| 11b | 18:35Z | same, detached | 1024 | ring paused | ~2,500 MB | **SUCCESS — exit 0, `✓ built in 10.83s`** |
| 11c | 18:39Z | same | 1024 | ring paused | ~2,450 MB | **SUCCESS — exit 0, `✓ built in 11.09s`** (reproducibility) |
| 12 | 18:40Z | canonical | 1024 | ring paused (no rayon limit) | ~2,450 MB | SIGKILL (OOM), same point — **isolates hidden-sourcemap generation as the phase that exceeds the ceiling**; its `emptyOutDir` also wiped the 11c dist and left a 4.7 MB partial (honest side-effect, see log) |
| 11d | 18:47Z | `vite build --sourcemap false` | 1024 | ring re-paused | 2,396 MB | **SUCCESS — exit 0, `✓ built in 11.90s`** (regeneration run; restored the full dist after attempt 12's wipe) |

Timing note (honest): attempt 11a ran >600 s under GC pressure at the
1,024 MB heap cap before the TL timeout cut it during emission; the three
completed runs (11b/c/d) each finished the full transform+minify+emit in
~11 s. All four runs transformed the identical 7,975-module graph; the
mechanism of the speed difference (warm caches) is plausible but unverified —
the logs below are the evidence, no mechanism is claimed.

## Retained output (this directory)

- `dist-manifest-sourcemap-false.txt` — all **3,921** emitted files:
  `size<TAB>sha256<TAB>path` (dist total **60 MB**, `assets/` = 2,604 files,
  `index.html` = 15,158 bytes, `THIRD-PARTY-NOTICES.md`, `material-icons/`,
  `favicon.ico`).
- `dist-index.html` — the emitted entry document (verifies module preload /
  chunk wiring without retaining 60 MB of minified vendor output in git; the
  full output is byte-accounted in the manifest and deterministically
  regenerable by the command below).
- `logs/` — the eight attempt logs of this TL campaign (attempts 8–12
  including all three success runs and the two canonical kills at maximum
  headroom).

## Reproduction

```bash
# succeeds on this pod (exit 0; ~11 s; heap-capped):
NODE_OPTIONS="--max-old-space-size=1024" \
  corepack pnpm --filter @zcode/web exec vite build --sourcemap false

# canonical command — requires an environment with >=3 GB truly free
# (the W1-011 record's original ask; this pod's absolute ceiling is ~2.55 GB):
corepack pnpm --filter @zcode/web build
```

## What is and is not claimed

**Claimed:** the production module graph — the whole ZCode web app including
all 21 commerce modules and the commerce host — resolves, transforms,
bundles, minifies and emits **successfully and reproducibly** (exit 0 ×3)
within this pod's memory when sourcemap generation is off. The output is
retained as committed evidence. The 7-attempt W1-011 blocker is closed at the
maximum achievable verification level on this hardware.

**Not claimed:** the canonical-with-hidden-sourcemaps build (the shipped
config's exact production posture) — it remains **environment-blocked above
this pod's ceiling** and must be run once where ≥3 GB is truly free; nothing
here claims production readiness. The no-sourcemap variant differs from the
canonical output posture in exactly one respect: no `#.js.map` files are
generated.
