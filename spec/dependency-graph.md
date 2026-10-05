# UNiCOM Dependency Graph

Locked: 2026-10-05

Repository: payswapdotorg/UniCom

## Concurrency law

Exactly three workers may be active.

The TL is an orchestrator, not a fourth implementation lane.

Active Work Orders must be pairwise-disjoint.

No worker may silently compensate for a missing upstream authority with a mock, duplicate state model, fake provider or invented capability.

## Lane ownership

Worker 1 — Commerce Truth and Economic Execution
- Commerce Kernel
- Commerce Twin factual projection boundary
- autonomous-store deterministic limits

Worker 2 — Agent, Trust, Lab, Security
- Agent/Organization/Director
- capability semantics
- opportunity/coordination
- trust/proof
- security immune system
- model routing/evaluation

Worker 3 — Experience, Connectors, Physical Edge, Deployment
- UX
- external connectors
- browser/live commerce
- physical commerce edge
- deployment/operator surfaces

## Stage 0 — parallel contracts

W1-001 — Commerce domain contracts
Dependencies: none

W2-001 — Agent/trust/capability/coordination contracts
Dependencies: none

W3-001 — Experience/connector/runtime/deployment boundaries
Dependencies: none

## Stage 1 — core implementation

W1-002 — Shopify-class deterministic Commerce Kernel
Dependencies: W1-001

W2-002 — ZCode Agent Kernel adaptation
Dependencies: W2-001

W3-002 — Connector Runtime + browser/session isolation
Dependencies: W3-001, W2-001

## Stage 2 — intelligence and network

W1-003 — Commerce Twin + event projections
Dependencies: W1-002

W2-003 — Organization/Opportunity Lab
Dependencies: W2-002

W3-003 — Canonical connector execution framework + first provider adapters
Dependencies: W3-002, W2-003

First adapter certification targets:
- Shopify
- eBay
- Amazon
- Jumia
- Depop
- Whatnot

At least one adapter must demonstrate each reachable execution mode where the provider permits it:
PASS_THROUGH_NATIVE
COMPOSED
OPTIMIZED_MULTI_PROVIDER

## Stage 3 — coordination and physical commerce

W1-004 — Checkout/payment/recourse/autonomous-store primitives
Dependencies: W1-003

W2-004 — Trust/proof + Security Immune System + opportunity graph
Dependencies: W2-003

W3-004 — Physical Commerce Edge + live-commerce UI
Dependencies: W3-003, W1-004

## Stage 4 — autonomous optimization

W1-005 — autonomous-store deterministic runtime
Dependencies: W1-004

W2-005 — Reality/Learning Lab + System1/JEPA/System2 evaluation
Dependencies: W2-004

W3-005 — merchant/buyer/connector/autonomous-store UX hardening
Dependencies: W3-004

W1-005, W2-005, W3-005 may run concurrently.

## Stage 5 — certification

W1-006 — end-to-end commerce correctness/reconciliation certification
Dependencies: W1-005, W3-005

W2-006 — organization/model/skill promotion gates + adversarial suite
Dependencies: W2-005, W1-006

W3-006 — public deployment, browser E2E, observability, disaster/recovery runbook
Dependencies: W3-005, W1-006

## Promotion rule

A downstream work order is active only after the dependency is merged and verified.

The TL re-derives the frontier after every accepted merge.

## Critical cross-lane contract

Worker 2 owns the canonical capability vocabulary.

Worker 3 consumes it.

Worker 1 owns commerce truth.

Worker 2 may propose but not declare commerce truth.

Worker 3 may observe and execute connector actions only through the canonical capability contract.

## Required acceptance evidence

Every work order records:
- exact scope;
- files changed;
- commit;
- tests actually run;
- real integration evidence;
- invariants exercised;
- failure/UNKNOWN handling;
- next frontier unlocked.

  
## Cross-cutting gate G0 — Feature completeness

G0 is TL-owned and is not a fourth worker.

Before a Work Order can be COMPLETE, the TL checks the feature matrix and verifies that the affected feature has:
- contract;
- execution path;
- discoverable UX path;
- browser journey where relevant;
- evidence/observability;
- failure/UNKNOWN handling;
- security/authority boundary.

## Additional Stage 2 requirements

### W2-003
Must implement:
- opportunity engine;
- GroupBuy discovery/formation;
- merchant demand-generated group-buy proposals;
- bounded TradeCycle discovery;
- actor-as-capability representation;
- privacy-aware multi-party coordination.

### W3-003
Must implement:
- LocalCommerceEdge;
- browser-only connector;
- live-commerce connector;
- feed/file connector;
- first provider adapters;
- connector observability.

## Additional Stage 3 requirements

### W3-004
Must demonstrate supermarket journeys without RFID:
- import/POS sync;
- barcode/mobile count;
- local edge;
- weighted-product workflow;
- offline observation queue;
- reconciliation.

### W2-004
Security acceptance must include:
- fake review/ring;
- wrong-item shipment;
- false buyer claim;
- false non-delivery;
- return/refund abuse.

## Stage 4 organization-learning requirements

W2-005 must compare:
- single Main Agent + skills baseline;
- Main Agent + ephemeral delegate organizations;
- provider-native optimization;
- searched organizations;
- System 1 only;
- System 1 + JEPA/world-model;
- System 1 + JEPA + System 2 escalation.

Promotion uses replay, adversarial testing, simulation, shadow/canary and observed outcomes.

## Stage 5 release requirement

The final release candidate must pass the complete feature matrix, not merely domain-unit tests.
