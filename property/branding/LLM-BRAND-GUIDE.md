# Watchdog Brand Guide for LLMs and Coding Agents

Read this before editing any Watchdog page, component, article, dashboard, email template, chart, or marketing surface.

## What Watchdog is

Watchdog is a New Jersey property-intelligence product. It serves ordinary homeowners and professional users who need deeper property, tax, market, assessment, and workflow intelligence.

The product should feel precise, modern, calm, trustworthy, and useful. It should not feel like a generic AI startup template or an aggressive lead-generation funnel.

## Highest-priority rules

1. Show useful property information before the sales pitch.
2. Prefer clarity and hierarchy over visual decoration.
3. Use the existing Watchdog blue/navy system. Do not invent a new accent palette.
4. Use Plus Jakarta Sans for display and Inter for product UI/body text on new product surfaces.
5. Keep cards quiet: white surfaces, restrained borders/shadows, 10–18px radii, generous spacing.
6. Avoid excessive gradients, glowing backgrounds, glassmorphism, pill spam, colored side stripes, and decorative outlines.
7. Do not use an icon beside every line of copy.
8. Mobile must feel intentionally designed as an app, not merely stacked desktop content.
9. Protect developer-only and paid functionality with server-verified access rules, not CSS hiding alone.
10. Do not add `?v=` query-string version numbers to new CSS or JavaScript references.
11. **Never use the legacy vertical property sidenav.** New and redesigned pages must use the current Watchdog navigation shell or an approved modern page-specific shell.

## Canonical colors

- Background: `#f5f7fb`
- Surface: `#ffffff`
- Ink: `#111d38`
- Text: `#31435c`
- Muted: `#748198`
- Subtle: `#8794a7`
- Line: `#e2e7ef`
- Soft: `#edf1f6`
- Primary blue: `#2f6df6`
- Primary dark/navy: `#183b84`
- Primary soft: `#e9f0ff`
- Success: `#18a966`
- Warning: `#f5a20a`
- Danger: `#e34f5f`

Semantic colors are not decorative colors. Red, amber, and green need actual meaning.

## Typography

### New product UI

- Display/headings: **Plus Jakarta Sans**, 600–800
- Body/UI: **Inter**, 400–800

### Existing exceptions

Some public content still uses Source Sans 3 and Playfair Display. Maintain those where required, but do not introduce Playfair into dashboards, forms, data tools, or dense SaaS interfaces.

### Hierarchy

- H1: `clamp(28px, 3vw, 42px)`, weight 800, tight tracking
- H2: `clamp(24px, 2.4vw, 34px)`, weight 800
- H3: about 20px, weight 700
- Body: 14–16px, line-height about 1.55–1.65
- Small supporting copy: normally 12px+
- Kicker: 10px, uppercase, weight 800, tracking around `.11em`

Do not create tiny unreadable secondary labels merely to make a dashboard look dense.

## Spacing and shape

Base spacing unit: 4px.

Preferred spacing tokens: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

Preferred radii:

- 8px: compact
- 10px: buttons/inputs
- 12px: standard cards/controls
- 18px: large panels/drawers/modals
- 999px: status pills only

Use whitespace before adding more containers.

## Buttons

Primary: Watchdog blue fill, white text, 10px radius.

Secondary: white background, subtle line, dark text.

Tertiary: text/icon treatment with a quiet hover background.

Destructive: danger color only for a genuinely destructive action.

Desktop controls should generally be at least 42px tall. Primary mobile controls should preferably be 52px tall.

## Cards and panels

Use white surfaces with subtle borders or shadows. Avoid nesting many cards inside cards. A card should represent meaningful grouping, not simply decorate every block of text.

Prefer:

- clear title
- optional one-line explanation
- data/content
- one obvious next action

Avoid:

- colored stripe on every card
- floating decorative badges
- multiple gradients per panel
- thick outlines
- oversized drop shadows

## Navigation

