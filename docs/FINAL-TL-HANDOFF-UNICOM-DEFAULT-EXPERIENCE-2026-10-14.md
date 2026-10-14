# Final TL Handoff — Make UNiCOM the Default App Experience

**Date:** 2026-10-14  
**Tracking issue:** https://github.com/payswapdotorg/UniCom/issues/22  
**Status:** READY_FOR_TL_DISPATCH — worker sessions have not yet been confirmed by this artifact.  
**Authority:** repository source of truth; implementation approved within the frozen architecture only.

## Mission

Turn the ZCode-derived application into UNiCOM at the actual first-run/launch surface on web and Ubuntu desktop. A user must not need to recognize and click a floating “UNiCOM Commerce →” overlay to discover the product. The existing agent runtime is infrastructure, not the product's primary identity.

## Current verified baseline

The inspected source baseline was main SHA 16bd4680073fed0a3c36ef61a39d270b95872d17.

- The root web entry remains the ordinary ZCode workspace; packages/web/src/commerceEntry.tsx provides /commerce and an overlay button.
- packages/web/index.html still titles the app “ZCode”.
- The Electron renderer at packages/desktop/src/renderer/src/main.tsx boots the ZCode Root after required desktop startup admission.
- Desktop product identity/installer metadata still use ZCode/ZCode Preview.
- A rendered commerce host already exists: packages/web/src/commerce-host/shell/CommerceHostApp.tsx and the registered buyer/merchant modules. The 2026-10-10 phase report and state are prior evidence; do not reset or rewrite them.
- The user’s local verification report for the Ubuntu app showed the unpacked packaged ZCode executable running with a visible 1200×800 ZCode window. It did not establish a finished UNiCOM desktop experience, a successfully installed DEB, or a normal AppImage launch.

## Authority and hard boundaries

Read in this order:
1. AGENTS.md
2. spec/architecture/FROZEN-ARCHITECTURE.md
3. spec/architecture/INVARIANTS.md
4. spec/dependency-graph.md and scripts/dependency-graph.mjs
5. docs/UX-DEPLOYMENT.md and docs/FEATURE-COMPLETENESS-MATRIX.md
6. docs/development-state/rendered-commerce-ui-state.json, docs/rendered-ui/CONTRACT-MAP.md, docs/rendered-ui/FINAL-REPORT.md
7. docs/development-state/unicom-default-experience-state.json and the three phase Work Orders below.

No frozen-architecture change, new unapproved dependency edge/export, production deployment, live named-provider connection/credentials, payment, commerce mutation or human research is authorized. If desktop reuse cannot be done within the current graph, the TL must continue independent web work and prepare a decision packet instead of silently amending the graph or making a second copy of the host.

Existing baseline truths must remain intact: one Main Agent as the principal identity; skills as normal specialization; bounded/de-privileged delegates; deterministic canonical commerce state; UNKNOWN is not FAILED; preserve provider-specific states; explicit authority/approval; separate UserTrust, AgentTrust, CapabilityTrust and TransactionProof; fixtures are labelled; no production-reachable mocks.

## Parallel work orders — exactly three workers

| Work order | Owner | Purpose | Status |
|---|---|---|---|
| docs/work-orders/W1-026.md | Worker 1 | Product home, Buyer Intent Canvas and merchant/store first journeys | READY_FOR_TL_DISPATCH |
| docs/work-orders/W2-029.md | Worker 2 | Main-Agent, autonomy, decision, evidence, trust and recourse UX | READY_FOR_TL_DISPATCH |
| docs/work-orders/W3-024.md | Worker 3 | Default web + Ubuntu desktop launch, packaging identity and real-browser/desktop proof | READY_FOR_TL_DISPATCH |

The TL is an orchestrator and acceptance gate, not a fourth worker. Before dispatch, verify current main HEAD and clean/base state, confirm no other workers are active, record each worktree/branch/session/base SHA, and ensure the write surfaces remain disjoint. W3's architecture gate is mandatory before desktop integration; W1 and W2 can work on their assigned product modules in parallel.

## Product intent

- Merchant/operator entry: a Command Center / Work Graph for active work, proposals, decisions, opportunities, evidence, approvals and connector state.
- Buyer entry: a natural-language Intent Canvas with constraints, offers/options and honest uncertainty/availability.
- Explicit role switching among supported buyer/merchant/staff/supplier/reseller/renter/coordinator roles, without changing identity or implicitly granting permissions.
- Navigation that makes Buy, Sell/Store, Operate, Discover, Lab, Trust/Security, Connections, Explore/Capabilities and Settings discoverable.
- Make the ZCode workspace a deliberate secondary capability where permitted; never remove the runtime just to conceal its upstream origin.
- DEMO, synthetic, disconnected, unknown, blocked and unavailable outcomes remain visually and semantically distinct from observed/live execution.

## Dispatch protocol

1. Verify the current default-branch HEAD after these phase documents were added; do not trust the older source-baseline SHA as current HEAD.
2. Update this phase state before launch: record current head, current baseline battery, and any actual active work orders.
3. Dispatch W1-026, W2-029 and W3-024. Do not report a lane as active until its actual branch/session and base SHA exist.
4. Require each worker to commit incrementally, include tests, preserve partial work and report failures honestly. Do not accept a written worker claim as proof.
5. If worker-vehicle dispatch fails, record the exact failure, harvest any partial branch/commits/worktree state, and retry through the established resident TL process; do not silently absorb a lane into the TL or exceed three workers.
6. Once the initial delivery is in, TL runs tests and acceptance checks on the merged candidate; for UI, run the real-browser journey and inspect the rendered DOM/screenshots. For Ubuntu, build and launch a packaged artifact, check metadata/hash/window/first screen, and honestly record whether install/FUSE prerequisites were unavailable.
7. Update the phase state only from TL-observed results, add immutable reports and evidence pointers, and produce the final handoff/green-tick graph. Leave all production and live-commerce decisions unchanged.

## Acceptance bar

The full gates are in issue #22 and each Work Order. The critical release proof is: (a) web root opens into UNiCOM; (b) a current Ubuntu package opens into UNiCOM as the first user-facing screen; (c) buyer and merchant journeys, role switching, authority refusal and honest unavailable states are real-browser-tested; (d) ZCode runtime/startup/auth/share functionality is preserved; (e) targeted tests, scoped typechecks, lint and architecture checks pass without drift; (f) TL independently verifies actual evidence.

A development-server screenshot is not desktop release evidence. A source bundle that merely exists is not a successful install. The previous UI phase's success at /commerce is not evidence that the default app launch is already UNiCOM.
