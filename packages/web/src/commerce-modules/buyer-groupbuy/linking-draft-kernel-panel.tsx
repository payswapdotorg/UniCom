/**
 * W2-017 Stage 2 — the kernel-native linked-order-draft panel.
 *
 * UPGRADES the Stage-1 affordance to issue the REAL kernel-native commands
 * (`LINK_GROUPBUY_TO_ORDER_DRAFT` / `LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT`)
 * through the existing human-confirmation gate. The Stage-1 prefill + provenance
 * + DEMO labelling + permission gate + kill switch all STAY; the confirm now
 * creates a KERNEL draft (through the `LinkingDraftKernel` runner), not just a
 * host-side record.
 *
 * After confirmation, the surface renders the kernel's draft record:
 * - the draft id (kernel-truth, not a host-side id)
 * - the idempotency receipt (command id, idempotency key, executed at)
 * - the provenance (source aggregate/kind/actor/consent basis)
 * - the draft state (DRAFT)
 *
 * A duplicate confirm (same idempotency key) renders the ORIGINAL receipt
 * (idempotency visible). A kernel refusal (linking disabled / authorization /
 * any typed refusal) renders the refusal verbatim as an honest state — never
 * swallowed, never retried silently.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { PermissionGate, TermLine, DemoTag } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import {
  LINKING_DISABLED_LABEL,
  isLinkingDraftEnabled,
  groupBuyDraftPrefillOf,
  tradeCycleLegDraftPrefillOf,
} from "./linking-draft.js";
import type { LinkedOrderDraftPrefill } from "./linking-draft.js";
import { LinkingDraftKernel } from "./linking-draft-kernel.js";
import type { LinkingDraftExecution } from "./linking-draft-kernel.js";
import type { GroupBuyAggregate, GroupBuyParticipantShare, LinkedDraftAggregate, PrincipalRef, TradeCycleExecution, TradeCycleExecutionLeg, CommandReceipt } from "@unicom/commerce";

/**
 * The Stage-2 kernel-native affordance for a FORMED GroupBuy.
 * Replaces the Stage-1 `GroupBuyLinkedDraftAffordance` — the confirm now
 * issues the REAL kernel command.
 */
export function GroupBuyKernelDraftAffordance({
  host,
  aggregate,
  share,
  actingPrincipal,
  kernel,
  permission,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly aggregate: GroupBuyAggregate;
  readonly share: GroupBuyParticipantShare;
  readonly actingPrincipal: PrincipalRef;
  readonly kernel: LinkingDraftKernel;
  readonly permission: "groupbuy.review-proposal" | "groupbuy.express-interest";
}): JSX.Element {
  if (!isLinkingDraftEnabled()) {
    return (
      <div className="cm-state-item" data-testid="cm-linking-disabled" style={{ marginTop: 8 }}>
        <span className="cm-chip cm-chip-muted">linking disabled</span>
        <p className="cm-state-item-detail">{LINKING_DISABLED_LABEL}</p>
      </div>
    );
  }
  if (!host.hasPermission(permission)) {
    return (
      <PermissionGate host={host} permission={permission}>
        <></>
      </PermissionGate>
    );
  }
  if (aggregate.state !== "FORMED" || aggregate.formation === undefined) return <></>;
  const prefill = groupBuyDraftPrefillOf(aggregate, share, actingPrincipal);
  return <KernelDraftPanel prefill={prefill} kernel={kernel} actingPrincipal={actingPrincipal} groupBuy={aggregate} participantRef={share.participantRef} />;
}

/** The Stage-2 kernel-native affordance for an EXECUTED TradeCycle leg. */
export function TradeCycleLegKernelDraftAffordance({
  host,
  cycle,
  leg,
  actingPrincipal,
  kernel,
  permission,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly cycle: TradeCycleExecution;
  readonly leg: TradeCycleExecutionLeg;
  readonly actingPrincipal: PrincipalRef;
  readonly kernel: LinkingDraftKernel;
  readonly permission: "tradecycle.consent-leg" | "storefront.manage";
}): JSX.Element {
  if (!isLinkingDraftEnabled()) {
    return (
      <div className="cm-state-item" data-testid="cm-linking-disabled" style={{ marginTop: 8 }}>
        <span className="cm-chip cm-chip-muted">linking disabled</span>
        <p className="cm-state-item-detail">{LINKING_DISABLED_LABEL}</p>
      </div>
    );
  }
  if (!host.hasPermission(permission)) {
    return (
      <PermissionGate host={host} permission={permission}>
        <></>
      </PermissionGate>
    );
  }
  if (leg.consentState !== "COMMITTED") return <></>;
  const prefill = tradeCycleLegDraftPrefillOf(cycle, leg, actingPrincipal);
  return <KernelDraftPanel prefill={prefill} kernel={kernel} actingPrincipal={actingPrincipal} cycle={cycle} legIndex={leg.legIndex} />;
}

