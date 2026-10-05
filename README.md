# UNiCOM

UNiCOM is an AI-native Commerce Operating System and Commerce Network built by extending the ZCode agent runtime.

It targets Shopify-class commerce capabilities while making AI the operating model of the platform:

**Goal → Observe → Plan → Simulate → Approve → Execute → Verify → Learn**

UNiCOM supports both merchants and buyers, and spans digital and physical commerce.

## Source of truth

The repository is the only implementation authority. Chat, screenshots, agent reports and claimed completion are non-authoritative unless the repository records the evidence.

Start here:

1. [AGENTS.md](AGENTS.md)
2. [spec/architecture/FROZEN-ARCHITECTURE.md](spec/architecture/FROZEN-ARCHITECTURE.md)
3. [spec/architecture/INVARIANTS.md](spec/architecture/INVARIANTS.md)
4. [spec/dependency-graph.md](spec/dependency-graph.md)
5. [docs/LLM-ARCHITECT-HANDOFF.md](docs/LLM-ARCHITECT-HANDOFF.md)
6. [docs/FEATURE-COMPLETENESS-MATRIX.md](docs/FEATURE-COMPLETENESS-MATRIX.md)
7. [docs/FINAL-FEATURE-AUDIT-2026-10-05.md](docs/FINAL-FEATURE-AUDIT-2026-10-05.md)
8. [docs/research/COMMERCE-RESEARCH.md](docs/research/COMMERCE-RESEARCH.md)
9. [docs/SUPERMARKET-WITHOUT-RFID.md](docs/SUPERMARKET-WITHOUT-RFID.md)
10. [docs/UX-DEPLOYMENT.md](docs/UX-DEPLOYMENT.md)
11. [docs/development-state/v1-work-order-state.json](docs/development-state/v1-work-order-state.json)

## Architecture at a glance

```
                    UNiCOM
                       │
         ┌─────────────┴─────────────┐
         │                           │
    EXPERIENCE                   COMMERCE
       PLANE                       PLANE
         │                           │
         └─────────────┬─────────────┘
                       │
                ZCODE AGENT PLANE
                       │
           One Main Agent + Skills
                       │
      ┌────────────────┼─────────────────┐
      │                │                 │
 Commerce Twin    Opportunity Lab    Security
      │                │             Immune System
      └────────────────┼─────────────────┘
                       │
               CONNECTOR NETWORK
                       │
      API / MCP / UCP / ACP / A2A / Browser /
      Feed / CLI / Live Commerce / Physical Edge
```

## Core ideas

### One main agent, emergent organizations

UNiCOM keeps one Main Agent as the principal identity. Skills are the normal specialization mechanism.

The Reality/Organization Lab may temporarily create bounded system actors when that produces a better execution organization. Actors are represented through capabilities, authority, budgets, memory scope and proof requirements rather than a swarm of independent chat personas.

### Buyer intent optimization

A buyer can state:

> “I need X by Friday under $200, with strong seller credibility and privacy.”

UNiCOM can search reachable commerce systems, compare real-time opportunities, decide whether to buy now or wait, discover group-buy options, propose a new group-buy to a merchant, consider swaps/rental/resale, and execute within policy.

### Group buying

User agents can discover merchant group purchases, recruit compatible participants, and suggest new group-buy programs to merchant agents when enough demand exists.

### Multi-hop trade

UNiCOM can discover bounded exchange cycles.

Example:

- User 1 has Y and wants X.
- User 2 has X and wants Z.
- User 3 has Z and wants Y.

The system can coordinate the cycle while preserving independent authorization, privacy and proof requirements.

### Commerce everywhere

UNiCOM connectors are not limited to systems with clean APIs.

Supported connector families include:
- native APIs/SDKs;
- REST/GraphQL;
- MCP/UCP/ACP/A2A;
- CLI;
- files/feeds/EDI/SFTP/email;
- isolated browser automation;
- live-commerce streams;
- POS/QR/barcode/NFC/RFID/local edge.

### Physical commerce

Physical stores, pop-ups and events are first-class commerce edges.

### Autonomous stores

Merchants can define governed autonomous-store policies. The system continuously observes, simulates and optimizes while respecting explicit budgets, approvals, margins, jurisdictions and stop conditions.

### Security immune system

UNiCOM actively looks for:
- fake/rigged reviews;
- seller review rings;
- product substitution;
- counterfeit returns;
- false non-delivery;
- false item-not-as-described claims;
- refund abuse;
- account/agent compromise;
- connector prompt injection.

Defensive threat signatures can be broadcast to other agents subject to policy.

### Trust

User trust, agent trust, capability/provider trust and transaction proof are separate objects.

### Model routing

The runtime can use:
- fast/System 1 models;
- JEPA/world-model components;
- System 2 models

according to uncertainty, impact, latency, privacy and cost.

## Development

UNiCOM inherits ZCode's development architecture and runtime.

Install Node.js 24+ and pnpm 10.33.2, then:

```bash
pnpm bootstrap
```

Common commands:

```bash
pnpm lint
pnpm typecheck
pnpm fmt:check
pnpm architecture:check --changed
pnpm verify:pre-push
pnpm dev:web
pnpm dev:desktop
```

The authoritative implementation plan is controlled by the Work Orders and dependency graph.

## Initial TL frontier

Exactly three workers may start concurrently:

- W1-001 — Commerce domain contracts
- W2-001 — Agent/trust/capability/coordination contracts
- W3-001 — Experience/connector/runtime/deployment boundaries

The TL is the orchestrator, not a fourth worker.

## ZCode lineage

UNiCOM is based on ZCode v3.14.3 at commit:

`29628c9acdb81b703bbd4080c207a0e7ce5e276e`

ZCode remains the agent operating kernel. UNiCOM-specific architecture is specified under `spec/` and `docs/`.

## License

The repository retains the upstream ZCode licensing and third-party notices. See [NOTICE.md](NOTICE.md).
