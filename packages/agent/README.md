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

## W2-005 — Reality/Learning Lab + model-routing evaluation

The evaluation substrate (all additive, on top of the W2-002 kernel +
W2-003 lab gates + W2-004 evidence/trust/immune foundation):

| Artifact | Purpose |
| --- | --- |
| `sim-random.ts` | Seeded splitmix32 PRNG + tick clock — NO `Math.random`, NO wall clock |
| `reality-lab.ts` | Reality Lab: deterministic seeded simulated commerce environments; serves facts through the opaque `CommerceEvidenceFactsPort` seam only (read-only, Reality-Lab-only double) |
| `reality-scenarios.ts` | The frozen 5-scenario battery (routine commerce, coordinated abuse, complex planning, provider marketplace, specialist operations) |
| `reality-battery.ts` | 23 decision tasks over 9 task kinds + 12 adversary flows (every fraud archetype BASE + EVASION) |
| `agent-configurations.ts` | The 7 Stage-4 configurations + `decideTask` (built on the REAL `routeModelTask`) + integer cost/latency unit models + security-analysis capability matrix |
| `scenario-evidence.ts` | Scenario → hash-chained evidence (reviews, claims, attestations, carrier observations, commerce-fact snapshots via the seam) |
| `adversarial-evaluation.ts` | REAL W2-004 detectors per flow + capability-gated surfacing; misses are EXPLICIT (declared limitations journaled; silent evasion fails the run) |
| `learning-lab.ts` | Evaluation runs: decisions measured against ground truth; every run journals `LAB_EVALUATION_RUN`/`LAB_EVALUATION_OUTCOME`/`KNOWN_LIMITATION` evidence |
| `model-routing-comparison.ts` | The 7-way comparison: same battery for all seven, structured entries + rankings + self-verifying consistency checks |
| `promotion-records.ts` / `promotion-chain.ts` | The promotion chain: ordered gates SIMULATION → SHADOW → CANARY → OBSERVED_OUTCOME, each transition evidence-backed (SIMULATION only from LAB); promotion/retirement as journaled decisions; tamper-evident chains |
| `routing-policy.ts` | Deterministic policy application over journaled state; typed refusals for un-promoted/retired configurations; hash-chained, replayable decision journal |

Laws (W2-005): evaluations are deterministic (same seed + configuration →
same measured outcomes); evidence is hash-chained and append-only;
promotion/retirement are journaled policy applications — a gate without
evidence BLOCKS promotion; adversarial evasion that goes undetected is a
bug, never a pass; simulated environments never mutate canonical commerce
state; routing decisions are journaled, replayable, never silent.