Navigation is quiet until active. Active items may use a primary-soft background with blue/dark text. Developer links remain hidden unless developer access is server-confirmed.

### Current shell rule

The old fixed/collapsible dark vertical property sidenav is retired and prohibited. Do not load, copy, recreate, or visually imitate the legacy sidebar defined by `/property/partials/sidemenu.html` or its `.db-sidebar` presentation.

For current product work:

- The Dashboard uses its current 2027 dashboard navigation.
- Property Home uses its current 2027 Home navigation.
- Supported secondary pages use `/property/css/app-shell-2027.css` and `/property/js/app-shell-2027.js`.
- A purpose-built modern header/navigation may be used for a specialized page, but it must not fall back to the retired vertical rail.
- If a page is not yet migrated to a current shell, render it without the retired sidebar rather than reintroducing legacy navigation.
- When creating a new route, explicitly choose its current navigation pattern before considering the page complete.

The shared `/property/js/sidemenu.js` intentionally no longer fetches `/property/partials/sidemenu.html`. Do not restore that fallback.

The current brand mark is a Font Awesome dog icon in a 42px rounded tile using a `#183b84` to `#2f6df6` gradient, paired with the Watchdog wordmark.

## Charts and data

Every chart must answer a question. Include units, time period, source, and freshness where relevant.

Default series priority:

1. `#2f6df6`
2. `#183b84`
3. `#748198`
4. `#18a966`
5. `#f5a20a`
6. `#e34f5f`

Avoid 3D charts, unexplained axes, decorative gradients, and rainbow palettes. Never rely on red versus green alone.

## Motion

Motion should explain state change or continuity.

Typical durations:

- fast: ~160ms
- standard: ~240ms
- deliberate: ~320ms

Preferred easing: `cubic-bezier(.2,.8,.2,1)`.

Do not animate every card on page load. Respect `prefers-reduced-motion`.

## Photography and imagery

Prefer real New Jersey homes, towns, streetscapes, maps, and credible local context. Owned or properly licensed imagery is best; Unsplash is acceptable when appropriate.

Avoid obvious AI-generated homes, handshake stock photography, fake dashboards, and images that imply they show a specific property when they do not.

## Writing voice

Watchdog copy is plainspoken, specific, credible, helpful, and confident without hype.

Lead with the answer or useful fact. Explain technical tax and real-estate terms in normal language. State source limitations when needed.

Avoid:

- AI-writing tropes
- canned transitions
- fake excitement
- generic thought-leadership language
- phrases like “revolutionary,” “game-changing,” “ultimate,” or “unmatched” unless factually justified
- em dashes in published Watchdog editorial copy

Use action-oriented CTAs such as:

- View property
- Compare towns
- See full report
- Save property
- Upgrade to Pro

When a feature is gated, explain what the user gets by upgrading rather than presenting a dead end.

## Accessibility

Target WCAG 2.2 AA.

Always include visible focus states, semantic heading order, form labels, sufficient contrast, reduced-motion support, and non-color status cues. Charts need readable summaries or equivalent text where the data is not otherwise available.

## Access-control rule

Hiding UI is not authorization.

Protected Watchdog routes use `/property/js/access-guard.js` and server-side Supabase RPCs to establish developer or plan access. Preserve that pattern.

## Before committing a change

Ask:

- Does this look like the same product as the current Watchdog Dashboard and Home surfaces?
- Is the main task obvious above the fold?
- Did I add decoration with no information purpose?
- Are typography, spacing, color, and radii on-system?
- Am I using a current navigation shell rather than the retired vertical sidenav?
- Would a homeowner understand this?
- Would a professional trust this?
- Is mobile intentionally designed?
- Can a keyboard user complete the task?
- Does reduced motion still work?
- Did I accidentally expose internal or paid functionality?

## Machine-readable source

For exact tokens and structured rules, read:

`/property/branding/brand-system.json`

When this document and that JSON disagree, the JSON wins unless the user explicitly gives a newer instruction.