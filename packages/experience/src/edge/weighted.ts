/**
 * Weighted/measurement product workflow boundary
 * (docs/SUPERMARKET-WITHOUT-RFID.md, W1-001 acceptance scenario 3, W3-001 §3).
 *
 * Weighted goods (produce, deli, etc.) follow: select or scan → place on
 * scale → confirm weight → print/attach label → complete sale. Weight is an
 * OBSERVATION; the price shown is a display value from the register; only
 * deterministic reconciliation can turn a weighted sale into canonical truth.
 */

import type { CommerceProductRef } from "../common/opaque-refs";
import type { WeightMeasurementPayload } from "./observation";
import type { MoneyString, UtcIso8601String } from "../common/values";

/** Steps of the weighted-product workflow. */
export type WeightedWorkflowStepId =
  | "select-or-scan"
  | "place-on-scale"
  | "confirm-weight"
  | "print-or-attach-label"
  | "complete-sale";

/** One step instance in a weighted sale journey. */
export interface WeightedWorkflowStep {
  readonly stepId: WeightedWorkflowStepId;
  readonly userLabel: string;
  readonly completedAt?: UtcIso8601String;
}

/** A weighted sale as observed at the edge. */
export interface WeightedSaleObservation {
  readonly productRef?: CommerceProductRef;
  readonly barcode?: string;
  readonly weight: WeightMeasurementPayload;
  readonly unitPriceDisplay: MoneyString;
  /** Register-computed display price; canonical totals are the kernel's. */
  readonly computedPriceDisplay: MoneyString;
  readonly observedAt: UtcIso8601String;
  readonly truthClass: "observed";
}

/** Setup view for selling weighted products. */
export interface WeightedProductSetupView {
  readonly productRef: CommerceProductRef;
  readonly userLabel: string;
  readonly pricingModel: "price-per-unit";
  readonly unit: "g" | "kg" | "lb" | "oz";
  readonly labelPrinting: "integrated" | "manual" | "none";
}

/** The full workflow boundary contract. */
export interface WeightedProductWorkflowBoundary {
  readonly steps: readonly WeightedWorkflowStep[];
  readonly saleObservation: WeightedSaleObservation;
}
