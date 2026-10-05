/**
 * W2-002 runtime test harness — plane installation on a REAL kernel runtime.
 *
 * Composes the real `AgentRuntime` (`@zcode/core`) with the
 * `@unicom/agent-kernel` plane, the kernel's own in-memory session event
 * store, scripted deterministic models and an in-test recorder for the
 * opaque commerce seam port (Worker 1 owns the real commerce runtime; the
 * recorder implements the seam PORT contract for tests only and is never
 * reachable from production paths — invariant 39).
 */

import {
  commerceCommandType,
  credentialRef,
  credentialScope,
  type ActiveTask,
  type CommerceCommandPort,
  type CommerceCommandResult,
  type CommerceCommandSubmission,
  type MainAgent,
  type SkillDefinition,
  type ToolContract,
} from "@unicom/agent";
import {
  createInMemorySessionEventStore,
  type InMemorySessionEventStore,
  type ModelSelection,
  type SessionId,
} from "@zcode/contracts";
import type { AgentRuntime, ToolRegistry } from "@zcode/core";
import {
  COMMERCE_COMMAND_CAPABILITY_ID,
  UnicomAgentPlane,
  type UnicomContextGuardReport,
  type UnicomInstalledRuntime,
} from "@unicom/agent-kernel";
import {
  createScriptedModel,
  createScriptedModelFactory,
  type ScriptedModel,
  type ScriptedStep,
} from "./scripted-model.js";

export interface RecordedCommerceSubmission {
  readonly submission: CommerceCommandSubmission;
  readonly at: string;
}

export class CommerceCommandRecorder implements CommerceCommandPort {
  readonly submissions: RecordedCommerceSubmission[] = [];
  private counter = 0;
  failNext = false;

  submit(submission: CommerceCommandSubmission): CommerceCommandResult {
    this.submissions.push({ submission, at: submission.submittedAt });
    this.counter += 1;
    if (this.failNext) {
      this.failNext = false;
      return {
        commandId: submission.intent.commandId,
        idempotencyKey: submission.intent.idempotencyKey,
        status: "REJECTED",
        reason: "recorder: rejected for test",
      };
    }
    return {
      commandId: submission.intent.commandId,
      idempotencyKey: submission.intent.idempotencyKey,
      status: "ACCEPTED",
      resultingStateRef: `recorder:state:${this.counter}` as CommerceCommandResult["resultingStateRef"],
    };
  }
}

export const MAIN_MODEL_SELECTION: ModelSelection = { providerId: "test", modelId: "main" };
export const SYSTEM_1_MODEL_SELECTION: ModelSelection = { providerId: "test", modelId: "system1" };
export const JEPA_MODEL_SELECTION: ModelSelection = { providerId: "test", modelId: "jepa" };
export const SYSTEM_2_MODEL_SELECTION: ModelSelection = { providerId: "test", modelId: "system2" };

