/**
 * W3-006 browser E2E harness — the composition root of the EXPERIENCE PLANE
 * for the headless journey suite (acceptance scenario 2).
 *
 * Composes the REAL product runtimes only: the real Commerce Kernel lane
 * (cross-lane rig), the real Connector Runtime (+ clearly-marked TEST
 * DOUBLE adapters modeling external providers), the real live-session
 * runtime, the real universal-intent resolver, the real Decision Card
 * renderer, the real surface-state constructors, the real observability
 * projector and the real operator dashboard. Journeys drive THIS harness
 * through typed user actions and assert on the typed UI view contracts —
 * no surface under test is mocked away.
 */

import { createConnectorRuntime, type ConnectorRuntime } from "../../src/runtime/connector/runtime";
import { createCredentialVault } from "../../src/runtime/connector/vault";
import { createConnectorTelemetry, type ConnectorTelemetry } from "../../src/runtime/connector/telemetry";
import { createLiveSessionRuntime, type LiveSessionRuntime } from "../../src/runtime/surfaces/live-session";
import {
  createObservabilityProjector,
  type ObservabilityProjector,
} from "../../src/runtime/deployment/observability";
import type { ObservabilitySnapshot, OperatorDashboardView } from "../../src/deployment/observability";
import type { DeploymentPlaneStatus } from "../../src/deployment/manifest";
import { buildConnectorHealthSurface } from "../../src/runtime/surfaces/connector-health";
import { renderDecisionCard } from "../../src/runtime/surfaces/decision-card-render";
import { resolveUniversalIntent } from "../../src/runtime/surfaces/universal-intent";
import { surfaceReady, surfaceStateManifest } from "../../src/runtime/surfaces/surface-state";
import { runbookStatusesOf } from "../../src/runtime/deployment/dr-objectives";
import { PROOF_LEVELS } from "../../src/common/evidence";
import { INTENT_CONSTRAINT_FIELDS } from "../../src/surfaces/intent-canvas";
import type { CommandCenterView } from "../../src/surfaces/command-center";
import type { IntentCanvasView } from "../../src/surfaces/intent-canvas";
import type { OpportunityInboxView } from "../../src/surfaces/opportunity-inbox";
import type { ConnectorStudioView } from "../../src/surfaces/connector-studio";
import type { TrustCenterView } from "../../src/surfaces/trust-security";
import type { DecisionCard } from "../../src/surfaces/decision-card";
import type {
  CheckoutStatusView,
  CommerceCommandEnvelope,
  StorefrontCartView,
  StorefrontCollectionView,
} from "../../src/surfaces/storefront";
import type { UniversalIntentResolutionResult } from "../../src/navigation/universal-intent";
import type { SurfaceState } from "../../src/surfaces/surface-state";
import {
  asConnectorInstanceId,
  asIdempotencyKey,
  asPrincipalRef,
  asTransactionProofRef,
  asUtcTimestamp,
  asExecutionModeRef,
  asCapabilityDefinitionId,
} from "../../src/runtime/ids";
import { CommerceKernelLane } from "../fixtures/commerce/kernel-rig";
import { seedDrWorkload } from "../fixtures/commerce/dr-kernel-rig";
import { TestDoubleConnectorAdapter, doubleDescriptor, fixedUtcClock } from "../doubles";

export const E2E_CLOCK_BASE = "2026-10-10T07:00:00Z";
const CLOCK = fixedUtcClock(E2E_CLOCK_BASE);
const OPERATOR = asPrincipalRef("operator:e2e");
const BUYER = asPrincipalRef("buyer:e2e");

export interface ExperienceAppHarness {
  readonly lane: CommerceKernelLane;
  readonly connectors: ConnectorRuntime;
  readonly telemetry: ConnectorTelemetry;
  readonly liveSession: LiveSessionRuntime;
  readonly projector: ObservabilityProjector;
  readonly connectedConnectorId: string;
  readonly registeredConnectorId: string;
  readonly operator: typeof OPERATOR;
  readonly buyer: typeof BUYER;

