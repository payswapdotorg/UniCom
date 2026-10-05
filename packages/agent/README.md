# @unicom/agent

UNiCOM intelligence/coordination contract surface — **Worker 2 lane, Stage 0 (W2-001)**.

This package freezes the typed contracts for the agent, trust, capability,
coordination, security and routing planes. It contains contracts plus the
minimal deterministic validation needed to exercise them — nothing else.
ZCode remains the agent runtime substrate; W2-002 adapts it to these
contracts.

## Entry points

| Import | Purpose |
| --- | --- |
| `@unicom/agent` | Full intelligence/coordination contract (`src/index.ts`) |
| `@unicom/agent/capability` | **CANONICAL capability vocabulary** — Worker 3 consumes exactly this (`src/capability/index.ts`) |
| `@unicom/agent/contract` | Module public contract artifact (`src/contract.ts`) |

Invariant 34: this is the ONLY capability vocabulary in the repository.
Worker 3 references it by name and integrates against it in W3-002.

## Capability vocabulary boundary

```
CapabilityDefinition          (what a capability IS — catalog presence)
→ ProviderImplementation      (a provider's implementation of it)
→ ConnectedCapabilityInstance (account/session-bound executable instance)
→ CapabilityObservation       (current provider state, UNKNOWN ≠ FAILED)
→ ExecutabilityPreconditions  (typed: scope, permissions, geography,
                               currency, commercial terms, observation)
→ CapabilityExecutability     (EXECUTABLE | NOT_EXECUTABLE | UNKNOWN)
```

Executability rule: **catalog presence ≠ executable authority**. Execution
requires a connected instance plus a current observation, all checked by
`evaluateCapabilityExecutability` in a fixed deterministic order.

Execution modes (explicit enum): `PASS_THROUGH_NATIVE`, `COMPOSED`,
`OPTIMIZED_MULTI_PROVIDER`.

## Contract laws (docs/work-orders/W2-001.md §4)

1. One Main Agent principal; skills specialize; delegates are ephemeral and
   always attenuated (typed authority scopes, budgets, memory bounds,
   evidence obligations).
2. `Strategy` (what should happen) ≠ `Organization` (who executes it).
3. Executability requires `ConnectedCapabilityInstance` + current
   `CapabilityObservation` — typed, not documented.
4. `UNKNOWN` ≠ `FAILED`; provider-specific and customer-action-required
   states preserved.
5. Trust (`UserTrust`/`AgentTrust`/`CapabilityTrust`) never substitutes for
   `TransactionProof`; proof level (P0–P5) is selected before consequential
   execution via `pinProofSelection` → `buildConsequentialSubmission`.
6. `GroupBuy`/`TradeCycle` are explicit — no silent enrollment, per-leg
   independent authorization, hop-bounded production search.
7. Security `BLOCK` is deterministic and final; broadcasts are defensive-only
   (`validateThreatSignature` rejects weaponized shapes).
8. Commerce is referenced only through the opaque command/result seam
   (`commerce-seam.ts`); canonical commerce truth is Worker 1's.
9. No credentials in model-context-shaped types
   (`toModelContextMaterial` fails closed, type + runtime).
10. Third-party commerce content is data, not instructions
    (`UntrustedContent` has no conversion path to `TrustedInstruction`).

## Tests

`pnpm --filter @unicom/agent test` — deterministic, offline, zero-network
contract tests covering the 11 W2-001 acceptance scenarios plus delegate
attenuation, executability preconditions, defensive-only signatures,
model-context safety, strategy/organization separation, promotion gates and
the opaque commerce seam (106 tests).
