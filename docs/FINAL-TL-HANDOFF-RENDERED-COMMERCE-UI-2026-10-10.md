# Final TL Handoff — Rendered UNiCOM Commerce UI

Date: 2026-10-10  
Repository: payswapdotorg/UniCom  
Tracking issue: https://github.com/payswapdotorg/UniCom/issues/10  
Authority: docs/development-state/rendered-commerce-ui-state.json  
Inputs: docs/simulations/post-v3/FINAL-REPORT.md; docs/development-state/post-v3-validation-state.json; docs/simulations/V3-EXPERIMENT-PROTOCOL.md; docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md

## 1. Mission

Implement a genuinely rendered, usable UNiCOM commerce interface by connecting the existing commerce experience-plane contracts/runtime constructors to the reachable web host. The current main application renders the ZCode connect wall; browser evidence shows all 19 commerce journey families absent from its rendered DOM. The Post-V3 validation phase correctly completed by documenting this absence rather than pretending the fixtures were a rendered product.

This handoff begins the next implementation phase. It does not rewrite V3 or post-V3 certification records.

## 2. Operator authorization gate — MUST BE RESOLVED FIRST

The Post-V3 state explicitly classifies “rendered commerce UI” as an operator-owned product-scope decision. Preparing this handoff is not itself authorization to build or deploy product UI.

**Before implementation dispatch:** obtain explicit operator approval to build the rendered commerce UI within architecture baseline 1.1-frozen-2026-10-05. Until then:
- TL may do read-only repo inspection and refine an implementation map;
- TL may verify existing contracts and create a non-mutating component inventory;
- workers W1-011, W2-012 and W3-015 remain READY and MUST NOT start product implementation;
- do not change `rendered_ui_implementation_authorized` to true, change architecture, or claim the UI exists.

After approval is recorded in the new state file (and in this issue), TL may dispatch exactly three workers concurrently, subject to the dependency sequence below. Production deployment and live commerce mutation are separate decisions and remain unauthorized.

## 3. Frozen boundaries

- Preserve `docs/development-state/v3-simulation-state.json`, the V3 certification, all baseline/amendment/holdout reports, the Post-V3 state file and `docs/simulations/post-v3/FINAL-REPORT.md` unchanged.
- Do not change frozen architecture version `1.1-frozen-2026-10-05`. Build only within currently approved surfaces and contracts. If a required dependency direction, authority, canonical commerce behavior or architecture rule needs to change, stop and request separate operator authorization.
- Exactly three workers maximum; TL is coordinator/acceptance lane, not a fourth worker.
- No production deployment, live provider connections requiring secrets, live transactions or use of production data.
- A visible synthetic demo state is allowed only when clearly labelled; never represent mocked inventory, quotes, payments, supplier responses or outcomes as live facts.
- Canonical commerce truth must flow through existing deterministic commerce commands/contracts. UI code must not mutate canonical truth directly.
- Security BLOCK is deterministic. UNKNOWN != FAILED. Pending != settled. Commerce Twin forecasts do not mutate canonical state. GroupBuy interest != commitment. Every TradeCycle leg needs individual consent.
- No empty navigation links or deceptive buttons: either the interaction works, is visibly disabled with a reason, or presents an explicit not-connected/unavailable state.

## 4. Three-worker structure

### W1-011 — host UI platform and integration
Owns the rendered web host, route/navigation and role switcher, shared module interface, accessibility/responsive shell, experience-contract consumption, ordinary-navigation registry and host tests. It publishes the module contract first; other workers should branch/rebase to this contract.

### W2-012 — buyer and peer-commerce journeys
Owns buyer intent, offer sourcing/comparison, buy-now-vs-wait/negotiation/substitution, both GroupBuy sides for participants, rent/borrow, resale/rental/consignment, proactive opportunities, bounded TradeCycle UI and Commerce Twin what-if views.

### W3-015 — merchant, procurement and physical commerce
Owns merchant lifecycle, supplier/procurement/receiving, B2B/multi-location/channel flows, autonomous-store policy surfaces, connection states, physical/no-RFID supermarket, trust/security/recourse, and the merchant side of latent-demand GroupBuy.

Primary write surfaces are separate. TL resolves shared interface dependencies through committed repo contracts, not ad-hoc chat.

## 5. Implementation sequence after authorization

1. **Inventory and contract map:** identify all current experience surfaces, runtime constructors, safe command paths and unsupported adapters. Record journey ID → existing contract → runtime capability → planned rendered component → evidence requirement. Do not invent a backend abstraction where one already exists.
2. **W1 shared host scaffold:** implement the common React host on the existing web app, module API, navigation and role-switching first. Publish the module contract in a small commit for W2/W3 to consume.
3. **Parallel feature modules:** once the shared contract commit exists, W2 and W3 work in parallel on separate module directories while W1 completes host integration/accessibility/tests.
4. **Functional demo states:** seed deterministic synthetic entities; expose the full user journey even where connected integration is unavailable, but label each missing runtime/provider accurately. No live side effects.
5. **Browser gate:** run real Playwright against the rendered application from ordinary homepage/role surfaces, not direct deep links. Reuse the W1-010 browser-pilot format and extend to successful visible interactions for every claimed-present journey. Record PASS, FAIL, ABSENT, BLOCKED, UNKNOWN and SKIPPED separately.
6. **Resilience gate:** adapt the W2-010 matrix and actual-browser evidence format to the rendered components. Contract-only results remain contract-only until re-tested through browser interactions.
7. **Independent TL acceptance:** rerun the merged-lineage battery, typecheck, lint and architecture gate; inspect screenshot/trace samples; verify that every visible action maps to a real deterministic state transition or an honest unavailable/disabled state.
8. **Final report:** publish the journey coverage matrix, screenshots/traces, exact environment and build identity, results by role/industry/size, known gaps, connected-provider status, accessibility findings, safety invariant results and remaining blockers. Do not make a production-readiness claim from demo UI success.

## 6. Definition of a usable first release

The browser-based commerce interface is meaningfully usable only when:
- the ordinary landing surface explains what UNiCOM does and offers visible role/navigation entry points;
- a user can discover and traverse all 19 commerce journey families through the interface, including group buying, proactive opportunities, rent/borrow, multi-hop trades, merchant/procurement and no-RFID physical commerce;
- every critical task has real rendered UI, useful empty/pending/UNKNOWN/denied/error/success states and accessible controls;
- every state-changing action observes existing approvals, per-leg consent, idempotency and canonical commerce authority;
- demo, unavailable and truly connected integrations are unambiguously differentiated;
- visible browser evidence proves the journeys; unit tests and typed contracts alone are insufficient.

## 7. Required outcome reports

Each worker submits a completion report with branch and commit, owned paths, exact test commands/results, screenshots/traces, state-transition/evidence map, known gaps and deviations. TL updates the new state registry and accepts only after checking merged-lineage evidence. Use green ticks only for verified completion and mark missing UI/backend/credentials as blocked/absent—not complete.

## 8. Current disposition

Status: **AWAITING_OPERATOR_AUTHORIZATION**. All three work orders are ready as durable repo artifacts, but no implementation has been dispatched by this handoff. The immediate next action is the operator decision to authorize or decline building the rendered commerce UI. Production deployment, live mutations and human research remain separately gated.
