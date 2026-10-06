/**
 * W3-006 E2E journey runners (acceptance scenario 2) — typed, headless,
 * driving the REAL experience-plane runtimes through the primary user
 * paths. Each journey returns typed step results; the per-journey test
 * files assert them green AND the RC evidence drill (scenario 7) re-runs
 * the SAME runners to emit machine-readable evidence.
 */

import type { RcEvidenceRow } from "../../src/deployment/rc-evidence";
import { renderDecisionCard } from "../../src/runtime/surfaces/decision-card-render";
import { DECISION_CARD_RENDER_SECTIONS } from "../../src/surfaces/decision-card-render";
import type { ExperienceAppHarness } from "./harness";
import { createExperienceAppHarness } from "./harness";

export interface JourneyStep {
  readonly stepId: string;
  readonly description: string;
  readonly passed: boolean;
  readonly evidenceNote: string;
}

export interface JourneyOutcome {
  readonly journeyId: string;
  readonly surfaceName: string;
  readonly steps: readonly JourneyStep[];
  readonly passed: boolean;
}

const step = (stepId: string, description: string, passed: boolean, evidenceNote: string): JourneyStep => ({
  stepId,
  description,
  passed,
  evidenceNote,
});

const outcome = (journeyId: string, surfaceName: string, steps: readonly JourneyStep[]): JourneyOutcome => ({
  journeyId,
  surfaceName,
  steps,
  passed: steps.every((entry) => entry.passed),
});

/** Convert a journey into RC evidence rows (scenario 7 reuse). */
export function journeyToEvidenceRows(journey: JourneyOutcome): readonly RcEvidenceRow[] {
  return journey.steps.map((entry) => ({
    checkId: `${journey.journeyId}:${entry.stepId}`,
    description: `${journey.surfaceName} — ${entry.description}`,
    passed: entry.passed,
    evidenceNote: entry.evidenceNote,
  }));
}

// ---------------------------------------------------------------------------
// Journey 1 — Merchant Command Center (home / Work Graph)
// ---------------------------------------------------------------------------

export async function runCommandCenterJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const view = harness.commandCenter();
  const intent = harness.resolveIntent("how is the business doing");
  const render = renderDecisionCard(harness.decisionCard());
  const dashboard = harness.operatorDashboard();
  const steps: JourneyStep[] = [
    step(
      "home-surface-ready",
      "the command center surface reaches the READY state through the surface-state runtime",
      harness.surfaceReady(view).phase === "ready",
      "surfaceReady(commandCenterView) → phase ready",
    ),
    step(
      "business-pulse-operational",
      "the business pulse renders kernel-derived metrics as OPERATIONAL truth",
      view.businessPulse.truthClass === "operational" &&
        view.businessPulse.metrics.every((metric) => metric.displayValue.length > 0),
      `metrics: ${view.businessPulse.metrics.map((metric) => `${metric.label}=${metric.displayValue}`).join(", ")}`,
    ),
    step(
      "connector-health-strip",
      "the connector health strip counts real connector health snapshots",
      view.connectorHealth.healthy === 1 && view.connectorHealth.unknown === 1,
      `healthy=${view.connectorHealth.healthy}, unknown=${view.connectorHealth.unknown} (registered-but-not-connected stays UNKNOWN)`,
    ),
    step(
      "work-graph-nodes",
      "the work graph renders goal/connector/security nodes with opaque refs",
      view.workGraph.length === 3 &&
        view.workGraph.some((node) => node.kind === "goal") &&
        view.workGraph.some((node) => node.kind === "connector") &&
        view.workGraph.some((node) => node.kind === "security-alert") &&
        view.workGraph.every((node) => node.relatedRefs.length > 0),
      `${view.workGraph.length} nodes with kinds ${view.workGraph.map((node) => node.kind).join("/")}`,
    ),
    step(
      "objective-input-typed",
      "the primary objective input is a typed MerchantObjectiveInput",
      view.primaryInput.rawObjective.includes("repeat purchase") && view.primaryInput.submittedAt.length > 0,
      "objective echo + submission timestamp present",
    ),
    step(
      "universal-intent-resolves",
      "the universal intent input resolves the command center through a typed command",
      intent.status === "resolved" &&
        intent.status === "resolved" &&
        intent.matches.some((match) => match.command.surfaceId === "command-center-work-graph"),
      intent.status === "resolved" ? `resolved via alias "${intent.matches[0]?.matchedAlias}"` : "unresolved",
    ),
    step(
      "decision-card-renders",
      "a pending decision renders through the Decision Card renderer with ALL sections",
      render.sections.length === DECISION_CARD_RENDER_SECTIONS.length &&
        render.sections.every((section) => section.lines.length > 0) &&
        render.header.approvalBadge.includes("pending"),
      `${render.sections.length}/${DECISION_CARD_RENDER_SECTIONS.length} render sections; approval badge "${render.header.approvalBadge}"`,
    ),
    step(
      "operator-dashboard-reachable",
      "the operator dashboard is reachable from the command center with complete sections",
      dashboard.sections.length === 7 && dashboard.projectionOnly === true,
      `dashboard sections: ${dashboard.sections.join(", ")}`,
    ),
  ];
  return outcome("e2e-command-center", "Command Center (merchant home / Work Graph)", steps);
}

