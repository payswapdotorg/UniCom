# UNiCOM V2 — Product-Completeness Charter

Date: 2026-10-07
Repository: payswapdotorg/UniCom
Architecture: v1.1-frozen-2026-10-05 (UNCHANGED — this charter adds no architecture)
V1 terminal state: 18/18 work orders MERGED; release candidate; operator-authorized production deployment verified live (2f7499a).

## 1. Operator authorization

The operator directive of 2026-10-07 (IM session web-6ddc0a59, quoted verbatim for the record):

> always fix the replay
> continuous resident watch from here on: monitor → harvest → review → approve/require-changes → dispatch next, until the roadmap is complete. No early returns. Use the Unicom github repo as guide for roadmap

This charter records that authorization in the repository (the sole source of truth), superseding the v1 close-out discipline ("No new Work Order should be activated after W2-006") which governed the v1 program only. The v2 program exists because the repository's own roadmap guidance — `docs/FINAL-FEATURE-AUDIT-2026-10-05.md` — declares:

> Important: green checks mean the feature is represented in the frozen architecture/plan and has a defined UX/discovery path. They do not mean implementation is complete.
> A green architectural feature becomes product-complete only after: contract → implementation → discoverable UX → real journey → evidence → acceptance.

The roadmap to completion = driving every `docs/FEATURE-COMPLETENESS-MATRIX.md` capability to product-complete under that rule.

## 2. Gap basis (repository evidence, 2026-10-07 TL audit)

Verified against the tree at 2f7499a:

- **Public commerce API/SDK surface (matrix "API/SDK/REST/GraphQL")**: absent as a product surface — `graphql`/API references exist only inside transport/adapter internals; no public typed API/SDK contract, no REST/GraphQL product path, no journey.
- **Commerce Network protocol adapters (matrix "UCP/ACP/MCP/A2A adapters")**: absent — the only MCP surface is the inherited ZCode settings UI; no commerce-network protocol adapter capabilities exist.
- **Marketing & analytics (matrix "Marketing/analytics")**: navigation/surface references only (`navigation.ts`, `feature-matrix.ts`, `surface-state-manifests.ts`); no merchant marketing-campaign or analytics/reporting domain implementation.
- **CRM / loyalty depth (matrix "Customers/CRM/loyalty/subscriptions")**: crm 3 files, loyalty 8 — thin references; subscriptions domain exists (26 files) but CRM/loyalty journeys are not product-complete.
- **Forecasting depth (matrix "Inventory/…forecasting")**: 4 files — thin vs. the receiving/inventory core (54 files).
- **Ingestion paths (matrix "Webhooks / CSV/XML/EDI/SFTP/email")**: webhook 7 / edi 8 / sftp 7 files — transport-side presence without product-complete ingestion journeys.
- **Buyer-agent vocabulary depth (matrix buyer-agent list)**: financing 3, price-timing 2, negotiation 3, warranty 4 files — vocabulary present in architecture, not driven through agent journeys + evaluation evidence.
- **Opportunity engine rows (matrix "User opportunities")**: warranty/recovery, unused-subscriptions, future-price, shared-logistics rows lack journey/evidence closure.
- **Physical breadth (matrix physical list)**: QR/NFC/camera/shelf-photo/cycle-count references exist in the edge/observation layers; product-complete physical journeys (device-class coverage + reconciliation evidence) remain open.

Deep/complete areas (NO v2 work — certified by the v1 release gate at 2f7499a, 1093/1093): commerce kernel + checkout/payment/recourse, autonomous store, trust/proof/immune system + promotion gates + adversarial suite, Reality/Learning Lab + model routing, UX hardening (21 surfaces), 6 marketplace connector providers, live commerce, deployment/observability/DR, no-RFID supermarket edge.

## 3. V2 program structure

Two waves, three lanes, identical governance to v1 (max 3 concurrent workers; TL orchestrates, never a fourth lane; every gate from the v1 gate table applies).

### Wave 1 — completeness closures (ACTIVE at charter)

- **W1-007 — Merchant parity completeness** (Worker 1): marketing campaigns, analytics/reporting, CRM/loyalty depth, forecasting depth as deterministic domain contracts + kernel journeys + certification evidence.
- **W2-007 — Buyer agent + opportunity completeness** (Worker 2): financing, buy-now-vs-wait, price timing, negotiation, warranty/recovery, unused-subscription, shared-logistics opportunities as capability contracts + Reality/Learning-Lab evaluation evidence (comparable to the W2-005 battery).
- **W3-007 — Commerce Network surface completeness** (Worker 3): public API/SDK surface (REST + typed SDK + GraphQL-capable), UCP/ACP/MCP/A2A protocol adapters as connector capabilities, webhooks/CSV/XML/EDI/SFTP/email ingestion, camera/QR/NFC/shelf-photo/cycle-count physical journeys — every path discoverable in the UX with browser E2E evidence.

### Wave 2 — derived on Wave-1 merges (FRONTIER)

- **W?-008 series — full-matrix discoverability audit + closure** (zero orphan capabilities; every matrix row demonstrably satisfies contract → implementation → discoverable UX → real journey → evidence), followed by the **v2 release-gate re-run** (cumulative battery + adversarial suite + E2E + RC evidence regenerated on the v2 lineage).

Wave-2 orders are DERIVED, not pre-committed: their exact scope is fixed only when Wave-1 evidence exists (the v1 §3 law — no two progress authorities; state derived from evidence, not prediction).

## 4. Constraints (inherited verbatim from v1)

- Architecture frozen (v1.1): all INVARIANTS, no drift, no new organization/model/skill semantics beyond what completeness journeys strictly require.
- The repository is the sole source of truth; worker reports are claims until the TL battery re-verifies (the TL's own integration/re-run gate is authoritative).
- All v1 gates REQUIRED (architecture conformance, contract tests, typecheck, lint, real-connector evidence, browser E2E for UI, UNKNOWN reconciliation, idempotency, adversarial security, simulation isolation, capability scope, provider-state preservation, incumbent-native baseline, feature discoverability, local-commerce-edge, plus the W2-006 promotion gates where promotion is touched).
- Progress authority: `docs/development-state/v2-work-order-state.json` (v1 file remains as the frozen completed registry — no contradictory authorities).
- Production stays on the authorized v1 lineage until the v2 release gate passes and the operator re-authorizes.

## 5. TL loop (the operator's standing order)

monitor → harvest (branch oracle; git is the gold standard) → review (TL battery on the merge result; never trust reported numbers) → approve (squash-merge via PR + one-commit state update) or require-changes (re-dispatch with the gap list) → dispatch next. No early returns: the loop runs until the roadmap (§1) is complete.
