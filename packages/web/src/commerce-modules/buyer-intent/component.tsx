/**
 * buyer-intent component — the J1 surface (lazily loaded). Everything is a
 * deterministic DEMO fixture except the buyer's own draft/constraint input,
 * which lives in local component state only (never sent anywhere).
 */
import type { JSX } from "react";

import { useMemo, useState } from "react";
import { INTENT_CONSTRAINT_FIELDS } from "@unicom/experience";
import type {
  IntentConstraintFieldDescriptor,
  IntentConstraintFieldId,
  IntentPlanOption,
  StrategyRef,
  UtcIso8601String,
  WaitOrBuyGuidance,
} from "@unicom/experience";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { EmptyStatePanel } from "../../commerce-host/shared/index.js";
import { DEMO_NOW, W2_DEMO_FIXTURES_ID, demoRef } from "../buyer-support/demo-data.js";
import { DemoTag, FieldRow, PermissionGate, TermLine } from "../buyer-support/ui.js";

type FieldValue = string | boolean;
type FieldValues = Partial<Record<IntentConstraintFieldId, FieldValue>>;

/** Constraint groups (presentation only — the facet catalog is the contract's). */
const FIELD_GROUPS: readonly { readonly title: string; readonly fields: readonly IntentConstraintFieldId[] }[] = [
  { title: "Timing & budget", fields: ["deadline", "time-window", "max-total-cost"] },
  { title: "Quality, condition & trust", fields: ["min-quality", "condition", "seller-credibility-threshold"] },
  { title: "Getting it", fields: ["delivery-pickup-constraints", "location"] },
  {
    title: "Flexibility",
    fields: [
      "acceptable-substitutes",
      "buy-vs-wait-tolerance",
      "financing-preference",
      "group-buy-willingness",
      "trade-swap-willingness",
    ],
  },
  {
    title: "Evidence & recourse (your protection terms)",
    fields: ["privacy-requirements", "security-requirements", "proof-requirements", "recourse-requirements"],
  },
];

const FIELD_CATALOG: ReadonlyMap<IntentConstraintFieldId, IntentConstraintFieldDescriptor> = new Map(
  INTENT_CONSTRAINT_FIELDS.map((field) => [field.fieldId, field]),
);

/** Where each plan-option kind hands off to inside the host (real navigation). */
const PLAN_TARGET_PATH: Readonly<Record<IntentPlanOption["kind"], string>> = {
  "buy-now": "/commerce/buyer/decide",
  "wait-for-price": "/commerce/buyer/decide",
  "wait-for-inventory": "/commerce/buyer/decide",
  "group-with-others": "/commerce/buyer/group-buy",
  "propose-group-deal": "/commerce/buyer/group-buy/latent-demand",
  negotiate: "/commerce/buyer/decide",
  substitute: "/commerce/buyer/compare",
  "buy-locally": "/commerce/buyer/compare",
  "rent-or-borrow": "/commerce/rent",
  "resell-existing": "/commerce/resale",
  "multi-person-swap": "/commerce/trade-cycle",
};

const PLAN_LABEL: Readonly<Record<IntentPlanOption["kind"], string>> = {
  "buy-now": "buy now",
  "wait-for-price": "wait for a price move",
  "wait-for-inventory": "wait for stock",
  "group-with-others": "join others",
  "propose-group-deal": "propose a group deal",
  negotiate: "negotiate",
  substitute: "allow substitutes",
  "buy-locally": "buy locally",
  "rent-or-borrow": "rent or borrow",
  "resell-existing": "sell what you own",
  "multi-person-swap": "multi-person swap",
};

/** DEMO wait-or-buy guidance (predictive truth, always labeled). */
const DEMO_WAIT_OR_BUY: WaitOrBuyGuidance = {
  truthClass: "predictive",
  recommendation: "no-clear-answer",
  reasoningSummary:
    "Your deadline (2 weeks) is close enough that waiting for a price drop is risky; two sellers have stock today at similar prices. No clear winner on timing alone.",
  expectedSavingNote: "A modeled drop of ~4–7% in 3 weeks exists for one seller, but it may not happen.",
  deadlineRiskNote: "Waiting past Oct 20 likely means paying express delivery or missing the print run.",
  evidence: [],
};