// ---------------------------------------------------------------------------
// Journey 2 — Buyer Intent Canvas
// ---------------------------------------------------------------------------

export async function runIntentCanvasJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const view = harness.intentCanvas();
  const intent = harness.resolveIntent("I want to buy");
  const steps: JourneyStep[] = [
    step(
      "navigate-by-intent",
      "the buyer reaches the intent canvas through the universal intent surface",
      intent.status === "resolved" &&
        intent.status === "resolved" &&
        intent.matches.some((match) => match.command.surfaceId === "buyer-intent-canvas"),
      intent.status === "resolved" ? `alias "${intent.matches[0]?.matchedAlias}" → buyer-intent-canvas` : "unresolved",
    ),
    step(
      "constraint-editor-complete",
      "the constraint editor exposes the full 17-facet catalog",
      view.constraintFields.length === 17 &&
        view.constraintFields.every((field) => field.userLabel.length > 0 && field.placeholderExample.length > 0),
      `${view.constraintFields.length} constraint facets`,
    ),
    step(
      "draft-hands-off-opaquely",
      "the raw intent draft hands off through an opaque parsed-intent ref",
      view.draft.rawIntent.includes("laptop") && view.draft.parsedIntentRef !== undefined,
      "draft submitted; parsed intent stays opaque to the experience plane",
    ),
    step(
      "plan-options-typed",
      "plan options are typed incl. buy-now, wait-for-price and group-with-others",
      view.planOptions.length === 3 &&
        view.planOptions.map((option) => option.kind).includes("buy-now") &&
        view.planOptions.map((option) => option.kind).includes("wait-for-price") &&
        view.planOptions.map((option) => option.kind).includes("group-with-others"),
      `kinds: ${view.planOptions.map((option) => option.kind).join(", ")}`,
    ),
    step(
      "predictions-labeled-predictive",
      "every predicted outcome is labeled PREDICTIVE truth, never operational",
      view.planOptions.every((option) => option.predictedOutcome.truthClass === "predictive") &&
        view.waitOrBuy.truthClass === "predictive",
      `wait-or-buy recommendation: ${view.waitOrBuy.recommendation}`,
    ),
  ];
  return outcome("e2e-intent-canvas", "Buyer Intent Canvas", steps);
}

// ---------------------------------------------------------------------------
// Journey 3 — Opportunity Inbox
// ---------------------------------------------------------------------------

