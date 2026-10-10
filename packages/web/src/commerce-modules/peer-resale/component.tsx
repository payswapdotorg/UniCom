/**
 * peer-resale component — the J7 surface. Your under-used assets, each with
 * evidence-backed outcome estimates (comparable sales + freshness) and three
 * value-recovery paths: resale listing, consignment, or rent-out (J6 link).
 * Nothing is ever listed implicitly: every commitment goes through the
 * terms/consequence/evidence gate first.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { EmptyStatePanel } from "../../commerce-host/shared/index.js";
import type { EmptyStateView } from "@unicom/experience";
import { minutesAgoLabel, moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { DemoTag, FreshnessChip, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { ListingTrack } from "./listing-track.js";
import { ConsignmentTrack } from "./consignment-track.js";
import { DEMO_ASSETS } from "./resale-data.js";
import type { DemoOwnedAsset, ResaleTrackKind } from "./resale-data.js";

const RESALE_EMPTY: EmptyStateView = {
  stateKind: "empty",
  reasonSummary:
    "Every demo asset on this surface is already committed to a track. Nothing new is ever listed without an explicit owner action.",
  firstAction: {
    actionLabel: "See renting out instead (J6)",
    actionKind: "navigate",
    targetSurfaceId: "opportunity-inbox",
    rationale:
      "Renting keeps ownership while the asset earns — the J6 surface shows duration, deposit, condition, return and damage terms before you commit.",
  },
  teachingNote:
    "Demo boundary: committed tracks live in this screen's local state only — reset the demo from the host header to start over.",
};

export default function PeerResaleComponent({ host }: CommerceModuleProps): JSX.Element {
  const [tracks, setTracks] = useState<Record<string, ResaleTrackKind>>({});
  const open = DEMO_ASSETS.filter((asset) => tracks[asset.id] === undefined);
  const committed = DEMO_ASSETS.filter((asset) => tracks[asset.id] !== undefined);

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J7 · Recover value from what you own</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Resale, consignment or rental for gear you no longer use at full capacity. The law of this
          surface: <strong>nothing is ever listed or committed implicitly</strong> — every path
          shows its terms, consequence and evidence, then waits for your explicit confirm. Listing
          and consignment lifecycles run on the deterministic commerce runtime
          (advanceListing / advanceConsignment / consignmentPayout) with exact money math. Outcome
          estimates cite comparable sales with their freshness; when the comps are UNKNOWN the
          estimate is UNKNOWN too — never a made-up price.
        </p>
      </section>

      <section aria-label="Assets available to act on">
        <h2 className="cm-section-title">Your under-used assets</h2>
        {open.length === 0 ? (
          <EmptyStatePanel view={RESALE_EMPTY} />
        ) : (
          <div className="cm-stack">
            {open.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                host={host}
                onCommit={(kind) => setTracks((prev) => ({ ...prev, [asset.id]: kind }))}
              />
            ))}
          </div>
        )}
      </section>

      {committed.length > 0 ? (
        <section aria-label="Committed tracks">
          <h2 className="cm-section-title">Tracks you started</h2>
          <div className="cm-stack">
            {committed.map((asset) =>
              tracks[asset.id] === "resale" ? (
                <ListingTrack key={asset.id} asset={asset} host={host} />
              ) : (
                <ConsignmentTrack key={asset.id} asset={asset} host={host} />
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AssetCard({
  asset,
  host,
  onCommit,
}: {
  readonly asset: DemoOwnedAsset;
  readonly host: CommerceModuleProps["host"];
  readonly onCommit: (kind: ResaleTrackKind) => void;
}): JSX.Element {
  const hasVerifiedComp = asset.comparables.some(
    (comp) => comp.freshness === "verified" || comp.freshness === "stale",
  );
  return (
    <div className="cm-card" data-testid={`cm-resale-asset-${asset.id}`}>
      <div className="cm-row">
        <h3 className="cm-card-title">{asset.item}</h3>
        <DemoTag />
      </div>
      <TermLine label="Condition" value={asset.condition} />
      <TermLine label="Original cost" value={moneyText(usdMinor(asset.originalCostMinor))} />
      <TermLine
        label="Outcome estimate (evidence-based)"
        value={
          asset.estimate === null || !hasVerifiedComp
            ? "UNKNOWN — no confirmed comparable sale exists. This is not a lowball estimate; it is an honest unknown."
            : `${asset.estimate} — derived from the comparable sales below (demo arithmetic, exact money).`
        }
      />
      <div className="cm-stack" style={{ gap: 4, marginTop: 4 }}>
        {asset.comparables.map((comp) => (
          <div key={comp.id} className="cm-row" style={{ gap: 6 }}>
            <FreshnessChip
              freshness={comp.freshness}
              checkedAt={comp.soldAt}
              ageLabel={comp.freshness === "unknown" ? null : minutesAgoLabel(comp.soldAt)}
            />
            <span className="cm-env-note">
              {comp.label} sold at {moneyText(usdMinor(comp.soldPriceMinor))}
            </span>
          </div>
        ))}
      </div>
      <PermissionGate host={host} permission="resale.list-own-items">
        <div className="cm-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="cm-button cm-button-primary"
            onClick={() => onCommit("resale")}
          >
            Prepare a resale listing…
          </button>
          <button type="button" className="cm-button" onClick={() => onCommit("consignment")}>
            Send to consignment…
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => host.navigate("/commerce/rent")}
            title="Renting keeps ownership — the J6 surface shows the full rental term set."
          >
            Rent it out instead (J6)
          </button>
        </div>
      </PermissionGate>
    </div>
  );
}
