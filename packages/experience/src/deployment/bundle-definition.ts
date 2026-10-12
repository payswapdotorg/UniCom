/**
 * W1-019 — the deployable-bundle definition.
 *
 * Pure data + types: the deterministic dist inventory contract, the
 * capability declarations (one per DeploymentCapabilityKind), the
 * configuration-surface inventory (every env/config key classified), and
 * the lineage identity. No fs reads at definition time — the runner injects
 * the built output.
 *
 * INVARIANTS 51/52: NO provider names in domain contracts. Provider names
 * appear only in deployment configuration at runtime.
 */
import type { DeploymentCapabilityKind } from "./provider-adapter.js";

// --- Inventory contract ---

/** File class (deterministic categories — the build gate's established discipline). */
export type BundleFileClass =
  | "entrypoint"
  | "contract-barrel"
  | "runtime-module"
  | "projection-module"
  | "deployment-contract"
  | "test-support"
  | "configuration";

/** One dist inventory entry (file class + deterministic hash). */
export interface BundleInventoryEntry {
  readonly fileClass: BundleFileClass;
  readonly path: string;
  /** Deterministic content hash (the build gate's hashing discipline). */
  readonly digest: string;
}

/** The dist inventory contract (every file class + the deterministic-hash rule). */
export interface BundleInventory {
  readonly entries: readonly BundleInventoryEntry[];
  /** The deterministic digest of the whole inventory (hash of sorted entry digests). */
  readonly inventoryDigest: string;
}

// --- Capability declarations ---

/** One capability declaration (per DeploymentCapabilityKind). */
export interface CapabilityDeclaration {
  readonly kind: DeploymentCapabilityKind;
  /** Provider-neutral adapter pointer (import-resolvable or symbol-citable). */
  readonly adapterPointer: string;
  /** The replaceableWithoutDomainChanges guarantee (always true — INVARIANTS 51/52). */
  readonly replaceableWithoutDomainChanges: true;
  /** Human-readable description of what this capability provides. */
  readonly description: string;
}

/** All capability declarations (one per DeploymentCapabilityKind — 12 kinds). */
export interface CapabilityDeclarationSet {
  readonly declarations: readonly CapabilityDeclaration[];
}

// --- Configuration surface ---

/** Classification of a config/env key (the secrets boundary made explicit). */
export type ConfigClassification = "demo" | "live-gated" | "neutral";

/** One configuration-surface entry. */
export interface ConfigSurfaceEntry {
  readonly key: string;
  readonly classification: ConfigClassification;
  readonly notes: string;
}

/** The full configuration-surface inventory. */
export interface ConfigSurface {
  readonly entries: readonly ConfigSurfaceEntry[];
}

// --- Lineage identity ---

/** The bundle's lineage identity (commit + artifact digests). */
export interface BundleLineage {
  readonly commit: string;
  readonly generatedAt: string;
  readonly toolchain: string;
}

// --- The deployable-bundle definition (pure data, no fs reads) ---

/** The full deployable-bundle definition. */
export interface DeployableBundleDefinition {
  readonly lineage: BundleLineage;
  readonly inventory: BundleInventory;
  readonly capabilities: CapabilityDeclarationSet;
  readonly configSurface: ConfigSurface;
}

// --- The capability declarations (static — one per DeploymentCapabilityKind) ---

export const CAPABILITY_DECLARATIONS: readonly CapabilityDeclaration[] = [
  { kind: "edge-api", adapterPointer: "./runtime/index.js -> CommerceKernel + api/server", replaceableWithoutDomainChanges: true, description: "Global API endpoints — the commerce kernel's typed command surface exposed over HTTP" },
  { kind: "durable-workflow", adapterPointer: "./edge/local-commerce-edge.js", replaceableWithoutDomainChanges: true, description: "Long-running jobs that survive restarts — the LocalCommerceEdge's exactly-once replay" },
  { kind: "async-queue", adapterPointer: "./edge/offline-queue-runtime.js", replaceableWithoutDomainChanges: true, description: "Background processing of events and connectors — the offline observation queue" },
  { kind: "realtime-coordination", adapterPointer: "./deployment/realtime.js", replaceableWithoutDomainChanges: true, description: "Live sessions and live channels — the realtime coordination contract" },
  { kind: "relational-store", adapterPointer: "./runtime/kernel-state.js -> KernelState fold", replaceableWithoutDomainChanges: true, description: "Commerce records database — the kernel's authoritative state fold" },
  { kind: "object-evidence-storage", adapterPointer: "./deployment/observability.js", replaceableWithoutDomainChanges: true, description: "Media and evidence artifacts — the journal-chain + observability projector" },
  { kind: "cache", adapterPointer: "./runtime-browser/index.js -> projection cache", replaceableWithoutDomainChanges: true, description: "Fast access to hot state — the projection engine's read-model cache" },
  { kind: "browser-runtime", adapterPointer: "./runtime-browser/index.js", replaceableWithoutDomainChanges: true, description: "Runs browser connectors outside request handlers — the browser-safe sub-entrypoint" },
  { kind: "local-merchant-edge", adapterPointer: "./edge/local-commerce-edge.js", replaceableWithoutDomainChanges: true, description: "Runs on the merchant's own hardware — the LocalCommerceEdge runtime" },
  { kind: "model-gateway", adapterPointer: "./runtime/model-context-gate.js", replaceableWithoutDomainChanges: true, description: "Access to AI models — the model-context gate (the only path toward model context)" },
  { kind: "observability", adapterPointer: "./deployment/observability.js + rc-evidence.js", replaceableWithoutDomainChanges: true, description: "Task/run/evidence trail — the RC evidence emitter + observability projector" },
  { kind: "replaceable-compute", adapterPointer: "./deployment/target-adapter.js", replaceableWithoutDomainChanges: true, description: "Swappable execution tiers — the deployment target adapter interface" },
];

