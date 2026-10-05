import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AuthorizationDecision,
  CommerceCommandIntent,
  CommerceCommandStatus,
  CommerceCommandSubmission,
  CommerceCommandPort,
  CommerceCommandResult,
} from "../src/index.js";
import {
  buildCommerceSubmission,
  commerceCommandPayloadRef,
  commerceCommandType,
  idempotencyKey,
  submitWithIdempotency,
} from "../src/index.js";

/**
 * Commerce seam (contract law 8): the agent plane PROPOSES commerce actions
 * through opaque typed command intents and observes opaque results — it never
 * models or declares commerce truth (Worker 1's lane). Submissions are
 * idempotent and command results distinguish UNKNOWN from failure.
 */

const PRINCIPAL = { principalId: "user-amara", kind: "user" } as const;
const AUTHORIZED: AuthorizationDecision = {
  decision: "AUTHORIZED",
  decidedBy: PRINCIPAL,
  policyVersion: "policy-1",
  decidedAt: "2026-11-05T08:00:00.000Z",
};

function buildIntent(commandId: string, key: string): CommerceCommandIntent {
  return {
    commandId,
    commandType: commerceCommandType("listing.create"),
    payloadRef: commerceCommandPayloadRef("payload://listing/rental-jacket-7"),
    proposedBy: { principalId: "agent-main-7", kind: "agent" },
    onBehalfOf: PRINCIPAL,
    idempotencyKey: idempotencyKey(key),
  };
}

/** Deterministic in-test port implementation — contract validation only, never shipped. */
function makeCountingPort(): { port: CommerceCommandPort; calls: CommerceCommandSubmission[] } {
  const calls: CommerceCommandSubmission[] = [];
  return {
    calls,
    port: {
      submit(submission: CommerceCommandSubmission): CommerceCommandResult {
        calls.push(submission);
        return {
          commandId: submission.intent.commandId,
          idempotencyKey: submission.intent.idempotencyKey,
          status: "ACCEPTED",
        };
      },
    },
  };
}

describe("opaque commerce boundary", () => {
  it("references commerce exclusively through opaque command types and payload handles", () => {
    expectTypeOf<Extract<keyof CommerceCommandIntent, "payload" | "order" | "payment" | "catalog" | "cart">>().toEqualTypeOf<never>();
    const intent = buildIntent("cmd-1", "idem-1");
    expect(intent.commandType).toBeDefined();
    expect(intent.payloadRef).toBeDefined();
  });

  it("supports ambiguous results as UNKNOWN — distinct from any failure status", () => {
    expectTypeOf<Extract<CommerceCommandStatus, "FAILED" | "ERROR">>().toEqualTypeOf<never>();
    const result: CommerceCommandResult = {
      commandId: "cmd-9",
      idempotencyKey: idempotencyKey("idem-9"),
      status: "UNKNOWN",
      reason: "gateway timeout before provider acknowledgement",
    };
    expect(result.status).toBe("UNKNOWN");
  });
});

describe("command submission authorization", () => {
  it("builds a submission only from an AUTHORIZED decision", () => {
    const submission = buildCommerceSubmission({
      intent: buildIntent("cmd-2", "idem-2"),
      authorization: AUTHORIZED,
      submittedAt: "2026-11-05T08:00:01.000Z",
    });
    expect(submission.authorization.decision).toBe("AUTHORIZED");
    expect(submission.proofPin).toBeUndefined();
  });

  it("refuses to build a submission from a DENIED or UNKNOWN authorization", () => {
    const denied: AuthorizationDecision = { ...AUTHORIZED, decision: "DENIED" };
    expect(() =>
      buildCommerceSubmission({ intent: buildIntent("cmd-3", "idem-3"), authorization: denied, submittedAt: "2026-11-05T08:00:01.000Z" }),
    ).toThrow(/authoriz/i);
    const unknown: AuthorizationDecision = { ...AUTHORIZED, decision: "UNKNOWN" };
    expect(() =>
      buildCommerceSubmission({ intent: buildIntent("cmd-4", "idem-4"), authorization: unknown, submittedAt: "2026-11-05T08:00:01.000Z" }),
    ).toThrow(/authoriz/i);
  });
});

describe("idempotent submission", () => {
  it("carries a typed idempotency key on every command intent", () => {
    const intent = buildIntent("cmd-5", "idem-5");
    expectTypeOf<CommerceCommandIntent["idempotencyKey"]>().not.toEqualTypeOf<string>();
    expect(intent.idempotencyKey).toBeDefined();
  });

  it("does not re-execute a duplicate submission — the prior result is returned", () => {
    const { port, calls } = makeCountingPort();
    const submission = buildCommerceSubmission({
      intent: buildIntent("cmd-6", "idem-6"),
      authorization: AUTHORIZED,
      submittedAt: "2026-11-05T08:00:01.000Z",
    });
    const first = submitWithIdempotency(port, submission, []);
    expect(first.status).toBe("ACCEPTED");
    expect(calls).toHaveLength(1);

    const second = submitWithIdempotency(port, submission, [first]);
    expect(second).toEqual(first); // deduplicated against prior results
    expect(calls).toHaveLength(1); // the port was NOT called again
  });

  it("executes submissions with distinct idempotency keys", () => {
    const { port, calls } = makeCountingPort();
    const a = buildCommerceSubmission({
      intent: buildIntent("cmd-7", "idem-7"),
      authorization: AUTHORIZED,
      submittedAt: "2026-11-05T08:00:01.000Z",
    });
    const b = buildCommerceSubmission({
      intent: buildIntent("cmd-8", "idem-8"),
      authorization: AUTHORIZED,
      submittedAt: "2026-11-05T08:00:02.000Z",
    });
    submitWithIdempotency(port, a, []);
    submitWithIdempotency(port, b, []);
    expect(calls).toHaveLength(2);
  });
});
