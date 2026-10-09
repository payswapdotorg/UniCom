# W1-010 Pilot Report — Rendered-Browser Commerce Journey Validation (Gates 0 + 1)

Run ID: `w1-010-browser-pilot-2026-10-09T170138167Z`
Date: 2026-10-09
Machine-readable companion: `pilot-manifest.json` (schema v1 + browser extension v1, extends `docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md` additively)
Work order: `docs/work-orders/W1-010.md`

## 1. Environment identity (Gate 0)

| Property | Value |
|---|---|
| Repo / branch | `payswapdotorg/UniCom` @ worktree `work/w1-010`, base `eb1ceca` (tree dirty with this delivery; build commit recorded in manifest) |
| App under test | The UNiCOM product's reachable web shell: `packages/web` (@zcode/web, Vite dev) + `packages/server` (Hono, `dist/entry-http.js`, port 3030) |
| Base URL | `http://localhost:5173/` (Vite dev server; started and torn down by the runner) |
| Browser | REAL headless **chromium 153.0.8010.12** via **Playwright 1.63.0** (resolved `import:playwright`) |
| Node / pnpm | v24.21.0 / 10.33.2 |
| RAM measures | ~1903 MB free at start; Vite heap-capped at 512 MB (`NODE_OPTIONS=--max-old-space-size=512`); ~678 MB free at cold-boot paint |
| Runner | `packages/experience/test/browser/run-browser-pilot.mjs` (re-runnable: `node packages/experience/test/browser/run-browser-pilot.mjs --start-env --out <dir> --manifest <json>`) |

The browser genuinely launched and painted the application: cold boot painted in 24.5 s
(warm-up), `document.title = "ZCode - Web + Server"`, screenshots + console logs captured per
step. Evidence: `evidence/00-warmup-coldboot-console.txt`, `evidence/01-landing-small.png` etc.

## 2. What the rendered application actually is

The reachable, rendered user-facing surface of the UNiCOM repository in this environment is
the **ZCode agent web shell connect wall**:

- Body text: "Welcome to ZCode — Connect your account to start using ZCode".
- The ONLY visible controls on the ordinary landing surface (`/`, unauthenticated, first
  paint): three buttons — "Connect to Z.ai (Global)", "Connect to BigModel (CN)", "Use API key".
  No navigation links. No menus. No commerce vocabulary anywhere in the rendered DOM.
- Secondary surfaces reached WITHOUT deep-link shortcuts to feature pages: the onboarding
  "Use API key" panel (visible click from the landing wall), two OAuth redirect targets
  (external), and the conversation-share landing pages `/share` and `/cn/share` (public
  share-surface routes of the web shell).
- DOM commerce-marker scan: **all 32 commerce markers false** on every examined surface
  (`storefront`, `group buy`, `trade cycle`, `checkout`, `cart`, `merchant`, `supplier`,
  `opportunity`, `command center`, `intent canvas`, `rent`, `resale`, `procurement`,
  `dispute`, `supermarket`, …). See the per-surface console evidence files.

### Environment-blocked surface (disclosed, evidence recorded)

- **ZCode desktop (Electron) app** — `blocked-environment`: the electron package/binary is
  not installed in this sandbox (verification: `ls node_modules/.pnpm | grep electron` → 0
  entries; disk ~2 GB / RAM ~1.6 GB ceiling; ELECTRON_MIRROR unverified). The desktop agent
  workspace cannot be launched here. Recorded in `pilot-manifest.json → environmentBlocks`.

## 3. First-discovery walk — the 19-family journey registry (§10)

Method (GUI-only law): start at the ordinary landing surface (`/`, unauthenticated — the
"ordinary role landing surface" for an unprovisioned user); enumerate visible controls and
tab order; walk only visible clicks (landing wall → "Use API key" onboarding panel; share
surfaces via their public routes); scan visible body text AND control labels for each
family's visible signs (word-boundary, case-insensitive — the sign vocabulary is in
`packages/experience/test/browser/browser-pilot-lib.mjs → FAMILY_VISIBLE_SIGNS`, asserted
by tests). No deep links, no direct API/service/DB calls, no hidden routes
(`guiOnlyProof.deepLinkUsedForDiscovery = false`, `violations = []`).

**Result: every one of the 19 journey families is ABSENT from the rendered UI.**

| # | Journey family (protocol §10) | Outcome | Rationale (evidence-backed) |
|---|---|---|---|
| §10.1 | buyer-intent-constraints | **absent** | No visible sign on any examined rendered surface |
| §10.2 | offer-sourcing-comparison | **absent** | " |
| §10.3 | buy-now-vs-wait-price-timing | **absent** | " |
| §10.4 | existing-group-buy | **absent** | " |
| §10.5 | latent-demand-merchant-group-buy-proposal | **absent** | " |
| §10.6 | rent-borrow-vs-buy | **absent** | " |
| §10.7 | resale-rental-consignment | **absent** | " |
| §10.8 | proactive-economic-opportunities | **absent** | " |
| §10.9 | bounded-multi-hop-trade-cycle | **absent** | " |
| §10.10 | merchant-commerce-lifecycle | **absent** | " |
| §10.11 | supplier-procurement-receiving | **absent** | " |
| §10.12 | b2b-multi-location-supplier-coordination | **absent** | " |
| §10.13 | autonomous-store-policy | **absent** | " |
| §10.14 | commerce-twin-what-if | **absent** | " |
| §10.15 | connected-commerce-channels-and-live-commerce | **absent** | " |
| §10.16 | physical-no-rfid-supermarket | **absent** | " |
| §10.17 | trust-security-fraud-and-recourse | **absent** | " |
| §10.18 | failure-unknown-idempotency-recovery | **absent** | " |
| §10.19 | gui-feature-discoverability | **absent** | The rendered shell exposes zero commerce features to discover |

