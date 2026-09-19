# Watchdog Agent Workspace

This directory is the canonical **product-shell design contract for Agent-only Watchdog pages**.

The global Watchdog header, profile menu, notifications, and universal navigation remain owned by `/property/css/app-shell-2027.css` and the universal menu runtime. Agent pages should not invent another global menu.

## Required page structure

Every new Agent workspace should:

1. Use `data-access-require="agent"` and `data-agent-workspace="<page-key>"` on the document/body.
2. Load `/agent/shared/agent-workspace.css` after the shared Watchdog app-shell CSS.
3. Load `/agent/shared/agent-workspace.js`.
4. Use the shared internal hierarchy:
   - `.awx-utility` breadcrumb
   - `.awx-header` title, concise description, plan/status pill, and page actions
   - `.awx-tabs` Agent product destinations
   - page-specific working content below the tabs
5. Keep **Contacts** and **Transactions** as live destinations. Agent Desk, Marketing, and Integrations remain visible but use `data-agent-soon="Coming soon for Agents"` until those Agent destinations are explicitly released.
6. Use flat white/neutral surfaces, 1px borders, 6–10px control radii, restrained shadows only where necessary for floating menus/dialogs, and dark charcoal primary actions.
7. Use blue only for selection/focus/link state. Do not make the whole product blue.
8. Avoid gradients, glow, decorative orbits, fake 3D cards, glassmorphism, giant marketing heroes, or AI-style decorative graphics inside the authenticated Agent product.
9. Preserve responsive behavior at 760px and below; action rows must wrap rather than create horizontal page scrolling.

## Shared Agent navigation

Canonical order for the Agent product tabs:

- Contacts — `/agent/contacts`
- Transactions — `/transaction/`
- Agent Desk — staged / coming soon
- Marketing — staged / coming soon
- Integrations — staged / coming soon

Page-specific workflows may have their own secondary tabs or rails below this shell.

## Page actions

Primary workflow actions should use `.awx-action.awx-action-primary`.
Secondary actions should use `.awx-action`.

Do not use saturated blue as the default primary action. The shared Agent product uses the same restrained dark-action hierarchy introduced in the Transaction workspace.

## Reference implementation

`/agent/contacts/` is the first canonical implementation. New Agent pages should copy the shell structure from that page, not its CRM-specific content.
