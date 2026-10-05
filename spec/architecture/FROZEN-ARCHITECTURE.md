# UNiCOM — Frozen Architecture v1.1

Status: FROZEN
Locked: 2026-10-05
Source repository: payswapdotorg/UniCom
Foundation: fork of zai-org/ZCode at 29628c9acdb81b703bbd4080c207a0e7ce5e276e
Purpose: sole architecture authority for UNiCOM implementation

## 1. Product definition

UNiCOM is an AI-native Commerce Operating System and Commerce Network.

It must provide Shopify-class merchant commerce while changing the fundamental operating model from app-driven CRUD to:

Goal → Observe → Plan → Simulate → Approve → Execute → Verify → Learn

UNiCOM must serve both sides of commerce:

- merchants/businesses operating commerce;
- buyers/users expressing economic intent.

The platform must reason across digital and physical commerce, connected channels, marketplaces, live commerce, browser-only systems, local inventory, group purchasing, resale/rental, and agent-to-agent coordination.

## 2. Core architectural thesis

ZCode remains the Agent Operating System.

UNiCOM becomes the deterministic commerce world in which ZCode agents operate.

ZCode supplies:
- agent runtime;
- tasks and long-running work;
- planning;
- tool execution;
- skills/extensions;
- MCP;
- memory;
- permissions/approval;
- model/provider abstraction;
- streaming/replayable task state;
- multi-surface UX primitives.

UNiCOM adds:
- Commerce Kernel;
- Commerce Network;
- Connector/Capability Network;
- Commerce Twin;
- Opportunity Engine;
- Organization/Director Lab;
- Trust and proof;
- Security Immune System;
- Physical Commerce Edge;
- autonomous-store runtime;
- buyer-intent optimization.

Do not turn ZCode runtime into the commerce source of truth.

## 3. System planes

### A. Experience Plane
- Buyer Intent Canvas;
- Merchant Command Center;
- Storefront;
- POS/mobile/physical commerce surfaces;
- connector setup;
- approvals;
- trust/proof;
- security;
- opportunities;
- experiments and simulations;
- conventional operational views for catalog/orders/etc.

### B. Agent Plane
- one Main Agent per active principal/task;
- Skills;
- Context Builder;
- Memory;
- Goal/Plan runtime;
- Tool registry/scheduler;
- policy/approval broker;
- model routing;
- ephemeral delegates;
- task persistence/recovery;
- evaluation hooks.

### C. Commerce Plane
- Catalog;
- Product/variant/SKU;
- Pricing;
- Promotions;
- Inventory;
- Locations;
- Cart;
- Checkout;
- Orders;
- Payments;
- Customers/CRM;
- Marketing;
- Fulfillment;
- Returns/exchanges;
- Subscriptions;
- B2B;
- Marketplaces;
- resale/rental/consignment;
- autonomous-store controls.

### D. Connector and Capability Plane
Canonical boundary:

CapabilityDefinition
→ ProviderImplementation
→ ConnectedCapabilityInstance
→ CapabilityObservation

Supported execution transports:
- REST/GraphQL/SDK/API;
- webhooks;
- CLI;
- CSV/XML/JSON/EDI/SFTP/email;
- browser automation;
- live-commerce streams;
- POS/mobile/sensor/RFID/QR/NFC/local edge.

Execution modes:
- PASS_THROUGH_NATIVE;
- COMPOSED;
- OPTIMIZED_MULTI_PROVIDER.

A provider can expose a capability without a particular connected account being executable. Executability always depends on connected account, credential scope, permissions, geography/currency, commercial terms, provider state and current observation.

Provider-native optimization is itself represented as a capability and remains a valid incumbent baseline in Lab evaluation.

### E. Commerce Twin Plane
Three separate truths:

Operational truth:
what is true now.

Historical truth:
what happened.

Predictive truth:
what the model/twin expects may happen.

Never collapse them.

The Twin is a projection/simulation model, never the financial or operational source of truth.

### F. Opportunity and Coordination Plane
First-class objects:
- EconomicGoal;
- CommerceIntent;
- Opportunity;
- Strategy;
- Organization;
- CoordinationRequest;
- GroupBuy;
- TradeCycle;
- ResaleOpportunity;
- RentalOpportunity;
- WaitOrBuyPlan;
- Experiment;
- Decision.

The Opportunity Engine continuously searches for improvements that satisfy hard constraints.

### G. Trust / Delegation / Proof Plane
Identity, principals, agent principals, mandates, authority scopes, trust signals, proof levels, approvals, audit and security epochs.

