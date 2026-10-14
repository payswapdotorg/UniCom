/**
 * System surface (/commerce/system) — the honest environment/mode surface.
 *
 * Shows: environment mode (DEMO vs connected — connected integrations: none
 * today, stated honestly), the committed demo fixtures (resettable), the
 * discovered module registry with its warnings, the journey coverage
 * summary, and the Linked Drafts ledger (W1-018 — every kernel-native draft
 * across all surfaces, with provenance, state chips and receipts). Nothing
 * here fabricates a connected or live state.
 */
import type { JSX } from "react";

import { commerceModuleRegistry, resolveJourneyCoverage } from "../../module-registry.js";
import { DEMO_CONNECTED_INTEGRATIONS, DEMO_FIXTURES_ID } from "../../demo/demo-fixtures.js";
import { EnvironmentBadge } from "../CommerceHostApp.js";
import { useCommerceHost } from "../CommerceHostContext.js";
import { sharedLinkingDraftKernel } from "../../../commerce-modules/buyer-groupbuy/linking-draft-kernel.js";
import { DEPLOYMENT_READINESS_FIXTURE, DEPLOYMENT_READINESS_SECTION_ENABLED, STANDING_GATES } from "../fixtures/deployment-readiness-fixture.js";

function StatusChip({ kind }: { readonly kind: string }): JSX.Element {
  const cls =
    kind === "ready"
      ? "cm-chip cm-chip-ok"
      : kind === "partial"
        ? "cm-chip cm-chip-warn"
        : kind === "unavailable"
          ? "cm-chip cm-chip-err"
          : "cm-chip cm-chip-muted";
  return <span className={cls}>{kind}</span>;
}

function DraftStateChip({ state }: { readonly state: string }): JSX.Element {
  const cls = state === "DRAFT" ? "cm-chip cm-chip-ok" : state === "PLACEMENT_UNKNOWN" ? "cm-chip cm-chip-unknown" : "cm-chip cm-chip-muted";
  return <span className={cls}>{state}</span>;
}

function principalLabel(principal: { readonly kind: string; readonly customerId?: string; readonly merchantId?: string; readonly systemPrincipalId?: string; readonly autonomousStoreId?: string }): string {
  if (principal.kind === "CUSTOMER") return `customer:${principal.customerId}`;
  if (principal.kind === "MERCHANT") return `merchant:${principal.merchantId}`;
  if (principal.kind === "SYSTEM") return `system:${principal.systemPrincipalId}`;
  return `autonomous-store:${principal.autonomousStoreId}`;
}

