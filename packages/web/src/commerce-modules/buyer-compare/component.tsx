/**
 * buyer-compare component — the J2 surface (lazily loaded). Offers across
 * four demo sellers; freshness classes are computed against the fixed demo
 * clock, verified prices are looked up through the REAL commerce runtime
 * (lookupPrice), and UNKNOWN offers never render a number.
 */
import type { JSX } from "react";

import { useState } from "react";
import { lookupPrice, multiplyMoneyByInteger } from "@unicom/commerce";
import type { PriceList, SkuId } from "@unicom/commerce";
import type { UtcIso8601String } from "@unicom/experience";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { EmptyStatePanel } from "../../commerce-host/shared/index.js";
import {
  classifyFreshness,
  demoRef,
  minutesAgoLabel,
  moneyText,
  utc,
  usdMinor,
} from "../buyer-support/demo-data.js";
import type { OfferFreshness } from "../buyer-support/demo-data.js";
import { DemoTag, FreshnessChip, PermissionGate, TermLine } from "../buyer-support/ui.js";

/** The demo product the scenario intent asks about. */
const DEMO_SKU: SkuId = demoRef<SkuId>("A3-RECYCLED-500");

/** One committed demo seller offer (all values synthetic, DEMO-labelled). */
interface DemoOffer {
  readonly sellerName: string;
  readonly kind: "priced" | "unknown" | "unavailable";
  /** Price list for priced offers (verified/stale price comes from the runtime). */
  readonly priceList?: PriceList;
  readonly checkedAt: UtcIso8601String;
  /** Fixed freshness for non-priced classes; priced offers derive verified/stale. */
  readonly fixedFreshness?: OfferFreshness;
  readonly stockNote: string;
  readonly deliveryNote: string;
  readonly protectionNote: string;
  readonly note: string;
}

/** Committed demo price lists (exact money, minor units). */
const MERIDIAN_LIST: PriceList = {
  currency: usdMinor("0").currency,
  entries: [{ skuId: DEMO_SKU, unitPrice: usdMinor("1275") }],
};
const CASCADE_LIST: PriceList = {
  currency: usdMinor("0").currency,
  entries: [{ skuId: DEMO_SKU, unitPrice: usdMinor("1199") }],
};

const DEMO_OFFERS: readonly DemoOffer[] = [
  {
    sellerName: "Meridian Office Supply",
    kind: "priced",
    priceList: MERIDIAN_LIST,
    checkedAt: utc("2026-10-12T08:52:00Z"),
    stockNote: "62 boxes in stock (feed-confirmed)",
    deliveryNote: "Delivered Wed Oct 14",
    protectionNote: "Returns accepted within 14 days (receipted)",
    note: "Feed refreshed minutes before the demo clock.",
  },
  {
    sellerName: "Cascade Foods Wholesale",
    kind: "priced",
    priceList: CASCADE_LIST,
    checkedAt: utc("2026-10-10T07:30:00Z"),
    stockNote: "Stock last confirmed 2 days ago — may have moved",
    deliveryNote: "Delivered in 3–5 business days (unconfirmed)",
    protectionNote: "Returns accepted within 7 days",
    note: "The price is real but its confirmation is old — treat as a guide.",
  },
  {
    sellerName: "Paper Trail Co-op",
    kind: "unknown",
    checkedAt: utc("2026-10-11T16:45:00Z"),
    fixedFreshness: "unknown",
    stockNote: "Stock could not be confirmed — the co-op feed did not answer",
    deliveryNote: "Delivery estimate UNKNOWN",
    protectionNote: "Protection terms UNKNOWN until the seller answers",
    note: "UNKNOWN is not a failure and not a price: nothing here should be read as an offer.",
  },
  {
    sellerName: "Harbor Stationers",
    kind: "unavailable",
    checkedAt: utc("2026-10-09T11:05:00Z"),
    fixedFreshness: "unavailable",
    stockNote: "Seller withdrew the listing (feed said: seasonal paper line ended)",
    deliveryNote: "No delivery — offer unavailable",
    protectionNote: "No terms — there is no live offer to protect",
    note: "Unavailable is shown honestly so you don't chase a dead offer.",
  },
];

const VERIFIED_WINDOW_MINUTES = 30;

function freshnessOf(offer: DemoOffer): OfferFreshness {
  if (offer.fixedFreshness) return offer.fixedFreshness;
  if (offer.kind !== "priced") return "unknown";
  return classifyFreshness(offer.checkedAt, VERIFIED_WINDOW_MINUTES);
}

