# W2-028 — the Tier A Freshness Verification at 8aae797 (the v2 RC inheritance currency)

**Lane:** Tier A Freshness (the operator's 2026-10-14 deadline push), tracking issue #21
**Branch:** `work/w2-028` (pushed: yes — the tip sha is in §7)
**Branched from:** `main` at `f4a651e` (the activation + work-order-precision tip)
**Status:** ALL GATES GREEN, **ONE HONEST DELTA** — the dist-identity drift (§4). STOP-AND-REPORT invoked per the work order's rule 6: the drift is recorded, not fixed, not approximated, not omitted.

## 0. The verification base (the f4a651e ↔ 8aae797 relationship)

The work order cites `8aae797` as the verification baseline; the dispatch executed at `f4a651e` (main's tip at dispatch). Verified before any leg ran:

```
$ git diff --stat 8aae797 f4a651e
 docs/development-state/tier-a-freshness-state.json | 56 ++++++++++++++++++++++
 docs/work-orders/W2-028.md                          | 36 ++++++++++++++
 2 files changed, 92 insertions(+)
```

Zero src/tooling deltas — every leg below therefore verifies the content of `8aae797`. The CI evidence leg (§3) is pinned to the `8aae797` run itself (head sha `8aae79750868fe07be5aa6dd5b677a9b5ff0b0e1`).

## 1. THE FRESHNESS TABLE (every leg, command, exit code, numbers — all personally observed)

| # | Leg | Command | Exit | Numbers (observed) |
|---|---|---|---|---|
| 0 | Bootstrap (REAL fresh clone at `f4a651e`) | `corepack pnpm install --frozen-lockfile` | **0** | Done in 49s, pnpm 10.33.2, node v24.21.0 |
| 1 | The chain | `pnpm build:zcode:chain` | **0** | 28 successful / 28 total, 0 cached, 2m40.871s; `generate-libs` ran; both self-verification typecheck paths clean (`tsc -b packages/agent` + the turbo path) |
| 2a | Web battery | `pnpm --filter @zcode/web exec vitest run` | **0** | **392 passed** (36 files) |
| 2b | Experience battery (incl. `release-gate-v2.test.ts`) | `pnpm --filter @unicom/experience exec vitest run` | **0** | **798 passed** (106 files); the gate suite `test/release-gate-v2.test.ts` — 14 tests passed |
| 2c | Commerce battery | `pnpm --filter @unicom/commerce exec vitest run` | **0** | **521 passed** (77 files) |
| 2d | Agent battery | `pnpm --filter @unicom/agent exec vitest run` | **0** | **559 passed** (57 files) |
| — | **Battery total** | — | — | **2,270 passed \| 0 skipped** — IDENTICAL DENOMINATORS (web 392 + experience 798 + commerce 521 + agent 559) |
| 3a | Lint | `pnpm lint` | **0** | **103 warnings / 0 errors** — exact baseline, zero new warnings |
| 3b | Architecture | `pnpm architecture:check` | **0** | **violations: 0, baseline: 0, new: 0** |
| 4a | Engine, source-only | `node packages/experience/scripts/deployment-rehearsal.mjs` | **0** | 8 PASS / 0 FAIL; inventory digest `sha256:18a52157007574ed` |
| 4b | Engine, `--dist-manifest` (the 8aae797 CI evidence) | `node packages/experience/scripts/deployment-rehearsal.mjs --dist-manifest <the fetched dist-manifest-sha256.txt from run 38380254425>` | **0** | **11 PASS / 0 FAIL**; dist identity `sha256:e77f66a2fe8213bc`, 6,204 files, provenance ci-evidence |
| 4c | Engine, `--dist-root` (the optional third mode, committed clean fixture) | `node packages/experience/scripts/deployment-rehearsal.mjs --dist-root packages/experience/test/deployment/dist-dir-clean-fixture` | **0** | 10 PASS / 0 FAIL; 5 files, `sha256:58507d0516a47d1f` (fixture-derived) |

Every number above was observed on this lane's tree; none is asserted from a prior record.

## 2. The gate verdict block (verbatim from the battery run)

The experience battery run re-derived the v2 release gate from the committed artifacts at this content (the `release-gate-v2.test.ts` contract — 14 tests, all passed). The run's `afterAll` hook re-wrote `packages/experience/reports/rc/release-gate-v2.json`; **`git status` shows the file unmodified — the regenerated artifact is byte-identical to the committed one** (the same-inputs → byte-identical-gate determinism, now proven at the current tip). Verbatim from that artifact:

```
gateId: unicom-release-gate-v2
schemaVersion: 2
generatedAt: 2026-10-08T09:00:09.000Z
clockMode: deterministic-drill
lineage: v2
baseSha: f2c08a4f6a756d1a1420dc491240a4898baafea4
allPass: true
readinessVerdict: release-candidate-ready
productionPushAuthorized: false
```

The 9 checks, each `passed: true`: `gate:v2:matrix-audit-rows-green` (44/44 rows green across 3 sections), `gate:v2:matrix-audit-sections-present`, `gate:v2:evidence:e2e-journeys` (63/63), `gate:v2:evidence:observability` (6/6), `gate:v2:evidence:dr-drill` (12/12), `gate:v2:adversarial-zero-silent-evasions` (16 adversaries, 0 silent evasions), `gate:v2:input-digests-stable` (all 6 regenerated digests match the committed), `gate:v2:cumulative-suite` (1334/1334 recorded), `gate:v2:production-push-authorization` (production push NOT authorized — by design; the operator re-authorizes).

The freshness statement this proves: the v2 release gate verdict recorded at baseSha `f2c08a4f` (Oct 8) re-derives **byte-identically** at the current tip's content — the battery leg of the inheritance claim is CURRENT.

## 3. The CI proof (cited exactly)

- **Run:** id **38380254425** — https://github.com/payswapdotorg/UniCom/actions/runs/38380254425
- **Workflow:** `canonical-web-build` (`.github/workflows/canonical-web-build.yml`), event `push`, ref `refs/heads/main`
- **Head sha:** `8aae79750868fe07be5aa6dd5b677a9b5ff0b0e1` (8aae797)
- **Created:** **2026-10-13T09:59:31Z** (exactly as the work order cites); status completed, conclusion **success**
- **Artifact:** `canonical-build-evidence`, id 11802653002 (335,355 bytes, not expired), fetched via `GET /repos/payswapdotorg/UniCom/actions/runs/38380254425/artifacts` + the artifact-zip endpoint, with the clone credential (used for the API only; never written anywhere)
- **The run's evidence (verbatim values from its `evidence-summary.txt`):** `CANONICAL_BUILD_EXIT_CODE=0`; `DIST_FILE_COUNT=6204`; `DIST_TOTAL_BYTES=137313334`; `DIST_MAP_FILE_COUNT=2279`; `MEASURED_MEMORY_FLOOR_MB=9677` (≥ the 3,072 floor); `SOURCEMAP_URL_COMMENTS=absent (hidden sourcemap posture confirmed)`; **`DIST_DETERMINISTIC_SHA256=ad4821e76a5b199ae171dba4ccfe3710d5eab3be41a0e09fc9ad94f88d05a890`**; node v24.21.0, vite 8.0.8 (web-resolved), typescript 6.0.2
- **The manifest consumed by the engine:** `dist-manifest-sha256.txt` from that artifact — 6,204 lines, 621,011 bytes, sha256 `4422e744b701e0761009a970aab60f5f4a9d6f980ef83f319d40cbeea781f55a` (recorded so the TL's independent re-fetch can byte-verify; the file itself is not committed — small-text evidence law)

**The deterministic-digest lineage (the 8aae797 row is this lane's to record):**

| Row | Commit (CI run) | `deterministic_sha256` | Files | Bytes |
|---|---|---|---|---|
| prior | `29c7ae7` (product-completion final lineage, run 38131004309) | `5f5e5248bdc9953e…3768deb` | 6,200 | 137,124,002 |
| prior | `29f037d` (W1-021 merge, run 38259561304) | `71b03964e485824a…9798c7` | 6,204 | 137,303,600 |
| **THIS LANE** | **`8aae797`** (zcode-chain closeout, run 38380254425) | **`ad4821e76a5b199a…8d05a890`** | **6,204** | **137,313,334** |

## 4. THE HASH-CHAIN ROW COMPARISON (recorded RC rows vs re-derived rows at 8aae797) — THE HONEST DELTA

Recorded rows = the committed fixtures at 8aae797: the committed `packages/experience/reports/deployment/deployment-readiness.json` (regenerated at `7dd8fb8`, commit d09504f) + the registry's `real_ci_evidence` (the `29f037d` CI run) + the operator-surface fixture mirror. Re-derived rows = this lane's engine run (§1 leg 4b) against the `8aae797` CI evidence.

| Row | Recorded (29f037d CI evidence) | Re-derived at 8aae797 | Comparison |
|---|---|---|---|
| `dist.mode` | ci-evidence-manifest | ci-evidence-manifest | **IDENTICAL** |
| `dist.digest` (manifest-derived) | `sha256:0508acfe8e87a989` | `sha256:e77f66a2fe8213bc` | **DELTA** |
| `dist.fileCount` | 6,204 | 6,204 | **IDENTICAL** |
| `dist.provenance.source` | ci-evidence | ci-evidence | **IDENTICAL** |
| check `dist-manifest-completeness` | PASS (6,204 classified, 0 unclassifiable) | PASS (6,204 classified, 0 unclassifiable, 0 unparseable) | **IDENTICAL** |
| check `dist-digest-deterministic` | PASS | PASS | **IDENTICAL** |
| check `source-dist-cross-check` | PASS | PASS | **IDENTICAL** |
| source inventory digest (12 entries) | `sha256:18a52157007574ed` | `sha256:18a52157007574ed` | **IDENTICAL** |
| bundle verification | 11/11 PASS | 11/11 PASS | **IDENTICAL** |

**The delta, quantified from the two CI manifests (per-file comparison):** 5,980 of 6,204 files identical (path + sha256); 220 paths only in the prior manifest (218 `.js` + 2 `.map` — content-hash-named assets renamed) with 220 corresponding new paths; 4 same-path changed digests (`assets/pdf-viewer-dTT1arnd.js.map`, `assets/previewPaneOfficeLegacyDocContent-guzpWPlW.js.map`, `assets/previewPaneOfficeXlsxContent-DU4V7AUs.js.map`, `index.html`). Net: **224 of 6,204 dist files changed (3.6%)**; total bytes 137,303,600 → 137,313,334 (+9,734).

**The attribution (proven, not inferred):** `git log 29f037d..8aae797 -- packages/web/src` shows exactly the W2-022 and W4-024 operator-surface lanes — `0e1fa69` + `72487ac` (merged `1701f0c`: the `SystemSurface.tsx` DIST IDENTITY + END-TO-END HASH CHAIN rows, +55 lines) and `2f069fa` (merged `c48edb5`: the `deployment-readiness-fixture.ts` mirror values, +42/−12). Three web src files changed in total (+138/−12), all inside the web build surface — the dist legitimately changed. `pnpm-lock.yaml` is unchanged in the range and both CI runs used the identical toolchain (node v24.21.0, vite 8.0.8, typescript 6.0.2, runner image ubuntu24/20261004.327.1) — the drift is src-driven, not toolchain-driven.

**The interpretation (for the Tier A decision brief):** the work order's byte-identity expectation ("the delta was docs+tooling only") holds for the zcode-chain commits relative to the verification-hardening closeout (`4f84cc3`) but **not** for the full span from the recorded rows' CI build (`29f037d`): the deployment-integrity phase's own W2-022/W4-024 operator-surface work sits in between and is in the dist. The freshness gap this lane exists to detect is **REAL**: the recorded RC dist rows are stale relative to the current tip's dist. The staging lane's inheritance must carry the re-derived identity — **`sha256:e77f66a2fe8213bc` / 6,204 files / run 38380254425 / `DIST_DETERMINISTIC_SHA256 ad4821e7…`** — which this lane's regenerated artifact (§6) now records. The engine's own verification is green on the current evidence (11/11) — the chain is verified end-to-end at the current tip; **the delta is the dist identity, not a verification failure.** Per rule 6 this is reported as a drift: no fix applied (the operator-surface fixture mirror in `packages/web/src` is `src/**` — outside this lane's surface and not this lane's to touch; the registries are TL-owned).

## 5. Honest gaps (disclosed, not fixed)

1. **The dist-identity drift itself (§4)** — the one real gap this lane found. Recorded here and in the machine-readable `docs/deployment-integrity/w2-028/evidence/lane-evidence-manifest.json`; the regenerated artifact carries the current-tip values. NOT fixed (out of surface; STOP-AND-REPORT).
2. **The first chain attempt failed environment-class, not repo-class:** `corepack pnpm build:zcode:chain` exited 1 with `spawnSync pnpm ENOENT` — the corepack shim is not on PATH for the script's child processes on this box. Per the dispatch contract's documented fallback, `npm install -g pnpm@10.33.2` was installed and the re-run (`pnpm build:zcode:chain`) exited 0 with the numbers in §1. Disclosed for the record; identical to the W2-027-documented fallback path.
3. **The experience battery regenerates `packages/experience/reports/sim/pilot-summary.json` with a machine-timing-dependent value** (`throughput.totalDurationMs`: committed 28 → observed 47 on this box). Outside this lane's write surface and carrying no verification semantics; the working-tree change was restored to the committed value, and the observation is recorded here.
4. **The `--dist-root` leg (4c) used the committed clean fixture, not a real dist** — a real dist build is the CI memory class (13 documented local OOM kills; the sandbox law). The fixture-derived digest `sha256:58507d0516a47d1f` is provenance-labelled and never presented as CI evidence. The real-dist verification is leg 4b's (the CI evidence text), per the W1-021 design.
5. **The full 6,204-line CI manifest is not committed** (small-text evidence law; the BUILD-ONLY law's dist-never-committed posture). Its sha256 + byte size + line count are recorded (§3) so the TL's independent re-fetch can byte-verify; the 26-line `evidence-summary.txt` IS mirrored verbatim at `docs/deployment-integrity/w2-028/evidence/ci-evidence-summary-8aae797.txt`.
6. **The engine's artifact lineage fields record the tree where the engine ran** (`f4a651e…`), not `8aae797` — the engine's own `git rev-parse HEAD` behavior. The dist values it recorded are derived exclusively from the `8aae797` CI evidence; the relationship is documented in §0 and the lane manifest.
7. **The `dist-manifest-verified` row name in the work order's prose**: the engine's actual check id is `dist-manifest-completeness` (the W1-025 fold of unparseable + unclassifiable into the completeness check). Same verification, the implemented name; recorded to keep every citation exact.

## 6. Write surface (exactly)

- `docs/work-orders/reports/W2-028-completion-report.md` — this report
- `packages/experience/reports/deployment/deployment-readiness.json` — regenerated by the repo's own engine command (leg 4b); the delta vs the committed version is exactly: `generatedAt`, `lineage.commit`/`dist.provenance.lineage` (7dd8fb8… → f4a651e…), and `dist.digest` (`sha256:0508acfe8e87a989` → `sha256:e77f66a2fe8213bc`, the §4 honest delta). `dist.fileCount` 6,204, the inventory digest, all capability/config rows, and all 11 verification results are unchanged.
- `docs/deployment-integrity/w2-028/evidence/` — the W4-024-pattern evidence mirror: `01-source-only-console.txt`, `02-dist-root-console.txt`, `03-dist-manifest-console.txt`, `ci-evidence-summary-8aae797.txt` (verbatim), `lane-evidence-manifest.json` (the machine-readable row comparison + CI citation).

Nothing else. NOT any `src/**` file, NOT `.github/**`, NOT `pnpm-lock.yaml`, NOT the development-state registries, NOT any workflow file, NOT the operator-surface fixture mirror (that is `src/**` and the TL's/registry's call, per the drift in §4). No new dependencies. The clone credential was used for clone/push/API only and appears in no file, report, or paste.

## 7. Branch

`work/w2-028` @ final SHA (pushed: yes). The commit is this report + the §6 surface only, on top of `f4a651e` — so the tree the TL verifies = the `f4a651e` content (= `8aae797` content + the two docs files) + this lane's write surface. The exact tip sha is carried in the dispatching message (a report cannot embed its own commit's sha); the TL re-runs every gate independently on the pushed tree.

**Standing gates (unchanged, binding):** production deployment NOT_AUTHORIZED; live named-provider credentials NOT_AUTHORIZED; human research NOT_AUTHORIZED; live payments NOT_AUTHORIZED. This lane deployed nothing, connected to no provider, read no credential, pushed no artifact, mutated no registry. The production push remains the operator's unchecked decision.
