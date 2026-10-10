/**
 * Test-host factory for W2-012 component tests — builds CommerceHostServices
 * doubles with full control over held roles (denial tests), navigation spy
 * and scenario, so modules can be tested directly (fast) plus through the
 * real shell for discovery law. The services shape is the PUBLISHED contract
 * seam, so a passing test means the module consumes the real host correctly.
 */
import type {
  CommerceHostServices,
  CommercePermissionId,
  CommerceRoleId,
  CommerceScenarioContext,
} from "../../commerce-host/contract/index.js";
import { permissionsOfRoles } from "../../commerce-host/contract/index.js";
import { DEFAULT_DEMO_SCENARIO } from "../../commerce-host/demo/demo-fixtures.js";

export interface TestHostOverrides {
  readonly roles?: readonly CommerceRoleId[];
  readonly scenario?: Partial<CommerceScenarioContext>;
  readonly onNavigate?: (path: string) => void;
  readonly currentPath?: string;
}

/** A deterministic CommerceHostServices double for direct component tests. */
export function makeTestHost(overrides: TestHostOverrides = {}): CommerceHostServices {
  const roles = overrides.roles ?? ["buyer", "merchant"];
  const granted: ReadonlySet<CommercePermissionId> = permissionsOfRoles(roles);
  const scenario: CommerceScenarioContext = {
    ...DEFAULT_DEMO_SCENARIO,
    ...overrides.scenario,
  };
  return {
    navigate: (path) => overrides.onNavigate?.(path),
    currentPath: overrides.currentPath ?? "/commerce",
    roles,
    activeRole: roles[0] ?? null,
    hasPermission: (permission) => granted.has(permission),
    mode: "demo",
    scenario,
    resetDemo: () => undefined,
  };
}
