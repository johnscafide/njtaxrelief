# Watchdog Repository Agent Instructions

These instructions are persistent project rules for any ChatGPT, Codex, automation, or coding agent working in this repository.

## Production domain and public URL architecture

- Watchdog's primary production domain is **https://www.watchdogindex.com**.
- `https://watchdogindex.com` redirects to the `www` host.
- Public Watchdog page URLs are **root-level**. Examples:
  - `/`
  - `/dashboard`
  - `/home`
  - `/pro`
  - `/insights`
  - `/data-center`
  - `/fairness`
  - `/town-compare`
- Do **not** intentionally expose `/property/` in new public Watchdog links, canonical URLs, Open Graph URLs, structured-data URLs, share links, marketing links, or customer-facing navigation.

## Physical repository structure

- The Watchdog application may continue to live physically under `/property/` in this repository.
- `/property/` is an **implementation detail**, not the preferred public URL namespace on WatchdogIndex.
- It is valid for implementation assets to remain under paths such as:
  - `/property/js/`
  - `/property/css/`
  - `/property/assets/`
  - `/property/data/`
  - `/property/partials/`
- Do not physically move or rename the `/property/` application tree merely to make public URLs look clean. The routing layer is responsible for the public root-level URL architecture.
- When adding a new Watchdog page under `/property/`, also ensure the clean root-level WatchdogIndex route works and that any route-sensitive JavaScript recognizes the clean public pathname.

## Legacy/coexisting site

- **NJPropertyTaxRelief.com remains an active separate site.** Do not assume it should redirect wholesale to WatchdogIndex.
- Both sites currently share infrastructure, including the same production Supabase project where appropriate.
- Do not make a global hostname replacement from `njpropertytaxrelief.com` to `watchdogindex.com` without classifying each occurrence first.
- Preserve legacy tax-relief routes, content, authentication compatibility, and existing user flows unless a task explicitly changes them.

## Authentication and Supabase coexistence

- Production Supabase project ref: `uvkvaxljhhngydvlrzom`.
- The Supabase Auth Site URL remains associated with NJPropertyTaxRelief.com for coexistence unless a deliberate later migration changes that decision.
- WatchdogIndex is supported through approved redirect URLs and origin-aware application code.
- New authentication flows on WatchdogIndex should return users to the WatchdogIndex host that initiated the flow.
- Do not change shared Supabase auth/domain configuration in a way that silently breaks NJPropertyTaxRelief.com.

## Domain-aware server/runtime behavior

- Billing checkout, Customer Portal returns, and report-sharing should preserve the approved initiating host rather than forcing every user to one shared frontend hostname.
- CORS/origin allowlists must remain explicit and limited to approved production/preview/local origins. Do not replace them with broad `*` policies for authenticated or billing functions.
- The WatchdogIndex routing/canonical adapter and Vercel routing layer are part of the production architecture. Check current `main` before modifying them.

## Billing launch safety

- Public paid checkout remains governed by the production `live_billing_lifecycle` release gate.
- Do not weaken, bypass, remove, or silently replace the database-backed fail-closed billing gate.
- Real Stripe Live acceptance requires real evidence. Never fabricate purchase, webhook, refund, cancellation, or entitlement evidence.

## Brand hierarchy

- **Watchdog** is the master platform brand.
- WatchdogIndex.com is the domain; it does not rename the platform to "Watchdog Index."
- Product hierarchy remains:
  - Watchdog
  - Watchdog Score
  - ROBUST Framework
  - Watchdog Index
  - Watchdog Atlas
  - Watchdog Intelligence
- Preferred methodology phrase: **"The Watchdog Score, powered by the ROBUST Framework."**
- Do not call it a "ROBUST Score."

## Watchdog Intelligence brand signature

These are persistent product-brand rules for every agent, automation, and future Watchdog chat.

- The canonical product name is **Watchdog Intelligence**. Do not introduce customer-facing replacements such as "Watchdog Intel," "Analyst Intel," "Watchdog Analyst Intel," or standalone "Intel" when referring to this product family.
- Subfeatures keep the master name attached. Examples: **Watchdog Intelligence Voice**, **Watchdog Intelligence Brief**, and **Watchdog Intelligence add-on**.
- Any customer-facing UI surface primarily representing Watchdog Intelligence may use the Intelligence visual signature on the **outer feature container only**: a rounded white surface with the rotating cyan → blue → violet → magenta border treatment already established on Dashboard and Property Home. Respect `prefers-reduced-motion`.
- In customer-facing HTML UI, keep **Watchdog** in the normal surrounding text color and render only the word **Intelligence** with the cyan → blue → violet → magenta spectrum text treatment. Reuse the shared `wd-intelligence-brand-word` treatment or its current centralized successor.
- Never turn the words **Watchdog Intelligence**, the word **Intelligence**, headings, sentences, or inline copy into pills, outlined capsules, rounded boxes, or mini bordered frames. The rotating border belongs to the outer Intelligence surface, not the text.
- Do not apply gradient text where HTML styling is impossible or inappropriate, such as source-code identifiers, plain-text logs, accessibility labels, database values, or Markdown-only technical documentation. In those contexts, still use the exact canonical words **Watchdog Intelligence**.
- Do not weaken accessibility to achieve the brand effect. Preserve readable fallbacks for print, reduced-motion behavior, focus states, and screen-reader labels.
- New Intelligence cards, dialogs, sheets, upsell gates, onboarding prompts, Voice surfaces, and profession-personalization surfaces must inherit this branding automatically whenever practical; do not require each future page to rediscover the styling independently.

