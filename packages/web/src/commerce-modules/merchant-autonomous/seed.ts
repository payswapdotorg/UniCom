/**
 * merchant-autonomous seed + module-local types — split out of
 * component.tsx for the oxlint max-lines gate (pure code motion; the seed
 * body is byte-identical).
 *
 * The seeded script registers the kiosk + its healthy policy on the REAL
 * kernel, runs one healthy policy day (restock within the spend limit, an
 * in-band price adjustment, a till cycle with a cash variance that
 * escalates) and then registers the HALTED revision — a stop condition
 * crossing its threshold.
 */

import type {
  CommandExecution,
  PrincipalRef,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import {
  autonomousStoreActor,
  DEMO_MERCHANT_ACTOR,
  DemoCommerceRuntime,
  demoMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  AUTONOMOUS_LOCATION,
  AUTONOMOUS_SKU,
  AUTONOMOUS_STORE_ID,
  DEMO_STORE_NAME,
  DEMO_TILL_ID,
  HALTED_POLICY,
  HEALTHY_POLICY,
} from "./fixtures.js";

export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

export async function seedAutonomousDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();
  const store = autonomousStoreActor(AUTONOMOUS_STORE_ID);

  // The healthy policy day (revision 1) — registered BEFORE any command.
  runtime.kernel.registerAutonomousPolicy(HEALTHY_POLICY);
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "REGISTER_AUTONOMOUS_STORE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    ownerRef: DEMO_MERCHANT_ACTOR,
    displayName: DEMO_STORE_NAME,
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "RECEIVE_STOCK",
    skuId: AUTONOMOUS_SKU.skuId,
    locationId: AUTONOMOUS_LOCATION,
    units: AUTONOMOUS_SKU.openingUnits,
    reason: "MANUAL",
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "SET_SKU_PRICE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    unitPrice: demoMoney(AUTONOMOUS_SKU.listPriceMinor),
    costBasis: demoMoney(AUTONOMOUS_SKU.costBasisMinor),
  });
  // Autonomous till opens inside the float band (USD 10.00–60.00 band, USD 25.00 float).
  await runtime.run(store, {
    type: "AUTONOMOUS_OPEN_TILL",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    tillId: DEMO_TILL_ID,
    openingCount: demoMoney("2500"),
  });
  // Restock trigger: 5 on hand at/below the 6-unit threshold → in-band order
  // (4 units × USD 30.00 = USD 120.00 of the USD 200.00 daily spend limit).
  await runtime.run(store, {
    type: "AUTONOMOUS_RESTOCK",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    locationId: AUTONOMOUS_LOCATION,
  });
  // In-band price adjustment: USD 42.00 → USD 44.00 (delta USD 2.00 < the
  // USD 5.00 approval threshold) → ALLOW, applied, before/after trailed.
  await runtime.run(store, {
    type: "ADJUST_SKU_PRICE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    newPrice: demoMoney("4400"),
    reason: "weekend demand",
  });
  // Till close with a USD 17.00 shortfall (USD 25.00 expected, USD 8.00
  // counted) ≥ the USD 15.00 variance threshold → journaled CASH_VARIANCE
  // escalation, never a silent drop.
  const session = runtime.view().allStoreSessions().find((entry) => entry.tillId === DEMO_TILL_ID)!;
  await runtime.run(store, {
    type: "AUTONOMOUS_CLOSE_TILL",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    sessionId: session.sessionId,
    closingCount: demoMoney("800"),
  });
  // The HALT: revision 2 journals the observed discrepancy rate crossing the
  // stop threshold. From here the kernel boundary denies every autonomous
  // action with STOP_CONDITION_TRIGGERED until a human intervenes.
  runtime.kernel.registerAutonomousPolicy(HALTED_POLICY);
  return runtime;
}
