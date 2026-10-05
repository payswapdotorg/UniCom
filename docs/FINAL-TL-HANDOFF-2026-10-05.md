# UNiCOM — Final TL + 3-Worker Implementation Handoff

Status: AUTHORIZED FOR IMPLEMENTATION
Architecture: v1.1-frozen-2026-10-05
Repository: payswapdotorg/UniCom
Foundation: zai-org/ZCode @ 29628c9acdb81b703bbd4080c207a0e7ce5e276e
Concurrency: exactly 3 implementation workers; TL is orchestration/acceptance, not a fourth worker.

## 0. Mission

Implement the complete frozen UNiCOM architecture in this repository with minimal architectural drift.

UNiCOM is an AI-native Commerce Operating System + Commerce Network.

The system must preserve ZCode as the Agent Operating System while adding a deterministic Commerce Kernel, Commerce Network, capability/connector fabric, Commerce Twin, Opportunity Engine, Organization/Lab, Trust/Proof, Security Immune System, Physical Commerce Edge, autonomous-store runtime and buyer-intent optimization.

The product loop is:

Goal
→ Observe
→ Plan
→ Simulate
→ Approve
→ Execute
→ Verify
→ Learn

The implementation is complete only when at least one real buyer or merchant goal can traverse this loop through deterministic commerce state, real capability execution, evidence/reconciliation and a discoverable UI journey.

## 1. Authority order

Read and obey these repository artifacts before changing architecture or scope:

1. AGENTS.md
2. spec/architecture/FROZEN-ARCHITECTURE.md
3. spec/architecture/INVARIANTS.md
4. spec/dependency-graph.md
5. docs/development-state/v1-work-order-state.json
6. docs/FEATURE-COMPLETENESS-MATRIX.md
7. docs/FINAL-FEATURE-AUDIT-2026-10-05.md
8. docs/SUPERMARKET-WITHOUT-RFID.md
9. docs/research/COMMERCE-RESEARCH.md
10. docs/UX-DEPLOYMENT.md
11. the active Work Order for the worker

This handoff is an execution guide, not a replacement architecture. In case of conflict, the frozen architecture/invariants win.

The repository is the sole source of truth. Do not use chat, memory, tickets outside the repository, or unstored assumptions as implementation authority.

## 2. Non-negotiable architecture rules

### Intelligence vs commerce truth
ZCode remains the intelligence/runtime substrate.
UNiCOM Commerce Kernel owns canonical commerce truth.

Models, agents, skills, connectors and browser automation never directly mutate canonical commerce state.

Required path:

Agent
→ typed Capability/Tool
→ Command
→ Policy/Authority
→ Approval if required
→ deterministic Commerce service
→ transaction/state change
→ event
→ projection
→ observe

No production-reachable fake ledger, fake balance, fake order completion or mock provider may stand in for real deterministic execution.

### One Main Agent + skills
There is one Main Agent as the principal identity for an active task.

Skills are the normal specialization mechanism.

The Lab may create ephemeral delegates only when there is a measured capability/risk/latency/cost reason. Delegates have attenuated authority, bounded budgets, scoped memory and explicit evidence obligations.

Do not implement a swarm-first UX.

Strategy answers “what should happen”.
Organization answers “who/what executes it”.

### Capability executability
Use exactly one canonical vocabulary:

CapabilityDefinition
→ ProviderImplementation
→ ConnectedCapabilityInstance
→ CapabilityObservation

Catalog presence never means executable authority.

Execution requires:
- connected account/session;
- appropriate credential scope;
- permission;
- geography/currency/commercial eligibility;
- current provider observation;
- provider state.

UNKNOWN is not FAILED.

Provider-specific states are preserved.

Execution modes are explicit:
- PASS_THROUGH_NATIVE
- COMPOSED
- OPTIMIZED_MULTI_PROVIDER

Provider-native optimization remains a valid incumbent baseline in Lab evaluation.

### Financial and historical truth
Money is deterministic fixed-precision/decimal/integer based; never floating point.

Historical facts are immutable/versioned.

Commerce Twin predictions and simulations never become production truth directly.

### Physical truth
Physical/provider observations must be represented separately from authoritative operational state and predictive state.

