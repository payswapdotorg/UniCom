/**
 * The J7 resale-listing track: the owner's explicit action (a
 * terms/consequence/evidence gate) moves a REAL DRAFT ResaleListing through
 * the commerce runtime (PUBLISH → ACTIVE → [RESERVED] → SOLD / ENDED /
 * CANCELLED). Every buyer-side event is a labelled demo advance of the
 * deterministic machine — nothing is ever listed or sold implicitly, and the
 * item stays yours on every non-SOLD terminal path.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { CommitmentGate, DemoTag, TermLine } from "../buyer-support/ui.js";
import {
  RESALE_FEE_NOTE,
  advanceDemoListing,
  demoResaleListing,
  feeText,
  netAfterFeeText,
} from "./resale-data.js";
import type { DemoOwnedAsset } from "./resale-data.js";

const ASKING_MINOR: Readonly<Record<string, string>> = {
  "w2s-01": "78000",
  "w2s-02": "32000",
  "w2s-03": "45000",
};

export function ListingTrack({
  asset,
  host,
}: {
  readonly asset: DemoOwnedAsset;
  readonly host: CommerceModuleProps["host"];
}): JSX.Element {
  const askingMinor = ASKING_MINOR[asset.id] ?? "10000";
  const [listing, setListing] = useState(() => demoResaleListing(asset, askingMinor));
  const [gateOpen, setGateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = (trigger: "PUBLISH" | "RESERVE" | "MARK_SOLD" | "END" | "CANCEL") => {
    const next = advanceDemoListing(listing, trigger);
    if (!next.ok) {
      setError(`Honest rejection from the runtime: ${next.error} — the listing stays ${listing.state}.`);
      return;
    }
    setError(null);
    setListing(next.listing);
  };

  return (
    <section className="cm-card" aria-label="Resale listing track" data-testid="cm-listing-track">
      <div className="cm-row">
        <h3 className="cm-card-title">Resale listing — {asset.item}</h3>
        <DemoTag />
        <span
          className={
            listing.state === "SOLD"
              ? "cm-chip cm-chip-ok"
              : listing.state === "CANCELLED" || listing.state === "ENDED"
                ? "cm-chip cm-chip-muted"
                : "cm-chip cm-chip-warn"
          }
        >
          {listing.state}
        </span>
      </div>
      {error ? <p className="cm-blocked-reason">{error}</p> : null}
      <TermLine label="Listing" value={`${listing.listingId} · revision ${listing.revision} (runtime-tracked)`} />
      <TermLine label="Asking price" value={moneyText(listing.askingPrice)} />
      <TermLine label="Marketplace fee on sale" value={`${feeText(askingMinor)} — ${RESALE_FEE_NOTE}`} />
      <TermLine label="Net to you if sold at ask" value={netAfterFeeText(askingMinor)} />

      {listing.state === "DRAFT" ? (
        gateOpen ? (
          <CommitmentGate
            title="Publish this listing (terms, consequence, evidence)"
            terms={[
              { label: "Item & condition", value: `${asset.item} — ${asset.condition}` },
              { label: "Asking price", value: moneyText(listing.askingPrice) },
              { label: "Fee on a successful sale", value: `${feeText(askingMinor)} (500 bps, exact math)` },
              { label: "Net at ask", value: netAfterFeeText(askingMinor) },
              { label: "Visibility", value: "The listing becomes visible to buyers in the marketplace feed (demo feed only)." },
            ]}
            consequence="Publishing is your explicit action: the listing goes ACTIVE and buyers can reserve or buy. You keep the right to END or CANCEL while it is active; the item only leaves your ownership on a completed sale. In demo mode the listing lives in this screen's local state — no live marketplace feed is contacted."
            evidence={[
              `Comparable sales: ${asset.comparables
                .map((comp) => `${comp.label} at ${moneyText(usdMinor(comp.soldPriceMinor))} (${comp.freshness})`)
                .join("; ")}`,
              "The commerce runtime's deterministic listing state machine (DRAFT → ACTIVE → RESERVED/SOLD/ENDED/CANCELLED)",
            ]}
            confirmLabel="Publish the listing"
            onConfirm={() => {
              advance("PUBLISH");
              setGateOpen(false);
            }}
            onCancel={() => setGateOpen(false)}
          />
        ) : (
          <button type="button" className="cm-button cm-button-primary" onClick={() => setGateOpen(true)}>
            Publish this listing (with authorization)
          </button>
        )
      ) : null}

      {listing.state === "ACTIVE" ? (
        <div className="cm-row" style={{ marginTop: 8 }}>
          <button type="button" className="cm-button" onClick={() => advance("RESERVE")}>
            A buyer reserves it (demo advance)
          </button>
          <button type="button" className="cm-button" onClick={() => advance("MARK_SOLD")}>
            A buyer pays the asking price (demo advance)
          </button>
          <button type="button" className="cm-button" onClick={() => advance("END")}>
            End the listing (keep the item)
          </button>
          <button type="button" className="cm-button" onClick={() => advance("CANCEL")}>
            Cancel the listing (keep the item)
          </button>
        </div>
      ) : null}

      {listing.state === "RESERVED" ? (
        <div className="cm-row" style={{ marginTop: 8 }}>
          <button type="button" className="cm-button" onClick={() => advance("MARK_SOLD")}>
            Complete the reserved sale (demo advance)
          </button>
          <button type="button" className="cm-button" onClick={() => advance("CANCEL")}>
            The reservation falls through (runtime CANCEL)
          </button>
        </div>
      ) : null}

      {listing.state === "SOLD" ? (
        <p className="cm-state-item-detail">
          <strong>Sale completed:</strong> net {netAfterFeeText(askingMinor)} to you after the fee —
          exact runtime arithmetic. The buyer now owns the item.
        </p>
      ) : null}
      {listing.state === "ENDED" || listing.state === "CANCELLED" ? (
        <p className="cm-state-item-detail">
          <strong>Item stays yours:</strong> a {listing.state === "ENDED" ? "ended" : "cancelled"}{" "}
          listing never moved ownership. You can list it again any time — nothing was committed on
          your behalf.
        </p>
      ) : null}
      <p className="cm-env-note" style={{ marginTop: 6 }}>
        Demo boundary: these controls advance the runtime's state machine in local demo state only
        ({host.mode} mode). No live listing, reservation, sale or fee is ever created.
      </p>
    </section>
  );
}
