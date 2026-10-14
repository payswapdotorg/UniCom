/**
 * Home surface (/commerce) — the UNiCOM front door (W1-026).
 *
 * Laws kept from W1-011 (pinned by CommerceHostApp.test.tsx):
 * - J19 discovery: every one of the 19 journey families has a visible entry
 *   point here (plus Explore) — never deep-link-only. The full registry now
 *   lives in a collapsed <details> so it stays one click away without
 *   dominating the first screen as a raw implementation checklist.
 * - the count of rendered journey families is DERIVED from the live registry;
 * - every synthetic value stays DEMO-labelled; UNKNOWN is never failed.
 *
 * W1-026 additions:
 * - two role-aware entry paths: a first-time buyer immediately sees the Buyer
 *   Intent Canvas path (mini canvas + the essentials it understands); a
 *   merchant immediately sees the Command Center path with honest business
 *   state, active work and high-value next actions;
 * - the default emphasis respects the selected role via the published
 *   set-active-role action — emphasis NEVER changes identity or grants
 *   authority (visible on the surface);
 * - the three-truths strip keeps authoritative operational state, provider/
 *   physical observations and model predictions visibly distinct.
 */
import type { JSX } from "react";


import { resolveJourneyCoverage } from "../../module-registry.js";
import { COMMERCE_ROLE_FAMILIES, commerceRole } from "../../contract/index.js";
import type { CommerceRoleId } from "../../contract/index.js";
import {
  DEMO_CONNECTED_INTEGRATIONS,
  DEMO_STATE_RECORDS,
} from "../../demo/demo-fixtures.js";
import { EnvironmentBadge } from "../CommerceHostApp.js";
import { useCommerceHost } from "../CommerceHostContext.js";
import { LifecycleStateItem } from "../../shared/index.js";

/** Roles whose emphasis leads with the buyer path. */
const BUYER_FAMILY_ROLES: readonly CommerceRoleId[] = ["buyer", "requester"];

/** The six essentials the Intent Canvas understands (W1-026 work order §2). */
const BUYER_ESSENTIALS: readonly { readonly label: string; readonly help: string }[] = [
  {
    label: "Needed by (deadline)",
    help: "The last date this still works for you. Plans are checked against it before anything else.",
  },
  {
    label: "Total budget (max-total-cost)",
    help: "The all-in ceiling — price, delivery and fees together — not a starting point to negotiate up.",
  },
  {
    label: "Quality (min-quality)",
    help: "The floor you can accept: any, solid or premium. Options below your floor never reach you.",
  },
  {
    label: "Trust & privacy (seller trust, privacy)",
    help: "How much you need to trust the seller (verified, top-rated) and what they may do with your data.",
  },
  {
    label: "Delivery or pickup (delivery-pickup-constraints)",
    help: "How it must reach you: delivery, pickup, or either — timing you cannot accept is filtered out.",
  },
  {
    label: "Alternatives (acceptable-substitutes)",
    help: "What you would happily take instead. Substitutes widen your options; you decide what counts.",
  },
];

/** Active work in flight for the buyer side (committed host demo fixtures). */
const BUYER_WORK_IDS = ["demo-st-01", "demo-st-02"] as const;

/** Active work in flight for the merchant/operator side (host demo fixtures). */
const MERCHANT_WORK_IDS = ["demo-st-03", "demo-st-05", "demo-st-06", "demo-st-08"] as const;

/** High-value next actions on the merchant path (real registered routes). */
const MERCHANT_NEXT_ACTIONS: readonly { readonly label: string; readonly path: string }[] = [
  { label: "Review the group-buy proposal on your desk", path: "/commerce/merchant/group-buy-review" },
  { label: "Count and reconcile shelf stock", path: "/commerce/physical/store" },
  { label: "Restock through procurement", path: "/commerce/procurement/supply" },
  { label: "Handle disputes and recourse", path: "/commerce/trust/recourse" },
];

function recordsOf(ids: readonly string[]): typeof DEMO_STATE_RECORDS {
  return DEMO_STATE_RECORDS.filter((record) => ids.includes(record.id));
}

