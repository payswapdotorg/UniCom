# W1-021 — Deployment Integrity I: the Dist-Hash Integration

**Phase:** Deployment Integrity (the deployment plane's hash-chain completion), tracking issue #18
**Branch:** `work/w1-021` (from `ed72c34`)
**Lane:** Experience/deployment plane — closes the W1-019 disclosed deviation

## 1. BRANCH

`work/w1-021` @ `<final SHA>` (pushed: yes)

## 2. WHAT WAS BUILT

### The dist contract (bundle-definition.ts — additive extension)

| File class | Extension(s) | Description |
|---|---|---|
| `html-entrypoint` | .html, .htm | HTML entry points |
| `js-entrypoint` | .js, .mjs | JavaScript entry points + bundled chunks |
| `css-asset` | .css | Stylesheets |
| `static-asset` | .png, .jpg, .svg, .ico, .woff2, .json, .webmanifest, etc. | Static assets |
| `map-artifact` | .map | Source maps (hidden-sourcemap posture note) |

**Types added (additive):** `DistFileClass`, `DistInventoryEntry`, `DistInventory`, `DistManifestLine`, `DistAssemblyMode`, `DistSection`, `SOURCE_TO_DIST_CLASS_MAP`, `classifyDistFile()`.

**The manifest discipline:** the canonical build's sorted per-file `sha256sum` line format (`<sha256hex>  ./<relative-path>`, sorted by path — exactly what `find . -type f -exec sha256sum {} \; | sort -k2` emits).

**The hash-chain identity rule:** source inventory digest + dist digest + bundle verification digest = the bundle identity (end-to-end hash-verified when a dist manifest is provided).

### The mode semantics (rehearsal.ts — additive extension)

| Mode | When | What it produces |
|---|---|---|
| `ci-evidence-manifest` | `--dist-manifest <path>` | Parses the sha256sum manifest, classifies every file, verifies completeness + determinism + source↔dist cross-check; records digest + file count |
| `dist-root` | `--dist-root <path>` | Walks a real dist directory with the same classification + hashing discipline |
| `source-only` | (neither flag) | The honest reason: "The dist build requires the CI memory class (13 documented local OOM kills). The sandbox cannot build the dist." — no fabricated values |

**Functions added (additive):** `parseManifestLine()`, `parseDistManifest()`, `assembleFromDistManifest()`, `verifyDist()`, `sourceOnlyDistSection()`.

**3 new verification checks:** `dist-manifest-completeness`, `dist-digest-deterministic`, `source-dist-cross-check`.

### The runner (deployment-rehearsal.mjs — extended)

New CLI args: `--dist-manifest <path>` and `--dist-root <path>`. The artifact gains the `dist` section: `{ mode, digest?, fileCount?, provenance: { source, reason?, lineage? } }`.

### The committed dist fixture

`packages/experience/test/deployment/dist-manifest-fixture.txt` — 10 lines in the exact sha256sum format, covering all 5 file classes (html, js, css, map, static). The fixture's provenance is labelled `committed-fixture` when used via `--dist-manifest`.

## 3. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Experience tests | `pnpm --filter @unicom/experience exec vitest run` | **772 passed** (105 files) — baseline 753 + 19 net-new |
| Experience typecheck | `tsc --noEmit` (from packages/experience) | **EXIT 0** (clean) |
| Runner (source-only) | `node packages/experience/scripts/deployment-rehearsal.mjs` | **EXIT 0** — 8/8 PASS, dist mode: source-only |
| Runner (fixture) | `node packages/experience/scripts/deployment-rehearsal.mjs --dist-manifest packages/experience/test/deployment/dist-manifest-fixture.txt` | **EXIT 0** — 11/11 PASS (8 existing + 3 dist checks), dist mode: ci-evidence-manifest, digest sha256:e5d8cf3122659271, 10 files |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline |
| Architecture | `pnpm architecture:check` | **0 violations** |

## 4. HONEST GAPS

1. **The real CI manifest is not available in the sandbox** — the dist build requires the CI memory class (13 documented local OOM kills). The committed fixture (10 sha256sum lines with deterministic digests) proves the engine parses, classifies, verifies determinism, and cross-checks correctly. The TL will re-run with the real CI evidence post-merge and commit the real-dist artifact.
2. **The `--dist-root` mode is not exercised in tests** — the sandbox has no dist directory. The fixture proves the manifest mode; the dist-root mode shares the same classification + hashing code path.
3. **The agent dist TS6305 accommodation** — building the agent dist resolved the TS6305 errors; the experience typecheck passes after the accommodation.
4. **`corepack` shim** (same as prior lanes).

## 5. BOUNDARIES HELD

- ZERO modifications to `packages/web/**`, `packages/commerce/**`, `host-states/**`, `.github/**`, `docs/development-state/**`.
- ZERO local dist builds (the memory law — the CI class builds it).
- ZERO provider connections, credentials, deployment.
- The existing artifact sections' semantics are unchanged (additive `dist` section only).
- Token never committed. Pushed only to `work/w1-021`.
