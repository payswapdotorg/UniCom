/**
 * command-center — the PURE interaction model (W1-027): state shape, actions
 * and the reducer.
 *
 * Ported from the operator-approved console's zustand store
 * (`src/lib/product/store.ts`, 2026-10-23 state) as a pure reducer — no new
 * dependencies, no zustand. The seven sections, the 3-step connect wizard,
 * decision resolution, skill installs and the Commander chat plan-tick all
 * behave like the approved interaction model (see ./state.tsx for the
 * provider that wires the reducer to React and the commerce API seam).
 */
import { nowStamp } from "./api.js";
import {
  MORNING_BRIEF,
  SEED_CHAT,
  SEED_DECISIONS,
  SEED_MISSIONS,
  SEED_SKILLS,
  SEED_STORES,
  SEED_WATCH_EVENTS,
  fabricateDemoCatalog,
  type ChatMessage,
  type Decision,
  type Mission,
  type MorningBrief,
  type PlatformId,
  type Skill,
  type StoreConnection,
  type WatchEvent,
} from "./data.js";

/** The seven sections of the approved Command Center design. */
export type CommandSectionId =
  | "command"
  | "stores"
  | "missions"
  | "chat"
  | "decisions"
  | "watch"
  | "skills";

export const COMMAND_SECTION_IDS: readonly CommandSectionId[] = [
  "command",
  "stores",
  "missions",
  "chat",
  "decisions",
  "watch",
  "skills",
];

export interface ResolvedDecision {
  readonly decision: Decision;
  readonly verdict: "approved" | "declined";
  readonly at: number;
}

export interface CommandToast {
  readonly title: string;
  readonly desc: string;
}

export interface CommandCenterState {
  readonly section: CommandSectionId;
  readonly stores: readonly StoreConnection[];
  readonly connecting: { readonly platform: string; readonly step: number } | null;
  readonly missions: readonly Mission[];
  readonly decisions: readonly Decision[];
  readonly resolved: readonly ResolvedDecision[];
  readonly skills: readonly Skill[];
  readonly watchEvents: readonly WatchEvent[];
  readonly chat: readonly ChatMessage[];
  readonly chatThinking: boolean;
  readonly toastQueue: readonly CommandToast[];
  readonly brief: MorningBrief;
  /** True when the commerce API hydrate succeeded (honest labeling). */
  readonly live: boolean;
}

/** Local (session-deterministic) entity ids: a monotonic counter, never Date.now().
 *
 * Prefixes never collide with the committed seed ids (watch events mint `evt-N`
 * because the seeds own `e-1…e-5`; stores mint `store-N` beside the seed store
 * ids) — a colliding id would duplicate a React key in the ring stream. */
let localIdCounter = 0;
function nextLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

export type CommandCenterAction =
  | { readonly type: "set-section"; readonly section: CommandSectionId }
  | { readonly type: "start-connect"; readonly platform: string }
  | { readonly type: "advance-connect" }
  | { readonly type: "cancel-connect" }
  | {
      readonly type: "finish-connect";
      readonly store: StoreConnection;
      readonly event: WatchEvent;
    }
  | { readonly type: "resolve-decision"; readonly id: string; readonly verdict: "approved" | "declined" }
  | { readonly type: "toggle-skill"; readonly skillId: string; readonly storeId: string }
  | { readonly type: "send-chat"; readonly id: string; readonly text: string }
  | { readonly type: "agent-reply"; readonly message: ChatMessage }
  | { readonly type: "tick-plan"; readonly msgId: string }
  | { readonly type: "push-toast"; readonly toast: CommandToast }
  | { readonly type: "shift-toast" }
  | {
      readonly type: "hydrate-live";
      readonly payload: {
        readonly stores: readonly StoreConnection[];
        readonly missions: readonly Mission[];
        readonly decisions: readonly Decision[];
        readonly watchEvents: readonly WatchEvent[];
        readonly skills: readonly Skill[];
        readonly chat: readonly ChatMessage[];
        readonly brief: MorningBrief;
      };
    };

export function initialCommandCenterState(): CommandCenterState {
  return {
    section: "command",
    stores: SEED_STORES,
    connecting: null,
    missions: SEED_MISSIONS,
    decisions: SEED_DECISIONS,
    resolved: [],
    skills: SEED_SKILLS,
    watchEvents: SEED_WATCH_EVENTS,
    chat: SEED_CHAT,
    chatThinking: false,
    toastQueue: [],
    brief: MORNING_BRIEF,
    live: false,
  };
}

/** The local agent-reply template (the approved offline planner flavor). */
export function localAgentReply(replyId: string): ChatMessage {
  return {
    id: replyId,
    role: "agent",
    text: "On it. Here's my plan — I'll report evidence as each step lands.",
    plan: [
      "Pull the last 30 days across your connected stores",
      "Identify the SKU / listing in question",
      "Draft the change as a decision packet for you",
      "Attach evidence (diff, model, confidence)",
    ],
    planDone: 0,
    evidence: [],
  };
}