Per-family navigation graphs, attempted sign lists, interaction counts and outcome
rationales: `pilot-manifest.json → familyDiscoveries` (19 records).

### Denominator reconciliation (zero drift)

```
planned = executed + blocked + skipped = ΣbyOutcome
57      = 57        + 0       + 0      = 57
attempt level: 19 journey families × 3 firm profiles (small / medium / large)
byOutcome: pass=0  fail=0  blocked=0  absent=57  unknown=0
```

All outcome categories remain visible; nothing was dropped, hidden or silently failed.

### Firm-profile (S/M/L) pilot context

The discovery walk ran once per firm profile (small / medium / large). The rendered landing
surface is identical for all three profiles (same connect wall, same three buttons, same
zero commerce markers — see `evidence/01-landing-small.png`, `02-landing-medium.png`,
`03-landing-large.png` and their console files). In a rendered commerce UI, firm-size
differentiation would live in role landing surfaces and feature exposure; here the shell has
no role differentiation before authentication, so the three profiles honestly converge on
the same absent outcome. This IS the pilot: a deliberately labelled, reproducible
small-scale run whose evidence bundle a reviewer can open — not a claim of full coverage.

## 4. Findings, ranked by severity

1. **[Critical — product-scope] The commerce experience UI does not exist as a rendered
   surface.** The 19-family commerce journey registry — the entire validated scope of the
   V3 program — has no rendered UI anywhere reachable: the commerce surfaces
   (Command Center, Intent Canvas, Storefront, Opportunity Inbox, Trust/Security, …) exist
   only as typed view contracts + runtime constructors in
   `packages/experience/src/surfaces/*.ts`, consumed by no renderer and no host
   (`@unicom/experience` has zero non-test dependents; the desktop/web/server packages
   import nothing from `@unicom/*`). Per the GUI-only law, every commerce journey family is
   therefore ABSENT for real-browser validation — exactly the gap between the V3
   fixture-level certification and rendered-UI reality that this phase exists to close.
2. **[High — environment] The primary product surface (ZCode desktop agent app) is not
   launchable in this sandbox** (no electron binary; RAM/disk ceiling). Even where
   launchable, the desktop renderer mounts the agent workspace (`@zcode/ui` Root) with no
   commerce wiring — so this block does not change the §10 outcome, only the completeness
   of shell-level evidence.
3. **[Medium] The reachable web shell is an auth gate + share viewer only** — the
   unauthenticated ordinary surface has three auth buttons and no navigation; the public
   share pages render shared conversation snapshots. No commerce capability is reachable
   even one click deep.
4. **[Low] Cold-boot paint takes ~24 s** under the sandbox RAM ceiling (heap-capped Vite) —
   noted for reproduction expectations, not a product finding.

## 5. The exact missing prerequisite (for the operator)

To make rendered-browser commerce journey validation possible, the product needs a
**rendered host UI for the experience-plane surfaces**: React components (or an equivalent
host registration) that render the typed surface view contracts
(`packages/experience/src/surfaces/*.ts` — storefront, command center, opportunity inbox,
intent canvas, trust/security, …) inside a reachable shell (web or desktop), with ordinary
role landing surfaces and first-discovery navigation. Building that UI is a product-scope
decision that belongs to the operator (it is not authorized by this validation work order);
once it exists, this runner, its evidence format and its 19-family walk apply to it
unchanged.

## 6. What is real-browser evidence vs fixture-only (honest ledger)

- **Real browser evidence (this pilot):** the rendered shell identity, the landing-surface
  inventory (buttons/tab order/body), the onboarding panel, the OAuth redirect targets, the
  share surfaces, the DOM commerce-marker scans, the per-family absence proofs —
  screenshots + console logs + machine-readable manifest, all reproducible via the
  committed runner.
- **Fixture-only (unchanged from V3, NOT re-validated here):** everything driven through
  `packages/experience/test/e2e/harness.ts` (the typed experience-plane harness), the V3
  sim campaigns, and the V3 certification numbers. Those remain exactly as certified:
  fixture-level simulation results.
- **Not tested (blocked/environment):** the desktop Electron agent workspace (no binary
  here); any authenticated web-shell interior (requires real Z.ai/BigModel OAuth or API-key
  provisioning — an operator-owned account decision, disclosed as environment-blocked in
  the manifest).

## 7. Reproduction

```bash
# in a worktree of this repo with deps installed and packages/server built:
node packages/experience/test/browser/run-browser-pilot.mjs \
  --start-env \
  --out docs/simulations/post-v3/w1-010/evidence \
  --manifest docs/simulations/post-v3/w1-010/pilot-manifest.json
# tests (no browser needed): corepack pnpm --filter @unicom/experience exec vitest run test/browser/
```

Timing note: the cold boot (~24 s) and per-surface walks are environment-dependent (sandbox
RAM ceiling); the runner records timings + free-memory telemetry in the manifest for
reconciliation across machines.
