# W2-010 — GUI-Visible Resilience, Authority and Recourse — Fault/Scenario Matrix + Oracle (v1)

**Status**: COMMITTED (fixture-contract evidence level — NOT real-browser evidence)
**Machine-readable canonical oracle**: `resilience-matrix.v1.json` (same directory; this file is its human-readable projection)
**Base commit**: `eb1ceca` · **Work order**: `docs/work-orders/W2-010.md` · **Phase**: post-v3-real-world-validation

## What this matrix is

A versioned, machine-readable matrix covering **all 11 scenario families** the work order lists. Every scenario carries a stable ID, initial conditions, injected fault, expected state transitions, expected **visible** dimension (surface, surface state, message), permitted action, blocked action, recovery path, evidence/proof requirements, terminal state, expected-result class (`expected-success` vs `expected-block`) and the hard laws it probes. Both the allowed path **and** the deny/recovery path exist per family.

The "GUI-visible" dimension here means: the asserted **typed view-contract state a rendered UI would show** (view states, decision cards, messages, blocked/permitted actions) — the typed surface contracts are the render model. These are **fixture-contract** runs through the real runtimes (real Commerce Kernel, real connector runtime, real group-buy formation engine, real live-session runtime, real offline queue) with faults injected **only through controlled test adapters** behind typed ports. Real-browser labelled runs follow once W1-010's runner lands (see "Next frontier").

## Invariant oracle (the eight hard laws)

| ID | Law |
| --- | --- |
| UNKNOWN_NEVER_FAILURE | an incomplete/ambiguous result is UNKNOWN, never FAILED |
| UNKNOWN_NEVER_SUCCESS | UNKNOWN is never silently promoted to success/settled |
| NO_PENDING_AS_SETTLED | pending/UNKNOWN is never rendered as settled |
| NO_SIDE_EFFECT_WITHOUT_AUTHORITY | no purchase/refund/trade leg/rental commitment without configured explicit authority |
| TRADECYCLE_LEG_REQUIRES_OWN_CONSENT | no multi-hop leg executes without that leg's own valid consent |
| PREDICTIONS_NEVER_MUTATE_CANONICAL_TRUTH | forecasts/twin counterfactuals never write canonical state |
| REPEATED_SUBMISSION_NO_DUPLICATE_EFFECT | duplicate submits are idempotent, never double side effects |
| DETERMINISTIC_VISIBLE_BLOCKS | security/authority blocks are deterministic and visible |

## Families and scenarios (63 total: 21 expected-success, 42 expected-block)

### F01 — Connector/provider response integrity (stale/slow/unavailable/contradictory; UNKNOWN never silently FAILED or success)

Injection seam: `FaultInjectingConnectorAdapter` (controlled test double behind the real `ConnectorRuntime` adapter contract).

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F01-S01 | health probe crashes mid-probe | health `unknown` (never `down`), probe error as evidence | block |
| F01-S02 | stale observation | executability `UNKNOWN (STALE_OBSERVATION)`, step/checkout hold unknown, refresh to recover | block |
| F01-S03 | contradictory probes (healthy→degraded, freshness UNKNOWN) | latest snapshot deterministic; freshness UNKNOWN → executability UNKNOWN, never averaged | block |
| F01-S04 | provider unavailable at execute → recovery | `failed-recoverable` + evidence; retry same idempotency key → single effect | success |
| F01-S05 | ambiguous execute outcome | step `unknown`, journey `unknown`, `providerStatePreserved: "unknown"`; never done/failed | block |
| F01-S06 | connect() returns UNKNOWN | lifecycle `unknown`; execute deterministically refused; re-authorize to recover | block |

### F02 — Interrupted sessions, temporary network loss, retry and resumption

Injection seam: real `LiveSessionRuntime` + real `OfflineObservationQueueRuntime` (no runtime mocking; faults at their public boundaries).

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F02-S01 | event after session end | typed `rejected-session-ended`, sequence unchanged | block |
| F02-S02 | late joiner | replay-from-start (`replay:true` then live), 0 silently-dropped | success |
| F02-S03 | backpressured slow consumer | pending head preserved, pressure counted, catch-up via pump | success |
| F02-S04 | network loss at the edge + duplicate re-sync | queue holds → handoff once; same idempotency key supersedes | success |
| F02-S05 | settlement UNKNOWN mid-checkout | checkout step `unknown` + blockerNote; window close → NOT_PAID (never money-in) | block |

