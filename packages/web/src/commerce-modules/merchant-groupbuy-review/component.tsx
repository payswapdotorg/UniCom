/**
 * merchant-groupbuy-review component — the J5 merchant-side surface (lazily
 * loaded).
 *
 * KERNEL-WIRED (W3-016): the queue renders REAL W1-012 GroupBuy formation
 * aggregates (see seed.ts) and every merchant decision — accept, counter,
 * reject, and the explicit formation of a HELD pool — runs as a REAL
 * transition of that kernel machine through the public `@unicom/commerce`
 * entrypoint. Threshold MONITORING, HELD pools and FORMED final terms
 * render from kernel truth; participant rosters and consent terms render
 * from the aggregate's own interest records. The former "local demo state /
 * not the kernel journal" statements are superseded: decisions are
 * kernel-journaled facts (revisioned, deterministic).
 *
 * The desk remains a REVIEW surface: it never overrides buyer consent
 * (only consenting studios are ever in a roster, withdrawals are honored
 * any time before formation, buyer-side events are never simulated here),
 * it enrolls nobody, charges nobody, reserves no stock, and no commitment,
 * purchase, payment or order is ever created — commitments exist only on
 * the commerce planes, after formation.
 */

import type { JSX } from "react";

import { useState } from "react";
import {
  decideGroupBuyProposal,
  formGroupBuy,
  groupBuyPoolValue,
  groupBuyThresholdMet,
  poolParticipantCountOf,
  poolUnitsOf,
  subtractMoney,
  unwrap,
} from "@unicom/commerce";
import type {
  GroupBuyCounterTerms,
  GroupBuyDecisionError,
  GroupBuyFormationError,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import { DemoTag } from "../merchant-shared/ui.js";
import {
  GROUPBUY_REVIEW_FIXTURES_ID,
  GROUPBUY_REVIEW_NOW,
  GROUPBUY_REVIEW_NOW_LABEL,
  clockLabel,
} from "./fixtures.js";
import type { DemoCounterOption } from "./fixtures.js";
import {
  seedGroupBuyReview,
  thresholdSummaryOf,
} from "./seed.js";
import type { SeededPool } from "./seed.js";
import { LinkedDraftLedger } from "../buyer-groupbuy/linking-draft.js";
import { LinkingDraftKernel } from "../buyer-groupbuy/linking-draft-kernel.js";
import {
  HeldFormationPanel,
  PendingDecisions,
  PoolHeader,
  PoolRoster,
  PoolStateDetail,
  PoolTermsPanel,
  PoolThresholdRow,
} from "./component-parts.js";
import type { PoolView } from "./component-parts.js";

/** One kernel transition recorded by this desk (kind, states, revision). */
interface DecisionLogEntry {
  readonly kind: "ACCEPT" | "COUNTER" | "REJECT" | "FORM";
  readonly poolId: string;
  readonly from: string;
  readonly to: string;
  readonly revision: number;
  readonly detail: string;
  readonly at: string;
}

/** A kernel refusal surfaced honestly (nothing was applied). */
interface MachineRefusal {
  readonly poolId: string;
  readonly code: string;
  readonly detail: string;
}

function refusalDetail(error: GroupBuyDecisionError | GroupBuyFormationError): string {
  switch (error.code) {
    case "INVALID_GROUP_BUY_TRANSITION":
      return `the formation machine refuses ${error.trigger} from ${error.from} — the transition does not exist in the lifecycle table; nothing was applied`;
    case "COUNTER_TERMS_REQUIRED":
      return "the formation machine requires counter terms for a COUNTER — nothing was applied";
    case "COUNTER_TERMS_NOT_ALLOWED":
      return `the formation machine does not accept replacement terms on ${error.trigger} — the terms on record stand; nothing was applied`;
    case "REJECTION_REASON_REQUIRED":
      return "the formation machine requires a recorded reason for a REJECT — nothing was applied";
    case "CURRENCY_MISMATCH":
      return `currency mismatch (${error.left} vs ${error.right}) — nothing was applied`;
    case "NOT_HELD":
      return `formation runs only from HELD (this pool is ${error.state}) — nothing was applied`;
    case "POOL_BELOW_THRESHOLD":
      return `the live pool no longer meets both thresholds (${error.participants} studios / ${error.units} boxes) — nothing was applied`;
    default:
      return "the formation machine refused the transition — nothing was applied";
  }
}

export default function MerchantGroupbuyReviewComponent({ host }: CommerceModuleProps): JSX.Element {
  const [pools, setPools] = useState<readonly SeededPool[]>(() => seedGroupBuyReview());
  const [decisions, setDecisions] = useState<readonly DecisionLogEntry[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Readonly<Record<string, string>>>({});
  const [refusal, setRefusal] = useState<MachineRefusal | null>(null);
  // W2-015 Stage 1: the local DEMO ledger of linked-order drafts created on
  // this surface. NOT kernel truth — the eventual PLACE_ORDER (if the human
  // proceeds) travels through the existing kernel command path under its own
  // idempotency key.
  const [draftLedger] = useState<LinkedDraftLedger>(() => new LinkedDraftLedger());
  const [draftKernel] = useState<LinkingDraftKernel>(() => new LinkingDraftKernel());

  const reset = (): void => {
    setPools(seedGroupBuyReview());
    setDecisions([]);
    setRejectReasons({});
    setRefusal(null);
    draftLedger.reset();
    draftKernel.reset();
  };

  /** Apply a kernel outcome: replace the pool's aggregate on success. */
  const applyDecision = (
    poolId: string,
    kind: DecisionLogEntry["kind"],
    detail: string,
    outcome: { readonly ok: true; readonly value: SeededPool["aggregate"] } | { readonly ok: false; readonly error: GroupBuyDecisionError | GroupBuyFormationError },
  ): void => {
    if (!outcome.ok) {
      setRefusal({ poolId, code: outcome.error.code, detail: refusalDetail(outcome.error) });
      return;
    }
    setRefusal(null);
    const pool = pools.find((entry) => entry.aggregate.groupBuyId === poolId);
    const previousState = pool?.aggregate.state ?? "?";
    setPools((current) =>
      current.map((entry) =>
        entry.aggregate.groupBuyId === poolId ? { ...entry, aggregate: outcome.value } : entry,
      ),
    );
    setDecisions((current) => [
      ...current,
      {
        kind,
        poolId,
        from: previousState,
        to: outcome.value.state,
        revision: outcome.value.revision,
        detail,
        at: GROUPBUY_REVIEW_NOW_LABEL,
      },
    ]);
  };

  const accept = (poolId: string, met: boolean): void => {
    const pool = pools.find((entry) => entry.aggregate.groupBuyId === poolId);
    if (!pool) return;
    applyDecision(
      poolId,
      "ACCEPT",
      `at ${fmtMoney(pool.aggregate.terms.proposedUnitPrice)} / box — ${met ? "threshold met" : "below threshold, monitoring"}`,
      decideGroupBuyProposal(pool.aggregate, "ACCEPT"),
    );
  };

  const counter = (poolId: string, option: DemoCounterOption): void => {
    const pool = pools.find((entry) => entry.aggregate.groupBuyId === poolId);
    if (!pool) return;
    const counterTerms: GroupBuyCounterTerms = {
      unitPrice: demoMoney(option.unitPriceMinor),
      minimumUnits: option.minimumBoxes,
      note: option.note,
    };
    applyDecision(
      poolId,
      "COUNTER",
      `counter ${fmtMoney(counterTerms.unitPrice)} / box (min ${counterTerms.minimumUnits})`,
      decideGroupBuyProposal(pool.aggregate, "COUNTER", { counterTerms }),
    );
  };

  const reject = (poolId: string, reason: string): void => {
    const pool = pools.find((entry) => entry.aggregate.groupBuyId === poolId);
    if (!pool) return;
    applyDecision(
      poolId,
      "REJECT",
      `reason: ${reason}`,
      decideGroupBuyProposal(pool.aggregate, "REJECT", { rejectionReason: reason }),
    );
  };

  const form = (poolId: string): void => {
    const pool = pools.find((entry) => entry.aggregate.groupBuyId === poolId);
    if (!pool) return;
    applyDecision(
      poolId,
      "FORM",
      `final terms at ${fmtMoney(pool.aggregate.terms.proposedUnitPrice)} / box — pool value ${fmtMoney(groupBuyPoolValue(pool.aggregate.terms.proposedUnitPrice, pool.interests))}`,
      formGroupBuy(pool.aggregate, pool.interests, pool.aggregate.terms.proposedUnitPrice, GROUPBUY_REVIEW_NOW),
    );
  };

  const openCount = pools.filter((pool) => pool.aggregate.state === "PENDING").length;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J5 · Merchant group-buy review</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Buyer pools propose group deals for things you don&apos;t currently offer as a group
          buy — this is your review desk, wired to the REAL GroupBuy formation machine of the
          commerce kernel (W1-012 seam, through <code>@unicom/commerce</code>; fixtures{" "}
          <code>{GROUPBUY_REVIEW_FIXTURES_ID}</code>, demo clock {GROUPBUY_REVIEW_NOW_LABEL}).
          Participant counts vs thresholds, proposed terms, consent terms and deadlines render
          from the kernel aggregate before any decision; accept, counter, reject and the
          explicit formation of a HELD pool each run as a real, revisioned kernel transition —
          kernel-journaled facts, no longer local demo state. The desk remains a review surface:
          it never overrides buyer consent, enrolls nobody, charges nobody, reserves no stock,
          and creates no commitment — commitments exist only on the commerce planes. The seeded
          history (interests, the recorded counter, the withdrawal in w3gr-prop-8) is a
          deterministic fixture script; the desk itself never simulates a buyer. The buyer side
          of this same synthetic scenario space is W2&apos;s surface (buyer-groupbuy,{" "}
          <code>w2ld-</code> fixtures) — mirrored read-only, never edited here.
        </p>
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={reset}>
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live buyers or pools
          </span>
        </div>
      </section>

      <section aria-label="Incoming proposals">
        <h2 className="cm-section-title">Incoming latent-demand proposals ({openCount} awaiting review)</h2>
        <div className="cm-stack">
          {pools.map((pool) => {
            const aggregate = pool.aggregate;
            const poolId = String(aggregate.groupBuyId);
            const units = poolUnitsOf(pool.interests);
            const studios = poolParticipantCountOf(pool.interests);
            const met = groupBuyThresholdMet(aggregate.terms.threshold, pool.interests);
            const view: PoolView = {
              poolId,
              aggregate,
              interests: pool.interests,
              units,
              studios,
              met,
              summary: thresholdSummaryOf(aggregate, pool.interests),
              price: fmtMoney(aggregate.terms.proposedUnitPrice),
              list: fmtMoney(aggregate.terms.listUnitPrice),
              saving: fmtMoney(
                unwrap(subtractMoney(aggregate.terms.listUnitPrice, aggregate.terms.proposedUnitPrice)),
              ),
              poolValue: fmtMoney(groupBuyPoolValue(aggregate.terms.proposedUnitPrice, pool.interests)),
              deadline: clockLabel(aggregate.terms.windowClosesAt),
            };
            return (
              <div key={poolId} className="cm-state-item" data-proposal-id={poolId}>
                <PoolHeader view={view} />
                <PoolTermsPanel view={view} />
                <PoolThresholdRow view={view} />
                <PoolRoster view={view} />
                {aggregate.state === "PENDING" ? (
                  <PendingDecisions
                    host={host}
                    view={view}
                    rejectReason={rejectReasons[poolId]}
                    onAccept={() => accept(poolId, met)}
                    onCounter={(option) => counter(poolId, option)}
                    onRejectReason={(reason) =>
                      setRejectReasons((current) => ({ ...current, [poolId]: reason }))
                    }
                    onReject={() => reject(poolId, rejectReasons[poolId] ?? "")}
                  />
                ) : null}
                {aggregate.state === "HELD" ? (
                  <HeldFormationPanel host={host} view={view} onForm={() => form(poolId)} />
                ) : null}
                <PoolStateDetail view={view} host={host} draftLedger={draftLedger} draftKernel={draftKernel} />
              </div>
            );
          })}
        </div>
      </section>

      {refusal ? (
        <section className="cm-card" aria-label="Kernel refusal">
          <div className="cm-row">
            <h2 className="cm-card-title">The formation machine refused the last action</h2>
            <span className="cm-chip cm-chip-warn" data-status="REFUSED">{refusal.code}</span>
          </div>
          <p className="cm-card-sub">
            {refusal.poolId}: {refusal.detail}. Refusals are deterministic and total — no partial
            application ever happens; the aggregate above is unchanged.
          </p>
        </section>
      ) : null}

      <section aria-label="Kernel decision log">
        <h2 className="cm-section-title">Kernel decision log — formation-machine transitions</h2>
        {decisions.length === 0 ? (
          <p className="cm-card-sub">
            No decisions recorded yet — the queue above is exactly the seeded kernel aggregates
            (every pool&apos;s history was driven by the same formation machine).
          </p>
        ) : (
          <ul className="cm-perm-list" data-testid="cm-decision-log">
            {decisions
              .slice()
              .reverse()
              .map((entry, index) => (
                <li key={`${entry.poolId}-${entry.kind}-${index}`}>
                  <code>{entry.kind}</code> · {entry.poolId} · {entry.from} → {entry.to} · kernel
                  revision {entry.revision} · {entry.detail} · {entry.at}
                </li>
              ))}
          </ul>
        )}
        <p className="cm-env-note">
          The W1-012 command-envelope journal (typed GroupBuyCommandPayload handlers) is the
          kernel lane&apos;s concurrent work; this desk drives the published formation aggregate
          directly — every entry above is a real machine transition with its resulting kernel
          revision, never a fabricated state.
        </p>
      </section>

      <section className="cm-card" aria-label="Boundaries">
        <h2 className="cm-card-title">What this surface will never do</h2>
        <p className="cm-card-sub">
          It will never override buyer consent (only consenting studios are ever listed or
          frozen into a roster; withdrawals before formation are honored and visible), never
          simulate a buyer response, never enroll anyone, charge anyone or reserve stock — and
          no purchase, payment, refund or order is created anywhere on it. Formation is the
          organizer&apos;s second confirmation: it freezes final terms and the consenting-only
          roster, and a commitment would exist only on the commerce planes after it — nothing
          here creates one. Live pools and buyers do not exist: everything renders from
          deterministic fixtures through the real formation machine.
        </p>
      </section>
    </div>
  );
}
