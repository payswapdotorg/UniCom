/**
 * W2-029 — the autonomy status, objectives and override-point availability
 * section (J13). Renders exactly what the current contracts represent:
 * the run presentation derived from journaled kernel state, the honest
 * "no objective type exists" statement, and every override point with its
 * real wired status. Missing controls are marked UNAVAILABLE rather than
 * simulated as effective policy (work-order law 5).
 *
 * CONTRACT MIRROR NOTE: the view vocabulary below mirrors the
 * @unicom/experience autonomous-store view contracts (runPresentation /
 * override kinds / availability) field-for-field as module-local structural
 * types — the package's root surface cannot be imported from packages/web
 * without adding baseline TS2305 errors (pre-existing extension-less
 * re-export defect in packages/experience/src/contract.ts, outside this
 * lane's write surface). The commerce state itself is NOT mirrored: it is
 * the real AutonomousStorePolicy / AutonomousStoreControl passed in.
 */
import type { JSX } from "react";

import type { AutonomousStoreControl, AutonomousStorePolicy } from "@unicom/commerce";
import { fmtMoney } from "../merchant-shared/demo-runtime.js";
import { DemoTag, StatusChip } from "../merchant-shared/ui.js";

/** Mirror of experience AutonomousStoreRunPresentation (UX vocabulary only). */
export type AutonomousStoreRunPresentation =
  | "running"
  | "paused"
  | "awaiting-owner-approval"
  | "stopped"
  | "unknown";

/** Plain-language period label (DAILY → day, matching the policy-in-force card). */
function periodLabel(period: "DAILY" | "WEEKLY" | "MONTHLY"): string {
  if (period === "DAILY") return "day";
  if (period === "WEEKLY") return "week";
  return "month";
}

/** Mirror of the experience override-point kinds (typed availability surface). */
export type AutonomousStoreOverrideKind =
  | "pause-autonomy"
  | "resume-autonomy"
  | "stop-store"
  | "approve-pending-action"
  | "tighten-limits"
  | "loosen-limits";

/** One override point with its honest wired status (mirror field vocabulary). */
export interface OverridePointRow {
  readonly kind: AutonomousStoreOverrideKind;
  readonly userLabel: string;
  readonly effectNote: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly commandHandoff?: string;
}

/** The run presentation derived from journaled kernel state (never a runtime claim). */
export function deriveRunPresentation(halted: boolean): AutonomousStoreRunPresentation {
  return halted ? "stopped" : "running";
}

export function presentationNoteFor(presentation: AutonomousStoreRunPresentation): string {
  if (presentation === "stopped") {
    return "A stop condition holds (journaled policy revision): every autonomous action is denied at the kernel boundary until the owner intervenes. This is a deterministic halt derived from journaled state — not a paused process with a resume button.";
  }
  return "No stop condition holds: the registered policy bounds every autonomous action, and each action is a journaled policy application (ALLOW / REQUIRE_APPROVAL / DENY / OVERRIDE).";
}

/**
 * The override points, each with its REAL wired status on this surface.
 * Only approve-pending-action is wired (the journaled human override path);
 * the commerce runtime has no pause/resume/stop-store verbs, and policy
 * revision is kernel-side — none of those are simulated as clickable.
 */
export const OVERRIDE_POINTS: readonly OverridePointRow[] = [
  {
    kind: "approve-pending-action",
    userLabel: "Approve a pending action yourself",
    effectNote:
      "Wired on this surface: the journaled human override above (price / restock) IS the approval gate — owner authority recorded on-behalf-of the autonomous store, with a justification, while autonomy is halted.",
    available: true,
    commandHandoff: "kernel:RECORD_HUMAN_OVERRIDE",
  },
  {
    kind: "pause-autonomy",
    userLabel: "Pause autonomy",
    effectNote:
      "Would suspend autonomous actions pending human release — but no pause verb exists in the current contracts.",
    available: false,
    unavailableReason:
      "No runtime command exists for pausing autonomy. Autonomy halts deterministically through journaled stop conditions (revision 2 above) or an authority handover — this surface wires no one-click pause, and none is simulated.",
  },
  {
    kind: "resume-autonomy",
    userLabel: "Resume autonomy",
    effectNote: "Would release a halt after the cause is addressed — no resume verb exists.",
    available: false,
    unavailableReason:
      "No runtime command exists for resuming autonomy: recovery is a journaled human override (available above) or a kernel-side policy revision that clears the stop condition. Nothing on this surface silently resumes autonomy.",
  },
  {
    kind: "stop-store",
    userLabel: "Stop the store",
    effectNote: "Would end store operations outright — outside what the contracts represent here.",
    available: false,
    unavailableReason:
      "No stop-store command exists in the current contracts. Store cycles (BEGIN / ADVANCE_STORE_CYCLE) are operational lifecycles, not an autonomy kill-switch — marked unavailable rather than simulated.",
  },
  {
    kind: "tighten-limits",
    userLabel: "Tighten the policy limits",
    effectNote: "Would register a stricter policy revision (lower spend limit, higher floors).",
    available: false,
    unavailableReason:
      "Policy revision is contract-supported (immutable journaled revisions via revisePolicy, registered kernel-side), but no policy editor is wired on this surface — the demo registers its revisions in the seed. Not simulated as an editable control.",
  },
  {
    kind: "loosen-limits",
    userLabel: "Loosen the policy limits",
    effectNote: "Would register a more permissive policy revision.",
    available: false,
    unavailableReason:
      "Same boundary as tightening: revision is a kernel-side journaled fact, and this surface exposes no editor — the boundary values below are rendered verbatim from the revision in force, never recomputed.",
  },
];

