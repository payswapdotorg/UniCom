/**
 * merchant-connectors presentational parts (J15, W3-016) — split out of
 * component.tsx for the max-lines gate (pure code motion; the composing
 * entry stays component.tsx).
 *
 * The runtime panels render LIVE runtime truth when the guarded dynamic
 * import could evaluate the runtime barrel (the module tests, node
 * environments); a browser renders the honest boundary panel instead —
 * never a fabricated runtime state.
 */

import type { JSX } from "react";

import { CONNECTOR_TRANSPORTS } from "@unicom/experience";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import {
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  ATTEMPT_OUTCOME_REASON,
  CONNECTORS_NOW_LABEL,
  RUNTIME_BROWSER_BOUNDARY,
  SAFE_EXERCISE_RECORD,
  clockLabel,
} from "./fixtures.js";
import type { ConnectorFixture } from "./fixtures.js";
import type { ConnectorRuntimeSpace } from "./runtime.js";

function toneClass(tone: "ok" | "warn" | "info" | "unknown"): string {
  return tone === "ok" ? "cm-chip cm-chip-ok" : tone === "warn" ? "cm-chip cm-chip-warn" : tone === "unknown" ? "cm-chip cm-chip-unknown" : "cm-chip cm-chip-muted";
}

/** The transport descriptor of a board row (from the CONTRACT registry). */
export function transportOf(connector: ConnectorFixture) {
  return connector.transportId === null
    ? undefined
    : CONNECTOR_TRANSPORTS.find((descriptor) => descriptor.id === connector.transportId);
}

/**
 * The live runtime panel — every value below is produced by the REAL
 * experience connector runtime (see runtime.ts): the registered Shopify
 * adapter, its lifecycle, the observed health snapshot, the safe journey's
 * evidence, the mode telemetry and the health-surface recovery plan.
 */
