/**
 * Physical commerce observation boundary
 * (FROZEN-ARCHITECTURE §9, §22.4-§22.6, docs/SUPERMARKET-WITHOUT-RFID.md).
 *
 * POS, barcode, camera, QR, NFC, RFID (optional), scales, receipts, cycle
 * counts, local-network and file-import observations are OBSERVATIONS —
 * never canonical state. Source classes encode the supermarket truth
 * hierarchy. RFID is optional: barcode/camera/POS/file/receipt/local-edge
 * paths are first-class without it (INVARIANT 46).
 */

import type {
  CommerceLocationRef,
  CommerceProductRef,
  LocalEdgeDeviceId,
  PhysicalObservationId,
} from "../common/opaque-refs";
import type { UntrustedCommerceContent, ExternalDocumentContent, SupplierFileContent } from "../common/untrusted";
import type { MoneyString, UtcIso8601String } from "../common/values";

/** Kinds of physical commerce observation. */
export type PhysicalObservationKind =
  | "pos-sale-event"
  | "pos-refund-event"
  | "barcode-scan"
  | "camera-capture"
  | "qr-scan"
  | "nfc-tap"
  | "rfid-read"
  | "weight-measurement"
  | "cycle-count"
  | "shelf-photo"
  | "employee-count-entry"
  | "supplier-report"
  | "receipt-capture"
  | "invoice-capture"
  | "file-import"
  | "local-network-service-event"
  | "usb-serial-device-event"
  | "browser-backoffice-observation";

/** Where an observation came from (supermarket truth hierarchy, no-RFID doc). */
export type ObservationSourceClass =
  | "pos-reported"
  | "barcode-scan"
  | "employee-entered"
  | "supplier-reported"
  | "visual-estimate"
  | "automated-sensor";

/** Capture context of an observation. */
export interface ObservationCaptureContext {
  readonly capturedAt: UtcIso8601String;
  readonly capturedBy: "edge-device" | "employee" | "automated-sensor" | "imported-file";
  readonly captureMode: "online" | "offline";
  readonly deviceRef: LocalEdgeDeviceId;
  readonly locationRef?: CommerceLocationRef;
}

/** Barcode payload. */
export interface BarcodeScanPayload {
  readonly symbology: "gtin" | "upc" | "ean" | "code128" | "qr" | "other";
  readonly code: string;
  readonly scanContext: "count" | "receiving" | "transfer" | "lookup" | "sale";
}

/** Camera capture payload. */
export interface CameraCapturePayload {
  readonly mediaArtifactRef: string;
  readonly interpretation: "raw-image" | "shelf-estimate" | "label-mismatch" | "product-identification";
}

/** Weight measurement payload. */
export interface WeightMeasurementPayload {
  readonly measuredAmount: string;
  readonly unit: "g" | "kg" | "lb" | "oz";
  readonly scaleDeviceRef: string;
  readonly productRef?: CommerceProductRef;
}

/** Cycle count payload (one count session). */
export interface CycleCountPayload {
  readonly countedEntries: readonly {
    readonly productRef?: CommerceProductRef;
    readonly barcode?: string;
    readonly countedQuantity: string;
  }[];
}

/** POS sale/refund event payload. */
export interface PosTransactionPayload {
  readonly posTerminalRef: string;
  readonly transactionRef: string;
  readonly lineItems: readonly { readonly barcode?: string; readonly productRef?: CommerceProductRef; readonly quantity: string }[];
  readonly totalDisplay: MoneyString;
}

/** Receipt/invoice capture (third-party documents are untrusted data). */
export interface ReceiptCapturePayload {
  readonly mediaArtifactRef: string;
  readonly parsedContent?: UntrustedCommerceContent<ExternalDocumentContent>;
}

/** Supplier report payload (untrusted). */
export interface SupplierReportPayload {
  readonly reportContent: UntrustedCommerceContent<SupplierFileContent>;
}

/** Imported file payload (untrusted). */
export interface FileImportPayload {
  readonly fileKind: "csv" | "xml" | "json" | "edi" | "excel";
  readonly sourcePath: string;
  readonly storedArtifactRef: string;
}

/** RFID read payload (optional transport). */
export interface RfidReadPayload {
  readonly reads: readonly { readonly tagId: string; readonly antennaRef: string }[];
}

/** Employee-entered count payload. */
export interface EmployeeCountPayload {
  readonly countedQuantity: string;
  readonly note?: string;
}

/** Payload union keyed by observation kind. */
export type PhysicalObservationPayload =
  | { readonly kind: "pos-sale-event" | "pos-refund-event"; readonly transaction: PosTransactionPayload }
  | { readonly kind: "barcode-scan" | "qr-scan"; readonly scan: BarcodeScanPayload }
  | { readonly kind: "camera-capture" | "shelf-photo"; readonly capture: CameraCapturePayload }
  | { readonly kind: "nfc-tap"; readonly tap: { readonly tagRef: string } }
  | { readonly kind: "rfid-read"; readonly rfid: RfidReadPayload }
  | { readonly kind: "weight-measurement"; readonly weight: WeightMeasurementPayload }
  | { readonly kind: "cycle-count"; readonly cycleCount: CycleCountPayload }
  | { readonly kind: "employee-count-entry"; readonly employeeCount: EmployeeCountPayload }
  | { readonly kind: "supplier-report"; readonly supplierReport: SupplierReportPayload }
  | { readonly kind: "receipt-capture" | "invoice-capture"; readonly receipt: ReceiptCapturePayload }
  | { readonly kind: "file-import"; readonly fileImport: FileImportPayload }
  | { readonly kind: "local-network-service-event"; readonly serviceEvent: { readonly serviceNote: string } }
  | { readonly kind: "usb-serial-device-event"; readonly deviceEvent: { readonly deviceNote: string } }
  | { readonly kind: "browser-backoffice-observation"; readonly backoffice: { readonly pageNote: string } };

/**
 * A physical commerce observation. Its truth class is ALWAYS "observed" —
 * it can never silently become authoritative operational state
 * (INVARIANTS 29/47; FROZEN §22.6).
 */
export interface PhysicalObservation {
  readonly observationId: PhysicalObservationId;
  readonly kind: PhysicalObservationKind;
  readonly sourceClass: ObservationSourceClass;
  readonly truthClass: "observed";
  readonly capture: ObservationCaptureContext;
  readonly payload: PhysicalObservationPayload;
}

/** Result of ingesting one observation at the boundary. */
export type ObservationIngestionStatus =
  | "queued"
  | "duplicate-ignored"
  | "rejected-malformed"
  | "unknown";
