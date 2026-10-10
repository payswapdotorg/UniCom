/**
 * Public seam of the W1-011 commerce host contract. Feature workers
 * (W2-012, W3-015) import from this barrel only:
 *
 *   import { defineCommerceModule } from "../../commerce-host/contract/index.js";
 *
 * Everything the module contract needs is re-exported here so the published
 * API has exactly one entry file.
 */

export {
  COMMERCE_JOURNEY_IDS,
  MODULE_ID_PREFIX_RESERVATION,
  defineCommerceModule,
  parseCommerceModule,
  reservedOwnerForModuleId,
} from "./module-contract.js";
export type {
  CommerceEnvironmentMode,
  CommerceFeatureModule,
  CommerceHostServices,
  CommerceJourneyId,
  CommerceModuleNavEntry,
  CommerceModuleOwner,
  CommerceModuleProps,
  CommerceModuleStatus,
  CommercePermissionId,
  CommerceRoleId,
  CommerceScenarioContext,
  ParsedCommerceModule,
} from "./module-contract.js";

export { COMMERCE_JOURNEY_CATALOG, journeyFamily, journeysOwnedBy } from "./journey-catalog.js";
export type { CommerceJourneyFamily } from "./journey-catalog.js";

export {
  COMMERCE_PERMISSION_IDS,
  COMMERCE_ROLE_FAMILIES,
  COMMERCE_ROLES,
  commerceRole,
  permissionsOfRoles,
  rolesHoldingPermission,
} from "./roles.js";
export type { CommerceRoleDefinition, CommerceRoleFamily, CommerceRoleFamilyId } from "./roles.js";
