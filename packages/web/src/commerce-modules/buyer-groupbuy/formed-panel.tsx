/**
 * W2-013 + W2-015 — the FORMED GroupBuy panel (extracted from component.tsx
 * for the max-lines lint rule; pure code motion + the W2-015 Stage 1
 * linked-order-draft affordance).
 *
 * Renders the formation truth (frozen final terms + consenting-only roster)
 * AND the human-confirmed "create linked order draft" affordance when the
 * buyer is in the frozen roster. The affordance is per-share: if the buyer's
 * share is not in the roster (they never consented, or withdrew before
 * formation), no draft is offered (law 4 — actor authority derives from the
 * aggregate's own consent laws).
 */
import type { JSX } from "react";

import { poolUnitsOf, principalRefEquals } from "@unicom/commerce";
import type { GroupBuyAggregate, GroupBuyInterestRecord, PrincipalRef } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { moneyText } from "../buyer-support/demo-data.js";
import { TermLine } from "../buyer-support/ui.js";
import { GroupBuyLinkedDraftAffordance } from "./linking-draft-panel.js";
import { GroupBuyKernelDraftAffordance } from "./linking-draft-kernel-panel.js";
import { LinkedDraftLedger } from "./linking-draft.js";
import { LinkingDraftKernel } from "./linking-draft-kernel.js";
import { participantName, unitsLabel } from "./groupbuy-data.js";
import type { DemoGroupBuyPool } from "./groupbuy-data.js";

/** The FORMED panel: formation truth + the linked-order-draft affordance. */
export function FormedGroupBuyPanel({
  host,
  aggregate,
  interests,
  pool,
  buyerPrincipal,
  draftLedger,
  draftKernel,
  merchantIdForPrefill,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly aggregate: GroupBuyAggregate;
  readonly interests: readonly GroupBuyInterestRecord[];
  readonly pool: DemoGroupBuyPool;
  readonly buyerPrincipal: PrincipalRef;
  readonly draftLedger: LinkedDraftLedger;
  readonly draftKernel: LinkingDraftKernel;
  readonly merchantIdForPrefill: string;
}): JSX.Element {
  if (aggregate.state !== "FORMED" || aggregate.formation === undefined) {
    return <></>;
  }
  const buyerShare = aggregate.participants.find((share) => principalRefEquals(share.participantRef, buyerPrincipal));
  return (
    <div className="cm-state-item" data-testid="cm-groupbuy-formed" style={{ marginTop: 10, borderColor: "var(--cm-ok)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Deal FORMED — the second confirmation happened with final terms</span>
        <span className="cm-chip cm-chip-ok">FORMED</span>
      </div>
      <TermLine label="Final group price (frozen)" value={`${moneyText(aggregate.formation.groupPrice)} per ${pool.unitNoun}`} />
      <TermLine
        label="Pool value (exact, kernel-computed)"
        value={`${moneyText(aggregate.formation.poolValue)} — group price × ${unitsLabel(pool, poolUnitsOf(interests))}, frozen at formation`}
      />
      <TermLine
        label="Consenting-only roster (frozen)"
        value={aggregate.participants
          .map((share) => `${participantName(share.participantRef)} · ${unitsLabel(pool, share.quantity.units)}`)
          .join(" / ")}
      />
      <p className="cm-state-item-detail">
        Interest was never a commitment; formation with these final terms WAS the second
        confirmation. Withdrawal closed the moment the deal formed — before it, any
        participant could withdraw any time. No money moved: an actual commitment would
        live on the commerce planes, and this kernel aggregate never creates one.
      </p>
      {/* W2-015 Stage 1: the human-confirmed linked-order-draft affordance (prefill only).
          The buyer's share is in the frozen roster if they consented;
          otherwise no share → no draft (the affordance is per-share). */}
      {buyerShare ? (
        <GroupBuyLinkedDraftAffordance
          host={host}
          aggregate={aggregate}
          share={buyerShare}
          actingPrincipal={buyerPrincipal}
          ledger={draftLedger}
          permission="groupbuy.express-interest"
          merchantIdForPrefill={merchantIdForPrefill}
        />
      ) : null}
      {/* W2-017 Stage 2: the kernel-native draft affordance (issues the REAL LINK command).
          ADDS to the Stage-1 prefill — never replaces it. The confirm gate issues
          LINK_GROUPBUY_TO_ORDER_DRAFT through the LinkingDraftKernel runner. */}
      {buyerShare ? (
        <GroupBuyKernelDraftAffordance
          host={host}
          aggregate={aggregate}
          share={buyerShare}
          actingPrincipal={buyerPrincipal}
          kernel={draftKernel}
          permission="groupbuy.express-interest"
        />
      ) : null}
    </div>
  );
}
