# Watchdog for Android: verification

How the app is checked, what each check covers, what it cannot see, and the evidence so far. Numbers marked
**TBD** are filled in when the screen work lands; everything else is current for branch
`claude/charming-thompson-clws7b`.

## 1. The loop

Four checks, from fastest to slowest. Each one catches what the previous one cannot.

| Check | Where it runs | Catches | Cannot see |
|---|---|---|---|
| Command-line Kotlin compile of `shared` + `preview` | Locally, in seconds | Type errors and API misuse in all Compose UI, against the desktop Compose line | `app/`, Android resources, manifest, lint, the Android Compose artifacts |
| `core` unit tests (`cd core && ./gradlew test`) | Locally; not yet in CI | Tax math, formatting, DTO parsing, auth and HTTP behaviour, sample data against mockup values, privacy rules | Anything above `core` |
| Headless renders and mockup comparison (`cd preview && ./gradlew compareScreens -Pref=reference`) | Locally and in CI | Layout, palette, type and copy drift from the approved mockups, per screen and theme | Native Android views, real data, interaction |
| GitHub Actions workflow | Every non-`[skip ci]` push | The Android compile, resources, manifest merge, lint, unsigned release build, `app` unit tests; the desktop compile, preview tests and renders | Anything that needs a device (section 6) |

## 2. Local compile

The environment this branch was written in had no Android SDK, so the day-to-day compile was the Kotlin
command-line compiler, not Gradle:

- `core` is built to a jar with Gradle (`gradle jar` in `core/`), which works anywhere with a JDK.
- `shared/src/main/kotlin` and `preview/src/main/kotlin` are compiled together with kotlinc 2.1.10
  (`K2JVMCompiler`) and the Compose compiler plugin, `-jvm-target 17` and the same `-opt-in` flags as the Gradle
  builds, against the Compose Multiplatform 1.7.3 desktop jars, Ktor 3.1.3, kotlinx libraries and the `core`
  jar, all fetched from Maven Central. A small set of hand-written stubs stood in for the `androidx.lifecycle`
  runtime classes (`ViewModel`, `ViewModelStore`, `Lifecycle`, `LifecycleRegistry`, `ViewModelProvider`,
  `CreationExtras`) whose desktop artifacts were not on that classpath.
- With the compile green, `preview/src/test/kotlin` is compiled the same way and run with the JUnit Platform
  console launcher, and the harness (`ScreenshotsKt`) is run directly for renders and comparisons.

What it covers: every line of Compose UI type-checks against the desktop Compose line, so screen and component
work never waits for CI to find a missing import or a wrong parameter.

What it cannot cover, and therefore what CI is for:

- The `app` module. Anything with `android.*`, MapLibre, CameraX, ML Kit, Credential Manager, Firebase or
  DataStore is compiled only by the Android job.
- Android resources and the manifest. CI run 1 failed in resource merging on a `.txt` license file under
  `shared/src/main/res/font`; no JVM compile can see that.
- Lint (`:app:lintDebug`), R8 and the unsigned release build.
- Gradle configuration errors. CI run 1 also failed because Compose Desktop rejected `packageVersion = "0.1.0"`
  for the DMG target; a compiler never evaluates `build.gradle.kts`.
- Differences between the Android Compose artifacts (BOM 2024.12.01) and Compose Multiplatform 1.7.3. The two
  expose the same API, but only the Android job compiles `shared` against the Android line.
- Anything compiled against a stub instead of the real library. The preview job in CI compiles against the real
  `org.jetbrains.androidx.lifecycle` 2.8.4 artifacts and is the check that counts.

## 3. Core unit tests

`core/src/test/kotlin` runs on JUnit 5 through `cd core && ./gradlew test` (Windows: `.\gradlew.bat test`).
Test classes and what they pin down:

| Class | Covers |
|---|---|
| `math/TaxMathTest` | Monthly cost, price check, holds-up floor, appeal deadline, score bands, accessibility label |
| `format/FormatTest` | Money, compact money, numbers, percentages, rates, areas |
| `api/SupabaseAuthClientTest` | OTP send and verify, refresh, `invalid_grant`, sign-out, email normalisation |
| `api/WatchdogHttpTest` | Headers per base, the single 401-refresh-retry, timeouts, error mapping |
| `api/AccountApiTest`, `api/AlertsApiTest` | Entitlement and plan gate parsing, digest and alert preference rows |
| `api/PropertyApiTest`, `api/PropertyMapperTest` | The `/api/watchdog-property` contract fixture (`core/src/test/resources/watchdog-property-sample.json`), 401/404/429/503 paths, mapping to `PropertyDetail` |
| `api/ListingLinksTest` | Zillow, Realtor.com and Redfin link parsing, sign QR payloads |
| `repo/LiveDigestRepositoryTest` | Week rebuild rules from `property_update_events` |
| `sample/SampleRepositoriesTest` | Sample values equal the mockup values, including derived figures |
| `sample/SamplePrivacyTest` | No owner wording or owner fields anywhere in the sample set or models; no seller predictions outside the two disclaimers; every channel's `fullDescription` carries the note |

Counts: the last recorded local run passed 89 tests with 0 failures. The sources hold 90 `@Test` methods at the
time of writing; the number moves while other work lands. Final count for the merged branch: **TBD**.

The CI workflow does not run these tests yet (it compiles `core` through the composite build but only runs
`:shared:testDebugUnitTest`, `:app:testDebugUnitTest` and the preview tests). Until a step is added, this is a
local gate.

Other JVM tests: `app/src/test` has 21 tests (`IntentRoutesTest`, `NotificationActionsTest`), run by the Android
job. `preview/src/test` has 19 test methods (`ScreenCatalogTest`, `DesktopFontsTest`, `FarmMapGeometryTest`,
`SmokeRenderTest`), run by the preview job; the two smoke renders are skipped, not failed, on a machine where the
Skiko native library cannot initialise. `shared/src/test` is empty.

## 4. Headless render comparison

### What is rendered

`preview/src/main/kotlin/com/watchdogindex/agent/preview/Screenshots.kt` renders every entry of
`shared/.../ui/preview/ScreenCatalog.kt` on a fresh `SampleAppGraph` inside an `ImageComposeScene` at the mockup
frame, 412 x 892 dp at 2.625 px/dp (1081 x 2342 px), in light and dark, with reduced motion on and the 24 dp
bottom gesture allowance the mockups assume. The Marketing frame is rendered with the true cost share sheet open
and the Scan frame with the lookup already resolved, because that is what the mockups show (`PreviewState`).

A screen loads its data in a coroutine, so each frame is rendered repeatedly, 50 ms apart, until two consecutive
renders are pixel-identical, at least 600 ms have passed (the sample repositories answer after 150 ms per call)
and the scene has no pending invalidations; after 3 s the frame is written anyway and marked as not settled.

For the five screens whose mockup scrolls (today, property, clients, intelligence, settings) a second, full-height
frame is rendered exactly as tall as the reference `-full` capture (pixel height converted through the 412 dp
width), so full-page comparisons are one to one. Scan and Marketing declare a `fullHeightDp` in the catalog but
have no `-full` capture because their mockups fit the frame; with a reference folder in use the harness says so
and renders only the 892 dp frame.

### How similarity is computed

`ScreenComparer.compare` in the same file:

1. Loads `preview/reference/android-<id>-<theme>[-full].png` (a 1x capture of the mockup page made by
   `tools/render-mockups.mjs` in full Chromium).
2. Resamples it (bilinear) to the render's width, keeping its aspect ratio. It is never stretched to the render's
   height: rows the reference does not reach are filled with the page colour and left out of the count; a taller
   reference is cut at the render's bottom edge.
3. For every compared pixel, takes the largest absolute difference across the red, green and blue channels. A
   pixel counts as similar when that difference is at most 24 of 255.
4. Similarity = similar pixels / compared pixels, as a percentage.

Alongside the number it prints a coarse heat map for the job log (24 columns; each cell shows the share of its
pixels beyond tolerance as ` ` under 2%, `.` under 10%, `:` under 30%, `+` under 60%, `#` otherwise) and writes
`compare-<id>-<theme>[-full].jpg`: reference, render and a difference image (red where different, grey where the
reference had no rows) side by side.

### What the number is and is not

- It is a per-pixel colour match after a uniform rescale, not a perceptual or structural score. Text rendered by
  Skia and text rendered by Chromium never match exactly, so the ceiling is below 100% even for a perfect
  layout, and the 1x reference is upscaled 2.625x, which softens its edges against the crisp render.
- A single layout shift cascades. One line wrapping differently moves everything below it and every moved row
  counts as different, so a small copy or spacing change can cost many points. The heat map and the composite
  show whether a low number is a shift or a real difference.
