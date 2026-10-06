/**
 * Target deployment adapter runtime (W3-006 §Scope 1; acceptance scenario 1).
 *
 * Executes a provider-agnostic `DeploymentTargetPlan` END-TO-END on the
 * local node-server target: environment resolution (typed contracts),
 * build steps (real commands through a command executor), boot with
 * STARTUP ORDERING (topological; a dependent only becomes ready when its
 * dependencies are ready), live health/readiness/startup probes served over
 * REAL loopback HTTP, and explicit shutdown. This is the deployment-plane
 * machinery the DR "pod-loss" playbook drives (`terminateService` /
 * `restartService`).
 *
 * The loopback bind host is a deployment fact, not a provider dependency;
 * port 0 asks the OS for an ephemeral port (tests must never collide).
 */

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promisify } from "node:util";
import {
  DeploymentPlanError,
} from "../../deployment/manifest";
import type {
  BuildStepExecutionResult,
  DeploymentPlaneStatus,
  DeploymentProbeContract,
  DeploymentProbeKind,
  DeploymentServiceSpec,
  DeploymentTargetPlan,
  DeployedServiceStatus,
  ProbeCheckResult,
  ResolvedDeploymentEnvironment,
  ServiceBootState,
} from "../../deployment/manifest";
import type { DeploymentProviderAdapter } from "../../deployment/provider-adapter";
import type { UtcIso8601String } from "../../common/values";
import { asDeploymentAdapterId } from "../ids";
import { resolveDeploymentEnvironment, resolveStartupOrder } from "./target-plan";

const execFileAsync = promisify(execFile);

/** Executes one build command (real subprocess by default; injectable). */
export type BuildCommandExecutor = (
  command: readonly string[],
) => Promise<{ readonly exitCode: number; readonly stdout: string }>;

/** Real command executor: spawns the command, captures stdout + exit code. */
export function createNodeCommandExecutor(): BuildCommandExecutor {
  return async (command) => {
    const [runner, ...args] = command;
    if (runner === undefined) return { exitCode: 127, stdout: "" };
    try {
      const { stdout } = await execFileAsync(runner, args, { timeout: 10_000 });
      return { exitCode: 0, stdout };
    } catch (error) {
      const failure = error as { code?: number | string; stdout?: string };
      return { exitCode: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "" };
    }
  };
}

interface ServiceRuntimeState {
  readonly spec: DeploymentServiceSpec;
  state: ServiceBootState;
  server?: Server;
  port?: number;
  environment?: ResolvedDeploymentEnvironment;
  lastProbe?: ProbeCheckResult;
  readinessBlockedBy: string[];
}
interface BootedHttpService {
  server: Server;
  port: number;
}

export interface TargetDeploymentAdapter {
  readonly planId: string;
  /** Resolve + build every service (typed env contracts; real commands). */
  build(
    provided: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): Promise<readonly BuildStepExecutionResult[]>;
  /** Boot every service in startup order; ready only when probes pass. */
  boot(): Promise<readonly ProbeCheckResult[]>;
  /** Probe one service's probe contract over real loopback HTTP. */
  probe(serviceId: string, probeId: string): Promise<ProbeCheckResult>;
  /** Probe every contract of every booted service. */
  probeAll(): Promise<readonly ProbeCheckResult[]>;
  /** Operator-initiated termination (the DR pod-loss injector). */
  terminateService(serviceId: string): Promise<void>;
  /** Restart a terminated service; re-verify its probes. */
  restartService(serviceId: string): Promise<readonly ProbeCheckResult[]>;
  status(): DeploymentPlaneStatus;
  /** Project current plane state into the W3-001 provider-adapter view. */
  providerAdapterView(): DeploymentProviderAdapter;
  shutdown(): Promise<void>;
}

export interface TargetDeploymentAdapterOptions {
  readonly plan: DeploymentTargetPlan;
  readonly clock: () => UtcIso8601String;
  readonly commandExecutor?: BuildCommandExecutor;
}

