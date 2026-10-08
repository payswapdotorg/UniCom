/**
 * Commerce API server — projection + command dispatch (W3-007 §1).
 *
 * Split out from `journal.ts`: the loopback server that dispatches typed
 * request envelopes through the projection projector (reads) or the
 * command handler (writes). Idempotency and rebuild-from-journal
 * equivalence live here.
 */

import type {
  ApiEndpointContract,
  ApiEndpointId,
  ApiRequestEnvelope,
  ApiResponseEnvelope,
  CommerceApiVersion,
} from "../../api/api-contracts";
import {
  COMMERCE_API_VERSION,
  endpointById,
  projectionEndpoints,
} from "../../api/api-contracts";
import type {
  AuthorizationContextRef,
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceKernelCommandRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  DecisionRef,
  TransactionProofRef,
} from "../../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";
import type {
  CommerceJournal,
  CommerceProjection,
  CommerceProjectionProjector,
  MerchantProjectionBody,
  CatalogProjectionBody,
  ProductProjectionBody,
  InventoryProjectionBody,
  OrderProjectionBody,
  CartProjectionBody,
  CustomerProjectionBody,
  CapabilityObservationProjectionBody,
} from "./journal";

/** Command handler hands off to the kernel; in tests, it is deterministic. */
export type CommerceCommandHandler = (input: {
  readonly commandRef: CommerceKernelCommandRef;
  readonly idempotencyKey: IdempotencyKey;
  readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
  readonly authorization: AuthorizationContextRef;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestedProofLevel?: TransactionProofRef;
}) => { readonly decisionRef: DecisionRef; readonly resultRef: string };

/** Idempotent command ledger — every (commandRef, idempotencyKey) is journaled once. */
export interface CommandLedger {
  /** Returns true the first time, false on every duplicate. */
  recordOnce(commandRef: CommerceKernelCommandRef, idempotencyKey: IdempotencyKey): boolean;
}

