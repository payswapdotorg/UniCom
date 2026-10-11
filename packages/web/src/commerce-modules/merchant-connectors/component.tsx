/**
 * merchant-connectors component — the J15 surface (lazily loaded).
 *
 * RUNTIME-WIRED (W3-016): the integration manager is no longer a fixture
 * board alone. The REAL experience-plane connector runtime is loaded through
 * its public entrypoint (guarded dynamic import — see runtime.ts): the real
 * Shopify provider adapter is registered and exercised SAFELY through its
 * non-live surfaces (health observation, capability declaration, one
 * read-only journey attempt), with live runtime lifecycle/health/telemetry
 * outcomes rendered verbatim. Where the runtime barrel cannot be evaluated
 * (a browser today), the surface renders the honest boundary plus the
 * committed, test-pinned exercise record — never a fabricated runtime state.
 *
 * The honesty taxonomy is sharpened: CONNECTED (runtime-verified live —
 * honestly none today), REGISTERED-not-connected (the runtime-verified
 * adapter), DISCONNECTED (a real fixture-declared target needing live
 * credentials), DEMO (local deterministic, never live) and UNAVAILABLE (no
 * provider exists — never simulated). Attempts journal ATTEMPTED →
 * DISCONNECTED with the honest reason; no credential is ever requested or
 * stored; no successful live integration is ever fabricated.
 */

import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DemoTag, ConfirmableAction, PermissionBoundary, StatusChip, useSeededRuntime } from "../merchant-shared/ui.js";
import {
  CONNECTORS,
  CONNECTORS_FIXTURES_ID,
  CONNECTORS_NOW_LABEL,
  DEMO_FEED_ROWS,
} from "./fixtures.js";
import { loadConnectorsSpace } from "./runtime.js";
import { useCommittedRuntimeFacts } from "./runtime-facts-fixture.js";
import { LiveFactsPanel } from "./live-facts-panel.js";
import { BoardRow, BrowserBoundaryPanel, RuntimeSpacePanel } from "./component-parts.js";

