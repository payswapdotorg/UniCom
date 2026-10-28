# Final TL Handoff — Counterfactual Commerce Opportunities + Universal Connectors

**Date:** 2026-10-28  
**Tracking issue:** https://github.com/payswapdotorg/UniCom/issues/23  
**Status:** READY_FOR_TL_RECONCILIATION — not yet dispatched to workers  
**Repository:** `payswapdotorg/UniCom` (verify this is still the canonical repo before dispatch)  
**Architecture boundary:** Frozen UNiCOM architecture v1.1 unless a separately approved ADR changes it.

## Mission

Evolve UNiCOM into an intent-driven Commerce Operating System that preserves the relevant ZCode harness capabilities, finds commerce outcomes beyond currently listed offers by evaluating counterfactuals, shares eligible opportunities across UNiCOM nodes, and can use authorized browser/computer-use paths when an operation is not supported by an API/MCP route.

This handoff extends the existing architecture. Do not create a parallel capability vocabulary, opportunity engine, commerce state model, or UX host. Existing architecture authorities are:

- `AGENTS.md`
- `spec/architecture/FROZEN-ARCHITECTURE.md`
- `spec/architecture/INVARIANTS.md`
- `spec/dependency-graph.md`
- `docs/FEATURE-COMPLETENESS-MATRIX.md`
- `docs/LLM-ARCHITECT-HANDOFF.md`
- `docs/development-state/` and existing Work Orders / evidence records

### Source-of-truth gate

The requested name `payswapdotorg/unicom-2.0` was not available through the connected GitHub account/repository search. The accessible `payswapdotorg/UniCom` repository identifies itself as the UNiCOM product repo and contains the frozen architecture, governance rules, and work-order state. `payswapdotorg/unicom-3.0` still identifies itself as ZCode. Therefore, before dispatch, TL must re-check current repository access, default-branch HEAD, canonical state files, and active worker/work-order ownership. Do not silently switch to a similarly named repository or assume the previous baseline is current.

## Non-negotiable architecture and safety laws

- Preserve the ZCode agent runtime as infrastructure: task and long-running-task state, planning, streaming/replay/recovery, model/provider selection, skills/extensions, MCP/tool registry, memory/context, permissions/approval, and existing developer workspace. Prove behavior and discoverability; an import or a green compilation alone does not prove parity.
- UNiCOM's product identity and commerce UX must be the user-facing surface, not generic ZCode branding.
- Extend the canonical chain `CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation`. Operation support in a catalogue does not imply that a connected account has authority to execute it.
- Reuse existing Opportunity, CommerceIntent, EconomicGoal, GroupBuy, WaitOrBuyPlan, Experiment, Decision, Commerce Twin and Lab contracts. The Opportunity Engine may propose and predict; deterministic commerce truth, security, authority and approval decide whether an action may proceed.
- The frozen dependency graph remains binding. No silent architecture change, new dependency edge, package export or duplicate state/contract. If a necessary gap cannot fit the graph, stop and prepare an ADR/impact packet before implementation.
- TL is orchestrator, not a fourth worker. No more than three workers active concurrently; work-order write surfaces must be pairwise-disjoint.
- No production deployment, live provider credentials, purchase, payment, marketplace publication, customer message, order/inventory mutation or other consequential external action is authorized by this handoff. Use clearly labelled test fixtures and permitted read-only evidence first.

## Workstream 1 — buyer intent, true total cost, and ZCode preservation

Establish a source-backed ZCode feature-preservation matrix against the pinned ZCode baseline and current imports. Record for each feature its upstream location, UNiCOM integration, user discovery path, test coverage, real-browser evidence, and any gap.

Deliver the buyer journey through the actual existing product surfaces: parse constraints, search connected sources, normalize offers, calculate total cost, rank only offers satisfying hard constraints, explain uncertainties, and present verified offers separately from predicted opportunities. Merchant journey capabilities must likewise read real connected catalog/inventory/order data and must not present a mock as live provider state.