// --- The configuration-surface inventory (static — every key classified) ---

export const CONFIG_SURFACE_ENTRIES: readonly ConfigSurfaceEntry[] = [
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
];

// --- W1-021 (additive): the DIST inventory contract ---

/**
 * Dist file classes (the canonical build's output categories).
 *
 * W3-023 (additive): the four new classes (`wasm-module`, `audio-asset`,
 * `data-asset`, `text-asset`) close the REAL-CI-evidence finding — the
 * canonical build's dist contains .wasm (the docx + duke_sheets wasm
 * modules), .mp3 (task-notification-pop), .bcmap (pdfjs cmaps — 168 files),
 * and .md (THIRD-PARTY-NOTICES). The existing 5 classes' semantics are
 * unchanged (additive only); SOURCE_TO_DIST_CLASS_MAP is unchanged (the new
 * classes are dist-only artifact classes; no source class maps to them
 * additionally — they join the inventory as legitimate dist outputs).
 */
export type DistFileClass =
  | "html-entrypoint"
  | "js-entrypoint"
  | "css-asset"
  | "static-asset"
  | "map-artifact"
  | "wasm-module"
  | "audio-asset"
  | "data-asset"
  | "text-asset";

/** One dist inventory entry (classified file + sha256 digest). */
export interface DistInventoryEntry {
  readonly fileClass: DistFileClass;
  readonly path: string;
  /** sha256 hex digest (exactly as sha256sum emits). */
  readonly digest: string;
}

/** The dist inventory (classified entries + the deterministic dist digest). */
export interface DistInventory {
  readonly entries: readonly DistInventoryEntry[];
  /** The deterministic digest of the whole dist (hash of sorted path:digest lines). */
  readonly distDigest: string;
}

/** The manifest line format: `<sha256hex>  ./<relative-path>` (exactly as `sha256sum` + `sort -k2` emits). */
export interface DistManifestLine {
  readonly digest: string;
  readonly path: string;
}

/** The dist assembly mode (how the dist inventory was gathered). */
export type DistAssemblyMode = "ci-evidence-manifest" | "dist-root" | "source-only";

/** The dist section of the artifact (additive — absent in W1-019's artifact). */
export interface DistSection {
  readonly mode: DistAssemblyMode;
  readonly digest?: string;
  readonly fileCount?: number;
  readonly provenance: {
    readonly source: "ci-evidence" | "dist-root-walk" | "committed-fixture" | "source-only";
    readonly reason?: string;
    readonly lineage?: string;
  };
}

/** The source→dist class mapping (every entrypoint-class source entry maps to ≥1 dist class). */
export const SOURCE_TO_DIST_CLASS_MAP: readonly { readonly sourceClass: BundleFileClass; readonly distClasses: readonly DistFileClass[] }[] = [
  { sourceClass: "entrypoint", distClasses: ["html-entrypoint", "js-entrypoint"] },
  { sourceClass: "contract-barrel", distClasses: ["js-entrypoint"] },
  { sourceClass: "runtime-module", distClasses: ["js-entrypoint"] },
  { sourceClass: "projection-module", distClasses: ["js-entrypoint"] },
];

/** Classify a dist file path into a DistFileClass (returns null if unclassifiable). */
export function classifyDistFile(path: string): DistFileClass | null {
  if (path.endsWith(".html") || path.endsWith(".htm")) return "html-entrypoint";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "js-entrypoint";
  if (path.endsWith(".css")) return "css-asset";
  if (path.endsWith(".map")) return "map-artifact";
  // W3-023 (additive): the four new dist-only artifact classes.
  if (path.endsWith(".wasm")) return "wasm-module";
  if (/\.(mp3|wav|ogg)$/.test(path)) return "audio-asset";
  if (/\.(bcmap|dat|bin)$/.test(path)) return "data-asset";
  if (path.endsWith(".md") || path.endsWith(".txt")) return "text-asset";
  // Static assets: images, fonts, icons, etc.
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf|json|webmanifest)$/.test(path)) return "static-asset";
  return null;
}
