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
