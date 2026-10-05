/**
 * W1-002 runtime scenario 3 (twin of W1-001 scenario 3): weighted grocery
 * item on the real kernel — exact decimal money through the whole flow
 * (cart line → order line → payment), scale-accurate and bit-identical on
 * replays. NO floating point anywhere.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  lineSubtotal,
  makeId,
  measuredQuantity,
  money,
  unitOfMeasure,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const bananas = makeId<"SkuId">("sku-bananas");

describe("runtime scenario 3 — weighted grocery item (real kernel)", () => {
  it("sells 0.542 kg at $2.49/kg with exact money end-to-end", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const perKg = money("249", usd);
    const weighed = measuredQuantity("0.542", unitOfMeasure("KG"));

    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-weighed"),
      skuId: bananas,
      quantity: weighed,
      unitPrice: perKg,
    }));
    const cart = kernel.view().cart("cart-weighed");
    expect(cart?.lines[0]?.kind).toBe("MEASURED_LINE");
    if (cart && cart.lines[0]?.kind === "MEASURED_LINE") {
      expect(cart.lines[0].rounding).toBe("HALF_UP");
      // 2.49 × 0.542 = 1.34958 → 135 minor units (HALF_UP at cents).
      expect(lineSubtotal(cart.lines[0]).amountMinor).toBe("135");
    }

    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-weighed"), merchantId: makeId<"MerchantId">("merchant-1") }));
    const order = kernel.view().order("order-1");
    expect(order?.totals.grandTotal).toMatchObject({ amountMinor: "135" });
    expect(order?.lines[0]).toMatchObject({ kind: "MEASURED_LINE", quantity: { magnitude: "0.542", unit: "KG" }, lineTotal: { amountMinor: "135" } });

    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("135", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") },
        method: { methodKind: "CASH", tokenRef: "till-01" },
      },
    }));
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
    expect(kernel.view().order("order-1")?.paymentStatus).toBe("PAID");
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("mixed carts: unit line + measured line total exactly", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-mixed"),
      skuId: bananas,
      quantity: measuredQuantity("0.542", unitOfMeasure("KG")),
      unitPrice: money("249", usd),
    }));
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-mixed"),
      skuId: makeId<"SkuId">("sku-milk-1l"),
      quantity: countQuantity(3),
      unitPrice: money("189", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-mixed"), merchantId: makeId<"MerchantId">("merchant-1") }));
    // 135 + 3×189 = 702.
    expect(kernel.view().order("order-1")?.totals.subtotal).toMatchObject({ amountMinor: "702" });
  });

  it("identical weighed sales produce bit-identical journals (determinism)", async () => {
    const sell = async () => {
      const kernel = new CommerceKernel();
      await kernel.execute(explicitEnv("cmd-weigh-1", "idem-weigh-1", {
        type: "ADD_CART_LINE",
        cartId: makeId<"CartId">("cart-weighed"),
        skuId: bananas,
        quantity: measuredQuantity("0.542", unitOfMeasure("KG")),
        unitPrice: money("249", usd),
      }));
      await kernel.execute(explicitEnv("cmd-weigh-2", "idem-weigh-2", {
        type: "PLACE_ORDER",
        cartId: makeId<"CartId">("cart-weighed"),
        merchantId: makeId<"MerchantId">("merchant-1"),
      }));
      return kernel;
    };
    const first = await sell();
    const second = await sell();
    expect(second.events()).toEqual(first.events());
  });

  it("zero/negative measured quantities and mixed currencies are rejected", async () => {
    const kernel = new CommerceKernel();
    const zero = await kernel.execute(env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-bad"),
      skuId: bananas,
      quantity: measuredQuantity("0", unitOfMeasure("KG")),
      unitPrice: money("249", usd),
    }));
    expect(zero.status).toBe("REJECTED");
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-bad"),
      skuId: bananas,
      quantity: measuredQuantity("0.542", unitOfMeasure("KG")),
      unitPrice: money("249", usd),
    }));
    const mixed = await kernel.execute(env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-bad"),
      skuId: bananas,
      quantity: countQuantity(1),
      unitPrice: money("249", currency("EUR")),
    }));
    expect(mixed.status).toBe("REJECTED");
    if (mixed.status === "REJECTED") expect(mixed.reason.detail).toContain("MIXED_CURRENCY");
    expect(kernel.view().cart("cart-bad")?.lines).toHaveLength(1);
  });
});