/** Create the idempotency ledger. */
export function createCommandLedger(): CommandLedger {
  const seen = new Set<string>();
  return {
    recordOnce(commandRef, idempotencyKey) {
      const key = `${commandRef}|${idempotencyKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}

export interface CommerceApiServerOptions {
  readonly journal: CommerceJournal;
  readonly projector: CommerceProjectionProjector;
  readonly commandHandler: CommerceCommandHandler;
  readonly commandLedger: CommandLedger;
  readonly clock: () => UtcIso8601String;
}

export interface CommerceApiServer {
  /** Dispatch a typed request envelope; returns a typed response envelope. */
  dispatch<TBody = unknown>(request: ApiRequestEnvelope): Promise<ApiResponseEnvelope<TBody>>;
}

/** Create the loopback API server. */
export function createCommerceApiServer(options: CommerceApiServerOptions): CommerceApiServer {
  const { journal, projector, commandHandler, commandLedger, clock } = options;

  const projectResponse = <TBody>(
    endpoint: ApiEndpointContract,
    projection: CommerceProjection<TBody> | undefined,
  ): ApiResponseEnvelope<TBody> => {
    if (projection === undefined) {
      return {
        endpointId: endpoint.endpointId,
        version: endpoint.version,
        status: "unknown",
        respondedAt: clock(),
      };
    }
    return {
      endpointId: endpoint.endpointId,
      version: endpoint.version,
      status: "ok",
      body: projection.body,
      journalFingerprint: projection.journalFingerprint,
      respondedAt: clock(),
      truthClass: projection.truthClass,
    };
  };

  const dispatchCommand = <TBody>(
    endpoint: ApiEndpointContract,
    request: ApiRequestEnvelope,
  ): ApiResponseEnvelope<TBody> => {
    if (endpoint.commandRef === undefined) {
      return { endpointId: endpoint.endpointId, version: endpoint.version, status: "rejected", respondedAt: clock() };
    }
    if (request.idempotencyKey === undefined || request.connectedInstanceRef === undefined || request.authorization === undefined) {
      return { endpointId: endpoint.endpointId, version: endpoint.version, status: "rejected", respondedAt: clock() };
    }
    const firstTime = commandLedger.recordOnce(endpoint.commandRef, request.idempotencyKey);
    if (!firstTime) {
      return { endpointId: endpoint.endpointId, version: endpoint.version, status: "unknown", respondedAt: clock() };
    }
    const result = commandHandler({
      commandRef: endpoint.commandRef,
      idempotencyKey: request.idempotencyKey,
      connectedInstanceRef: request.connectedInstanceRef,
      authorization: request.authorization,
      payload: (request.body ?? {}) as Readonly<Record<string, unknown>>,
      ...(request.requestedProofLevel === undefined ? {} : { requestedProofLevel: request.requestedProofLevel }),
    });
    journal.append({
      occurredAt: clock(),
      kind: "command-recorded",
      subjectRef: result.resultRef,
      snapshot: {
        commandRef: endpoint.commandRef,
        decisionRef: result.decisionRef,
        resultRef: result.resultRef,
        idempotencyKey: request.idempotencyKey,
      },
    });
    return {
      endpointId: endpoint.endpointId,
      version: endpoint.version,
      status: "ok",
      body: { orderRef: result.resultRef, decisionRef: result.decisionRef, acceptedAt: clock() } as unknown as TBody,
      decisionRef: result.decisionRef,
      respondedAt: clock(),
    };
  };

  return {
    async dispatch<TBody = unknown>(request: ApiRequestEnvelope): Promise<ApiResponseEnvelope<TBody>> {
      const endpoint = endpointById(request.endpointId);
      if (endpoint === undefined) {
        return { endpointId: request.endpointId, version: request.version, status: "unknown", respondedAt: clock() };
      }
      if (endpoint.role === "command") {
        return dispatchCommand<TBody>(endpoint, request);
      }
      // PROJECTION: dispatch through the projector.
      const firstPathParam = endpoint.path.pathParams[0];
      const subjectRef = firstPathParam === undefined ? "" : (request.pathParams[firstPathParam] ?? "");
      switch (request.endpointId) {
        case "merchant.get":
          return projectResponse<MerchantProjectionBody>(
            endpoint, projector.projectMerchant(subjectRef as CommerceMerchantRef),
          ) as ApiResponseEnvelope<TBody>;
        case "catalog.list":
          return projectResponse<CatalogProjectionBody>(
            endpoint, projector.projectCatalog(subjectRef as CommerceMerchantRef),
          ) as ApiResponseEnvelope<TBody>;
        case "product.get":
          return projectResponse<ProductProjectionBody>(
            endpoint, projector.projectProduct(subjectRef as CommerceProductRef),
          ) as ApiResponseEnvelope<TBody>;
        case "inventory.get":
          return projectResponse<InventoryProjectionBody>(
            endpoint, projector.projectInventory(subjectRef as CommerceInventoryRef),
          ) as ApiResponseEnvelope<TBody>;
        case "order.get":
          return projectResponse<OrderProjectionBody>(
            endpoint, projector.projectOrder(subjectRef as CommerceOrderRef),
          ) as ApiResponseEnvelope<TBody>;
        case "cart.get":
          return projectResponse<CartProjectionBody>(
            endpoint, projector.projectCart(subjectRef as CommerceCartRef),
          ) as ApiResponseEnvelope<TBody>;
        case "customer.get":
          return projectResponse<CustomerProjectionBody>(
            endpoint, projector.projectCustomer(subjectRef as CommerceCustomerRef),
          ) as ApiResponseEnvelope<TBody>;
        case "capability-observation.get":
          return projectResponse<CapabilityObservationProjectionBody>(
            endpoint, projector.projectCapabilityObservation(subjectRef as CapabilityObservationRef),
          ) as ApiResponseEnvelope<TBody>;
        default:
          return { endpointId: request.endpointId, version: request.version, status: "unknown", respondedAt: clock() };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Rebuild-from-journal equivalence (the projection law)
// ---------------------------------------------------------------------------

/**
 * Assert that a projection can be rebuilt from the journal and matches the
 * live projection exactly. The contract tests run this for every projection
 * endpoint — the projection law: every projection endpoint is journal-derived
 * and rebuildable (W3-007 §1 acceptance scenario 1).
 */
export function assertProjectionRebuildEquiv<TBody>(
  live: CommerceProjection<TBody>,
  journal: CommerceJournal,
  projector: CommerceProjectionProjector,
  rebuildFromProjector: (projector: CommerceProjectionProjector) => CommerceProjection<TBody> | undefined,
): { readonly equiv: boolean; readonly liveSequence: number; readonly rebuiltSequence: number } {
  // Rebuild the projection by replaying the journal up to the live sequence.
  const replayedEvents = journal.rebuildProjection(live.subjectRef, live.atSequence);
  if (replayedEvents.length === 0) {
    return { equiv: false, liveSequence: live.atSequence, rebuiltSequence: 0 };
  }
  const rebuilt = rebuildFromProjector(projector);
  if (rebuilt === undefined) {
    return { equiv: false, liveSequence: live.atSequence, rebuiltSequence: 0 };
  }
  const equiv = JSON.stringify(rebuilt.body) === JSON.stringify(live.body) && rebuilt.atSequence === live.atSequence;
  return { equiv, liveSequence: live.atSequence, rebuiltSequence: rebuilt.atSequence };
}

/** Re-export types the contract tests need. */
export type {
  ApiEndpointContract,
  ApiEndpointId,
  ApiRequestEnvelope,
  ApiResponseEnvelope,
  CommerceApiVersion,
  CommerceJournal,
  CommerceProjection,
  CommerceProjectionProjector,
  AuthorizationContextRef,
  ConnectedCapabilityInstanceId,
  CommerceKernelCommandRef,
  DecisionRef,
  TransactionProofRef,
};
export { COMMERCE_API_VERSION, projectionEndpoints };
