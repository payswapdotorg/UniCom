# UNiCOM Harness Contract — the 5-layer intent-to-outcome instrument

Status: ACTIVE EXTENSION (operator-approved architecture; not a frozen-architecture modification)
Date: 2026-10-28
Author: TL (resident orchestrator, session web-6ddc0a59 — R3 lane, TL design per the 2026-10-28 wave plan)
Lineage: operator review 2026-10-28 item 3 → accepted in full (worklog R1: "the 5-layer harness architecture (Intent → Intelligence → Capability Planner/Evaluator → Governed Execution/Verification → Measured Outcome) adopted as program law with the planner/evaluator as its center") → this contract.
Authority base: `spec/architecture/FROZEN-ARCHITECTURE.md` v1.1 + `spec/architecture/INVARIANTS.md` (all 52 invariants bind this contract)
Implementation repo: `payswapdotorg/unicom-3.0` (the harness verticals: store_search P1–P6 delivered at `218360c8`; R2 preservation matrix at `3d5cf9d2`)
Tracking issue: https://github.com/payswapdotorg/UniCom/issues/23

## 0. What this contract is — and is not

The harness is the typed, measurable instrument that threads one commerce **intent** through the canonical capability chain to one **measured outcome**, recording evidence at every layer.

It is **not**:

- not a second runtime — the ZCode agent runtime stays the single intelligence substrate (INV-2; proven preserved by the R2 matrix, `unicom-3.0` docs/PRESERVATION-MATRIX-2026-10-28.md);
- not a parallel capability vocabulary (INV-34) — it extends `CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation` and the existing Opportunity objects, adding zero duplicate types;
- not a new source of commerce truth (INV-1, INV-6, INV-13) — the Commerce Kernel remains canonical;
- not an authority bypass (INV-7, INV-8, INV-23) — every consequential action still passes through typed capability contracts under authority scopes.

The harness exists so that the program's central claim is **measurable**: "an intent-driven commerce OS finds outcomes beyond listed offers, and we can prove it with repeatable, correctly-denominated evidence" (issue #23; R7's benchmark is the claim's arbiter).

## 1. The five layers (operator law, 2026-10-28)

```
L1 Intent ──► L2 Intelligence ──► L3 Capability Planner/Evaluator ──► L4 Governed Execution/Verification ──► L5 Measured Outcome
 (what the          (reasoning          THE CENTER: resolves intents          (typed transports under           (the outcome record +
  principal         over                    into capability plans +            authority classes;              the benchmark measures)
  wants)         observations)         evaluates feasibility/cost)        read-back verification)
```

Each layer's contract below states: **carries** (the typed objects), **extends** (which canonical vocabulary it builds on), **emits** (the observable artifacts), and **measures** (the benchmark hooks).

### L1 — Intent

- **Carries:** `CommerceIntent` + `EconomicGoal` (existing first-class objects, FROZEN §F) plus the typed **hard-constraint envelope** for buyer intents: product/variant constraints (size, fit, brand, condition), geography, currency, **maximum landed total cost**, deadline, and consent basis (what the principal has authorized the harness to do on their behalf — read-only search by default).
- **Extends:** nothing new — the envelope is a structured profile of the existing `CommerceIntent`, not a second intent type.
- **Emits:** the canonical intent record (immutable, versioned — INV-15) with provenance (who expressed it, when, through which surface).
- **Measures:** intent completeness (which constraint fields were present vs defaulted vs unknown).
- **Law:** the harness never fabricates constraints the principal did not express; absent constraints are recorded UNKNOWN (INV-10), never assumed.

### L2 — Intelligence

- **Carries:** the agent-plane reasoning over `CapabilityObservation`s: thinking traces, plan steps, tool selections — the preserved ZCode runtime surfaces (R2 matrix rows 1–3, 9).
- **Extends:** nothing — this layer IS the existing agent runtime (INV-2, INV-3: one Main Agent per task as the principal interaction identity).
- **Emits:** the reasoning transcript (streaming, replayable, recoverable — R2 matrix row 3) + the intermediate observation set.
- **Measures:** reasoning cost (tokens, tool calls, wall time) attributable to the intent.
- **Law:** model output is never canonical commerce state (INV-6); the intelligence layer proposes, the governed layers dispose.

