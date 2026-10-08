/**
 * @unicom/commerce projection barrel (W1-003).
 *
 * Public projection surface, re-exported through the module's single public
 * entrypoint (src/contract.ts). The projection layer sits ABOVE the frozen
 * domain layer and CANNOT import the kernel runtime (architecture-policy
 * layerOrder: domain → projection → runtime) — the Commerce Twin is therefore
 * structurally incapable of holding in-process kernel references: it folds
 * the immutable event journal and nothing else.
 */
export {
  type ProjectionDefinition,
  type EventMigration,
  type ProjectionCheckpoint,
  type SequenceLawError,
  migrateEventToCurrent,
  ProjectionEngine,
  SequenceLawViolation,
} from "./engine.js";

export {
  COMMERCE_PROJECTION_SCHEMA_VERSION,
  LEGACY_PROJECTION_SCHEMA_VERSION,
  COMMERCE_EVENT_MIGRATIONS,
  migrateV1ToV2,
  migrateJournalToCurrent,
} from "./migrations.js";

export { canonicalJson, serializableClone, journalFingerprint } from "./serialize.js";

export {
  type CountObservationState,
  type InventoryReadModelState,
  INVENTORY_PROJECTION_ID,
  countObservationStateOf,
  inventoryReadModel,
} from "./inventory-projection.js";

export { type OrderReadModelState, ORDER_PROJECTION_ID, orderReadModel } from "./order-projection.js";
export { type TransferReadModelState, TRANSFER_PROJECTION_ID, transferReadModel } from "./transfer-projection.js";
export {
  type PurchaseOrderReceipt,
  type ReceivingReadModelState,
  RECEIVING_PROJECTION_ID,
  outstandingUnitsFor,
  receivingReadModel,
} from "./receiving-projection.js";
export { type ReturnsReadModelState, RETURNS_PROJECTION_ID, returnsReadModel } from "./returns-projection.js";
export {
  type ReconciliationCounters,
  type ReconciliationReadModelState,
  RECONCILIATION_PROJECTION_ID,
  reconciliationReadModel,
} from "./reconciliation-projection.js";
export {
  type SkuFact,
  type CatalogReadModelState,
  CATALOG_PROJECTION_ID,
  catalogReadModel,
} from "./catalog-projection.js";
export {
  type RecourseReadModelState,
  RECOURSE_PROJECTION_ID,
  recourseReadModel,
  capturesFor as capturesForRecourse,
  capturedTotalFor as capturedTotalForRecourse,
  refundedTotalFor as refundedTotalForRecourse,
  refundsOfKind as refundsOfKindRecourse,
  moneyInPaymentIds,
} from "./recourse-projection.js";
export {
  type StoreOpsReadModelState,
  STORE_OPS_PROJECTION_ID,
  storeOpsReadModel,
  openSessionFor as openSessionForStoreOps,
  variancesForSession,
} from "./store-ops-projection.js";

export {
  type TwinCollections,
  type TwinSerializableState,
  TwinState,
} from "./twin-state.js";
export { type TwinStateSnapshot, snapshotOfTwin } from "./twin-snapshot.js";

export {
  type TwinCheckpoint,
  TWIN_PROJECTION_ID,
  CommerceTwin,
  canonicalOfTwin,
  standardProjectionSet,
  twinProjection,
} from "./twin.js";

export {
  COMMERCE_FACTS_INTERFACE_ID,
  COMMERCE_FACTS_INTERFACE_VERSION,
  type CommerceFactsV1,
  type InventoryFactsV1,
  type OrderFactsV1,
  type PaymentFactsV1,
  type SupplyFactsV1,
  type ReturnFactsV1,
  type ReconciliationFactsV1,
  type CatalogFactsV1,
  type CircularFactsV1,
  type RecourseFactsV1,
  type StoreOpsFactsV1,
  type AutonomousStoreFactsV1,
  commerceFacts,
} from "./queries.js";

export {
  type TwinDivergence,
  type AuthoritativeSnapshotSource,
  compareTwinToAuthoritative,
  assertTwinMatchesAuthoritative,
  assertCanonicalEquivalence,
} from "./twin-verify.js";

// --- W1-007 (additive): merchant-parity projections ---

export {
  type AnalyticsReadModelState,
  ANALYTICS_PROJECTION_ID,
  analyticsReadModel,
  salesTotalOf,
  campaignDiscountOf,
} from "./analytics-projection.js";

export {
  type LoyaltyReadModelState,
  LOYALTY_PROJECTION_ID,
  loyaltyReadModel,
  ledgerEntriesFor,
} from "./loyalty-projection.js";

export {
  type ForecastingReadModelState,
  FORECASTING_PROJECTION_ID,
  forecastingReadModel,
} from "./forecasting-projection.js";