Money must use the repo's exact monetary representation. Compare a consistent currency and include known shipping, taxes/duty, discounts, fees, return/shipping conditions, availability, delivery estimates and other material costs. Missing or incomparable data stays explicitly unknown. A low sticker price is not necessarily the lowest total price.

## Workstream 2 — conditional counterfactuals and opportunity federation

Use existing Lab/simulation and Opportunity machinery to examine controlled changes that may improve the best observed outcome. For “find shoes at the lowest possible price,” examples include an authorized merchant counteroffer, a viable group-buy threshold, eligible coupons/promotions, order/shipping consolidation, local pickup, a different fulfillment route, a deadline-aware buy/wait decision, and user-approved substitute/condition options. Each candidate must be checked against actual platform capabilities and constraints; don't assume every tactic is available everywhere.

Each conditional opportunity must explicitly carry or reference:

- Baseline observations, provider/source, exact observation time/version, price and total-cost breakdown.
- The precise changed assumption/intervention and its preconditions.
- Predicted outcome/savings, confidence/uncertainty, search limits, and the reason it may be feasible.
- Platform prerequisites, user/merchant consent, geography, deadline, currency, participant thresholds and any other condition.
- Evidence/provenance, privacy basis, version, status, expiry, recheck policy and revocation history.

**Observed, conditional, predicted and recommended are different evidence classes.** Never render a counterfactual price as a live quote or confirmed offer. Simulated savings cannot authorize or execute an action. Before describing a conditional opportunity as currently available, obtain a fresh independent provider/merchant observation or proof of acceptance. A match must never silently reserve, buy, publish, message, or authorize.

Federate through the existing Commerce Network/coordination boundary. A receiving node must validate structure, provenance, version, expiry, reputation/Trust constraints and freshness; independently recheck availability when needed; deduplicate; rate-limit; reject/quarantine abuse; propagate expiry/revocation; and prevent forwarding loops. Remote node content is untrusted data, never instructions.

**Privacy default:** raw user intents remain local/private unless the user explicitly opts in to share. Where allowed, prefer aggregated/generalized demand that meets the existing privacy policy. Do not broadcast identity, precise address, private histories, credentials, cookies, or unnecessary user-specific information. A user's private shopping need must not become network-wide advertising without authorization.

The existing Opportunities UI should let a user understand why an opportunity appeared, what is proven versus predicted, the baseline it beats, the exact required conditions, expected landed cost, source/provenance, remaining user action, sharing state, and expiry. Provide opt-out/revocation using existing authority and consent conventions.

