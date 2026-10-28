/**
 * command-center — the Stores section (W1-027): the connection hub + the
 * 3-step connect wizard.
 *
 * Ported from the approved console's StoresSection/ConnectDialog: connect
 * once, in one place; every connected store joins the watch ring. The wizard
 * walks platform picker → credentials/name form → progress (Authorize → Sync
 * → Watch) → the connected store joins the ring with its fabricated initial
 * catalog. Demo mode simulates the whole flow locally (zero network calls,
 * deterministic fabrication); live mode asks the commerce API to mint the
 * store (see state.tsx finishConnect).
 */
import type { JSX } from "react";

import { useEffect, useState } from "react";
import { PLATFORMS, platformOf, storeName } from "./data.js";
import type { PlatformId } from "./data.js";
import { useCommandCenter } from "./state.js";
import { HealthBadge, PlatformGlyph, ProgressBar } from "./ui.js";

const CONNECT_COPY: readonly { readonly title: string; readonly desc: string }[] = [
  {
    title: "Authorize",
    desc: "A secure OAuth window opens on the platform. You approve; we never see your password.",
  },
  {
    title: "Sync",
    desc: "We pull products, orders, and inventory into the ring — read-only until you grant more.",
  },
  {
    title: "Watch",
    desc: "Your store joins the nightly audit and the heartbeat strip. Agents can now act on it.",
  },
];

