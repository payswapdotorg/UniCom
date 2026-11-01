# Final TL Handoff — Implement the Approved UNiCOM Product UI/UX

**Date:** 2026-11-01  
**Tracking issue:** https://github.com/payswapdotorg/UniCom/issues/24  
**Parent mission:** https://github.com/payswapdotorg/UniCom/issues/23  
**Status:** READY_FOR_TL_RECONCILIATION — design package committed; UI implementation not yet dispatched  
**Governance repository:** `payswapdotorg/UniCom`  
**Implementation repository:** `payswapdotorg/unicom-3.0`  
**Architecture:** frozen UNiCOM v1.1; no architecture or dependency-edge changes authorized

## 1. Mission

Turn the current ZCode-derived application UI/UX into the exact approved UNiCOM experience captured in the interactive prototype, the supplied reference screens, and the implementation contract committed in:

`payswapdotorg/unicom-3.0/docs/ui-ux/`

This is a user-facing application conversion, not a new product concept, a generic dashboard redesign, a new standalone app, or a rewrite of the ZCode agent runtime. The design decisions are made. The TL's job is to reconcile the current repo frontier, dispatch bounded work, integrate and independently verify the real application.

The product's operating loop stays:

**Goal → Observe → Plan → Simulate → Approve → Execute → Verify → Learn**

The task/agent workspace remains central. Commerce destinations become first-class views inside the same product shell.

## 2. Repository authority and inspected baseline

- `payswapdotorg/UniCom` is the canonical governance, frozen architecture, commerce contract, work-order and progress-state authority.
- `payswapdotorg/unicom-3.0` is the active ZCode-derived runtime and shared React application implementation.
- Parent issue #23 remains the umbrella commerce harness mission. This issue #24 is a scoped UI/UX sub-phase; it does not close or replace #23.
- Governance main observed during preparation: `074bc4dc47b6460aad7dad40c1a12e309cfad8cc`.
- Implementation main before the design-only commits: `67d463798e9c98a8b86cef759e462a3386dee372`.
- Implementation main after the design-only package commits: `5bb26e800e0d831014ac0010a4d2c058494da8bc`.

**These are evidence baselines, not a permission to reset a branch.** Before dispatch, the TL MUST re-fetch both default-branch HEADs, the current issue #23 state, relevant work-order registries, and active worker/agent sessions. Record the actual implementation base SHA for each worker. If the current tree has advanced, inspect and reconcile rather than overwrite.

The parent issue #23 state observed during handoff preparation is `IN_PROGRESS`; the recorded R2/R4/R5/R6/R8/R9/R10 implementation lanes are marked `DELIVERED_MERGED`. The parent state remains the program-wide authority. It must be checked for any newer in-flight work before allocating worker capacity.

## 3. Canonical design artifacts

The implementation-side design package is the source of truth for this UI phase:

- `unicom-3.0/docs/ui-ux/README.md` — package entry and links.
- `unicom-3.0/docs/ui-ux/UNiCOM-UI-UX-DESIGN-CONTRACT.md` — exact visual direction, information architecture, screen behaviors and My Store rules.
- `unicom-3.0/docs/ui-ux/UNiCOM-UI-UX-IMPLEMENTATION-MAP.md` — actual current UI/runtime paths and reuse guidance.
- `unicom-3.0/docs/ui-ux/UNiCOM-UI-UX-ACCEPTANCE-MATRIX.md` — 40 browser-visible acceptance cases, all initially OPEN.
- `unicom-3.0/docs/ui-ux/prototype/UNiCOM-Interactive-UI-Prototype.html` — dependency-free HTML interaction reference.
- `unicom-3.0/docs/ui-ux/prototype/README.md` — prototype usage and limitations.
- `unicom-3.0/docs/ui-ux/references/REFERENCE-SCREENSHOT-INDEX.md` — original screenshot names and extracted design signals.
- `unicom-3.0/docs/ui-ux/references/reference-contact-sheet.webp` — committed contact sheet of all six source screens.

The operator upload `unicom.zip` contained six screenshot files: `meshwork.png`, `meshwork2.png`, `meshwork3.png`, `automations.png`, `plugin marketplace.png` and `settings.png`. A compact contact sheet and a source index are committed. Individual original-resolution screenshots are not yet mirrored as separate repository files; the original archive remains the conversation attachment. Do not claim otherwise.

The HTML prototype is a design/demo reference only. Its simulated data and local interactions are not a connected commerce experience and cannot publish to network nodes, send messages, place orders, collect payments, reserve inventory or execute swaps/rentals.

