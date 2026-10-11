/**
 * J9 per-leg card — renders ONE leg of the kernel's TradeCycleExecution at
 * its browser-evidenced display position (`cm-tradecycle-leg-{display}`) with
 * its fixture terms (item, proof level, privacy, consent window) and the
 * kernel-driven consent controls. Every control submits a typed kernel
 * command; the consent/refusal state shown is the kernel leg's own state.
 */
import type { JSX } from "react";

import { principalRefEquals } from "@unicom/commerce";
import type { TradeCycleCommandPayload, TradeCycleExecution, TradeCycleExecutionLeg } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { PROOF_LEVELS } from "@unicom/experience";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { KernelCommitmentGate } from "./gate.js";
import { TradeCycleLegLinkedDraftAffordance } from "../buyer-groupbuy/linking-draft-panel.js";
import { TradeCycleLegKernelDraftAffordance } from "../buyer-groupbuy/linking-draft-kernel-panel.js";
import { LinkedDraftLedger } from "../buyer-groupbuy/linking-draft.js";
import { LinkingDraftKernel } from "../buyer-groupbuy/linking-draft-kernel.js";
import { DEMO_TRADE_PARTICIPANTS, DEMO_TRADE_PRINCIPALS, participantIdOf, participantName } from "./tradecycle-data.js";
import type { DemoCycleCandidate } from "./tradecycle-data.js";

const LEG_CHIP: Readonly<Record<TradeCycleExecutionLeg["consentState"], string>> = {
  PENDING: "cm-chip cm-chip-muted",
  CONSENTED: "cm-chip cm-chip-ok",
  REFUSED: "cm-chip cm-chip-warn",
  EXPIRED: "cm-chip cm-chip-warn",
  WITHDRAWN: "cm-chip cm-chip-muted",
  UNKNOWN: "cm-chip cm-chip-unknown",
  COMMITTED: "cm-chip cm-chip-ok",
  ROLLED_BACK: "cm-chip cm-chip-muted",
};

function proofLabel(id: string | undefined): string {
  return PROOF_LEVELS.find((level) => level.id === id)?.label ?? id ?? "P0";
}

const AMBIGUITY_KIND_TEXT: Readonly<Record<string, string>> = {
  AMBIGUOUS_AUTHORIZATION: "an authorization attempt",
  AMBIGUOUS_REFUSAL: "a refusal attempt",
  AMBIGUOUS_WITHDRAWAL: "a withdrawal attempt",
};

/** Opaque per-leg authorization reference (DEMO fixture, kernel-required). */
function authRefOf(leg: TradeCycleExecutionLeg): string {
  const participantId = participantIdOf(leg.fromRef) ?? "unknown";
  return `w2tc-authz-${participantId}-leg-${leg.legIndex}`;
}