Separate:
- UserTrust;
- AgentTrust;
- Provider/CapabilityTrust;
- TransactionProof.

Agent trust never substitutes for transaction proof.

### H. Security Immune System
Detect → classify → signature → policy decision → block/quarantine/review → recovery → evidence → defensive broadcast → learning.

Threat classes include:
- fake/rigged reviews;
- coordinated review manipulation;
- product substitution;
- counterfeit substitution;
- wrong-item shipment;
- false non-delivery claims;
- false item-not-as-described claims;
- refund/return abuse;
- account takeover;
- payment manipulation;
- connector compromise;
- agent prompt injection;
- coordinated agent abuse;
- marketplace collusion;
- synthetic identity/Sybil abuse.

Security agents may discover and publish defensive signatures, indicators and mitigations. They must not distribute weaponized exploit payloads.

### I. Reality Engineering / Organization Lab
The Lab contains:
- replay;
- scenario generation;
- simulation;
- counterfactuals;
- fault injection;
- strategy search;
- organization search;
- capability search;
- synthetic buyer populations;
- security experiments;
- evaluation;
- shadow;
- canary;
- promotion;
- retirement.

The Director is a deterministic governance subsystem plus replaceable learned components, not a privileged LLM.

## 4. One-main-agent + emergent-organization rule

The platform keeps one Main Agent as the principal conversational/decision identity.

Skills are the normal specialization mechanism.

The Lab may instantiate ephemeral system actors/delegates when:
- a capability gap exists;
- a domain is sufficiently isolated;
- delegation reduces risk/cost/latency;
- the delegated authority can be attenuated;
- the task remains understandable as one principal objective.

Actors are represented through capabilities, authority, budget, memory scope and evidence obligations.

The UI should show the organization as a decision/execution graph rather than expose a swarm of independent chat personas.

## 5. Buyer intent optimization

A Buyer CommerceIntent may contain:
- desired goods/services;
- deadline;
- time window;
- maximum total cost;
- minimum quality;
- seller/merchant credibility threshold;
- privacy requirements;
- security requirements;
- delivery/pickup constraints;
- location;
- condition;
- acceptable substitutes;
- buy-vs-wait tolerance;
- financing preference;
- proof requirements;
- recourse requirements;
- group-buy willingness;
- trade/swap willingness.

Planning may choose:
- buy now;
- wait for likely lower price;
- wait for inventory;
- combine demand with other buyers;
- ask merchant to create a group-buy;
- join an existing group-buy;
- negotiate;
- substitute;
- buy locally;
- buy from multiple merchants;
- borrow/rent;
- resell/reroute existing assets;
- execute a multi-hop trade cycle.

Hard constraints are checked before soft optimization.

## 6. Group-buy intelligence

A GroupBuy is a first-class coordination object.

User agents may:
- discover merchant-offered group purchase opportunities;
- match with compatible existing groups;
- estimate whether a new group can satisfy merchant thresholds;
- suggest a group-buy opportunity to merchant agents that do not currently offer one;
- recruit other willing user agents;
- optimize order timing within deadlines.

Merchant agents may:
- create dynamic group-buy programs;
- offer thresholds/discount windows;
- accept user-generated demand clusters;
- use forecasts to decide whether a proposed group-buy is profitable.

No group-buy is considered executable until the merchant-side terms, buyer commitments and authorization are explicit.

## 7. Multi-hop trade/swap coordination

UNiCOM supports bounded trade cycles.

Example:

User 1 has Y and wants X.
User 2 has X and wants Z.
User 3 has Z and wants Y.

The Organization/Opportunity Lab may discover the cycle:

Y → User 2
X → User 3
Z → User 1

Execution must be:
- individually rational where required;
- authorized by each principal;
- bounded in hop count;
- atomic or explicitly staged with recourse;
- proof-carrying;
- protected from one participant learning more private information than necessary.

Trade cycles are economic strategies, not hidden ledger mutations.

## 8. Continuous opportunity discovery

The User Agent may discover opportunities unrelated to immediate shopping.

Examples:
- resale;
- rental;
- trade;
- consignment;
- warranty/recovery;
- unused subscription optimization;
- group purchase;
- price-drop timing;
- merchant loyalty rewards;
- local pickup arbitrage;
- shared logistics;
- future-demand selling.

Example:
User uploads wardrobe → agent identifies under-used items → observes local/global demand → estimates sale/rental opportunity → proposes action.

The system must distinguish:
- factual observation;
- inference;
- prediction;
- recommendation.