## 4. Approved design — do not reinterpret

### Visual system and shell

- Dark graphite/charcoal foundation, restrained surface/border layering, compact navigation and dense but readable cards/lists.
- Blue is the primary interaction/focus accent. Green/orange/red/purple communicate meaningful states, not decoration.
- Compact expanded/docked left workspace navigation, flexible central work area and optional right-side tool dock.
- Browser and Terminal are accessible as tool tabs/actions in the workspace toolbar and right-side dock. Keep both usable; do not force the terminal into a bottom-only layout.
- Clicking the UNiCOM logo docks/undocks the left workspace navigation without losing the current page/task/pane state.
- Opening Settings removes the workspace navigation pane and shows a dedicated settings navigation. “Back to Workspace” restores the previous page, dock state, tool tab and task context.
- Use the existing app design tokens and shared React components where possible. Do not create a competing design system.

### New Task / Commerce Home

The central workspace begins with **“What would you like to get done?”** and a natural-language task composer connected to the current task/session runtime. Include concise quick actions for:
- Find the best offer.
- Find suppliers.
- Discover opportunities.
- Create a group buy.
- Manage My Store.

Retain the existing project context, model/provider selection, agent stream, task history, approvals, plan, browser, terminal and developer workspace.

### Buying

Capture product and variant, fit/size/condition, geography, currency, maximum landed total cost and deadline. Compare observed offers with item price, shipping, tax/duty and other known costs, availability, freshness, delivery/returns and trust/provenance. Show a landed total only when its required components are observed and exact. UNKNOWN must not be treated as zero. Clearly label alternatives and require the user to accept a substitute.

### Opportunities

Display counterfactual opportunities with:
1. Observed facts and source/time.
2. Changed assumptions or interventions from the baseline.
3. Predicted outcome, uncertainty and evidence tier.
4. Preconditions and platform/capability limitations.
5. Evidence lineage, freshness, expiry and lifecycle status.
6. User/merchant consent, authority and next action.

Distinguish observed, conditional, predicted and recommended. Support inspect, re-evaluate, simulate, compare and explicit opt-in sharing/revoke flows. A predicted saving is never presented as a live quote.

### My Store — replace the user-facing Device destination

**My Store is a personal storefront owned by the user's UNiCOM identity, not by a physical device.** It is Jumia-like: a user can advertise their products, equipment/assets or wanted requests to other eligible UNiCOM nodes.

Support these listing types with distinct forms and terms:

| Listing type | Required or core fields |
|---|---|
| For sale | Title/category, description/media, condition, one-time price/currency, quantity, location and fulfilment |
| For rent | Rate/currency/interval, deposit where relevant, minimum period, availability window, condition and return terms |
| Permanent swap | Item offered, item/category wanted, condition and permanent exchange terms |
| Temporary swap / loan | Item offered, wanted terms, exchange window, handback conditions and **mandatory return-by date/time** |
| Free / giveaway | Item, condition, quantity, location and collection/fulfilment terms |
| Wanted / request | Item/specification, acceptable condition, budget/range, geography, deadline and response preferences |

Temporary swap/loan must fail validation unless return-by date/time is present and valid. Permanent swaps do not have a return-by field unless separately modeled as a temporary agreement.

Store overview includes identity, description, published/paused/private state, discovery audience, listing counts, search/category/type filters, Add listing, cards, freshness/expiry, owner controls, storefront preview and a node-enquiry inbox.

Lifecycle states include draft/private draft, published/discoverable, paused/hidden, reserved (only if there is a real authorized reservation), closed/withdrawn and expired/revalidation. Pausing hides records from discovery; it does not delete a listing or cancel an agreed rental/swap/sale.

Discovery audiences include trusted nodes, all opted-in nodes, selected nodes and private draft. Discovery is not transaction authority and does not grant access to the owner's private intent, customer records, inventory or credentials.

Viewing an enquiry does not send a message or create a transaction. Draft/accept/decline/counter-propose actions must follow existing authority and approval rules.

**Do not delete real device-management, pairing or runtime device controls.** Only replace the user-facing commerce destination/card named Device with My Store.

### Remaining commerce and platform destinations

- Group Buying separates proposal, opt-in interest, qualified participants, merchant confirmation and actual commitment; interest is not purchase/payment.
- Orders & Fulfilment shows sourced/persisted transaction state only.
- Network Nodes exposes trust/connection and share scope with privacy/revocation/expiry.
- Connections must expose operation-level capability readiness; a catalogue-read connection does not imply write/message/publish capability.
- Reuse existing Automations and Plugin Marketplace pages. The commerce Marketplace (products/rentals/swaps) is distinct from the Plugin Marketplace (software extensions, plugins and skills).
- Settings is a separate layout with its own navigation and a clear return to Workspace.