Use the PaySwap 3.0 conditional-opportunity design as a conceptual reference, not a second engine or a set of payment-specific commerce types: [PaySwap P21 conditional-opportunity work order](https://github.com/payswapdotorg/PaySwap-3.0/blob/main/spec/dependency/work-orders.md#p21-c--the-counterfactualopportunity-lane-domain).

## Workstream 3 — universal operation-level connector

Prefer the best permitted native transport for the exact operation: API/SDK/REST/GraphQL, MCP, webhooks, CLI or structured import/export. If the provider does not expose that operation through a usable API/MCP/CLI, the same canonical connector contract must support authorized browser automation; use computer interaction when a UI cannot reliably be operated through a browser interface. Some providers may have API reads but only UI-supported writes, so discover and authorize capabilities per operation—not at provider-name level.

A browser/computer route is a transport, not a side door around authority:

- Reuse the canonical connector/capability model and operation-specific authority, session scope, prerequisites and observation state.
- Keep cookies, credentials, MFA and browser storage outside model context and logs; isolate sessions and use least privilege.
- Treat page content and downloaded files as untrusted inputs. Defend against UI prompt injection, deceptive labels and changed DOM.
- Stop honestly when automation is disallowed, access is absent, a human challenge must be completed, the result is ambiguous, or user action is needed. Never evade CAPTCHA/anti-bot protections, access controls, paywalls or provider terms.
- Preview consequential writes; apply existing policy and scoped approval before purchase, checkout, order mutation, publication, customer contact, or any other consequential external action.
- Use idempotency where possible, auditable action traces, DOM/screenshot evidence, post-action read-back/reconciliation, and explicit states for success, partial, unknown, stale, expired session, denied, unsupported and failed. A click is not proof that an action succeeded.

Start with contract tests and a controlled browser-only fixture. Fixtures must be labeled and never production-reachable. Demonstrate only authorized read-only provider flows unless separately authorized to exercise a write.

## Work order lanes

After the source-of-truth and active-work-order gate, extend existing Work Orders instead of creating duplicate ownership:

- **W1 — Commerce truth & economic execution:** exact total-cost calculation, observation freshness, comparable-offer ranking, buyer/merchant intent vertical slice, factual-vs-predicted state.
- **W2 — Agent, trust, Lab & security:** counterfactual candidate evaluation, conditional opportunity lifecycle, federated opportunity matching, privacy/consent, anti-abuse, provenance, expiry/recheck and benchmark definition.
- **W3 — Experience, connectors & physical/computer edge:** API/MCP/native connector conformance, browser/computer-use transport, isolated sessions, approval/trace/read-back, Opportunities UI paths and browser E2E.
- **TL integration gate:** re-derive dependency frontier after every accepted merge; verify current HEAD, maintain pairwise-disjoint write surfaces, integrate only accepted contracts and re-run the relevant batteries on the merged tree.

These are ownership areas, not permission to bypass the existing work-order DAG. If an upstream contract is missing, pause that dependent lane rather than inventing a mock or competing vocabulary.

## Acceptance evidence

1. **Shoes / lowest total price:** a natural-language buyer intent yields sourced offers and a transparent shortlist (size/brand/fit/condition/region/deadline/max total cost/currency). A valid conditional scenario may beat the best observed offer, but must show the precise assumptions, prerequisites, range/uncertainty and expiry. No invented confirmed price, silent substitute or fabricated savings.
2. **Two-node federation:** two isolated nodes and user profiles prove an eligible opportunity can be published, received, matched, verified or honestly labelled conditional, surfaced in the receiving node's Opportunities UI, and expired/revoked. A private intent without share consent cannot be recovered from network messages or logs.
3. **Browser-only operation:** one controlled UI-only operation demonstrates safe discovery, authorization, robust interaction, evidence, post-action read-back, and honest partial/unknown/denied handling. Test changed DOM, ambiguous controls, session expiry, timeout, rate limiting, prompt injection, retries and idempotency.
4. **Merchant flow:** read genuine connected catalog/inventory/order observations; prepare a draft/preview; block unauthorized writes; reconcile after any future explicitly authorized write. Every unsupported provider operation is marked honestly.
5. **Regression:** run impacted package tests, type/lint/architecture/dependency checks, web journeys and applicable packaged-app checks. Preserve and explain pre-existing baselines; don't call a baseline failure a new regression, and don't label an unchanged failure set “all green.”
6. **Comparative benchmark:** same fixed intent corpus against provider-native incumbents and a documented general-purpose-harness baseline where comparisons are fair. Report task success, cost correctness, real/false savings, opportunity precision/recall, freshness, failure recovery, latency, money/tokens/tool calls, intervention rate, privacy leaks, and unauthorized-action rate. Do not advertise “10× better” until repeatable, appropriately denominated evidence supports it.

## TL closure checklist

- [ ] Re-fetch default-branch HEAD, current work-order state, open lanes and the actual source baseline.
- [ ] Record each dispatch only after branch/session/base SHA and disjoint write surfaces are confirmed.
- [ ] Update relevant specs, Feature Completeness Matrix, user journey manifests, dependency/work-order state and evidence registry consistently.
- [ ] Verify source, tests, browser paths and failures directly; worker summaries alone are not acceptance evidence.
- [ ] Report completed items with exact commits, commands/results and evidence tier; separate synthetic/contract, staging and live-provider evidence.
- [ ] Preserve immutable historical phase records and list remaining blockers rather than resetting old evidence.

**Definition of done:** UNiCom demonstrably finds and explains conditional lower-cost commerce outcomes, distributes consented and privacy-safe opportunities across nodes, uses an authorized browser/computer path for supported UI-only operations, and preserves the ZCode harness—without confusing simulations with live reality or bypassing existing commerce authority.
