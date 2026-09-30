# Reference renders

`android-<screen>-<light|dark>.png` (and `-full.png` for the scrolling screens) are the approved concept mockups,
rendered from `Docs/mockups/watchdog-agent-app-mockups.html` with `tools/render-mockups.mjs`. The desktop harness
compares every Compose screen with them (`cd preview && ./gradlew compareScreens -Pref=reference`).
`android-screen-text.json` holds the visible text of each screen (light theme) for copy checks.

What the files are:

- Base captures are exactly the Pixel frame, 412 x 892 px at 1x (device scale factor 1), captured by a
  whole-pixel clip so no bezel row creeps in. The folder is kept at 1x and losslessly recompressed (RGB, maximum
  deflate) so it stays small; the design work used 2x captures of the same page
  (`node tools/render-mockups.mjs <dir> --scale 2`). The harness scales a reference uniformly to the render's
  width, so either scale compares correctly.
- `-full` captures exist only for the screens whose content scrolls in the mockup: today (1322 px), property
  (2072), clients (1033), intelligence (1106) and settings (1034). Scan and Marketing fit the frame and have no
  full capture; the tool skips a screen that does not grow and removes a stale capture. The harness renders each
  full frame exactly as tall as its capture (pixel height converted through the 412 dp width), so full-page
  comparisons are one to one; the catalog's `fullHeightDp` is only the fallback when no reference folder is used.
- The page is rendered by the full Chromium build (`channel: 'chromium'`), not Playwright's headless shell, whose
  whole-pixel glyph advances change line wraps (the Intelligence brief grows by 22 px there).

Screen ids match `ScreenCatalog` in `shared/.../ui/preview/ScreenCatalog.kt`; `ScreenCatalogTest` fails when the
two drift apart, when a base capture is not the frame size, or when a `-full` capture is not taller than the frame.

How the farm map is compared: the desktop map is a stylised stand-in for MapLibre, so the Farm screen is compared
for layout, palette and chrome (overlay, chips, legend, sheet, callout), not parcel by parcel. The mockup draws
about 80 large parcels (about 28 x 65 dp) inside a 412-home farm; the sample farm is a real 7 x 6-block, 420-parcel
grid that the map fits to the same boundary at zoom 15.6, which makes its parcels about 8 x 16 dp. Raising the zoom
would not help: at 17.5 the boundary would span four screens. The mockup's water curve sits under the bottom sheet
and is not drawn; the park block carries the mockup's decorative "Birchwood Park" label only in the harness renders,
where the farm is known to be the sample one.

Regenerate after a mockup change:

```
cd watchdogandroid
npm i playwright && npx playwright install chromium   # once; Playwright 1.49 or newer
node tools/render-mockups.mjs                          # writes here at 1x
```