## 5. Actual application surfaces to reuse

The application UI is shared React code used by web and desktop hosts. It is not a new isolated web app.

The code inventory found these important existing files at the inspected implementation baseline:

| Path | Existing role |
|---|---|
| `packages/ui/src/App.tsx` | Root app composition, navigation/page state and shell wiring. Treat as an integration hotspot; avoid concurrent worker edits. |
| `packages/ui/src/app-shell/WorkspaceShellLayout.tsx` | Workspace shell and sidebar/chat/terminal/browser pane coordination. |
| `packages/ui/src/WorkspaceSidebar.tsx` | Workspace sidebar public export; actual implementation is delegated to the project sidebar module. |
| `packages/ui/src/SettingsPage.tsx` | Current settings experience/state. Reuse rather than replace. |
| `packages/ui/src/NewTaskButtonGroup.tsx` | Existing task creation entry; preserve its task-runtime integration. |
| `packages/ui/src/WorkspaceTerminalToggleButton.tsx` | Existing terminal toggle and keyboard affordance. |
| `packages/ui/src/settings/PluginStorePage.tsx` | Existing Plugin Marketplace. |
| `packages/ui/src/settings/AutomationsSection.tsx` | Existing scheduled automation/workflow experience. |
| `packages/ui/src/ToolCallBlocks/renderers/commerce-harness.tsx` | Existing inline commerce harness renderer. It is not the full Buying/Opportunities destination. |
| `packages/ui/src/ToolCallBlocks/renderers/commerce-harness-view/` | Existing result view model and defensive parsing. |
| `packages/web/src/main.tsx` | Web host bootstrapping the shared UI. |
| `packages/desktop/` | Electron host, Browser/Terminal dock integration and desktop packaging. |

Reuse the existing commerce services/contracts. Relevant paths include:
- `packages/services/src/commerce-harness/finding-money.ts`
- `packages/services/src/commerce-harness/offer-evaluation.ts`
- `packages/services/src/commerce-harness/group-buy.ts`
- `packages/services/src/commerce-harness/opportunity-store.ts`
- `packages/services/src/commerce-harness/federation.ts`
- `packages/services/src/commerce-harness/transport-selector.ts`
- `packages/services/src/commerce-harness/browser-recovery.ts`
- `packages/services/src/commerce-harness/merchant-execution.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/merchant-read.ts`

TL must verify current path ownership and source before dispatch; this map is a baseline, not an instruction to blindly edit.

## 6. Three-worker plan and integration ownership

The program-wide maximum remains **three concurrent workers**, not three additional workers for this sub-phase. The TL is orchestrator and acceptance owner, not a fourth worker. Check parent #23 and all active agents first. If no slots are available, wait for existing work to close; do not exceed the limit.

Proposed pairwise-disjoint lanes:

### W1 — Application shell, brand and workspace navigation
Owns:
- app shell/page contract for the new UNiCOM destinations;
- workspace logo dock/undock and persistence;
- Settings entry/exit and layout restoration;
- Browser/Terminal dock affordances;
- responsive/accessibility shell and integration-level tests.

W1 should publish a typed page/navigation integration contract first. No worker except TL may edit `packages/ui/src/App.tsx` if it remains the shared route integration hotspot; TL coordinates the registration or delegates a single owner with explicitly exclusive ownership.

### W2 — Buyer and Opportunities
Owns:
- Buying intent capture and sourced-offer comparison;
- landed cost and UNKNOWN presentation;
- Opportunities list/detail, counterfactual evidence and assumptions;
- inspect/simulate/re-evaluate/compare and share/revoke UI;
- group-buy presentation.

Does not own root route registration or store components.

### W3 — My Store, node discovery and connected surfaces
Owns:
- My Store overview, identity, listing forms and lifecycle;
- type-specific validation (particularly return-by constraints);
- storefront preview and audience selection;
- enquiry inbox and privacy-aware node discovery;
- Connections presentation and navigation integration/reuse of Automations and Plugin Marketplace.

Does not own root route registration or buyer/opportunity components.

### TL dispatch laws

