# Operator decision packet — Commerce-plane linking (prepare-only)

**Status:** PREPARE_OPTIONS_ONLY_OPERATOR_DECISION_REQUIRED · **Implementation authorized:** NO
**Prepared by:** TL, product-completion phase (2026-10-11), issue #12
**Scope question:** how a formed GroupBuy or an executed TradeCycle could eventually connect to orders, payments, reservations and recourse **without weakening consent, idempotency or authorization**.

## 1. Problem and current evidence

The commerce kernel (runtime-integration phase, issue #11) owns two aggregates with full truth semantics: GroupBuy formation (interest ≠ commitment; consenting-only rosters; organizer-gated formation with final terms) and TradeCycle execution (per-leg consent; refusal stops without committing other legs; idempotent retries preserve the original receipt). The kernel records **formation/execution truth only** — by design it creates no order, payment, reservation or recourse object. The web surfaces state this boundary on-surface ("creates no commitment", "no commerce-plane linking from committed cycles"). J12's wholesale order pad, J10 storefront orders and J17 refunds run on separate kernel command paths (cart/place-order/payment-intent) that are NOT driven by GroupBuy/TradeCycle outcomes.

The gap: when a GroupBuy forms or a TradeCycle leg executes, nothing downstream can happen without a human re-entering the facts into a different command path — the honest current state, and the reason the registry carries this decision request.

## 2. Non-negotiable laws any design must preserve (frozen baseline)

1. **Formation/execution truth is separate from downstream commitments.** A formed GroupBuy is not an order; an executed leg is not a payment. Linking must be a SEPARATE, individually authorized command — never an automatic side effect of formation/execution.
2. **Per-side-effect authorization.** Each downstream object (order, payment, reservation, recourse case) requires its own actor-authorized command with its own consent basis. A GroupBuy participant's consent to join ≠ consent to be charged; a TradeCycle leg's execution consent ≠ consent to reserve inventory.
3. **Idempotency.** Every linking command carries a client-supplied idempotency key; retries return the ORIGINAL receipt/result and never duplicate an effect (the kernel's existing DUPLICATE law).
4. **Actor authority.** Who may create the downstream object must derive from the aggregate's own actor laws (e.g. the GroupBuy organizer may PROPOSE a linked order; participants consent to it; nobody else).
5. **Cancellation/compensation.** A downstream effect must reference its upstream truth so cancellation can be reasoned about; compensation (refund/unreserve) is its own separately-authorized command, never automatic.
6. **UNKNOWN is not FAILED.** A linking step whose downstream result is pending must surface UNKNOWN, never a failure.
7. **Refusal must not commit other legs** — linking one leg's outcome never links others.

## 3. Options compared

| | A. Kernel-native linking aggregates | B. Anti-corruption link service (new module, e.g. `@unicom/linking`) | C. No kernel change — host-side orchestration only |
|---|---|---|---|
| Shape | New kernel aggregates (`GroupBuyOrderProjection`, `TradeCycleSettlement`) emitting typed commands against the EXISTING order/payment commands | A translation layer subscribing to kernel events, issuing existing commands under an explicit system actor with per-effect authorization records | The web host (or agent lane) issues existing commands after a human confirms, driven by rendered GroupBuy/TradeCycle state |
| Pros | Single truth home; idempotency/actor laws live where the truth lives; testable in the kernel's exhaustive style | Keeps the kernel's aggregate count minimal; linking policy evolves independently; clean seam for a kill switch | Zero architecture change; zero new public entrypoints; ships fastest |
| Cons | Grows the kernel (the heaviest, most review-intensive surface); linking policy baked into domain code | New module = new dependency edges to review (web → linking, linking → commerce — an ARCHITECTURE CHANGE requiring baseline revision); a second truth home risks drift | No durable linking record in the kernel (only existing command receipts); orchestration state is host-local; weakest audit trail |
| Architecture impact | None (inside `@unicom/commerce`; additive commands on the existing public contract) | Requires a baseline revision (new module + edges) | None |
| TL recommendation | **Recommended target state** (Stage 2) | Not recommended now (cost > benefit at current scale) | **Recommended first stage** (Stage 1) |

## 4. Recommended staged rollout (explicit operator approval per stage)

- **Stage 0 (planning only):** acceptance tests — extend the kernel test suite with the linking LAWS as executable specifications against the current command surface (documents the invariants; changes no behavior).
- **Stage 1 (Option C):** host-side, human-confirmed linking: rendered GroupBuy/TradeCycle surfaces gain a "create a linked order draft" affordance that pre-fills the existing order-pad/place-order command with the aggregate's facts, under the acting human's authority and role permissions. The receipt references the source aggregate id. Nothing automatic; kill switch = remove the affordance.
- **Stage 2 (Option A, only after Stage 1 evidence):** kernel-native `LINK_GROUPBUY_TO_ORDER_DRAFT` / `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT` commands — draft-creating only (a draft is not a commitment), with per-effect authorization records, idempotency keys, compensation references and UNKNOWN recovery, covered by the kernel's exhaustive test style.
- **Payments/reservations/recourse: never auto-created at any stage.** They remain separately-authorized commands a human (or a future explicitly-authorized agent policy) issues against a linked draft.

**Kill switch at every stage:** linking is additive, behind its own command ids / affordances; disabling removes the affordance and refuses the commands (honest "linking disabled" state), with no effect on existing aggregates.

## 5. Acceptance tests any stage must pass (sketch)

Duplicate link command returns the original receipt; unauthorized actor (non-organizer, non-consenting participant) refused; a linked draft is not an order until separately placed; canceling the upstream aggregate marks downstream drafts cancelled-but-never-committed; compensation requires its own authorization; a pending downstream result surfaces UNKNOWN; refusing to link one leg never links others; every linking artifact renders its provenance (which aggregate, which actor, which consent basis).

## 6. Exact approval requested

1. Approve Stage 0 (spec tests) — low risk, no behavior change.
2. Approve Stage 1 (host-side human-confirmed drafts) — implementation within the frozen architecture.
3. Stage 2 requires a SECOND decision after Stage 1 evidence is reviewed.
4. Explicitly NOT requested: live providers, real payments, production deployment, human research (each remains separately gated).

**Interfaces that would change:** Stage 1 — web module surfaces only (no contract change). Stage 2 — additive commands on the existing public `@unicom/commerce` contract (no new package, no new dependency edge).

## 7. TL DECISION — recorded 2026-10-11 (operator delegation)

**Authority:** the operator delegated the two pending TL-owned decisions to the TL on 2026-10-11 ("as the TL, make the right decisions keeping in mind the mission of Unicom (become the main interface for global commerce)") and directed fast roadmap progress. This section records the TL's decision under that delegation; the operator retains the standing gates (production deployment, live providers, human research) which remain NOT_AUTHORIZED.

**Decision: APPROVE the staged rollout, Stage 0 + Stage 1 now; Stage 2 deferred.**

- **Stage 0 approved** — executable linking-law specifications (the seven laws of §2) as kernel test-suite extensions against the current command surface. Test-only; no behavior change; no public-contract change.
- **Stage 1 approved** — host-side, human-confirmed linking: the rendered GroupBuy and TradeCycle surfaces gain a "create a linked order draft" affordance that pre-fills the EXISTING order-placement command with the aggregate's facts, under the acting human's authority and role permissions; the receipt references the source aggregate id; nothing automatic; kill switch = remove the affordance.
- **Stage 2 NOT yet authorized** — kernel-native draft-linking commands require Stage 1 evidence first (per §4). A future TL record will gate it.
- **Payments, reservations and recourse are never auto-created at any stage** — they remain separately-authorized commands (live payment paths remain gated behind the standing operator gates).
- **All seven laws of §2 are binding acceptance criteria** for every stage, and §5's acceptance-test sketch is the Stage 0 implementation basis.

**Mission rationale:** a formed GroupBuy or an executed TradeCycle that can never become an order is a demonstration, not the main interface for global commerce. Stage 0+1 closes the loop while preserving consent, idempotency, actor authority, compensation, UNKNOWN and kill-switch laws exactly as written.

**Implementation vehicle:** work orders W1-014 (Stage 0) and W2-015 (Stage 1), dispatched to workers; the TL integrates and independently verifies. Registry: `docs/development-state/commerce-integration-state.json`.