function JourneyEntry({
  journeyId,
  familyName,
  summary,
  ownerLanes,
  ready,
  partialReason,
  onOpen,
}: {
  readonly journeyId: string;
  readonly familyName: string;
  readonly summary: string;
  readonly ownerLanes: string;
  readonly ready: boolean;
  readonly partialReason?: string;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <div className="cm-journey-item">
      <span className="cm-journey-id">{journeyId}</span>
      <button
        type="button"
        className="cm-button cm-button-primary"
        onClick={onOpen}
        aria-label={`Open ${familyName} (${journeyId})`}
      >
        {ready ? "Open" : "View status"}
      </button>
      <span className="cm-journey-name">{familyName}</span>
      {ready ? (
        <span className="cm-chip cm-chip-ok">ready</span>
      ) : (
        <span className="cm-chip cm-chip-warn">in development · lane {ownerLanes}</span>
      )}
      {partialReason ? <span className="cm-chip cm-chip-warn">partial: {partialReason}</span> : null}
      <span className="cm-journey-summary">{summary}</span>
    </div>
  );
}

/** Emphasis bar: quick switch among HELD roles only (published reducer action). */
function EmphasisBar(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  return (
    <div className="cm-card" data-testid="cm-emphasis-bar">
      <div className="cm-row" role="group" aria-label="Role emphasis for this page">
        <span className="cm-env-note">Emphasis:</span>
        {state.heldRoles.map((roleId) => {
          const role = commerceRole(roleId);
          const active = state.activeRole === roleId;
          return (
            <button
              key={roleId}
              type="button"
              className="cm-button"
              aria-pressed={active}
              style={active ? { borderColor: "var(--cm-ok)", fontWeight: 600 } : undefined}
              onClick={() => dispatch({ type: "set-active-role", roleId })}
            >
              {role.title}
            </button>
          );
        })}
        <button
          type="button"
          className="cm-button"
          aria-pressed={state.activeRole === null}
          onClick={() => dispatch({ type: "set-active-role", roleId: null })}
        >
          No emphasis
        </button>
        <button
          type="button"
          className="cm-button"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/roles" })}
        >
          Hold or drop roles →
        </button>
      </div>
      <p className="cm-card-sub">
        Emphasized role:{" "}
        {state.activeRole !== null ? (
          <strong>{commerceRole(state.activeRole).title}</strong>
        ) : (
          <em>none — buying and selling paths weighted equally</em>
        )}
        . Emphasis only decides which path leads this page. It never changes your identity, never
        grants a permission, and never touches your data — roles are held and reviewed on the
        Roles surface.
      </p>
    </div>
  );
}

function BuyerPathCard({ emphasized }: { readonly emphasized: boolean }): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  return (
    <section
      className="cm-card"
      aria-label="Buyer path — intent canvas"
      data-testid="cm-buyer-path"
      style={emphasized ? { borderLeft: "3px solid var(--cm-ok)" } : undefined}
    >
      <div className="cm-row">
        <h2 className="cm-card-title">Start with what you need</h2>
        <span className="cm-chip cm-chip-muted">buyer path</span>
        {emphasized ? <span className="cm-chip cm-chip-ok">matches your emphasis</span> : null}
      </div>
      <p className="cm-card-sub">
        The Buyer Intent Canvas turns your own words into a working brief. Type the need here —
        the draft is kept while you switch roles — then open the canvas for the full 17-facet
        constraint editor, plan options and buy-or-wait guidance.
      </p>
      <label
        htmlFor="cm-intent-draft"
        style={{ display: "block", fontSize: 12.5, marginTop: 10, color: "var(--cm-fg-subtle)" }}
      >
        What do you need? (your own words — kept while you switch roles)
      </label>
      <textarea
        id="cm-intent-draft"
        className="cm-intent-draft"
        value={state.scenario.intentDraft}
        onChange={(event) => dispatch({ type: "update-intent-draft", draft: event.target.value })}
      />
      <p className="cm-card-sub" style={{ marginTop: 10 }}>
        The essentials the canvas understands (all optional — leave anything open):
      </p>
      <ul className="cm-perm-list" style={{ margin: "6px 0 0" }}>
        {BUYER_ESSENTIALS.map((item) => (
          <li key={item.label} style={{ color: "var(--cm-fg-subtle)", fontSize: 12.5 }}>
            <strong style={{ color: "var(--cm-fg)" }}>{item.label}</strong> — {item.help}
          </li>
        ))}
      </ul>
      <div className="cm-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="cm-button cm-button-primary"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/buyer/intent" })}
        >
          Open the Intent canvas
        </button>
        <button
          type="button"
          className="cm-button"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/buyer/compare" })}
        >
          Compare offers with honest freshness
        </button>
      </div>
      <p className="cm-card-sub" style={{ marginTop: 8 }}>
        Honest limits: plan guidance is predictive — never a promise; an UNKNOWN offer never shows
        a price; interest in a group deal is never a commitment.
      </p>
      <h3 className="cm-card-title" style={{ marginTop: 12 }}>
        Your buying work in flight <span className="cm-demo-tag">DEMO</span>
      </h3>
      <div className="cm-stack" style={{ gap: 8, marginTop: 4 }}>
        {recordsOf(BUYER_WORK_IDS).map((record) => (
          <LifecycleStateItem
            key={record.id}
            label={record.label}
            state={record.state}
            detail={record.detail}
            demo={record.source === "demo"}
          />
        ))}
      </div>
    </section>
  );
}