export function LegCard({
  displayPosition,
  leg,
  cycle,
  candidate,
  consentWindowEnds,
  host,
  ownGateLeg,
  setOwnGateLeg,
  run,
  draftLedger,
  draftKernel,
}: {
  readonly displayPosition: number;
  readonly leg: TradeCycleExecutionLeg;
  readonly cycle: TradeCycleExecution;
  readonly candidate: DemoCycleCandidate;
  readonly consentWindowEnds: string;
  readonly host: CommerceModuleProps["host"];
  readonly ownGateLeg: number | null;
  readonly setOwnGateLeg: (displayPosition: number | null) => void;
  readonly run: (payload: TradeCycleCommandPayload) => void;
  /** W2-015 Stage 1: the local DEMO ledger for linked-order drafts. */
  readonly draftLedger: LinkedDraftLedger;
  /** W2-017 Stage 2: the kernel-native draft runner. */
  readonly draftKernel: LinkingDraftKernel;
}): JSX.Element {
  const youRef = DEMO_TRADE_PRINCIPALS["harbor-lane"]!;
  const isOwnLeg = principalRefEquals(leg.fromRef, youRef);
  const giver = participantName(leg.fromRef);
  const receiver = participantName(leg.toRef);
  const shortGiver = giver.split(" (")[0]!;
  const open = cycle.state === "OPEN" || cycle.state === "ALL_LEGS_AUTHORIZED";
  const item = candidate.itemByKernelLeg[leg.legIndex] ?? leg.offeredItemRef;
  // Your incoming leg: the leg whose receiver is you (your stated want).
  const incoming = cycle.legs.find((one) => principalRefEquals(one.toRef, youRef));
  const incomingItem = incoming ? (candidate.itemByKernelLeg[incoming.legIndex] ?? incoming.offeredItemRef) : null;
  const incomingDisplay = incoming ? candidate.displayOrder.indexOf(incoming.legIndex) : -1;
  const giverProofLevel = DEMO_TRADE_PARTICIPANTS.find((one) => one.id === participantIdOf(leg.fromRef))?.proofLevel;
  return (
    <div className="cm-state-item" data-testid={`cm-tradecycle-leg-${displayPosition}`}>
      <div className="cm-row">
        <span className="cm-state-item-label">
          Leg {displayPosition + 1} · {giver} → {receiver}
        </span>
        <span className={LEG_CHIP[leg.consentState]}>{leg.consentState}</span>
        <DemoTag />
      </div>
      <TermLine label="Item moving on this leg" value={item} />
      <TermLine label="Consent authority" value={`${giver} — only the giving participant may authorize this leg`} />
      <TermLine label="Proof level" value={proofLabel(leg.requiredProofLevel ?? giverProofLevel)} />
      <TermLine label="Privacy" value="Only the immediate counterpart learns your identity on this leg — no participant sees the whole graph." />
      <TermLine label="Consent window ends" value={`${consentWindowEnds} (demo clock)`} />
      {leg.authorization ? (
        <TermLine
          label="Kernel authorization record"
          value={`authorized by ${participantName(leg.authorization.authorizedBy)} · reference ${leg.authorization.authorizationRef} (DEMO) · recorded ${leg.authorization.recordedAt}`}
        />
      ) : null}
      {leg.ambiguity ? (
        <TermLine
          label="Kernel ambiguity record"
          value={`${AMBIGUITY_KIND_TEXT[leg.ambiguity.kind] ?? leg.ambiguity.kind} by ${participantName(
            leg.ambiguity.attemptedBy,
          )} — ${leg.ambiguity.reason}: the leg is held UNKNOWN, never silently passed and never failed`}
        />
      ) : null}
      <PermissionGate host={host} permission="tradecycle.consent-leg">
        {open && leg.consentState === "PENDING" ? (
          isOwnLeg ? (
            ownGateLeg === displayPosition ? (
              <KernelCommitmentGate
                title="Consent to YOUR leg (terms, consequence, evidence)"
                terms={[
                  { label: "You give", value: item },
                  { label: "You asked for", value: `${incomingItem ?? "nothing on this cycle"} — delivered to you on your incoming leg${incoming ? ` (leg ${incomingDisplay + 1})` : ""}` },
                  { label: "Counterpart on this leg", value: receiver },
                  { label: "Authorization reference", value: `${authRefOf(leg)} (DEMO fixture reference — the kernel requires one per leg)` },
                  { label: "Revocability", value: "You may withdraw any time before execution — a withdrawal stops the whole cycle, it never strands a partial trade." },
                ]}
                consequence="Consenting authorizes ONLY this leg. The AUTHORIZE_TRADE_CYCLE_LEG command records your per-leg authorization in the commerce kernel; the cycle commits nothing until every leg is authorized AND you execute it — your consent moves no item by itself."
                evidence={["Your stated want and offer (committed demo fixture)", "Consent window end shown above (demo clock)"]}
                confirmLabel="Consent to my leg"
                onConfirm={() => {
                  run({
                    type: "AUTHORIZE_TRADE_CYCLE_LEG",
                    cycleId: cycle.tradeCycleId,
                    legIndex: leg.legIndex,
                    authorizingRef: leg.fromRef,
                    authorizationRef: authRefOf(leg),
                  });
                  setOwnGateLeg(null);
                }}
                onCancel={() => setOwnGateLeg(null)}
              />
            ) : (
              <div className="cm-row" style={{ marginTop: 6 }}>
                <button type="button" className="cm-button cm-button-primary" onClick={() => setOwnGateLeg(displayPosition)}>
                  Consent to my leg (with authorization)
                </button>
              </div>
            )
          ) : (
            <PeerLegControls leg={leg} cycle={cycle} shortGiver={shortGiver} run={run} />
          )
        ) : null}
        {open && (leg.consentState === "CONSENTED" || leg.consentState === "UNKNOWN") ? (
          <div className="cm-row" style={{ marginTop: 6 }}>
            {leg.consentState === "CONSENTED" ? (
              <button
                type="button"
                className="cm-button"
                onClick={() =>
                  run({
                    type: "WITHDRAW_TRADE_CYCLE_LEG",
                    cycleId: cycle.tradeCycleId,
                    legIndex: leg.legIndex,
                    withdrawingRef: leg.fromRef,
                  })
                }
              >
                {isOwnLeg ? "Withdraw my consent (dropout)" : `${shortGiver} drops out — stop the cycle`}
              </button>
            ) : (
              <button
                type="button"
                className="cm-button"
                onClick={() =>
                  run({
                    type: "AUTHORIZE_TRADE_CYCLE_LEG",
                    cycleId: cycle.tradeCycleId,
                    legIndex: leg.legIndex,
                    authorizingRef: leg.fromRef,
                    authorizationRef: authRefOf(leg),
                  })
                }
              >
                {shortGiver} now clearly authorizes (disambiguation)
              </button>
            )}
            {!isOwnLeg ? (
              <button
                type="button"
                className="cm-button"
                onClick={() =>
                  run({
                    type: "REFUSE_TRADE_CYCLE_LEG",
                    cycleId: cycle.tradeCycleId,
                    legIndex: leg.legIndex,
                    refusingRef: leg.fromRef,
                    reason: "Demo peer refusal (fixture script)",
                  })
                }
              >
                {shortGiver} {leg.consentState === "CONSENTED" ? "changes to a refusal — stop the cycle" : "refuses — stop the cycle"}
              </button>
            ) : null}
          </div>
        ) : null}
      </PermissionGate>

      {/* W2-015 Stage 1: the linked-order-draft affordance (prefill only). */}
      {leg.consentState === "COMMITTED" ? (
        <TradeCycleLegLinkedDraftAffordance
          host={host}
          cycle={cycle}
          leg={leg}
          actingPrincipal={leg.toRef}
          ledger={draftLedger}
          permission="tradecycle.consent-leg"
          merchantIdForPrefill="merchant-1"
        />
      ) : null}
      {/* W2-017 Stage 2: the kernel-native draft affordance (issues the REAL LINK command). */}
      {leg.consentState === "COMMITTED" ? (
        <TradeCycleLegKernelDraftAffordance
          host={host}
          cycle={cycle}
          leg={leg}
          actingPrincipal={leg.toRef}
          kernel={draftKernel}
          permission="tradecycle.consent-leg"
        />
      ) : null}
    </div>
  );
}

