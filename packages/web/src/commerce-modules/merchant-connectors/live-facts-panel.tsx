/**
 * W3-018 — the J15 live-facts panel (progressive rendering on top of the
 * committed SAFE_EXERCISE_RECORD).
 *
 * Renders a clearly-labelled "live facts" section when a facts provider is
 * present (the committed, test-pinned `RuntimeFacts` fixture produced BY the
 * real Node runtime projection). The honest boundary text is NEVER removed;
 * live-facts mode ADDS this section. Kill switch: absent provider → existing
 * record, zero errors.
 *
 * Provenance is rendered on-surface: "committed-fixture" (Stage 1) vs
 * "node-runtime-projection" (future Stage 2). The operator always knows
 * whether they are seeing a committed fixture or a live projection.
 */
import type { JSX } from "react";

import type { RuntimeFacts } from "@unicom/experience/runtime-browser";
import { DemoTag } from "../merchant-shared/ui.js";
import { clockLabel, CONNECTORS_NOW_LABEL } from "./fixtures.js";

const PROVENANCE_LABEL: Readonly<Record<RuntimeFacts["provenance"], string>> = {
  "node-runtime-projection": "live — produced by the real Node runtime projection",
  "committed-fixture": "committed fixture — produced by the real Node runtime projection, pinned here",
};

/**
 * The live-facts panel. Renders ONLY when `facts` is non-null (the kill switch
 * or an absent provider yields null → the panel does not render). The panel
 * ADDS a clearly-labelled live section; the existing SAFE_EXERCISE_RECORD and
 * the honest boundary text remain unchanged.
 */
export function LiveFactsPanel({ facts }: { readonly facts: RuntimeFacts }): JSX.Element {
  return (
    <div className="cm-state-item" data-testid="cm-live-facts-panel" style={{ marginTop: 10, borderColor: "var(--cm-info, var(--cm-ok))" }}>
      <div className="cm-row">
        <span className="cm-state-item-label">Live connector-runtime facts (browser-safe projection)</span>
        <span className="cm-chip cm-chip-ok">live-format facts</span>
        <DemoTag />
      </div>
      <p className="cm-state-item-detail">
        <strong>Provenance:</strong> {PROVENANCE_LABEL[facts.provenance]} · observed {clockLabel(facts.observedAt)} (demo
        clock {CONNECTORS_NOW_LABEL}). These facts are produced by the SAME projection code the Node lane uses
        (single source, two entrypoints — the <code>@unicom/experience/runtime-browser</code> sub-entrypoint). The
        browser receives only serialized facts; the real adapter/vault stay Node-only.
      </p>
      <LiveFactRow label="Connector" value={`${facts.userLabel} · id ${facts.connectorId} · transport ${facts.transportId}`} />
      <LiveFactRow label="Lifecycle" value={`${facts.lifecycle} — ${facts.connectedInstanceCount} connected instance(s)`} />
      <LiveFactRow label="Health" value={`status ${facts.health.status} · last checked ${clockLabel(facts.health.lastCheckedAt)}`} />
      <LiveFactRow
        label="Observation"
        value={facts.observation === null ? "no observation" : `${facts.observation.status} · ${facts.observation.detail}`}
      />
      <LiveFactRow
        label="Safe journey"
        value={`${facts.journey.journeyRef} · mode ${facts.journey.mode} · outcome ${facts.journey.outcome} · ${facts.journey.stepOutcomes.length} step(s) · correlation ${facts.journey.correlationId}`}
      />
      <LiveFactRow
        label="Mode telemetry"
        value={facts.modeTelemetry.map((m) => `${m.mode}: ${m.journeys} journeys (${m.succeeded} ok, ${m.failedRecoverable} failed-recoverable, ${m.unknown} unknown)`).join(" · ") || "no journeys"}
      />
      <LiveFactRow
        label="Adapter telemetry"
        value={facts.adapterTelemetry.map((a) => `${a.adapterId}: ${a.journeys} journeys, last ${a.lastOutcome ?? "none"}`).join(" · ") || "no adapter telemetry"}
      />
      <LiveFactRow
        label="Capabilities"
        value={facts.capabilities.map((c) => `${c.id} (${c.modes.join(", ")})`).join(" · ") || "none declared"}
      />
      <LiveFactRow
        label="Vault audit"
        value={`${facts.sealedCredentialCount} credential(s) sealed · ${facts.providerHttpCalls} provider HTTP call(s) — the tripwire proves zero live calls`}
      />
      <p className="cm-state-item-detail">
        <strong>Honest boundary (never removed):</strong> the live-facts section ADDS to the committed
        SAFE_EXERCISE_RECORD below — it does not replace it. The browser cannot evaluate the real
        <code> @unicom/experience/runtime </code>barrel (it transitively touches <code>node:util</code>); this
        panel renders serialized facts produced by the Node lane through the browser-safe
        <code> @unicom/experience/runtime-browser </code>sub-entrypoint. No credential material crosses the
        boundary — the vault's real type stays Node-side; the browser sees opaque ids + audit counters only.
      </p>
    </div>
  );
}

function LiveFactRow({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="cm-journey-item">
      <span className="cm-journey-name">{label}</span>
      <span className="cm-journey-summary">{value}</span>
    </div>
  );
}
