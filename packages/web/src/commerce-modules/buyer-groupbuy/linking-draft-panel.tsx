/**
 * W2-015 Stage 1 — the linked-order-draft affordance panel.
 *
 * Renders the human-confirmed "create linked order draft" affordance on the
 * formed GroupBuy surface (buyer + merchant review sides) and on the executed
 * TradeCycle leg surface (participant side). The panel:
 *
 *  - renders ONLY when the source aggregate is in the formation/execution
 *    truth state (GroupBuy FORMED; TradeCycle leg COMMITTED);
 *  - shows the prefill (sku, units, price, cart id) and provenance (source
 *    aggregate id, acting principal, consent basis) on-surface, visibly
 *    marked as pre-filled from the source aggregate;
 *  - requires an EXPLICIT human confirmation step (a separate button click
 *    on a confirm gate) — the draft is NEVER created automatically on
 *    formation/execution;
 *  - records the confirmed draft in the local DEMO ledger (never kernel
 *    truth — the eventual PLACE_ORDER travels through the existing kernel
 *    command path under its own idempotency key);
 *  - is permission-aware: renders only for actors whose role permits order
 *    placement; insufficient role = honest unavailable state, not silent
 *    absence (the established permission-block pattern);
 *  - is kill-switchable: when LINKING_DRAFT_ENABLED is false, renders the
 *    honest "linking disabled" label instead of the affordance.
 *
 * The panel does NOT issue any kernel command. The eventual placement (if the
 * human proceeds) is the existing ADD_CART_LINE → PLACE_ORDER flow, unchanged.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { PermissionGate, TermLine } from "../buyer-support/ui.js";
import { DemoTag } from "../buyer-support/ui.js";
import {
  LINKING_DISABLED_LABEL,
  LinkedDraftLedger,
  addCartLinePrefillOf,
  draftIdOf,
  groupBuyDraftPrefillOf,
  isLinkingDraftEnabled,
  placeOrderPrefillOf,
  tradeCycleLegDraftPrefillOf,
} from "./linking-draft.js";
import type { LinkedOrderDraftPrefill, RecordedDraft } from "./linking-draft.js";
import type { GroupBuyAggregate, GroupBuyParticipantShare, PrincipalRef, TradeCycleExecution, TradeCycleExecutionLeg } from "@unicom/commerce";
import { KernelCommitmentGate } from "./gate.js";

/**
 * The linked-order-draft affordance for a FORMED GroupBuy.
 * Renders for the acting organizer/merchant (groupbuy.review-proposal) OR
 * the participating buyer (groupbuy.express-interest). The prefill carries
 * the consenting participant's share (the participant who would place the
 * linked order for their share of the formed deal).
 */
export function GroupBuyLinkedDraftAffordance({
  host,
  aggregate,
  share,
  actingPrincipal,
  ledger,
  permission,
  merchantIdForPrefill,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly aggregate: GroupBuyAggregate;
  readonly share: GroupBuyParticipantShare;
  readonly actingPrincipal: PrincipalRef;
  readonly ledger: LinkedDraftLedger;
  /** The permission that gates this affordance (organizer vs buyer side). */
  readonly permission: "groupbuy.review-proposal" | "groupbuy.express-interest";
  /** The merchant id the PLACE_ORDER prefill would carry (DEMO fixture). */
  readonly merchantIdForPrefill: string;
}): JSX.Element {
  // Kill switch: honest "linking disabled" label, never silent absence.
  if (!isLinkingDraftEnabled()) {
    return (
      <div className="cm-state-item" data-testid="cm-linking-disabled" style={{ marginTop: 8 }}>
        <span className="cm-chip cm-chip-muted">linking disabled</span>
        <p className="cm-state-item-detail">{LINKING_DISABLED_LABEL}</p>
      </div>
    );
  }
  // Permission gate: insufficient role = honest unavailable state.
  if (!host.hasPermission(permission)) {
    return (
      <PermissionGate host={host} permission={permission}>
        {/* unreachable — PermissionGate renders the block when permission is missing */}
        <></>
      </PermissionGate>
    );
  }
  // Only FORMED aggregates carry formation truth to prefill from.
  if (aggregate.state !== "FORMED" || aggregate.formation === undefined) {
    return <></>;
  }
  const prefill = groupBuyDraftPrefillOf(aggregate, share, actingPrincipal);
  return <LinkedDraftPanel host={host} prefill={prefill} ledger={ledger} merchantIdForPrefill={merchantIdForPrefill} />;
}

