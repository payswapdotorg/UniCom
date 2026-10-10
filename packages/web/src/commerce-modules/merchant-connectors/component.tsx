/**
 * merchant-connectors component — the J15 surface (lazily loaded).
 *
 * The honest integration manager. The connection board differentiates
 * CONNECTED (none today — stated), DISCONNECTED (real target, needs live
 * credentials, disabled in demo), DEMO (the local deterministic file feed)
 * and UNAVAILABLE (no provider exists — never simulated). Connection
 * attempts are journaled in local DEMO state as ATTEMPTED with their honest
 * DISCONNECTED outcome; the demo import shows exactly the fixture rows the
 * file feed delivers. No live provider, credential or browser session is
 * ever contacted; no successful live integration is ever fabricated.
 */

import type { JSX } from "react";


import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import {
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  ATTEMPT_OUTCOME_REASON,
  CONNECTORS,
  CONNECTORS_FIXTURES_ID,
  DEMO_FEED_ROWS,
} from "./fixtures.js";

/** One locally journaled connection attempt (DEMO state, resettable). */
interface AttemptEntry {
  readonly connectorId: string;
  readonly at: string;
  readonly outcome: "ATTEMPTED → DISCONNECTED";
}

const STATE_TONE_NOTE: Readonly<Record<string, string>> = {
  CONNECTED: "A genuinely live integration — none exist today, and that is stated",
  DISCONNECTED: "A real integration target that is not connected (needs live credentials)",
  DEMO: "A local deterministic demo integration — never a live provider",
  UNAVAILABLE: "No provider or contract exists — never simulated",
};

export default function MerchantConnectorsComponent({ host }: CommerceModuleProps): JSX.Element {
  const [attempts, setAttempts] = useState<readonly AttemptEntry[]>([]);
  const [importRuns, setImportRuns] = useState(0);

  const connected = CONNECTORS.filter((connector) => connector.state === "CONNECTED");

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J15 · Connectors &amp; integrations</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          The integration manager (demo). The board below differentiates connected, disconnected,
          demo and unavailable providers accurately, from committed fixtures{" "}
          <code>{CONNECTORS_FIXTURES_ID}</code>. Attempting a connection records an honest
          ATTEMPTED → DISCONNECTED outcome; a live integration is never fabricated and no
          credential is ever requested or stored.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              setAttempts([]);
              setImportRuns(0);
            }}
          >
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live provider
          </span>
        </div>
        <div className="cm-card">
          <div className="cm-row">
            <h3 className="cm-card-title">Genuinely connected integrations</h3>
            <StatusChip status="NONE_TODAY" note="An honest count: nothing is connected in this environment" />
          </div>
          <p className="cm-card-sub">
            {connected.length === 0
              ? "None. No marketplace, supplier portal, payment rail or accounting backend is connected right now — the demo environment has no live provider contracts, and this board says so rather than implying otherwise. Everything that LOOKS like an integration below is labelled demo, disconnected or unavailable."
              : connected.map((connector) => connector.name).join(", ")}
          </p>
        </div>
      </section>

      <section aria-label="Connection board">
        <h2 className="cm-section-title">Connection board</h2>
        <div className="cm-stack">
          {CONNECTORS.map((connector) => {
            const connectorAttempts = attempts.filter((entry) => entry.connectorId === connector.id);
            return (
              <div key={connector.id} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{connector.name}</span>
                  <StatusChip status={connector.state} note={STATE_TONE_NOTE[connector.state]} />
                  <span className="cm-env-note">{connector.kind}</span>
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
                        statement={`Attempts to connect ${connector.name}. In this demo environment the attempt CANNOT succeed (no live credentials or contract) — it will be journaled below as ATTEMPTED → DISCONNECTED with the honest reason, never as a fabricated success.`}
                        onExecute={() => {
                          setAttempts((current) => [
                            ...current,
                            {
                              connectorId: connector.id,
                              at: new Date().toISOString().slice(0, 10),
                              outcome: "ATTEMPTED → DISCONNECTED",
                            },
                          ]);
                        }}
                      />
                    ) : (
                      <p className="cm-card-sub">
                        No attempt is offered:{" "}
                        {connector.state === "DEMO"
                          ? "this is the working demo integration — run its import below."
                          : "this provider does not exist here, so there is nothing to attempt — an attempt would be theater."}
                      </p>
                    )}
                    {connector.id === "connector-csv-feed" ? (
                      <ConfirmableAction
                        actionLabel="Run the demo file-feed import (local, deterministic)"
                        confirmLabel="Run the demo import"
                        statement="Reads the committed fixture CSV rows locally (three supplier stock/price rows) and records them on this screen only. Nothing is fetched, no file leaves this machine, and canonical stock does not move — a real feed would need a scheduled fetch contract."
                        onExecute={() => {
                          setImportRuns((current) => current + 1);
                        }}
                      />
                    ) : null}
                  </PermissionBoundary>
                </div>
                {connectorAttempts.length > 0 ? (
                  <div className="cm-stack">
                    {connectorAttempts.map((entry, index) => (
                      <div key={`${entry.connectorId}-${index}`} className="cm-journey-item">
                        <span className="cm-journey-name">attempt {index + 1}</span>
                        <StatusChip status="ATTEMPTED" note="An attempt was made — attempt is not success" />
                        <StatusChip status="DISCONNECTED" note="The honest outcome: still not connected" />
                        <span className="cm-journey-summary">
                          {entry.at} · {ATTEMPT_OUTCOME_REASON}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {importRuns > 0 ? (
        <section aria-label="Demo import result">
          <h2 className="cm-section-title">Demo file-feed import (run {importRuns})</h2>
          <div className="cm-stack">
            {DEMO_FEED_ROWS.map((row) => (
              <div key={row.skuId} className="cm-journey-item">
                <span className="cm-journey-name">{row.skuId}</span>
                <span className="cm-journey-summary">
                  {row.title} · supplier units {row.supplierUnits} · price{" "}
                  USD {(Number(row.priceMinor) / 100).toFixed(2)}
                </span>
                <DemoTag />
              </div>
            ))}
            <p className="cm-card-sub">
              {DEMO_FEED_ROWS.length} rows delivered by the committed fixture file — recorded on
              this screen only. The rows are supplier DATA (never trusted instructions): a real
              deployment would reconcile them before any canonical update (see J11 procurement).
            </p>
          </div>
        </section>
      ) : null}

      <section aria-label="Honesty rules">
        <h2 className="cm-section-title">What this board will never do</h2>
        <div className="cm-stack">
          <p className="cm-card-sub">
            It will never show a fabricated &quot;connected&quot; chip, a fabricated
            &quot;last synced&quot; timestamp, or a successful live attempt in an environment
            with no provider. UNAVAILABLE is not DISCONNECTED (there is nothing to disconnect),
            DEMO is not CONNECTED (it is local and deterministic), and an ATTEMPT is not a
            success. The status vocabulary stays honest so the operator can trust the one state
            that matters: nothing is live.
          </p>
        </div>
      </section>
    </div>
  );
}