  surfaceReady<TView>(data: TView): SurfaceState<TView>;
  surfaceManifest(surfaceId: string): ReturnType<typeof surfaceStateManifest>;
  commandCenter(): CommandCenterView;
  intentCanvas(): IntentCanvasView;
  opportunityInbox(): OpportunityInboxView;
  storefrontCollection(): StorefrontCollectionView;
  storefrontCart(): StorefrontCartView;
  checkoutCommand(): CommerceCommandEnvelope;
  checkoutProgression(): readonly CheckoutStatusView[];
  connectorStudio(): ConnectorStudioView;
  trustCenter(): TrustCenterView;
  decisionCard(): DecisionCard;
  decisionCardRender(): ReturnType<typeof renderDecisionCard>;
  observabilitySnapshot(plane?: DeploymentPlaneStatus): ObservabilitySnapshot;
  operatorDashboard(plane?: DeploymentPlaneStatus): OperatorDashboardView;
  resolveIntent(utterance: string): UniversalIntentResolutionResult;
  facts(): ReturnType<CommerceKernelLane["facts"]>;
}

const NOT_BOOTED_PLANE: DeploymentPlaneStatus = {
  planId: "plan:unicom-node-server-v1",
  targetKind: "node-server",
  services: [],
  allReady: false,
};