/**
 * The linked-order-draft affordance for an EXECUTED TradeCycle leg.
 * Renders for the acting participant whose stated want was satisfied by the
 * leg (the leg's receiver). The prefill carries the leg's item ref and the
 * acting principal's provenance.
 */
export function TradeCycleLegLinkedDraftAffordance({
  host,
  cycle,
  leg,
  actingPrincipal,
  ledger,
  permission,
  merchantIdForPrefill,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly cycle: TradeCycleExecution;
  readonly leg: TradeCycleExecutionLeg;
  readonly actingPrincipal: PrincipalRef;
  readonly ledger: LinkedDraftLedger;
  /** The permission that gates this affordance (participant side). */
  readonly permission: "tradecycle.consent-leg" | "storefront.manage";
  /** The merchant id the PLACE_ORDER prefill would carry (DEMO fixture). */
  readonly merchantIdForPrefill: string;
}): JSX.Element {
  // Kill switch: honest "linking disabled" label, never silent absence.
  if (!isLinkingDraftEnabled()) {
    return (
      <div className="cm-state-item" data-testid="cm-linking-disabled" style={{ marginTop: 8 }}>
        <span className="cm-chip cm-chip-muted">linking disabled</span>
        <p className="cm-state-item-detail">{LINKING_DISABLED_LABEL}</p>
      </div>
    );
  }
  // Permission gate: insufficient role = honest unavailable state.
  if (!host.hasPermission(permission)) {
    return (
      <PermissionGate host={host} permission={permission}>
        <></>
      </PermissionGate>
    );
  }
  // Only COMMITTED legs carry execution truth to prefill from.
  if (leg.consentState !== "COMMITTED") {
    return <></>;
  }
  const prefill = tradeCycleLegDraftPrefillOf(cycle, leg, actingPrincipal);
  return <LinkedDraftPanel host={host} prefill={prefill} ledger={ledger} merchantIdForPrefill={merchantIdForPrefill} />;
}