export default function BuyerIntentComponent({ host }: CommerceModuleProps): JSX.Element {
  const [draft, setDraft] = useState<string>(host.scenario.intentDraft);
  const [values, setValues] = useState<FieldValues>({});
  const [reviewed, setReviewed] = useState<boolean>(false);
  const descriptorById = useMemo(() => FIELD_CATALOG, []);

  const filledHints = useMemo(
    () =>
      INTENT_CONSTRAINT_FIELDS.filter((field) => {
        const value = values[field.fieldId];
        return value === true || (typeof value === "string" && value.trim().length > 0);
      }).map((field) => field.fieldId),
    [values],
  );

  const hasDraft = draft.trim().length > 0;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J1 · Intent canvas</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Start from what you need, not from a product category. Everything you type stays on this
          screen (local demo state; fixtures {W2_DEMO_FIXTURES_ID}). Plan guidance below is
          <strong> predictive — not a promise</strong>.
        </p>
      </section>

      {!hasDraft && filledHints.length === 0 ? (
        <EmptyStatePanel
          view={{
            stateKind: "empty",
            reasonSummary: "No intent captured yet — the canvas is waiting for your own words.",
            firstAction: {
              actionLabel: "Describe what you need",
              actionKind: "create",
              targetSurfaceId: "buyer-intent-canvas",
              rationale:
                "Type what you need above (e.g. “40 boxes of A3 recycled card within 2 weeks, around 480 total”) — a clearer intent lets every other surface answer precisely.",
            },
            teachingNote: "Empty states always propose the next action — they never dead-end.",
          }}
        />
      ) : null}

      <section className="cm-card" aria-label="Intent draft">
        <h2 className="cm-card-title">What do you need?</h2>
        <textarea
          className="cm-intent-draft"
          aria-label="Your intent in your own words"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </section>

      <PermissionGate host={host} permission="intent.create">
        <section className="cm-card" aria-label="Constraint editor">
          <h2 className="cm-card-title">Constraints (the 17-facet catalog, rendered from the typed contract)</h2>
          <p className="cm-card-sub">
            Each facet comes from <code>INTENT_CONSTRAINT_FIELDS</code> — the frozen intent
            vocabulary. Leave anything blank to keep it open.
          </p>
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} style={{ marginTop: 12 }}>
              <h3 className="cm-card-title" style={{ fontSize: 13 }}>{group.title}</h3>
              <div className="cm-grid">
                {group.fields.map((fieldId) => {
                  const field = descriptorById.get(fieldId);
                  if (!field) return null;
                  return (
                    <div key={fieldId} className="cm-card" style={{ padding: 10 }}>
                      <FieldRow label={`${field.userLabel} (${field.fieldId})`}>
                        <ConstraintInput
                          field={field}
                          value={values[fieldId]}
                          onChange={(value) => setValues((prior) => ({ ...prior, [fieldId]: value }))}
                        />
                      </FieldRow>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="cm-row" style={{ marginTop: 12 }}>
            <button type="button" className="cm-button cm-button-primary" onClick={() => setReviewed(true)}>
              Review intent &amp; compare plans
            </button>
            <span className="cm-env-note">
              {filledHints.length} of 17 constraint facets captured
            </span>
          </div>
        </section>
      </PermissionGate>

      {reviewed ? (
        <IntentReview
          host={host}
          draft={draft}
          hints={filledHints}
          values={values}
          descriptorById={descriptorById}
        />
      ) : null}
    </div>
  );
}

function ConstraintInput({
  field,
  value,
  onChange,
}: {
  readonly field: IntentConstraintFieldDescriptor;
  readonly value: FieldValue | undefined;
  readonly onChange: (value: FieldValue) => void;
}): JSX.Element {
  const ariaLabel = `${field.userLabel} (${field.fieldId})`;
  if (field.inputKind === "toggle") {
    return (
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.inputKind === "choice" && field.choices) {
    return (
      <select
        aria-label={ariaLabel}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— leave open —</option>
        {field.choices.map((choice) => (
          <option key={choice} value={choice}>{choice}</option>
        ))}
      </select>
    );
  }
  const inputType =
    field.inputKind === "date" ? "date" : field.inputKind === "number" || field.inputKind === "range" ? "number" : "text";
  return (
    <input
      type={inputType}
      aria-label={ariaLabel}
      placeholder={field.placeholderExample}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function IntentReview({
  host,
  draft,
  hints,
  values,
  descriptorById,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly draft: string;
  readonly hints: readonly IntentConstraintFieldId[];
  readonly values: FieldValues;
  readonly descriptorById: ReadonlyMap<IntentConstraintFieldId, IntentConstraintFieldDescriptor>;
}): JSX.Element {
  const submittedAt: UtcIso8601String = DEMO_NOW;
  const plans: readonly IntentPlanOption[] = [
    {
      optionId: "w2-plan-buy-now",
      userLabel: "Buy now from the verified offer",
      summary: "Two sellers can ship today at a similar price; the verified one meets your protection terms.",
      kind: "buy-now",
      strategyRef: demoRef<StrategyRef>("demo-strategy/buy-now"),
      predictedOutcome: DEMO_WAIT_OR_BUY,
    },
    {
      optionId: "w2-plan-group",
      userLabel: "Team up with other studios",
      summary: "A group buy at 60 boxes unlocks a lower unit price — interest is never a commitment.",
      kind: "group-with-others",
      strategyRef: demoRef<StrategyRef>("demo-strategy/group"),
      predictedOutcome: DEMO_WAIT_OR_BUY,
    },
    {
      optionId: "w2-plan-rent",
      userLabel: "Rent instead of buying",
      summary: "For the wide-format printer you use twice a month, renting keeps cash free.",
      kind: "rent-or-borrow",
      strategyRef: demoRef<StrategyRef>("demo-strategy/rent"),
      predictedOutcome: DEMO_WAIT_OR_BUY,
    },
  ];

  return (
    <div className="cm-stack">
      <section className="cm-card" data-testid="cm-intent-review">
        <div className="cm-row">
          <h2 className="cm-card-title">Your captured intent</h2>
          <DemoTag />
          <span className="cm-chip cm-chip-muted">draft submitted {submittedAt} (demo clock)</span>
        </div>
        <p className="cm-card-sub">“{draft.trim() || "(no words typed)"}”</p>
        <TermLine
          label="Constraint facets captured"
          value={hints.length > 0 ? hints.join(", ") : "none — everything left open"}
        />
        {(["proof-requirements", "recourse-requirements"] as const).map((fieldId) => (
          <TermLine
            key={fieldId}
            label={`Your ${descriptorById.get(fieldId)?.userLabel ?? fieldId} term`}
            value={
              typeof values[fieldId] === "string" && values[fieldId]
                ? String(values[fieldId])
                : "not set — sellers may assume the weakest protection"
            }
          />
        ))}
        <p className="cm-card-sub">
          The typed hand-off shape (<code>IntentDraftSubmission</code>) carries exactly this draft +
          hint list to the canonical intent parser when that lane connects; here it stays local demo
          state.
        </p>
      </section>

      <section className="cm-card" aria-label="Wait or buy guidance">
        <div className="cm-row">
          <h2 className="cm-card-title">Buy now or wait?</h2>
          <span className="cm-chip cm-chip-unknown">predictive — not a promise</span>
          <DemoTag />
        </div>
        <TermLine label="Guidance" value={DEMO_WAIT_OR_BUY.recommendation} />
        <TermLine label="Reasoning" value={DEMO_WAIT_OR_BUY.reasoningSummary} />
        {DEMO_WAIT_OR_BUY.expectedSavingNote ? (
          <TermLine label="Possible saving" value={DEMO_WAIT_OR_BUY.expectedSavingNote} />
        ) : null}
        {DEMO_WAIT_OR_BUY.deadlineRiskNote ? (
          <TermLine label="Deadline risk" value={DEMO_WAIT_OR_BUY.deadlineRiskNote} />
        ) : null}
      </section>

      <section aria-label="Plan options">
        <h2 className="cm-section-title">Plan options</h2>
        <div className="cm-stack">
          {plans.map((plan) => (
            <div key={plan.optionId} className="cm-journey-item">
              <span className="cm-chip cm-chip-muted">{PLAN_LABEL[plan.kind]}</span>
              <span className="cm-journey-name">{plan.userLabel}</span>
              <button
                type="button"
                className="cm-button"
                onClick={() => host.navigate(PLAN_TARGET_PATH[plan.kind])}
              >
                Open this path
              </button>
              <span className="cm-journey-summary">
                {plan.summary} Predicted outcome: {plan.predictedOutcome.reasoningSummary}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
