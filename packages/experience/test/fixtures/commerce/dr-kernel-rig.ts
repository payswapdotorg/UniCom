/**
 * W3-006 DR kernel rig — the REAL `@unicom/commerce` kernel behind the
 * DR runbook's persistence ports. NOT A MOCK: export walks the kernel's own
 * `persistentState()`, restore replays through `ingestHistoricalEvent`/
 * `ingestHistoricalReceipt`/`restoreMintCursor` (the crash-recovery path),
 * and rebuild proves twin ≡ kernel via Worker 1's public compare harness.
 * The experience plane's runbook code only ever sees the typed ports.
 */

import {
  CommerceKernel,
  CommerceTwin,
  canonicalJson,
  commandEnvelope,
  compareTwinToAuthoritative,
  journalFingerprint,
  makeId,
  reconstructAuthoritativeState,
  type AnyCommerceEvent,
  type CommerceKernelOptions,
  type KernelPersistentState,
} from "@unicom/commerce";
import type {
  KernelStateExportPort,
  KernelStateRestorePort,
  ProjectionRebuildResult,
} from "../../../src/deployment/runbook";
import { CommerceKernelLane } from "./kernel-rig";

/** Deterministic kernel-side time (no hidden wall clock). */
const DR_CLOCK_BASE = "2026-10-08T08:00:00Z";
let drTicks = 0;
const drTimeSource = (): string =>
  new Date(Date.parse(DR_CLOCK_BASE) + drTicks++ * 1000).toISOString();

const kernelOptions = (): CommerceKernelOptions => ({ timeSource: drTimeSource });

/** Drive a real production-like workload into a fresh kernel lane. */
export async function seedDrWorkload(): Promise<CommerceKernelLane> {
  const lane = new CommerceKernelLane(DR_CLOCK_BASE);
  await lane.receiveStock("sku-dr-laptop", "store-dr", 12, "PURCHASE_ORDER");
  await lane.receiveStock("sku-dr-scale", "store-dr", 40, "PURCHASE_ORDER");
  await lane.reconcileCount({
    observationId: "obs-dr-count-1",
    skuId: "sku-dr-laptop",
    locationId: "store-dr",
    kind: "CYCLE_COUNT",
    observedAt: "2026-10-08T08:05:00Z",
    resolution: { resolved: "OBSERVED", value: 11 },
  });
  await lane.reconcilePosSync({
    observationId: "obs-dr-pos-1",
    skuId: "sku-dr-scale",
    locationId: "store-dr",
    unitsSold: 3,
    observedAt: "2026-10-08T08:10:00Z",
  });
  await lane.reconcileCount({
    observationId: "obs-dr-count-2",
    skuId: "sku-dr-scale",
    locationId: "store-dr",
    kind: "CYCLE_COUNT",
    observedAt: "2026-10-08T08:15:00Z",
    resolution: { resolved: "OBSERVED", value: 37 },
  });
  return lane;
}

/** Export port over the real kernel's persistent state. */
export function kernelStateExportPortOf(lane: CommerceKernelLane): KernelStateExportPort {
  return {
    exportKernelState() {
      const state: KernelPersistentState = lane.persistentState();
      return [
        ...state.events.map((event) => ({
          kind: "event" as const,
          recordId: event.eventId,
          canonicalPayload: canonicalJson(event),
        })),
        ...state.receipts.map((receipt) => ({
          kind: "receipt" as const,
          recordId: receipt.receiptId,
          canonicalPayload: canonicalJson(receipt),
        })),
        {
          kind: "mint-cursor" as const,
          recordId: "kernel-mint-cursor",
          canonicalPayload: JSON.stringify(state.mintCursor),
        },
      ];
    },
    get journalFingerprint(): string {
      return journalFingerprint(lane.events() as readonly AnyCommerceEvent[]);
    },
  };
}

