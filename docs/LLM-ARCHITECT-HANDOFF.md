# UNiCOM — LLM Architect / Tech Lead Handoff

Locked: 2026-10-05

## Mission

Take over the fork of ZCode at commit 29628c9 and evolve it into UNiCOM.

The repository, not this conversation, is the implementation authority.

## Read order

1. AGENTS.md
2. spec/architecture/FROZEN-ARCHITECTURE.md
3. spec/dependency-graph.md
4. docs/research/COMMERCE-RESEARCH.md
5. docs/UX-DEPLOYMENT.md
6. docs/development-state/v1-work-order-state.json
7. active Work Orders
8. relevant ZCode specs/code

## Immediate action

Activate exactly:
- W1-001
- W2-001
- W3-001

Do not begin domain implementation before the three contract work orders establish their interfaces and acceptance scenarios.

## TL responsibilities

The TL:
- maintains architectural integrity;
- activates at most three pairwise-disjoint work orders;
- resolves cross-lane contract conflicts;
- runs source-of-truth verification;
- requires actual test evidence;
- integrates accepted worker branches;
- updates development-state after accepted work;
- keeps the user-facing ZCode task plan aligned with repository state;
- does not quietly expand worker scope.

The TL is not a fourth worker.

## Worker 1

Build the deterministic Commerce Kernel.

Success means the system has canonical merchant/customer/order/inventory/pricing primitives before agent optimization is allowed to depend on them.

## Worker 2

Build the agent/trust/lab/security contracts.

The critical deliverable is not a swarm framework. It is:
one Main Agent + skills + bounded ephemeral delegation + organization search + typed capability semantics + proof/trust + security immune system.

## Worker 3

Build the experience/connector/deployment boundaries.

Connector work must support systems with no API/MCP/CLI by using provider-neutral browser/session/edge capabilities.

Do not hard-code provider-specific semantics into domain contracts.

## Key product experiments

### Buyer intent

“I need X by Friday, under $200.”

Expected behavior:
- search connected commerce surfaces;
- account for live inventory;
- compare seller credibility, price, quality, privacy and speed;
- decide buy/wait;
- identify discounts/group-buy;
- consider rental/swap if valid;
- execute only inside authority.

### Merchant opportunity

“Can I sell this unused wardrobe?”

Expected behavior:
- identify items;
- estimate demand/value;
- find resale/rental channels;
- estimate fees/time/risk;
- suggest options.

### Multi-hop trade

User1 has Y and wants X.
User2 has X and wants Z.
User3 has Z and wants Y.

Expected behavior:
- discover bounded cycle;
- expose only necessary information;
- obtain independent authorization;
- verify each leg;
- use atomic/staged execution with recourse.

### Merchant group-buy suggestion

Users create demand for the same item.

Expected behavior:
- detect cluster;
- estimate threshold feasibility;
- suggest group purchase to merchant agent;
- merchant agent can accept/reject/counteroffer;
- user agents can opt in.

### Security

Detect:
- fake review clusters;
- seller review rings;
- shipped-vs-purchased mismatch;
- counterfeit substitutions;
- false non-delivery;
- false wrong-item claims;
- refund abuse.

Expected behavior:
- block/quarantine/review;
- preserve evidence;
- create defensive signature;
- notify affected agents according to policy.

## Model routing

Do not hard-wire one reasoning model.

Model selection is governed by:
- complexity;
- expected impact;
- uncertainty;
- latency budget;
- privacy;
- cost;
- required modality.

Allowed classes:
- System 1;
- JEPA/world-model;
- System 2.

## UI

Do not clone Shopify's admin as the primary surface.

Primary merchant surface:
Command Center / Work Graph.

Primary buyer surface:
Intent Canvas.

Traditional admin surfaces exist for direct inspection/control.

## Quality bar

No fake commerce state.
No fake provider execution.
No production-reachable mocks.
No model direct-write path to canonical commerce truth.
No credential leakage into agent context.
No UNKNOWN→FAILED shortcut.
No flattened provider state.
No second capability vocabulary.
No global unbounded barter search in production.

## Promotion

A capability, skill, connector, model route or organization strategy becomes production-eligible only after:
contract tests → replay → adversarial tests → simulation → shadow → canary → observed outcome → TL acceptance.

## User-facing progress

The ZCode task planner should expose:
- active Work Orders;
- blocked dependencies;
- contract progress;
- tests;
- integration evidence;
- promotion status.

Repository state must be the backing source for those progress displays.