/** The shared panel: prefill display + confirm gate + recorded draft state. */
function LinkedDraftPanel({
  prefill,
  ledger,
  merchantIdForPrefill,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly prefill: LinkedOrderDraftPrefill;
  readonly ledger: LinkedDraftLedger;
  readonly merchantIdForPrefill: string;
}): JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const draftId = draftIdOf(prefill);
  const existing = ledger.forCart(prefill.cartId);
  const addCartLine = addCartLinePrefillOf(prefill);
  const placeOrder = placeOrderPrefillOf(prefill, merchantIdForPrefill);

  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-panel" style={{ marginTop: 8, borderColor: "var(--cm-info, var(--cm-ok))" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Create a linked order draft (human-confirmed, never automatic)</span>
        <span className="cm-chip cm-chip-unknown">draft — not a commitment</span>
        <DemoTag />
      </div>
      <TermLine
        label="Provenance — source aggregate"
        value={`${prefill.sourceAggregateId} (${prefill.sourceKind}) — rendered on-surface; the existing typed command carries no metadata field for this`}
      />
      <TermLine
        label="Provenance — acting principal"
        value={principalLabel(prefill.actingPrincipal)}
      />
      <TermLine
        label="Provenance — consent basis"
        value={prefill.consentBasis}
      />
      <TermLine
        label="Prefill — ADD_CART_LINE (the existing command, pre-filled)"
        value={`${addCartLine.type} · cart ${addCartLine.cartId} · sku ${addCartLine.skuRef} × ${addCartLine.units} @ ${addCartLine.unitPriceMinor} ${addCartLine.currency}`}
      />
      <TermLine
        label="Prefill — PLACE_ORDER (the existing command, pre-filled)"
        value={`${placeOrder.type} · cart ${placeOrder.cartId} · merchant ${placeOrder.merchantId}`}
      />
      <p className="cm-state-item-detail">
        The draft is a draft: placing the order still requires the existing confirmation flow
        unchanged (a draft is not a commitment; the existing PLACE_ORDER consent is the
        commitment step). The receipt/order references the source aggregate id on-surface
        (the existing typed command carries no metadata field, so the reference renders here
        and in the eventual receipt's subject line, honestly — never extends the kernel
        contract).
      </p>
      {existing ? (
        <RecordedDraftView draft={existing} />
      ) : confirmOpen ? (
        <KernelCommitmentGate
          title="Create the linked order draft (terms, consequence, evidence)"
          terms={[
            { label: "Source aggregate", value: prefill.sourceAggregateId },
            { label: "Acting principal", value: principalLabel(prefill.actingPrincipal) },
            { label: "Consent basis", value: prefill.consentBasis },
            { label: "Prefill", value: `ADD_CART_LINE (cart ${prefill.cartId}, sku ${prefill.skuRef}, ${prefill.units} units @ ${prefill.unitPrice.amountMinor} ${prefill.unitPrice.currency}) → PLACE_ORDER (cart ${prefill.cartId}, merchant ${merchantIdForPrefill})` },
            { label: "What creating the draft does", value: "Records the prefill in this surface's local DEMO ledger. It issues NO kernel command. The eventual placement (if you proceed) is the existing ADD_CART_LINE → PLACE_ORDER flow, unchanged, under your own authority and idempotency key." },
          ]}
          consequence="Confirming creates a DRAFT only — never an order, never a payment, never a reservation, never a recourse case. The draft is recorded in this surface's local DEMO state; placing the order is a SEPARATE step that requires the existing PLACE_ORDER confirmation flow, unchanged."
          evidence={[
            `Source aggregate: ${prefill.sourceAggregateId} (${prefill.sourceKind})`,
            `Acting principal: ${principalLabel(prefill.actingPrincipal)}`,
            "Formation/execution truth above (kernel-driven, DEMO-labelled fixtures)",
          ]}
          confirmLabel="Create the linked order draft (DEMO state, no command)"
          onConfirm={() => {
            ledger.record(prefill, prefill.actingPrincipal, new Date().toISOString());
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="cm-button cm-button-primary"
          style={{ marginTop: 8 }}
          data-testid={`cm-linking-draft-create-${draftId}`}
          onClick={() => setConfirmOpen(true)}
        >
          Create a linked order draft (human-confirmed, never automatic)
        </button>
      )}
    </div>
  );
}

/** The recorded-draft view (after the human confirmed creating the draft). */
function RecordedDraftView({ draft }: { readonly draft: RecordedDraft }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-recorded" style={{ marginTop: 6, borderColor: "var(--cm-ok)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Linked order draft recorded (DEMO state — no command issued)</span>
        <span className="cm-chip cm-chip-ok">draft recorded</span>
        <DemoTag />
      </div>
      <TermLine label="Source aggregate" value={draft.prefill.sourceAggregateId} />
      <TermLine label="Acting principal" value={principalLabel(draft.prefill.actingPrincipal)} />
      <TermLine label="Cart id (DEMO)" value={draft.prefill.cartId} />
      <TermLine label="Recorded at" value={draft.recordedAt} />
      <TermLine
        label="Next step (separately authorized)"
        value="Placing the order is a SEPARATE step: the existing ADD_CART_LINE → PLACE_ORDER confirmation flow, unchanged, under the acting human's own authority and idempotency key. The draft created NO order, NO payment, NO reservation, NO recourse case."
      />
    </div>
  );
}

function principalLabel(principal: PrincipalRef): string {
  if (principal.kind === "CUSTOMER") return `customer:${principal.customerId}`;
  if (principal.kind === "MERCHANT") return `merchant:${principal.merchantId}`;
  if (principal.kind === "SYSTEM") return `system:${principal.systemPrincipalId}`;
  // AUTONOMOUS_STORE is the remaining kind — exhaustive over PrincipalRef's union.
  return `autonomous-store:${principal.autonomousStoreId}`;
}
