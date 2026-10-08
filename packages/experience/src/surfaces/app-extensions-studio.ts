/**
 * W1-008 App-Extensions Studio surface (closes the discoverable-UX + impl
 * rung for matrix rows `app-extension-ecosystem`, `ai-generated-apps-
 * workflows`, and `agent-generated-business-tools`).
 *
 * This surface contract renders against the existing `app-extensions`
 * navigation surface (`NAVIGATION_SURFACES`), the existing
 * `app-extensions` surface-state manifest, and the existing intent alias
 * `build me a tool`. It adds the typed view contracts that the surface
 * renders — the surface itself is NOT new (W1-007 lane law: discoverability
 * via existing surface contracts; no new surface kinds).
 *
 * Laws:
 * - The view is a PROJECTION of `@unicom/commerce` domain state — never a
 *   second source of truth (W1-007 §truth distinctions: projections are
 *   disposable, rebuildable).
 * - Third-party content is untrusted data (INVARIANT 26): display strings
 *   are inert; no inline code; no trusted instructions.
 * - AI-generated app/tool requests display their state explicitly so the
 *   human-approval gate is visible (AGENTS rule 1: agents propose, never
 *   mutate truth).
 */
import type {
  AgentGeneratedToolRequest,
  AiGeneratedAppRequest,
  AiGeneratedAppRequestState,
  AppExtension,
  AppExtensionInstall,
} from "@unicom/commerce";
import type { UtcIso8601String } from "../common/values.js";

/** One row in the installed-apps list. */
export interface AppExtensionRow {
  readonly appExtensionId: string;
  readonly displayName: string;
  readonly state: AppExtension["state"];
  readonly requestedPermissions: readonly string[];
  readonly grantedPermissions: readonly string[];
  readonly installId?: string;
  readonly installedAt?: UtcIso8601String;
  /** Why a permission was rejected — never silent. */
  readonly permissionNotes: readonly string[];
}

/** One row in the AI-generated app/tool request queue. */
export interface AiGeneratedAppRequestRow {
  readonly requestId: string;
  readonly origin: AiGeneratedAppRequest["origin"];
  readonly ask: string;
  readonly state: AiGeneratedAppRequestState;
  readonly hasSimulation: boolean;
  readonly simulationSummary?: string;
  readonly installedAppExtensionId?: string;
  /** Whether the human-approval gate is currently satisfiable. */
  readonly approvalReady: boolean;
}

/** The App-Extensions Studio view contract. */
export interface AppExtensionsStudioView {
  readonly installed: readonly AppExtensionRow[];
  readonly pendingRequests: readonly AiGeneratedAppRequestRow[];
  /** Plain-language suggestions surfaced when the list is empty. */
  readonly suggestions: readonly string[];
}

/**
 * Build the studio view from typed domain state. Pure projection —
 * rebuildable from the evidence journal; never a second source of truth.
 */
export function buildAppExtensionsStudioView(input: {
  readonly extensions: readonly (AppExtension & { install?: AppExtensionInstall })[];
  readonly requests: readonly AiGeneratedAppRequest[];
}): AppExtensionsStudioView {
  const installed: AppExtensionRow[] = input.extensions.map((ext) => ({
    appExtensionId: ext.appExtensionId,
    displayName: ext.displayName,
    state: ext.state,
    requestedPermissions: ext.requestedPermissions,
    grantedPermissions: ext.grantedPermissions,
    installId: ext.install?.installId,
    installedAt: ext.install?.installedAt as UtcIso8601String | undefined,
    permissionNotes: ext.requestedPermissions
      .filter((p) => !ext.grantedPermissions.includes(p))
      .map((p) => `${p}: not granted (human review required)`),
  }));
  const pendingRequests: AiGeneratedAppRequestRow[] = input.requests.map((r) => ({
    requestId: r.requestId,
    origin: r.origin,
    ask: r.ask,
    state: r.state,
    hasSimulation: r.simulatedArtifact !== undefined,
    simulationSummary: r.simulatedArtifact?.simulationSummary,
    installedAppExtensionId: r.installedAppExtensionId,
    approvalReady: r.state === "SIMULATED",
  }));
  return {
    installed,
    pendingRequests,
    suggestions: [
      "Connect Shopify to sync products and orders",
      "Install a barcode scanner skill for in-person counts",
      "Ask UNiCOM to build a custom restock dashboard",
    ],
  };
}

/**
 * Build the AI-generated-app request view (the merchant-parity surface's
 * request queue). Pure projection of `AiGeneratedAppRequest[]`.
 */
export function buildAiGeneratedAppRequestView(
  requests: readonly AiGeneratedAppRequest[],
): { readonly rows: readonly AiGeneratedAppRequestRow[] } {
  return {
    rows: requests.map((r) => ({
      requestId: r.requestId,
      origin: r.origin,
      ask: r.ask,
      state: r.state,
      hasSimulation: r.simulatedArtifact !== undefined,
      simulationSummary: r.simulatedArtifact?.simulationSummary,
      installedAppExtensionId: r.installedAppExtensionId,
      approvalReady: r.state === "SIMULATED",
    })),
  };
}

/**
 * Build the agent-generated-tool view (the AI-native Lab surface's request
 * queue). Pure projection of `AgentGeneratedToolRequest[]`.
 */
export function buildAgentGeneratedToolView(
  requests: readonly AgentGeneratedToolRequest[],
): { readonly rows: readonly AiGeneratedAppRequestRow[] } {
  return {
    rows: requests.map((r) => ({
      requestId: r.requestId,
      origin: "LAB_AGENT_PROPOSAL",
      ask: r.ask,
      state: r.state,
      hasSimulation: r.simulatedArtifact !== undefined,
      simulationSummary: r.simulatedArtifact?.simulationSummary,
      installedAppExtensionId: r.installedAppExtensionId,
      approvalReady: r.state === "SIMULATED",
    })),
  };
}
