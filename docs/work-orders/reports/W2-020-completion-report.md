# W2-020 — Deployment Readiness II: the Operator Surface (the System-surface Deployment-Readiness Section)

**Phase:** Deployment Readiness (the deployment-coverage layer), tracking issue #17
**Branch:** `work/w2-020` (from `6ad85e6`)
**Lane:** Web host — the discoverable-UX step for the deployment readiness
**Write surface held:** `packages/web/src/commerce-host/shell/fixtures/deployment-readiness-fixture.ts` (NEW), `packages/web/src/commerce-host/shell/surfaces/SystemSurface.tsx` (modified — ADD section), `packages/web/src/commerce-host/shell/SystemSurface.test.tsx` (NEW), this report.

## 1. BRANCH

`work/w2-020` @ `<final SHA>` (pushed: yes)

## 2. FIXTURE PROVENANCE RECORD

The committed fixture (`deployment-readiness-fixture.ts`) mirrors the artifact produced by `node packages/experience/scripts/deployment-rehearsal.mjs` at commit `6461a41` (W1-019's lineage). The values are real (never fabricated). The fixture is a frozen `as const` object — the browser never reads the filesystem at runtime (the J15 `runtime-facts-fixture.ts` precedent). Kill switch: `DEPLOYMENT_READINESS_SECTION_ENABLED` — when false, the section does not render (honest absence, no fake population).

## 3. SECTION SELF-AUDIT

| Requirement | How the section holds it |
|---|---|
| Renders ONLY from the committed fixture | Kill-switched: `DEPLOYMENT_READINESS_SECTION_ENABLED && DEPLOYMENT_READINESS_FIXTURE` — absent fixture → section does not render |
| Every capability kind renders with adapter + replaceable guarantee | 12 capabilities rendered with `data-testid="cm-capability-replaceable"` chips (all "replaceable") |
| Config surface renders classification (demo\|live-gated\|neutral) | 12 keys rendered with `data-testid="cm-config-classification"` chips; live-gated keys use `cm-chip-warn` class |
| Verification results render per check (honest FAIL rendering) | 8 checks rendered with PASS/FAIL chips; a FAIL would render `cm-chip-err` |
| Standing gates render true status | 4 gates rendered: production deployment 🔒 NOT_AUTHORIZED; live named-provider credentials 🔒 NOT_AUTHORIZED; human research 🔒 NOT_AUTHORIZED; live payments 🔒 NOT_AUTHORIZED |
| Non-live note renders | `data-testid="cm-non-live-note"` with "deploys NOTHING, connects NOTHING, reads NO credential" |
| DEMO-labelled | `cm-demo-tag` on the section header |
| J18 ABSENT-by-design untouched | `host-states` not modified |

## 4. VERIFICATION (personally run, exact output)

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @zcode/web exec vitest run` | **386 passed** — baseline 378 + 8 net-new |
| Scoped tsc | `tsc -p tsconfig.scoped.json` | **EXIT 0** (clean) |
| Lint | `pnpm lint` | **103 warnings / 0 errors** — identical to baseline |
| Architecture | `pnpm architecture:check` | **0 violations** |

## 5. HONEST GAPS

1. No browser lane evidence (sandbox has no browser); vitest coverage proves the section renders from the fixture.
2. The fixture is a committed mirror (not a live import from `@unicom/experience`) — the web graph never imports the experience package (forbidden).
3. `corepack` shim (same as prior lanes).

## 6. BOUNDARIES HELD

- ZERO modifications to `packages/experience/**`, `packages/commerce/**`, `host-states/**`.
- ZERO imports of `@unicom/experience` into the web graph.
- ZERO runtime fs/network reads.
- Token never committed. Pushed only to `work/w2-020`.