function StoreCard({ storeId }: { readonly storeId: string }): JSX.Element {
  const { state, actions } = useCommandCenter();
  const store = state.stores.find((entry) => entry.id === storeId);
  if (!store) return <></>;
  return (
    <article className="cmcc-card cmcc-store-card">
      <div className="cmcc-store-head">
        <div className="cmcc-store-ident">
          <PlatformGlyph platform={store.platform} />
          <div className="cmcc-store-titles">
            <h3 className="cmcc-store-name">{store.name}</h3>
            <p className="cmcc-store-meta">
              {store.domain} · {platformOf(store.platform).name}
            </p>
          </div>
        </div>
        <HealthBadge health={store.health} />
      </div>
      <div className="cmcc-store-stats">
        <div className="cmcc-stat-tile">
          <p className="cmcc-stat-tile-value">{store.products.toLocaleString("en-US")}</p>
          <p className="cmcc-stat-tile-label">products</p>
        </div>
        <div className="cmcc-stat-tile">
          <p className="cmcc-stat-tile-value">{String(store.orders7d)}</p>
          <p className="cmcc-stat-tile-label">orders 7d</p>
        </div>
        <div className="cmcc-stat-tile">
          <p className="cmcc-stat-tile-value">${(store.revenue7d / 1000).toFixed(1)}k</p>
          <p className="cmcc-stat-tile-label">revenue 7d</p>
        </div>
      </div>
      <div className="cmcc-store-delta">
        <span>
          vs last week{" "}
          <span className={store.delta7d >= 0 ? "cmcc-delta-up" : "cmcc-delta-down"}>
            {store.delta7d >= 0 ? "+" : ""}
            {store.delta7d}%
          </span>
        </span>
        <span>
          synced {store.lastSync} · audit {store.lastAudit}
        </span>
      </div>
      <div className="cmcc-store-budget">
        <span className="cmcc-store-budget-label">API budget</span>
        <ProgressBar value={store.apiUsage} />
        <span className="cmcc-store-budget-value">{store.apiUsage}%</span>
      </div>
      <div className="cmcc-store-skills">
        {store.installedSkills.length === 0 ? (
          <button type="button" className="cmcc-linklike" onClick={() => actions.setSection("skills")}>
            + install skills
          </button>
        ) : (
          store.installedSkills.map((skillId) => (
            <span key={skillId} className="cm-chip cm-chip-muted">
              {skillId}
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function ConnectProgress({ platform, step }: { readonly platform: string; readonly step: number }): JSX.Element {
  const platform_ = platformOf(platform as PlatformId);
  return (
    <div className="cmcc-stack">
      <div className="cmcc-connect-head">
        <PlatformGlyph platform={platform_.id} />
        <div>
          <p className="cmcc-connect-title">Connecting {platform_.name}…</p>
          <p className="cmcc-connect-scope">oauth · scope: read_products, read_orders</p>
        </div>
      </div>
      <ol className="cmcc-connect-steps">
        {CONNECT_COPY.map((copy, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li key={copy.title} className={`cmcc-connect-step${done ? " cmcc-connect-step--done" : active ? " cmcc-connect-step--active" : ""}`}>
              <span className="cmcc-connect-mark" aria-hidden>
                {done ? "✓" : ""}
              </span>
              <span>
                <span className="cmcc-connect-step-title">
                  {copy.title}
                  {active ? "…" : done ? " ✓" : ""}
                </span>
                <span className="cmcc-connect-step-desc">{copy.desc}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The 3-step connect wizard (approved interaction model, demo-simulated). */
function ConnectDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const { state, actions } = useCommandCenter();
  const [picked, setPicked] = useState<PlatformId | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const { connecting } = state;

  // Drive the wizard's progress like the approved design: each step advances
  // after 900ms; once all three are done, the store lands after 250ms.
  useEffect(() => {
    if (!connecting) return;
    if (connecting.step >= CONNECT_COPY.length) {
      const platform = connecting.platform as PlatformId;
      const timer = window.setTimeout(() => {
        actions.finishConnect({
          platform,
          name: name || `My ${platformOf(platform).name} store`,
          domain: domain || `my-store.${platformOf(platform).id}.com`,
        });
        setPicked(null);
        setName("");
        setDomain("");
      }, 250);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => actions.advanceConnect(), 900);
    return () => window.clearTimeout(timer);
  }, [connecting, actions, name, domain]);

  if (!open) return <></>;
  return (
    <div className="cmcc-dialog-overlay">
      <div className="cmcc-dialog" role="dialog" aria-modal="true" aria-label="Connect a store" data-testid="cmcc-connect-dialog">
        <div className="cmcc-dialog-head">
          <h3 className="cmcc-dialog-title">Connect a store</h3>
          <button type="button" className="cmcc-toast-dismiss" aria-label="Close the connect dialog" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="cmcc-section-note">
          OAuth in, read-first. Skills only get write access when you approve their decisions.
        </p>
        <p className="cmcc-section-note">
          <span className="cm-demo-tag">DEMO</span> demo mode simulates the connect locally — no
          OAuth window opens, no network call is made; the initial catalog is fabricated
          deterministically.
        </p>
        {connecting ? (
          <ConnectProgress platform={connecting.platform} step={connecting.step} />
        ) : !picked ? (
          <div className="cmcc-platform-grid">
            {PLATFORMS.map((platform) => (
              <button key={platform.id} type="button" className="cmcc-platform-tile" onClick={() => setPicked(platform.id)}>
                <PlatformGlyph platform={platform.id} />
                <span className="cmcc-platform-name">{platform.name}</span>
                <span className="cmcc-platform-catalog">{platform.catalog}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cmcc-stack">
            <div className="cmcc-connect-picked">
              <PlatformGlyph platform={picked} />
              <div>
                <p className="cmcc-connect-title">{platformOf(picked).name}</p>
                <p className="cmcc-store-meta">{platformOf(picked).catalog}</p>
              </div>
            </div>
            <div className="cmcc-stack">
              <div className="cmcc-field">
                <label htmlFor="store-name" className="cmcc-field-label">
                  Store name
                </label>
                <input
                  id="store-name"
                  className="cmcc-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={`My ${platformOf(picked).name} store`}
                />
              </div>
              <div className="cmcc-field">
                <label htmlFor="store-domain" className="cmcc-field-label">
                  Domain (optional)
                </label>
                <input
                  id="store-domain"
                  className="cmcc-input"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="mystore.com"
                />
              </div>
            </div>
            <div className="cmcc-row">
              <button type="button" className="cm-button" onClick={() => setPicked(null)}>
                Back
              </button>
              <button
                type="button"
                className="cm-button cm-button-primary"
                onClick={() => actions.startConnect(picked)}
              >
                Authorize {platformOf(picked).name}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StoresSection(): JSX.Element {
  const { state, actions } = useCommandCenter();
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const filtered = state.stores.filter(
    (store) =>
      store.name.toLowerCase().includes(query.toLowerCase()) ||
      store.domain.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="cmcc-section" aria-label="Stores — connection hub" data-testid="cmcc-section-stores">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Stores</h2>
        <p className="cmcc-section-sub">
          {state.stores.length} connected · one ring, one catalog, one watch{" "}
          <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>
      <div className="cmcc-row">
        <input
          className="cmcc-input cmcc-input--search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stores…"
          aria-label="Search stores"
        />
        <button type="button" className="cm-button cm-button-primary" onClick={() => setConnectOpen(true)}>
          Connect a store
        </button>
      </div>
      <div className="cmcc-store-grid">
        {filtered.map((store) => (
          <StoreCard key={store.id} storeId={store.id} />
        ))}
      </div>
      <div className="cmcc-card cmcc-card--dashed">
        <p className="cmcc-dashed-title">More stores, one command center</p>
        <p className="cmcc-section-note">
          Every platform you connect joins the same ring: shared watch, shared agent pool, shared
          evidence trail. Connect your next store in under a minute.
        </p>
        <button type="button" className="cm-button" onClick={() => setConnectOpen(true)}>
          Connect another store
        </button>
      </div>
      {state.stores.length === 0 ? (
        <p className="cmcc-section-note">
          No stores connected yet — {storeName("halcyon")} and the other seeds reset with the demo
          fixtures.
        </p>
      ) : null}
      <ConnectDialog
        open={connectOpen}
        onClose={() => {
          actions.cancelConnect();
          setConnectOpen(false);
        }}
      />
    </section>
  );
}
