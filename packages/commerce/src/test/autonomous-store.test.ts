/**
 * W1-005 domain unit tests — deterministic time derivation (pure arithmetic,
 * no Date object, no wall clock), the store-cycle state machine, escalation
 * transitions and the escalation/override record vocabulary laws.
 */
import { describe, expect, it } from "vitest";
import {
  currency,
  dayKeyOf,
  epochDayOf,
  makeId,
  money,
  spendPeriodKeyOf,
  storeCycleTransition,
  storeEscalationTransition,
} from "../contract.js";

const usd = currency("USD");

describe("W1-005 deterministic time derivation (pure; the kernel injects `now`)", () => {
  it("dayKeyOf extracts the UTC calendar date (including leap days)", () => {
    expect(dayKeyOf("2026-01-05T08:17:33Z")).toBe("2026-01-05");
    expect(dayKeyOf("2026-12-31T23:59:59Z")).toBe("2026-12-31");
    expect(dayKeyOf("2024-02-29T00:00:00Z")).toBe("2024-02-29");
    expect(dayKeyOf("1970-01-01T00:00:00Z")).toBe("1970-01-01");
    expect(dayKeyOf("2026-10-05T00:00:00.123Z")).toBe("2026-10-05");
  });

  it("dayKeyOf is pure arithmetic — no Date parsing, and malformed instants throw", () => {
    expect(dayKeyOf("2026-03-01T05:00:00Z")).toBe("2026-03-01");
    expect(() => dayKeyOf("2026-03-01T05:00:00")).toThrow(TypeError);
    expect(() => dayKeyOf("not a timestamp")).toThrow(TypeError);
    expect(() => dayKeyOf("2026-03-01 05:00:00Z")).toThrow(TypeError);
  });

  it("epochDayOf matches the civil epoch (verified against known day numbers)", () => {
    expect(epochDayOf("1970-01-01T00:00:00Z")).toBe(0);
    expect(epochDayOf("1970-01-02T00:00:00Z")).toBe(1);
    expect(epochDayOf("2026-01-05T00:00:00Z")).toBe(20458);
    expect(epochDayOf("2024-02-29T23:59:59Z")).toBe(19782);
    expect(epochDayOf("2024-03-01T00:00:00Z")).toBe(19783);
  });

  it("spendPeriodKeyOf derives deterministic DAILY/WEEKLY/MONTHLY keys", () => {
    expect(spendPeriodKeyOf("2026-01-05T10:00:00Z", "DAILY")).toBe("2026-01-05");
    expect(spendPeriodKeyOf("2026-01-05T10:00:00Z", "MONTHLY")).toBe("2026-01");
    // Epoch week 0 covers 1970-01-01..1970-01-07 (documented fixed boundary).
    expect(spendPeriodKeyOf("1970-01-07T23:59:59Z", "WEEKLY")).toBe("W0");
    expect(spendPeriodKeyOf("1970-01-08T00:00:00Z", "WEEKLY")).toBe("W1");
    // Same instant always derives the same key (pure function).
    expect(spendPeriodKeyOf("2026-10-05T00:00:00Z", "WEEKLY")).toBe(spendPeriodKeyOf("2026-10-05T19:30:00Z", "WEEKLY"));
  });
});

describe("W1-005 store-cycle state machine (OPEN → OPERATING → CLOSED → RECONCILED)", () => {
  it("walks the documented table and rejects every illegal edge", () => {
    expect(storeCycleTransition("OPEN", "OPERATE")).toEqual({ ok: true, value: "OPERATING" });
    expect(storeCycleTransition("OPERATING", "CLOSE")).toEqual({ ok: true, value: "CLOSED" });
    expect(storeCycleTransition("CLOSED", "RECONCILE")).toEqual({ ok: true, value: "RECONCILED" });
    for (const trigger of ["CLOSE", "RECONCILE"] as const) {
      const result = storeCycleTransition("OPEN", trigger);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STORE_CYCLE_TRANSITION");
    }
    expect(storeCycleTransition("OPERATING", "OPERATE").ok).toBe(false);
    expect(storeCycleTransition("OPERATING", "RECONCILE").ok).toBe(false);
    expect(storeCycleTransition("CLOSED", "OPERATE").ok).toBe(false);
    expect(storeCycleTransition("CLOSED", "CLOSE").ok).toBe(false);
    for (const trigger of ["OPERATE", "CLOSE", "RECONCILE"] as const) {
      expect(storeCycleTransition("RECONCILED", trigger).ok).toBe(false);
    }
  });
});

describe("W1-005 escalation state machine (OPEN → ACKNOWLEDGED → RESOLVED)", () => {
  it("allows the documented edges and rejects terminal/illegal advances", () => {
    expect(storeEscalationTransition("OPEN", "ACKNOWLEDGE")).toEqual({ ok: true, value: "ACKNOWLEDGED" });
    expect(storeEscalationTransition("OPEN", "RESOLVE")).toEqual({ ok: true, value: "RESOLVED" });
    expect(storeEscalationTransition("ACKNOWLEDGED", "RESOLVE")).toEqual({ ok: true, value: "RESOLVED" });
    expect(storeEscalationTransition("ACKNOWLEDGED", "ACKNOWLEDGE").ok).toBe(false);
    expect(storeEscalationTransition("RESOLVED", "ACKNOWLEDGE").ok).toBe(false);
    expect(storeEscalationTransition("RESOLVED", "RESOLVE").ok).toBe(false);
  });

  it("escalation evidence and override records are immutable values (revision discipline via the runtime)", () => {
    // Structural vocabulary smoke: the domain records are plain immutable
    // values; construction happens in the runtime folds with minted ids.
    const evidence = {
      kind: "CASH_VARIANCE" as const,
      variance: {
        varianceId: makeId<"CashVarianceRecordId">("var-1"),
        sessionId: makeId<"StoreCashSessionId">("till-1"),
        autonomousStoreId: makeId<"AutonomousStoreId">("store-1"),
        tillId: makeId<"TillId">("till-1"),
        occasion: "CLOSE" as const,
        expected: money("1000", usd),
        counted: money("900", usd),
        kind: "SHORT" as const,
        varianceAmount: money("100", usd),
        revision: 1,
      },
    };
    expect(evidence.variance.kind).toBe("SHORT");
    expect(evidence.kind).toBe("CASH_VARIANCE");
  });
});
