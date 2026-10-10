/**
 * Roles surface (/commerce/roles) — the role switcher.
 *
 * Laws (work order scope §4):
 * - buyer/requester, merchant/store-operator, procurement/receiving,
 *   finance/approver, trust/support — the five families;
 * - one user may hold MULTIPLE roles (checkboxes);
 * - the active role is EMPHASIS ONLY — switching never changes the user,
 *   the principal or the scenario context;
 * - permissions are VISIBLE (granted/not, per role);
 * - unauthorized actions render VISIBLY BLOCKED with the missing permission
 *   and its holder roles named — never hidden.
 */
import type { JSX } from "react";


import { COMMERCE_PERMISSION_IDS, COMMERCE_ROLE_FAMILIES, commerceRole, permissionsOfRoles, rolesHoldingPermission } from "../../contract/index.js";
import type { CommercePermissionId } from "../../contract/index.js";
import { blockedReason, hasPermission } from "../../host-state.js";
import { useCommerceHost } from "../CommerceHostContext.js";

/** Sample gated actions — demonstrate visible blocking honestly. */
const SAMPLE_GATED_ACTIONS: readonly {
  readonly label: string;
  readonly permission: CommercePermissionId;
}[] = [
  { label: "Approve a refund within policy", permission: "finance.approve-refund" },
  { label: "Review a dispute with evidence", permission: "trust.review-disputes" },
  { label: "Approve a purchase order", permission: "procurement.approve-po" },
  { label: "Connect a sales channel", permission: "connectors.manage" },
];

export function RolesSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const granted = permissionsOfRoles(state.heldRoles);

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <h1 className="cm-card-title">Roles &amp; permissions</h1>
        <p className="cm-card-sub">
          One user, several roles. Holding a role grants its permissions; the{" "}
          <strong>emphasized</strong> role only changes what the surfaces put in front of you — it
          never switches your identity, and your scenario (
          {state.scenario.firmName}, intent draft) is preserved across every switch.
        </p>
        <p className="cm-card-sub">
          Emphasized role:{" "}
          {state.activeRole !== null ? (
            <strong>{commerceRole(state.activeRole).title}</strong>
          ) : (
            <em>none (all held roles weighted equally)</em>
          )}
        </p>
      </section>

      {COMMERCE_ROLE_FAMILIES.map((family) => (
        <section key={family.familyId} aria-label={family.title}>
          <h2 className="cm-section-title">{family.title}</h2>
          <div className="cm-grid">
            {family.roleIds.map((roleId) => {
              const role = commerceRole(roleId);
              const held = state.heldRoles.includes(roleId);
              const emphasized = state.activeRole === roleId;
              return (
                <div
                  key={roleId}
                  className={`cm-role-card${held ? " cm-role-card-held" : ""}`}
                  data-testid={`cm-role-${roleId}`}
                  data-held={held ? "true" : "false"}
                >
                  <div className="cm-row">
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={held}
                        onChange={() => dispatch({ type: "toggle-role", roleId })}
                        aria-label={`Hold role ${role.title}`}
                      />
                      {role.title}
                    </label>
                    {emphasized ? <span className="cm-chip cm-chip-ok">emphasized</span> : null}
                  </div>
                  <p className="cm-card-sub">{role.description}</p>
                  <ul className="cm-perm-list">
                    {COMMERCE_PERMISSION_IDS.map((permission) => {
                      const roleHasIt = role.permissions.includes(permission);
                      const grantedNow = granted.has(permission);
                      return (
                        <li
                          key={permission}
                          style={{ color: roleHasIt ? "var(--cm-fg)" : "var(--cm-fg-faint)" }}
                        >
                          {roleHasIt ? "✓" : "·"} <code>{permission}</code>
                          {!roleHasIt && grantedNow ? " (granted by another held role)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="cm-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="cm-button"
                      disabled={!held || emphasized}
                      title={
                        held
                          ? "Change the emphasized role (emphasis only — identity and scenario stay)"
                          : "Hold this role first, then you can emphasize it"
                      }
                      onClick={() => dispatch({ type: "set-active-role", roleId })}
                    >
                      {emphasized ? "Emphasized" : "Emphasize"}
                    </button>
                    {emphasized ? (
                      <button
                        type="button"
                        className="cm-button"
                        onClick={() => dispatch({ type: "set-active-role", roleId: null })}
                      >
                        Clear emphasis
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="cm-card" aria-label="Effective permissions">
        <h2 className="cm-card-title">Effective permissions (union of held roles)</h2>
        <p className="cm-card-sub">
          {COMMERCE_PERMISSION_IDS.filter((permission) => granted.has(permission)).length} of{" "}
          {COMMERCE_PERMISSION_IDS.length} granted. Not granted are listed with the roles that
          would grant them.
        </p>
        <ul className="cm-perm-list">
          {COMMERCE_PERMISSION_IDS.map((permission) => {
            const has = granted.has(permission);
            return (
              <li key={permission}>
                {has ? "✓" : "✗"} <code>{permission}</code>
                {!has ? ` — held by ${rolesHoldingPermission(permission).join(", ")}` : ""}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cm-card" aria-label="Sample gated actions">
        <h2 className="cm-card-title">Sample gated actions</h2>
        <p className="cm-card-sub">
          Try these: unauthorized actions are visibly blocked with the reason — they are never
          hidden, and never silently enabled.
        </p>
        <div className="cm-stack">
          {SAMPLE_GATED_ACTIONS.map((action) => {
            const allowed = hasPermission(state, action.permission);
            const reason = blockedReason(state, action.permission);
            return (
              <div key={action.permission} className="cm-row" data-testid={`cm-gated-${action.permission}`}>
                <button
                  type="button"
                  className="cm-button cm-button-primary"
                  disabled={!allowed}
                  title={reason ?? "You hold the required permission"}
                >
                  {action.label}
                </button>
                {allowed ? (
                  <span className="cm-chip cm-chip-ok">allowed</span>
                ) : (
                  <span className="cm-blocked-reason" role="alert">
                    {reason}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="cm-card" aria-label="Scenario preservation proof">
        <h2 className="cm-card-title">Scenario preserved across switches</h2>
        <p className="cm-card-sub">
          Firm: <strong>{state.scenario.firmName}</strong> ({state.scenario.firmSize},{" "}
          {state.scenario.industry}). Intent draft: “{state.scenario.intentDraft}”
        </p>
        <p className="cm-card-sub">
          Switch roles above — this card keeps its values. Emphasis changes; identity and scenario
          do not.
        </p>
      </section>
    </div>
  );
}