Only deterministic reconciliation may promote an observation into canonical state.

### Trust and proof
Keep separate:
- UserTrust
- AgentTrust
- Provider/CapabilityTrust
- TransactionProof

Proof levels:
P0 assertion
P1 authenticated artifact/receipt
P2 provider-signed evidence
P3 independent observation
P4 corroboration + economic protection
P5 native rail/ledger finality

Trust never substitutes for transaction proof.

### Group-buy and trade cycles
GroupBuy is first-class.

User agents can discover groups, join groups, recruit compatible users, detect latent demand and propose group-buy terms to merchant agents.

Merchant agents can accept, reject or counter-propose threshold/window/discount.

No silent enrollment.

TradeCycle is first-class and bounded in production.

Every participant independently authorizes its own leg.

Execution must include privacy minimization, proof and explicit recourse; atomic execution or staged execution must be explicit.

### Security immune system
Security is deterministic policy infrastructure:

signal
→ classify
→ defensive signature
→ policy decision
→ block/quarantine/review
→ evidence
→ controlled defensive broadcast
→ learning

Security BLOCK is a hard constraint and cannot be overridden by model preference.

Security broadcasts may contain defensive indicators, signatures and mitigations only. Never distribute weaponized exploit payloads.

Security must cover at least:
- fake/review-ring manipulation;
- counterfeit/product substitution;
- wrong-item shipment;
- false non-delivery;
- false item-not-as-described;
- return/refund abuse;
- account takeover;
- payment manipulation;
- connector compromise;
- prompt injection;
- marketplace collusion;
- Sybil/synthetic identities;
- anomalous agent behavior.

### Connector security
Third-party product descriptions, reviews, customer text, supplier files, web pages and marketplace messages are untrusted data, never trusted instructions.

Credentials, cookies, MFA material and browser storage never enter model context or repository artifacts.

Browser routes are explicit scoped capabilities with isolated authorization/session storage.

### Deployment
Domain contracts must not depend directly on Vercel, Cloudflare, Neon, Upstash or Apify.

Prototype/staging may use:
- Vercel Hobby where permitted;
- Cloudflare Workers/Workflows/Queues/Durable Objects/Browser/Workers AI;
- Neon;
- Cloudflare R2;
- Upstash Redis;
- Apify/browser workers;
- LocalCommerceEdge.

Free-tier limits are deployment constraints, never domain semantics.

Commercial production must be able to replace any provider independently.

## 3. Work allocation

## Worker 1 — Commerce Truth / Economic Execution

Own:
- merchant/customer/principal;
- catalog/product/variant/SKU/collection;
- price/promotion/coupon;
- inventory/location/transfer/receiving;
- cart/checkout boundary;
- orders;
- payment boundary;
- fulfillment/shipment;
- returns/exchanges/refunds;
- subscriptions;
- B2B;
- resale/rental/consignment;
- autonomous-store deterministic policy/runtime;
- CommerceEvent and commerce projections;
- measurement/weighted products;
- reconciliation primitives.

Never own:
- Main Agent semantics;
- capability vocabulary;
- organization/search logic;
- browser connector runtime;
- UI architecture outside contracts needed by commerce state;
- model routing;
- security decision policy.

Worker 1 implementation sequence:
W1-001 → W1-002 → W1-003 → W1-004 → W1-005 → W1-006

## Worker 2 — Agent / Trust / Lab / Security

Own:
- AgentPrincipal/Main Agent;
- Skill/Tool contracts;
- capability semantics/vocabulary;
- context/memory policy boundaries;
- Strategy;
- Organization;
- ephemeral delegates/attenuated authority;
- Buyer CommerceIntent;
- Opportunity Engine;
- GroupBuy;
- merchant demand-generated GroupBuy;
- bounded TradeCycle;
- resale/rental opportunities;
- UserTrust/AgentTrust/CapabilityTrust;
- TransactionProof;
- Security Signal/ThreatSignature;
- defensive security broadcasts;
- System 1 / JEPA/world-model / System 2 routing;
- Experiment/Evaluation;
- Reality/Organization/Director Lab;
- model/skill/organization promotion.

