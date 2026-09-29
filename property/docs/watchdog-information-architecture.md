# Watchdog information architecture

**Status:** Canonical navigation structure
**Date:** September 29, 2026
**Enforced by:** `property/tests/navigation-ia-contract.mjs`, `property/tests/universal-menu-contract.mjs`, `property/tests/agent-hub-contract.mjs` (workflow `.github/workflows/navigation-ia-contract.yml`)

Watchdog has about 226 routes. People should only ever need a handful of them. This document fixes the top-level destinations for the two audiences, says where every other page lives, and lists the pages that are duplicates or legacy. Every existing URL keeps working; de-cluttering is done by regrouping and demoting, not by deleting pages.

Public URLs are clean and root-level on `https://www.watchdogindex.com` (for example `/agent-desk`). `/property/...` below only ever means a physical file in this repository.

## 1. Two audiences, five destinations each

The shared Watchdog menu (the drawer) has two lenses, **My home** and **My work**. Each lens leads with five destinations. Five is deliberate: each lens maps one-to-one to the tab bar of the future native app for that audience.

### Agents and professionals: My work

For real-estate agents (profile role agent/realtor, or Developer), My work is exactly the five **Agent Desk areas**. The Agent Desk (`/agent-desk`) is the agent's front door; every agent tool lives in one of its areas and opens inside the desk.

| Menu label | Opens | Agent Desk area / app tab | What lives here |
|---|---|---|---|
| Agent Desk | `/agent-desk` | Today | First-visit welcome, quick start, Due soon, Who to reach out to (worklist), Monday email, Training & how-tos (`/agent/training`) |
| Clients | `/agent-desk#clients` | Clients | **Your people:** Contacts (`/agent/contacts`), Add homes to watch, sphere coverage, Client Move seats, Tax checkups. **Your deals:** Transactions (`/transaction/`), Listing Prep (`/agent/listing-prep`), Buyer Shortlists (`/agent/buyers`), Open Houses (`/agent/open-house`), True Cost Card (`/true-cost`), Coming up. Client-facing pages: Client Room (`/client-room`), shared transaction (`/transaction/shared`), open-house check-in (`/open-house`). |
| Farm | `/agent-desk#farm` | Farm | Farm Map (`/farm-map`), Farm Builder (`/farm-builder`), Farm Lists (`/market-list`), territories |
| Marketing | `/agent-desk#marketing` | Marketing | Postcard Studio (`/marketing-studio/postcards`), Email Updates (`/newsletter-studio`), Farm Reports (`/report-studio`, opened from a farm list), Report Builder (`/report-builder`), Marketing Plan (`/marketing-plan`, Pro), Playbooks (`/growth/`), your agent page (`/agent/<your-name>`), results |
| Research | `/agent-desk#research` | Research | Property Lookup (`/`), Appeal Scanner (`/scan`, Pro+), Town Compare (`/town-compare`), Data Workbench (`/data-workbench`), Data Center (`/data-center`), browser extension key |

Transactions, Data Workbench, Data Center and the Appeal Scanner are not separate menu rows for agents any more; they are inside Clients and Research.

For **other professionals** (attorneys, appraisers, lenders, investors) and signed-out visitors, My work keeps their research tools: Appeal Scanner (Pro+), Transactions (Agent plan and up), Data Workbench (Agent plan and up), Data Center, and **Plans & Pricing** (`/pro`, formerly labelled "Professional Hub"; it is the plans page). Tools the viewer's plan does not include are listed with the plan they need.

### Homeowners: My home

| Menu label | Opens | Suggested app tab | What it is for |
|---|---|---|---|
| Dashboard | `/dashboard` | Today | Daily overview of saved homes, notifications and Watchdog Intelligence |
| Property Lookup | `/` | Search | Search any New Jersey address |
| Property Home | `/home` | My Home | One saved home in depth, with its tools |
| Property Pulse | `/pulse` | Updates | What is changing near your home |
| ANCHOR Applications | `/anchor/applications/` | Relief | NJ property tax relief applications and results |

