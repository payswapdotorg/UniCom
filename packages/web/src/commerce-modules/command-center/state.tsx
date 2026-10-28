/**
 * command-center — the React wiring of the interaction model (W1-027):
 * the context, the provider and the hook.
 *
 * Demo mode (no commerce API configured): every action is local and makes
 * ZERO network calls. Live mode (a base URL is configured): boot hydration
 * swaps the seeds for API state when it lands (never blocking first paint)
 * and every mutation runs the local apply FIRST with a fire-and-forget API
 * call — an API failure leaves local state as the UI truth (graceful
 * fallback to demo behavior, the approved store's dual-path law).
 */
import type { JSX, ReactNode } from "react";

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { Dispatch } from "react";
import {
  commerceApiConfig,
  createDemoStore,
  fetchBrief,
  fetchCommanderHistory,
  fetchDecisions,
  fetchMissions,
  fetchSkills,
  fetchStores,
  fetchWatchEvents,
  installSkillApi,
  resolveDecisionApi,
  sendCommanderChat,
} from "./api.js";
import type { CommerceApiConfig, FetchLike } from "./api.js";
import type { ChatMessage, PlatformId } from "./data.js";
import {
  commandCenterReducer,
  connectEvent,
  fabricateConnectedStore,
  initialCommandCenterState,
  localAgentReply,
  type CommandCenterAction,
  type CommandCenterState,
  type CommandSectionId,
  type CommandToast,
} from "./state-model.js";

interface CommandCenterContextValue {
  readonly state: CommandCenterState;
  readonly dispatch: Dispatch<CommandCenterAction>;
  /** True when the configured seam is live (API base URL present). */
  readonly seamLive: boolean;
  readonly actions: {
    readonly setSection: (section: CommandSectionId) => void;
    readonly startConnect: (platform: string) => void;
    readonly advanceConnect: () => void;
    readonly cancelConnect: () => void;
    readonly finishConnect: (input: { readonly platform: PlatformId; readonly name: string; readonly domain: string }) => void;
    readonly resolveDecision: (id: string, verdict: "approved" | "declined") => void;
    readonly toggleSkill: (skillId: string, storeId: string) => void;
    readonly sendChat: (text: string) => void;
    readonly tickPlan: (msgId: string) => void;
    readonly pushToast: (toast: CommandToast) => void;
    readonly shiftToast: () => void;
  };
}

const CommandCenterContext = createContext<CommandCenterContextValue | null>(null);

let localIdCounter = 0;
function nextLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