Never own:
- canonical commerce state;
- provider-specific connector implementations;
- UI implementation beyond contract/schema needs;
- browser credential/session handling.

Worker 2 implementation sequence:
W2-001 → W2-002 → W2-003 → W2-004 → W2-005 → W2-006

## Worker 3 — Experience / Connectors / Physical Edge / Deployment

Own:
- Merchant Command Center / Work Graph;
- Buyer Intent Canvas;
- Opportunity Inbox;
- Decision Cards;
- storefront;
- catalog/order/inventory/customer operational surfaces;
- connector studio/health;
- Trust/Security experience;
- browser session runtime;
- connector adapters;
- feed/file/EDI/SFTP/email paths;
- live-commerce ingestion/execution;
- LocalCommerceEdge;
- POS/barcode/QR/NFC/RFID physical boundaries;
- realtime task/live-event channels;
- deployment adapters/operator tooling;
- browser E2E;
- public deployment/recovery tooling.

Worker 3 must consume Worker 2's canonical capability vocabulary and never create a second capability model.

Worker 3 implementation sequence:
W3-001 → W3-002 → W3-003 → W3-004 → W3-005 → W3-006

## 4. Stage plan

### Stage 0 — Contracts, in parallel
Run all three:
- W1-001
- W2-001
- W3-001

Each worker:
1. reads current architecture;
2. freezes types/interfaces;
3. writes contract tests;
4. adds minimal implementation only where needed to validate contracts;
5. documents exact files and tests;
6. updates Work Order state.

No downstream implementation starts early.

### Stage 1 — Core implementation
After Stage 0 Work Orders are merged and TL-accepted:

Parallel:
- W1-002 Commerce Kernel
- W2-002 ZCode Agent Kernel adaptation
- W3-002 Connector Runtime + browser/session isolation

### Stage 2 — Intelligence + network
After Stage 1 dependencies:

Parallel:
- W1-003 Commerce Twin + event projections
- W2-003 Organization/Opportunity Lab
- W3-003 Canonical connector execution + first provider adapters

W2-003 must include:
- Opportunity Engine;
- GroupBuy discovery and formation;
- merchant demand-generated GroupBuy;
- bounded TradeCycle discovery;
- actor-as-capability representation;
- privacy-aware coordination.

W3-003 must include:
- LocalCommerceEdge;
- browser-only connector;
- live-commerce connector;
- feed/file connector;
- connector observability;
- first adapter targets:
  Shopify, eBay, Amazon, Jumia, Depop, Whatnot.

At least one real adapter journey must exercise every execution mode that provider permits:
- PASS_THROUGH_NATIVE;
- COMPOSED;
- OPTIMIZED_MULTI_PROVIDER.

### Stage 3 — Coordination + physical commerce
Parallel:
- W1-004 Checkout/payment/recourse/autonomous-store primitives
- W2-004 Trust/proof + Security Immune System + opportunity graph
- W3-004 Physical Commerce Edge + live-commerce UX

W2-004 security evidence must include:
- fake review/review ring;
- wrong-item shipment;
- false buyer claim;
- false non-delivery;
- return/refund abuse.

W3-004 must demonstrate supermarket journeys without RFID:
- POS/import path;
- barcode/mobile count;
- LocalCommerceEdge;
- weighted-product workflow;
- offline observation queue;
- reconciliation.

RFID remains optional.

### Stage 4 — Autonomous optimization
Parallel:
- W1-005 autonomous-store deterministic runtime;
- W2-005 Reality/Learning Lab + model-routing evaluation;
- W3-005 merchant/buyer/connector/autonomous UX hardening.

W2-005 must compare:
- Main Agent + skills baseline;
- Main Agent + ephemeral delegates;
- provider-native optimization;
- searched organizations;
- System 1 only;
- System 1 + JEPA/world-model;
- System 1 + JEPA + System 2 escalation.

Promotion requires:
- replay;
- adversarial evaluation;
- simulation;
- shadow;
- canary;
- observed outcome evidence;
- rollback/retirement path.

### Stage 5 — Certification + public readiness
Parallel where dependencies allow:
- W1-006 end-to-end commerce correctness/reconciliation certification;
- W2-006 organization/model/skill promotion gates + adversarial suite;
- W3-006 public deployment + browser E2E + observability + disaster/recovery runbook.

