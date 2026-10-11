# FINAL TL HANDOFF — UNiCOM Product Completion & Build Readiness

**Date:** 2026-10-11  
**Repository:** `payswapdotorg/UniCom`  
**Tracking issue:** [#12](https://github.com/payswapdotorg/UniCom/issues/12)  
**State authority:** `docs/development-state/product-completion-state.json`  
**Prior completed phase:** Runtime Integration, issue #11; immutable record `docs/development-state/runtime-integration-state.json`  
**Architecture:** `1.1-frozen-2026-10-05`

## 1. TL directive

Take ownership of this successor phase and use the repository as the sole source of truth. The accepted runtime-integration phase is complete; do not reopen or rewrite its history. Implement only the three bounded work orders below, in parallel where their write surfaces are disjoint, then merge, independently verify, publish the final evidence and update the current state registry.

This handoff authorizes **non-live work inside the frozen architecture only**. It does not authorize an architecture change, a commerce-plane linking implementation, production deployment, production mutation, live named-provider credentials/connections, live purchases/payments/refunds/orders/reservations, or human research.

Exactly **three workers**: worker 1 owns W1-013, worker 2 owns W2-014, worker 3 owns W3-017. The TL is coordinator/integrator and is not a fourth worker. Do not create duplicate vehicles when delivery is delayed; inspect live branch/worktree activity first and harvest completed commits/artifacts even if an agent result message is missing.

## 2. Current verified baseline

The latest inspected default-branch lineage includes runtime integration commit `1ae8bc0a228af7b5d2059c76be90a3d189e4cb76`. Before dispatch, verify the actual default-branch head and working state; do not assume this SHA is still HEAD if new work landed.

The closed runtime-integration report `docs/runtime-integration/FINAL-REPORT.md` records:
- Seven gates passed: KSEAM, KERNEL, WIRE_BUYER, WIRE_MERCHANT, SAFETY, BROWSER and TL_ACCEPT.
- Merged battery: 2,010/2,010 tests; lint 101 warnings / 0 errors; architecture check 0 violations; scoped TypeScript checks clean.
- Browser evidence: 19/19 journey families passed, 18 interactions PASS plus J18 honestly ABSENT by design, safety 5/5, walk 6/6, 92/92 evidence pointers and validated manifest.
- TradeCycle J9 and buyer/merchant GroupBuy J5 are kernel-driven. The Shopify adapter runtime has been exercised through safe non-live paths only: registered, not connected; health UNKNOWN; no credentials and zero provider calls.
- A formed GroupBuy or executed TradeCycle still creates no commerce-plane order/payment/reservation. The J15 browser currently renders a committed safe-exercise record rather than evaluating the live connector runtime.
- J12 has additional B2B contract-only/demo-labelled surfaces; J16 camera/QR capture remains a registered gap.
- The canonical hidden-sourcemap Vite build has not been proven in this resource-constrained environment. The prior `--sourcemap false` successful variant is not canonical-build evidence.

Treat those as baseline findings, not a claim that UNiCOM is production-ready.

## 3. Work orders and parallelism

| Order | Owner | Scope | Dependency |
|---|---|---|---|
| W1-013 | Worker 1 | Canonical production-build evidence; build-only CI if needed | None |
| W2-014 | Worker 2 | Finish the identified J12 B2B rendered-interaction gaps | Existing public contracts; no shared-shell refactor |
| W3-017 | Worker 3 | J16 local camera/QR scan and accessible fallback | Existing physical-store flow; no new dependency edge |

All three can begin after the TL verifies baseline HEAD and posts the exact SHA to the issue. Keep write surfaces disjoint; each worker must publish its first small seam/map quickly, then continue implementation and evidence. The TL may merge completed lanes incrementally but must not accept based only on worker self-report.

### W1-013 — canonical Vite production-build evidence
Read `docs/work-orders/W1-013.md`. Run the unchanged canonical Vite build in a clean environment with at least 3 GB free memory. Record actual free-memory floor, exact command, commit, tool versions, timings, exit code, output inventory and hashes. Prefer an existing free runner. If adding CI, it must be build-only and must not publish/deploy or use deployment credentials. Do not silently disable source maps or call the historical no-sourcemap variant a canonical PASS. If the build is still blocked, preserve complete evidence and mark the gate BLOCKED honestly.

### W2-014 — J12 B2B rendered-flow completion
Read `docs/work-orders/W2-014.md`. Audit the current contract-to-UI gap first. Fill the narrowest useful interactive surfaces supported by existing public contracts, with permissions, keyboard/accessibility, deterministic reset and visible DEMO/unavailable status. A fixture or rendered click must not be represented as a real purchase order, payment, reservation, shipment, provider connection or commitment. Provide real-browser evidence for the new interactions and allowed/denied role paths.

### W3-017 — J16 local camera/QR capture
Read `docs/work-orders/W3-017.md`. Build an explicitly user-initiated local scan path, feature/permission handling, cleanup of media tracks, and accessible manual fallback. No image/frame upload, persistence, remote decoding, hidden camera activation, telemetry of frames or provider calls. Preserve the existing offline queue/replay semantics and keep disconnected inventory demo-labelled. Use a deterministic decoder/camera test seam in CI, plus real-browser evidence for success and denial/fallback.

## 4. TL-owned decision packets — preparation only

During the worker lanes, prepare two short decision documents in `docs/operator-decisions/`. These are analysis/options and questions for the operator, not authorization to code the changes.

1. **Commerce-plane linking:** propose a staged, idempotent and consent-preserving design for how a formed GroupBuy or successfully executed TradeCycle might eventually map to order/payment/reservation/recourse flows. Explicitly distinguish formation/execution truth from downstream commitments, require separate authorization for each side effect, specify duplicate/retry semantics, actor authority, cancellation/compensation and UNKNOWN recovery, and list the acceptance tests and rollout/kill switch needed. Compare alternatives and state which interfaces or architecture edges would change. Do not create an order, commitment or mutation now.
2. **J15 browser-safe runtime boundary:** assess whether a browser-safe experience runtime sub-entrypoint can be delivered while preserving architecture baseline `1.1-frozen-2026-10-05`, public entrypoints and Node-only adapter isolation. Compare options, bundle/secret leakage risks, tests and the precise architecture changes (if any). The registry currently labels this a decision request. Do not implement a new entrypoint/export or change the module graph unless a later operator decision authorizes it.

These packets should be decision-ready: problem, current evidence, choices, risks, recommendation with rationale if supported, exact approval needed and a separate safe implementation plan. Keep provider credentials, production deployment and human research as separate approvals.

## 5. Non-negotiable architecture and safety laws

- Frozen baseline `1.1-frozen-2026-10-05`; this phase authorizes no graph, dependency direction or public-entrypoint change.
- Permitted boundaries remain web → public `@unicom/commerce` contract and web → public `@unicom/experience` contract/runtime. `experience → commerce` is forbidden; web → `@unicom/agent` is forbidden.
- Kernel truth is canonical. UNKNOWN is not FAILED. GroupBuy interest is not commitment. Each TradeCycle leg needs its own valid consent/authorization. Refusal must not commit other legs. Idempotent retries must preserve the original receipt/result and must not duplicate an effect.
- DEMO and synthetic fixtures must stay visibly labelled; tests do not turn them into live system evidence.
- No real provider connections or provider HTTP calls, credentials, purchase/order/payment/refund/reservation mutations, deployment, production change or user research.
- Camera/media bytes remain local and ephemeral; no upload, storage or telemetry. Hardware activation is always user-initiated.
- Prior phase records are immutable. Preserve previous failed/blocked browser and build attempts with their histories; never rewrite denominators to make a gate green.
- Evidence must identify the exact commit and command. Real-browser evidence is required for rendered claims; unit and fixture tests alone are insufficient.

## 6. Merge gates and closeout

Use a dependency graph, but exploit parallel execution without creating overlapping write ownership:

```text
BASELINE / HEAD VERIFICATION
          |
    +-----+------+ 
    |     |      |
 W1-013 W2-014 W3-017
 BUILD   B2B   CAMERA/QR
    |     |      |
    +-----+------+
          |
  MERGED REGRESSION BATTERY
          |
  REAL CHROMIUM/PLAYWRIGHT
          |
  SAFETY + MANIFEST VALIDATION
          |
  TL INDEPENDENT ACCEPTANCE
          |
  FINAL REPORT + STATE UPDATE
```

At minimum, run the repository's canonical relevant test suite, lint (report both warning and error counts), architecture check, scoped TypeScript checks and the full merged real-browser gate. Extend the browser evidence for J12 and J16 without changing journey denominators dishonestly. Expect the baseline 19 journey families and J18 ABSENT-by-design classification unless a genuine, reviewed UI change makes that classification obsolete; if it does, update the test contract and report with history-preserving evidence. Validate that every manifest pointer resolves and every denominator reconciles.

The TL must:
1. Independently reproduce worker commands/results from the merged tree.
2. Review the final diff for frozen-architecture compliance, secrets, side effects, false operational copy and test evidence quality.
3. Run the complete merge gates after all lane merges, not just lane-local tests.
4. Write `docs/product-completion/FINAL-REPORT.md` plus build/browser evidence under `docs/product-completion/`.
5. Update `docs/development-state/product-completion-state.json` with exact status, commit SHA, work order commits, tests, browser run IDs, evidence hashes/pointers, remaining frontiers and UTC timestamp.
6. Update issue #12 with the evidence; close it only if the gates have the recorded terminal status. If the canonical build remains unproved, do not mark that gate PASS or describe release readiness as complete; preserve the honest blocker and leave/mark the phase appropriately open.
7. Keep both TL-owned operator decision packets outside the code merge decision; they remain pending approval.

## 7. Definition of done

- J12 B2B controls declared complete are actually rendered, accessible, permission-aware and real-browser verified; fixture-only claims are labelled.
- J16 has a tested local QR/camera path plus accessible fallback, no media transmission, and full track cleanup; offline queue/replay remains intact.
- Canonical Vite build is demonstrated on the merged commit in a suitable environment, or the blocker is fully evidenced and explicitly left BLOCKED.
- Relevant suite, lint, architecture, scoped TSC, safety, browser journey and manifest-validation gates all have exact evidence.
- The two decision packets are ready for an operator decision, without crossing either decision boundary.
- Current state registry and final report become the source of truth. This chat is not required to execute, review or close the phase.