export function RuntimeSpacePanel({ space }: { readonly space: ConnectorRuntimeSpace }): JSX.Element {
  const entry = space.healthSurface[0];
  return (
    <div className="cm-stack" data-testid="cm-runtime-panel">
      <div className="cm-row">
        <span className="cm-state-item-label">{space.userLabel}</span>
        <span className={toneClass("warn")} data-status={space.lifecycle}>
          {space.lifecycle.toUpperCase()} — not connected
        </span>
        <span className="cm-env-note">
          connector <code>{space.connectorId}</code> · transport {space.transportId} · observed{" "}
          {clockLabel(space.observedAt)}
        </span>
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">
        The REAL Shopify provider adapter, registered in the real connector runtime
        (register → connect would need live credentials — none exist, none are fabricated).
        Lifecycle is {space.lifecycle} with {space.connectedInstanceCount} connected instances:
        nothing is live, and the runtime says so itself.
      </p>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Health observation (runtime.healthReport)</span>
        <span className="cm-journey-summary">
          status <span className={toneClass("unknown")} data-status={space.health.status} title="UNKNOWN is neither healthy nor down">{space.health.status}</span> ·{" "}
          {space.health.degradedReasons.join("; ") || "no degraded reasons"} · checked{" "}
          {clockLabel(space.health.lastCheckedAt)} · evidence:{" "}
          {space.health.evidence.map((evidence) => evidence.summary).join("; ") || "none"}
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Latest observation (runtime.observe)</span>
        <span className="cm-journey-summary">
          {space.observation === null
            ? "no observation recorded"
            : `status ${space.observation.status} · freshness ${space.observation.freshness} · ${space.observation.detail}`}
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Capability declaration (adapter descriptor)</span>
        <span className="cm-journey-summary">
          {space.capabilities
            .map((capability) => `${capability.id} (${capability.modes.join(", ")})`)
            .join(" · ")}
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Safe journey evidence (telemetry registry)</span>
        <span className="cm-journey-summary">
          {space.journey.journeyRef} · mode {space.journey.mode} · outcome{" "}
          <span className={toneClass("warn")} data-status={space.journey.outcome} title="The canonical gate's honest refusal — the runtime's own vocabulary, never collapsed">{space.journey.outcome}</span>{" "}
          · step {space.journey.stepOutcomes.map((step) => `${step.stepRef}: ${step.outcome} (${step.note ?? "no note"})`).join("; ")} · correlation{" "}
          <code>{space.journey.correlationId}</code>
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Execution-mode telemetry (journey rollups)</span>
        <span className="cm-journey-summary">
          {space.modeTelemetry
            .map(
              (mode) =>
                `${mode.mode}: ${mode.journeys} journeys — ${mode.succeeded} succeeded, ${mode.failedRecoverable} failed-recoverable, ${mode.unknown} unknown`,
            )
            .join(" · ") || "no journeys recorded"}
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Health surface recovery plan (W3-005 projection)</span>
        <span className="cm-journey-summary">
          {entry === undefined
            ? "no health surface entry"
            : `last journey ${entry.lastContact.lastJourneyAt ? clockLabel(entry.lastContact.lastJourneyAt) : "never"} · outcome ${entry.lastContact.lastJourneyOutcome ?? "none"} · recovery: ${
                entry.recovery.actions.map((action) => `${action.userLabel} (${action.rationale})`).join("; ") || "no action needed"
              }`}
        </span>
      </div>
      <div className="cm-journey-item">
        <span className="cm-journey-name">Safety counters (the exercise's own proof)</span>
        <span className="cm-journey-summary">
          provider HTTP calls: {space.providerHttpCalls} (the tripwire port was never reached) ·
          credentials sealed: {space.sealedCredentialCount} (the real vault stays empty)
        </span>
      </div>
      <p className="cm-state-item-detail">
        Safe exercise label: <strong>{SAFE_EXERCISE_RECORD.label}</strong> — health observation,
        capability declaration and journey evidence only, through the runtime&apos;s public
        entrypoint. No credentials, no live connection, no provider call, no orders or payments;
        the journey was blocked by the canonical gate exactly because nothing is connected.
      </p>
    </div>
  );
}

/**
 * The honest browser boundary: the runtime barrel cannot be evaluated here.
 * The committed, test-pinned safe-exercise record is rendered instead —
 * never a fabricated runtime state.
 */
export function BrowserBoundaryPanel({ reason }: { readonly reason: string }): JSX.Element {
  return (
    <div className="cm-stack" data-testid="cm-runtime-boundary">
      <div className="cm-row">
        <span className="cm-state-item-label">Connector runtime panels</span>
        <StatusChip status="UNAVAILABLE" note="Not browser-evaluable today — an honest boundary, not an error" />
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">{RUNTIME_BROWSER_BOUNDARY}</p>
      <p className="cm-state-item-detail">
        The runtime barrel import failed with its own message (rendered verbatim):{" "}
        <code>{reason}</code>
      </p>
      <p className="cm-state-item-detail">
        Committed safe-exercise record (pinned by the module tests against the real runtime) —
        label: <strong>{SAFE_EXERCISE_RECORD.label}</strong>. Adapter{" "}
        {SAFE_EXERCISE_RECORD.adapter} on the demo shop domain{" "}
        <code>{SAFE_EXERCISE_RECORD.shopDomain}</code>; surfaces —{" "}
        {SAFE_EXERCISE_RECORD.surfaces.join("; ")}; constraints —{" "}
        {SAFE_EXERCISE_RECORD.constraints.join("; ")}; deterministic outcomes — lifecycle{" "}
        {SAFE_EXERCISE_RECORD.outcomes.lifecycle}, {SAFE_EXERCISE_RECORD.outcomes.connectedInstanceCount}{" "}
        connected instances, health {SAFE_EXERCISE_RECORD.outcomes.healthStatus} ("
        {SAFE_EXERCISE_RECORD.outcomes.healthReason}"), journey{" "}
        {SAFE_EXERCISE_RECORD.outcomes.journeyRef} in mode{" "}
        {SAFE_EXERCISE_RECORD.outcomes.journeyMode} ended{" "}
        {SAFE_EXERCISE_RECORD.outcomes.journeyOutcome} (
        {SAFE_EXERCISE_RECORD.outcomes.journeyBlockReason}),{" "}
        {SAFE_EXERCISE_RECORD.outcomes.providerHttpCalls} provider HTTP calls,{" "}
        {SAFE_EXERCISE_RECORD.outcomes.sealedCredentials} sealed credentials.
      </p>
    </div>
  );
}

/** One connection-board row (fixture basis; real transport descriptor). */
export function BoardRow({
  host,
  connector,
  attemptCount,
  onAttempt,
}: {
  readonly host: CommerceHostServices;
  readonly connector: ConnectorFixture;
  readonly attemptCount: number;
  readonly onAttempt: () => void;
}): JSX.Element {
  const transport = transportOf(connector);
  return (
    <div className="cm-state-item" data-connector-id={connector.id}>
      <div className="cm-row">
        <span className="cm-state-item-label">{connector.name}</span>
        <StatusChip status={connector.state} note={`basis: ${connector.basis}`} />
        <span className="cm-env-note">
          basis: {connector.basis === "runtime" ? "runtime-verified" : "fixture"} ·{" "}
          {transport
            ? `transport ${transport.userLabel} (${transport.family}${transport.supportsCommands ? ", commands+observations" : ", observations only"}${transport.carriesUntrustedContent ? ", untrusted content" : ""})`
            : "no transport wired — no provider exists"}
        </span>
      </div>
      <p className="cm-state-item-detail">{connector.statusDetail}</p>
      <p className="cm-state-item-detail" style={{ color: "var(--cm-fg-faint)" }}>
        Data flow: {connector.dataFlow}
      </p>
      <p className="cm-state-item-detail" style={{ color: "var(--cm-fg-faint)" }}>
        Next step: {connector.nextStep}
      </p>
      <div className="cm-row">
        <PermissionBoundary host={host} permission="connectors.manage">
          {connector.attemptable ? (
            <ConfirmableAction
              actionLabel={`Attempt connection — ${connector.name}`}
              confirmLabel="Attempt the connection"
              statement={`Attempts to connect ${connector.name}. In this demo environment the attempt CANNOT succeed (no live credentials or contract) — it will be journaled below as ATTEMPTED → DISCONNECTED with the honest reason, never as a fabricated success. A real attempt would hand operator-provided credentials to the real connector runtime's connect step; no credentials exist, so no runtime call is made.`}
              onExecute={onAttempt}
            />
          ) : (
            <p className="cm-card-sub">
              No attempt is offered:{" "}
              {connector.state === "DEMO"
                ? "this is the working demo integration — run its import below."
                : "this provider does not exist here, so there is nothing to attempt — an attempt would be theater."}
            </p>
          )}
        </PermissionBoundary>
      </div>
      {attemptCount > 0 ? (
        <div className="cm-stack">
          {Array.from({ length: attemptCount }, (_, index) => (
            <div key={index} className="cm-journey-item">
              <span className="cm-journey-name">attempt {index + 1}</span>
              <StatusChip status="ATTEMPTED" note="An attempt was made — attempt is not success" />
              <StatusChip status="DISCONNECTED" note="The honest outcome: still not connected" />
              <span className="cm-journey-summary">
                {CONNECTORS_NOW_LABEL} · {ATTEMPT_OUTCOME_REASON}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