Below them, a quieter **Learn and compare** group: Town Compare (`/town-compare`) and ROBUST Framework (`/robust/`, how the Watchdog Score works; Fairness at `/fairness` lights up this row).

**Account** (`/account`) sits under both lenses. The profile menu (avatar) holds Edit profile & role, Invite others, Account & billing, Training Center (agents and paid plans only), Property Home, and Developer tools for Developer accounts.

## 2. Where everything else lives

These pages are reachable from the destinations above, from search, or from the site footer and sitemap, but are not menu rows.

- **Public product and SEO pages:** `/pro`, `/teams`, `/for/real-estate-agents`, `/real-estate-agents` and the other profession pages, `/agents/trial`, `/agent`, `/lender`, `/attorney`, `/investor`, `/alternatives/*`, `/compare/*`, `/pricing/*`, `/guides/*`, `/statistics/*`, `/insights/*`, `/plays/*`, `/glossary`, `/faq`, `/robust/*`, `/whitepapers/*`, `/data-methodology`, `/data-use`, `/trust`, `/status`, `/support`, `/contact`, legal pages, `/towns/*`, public property pages (`/nj/<town>/<address>/<pin>`), `/checkup`, `/move`.
- **Homeowner calculators and guides:** property-tax estimator, appeal savings, senior benefits, benefit stacking, added assessments, home value, mortgage, buying cost, transfer fee, rent-tax calculators, and the plain-English guides. Linked from Property Lookup, Property Home and Insights.
- **Watchdog Intelligence:** `/intelligence`, `/intelligence/daily`, `/intelligence/team`. Reached from the Intelligence surfaces on Dashboard, Property Home and Agent Desk Today, not as a top-level row.
- **Professional extras:** `/workbench` (Pro case workspace), `/integrations`, `/integrations/zapier`, `/help/professional-tools`, `/tools` (per-property tool index, opened from Property Home), `/account/professional-profile`, `/agent/extension/connect`.
- **Internal and developer:** `/developer/*`, `/developer-data`, `/analytics/*`, `/logs/*`, `/backoffice/*`, `/diagnostics`, `/verification-diagnostics`, `/updates`, `/branding`, `/compliance`, `/marketing-studio/admin`, `/intelligence/calibration*`, `/intelligence/learning`, `/intelligence/operations`, `/intelligence/review`, `/sales-desk` (commission consultants). Developer tools are in the profile menu for Developer accounts only.

## 3. Duplicates, legacy pages and renames

No page was deleted and **no new redirects were added**: every remaining page still has a job, and the URLs that were truly superseded (`.html` variants, `/property/faq*`, `/property/privacy` and the other legal pages, old NJPropertyTaxRelief tool pages on the Watchdog host) already redirect in `vercel.json` and `middleware.js`.

| Page | Status | Where people go instead |
|---|---|---|
| Agent Desk "Deals" section (`/agent-desk#deals`) | Folded into Clients | `#deals` still works and opens Clients at "Your deals" |
| Agent Desk "Home" tab | Renamed | "Today" (section key stays `home`) |
| `/pro` menu row "Professional Hub" | Renamed | "Plans & Pricing" |
| `/farm-builder` "Advanced Farm" / "Farm by filters" | Renamed | "Farm Builder" everywhere |
| `/market-list` "Farm" / "Farm list" | Renamed | "Farm Lists" |
| `/growth/` "Growth" / "Growth Center" | Renamed in navigation | "Playbooks" |
| `/marketing-studio/postcards` "Mailers & postcards" | Renamed | "Postcard Studio" |
| `/report-builder` "Client reports", `/report-studio` "Farm reports" | Renamed | "Report Builder" and "Farm Reports", both under Marketing |
| Agent workspace tabs (Agent Desk, Farm Map, Growth, Advanced Farm) | Retired | Breadcrumb: Agent Desk / Farm / Farm Map |
| Agent workflow tabs "Today" and the "Marketing: coming soon" button on Contacts | Retired | Breadcrumb back to the desk; Marketing is live on the desk |
| `/marketing-studio` wizard (audience, design, customize, recipients, review) | Demoted | Postcard Studio is the default; the wizard stays for the Data Workbench hand-off |
| `/agent/contacts` and `/agent/training` | Physical duplicates | The same page ships at `agent/…` and `property/agent/…` in the repo; keep both copies identical; the public URL is `/agent/contacts`, `/agent/training` |
| `property/partials/sidemenu.html`, `property/sidemenu.html` | Retired legacy sidebar | `property/js/sidemenu.js` only hides the old `#property-side-menu` slot and loads the modern shell; the drawer is the menu |
| Root `sidemenu.html`, `sidemenu.js`, `nav.html` | NJPropertyTaxRelief.com | Separate active site; not part of Watchdog navigation |
| `agent/shared/page-template.html` | Legacy reference | Still shows staged "coming soon" rows; new agent pages use the breadcrumb pattern in section 5 |
| `/dashboards`, `/property-analysis` | Developer-only analysis pages | Not in navigation |
| `/dashboard-preview`, `/onboarding-preview`, `/preview`, `/preview/home` | Internal previews | Not in navigation |
| `/faq.html` style legacy FAQ and `/data-sources.html` | Legacy | `/faq`; data status lives in Data Center and `/status` |