- Full frames are as good as the reference height. The catalog's `fullHeightDp` is only the fallback when no
  reference folder is used.
- The farm map is compared for layout, palette and chrome only. The desktop map is a drawn stand-in (section 7),
  so its parcel pixels never match the mockup's and the Farm rows read low by construction.
- The sample data must equal the mockup data. `SampleRepositoriesTest` guards that; a sample value that drifts
  shows up here as a text difference.
- There is no threshold. `compareScreens` reports; it exits non-zero only when a screen fails to render. It is
  report-only until the baseline is stable, and it will not be turned into a gate before then.

### Regenerating references

Edit `Docs/mockups/watchdog-agent-app-mockups.html`, then `node tools/render-mockups.mjs` (Playwright 1.49 or
newer with Chromium installed, see `preview/reference/README.md`). `ScreenCatalogTest` fails when the catalog and
the folder disagree.

## 5. Per-screen similarity

Fill from the summary table `compareScreens` prints at the end of the preview job for the certifying run
(artifact `watchdog-screen-renders` has the composites). Record the run number and commit with the numbers.

Certifying run: **TBD** (run number, commit SHA, date). Average over 30 frames: **TBD**. Lowest: **TBD**.

| Screen | Theme | Frame | Similarity | Notes |
|---|---|---|---|---|
| welcome | light | 892 dp | TBD | |
| welcome | dark | 892 dp | TBD | |
| today | light | 892 dp | TBD | |
| today | light | full (reference height) | TBD | |
| today | dark | 892 dp | TBD | |
| today | dark | full (reference height) | TBD | |
| property | light | 892 dp | TBD | |
| property | light | full (reference height) | TBD | |
| property | dark | 892 dp | TBD | |
| property | dark | full (reference height) | TBD | |
| scan | light | 892 dp | TBD | Resolved paste lookup; no full capture |
| scan | dark | 892 dp | TBD | |
| clients | light | 892 dp | TBD | |
| clients | light | full (reference height) | TBD | |
| clients | dark | 892 dp | TBD | |
| clients | dark | full (reference height) | TBD | |
| farm | light | 892 dp | TBD | Drawn map stand-in; layout and chrome only |
| farm | dark | 892 dp | TBD | Same |
| marketing | light | 892 dp | TBD | Share sheet open; no full capture |
| marketing | dark | 892 dp | TBD | |
| intelligence | light | 892 dp | TBD | |
| intelligence | light | full (reference height) | TBD | |
| intelligence | dark | 892 dp | TBD | |
| intelligence | dark | full (reference height) | TBD | |
| notifications | light | 892 dp | TBD | In-app card only; the mockup is the system shade |
| notifications | dark | 892 dp | TBD | Same |
| settings | light | 892 dp | TBD | |
| settings | light | full (reference height) | TBD | |
| settings | dark | 892 dp | TBD | |
| settings | dark | full (reference height) | TBD | |

Reference heights at the time of writing (1x captures, so px = dp): today 1322, property 2072, clients 1033,
intelligence 1106, settings 1034.

## 6. CI run history for this branch

Workflow `Watchdog Android build` (`.github/workflows/watchdog-android-build.yml`). Runs are numbered by GitHub;
the five interim `[skip ci]` snapshots between these commits started no run.

| Run | Commit | Result | What happened |
|---|---|---|---|
| 1 | `da257e3` project foundation | failed (both jobs) | Android job: `mergeDebugResources` rejected `shared/src/main/res/font/OFL-PlusJakartaSans.txt` ("file name must end with .xml, .ttf, .ttc or .otf"). Preview job: Gradle configuration failed, "Illegal version for 'Dmg': '0.1.0' is not a valid version" from Compose Desktop's `packageVersion`. |
| 2 | `cf83d48` components, sample data, harness, Android shell | failed (Android job) | The font license moved to `shared/FONT-LICENSE.txt` and `packageVersion` became `1.0.0`, so the preview job passed (tests, renders and comparison). The Android job failed in `:app:compileDebugKotlin`: `MainActivity.kt:50-51`, a line starting with `!restored` was parsed as a continuation of the previous `!is` expression ("Argument type mismatch: actual type is 'kotlin.Unit', but 'kotlin.Boolean' was expected", then syntax errors). |
| 3 | `0106508` screens, live data layer, property route, push server | cancelled | Cancelled by the next push; the workflow still had `cancel-in-progress: true`. |
| 4 | `a738dad` fix splash keep-on-screen condition | green | The condition is now a named value (`stillWaiting`). Both jobs passed. |
| 5 | `b5a0983` work-in-progress snapshot | green | Also switched `cancel-in-progress` to `false` so later runs finish. |
| 6 | `73b024e` foundation review follow-ups | green | Latest run at the time of writing. |