function MerchantPathCard({ emphasized }: { readonly emphasized: boolean }): JSX.Element {
  const { dispatch } = useCommerceHost();
  return (
    <section
      className="cm-card"
      aria-label="Merchant path — command center"
      data-testid="cm-merchant-path"
      style={emphasized ? { borderLeft: "3px solid var(--cm-ok)" } : undefined}
    >
      <div className="cm-row">
        <h2 className="cm-card-title">Run your store — command center</h2>
        <span className="cm-chip cm-chip-muted">merchant &amp; operator path</span>
        {emphasized ? <span className="cm-chip cm-chip-ok">matches your emphasis</span> : null}
      </div>
      <p className="cm-card-sub">
        One command center for the whole commerce lifecycle: catalog, pricing and promotions,
        inventory, checkout, orders, fulfillment, returns, refunds and support — every state
        deterministic, every unknown preserved, every action authority-checked.
      </p>
      <h3 className="cm-card-title" style={{ marginTop: 12 }}>
        Current business state <span className="cm-demo-tag">DEMO</span>
      </h3>
      <p className="cm-card-sub">
        Store: Harbor Lane Print Studio — specialty printing, small studio. Connected
        integrations: {DEMO_CONNECTED_INTEGRATIONS.length} — no channel, feed or payment provider
        is connected, and nothing on this host claims otherwise.
      </p>
      <h3 className="cm-card-title" style={{ marginTop: 12 }}>
        Active work &amp; proposals (observed demo state)
      </h3>
      <div className="cm-stack" style={{ gap: 8, marginTop: 4 }}>
        {recordsOf(MERCHANT_WORK_IDS).map((record) => (
          <LifecycleStateItem
            key={record.id}
            label={record.label}
            state={record.state}
            detail={record.detail}
            demo={record.source === "demo"}
          />
        ))}
      </div>
      <div className="cm-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="cm-button cm-button-primary"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/merchant/storefront" })}
        >
          Open the merchant command center
        </button>
      </div>
      <p className="cm-card-sub" style={{ marginTop: 8 }}>
        Inside: live deterministic demo-kernel state — seeded orders with delivered,
        unknown-payment and refunded outcomes, an exchange return in flight, exact money, and a
        resettable demo. It renders observed kernel state only: it never claims live orders,
        inventory or connectivity that were not observed, and it shows no predictions (those live
        on the Commerce Twin, labelled predictive).
      </p>
      <h3 className="cm-card-title" style={{ marginTop: 12 }}>
        High-value next actions
      </h3>
      <ul className="cm-perm-list" style={{ margin: "6px 0 0" }}>
        {MERCHANT_NEXT_ACTIONS.map((action) => (
          <li key={action.path} style={{ listStyle: "none" }}>
            <button
              type="button"
              className="cm-button"
              onClick={() => dispatch({ type: "navigate", path: action.path })}
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The three-truths strip: authoritative vs observed vs predictive (never mixed). */
function TruthStrip(): JSX.Element {
  const truths: readonly { readonly title: string; readonly body: string; readonly chip: string }[] = [
    {
      title: "Authoritative operational state",
      body:
        "What the system knows is true now — orders, stock and money as deterministic state. Exact, auditable, and never silently changed by a model.",
      chip: "cm-chip cm-chip-ok",
    },
    {
      title: "Provider & physical observations",
      body:
        "What sellers, feeds and physical counts report, always with source timestamps: verified, stale, UNKNOWN or unavailable. Observations never auto-promote to truth.",
      chip: "cm-chip cm-chip-warn",
    },
    {
      title: "Model predictions",
      body:
        "What the twin expects may happen — buy-or-wait guidance and what-ifs. Always labelled predictive; they become truth only through execution with evidence.",
      chip: "cm-chip cm-chip-unknown",
    },
  ];
  return (
    <section className="cm-card" aria-label="Three kinds of truth" data-testid="cm-truth-classes">
      <h2 className="cm-card-title">What you can rely on — three kinds of truth, never mixed</h2>
      <div className="cm-grid" style={{ marginTop: 8 }}>
        {truths.map((truth) => (
          <div key={truth.title} className="cm-card" style={{ padding: 12 }}>
            <div className="cm-row" style={{ gap: 6 }}>
              <span className={truth.chip}>truth class</span>
              <strong style={{ fontSize: 13 }}>{truth.title}</strong>
            </div>
            <p className="cm-card-sub" style={{ marginTop: 6 }}>{truth.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const coverage = resolveJourneyCoverage();
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;
  const scenario = state.scenario;
  const buyerEmphasized =
    state.activeRole !== null && BUYER_FAMILY_ROLES.includes(state.activeRole);
  const merchantEmphasized =
    state.activeRole !== null && !BUYER_FAMILY_ROLES.includes(state.activeRole);

  const buyerCard = <BuyerPathCard emphasized={buyerEmphasized} />;
  const merchantCard = <MerchantPathCard emphasized={merchantEmphasized} />;

  return (
    <div className="cm-stack">
      <section className="cm-hero">
        <h1>UNiCOM Commerce</h1>
        <p>
          Buy with your own words and audit everything; sell with every state honest. Describe
          what you need — deadline, budget, quality, trust — and let agents compare real options
          with verified, stale and UNKNOWN freshness kept separate. Or run your store end to end,
          from catalog and pricing to fulfillment, returns and refunds.
        </p>
        <p>
          This host runs on deterministic synthetic fixtures in DEMO mode — no credentials, no
          live purchases, payments, group-buy commitments or trade legs. Connected integrations:{" "}
          {DEMO_CONNECTED_INTEGRATIONS.length}. Nothing pretends otherwise.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button cm-button-primary"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/explore" })}
          >
            Explore capabilities
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/roles" })}
          >
            Switch role
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/system" })}
          >
            System &amp; demo fixtures
          </button>
        </div>
      </section>

      <EmphasisBar />

      {merchantEmphasized ? (
        <>
          {merchantCard}
          {buyerCard}
        </>
      ) : (
        <>
          {buyerCard}
          {merchantCard}
        </>
      )}

      <TruthStrip />

      <section className="cm-card" aria-label="Current scenario">
        <div className="cm-row">
          <h2 className="cm-card-title">Your scenario</h2>
          <EnvironmentBadge />
          <span className="cm-env-note">
            synthetic fixtures — deterministic, resettable, no credentials
          </span>
        </div>
        <p className="cm-card-sub">
          <strong>{scenario.firmName}</strong> · {scenario.firmSize} firm · {scenario.industry}
        </p>
        <p className="cm-card-sub">{scenario.note}</p>
        <p className="cm-card-sub">
          You hold:{" "}
          {state.heldRoles.length > 0
            ? state.heldRoles.map((roleId) => commerceRole(roleId).title).join(", ")
            : "no role — every permission-gated action is visibly blocked"}
          . Multiple roles are allowed; set the emphasis above, hold or drop roles on the Roles
          surface. Role families: {COMMERCE_ROLE_FAMILIES.map((family) => family.title).join(", ")}.
        </p>
      </section>

      <details
        className="cm-card"
        data-testid="cm-journey-registry"
        aria-label="All journey families and implementation status"
      >
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          All 19 journey families — implementation status (kept one click away, off the front
          page)
        </summary>
        <p className="cm-card-sub" style={{ marginTop: 10 }}>
          Every family is reachable from here and from Explore — no deep links required.{" "}
          <strong>{readyCount}</strong> of the 19 journey families are rendered right now.
        </p>
        <div className="cm-stack" style={{ marginTop: 8 }}>
          {coverage.map((entry) => {
            const family = entry.family;
            const ownerLanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
            const ready = entry.state.kind === "ready";
            const partialReason =
              entry.state.kind === "ready" && entry.state.partial ? entry.state.reason : undefined;
            return (
              <JourneyEntry
                key={family.journeyId}
                journeyId={family.journeyId}
                familyName={family.familyName}
                summary={family.summary}
                ownerLanes={ownerLanes}
                ready={ready}
                partialReason={partialReason}
                onOpen={() => dispatch({ type: "navigate", path: entry.path })}
              />
            );
          })}
        </div>
      </details>
    </div>
  );
}
