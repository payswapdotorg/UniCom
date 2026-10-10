# FINAL TL HANDOFF — UNiCOM Runtime Integration Phase (2026-10-10)

Authority: operator TL progress review, 2026-10-10 (resident session
web-6ddc0a59) — recommendations 2–3 adopted as this phase's directive; its
closing instruction ("no further work needs to depend on this chat") is the
standing authorization. State authority:
`docs/development-state/runtime-integration-state.json`. Tracking issue: #11.

## What this phase is

The rendered-commerce-UI phase (operator-reviewed: complete under its gates,
**not production-ready) left the most consequential capabilities demo-only or
unwired. This phase converts them to verified runtime behavior — without
architecture change, without live commerce side effects, and without touching
any prior certification record:

1. **TradeCycle execution (J9)** — from the UI's local consent machine
   ("Not wired (blocker)" on-surface) to a real commerce-kernel execution
   aggregate (per-leg authorization references; ATOMIC refusal stops without
   committing any leg; STAGED_WITH_RECOURSE progression; UNKNOWN preserved).
2. **GroupBuy formation (J5, both sides)** — from local demo state (no kernel
   aggregate existed) to a real formation aggregate (interest ≠ commitment;
   consenting-only rosters; threshold-met pools HELD until the organizer's
   explicit formation with final terms; withdraw before second confirmation).
3. **Connector runtime (J15)** — from the fixture board ("connected=none") to
   the real experience-plane connector runtime (lifecycle, health, journey
   telemetry; at least one provider adapter exercised safely through
   non-live surfaces; live-connected stays honestly none — credentials are an
   operator frontier decision).

The production-build blocker from the prior phase was closed by the TL at the
maximum achievable level before this handoff: the canonical hidden-sourcemap
build exceeds this pod's measured 2,550 MB absolute ceiling (13-attempt
campaign, logs committed), while the identical 7,975-module production graph
builds successfully and reproducibly with sourcemaps disabled (exit 0 ×3;
output retained with a per-file SHA-256 manifest) —
`docs/rendered-ui/vite-build/VITE-PRODUCTION-BUILD-RECORD-2026-10-10.md`.

## Work orders and sequencing

| Order | ID | Lane | Write surface | Dependency |
|---|---|---|---|---|
| 1 | W1-012 | Commerce kernel (worker-1) | `packages/commerce/src/**` additive | none — **publishes the seam** |
| 2 (parallel) | W2-013 | Buyer/peer wiring (worker-2) | `web/commerce-modules/{peer-tradecycle, buyer-groupbuy}` | W1-012 seam commit |
| 2 (parallel) | W3-016 | Merchant wiring (worker-3) | `web/commerce-modules/{merchant-groupbuy-review, merchant-connectors}` | W1-012 seam commit |

W1-012's FIRST commit must publish the kernel execution-contract seam (new
domain types + command payloads, additively re-exported through
`contract.ts`); W2-013 and W3-016 branch from that seam commit and run in
parallel while W1 completes. Exactly three workers; the TL is never a worker.

## Non-negotiable boundaries

- Frozen architecture baseline `1.1-frozen-2026-10-05`: module graph,
  entrypoints and dependency directions unchanged. Permitted paths only:
  `web → @unicom/commerce (contract.ts)` and `web → @unicom/experience
  (contract.ts, runtime/index.ts)`. `experience → commerce` remains
  forbidden; web must not depend on `@unicom/agent` (unchanged).
- Prior-phase records (V3, post-V3, rendered-UI) are immutable.
- No live commerce side effects anywhere: no purchases, payments, refunds,
  orders, rentals, commitments or live provider calls. No credentials are
  used or required. Synthetic data stays DEMO-labeled.
- Consent and authorization rules are preserved exactly — the kernel makes
  them canonical; it never relaxes them.
- UNKNOWN ≠ FAILED everywhere; honest unavailable states; accessible
  permission denials with named holders.
- Production deployment, live named-provider connection and human research
  remain NOT_AUTHORIZED separate operator decisions (frontier).

## Acceptance gates (state registry is the authority)

KSEAM (seam published) → KERNEL (both aggregates + exhaustive tests) →
WIRE_BUYER (J5 buyer + J9 kernel-driven) ∥ WIRE_MERCHANT (J5 merchant +
J15 runtime-wired) → SAFETY (invariants re-verified on kernel-driven paths,
browser safety slice extended) → BROWSER (merged-lineage real-browser gate
over J5 buyer+merchant, J9, J15 + regression spot-checks) → TL_ACCEPT
(merged battery: vitest / lint / architecture:check / scoped tsc; final
phase report with honest limitations).

## Evidence laws (unchanged from the rendered-UI phase)

Real-browser evidence is the authority for journey claims; fixture/unit
pass alone is never browser acceptance. Superseded outcomes stay recorded
beside re-runs. Vehicle-drought honesty: partial work is harvested and
disclosed, never fabricated; the TL re-verifies every worker claim
independently before acceptance.
