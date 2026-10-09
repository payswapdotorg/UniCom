/**
 * W3-012 — Per-role-family execution planning (persona journey coverage).
 *
 * The firm's distinct role families (from the frozen W2 personas) each
 * execute the journey families their mapped applicable set includes; the
 * evidence record carries the REAL role and a representative persona of
 * that role. Attribution to the other personas of the role happens in
 * buildPersonaOutcomes (by firmId + role + mapped families).
 *
 * A family no role maps to (none in the W1-authoritative set, but the law
 * holds) executes once under the firm's first persona's role so the family
 * is still measured — the fallback is explicit, never a silent drop.
 *
 * Split from baseline-campaign.ts for the architecture file-line budget
 * (max-file-lines 400 — the W1-009 milestone-3 precedent).
 */

import type { JourneyFamilyId } from "./journey-evidence";
import type { Persona } from "@unicom/agent";
import type { ScheduledProject } from "./campaign-scheduler";
import { w2JourneySetToW1 } from "./w2-w1-journey-map";

/** One role family's execution plan: the representative persona + mapped families. */
export interface RoleFamilyPlan {
  readonly personaId: string;
  readonly families: ReadonlySet<JourneyFamilyId>;
}

/** One executing (persona, role) pair for a journey run. */
export interface ExecutingRole {
  readonly personaId: string;
  readonly role: string;
}

/**
 * Build the firm → role-family → plan table from the frozen personas.
 * Deterministic: the first persona of each (firm, role) is the executing
 * representative (persona order is the frozen cohort order).
 */
export function buildRoleFamiliesByFirm(
  agentPersonas: readonly Persona[],
): Map<string, Map<string, RoleFamilyPlan>> {
  const byFirm = new Map<string, Map<string, RoleFamilyPlan>>();
  for (const persona of agentPersonas) {
    let byRole = byFirm.get(persona.firmId);
    if (byRole === undefined) {
      byRole = new Map();
      byFirm.set(persona.firmId, byRole);
    }
    if (!byRole.has(persona.roleFamily)) {
      byRole.set(persona.roleFamily, {
        personaId: persona.personaId,
        families: new Set(w2JourneySetToW1(persona.applicableJourneys as readonly string[])),
      });
    }
  }
  return byFirm;
}

/**
 * The executing (persona, role) pairs for one (project, family): every
 * role family whose mapped set includes the family; the explicit
 * first-persona fallback when no role maps to the family.
 */
export function executingRolesForFamily(
  rolesForFirm: ReadonlyMap<string, RoleFamilyPlan>,
  familyId: JourneyFamilyId,
  project: ScheduledProject,
): readonly ExecutingRole[] {
  const executingRoles: ExecutingRole[] = [];
  for (const [role, plan] of rolesForFirm) {
    if (plan.families.has(familyId)) {
      executingRoles.push({ personaId: plan.personaId, role });
    }
  }
  if (executingRoles.length === 0) {
    const firstPersonaId = project.personaIds[0] ?? `${project.firmId}-persona-default`;
    const firstRole = rolesForFirm.keys().next().value ?? "project-owner";
    executingRoles.push({ personaId: firstPersonaId, role: firstRole });
  }
  return executingRoles;
}