## 4. Navigation surfaces

| Surface | Source | Pages |
|---|---|---|
| Watchdog menu (drawer) and profile menu | `property/js/watchdog-universal-menu.js` (canonical destinations, `AGENT_AREAS`, lenses, active state) | Every page with a menu: loaded by `public-nav.js`, `app-shell-2027.js`, `brand-consistency-runtime.js`, `home.js`, or directly on SEO pages |
| App top bar and page bar | `property/js/app-shell-2027.js` | Dashboard, Agent Desk and agent tools, Account, Town Compare, Fairness, Transactions, Integrations, Scan, Data Workbench. Pages that ship their own breadcrumb header skip the generic page bar |
| Public header | `#wd-nav` in public pages, `property/partials/nav.html` | `/`, `/pro`, `/teams`, `/faq`, `/insights`, calculators, `/contact` |
| Agent Desk rail and phone tab bar | `property/agent-desk/index.html`, `property/js/agent-hub.js` | `/agent-desk` |
| Agent tool breadcrumb | `.wd-crumbs` markup in each page, `property/css/watchdog-page-head.css`; rendered by `property/js/agent-workspace.js` inside the workspace bar | Every agent tool (section 5) |
| Clients sub-navigation | `.ag-tabs` / `.awx-tabs` in the Clients tools | Listing Prep, Buyer Shortlists, Open Houses, Contacts, Transactions |

The active state is computed once, in the menu: an agent tool page lights up its area (Farm Map lights up Farm), and on the desk the hash picks the area.

Shared chrome renders through one idempotent helper (`renderChrome` in `watchdog-universal-menu.js`): a node is rewritten only when the menu's own markup changed or another script replaced it, so rows other runtimes add (the ANCHOR profile row) never start a re-render loop. Shared chrome also holds the board floor: 12px minimum text and 44px minimum controls in the top bar, page bar, drawer, profile, notifications and cookie banner.

## 5. Adding an agent tool

1. Pick one of the five areas. Add the tool's clean path to that area's `paths` in `AGENT_AREAS` (`watchdog-universal-menu.js`).
2. Add a card to that area on the Agent Desk with a canonical name and one plain sentence on what it does and why it matters, and add the same name to `TOOLS` in `agent-hub.js`.
3. Give the page the breadcrumb header, clean URLs only, and load `/property/css/watchdog-page-head.css`:

   `<- Agent Desk  /  <Area>  /  <Tool name>`

4. Run `node property/tests/navigation-ia-contract.mjs` and `node property/tests/agent-hub-contract.mjs`.

## 6. Naming

Menu and card labels are plain nouns in title case: Agent Desk, Clients, Farm, Marketing, Research, Farm Map, Postcard Studio, Report Builder. Product names follow `property/docs/watchdog-brand-architecture.md`: the **Watchdog Score, powered by the ROBUST Framework**, and **Watchdog Intelligence** (never "Intel"). In customer-facing HTML only the word *Intelligence* carries the spectrum text treatment.
