# Operator Decision Brief — UNiCOM Deployment Authorization (Tier A/B/C)

**Date:** 2026-10-12
**Author:** the resident TL (under the standing delegation: "as the TL, make the right decisions keeping in mind the mission of Unicom" + the continuous-watch directive)
**Status:** DECISION-READY — no action taken; every standing gate remains 🔒 NOT_AUTHORIZED until the operator's explicit approval
**Inputs:** the W1-019 rehearsal artifact (`packages/experience/reports/deployment/deployment-readiness.json`, reproduced identically across two environments — inventory digest sha256:0a995049b259d00f) + the W2-020 operator surface (the System-surface Deployment-Readiness section) + `docs/UX-DEPLOYMENT.md` (the locked deployment architecture + tiers) + the merged battery 2,219|0 on 7113b0a

## 1. Problem

UNiCOM's deployment plane is now **rehearsal-proven but not deployed**: a deterministic deployable-bundle manifest (12 inventory entries, 12 capability declarations, all adapter-resolvable and replaceableWithoutDomainChanges), a non-live rehearsal that verifies 8/8 checks (assemble-twice determinism, capability coverage, config-surface classification, no-live-credentials, boot-smoke contract, INVARIANTS 51/52 provider-name isolation), and a visible operator surface. The remaining step — actually deploying any tier — is the operator's decision by standing gate. This brief makes that decision decision-ready.

## 2. Current evidence (TL-observed)

| Dimension | State |
|---|---|
| Bundle | 12 entries, digest sha256:0a995049b259d00f, reproducible across environments |
| Capabilities | 12/12 declared, adapter-pointed, all replaceable without domain changes |
| Config surface | 12 keys: 6 live-gated credentials (PAYMENT_BOUNDARY_PROVIDER_TOKEN, CONNECTOR_PROVIDER_TOKEN, DATABASE_URL, OBJECT_STORAGE_ENDPOINT, MODEL_GATEWAY_API_KEY, REALTIME_COORDINATION_ENDPOINT), 3 demo, 3 neutral — no credential value exists anywhere in the repo |
| Rehearsal | 8/8 checks PASS, exit 0, non-live (deploys nothing, connects nothing, reads nothing) |
| Battery | 2,219 passed \| 0 skipped (web 386 + experience 753 + agent 559 + commerce 521); lint 103w/0e; architecture 0; scoped tsc clean; zero-drift browser gate identical to the accepted baseline |
| Dist | the canonical Vite build is CI-green (the BUILD gate); the rehearsal inventory currently assembles from the source tree (the dist-shaped contract exists — the dist-hash integration is a small future lane, disclosed) |
| Standing gates | production deployment / live credentials / human research / live payments — all 🔒 NOT_AUTHORIZED |

## 3. The choices (per docs/UX-DEPLOYMENT.md's locked tiers)

### Tier A — Free prototype (non-commercial staging/demo)
- **What:** Vercel Hobby (where its terms permit) for non-commercial staging/demo; Cloudflare Workers/Workflows/Queues/Durable Objects; Neon; R2; Upstash; optional Apify.
- **Cost:** $0 (hobby/free tiers).
- **Fit:** the demo journeys, the operator's own observation, early connector rehearsal — all with DEMO fixtures, zero live credentials.
- **What it needs:** deployment credentials for the chosen free providers (a NEW credential class the operator must authorize + supply); the live-gated keys stay unset (demo mode).
- **Risks:** hobby-tier terms can restrict commercial use (already respected by scoping Tier A to non-commercial demo); free-tier limits are deployment observations, never domain semantics (INVARIANT-honored).

### Tier B — Commercial low-scale
- **What:** move the commercial frontend/SSR away from Vercel Hobby where its terms require; retain Cloudflare edge/orchestration, Neon, R2, Upstash as economical.
- **Cost:** low commercial spend.
- **Fit:** the first real merchant/buyer traffic.
- **What it needs:** Tier A proven first + commercial hosting credentials + the operator's production-deployment authorization.
- **Risks:** the first live-credential class enters the environment (the boundary map is already explicit per key); live payments remain a SEPARATE gate.

### Tier C — (the operator's future scaling tier)
- Per UX-DEPLOYMENT.md's tiers section; decision deferred until Tier B evidence exists.

## 4. Recommendation (with rationale)

**Recommend: authorize Tier A (non-commercial staging/demo) first, as a scoped approval**, because:
1. The rehearsal proves the bundle assembles + verifies deterministically — the remaining unknown is provider-side behavior, which only a real (non-commercial, demo-mode) deployment reveals.
2. Tier A requires NO live-payment, NO human-subject, and NO production-mutation authorization — it is the lowest-risk real-world step (demo fixtures only, the six live-gated keys stay unset).
3. The capability map is replaceableWithoutDomainChanges across all 12 kinds — a Tier-A-then-B migration path exists without domain rewrites (the provider-neutral adapter boundary, INVARIANTS 51/52).
4. The dist-hash integration (the disclosed source-vs-dist inventory gap) should land BEFORE or WITH the Tier A authorization so the deployed artifact is hash-verified end-to-end — a small lane (~½ day) the TL will dispatch on the operator's word.

**The exact approval needed (none granted by this brief):**
- ☐ Authorize Tier A non-commercial staging deployment (provider choice within the free set)
- ☐ Supply/authorize the deployment credentials class for the chosen free providers (keys enter the live-gated class, never the repo)
- ☐ Explicitly scope: DEMO fixtures only; live payments/payments/reservations/recourse remain 🔒; no human research
- Separately authorize (if desired, NOT required for Tier A): the dist-hash integration lane (the TL recommends bundling it).

## 5. Safe implementation plan (on approval)

1. The TL dispatches the dist-hash integration lane (W-lane: the runner assembles from the canonical built dist; the artifact carries the dist digest).
2. The TL dispatches a Tier-A deployment lane: provider configuration ONLY (deployment configuration — provider names never enter domain contracts), demo mode (the live-gated keys unset), with the boot-smoke verification against the deployed staging endpoint.
3. The TL battery verifies the staging endpoint serves the demo journeys; the operator observes via the replay console.
4. No lane ever touches payments/reservations/recourse; every step keeps the honest-evidence law.

**Mission rationale:** a rehearsal-proven bundle that has never met a real provider is still a demonstration; Tier A is the smallest real step that keeps every standing gate's spirit while making UNiCOM observable beyond the sandbox — the mission's "main interface for global commerce" needs eventually-real infrastructure, and this brief puts that decision in the operator's hands with the evidence to make it.
