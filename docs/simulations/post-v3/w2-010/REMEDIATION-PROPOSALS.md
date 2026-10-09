# W2-010 Remediation Proposals — severity-ranked

Work order: W2-010 · Register: `FAILURE-REGISTER.md` (0 failures; 5 findings)
These proposals address the FINDINGS (not failures) and the structural gaps
the runs surfaced. None loosen a frozen contract; none alter the architecture.

## P1 — (HIGH, structural) Enable the browser-labelled dimension: a rendered host UI for the experience plane

**Finding:** F-2 (structural). Every resilience result is fixture-contract
evidence; the browser-labelled dimension cannot exist until the commerce
surfaces are rendered.
**Proposal:** The operator decision W1-010 documented — build (or decline) a
rendered host UI for the experience-plane surfaces. Once it exists: re-run the
63-scenario matrix through the W1-010 browser runner format (the evidence
schema extension is already compatible), asserting the same oracles through
visible interactions. **Owner: operator (product-scope decision).**

## P2 — (MEDIUM) Rendered-UI state vocabulary must include preserved non-failure states

**Findings:** F-3 (OVERDUE preserved), F-5 (global halt), F-4 (supersede marker).
**Proposal:** When the rendered commerce UI is designed, its state vocabulary
must distinguish: preserved non-failure states (OVERDUE, ATTEMPTED delivery,
settlement UNKNOWN, NOT_PROMOTED_UNKNOWN) from terminal failures; the global
autonomy halt banner (one reason, all actions) from per-action denials; and
the `duplicate-superseded` sync marker from positional replacement. The typed
contracts already carry all of these — the UI must render them, not flatten
them. **Owner: the rendered-UI work program (post-P1).**

## P3 — (LOW) Availability band configurability review

**Finding:** F-1 (the F07-S01 band correction). The storefront availability
band (`<=5` low-stock) is currently a view-constructor constant in the test
surface; a real storefront will want per-SKU/per-channel bands (e.g. weighted
by velocity). **Proposal:** when the rendered storefront exists, make the band
a merchant-configurable projection input (still deterministic, still
canonical-truth-driven). **Owner: the rendered-UI work program (post-P1).**

## P4 — (LOW) Chargeback + refund-cap visibility in the payments view

**Finding:** F09-S05 — the refund cap holds exactly (W1-004 law), and the
chargeback journals separately. A rendered payments view should show
`refundedTotalFor` against `capturedTotalFor` per payment so operators can see
the remaining refundable headroom before attempting an action that will be
refused. **Owner: the rendered-UI work program (post-P1).**

## Not proposed (explicitly)

- No changes to the kernel, policy engine, connector runtime, queue runtime or
  weighted runtime: zero failures, zero invariant violations across 63
  scenarios — nothing to remediate in the product core.
- No test-only weakening: the F07-S01 correction was a draft-expectation bug,
  not a product accommodation; the band and the oracle were untouched.
