/**
 * Catalog read model: event-derived facts about the SKUs commerce has acted
 * on. The commerce kernel's journal carries no product-definition events
 * (catalog entities are W1-001 frozen domain values, not journal aggregates),
 * so this projection reports REFERENCED-CATALOG FACTS ONLY: which SKUs have
 * been acted on, where they have been seen, and the flows that referenced
 * them. It is never a second source of product truth — it is the demand-side
 * index over commerce facts.
 *
 * Counting semantics (exact, never approximate): each counter counts the
 * journal events that OPENED or materially referenced a flow line —
 * ORDER_PLACED lines, CART line-mutation events whose resulting cart contains
 * the SKU, TRANSFER_OPENED / PURCHASE_ORDER_OPENED / RETURN_REQUESTED /
 * FULFILLMENT_OPENED lines, PURCHASE_ORDER_RECEIVED receipt lines,
 * LISTING_OPENED and RENTAL_OPENED. State-machine progress events
 * (*_STATE_CHANGED) re-emit whole aggregates and are deliberately NOT
 * counted — facts must not inflate as lifecycles advance.
 */
import type { LocationId, SkuId } from "../domain/ids.js";
import type { Cart } from "../domain/cart.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { FulfillmentOrder } from "../domain/fulfillment.js";
import type { ReturnAuthorization } from "../domain/returns.js";
import type { StockTransfer } from "../domain/transfers.js";
import type { PurchaseOrder, ReceivingLine } from "../domain/purchasing.js";
import type { ResaleListing, RentalAgreement } from "../domain/circular.js";
import type { CanonicalInventoryLevel } from "../domain/inventory.js";
import type { ProjectionDefinition } from "./engine.js";

export interface SkuFact {
  readonly skuId: SkuId;
  /** Journal time of the first event referencing this SKU. */
  readonly firstSeenAt: string;
  /** Locations the SKU has been seen at (sorted — deterministic). */
  readonly locations: readonly LocationId[];
  readonly orderLineReferences: number;
  readonly cartEventReferences: number;
  readonly transferLineReferences: number;
  readonly purchaseOrderLineReferences: number;
  readonly receiptLineReferences: number;
  readonly fulfillmentLineReferences: number;
  readonly returnLineReferences: number;
  readonly listingReferences: number;
  readonly rentalReferences: number;
}

export interface CatalogReadModelState {
  readonly skus: ReadonlyMap<string, SkuFact>;
}

export const CATALOG_PROJECTION_ID = "catalog/v2";

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

type MutableFact = { -readonly [K in keyof SkuFact]: SkuFact[K] };

function emptyFact(skuId: string, firstSeenAt: string): MutableFact {
  return {
    skuId: skuId as SkuId,
    firstSeenAt,
    locations: [],
    orderLineReferences: 0,
    cartEventReferences: 0,
    transferLineReferences: 0,
    purchaseOrderLineReferences: 0,
    receiptLineReferences: 0,
    fulfillmentLineReferences: 0,
    returnLineReferences: 0,
    listingReferences: 0,
    rentalReferences: 0,
  };
}

interface Working {
  readonly skus: Map<string, SkuFact>;
  readonly fact: MutableFact;
}

function open(state: CatalogReadModelState, skuId: string, occurredAt: string): Working {
  const skus = new Map(state.skus);
  const existing = skus.get(skuId);
  const fact: MutableFact = existing
    ? { ...existing, locations: [...existing.locations] }
    : emptyFact(skuId, occurredAt);
  return { skus, fact };
}

function seeLocation(fact: MutableFact, locationId: unknown): void {
  if (typeof locationId !== "string") return;
  if (!fact.locations.includes(locationId as LocationId)) {
    fact.locations = [...fact.locations, locationId as LocationId];
  }
}

function commit(working: Working): CatalogReadModelState {
  working.fact.locations = [...working.fact.locations].sort() as LocationId[];
  working.skus.set(working.fact.skuId, working.fact as SkuFact);
  return { skus: working.skus };
}

function foldSkuLines(
  state: CatalogReadModelState,
  occurredAt: string,
  skuIds: readonly string[],
  bump: (fact: MutableFact) => void,
  locationId?: unknown,
): CatalogReadModelState {
  let next = state;
  for (const skuId of new Set(skuIds)) {
    const working = open(next, skuId, occurredAt);
    bump(working.fact);
    seeLocation(working.fact, locationId);
    next = commit(working);
  }
  return next;
}