## Operational logs and recaps

These rules apply to every new Watchdog build log, audit log, operating recap, handoff prompt, implementation summary, and internal navigation surface created after the WatchdogIndex domain cutover.

- Use **Watchdog** as the platform/master brand. Do not rename the platform to "Watchdog Index" in logs, recaps, handoffs, automation output, or operating documentation.
- Treat **https://www.watchdogindex.com** as the canonical Watchdog production host whenever a Watchdog URL is included.
- Use clean root-level Watchdog URLs in new navigation, handoff links, recap links, and operational references, for example `/dashboard`, `/developer`, `/logs`, `/logs/recap`, and `/logs/recap/YYYY-MM-DD`.
- Use `/property/...` only when explicitly referring to a physical repository/source path, implementation asset, or compatibility path. A physical file such as `property/logs/recap/YYYY-MM-DD/index.html` should be described as serving the clean Watchdog URL `https://www.watchdogindex.com/logs/recap/YYYY-MM-DD`.
- Do not rewrite old historical evidence merely to make it look current. Preserve historical hostnames and paths when they document what actually existed at that time, and label them as historical/legacy when useful.
- **NJPropertyTaxRelief.com remains a separate active site.** Do not describe the WatchdogIndex cutover as a wholesale rename or migration of that separate site.
- When a log or recap discusses the domain transition itself, distinguish the platform brand (**Watchdog**), the domain (**WatchdogIndex.com**), and the product family (**Watchdog Index**) correctly.
- New sitemap, crawler, canonical, SEO, share, and public-route evidence for Watchdog should use `www.watchdogindex.com` unless the evidence is intentionally validating coexistence or a legacy path.

## Playwright visual certification

Playwright is the canonical browser-level visual verification harness for Watchdog UI work.

- Global runner: `property/tests/global-visual-audit.mjs`.
- Global workflow: `.github/workflows/watchdog-global-playwright-audit.yml`.
- Authenticated staging runner: `property/tests/hosted-visual-acceptance.mjs` via `.github/workflows/hosted-visual-acceptance.yml`.
- Production deployments run the critical visual matrix automatically after a successful production deployment event.
- A scheduled full-site run executes daily. Full-site discovery combines every live Watchdog sitemap URL with every routable `property/**/index.html` page that is not an audit/log/archive/test artifact.
- Authenticated staging acceptance also runs daily and must retain its fail-closed staging-only Supabase rewrite. Never point authenticated automation at production Supabase merely to make visual testing easier.
- Manual global workflow scopes are `critical`, `public`, `all`, and `targeted`. Use `targeted` with explicit clean routes when validating a bounded UI change; use `all` when a change can affect shared navigation, typography, layout, tokens, routing, or other cross-page behavior.
- Deep/targeted checks cover 320px, 390px, 430px, 768px, 1440px, and mobile WebKit. Global sweeps cover representative mobile Chromium, desktop Chromium, and mobile WebKit so every discovered route is checked without making the full-site job impractically large.
- The runner records HTTP/navigation failures, public auth-gating, page JavaScript errors, empty public renders, and document-level horizontal overflow as hard failures. It separately records sub-12px text, sub-44px touch targets, clipped text, console errors, and failed requests as review findings.
- Evidence artifacts include full-page screenshots, machine-readable JSON, a Markdown run summary, and Playwright Trace Viewer ZIPs for failed deep/targeted checks.
- UI-affecting work should use the freshest relevant Playwright evidence before claiming browser/mobile certification. Do not claim a page is pixel/browser certified only from source inspection when Playwright evidence is available.
- Do not weaken, exclude, hide, or downgrade a real Playwright finding simply to make a workflow green. Fix the defect or document a specific evidence-backed exception.
- The global workflow begins in report-only mode for visual findings. Do not turn it into a required deployment gate until the baseline is demonstrably stable and the change is explicitly approved.

## Concurrency rule

Multiple Watchdog chats and automations may edit this repository concurrently.

**Immediately before every GitHub write:**
1. Re-fetch current `main`.
2. Re-fetch the current target file and its blob SHA.
3. Reconcile any intervening changes.
4. Never overwrite a concurrent change using stale content or a stale SHA.

## Migration/source-of-truth documents

Before changing domain/routing architecture, read the current versions of:

- `property/docs/watchdog-domain-launch-decision.md`
- `property/docs/watchdog-domain-cutover-runbook.md`
- `property/docs/watchdog-brand-architecture.md`

Linear launch-control issues also contain current evidence and decisions, especially NJW-271 and NJW-272.

## Core rule to remember

**WatchdogIndex public URLs are clean and root-level; `/property/` can remain the internal repository/application location. NJPropertyTaxRelief.com remains a separate active site sharing selected infrastructure.**
