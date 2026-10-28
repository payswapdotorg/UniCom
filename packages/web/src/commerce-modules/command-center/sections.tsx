/**
 * command-center — the Command Center layout (W1-027): the operator-approved
 * console shell ported into the commerce host.
 *
 * Structure (approved design, 2026-10-23): the always-visible heartbeat strip
 * → the desktop rail (section switcher with the decisions badge + the trust
 * contract card) beside the section content, OR the narrow-viewport bottom
 * nav (the same seven sections) → the toast stack (every flow's evidence).
 * The host's own header (brand · Home/Explore/Roles/System · DEMO badge)
 * stays above it — Roles and System surfaces stay reachable in the host nav.
 *
 * The home surface of the commerce host mounts this component (the module
 * family also registers it through the module contract — see ./module.ts).
 */
import type { JSX } from "react";

import { useEffect } from "react";
import "./command-center.css";
import { HeartbeatStrip } from "./heartbeat.js";
import { COMMAND_SECTION_IDS, useCommandCenter } from "./state.js";
import type { CommandSectionId } from "./state.js";
import { CommandSection } from "./section-command.js";
import { StoresSection } from "./section-stores.js";
import { MissionsSection } from "./section-missions.js";
import { ChatSection } from "./section-chat.js";
import { DecisionsSection } from "./section-decisions.js";
import { WatchSection } from "./section-watch.js";
import { SkillsSection } from "./section-skills.js";

/** The rail/bottom-nav labels (approved design order: Command first). */
const SECTION_LABELS: Readonly<Record<CommandSectionId, string>> = {
  command: "Command",
  stores: "Stores",
  missions: "Missions",
  chat: "Commander",
  decisions: "Decisions",
  watch: "Watch",
  skills: "Skills",
};

function SectionSwitcherButton({
  section,
  current,
  badge,
  onClick,
}: {
  readonly section: CommandSectionId;
  readonly current: CommandSectionId;
  readonly badge: number;
  readonly onClick: () => void;
}): JSX.Element {
  const active = section === current;
  return (
    <button
      type="button"
      className={`cmcc-nav-button${active ? " cmcc-nav-button--active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="cmcc-nav-label">{SECTION_LABELS[section]}</span>
      {badge > 0 ? <span className="cmcc-nav-badge">{badge}</span> : null}
    </button>
  );
}

/** The toast stack — every flow lands its evidence here, auto-dismissed. */
function ToastStack(): JSX.Element {
  const { state, actions } = useCommandCenter();
  useEffect(() => {
    if (state.toastQueue.length === 0) return;
    const timer = window.setTimeout(() => actions.shiftToast(), 4200);
    return () => window.clearTimeout(timer);
  }, [state.toastQueue, actions]);
  if (state.toastQueue.length === 0) return <></>;
  return (
    <div className="cmcc-toasts" aria-live="polite" data-testid="cmcc-toasts">
      {state.toastQueue.map((toast, index) => (
        <div key={`${toast.title}-${index}`} className="cmcc-toast">
          <div className="cmcc-toast-body">
            <p className="cmcc-toast-title">{toast.title}</p>
            <p className="cmcc-toast-desc">{toast.desc}</p>
          </div>
          <button type="button" className="cmcc-toast-dismiss" aria-label="Dismiss notification" onClick={() => actions.shiftToast()}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function SectionContent(): JSX.Element {
  const { state } = useCommandCenter();
  switch (state.section) {
    case "command":
      return <CommandSection />;
    case "stores":
      return <StoresSection />;
    case "missions":
      return <MissionsSection />;
    case "chat":
      return <ChatSection />;
    case "decisions":
      return <DecisionsSection />;
    case "watch":
      return <WatchSection />;
    case "skills":
      return <SkillsSection />;
  }
}

/**
 * The Command Center home: heartbeat strip + rail/bottom-nav + the active
 * section. Mounted by the commerce host's home surface AND registered through
 * the module contract (one implementation, zero drift).
 */
export function CommandCenterHome(): JSX.Element {
  const { state, actions } = useCommandCenter();
  return (
    <div className="cmcc" data-testid="cmcc-root">
      <HeartbeatStrip />
      <div className="cmcc-body">
        <nav className="cmcc-rail" aria-label="Command Center sections">
          {COMMAND_SECTION_IDS.map((section) => (
            <SectionSwitcherButton
              key={section}
              section={section}
              current={state.section}
              badge={section === "decisions" ? state.decisions.length : 0}
              onClick={() => actions.setSection(section)}
            />
          ))}
          <div className="cmcc-rail-note">
            Every agent action leaves evidence. Every risky action needs your checkbox. That&apos;s the whole
            contract.
          </div>
        </nav>
        <div className="cmcc-main">
          <SectionContent />
        </div>
      </div>
      <nav className="cmcc-bottomnav" aria-label="Command Center sections (mobile)">
        {COMMAND_SECTION_IDS.map((section) => (
          <SectionSwitcherButton
            key={section}
            section={section}
            current={state.section}
            badge={section === "decisions" ? state.decisions.length : 0}
            onClick={() => actions.setSection(section)}
          />
        ))}
      </nav>
      <ToastStack />
    </div>
  );
}