Final release candidate must pass the complete feature matrix, not only unit tests.

## 5. UX completeness contract

Hidden feature = incomplete feature.

Every feature in docs/FEATURE-COMPLETENESS-MATRIX.md must have at least one discoverable user path through:
- primary navigation;
- universal intent/command;
- contextual opportunity;
- onboarding/empty state.

The primary UX must expose:
- Home / Command Center;
- Buy / Intent Canvas;
- Sell / Store;
- Operate;
- Discover;
- Lab;
- Trust / Security;
- Connections;
- Explore / Capabilities;
- Settings.

The UI must make visible and usable, without requiring internal vocabulary:
- GroupBuy;
- trade/swap;
- resale/rental;
- autonomous store;
- Commerce Twin;
- security;
- connector health;
- LocalCommerceEdge;
- live commerce.

Decision Cards must communicate:
- objective;
- state;
- evidence;
- alternatives;
- predictions;
- downside/risk;
- organization/capabilities used;
- authority/approval;
- action;
- history/evidence.

Role switching changes workspace emphasis, not the underlying identity.

## 6. Supermarket/no-RFID acceptance

UNiCOM must be useful to a local supermarket without RFID.

Required paths:
1. import/catalog/POS path;
2. barcode or camera identification;
3. physical count observation;
4. weighted/measurement product workflow;
5. receiving/purchase-order workflow;
6. LocalCommerceEdge;
7. offline observation queue;
8. deterministic reconciliation;
9. forecasting/replenishment;
10. buyer intent/group-buy;
11. opportunity discovery;
12. security/fraud workflows;
13. Commerce Twin/simulation.

Truth precedence must remain explicit:
- authoritative POS/commerce state;
- reconciled physical observations;
- employee-entered counts;
- supplier reports;
- visual estimates;
- predictive estimates.

No visual estimate or prediction may silently become canonical stock.

## 7. Contract-first implementation method

For every Work Order use:

1. Read authority documents.
2. Inspect existing ZCode conventions and reusable primitives.
3. Update/confirm repository spec if a contract gap is found.
4. Freeze public types/interfaces.
5. Add contract tests first.
6. Implement deterministic authority.
7. Wire real integrations.
8. Add UNKNOWN and provider-state preservation.
9. Add idempotency.
10. Add security/authority checks.
11. Add observability/evidence.
12. Add adversarial/failure tests.
13. Add UI journey + browser E2E where relevant.
14. Run complete required verification.
15. Update work-order state.
16. Produce a TL acceptance packet.

Do not implement speculative abstractions that are not required by the current Work Order.

## 8. TL operating procedure

The TL owns:
- frontier scheduling;
- dependency enforcement;
- contract conflict resolution;
- architecture conformance;
- work-order acceptance/rejection;
- merge ordering;
- feature-completeness gate G0;
- cross-lane integration;
- final certification.

The TL must never become a fourth implementation worker.

Before starting a Work Order:
- verify it is READY/frontier;
- verify dependencies are merged and accepted;
- record activation in docs/development-state/v1-work-order-state.json.

After a worker reports completion:
- inspect actual diff;
- inspect tests and test output;
- inspect architecture impact;
- verify real integration evidence;
- verify unknown/failure handling;
- verify idempotency;
- verify authority/capability scope;
- verify feature discoverability;
- verify browser journey if UI changed;
- verify no hidden mocks/fake state;
- verify Work Order acceptance scenarios;
- update state only after evidence.

Never accept “implemented” based on a worker summary alone.

After every merge:
- re-derive the frontier;
- check changed contracts against all three lanes;
- run affected cross-lane tests;
- update dependency state.

## 9. Drift prevention

Workers must not:
- invent a parallel architecture;
- create duplicate capability/connector vocabularies;
- duplicate commerce truth;
- put provider semantics into canonical domain contracts;
- bypass typed capabilities;
- grant model direct state authority;
- use simulation as production truth;
- use fake providers in production paths;
- store browser secrets in model context or repo;
- expand scope silently;
- introduce a fourth implementation lane;
- hide major capabilities behind undocumented APIs;
- declare feature completion without a discoverable UX path.

