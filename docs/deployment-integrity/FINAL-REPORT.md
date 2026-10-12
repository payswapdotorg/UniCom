# Deployment Integrity — Phase Final Report

**Phase:** Deployment Integrity (the deployment plane's hash-chain completion — the dist-hash integration, non-live)
**Registry:** `docs/development-state/deployment-integrity-state.json` · **Tracking issue:** #18 (closed at closeout)
**Span:** 2026-10-12 13:07Z (activation ed72c34) → 15:2xZ (closeout) — pure work time ~2h20m across 4 lanes + the TL-owned evidence step
**Outcome:** PHASE_COMPLETE_ALL_GATES_PASSED (8/8)

## 1. What was delivered

The phase-IV disclosed deviation ("the contract is dist-shaped, the assembly input is source") is CLOSED with real evidence: the deployment rehearsal now consumes the **canonical build's own CI evidence manifest** (the per-file SHA-256 text the BUILD-ONLY workflow already uploads — the dist itself is never uploaded, never committed, never built locally per the memory law), classifies every file against a now-complete 9-class dist contract, verifies determinism + the source↔dist cross-check, and records the end-to-end hash chain in the committed artifact.

**The end-to-end hash chain is machine-verified against the REAL canonical build**: source inventory (`sha256:3a8de191d6972b87` at b7ab4c0) → dist manifest (6,204 files / 137,303,600 bytes, CI run 38259561304, commit 29f037d, memory floor 10,831 MB) → bundle verification (11/11 PASS, zero unclassifiable). Both dist identities are recorded: the manifest-derived digest (`sha256:0508acfe8e87a989`, in the artifact) + the CI's whole-output tar-discipline digest (`71b03964e485824ad…`, in the registry).

The operator's System surface now shows the real dist truth: the **DIST IDENTITY** row (CI-EVIDENCE chip) + the **END-TO-END HASH CHAIN** row (CHAIN VERIFIED chip) — browser-captured 5/5, zero console errors.

## 2. The lanes

| Lane | Delivery | Merge | Battery |
|---|---|---|---|
| W1-021 — the dist contract + the manifest-assembly engine + the runner modes + the committed fixture | 4d3a9bd (one commit) | 29f037d | experience 772/772 (753+19); both runner modes green; typecheck 0; lint 103w/0e; arch 0 |
| W2-022 — the operator surface rows (dist identity + hash chain) | 0e1fa69 → fix 72487ac (one changes-requested round) | 1701f0c | web 392/392 (386+6); scoped tsc 0; lint/arch green; mirror fidelity ALL VERBATIM |
| W3-023 — the contract completeness fix (the real-evidence finding) | f05e72c (one commit, zero deviations) | b7ab4c0 | experience 783/783 (772+11); all three runner modes green incl. the real-dist regression fixture |
| W4-024 — the fixture-mirror update (the real CI evidence on the surface) | 2f069fa (one commit, zero deviations) | c48edb5 | web 392/392; scoped tsc 0; programmatic mirror fidelity 6/6 VERBATIM vs the 210b8b9 artifact |

Merged-tree battery at closeout: **web 392 + experience 783 + commerce 521 + agent 559 = 2,255 passed | 0 skipped** — the program's largest; lint 103w/0e; architecture 0/0/0; both scoped typechecks clean.

## 3. The phase's defining event — the honest-failure loop on REAL data

The TL_ACCEPT step ran the rehearsal against the REAL 6,204-file CI manifest immediately after the W1-021 merge: `dist-manifest-completeness` **FAILED honestly** (exit 1, every file named) — 172 unclassifiable files (168 pdfjs `.bcmap` + 2 `.wasm` + 1 `.mp3` + 1 `THIRD-PARTY-NOTICES.md`). The root cause was attributed honestly to the ACTIVATION ORDER (the TL under-derived the file-class list), not the worker. W3-023 closed the gap in one lane; the re-run on the full real manifest passed 11/11. **This is the first REAL-data verification in the program** — the fixtures proved the engine; only the real evidence could surface the contract gap. The loop (finding → attribution → fix → re-run PASS) executed entirely within the phase.

The second real catch: the W2-022 first delivery's fixture carried a **non-reproducing claimed-real digest** (`087a65de…` — matched no artifact state) + a stale timestamp. The TL's independent reproduction (the same tree, the same command → `356ec586…`) caught it; the changes-requested round fixed both values verbatim in 9 minutes. The mirror-fidelity check is now programmatic (fixture == artifact, value by value).

## 4. Honest limitations (preserved verbatim in spirit)

1. **The four W1-021 recorded deviations** (in the merge message 29f037d): the runner's manifest-mode determinism check re-hashes the same in-memory array (the honest two-assembly proof lives in the .ts engine + tests — the W1-019 inlined-runner class); unparseable manifest lines are silently dropped (the machine-generated CI manifest mitigates); the dist-root runner mode hardcodes its completeness PASS (untested — no dist dir exists in the sandbox); the artifact's dist digest is the manifest-derived digest, not the CI's tar-discipline whole-output digest (both are now recorded, each labelled).
2. **The W2-022 changes-requested round** — the mirror-fidelity defect + the fix; and the invocation-config discovery: the W2-022 order's acceptance line mis-specified the full tsconfig (which fails on pre-existing experience-package extensionless imports under node16 — 241 error lines on main, TL-verified pre-existing); the correct scoped config (`tsconfig.scoped.json`) is the W2-020-era form; the order error is the TL's.
3. **The agent-build accommodation quirk**: `tsc -p packages/agent` exits 2 on PRE-EXISTING W2-002-era test-file type errors (scripted-model.ts TS2339s — zero lane touches) while still emitting the dist that makes the experience typecheck clean. Documented; not fixed (out of every lane's surface).
4. **The fixture-snapshot relationship**: the committed fixture is a frozen mirror of the artifact at 210b8b9; the artifact's `generatedAt`/lineage fields drift per regeneration BY DESIGN (the reproducibility proof depends on it) — a future artifact regeneration makes the fixture a snapshot again (honestly labelled by its provenance note). The regression fixture's one non-CI-verbatim `.js` line is explicitly disclosed in its header (needed for the cross-check's js-entrypoint mapping).
5. **The dispatch fights**: W1-021 landed cycle 1, W2-022 cycle 1, the changes-requested cycle 0 (after a 5-round capacity-popup edge wall), W3-023 cycle 0, W4-024 cycle 0 — the §8 pre-flight law held across all five (vs the 4-cycle fight when skipped, the W1-019 record). The stop/continue endpoints showed two transient read-timeout slowness windows (tolerated; the stop 200-true is the closure event, the 410 the double-check).
6. **The memory-war window**: the platform (console + ring + machines) was paused for the browser gates ~15:03→15:14Z (~11 min, the operator's window dark — disclosed here; restored via deploy.sh, all machines verified live after).
7. **The machine-launch incident**: the first W1-021 landing-machine dfork invocation was malformed (the logfile argument omitted) and the crash traceback appended to the machine file; caught immediately (the machine's own SyntaxError), truncated back to the committed content (verified: syntax OK + git diff clean), relaunched correctly. No evidence lost.

## 5. Standing gates (unchanged, verified this phase)

- Production deployment 🔒 NOT_AUTHORIZED (Tier A decision brief still awaits the operator — its checkboxes remain unchecked)
- Live named-provider credentials 🔒 NOT_AUTHORIZED
- Human research 🔒 NOT_AUTHORIZED
- Live payments 🔒 NOT_AUTHORIZED
- The BUILD-ONLY CI law held verbatim: zero `.github/**` changes; the dist never uploaded, never committed, never built locally.
- Payments/reservations/recourse never auto-created (no commerce changes at all this phase).

## 6. Frontier (the next roadmap step)

The deployment plane is now hash-verified end-to-end against the real canonical build. The repo's frontier: (a) **the Tier A authorization decision** (the operator's — the brief is ready, now with the dist-hash chain complete); (b) if authorized, the staging deployment lane inherits the verification for free; (c) absent authorization, the next make-it-real plane derives from the repository at the next resident-watch iteration. The watch continues.