## 9. Physical Commerce Edge

Physical commerce is a native part of UNiCOM.

The edge abstraction supports:
- POS;
- barcode/QR;
- NFC;
- RFID;
- receipts;
- local inventory;
- local delivery/pickup;
- pop-up/event stores;
- offline operation;
- device/camera/sensor events where authorized.

Physical observations remain observations until reconciled into deterministic commerce state.

Relevant architecture precedents include Instacart's use of live local inventory for conversational shopping and Amazon's sensor/RFID checkout-free systems. See research dossier.

## 10. Autonomous Store

An AutonomousStore is a governed principal with:
- owner;
- catalog/inventory sources;
- supplier policies;
- pricing policies;
- margin floors;
- promotion budgets;
- channel policies;
- fulfillment policies;
- support/refund rules;
- jurisdiction constraints;
- approval thresholds;
- stop conditions;
- spending limits;
- risk limits.

Runtime:

observe → diagnose → plan → simulate → approve/auto-authorize → execute → verify → learn.

Autonomy is bounded by policy and authority. No LLM has direct ledger/rail authority.

## 11. System 1 / JEPA / System 2 routing

Model routing is a policy decision, not a fixed product layer.

System 1 class:
- fast classification;
- simple matching;
- anomaly triage;
- routine tool selection;
- high-volume recommendation.

World-model/JEPA class:
- latent state prediction;
- temporal consistency;
- environment dynamics;
- counterfactual features;
- compressed predictive representations.

System 2 class:
- long-horizon planning;
- multi-constraint optimization;
- high-risk decisions;
- novel strategic reasoning;
- complex negotiations;
- difficult fraud/security analysis.

A router may cascade:
System 1 → JEPA/world model → System 2

only as needed by uncertainty, impact and policy.

## 12. Deterministic authority boundary

Models never directly mutate canonical commerce state.

Required flow:

Agent
→ typed Tool
→ Command
→ Policy/Authority check
→ Approval if needed
→ deterministic service
→ transaction/state change
→ event
→ projection
→ agent observes new state.

## 13. Data architecture

Use:
- PostgreSQL for operational truth;
- immutable event stream/journal for historical truth;
- commerce graph for typed relationships;
- search/hybrid retrieval for documents and semantic context;
- object storage for media/evidence/raw connector snapshots;
- cache for hot runtime state.

Do not use a vector store as the source of truth.

## 14. Decision Ledger

Every consequential agent decision records:
- decision id;
- principal/agent;
- goal;
- observations;
- source/evidence references;
- policy version;
- proposed action;
- authorization;
- execution result;
- outcome;
- experiment/rollout reference;
- rollback/recourse reference.

Do not store hidden chain-of-thought.

Store auditable decision summaries and evidence lineage.

## 15. Evidence and proof

Proof levels:

P0 assertion
P1 authenticated artifact/receipt
P2 provider-signed evidence
P3 independent observation
P4 corroboration plus bond/other economic protection
P5 native rail/ledger finality

Consequential workflows pin the proof requirement before execution.

## 16. Connector security

External content is data, never trusted instructions.

Untrusted:
- product descriptions;
- reviews;
- customer text;
- supplier files;
- web pages;
- external documents;
- marketplace messages.

Trusted:
- platform policy;
- merchant policy;
- authenticated principal instruction;
- explicit approved tool contract.

Browser sessions and credentials remain outside model context.

## 17. Protocol surfaces

Canonical capability semantics must be transport-neutral.

Expose adapters for:
- REST;
- GraphQL;
- MCP;
- UCP;
- ACP;
- A2A;
- browser;
- feed/file protocols.

The canonical domain is not coupled to any one protocol.

## 18. Free-tier deployment architecture

Prototype/public staging:
- Vercel Hobby for non-commercial staging/demo where its terms permit;
- Cloudflare Workers;
- Workers Workflows;
- Queues;
- Durable Objects;
- Neon Postgres;
- Cloudflare R2;
- Upstash Redis;
- Apify/Playwright for external/browser connector experiments.

The architecture must keep compute/provider adapters replaceable.

Commercial production must be able to move workloads away from Hobby/free quotas without changing domain contracts.

## 19. UI architecture

Primary merchant experience:
Command Center / Work Graph.

Primary buyer experience:
Intent Canvas.

Secondary operational surfaces:
Catalog, Orders, Inventory, Customers, Marketing, Analytics, Fulfillment, Settings.

