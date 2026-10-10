/**
 * peer-resale fixture data + runtime wrappers (J7). All values are
 * deterministic, committed, DEMO-labelled and namespaced to this lane
 * (w2s-*). The listing/consignment lifecycles advance through the REAL
 * commerce runtime state machines via the public @unicom/commerce
 * entrypoint; the wrappers below only shape results for the UI/tests.
 */
import {
  advanceConsignment,
  advanceListing,
  consignmentPayout,
} from "@unicom/commerce";
import type {
  ConsignmentAgreement,
  ConsignmentTransitionError,
  ItemCondition,
  ListingTransitionError,
  ResaleListing,
} from "@unicom/commerce";
import { percentageBpsOfMoney, subtractMoney } from "@unicom/commerce";
import { classifyFreshness, demoRef, moneyText, usdMinor, utc } from "../buyer-support/demo-data.js";

/** Which value-recovery track an asset is committed to. */
export type ResaleTrackKind = "resale" | "consignment";

/** One comparable-sale evidence record (freshness computed against the demo clock). */
export interface DemoComparable {
  readonly id: string;
  readonly label: string;
  readonly soldPriceMinor: string;
  readonly soldAt: ReturnType<typeof utc>;
  readonly freshness: "verified" | "stale" | "unknown" | "unavailable";
}

/** One under-use asset with its evidence comparables + outcome estimate. */
export interface DemoOwnedAsset {
  readonly id: string;
  readonly item: string;
  readonly condition: string;
  readonly originalCostMinor: string;
  readonly comparables: readonly DemoComparable[];
  /** Evidence-based outcome estimate (null ⇒ UNKNOWN, never a made-up price). */
  readonly estimate: string | null;
}

function comp(
  id: string,
  label: string,
  soldPriceMinor: string,
  soldAt: string,
  freshness: DemoComparable["freshness"] = "verified",
): DemoComparable {
  return {
    id,
    label,
    soldPriceMinor,
    soldAt: utc(soldAt),
    freshness:
      freshness === "verified" || freshness === "stale"
        ? classifyFreshness(utc(soldAt), 60 * 24)
        : freshness,
  };
}

/** Demo marketplace fee policy shown in every listing gate. */
export const RESALE_FEE_NOTE =
  "5% marketplace fee (500 bps) on a successful sale — exact math, no surprises";

/** Exact fee amount text for an asking price (percentageBpsOfMoney, HALF_UP). */
export function feeText(askingMinor: string): string {
  return moneyText(percentageBpsOfMoney(usdMinor(askingMinor), 500, "HALF_UP"));
}

/** Exact net-after-fee text for an asking price. */
export function netAfterFeeText(askingMinor: string): string {
  const asking = usdMinor(askingMinor);
  const fee = percentageBpsOfMoney(asking, 500, "HALF_UP");
  const net = subtractMoney(asking, fee);
  return net.ok ? moneyText(net.value) : moneyText(asking);
}

/** The committed demo assets. */
export const DEMO_ASSETS: readonly DemoOwnedAsset[] = [
  {
    id: "w2s-01",
    item: "Vinyl cutting plotter (24 in, like-new blades)",
    condition: "LIKE_NEW",
    originalCostMinor: "149000",
    comparables: [
      comp("w2s-01-c1", "Same model, Meridian resale", "81000", "2026-10-11T15:00:00Z"),
      comp("w2s-01-c2", "Same model + stand, Ferry Road", "76500", "2026-10-08T09:30:00Z"),
    ],
    estimate: "ask 780.00 USD → net 741.00 USD after the marketplace fee",
  },
  {
    id: "w2s-02",
    item: "Overlock sewing machine (4-thread)",
    condition: "GOOD",
    originalCostMinor: "62000",
    comparables: [
      comp("w2s-02-c1", "Same model, Harbor Lane", "33500", "2026-10-09T11:00:00Z"),
      {
        id: "w2s-02-c2",
        label: "Older model, Northlight",
        soldPriceMinor: "21000",
        soldAt: utc("2026-09-20T10:00:00Z"),
        freshness: "unknown",
      },
    ],
    estimate: "ask 320.00 USD → net 304.00 USD after the marketplace fee",
  },
  {
    id: "w2s-03",
    item: "Event tent, 6 m (frame + canvas)",
    condition: "GOOD",
    originalCostMinor: "89000",
    comparables: [
      {
        id: "w2s-03-c1",
        label: "Similar size, feed never answered",
        soldPriceMinor: "45000",
        soldAt: utc("2026-09-05T08:00:00Z"),
        freshness: "unknown",
      },
    ],
    // No confirmed comparable ⇒ no estimate (UNKNOWN, never a made-up price).
    estimate: null,
  },
];

/** Build a REAL DRAFT ResaleListing fixture for an asset (runtime-fed). */
export function demoResaleListing(asset: DemoOwnedAsset, askingMinor: string): ResaleListing {
  return {
    listingId: `demo-listing/${asset.id}` as ResaleListing["listingId"],
    sellerRef: demoRef<ResaleListing["sellerRef"]>("demo-principal/harbor-lane"),
    skuRef: `demo-sku/${asset.id}` as ResaleListing["skuRef"],
    itemCondition: demoRef<ItemCondition>(asset.condition),
    askingPrice: usdMinor(askingMinor),
    state: "DRAFT",
    revision: 1,
  };
}

/** Advance the real listing state machine (used by the track panel + tests). */
export function advanceDemoListing(
  listing: ResaleListing,
  trigger: Parameters<typeof advanceListing>[1],
): { readonly ok: true; readonly listing: ResaleListing } | { readonly ok: false; readonly error: string } {
  const next = advanceListing(listing, trigger);
  if (!next.ok) {
    const failure = next.error as ListingTransitionError;
    return { ok: false, error: `INVALID_LISTING_TRANSITION from ${failure.from} on ${failure.trigger}` };
  }
  return { ok: true, listing: next.value };
}

/** Build a REAL PROPOSED ConsignmentAgreement fixture for an asset. */
export function demoConsignment(asset: DemoOwnedAsset, shareBps: number): ConsignmentAgreement {
  return {
    consignmentId: `demo-consignment/${asset.id}` as ConsignmentAgreement["consignmentId"],
    consignorRef: demoRef<ConsignmentAgreement["consignorRef"]>("demo-principal/harbor-lane"),
    consignorShareBps: shareBps,
    state: "PROPOSED",
    revision: 1,
  };
}

/** Advance the real consignment state machine (used by the track panel + tests). */
export function advanceDemoConsignment(
  agreement: ConsignmentAgreement,
  trigger: Parameters<typeof advanceConsignment>[1],
):
  | { readonly ok: true; readonly agreement: ConsignmentAgreement }
  | { readonly ok: false; readonly error: string } {
  const next = advanceConsignment(agreement, trigger);
  if (!next.ok) {
    const failure = next.error as ConsignmentTransitionError;
    return {
      ok: false,
      error: `INVALID_CONSIGNMENT_TRANSITION from ${failure.from} on ${failure.trigger}`,
    };
  }
  return { ok: true, agreement: next.value };
}

/** Exact consignment payout split for a demo sale (consignmentPayout, HALF_UP). */
export function consignmentSplit(
  saleMinor: string,
  shareBps: number,
): { readonly consignor: string; readonly partner: string } | { readonly error: string } {
  const result = consignmentPayout(usdMinor(saleMinor), shareBps, "HALF_UP");
  if (!result.ok) return { error: `invalid share bps: ${result.error.bps}` };
  return { consignor: moneyText(result.value.consignor), partner: moneyText(result.value.merchant) };
}