export const catalogReadModel: ProjectionDefinition<CatalogReadModelState> = {
  projectionId: CATALOG_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): CatalogReadModelState => ({ skus: new Map<string, SkuFact>() }),
  apply(state, event): CatalogReadModelState {
    const payload = event.payload as PayloadLike | null | undefined;
    if (!payload || typeof payload !== "object") return state;
    const at = event.occurredAt;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    switch (event.subject.subjectType) {
      case "INVENTORY_LEVEL": {
        const level = payload.resultingLevel as CanonicalInventoryLevel | undefined;
        if (!level) return state;
        const working = open(state, level.skuId, at);
        seeLocation(working.fact, level.locationId);
        return commit(working);
      }
      case "CART": {
        if (kind !== "CART_LINE_ADDED" && kind !== "CART_LINE_REMOVED") return state;
        const cart = payload.cart as Cart | undefined;
        if (!cart) return state;
        return foldSkuLines(
          state,
          at,
          cart.lines.map((line) => line.skuId),
          (fact) => {
            fact.cartEventReferences += 1;
          },
        );
      }
      case "ORDER": {
        if (kind !== "ORDER_PLACED") return state;
        const snapshot = payload.snapshot as OrderSnapshot | undefined;
        if (!snapshot) return state;
        return foldSkuLines(
          state,
          at,
          snapshot.lines.map((line) => line.skuId),
          (fact) => {
            fact.orderLineReferences += 1;
          },
        );
      }
      case "STOCK_TRANSFER": {
        if (kind !== "TRANSFER_OPENED") return state;
        const transfer = payload.transfer as StockTransfer | undefined;
        if (!transfer) return state;
        const withLocations = (fact: MutableFact) => {
          fact.transferLineReferences += 1;
          seeLocation(fact, transfer.fromLocationId);
          seeLocation(fact, transfer.toLocationId);
        };
        return foldSkuLines(
          state,
          at,
          transfer.lines.map((line) => line.skuId),
          withLocations,
        );
      }
      case "PURCHASE_ORDER": {
        const po = payload.purchaseOrder as PurchaseOrder | undefined;
        if (!po) return state;
        if (kind === "PURCHASE_ORDER_OPENED") {
          return foldSkuLines(
            state,
            at,
            po.lines.map((line) => line.skuId),
            (fact) => {
              fact.purchaseOrderLineReferences += 1;
              seeLocation(fact, po.destinationLocationId);
            },
          );
        }
        if (kind === "PURCHASE_ORDER_RECEIVED") {
          const receipt = payload.receipt as readonly ReceivingLine[] | undefined;
          if (!receipt) return state;
          return foldSkuLines(
            state,
            at,
            receipt.map((line) => line.skuId),
            (fact) => {
              fact.receiptLineReferences += 1;
            },
          );
        }
        return state;
      }
      case "FULFILLMENT_ORDER": {
        if (kind !== "FULFILLMENT_OPENED") return state;
        const fulfillment = payload.fulfillment as FulfillmentOrder | undefined;
        if (!fulfillment) return state;
        return foldSkuLines(
          state,
          at,
          fulfillment.lines.map((line) => line.skuId),
          (fact) => {
            fact.fulfillmentLineReferences += 1;
            if (fulfillment.originLocationId) seeLocation(fact, fulfillment.originLocationId);
          },
        );
      }
      case "RETURN": {
        if (kind !== "RETURN_REQUESTED") return state;
        const authorization = payload.authorization as ReturnAuthorization | undefined;
        if (!authorization) return state;
        return foldSkuLines(
          state,
          at,
          authorization.lines.map((line) => line.skuId),
          (fact) => {
            fact.returnLineReferences += 1;
          },
        );
      }
      case "RESALE_LISTING": {
        if (kind !== "LISTING_OPENED") return state;
        const listing = payload.listing as ResaleListing | undefined;
        if (!listing) return state;
        return foldSkuLines(state, at, [listing.skuRef], (fact) => {
          fact.listingReferences += 1;
        });
      }
      case "RENTAL_AGREEMENT": {
        if (kind !== "RENTAL_OPENED") return state;
        const rental = payload.rental as RentalAgreement | undefined;
        if (!rental) return state;
        return foldSkuLines(state, at, [rental.itemSkuRef], (fact) => {
          fact.rentalReferences += 1;
        });
      }
      default:
        return state;
    }
  },
};
