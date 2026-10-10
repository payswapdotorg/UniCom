# W1-011 — route/surface discovery manifest (J19): every journey has a visible host entry

Branch `work/w1-011` @ 39e30fe (evidence run `w1-011-commerce-evidence-2026-10-10T111145946Z`,
buildCommit `ad5ff66`, tree clean at capture, vite dev server only — no ZCode
server, real headless chromium 153.0.8010.12 via playwright 1.63.0).

Laws this manifest records (pinned by the evidence run, 29/29 PASS):

- **Ordinary-flow discovery**: the host is reached from the ordinary app
  landing `/` (the honest connect wall, no server behind it) by the visible
  button **“UNiCOM Commerce → (demo, no connection needed)”** → `/commerce`
  (title “UNiCOM Commerce — Demo”). Zero deep links for discovery.
- **Every journey family is visible from `/commerce` home** (19 rows, each
  with an `Open`/`View status` button, aria-label `Open <family> (J<N>)`) and
  **from Explore** (19 cards in the 7 canonical taxonomy groups).
- **Rendered status is honest per journey**: on THIS branch only J18 and J19
  are ready (W1-owned modules); the other 17 render in-development panels
  naming the owning lane — never a dead end, never a fake control.
- **Role/context model**: the host is demo mode with default roles Buyer +
  Merchant (multi-hold allowed, emphasis-only switching, visibly blocked
  actions name the missing permission AND its holder roles by human title).
  Both ready modules declare all 10 roles → no role gate on them today;
  owning lanes declare their modules' `roles`/permission gates at delivery.

> **Merged-lineage note**: the per-journey “rendered status” below reflects
> THIS branch only. When W2-012 (J1–J9, J14, J5 buyer side) and W3-015
> (J10–J13, J15–J17, J5 merchant side) land, the counts and chips update
> registry-derived (the shell derives “N of the 19…” from
> `resolveJourneyCoverage`, robust at 2/10/17/19 coverage — commit a5930a8).
> That update is recorded at TL acceptance, not here.

## The 19 journeys

| ID | Family | Visible host entry (from `/commerce` home) | Explore group | Roles / context | Rendered status on this branch | Evidence |
|----|--------|--------------------------------------------|---------------|-----------------|-------------------------------|----------|
| J1 | Buyer Intent Canvas | Journey list row 1 → `View status` → `/commerce/j/J1` | Buy | Demo mode, default Buyer+Merchant; module roles TBD by owning lane | **In development** — honest panel naming lane W2-012, with working exits (Explore related / Back) | `evidence/02-commerce-home.png`, `evidence/03-explore.png`, `evidence/05-journey-J1-in-development.png` |
| J2 | Offer sourcing and comparison | Journey row → `View status` → `/commerce/j/J2` | Buy | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J3 | Buy now vs wait, negotiation, substitution | Journey row → `View status` → `/commerce/j/J3` | Buy | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J4 | Group buying — discovery, join, leave | Journey row → `View status` → `/commerce/j/J4` | Discover | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J5 | Latent-demand group buys (buyer + merchant sides) | Journey row → `View status` → `/commerce/j/J5` | Discover | as above | In development — W2-012 + W3-015 (both sides named) | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J6 | Rent or borrow vs buy | Journey row → `View status` → `/commerce/j/J6` | Buy | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J7 | Resale, rental and consignment of owned items | Journey row → `View status` → `/commerce/j/J7` | Discover | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J8 | Proactive economic opportunities | Journey row → `View status` → `/commerce/j/J8` | Discover | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J9 | Bounded multi-hop trades (TradeCycle) | Journey row → `View status` → `/commerce/j/J9` | Discover | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J10 | Merchant commerce lifecycle | Journey row → `View status` → `/commerce/j/J10` | Sell | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J11 | Supplier procurement and receiving | Journey row → `View status` → `/commerce/j/J11` | Operate | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J12 | B2B and multi-location commerce | Journey row → `View status` → `/commerce/j/J12` | Operate | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J13 | Autonomous store policies | Journey row → `View status` → `/commerce/j/J13` | Automate | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J14 | Commerce Twin what-if | Journey row → `View status` → `/commerce/j/J14` | Automate | as above | In development — W2-012 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J15 | Connected commerce channels and live commerce | Journey row → `View status` → `/commerce/j/J15` | Connect | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J16 | Physical, no-RFID supermarket operations | Journey row → `View status` → `/commerce/j/J16` | Operate | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J17 | Trust, security and recourse | Journey row → `View status` → `/commerce/j/J17` | Protect | as above | In development — W3-015 | `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J18 | Failure, unknown and recovery states | Journey row → `Open` → `/commerce/j/J18` mounts the module (the module's own nav path `/commerce/states` also resolves via the router) | Protect | Module declares all 10 roles, nav entry sets no `requiredRoles` → no role gate; shared state components consumed by both feature lanes | **Ready** — module `host-states` (owner W1-011): loading/empty/error(≠unknown)/offline phases + preserved lifecycle states (OFFERED…COMPLETED), DEMO-labelled fixtures, Back works | `evidence/04-states-J18.png`, `evidence/02-commerce-home.png`, `evidence/03-explore.png` |
| J19 | Feature discoverability (Explore) | Header nav `Explore` → `/commerce/explore` (the reference module itself); also journey row `Open` → `/commerce/j/J19` | Discover | Module declares all 10 roles, nav entry sets no `requiredRoles` → no role gate | **Ready** — module `reference-explore` (owner W1-011): all 7 taxonomy groups, 19 cards, honest availability chips (2 available / 17 coming-soon naming lanes), mode honesty line | `evidence/03-explore.png`, `evidence/02-commerce-home.png` |

## How the row counts are kept honest (registry-derived, not hardcoded)

The home surface renders “{readyCount} of the 19 journey families are
rendered right now” from `resolveJourneyCoverage()` over the live module
registry, and every chip derives from each module's `status` — so the merged
lineage's W2/W3 modules flip their journeys to ready without touching the
shell (the shell tests derive counts the same way; commit a5930a8 pinned them
robust at 2/10/17/19 coverage). The System surface shows the same numbers plus
the registry and its zero contract warnings (`evidence/08-system.png`).

## Related artifacts

- Machine-readable evidence manifest: `commerce-evidence-manifest.json`
  (valid=true, 27/27 pointers resolve, denominator zero drift, 29/29 PASS).
- Walk evidence: `evidence/01…09 *.png` + per-step body/console `.txt`
  (landing connect wall → discovery click → home → Explore → J18 → J1 panel →
  roles initial/finance-held → system → after reset).
- Attempt-1 vite-dev OOM record (kept per the honest-ledger law):
  `evidence/attempt-1-vite-dev-oom/`.
- Build smoke: `VITE-BUILD-SMOKE-RECORD.md` (BLOCKED — pod OOM, 5 attempts,
  decision request for TL acceptance).