function PeerLegControls({
  leg,
  cycle,
  shortGiver,
  run,
}: {
  readonly leg: TradeCycleExecutionLeg;
  readonly cycle: TradeCycleExecution;
  readonly shortGiver: string;
  readonly run: (payload: TradeCycleCommandPayload) => void;
}): JSX.Element {
  const youRef = DEMO_TRADE_PRINCIPALS["harbor-lane"]!;
  return (
    <div className="cm-row" style={{ marginTop: 6 }}>
      <button
        type="button"
        className="cm-button"
        onClick={() =>
          run({
            type: "AUTHORIZE_TRADE_CYCLE_LEG",
            cycleId: cycle.tradeCycleId,
            legIndex: leg.legIndex,
            authorizingRef: leg.fromRef,
            authorizationRef: authRefOf(leg),
          })
        }
      >
        {shortGiver} consents (demo advance)
      </button>
      <button
        type="button"
        className="cm-button"
        onClick={() =>
          run({
            type: "REFUSE_TRADE_CYCLE_LEG",
            cycleId: cycle.tradeCycleId,
            legIndex: leg.legIndex,
            refusingRef: leg.fromRef,
            reason: "Demo peer refusal (fixture script)",
          })
        }
      >
        {shortGiver} refuses — stop the cycle
      </button>
      <button
        type="button"
        className="cm-button"
        onClick={() => run({ type: "LAPSE_TRADE_CYCLE_LEG", cycleId: cycle.tradeCycleId, legIndex: leg.legIndex })}
      >
        Let this leg&apos;s consent window lapse
      </button>
      <button
        type="button"
        className="cm-button"
        onClick={() =>
          run({
            type: "AUTHORIZE_TRADE_CYCLE_LEG",
            cycleId: cycle.tradeCycleId,
            legIndex: leg.legIndex,
            authorizingRef: youRef,
            authorizationRef: "w2tc-authz-non-giver-attempt",
          })
        }
      >
        Attempt as a non-giver (kernel holds the leg UNKNOWN)
      </button>
    </div>
  );
}
