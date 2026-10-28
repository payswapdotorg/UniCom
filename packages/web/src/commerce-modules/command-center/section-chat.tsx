/**
 * command-center — the Commander section (W1-027).
 *
 * Ported from the approved console's ChatSection: the chat-first surface
 * where you talk and the orchestrator plans, acts across every connected
 * store, and reports evidence inline. The agent reply lands with a 4-step
 * plan that ticks off (the approved plan-tick animation: one step every
 * 900ms with an active-step cursor) and evidence chips per executed step.
 * Risky steps become decisions on the frontier — never silent actions.
 */
import type { JSX } from "react";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./data.js";
import { useCommandCenter } from "./state.js";
import { EvidenceChip } from "./ui.js";

const SUGGESTIONS: readonly string[] = [
  "Why did Etsy revenue jump 24%?",
  "Reprice the linen throw",
  "Draft a recovery email for abandoned carts",
];

function PlanBlock({ message }: { readonly message: ChatMessage }): JSX.Element {
  const plan = message.plan ?? [];
  const done = message.planDone ?? 0;
  return (
    <div className="cmcc-plan">
      <p className="cmcc-plan-label">plan</p>
      <ol className="cmcc-plan-steps">
        {plan.map((step, index) => {
          const stepDone = index < done;
          const active = index === done;
          return (
            <li key={step} className={`cmcc-plan-step${stepDone ? " cmcc-plan-step--done" : active ? " cmcc-plan-step--active" : ""}`}>
              <span className="cmcc-plan-mark" aria-hidden>
                {stepDone ? "✓" : ""}
              </span>
              <span className="cmcc-plan-text">{step}</span>
              {active ? <span className="cmcc-plan-cursor" aria-hidden>▍</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AgentMessage({ message }: { readonly message: ChatMessage }): JSX.Element {
  const evidence = message.evidence ?? [];
  return (
    <div className="cmcc-msg cmcc-msg--agent">
      <div className="cmcc-msg-meta">
        <span className="cmcc-agent-glyph" aria-hidden>›_</span>
        <span className="cmcc-agent-name">orchestrator</span>
      </div>
      <div className="cmcc-bubble cmcc-bubble--agent">{message.text}</div>
      {message.plan ? <PlanBlock message={message} /> : null}
      {evidence.length > 0 ? (
        <ul className="cmcc-evidence-list">
          {evidence.map((chip) => (
            <li key={chip}>
              <EvidenceChip>{chip}</EvidenceChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ChatSection(): JSX.Element {
  const { state, actions } = useCommandCenter();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest message in view (the approved smooth scroll). jsdom and
  // other minimal DOMs implement no scrollTo — guard instead of crashing.
  useEffect(() => {
    const element = scroller.current;
    if (element && typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [state.chat, state.chatThinking]);

  // The plan-tick: the newest agent plan ticks one step every 900ms.
  useEffect(() => {
    const last = state.chat[state.chat.length - 1];
    if (!last?.plan || last.role !== "agent") return;
    if ((last.planDone ?? 0) >= last.plan.length) return;
    const timer = window.setTimeout(() => actions.tickPlan(last.id), 900);
    return () => window.clearTimeout(timer);
  }, [state.chat, actions]);

  const submit = (event?: React.FormEvent): void => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    actions.sendChat(text);
    setDraft("");
  };

  return (
    <section className="cmcc-section cmcc-section--chat" aria-label="Commander — the agent chat" data-testid="cmcc-section-chat">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Commander</h2>
        <p className="cmcc-section-sub">
          One agent, every store. It plans first, shows evidence, and packs risky moves as
          decisions. <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>
      <div className="cmcc-chat">
        <div ref={scroller} className="cmcc-chat-scroll" aria-live="polite" data-testid="cmcc-chat-scroll">
          {state.chat.map((message) =>
            message.role === "merchant" ? (
              <div key={message.id} className="cmcc-msg cmcc-msg--merchant">
                <div className="cmcc-bubble cmcc-bubble--merchant">{message.text}</div>
              </div>
            ) : (
              <AgentMessage key={message.id} message={message} />
            ),
          )}
          {state.chatThinking ? <p className="cmcc-thinking">orchestrator thinking…</p> : null}
        </div>
        <div className="cmcc-chat-compose">
          <div className="cmcc-row cmcc-suggest">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="cmcc-suggest-chip" onClick={() => actions.sendChat(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          <form className="cmcc-chat-form" onSubmit={submit}>
            <input
              className="cmcc-input cmcc-input--chat"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Tell the agent what you need…"
              aria-label="Message the agent"
            />
            <button type="submit" className="cm-button cm-button-primary" disabled={draft.trim() === ""}>
              Send
            </button>
          </form>
          <p className="cmcc-section-note">
            Plans → evidence → decisions. The agent never changes a store without your checkbox on
            the frontier.
          </p>
        </div>
      </div>
    </section>
  );
}
