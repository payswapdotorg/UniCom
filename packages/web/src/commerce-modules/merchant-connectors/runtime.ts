/**
 * merchant-connectors runtime space (J15, W3-016).
 *
 * The REAL experience-plane connector runtime, consumed through its PUBLIC
 * entrypoints only (`@unicom/experience/runtime`): the credential vault,
 * the Shopify provider adapter (`createShopifyAdapter` — real Admin REST
 * semantics), the connector runtime (register → connect → observe → …),
 * the canonical journey runner, the journey-evidence telemetry registry and
 * the W3-005 connector health surface projection.
 *
 * THE SAFE EXERCISE (the work order's non-live law):
 * - the adapter's HTTP port is a TRIPWIRE that throws on any call — the
 *   exercise mechanically CANNOT contact Shopify (verified: 0 port calls);
 * - the vault is the REAL vault and stays EMPTY (0 credentials sealed);
 * - the adapter is REGISTERED, never connected — connecting requires live
 *   credentials, which do not exist and are never fabricated;
 * - health observation + capability declaration + ONE read-only
 *   catalog-observation journey attempt run through the real runtime; with
 *   zero connected instances the canonical gate answers
 *   NOT_EXECUTABLE / CATALOG_ONLY_NO_CONNECTED_INSTANCE (the runtime's own
 *   honest refusal, never a fabricated success);
 * - no purchases, payments, refunds or orders anywhere; nothing commits.
 *
 * BROWSER BOUNDARY (honest): the runtime barrel is NOT browser-evaluable
 * today — statically verified from its public import chain: the barrel
 * re-exports `deployment/target-adapter`, whose module top level calls
 * `promisify(execFile)` from `node:util` (and `node:child_process` /
 * `node:http`); a browser bundler externalizes node builtins with stubs
 * that throw, so evaluating the barrel throws at import time. The component
 * therefore loads the runtime through a GUARDED dynamic import: environments
 * that can evaluate the barrel (the module's test suite) render live runtime
 * truth; a browser renders the honest boundary + the committed, test-pinned
 * exercise record instead (see fixtures.ts + the lane manifest).
 */

import type {
  AdapterTelemetry,
  ExecutionModeTelemetry,
} from "@unicom/experience/runtime";
import type {
  ConnectorHealthSnapshot,
  ConnectorHealthSurfaceEntry,
  ConnectorHealthSurfaceView,
} from "@unicom/experience";

/** The fixed demo clock the connector space renders against. */
export const CONNECTORS_NOW = "2026-10-12T09:00:00Z";

/** The demo shop domain of the exercised adapter (never a real store). */
export const DEMO_SHOP_DOMAIN = "harbor-lane-demo.myshopify.com";

/** The one journey the safe exercise attempts (read-only catalog observation). */
export const SAFE_JOURNEY_REF = "w3cn-journey-catalog-observe-1";

/** Live runtime facts the safe exercise produced (all deterministic). */
export interface ConnectorRuntimeSpace {
  readonly kind: "runtime";
  readonly connectorId: string;
  readonly adapterId: string;
  readonly userLabel: string;
  readonly transportId: string;
  /** Kernel lifecycle of the registered connector ("registered" — never connected). */
  readonly lifecycle: string;
  readonly connectedInstanceCount: number;
  /** The adapter's canonical capability declaration (catalog data). */
  readonly capabilities: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly modes: readonly string[];
  }[];
  /** Health snapshot from the runtime's own healthReport (UNKNOWN, never down). */
  readonly health: ConnectorHealthSnapshot;
  /** Latest canonical observation (UNKNOWN — nothing is connected). */
  readonly observation: { readonly status: string; readonly freshness: string; readonly detail: string } | null;
  /** The safe journey attempt: the canonical gate's honest refusal. */
  readonly journey: {
    readonly journeyRef: string;
    readonly mode: string;
    readonly outcome: string;
    readonly stepOutcomes: readonly { readonly stepRef: string; readonly outcome: string; readonly note?: string }[];
    readonly evidenceSummaries: readonly string[];
    readonly correlationId: string;
  };
  /** Execution-mode telemetry rollup (from the journey evidence registry). */
  readonly modeTelemetry: readonly ExecutionModeTelemetry[];
  /** Per-adapter telemetry rollup. */
  readonly adapterTelemetry: readonly AdapterTelemetry[];
  /** The W3-005 health surface projection (last contact, last error, recovery). */
  readonly healthSurface: readonly ConnectorHealthSurfaceEntry[];
  /** Vault audit: credentials sealed inside the runtime (0 — none exist). */
  readonly sealedCredentialCount: number;
  /** HTTP port calls made during the exercise (0 — the tripwire proves it). */
  readonly providerHttpCalls: number;
  readonly observedAt: string;
}

/** The honest browser boundary: the runtime barrel could not be evaluated. */
export interface BrowserBlockedSpace {
  readonly kind: "browser-blocked";
  /** The thrown error's own message (rendered verbatim, never paraphrased). */
  readonly reason: string;
}

export type ConnectorsSpace = ConnectorRuntimeSpace | BrowserBlockedSpace;

/**
 * Build the real connector runtime space (deterministic: fixed clock, fixed
 * ids, zero provider calls). The runtime barrel is imported DYNAMICALLY and
 * GUARDED: a browser (where the barrel cannot be evaluated today) gets the
 * honest boundary instead of a crash.
 */