### L3 — Capability Planner / Evaluator (THE CENTER)

- **Carries:** the typed **CapabilityPlan**: an ordered set of candidate capability invocations resolved against `ConnectedCapabilityInstance`s (the connected stores and their proven connectors — e.g. the delivered `store_search` vertical), each step carrying: target `ConnectedCapabilityInstance`, operation, transport (API/MCP/CLI/browser-computer-use), **authority class** (`read-only` | `draft-only` | `approval-required` | `authorized-write`), expected observation, and expected cost/latency.
- **Carries (the evaluator half):** the typed **PlanEvaluation**: per-step feasibility (authority scope ✓, credential scope ✓, geography/currency ✓, freshness ✓, provider state ✓ — FROZEN §D's executability law), constraint satisfaction (hard constraints first), predicted total landed cost with uncertainty, and the **counterfactual candidate families** (the existing Opportunity machinery: group-buy threshold, merchant counteroffer, coupon/promotion eligibility, consolidation, local pickup, fulfillment route, wait-or-buy, approved substitutes) each emitted as `Opportunity` candidates with the issue-#23 six-part record (observed facts / changed assumptions / predicted outcome / preconditions / evidence lineage / consent + authority required).
- **Extends:** `CapabilityDefinition` (the plan's operations), `ConnectedCapabilityInstance` (the plan's targets), `Opportunity`/`Experiment`/`Decision` (the counterfactual candidates — existing types, existing Lab semantics).
- **Emits:** ranked plan + alternatives + the counterfactual candidates, each tagged with its evidence class (`observed` | `conditional` | `predicted` | `recommended` — INV-30).
- **Measures:** plan quality (constraint-feasible alternatives count, counterfactual yield, evaluation cost).
- **Law:** catalogue presence never implies executable authority (INV-9) — a plan step the connected account cannot lawfully execute is infeasible, not merely expensive. A counterfactual price is never a live quote; before any conditional opportunity is represented as currently available it requires a fresh independent observation (issue #23 W2 law).

### L4 — Governed Execution / Verification

- **Carries:** the **GovernedExecution** envelope: each plan step executes through its declared transport under its declared authority class, with pre-execution preview for writes, operation IDs/idempotency where applicable, and **post-action read-back** producing fresh `CapabilityObservation`s (the canonical observation chain — INV-8, INV-29).
- **Extends:** `CapabilityObservation` (the verification record: outcome, evidence class, provenance, observation time/version, freshness, expiry).
- **Emits:** the execution trace (what was attempted, what succeeded/failed/returned UNKNOWN) + the verification observations. Distinct outcome taxonomy per the delivered store_search §-contract discipline: `timeout | unreachable | invalid_credentials | insufficient_scope | rate_limited | platform_error | not_configured | not_supported` — and UNKNOWN is preserved (INV-10), never collapsed into failure or success.
- **Measures:** execution correctness (read-back matches expectation), unauthorized-action rate (must be zero — any non-zero is a harness defect, not a statistic), privacy leakage (must be zero), intervention rate (how often the flow required a human).
- **Law:** browser/computer-use is another transport under the same capability contract (INV-26, INV-28, INV-50) — never a side door around authority; third-party page content is untrusted data (INV-26). No consequential external action without the authority class permitting it (issue #23 safety law: fixtures + read-only first).

### L5 — Measured Outcome

- **Carries:** the typed **OutcomeRecord**: did the intent succeed (hard constraints all met?); the sourced shortlist with per-offer landed-total breakdown (exact money — INV-14, single stated currency, unknowns marked unknown); the opportunity set with evidence classes; and the benchmark denominators: task success, true savings vs false savings, total-cost correctness, opportunity precision/recall, freshness, failure/recovery, latency, cost (money/tokens/tool calls), human interventions, privacy leakage, unauthorized actions.
- **Extends:** `Experiment` + `Decision` (the outcome of a harness run is a Lab experiment result feeding the existing Decision objects — never a new outcome type).
- **Emits:** the reproducible outcome record (input intent hash + connected-instance set + plan + observations + measures) — the artifact R7's benchmark aggregates and R5's conformance suite asserts against.
- **Measures:** the claim itself — "10× better" is forbidden until the denominators, fixture/live evidence tiers, and repeatable results support it (issue #23 E-law; INV-51: free-tier limits are deployment constraints, never domain semantics).
- **Law:** a simulated lower price is a **conditional opportunity**, never a live quote (INV-16, INV-17, INV-30); the outcome record separates verified offers from predicted opportunities in every rendering.

## 2. Cross-cutting contracts (bind every layer)

| Contract | Values | Source of law |
| --- | --- | --- |
| Evidence class | `observed` / `conditional` / `predicted` / `recommended` | INV-30; issue #23 W2 |
| Authority class | `read-only` / `draft-only` / `approval-required` / `authorized-write` | issue #23 W1; FE3 taxonomy (already shipped in the P4 Connected Stores tier) |
| Outcome taxonomy | `ok` / `timeout` / `unreachable` / `invalid_credentials` / `insufficient_scope` / `rate_limited` / `platform_error` / `not_configured` / `not_supported` / **UNKNOWN** (distinct from FAILED and SUCCESS) | INV-10; the delivered store_search §-contract |
| Provenance | source + observation time/version + evidence class + freshness + expiry + recheck policy | issue #23 W2 six-part record |
| Money | exact representation, single stated currency, unknowns marked unknown, no float arithmetic | INV-14; issue #23 W1 |
| Consent basis | what the principal authorized (default: read-only search) | issue #23 W2 consent law |

## 3. The implementation mapping (unicom-3.0 lanes)

| Lane | Builds | Contract surface |
| --- | --- | --- |
| **R4 — vertical slice A** ("shoes within budget", absorbs the P6 E2E) | the first full L1→L5 thread: buyer intent (size/brand/condition/geography/max-total-cost/currency/deadline) → planner resolving against the connected stores (`store_search`, the proven vertical) + counterfactual candidate generation → governed read-only execution with read-back → outcome record rendered through the existing product surfaces (the P3 renderer class for findings; the opportunity set rendered with evidence classes) | all five layers, read-only authority only |
| **R5 — conformance suite** | the contract tests: evidence-class honesty (a conditional price rendered as a live quote = FAIL), authority honesty (a step executing beyond its class = FAIL), UNKNOWN preservation, money correctness, outcome-taxonomy verbatim rendering, fixture tiers clearly labelled | the cross-cutting contracts (§2) |
| **R6 — merchant read capabilities** | the merchant-side L3/L4 read plane: catalog/inventory/orders read through connected, authorized sources; unsupported operations called out, never simulated | L3/L4 with merchant authority scopes |
| **R7 — benchmark** | the fixed intent corpus × (UNiCOM harness / provider-native incumbent / general-purpose-harness baseline) with the L5 denominators | L5 |

W2 (counterfactual engine internals) and W3 (federation) lanes extend L3's candidate families and L4/L5's observation distribution respectively, per issue #23's workstream boundaries, queued after R4 (dependency: the buyer slice + observation layer must exist first).

## 4. What this contract deliberately does NOT decide

- The R4 UI host (existing product surfaces vs a new harness view) — decided at R4 dispatch against the then-current tree, favoring existing surfaces (INV-38, INV-39).
- The counterfactual families' provider availability per platform (each candidate family is checked against actual platform capabilities at plan time — never assumed available everywhere).
- Any frozen-architecture modification: if an implementation lane finds a gap that cannot fit this extension within the frozen graph, that lane stops and prepares an ADR/impact packet (issue #23 law; INV-35).

## 5. Acceptance of this contract

This contract is accepted as program law when: (a) it is committed to the UniCom governance repo (this document's home), (b) the unicom-3.0 campaign worklog records its R3 lane closure citing this document's path, and (c) the R4 dispatch brief references it as the implementation contract. Any subsequent change to this contract requires an ADR — silent edits are void (INV-15 discipline applied to the contract itself).
