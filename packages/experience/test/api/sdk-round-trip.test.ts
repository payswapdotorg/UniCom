/**
 * W3-007 §1 — SDK round-trip + journal-replay equivalence.
 *
 * Asserts the projection law end-to-end:
 * - the typed SDK client round-trips through the loopback API server over
 *   the real journal + projector + command handler;
 * - projection responses carry the journal fingerprint and the truth class;
 * - command responses are idempotent (re-sending the same idempotency key
 *   returns "unknown" not a duplicate);
 * - rebuild-from-journal equivalence: a projection can be rebuilt from the
 *   journal up to its sequence and matches the live projection exactly
 *   (the W3-007 §1 acceptance scenario 1 explicit requirement).
 */

import { describe, expect, it } from "vitest";
import {
  COMMERCE_API_VERSION,
  type ApiResponseEnvelope,
  type ApiRequestEnvelope,
} from "../../src/api/api-contracts";
import {
  createCommerceSdk,
  type CommerceSdkTransport,
} from "../../src/api/sdk";
import {
  createCommerceApiServer,
  createCommandLedger,
  assertProjectionRebuildEquiv,
} from "../../src/runtime/api/server";
import {
  createCommerceJournal,
  createProjectionProjector,
  type CommerceJournal,
  type CommerceProjectionProjector,
  type CommerceProjection,
} from "../../src/runtime/api/journal";
import type {
  AuthorizationContextRef,
  CommerceCartRef,
  CommerceKernelCommandRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  DecisionRef,
  TransactionProofRef,
} from "../../src/common/opaque-refs";
import type { IdempotencyKey, MoneyString, UtcIso8601String } from "../../src/common/values";

const FIXED_CLOCK_BASE = "2026-10-11T08:00:00Z";
let clockCounter = 0;
const clock = (): UtcIso8601String => {
  const at = new Date(Date.parse(FIXED_CLOCK_BASE) + clockCounter * 1000).toISOString();
  clockCounter += 1;
  return at as UtcIso8601String;
};

function createLoopbackTransport(): {
  readonly transport: CommerceSdkTransport;
  readonly journal: CommerceJournal;
  readonly projector: CommerceProjectionProjector;
  readonly seedMerchant: CommerceMerchantRef;
  readonly seedProduct: CommerceProductRef;
  readonly seedOrder: CommerceOrderRef;
  readonly seedCart: CommerceCartRef;
} {
  const journal = createCommerceJournal(clock);
  const projector = createProjectionProjector(journal);
  const commandLedger = createCommandLedger();
  const commandHandler = (): { readonly decisionRef: DecisionRef; readonly resultRef: string } => {
    const orderRef = `order:created-${clockCounter}` as CommerceOrderRef;
    return {
      decisionRef: `decision:${orderRef}` as DecisionRef,
      resultRef: orderRef,
    };
  };
  const server = createCommerceApiServer({ journal, projector, commandHandler, commandLedger, clock });
  const transport: CommerceSdkTransport = {
    async dispatch<TBody>(request: ApiRequestEnvelope<TBody>): Promise<ApiResponseEnvelope<TBody>> {
      return server.dispatch<TBody>(request);
    },
  };

  // Seed journaled events so projections are non-empty.
  const seedMerchant = "merchant:seed" as CommerceMerchantRef;
  const seedProduct = "product:seed-1" as CommerceProductRef;
  const seedOrder = "order:seed-1" as CommerceOrderRef;
  const seedCart = "cart:seed-1" as CommerceCartRef;

  journal.append({
    occurredAt: clock(),
    kind: "merchant-profiled",
    subjectRef: seedMerchant,
    snapshot: { displayName: "Acme Outpost", defaultCurrency: "USD" },
  });
  journal.append({
    occurredAt: clock(),
    kind: "catalog-published",
    subjectRef: seedMerchant,
    snapshot: { catalogRef: "catalog:seed", productRefs: [seedProduct] },
  });
  journal.append({
    occurredAt: clock(),
    kind: "product-listed",
    subjectRef: seedProduct,
    snapshot: { sku: "ACME-001", priceDisplay: "12.50" as MoneyString },
  });
  journal.append({
    occurredAt: clock(),
    kind: "order-placed",
    subjectRef: seedOrder,
    snapshot: { orderNumber: "1001", totalDisplay: "25.00" as MoneyString, paymentStatus: "paid" },
  });
  journal.append({
    occurredAt: clock(),
    kind: "cart-opened",
    subjectRef: seedCart,
    snapshot: { estimatedTotalDisplay: "25.00" as MoneyString },
  });

  return { transport, journal, projector, seedMerchant, seedProduct, seedOrder, seedCart };
}