### F03 — Duplicate submit, retry-after-timeout, idempotency/reconciliation

Injection seam: real `CommerceKernel` receipt ledger + `FaultInjectingPaymentBoundary` (provider double behind the kernel's port).

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F03-S01 | double-click duplicate submit | exact replay → `DUPLICATE`, original receipt, journal unchanged | success |
| F03-S02 | same key, different command | `IDEMPOTENCY_KEY_CONFLICT` hard rejection, zero events | block |
| F03-S03 | retry-after-timeout | failed attempt → zero journal events; same-envelope retry → exactly-once | success |
| F03-S04 | new command vs COMPLETED session | `INVALID_STATE` ("duplicate submissions are rejected"), zero events | block |
| F03-S05 | same observation reconciled twice | kernel `DUPLICATE`; inventory folded once | success |

### F04 — Missing/denied/expired/revoked approvals and permissions

Injection seam: canonical executability evaluator (real) + decision-card authority contract + autonomous-store authority gate (real kernel).

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F04-S01 | action without approval | action unavailable + reason, zero side effects | block |
| F04-S02 | approval granted | action available; execute under authority | success |
| F04-S03 | insufficient credential scope | `NOT_EXECUTABLE [INSUFFICIENT_CREDENTIAL_SCOPE]`, provider never called | block |
| F04-S04 | revoked connection | `NOT_EXECUTABLE [DISCONNECTED]`, zero provider calls | block |
| F04-S05 | customer-action-required connect | first-class state + visible requirement; execute refused | block |
| F04-S06 | commercial terms not accepted | `NOT_EXECUTABLE [COMMERCIAL_TERMS_NOT_ACCEPTED]` | block |
| F04-S07 | non-owner store override | `POLICY_DENIED [NOT_AUTHORIZED]`, zero journal events; unregistered → `NO_REGISTERED_AUTHORITY` | block |

### F05 — GroupBuy dropout / threshold / counter-offer / expiry / cancellation

Injection seam: real `GroupBuyFormationEngine` + group-buy domain (deterministic append-only ledger).

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F05-S01 | join after window close | typed `WINDOW_CLOSED` refusal, roster unchanged | block |
| F05-S02 | duplicate join by same participant | `JOIN_IDEMPOTENT`, roster never grows | success |
| F05-S03 | threshold met | single `GROUP_FORMED`; re-evaluation `ALREADY_FORMED` | success |
| F05-S04 | dropout → window closes below threshold | `DISSOLVED (WINDOW_CLOSED_BELOW_THRESHOLD)`, status EXPIRED, commitments released once | block |
| F05-S05 | merchant counter-offer | status COUNTERED with revised terms; not executable until accepted+authorized | block |
| F05-S06 | authorized merchant cancellation | status CANCELLED, commitments released once | block |
| F05-S07 | execution without merchant authorization | `MISSING_MERCHANT_AUTHORIZATION` reasons, no purchase | block |

### F06 — Multi-hop TradeCycle (≥3 participants), per-leg authorization, refusal/withdrawal, incomplete proof, recourse

Injection seam: real `dispatchJourney` per-step canonical executability over three `FaultInjectingConnectorAdapter` legs.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F06-S01 | all legs authorized | every leg EXECUTABLE via its own participant; journey succeeded | success |
| F06-S02 | leg 2 lacks own consent | leg 2 only blocked (`INSUFFICIENT_CREDENTIAL_SCOPE`); its adapter never called | block |
| F06-S03 | participant refuses leg | leg outcome `failed-terminal` → journey `failed-terminal`; recourse available | block |
| F06-S04 | participant withdraws mid-cycle | later legs `NOT_EXECUTABLE [DISCONNECTED]`, zero provider calls | block |
| F06-S05 | incomplete proof on closing leg | leg `unknown`, journey `unknown` — never silent success | block |
| F06-S06 | recourse after failed leg | dispute→evidence→resolution (no money) → explicit bounded refund | success |

### F07 — Inventory changes, partial receiving, substitutions, delayed delivery, wrong item, reconciliation conflict

Injection seam: real CommerceKernel supply/fulfillment/inventory handlers + edge observations through `CommerceKernelLane`.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F07-S01 | partial receiving (6 of 10) | PO partial, on-hand exact, remainder outstanding | success |
| F07-S02 | wrong item delivered | delivery DELIVERED + wrong-sku discrepancy (no silent substitution) | block |
| F07-S03 | delayed delivery | ATTEMPTED ≠ failure; late DELIVERED journaled with true timestamps | success |
| F07-S04 | count 3 vs system 10 | policy-coded hold/discrepancy — no silent overwrite of canonical truth | block |
| F07-S05 | UNKNOWN count | folded UNKNOWN; on-hand unchanged; never zeroed | block |
| F07-S06 | sold out before order | availability out-of-stock; order `INSUFFICIENT_INVENTORY` | block |

### F08 — Rental availability, deposit/condition evidence, late return, damage dispute, recourse

Injection seam: real `OPEN_RENTAL`/`ADVANCE_RENTAL` kernel commands + circular-domain deposit functions.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F08-S01 | happy path | REQUESTED→…→COMPLETED, every transition journaled | success |
| F08-S02 | late return | OVERDUE preserved (not failure) → RETURNED → COMPLETED | success |
| F08-S03 | invalid transition (COMPLETE from ACTIVE) | `INVALID_RENTAL_TRANSITION`, zero events | block |
| F08-S04 | deposit wear deduction | exact decimal deduction, itemized + journaled | success |
| F08-S05 | deposit damage dispute | order-dispute flow refuses rental deposits — **documented gap R-02** | block |
| F08-S06 | cancelled rental then START | CANCELLED terminal; START refused deterministically | block |

### F09 — Fake reviews/rings, counterfeit/mismatch, false non-delivery, refund abuse, connector scope compromise

Injection seam: trust-center incident contract + sanitizer + real kernel dispute/refund caps + canonical executability.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | --- |
| F09-S01 | fake review ring | incident signal→reason→effect→mitigation→next action; rating quarantined | block |
| F09-S02 | injected third-party content | rendered inert (data, never instructions) | block |
| F09-S03 | counterfeit/item mismatch | dispute accepted; refund ONLY through explicit bounded path | success |
| F09-S04 | false non-delivery claim | delivery evidence → dispute REJECTED, no refund | block |
| F09-S05 | refund abuse (beyond captured) | no-double-refund cap; chargeback → `NO_ADDITIONAL_REFUND` | block |
| F09-S06 | connector scope compromise | out-of-scope write blocked at dispatch; adapter never invoked | block |

### F10 — No-RFID supermarket: offline queue/replay, barcode/camera/weighted goods, reconciliation

Injection seam: real offline queue runtime + local commerce edge + physical journey runtime + real kernel fold.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | ---|
| F10-S01 | outage + duplicate re-sync | handed-off once; duplicates superseded | success |
| F10-S02 | weighted goods (fractional) | stays observation — **documented gap R-03** (no fractional POS sync seam) | block |
| F10-S03 | UNKNOWN count at store | folded UNKNOWN; availability never zeroed | block |
| F10-S04 | contradictory device counts | both journaled, deterministic policy order, never averaged | block |

### F11 — Autonomous-store guardrail trips; Commerce Twin forecast vs canonical truth

Injection seam: real kernel policy gate (stop conditions/bands/authority) + `CommerceTwin` read-only projections.

| ID | Fault | Expected visible outcome | Class |
| --- | --- | --- | ---|
| F11-S01 | stop-condition trip | ALL autonomous commands `POLICY_DENIED [STOP_CONDITION_TRIGGERED]`, zero events; autonomy paused | block |
| F11-S02 | refund outside policy band | DENY at boundary; human gate | block |
| F11-S03 | owner override | journaled with actor + justification; presentation paused | success |
| F11-S04 | control of unregistered store | fails closed `NO_REGISTERED_AUTHORITY` | block |
| F11-S05 | twin what-if forecast | predictive projection only; journal/snapshot byte-identical before/after | success |

## Result classes and the denominator

Every attempted scenario reconciles: `pass | fail | blocked | unknown | aborted | skipped` — no silent drops. `expected-block` scenarios PASS when the block is **deterministic, visible, and correctly classed** (a block that flips to UNKNOWN-or-success, or an invisible block, is a FAIL). Actual counts live in `results-fixture-v1.json` (fixture-contract labelled).

## Where the real-browser frontier continues (W1-010 dependency)

All 63 scenarios are currently evidenced at **fixture-contract** level. The scenarios that specifically await W1-010's real-browser runner for GUI-complete evidence: first-discovery of every fault surface from the ordinary navigation origin, visible-label-level assertions (banner/card/button text as rendered), and screenshot/traces per checkpoint. The matrix's `execution.testRef` values are the committed, reproducible fixture-level proof in the interim.
