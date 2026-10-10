/**
 * W1-011 deterministic DEMO fixtures (work order scope §7–8).
 *
 * Laws:
 * - committed, synthetic, deterministic — no provider accounts, no
 *   credentials, no network fetches, nothing labelled as live;
 * - every value derived from these fixtures is rendered with a visible
 *   DEMO marker by the host (EnvironmentBadge);
 * - `resetDemo()` returns the host to exactly DEFAULT_DEMO_STATE;
 * - connected integrations list is EMPTY and must stay empty until a real
 *   connector integration exists (honest environment indicator).
 */

import type { CommerceRoleId, CommerceScenarioContext } from "../contract/index.js";

/** One deterministic demo firm profile (W1-010 pilot small/medium/large). */
export interface DemoFirmProfile {
  readonly firmSize: CommerceScenarioContext["firmSize"];
  readonly firmName: string;
  readonly industry: string;
  readonly note: string;
}

/** The small firm the default scenario runs in. */
const PRIMARY_DEMO_FIRM: DemoFirmProfile = {
  firmSize: "small",
  firmName: "Harbor Lane Print Studio",
  industry: "specialty printing",
  note: "Two-person studio; buys paper and inks, sells custom prints locally.",
};

/** The committed demo firm profiles. */
export const DEMO_FIRMS: readonly DemoFirmProfile[] = [
  PRIMARY_DEMO_FIRM,
  {
    firmSize: "medium",
    firmName: "Meridian Office Supply",
    industry: "office equipment distribution",
    note: "Regional distributor; runs a storefront, restocks weekly, employs receiving staff.",
  },
  {
    firmSize: "large",
    firmName: "Cascade Foods Wholesale",
    industry: "food wholesale",
    note: "Multi-location grocery wholesaler; procurement approvals, partial receiving, finance reconciliation.",
  },
];

/**
 * The default demo scenario (small firm, buying + selling roles held).
 * Held roles deliberately do NOT include procurement/receiving/finance/trust —
 * the role switcher surfaces those surfaces as visibly blocked with the
 * missing permission named, which the acceptance criteria require.
 */
export const DEFAULT_DEMO_ROLES: readonly CommerceRoleId[] = ["buyer", "merchant"];

/** The committed default scenario context. */
export const DEFAULT_DEMO_SCENARIO: CommerceScenarioContext = {
  scenarioId: "demo-scenario-01",
  firmName: PRIMARY_DEMO_FIRM.firmName,
  firmSize: PRIMARY_DEMO_FIRM.firmSize,
  industry: PRIMARY_DEMO_FIRM.industry,
  intentDraft:
    "Need 40 boxes of A3 recycled card stock within 2 weeks, budget around 480, seller must accept returns.",
  note: PRIMARY_DEMO_FIRM.note,
};

/** The honest connected-integrations inventory: NONE are connected today. */
export const DEMO_CONNECTED_INTEGRATIONS: readonly {
  readonly kind: string;
  readonly name: string;
  readonly status: "connected" | "demo" | "unavailable";
}[] = [
  // Intentionally empty: no provider account, connector or channel is
  // connected in this host. The system surface renders this honestly instead
  // of fabricating a connected state.
];

/** Fixture identity (shown on the system surface; deterministic). */
export const DEMO_FIXTURES_ID = "w1-011-demo-fixtures@1";

/**
 * Synthetic demo records the shared state components render (J18 vocabulary
 * showcase). Every record carries `source: "demo"` so no consumer can label
 * it live by accident.
 */
export interface DemoStateRecord {
  readonly id: string;
  readonly label: string;
  readonly state:
    | "OFFERED"
    | "PENDING"
    | "ATTEMPTED"
    | "OVERDUE"
    | "SETTLEMENT-UNKNOWN"
    | "NOT-PROMOTED-UNKNOWN"
    | "FAILED"
    | "DENIED"
    | "COMPLETED";
  readonly detail: string;
  readonly source: "demo";
}

/** Deterministic sample of every preserved non-failure + failure state. */
export const DEMO_STATE_RECORDS: readonly DemoStateRecord[] = [
  {
    id: "demo-st-01",
    label: "Group-buy proposal to Meridian Office Supply",
    state: "OFFERED",
    detail: "Proposal sent; the seller has it on their desk. No commitment exists yet.",
    source: "demo",
  },
  {
    id: "demo-st-02",
    label: "Quote request, 40 boxes A3 card stock",
    state: "PENDING",
    detail: "Waiting for the supplier's answer. Pending is not an error.",
    source: "demo",
  },
  {
    id: "demo-st-03",
    label: "Payment retry, invoice 2291",
    state: "ATTEMPTED",
    detail: "A retry was started after an interruption. The outcome is not known yet.",
    source: "demo",
  },
  {
    id: "demo-st-04",
    label: "Rental return, wide-format printer",
    state: "OVERDUE",
    detail: "Past the agreed return date. Overdue is a preserved state, not a failure.",
    source: "demo",
  },
  {
    id: "demo-st-05",
    label: "Settlement check, payout batch 88",
    state: "SETTLEMENT-UNKNOWN",
    detail: "The provider state cannot be confirmed. UNKNOWN is never rendered as paid or failed.",
    source: "demo",
  },
  {
    id: "demo-st-06",
    label: "Offline stock count, shelf B4 (queued)",
    state: "NOT-PROMOTED-UNKNOWN",
    detail:
      "Counted while offline; queued for reconciliation. It has not changed canonical stock and may be superseded.",
    source: "demo",
  },
  {
    id: "demo-st-07",
    label: "Supplier feed import, deprecated-format file",
    state: "FAILED",
    detail: "The import rejected the file. A failure — retry or pick another source.",
    source: "demo",
  },
  {
    id: "demo-st-08",
    label: "Refund above approval band",
    state: "DENIED",
    detail: "Policy denied the action: the amount exceeds the automatic refund band.",
    source: "demo",
  },
  {
    id: "demo-st-09",
    label: "Delivered order 1183",
    state: "COMPLETED",
    detail: "Delivered and reconciled. Completed, not silently promoted from unknown.",
    source: "demo",
  },
];