/** The shared panel: prefill + confirm gate + kernel draft result. */
function KernelDraftPanel({
  prefill,
  kernel,
  actingPrincipal,
  groupBuy,
  participantRef,
  cycle,
  legIndex,
}: {
  readonly prefill: LinkedOrderDraftPrefill;
  readonly kernel: LinkingDraftKernel;
  readonly actingPrincipal: PrincipalRef;
  readonly groupBuy?: GroupBuyAggregate;
  readonly participantRef?: PrincipalRef;
  readonly cycle?: TradeCycleExecution;
  readonly legIndex?: number;
}): JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<LinkingDraftExecution | null>(null);
  const idemKey = prefill.cartId;
  const existingDraft = kernel.draftFor(prefill.cartId);

  const onConfirm = (): void => {
    void (async () => {
      let outcome: LinkingDraftExecution;
      if (groupBuy !== undefined && participantRef !== undefined) {
        outcome = await kernel.linkGroupBuyToOrderDraft(groupBuy, participantRef, actingPrincipal, idemKey);
      } else {
        outcome = await kernel.linkTradeCycleLegToSettlementDraft(cycle!, legIndex!, actingPrincipal, idemKey);
      }
      setResult(outcome);
      setConfirmOpen(false);
    })();
  };

  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-panel" style={{ marginTop: 8, borderColor: "var(--cm-info, var(--cm-ok))" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Create a linked order draft (kernel-native, human-confirmed)</span>
        <span className="cm-chip cm-chip-unknown">draft — not a commitment</span>
        <DemoTag />
      </div>
      <TermLine label="Provenance — source aggregate" value={`${prefill.sourceAggregateId} (${prefill.sourceKind})`} />
      <TermLine label="Provenance — acting principal" value={principalLabel(prefill.actingPrincipal)} />
      <TermLine label="Provenance — consent basis" value={prefill.consentBasis} />
      <TermLine label="Kernel command" value={groupBuy !== undefined ? "LINK_GROUPBUY_TO_ORDER_DRAFT" : "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT"} />
      <p className="cm-state-item-detail">
        The confirm gate issues the REAL kernel-native LINK command through the <code>@unicom/commerce</code> contract.
        The kernel creates a DRAFT (journaled, idempotent receipt); the draft is NOT an order/payment/reservation.
        A duplicate confirm (same idempotency key) returns the ORIGINAL receipt — never a second draft.
      </p>
      {result?.status === "REJECTED" ? (
        <KernelRefusalView code={result.rejectionCode ?? "UNKNOWN"} detail={result.rejectionDetail ?? "the kernel refused the command"} />
      ) : result?.status === "EXECUTED" && result.draft ? (
        <KernelDraftRecordView draft={result.draft} receipt={result.receipt!} />
      ) : result?.status === "DUPLICATE" ? (
        <KernelDuplicateView receipt={result.originalReceipt!} draft={existingDraft} />
      ) : confirmOpen ? (
        <KernelCommitmentGate
          title="Create the linked order draft (kernel command — terms, consequence, evidence)"
          terms={[
            { label: "Source aggregate", value: prefill.sourceAggregateId },
            { label: "Acting principal", value: principalLabel(prefill.actingPrincipal) },
            { label: "Kernel command", value: groupBuy !== undefined ? "LINK_GROUPBUY_TO_ORDER_DRAFT" : "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT" },
            { label: "Consent basis", value: prefill.consentBasis },
            { label: "What the kernel does", value: "Issues the REAL LINK command through the @unicom/commerce contract. The kernel creates a DRAFT (journaled, idempotent receipt). The draft is NOT an order, payment, or reservation — placing still requires the existing PLACE_ORDER flow, unchanged." },
          ]}
          consequence="Confirming issues the kernel-native LINK command. The kernel creates a DRAFT only — never an order, never a payment, never a reservation, never a recourse case. The receipt references the source aggregate id."
          evidence={[
            `Source aggregate: ${prefill.sourceAggregateId} (${prefill.sourceKind})`,
            `Acting principal: ${principalLabel(prefill.actingPrincipal)}`,
            "Formation/execution truth above (kernel-driven, DEMO-labelled fixtures)",
          ]}
          confirmLabel="Issue the kernel LINK command (creates a DRAFT)"
          onConfirm={onConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : (
        <button type="button" className="cm-button cm-button-primary" style={{ marginTop: 8 }} data-testid="cm-linking-draft-create" onClick={() => setConfirmOpen(true)}>
          Create a linked order draft (kernel-native, human-confirmed)
        </button>
      )}
    </div>
  );
}