export async function loadConnectorsSpace(): Promise<ConnectorsSpace> {
  let runtimeModule: typeof import("@unicom/experience/runtime");
  try {
    runtimeModule = await import("@unicom/experience/runtime");
  } catch (error) {
    return {
      kind: "browser-blocked",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const {
    asAuthorizationContextRef,
    asCapabilityDefinitionId,
    asPrincipalRef,
    asUtcTimestamp,
    buildConnectorHealthSurface,
    CAPABILITY_CATALOG_OBSERVE,
    createConnectorRuntime,
    createConnectorTelemetry,
    createCredentialVault,
    createProviderJourneyRunner,
    createShopifyAdapter,
    ExecutionMode,
    journeyCredentialScope,
    unknownHealthSnapshot,
  } = runtimeModule;

  const clock = (): string => CONNECTORS_NOW;
  // The branded fixed-clock instant (contract surfaces type their stamps).
  const now = asUtcTimestamp(CONNECTORS_NOW);
  // The canonical UNKNOWN snapshot (the runtime's own constructor, used only
  // if a health report were somehow missing — never a hand-rolled verdict).
  const missingHealth = unknownHealthSnapshot("health report missing", now);
  // The tripwire: ANY provider HTTP call throws — the exercise cannot go live.
  let providerHttpCalls = 0;
  const tripwireHttp = {
    async request(): Promise<never> {
      providerHttpCalls += 1;
      throw new Error(
        "merchant-connectors safe exercise: no provider HTTP call is permitted (no credentials, no live connection)",
      );
    },
  };
  const vault = createCredentialVault({ clock });
  const adapter = createShopifyAdapter({
    http: tripwireHttp,
    vault,
    // No command payload data exists — no command is ever run.
    payloadResolver: { resolve: () => undefined },
    clock,
    shopDomain: DEMO_SHOP_DOMAIN,
  });
  const runtime = createConnectorRuntime({ vault, clock });
  const registered = runtime.register(adapter);
  const telemetry = createConnectorTelemetry({ clock });
  const runner = createProviderJourneyRunner({ runtime, telemetry, clock });

  // Health observation — the runtime probes the REAL adapter (no call goes
  // out: the adapter has no connected instance, and says so honestly).
  const observed = await runtime.observe(registered.connectorId);

  // The one journey attempt: a read-only catalog observation, blocked by the
  // canonical gate exactly because nothing is connected. Zero credentials,
  // zero commands, zero provider state touched.
  const journey = await runner.run({
    journeyRef: SAFE_JOURNEY_REF,
    mode: ExecutionMode.PASS_THROUGH_NATIVE,
    steps: [
      {
        stepRef: "observe-catalog",
        // The agent catalog declares plain ids; the journey spec takes the
        // branded ref — the runtime's own canonical constructor bridges them.
        capabilityDefinitionId: asCapabilityDefinitionId(CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId),
        preconditions: {
          requiresConnectedInstance: true,
          requiredCredentialScope: journeyCredentialScope(["read_products"]),
          requiredPermissions: ["read_products"],
          requiresCommercialTermsAccepted: true,
          requiresCurrentObservation: true,
        },
        commandRef: "observe-catalog-page",
        payloadRef: "w3cn-no-payload",
      },
    ],
    connectorIds: [registered.connectorId],
    requestedBy: asPrincipalRef("demo-merchant-harbor-lane"),
    authorization: asAuthorizationContextRef("w3cn-demo-authorization"),
    idempotencySeed: "w3cn-seed-1",
  });

  const health = runtime.healthReport().find((entry) => entry.connectorId === registered.connectorId);
  const healthSurfaceView: ConnectorHealthSurfaceView = buildConnectorHealthSurface({
    connectors: [
      {
        connectorId: registered.connectorId,
        providerDisplayName: adapter.descriptor.userLabel,
        health: health?.health ?? missingHealth,
      },
    ],
    telemetry,
    generatedAt: now,
  });

  return {
    kind: "runtime",
    connectorId: registered.connectorId,
    adapterId: adapter.descriptor.adapterId,
    userLabel: adapter.descriptor.userLabel,
    transportId: adapter.descriptor.transportId,
    lifecycle: registered.lifecycle,
    connectedInstanceCount: registered.connectedInstances.length,
    capabilities: adapter.descriptor.capabilityDefinitions.map((definition) => ({
      id: definition.capabilityDefinitionId,
      name: definition.name,
      // The contract marks description optional — an absent one is shown as
      // exactly that, never paraphrased into existence.
      description: definition.description ?? "(no description declared)",
      modes: adapter.descriptor.providerImplementations
        .find((implementation) => implementation.capabilityDefinitionId === definition.capabilityDefinitionId)
        ?.supportedExecutionModes ?? [],
    })),
    health: health?.health ?? missingHealth,
    observation:
      observed.observation === null
        ? null
        : {
            status: observed.observation.status,
            freshness: observed.observation.freshness,
            detail: observed.observation.providerStateDetail ?? "",
          },
    journey: {
      journeyRef: journey.journeyRef,
      mode: journey.mode,
      outcome: journey.dispatch.journeyOutcome,
      stepOutcomes: journey.dispatch.stepOutcomes.map((step) => ({
        stepRef: step.stepRef,
        outcome: step.outcome,
        note: step.note,
      })),
      evidenceSummaries: journey.evidenceRecord.evidenceSummaries,
      correlationId: journey.evidenceRecord.correlationId,
    },
    modeTelemetry: telemetry.executionModeTelemetry(),
    adapterTelemetry: telemetry.adapterTelemetry(),
    healthSurface: healthSurfaceView.entries,
    sealedCredentialCount: vault.sealedCount,
    providerHttpCalls,
    observedAt: CONNECTORS_NOW,
  };
}
