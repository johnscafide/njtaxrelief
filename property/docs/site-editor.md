# Watchdog site editor

Developer-only, in-page editing for Watchdog pages. Phase 1 covers text, links, and images.

## Setup (one time)

1. Create a GitHub fine-grained personal access token:
   - Repository access: only `johnscafide/njtaxrelief`
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write** (Metadata: Read is added automatically)
2. In Vercel, add it to the project's environment variables as `SITE_EDITOR_GITHUB_TOKEN` (Production, and Preview if wanted).
3. Optional variables:
   - `SITE_EDITOR_ALLOWED_EMAILS`: comma-separated list. When set, a developer must also be on this list.
   - `SITE_EDITOR_REPO` (default `johnscafide/njtaxrelief`), `SITE_EDITOR_BASE_BRANCH` (default `main`), `SITE_EDITOR_DRAFT_BRANCH` (default `site-editor/draft`).
4. Deploy.

Until the token exists, developers still see the bar, but it says setup is needed and editing stays off.

## How it works

- `property/js/site-editor-loader.js` is added to every clean Watchdog route by `api/watchdog-index-page-contact-safe.js`, and by `property/js/watchdog-universal-menu.js` for pages that adapter does not serve. It makes no request for signed-out visitors. Signed-in users are checked once per browser session against `is_watchdog_developer()` on the server, and only developers download `property/js/site-editor.js`.
- **Edit page** fetches the page's real source file from GitHub (draft branch if one exists, otherwise `main`). Each item on screen is matched to exactly one element in that file by tag and text (images by address and alt text). Anything page scripts build or change at runtime has no match and stays locked, so live data, account details, and injected menus are never written into source files.
- **Save draft** sends element-level edits to `api/site-editor.js`. The server re-checks developer access, confirms the file has not changed since the editor loaded, splices each edit into the exact byte range of that element, and commits to the draft branch. Every other byte of the file is left as is. Link addresses the page rewrote at runtime are saved with their original source values.
- **Publish** opens a pull request from the draft branch into `main`, squash-merges it, and deletes the draft branch. If branch protection or a conflict blocks the merge, the pull request is left open and linked.
- The live site changes only after the next manual deploy.

## Safety rails

- Server-side developer check on every request, plus the optional email allowlist.
- Same-origin requests only; no CORS headers.
- The browser never names a file to write. The server resolves the file from the page path, mirroring `middleware.js` routing (a contract test keeps the root-page list in sync).
- Submitted HTML is re-parsed inside its element; scripts, event handlers, iframes, forms, and `javascript:`/`data:` links are refused.
- Stale edits (file changed, element text changed) are refused with a "reload" message instead of landing on the wrong element.
- Image uploads: PNG, JPEG, WebP, GIF, or AVIF up to 2.5 MB, committed to `property/assets/site-editor/`.

## Current limits (Phase 1)

- Text, links, and images only. Layout, sizing, spacing, grids, and the shared menu are Phase 2 and 3.
- Content built by page scripts (charts, scores, data cards, the shared menu drawer, animated headlines) is locked.
- Items whose text appears more than once on a page are locked, since they cannot be matched to one source element.
- One shared draft branch for all developers.

## Tests

`npm run test:site-editor` covers edit splicing, unsafe-content rejection, stale-edit rejection, page-to-file resolution, and the full session, save, and publish flow against an in-memory GitHub.