export async function createExperienceAppHarness(): Promise<ExperienceAppHarness> {
  const lane = await seedDrWorkload();
  const vault = createCredentialVault({ clock: CLOCK });
  const connectors = createConnectorRuntime({ vault, clock: CLOCK });
  const telemetry = createConnectorTelemetry({ clock: CLOCK });

  // External providers modeled by clearly-marked TEST DOUBLES (the runtime
  // under test is real): one REST provider with an API route, one
  // browser-only provider WITHOUT an API route (the no-API pathway).
  const apiProvider = new TestDoubleConnectorAdapter(doubleDescriptor("e2e-rest-provider", "rest"));
  const noApiProvider = new TestDoubleConnectorAdapter(doubleDescriptor("e2e-browser-provider", "browser"));
  const connectedConnector = connectors.register(apiProvider);
  const registeredConnector = connectors.register(noApiProvider);
  const connectedConnectorId = connectedConnector.connectorId;
  const registeredConnectorId = registeredConnector.connectorId;
  await connectors.connect({
    connectorId: connectedConnectorId,
    accountRef: "account-e2e",
    credential: {
      kind: "api-secret",
      material: "e2e-journey-material",
      forAdapterId: "e2e-rest-provider",
      forAccountRef: "account-e2e",
    },
    grantedPermissions: ["orders.read", "listings.write"],
    credentialScope: "orders.read listings.write",
  });
  const connectedObservation = await connectors.observe(connectedConnectorId);
  // The browser-only connector stays UNOBSERVED on purpose: an unconnected
  // connector is UNKNOWN, never healthy (the studio + observability
  // journeys assert exactly that).

  const liveSession = createLiveSessionRuntime({
    streamId: "stream:e2e-live-1" as never,
    clock: CLOCK,
  });
  const projector = createObservabilityProjector({ clock: CLOCK });

  const harness: ExperienceAppHarness = {
    lane,
    connectors,
    telemetry,
    liveSession,
    projector,
    connectedConnectorId,
    registeredConnectorId,
    operator: OPERATOR,
    buyer: BUYER,

    surfaceReady: (data) => surfaceReady(data),
    surfaceManifest: (surfaceId) => surfaceStateManifest(surfaceId as never),
    facts: () => lane.facts(),
    resolveIntent: (utterance) =>
      resolveUniversalIntent({
        utteranceText: utterance,
        submittedAt: asUtcTimestamp(CLOCK()),
        submittedBy: BUYER,
      }),

    commandCenter: () => {
      const facts = lane.facts();
      const health = connectors.healthReport();
      const connectedHealth = health.find((report) => report.connectorId === connectedConnectorId);
      return {
        businessPulse: {
          truthClass: "operational",
          metrics: [
            { label: "Laptop units available", displayValue: String(facts.inventory.availableUnits("sku-dr-laptop", "store-dr") ?? 0) },
            { label: "Scale units available", displayValue: String(facts.inventory.availableUnits("sku-dr-scale", "store-dr") ?? 0) },
          ],
          asOf: asUtcTimestamp(CLOCK()),
        },
        connectorHealth: {
          truthClass: "operational",
          healthy: health.filter((report) => report.health.status === "healthy").length,
          needsAttention: health.filter((report) =>
            report.health.status === "degraded" || report.health.status === "down" || report.health.status === "customer-action-required",
          ).length,
          unknown: health.filter((report) => report.health.status === "unknown").length,
          openCustomerActions: 0,
          asOf: asUtcTimestamp(CLOCK()),
        },
        workGraph: [
          {
            nodeId: "node-goal-repeat-purchase",
            kind: "goal",
            title: "Grow repeat purchase 15% this quarter",
            status: "planning",
            relatedRefs: ["goal:e2e-1"],
            evidence: [],
            lastUpdatedAt: asUtcTimestamp(CLOCK()),
          },
          {
            nodeId: "node-connector-rest",
            kind: "connector",
            title: "REST provider connector",
            status: connectedHealth?.health.status === "healthy" ? "executing" : "needs-attention",
            relatedRefs: [connectedConnectorId],
            evidence: connectedHealth?.health.evidence ?? [],
            lastUpdatedAt: asUtcTimestamp(CLOCK()),
          },
          {
            nodeId: "node-security-review-ring",
            kind: "security-alert",
            title: "Possible review ring detected",
            status: "needs-attention",
            relatedRefs: ["security-event:e2e-1"],
            evidence: [],
            lastUpdatedAt: asUtcTimestamp(CLOCK()),
          },
        ],
        activeGoals: ["goal:e2e-1" as never],
        pendingDecisions: ["decision:e2e-1" as never],
        detectedOpportunities: ["opportunity:e2e-groupbuy" as never],
        runningSimulations: ["strategy:e2e-sim" as never],
        experiments: ["experiment:e2e-1" as never],
        securityAlerts: ["security-event:e2e-1" as never],
        activeTasks: ["task:e2e-1" as never],
        mainAgent: "agent-principal:e2e-main" as never,
        primaryInput: {
          rawObjective: "Grow repeat purchase 15% this quarter without increasing ad spend",
          submittedAt: asUtcTimestamp(CLOCK()),
          contextHints: ["connector: e2e-rest-provider"],
        },
      };
    },

    intentCanvas: () => ({
      draft: {
        draftId: "draft:e2e-laptop",
        rawIntent: "I need a laptop for civil engineering work, under $1,500, available by Monday, with strong warranty support",
        constraintHints: ["deadline", "max-total-cost", "min-quality", "recourse-requirements"],
        submittedAt: asUtcTimestamp(CLOCK()),
        parsedIntentRef: "buyer-intent:e2e-laptop" as never,
      },
      constraintFields: INTENT_CONSTRAINT_FIELDS,
      planOptions: [
        {
          optionId: "option-buy-now",
          userLabel: "Buy now from verified seller",
          summary: "In stock at a verified seller; meets deadline with margin",
          kind: "buy-now",
          strategyRef: "strategy:e2e-buy-now" as never,
          predictedOutcome: {
            truthClass: "predictive",
            recommendation: "buy-now",
            reasoningSummary: "Price stable for 14 days; deadline risk low",
            evidence: [],
          },
        },
        {
          optionId: "option-wait",
          userLabel: "Wait for a likely price drop",
          summary: "Model refresh expected in 3 weeks; historical drop ~8%",
          kind: "wait-for-price",
          strategyRef: "strategy:e2e-wait" as never,
          predictedOutcome: {
            truthClass: "predictive",
            recommendation: "wait",
            reasoningSummary: "Expected saving 8%, deadline risk medium",
            expectedSavingNote: "~8% expected",
            deadlineRiskNote: "arrival may slip past Monday",
            evidence: [],
          },
        },
        {
          optionId: "option-group",
          userLabel: "Team up with other buyers",
          summary: "3 other buyers with the same intent this week",
          kind: "group-with-others",
          strategyRef: "strategy:e2e-group" as never,
          predictedOutcome: {
            truthClass: "predictive",
            recommendation: "no-clear-answer",
            reasoningSummary: "Group price depends on merchant terms; needs authorization",
            evidence: [],
          },
        },
      ],
      waitOrBuy: {
        truthClass: "predictive",
        recommendation: "buy-now",
        reasoningSummary: "Deadline constraint dominates the expected saving",
        evidence: [],
      },
    }),

    opportunityInbox: () => ({
      viewer: BUYER,
      items: [
        {
          itemId: "opp-item-resale",
          opportunityRef: "opportunity:e2e-resale" as never,
          category: "resale",
          title: "Your unused laptop stand resells at ~$40",
          summary: "3 similar stands sold locally this week",
          disclosure: {
            observation: "You own a laptop stand unused for 90 days",
            inference: "Similar stands sell in ~6 days locally",
            prediction: {
              summary: "Expected resale value ~$40",
              truthClass: "predictive",
              confidenceNote: "based on 12 local sales",
            },
            recommendation: "List it for resale",
          },
          status: "new",
          estimatedValueNote: "~$40",
          requiresAuthorization: false,
          evidence: [],
          surfacedAt: asUtcTimestamp(CLOCK()),
        },
        {
          itemId: "opp-item-groupbuy",
          opportunityRef: "opportunity:e2e-groupbuy" as never,
          category: "group-deal",
          title: "Team up with 3 buyers for the same ladder",
          summary: "A merchant would create a group deal at −12% for 4 buyers",
          disclosure: {
            observation: "3 other buyers expressed the same intent this week",
            recommendation: "Authorize the group-buy proposal",
          },
          status: "new",
          requiresAuthorization: true,
          evidence: [],
          surfacedAt: asUtcTimestamp(CLOCK()),
        },
      ],
      categoryFilters: ["resale", "group-deal", "price-timing"],
      contextualHints: [
        {
          hintId: "hint-ladder-groupbuy",
          message: "23 shoppers want this SKU — create a group-buy?",
          relatedItemIds: ["opp-item-groupbuy"],
        },
      ],
    }),

    storefrontCollection: () => {
      const facts = lane.facts();
      const availabilityOf = (
        skuId: string,
      ): { truthClass: "operational"; displayStatus: "in-stock" | "low-stock" | "out-of-stock" | "unknown"; note: string } => {
        const units = facts.inventory.availableUnits(skuId, "store-dr");
        if (units === undefined) return { truthClass: "operational", displayStatus: "unknown", note: "no inventory record yet" };
        if (units === 0) return { truthClass: "operational", displayStatus: "out-of-stock", note: "system count is zero" };
        if (units <= 5) return { truthClass: "operational", displayStatus: "low-stock", note: `${units} units left` };
        return { truthClass: "operational", displayStatus: "in-stock", note: `${units} units available` };
      };
      return {
        catalogRef: "catalog:e2e-1" as never,
        title: "Site equipment",
        products: [
          {
            productRef: "product:e2e-laptop" as never,
            title: "Field Laptop 15\"",
            mediaArtifactRefs: ["artifact:media-laptop-1"],
            price: { displayAmount: "1420.00" as never, currencyCode: "USD" },
            availability: availabilityOf("sku-dr-laptop"),
            variantSummaryNote: "16 GB / 512 GB",
          },
          {
            productRef: "product:e2e-scale" as never,
            title: "Bench Scale",
            mediaArtifactRefs: ["artifact:media-scale-1"],
            price: { displayAmount: "89.50" as never, currencyCode: "USD" },
            availability: availabilityOf("sku-dr-scale"),
          },
        ],
      };
    },

    storefrontCart: () => ({
      cartRef: "cart:e2e-1" as never,
      lines: [
        { productRef: "product:e2e-laptop" as never, quantity: 1, lineTotal: "1420.00" as never },
        { productRef: "product:e2e-scale" as never, quantity: 2, lineTotal: "179.00" as never },
      ],
      estimatedTotal: "1599.00" as never,
      taxNote: "tax calculated at checkout",
    }),

    checkoutCommand: () => ({
      envelopeId: "envelope:e2e-checkout-1",
      commandType: "checkout",
      commandRef: "kernel-command:e2e-checkout-opaque" as never,
      idempotencyKey: asIdempotencyKey("e2e-checkout-key-1"),
      authorization: "authorization:e2e-checkout" as never,
      issuedAt: asUtcTimestamp(CLOCK()),
    }),

    checkoutProgression: () => {
      const steps: readonly CheckoutStatusView["currentStep"][] = [
        "contact", "delivery", "payment", "review", "confirming", "done",
      ];
      return steps.map((step) => ({
        checkoutRef: "checkout:e2e-1",
        currentStep: step,
        selectedProofLevel: asTransactionProofRef("P4"),
        evidence: [],
      }));
    },

    connectorStudio: () => {
      const health = connectors.healthReport();
      const buildCard = (connectorId: string, providerDisplayName: string, hasApiRoute: boolean, transportIds: string[]) => {
        const registeredConnector = connectors.connector(asConnectorInstanceId(connectorId));
        const descriptor = registeredConnector?.adapter.descriptor;
        const capabilities = (descriptor?.capabilityDefinitions ?? []).map((definition) => {
          const connectedInstance = registeredConnector?.connectedInstances[0];
          const executableNow = registeredConnector?.lifecycle === "connected" && connectedInstance !== undefined;
          return {
            capabilityDefinitionId: asCapabilityDefinitionId(definition.capabilityDefinitionId),
            ...(connectedInstance === undefined ? {} : { connectedInstanceRef: connectedInstance.connectedInstanceId as never }),
            executableNow,
            blockingReasons: executableNow ? [] : (["no-connected-account"] as never[]),
            explanation: executableNow
              ? "Connected account with a current observation"
              : "Catalogue presence never implies executable account authority",
          };
        });
        const healthEntry = health.find((report) => report.connectorId === connectorId);
        const observation = connectorId === connectedConnectorId ? connectedObservation.observation : undefined;
        return {
          connectorId: asConnectorInstanceId(connectorId),
          providerRef: (descriptor?.providerImplementations[0]?.providerImplementationId ?? "provider-impl:e2e") as never,
          providerDisplayName,
          hasApiRoute,
          browserSessionRequired: !hasApiRoute,
          availableCapabilities: capabilities,
          connectedScope: {
            grantedScopes: connectorId === connectedConnectorId ? ["orders.read", "listings.write"] : [],
            missingScopes: connectorId === connectedConnectorId ? [] : ["orders.read"],
            commercialTermsStatus: connectorId === connectedConnectorId ? ("accepted" as const) : ("pending" as const),
          },
          health: healthEntry?.health ?? { status: "unknown", lastCheckedAt: asUtcTimestamp(CLOCK()), degradedReasons: [], customerActionNotes: [], evidence: [] },
          lastObservation: {
            observationRef: (observation?.observationId ?? "observation:e2e-pending") as never,
            observedAt: asUtcTimestamp(CLOCK()),
            summary: observation === undefined ? "no observation yet — a connected scope is required first" : "current observation recorded",
          },
          supportedExecutionModes: (descriptor?.capabilityDefinitions[0]?.supportedExecutionModes ?? []).map((mode) => asExecutionModeRef(mode)),
          customerActionRequirements:
            connectorId === connectedConnectorId
              ? []
              : [
                  {
                    actionId: "action-authorize-browser-session",
                    userLabel: "Authorize the browser session",
                    explanation: "This provider has no API route — a controlled browser session with your authorization is required",
                    currentlySatisfied: false,
                  },
                ],
          transports: transportIds as never[],
        };
      };
      return {
        connectors: [
          buildCard(connectedConnectorId, "REST provider (configured label)", true, ["rest"]),
          buildCard(registeredConnectorId, "Browser-only provider (configured label)", false, ["browser"]),
        ],
        noApiPathways: [
          {
            pathwayId: "pathway-no-api",
            title: "Connect this store even if your POS has no API",
            userFacingNote: "Use a controlled browser session, a file feed, or the local commerce edge",
            options: ["browser-session", "file-feed", "local-edge"],
          },
        ],
        addConnectorSuggestions: ["Add a local commerce edge for your POS"],
      };
    },

    trustCenter: () => ({
      components: [
        {
          componentId: "trust-verified-purchase",
          kind: "verified-purchase",
          label: "Verified purchase",
          explanation: "This seller has 412 verified purchases",
          proofRef: asTransactionProofRef("P1"),
          evidence: [],
        },
        {
          componentId: "trust-provider-signed",
          kind: "provider-signed-state",
          label: "Provider-signed state",
          explanation: "Listing state is signed by the provider",
          proofRef: asTransactionProofRef("P2"),
          evidence: [],
        },
      ],
      trustSignals: ["trust-signal:e2e-1" as never, "trust-signal:e2e-2" as never],
      incidents: [
        {
          incidentId: "incident-e2e-review-ring",
          securityEventRef: "security-event:e2e-1" as never,
          signal: "12 five-star reviews within 4 hours from new accounts",
          reason: "Coordinated review pattern consistent with a review ring",
          effect: "Seller rating temporarily excluded from ranking",
          mitigation: "Accounts quarantined; seller notified with evidence",
          nextAction: "Independent observation window opened for 7 days",
          severity: "high",
          decision: "quarantined",
          pipelineStage: "mitigation",
          evidence: [],
          defensiveBroadcast: "prepared",
          updatedAt: asUtcTimestamp(CLOCK()),
        },
      ],
      proofLegend: PROOF_LEVELS.map((level) => ({
        proofRef: level.id,
        label: level.label,
        description: level.description,
      })),
    }),

    decisionCard: () => ({
      cardId: "card:e2e-pricing",
      decisionRef: "decision:e2e-1" as never,
      objective: {
        statement: "Reduce overstock on bench scales by 18%",
        goalEcho: "Grow repeat purchase 15% this quarter",
      },
      state: {
        truthClass: "operational",
        summary: "37 units in stock; 3 sold this week",
        lastChangedAt: asUtcTimestamp(CLOCK()),
        evidence: [],
      },
      evidence: [
        {
          evidenceId: "evidence-e2e-1",
          kind: "execution-log",
          summary: "POS sync observed 3 units sold",
          capturedAt: asUtcTimestamp(CLOCK()),
          proofRef: asTransactionProofRef("P3"),
          sourceArtifactRefs: [],
        },
      ],
      alternatives: [
        {
          alternativeId: "alt-discount",
          label: "Timed discount",
          summary: "−10% for 7 days",
          strategyRef: "strategy:e2e-discount" as never,
          predictedOutcome: {
            truthClass: "predictive",
            summary: "Sell ~9 units in 7 days",
            confidenceNote: "medium",
            horizonNote: "7 days",
            assumptions: ["demand elasticity holds"],
            basedOnEvidence: [],
          },
          tradeoffs: ["margin −10% on promoted units"],
        },
      ],
      predictions: [
        {
          truthClass: "predictive",
          summary: "Overstock reduced to ~28 units within two weeks",
          confidenceNote: "medium-high",
          horizonNote: "14 days",
          assumptions: ["weekly sale rate ≥ 6 units"],
          basedOnEvidence: [],
        },
      ],
      risk: {
        downsideSummary: "Discount may anchor lower price expectations",
        severity: "medium",
        stopConditions: ["stop if weekly sales < 3 units", "stop if margin < 8%"],
        recourseNote: "discount auto-expires after 7 days",
        evidence: [],
      },
      organizationUsed: {
        organizationRef: "organization:e2e-1" as never,
        whyThisOrganization: "One pricing skill with attenuated listing-write authority",
        actors: [
          {
            actorLabel: "Pricing skill",
            actorKind: "skill",
            attenuatedAuthorityNote: "listing write only, bounded to this catalog",
            capabilities: [
              {
                capabilityDefinitionId: asCapabilityDefinitionId("cap-listings-manage"),
                connectedInstanceRef: "connected-instance:e2e-1" as never,
                executionModeRef: asExecutionModeRef("PASS_THROUGH_NATIVE"),
                roleInPlan: "apply the price change on the provider",
              },
            ],
          },
        ],
        capabilitiesUsed: [],
      },
      authority: {
        requiredApprovals: [
          {
            approvalId: "approval-e2e-1",
            approver: OPERATOR,
            scope: "pricing change up to −10% for 7 days",
            status: "pending",
            evidence: [],
          },
        ],
        currentStatus: "pending",
        explanation: "A price change beyond −5% requires your approval",
      },
      action: {
        actionKind: "approve",
        available: true,
        commandHandoff: "kernel-command:e2e-price-opaque" as never,
        idempotencyKey: asIdempotencyKey("e2e-price-key-1"),
      },
      history: [
        {
          occurredAt: asUtcTimestamp(CLOCK()),
          summary: "POS sync folded; overstock recomputed",
          actor: "system",
          evidenceRefs: [],
        },
      ],
    }),

    decisionCardRender: () => renderDecisionCard(harness.decisionCard()),

    observabilitySnapshot: (plane: DeploymentPlaneStatus = NOT_BOOTED_PLANE) => {
      const healthSurface = buildConnectorHealthSurface({
        connectors: connectors.connectors().map((registeredConnector) => ({
          connectorId: registeredConnector.connectorId,
          providerDisplayName: "Configured provider label",
          health:
            connectors.healthReport().find((report) => report.connectorId === registeredConnector.connectorId)?.health ?? {
              status: "unknown" as const,
              lastCheckedAt: asUtcTimestamp(CLOCK()),
              degradedReasons: [],
              customerActionNotes: [],
              evidence: [],
            },
        })),
        telemetry,
        generatedAt: asUtcTimestamp(CLOCK()),
      });
      return projector.snapshot({
        commerceJournal: {
          eventCount: lane.events().length,
          journalFingerprint: "e2e-fingerprint",
          sequenceLawHolds: lane.journalIsValid(),
        },
        connectorHealth: healthSurface,
        liveSessions: [liveSession.surfaceView()],
        autonomousStores: [],
        edgeQueues: [],
        deploymentPlane: plane,
        recentExecutions: connectors.executionLog(),
      });
    },

    operatorDashboard: (plane: DeploymentPlaneStatus = NOT_BOOTED_PLANE) =>
      projector.operatorDashboard({
        snapshot: harness.observabilitySnapshot(plane),
        runbookStatuses: runbookStatusesOf([]),
        operatorRef: OPERATOR,
      }),
  };
  return harness;
}