export default function MerchantConnectorsComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime: space, reset: resetSpace } = useSeededRuntime(loadConnectorsSpace);
  const [attemptCounts, setAttemptCounts] = useState<Readonly<Record<string, number>>>({});
  const [importRuns, setImportRuns] = useState(0);
  // W3-018 Stage 1: the committed, test-pinned runtime facts fixture.
  // When non-null, the live-facts panel renders (progressive enhancement on
  // top of the committed SAFE_EXERCISE_RECORD). Kill switch:
  // RUNTIME_FACTS_LIVE_ENABLED = false → null → no live-facts panel.
  const runtimeFacts = useCommittedRuntimeFacts();

  const reset = (): void => {
    resetSpace();
    setAttemptCounts({});
    setImportRuns(0);
  };

  const connectedCount =
    space?.kind === "runtime" ? space.connectedInstanceCount : 0;

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J15 · Connectors &amp; integrations</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          The integration manager, wired to the REAL experience connector runtime through its public
          entrypoints (<code>@unicom/experience</code> contracts +{" "}
          <code>@unicom/experience/runtime</code>, guarded for browser compatibility; fixtures{" "}
          <code>{CONNECTORS_FIXTURES_ID}</code>, demo clock {CONNECTORS_NOW_LABEL}). The board below
          differentiates connected, disconnected, demo and unavailable providers accurately — and
          now also shows, per row, whether its status is runtime-verified or fixture-supplied.
          Attempting a connection records an honest ATTEMPTED → DISCONNECTED outcome; a live
          integration is never fabricated and no credential is ever requested or stored.
        </p>
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={reset}>
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
            {connectedCount === 0
              ? "None. No marketplace, supplier portal, payment rail or accounting backend is connected right now — the demo environment has no live provider contracts, and this board says so rather than implying otherwise. The one REGISTERED adapter below is deliberately NOT connected (registering verifies the runtime, never a live account). Everything that LOOKS like an integration below is labelled demo, disconnected or unavailable."
              : `${connectedCount} connected instance(s) — see the runtime panel.`}
          </p>
        </div>
      </section>

      <section aria-label="The real connector runtime">
        <h2 className="cm-section-title">The real connector runtime — safe exercise (non-live surfaces only)</h2>
        {space === null ? (
          <p className="cm-card-sub" data-testid="cm-runtime-loading">
            Loading the real connector runtime through its public entrypoint (deterministic)…
          </p>
        ) : space.kind === "runtime" ? (
          <RuntimeSpacePanel space={space} />
        ) : (
          <BrowserBoundaryPanel reason={space.reason} />
        )}
        {/* W3-018 Stage 1: the live-facts panel (progressive enhancement).
            Renders when the facts provider is present (the committed,
            test-pinned fixture produced BY the real Node runtime projection).
            Kill switch: RUNTIME_FACTS_LIVE_ENABLED = false → null → no panel.
            The honest boundary text is NEVER removed; this ADDS a section. */}
        {runtimeFacts !== null ? <LiveFactsPanel facts={runtimeFacts} /> : null}
        <p className="cm-env-note">
          Exercised through <code>@unicom/experience/runtime</code>: the credential vault, the
          Shopify adapter, connector lifecycle, health observation, journey runner + telemetry
          registry, the W3-005 health surface. The exercise is DEMO-scoped (a demo shop domain, a
          fixed clock) but every outcome above is the runtime&apos;s own — nothing is scripted on
          this surface.
        </p>
      </section>

      <section aria-label="Connection board">
        <h2 className="cm-section-title">Connection board</h2>
        <div className="cm-stack">
          {CONNECTORS.map((connector) => (
            <BoardRow
              key={connector.id}
              host={host}
              connector={connector}
              attemptCount={attemptCounts[connector.id] ?? 0}
              onAttempt={() =>
                setAttemptCounts((current) => ({
                  ...current,
                  [connector.id]: (current[connector.id] ?? 0) + 1,
                }))
              }
            />
          ))}
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
              this screen only. The rows are supplier DATA (never trusted instructions): the
              csv-feed transport in the real <code>@unicom/experience</code> contract registry
              carries observations only (it can never carry commands), and a real deployment would
              reconcile the rows before any canonical update (see J11 procurement).
            </p>
          </div>
        </section>
      ) : null}

      <section aria-label="Demo file feed import action">
        <PermissionBoundary host={host} permission="connectors.manage">
          <ConfirmableAction
            actionLabel="Run the demo file-feed import (local, deterministic)"
            confirmLabel="Run the demo import"
            statement="Reads the committed fixture CSV rows locally (three supplier stock/price rows) and records them on this screen only. Nothing is fetched, no file leaves this machine, and canonical stock does not move — the real csv-feed transport in the @unicom/experience contract registry carries observations only; a real feed would need a scheduled fetch contract."
            onExecute={() => setImportRuns((current) => current + 1)}
          />
        </PermissionBoundary>
      </section>

      <section aria-label="Honesty rules">
        <h2 className="cm-section-title">What this board will never do</h2>
        <div className="cm-stack">
          <p className="cm-card-sub">
            It will never show a fabricated &quot;connected&quot; chip, a fabricated
            &quot;last synced&quot; timestamp, or a successful live attempt in an environment
            with no provider. UNAVAILABLE is not DISCONNECTED (there is nothing to disconnect),
            DEMO is not CONNECTED (it is local and deterministic), an ATTEMPT is not a success,
            REGISTERED is not CONNECTED (the adapter exists in the runtime; no account is bound),
            and a health UNKNOWN is neither healthy nor down — the runtime says so itself. The
            status vocabulary stays honest so the operator can trust the one state that matters:
            nothing is live.
          </p>
        </div>
      </section>
    </div>
  );
}
