# W2-010 Failure Register — Resilience Runs (fixture-contract)

Work order: W2-010 · Matrix: `resilience-matrix.v1.json` (11 families / 63 scenarios) · Results: `resilience-results.v1.json`
Evidence level: **fixture-contract** (real product runtimes driven through typed view contracts; NOT real-browser evidence — see the caveat register)

## Denominator

```
planned = executed + blocked + skipped = ΣbyOutcome
63      = 63        + 0       + 0      = 63        (zero drift)
byOutcome: pass=63  fail=0  blocked=0  absent=0  unknown=0  aborted=0  skipped=0
```

## Failures

**None.** All 63 scenarios landed in their expected result class (21
expected-success scenarios completed their allowed paths; 42 expected-block
scenarios were blocked/denied with the typed, deterministic reasons the oracle
specified). Every invariant verdict recorded in `resilience-results.v1.json`
holds.

## Findings + corrections (disclosed, non-failures)

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | **F07-S01 draft-expectation correction (inherited from the predecessor's untracked draft):** the draft asserted `low-stock` for an on-hand of 6, but the storefront availability band (the adapter's own view definition: `<=5` low-stock, `>5` in-stock) puts 6 in `in-stock` — and the draft's own second assertion ("6 units available" note) was the in-stock branch's wording, i.e. internally inconsistent. The frozen oracle requires "availability reflects the real count", which the exact-count note + correct band satisfy. The TEST expectation was corrected (not the product, not the band, not the oracle). | Low (draft defect, corrected pre-merge) | Corrected + disclosed in the completion report §5; the correction is visible in the test's comment |
| 2 | **The browser-labelled dimension is structurally unavailable this phase:** W1-010's pilot established (with real-browser evidence) that the commerce experience surfaces have no rendered UI — so "GUI-visible" in this delivery means the typed view contracts a rendered UI WOULD consume (view states, decision cards, typed refusal reasons, run presentations). Every result is labelled `fixture-contract`; nothing here implies real-browser evidence. | Structural (environment) | Disclosed on every record + in the results caveat; browser-labelled reruns are the follow-up once a rendered commerce UI exists |
| 3 | **Rental OVERDUE is a preserved state, not an error** — confirmed against the real lifecycle table (F08-S02): a late return remains possible (`OVERDUE → RETURNED → COMPLETED`), so the UI must present OVERDUE as a status with recourse, never as a terminal failure. | Info (product-behavior confirmation) | Recorded for the rendered-UI follow-up: the run presentation vocabulary must include the preserved non-failure states |
| 4 | **Supersede ordering in the offline queue:** a re-scanned observation supersedes its logical key but drains in its RE-scan arrival position (not the original slot) — `duplicate-superseded` marks the old entry, the handoff carries exactly one live entry per logical key (F10-S01). | Info (product-behavior confirmation) | Recorded: a rendered sync UI should surface the supersede marker, not assume positional replacement |
| 5 | **The autonomous halt is global and reason-uniform** (F11-S01): a tripped stop condition DENIES every proposal kind with the same single reason `STOP_CONDITION_TRIGGERED`; recovery re-evaluates on the merits (no silent auto-resume). | Info (product-behavior confirmation) | Recorded for the rendered autonomous-store surface: one global halt banner, per-action reasons only after recovery |
