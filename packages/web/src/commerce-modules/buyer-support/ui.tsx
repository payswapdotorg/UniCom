/**
 * W2-012 shared presentational helpers for the buyer/peer modules. Reuses the
 * W1-011 shared honest-state seam (commerce-host/shared) and the host css
 * vocabulary — no new styling system, no ad-hoc state vocabulary.
 */
import type { JSX } from "react";

import type { Money } from "@unicom/commerce";
import type { CommerceModuleProps, CommercePermissionId } from "../../commerce-host/contract/index.js";
import { rolesHoldingPermission } from "../../commerce-host/contract/index.js";
import { commerceRole } from "../../commerce-host/contract/index.js";
import { FRESHNESS_META, moneyText } from "./demo-data.js";
import type { OfferFreshness } from "./demo-data.js";

/** The always-visible DEMO marker for fixture-derived values. */
export function DemoTag(): JSX.Element {
  return <span className="cm-demo-tag">DEMO</span>;
}

/** Freshness chip + source timestamp + age (always visible together, J2 law). */
export function FreshnessChip({
  freshness,
  checkedAt,
  ageLabel,
}: {
  readonly freshness: OfferFreshness;
  readonly checkedAt: string | null;
  readonly ageLabel: string | null;
}): JSX.Element {
  const meta = FRESHNESS_META[freshness];
  return (
    <span className="cm-row" style={{ gap: 6 }}>
      <span className={meta.chip} title={meta.note}>
        {meta.label}
      </span>
      {checkedAt === null ? (
        <span className="cm-env-note">source time unknown</span>
      ) : (
        <span className="cm-env-note" title={`source timestamp ${checkedAt}`}>
          checked {checkedAt}
          {ageLabel ? ` · ${ageLabel}` : ""}
        </span>
      )}
    </span>
  );
}

/** Exact money rendered through the commerce primitive + DEMO marker. */
export function MoneyText({ amount }: { readonly amount: Money }): JSX.Element {
  return (
    <span>
      {moneyText(amount)} <DemoTag />
    </span>
  );
}

/**
 * Visible permission gate: when the held roles lack the permission, the panel
 * names the missing permission and EVERY role that holds it — never hidden,
 * never disabled silently. The host renders its own gate for nav-entry
 * requiredRoles; modules use this for in-surface actions.
 */
export function PermissionGate({
  host,
  permission,
  children,
}: {
  readonly host: CommerceModuleProps["host"];
  readonly permission: CommercePermissionId;
  readonly children: React.ReactNode;
}): JSX.Element {
  if (host.hasPermission(permission)) return <>{children}</>;
  const holders = rolesHoldingPermission(permission).map((role) => commerceRole(role).title);
  return (
    <div className="cm-card" data-testid="cm-permission-blocked">
      <p className="cm-blocked-reason">
        Blocked: this action requires <code>{permission}</code>. Held by{" "}
        {holders.join(", ")}. You currently hold:{" "}
        {host.roles.map((role) => commerceRole(role).title).join(", ") || "no role"}. You can take
        one of those roles on the Roles surface — nothing here hides the action from you.
      </p>
    </div>
  );
}

/** One line of a terms/evidence list (used by every confirm gate). */
export function TermLine({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <p className="cm-state-item-detail">
      <strong>{label}:</strong> {value}
    </p>
  );
}

/**
 * The commitment gate (work order law): any transition that represents a
 * commitment shows terms, consequence and evidence FIRST, then requires an
 * explicit confirm click. Confirm mutates ONLY the module's local demo state.
 */
export function CommitmentGate({
  title,
  terms,
  consequence,
  evidence,
  confirmLabel,
  cancelLabel = "Not now",
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly terms: readonly { readonly label: string; readonly value: string }[];
  readonly consequence: string;
  readonly evidence: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <div className="cm-card" data-testid="cm-commitment-gate" style={{ borderColor: "var(--cm-warn)" }}>
      <h3 className="cm-card-title">{title}</h3>
      <div>
        {terms.map((term) => (
          <TermLine key={term.label} label={term.label} value={term.value} />
        ))}
        <TermLine label="What happens if you confirm" value={consequence} />
        {evidence.length > 0 ? (
          <TermLine label="Evidence this is based on" value={evidence.join(" · ")} />
        ) : null}
        <TermLine
          label="Demo boundary"
          value="Demo confirmation changes only this screen's local test state. No live order, payment, rental, commitment or trade leg is ever created."
        />
      </div>
      <div className="cm-row" style={{ marginTop: 10 }}>
        <button type="button" className="cm-button cm-button-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="cm-button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

/** Small labeled field row used by the intent/what-if editors. */
export function FieldRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, color: "var(--cm-fg-subtle)" }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