export default function BuyerCompareComponent({ host }: CommerceModuleProps): JSX.Element {
  const [requestedFresh, setRequestedFresh] = useState<Record<string, boolean>>({});
  const [shortlisted, setShortlisted] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<boolean>(true);

  const hasIntent = host.scenario.intentDraft.trim().length > 0;
  const offers = DEMO_OFFERS.map((offer) =>
    requestedFresh[offer.sellerName] === true && offer.kind === "priced"
      ? { ...offer, checkedAt: utc("2026-10-12T08:59:00Z") }
      : offer,
  );
  const priced = offers.filter((offer) => offer.kind === "priced" && freshnessOf(offer) !== "unavailable");

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J2 · Compare offers across sellers</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          For your intent&apos;s product (A3 recycled card stock, 40 boxes). Freshness is classified
          against the fixed demo clock {utc("2026-10-12T09:00:00Z")}; verified prices are looked up
          through the deterministic commerce runtime. Verified ≤ {VERIFIED_WINDOW_MINUTES} min old,
          older confirmations are stale, unanswered feeds are UNKNOWN (never a price), and withdrawn
          offers are unavailable.
        </p>
        <div className="cm-row" style={{ marginTop: 8 }}>
          <button type="button" className="cm-button" onClick={() => setShowAll((prior) => !prior)}>
            {showAll ? "Hide unavailable & UNKNOWN" : "Show every seller honestly"}
          </button>
        </div>
      </section>

      {!hasIntent ? (
        <EmptyStatePanel
          view={{
            stateKind: "empty",
            reasonSummary:
              "No intent captured yet — there is nothing to compare offers against.",
            firstAction: {
              actionLabel: "Describe what you need",
              actionKind: "navigate",
              targetSurfaceId: "buyer-intent-canvas",
              rationale:
                "Capture what you need (product, quantity, deadline) on the intent canvas — the comparison then answers YOUR need instead of a generic one.",
            },
            teachingNote: "The demo offers below stay hidden until an intent exists: honest empty beats a fake comparison.",
          }}
        />
      ) : (
        <section aria-label="Seller offers">
        <h2 className="cm-section-title">
          {priced.length} priced · {offers.length - priced.length} UNKNOWN or unavailable
        </h2>
        <div className="cm-stack">
          {offers
            .filter((offer) => showAll || offer.kind === "priced")
            .map((offer) => (
              <OfferRow
                key={offer.sellerName}
                offer={offer}
                shortlisted={shortlisted[offer.sellerName] === true}
                onShortlist={() =>
                  setShortlisted((prior) => ({ ...prior, [offer.sellerName]: !prior[offer.sellerName] }))
                }
                onRequestFresh={() => setRequestedFresh((prior) => ({ ...prior, [offer.sellerName]: true }))}
                host={host}
              />
            ))}
        </div>
      </section>
      )}

      <section className="cm-card" aria-label="Freshness legend">
        <h2 className="cm-card-title">Freshness legend (UNKNOWN ≠ FAILED)</h2>
        <TermLine label="verified" value="Confirmed by the seller's feed within the last 30 minutes (demo clock)." />
        <TermLine label="stale" value="Confirmed once, but older — the price stays visible with its age and a caution." />
        <TermLine label="UNKNOWN" value="The feed could not confirm. No price, no stock, no promise — and not an error." />
        <TermLine label="unavailable" value="The seller or feed says the offer is off the table. Honest, not hidden." />
      </section>
    </div>
  );
}

function OfferRow({
  offer,
  shortlisted,
  onShortlist,
  onRequestFresh,
  host,
}: {
  readonly offer: DemoOffer;
  readonly shortlisted: boolean;
  readonly onShortlist: () => void;
  readonly onRequestFresh: () => void;
  readonly host: CommerceModuleProps["host"];
}): JSX.Element {
  const freshness = freshnessOf(offer);
  const lookup =
    offer.kind === "priced" && offer.priceList ? lookupPrice(offer.priceList, DEMO_SKU) : null;
  const priceText =
    lookup?.ok === true
      ? `${moneyText(lookup.value.unitPrice)} per box`
      : offer.kind === "unknown"
        ? "price UNKNOWN — never shown as a number"
        : "no live offer";
  const canRefresh = offer.kind === "priced" && freshness === "stale";

  return (
    <div className="cm-card" data-testid={`cm-offer-${freshness}`}>
      <div className="cm-row">
        <h3 className="cm-card-title">{offer.sellerName}</h3>
        <FreshnessChip freshness={freshness} checkedAt={offer.checkedAt} ageLabel={minutesAgoLabel(offer.checkedAt)} />
        <DemoTag />
        {shortlisted ? <span className="cm-chip cm-chip-ok">on your shortlist</span> : null}
      </div>
      <TermLine label="Price (40 boxes would cost)" value={priceText} />
      {lookup?.ok === true ? (
        <TermLine
          label="40-box total (exact math)"
          value={`${moneyText(multiplyMoneyByInteger(lookup.value.unitPrice, 40))} — computed by the commerce runtime`}
        />
      ) : null}
      <TermLine label="Stock" value={offer.stockNote} />
      <TermLine label="Delivery" value={offer.deliveryNote} />
      <TermLine label="Protection" value={offer.protectionNote} />
      <TermLine label="Seller note" value={offer.note} />
      {host.hasPermission("offers.compare") ? (
        <div className="cm-row" style={{ marginTop: 8 }}>
          {offer.kind === "priced" ? (
            <button type="button" className="cm-button" onClick={onShortlist}>
              {shortlisted ? "Remove from shortlist" : "Add to shortlist"}
            </button>
          ) : null}
          {canRefresh ? (
            <button type="button" className="cm-button" onClick={onRequestFresh}>
              Re-check freshness now
            </button>
          ) : null}
          <button
            type="button"
            className="cm-button"
            onClick={() => host.navigate("/commerce/buyer/decide")}
          >
            Weigh in buy-now vs wait
          </button>
        </div>
      ) : (
        <PermissionGate host={host} permission="offers.compare">
          <div className="cm-row" style={{ marginTop: 8 }}>
            <button type="button" className="cm-button" onClick={onShortlist}>
              Add to shortlist
            </button>
          </div>
        </PermissionGate>
      )}
    </div>
  );
}