export function CommandCenterProvider({
  children,
  config = commerceApiConfig,
  fetchImpl,
}: {
  readonly children: ReactNode;
  /** Injectable seam configuration (tests); defaults to the module-level config. */
  readonly config?: CommerceApiConfig;
  /** Injectable network primitive (tests pass fakes; default: global fetch). */
  readonly fetchImpl?: FetchLike;
}): JSX.Element {
  const [state, dispatch] = useReducer(commandCenterReducer, undefined, initialCommandCenterState);
  const seamLive = config.baseUrl !== null;
  const network: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));

  // Boot hydration (live mode ONLY — demo mode makes zero network calls):
  // the seeds paint instantly; API state swaps in when it lands. Any failure
  // leaves the seeds as the UI truth (live stays false, honest DEMO labeling).
  const baseUrl = config.baseUrl;
  useEffect(() => {
    if (baseUrl === null) return;
    let cancelled = false;
    (async () => {
      const [stores, missions, decisions, watch, skills, chat, brief] = await Promise.all([
        fetchStores(config, network),
        fetchMissions(config, network),
        fetchDecisions(config, network),
        fetchWatchEvents(config, network),
        fetchSkills(config, network),
        fetchCommanderHistory(config, network),
        fetchBrief(config, network),
      ]);
      if (cancelled) return;
      const required = [stores, missions, decisions, watch, skills, chat];
      if (required.some((entry) => !entry.ok) || !brief.ok) return; // graceful fallback: seeds stay
      dispatch({
        type: "hydrate-live",
        payload: {
          stores: stores.ok ? stores.value : [],
          missions: missions.ok ? missions.value : [],
          decisions: decisions.ok ? decisions.value : [],
          watchEvents: watch.ok ? watch.value : [],
          skills: skills.ok ? skills.value : [],
          chat: chat.ok ? chat.value : [],
          brief: brief.value,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, config, network]);

  const actions = useMemo<CommandCenterContextValue["actions"]>(() => {
    const pushToast = (toast: CommandToast): void => dispatch({ type: "push-toast", toast });
    return {
      setSection: (section) => dispatch({ type: "set-section", section }),
      startConnect: (platform) => dispatch({ type: "start-connect", platform }),
      advanceConnect: () => dispatch({ type: "advance-connect" }),
      cancelConnect: () => dispatch({ type: "cancel-connect" }),
      // The wizard's landing: live mode asks the commerce API to mint the
      // store (validated + first-synced server-side); ANY failure falls back
      // to the deterministic local fabrication (graceful demo fallback).
      finishConnect: (input) => {
        const fallback = (): void => {
          const store = fabricateConnectedStore(input);
          dispatch({ type: "finish-connect", store, event: connectEvent(store, false) });
          pushToast({ title: "Store connected", desc: `${store.name} joined the watch ring (demo-fabricated initial catalog).` });
        };
        if (config.baseUrl === null) {
          fallback();
          return;
        }
        void createDemoStore(config, network, { platform: input.platform, name: input.name, domain: input.domain })
          .then((result) => {
            if (!result.ok) {
              fallback();
              return;
            }
            const store = result.value;
            dispatch({ type: "finish-connect", store, event: connectEvent(store, true) });
            pushToast({ title: "Store connected — live", desc: `${store.name} joined the ring with commerce-API metrics.` });
          })
          .catch(() => fallback());
      },
      // Local apply first (the checkbox never blocks on the network); live
      // mode fires the resolution at the API and ignores transient failure.
      resolveDecision: (id, verdict) => {
        const decision = state.decisions.find((entry) => entry.id === id);
        dispatch({ type: "resolve-decision", id, verdict });
        if (decision) {
          pushToast({
            title: verdict === "approved" ? "Decision approved" : "Decision declined",
            desc: decision.title,
          });
        }
        if (config.baseUrl !== null) {
          void resolveDecisionApi(config, network, id, verdict).catch(() => {});
        }
      },
      toggleSkill: (skillId, storeId) => {
        const skill = state.skills.find((entry) => entry.id === skillId);
        const store = state.stores.find((entry) => entry.id === storeId);
        if (!skill || !store) return;
        const has = skill.installedOn.includes(storeId);
        dispatch({ type: "toggle-skill", skillId, storeId });
        pushToast({
          title: has ? "Skill removed" : "Skill installed",
          desc: `${skill.name} ${has ? "removed from" : "installed on"} ${store.name}.`,
        });
        if (config.baseUrl !== null) {
          void installSkillApi(config, network, skillId, { storeId, on: !has }).catch(() => {});
        }
      },
      sendChat: (text) => {
        const id = nextLocalId("c");
        dispatch({ type: "send-chat", id, text });
        if (config.baseUrl === null) {
          window.setTimeout(() => dispatch({ type: "agent-reply", message: localAgentReply(`${id}-a`) }), 700);
          return;
        }
        void sendCommanderChat(config, network, text)
          .then((result) => dispatch({ type: "agent-reply", message: result.ok ? result.value : localAgentReply(`${id}-a`) }))
          .catch(() => dispatch({ type: "agent-reply", message: localAgentReply(`${id}-a`) }));
      },
      tickPlan: (msgId) => dispatch({ type: "tick-plan", msgId }),
      pushToast,
      shiftToast: () => dispatch({ type: "shift-toast" }),
    };
  }, [config, network, state.skills, state.stores]);

  const value = useMemo<CommandCenterContextValue>(
    () => ({ state, dispatch, seamLive, actions }),
    [state, seamLive, actions],
  );
  return <CommandCenterContext.Provider value={value}>{children}</CommandCenterContext.Provider>;
}

export function useCommandCenter(): CommandCenterContextValue {
  const value = useContext(CommandCenterContext);
  if (value === null) throw new Error("useCommandCenter requires CommandCenterProvider");
  return value;
}

/** Re-exported for section components (one import path for the model). */
export { COMMAND_SECTION_IDS } from "./state-model.js";
export type { CommandSectionId } from "./state-model.js";
export type { ChatMessage } from "./data.js";
