/**
 * W2-020 + W2-022 — the committed deployment-readiness fixture.
 *
 * A frozen, committed MIRROR of the deployment-readiness.json artifact (W1-019
 * + W1-021). The browser never reads the filesystem at runtime; this fixture
 * is the data source for the System-surface "Deployment readiness" section
 * (the J15 `runtime-facts-fixture.ts` precedent).
 *
 * Kill switch: DEPLOYMENT_READINESS_SECTION_ENABLED. When false, the section
 * does not render (honest absence, no fake population).
 *
 * Provenance: this fixture mirrors the artifact at commit 210b8b9 (the TL-owned
 * REAL-dist evidence commit) — the rehearsal re-run on the FULL REAL
 * canonical-build CI manifest (run 38259561304, commit 29f037d — 6,204 files,
 * DIST_DETERMINISTIC_SHA256 71b03964e485824ad9881bfdf433d572dca35ba01b404d5327804653879798c7).
 * The values are real (never fabricated) — copied verbatim from
 * packages/experience/reports/deployment/deployment-readiness.json on the
 * tree at 210b8b9 (lineage b7ab4c0). The dist section's provenance.source
 * is now "ci-evidence" (the REAL CI evidence, not the fixture-labelled
 * snapshot). The dist digest is the manifest-derived digest
 * (sha256:0508acfe8e87a989); the CI's whole-output tar-discipline identity
 * (71b03964...) is recorded in the registry's real_ci_evidence.
 */
export const DEPLOYMENT_READINESS_FIXTURE = {
  generatedAt: "2026-10-12T14:53:38.280Z",
  lineage: {
    commit: "b7ab4c07f3edd6a039fe8964e0c176ad32e58b98",
    toolchain: "node v24.21.0",
  },
  bundle: {
    inventorySummary: {
      entryCount: 12,
      inventoryDigest: "sha256:3a8de191d6972b87",
      fileClasses: ["entrypoint", "contract-barrel", "runtime-module", "projection-module", "deployment-contract"],
    },
  },
  capabilities: [
    { kind: "edge-api", adapter: "./runtime/index.js -> CommerceKernel + api/server", replaceable: true },
    { kind: "durable-workflow", adapter: "./edge/local-commerce-edge.js", replaceable: true },
    { kind: "async-queue", adapter: "./edge/offline-queue-runtime.js", replaceable: true },
    { kind: "realtime-coordination", adapter: "./deployment/realtime.js", replaceable: true },
    { kind: "relational-store", adapter: "./runtime/kernel-state.js -> KernelState fold", replaceable: true },
    { kind: "object-evidence-storage", adapter: "./deployment/observability.js", replaceable: true },
    { kind: "cache", adapter: "./runtime-browser/index.js -> projection cache", replaceable: true },
    { kind: "browser-runtime", adapter: "./runtime-browser/index.js", replaceable: true },
    { kind: "local-merchant-edge", adapter: "./edge/local-commerce-edge.js", replaceable: true },
    { kind: "model-gateway", adapter: "./runtime/model-context-gate.js", replaceable: true },
    { kind: "observability", adapter: "./deployment/observability.js + rc-evidence.js", replaceable: true },
    { kind: "replaceable-compute", adapter: "./deployment/target-adapter.js", replaceable: true },
  ],
  configSurface: [
    { key: "NODE_ENV", classification: "neutral", notes: "Standard Node.js environment selector (production/development/test)" },
    { key: "PORT", classification: "neutral", notes: "HTTP listen port for the edge API server" },
    { key: "COMMERCE_KERNEL_CLOCK_SOURCE", classification: "demo", notes: "Deterministic clock source for the commerce kernel (DEMO: stepped clock; live: wall clock)" },
    { key: "PAYMENT_BOUNDARY_PROVIDER_TOKEN", classification: "live-gated", notes: "Provider credential for the payment boundary — LIVE-GATED: never present in demo or rehearsal" },
    { key: "CONNECTOR_PROVIDER_TOKEN", classification: "live-gated", notes: "Provider credential for connector adapters — LIVE-GATED: never present in demo or rehearsal" },
    { key: "DATABASE_URL", classification: "live-gated", notes: "Relational store connection string — LIVE-GATED: the rehearsal uses in-memory state" },
    { key: "OBJECT_STORAGE_ENDPOINT", classification: "live-gated", notes: "Object storage endpoint for evidence artifacts — LIVE-GATED" },
    { key: "MODEL_GATEWAY_API_KEY", classification: "live-gated", notes: "API key for the model gateway — LIVE-GATED: the rehearsal does not call any model provider" },
    { key: "REALTIME_COORDINATION_ENDPOINT", classification: "live-gated", notes: "Realtime coordination service endpoint — LIVE-GATED" },
    { key: "BROWSER_RUNTIME_HEADLESS", classification: "demo", notes: "Whether the browser runtime runs headless (DEMO: true in test; configurable in deployment)" },
    { key: "DEMO_FIXTURES_ID", classification: "demo", notes: "The committed demo fixtures identifier (DEMO-labelled on-surface)" },
    { key: "JOURNAL_BACKUP_PATH", classification: "neutral", notes: "Path for journal backup/restore (filesystem path, no credential)" },
  ],
  verification: [
    { check: "inventory-completeness", result: "PASS" },
    { check: "hash-determinism", result: "PASS" },
    { check: "capability-coverage", result: "PASS" },
    { check: "capability-replaceability", result: "PASS" },
    { check: "config-surface-classification", result: "PASS" },
    { check: "no-live-credentials", result: "PASS" },
    { check: "boot-smoke-contract", result: "PASS" },
    { check: "no-provider-names-in-contract", result: "PASS" },
    { check: "dist-manifest-completeness", result: "PASS" },
    { check: "dist-digest-deterministic", result: "PASS" },
    { check: "source-dist-cross-check", result: "PASS" },
  ],
  dist: {
    mode: "ci-evidence-manifest",
    digest: "sha256:0508acfe8e87a989",
    fileCount: 6204,
    provenance: {
      source: "ci-evidence" as "ci-evidence" | "dist-root-walk" | "committed-fixture" | "source-only",
      lineage: "b7ab4c07f3edd6a039fe8964e0c176ad32e58b98",
    },
  },
  nonLive: true,
  standingGatesNote: "Standing gates bind: production deployment NOT_AUTHORIZED, live credentials NOT_AUTHORIZED, live providers NOT_AUTHORIZED. This rehearsal deploys NOTHING, connects NOTHING, reads NO credential.",
} as const;

/** The kill switch for the Deployment readiness section. */
export const DEPLOYMENT_READINESS_SECTION_ENABLED = true;

/** The standing-gates status (honest, always rendered when the section renders). */
export const STANDING_GATES = [
  { gate: "Production deployment", status: "🔒 NOT_AUTHORIZED" },
  { gate: "Live named-provider credentials", status: "🔒 NOT_AUTHORIZED" },
  { gate: "Human research", status: "🔒 NOT_AUTHORIZED" },
  { gate: "Live payments", status: "🔒 NOT_AUTHORIZED" },
] as const;