Run links: `https://github.com/johnscafide/njtaxrelief/actions/runs/<id>` with ids 36637264584 (1), 36646025043
(2), 36646383792 (3), 36646635825 (4), 36647100991 (5), 36649317542 (6).

Runs after 6: **TBD**.

## 7. Checks that still need a device

None of these can be exercised on the desktop or in the workflow. Each needs a phone or emulator and, where noted,
a backend piece that does not exist yet.

| Check | What to look at | Depends on |
|---|---|---|
| Camera QR scan | `app/android/ScanCameraView.kt`: CameraX preview with an ML Kit analyzer limited to QR codes; the camera binds only while the composable is on screen; repeated reads are debounced; the one-shot location (`LocationOnce.kt`) attaches to the QR input | A device with a camera and a sign QR |
| Sharesheet | `AndroidPlatformServices.share`: text plus a PNG card through the `FileProvider` at `cacheDir/shared_cards` with a preview thumbnail; the share target intent filter opens Scan from a shared listing link | A device |
| Passkeys | `Passkeys.kt` (Credential Manager) is wired but `BuildConfig.PASSKEYS_ENABLED` is false and the Welcome button is hidden | WebAuthn endpoints on the backend, then flip the flag in `app/build.gradle.kts` |
| MapLibre farm map | `FarmMapView.kt`: OpenFreeMap Liberty basemap (`https://tiles.openfreemap.org/styles/liberty`), GeoJSON parcels coloured by score band, sold dots, boundary, selection and draw mode; the dark-mode dimming layer | A device with network access; live parcels also need the farm functions |
| FCM registration | `PushRegistrar` and `WatchdogMessagingService`: token registration through `push-device-register`, channels from `AlertChannel`, action buttons, notification tap and "Later" | `app/google-services.json`, the push migration applied, both push functions deployed, `push_settings.enabled = true` |
| App Links | The `https://www.watchdogindex.com` intent filters with `autoVerify` | `/.well-known/assetlinks.json` published on the `www` host with the signing certificate's SHA-256 |
| Session persistence | `DataStoreSessionStore`; `backup_rules.xml` and `data_extraction_rules.xml` exclude the session file from backups | A device, sign in, restart, restore from backup |
| System behaviour | Edge to edge with bar icons following the app theme, predictive back, the splash held until session restore (2.5 s cap), reduced motion when the animator scale is 0, notification permission prompt on API 33+ | A device |

## 8. Known deliberate differences from the mockups

- **Alerts.** The notifications mockup is the Android notification shade: clock, quick settings and a grouped
  notification. The in-app Alerts screen reproduces the grouped card only (28 dp radius, "Watchdog · now" header
  with the mark, items separated by 1 dp lines, link-coloured action pills), plus a card explaining which Settings
  switch controls which alert and a permission banner when notifications are off. Colours follow the app theme;
  the fixed light shade colours belong to the OS. The real notification is produced by `NotificationChannels` and
  `WatchdogMessagingService` and can only be seen on a device.
- **Passkey button.** The Welcome mockup shows "Use a passkey" under "Continue with email". The button is hidden
  until the backend supports WebAuthn (`PlatformServices.supportsPasskeys` is false on the desktop and false on
  Android while `PASSKEYS_ENABLED` is false).
- **Farm map on the desktop.** `preview/.../DesktopFarmMap.kt` is a Canvas drawing in the style of the mockup's
  map so the Farm screen's layout can be checked without MapLibre. It projects the sample farm's real 7 x 6-block,
  420-parcel grid at the state's zoom, which makes parcels about 8 x 16 dp where the mockup draws about 80
  larger ones; the mockup's water curve under the sheet is not drawn; the decorative "Birchwood Park" label is
  drawn only in the harness renders, where the farm is known to be the sample one. The Android map is MapLibre
  and is compared by eye on a device.
- **Scan on the desktop** opens in paste mode because `hasCamera` is false there; the harness renders the
  resolved state the mockup shows. On a phone the same screen opens the viewfinder.
