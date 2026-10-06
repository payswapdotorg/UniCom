/**
 * @unicom/commerce runtime barrel (W1-002).
 *
 * Public runtime surface, re-exported through the module's single public
 * entrypoint (src/contract.ts). The runtime layer sits strictly above the
 * frozen domain layer (architecture-policy layerOrder: domain → runtime).
 */
export { CommerceKernel, type KernelPersistentState } from "./kernel.js";
export {
  reconstructAuthoritativeState,
  reconstructKernel,
} from "./replay.js";
export type {
  AnyRuntimeCommand,
  CircularCommandPayload,
  OrderFlowCommandPayload,
  ReconciliationCommandPayload,
  ReturnFlowCommandPayload,
  RuntimeCommandPayload,
  SupplyCommandPayload,
  CheckoutCompletionCommandPayload,
  SettlementCommandPayload,
  RecourseCommandPayload,
  StoreOpsCommandPayload,
  AutonomousStoreCommandPayload,
} from "./commands.js";
export type { CommerceKernelOptions, ResolvedKernelOptions } from "./options.js";
export { DETERMINISTIC_EPOCH, resolveKernelOptions } from "./options.js";
export type { KernelStateSnapshot } from "./kernel-snapshot.js";
export type { EmittedEventSpec, CommandContext } from "./handler.js";
export { gateAutonomousCommand, authorityTargetStore, gateAuthorityCommand } from "./policy-gate.js";
export { KernelAutonomousStoreFold } from "./kernel-fold-autonomous.js";
