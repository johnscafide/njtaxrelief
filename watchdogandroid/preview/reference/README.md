# Reference renders

`android-<screen>-<light|dark>.png` (and `-full.png` for the scrolling screens) are the approved concept mockups,
rendered from `Docs/mockups/watchdog-agent-app-mockups.html` with `tools/render-mockups.mjs`. The desktop harness
compares every Compose screen with them (`cd preview && ./gradlew compareScreens -Pref=reference`), scaling a
reference to the render size when the scales differ. `android-screen-text.json` holds the visible text of each
screen (light theme) for copy checks.

These files are captured at 1x (412 px wide, device scale factor 1) and losslessly recompressed so the folder stays
small; the design work used 2x captures of the same page (`node tools/render-mockups.mjs <dir> --scale 2`).
Screen ids match `ScreenCatalog` in `shared/.../ui/preview/ScreenCatalog.kt`; `ScreenCatalogTest` fails when the
two drift apart.

Regenerate after a mockup change:

```
cd watchdogandroid
npm i playwright && npx playwright install chromium   # once
node tools/render-mockups.mjs                          # writes here at 1x
```