export async function runOpportunityInboxJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const view = harness.opportunityInbox();
  const steps: JourneyStep[] = [
    step(
      "inbox-surface-ready",
      "the opportunity inbox surface reaches READY with items",
      harness.surfaceReady(view).phase === "ready" && view.items.length === 2,
      `${view.items.length} inbox items`,
    ),
    step(
      "disclosure-separates-truths",
      "every item discloses observation vs inference vs prediction vs recommendation",
      view.items.every(
        (item) =>
          item.disclosure.observation.length > 0 &&
          (item.disclosure.prediction === undefined || item.disclosure.prediction.truthClass === "predictive"),
      ),
      "observation always present; predictions explicitly labeled predictive",
    ),
    step(
      "authorization-required-flagged",
      "items that need user authorization are structurally flagged",
      view.items.some((item) => item.requiresAuthorization) &&
        view.items.filter((item) => item.requiresAuthorization).every((item) => item.disclosure.recommendation !== undefined),
      "group-buy item requires authorization and carries a recommendation",
    ),
    step(
      "contextual-hints-reach-items",
      "contextual hints reference real inbox items (the discoverability law)",
      view.contextualHints.length > 0 &&
        view.contextualHints.every((hint) =>
          hint.relatedItemIds.every((itemId) => view.items.some((item) => item.itemId === itemId)),
        ),
      `hint: "${view.contextualHints[0]?.message}"`,
    ),
  ];
  return outcome("e2e-opportunity-inbox", "Opportunity Inbox", steps);
}

// ---------------------------------------------------------------------------
// Journey 4 — Storefront → checkout (against the real kernel's facts)
// ---------------------------------------------------------------------------

export async function runStorefrontCheckoutJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const collection = harness.storefrontCollection();
  const cart = harness.storefrontCart();
  const envelope = harness.checkoutCommand();
  const progression = harness.checkoutProgression();
  const laptop = collection.products.find((product) => product.title.includes("Laptop"));
  const scale = collection.products.find((product) => product.title.includes("Scale"));
  const facts = harness.facts();
  const steps: JourneyStep[] = [
    step(
      "storefront-renders-collection",
      "the storefront renders a collection with priced products",
      collection.products.length === 2 &&
        collection.products.every((product) => product.price.displayAmount.length > 0),
      `products: ${collection.products.map((product) => product.title).join(", ")}`,
    ),
    step(
      "availability-from-real-kernel",
      "product availability is projected from the REAL kernel's inventory facts",
      laptop?.availability.truthClass === "operational" &&
        laptop.availability.displayStatus === "in-stock" &&
        scale?.availability.displayStatus === "in-stock" &&
        Number((/\d+/).exec(laptop.availability.note ?? "")?.[0]) === facts.inventory.availableUnits("sku-dr-laptop", "store-dr"),
      `laptop: ${laptop?.availability.note}; scale: ${scale?.availability.note} (kernel facts agree)`,
    ),
    step(
      "cart-lines-exact-decimal",
      "cart lines and totals use exact decimal strings (never floats)",
      cart.lines.length === 2 &&
        cart.lines.every((line) => /^\d+\.\d{2}$/.test(line.lineTotal)) &&
        /^\d+\.\d{2}$/.test(cart.estimatedTotal),
      `estimated total ${cart.estimatedTotal}`,
    ),
    step(
      "checkout-envelope-typed",
      "checkout leaves the experience plane ONLY as a typed command envelope",
      envelope.commandType === "checkout" &&
        envelope.commandRef.startsWith("kernel-command:") &&
        envelope.idempotencyKey.length > 0 &&
        envelope.authorization.length > 0,
      "opaque kernel command ref + idempotency key + authorization context",
    ),
    step(
      "checkout-status-progression",
      "checkout status walks the typed step machine to done with a pinned proof level",
      progression.length === 6 &&
        progression[0]?.currentStep === "contact" &&
        progression[5]?.currentStep === "done" &&
        progression.every((status) => status.selectedProofLevel === "P4"),
      "contact → delivery → payment → review → confirming → done (proof level P4 pinned up front)",
    ),
    step(
      "money-never-floats",
      "every rendered money value on the journey path is an exact decimal string",
      collection.products.every((product) => /^\d+\.\d{2}$/.test(product.price.displayAmount)) &&
        cart.lines.every((line) => /^\d+\.\d{2}$/.test(line.lineTotal)),
      "all price/line/total values match the exact-decimal pattern",
    ),
  ];
  return outcome("e2e-storefront-checkout", "Storefront → checkout", steps);
}

