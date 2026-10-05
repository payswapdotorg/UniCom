/**
 * Runtime test — POS/import journey (W3-004 acceptance scenario 1):
 * a POS catalog+inventory import flows through a fixture-backed connector
 * in EACH execution mode (PASS_THROUGH_NATIVE / COMPOSED /
 * OPTIMIZED_MULTI_PROVIDER) with idempotent re-import — a double import
 * adds ZERO duplicate facts — plus backoff under export throttling and the
 * capability-scope gate blocking out-of-scope imports before any provider
 * call.
 *
 * Real adapter (`src/runtime/providers/pos-import.ts`) + fixture player
 * (TEST DOUBLE) + the W3-002 connector runtime + W3-003 journey runner:
 * every import is an end-to-end journey over the full dispatch plumbing
 * with the canonical W2-002 executability kernel gate deciding the step.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createProviderJourneyRunner, type ProviderJourneyRunner } from "../src/runtime/connector/journey";
import { createConnectorTelemetry } from "../src/runtime/connector/telemetry";
import {
  createPosImportAdapter,
  type PosImportBatchStore,
} from "../src/runtime/providers/pos-import";
import {
  createPosImportBatchStore,
  createPosImportConnector,
  createInMemoryPosImportDedupeStore,
  type PosImportConnector,
} from "../src/runtime/connector/pos-import";
import { createShopifyAdapter } from "../src/runtime/providers/shopify";
import { CAPABILITY_POS_IMPORT } from "../src/runtime/providers/capabilities";
import { assertModePermitted } from "../src/runtime/providers/matrix";
import { asAuthorizationContextRef, asPrincipalRef } from "../src/runtime/ids";
import { FixturePlayer, PayloadStore, RecordingSleeper, type FixtureRoute } from "./fixtures/providers/player";
import {
  posStore1Routes,
  posStore1ThrottledCatalogRoutes,
  posStore2Routes,
  posUnauthorizedRoute,
} from "./fixtures/providers/pos-fixtures";
import { shopifyFixtureRoutes } from "./fixtures/providers/shopify-fixtures";

const PRINCIPAL = asPrincipalRef("principal-merchant-1");
const AUTH = asAuthorizationContextRef("authorization-pos-import-1");

function makeClock(baseIso: string): () => string {
  let ticks = 0;
  return () => {
    const at = new Date(Date.parse(baseIso) + ticks * 1000).toISOString();
    ticks += 1;
    return at;
  };
}

interface PosRig {
  readonly player: FixturePlayer;
  readonly sleeper: RecordingSleeper;
  readonly store: PosImportBatchStore;
  readonly connector: PosImportConnector;
  readonly connectorId: string;
}

async function createPosRig(
  routes: readonly FixtureRoute[],
  options: { readonly grants?: readonly string[]; readonly baseIso?: string } = {},
): Promise<PosRig> {
  const clock = makeClock(options.baseIso ?? "2026-10-06T10:00:00Z");
  const vault = createCredentialVault({ clock });
  const player = new FixturePlayer(routes);
  const sleeper = new RecordingSleeper();
  const payloads = new PayloadStore([
    ["pos-import:catalog", { since: "2026-10-01T00:00:00Z" }],
    ["pos-import:inventory", { since: "2026-10-01T00:00:00Z" }],
  ]);
  const store = createPosImportBatchStore();
  const runtime = createConnectorRuntime({ vault, clock });
  const telemetry = createConnectorTelemetry({ clock });
  const runner = createProviderJourneyRunner({ runtime, telemetry, clock });
  const adapter = createPosImportAdapter({
    http: player,
    vault,
    sink: store,
    payloadResolver: payloads,
    clock,
    backOfficeRef: "store-1",
    sleeper: sleeper.sleep,
  });
  const registered = runtime.register(adapter);
  await runtime.connect({
    connectorId: registered.connectorId,
    accountRef: "backoffice-store-1",
    credential: { kind: "api-secret", material: "pos-backoffice-token-store-1", forAdapterId: "pos-import-store-1", forAccountRef: "backoffice-store-1" },
    grantedPermissions: [...(options.grants ?? ["pos:items:read", "pos:inventory:read"])],
    credentialScope: "pos.import",
    capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
  });
  const connector = createPosImportConnector({
    runner,
    connectorId: registered.connectorId,
    backOfficeRef: "store-1",
    store,
    dedupe: createInMemoryPosImportDedupeStore(),
    clock,
  });
  return { player, sleeper, store, connector, connectorId: registered.connectorId };
}

describe("POS/import journey — scenario 1", () => {
  it("PASS_THROUGH_NATIVE: catalog + inventory import with per-row partial failure; rows ingest as observations, never state", async () => {
    const rig = await createPosRig(posStore1Routes);
    // The mode-permission matrix documents pos-import as native-executable.
    expect(assertModePermitted("pos-import", ExecutionMode.PASS_THROUGH_NATIVE).permitted).toBe(true);

    const catalog = await rig.connector.runImport({
      importRef: "pass-catalog-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-pos-pass-catalog-1",
    });
    expect(catalog.journeyOutcome).toBe("succeeded");
    expect(catalog.batchId).toBe("cat-store1-1");
    expect(catalog.pulledRows).toBe(3);
    expect(catalog.ingested).toBe(3);
    expect(catalog.dispositions.every((disposition) => disposition.status === "ingested")).toBe(true);

    const inventory = await rig.connector.runImport({
      importRef: "pass-inventory-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "inventory",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-pos-pass-inventory-1",
    });
    expect(inventory.journeyOutcome).toBe("succeeded");
    // Partial failure: the malformed on-hand row is rejected; the batch continues.
    expect(inventory.ingested).toBe(2);
    expect(inventory.rejectedMalformed).toBe(1);
    expect(inventory.dispositions).toContainEqual(
      expect.objectContaining({ status: "rejected-malformed", reason: expect.stringContaining("onHand") }),
    );

    // Facts: 3 catalog rows + 2 valid inventory rows.
    const facts = rig.connector.importedFacts();
    expect(facts).toHaveLength(5);
    expect(facts.filter((fact) => fact.kind === "catalog-row").map((fact) => fact.subjectRef)).toEqual([
      "APPL-GALA-1KG",
      "MILK-WHL-2L",
      "BREAD-WHT-500",
    ]);

    // Imported rows are OBSERVATIONS — never promoted commerce state.
    const observations = rig.connector.observations();
    expect(observations).toHaveLength(5);
    expect(observations.every((observation) => observation.truthClass === "observed")).toBe(true);
    expect(observations.every((observation) => observation.kind === "file-import")).toBe(true);
    expect(observations.every((observation) => observation.sourceClass === "pos-reported")).toBe(true);
  });

  it("COMPOSED: the POS import composes with a Shopify product update in one multi-provider journey", async () => {
    const clock = makeClock("2026-10-06T10:00:00Z");
    const vault = createCredentialVault({ clock });
    const telemetry = createConnectorTelemetry({ clock });
    const runtime = createConnectorRuntime({ vault, clock });
    const runner = createProviderJourneyRunner({ runtime, telemetry, clock });

    const posPlayer = new FixturePlayer(posStore1Routes);
    const posStore = createPosImportBatchStore();
    const posPayloads = new PayloadStore([
      ["pos-import:catalog", { since: "2026-10-01T00:00:00Z" }],
      ["pos-import:inventory", {}],
    ]);
    const posAdapter = createPosImportAdapter({
      http: posPlayer, vault, sink: posStore, payloadResolver: posPayloads, clock, backOfficeRef: "store-1",
    });
    const pos = runtime.register(posAdapter);
    await runtime.connect({
      connectorId: pos.connectorId,
      accountRef: "backoffice-store-1",
      credential: { kind: "api-secret", material: "pos-backoffice-token-store-1", forAdapterId: "pos-import-store-1", forAccountRef: "backoffice-store-1" },
      grantedPermissions: ["pos:items:read", "pos:inventory:read"],
      credentialScope: "pos.import",
      capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
    });

    const shopifyPlayer = new FixturePlayer(shopifyFixtureRoutes);
    const shopifyPayloads = new PayloadStore([
      ["composed-shopify-update", { productId: "632910392", price: "41.94" }],
    ]);
    const shopify = runtime.register(createShopifyAdapter({
      http: shopifyPlayer, vault, payloadResolver: shopifyPayloads, clock,
      shopDomain: "connors-store.myshopify.com", sleeper: new RecordingSleeper(),
    }));
    await runtime.connect({
      connectorId: shopify.connectorId,
      accountRef: "account-shopify-1",
      credential: { kind: "api-secret", material: "shpat_composed_pos", forAdapterId: "shopify-connors-store.myshopify.com", forAccountRef: "account-shopify-1" },
      grantedPermissions: ["read_products", "write_products"],
      credentialScope: "read_products write_products",
      capabilityDefinitionId: "commerce.listings.manage",
    });

    // One composed journey: POS catalog import (step 1) + Shopify product update (step 2).
    const dispatch = await runner.run({
      journeyRef: "pos-composed-1",
      mode: ExecutionMode.COMPOSED,
      steps: [
        {
          stepRef: "step-import-catalog",
          capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId as never,
          preconditions: {
            requiresConnectedInstance: true,
            requiredCredentialScope: "pos.import" as never,
            requiredPermissions: ["pos:items:read"] as never,
            requiresCommercialTermsAccepted: true,
            requiresCurrentObservation: true,
          },
          commandRef: "import-catalog",
          payloadRef: "pos-import:catalog",
        },
        {
          stepRef: "step-update-product-shopify",
          capabilityDefinitionId: "commerce.listings.manage" as never,
          preconditions: {
            requiresConnectedInstance: true,
            requiredCredentialScope: "read_products write_products" as never,
            requiredPermissions: ["write_products"] as never,
            requiresCommercialTermsAccepted: true,
            requiresCurrentObservation: true,
          },
          commandRef: "update-product",
          payloadRef: "composed-shopify-update",
        },
      ],
      connectorIds: [pos.connectorId as never, shopify.connectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-pos-composed-1",
    });
    expect(dispatch.dispatch.journeyOutcome).toBe("succeeded");
    expect(dispatch.dispatch.plannedSteps[0]?.selectedInstanceId).toContain("pos-import-instance");
    expect(dispatch.dispatch.plannedSteps[1]?.selectedInstanceId).toContain("shopify-instance");

    // The POS batch landed in the store's batch store; ingesting it through
    // the import connector folds rows exactly-once.
    const posConnector = createPosImportConnector({
      runner, connectorId: pos.connectorId, backOfficeRef: "store-1",
      store: posStore, dedupe: createInMemoryPosImportDedupeStore(), clock,
    });
    const ingest = posConnector.ingestPulledBatch("cat-store1-1");
    expect(ingest.newFacts).toBe(3);
    expect(posConnector.importedFacts()).toHaveLength(3);
  });

  it("OPTIMIZED_MULTI_PROVIDER: two back offices — the optimizer selects the NOMINAL one and the import ingests from the selected store", async () => {
    const clock = makeClock("2026-10-06T10:00:00Z");
    const vault = createCredentialVault({ clock });
    const telemetry = createConnectorTelemetry({ clock });
    const runtime = createConnectorRuntime({ vault, clock });
    const runner = createProviderJourneyRunner({ runtime, telemetry, clock });

    const assemble = async (routes: readonly FixtureRoute[], ref: string) => {
      const player = new FixturePlayer(routes);
      const store = createPosImportBatchStore();
      const payloads = new PayloadStore([
        ["pos-import:catalog", { since: "2026-10-01T00:00:00Z" }],
        ["pos-import:inventory", {}],
      ]);
      const adapter = createPosImportAdapter({
        http: player, vault, sink: store, payloadResolver: payloads, clock, backOfficeRef: ref,
      });
      const registered = runtime.register(adapter);
      await runtime.connect({
        connectorId: registered.connectorId,
        accountRef: `backoffice-${ref}`,
        credential: { kind: "api-secret", material: `pos-backoffice-token-${ref}`, forAdapterId: `pos-import-${ref}`, forAccountRef: `backoffice-${ref}` },
        grantedPermissions: ["pos:items:read", "pos:inventory:read"],
        credentialScope: "pos.import",
        capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
      });
      const connector = createPosImportConnector({
        runner, connectorId: registered.connectorId, backOfficeRef: ref,
        store, dedupe: createInMemoryPosImportDedupeStore(), clock,
      });
      return { connector, connectorId: registered.connectorId, store };
    };

    const store1 = await assemble(posStore1Routes, "store-1");
    const store2 = await assemble(posStore2Routes, "store-2");

    const result = await store1.connector.runImport({
      importRef: "optimized-catalog-1",
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-pos-optimized-1",
      candidateConnectorIds: [store1.connectorId, store2.connectorId],
    });
    expect(result.journeyOutcome).toBe("succeeded");
    // The DEGRADED store-2 observation loses the optimizer ranking; the
    // NOMINAL store-1 instance executes the import.
    expect(result.batchId).toBe("cat-store1-1");
    expect(result.ingested).toBe(3);
    expect(store2.store.batches()).toHaveLength(0);
    expect(store1.connector.importedFacts()).toHaveLength(3);
  });

  it("idempotent re-import: a DOUBLE import (fresh seed, provider re-pulled) adds ZERO duplicate facts", async () => {
    const rig = await createPosRig(posStore1Routes);
    const first = await rig.connector.runImport({
      importRef: "idempotent-catalog-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-idempotent-1",
    });
    expect(first.ingested).toBe(3);
    const pullsAfterFirst = rig.player.requestsFor("GET", /\/pos\/v1\/catalog\/export/).length;
    expect(pullsAfterFirst).toBe(1);

    // Double import: a genuinely repeated import (NEW seed → the provider
    // IS pulled again) — row-level exactly-once dedupes every row.
    const second = await rig.connector.runImport({
      importRef: "idempotent-catalog-2",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-idempotent-2",
    });
    expect(second.journeyOutcome).toBe("succeeded");
    expect(second.pulledRows).toBe(3);
    expect(second.ingested).toBe(0);
    expect(second.duplicatesIgnored).toBe(3);
    expect(second.newFacts).toBe(0);
    // ZERO duplicate facts: same 3 facts, same 3 observations as after the first.
    expect(rig.connector.importedFacts()).toHaveLength(3);
    expect(rig.connector.observations()).toHaveLength(3);
  });

  it("idempotency-key replay: the SAME seed never pulls the provider twice (adapter ledger replay)", async () => {
    const rig = await createPosRig(posStore1Routes);
    await rig.connector.runImport({
      importRef: "replay-catalog-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-replay-1",
    });
    const pullsAfterFirst = rig.player.requestsFor("GET", /\/pos\/v1\/catalog\/export/).length;
    expect(pullsAfterFirst).toBe(1);

    const replay = await rig.connector.runImport({
      importRef: "replay-catalog-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-replay-1",
    });
    expect(replay.journeyOutcome).toBe("succeeded");
    // No second provider pull, no second batch, zero new facts.
    expect(rig.player.requestsFor("GET", /\/pos\/v1\/catalog\/export/)).toHaveLength(pullsAfterFirst);
    expect(replay.pulledRows).toBe(0);
    expect(replay.newFacts).toBe(0);
    expect(rig.connector.importedFacts()).toHaveLength(3);
  });

  it("backoff: a throttled export retries after Retry-After and succeeds with a recorded delay trace", async () => {
    const rig = await createPosRig(posStore1ThrottledCatalogRoutes);
    const result = await rig.connector.runImport({
      importRef: "throttled-catalog-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "catalog",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-throttled-1",
    });
    expect(result.journeyOutcome).toBe("succeeded");
    expect(result.batchId).toBe("cat-store1-throttled");
    expect(result.ingested).toBe(3);
    // The provider's own Retry-After header (1 second) drove the delay.
    expect(rig.sleeper.delays).toEqual([1000]);
  });

  it("capability-scope gate: an out-of-scope inventory import is blocked BEFORE any provider call", async () => {
    // Connected with catalog scope only — the inventory permission was never granted.
    const rig = await createPosRig(posStore1Routes, { grants: ["pos:items:read"] });
    const result = await rig.connector.runImport({
      importRef: "scope-inventory-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      importKind: "inventory",
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-scope-1",
    });
    expect(result.journeyOutcome).toBe("failed-recoverable");
    expect(result.ingested).toBe(0);
    // The kernel gate blocked the step; the provider was never called.
    expect(rig.player.requestsFor("GET", /\/pos\/v1\/inventory\/levels/)).toHaveLength(0);
  });

  it("connect tri-state: an unauthorized back office surfaces customer-action-required (never silent failure)", async () => {
    const clock = makeClock("2026-10-06T10:00:00Z");
    const vault = createCredentialVault({ clock });
    const runtime = createConnectorRuntime({ vault, clock });
    const player = new FixturePlayer(posUnauthorizedRoute);
    const adapter = createPosImportAdapter({
      http: player, vault, sink: createPosImportBatchStore(),
      payloadResolver: new PayloadStore([]), clock, backOfficeRef: "store-1",
    });
    const registered = runtime.register(adapter);
    const connected = await runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "backoffice-store-1",
      credential: { kind: "api-secret", material: "pos-backoffice-bad-token", forAdapterId: "pos-import-store-1", forAccountRef: "backoffice-store-1" },
      grantedPermissions: ["pos:items:read"],
      credentialScope: "pos.import",
      capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
    });
    expect(connected.lifecycle).toBe("customer-action-required");
  });
});
