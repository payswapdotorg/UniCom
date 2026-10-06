/**
 * Browser-only connector (W3-003; acceptance scenario 4;
 * FROZEN-ARCHITECTURE §16/§22.4; INVARIANTS 19/28/50).
 *
 * A connector whose ENTIRE provider interaction runs through the W3-002
 * browser session runtime — for providers/back-offices with no API. The
 * server side NEVER sees provider credentials:
 *
 * - the adapter's only provider path is the `BrowserProviderClient` port,
 *   which performs every action INSIDE an isolated browser session
 *   (authorized per-action, per-origin against the session's own scope —
 *   the check runs in the CLIENT implementation, driven by the session
 *   runtime's `authorizeAction`);
 * - the user authenticates to the provider INSIDE the session (the page
 *   holds the credentials in the session's private storage partition);
 *   captured browser material (cookies/storage/MFA) is sealed straight
 *   into the credential vault against the browser adapter boundary — it
 *   is never returned to the adapter, never enters model context, never
 *   reaches repository artifacts;
 * - the connector-boundary credential sealed for this adapter is the
 *   SESSION ID REFERENCE (an opaque string — not provider credential
 *   material); the vault still guards it with single-reader presentation,
 *   and `connect` only binds when the presented reference matches a live
 *   session previously bound via `bindSession`;
 * - what the adapter observes from the provider is UNTRUSTED content,
 *   carried as inert payloads for sanitization.
 *
 * The accompanying CI suite asserts all three legs: provider interaction
 * only through the session; no provider credential value anywhere outside
 * the vault (deep fail-closed value scan); authorization of every action
 * against the session's own scope.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ProviderImplementation,
} from "@unicom/agent/capability";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  AdapterConnectContext,
  AdapterConnectionOutcome,
  AdapterHealthProbeResult,
  AdapterObservationSample,
  ConnectorAdapter,
  ConnectorAdapterDescriptor,
} from "./adapter";
import type { CredentialVault } from "./vault";
import type { BrowserSessionHandle } from "../../connector/browser-session";
import type { UntrustedIngestPayload } from "../sanitize/sanitizer";
import { providerObservation, type AdapterPayloadResolver } from "../providers/provider-adapter-core";
import { FirstProviderId, permittedModesFor } from "../providers/matrix";

/** Actions a browser-only provider interaction may perform in-session. */
export type BrowserProviderAction =
  | "navigate"
  | "read-listings"
  | "read-catalog"
  | "place-order"
  | "submit-form";

/** One provider interaction executed inside a browser session. */
export interface BrowserProviderCall {
  readonly action: BrowserProviderAction;
  readonly origin: string;
  readonly path: string;
  /** Opaque payload reference resolved INSIDE the session interaction. */
  readonly payloadRef?: string;
}

/** The result of one in-session provider interaction. */
export interface BrowserProviderCallResult {
  readonly authorized: boolean;
  readonly reason: string;
  readonly httpLikeStatus: number;
  /** Untrusted page content captured by the read (inert data). */
  readonly untrustedPageContent?: string;
}

/**
 * The ONLY provider path of the browser-only adapter. Production wiring
 * drives a real controlled browser through the session runtime; CI drives
 * a recorded fixture double in the TEST tree. Every call MUST be
 * authorized against the session's own scope before touching the page.
 */
export interface BrowserProviderClient {
  perform(handle: BrowserSessionHandle | undefined, call: BrowserProviderCall): Promise<BrowserProviderCallResult>;
}

/** Options for `createBrowserOnlyConnectorAdapter`. */
export interface BrowserOnlyConnectorOptions {
  readonly vault: CredentialVault;
  readonly client: BrowserProviderClient;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly providerLabel: string;
  readonly providerOrigins: readonly string[];
  readonly capabilities: readonly CapabilityDefinition[];
  readonly implementations: readonly ProviderImplementation[];
  readonly adapterId?: string;
}

