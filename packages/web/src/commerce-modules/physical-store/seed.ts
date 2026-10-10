/**
 * physical-store seed + module-local types — split out of component.tsx
 * for the oxlint max-lines gate (pure code motion; the seed body is
 * byte-identical).
 *
 * The seed receives the committed opening shelf stock at the demo market
 * through the REAL kernel (RECEIVE_STOCK per line, reason MANUAL) — canonical
 * stock starts from journaled facts, never from a fixture value.
 */

import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  InventoryCountObservation,
  PrincipalRef,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import {
  DEMO_MERCHANT_ACTOR,
  DemoCommerceRuntime,
} from "../merchant-shared/demo-runtime.js";
import { MARKET_LOCATION, OPENING_STOCK } from "./fixtures.js";

export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

/** One locally queued offline observation (pre-kernel by design). */
export interface QueuedCount {
  readonly localId: string;
  readonly observation: InventoryCountObservation;
  readonly via: string;
}

export async function seedPhysicalStoreDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();
  for (const line of OPENING_STOCK) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(line.skuId),
      locationId: MARKET_LOCATION,
      units: line.units,
      reason: "MANUAL",
    });
  }
  return runtime;
}