/** The kernel draft record view (after the LINK command executed). */
function KernelDraftRecordView({ draft, receipt }: { readonly draft: LinkedDraftAggregate; readonly receipt: CommandReceipt }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-recorded" style={{ marginTop: 6, borderColor: "var(--cm-ok)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Kernel draft created — journaled receipt</span>
        <span className="cm-chip cm-chip-ok">{draft.state}</span>
        <DemoTag />
      </div>
      <TermLine label="Draft id (kernel)" value={draft.draftId as string} />
      <TermLine label="Kernel receipt" value={`command ${receipt.commandId} · idempotency key ${receipt.idempotencyKey} · executed ${receipt.executedAt}`} />
      <TermLine label="Source aggregate" value={draft.provenance.sourceAggregateId} />
      <TermLine label="Source kind" value={draft.provenance.sourceKind} />
      <TermLine label="Acting principal" value={principalLabel(draft.provenance.actingPrincipal)} />
      <TermLine label="Consent basis" value={draft.provenance.consentBasis} />
      <TermLine label="Compensation ref" value={draft.provenance.compensationRef} />
      {draft.provenance.legIndex !== undefined ? <TermLine label="Leg index" value={String(draft.provenance.legIndex)} /> : null}
      <TermLine label="Next step (separately authorized)" value="Placing the order is a SEPARATE step: the existing ADD_CART_LINE → PLACE_ORDER confirmation flow, unchanged, under the acting human's own authority and idempotency key. The kernel draft created NO order, NO payment, NO reservation, NO recourse case." />
    </div>
  );
}

/** The kernel duplicate view (idempotency visible). */
function KernelDuplicateView({ receipt, draft }: { readonly receipt: CommandReceipt; readonly draft?: LinkedDraftAggregate }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-duplicate" style={{ marginTop: 6, borderColor: "var(--cm-ok)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Duplicate link command — the ORIGINAL receipt was returned (idempotency)</span>
        <span className="cm-chip cm-chip-ok">DUPLICATE</span>
        <DemoTag />
      </div>
      <TermLine label="Original receipt" value={`command ${receipt.commandId} · idempotency key ${receipt.idempotencyKey} · executed ${receipt.executedAt}`} />
      {draft ? <TermLine label="Draft id (kernel)" value={draft.draftId as string} /> : null}
      <TermLine label="Idempotency law" value="A duplicate LINK command with the same idempotency key returns the ORIGINAL receipt — never a second draft. The kernel's own receipt ledger enforces this." />
    </div>
  );
}

/** The kernel refusal view (honest state — never swallowed). */
function KernelRefusalView({ code, detail }: { readonly code: string; readonly detail: string }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-linking-draft-refused" style={{ marginTop: 6, borderColor: "var(--cm-warn)" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">The kernel refused the LINK command — honest state</span>
        <span className="cm-chip cm-chip-warn">{code}</span>
        <DemoTag />
      </div>
      <TermLine label="Refusal code" value={code} />
      <TermLine label="Refusal detail" value={detail} />
      <TermLine label="Kill-switch honesty" value="The kernel's refusal is rendered verbatim — never swallowed, never retried silently. If the kill switch is OFF, the refusal is LINKING_DISABLED; if the actor is unauthorized, the refusal names who may." />
    </div>
  );
}

function principalLabel(principal: PrincipalRef): string {
  if (principal.kind === "CUSTOMER") return `customer:${principal.customerId}`;
  if (principal.kind === "MERCHANT") return `merchant:${principal.merchantId}`;
  if (principal.kind === "SYSTEM") return `system:${principal.systemPrincipalId}`;
  return `autonomous-store:${principal.autonomousStoreId}`;
}
