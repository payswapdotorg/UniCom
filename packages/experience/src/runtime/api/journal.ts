/**
 * Commerce API journal + projector — the projection law foundation (W3-007 §1).
 *
 * Split out from `server.ts` for the architecture line budget. The journal
 * is the single source of historical truth; the projector derives typed
 * projections from journaled events. Together they assert the projection
 * law: every projection response is journal-derived and rebuildable from
 * the journal.
 */

import type { ApiEndpointId } from "../../api/api-contracts";
import type {
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceLocationRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
} from "../../common/opaque-refs";
import type { MoneyString, UtcIso8601String } from "../../common/values";
import type { TruthClass } from "../../common/evidence";
import type { UntrustedCommerceContent } from "../../common/untrusted";

// ---------------------------------------------------------------------------
// Journal — the single source of historical truth the projection derives from
// ---------------------------------------------------------------------------

/** One journaled event the projection projector derives from. */
export interface CommerceJournalEvent {
  readonly eventId: string;
  readonly sequence: number;
  readonly occurredAt: UtcIso8601String;
  readonly kind:
    | "merchant-profiled"
    | "catalog-published"
    | "product-listed"
    | "inventory-adjusted"
    | "order-placed"
    | "cart-opened"
    | "customer-enrolled"
    | "capability-observed"
    | "command-recorded";
  /** Opaque subject ref the event pertains to. */
  readonly subjectRef: string;
  /** Snapshot fields the projector renders; opaque refs preserved. */
  readonly snapshot: Readonly<Record<string, unknown>>;
}

/** Append-only journal. */
export interface CommerceJournal {
  append(event: Omit<CommerceJournalEvent, "sequence" | "eventId">): CommerceJournalEvent;
  events(): readonly CommerceJournalEvent[];
  /** A deterministic fingerprint over the journal's current sequence. */
  fingerprint(): string;
  /** Rebuild a projection from the journal as of a sequence (rebuild-from-journal equivalence). */
  rebuildProjection<TSubjectRef extends string>(
    subjectRef: TSubjectRef,
    asOfSequence?: number,
  ): readonly CommerceJournalEvent[];
  /** Last event id seen — used by the rebuild-equivalence contract test. */
  lastEventId(): string | undefined;
}

/** Create the append-only journal. */
export function createCommerceJournal(clock: () => UtcIso8601String): CommerceJournal {
  const events: CommerceJournalEvent[] = [];
  let sequence = 0;
  let lastEventId: string | undefined;
  void clock; // clock is the source of `occurredAt` callers pass in; reserved for future use
  return {
    append(input) {
      sequence += 1;
      const eventId = `evt-${sequence}-${input.kind}`;
      const event: CommerceJournalEvent = {
        eventId,
        sequence,
        occurredAt: input.occurredAt,
        kind: input.kind,
        subjectRef: input.subjectRef,
        snapshot: input.snapshot,
      };
      events.push(event);
      lastEventId = eventId;
      return event;
    },
    events() {
      return [...events];
    },
    fingerprint() {
      return `seq=${sequence};last=${lastEventId ?? "none"}`;
    },
    rebuildProjection(subjectRef, asOfSequence) {
      const cutoff = asOfSequence ?? sequence;
      return events.filter(
        (event) => event.subjectRef === subjectRef && event.sequence <= cutoff,
      );
    },
    lastEventId() {
      return lastEventId;
    },
  };
}

// ---------------------------------------------------------------------------
// Projection body shapes (one per projection resource)
// ---------------------------------------------------------------------------

export interface MerchantProjectionBody {
  readonly merchantRef: CommerceMerchantRef;
  readonly displayName: string;
  readonly defaultCurrency: string;
  readonly asOf: UtcIso8601String;
}
export interface CatalogProjectionBody {
  readonly catalogRef: CommerceCatalogRef;
  readonly productRefs: readonly CommerceProductRef[];
  readonly asOf: UtcIso8601String;
}
export interface ProductProjectionBody {
  readonly productRef: CommerceProductRef;
  readonly sku: string;
  readonly priceDisplay: MoneyString;
  readonly description?: UntrustedCommerceContent<string>;
  readonly asOf: UtcIso8601String;
}
export interface InventoryProjectionBody {
  readonly inventoryRef: CommerceInventoryRef;
  readonly productRef: CommerceProductRef;
  readonly locationRef: CommerceLocationRef;
  readonly onHandDisplay: string;
  readonly asOf: UtcIso8601String;
}
export interface OrderProjectionBody {
  readonly orderRef: CommerceOrderRef;
  readonly orderNumber: string;
  readonly totalDisplay: MoneyString;
  readonly paymentStatus: "paid" | "pending" | "failed" | "refunded" | "unknown";
  readonly asOf: UtcIso8601String;
}
export interface CartProjectionBody {
  readonly cartRef: CommerceCartRef;
  readonly estimatedTotalDisplay: MoneyString;
  readonly asOf: UtcIso8601String;
}
export interface CustomerProjectionBody {
  readonly customerRef: CommerceCustomerRef;
  readonly displayName: string;
  readonly loyaltyStatus: "none" | "member" | "tiered" | "unknown";
  readonly asOf: UtcIso8601String;
}
export interface CapabilityObservationProjectionBody {
  readonly observationRef: CapabilityObservationRef;
  readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
  readonly status: "NOMINAL" | "DEGRADED" | "UNKNOWN";
  readonly observedAt: UtcIso8601String;
}

/** One projected subject (a resource snapshot). */
export interface CommerceProjection<TBody = unknown> {
  readonly endpointId: ApiEndpointId;
  readonly subjectRef: string;
  readonly body: TBody;
  readonly truthClass: TruthClass;
  readonly asOf: UtcIso8601String;
  /** Sequence the projection was derived from. */
  readonly atSequence: number;
  /** Rebuild fingerprint at projection time. */
  readonly journalFingerprint: string;
}