/** The connect wizard's fabricated store (demo mode; the live path mints it server-side). */
export function fabricateConnectedStore(input: {
  readonly platform: PlatformId;
  readonly name: string;
  readonly domain: string;
}): StoreConnection {
  const catalog = fabricateDemoCatalog(input);
  return {
    id: nextLocalId("store"),
    name: input.name,
    domain: input.domain,
    platform: input.platform,
    health: "syncing",
    lastSync: "just now",
    lastAudit: "queued",
    products: catalog.products,
    orders7d: catalog.orders7d,
    revenue7d: catalog.revenue7d,
    delta7d: 0,
    apiUsage: 0,
    installedSkills: [],
  };
}

/** The watch-ring event a finished connect records (honest about its basis). */
export function connectEvent(store: StoreConnection, live: boolean): WatchEvent {
  return {
    id: nextLocalId("evt"),
    ts: nowStamp(),
    kind: "connect",
    actor: "connector",
    text: live
      ? `${store.name} connected live — first sync landed from the commerce API`
      : `${store.name} connected — initial catalog sync queued (${store.products} products, demo-fabricated)`,
  };
}

export function commandCenterReducer(
  state: CommandCenterState,
  action: CommandCenterAction,
): CommandCenterState {
  switch (action.type) {
    case "set-section":
      return { ...state, section: action.section };
    case "start-connect":
      return { ...state, connecting: { platform: action.platform, step: 0 } };
    case "advance-connect": {
      if (state.connecting === null) return state;
      return { ...state, connecting: { ...state.connecting, step: Math.min(state.connecting.step + 1, 3) } };
    }
    case "cancel-connect":
      return { ...state, connecting: null };
    case "finish-connect":
      return {
        ...state,
        stores: [...state.stores, action.store],
        connecting: null,
        watchEvents: [action.event, ...state.watchEvents],
      };
    case "resolve-decision": {
      const decision = state.decisions.find((entry) => entry.id === action.id);
      if (!decision) return state;
      return {
        ...state,
        decisions: state.decisions.filter((entry) => entry.id !== action.id),
        resolved: [...state.resolved, { decision, verdict: action.verdict, at: Date.now() }],
        watchEvents: [
          {
            id: nextLocalId("evt"),
            ts: nowStamp(),
            kind: "review",
            actor: "you",
            text: `${action.verdict === "approved" ? "Approved" : "Declined"} — ${decision.title}`,
          },
          ...state.watchEvents,
        ],
      };
    }
    case "toggle-skill": {
      const skill = state.skills.find((entry) => entry.id === action.skillId);
      const store = state.stores.find((entry) => entry.id === action.storeId);
      if (!skill || !store) return state;
      const has = skill.installedOn.includes(action.storeId);
      return {
        ...state,
        skills: state.skills.map((entry) =>
          entry.id === action.skillId
            ? { ...entry, installedOn: has ? entry.installedOn.filter((id) => id !== action.storeId) : [...entry.installedOn, action.storeId] }
            : entry,
        ),
        stores: state.stores.map((entry) =>
          entry.id === action.storeId
            ? { ...entry, installedSkills: has ? entry.installedSkills.filter((id) => id !== action.skillId) : [...entry.installedSkills, action.skillId] }
            : entry,
        ),
        watchEvents: has
          ? state.watchEvents
          : [
              {
                id: nextLocalId("evt"),
                ts: nowStamp(),
                kind: "dispatch",
                actor: action.skillId,
                text: `${skill.name} installed on ${store.name} — initial sweep queued`,
              },
              ...state.watchEvents,
            ],
      };
    }
    case "send-chat":
      return {
        ...state,
        chat: [...state.chat, { id: action.id, role: "merchant", text: action.text }],
        chatThinking: true,
      };
    case "agent-reply":
      return {
        ...state,
        chat: [...state.chat, action.message],
        chatThinking: false,
      };
    case "tick-plan":
      return {
        ...state,
        chat: state.chat.map((message) =>
          message.id === action.msgId && message.plan && message.planDone !== undefined && message.planDone < message.plan.length
            ? { ...message, planDone: message.planDone + 1 }
            : message,
        ),
      };
    case "push-toast":
      return { ...state, toastQueue: [...state.toastQueue, action.toast] };
    case "shift-toast":
      return { ...state, toastQueue: state.toastQueue.slice(1) };
    case "hydrate-live":
      return {
        ...state,
        stores: action.payload.stores,
        missions: action.payload.missions,
        decisions: action.payload.decisions,
        watchEvents: action.payload.watchEvents,
        skills: action.payload.skills,
        chat: action.payload.chat.length > 0 ? action.payload.chat : state.chat,
        brief: action.payload.brief,
        live: true,
      };
    default:
      return state;
  }
}