async function bootHttpService(
  spec: DeploymentServiceSpec,
  gates: ReadonlyMap<DeploymentProbeKind, () => boolean>,
): Promise<BootedHttpService> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const probe = spec.probes.find((candidate) => candidate.path === url);
    if (probe === undefined) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const gate = gates.get(probe.kind) ?? (() => false);
    response.statusCode = gate() ? probe.successStatus : probe.failureStatus;
    response.end(`${spec.serviceId}:${probe.kind}:${response.statusCode}`);
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(spec.process.bindPort, spec.process.bindHost, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("unexpected listen address"));
        return;
      }
      resolve(address.port);
    });
  });
  return { server, port };
}

export function createTargetDeploymentAdapter(options: TargetDeploymentAdapterOptions): TargetDeploymentAdapter {
  const { plan, clock } = options;
  const executor = options.commandExecutor ?? createNodeCommandExecutor();
  const services = new Map<string, ServiceRuntimeState>(
    plan.services.map((spec) => [spec.serviceId, { spec, state: "pending", readinessBlockedBy: [...spec.dependsOn] }]),
  );
  const startupOrder = resolveStartupOrder(plan);
  const builtArtifacts = new Set<string>();

  const readyServices = (): readonly string[] =>
    [...services.values()].filter((service) => service.state === "ready").map((service) => service.spec.serviceId);

  const startService = async (state: ServiceRuntimeState): Promise<void> => {
    state.state = "starting";
    const gates = new Map<DeploymentProbeKind, () => boolean>();
    gates.set("liveness", () => state.state !== "failed" && state.state !== "stopped");
    gates.set("startup", () => state.state === "ready");
    gates.set("readiness", () => {
      const ready = new Set(readyServices());
      const blocked = state.spec.dependsOn.filter((dependency) => !ready.has(dependency));
      state.readinessBlockedBy = blocked;
      return state.state === "ready" && blocked.length === 0;
    });
    const booted = await bootHttpService(state.spec, gates);
    state.server = booted.server;
    state.port = booted.port;
    state.state = "ready";
    state.readinessBlockedBy = [];
  };

  const checkProbe = async (state: ServiceRuntimeState, probe: DeploymentProbeContract): Promise<ProbeCheckResult> => {
    if (state.server === undefined || state.port === undefined) {
      const failed: ProbeCheckResult = {
        probeId: probe.probeId,
        serviceId: state.spec.serviceId,
        kind: probe.kind,
        httpStatus: "connection-failed",
        passed: false,
        checkedAt: clock(),
      };
      state.lastProbe = failed;
      return failed;
    }
    let httpStatus: number | "connection-failed";
    try {
      const response = await fetch(`http://${state.spec.process.bindHost}:${state.port}${probe.path}`, {
        method: probe.method,
      });
      httpStatus = response.status;
    } catch {
      httpStatus = "connection-failed";
    }
    const result: ProbeCheckResult = {
      probeId: probe.probeId,
      serviceId: state.spec.serviceId,
      kind: probe.kind,
      httpStatus,
      passed: httpStatus === probe.successStatus,
      checkedAt: clock(),
    };
    state.lastProbe = result;
    return result;
  };

  const adapter: TargetDeploymentAdapter = {
    planId: plan.planId,

    async build(provided) {
      const results: BuildStepExecutionResult[] = [];
      for (const serviceId of startupOrder) {
        const state = services.get(serviceId) as ServiceRuntimeState;
        state.state = "building";
        state.environment = resolveDeploymentEnvironment(
          state.spec.environment,
          provided[serviceId] ?? {},
          state.spec.process.bindHost,
        );
        for (const step of state.spec.buildSteps) {
          const unmet = step.requiresArtifacts.filter((artifact) => !builtArtifacts.has(artifact));
          if (unmet.length > 0) {
            throw new DeploymentPlanError(
              `build step "${step.stepId}" requires missing artifacts: ${unmet.join(", ")}`,
            );
          }
          const executed = await executor(step.command);
          if (executed.exitCode !== 0) {
            state.state = "failed";
            throw new DeploymentPlanError(`build step "${step.stepId}" exited ${executed.exitCode}`);
          }
          for (const artifact of step.producesArtifacts) builtArtifacts.add(artifact);
          results.push({
            stepId: step.stepId,
            exitCode: executed.exitCode,
            stdout: executed.stdout,
            producedArtifacts: [...step.producesArtifacts],
          });
        }
      }
      return results;
    },

    async boot() {
      for (const serviceId of startupOrder) {
        const state = services.get(serviceId) as ServiceRuntimeState;
        if (state.state !== "building" && state.state !== "stopped" && state.state !== "failed") {
          throw new DeploymentPlanError(
            `service "${serviceId}" cannot boot from state "${state.state}" — build first`,
          );
        }
        await startService(state);
      }
      return adapter.probeAll();
    },

    async probe(serviceId, probeId) {
      const state = services.get(serviceId);
      if (state === undefined) throw new DeploymentPlanError(`unknown service "${serviceId}"`);
      const probe = state.spec.probes.find((candidate) => candidate.probeId === probeId);
      if (probe === undefined) throw new DeploymentPlanError(`unknown probe "${probeId}"`);
      return checkProbe(state, probe);
    },

    async probeAll() {
      const results: ProbeCheckResult[] = [];
      for (const state of startupOrder.map((id) => services.get(id) as ServiceRuntimeState)) {
        for (const probe of state.spec.probes) {
          results.push(await checkProbe(state, probe));
        }
      }
      return results;
    },

    async terminateService(serviceId) {
      const state = services.get(serviceId);
      if (state === undefined) throw new DeploymentPlanError(`unknown service "${serviceId}"`);
      if (state.server !== undefined) {
        await new Promise<void>((resolve) => state.server?.close(() => resolve()));
      }
      state.server = undefined;
      state.port = undefined;
      state.state = "stopped";
      state.readinessBlockedBy = [...state.spec.dependsOn];
    },

    async restartService(serviceId) {
      const state = services.get(serviceId);
      if (state === undefined) throw new DeploymentPlanError(`unknown service "${serviceId}"`);
      if (state.state !== "stopped" && state.state !== "failed") {
        throw new DeploymentPlanError(`service "${serviceId}" is "${state.state}" — nothing to restart`);
      }
      await startService(state);
      const results: ProbeCheckResult[] = [];
      for (const probe of state.spec.probes) results.push(await checkProbe(state, probe));
      return results;
    },

    status(): DeploymentPlaneStatus {
      const serviceStatuses: DeployedServiceStatus[] = [...services.values()].map((state) => ({
        serviceId: state.spec.serviceId,
        state: state.state,
        ...(state.port === undefined ? {} : { port: state.port }),
        ...(state.lastProbe === undefined ? {} : { lastProbe: state.lastProbe }),
        ...(state.readinessBlockedBy.length === 0 ? {} : { readinessBlockedBy: state.readinessBlockedBy }),
      }));
      return {
        planId: plan.planId,
        targetKind: plan.targetKind,
        services: serviceStatuses,
        allReady: serviceStatuses.length > 0 && serviceStatuses.every((service) => service.state === "ready"),
      };
    },

    providerAdapterView(): DeploymentProviderAdapter {
      const status = adapter.status();
      const adapterStatus = status.allReady
        ? "healthy"
        : status.services.some((service) => service.state === "failed")
          ? "degraded"
          : "unknown";
      const capabilityKinds = new Set(plan.services.flatMap((service) => [...service.capabilityKinds]));
      return {
        adapterId: asDeploymentAdapterId(plan.planId),
        displayLabel: plan.displayLabel,
        tier: "self-hosted",
        providedCapabilities: [...capabilityKinds],
        status: adapterStatus,
        quotaObservations: [],
        replaceableWithoutDomainChanges: true,
      };
    },

    async shutdown() {
      for (const state of services.values()) {
        if (state.server !== undefined) {
          await new Promise<void>((resolve) => state.server?.close(() => resolve()));
        }
        state.server = undefined;
        state.port = undefined;
        state.state = "stopped";
      }
    },
  };
  return adapter;
}
