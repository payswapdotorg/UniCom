# Zero-Orphan Feature-Matrix Map (W3-009)

**Status**: reconciled. Every `FEATURE_MATRIX` row maps to a discoverable
surface + an actual GUI journey. Zero orphans.

## The zero-orphan law (W3-009 acceptance §10)

> "every feature-matrix row must map to discoverable surface plus an actual
> GUI journey or be marked FAIL/ABSENT."

The runner enforces this via `packages/experience/src/sim/zero-orphan-map.ts`,
which walks the encoded `FEATURE_MATRIX` (source:
[`docs/FEATURE-COMPLETENESS-MATRIX.md`](../../FEATURE-COMPLETENESS-MATRIX.md),
encoded at `packages/experience/src/navigation/feature-matrix.ts`) and
cross-references each row's feature id against:

1. **`NAVIGATION_SURFACES`** (`packages/experience/src/navigation/surfaces.ts`)
   — which surfaces declare the feature id in their `discovers` array.
2. **`JOURNEY_FAMILY_REGISTRY`** (`packages/experience/src/sim/journey-registry.ts`)
   — which journey families touch at least one of those surfaces.

## Verdict derivation (anti-vacuity)

| Verdict | Condition | Reason |
| --- | --- | --- |
| `pass` | ≥1 surface declares the feature discoverable, AND ≥1 journey family touches that surface | feature is discoverable + exercised |
| `fail` | ≥1 surface declares the feature discoverable, BUT no journey family touches that surface | **orphan journey** — feature exists below the GUI |
| `absent` | no surface declares the feature discoverable | **orphan surface** — feature has no visible entry point |

The verdict is **derived**, never hand-typed. Re-building the map produces
identical verdicts. Corrupting any pointer (surface id, journey family
id, feature id) flips the verdict.

## Reconciliation result

| Metric | Value |
| --- | --- |
| Total rows | 132 |
| Passed | 132 |
| Failed (orphan journeys) | 0 |
| Absent (orphan surfaces) | 0 |
| Reconciled | ✅ true |

## Coverage by section

| Section | Rows | Status |
| --- | --- | --- |
| `merchant-parity` | 14 | ✅ all pass (journey: `merchant-commerce-lifecycle`) |
| `ai-native-merchant-layer` | 12 | ✅ all pass (journey: `commerce-twin-what-if` + `autonomous-store-policy`) |
| `commerce-network` | 18 | ✅ all pass (journey: `connected-commerce-channels-and-live-commerce` + `failure-unknown-idempotency-recovery`) |
| `buyer-agent` | 22 | ✅ all pass (journey: `buyer-intent-constraints` + `offer-sourcing-comparison` + others) |
| `coordination-organization` | 14 | ✅ all pass (journey: `bounded-multi-hop-trade-cycle` + `proactive-economic-opportunities` + `commerce-twin-what-if`) |
| `user-opportunities` | 10 | ✅ all pass (journey: `proactive-economic-opportunities` + `resale-rental-consignment`) |
| `trust-security` | 16 | ✅ all pass (journey: `trust-security-fraud-and-recourse`) |
| `physical-commerce` | 14 | ✅ all pass (journey: `physical-no-rfid-supermarket`) |
| `deployment-coverage` | 12 | ✅ all pass (journey: `failure-unknown-idempotency-recovery`) |

## How the §10 journey families cover the surfaces

Each of the 19 §10 journey families declares the surfaces it touches
(see `JOURNEY_FAMILY_REGISTRY` in
`packages/experience/src/sim/journey-registry.ts`). The map matches each
feature's discoverable surfaces against any journey family that touches
at least one of those surfaces.

| Journey family (§10 id) | Surfaces touched |
| --- | --- |
| `buyer-intent-constraints` (§10.1) | `buyer-intent-canvas` |
| `offer-sourcing-comparison` (§10.2) | `buyer-intent-canvas`, `opportunity-inbox` |
| `buy-now-vs-wait-price-timing` (§10.3) | `buyer-intent-canvas`, `opportunity-inbox` |
| `existing-group-buy` (§10.4) | `opportunity-inbox`, `buyer-intent-canvas` |
| `latent-demand-merchant-group-buy-proposal` (§10.5) | `opportunity-inbox`, `command-center-work-graph` |
| `rent-borrow-vs-buy` (§10.6) | `buyer-intent-canvas`, `opportunity-inbox` |
| `resale-rental-consignment` (§10.7) | `opportunity-inbox` |
| `proactive-economic-opportunities` (§10.8) | `opportunity-inbox`, `command-center-work-graph` |
| `bounded-multi-hop-trade-cycle` (§10.9) | `opportunity-inbox`, `buyer-intent-canvas` |
| `merchant-commerce-lifecycle` (§10.10) | `operate-catalog`, `operate-inventory`, `operate-orders`, `storefront-studio`, `operate-marketing-analytics` |
| `supplier-procurement-receiving` (§10.11) | `operate-inventory`, `operate-orders`, `connector-studio` |
| `b2b-multi-location-supplier-coordination` (§10.12) | `operate-inventory`, `operate-orders`, `operate-customers` |
| `autonomous-store-policy` (§10.13) | `autonomous-store-config`, `command-center-work-graph` |
| `commerce-twin-what-if` (§10.14) | `commerce-twin-sandbox`, `command-center-work-graph`, `lab-surface` |
| `connected-commerce-channels-and-live-commerce` (§10.15) | `connector-studio`, `live-commerce-discovery`, `app-extensions` |
| `physical-no-rfid-supermarket` (§10.16) | `physical-capture`, `operate-inventory`, `local-edge-setup`, `physical-commerce-tools`, `operate-pos` |
| `trust-security-fraud-and-recourse` (§10.17) | `trust-security-center`, `operate-orders` |
| `failure-unknown-idempotency-recovery` (§10.18) | `connector-studio`, `operate-inventory`, `trust-security-center`, `operator-console` |
| `gui-feature-discoverability` (§10.19) | `command-center-work-graph`, `explore-capabilities` |

## Optional features (INVARIANT 46)

The `physical-rfid` feature is the only feature declared OPTIONAL per
`OPTIONAL_FEATURES` (FROZEN §22.5 / INVARIANT 46). It still appears as a
PASS in the zero-orphan map because the `physical-no-rfid-supermarket`
journey family touches the `physical-commerce-tools` surface where
`physical-rfid` is declared discoverable. The OPTIONAL designation means
RFID must never be REQUIRED — the no-RFID path is first-class without it.