describe("API/SDK round-trip + journal-replay equivalence (W3-007 §1)", () => {
  it("round-trips projection reads through the typed SDK over the loopback server", async () => {
    const fixture = createLoopbackTransport();
    const sdk = createCommerceSdk(fixture.transport);

    const merchant = await sdk.getMerchant(fixture.seedMerchant);
    expect(merchant.status).toBe("ok");
    expect(merchant.version).toBe(COMMERCE_API_VERSION);
    expect(merchant.body?.displayName).toBe("Acme Outpost");
    expect(merchant.body?.defaultCurrency).toBe("USD");
    expect(merchant.journalFingerprint).toBeDefined();
    expect(merchant.truthClass).toBe("operational");

    const catalog = await sdk.listCatalog(fixture.seedMerchant);
    expect(catalog.status).toBe("ok");
    expect(catalog.body?.productRefs.length).toBe(1);
    expect(catalog.body?.productRefs[0]).toBe(fixture.seedProduct);

    const product = await sdk.getProduct(fixture.seedProduct);
    expect(product.status).toBe("ok");
    expect(product.body?.sku).toBe("ACME-001");
    expect(product.body?.priceDisplay).toBe("12.50");

    const order = await sdk.getOrder(fixture.seedOrder);
    expect(order.status).toBe("ok");
    expect(order.body?.orderNumber).toBe("1001");
    expect(order.body?.totalDisplay).toBe("25.00");
    expect(order.body?.paymentStatus).toBe("paid");

    const cart = await sdk.getCart(fixture.seedCart);
    expect(cart.status).toBe("ok");
    expect(cart.body?.estimatedTotalDisplay).toBe("25.00");
  });

  it("round-trips the order.create command through the kernel command path", async () => {
    const fixture = createLoopbackTransport();
    const sdk = createCommerceSdk(fixture.transport);

    const order = await sdk.createOrder({
      idempotencyKey: "idem-1" as IdempotencyKey,
      connectedInstanceRef: "instance:1" as ConnectedCapabilityInstanceId,
      authorization: "auth:1" as AuthorizationContextRef,
      cartRef: fixture.seedCart,
    });
    expect(order.status).toBe("ok");
    expect(order.body?.orderRef).toBeDefined();
    expect(order.body?.decisionRef).toBeDefined();
    expect(order.body?.acceptedAt).toBeDefined();
  });

  it("returns 'unknown' for a duplicate command (idempotency ledger recorded once)", async () => {
    const fixture = createLoopbackTransport();
    const sdk = createCommerceSdk(fixture.transport);

    const first = await sdk.createOrder({
      idempotencyKey: "idem-dup" as IdempotencyKey,
      connectedInstanceRef: "instance:1" as ConnectedCapabilityInstanceId,
      authorization: "auth:1" as AuthorizationContextRef,
      cartRef: fixture.seedCart,
    });
    expect(first.status).toBe("ok");

    const second = await sdk.createOrder({
      idempotencyKey: "idem-dup" as IdempotencyKey,
      connectedInstanceRef: "instance:1" as ConnectedCapabilityInstanceId,
      authorization: "auth:1" as AuthorizationContextRef,
      cartRef: fixture.seedCart,
    });
    expect(second.status).toBe("unknown");
    expect(second.body).toBeUndefined();
  });

  it("rebuilds every live projection from the journal up to its sequence (rebuild-from-journal equivalence)", () => {
    const fixture = createLoopbackTransport();
    const liveMerchant = fixture.projector.projectMerchant(fixture.seedMerchant);
    expect(liveMerchant).toBeDefined();
    const liveProduct = fixture.projector.projectProduct(fixture.seedProduct);
    expect(liveProduct).toBeDefined();
    const liveOrder = fixture.projector.projectOrder(fixture.seedOrder);
    expect(liveOrder).toBeDefined();
    const liveCart = fixture.projector.projectCart(fixture.seedCart);
    expect(liveCart).toBeDefined();

    // For each live projection, replay the journal up to the live sequence
    // and assert the rebuilt projection matches exactly.
    const merchantRebuild = assertProjectionRebuildEquiv(
      liveMerchant as CommerceProjection,
      fixture.journal,
      fixture.projector,
      (projector) => projector.projectMerchant(fixture.seedMerchant),
    );
    expect(merchantRebuild.equiv).toBe(true);

    const productRebuild = assertProjectionRebuildEquiv(
      liveProduct as CommerceProjection,
      fixture.journal,
      fixture.projector,
      (projector) => projector.projectProduct(fixture.seedProduct),
    );
    expect(productRebuild.equiv).toBe(true);

    const orderRebuild = assertProjectionRebuildEquiv(
      liveOrder as CommerceProjection,
      fixture.journal,
      fixture.projector,
      (projector) => projector.projectOrder(fixture.seedOrder),
    );
    expect(orderRebuild.equiv).toBe(true);

    const cartRebuild = assertProjectionRebuildEquiv(
      liveCart as CommerceProjection,
      fixture.journal,
      fixture.projector,
      (projector) => projector.projectCart(fixture.seedCart),
    );
    expect(cartRebuild.equiv).toBe(true);
  });

  it("returns 'unknown' for a projection subject that has no journal events (no fabricated truth)", async () => {
    const fixture = createLoopbackTransport();
    const sdk = createCommerceSdk(fixture.transport);
    const merchant = await sdk.getMerchant("merchant:never-existed" as CommerceMerchantRef);
    expect(merchant.status).toBe("unknown");
    expect(merchant.body).toBeUndefined();
  });
});
