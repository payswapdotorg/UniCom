# Full-campaign evidence inputs (W1-010)

- `campaign-full-schedule-surface.json` — the harvest's schedule surface
  (committed): schedule (3,900 projects, persona roster factored per firm),
  the regenerated report's reconciliation blocks, harvest meta + reproduction
  proof.
- `campaign-full-records.jsonl` — 48,300 projected journey-evidence records
  (one per line; consumed fields verbatim + per-record `fullRecordSha256`
  binding to the full unprojected record). **Kept on disk, not committed**
  (75 MB): the file's sha256 is recorded in
  `../certification-report.json` (`source.evidenceSha256` + integrity
  before/after), binding the committed certification to these exact bytes.
  Regenerate byte-identically inside a `work/w3-010` checkout (code at the
  recorded buildCommit `80fd2f9`, full-run report as committed at main
  `7f52ac4`):
  ```
  git fetch https://github.com/payswapdotorg/UniCom.git work/w3-010:w3-evidence
  git worktree add ../unicom-w3-evidence w3-evidence
  # overlay the full-run committed report (committed at main 7f52ac4):
  git -C .. show main:docs/simulations/campaign/baseline-report.json \
    > ../unicom-w3-evidence/docs/simulations/campaign/baseline-report.json
  cd ../unicom-w3-evidence && pnpm install --frozen-lockfile
  cp <this-dir>/../harvest-script.ts scripts/sim/harvest-w1-010-evidence.ts
  npx tsx scripts/sim/harvest-w1-010-evidence.ts --sample-mode=full
  # → harvest-out/campaign-full-records.jsonl (sha256 must match source.evidenceSha256)
  ```
- `baseline-report.json` / `baseline-report.slim.json` — verbatim copies of
  the W3-010 committed full-campaign report (the certification's
  cross-verification authority).
- `../harvest-script.ts` — the preserved harvest script.
