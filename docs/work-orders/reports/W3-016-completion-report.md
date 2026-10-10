# W3-016 Completion Report — Merchant GroupBuy Review (J5) + Connector Runtime Wiring (J15)

Worker: worker-3 (Runtime Integration Phase, merchant lane) — vehicles 1–3
(vehicles 1–2 died mid-flight; their partials were harvested, verified
line-by-line and completed — see §6).
Branch: `work/w3-016` (base a70fcac → `1f034e5` seam → **bd10015** J5 →
**3d57d7c** J15 → **7507e78** J15 telemetry follow-up). Nothing pushed.
Date: 2026-10-10/11 · Work order: `docs/work-orders/W3-016.md` · Handoff:
`docs/FINAL-TL-HANDOFF-RUNTIME-INTEGRATION-2026-10-10.md` · Tracking: #11.
Kernel dependency: the W1-012 seam (`1f034e5`) is this branch's parent; the
completed kernel lane (accepted at `0e27e18` on `work/w1-012`) was consumed
through the public `@unicom/commerce` entrypoint only.

## 1. What was delivered

Both merchant-side modules of the Runtime Integration Phase, wired to real
runtimes through permitted public entrypoints only:

- **J5 merchant group-buy review** (`merchant-groupbuy-review/`, commit
  bd10015, prior-vehicle partial corrected + completed): the review desk
  renders REAL W1-012 GroupBuy formation aggregates — the `w3gr-` scenario
  space (8 pools: PENDING below/at threshold, COUNTERED, REJECTED-with-
  reason, EXPIRED, MONITORING, HELD, FORMED-with-final-terms incl. a
  withdraw→THRESHOLD_LOST→HELD-again history) is built in `seed.ts` through
  the formation machine itself (`recordGroupBuyInterest` per consenting
  studio, `decideGroupBuyProposal`, derived THRESHOLD_MET/THRESHOLD_LOST,
  `formGroupBuy` final terms + consenting-only roster,
  `closeOrExpireGroupBuy`). Every merchant action (accept / counter /
  reject / explicit formation of a HELD pool) runs as a real revisioned
  kernel transition through the public `@unicom/commerce` entrypoint. The
  "not the kernel journal" / "no binding effect" statements are superseded
  by kernel-journaled facts; the desk stays a review surface — it never
  overrides buyer consent and creates no commitment. 12/12 module tests.
- **J15 merchant connectors** (`merchant-connectors/`, commits 3d57d7c +
  7507e78, prior-vehicle partial verified line-by-line, corrected and
  completed): the fixture-only integration board is replaced by the REAL
  experience-plane connector runtime consumed through its public
  entrypoints (`@unicom/experience` contract registry +
  `@unicom/experience/runtime` via a guarded dynamic import). The REAL
  Shopify provider adapter is exercised SAFELY through its non-live
  surfaces only; live-connected stays honestly NONE. 10/10 module tests.

## 2. Kernel-driven vs fixture-supplied map

### J5 merchant group-buy review — kernel truth (W1-012 formation machine)