/** Browser-only adapter: the W3-002 boundary over an isolated session. */
export interface BrowserOnlyConnectorAdapter extends ConnectorAdapter {
  /** Bind a live browser session (the session IS the provider link). */
  bindSession(handle: BrowserSessionHandle): void;
}

export function createBrowserOnlyConnectorAdapter(
  options: BrowserOnlyConnectorOptions,
): BrowserOnlyConnectorAdapter {
  const { vault, client, payloadResolver, clock, providerLabel, providerOrigins } = options;
  const adapterId = options.adapterId ?? `browser-only-${providerLabel}`;
  const descriptor: ConnectorAdapterDescriptor = {
    adapterId,
    userLabel: `${providerLabel} — browser-only back office`,
    transportId: "browser",
    capabilityDefinitions: options.capabilities,
    providerImplementations: options.implementations,
  };
  /** Sessions bound by id, awaiting a matching connect presentation. */
  const boundSessions = new Map<string, BrowserSessionHandle>();
  const handleByInstance = new Map<string, BrowserSessionHandle>();
  const grantedByInstance = new Map<string, readonly string[]>();
  let lastInstanceId: string | undefined;

  return {
    descriptor,

    bindSession(handle: BrowserSessionHandle): void {
      boundSessions.set(handle.sessionId as string, handle);
    },

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? options.capabilities[0]?.capabilityDefinitionId ?? "commerce.catalog.observe";
      // The sealed material is the SESSION ID REFERENCE — an opaque id,
      // never provider credentials (those live only inside the session's
      // isolated storage partition).
      const sessionRef = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const handle = boundSessions.get(sessionRef);
      if (handle === undefined) {
        return { status: "customer-action-required", note: "no live browser session bound for the presented session reference" };
      }
      // In-session provider reachability probe (authorized by scope).
      const probe = await client.perform(handle, {
        action: "read-catalog",
        origin: providerOrigins[0] ?? "",
        path: "/",
      });
      const connectedInstanceId = `browser-only-instance-${context.connectorId}-${capabilityDefinitionId}`;
      if (probe.authorized && probe.httpLikeStatus >= 200 && probe.httpLikeStatus < 300) {
        handleByInstance.set(connectedInstanceId, handle);
        grantedByInstance.set(connectedInstanceId, [...context.grantedPermissions]);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: {
            connectedInstanceId,
            providerImplementationId:
              options.implementations.find(
                (implementation) => implementation.capabilityDefinitionId === capabilityDefinitionId,
              )?.providerImplementationId ?? options.implementations[0]?.providerImplementationId ?? "impl:browser-only",
            accountRef: context.accountRef,
            connectionStatus: "CONNECTED",
            credentialScope: context.credentialScope,
            credentialRef: context.sealedCredential,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["US"],
              supportedCurrencies: ["USD"],
              commercialTermsAccepted: true,
            },
            // Browser-only rails execute natively inside the session and
            // may participate in composed journeys; optimizer-mediated
            // selection is not offered (no server-side API surface). The
            // grants derive from the documented permission matrix row
            // (`browser-only`, W3-004) — a documented block, never a gap.
            authorizedExecutionModes: [...permittedModesFor(FirstProviderId.BROWSER_ONLY)],
          },
        };
      }
      if (!probe.authorized) {
        return { status: "customer-action-required", note: `session scope refused the provider probe: ${probe.reason}` };
      }
      if (probe.httpLikeStatus === 401 || probe.httpLikeStatus === 403) {
        return { status: "customer-action-required", note: `provider page demands login inside the browser session (HTTP ${probe.httpLikeStatus})` };
      }
      return { status: "unknown", note: `provider page state uninterpreted (HTTP ${probe.httpLikeStatus})` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["no bound browser session"] };
      const result = await client.perform(handleByInstance.get(instanceId), {
        action: "read-catalog",
        origin: providerOrigins[0] ?? "",
        path: "/",
      });
      if (result.authorized && result.httpLikeStatus === 200) {
        return { status: "healthy", evidenceSummaries: [`browser-only:${providerLabel}:read-catalog:200`] };
      }
      if (!result.authorized) {
        return { status: "customer-action-required", customerActionNotes: [result.reason] };
      }
      if (result.httpLikeStatus === 429) return { status: "degraded", degradedReasons: ["provider throttled the session"] };
      return { status: "unknown", degradedReasons: [`provider page returned ${result.httpLikeStatus}`] };
    },

    async observe(): Promise<AdapterObservationSample> {
      const instanceId = lastInstanceId;
      const handle = instanceId === undefined ? undefined : handleByInstance.get(instanceId);
      if (handle === undefined) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId ?? "browser-only-unbound",
            observedAt: clock(),
            status: "UNKNOWN",
            freshness: "UNKNOWN",
            providerStateDetail: "no browser session bound to this connector",
          }),
        };
      }
      const result = await client.perform(handle, {
        action: "read-listings",
        origin: providerOrigins[0] ?? "",
        path: "/listings",
      });
      const observation: CapabilityObservation = result.authorized && result.httpLikeStatus === 200
        ? providerObservation({
            connectedInstanceId: instanceId ?? "browser-only-unbound",
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: "provider catalog read inside the isolated browser session",
          })
        : providerObservation({
            connectedInstanceId: instanceId ?? "browser-only-unbound",
            observedAt: clock(),
            status: result.authorized ? "UNKNOWN" : "CUSTOMER_ACTION_REQUIRED",
            freshness: result.authorized ? "CURRENT" : "UNKNOWN",
            providerStateCode: String(result.httpLikeStatus),
            providerStateDetail: result.reason,
          });
      const untrustedPayloads: UntrustedIngestPayload[] =
        result.untrustedPageContent === undefined
          ? []
          : [{ kind: "web-page", rawText: result.untrustedPageContent, sourceTransportId: "browser" }];
      return { observation, untrustedPayloads };
    },

    async execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome> {
      const handle = handleByInstance.get(input.connectedInstanceId);
      if (handle === undefined) {
        return { outcome: "unknown", note: "no browser session bound to this connector instance", providerObjectIds: [], providerStatePreserved: "unknown" };
      }
      const granted = grantedByInstance.get(input.connectedInstanceId) ?? [];
      const payload = payloadResolver.resolve(input.payloadRef);
      if (payload === undefined) {
        return { outcome: "failed-recoverable", note: `payload "${input.payloadRef}" could not be resolved`, providerObjectIds: [], providerStatePreserved: true };
      }
      const action: BrowserProviderAction = input.commandRef === "place-order" ? "place-order" : "submit-form";
      if (action === "place-order" && !granted.includes("browser:place-order")) {
        return {
          outcome: "failed-recoverable",
          note: "capability scope blocked: browser route \"browser:place-order\" not granted to this session",
          providerObjectIds: [],
          providerStatePreserved: true,
        };
      }
      const result = await client.perform(handle, {
        action,
        origin: providerOrigins[0] ?? "",
        path: typeof payload.path === "string" ? payload.path : "/",
        payloadRef: input.payloadRef,
      });
      if (!result.authorized) {
        return { outcome: "awaiting-customer-action", note: `session scope refused the action: ${result.reason}`, providerObjectIds: [], providerStatePreserved: true };
      }
      if (result.httpLikeStatus >= 200 && result.httpLikeStatus < 300) {
        return {
          outcome: "succeeded",
          note: `browser-only ${action} completed inside the isolated session (${providerLabel})`,
          providerObjectIds: typeof payload.orderRef === "string" ? [payload.orderRef] : [],
          providerStatePreserved: true,
          evidenceSummaries: [`browser-only:${providerLabel}:${action}:${result.httpLikeStatus}`],
        };
      }
      return {
        outcome: "failed-recoverable",
        note: `provider page returned ${result.httpLikeStatus}: ${result.reason}`,
        providerObjectIds: [],
        providerStatePreserved: true,
      };
    },

    async disconnect(): Promise<void> {
      handleByInstance.clear();
      grantedByInstance.clear();
      boundSessions.clear();
      lastInstanceId = undefined;
    },
  };
}