// ---------------------------------------------------------------------------
// Projector — derives typed projections from journaled events
// ---------------------------------------------------------------------------

/** Projector — derives typed projections from journaled events. */
export interface CommerceProjectionProjector {
  projectMerchant(merchantRef: CommerceMerchantRef): CommerceProjection<MerchantProjectionBody> | undefined;
  projectCatalog(merchantRef: CommerceMerchantRef): CommerceProjection<CatalogProjectionBody> | undefined;
  projectProduct(productRef: CommerceProductRef): CommerceProjection<ProductProjectionBody> | undefined;
  projectInventory(inventoryRef: CommerceInventoryRef): CommerceProjection<InventoryProjectionBody> | undefined;
  projectOrder(orderRef: CommerceOrderRef): CommerceProjection<OrderProjectionBody> | undefined;
  projectCart(cartRef: CommerceCartRef): CommerceProjection<CartProjectionBody> | undefined;
  projectCustomer(customerRef: CommerceCustomerRef): CommerceProjection<CustomerProjectionBody> | undefined;
  projectCapabilityObservation(
    observationRef: CapabilityObservationRef,
  ): CommerceProjection<CapabilityObservationProjectionBody> | undefined;
}

/** Create the projector over a journal. */
export function createProjectionProjector(journal: CommerceJournal): CommerceProjectionProjector {
  const latest = (subjectRef: string, kind: CommerceJournalEvent["kind"]): CommerceJournalEvent | undefined => {
    const events = journal.events().filter((event) => event.subjectRef === subjectRef && event.kind === kind);
    return events[events.length - 1];
  };

  const projection = <TBody>(
    endpointId: ApiEndpointId,
    subjectRef: string,
    body: TBody,
    truthClass: TruthClass,
    atSequence: number,
  ): CommerceProjection<TBody> => ({
    endpointId,
    subjectRef,
    body,
    truthClass,
    asOf: new Date(0).toISOString() as UtcIso8601String,
    atSequence,
    journalFingerprint: journal.fingerprint(),
  });

  return {
    projectMerchant(merchantRef) {
      const event = latest(merchantRef, "merchant-profiled");
      if (event === undefined) return undefined;
      return projection<MerchantProjectionBody>(
        "merchant.get",
        merchantRef,
        {
          merchantRef,
          displayName: event.snapshot.displayName as string,
          defaultCurrency: event.snapshot.defaultCurrency as string,
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectCatalog(merchantRef) {
      const event = latest(merchantRef, "catalog-published");
      if (event === undefined) return undefined;
      return projection<CatalogProjectionBody>(
        "catalog.list",
        merchantRef,
        {
          catalogRef: event.snapshot.catalogRef as CommerceCatalogRef,
          productRefs: event.snapshot.productRefs as readonly CommerceProductRef[],
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectProduct(productRef) {
      const event = latest(productRef, "product-listed");
      if (event === undefined) return undefined;
      return projection<ProductProjectionBody>(
        "product.get",
        productRef,
        {
          productRef,
          sku: event.snapshot.sku as string,
          priceDisplay: event.snapshot.priceDisplay as MoneyString,
          ...(event.snapshot.description === undefined
            ? {}
            : { description: event.snapshot.description as UntrustedCommerceContent<string> }),
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectInventory(inventoryRef) {
      const event = latest(inventoryRef, "inventory-adjusted");
      if (event === undefined) return undefined;
      return projection<InventoryProjectionBody>(
        "inventory.get",
        inventoryRef,
        {
          inventoryRef,
          productRef: event.snapshot.productRef as CommerceProductRef,
          locationRef: event.snapshot.locationRef as CommerceLocationRef,
          onHandDisplay: event.snapshot.onHandDisplay as string,
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectOrder(orderRef) {
      const event = latest(orderRef, "order-placed");
      if (event === undefined) return undefined;
      return projection<OrderProjectionBody>(
        "order.get",
        orderRef,
        {
          orderRef,
          orderNumber: event.snapshot.orderNumber as string,
          totalDisplay: event.snapshot.totalDisplay as MoneyString,
          paymentStatus: event.snapshot.paymentStatus as OrderProjectionBody["paymentStatus"],
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectCart(cartRef) {
      const event = latest(cartRef, "cart-opened");
      if (event === undefined) return undefined;
      return projection<CartProjectionBody>(
        "cart.get",
        cartRef,
        {
          cartRef,
          estimatedTotalDisplay: event.snapshot.estimatedTotalDisplay as MoneyString,
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectCustomer(customerRef) {
      const event = latest(customerRef, "customer-enrolled");
      if (event === undefined) return undefined;
      return projection<CustomerProjectionBody>(
        "customer.get",
        customerRef,
        {
          customerRef,
          displayName: event.snapshot.displayName as string,
          loyaltyStatus: event.snapshot.loyaltyStatus as CustomerProjectionBody["loyaltyStatus"],
          asOf: event.occurredAt,
        },
        "operational",
        event.sequence,
      );
    },
    projectCapabilityObservation(observationRef) {
      const event = latest(observationRef, "capability-observed");
      if (event === undefined) return undefined;
      return projection<CapabilityObservationProjectionBody>(
        "capability-observation.get",
        observationRef,
        {
          observationRef,
          connectedInstanceRef: event.snapshot.connectedInstanceRef as ConnectedCapabilityInstanceId,
          status: event.snapshot.status as CapabilityObservationProjectionBody["status"],
          observedAt: event.occurredAt,
        },
        "observed",
        event.sequence,
      );
    },
  };
}

// The projection body types and CommerceProjection / CommerceProjectionProjector
// are exported by their declarations above; no re-export block needed.
