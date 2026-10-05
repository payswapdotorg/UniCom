# UNiCOM Complete Feature Coverage Matrix

Locked: 2026-10-05

A capability is not "implemented" until its contract, execution path, discovery path, and acceptance evidence exist.

## Merchant parity
- Storefront/themes/content
- Catalog/products/variants/SKUs/collections
- Pricing/promotions/coupons
- Inventory/locations/transfers/receiving/forecasting
- Cart/checkout/payments
- Orders/fulfillment/returns/exchanges/refunds
- Customers/CRM/loyalty/subscriptions
- Marketing/analytics
- B2B
- POS
- Multi-location/channel commerce
- App/extension ecosystem
- AI-generated apps/workflows
- Autonomous Store

## AI-native merchant layer
- Global merchant agent
- Goal-driven operation
- Persistent merchant memory
- Goal → plan → simulate → approve → execute → verify → learn
- Commerce Twin
- What-if/counterfactual simulation
- Causal diagnosis
- Autonomous pricing/merchandising/replenishment/campaigns
- Supplier optimization
- Experimentation/canary/rollout
- Agent-generated business tools
- Continuous opportunity discovery

## Commerce Network
- Push/pull catalogs, prices, inventory, orders and permitted customer data
- Shopify
- eBay
- Amazon
- Jumia
- Depop
- Whatnot/live commerce
- UCP/ACP/MCP/A2A adapters
- API/SDK/REST/GraphQL
- Webhooks
- CLI
- CSV/XML/EDI/SFTP/email
- Browser-only systems
- Browser sessions with isolated authority
- Local POS with no API
- USB/serial/LAN
- Live streams
- Physical edge

## Buyer agent
- Natural-language shopping intent
- deadline
- maximum total cost
- quality
- seller credibility
- privacy/security
- speed
- delivery/pickup
- condition
- substitutes
- financing
- buy-now vs wait
- price timing
- local commerce
- group-buy
- merchant-suggested group-buy
- negotiation
- rent/borrow
- resale
- swap/trade
- multi-hop trade cycles
- proof/recourse aware execution

## Coordination and organization
- One Main Agent
- skills
- ephemeral system actors/delegates
- capability-based actor representation
- strategy search
- organization search
- opportunity discovery
- group-buy formation
- merchant demand-generation proposals
- bounded multi-hop trade
- privacy-aware matching
- deadline-aware waiting
- multi-objective optimization
- System 1 / JEPA / System 2 routing

## User opportunities
- resale of owned items
- rental
- swaps
- group buying
- discounts
- future-price opportunities
- unused subscriptions
- warranty/recovery
- local pickup/shared logistics
- other proactive economic opportunities

## Trust and security
Separate UserTrust, AgentTrust, CapabilityTrust and TransactionProof.
Proof P0–P5.
Threat coverage:
- fake/rigged reviews
- review rings
- counterfeit/product substitution
- wrong-item shipments
- false non-delivery
- false wrong-item claims
- refund/return abuse
- account/agent compromise
- connector compromise
- prompt injection
- marketplace collusion
- Sybil identities
- anomalous agent behavior
Security uses signal → signature → deterministic policy → mitigation → evidence → defensive broadcast → learning.

## Physical commerce
Supports:
- RFID
- barcode scanners
- phone/tablet camera
- QR
- NFC
- POS
- scanner scales
- ordinary weighing workflows
- shelf photos/computer vision
- cycle counts
- receipts/invoices
- local network
- USB/serial
- offline edge operation

RFID is optional.

## UX discoverability requirement
Every feature must be reachable through at least one explicit user path:
- primary navigation;
- universal intent/command surface;
- contextual opportunity card;
- onboarding/empty-state education.

Important capabilities require visible status, explanation, action and history/evidence.

## Deployment coverage
- edge API
- durable workflows
- async queues
- realtime coordination
- Postgres
- object/evidence storage
- cache
- browser runtime
- local merchant edge
- model gateway
- observability
- replaceable compute/provider adapters