export function SystemSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const registry = commerceModuleRegistry;
  const coverage = resolveJourneyCoverage(registry);
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;
  const drafts = sharedLinkingDraftKernel.allDrafts();

  return (
    <div className="cm-stack">
      <section className="cm-card" aria-label="Environment and mode">
        <div className="cm-row">
          <h1 className="cm-card-title">Environment &amp; mode</h1>
          <EnvironmentBadge />
        </div>
        <p className="cm-card-sub">
          Mode: <strong>demo</strong> — deterministic synthetic fixtures (
          <code>{DEMO_FIXTURES_ID}</code>). No provider account or credential is required or
          present. No purchases, payments, refunds, rentals, group-buy commitments or trade legs
          can be made from this host. Every fixture-derived value is DEMO-labelled where it is
          rendered.
        </p>
        <p className="cm-card-sub">
          Connected integrations:{" "}
          {DEMO_CONNECTED_INTEGRATIONS.length === 0 ? (
            <strong>none</strong>
          ) : (
            DEMO_CONNECTED_INTEGRATIONS.map((integration) => integration.name).join(", ")
          )}
          . When a real connector integration lands, it will appear here with its honest state —
          this surface will not invent one.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button cm-button-primary"
            onClick={() => { sharedLinkingDraftKernel.reset(); dispatch({ type: "reset-demo" }); }}
            data-testid="cm-reset-demo"
          >
            Reset demo fixtures
          </button>
          <span className="cm-env-note">
            resets scenario, roles, intent draft and the shared linking-draft kernel to the committed defaults (revision{" "}
            {state.demoRevision})
          </span>
        </div>
      </section>

      <section className="cm-card" aria-label="Agent, autonomy and trust state">
        <div className="cm-row">
          <h2 className="cm-card-title">Agent, autonomy &amp; trust state</h2>
          <span className="cm-demo-tag">DEMO</span>
        </div>
        <p className="cm-card-sub">
          The truth about this host&apos;s agent, autonomy and trust surfaces, in one place: one
          Main Agent per task works toward your goal — its plans and simulations are proposals
          that never change canonical commerce state; the autonomous store runs only inside its
          registered policy (spend limits, margin floor, approval thresholds, stop conditions)
          with unwired owner controls marked unavailable, never simulated; and trust is four
          separate planes — UserTrust, AgentTrust, Capability/ProviderTrust and TransactionProof —
          where a trust signal is never transaction proof. No live agent runtime is connected in
          demo mode, and UNKNOWN states are preserved (never rendered as failure or success).
        </p>
        <div className="cm-stack" data-testid="cm-agent-state">
          <div className="cm-journey-item">
            <span className="cm-journey-name">Main Agent &amp; Commerce Twin (J14)</span>
            <span className="cm-chip cm-chip-unknown">PREDICTIVE — never canonical</span>
            <span className="cm-journey-summary">
              Objective, evidence with truth classes and freshness, a proposed plan, simulation
              before authorization, and the exact approvals consequential steps need — including
              denied authority with its safe next option.
            </span>
            <button
              type="button"
              className="cm-button"
              data-testid="cm-agent-state-twin"
              onClick={() => dispatch({ type: "navigate", path: "/commerce/twin" })}
            >
              Open the Main Agent surface
            </button>
          </div>
          <div className="cm-journey-item">
            <span className="cm-journey-name">Autonomous store controls (J13)</span>
            <span className="cm-chip cm-chip-ok">KERNEL-BACKED (demo kiosk)</span>
            <span className="cm-journey-summary">
              The policy in force with budget/margin boundaries, approval thresholds and stop
              conditions from real journaled kernel state; the override-point availability list
              states which owner controls are actually wired.
            </span>
            <button
              type="button"
              className="cm-button"
              data-testid="cm-agent-state-autonomous"
              onClick={() => dispatch({ type: "navigate", path: "/commerce/autonomous/store" })}
            >
              Open the autonomy surface
            </button>
          </div>
          <div className="cm-journey-item">
            <span className="cm-journey-name">Trust &amp; recourse (J17)</span>
            <span className="cm-chip cm-chip-ok">KERNEL-BACKED + labelled fixtures</span>
            <span className="cm-journey-summary">
              The four-plane trust ledger with the signal → risk → policy outcome → evidence →
              mitigation chain, the P0–P5 proof legend, and the security pipeline where BLOCK is
              final and deterministic — no override exists, none is offered.
            </span>
            <button
              type="button"
              className="cm-button"
              data-testid="cm-agent-state-trust"
              onClick={() => dispatch({ type: "navigate", path: "/commerce/trust/recourse" })}
            >
              Open the trust surface
            </button>
          </div>
        </div>
      </section>

      <section className="cm-card" aria-label="Linked Drafts ledger">
        <h2 className="cm-card-title">Linked Drafts ledger <span className="cm-demo-tag">DEMO</span></h2>
        <p className="cm-card-sub">
          Every kernel-native linked draft across all surfaces (the shared singleton makes this
          truthful — not per-module fragments). Each entry shows the draft id, the state chip
          (DRAFT / PLACEMENT_UNKNOWN / CANCELLED_BUT_NEVER_COMMITTED), the provenance (source
          aggregate, kind, acting principal, consent basis), the idempotency receipt, and the leg
          index for TradeCycle drafts.
        </p>
        {drafts.length === 0 ? (
          <p className="cm-card-sub" data-testid="cm-linked-drafts-empty">
            No linked drafts yet — create one from a formed GroupBuy or a committed TradeCycle leg.
          </p>
        ) : (
          <div className="cm-stack" data-testid="cm-linked-drafts-list">
            {drafts.map((draft) => {
              const receipt = sharedLinkingDraftKernel.receiptForDraft(draft.draftId as string);
              return (
              <div key={draft.draftId as string} className="cm-journey-item">
                <code style={{ fontSize: 12.5 }}>{draft.draftId as string}</code>
                <DraftStateChip state={draft.state} />
                <span className="cm-journey-name">{draft.provenance.sourceAggregateId} ({draft.provenance.sourceKind})</span>
                {draft.provenance.legIndex !== undefined ? <span className="cm-chip cm-chip-muted">leg {draft.provenance.legIndex}</span> : null}
                <span className="cm-journey-summary">actor: {principalLabel(draft.provenance.actingPrincipal)} · {draft.provenance.consentBasis}</span>
                <span className="cm-journey-summary">compensation ref: {draft.provenance.compensationRef}</span>
                {receipt ? <span className="cm-journey-summary" data-testid="cm-linked-draft-receipt">receipt {receipt.receiptId} · command {receipt.commandId} · idem-key {receipt.idempotencyKey} · executed {receipt.executedAt}</span> : null}
              </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cm-card" aria-label="Module registry">
        <h2 className="cm-card-title">Registered modules ({registry.modules.length})</h2>
        {registry.modules.length === 0 ? (
          <p className="cm-card-sub">No feature modules discovered yet.</p>
        ) : (
          <div className="cm-stack">
            {registry.modules.map((module) => (
              <div key={module.moduleId} className="cm-journey-item">
                <code style={{ fontSize: 12.5 }}>{module.moduleId}</code>
                <span className="cm-journey-name">{module.title}</span>
                <StatusChip kind={module.status.kind} />
                <span className="cm-chip cm-chip-muted">lane {module.owner}</span>
                {module.journeys.length > 0 ? (
                  <span className="cm-chip cm-chip-muted">journeys {module.journeys.join(", ")}</span>
                ) : null}
                <span className="cm-journey-summary">{module.description}</span>
                {module.status.kind !== "ready" && "reason" in module.status ? (
                  <span className="cm-journey-summary">Reason: {module.status.reason}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <h3 className="cm-card-title" style={{ marginTop: 14 }}>
          Registry warnings ({registry.warnings.length})
        </h3>
        {registry.warnings.length === 0 ? (
          <p className="cm-card-sub">
            None — every discovered module file validated against the published contract.
          </p>
        ) : (
          <ul className="cm-perm-list">
            {registry.warnings.map((warning, index) => (
              <li key={`${warning.source}-${index}`}>
                <code>{warning.source}</code>: {warning.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cm-card" aria-label="Journey coverage">
        <h2 className="cm-card-title">Journey coverage</h2>
        <p className="cm-card-sub">
          {readyCount} of 19 journey families are rendered by a registered, non-unavailable
          module. The remaining {19 - readyCount} render honest in-development states naming
          their owning lane.
        </p>
        <ul className="cm-perm-list">
          {coverage.map((entry) => (
            <li key={entry.family.journeyId}>
              {entry.family.journeyId} · {entry.family.familyName} —{" "}
              {entry.state.kind === "ready"
                ? entry.state.partial
                  ? `partial (${entry.state.reason})`
                  : "ready"
                : "in development"}
            </li>
          ))}
        </ul>
      </section>

      {DEPLOYMENT_READINESS_SECTION_ENABLED && DEPLOYMENT_READINESS_FIXTURE ? (
        <section className="cm-card" aria-label="Deployment readiness" data-testid="cm-deployment-readiness">
          <div className="cm-row">
            <h2 className="cm-card-title">Deployment readiness</h2>
            <span className="cm-demo-tag">DEMO</span>
            <span className="cm-chip cm-chip-ok">{DEPLOYMENT_READINESS_FIXTURE.verification.every((v) => v.result === "PASS") ? "ALL CHECKS PASS" : "HAS FAILURES"}</span>
          </div>
          <p className="cm-card-sub">
            The deployable-bundle manifest + the non-live rehearsal (W1-019). The bundle assembles and verifies
            cleanly — this is the &quot;you could deploy this tomorrow (upon operator authorization)&quot; evidence.
            The rehearsal deploys NOTHING, connects NOTHING, reads NO credential.{" "}
            <span className="cm-env-note">Fixture mirrors artifact at commit {DEPLOYMENT_READINESS_FIXTURE.lineage.commit.slice(0, 12)}.</span>
          </p>
          <div className="cm-journey-item">
            <span className="cm-journey-name">Bundle identity</span>
            <span className="cm-journey-summary">lineage commit {DEPLOYMENT_READINESS_FIXTURE.lineage.commit.slice(0, 12)} · toolchain {DEPLOYMENT_READINESS_FIXTURE.lineage.toolchain} · generated {DEPLOYMENT_READINESS_FIXTURE.generatedAt}</span>
            <span className="cm-journey-summary">inventory: {DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.entryCount} entries · digest {DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.inventoryDigest} · classes {DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.fileClasses.join(", ")}</span>
          </div>
          <h3 className="cm-card-title" style={{ marginTop: 10 }}>Capability coverage ({DEPLOYMENT_READINESS_FIXTURE.capabilities.length})</h3>
          <div className="cm-stack" data-testid="cm-deployment-capabilities">
            {DEPLOYMENT_READINESS_FIXTURE.capabilities.map((cap) => (
              <div key={cap.kind} className="cm-journey-item">
                <code style={{ fontSize: 12.5 }}>{cap.kind}</code>
                <span className="cm-journey-summary">{cap.adapter}</span>
                <span className="cm-chip cm-chip-ok" data-testid="cm-capability-replaceable">{cap.replaceable ? "replaceable" : "NOT replaceable"}</span>
              </div>
            ))}
          </div>
          <h3 className="cm-card-title" style={{ marginTop: 10 }}>Configuration surface ({DEPLOYMENT_READINESS_FIXTURE.configSurface.length} keys)</h3>
          <div className="cm-stack" data-testid="cm-deployment-config-surface">
            {DEPLOYMENT_READINESS_FIXTURE.configSurface.map((entry) => (
              <div key={entry.key} className="cm-journey-item">
                <code style={{ fontSize: 12.5 }}>{entry.key}</code>
                <span className={entry.classification === "live-gated" ? "cm-chip cm-chip-warn" : entry.classification === "demo" ? "cm-chip cm-chip-unknown" : "cm-chip cm-chip-muted"} data-testid="cm-config-classification">{entry.classification}</span>
                <span className="cm-journey-summary">{entry.notes}</span>
              </div>
            ))}
          </div>
          <h3 className="cm-card-title" style={{ marginTop: 10 }}>Rehearsal verification ({DEPLOYMENT_READINESS_FIXTURE.verification.length} checks)</h3>
          <div className="cm-stack" data-testid="cm-deployment-verification">
            {DEPLOYMENT_READINESS_FIXTURE.verification.map((v) => (
              <div key={v.check} className="cm-journey-item">
                <span className="cm-journey-name">{v.check}</span>
                <span className={v.result === "PASS" ? "cm-chip cm-chip-ok" : "cm-chip cm-chip-err"}>{v.result}</span>
              </div>
            ))}
          </div>
          {/* W2-022: the DIST IDENTITY row — the dist digest + the mode chip */}
          {DEPLOYMENT_READINESS_FIXTURE.dist ? (
            <div className="cm-journey-item" data-testid="cm-deployment-dist-identity">
              <span className="cm-journey-name">Dist identity</span>
              <span className="cm-journey-summary">
                mode {DEPLOYMENT_READINESS_FIXTURE.dist.mode}
                {DEPLOYMENT_READINESS_FIXTURE.dist.digest ? ` · digest ${DEPLOYMENT_READINESS_FIXTURE.dist.digest}` : ""}
                {DEPLOYMENT_READINESS_FIXTURE.dist.fileCount !== undefined ? ` · ${DEPLOYMENT_READINESS_FIXTURE.dist.fileCount} files` : ""}
                {" · provenance " + DEPLOYMENT_READINESS_FIXTURE.dist.provenance.source}
              </span>
              <span className={
                DEPLOYMENT_READINESS_FIXTURE.dist.mode === "ci-evidence-manifest" ? "cm-chip cm-chip-ok"
                : DEPLOYMENT_READINESS_FIXTURE.dist.mode === "dist-root" ? "cm-chip cm-chip-ok"
                : DEPLOYMENT_READINESS_FIXTURE.dist.mode === "source-only" ? "cm-chip cm-chip-warn"
                : "cm-chip cm-chip-unknown"
              } data-testid="cm-dist-mode-chip">
                {DEPLOYMENT_READINESS_FIXTURE.dist.provenance.source === "committed-fixture" ? "FIXTURE"
                : DEPLOYMENT_READINESS_FIXTURE.dist.mode === "ci-evidence-manifest" ? "CI-EVIDENCE"
                : DEPLOYMENT_READINESS_FIXTURE.dist.mode === "dist-root" ? "DIST-ROOT"
                : "SOURCE-ONLY"}
              </span>
            </div>
          ) : (
            <div className="cm-journey-item" data-testid="cm-deployment-dist-identity">
              <span className="cm-journey-name">Dist identity</span>
              <span className="cm-journey-summary">dist section absent — the rehearsal ran in source-only mode (no dist manifest provided)</span>
              <span className="cm-chip cm-chip-warn" data-testid="cm-dist-mode-chip">SOURCE-ONLY</span>
            </div>
          )}
          {/* W2-022: the END-TO-END HASH CHAIN row — source → dist → bundle */}
          <div className="cm-journey-item" data-testid="cm-deployment-hash-chain">
            <span className="cm-journey-name">End-to-end hash chain</span>
            <span className="cm-journey-summary">
              source {DEPLOYMENT_READINESS_FIXTURE.bundle.inventorySummary.inventoryDigest}
              {" → "}
              {DEPLOYMENT_READINESS_FIXTURE.dist?.digest ?? "(dist absent)"}
              {" → "}
              bundle verification {DEPLOYMENT_READINESS_FIXTURE.verification.filter((v) => v.result === "PASS").length}/{DEPLOYMENT_READINESS_FIXTURE.verification.length} checks PASS
            </span>
            <span className={
              DEPLOYMENT_READINESS_FIXTURE.dist
                ? DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "dist-manifest-completeness")?.result === "PASS"
                  && DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "dist-digest-deterministic")?.result === "PASS"
                  && DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "source-dist-cross-check")?.result === "PASS"
                  ? "cm-chip cm-chip-ok" : "cm-chip cm-chip-err"
                : "cm-chip cm-chip-warn"
            } data-testid="cm-hash-chain-chip">
              {DEPLOYMENT_READINESS_FIXTURE.dist
                ? DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "dist-manifest-completeness")?.result === "PASS"
                  && DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "dist-digest-deterministic")?.result === "PASS"
                  && DEPLOYMENT_READINESS_FIXTURE.verification.find((v) => v.check === "source-dist-cross-check")?.result === "PASS"
                  ? "CHAIN VERIFIED" : "CHAIN BROKEN"
                : "SOURCE-ONLY (no dist link)"}
            </span>
          </div>
          <h3 className="cm-card-title" style={{ marginTop: 10 }}>Standing gates</h3>
          <ul className="cm-perm-list" data-testid="cm-standing-gates">
            {STANDING_GATES.map((g) => (
              <li key={g.gate}><strong>{g.gate}</strong>: {g.status}</li>
            ))}
          </ul>
          <p className="cm-env-note" data-testid="cm-non-live-note">{DEPLOYMENT_READINESS_FIXTURE.standingGatesNote}</p>
        </section>
      ) : null}

      <section className="cm-card" aria-label="For feature-module developers">
        <h2 className="cm-card-title">For W2-012 / W3-015 module developers</h2>
        <p className="cm-card-sub">
          Create <code>src/commerce-modules/&lt;moduleId&gt;/module.ts</code> default-exporting{" "}
          <code>defineCommerceModule(&#123;…&#125;)</code> from
          <code> commerce-host/contract/index.js</code>; use a module id with your lane&apos;s
          reserved prefix (buyer-/peer- for W2-012, merchant-/procurement-/physical-/trust- for
          W3-015). The registry discovers it automatically — no host files are edited by feature
          workers. The shared honest-state components live in{" "}
          <code>commerce-host/shared/index.js</code>.
        </p>
      </section>
    </div>
  );
}