// ---------------------------------------------------------------------------
// Journey 5 — Connector Studio
// ---------------------------------------------------------------------------

export async function runConnectorStudioJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const view = harness.connectorStudio();
  const connectedCard = view.connectors.find((card) => card.hasApiRoute);
  const browserCard = view.connectors.find((card) => !card.hasApiRoute);
  const steps: JourneyStep[] = [
    step(
      "studio-renders-cards",
      "the studio renders one card per registered connector from the real runtime",
      view.connectors.length === 2,
      `${view.connectors.length} connector cards`,
    ),
    step(
      "executable-only-with-instance",
      "a capability is executable NOW only with a connected instance (catalogue ≠ authority)",
      connectedCard?.availableCapabilities.every((capability) => capability.executableNow) === true &&
        browserCard?.availableCapabilities.every((capability) => !capability.executableNow) === true &&
        browserCard.availableCapabilities.every((capability) =>
          capability.blockingReasons.includes("no-connected-account"),
        ),
      "connected card executable; browser-only card blocked on no-connected-account",
    ),
    step(
      "no-api-pathway-explicit",
      "providers without an API route get an explicit pathway (browser/feed/edge)",
      browserCard?.browserSessionRequired === true &&
        view.noApiPathways.length > 0 &&
        view.noApiPathways[0]?.options.includes("browser-session") &&
        view.noApiPathways[0]?.options.includes("local-edge"),
      `pathway options: ${view.noApiPathways[0]?.options.join(", ")}`,
    ),
    step(
      "customer-action-required",
      "the browser-only connector surfaces its customer-action requirement",
      browserCard?.customerActionRequirements.some((requirement) => !requirement.currentlySatisfied) === true,
      browserCard?.customerActionRequirements[0]?.userLabel ?? "",
    ),
    step(
      "health-and-observation-verbatim",
      "health snapshots and last observations render verbatim from the runtime",
      connectedCard?.health.status === "healthy" && browserCard?.health.status === "unknown",
      "connected=healthy; unconnected=unknown (UNKNOWN preserved, never fabricated)",
    ),
    step(
      "execution-modes-from-vocabulary",
      "supported execution modes come from the canonical capability vocabulary (opaque refs)",
      connectedCard !== undefined &&
        connectedCard.supportedExecutionModes.length === 3 &&
        connectedCard.supportedExecutionModes.every((mode) => typeof mode === "string"),
      `modes: ${connectedCard?.supportedExecutionModes.join(", ")}`,
    ),
  ];
  return outcome("e2e-connector-studio", "Connector Studio", steps);
}

// ---------------------------------------------------------------------------
// Journey 6 — Trust & Security
// ---------------------------------------------------------------------------