export function harnessMainAgent(input?: {
  capabilityDefinitionIds?: readonly string[];
  proposableCommandTypes?: readonly string[];
  maxDecisionImpact?: MainAgent["authority"]["maxDecisionImpact"];
}): MainAgent {
  return {
    principalId: "main-agent:unicom:test",
    kind: "main-agent",
    displayName: "UNiCOM Main Agent (test)",
    skills: [],
    authority: {
      capabilityDefinitionIds: input?.capabilityDefinitionIds ?? [COMMERCE_COMMAND_CAPABILITY_ID],
      proposableCommandTypes:
        input?.proposableCommandTypes?.map((verb) => commerceCommandType(verb)) ?? [
          commerceCommandType("listing.create"),
          commerceCommandType("groupbuy.enroll"),
          commerceCommandType("tradecycle.leg"),
          commerceCommandType("tradecycle.extend"),
          commerceCommandType("order.refund"),
          commerceCommandType("order.settle"),
        ],
      dataAccess: ["task-context", "capability-observations", "coordination-messages", "public-commerce-content"],
      maxDecisionImpact: input?.maxDecisionImpact ?? "IRREVERSIBLE",
    },
    delegationBudget: {
      maxSpend: { currency: "GHS", minorUnits: "1000000" },
      maxActions: 50,
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  };
}

export function commerceConnectedInstance(input?: {
  connectionStatus?: "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "REVOKED" | "UNKNOWN";
}) {
  return {
    connectedInstanceId: "conn:commerce:test",
    providerImplementationId: "impl:unicom:commerce-kernel",
    accountRef: "account:merchant:test",
    connectionStatus: input?.connectionStatus ?? "CONNECTED",
    credentialScope: credentialScope("commerce:propose"),
    credentialRef: credentialRef("vault://credentials/commerce/test"),
    grantedPermissions: ["commerce:propose"],
    commercialEligibility: {
      supportedGeographies: ["GH"],
      supportedCurrencies: ["GHS"],
      commercialTermsAccepted: true,
    },
    authorizedExecutionModes: ["PASS_THROUGH_NATIVE" as const],
  };
}

export function currentObservation(connectedInstanceId = "conn:commerce:test") {
  return {
    observationId: "obs:commerce:current",
    connectedInstanceId,
    observedAt: "2026-10-05T00:00:00.000Z",
    status: "NOMINAL" as const,
    freshness: "CURRENT" as const,
  };
}

export interface RuntimeHarnessOptions {
  readonly mainAgent?: MainAgent;
  /** Opaque command verbs the Main Agent may propose (branded internally). */
  readonly skills?: readonly SkillDefinition[];
  readonly tools?: readonly ToolContract[];
  readonly commercePort?: CommerceCommandPort | null;
  readonly sessionId?: SessionId;
  readonly workingDirectory?: string;
  readonly now?: () => Date;
  readonly connectCommerceCapability?: boolean;
  readonly observeCommerceCapability?: boolean;
}

export interface RuntimeHarness {
  readonly plane: UnicomAgentPlane;
  readonly runtime: AgentRuntime;
  readonly activeTask: ActiveTask;
  readonly registry: ToolRegistry;
  readonly eventStore: InMemorySessionEventStore;
  readonly recorder: CommerceCommandRecorder | undefined;
  readonly models: {
    readonly main: ScriptedModel;
    readonly system1: ScriptedModel;
    readonly jepa: ScriptedModel;
    readonly system2: ScriptedModel;
  };
  readonly contextGuardReports: UnicomContextGuardReport[];
  readonly sessionId: SessionId;
  readonly workingDirectory: string;
}

export interface HarnessScript {
  readonly main?: readonly ScriptedStep[];
  readonly system1?: readonly ScriptedStep[];
  readonly jepa?: readonly ScriptedStep[];
  readonly system2?: readonly ScriptedStep[];
}

export function createRuntimeHarness(
  script: HarnessScript = {},
  options: RuntimeHarnessOptions = {},
): RuntimeHarness {
  const recorder: CommerceCommandRecorder | undefined =
    options.commercePort === null
      ? undefined
      : ((options.commercePort as CommerceCommandRecorder | undefined) ?? new CommerceCommandRecorder());
  const contextGuardReports: UnicomContextGuardReport[] = [];

  const models = {
    main: createScriptedModel(MAIN_MODEL_SELECTION, { steps: script.main ?? [{ text: "done" }] }),
    system1: createScriptedModel(SYSTEM_1_MODEL_SELECTION, {
      steps: script.system1 ?? [{ text: "system1 done" }],
    }),
    jepa: createScriptedModel(JEPA_MODEL_SELECTION, { steps: script.jepa ?? [{ text: "jepa done" }] }),
    system2: createScriptedModel(SYSTEM_2_MODEL_SELECTION, {
      steps: script.system2 ?? [{ text: "system2 done" }],
    }),
  };
  const factory = createScriptedModelFactory([
    models.main,
    models.system1,
    models.jepa,
    models.system2,
  ]);

  const plane = new UnicomAgentPlane({
    mainAgent: options.mainAgent ?? harnessMainAgent(),
    ...(options.skills ? { skills: options.skills } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(recorder ? { commerceCommandPort: recorder } : {}),
    backingModelFactory: factory,
    routeModels: {
      SYSTEM_1: SYSTEM_1_MODEL_SELECTION,
      JEPA_WORLD_MODEL: JEPA_MODEL_SELECTION,
      SYSTEM_2: SYSTEM_2_MODEL_SELECTION,
    },
    contextGuardSink: (report) => contextGuardReports.push(report),
    ...(options.now ? { now: options.now } : {}),
  });

  if (options.connectCommerceCapability !== false) {
    const runtime = plane.capabilityRuntime as unknown as {
      registerDefinition: (d: unknown) => void;
      registerImplementation: (i: unknown) => void;
      registerInstance: (i: unknown) => void;
      recordObservation: (o: unknown) => void;
    };
    runtime.registerDefinition({
      capabilityDefinitionId: COMMERCE_COMMAND_CAPABILITY_ID,
      name: "Commerce Command Seam",
      supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
      transportNeutral: true,
    });
    runtime.registerImplementation({
      providerImplementationId: "impl:unicom:commerce-kernel",
      capabilityDefinitionId: COMMERCE_COMMAND_CAPABILITY_ID,
      providerId: "unicom:commerce-kernel",
      supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
      transports: ["REST"],
    });
    runtime.registerInstance(commerceConnectedInstance());
    if (options.observeCommerceCapability !== false) {
      runtime.recordObservation(currentObservation());
    }
  }

  const sessionId = options.sessionId ?? ("session:unicom:test" as SessionId);
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const eventStore = createInMemorySessionEventStore();

  const installed: UnicomInstalledRuntime = plane.createRuntime({
    sessionId,
    deps: { eventStore },
    config: {
      // Kernel-native trusted-composition posture (same as workflow children):
      // interactive approval is the desktop host's lane; the plane's OWN gates
      // (attenuation, BLOCK final, preconditions, budgets) are the enforcement
      // under test here and are mode-independent.
      mode: "yolo",
      modelSelection: MAIN_MODEL_SELECTION,
      workingDirectory,
      envInfo: {
        cwd: workingDirectory,
        platform: "linux",
        shell: "bash",
        osVersion: "test",
        nodeVersion: process.version,
      },
      currentDate: "2026-10-05",
      modelStreaming: "off",
    },
  });

  return {
    plane: installed.plane,
    runtime: installed.runtime,
    activeTask: installed.activeTask,
    registry: installed.registry,
    eventStore,
    recorder,
    models,
    contextGuardReports,
    sessionId,
    workingDirectory,
  };
}