| Surface element | Source |
|---|---|
| Proposal queue, participant counts vs thresholds, proposed terms | kernel `GroupBuyAggregate` (seeded through the machine) |
| Consent terms per participant; roster (consenting-only after formation) | kernel interest records / frozen FORMED roster |
| Threshold MONITORING / HELD / FORMED-with-final-terms states | kernel-derived lifecycle (never local state) |
| Accept / counter / reject (ConfirmableAction) | kernel commands `decideGroupBuyProposal` (revisioned transitions) |
| Explicit formation of a HELD pool (terms + consequences + evidence gate) | kernel command `formGroupBuy` (final terms, consenting-only roster) |
| Exact savings / pool-value math | kernel quantities (`countQuantity`, minor-unit money) |
| The `w3gr-` synthetic scenario space itself (studios, SKUs, windows) | fixture (DEMO-labelled, deterministic, fixed demo clock Oct 12 09:00 UTC; seeded THROUGH the kernel so every lifecycle fact is the machine's own) |
| Product/studio display names, reject-reason vocabulary, counter options | fixture (display layer only) |
| Buyer side of the same space | W2's `buyer-groupbuy` module (mirrored read-only, never edited) |

### J15 merchant connectors — runtime truth (experience connector runtime)

| Surface element | Source |
|---|---|
| Registered adapter identity (Shopify — demo shop domain), transport (`rest`) | REAL `createShopifyAdapter` descriptor via `runtime.register` |
| Lifecycle (REGISTERED, 0 connected instances) | runtime `RegisteredConnector` truth |
| Health snapshot (status `unknown`, reason "adapter has no connected instance yet", evidence, checked-at) | runtime `observe` + `healthReport` (the adapter's own `probeHealth`) |
| Latest observation (status UNKNOWN, freshness UNKNOWN, detail) | runtime `observe` (the adapter's own `observe`) |
| Capability declaration (3 canonical capabilities × execution modes) | adapter descriptor capability definitions + provider implementations |
| Safe journey outcome + step outcomes + correlation id | canonical `createProviderJourneyRunner` dispatch |
| Execution-mode telemetry rollup; per-adapter telemetry rollup | `createConnectorTelemetry` registry |
| Health-surface last-contact + recovery plan | `buildConnectorHealthSurface` (W3-005 projection) |
| Safety counters (0 provider HTTP calls, 0 sealed credentials) | the exercise's own tripwire port + real vault audit |
| Connection board rows (Northwind portal, Harbor marketplace, CSV feed, browser-sync, live rail, accounting) | fixture targets (real integration TARGETS, honestly labelled `basis: fixture`, carrying the REAL `CONNECTOR_TRANSPORTS` descriptors from the `@unicom/experience` contract) |
| Attempt journal (ATTEMPTED → DISCONNECTED + reason), demo file-feed rows, display labels | fixture / local component state (deterministic, resettable, DEMO-labelled) |

## 3. Connector exercise record (the work order's safe-exercise requirement)

- **Adapter**: `createShopifyAdapter` — the REAL Shopify provider adapter
  from `@unicom/experience/runtime` (real Admin REST semantics), on the
  demo shop domain `harbor-lane-demo.myshopify.com` (never a real store).
- **Label on the surface**: "Adapter verified through its non-live
  surfaces; no live connection".
- **Surfaces exercised (non-live only)**:
  1. *Lifecycle*: `createConnectorRuntime(...).register(adapter)` →
     lifecycle `registered`, **0 connected instances** (never connected —
     connecting requires live credentials, which do not exist and are never
     fabricated).
  2. *Health observation*: `runtime.observe` + `runtime.healthReport` →
     status **`unknown`** (UNKNOWN ≠ FAILED — never "down"), degraded
     reason "adapter has no connected instance yet", evidence "adapter
     health probe completed", checked at the fixed demo clock. The no-
     instance branch of the adapter's own `probeHealth` produces this
     WITHOUT any HTTP call.
  3. *Capability declaration*: the adapter descriptor's canonical
     capabilities `commerce.catalog.observe`, `commerce.listings.manage`,
     `commerce.orders.execute`, each with modes (PASS_THROUGH_NATIVE,
     COMPOSED, OPTIMIZED_MULTI_PROVIDER).
  4. *Journey evidence*: one read-only catalog-observation journey
     (`w3cn-journey-catalog-observe-1`, PASS_THROUGH_NATIVE) through the
     canonical `createProviderJourneyRunner` with the gate's own
     preconditions (requiresConnectedInstance, read_products scope,
     commercial terms, current observation). The canonical gate refuses it
     — outcome **`failed-recoverable`**, step note
     **`CATALOG_ONLY_NO_CONNECTED_INSTANCE`** — the runtime's own honest
     refusal, never a fabricated success. Evidence correlation
     `journey-w3cn-journey-catalog-observe-1-w3cn-seed-1`; telemetry
     rollup `PASS_THROUGH_NATIVE: 1 journeys — 0 succeeded, 1
     failed-recoverable, 0 unknown`; per-adapter rollup `shopify-harbor-
     lane-demo.myshopify.com: 1 journeys — last failed-recoverable`.
  5. *Health-surface projection*: `buildConnectorHealthSurface` (W3-005)
     → last contact = the journey (failed-recoverable), recovery action
     "Try the operation again (the last run failed recoverably…)".
- **Safety constraints (mechanically enforced, rendered as counters)**:
  - the adapter's HTTP port is a **tripwire that throws on any call** —
    the exercise mechanically cannot contact Shopify: **0 provider HTTP
    calls** (counter rendered);
  - the credential vault is the REAL vault and stays EMPTY: **0 sealed
    credentials** (counter rendered); no credential is ever requested,
    stored or fabricated;
  - no purchases, payments, refunds or orders anywhere; nothing commits;
  - live-connected stays honestly **NONE** — rendered as runtime-derived
    ("the runtime says so itself"), not implied.
- **Browser boundary (honest)**: the `@unicom/experience/runtime` barrel
  is NOT browser-evaluable today — statically verified from its public
  import chain: the barrel re-exports `deployment/target-adapter`, whose
  module top level calls `promisify(execFile)` from `node:util` (plus
  `node:child_process` / `node:http`); a browser bundler externalizes node
  builtins with throwing stubs. The component therefore loads the runtime
  through a GUARDED dynamic import: environments that can evaluate the
  barrel (the module's node test suite) render live runtime truth; a
  browser renders the honest UNAVAILABLE boundary ("an honest boundary,
  not an error") plus the committed, test-pinned
  `SAFE_EXERCISE_RECORD` — never a fabricated runtime state. The record
  cannot silently drift: the module test pins every outcome field against
  the live runtime's own output.

## 4. Sharpened status taxonomy (honesty laws preserved)

- **CONNECTED** — runtime-verified live connection. Honestly NONE today
  (0 connected instances, derived from the runtime, rendered as such).
- **REGISTERED (not connected)** — new, runtime-verified: the adapter
  exists in the real runtime; no account is bound. Explicitly labelled
  "REGISTERED is not CONNECTED".
- **DISCONNECTED** — fixture-declared real target that would need live
  credentials/contract (`basis: fixture` shown per row); attempts journal
  ATTEMPTED → DISCONNECTED with the honest reason, never success.
- **DEMO** — local deterministic only (the CSV file feed); never live.
- **UNAVAILABLE** — no provider exists (browser-sync, live-commerce rail,
  accounting export); no attempt is offered ("an attempt would be
  theater"); UNAVAILABLE ≠ DISCONNECTED.
- **UNKNOWN ≠ FAILED**: health/observation UNKNOWN rendered as unknown
  with the runtime's own reason — never collapsed to down/failed.
- Every row carries its **basis** (runtime-verified vs fixture) and the
  REAL transport descriptor from the `@unicom/experience`
  `CONNECTOR_TRANSPORTS` registry (family, commands vs observations-only,
  untrusted-content flag); "no transport wired — no provider exists" for
  the accounting row.
- Permission gates hold: every action-shaped control sits behind
  `connectors.manage` (merchant) with the holder named in denials;
  deterministic reset; fixed demo clock (Oct 12, 09:00 UTC) on every
  stamped value; DEMO tags on all synthetic values.

## 5. Verification battery (real numbers, run on the final tree 7507e78)

| Check | Result |
|---|---|
| `corepack pnpm --filter @zcode/web exec vitest run` | **282/282 passed** (27 files) — baseline at bd10015 was 278; +4 net from J15 (module 6 → 10 tests: 2 runtime safe-exercise incl. record-pinning, 1 browser-boundary panel, board/attempt/feed/permission/reset suite upgraded to runtime-driven) |
| merchant-connectors module tests | **10/10** |
| merchant-groupbuy-review module tests | **12/12** (committed with bd10015) |
| `corepack pnpm lint` | **0 errors**, 101 warnings — the pre-existing repo baseline (101 already at the seam commit per the W1-012 manifest); **0 warnings from merchant-connectors / merchant-groupbuy-review files** |
| `corepack pnpm architecture:check` | **0 violations** (baseline 0, new 0) |
| Scoped tsc (`tsc -p tsconfig.scoped.json`, 2800 MB heap) | **clean** |

No browser runs at lane level (RAM ceiling, per the work order); the
BROWSER gate runs on merged lineage per the phase plan.

## 6. Inherited-partials disclosure + probe-dir disposal

- **J15 partials inherited uncommitted** (vehicles 1–2 died after writing,
  before committing): modified `component.tsx`, `component.test.tsx`,
  `fixtures.ts`, `module.ts`; new `component-parts.tsx`, `runtime.ts`.
  Verified line-by-line against the work order and the real runtime API:
  the wiring approach, the safe exercise, the guarded import and the
  sharpened board were CORRECT and were kept — never redone. Defects
  found and fixed by this vehicle:
  1. **Scoped tsc did not compile** (the prior vehicle never ran it): 3+
     latent type errors — branded `UtcIso8601String` stamps (fixed with
     the runtime's own `asUtcTimestamp` + canonical `unknownHealthSnapshot`
     for the fallback, replacing a hand-rolled snapshot), branded
     `CapabilityDefinitionId` (fixed with the runtime's canonical
     `asCapabilityDefinitionId` bridging the agent catalog's plain ids),
     optional capability `description` (coalesced honestly), and
     `ConnectorHealthSnapshot` imported from the wrong entrypoint (the
     contract package `@unicom/experience` exports it, not the runtime
     barrel).
  2. **An unverifiable evidence claim**: the boundary comment asserted a
     "vite build probe" whose artifacts do not exist on this branch —
     replaced with the retained, first-party static verification from the
     runtime barrel's public import chain (the probe dirs were already
     absent at inheritance; see below).
  3. The safe-exercise **label was missing from the browser boundary
     panel** (it only rendered in the live runtime panel) — added; the
     work order requires the precise label wherever the exercise is
     presented.
  4. The browser boundary panel had **no test coverage** (the guarded
     import succeeds under node, so it never rendered in tests) — a new
     direct-render test pins its contract (verbatim reason, honest
     UNAVAILABLE-not-error chip note, committed record + label).
  5. `adapterTelemetry` was loaded into the runtime space but never
     rendered — now rendered (per-adapter rollup) and pinned.
- **Probe dirs**: the brief said the prior vehicles left
  `packages/web/.probe/` and `packages/web/dist-probe/` untracked.
  **Brief-vs-reality correction: neither directory exists in this
  worktree** (verified with a full listing including dotfiles) — nothing
  to salvage, nothing to dispose. The only probe remnants were the two
  file comments claiming a probe, corrected as above.
- **J5 partial**: verified and completed by the prior vehicle's
  continuation (bd10015 commit message records its 3 fixed test defects);
  not touched by this vehicle.

## 7. Honest gaps + merge-time notes

1. **Browser rendering of the live runtime panels** — the runtime barrel
   is not browser-evaluable (node builtins at module top level). Browsers
   get the honest boundary + the committed test-pinned record. Closing
   this would require an experience-package change (a browser-safe
   sub-entrypoint), which this lane may not make — recorded as a **TL
   decision request**, not a lane edit.
2. **Live connections remain NONE by design** — credentials are an
   operator frontier decision (NOT_AUTHORIZED in the state registry). The
   board never fakes one; attempts honestly fail.
3. **One adapter exercised** (Shopify) — the work order required "at least
   one"; eBay/Amazon SP-API/Depop/Whatnot adapters exist behind the same
   public entrypoint and the same exercise pattern would apply (Jumia is
   node-only — `node:crypto` — and was deliberately not touched).
4. **J15 board rows stay fixture-basis** — Northwind/Harbor are fixture-
   declared targets; only the Shopify registration is runtime-verified.
   The per-row basis makes this explicit rather than blurring it.
5. **J5 CLOSED transition not seeded** (noted in `seed.ts`): the demo
   space does not exercise `closeOrExpireGroupBuy` into CLOSED from an
   already-formed pool; the machine path exists and is kernel-tested on
   work/w1-012.
6. **Attempt actions make no runtime call** — with zero credentials, the
   honest attempt journals locally (ATTEMPTED → DISCONNECTED + reason);
   the statement says a real attempt would hand operator-provided
   credentials to the real runtime's connect step.
7. **Merge-time notes**: merge `work/w3-016` after/with `work/w1-012`
   (bd10015 already sits on the seam commit `1f034e5`, so the J5 module
   compiles against the kernel as merged); the concurrent W2-013 lane
   raises the shared web suite further on its branch — only
   merchant-connectors (6→10) and merchant-groupbuy-review tests belong
   to this lane's delta; the full-suite number at merge is the union.
   Module registry/owner stays the frozen W3-015 union (W3-016 is the
   rewiring, recorded in headers + this manifest).

## 8. Standing boundaries honored

Write surface: only `merchant-connectors/**` (+tests) and this manifest;
`merchant-groupbuy-review/**` untouched by this vehicle (its bd10015
commit was the prior continuation's). No host/router/shared edits; no
buyer-/peer- edits; no `packages/commerce|experience|agent` edits; no
package.json/lockfile changes; `@unicom/experience(/runtime)` consumed via
public entrypoints only (guarded dynamic import for the barrel);
`providers/jumia.ts` never touched. Nothing pushed. No credentials, no
live provider calls, no purchases/payments/orders anywhere.