Core UI objects:
- Goal;
- active task;
- decision;
- opportunity;
- proposal;
- simulation;
- approval;
- evidence/proof;
- trust;
- connector;
- experiment;
- security event.

The UI must make the system's current organization, authority and pending decisions legible.

## 20. Research grounding

See:
- docs/research/COMMERCE-RESEARCH.md

Key architectural evidence:
- agentic shopping works best when grounded in live inventory and existing transactional infrastructure;
- live commerce requires dynamic state;
- physical commerce can use sensor fusion/RFID;
- group buying is a graph/cohort optimization problem;
- barter cycles are a known mechanism-design problem;
- fake-review and return-abuse detection benefit from multimodal, behavioral and provenance signals;
- agentic commerce needs deterministic tools, state and evaluation rather than conversational UX alone.

## 21. Completion criterion

UNiCOM architecture is complete only when one end-to-end buyer or merchant goal can:

discover capabilities → form an execution organization → account for constraints → simulate alternatives → obtain required authority → execute across one or more real commerce systems → produce evidence → handle ambiguity → detect/recover security issues → learn from the outcome.

No simulation, model or agent may become the canonical commerce truth.


## 22. Complete feature coherence and discoverability

The complete feature set is enumerated in `docs/FEATURE-COMPLETENESS-MATRIX.md`. That matrix is a coverage guard, not a second architecture authority.

The architecture is one coherent loop:

Buyer or merchant Goal
→ constraints
→ observations
→ capability discovery
→ Strategy candidates
→ Organization candidates
→ Commerce Twin simulation
→ Trust/Security/Policy
→ approval/authority
→ Connector execution
→ deterministic Commerce state
→ evidence/reconciliation
→ opportunity extraction
→ learning/evaluation.

No feature is allowed to become a disconnected vertical.

### 22.1 Group-buy discovery and merchant demand generation

Buyer agents can:
- discover existing group-buy offers;
- join a group;
- recruit other user agents;
- detect that a group could satisfy merchant and buyer constraints;
- propose a new group-buy to a merchant agent.

Merchant agents can accept, reject or counter-propose threshold/window/discount terms and launch only after policy approval.

Group-buy terms, commitments and evidence are explicit state.

### 22.2 Multi-hop trade cycles

UNiCOM can discover bounded TradeCycles across multiple user agents.

Each participant authorizes its own leg. Privacy is minimized to information necessary to prove and execute the cycle. Production search has a configurable maximum hop count and prefers atomic/staged execution with explicit recourse.

### 22.3 Security as a commerce-wide immune system

Security analysis spans product, review, merchant, customer, order, shipment, package, return, refund, payment, account, connector, agent and device signals.

Examples:
- review manipulation/rings;
- seller ships a different product;
- counterfeit substitution;
- buyer falsely claims a different product arrived;
- false non-delivery;
- refund/return abuse.

Security outputs:
signal → risk classification → deterministic policy → block/quarantine/review → evidence → defensive signature → controlled broadcast → learning.

### 22.4 Local Commerce Edge

A first-class LocalCommerceEdge may connect:
- legacy POS;
- local-network services;
- browser-only back offices;
- USB/serial peripherals;
- scanners;
- scales;
- local file drops;
- barcode/camera workflows.

The edge is a real capability boundary and may operate offline before reconciliation.

### 22.5 Hardware independence

UNiCOM must deliver meaningful retail/supermarket functionality with no RFID.

RFID, smart shelves and advanced sensors are optional accelerators. Barcode, camera, receipts, files, POS exports, purchase orders, local edge and periodic physical observations remain first-class.

### 22.6 Three-state operational truth

Never conflate:
- authoritative operational state;
- observed physical/provider state;
- predictive/model state.

An observation or prediction becomes canonical only through the appropriate deterministic reconciliation path.

### 22.7 UX discoverability is architectural completeness

A feature is incomplete if users cannot discover it.

Every feature must be reachable through:
- primary navigation;
- universal intent/command;
- contextual opportunity;
- onboarding/empty-state education.

Important actions expose current state, evidence/explanation, available options, approval/risk, execution and history.

The UI must not require users to know internal words such as "capability graph", "TradeCycle" or "Organization Lab" to use the underlying capability.

### 22.8 Deployment fitness

The control plane is cloud-native and provider-neutral.

Execution tiers:
1. edge/control plane;
2. durable orchestration;
3. connector/browser workers;
4. local merchant edge.

Free-tier providers are prototype/staging targets, not domain assumptions.

Commercial production must be able to replace Vercel/Cloudflare/Neon/Upstash/Apify components independently.