export function AutonomyControlsSection({
  policy,
  control,
  halted,
}: {
  readonly policy: AutonomousStorePolicy;
  readonly control: AutonomousStoreControl | undefined;
  readonly halted: boolean;
}): JSX.Element {
  const presentation = deriveRunPresentation(halted);
  return (
    <section aria-label="Autonomy status and control availability">
      <h2 className="cm-section-title">Autonomy status &amp; control availability</h2>
      <div className="cm-stack">
        <div className="cm-card" data-testid="cm-autonomy-status">
          <div className="cm-row">
            <span className="cm-journey-name">How autonomy appears</span>
            <StatusChip
              status={presentation.toUpperCase()}
              note="Run presentation — UX vocabulary derived from journaled kernel state (experience contract mirror), never a runtime pause/resume process"
            />
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">{presentationNoteFor(presentation)}</p>
          {control ? (
            <p className="cm-state-item-detail">
              {control.displayName} · control mode {control.mode} · owner {control.ownerRef.kind} ·
              controlling principal {control.controllingPrincipal.kind} — the presentation above is
              derived from the journaled policy state and control record, rendered verbatim.
            </p>
          ) : null}
        </div>

        <div className="cm-card" data-testid="cm-autonomy-objectives">
          <div className="cm-row">
            <span className="cm-journey-name">Store objectives</span>
            <StatusChip
              status="NOT REPRESENTED"
              note="No autonomous-store objective type exists in the current contracts"
            />
          </div>
          <p className="cm-state-item-detail">
            The current contracts represent an <strong>AutonomousStorePolicy</strong> — boundaries —
            not goals: there is no objective type (nothing like “maximize margin” exists to render),
            so none is displayed and none is simulated. What the contracts DO represent, from the
            revision in force (revision {policy.revision}, rendered verbatim — never recomputed):
          </p>
          <div className="cm-stack">
            <div className="cm-journey-item">
              <span className="cm-journey-name">Budget boundaries</span>
              <span className="cm-journey-summary">
                spend limit {fmtMoney(policy.spendLimit.limitPerPeriod)} per{" "}
                {periodLabel(policy.spendLimit.period)} · promotion budget{" "}
                {fmtMoney(policy.promotionBudget.limitPerPeriod)} per{" "}
                {periodLabel(policy.promotionBudget.period)}
              </span>
            </div>
            <div className="cm-journey-item">
              <span className="cm-journey-name">Margin boundary</span>
              <span className="cm-journey-summary">
                margin floor{" "}
                {policy.marginFloorBps !== undefined ? `${policy.marginFloorBps} bps over cost` : "none"} ·
                max discount{" "}
                {policy.maxDiscountBps !== undefined ? `${policy.maxDiscountBps} bps` : "none"}
              </span>
            </div>
            <div className="cm-journey-item">
              <span className="cm-journey-name">Approval thresholds</span>
              <span className="cm-journey-summary">
                refunds at/above {fmtMoney(policy.refundApprovalThreshold)} REQUIRE_APPROVAL · price
                deltas at/above {fmtMoney(policy.priceChangeApprovalThreshold)} REQUIRE_APPROVAL
              </span>
            </div>
            <div className="cm-journey-item">
              <span className="cm-journey-name">Stop conditions</span>
              <span className="cm-journey-summary">
                {policy.stopConditions.length} registered
                {policy.stopConditions.map((condition) => ` · ${condition.kind}`).join("")} —
                crossing a threshold halts autonomy deterministically
              </span>
            </div>
            {policy.storeOperations ? (
              <div className="cm-journey-item">
                <span className="cm-journey-name">Operations rules</span>
                <span className="cm-journey-summary">
                  till float band {fmtMoney(policy.storeOperations.tillFloatMin)}–
                  {fmtMoney(policy.storeOperations.tillFloatMax)} · cash-variance escalation at{" "}
                  {fmtMoney(policy.storeOperations.cashVarianceEscalationThreshold)}
                </span>
              </div>
            ) : null}
            {policy.restockRules ? (
              <div className="cm-journey-item">
                <span className="cm-journey-name">Restock rules</span>
                <span className="cm-journey-summary">
                  {policy.restockRules
                    .map(
                      (rule) =>
                        `${rule.skuId}: reorder ${rule.reorderUnits} at/below ${rule.thresholdUnits} units at ${fmtMoney(rule.unitCost)} unit cost`,
                    )
                    .join(" · ")}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="cm-card" data-testid="cm-autonomy-overrides">
          <div className="cm-row">
            <span className="cm-journey-name">Override points — where you can intervene</span>
            <DemoTag />
          </div>
          <p className="cm-state-item-detail">
            Each control below states whether it is <strong>actually wired</strong>. Missing
            controls are marked unavailable rather than simulated as effective policy.
          </p>
          <div className="cm-stack">
            {OVERRIDE_POINTS.map((point) => (
              <div key={point.kind} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{point.userLabel}</span>
                  <StatusChip
                    status={point.available ? "WIRED" : "NOT WIRED"}
                    note={
                      point.available
                        ? "A real command path exists on this surface"
                        : "No runtime command path — shown as unavailable, never simulated"
                    }
                  />
                  <span className="cm-chip cm-chip-muted">{point.kind}</span>
                </div>
                <p className="cm-state-item-detail">{point.effectNote}</p>
                {point.available ? (
                  <p className="cm-state-item-detail">
                    Command hand-off: <code>{point.commandHandoff}</code> — the journaled override
                    path in the actions section above.
                  </p>
                ) : (
                  <p className="cm-state-item-detail" style={{ color: "var(--cm-warn)" }}>
                    Unavailable: {point.unavailableReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
