/**
 * ⚠ CROSS-LANE INTEGRATION HARNESS — NOT A MOCK (W3-004).
 *
 * Wires the REAL `@unicom/commerce` kernel + Commerce Twin behind the
 * W3-002 injected reconciliation seam (`ReconciliationHandoffSink`), driven
 * ONLY through Worker 1's PUBLIC contract entrypoint. Nothing here stubs or
 * doubles commerce behavior — the kernel's command dispatch, idempotency,
 * append-only journal, reconciliation dispositions and demand-side facts
 * are all the real ones.
 *
 * The observation→command mapping below is the W1/W3 seam glue: Worker 1
 * owns reconciliation POLICY; this harness only maps the W3-001 physical
 * observation payloads onto the kernel's public command shapes so the
 * journey tests can assert the fold end-to-end. The sink is synchronous by
 * contract — observations buffer here and `reconcile()` drives the (async)
 * kernel deterministically, in arrival order.
 */

import {
  CommerceKernel,
  CommerceTwin,
  DEFAULT_COUNT_RECONCILIATION_POLICY,
  commandEnvelope,
  makeId,
  type CommandExecution,
  type CommerceFactsV1,
  type CountObservationKind,
  type CountReconciliationPolicy,
  type IdempotencyKey as CommerceIdempotencyKey,
  type InventoryCountObservation,
  type LocationId,
  type ObservationResolution,
  type PosSyncObservation,
  type PrincipalRef as CommercePrincipalRef,
  type SkuId,
  type UnknownReason,
} from "@unicom/commerce";
import type { PhysicalObservation, ReconciliationHandoff } from "../../../src/contract";
import type { ReconciliationHandoffSink } from "../../../src/runtime/edge/offline-queue-runtime";

/** Commerce-lane branded id constructors (public contract constructors). */
const skuIdOf = (value: string): SkuId => makeId<"SkuId">(value);
const locationIdOf = (value: string): LocationId => makeId<"LocationId">(value);

/** Tri-state count input for direct reconciliation (UNKNOWN/FAILED included). */
export interface CountReconciliationInput {
  readonly observationId: string;
  readonly skuId: string;
  readonly locationId: string;
  readonly kind: CountObservationKind;
  readonly observedAt: string;
  readonly resolution: ObservationResolution<number>;
  readonly capture?: { readonly sequence: number; readonly capturedAt: string };
}

/** POS sync input (sold units since the previous sync point). */
export interface PosSyncInput {
  readonly observationId: string;
  readonly skuId: string;
  readonly locationId: string;
  readonly unitsSold: number;
  readonly observedAt: string;
  readonly resolution?: ObservationResolution<{ readonly unitsSold: number }>;
}

export interface KernelLaneRecord {
  readonly executions: readonly CommandExecution[];
  /** Count-observation facts folded so far, in arrival order. */
  readonly countObservationIds: readonly string[];
}

/**
 * The real commerce lane behind the seam. `sink` is what the LocalCommerceEdge
 * hands off to; `reconcile()` then drives the real kernel; `facts()` reads
 * the real twin's demand-side query interface.
 */
export class CommerceKernelLane {
  private readonly kernel: CommerceKernel;
  private readonly actor: CommercePrincipalRef;
  private readonly pending: PhysicalObservation[] = [];
  private readonly executions: CommandExecution[] = [];
  private readonly countObservationIds: string[] = [];
  /** Online-fact capture stamps per subject (the freshness lookup input). */
  readonly onlineFactStamps = new Map<string, { sequence: number; capturedAt: string }>();
  private readonly observationKeys = new Set<string>();
  private clockTicks = 0;

