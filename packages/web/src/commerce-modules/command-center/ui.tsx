/**
 * command-center — shared presentation bits (W1-027).
 *
 * Small, honest components every section reuses: platform glyphs (the
 * approved per-platform tone, mapped to host CSS classes — never raw colors),
 * health/risk/mission/watch-kind chips, stat cards, evidence chips and
 * progress bars. Presentation only; all state lives in ./state.tsx.
 */
import type { JSX } from "react";

import { platformOf, type MissionStatus, type PlatformId, type SkillRisk, type StoreHealth, type WatchEventKind } from "./data.js";

/** The platform glyph tile (tone via the cmcc-tone-* host CSS classes). */
export function PlatformGlyph({ platform, size = "md" }: { readonly platform: PlatformId; readonly size?: "sm" | "md" | "lg" }): JSX.Element {
  const platform_ = platformOf(platform);
  return (
    <span className={`cmcc-glyph cmcc-glyph--${size} cmcc-tone-${platform_.tone}`} aria-hidden>
      {platform_.glyph}
    </span>
  );
}

const HEALTH_CHIP: Readonly<Record<StoreHealth, string>> = {
  healthy: "cm-chip cm-chip-ok",
  attention: "cm-chip cm-chip-warn",
  syncing: "cm-chip cm-chip-muted",
};

export function HealthBadge({ health }: { readonly health: StoreHealth }): JSX.Element {
  return <span className={HEALTH_CHIP[health]}>{health}</span>;
}

const RISK_CHIP: Readonly<Record<SkillRisk, { readonly cls: string; readonly label: string }>> = {
  "read-only": { cls: "cm-chip cm-chip-muted", label: "read-only" },
  "acts-with-approval": { cls: "cm-chip cm-chip-warn", label: "acts with approval" },
  autonomous: { cls: "cm-chip cm-chip-ok", label: "autonomous" },
};

export function SkillRiskChip({ risk }: { readonly risk: SkillRisk }): JSX.Element {
  const meta = RISK_CHIP[risk];
  return <span className={meta.cls}>{meta.label}</span>;
}

export function DecisionRiskChip({ risk }: { readonly risk: "low" | "medium" | "high" }): JSX.Element {
  return (
    <span className={risk === "low" ? "cm-chip cm-chip-muted" : "cm-chip cm-chip-warn"}>
      {risk} risk
    </span>
  );
}

const MISSION_CHIP: Readonly<Record<MissionStatus, { readonly cls: string; readonly label: string }>> = {
  running: { cls: "cm-chip cm-chip-ok", label: "running" },
  "in-review": { cls: "cm-chip cm-chip-warn", label: "in review" },
  "awaiting-approval": { cls: "cm-chip cm-chip-warn", label: "awaiting you" },
  done: { cls: "cm-chip cm-chip-ok", label: "done" },
};

export function MissionBadge({ status }: { readonly status: MissionStatus }): JSX.Element {
  const meta = MISSION_CHIP[status];
  return <span className={meta.cls}>{meta.label}</span>;
}

const WATCH_KIND_CHIP: Readonly<Record<WatchEventKind, string>> = {
  heartbeat: "cm-chip cm-chip-ok",
  anomaly: "cm-chip cm-chip-warn",
  heal: "cm-chip cm-chip-ok",
  review: "cm-chip cm-chip-muted",
  dispatch: "cm-chip cm-chip-muted",
  connect: "cm-chip cm-chip-ok",
};

export function WatchKindChip({ kind }: { readonly kind: WatchEventKind }): JSX.Element {
  return (
    <span className={`cmcc-kind-chip ${WATCH_KIND_CHIP[kind]}`}>
      {kind === "heal" ? "self-heal" : kind}
    </span>
  );
}

/** One evidence chip — monospace, bordered, exactly what the lane recorded. */
export function EvidenceChip({ children }: { readonly children: string }): JSX.Element {
  return <span className="cmcc-evidence">{children}</span>;
}

/** A 0–100 progress bar (role=presentation; the value is printed beside it). */
export function ProgressBar({ value }: { readonly value: number }): JSX.Element {
  return (
    <span className="cmcc-progress" role="presentation">
      <span className="cmcc-progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

/** Compact metric tile (label, value, delta — the approved brief numbers). */
export function StatTile({
  label,
  value,
  delta,
  up,
}: {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly up: boolean | null;
}): JSX.Element {
  return (
    <div className="cmcc-stat">
      <p className="cmcc-stat-label">{label}</p>
      <div className="cmcc-stat-row">
        <span className="cmcc-stat-value">{value}</span>
        {up === null ? (
          <span className="cm-chip cm-chip-muted">{delta}</span>
        ) : (
          <span className={up ? "cmcc-delta cmcc-delta-up" : "cmcc-delta cmcc-delta-down"}>
            {up ? "▲" : "▼"} {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/** A small mono label (section eyebrows, telemetry words). */
export function MonoLabel({ children }: { readonly children: string }): JSX.Element {
  return <span className="cmcc-mono-label">{children}</span>;
}
