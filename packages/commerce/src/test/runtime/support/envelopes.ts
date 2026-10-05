/**
 * Runtime test helpers: typed envelope construction with deterministic ids.
 * TEST-ONLY (never exported from the public contract).
 */
import {
  CommerceKernel,
  commandEnvelope,
  makeId,
  type AnyRuntimeCommand,
  type CommandExecution,
  type PrincipalRef,
  type RuntimeCommandPayload,
} from "../../../contract.js";

export const MERCHANT_ACTOR: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };
export const CUSTOMER_ACTOR: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-1") };
export const SYSTEM_ACTOR: PrincipalRef = { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") };

export function autonomousStoreActor(storeId: string): PrincipalRef {
  return { kind: "AUTONOMOUS_STORE", autonomousStoreId: makeId<"AutonomousStoreId">(storeId) };
}

let counter = 0;

/** Deterministic, unique envelope per call. */
export function env(payload: RuntimeCommandPayload, actor: PrincipalRef = MERCHANT_ACTOR): AnyRuntimeCommand {
  counter += 1;
  return commandEnvelope(
    makeId<"CommandId">(`cmd-${counter}`),
    makeId<"IdempotencyKey">(`idem-${counter}`),
    actor,
    "2026-10-05T00:00:00Z",
    payload,
  );
}

/** Fully explicit envelope (idempotency replay/conflict tests). */
export function explicitEnv(
  commandId: string,
  idempotencyKey: string,
  payload: RuntimeCommandPayload,
  actor: PrincipalRef = MERCHANT_ACTOR,
): AnyRuntimeCommand {
  return commandEnvelope(
    makeId<"CommandId">(commandId),
    makeId<"IdempotencyKey">(idempotencyKey),
    actor,
    "2026-10-05T00:00:00Z",
    payload,
  );
}

/** Execute and require EXECUTED (throws with the rejection detail otherwise). */
export async function mustExecute(kernel: CommerceKernel, envelope: AnyRuntimeCommand): Promise<Extract<CommandExecution, { status: "EXECUTED" }>> {
  const outcome = await kernel.execute(envelope);
  if (outcome.status !== "EXECUTED") {
    throw new Error(`expected EXECUTED for ${envelope.payload.type}, got ${outcome.status}: ${JSON.stringify(outcome.status === "REJECTED" ? outcome.reason : outcome)}`);
  }
  return outcome;
}