  constructor(clockBaseIso = "2026-10-07T10:00:00Z") {
    this.kernel = new CommerceKernel({
      timeSource: () => new Date(Date.parse(clockBaseIso) + this.clockTicks++ * 1000).toISOString(),
    });
    this.actor = { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-edge-lane") };
  }

  /** The W3-002 seam sink — buffers observations (the seam is synchronous). */
  readonly sink: ReconciliationHandoffSink = (handoff: ReconciliationHandoff, observations: readonly PhysicalObservation[]) => {
    void handoff;
    this.pending.push(...observations.map((observation) => ({ ...observation })));
    return { outcome: "submitted" as const };
  };

  /** Seed canonical stock through the REAL kernel command path. */
  async receiveStock(skuId: string, locationId: string, units: number, reason = "PURCHASE_ORDER"): Promise<void> {
    await this.kernel.execute(
      commandEnvelope(
        makeId<"CommandId">(`cmd-receive-${skuId}-${locationId}-${units}-${reason}`),
        makeId<"IdempotencyKey">(`key-receive-${skuId}-${locationId}-${units}-${reason}`),
        this.actor,
        new Date().toISOString(),
        { type: "RECEIVE_STOCK", skuId: skuIdOf(skuId), locationId: locationIdOf(locationId), units, reason: reason as never },
      ),
    );
  }

  /** Reconcile one count observation through the REAL kernel (tri-state in). */
  async reconcileCount(input: CountReconciliationInput, policy: CountReconciliationPolicy = DEFAULT_COUNT_RECONCILIATION_POLICY): Promise<CommandExecution> {
    const observation: InventoryCountObservation = {
      observationId: makeId<"ObservationId">(input.observationId),
      kind: input.kind,
      skuId: skuIdOf(input.skuId),
      locationId: locationIdOf(input.locationId),
      observedAt: input.observedAt,
      source: { sourceType: "EDGE_DEVICE", sourceRef: "unicom-edge" },
      resolution: input.resolution,
    };
    const key = makeId<"IdempotencyKey">(`edge-count-${input.observationId}`);
    const commandId = makeId<"CommandId">(`cmd-count-${input.observationId}`);
    const execution = await this.kernel.execute(
      commandEnvelope(commandId, key, this.actor, input.observedAt, {
        type: "RECONCILE_COUNT_OBSERVATION",
        observation,
        policy,
      }),
    );
    this.executions.push(execution);
    if (execution.status === "EXECUTED") {
      this.countObservationIds.push(input.observationId);
      const subject = `${input.skuId}|${input.locationId}`;
      this.onlineFactStamps.set(subject, input.capture ?? { sequence: 0, capturedAt: input.observedAt });
    }
    return execution;
  }

  /** Reconcile one POS sync through the REAL kernel. */
  async reconcilePosSync(input: PosSyncInput): Promise<CommandExecution> {
    const observation: PosSyncObservation = {
      observationId: makeId<"ObservationId">(input.observationId),
      kind: "POS_SYNC",
      skuId: skuIdOf(input.skuId),
      locationId: locationIdOf(input.locationId),
      observedAt: input.observedAt,
      source: { sourceType: "POS", sourceRef: "unicom-edge" },
      resolution: input.resolution ?? { resolved: "OBSERVED", value: { unitsSold: input.unitsSold } },
    };
    const execution = await this.kernel.execute(
      commandEnvelope(
        makeId<"CommandId">(`cmd-possync-${input.observationId}`),
        makeId<"IdempotencyKey">(`edge-possync-${input.observationId}`),
        this.actor,
        input.observedAt,
        { type: "RECONCILE_POS_SYNC", observation },
      ),
    );
    this.executions.push(execution);
    return execution;
  }

  /**
   * Drive the buffered hand-off observations through the kernel. The
   * physical-observation → kernel-command mapping (the W1/W3 seam glue):
   * count-shaped observations become RECONCILE_COUNT_OBSERVATION commands
   * keyed by observation id — exactly-once by the kernel's own receipt
   * ledger. Weighted/other shapes are journaled as observations only.
   */
  async reconcile(options: { readonly skuOfBarcode?: (barcode: string) => string; readonly location?: string } = {}): Promise<void> {
    const location = options.location ?? "store-1";
    const backlog = this.pending.splice(0, this.pending.length);
    for (const observation of backlog) {
      const mapped = mapPhysicalObservation(observation, options.skuOfBarcode, location);
      if (mapped === undefined) continue;
      if (this.observationKeys.has(mapped.observationId)) continue;
      this.observationKeys.add(mapped.observationId);
      if (mapped.kind === "count") {
        await this.reconcileCount({
          observationId: mapped.observationId,
          skuId: mapped.skuId,
          locationId: mapped.locationId,
          kind: mapped.countKind,
          observedAt: observation.capture.capturedAt,
          resolution: { resolved: "OBSERVED", value: mapped.countedQuantity },
          capture: { sequence: 0, capturedAt: observation.capture.capturedAt },
        });
      } else {
        await this.reconcilePosSync({
          observationId: mapped.observationId,
          skuId: mapped.skuId,
          locationId: mapped.locationId,
          unitsSold: mapped.unitsSold,
          observedAt: observation.capture.capturedAt,
        });
      }
    }
  }

  /** The REAL demand-side facts interface over the twin. */
  facts(): CommerceFactsV1 {
    return CommerceTwin.fromEvents([...this.kernel.events()]).facts();
  }

  record(): KernelLaneRecord {
    return { executions: [...this.executions], countObservationIds: [...this.countObservationIds] };
  }
}

/** Map one physical observation onto a kernel command shape (seam glue). */
function mapPhysicalObservation(
  observation: PhysicalObservation,
  skuOfBarcode: ((barcode: string) => string) | undefined,
  defaultLocation: string,
):
  | { readonly kind: "count"; readonly observationId: string; readonly skuId: string; readonly locationId: string; readonly countKind: CountObservationKind; readonly countedQuantity: number }
  | { readonly kind: "pos-sync"; readonly observationId: string; readonly skuId: string; readonly locationId: string; readonly unitsSold: number }
  | undefined {
  const payload = observation.payload;
  if (payload.kind === "cycle-count" || payload.kind === "employee-count-entry" || payload.kind === "barcode-scan") {
    const entry =
      payload.kind === "cycle-count"
        ? payload.cycleCount.countedEntries[0]
        : payload.kind === "employee-count-entry"
          ? { barcode: undefined, productRef: undefined, countedQuantity: payload.employeeCount.countedQuantity }
          : { barcode: payload.scan.code, productRef: undefined, countedQuantity: "1" };
    if (entry === undefined) return undefined;
    const barcode = "barcode" in entry ? entry.barcode : undefined;
    const skuId =
      barcode !== undefined && skuOfBarcode !== undefined
        ? skuOfBarcode(barcode)
        : typeof entry.productRef === "string"
          ? entry.productRef.replace(/^product-/, "sku-")
          : barcode !== undefined
            ? `sku-${barcode}`
            : undefined;
    if (skuId === undefined) return undefined;
    const quantity = Number(entry.countedQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0) return undefined;
    return {
      kind: "count" as const,
      observationId: observation.observationId,
      skuId,
      locationId: defaultLocation,
      countKind: payload.kind === "barcode-scan" ? "BARCODE_COUNT" : payload.kind === "cycle-count" ? "CYCLE_COUNT" : "EMPLOYEE_COUNT",
      countedQuantity: quantity,
    };
  }
  if (payload.kind === "pos-sale-event") {
    const line = payload.transaction.lineItems[0];
    if (line === undefined) return undefined;
    const skuId =
      typeof line.productRef === "string"
        ? line.productRef.replace(/^product-/, "sku-")
        : line.barcode !== undefined && skuOfBarcode !== undefined
          ? skuOfBarcode(line.barcode)
          : line.barcode !== undefined
            ? `sku-${line.barcode}`
            : undefined;
    if (skuId === undefined) return undefined;
    const units = Number(line.quantity);
    // Weighted quantities ("1.24 kg") are measured-quantity sales — the
    // commerce seam has no fractional-unit POS sync yet (documented gap);
    // they stay observations and are NOT approximated into integer units.
    if (!Number.isSafeInteger(units) || units < 0) return undefined;
    return {
      kind: "pos-sync" as const,
      observationId: observation.observationId,
      skuId,
      locationId: defaultLocation,
      unitsSold: units,
    };
  }
  return undefined;
}

/** Commerce-branded idempotency key constructor (public contract). */
export const commerceIdem = (value: string): CommerceIdempotencyKey => makeId<"IdempotencyKey">(value);

/** UNKNOWN-resolution helper for tri-state fold tests (generic over the value channel). */
export const unknownResolution = <T>(reason: UnknownReason): ObservationResolution<T> => ({
  resolved: "UNKNOWN",
  reason,
} as ObservationResolution<T>);