/** The restore side: a FRESH real kernel that ingests the backup records. */
export interface RestoreKernelRig {
  readonly restorePort: KernelStateRestorePort;
  /** The restored kernel's persistent state (assertion access). */
  restoredState(): KernelPersistentState | undefined;
  /** The restored kernel's journal-law verdict. */
  restoredJournalIsValid(): boolean;
  /**
   * Replay one of the ORIGINAL commands (same deterministic command id +
   * idempotency key as the source lane): a correctly restored kernel must
   * answer DUPLICATE — exactly-once behavior survives the restore.
   */
  replayOriginalReceiveStock(input: {
    readonly skuId: string;
    readonly locationId: string;
    readonly units: number;
    readonly reason: string;
  }): Promise<"EXECUTED" | "DUPLICATE" | "REJECTED" | "no-kernel">;
}

export function createRestoreKernelRig(): RestoreKernelRig {
  let kernel: CommerceKernel | undefined;
  return {
    restorePort: {
      importKernelState(records) {
        kernel = new CommerceKernel(kernelOptions());
        let importedEvents = 0;
        let importedReceipts = 0;
        for (const record of records) {
          if (record.kind === "event") {
            kernel.ingestHistoricalEvent(JSON.parse(record.canonicalPayload) as AnyCommerceEvent);
            importedEvents += 1;
          } else if (record.kind === "receipt") {
            kernel.ingestHistoricalReceipt(JSON.parse(record.canonicalPayload));
            importedReceipts += 1;
          } else {
            kernel.restoreMintCursor(JSON.parse(record.canonicalPayload) as number);
          }
        }
        return { importedEvents, importedReceipts };
      },
      get journalFingerprint(): string {
        return kernel === undefined ? "" : journalFingerprint(kernel.events());
      },
    },
    restoredState(): KernelPersistentState | undefined {
      return kernel?.persistentState();
    },
    restoredJournalIsValid(): boolean {
      return kernel === undefined ? false : kernel.journalIsValid();
    },
    async replayOriginalReceiveStock(input) {
      if (kernel === undefined) return "no-kernel";
      const actor = {
        kind: "SYSTEM" as const,
        systemPrincipalId: makeId<"SystemPrincipalId">("system-edge-lane"),
      };
      const execution = await kernel.execute(
        commandEnvelope(
          makeId<"CommandId">(`cmd-receive-${input.skuId}-${input.locationId}-${input.units}-${input.reason}`),
          makeId<"IdempotencyKey">(`key-receive-${input.skuId}-${input.locationId}-${input.units}-${input.reason}`),
          actor,
          drTimeSource(),
          {
            type: "RECEIVE_STOCK",
            skuId: makeId<"SkuId">(input.skuId),
            locationId: makeId<"LocationId">(input.locationId),
            units: input.units,
            reason: input.reason as never,
          },
        ),
      );
      return execution.status;
    },
  };
}

/**
 * Rebuild-from-journal port: reconstruct AUTHORITATIVE state from the event
 * journal ALONE, rebuild every projection through the real Commerce Twin,
 * and prove projections ≡ authoritative state via Worker 1's own compare.
 */
export function projectionRebuildPortOf(lane: CommerceKernelLane): {
  readonly rebuild: () => ProjectionRebuildResult;
} {
  return {
    rebuild: (): ProjectionRebuildResult => {
      const events = lane.events() as readonly AnyCommerceEvent[];
      const authoritative = reconstructAuthoritativeState([...events], kernelOptions());
      const twin = CommerceTwin.fromEvents([...events]);
      const divergences = compareTwinToAuthoritative(twin.snapshot(), authoritative.snapshot());
      const authoritativeFingerprint = `${journalFingerprint(events)}::${canonicalJson(authoritative.snapshot())}`;
      const projectionFingerprint = `${journalFingerprint(events)}::${canonicalJson(twin.snapshot())}`;
      const comparedCollections = 33; // twin-verify COLLECTIONS length (structural)
      return {
        replayedEvents: events.length,
        authoritativeFingerprint,
        projectionFingerprint,
        projectionsMatch: divergences.length === 0 && authoritativeFingerprint === projectionFingerprint,
        operationsConsumed: events.length * 2 + comparedCollections,
      };
    },
  };
}
