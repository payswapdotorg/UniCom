# W3-017 — J16 Local Camera/QR Capture (lane manifest)

**Phase:** Product Completion & Build Readiness, issue #12
**Branch:** `work/w3-017` (from `604fae5`) · **Commits:** `91a9a83` (QR shelf-tag aliases — the seam) → `30bcab0` (camera/QR scan path: scan-section + use-camera-scan) → `0f17e3f` (scan test suite green + network tripwire) → `66d2ce9` (noUncheckedIndexedAccess fix) → `9ba2b7b` (TL-approved bundled jsQR fallback decoder)
**Vehicle history (honest):** worker vehicle 1 was interrupted by an agent-context deadline after committing the implementation (the 15-test suite was mid-write and all-timeout); worker vehicle 2 (continuation) diagnosed the systematic act-scope seam issue, got the suite green, committed twice, and was interrupted during evidence; worker vehicle 3 (final continuation, TL-approved scope) wired the bundled jsQR fallback + its tests. The TL harvested the lane — full verification battery, the y4m QR test-pattern generation, and the real-browser evidence below. All numbers in this report were observed by the TL on the committed tree.

## 1. Behavior vs the work order's required list

| W3-017 requirement | Implementation |
|---|---|
| User-initiated only; no permission on load | `Start scan (turn the camera ON)` is the only activation (`cm-store-scan-start`); nothing requests hardware on load (browser-evidenced step 02) |
| Insecure context / unsupported API detected without crash | honest `unsupported` states for insecure context and missing `mediaDevices.getUserMedia`; hardware never requested in those states (unit-tested) |
| Browser-native detection when supported | native `BarcodeDetector` (QR + retail 1D formats) when present |
| Bundled local decoder when native insufficient | **TL-approved `jsqr@1.4.0`** (see §3) — QR-only, pure local `ImageData → string`, frames never leave the page |
| Frames in memory only; no upload/persist/log/telemetry | network tripwire in the test suite (fetch/XHR/sendBeacon spies — zero calls across the whole scan suite); copy states it on-surface |
| Stop tracks on all exits | one `stopScan()` from success, cancel, error, unmount cleanup (unit-tested incl. unmount mid-scan; browser-evidenced: camera state returns to idle after decode) |
| Accessible manual fallback | existing manual entry preserved, linked from denied/unsupported/error states, keyboard-reachable (`#cm-store-scan-code-input`, `Look up the code`) |
| Decode feeds the existing local workflow only | decoded/looked-up tags capture through the SAME confirm-gated path manual entry uses (observation → reconciliation; DEMO-labelled "not provider-verified stock, consent or a commitment") |
| Repeated scans | retry/scan-another supported (unit-tested) |
| Offline queue/replay preserved | offline capture queues locally first, exactly like manual entry (unit-tested: `offline scan joins the local queue`) |

## 2. Tests (deterministic camera/decoder seam — no hardware in CI)

`scan.test.tsx` — **17 tests** covering: granted + local decode (native-path stub) → confirm-gated capture; **jsQR fallback path decoding a REAL QR** (rasterized test-only via the hoisted `qrcode` package, surfaced through a fake canvas-2D seam — jsdom ships no rasterizer) → capture; foreign-QR honest not-recognized; permission denied (`NotAllowedError` stub) → denied state + retry + manual fallback; unsupported (no `getUserMedia`); unsupported (insecure context) — hardware never requested; unknown/malformed code; empty-detection bounded window ends honestly with the camera stopped; cancel mid-scan (all tracks stopped); unmount mid-scan (cleanup stops every track); repeated scans; failing decoder (3-strike honest error); `NotFoundError` honest error state; manual entry unknown code; permission-blocked without `receiving.count-stock` (no Start scan); offline queue join; network tripwire (zero calls).

## 3. The bundled-decoder decision (TL approval per the W3-017 escalation clause)

The work order: "Use browser-native QR/barcode detection when supported. If insufficient, use an existing bundled decoder; if none exists, ask TL to approve a narrowly scoped dependency." The platform truth (TL-verified): this environment's only browser — Linux Chromium — **does not ship `BarcodeDetector`** (`typeof BarcodeDetector === "undefined"` on a secure localhost origin), so the native-only scan path was unreachable in every real browser available. **TL decision: APPROVED `jsqr@1.4.0` as a runtime dependency of `@zcode/web`** — reviewed: actively maintained, **license Apache-2.0** (the approval brief said MIT; the shipped artifact's license field and LICENSE file say Apache-2.0 — equally permissive, decision recorded with the corrected license), **zero transitive runtime dependencies** (lockfile: `jsqr@1.4.0: {}`), pure local decode (no network, no storage, no telemetry), ~42 KB min+gz, leaf library adding **no architecture edge** (architecture check 0 violations before and after). `qrcode` remains test-infra-only (never imported from `src/**`).

