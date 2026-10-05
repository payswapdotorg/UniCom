# UNiCOM — UX and Deployment Architecture

Locked: 2026-10-05

## UX architecture

### 1. Merchant Command Center

The home screen is a Work Graph:

- current business pulse;
- active goals;
- pending decisions;
- detected opportunities;
- simulations;
- experiments;
- security alerts;
- connector health.

Primary input:
“What are you trying to accomplish?”

Example:
“Grow repeat purchase 15% this quarter without increasing ad spend.”

The UI returns:
- plan;
- evidence;
- candidate organizations;
- predicted outcomes;
- approvals needed;
- execution progress.

### 2. Buyer Intent Canvas

The buyer starts with intent, not a product category.

Example:
“I need a laptop for civil engineering work, under $1,500, available by Monday, with strong warranty support.”

Constraint editor:
deadline / max cost / quality / merchant trust / privacy / security / speed / location / condition / delivery.

### 3. Decision Cards

Every material proposal is rendered as:
- objective;
- current state;
- evidence;
- alternatives;
- predicted outcomes;
- downside/risk;
- organization used;
- authorization required;
- action.

### 4. Opportunity Inbox

Users should see opportunities unrelated to their current task:
- resale;
- rental;
- trade;
- group-buy;
- price timing;
- discounts;
- loyalty;
- unused inventory/subscriptions;
- local opportunities.

### 5. Trust and Security

Trust is displayed as explainable components, not one score.

Examples:
- verified purchase;
- provider-signed state;
- independent observation;
- account age/history;
- transaction proof level;
- agent certification;
- security warnings.

Security incidents should show:
signal → reason → effect → mitigation → next action.

### 6. Connector Studio

The merchant sees:
- provider;
- connected account;
- available capabilities;
- actual connected scope;
- health;
- last observation;
- supported execution modes;
- customer-action requirements.

Browser connectors explicitly display when a provider has no API route and when user authorization/session interaction is required.

### 7. Autonomous Store

A merchant configures:
- objectives;
- allowed channels;
- margins;
- spending;
- discounts;
- refund policy;
- supplier policy;
- approval thresholds;
- stop conditions.

The merchant sees a simulation before increasing autonomy.

### 8. Responsive architecture

Desktop:
- three-pane operational workspace;
- main Work Graph;
- side evidence/decision panel.

Mobile:
- single-column goal/task view;
- drawers for evidence/approval;
- persistent emergency/security actions.

Reuse ZCode's established UI tokens and accessibility rules.

## Deployment

Prototype architecture:
- Vercel Hobby for non-commercial staging/demo;
- Cloudflare Workers for public edge APIs;
- Workers Workflows for durable orchestration;
- Queues for async connector/event processing;
- Durable Objects for realtime session/live-channel coordination;
- Neon Postgres;
- Cloudflare R2;
- Upstash Redis;
- Apify/Playwright for browser/extraction connectors.

### Portability rule

No domain package may depend directly on a hosting provider SDK.

Provider adapters are isolated under infrastructure/adapters.

### Connector worker rule

Browser/live connectors run outside request/response handlers.

Long-running work is admitted into a durable task and emits progress events.

### Observability

Every long-running action has:
- task id;
- run id;
- principal;
- connector;
- capability;
- provider object ids;
- decision id;
- authorization id;
- evidence refs;
- correlation/trace id.

### Free-tier boundary

Free tiers are development/public-prototype targets.

Before commercial production:
- reassess provider plan restrictions;
- move any commercial workload from Vercel Hobby if required by its terms;
- migrate long-running/high-volume connectors to a paid worker/runtime without changing domain contracts.

## Browser verification

Any UX-affecting work must include browser verification against a real running build using the repo's agent-browser workflow.

Required:
- page load;
- console/runtime errors;
- primary journey;
- responsive state;
- auth/session boundary;
- connector approval flow where applicable.

  
## Feature discoverability architecture

Primary navigation is organized around user intent rather than internal subsystems:

- Home / Command Center
- Buy
- Sell / Store
- Operate (orders, inventory, customers, fulfillment)
- Discover (opportunities, group-buy, resale/rental, trade, live commerce)
- Lab (Commerce Twin, simulations, experiments, autonomy)
- Trust / Security
- Connections (channels, POS, local edge, apps/skills)
- Explore / Capabilities
- Settings

Every capability remains reachable through the global intent/command surface.

Contextual opportunities expose capabilities users might not know to ask for.

Examples:
- "23 shoppers want this SKU — create a group-buy?"
- "Your POS has no inventory API — connect this store computer with UNiCOM Edge."
- "These owned items have resale/rental opportunities."
- "A valid multi-user trade cycle was found."
- "Review activity shows possible coordinated manipulation."

### Role switching

A user can operate as buyer, merchant, staff, supplier, reseller, renter or coordinator. Role switching changes workspace emphasis, not identity or underlying authority.

### Organization visibility

When the Lab forms a non-trivial organization, show:
- objective;
- actors/capabilities;
- authority scopes;
- current task;
- why the organization was selected;
- expected benefit;
- risks;
- approvals.

Do not make swarm chat the primary UX.

## Local Commerce Edge UX

Connector Studio offers:

"Connect this store even if your POS has no API."

Setup:
1. run the local edge on an existing store computer/tablet;
2. detect authorized local interfaces;
3. select POS/files/browser/peripherals;
4. test read-only observations;
5. enable selected commands;
6. show reconciliation health.

The merchant should not need to know whether the implementation uses API, browser, USB, serial or shared files.

## Supermarket no-RFID quick start

The setup wizard explicitly says:

"You do not need RFID."

It offers:
- connect POS;
- upload sales/inventory files;
- barcode scan with phone;
- scanner/scale;
- shelf-count mode;
- buyer ordering;
- group-buy;
- opportunities;
- optional RFID later.

## Deployment tiers

### Tier A — Free prototype
Vercel for non-commercial staging/demo where its Hobby terms permit; Cloudflare Workers/Workflows/Queues/Durable Objects/Browser Run/Workers AI; Neon; R2; Upstash; optional Apify.

### Tier B — Commercial low-scale
Move commercial frontend/SSR away from Vercel Hobby where required by its terms; retain Cloudflare edge/orchestration, Neon, R2 and Upstash as economical.

### Tier C — Growth
Replace only saturated adapters with dedicated browser workers, stronger queues, paid Postgres, durable compute or commercial model providers.

No domain rewrite.

## Current free-tier operating notes

Cloudflare Workers Free has bounded request/CPU limits; Queues are available on Free; SQLite-backed Durable Objects are available on Free; Browser Run includes a free browser allowance; Workers AI has a daily free allocation.

Neon Free currently provides 100 projects with 1 GB Postgres storage per project.

R2 Free currently includes 10 GB-month storage, 1M Class A and 10M Class B operations per month.

Upstash Redis Free currently provides 256 MB, 10 GB monthly bandwidth and 500K commands/month.

These numbers are deployment observations only and may change. Domain code must never branch on them.


## Explore / Capabilities

Explore is a first-class product surface, not a help page.

It shows the complete set of things UNiCOM can do, organized by:
- Buy;
- Sell;
- Operate;
- Discover;
- Automate;
- Connect;
- Protect.

Each capability card contains:
- what it does;
- when it is useful;
- required connections/data;
- an example request;
- current availability;
- "Try it" action.

This solves the "code exists but users do not know it exists" failure mode.

The global command/intent input remains universal, but Explore ensures users can learn the product without knowing the right words.

## Zero-data onboarding

An empty store should not look like a blank dashboard.

It should present an actionable capability map:
- Connect a store;
- Import a catalog;
- Start selling;
- Ask UNiCOM to operate the store;
- Find your first opportunity;
- Try buyer intent;
- Create a group-buy;
- Connect physical inventory;
- Run a simulation.

The onboarding path changes with role, but all capabilities remain discoverable.

## Local edge runtime modes

LocalCommerceEdge should support multiple installation modes:
1. lightweight installed service on a store PC/server;
2. packaged desktop companion;
3. browser/host-assisted mode when installation is restricted;
4. mobile/tablet companion where local hardware is reachable there.

All modes expose the same provider-neutral capability contract.