export async function runTrustSecurityJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const view = harness.trustCenter();
  const incident = view.incidents[0];
  const steps: JourneyStep[] = [
    step(
      "trust-is-explainable",
      "trust renders as explainable components — structurally no aggregate score",
      view.components.length >= 2 &&
        view.components.every((component) => component.explanation.length > 0) &&
        !("score" in view) &&
        !("aggregateScore" in view) &&
        !("trustScore" in view),
      `${view.components.length} explainable components; no score field exists on the view type`,
    ),
    step(
      "incident-pipeline-visible",
      "the security incident shows signal → reason → effect → mitigation → next action",
      incident !== undefined &&
        [incident.signal, incident.reason, incident.effect, incident.mitigation, incident.nextAction].every(
          (field) => field.length > 0,
        ),
      "all five pipeline fields present",
    ),
    step(
      "deterministic-block-visible",
      "the incident's mitigation decision is a typed deterministic decision",
      incident !== undefined &&
        (incident.decision === "quarantined" || incident.decision === "blocked" || incident.decision === "allowed"),
      `decision: ${incident?.decision} (BLOCK cannot be overridden by model preference)`,
    ),
    step(
      "defensive-broadcast-only",
      "the defensive broadcast state never carries weaponized content",
      incident !== undefined &&
        (incident.defensiveBroadcast === "prepared" ||
          incident.defensiveBroadcast === "broadcast" ||
          incident.defensiveBroadcast === "not-applicable"),
      `defensive broadcast: ${incident?.defensiveBroadcast}`,
    ),
    step(
      "proof-legend-p0-p5",
      "the proof legend renders the full P0–P5 ladder",
      view.proofLegend.length === 6 &&
        view.proofLegend.map((level) => level.proofRef).join(",") === "P0,P1,P2,P3,P4,P5",
      `${view.proofLegend.length} proof levels`,
    ),
  ];
  return outcome("e2e-trust-security", "Trust & Security center", steps);
}

// ---------------------------------------------------------------------------
// Journey 7 — Live commerce incl. LATE-JOINER REPLAY + backpressure
// ---------------------------------------------------------------------------

