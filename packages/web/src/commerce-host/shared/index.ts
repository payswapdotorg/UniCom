/**
 * The shared-primitives seam of the W1-011 commerce host. Feature modules
 * (W2-012 / W3-015) reuse these honest-state components instead of
 * re-implementing them:
 *
 *   import { LifecycleStateChip, SurfaceStatePanel } from
 *     "../../commerce-host/shared/index.js";
 *
 * Law: preserved non-failure states (PENDING, ATTEMPTED, OVERDUE,
 * SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN …) never collapse into errors;
 * UNKNOWN never renders as failure or success (POST-V3 blocker #7).
 */

export {
  ErrorStatePanel,
  EmptyStatePanel,
  LifecycleStateChip,
  LifecycleStateItem,
  LoadingStatePanel,
  OfflineStatePanel,
  SurfaceStatePanel,
  lifecycleClass,
  lifecycleNote,
} from "./state-views.js";
export type {
  CommerceLifecycleClass,
  CommerceLifecycleState,
} from "./state-views.js";
