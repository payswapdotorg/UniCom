/**
 * The J7 consignment track: the owner's explicit action (a
 * terms/consequence/evidence gate with the exact payout preview from
 * consignmentPayout) hands a REAL ConsignmentAgreement to a partner
 * (PROPOSED → partner ACCEPT → ACTIVE → SETTLE with the exact split, or
 * TERMINATE with the item returned). The partner's accept is the OTHER
 * side's action — a labelled demo advance, never a silent commitment.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText, usdMinor } from "../buyer-support/demo-data.js";
import { CommitmentGate, DemoTag, TermLine } from "../buyer-support/ui.js";
import { advanceDemoConsignment, consignmentSplit, demoConsignment } from "./resale-data.js";
import type { DemoOwnedAsset } from "./resale-data.js";

const SHARE_BPS = 6000;
const ESTIMATED_SALE_MINOR: Readonly<Record<string, string>> = {
  "w2s-01": "78000",
  "w2s-02": "32000",
  "w2s-03": "45000",
};

export function ConsignmentTrack({
  asset,
  host,
}: {
  readonly asset: DemoOwnedAsset;
  readonly host: CommerceModuleProps["host"];
}): JSX.Element {
  const estimatedSaleMinor = ESTIMATED_SALE_MINOR[asset.id] ?? "10000";
  const [agreement, setAgreement] = useState(() => demoConsignment(asset, SHARE_BPS));
  const [gateOpen, setGateOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = (trigger: "ACCEPT" | "SETTLE" | "TERMINATE") => {
    const next = advanceDemoConsignment(agreement, trigger);
    if (!next.ok) {
      setError(
        `Honest rejection from the runtime: ${next.error} — the agreement stays ${agreement.state}.`,
      );
      return;
    }
    setError(null);
    setAgreement(next.agreement);
  };

  const preview = consignmentSplit(estimatedSaleMinor, SHARE_BPS);
  const settled = consignmentSplit(estimatedSaleMinor, SHARE_BPS);

  return (
    <section
      className="cm-card"
      aria-label="Consignment track"
      data-testid="cm-consignment-track"
    >
      <div className="cm-row">
        <h3 className="cm-card-title">Consignment — {asset.item}</h3>
        <DemoTag />
        <span className={agreement.state === "SETTLED" ? "cm-chip cm-chip-ok" : "cm-chip cm-chip-muted"}>
          {agreement.state}
        </span>
      </div>
      {error ? <p className="cm-blocked-reason">{error}</p> : null}
      <TermLine
        label="Agreement"
        value={`${agreement.consignmentId} · revision ${agreement.revision} (runtime-tracked)`}
      />
      <TermLine label="Your share of the sale" value={`6000 bps (60%) — agreed up front`} />
      <TermLine label="Partner" value="Ferry Road Consign (demo partner)" />
      <TermLine label="Estimated sale price" value={`${moneyText(usdMinor(estimatedSaleMinor))} (from the comparable-sales evidence on the asset card)`} />
      {"consignor" in preview ? (
        <TermLine
          label="Payout preview at the estimate (exact math)"
          value={`you ${preview.consignor} · partner ${preview.partner} — computed by the runtime's consignmentPayout, not a guess`}
        />
      ) : (
        <p className="cm-blocked-reason">{preview.error}</p>
      )}

      {agreement.state === "PROPOSED" && !offered ? (
        gateOpen ? (
          <CommitmentGate
            title="Hand this item to the consignment partner (terms, consequence, evidence)"
            terms={[
              { label: "Item & condition", value: `${asset.item} — ${asset.condition}` },
              { label: "Partner", value: "Ferry Road Consign (demo partner)" },
              { label: "Your share of the sale", value: "6000 bps (60% of the sale price, exact math)" },
              { label: "Estimated sale", value: moneyText(usdMinor(estimatedSaleMinor)) },
              ...( "consignor" in preview
                ? [{ label: "Payout preview at the estimate", value: `you ${preview.consignor} · partner ${preview.partner}` }]
                : []),
              { label: "Retrieval terms", value: "You may TERMINATE the agreement any time before settlement; the item comes back to you." },
              { label: "No sale", value: "If the item does not sell, nothing is owed to either side — the item returns to you on termination." },
            ]}
            consequence="Proposing consignment sends YOUR explicit offer to the partner. Nothing moves until the partner ACCEPTS (their action, shown as a demo advance here). While ACTIVE, the partner holds and sells the item on your behalf; settlement splits the actual sale price by the agreed bps. In demo mode the agreement lives in this screen's local state — no live partner is contacted."
            evidence={[
              "Payout preview computed by the commerce runtime's consignmentPayout (deterministic, exact money)",
              "Comparable-sales evidence on the asset card (with freshness classes)",
            ]}
            confirmLabel="Send the proposal"
            onConfirm={() => {
              setOffered(true);
              setGateOpen(false);
            }}
            onCancel={() => setGateOpen(false)}
          />
        ) : (
          <button type="button" className="cm-button cm-button-primary" onClick={() => setGateOpen(true)}>
            Hand over to consignment (with authorization)
          </button>
        )
      ) : null}

      {agreement.state === "PROPOSED" && offered ? (
        <div className="cm-stack" style={{ marginTop: 8 }}>
          <p className="cm-state-item-detail">
            <strong>Offered — awaiting the partner&apos;s accept.</strong> No commitment exists on
            either side yet; you can withdraw any time before they answer.
          </p>
          <div className="cm-row">
            <button type="button" className="cm-button" onClick={() => advance("ACCEPT")}>
              The partner accepts (demo advance → ACTIVE)
            </button>
            <button type="button" className="cm-button" onClick={() => setOffered(false)}>
              Withdraw my proposal (before the partner answers)
            </button>
          </div>
        </div>
      ) : null}

      {agreement.state === "ACTIVE" ? (
        <div className="cm-row" style={{ marginTop: 8 }}>
          <button type="button" className="cm-button" onClick={() => advance("SETTLE")}>
            The partner sells at the estimate (demo advance → SETTLE)
          </button>
          <button type="button" className="cm-button" onClick={() => advance("TERMINATE")}>
            Terminate — the item comes back (runtime TERMINATE)
          </button>
        </div>
      ) : null}

      {agreement.state === "SETTLED" && "consignor" in settled ? (
        <div className="cm-state-item" data-testid="cm-consignment-payout">
          <div className="cm-row">
            <span className="cm-state-item-label">Settlement (consignmentPayout, exact math)</span>
            <DemoTag />
          </div>
          <TermLine label="Sale price" value={moneyText(usdMinor(estimatedSaleMinor))} />
          <TermLine label="You receive (6000 bps)" value={settled.consignor} />
          <TermLine label="Partner keeps (4000 bps)" value={settled.partner} />
        </div>
      ) : null}
      {agreement.state === "TERMINATED" ? (
        <p className="cm-state-item-detail">
          <strong>Item returned to you:</strong> the terminated agreement settles nothing — no sale
          happened, no payout is owed. Recovery path complete; you can list or rent the asset again.
        </p>
      ) : null}
      <p className="cm-env-note" style={{ marginTop: 6 }}>
        Demo boundary: these controls advance the runtime's state machine in local demo state only
        ({host.mode} mode). No live consignment, sale or payout is ever created.
      </p>
    </section>
  );
}