## 4. Real-browser evidence (TL-captured, W1-010 format)

`docs/product-completion/w3-017/evidence/` — 8 steps, TWO dedicated headless Chromium instances (the resident CDP ring untouched); vite dev on a free port served THIS worktree. The success-path camera is Chromium's fake device fed a committed-generator **C420 y4m pattern containing a real QR** (`gen-qr-y4m.mjs` — committed in the evidence dir for reproducibility; payload `unicom-demo-qr:sku-phys-bread:28`, a committed demo shelf tag):

| Steps | Story |
|---|---|
| 01 | role held: `store-operator` (`receiving.count-stock`) |
| 02 | J16 scan section idle — camera OFF, no permission requested on load |
| 03 | `Start scan` click → camera ON, state `scanning` (video element visible) |
| 04 | **real decode in a real browser**: the bundled jsQR fallback decodes the live fake-camera frames → payload shown, camera stopped the moment the code was read |
| 05 | confirm-gated capture into the SAME local workflow manual entry uses (28 × bread) |
| 06 | camera state back to idle — every track stopped |
| 07 | denial/failure path: a second Chromium (fake device, permission denied via CDP `Browser.setPermission`) — the camera request fails honestly (**surfaced as `NotSupportedError: Not supported.` by this headless build; nothing captured or transmitted**, retry + manual fallback offered) |
| 08 | accessible manual fallback completes a capture with NO camera: typed `unicom-demo-qr:sku-phys-coffee:15` → lookup → capture (15 × coffee) |

All 8 `-console.txt` captures: zero errors / zero pageerrors.

**Honest limitation:** the strict permission-`denied` UI state (NotAllowedError) was not reachable in this headless build's real browser — two capture attempts (flag-based auto-deny and CDP permission denial) both surface as `NotSupportedError` (recorded above); the denied state is covered deterministically by the unit seam suite. The y4m pattern must be **C420** (the first Cmono attempt was rejected by Chromium's y4m parser — the fake device then fails to materialize entirely; generator corrected and committed).

## 5. Verification (TL-observed on the committed tree `9ba2b7b`)

| Check | Result |
|---|---|
| `corepack pnpm --filter @zcode/web exec vitest run` | **310 passed / 310** (28 files; baseline 293 + 17 scan − 1 superseded copy test + 1 net-new fallback test; module suite 26/26) |
| `corepack pnpm lint` | **103 warnings / 0 errors** — baseline unchanged; zero warnings from physical-store files |
| `corepack pnpm architecture:check` | **0 violations** (jsqr adds no package-graph edge) |
| scoped `tsc -p tsconfig.scoped.json` (2048 MB heap, ring paused) | **clean** (exit 0) |

## 6. Merge-time notes for the TL

- Register in the merged browser gate: `cm-store-scan-state` (+ `data-camera-state` vocabulary idle/requesting/scanning/decoded/denied/unsupported/error/not-recognized), `cm-store-scan-start`, `cm-store-scan-cancel`, `cm-store-scan-retry`, `cm-store-scan-video`, `cm-store-scan-notice`, `cm-store-scan-decoded`/`cm-store-scan-payload`, `cm-store-scan-capture` (+`Capture now`), `cm-store-scan-captured`, `cm-store-scan-manual-entry`/`#cm-store-scan-code-input`/`Look up the code`; QR alias payloads `unicom-demo-qr:sku-phys-bread:28`, `…coffee:15`, `…oatmilk:23`.
- `THIRD-PARTY-NOTICES.md` does not yet list `jsqr@1.4.0` (regeneration is a root-level TL task at merge).
- Lockfile change (`pnpm-lock.yaml` + `packages/web/package.json`) is lane content for the TL to merge.
- Camera/media bytes stayed local and ephemeral throughout; no upload, persistence, telemetry, remote decoding, provider calls or commerce-plane mutations exist anywhere in this lane.
