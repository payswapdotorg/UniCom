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