When an architectural gap is found:
- stop at the contract boundary;
- write the smallest repository amendment/spec clarification;
- TL reviews it;
- only then implement.

Prefer small explicit amendments over silent drift.

## 10. Evidence packet required for every accepted Work Order

Each completed Work Order must record:

- Work Order id;
- owner;
- exact scope completed;
- files changed;
- commit SHA;
- dependencies;
- tests actually run;
- test results;
- integration/provider evidence;
- browser evidence where applicable;
- invariants exercised;
- security/authority checks;
- UNKNOWN/failure/recovery cases;
- idempotency checks;
- feature-discoverability evidence;
- unresolved issues;
- next frontier unlocked.

## 11. G0 — Cross-cutting feature completeness gate

G0 is TL-owned.

A Work Order cannot become COMPLETE unless the affected capability has:

contract
+ deterministic/executable path
+ discoverable UX path
+ browser journey where applicable
+ evidence/observability
+ failure/UNKNOWN handling
+ security/authority boundary

A service/tool existing in code is not sufficient.

## 12. Definition of Done for the full product

The release candidate must demonstrate, with real deterministic state and real connector/edge evidence:

### Buyer
- natural-language intent with hard/soft constraints;
- buy/wait;
- substitution;
- negotiation;
- local pickup;
- group-buy;
- merchant group-buy proposal;
- resale/rental;
- bounded multi-hop trade;
- evidence/proof;
- recourse.

### Merchant
- storefront;
- catalog;
- inventory;
- pricing/promotions;
- orders;
- fulfillment;
- returns/refunds;
- subscriptions;
- B2B;
- multi-location;
- POS/physical edge;
- analytics;
- marketing;
- autonomous-store policies.

### Agent
- Main Agent;
- skills;
- capability discovery;
- planning;
- approvals;
- scoped delegation;
- memory/context policy;
- model routing;
- replay/recovery.

### Network
- connected capability model;
- provider state;
- browser connector;
- file/feed connector;
- live commerce;
- LocalCommerceEdge;
- first certified provider adapters;
- native/composed/multi-provider execution.

### Intelligence
- Commerce Twin;
- Opportunity Engine;
- Organization/Lab;
- GroupBuy;
- TradeCycle;
- System 1;
- JEPA/world-model path;
- System 2;
- promotion gates.

### Trust/security
- UserTrust;
- AgentTrust;
- Capability/ProviderTrust;
- P0–P5 proofs;
- deterministic security BLOCK;
- defensive signatures;
- behavioral/graph signals;
- fraud/abuse scenarios;
- audit/evidence.

### Physical commerce
- barcode;
- camera;
- receipts;
- weighted products;
- POS;
- local edge;
- offline observation queue;
- reconciliation;
- optional QR/NFC/RFID;
- no-RFID supermarket journey.

### UX
- buyer path;
- merchant path;
- role switching;
- Explore/Capabilities;
- Command Center;
- Intent Canvas;
- opportunities;
- Lab;
- security;
- connector health;
- physical edge;
- discoverable feature paths.

### Production readiness
- observability;
- retries/recovery;
- idempotency;
- provider-state preservation;
- disaster/recovery procedures;
- public deployment;
- no production mocks;
- provider replacement boundaries.

## 13. First action now

Activate exactly these frontier work orders:

- W1-001 — Worker 1
- W2-001 — Worker 2
- W3-001 — Worker 3

Do not skip Stage 0.

Do not activate downstream Work Orders until their dependencies are merged and TL-accepted.

The TL should keep repository Work Order state continuously truthful so all future agents can reconstruct progress without this chat.

## 14. Completion statement

The implementation is complete only when the final feature matrix passes and the repository contains the evidence needed for another LLM to reproduce the current architecture, dependency frontier, implementation state and acceptance status without relying on conversational memory.

UNiCOM must remain one coherent system:

Goal
→ constraints
→ observations
→ capability discovery
→ strategy candidates
→ organization candidates
→ Commerce Twin simulation
→ trust/security/policy
→ authority
→ connector execution
→ deterministic commerce state
→ evidence/reconciliation
→ opportunity extraction
→ learning/evaluation.
