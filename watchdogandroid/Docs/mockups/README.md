# Approved concept mockups

`watchdog-agent-app-mockups.html` is the approved concept mockup of the Watchdog agent app (Android frames), kept
as a single offline page: the Plus Jakarta Sans faces load from the app's own bundle
(`../../shared/src/main/res/font`), every Material Symbol it uses is inlined as SVG path data, and nothing on it
reaches the network. Open it in a browser to review a screen; its CSS is the source of the dp/sp values in
`Docs/mockup-css-to-compose.md`.

`tools/render-mockups.mjs` renders the page with Playwright (the full Chromium build, so text wraps as in a real
browser) to `preview/reference/android-<screen>-<theme>.png`, which the desktop harness compares the Compose
screens against. Edit the mockup, re-run the tool, and the next `compareScreens` run measures the app against the
new reference. `preview/reference/README.md` describes the capture sizes and which screens get a full-page capture.
