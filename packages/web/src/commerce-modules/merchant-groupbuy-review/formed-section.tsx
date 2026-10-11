/**
 * W2-015 Stage 1 — the FORMED GroupBuy section for the merchant review desk
 * (extracted from component-parts.tsx for the max-lines lint rule; pure code
 * motion + the W2-015 Stage 1 linked-order-draft affordance).
 *
 * Renders the formation truth (frozen final terms + consenting-only roster)
 * AND the human-confirmed "create linked order draft" affordance. The
 * acting principal is the DEMO merchant organizer; the prefill carries the
 * FIRST consenting participant's share (the organizer may draft a linked
 * order on behalf of any consenting participant — each participant's share
 * is its own separately-authorized draft, law 2).
 */
import type { JSX } from "react";

import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR, fmtMoney } from "../merchant-shared/demo-runtime.js";
import { StatusChip } from "../merchant-shared/ui.js";
import { GroupBuyLinkedDraftAffordance } from "../buyer-groupbuy/linking-draft-panel.js";
import { GroupBuyKernelDraftAffordance } from "../buyer-groupbuy/linking-draft-kernel-panel.js";
import { LinkedDraftLedger } from "../buyer-groupbuy/linking-draft.js";
import { LinkingDraftKernel } from "../buyer-groupbuy/linking-draft-kernel.js";
import { clockLabel, studioNameOf } from "./fixtures.js";
import { participantIdOf } from "./seed.js";
import type { PoolView } from "./component-parts.js";

/** The FORMED section: formation truth + the linked-order-draft affordance. */
export function FormedMerchantPanel({
  view,
  host,
  draftLedger,
  draftKernel,
}: {
  readonly view: PoolView;
  readonly host: CommerceHostServices;
  readonly draftLedger: LinkedDraftLedger;
  readonly draftKernel: LinkingDraftKernel;
}): JSX.Element {
  const aggregate = view.aggregate;
  if (aggregate.state !== "FORMED" || aggregate.formation === undefined) {
    return <></>;
  }
  const formation = aggregate.formation;
  const roster = aggregate.participants;
  return (
    <div className="cm-stack">
      <div className="cm-row">
        <StatusChip status="FORMED" note="Final terms frozen by the formation machine" />
        <span className="cm-env-note">formed {clockLabel(formation.formedAt)} · kernel revision {aggregate.revision}</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Final group price</span>
        <span className="cm-journey-summary">{fmtMoney(formation.groupPrice)} / box (frozen)</span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Final pool value</span>
        <span className="cm-journey-summary">
          {fmtMoney(formation.poolValue)} — exact ({formation.poolValue.amountMinor} minor units), computed by the formation machine
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Frozen roster (consenting-only)</span>
        <span className="cm-journey-summary">
          {roster
            .map((share) => `${studioNameOf(participantIdOf(share.participantRef))} · ${share.quantity.units} boxes`)
            .join(" · ")}
        </span>
      </div>
      <p className="cm-state-item-detail">
        Formation froze the final terms and the consenting-only roster. No commitment was created
        — commitments exist only on the commerce planes — and withdrawn studios stay out forever.
      </p>
      {/* W2-015 Stage 1: the human-confirmed linked-order-draft affordance (prefill only). */}
      {roster.length > 0 ? (
        <GroupBuyLinkedDraftAffordance
          host={host}
          aggregate={aggregate}
          share={roster[0]!}
          actingPrincipal={DEMO_MERCHANT_ACTOR}
          ledger={draftLedger}
          permission="groupbuy.review-proposal"
          merchantIdForPrefill={DEMO_MERCHANT_ACTOR.merchantId}
        />
      ) : null}
      {/* W2-017 Stage 2: the kernel-native draft affordance (issues the REAL LINK command). */}
      {roster.length > 0 ? (
        <GroupBuyKernelDraftAffordance
          host={host}
          aggregate={aggregate}
          share={roster[0]!}
          actingPrincipal={DEMO_MERCHANT_ACTOR}
          kernel={draftKernel}
          permission="groupbuy.review-proposal"
        />
      ) : null}
    </div>
  );
}