- Before dispatch, refresh both repo HEADs, parent #23 state and active agent/work-order records.
- Record each lane's branch/session/base SHA and exclusive write paths. No overlapping write surfaces.
- Respect frozen dependency graph and module management. Inspect `AGENTS.md`, architecture registries and existing module maps. If a new source module belongs in a managed module, use the sanctioned adoption/registration process.
- The prior implementation repo records `--no-verify` pushes as prohibited. A blocked architecture hook is a defect to resolve, never a reason to bypass it.
- The TL owns shared contracts, route integration if not cleanly separable, merge conflict resolution and independent acceptance. Worker statements and unit tests alone do not close the phase.

## 7. Architecture, product and safety constraints

- Preserve ZCode's existing task and long-running task lifecycle, agent runtime, streaming/replay/recovery, projects/workspaces, model/provider routing, skills/plugins, MCP/tool registry, browser/computer-use, terminal, memory/context, permissions/approval and automation features.
- Keep the existing canonical chain `CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation`, existing CommerceIntent/Opportunity/Lab/Decision concepts and commerce source of truth. Do not create duplicate type vocabularies or new parallel runtime state.
- No frozen architecture or dependency edge changes. If required, prepare the designated ADR/impact packet and stop for separate approval.
- Demo data must be labelled DEMO/SIMULATED. Do not present mock stock, quotes, nodes, enquiries, transactions or savings as live facts.
- This issue authorizes local UI implementation and safe fixtures only. It does not authorize live provider credentials, external broadcasts, public listing publication, purchases, payments, customer messages, reservations, order/inventory changes or production deployment.
- Every visible control must perform a real supported local/runtime action, be disabled with a clear reason, or show an honest unavailable/not-connected state.

## 8. Acceptance — all initially OPEN

The implementation-side matrix contains 40 cases, `UIX-001` through `UIX-040`, in `UNiCOM-UI-UX-ACCEPTANCE-MATRIX.md`. They cover:
- normal app entry and UNiCOM branding;
- shell, logo dock/undock, Browser/Terminal dock;
- Settings transition and restoration;
- New Task and buyer journey;
- landed-cost and UNKNOWN correctness;
- Opportunities evidence and consent;
- group-buy distinction between interest and commitment;
- My Store listing types, fields, lifecycle, audiences, preview and enquiries;
- Node discovery and operation-level Connections;
- Automations and Plugin Marketplace regressions;
- responsive/accessibility;
- existing runtime preservation;
- architecture checks;
- web and packaged desktop acceptance;
- no external side effects.

**All 40 cases start OPEN. Do not mark any green until demonstrated in the real application on the merged tree.**

Required verification:
1. Normal browser/web app entry; navigate normally to every destination (deep links alone do not count).
2. Browser E2E with screenshots and traces for each screen and principal state transition, compared against the committed references.
3. Actual packaged desktop app launch for shell, store, settings, Browser and Terminal behavior; web browser success is not desktop acceptance.
4. Sale, rent, permanent swap, temporary swap/loan, free and wanted listing form tests. Missing/invalid return-by must block temporary swap/loan.
5. Listing lifecycle and audience privacy tests; no real node broadcast.
6. Existing task lifecycle, provider/model, workspace/projects, approvals, browser, terminal, plugin and automation regressions.
7. Typecheck, lint, relevant unit/contract tests, architecture checks and implementation repo battery on the merged tree.
8. Record exact commands, exit codes, browser/device, viewport, base/head SHAs, screenshot/trace paths and evidence tier in repo.

The final TL record must call out what remains blocked, fixture-only, unsupported or awaiting separately authorized live acceptance. UI rendering is not a claim of full production commerce readiness.

## 9. First TL actions

1. Re-fetch current main HEADs and both repositories' active state/work-order records; check all existing sessions and worker activity.
2. Confirm the issue #24 authorization and design package links; read `AGENTS.md`, frozen architecture, invariants, dependency graph, and current UI module registry.
3. Run a read-only route/component inventory at the current head; reconcile any changes since this handoff.
4. Define and commit the exact W1/W2/W3 exclusive paths and page contract. Confirm there are three available program-wide worker slots.
5. Dispatch only pairwise-disjoint work. Keep all acceptance cases OPEN until the TL verifies merged browser/desktop evidence.
6. Update `docs/development-state/ui-ux-implementation-state.json` with real branch/session/base SHAs, progress, tests and evidence; never update by inference or chat-only claims.

**Handoff disposition:** READY_FOR_TL_RECONCILIATION. Design artifacts are committed. No UI implementation workers have been dispatched by this handoff, no product code has been changed by the design-package commits, and the current implementation UI must not be described as converted until the acceptance matrix is proven.
