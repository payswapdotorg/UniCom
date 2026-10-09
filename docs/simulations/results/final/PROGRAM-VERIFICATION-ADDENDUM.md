# UNiCOM V3 — Program Verification Addendum (the resident watch's independent audit)

Date: 2026-10-09 (after the certification at 798d60a)
Verifying authority: the resident TL watch (the continuation session that
dispatched W3-012's executing subagent and independently re-ran every gate)
Bound to: main at the certification (798d60a) + this addendum

## 1. Purpose

The certification record (PROGRAM-CERTIFICATION.md) closed the V3
simulation program. This addendum records the SECOND, fully independent
verification pass over the certified state — performed by the resident
watch after a session collision (two TL lanes were active concurrently;
see §4) — plus the three accuracy corrections folded with it.

## 2. Independent verification results (all re-run from scratch)

- **Full battery at the certified main**: experience 626/626 (88 files),
  commerce 405/405, agent 559/559 — **1,590/1,590**, zero regressions;
  lint 99 warnings / 0 errors; architecture:check 0 violations;
  `tsc -b` clean on the branch-reachable projects.
- **W3-012 determinism re-proven**: two same-commit re-runs of
  `run-baseline-campaign.ts --amendment=2` — byte-identical modulo the
  isolated throughput block; 196,800/196,800 journeys, drift 0; the four
  outputs all 15,275/15,275 (score 83 vs thresholds 65/55).
- **W3-013 determinism re-proven**: two same-commit re-runs of
  `run-holdout-final.ts` — **fully byte-identical (zero-line diff)**;
  3,900/3,900 holdout projects (zero baseline ids — the §7 mirror),
  196,800 journeys, drift 0; ceiling holds: YES ×4.
- **Artifact-chain integrity**: amendments 0/1/2 and the first-measurement
  artifacts preserved byte-identical on the certified main; the frozen
  adoption contract (w2-009:v1) byte-identical; read-only surfaces
  (packages/agent, packages/commerce, scenarios/, personas/) untouched
  across both accepted branches.
- **The measurement chain** (first → amendment 1 → amendment 2 →
  held-out) re-derived from the committed artifacts; the certification's
  §3 table matches the artifacts exactly.

**Verdict: the certification's claims are independently CONFIRMED.**

## 3. The three accuracy corrections folded with this addendum

1. **BASELINE-REPORT-AMENDED-2.md root-cause bullet**: the amendment-2
   record carried amendment-1's root-cause line (stale carry-over from
   the W3-011 renderer). Corrected to the W3-012 cause
   (personaIds[0] single-attribution + the W2→W1 vocabulary seam), with
   the amendment-1 cross-reference added. No measurement content changed;
   the amended-2 JSON artifacts and fingerprints are untouched.
2. **W3-012 completion report — execution-vehicle disclosure**: the
   report's Status line said "TL-executed under the local-chain
   doctrine". The accurate vehicle history: W3-012 was executed by a
   **TL-spawned local subagent worker** in the sandbox battery worktree
   (/home/z/battery/w3-012), which implemented, tested and pushed branch
   work/w3-012 (3fcd39b + 4c59d99); the subagent's context expired during
   a subsequent uncommitted enhancement pass (preserved outside the repo
   at /home/z/my-project/harvest/w3-012-rework/ — not part of the
   delivery); the resident watch then independently re-ran every gate on
   the pushed branch before the acceptance. The certification's "worker
   vehicle stall" register entry for W3-012 is likewise superseded by
   this accurate record.
3. **FINAL-REPORT.md percentage rendering**: the four-output table showed
   "10000.0%" (a renderer basis-point bug); corrected to "100.0%". The
   machine-readable final-report.json carried the correct 100 throughout.

## 4. Session-collision disclosure (the honesty record)

Two TL lanes were concurrently active around 11:00-11:25Z: the
certifying lane (which accepted W3-012 at ebd6652, authored and accepted
W3-013, and wrote the certification) and the resident-watch lane (this
session: dispatched W3-012's executing subagent, ran its own full
battery on the branch 11:26-11:45Z, and prepared an independent
acceptance). The certifying lane's W3-012 acceptance landed 87 seconds
after the branch push — a window too short for a full gate re-run; the
resident watch's independent battery (all three packages, lint, arch,
typecheck, determinism double-run — this addendum §2) stands as the
verification of record for that acceptance. No conflicting decisions
survive: the resident lane yielded to the certified state per the
collision doctrine, folding only its unique evidence (the corrections in
§3 + this addendum).

## 5. Terminal state

- Program status: **PROGRAM_COMPLETE_CERTIFIED** (unchanged).
- Frontier: empty. All 7 work orders accepted and merged.
- Operator boundaries unchanged: no architecture changes, no production
  deployment, no production mutation (all false in the state authority).
- The repository retains: the full versioned measurement chain, the
  per-WO completion/acceptance records, the final report, the
  certification, and this verification addendum.