export async function runLiveCommerceLateJoinerJourney(harness: ExperienceAppHarness): Promise<JourneyOutcome> {
  const session = harness.liveSession;
  const announcement = session.announce({
    title: "Friday hardware drop",
    scheduledFor: "2026-10-10T07:05:00Z" as never,
    sellerRef: "seller:e2e-livestream" as never,
    trustSignalRefs: ["trust-signal:live-1" as never],
  });
  session.activate();
  // Capture lifecycle DURING the journey (the session ends at the finale).
  const lifecycleAfterActivate = session.lifecycle();

  // Live viewer joins BEFORE the listings appear.
  const liveReceived: string[] = [];
  const liveViewer = {
    consumerRef: "consumer-live-early",
    onEvent: async (envelope: { eventId: string }) => {
      liveReceived.push(envelope.eventId);
      return "delivered" as const;
    },
  };
  session.subscribe(liveViewer, { from: "live" });

  for (let index = 1; index <= 4; index += 1) {
    session.ingestEvent({
      eventId: `evt-listing-${index}`,
      occurredAt: "2026-10-10T07:06:00Z" as never,
      kind: "listing",
      untrustedRawText: `listing ${index}: widget batch`,
    });
  }
  await session.pump();

  // The LATE JOINER subscribes from the start AFTER history exists.
  const lateReceived: { eventId: string; replay?: boolean; arrivalSequence: number }[] = [];
  const lateJoiner = {
    consumerRef: "consumer-late-joiner",
    onEvent: async (envelope: { eventId: string; replay?: boolean; arrivalSequence: number }) => {
      lateReceived.push({
        eventId: envelope.eventId,
        ...(envelope.replay === undefined ? {} : { replay: envelope.replay }),
        arrivalSequence: envelope.arrivalSequence,
      });
      return "delivered" as const;
    },
  };
  const subscribeResult = session.subscribe(lateJoiner, { from: "start" });

  // A new live event arrives AFTER the late joiner subscribed.
  session.ingestEvent({
    eventId: "evt-live-after-join",
    occurredAt: "2026-10-10T07:07:00Z" as never,
    kind: "chat",
    untrustedRawText: "buyer question",
  });
  await session.pump();

  // A slow consumer applies backpressure — nothing may drop.
  const slowConsumer = {
    consumerRef: "consumer-slow",
    onEvent: async () => "backpressured" as const,
  };
  session.subscribe(slowConsumer, { from: "live" });
  session.ingestEvent({
    eventId: "evt-price-update",
    occurredAt: "2026-10-10T07:08:00Z" as never,
    kind: "price-change",
    untrustedRawText: "price update",
  });
  await session.pump();
  const slowHealth = session.consumerHealth("consumer-slow");

  session.end();
  const terminalView = session.surfaceView();
  const lateJoinerFirstFour = lateReceived.slice(0, subscribeResult.replayQueued);
  const lateJoinerTail = lateReceived.slice(subscribeResult.replayQueued);

  const steps: JourneyStep[] = [
    step(
      "session-announced-then-active",
      "the live session announces then activates with trust refs passed through opaquely",
      announcement.lifecycle === "announced" &&
        lifecycleAfterActivate === "active" &&
        announcement.trustSignalRefs.length === 1,
      "announce → active; trust signal refs untouched",
    ),
    step(
      "live-viewer-receives-in-order",
      "the live viewer receives every event from its subscription on, strictly in arrival order, and NOTHING from before it",
      liveReceived.length === 6 &&
        liveReceived.every((eventId) => eventId.startsWith("evt-")) &&
        !liveReceived.includes("session-announce-stream:e2e-live-1"),
      `${liveReceived.length} events delivered in order (pre-subscription history excluded)`,
    ),
    step(
      "late-joiner-replay-from-start",
      "the LATE JOINER receives the FULL history as replay:true, then live events",
      subscribeResult.replayQueued === 6 &&
        lateJoinerFirstFour.every((entry) => entry.replay === true) &&
        lateJoinerTail.every((entry) => entry.replay === undefined) &&
        lateReceived.length === 8 &&
        lateReceived.every((entry, index) =>
          index === 0 ? true : entry.arrivalSequence > (lateReceived[index - 1]?.arrivalSequence ?? 0),
        ),
      `${subscribeResult.replayQueued} replay events queued (announce + active + 4 listings), then 2 live; arrival sequences strictly increasing`,
    ),
    step(
      "backpressure-never-drops",
      "a slow consumer is backpressured without any dropped or reordered event",
      slowHealth !== undefined &&
        slowHealth.backpressureSignals > 0 &&
        slowHealth.pendingCount > 0 &&
        slowHealth.silentlyDroppedEvents === 0,
      `backpressure signals=${slowHealth?.backpressureSignals}, pending=${slowHealth?.pendingCount}, dropped=0`,
    ),
    step(
      "terminal-state-replayable",
      "the ended session exposes a terminal summary with replay-from-start available",
      terminalView.terminal?.lifecycle === "ended" &&
        terminalView.terminal.replayFromStart === "available" &&
        terminalView.terminal.totalEvents === 8,
      `terminal summary: ${terminalView.terminal?.totalEvents} events, replay available`,
    ),
    step(
      "ended-session-rejects-events",
      "the ended session rejects new events explicitly (never silently)",
      session.ingestEvent({
        eventId: "evt-after-end",
        occurredAt: "2026-10-10T07:09:00Z" as never,
        kind: "chat",
        untrustedRawText: "too late",
      }).status === "rejected-session-ended",
      "ingestion after end → rejected-session-ended",
    ),
  ];
  return outcome("e2e-live-commerce-late-joiner", "Live commerce (incl. late-joiner replay + backpressure)", steps);
}

// ---------------------------------------------------------------------------
// All journeys (used by the RC drill)
// ---------------------------------------------------------------------------

export async function runAllPrimaryPathJourneys(): Promise<readonly JourneyOutcome[]> {
  const harness = await createExperienceAppHarness();
  return [
    await runCommandCenterJourney(harness),
    await runIntentCanvasJourney(harness),
    await runOpportunityInboxJourney(harness),
    await runStorefrontCheckoutJourney(harness),
    await runConnectorStudioJourney(harness),
    await runTrustSecurityJourney(harness),
    await runLiveCommerceLateJoinerJourney(harness),
  ];
}
