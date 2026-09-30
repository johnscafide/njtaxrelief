# Watchdog for Android: verification

How the app is checked, what each check covers, what it cannot see, and the evidence. Every number here was
measured on 2026-09-30 for branch `claude/charming-thompson-clws7b` at commit `605716c` ("audit fixes, first
pass") plus the uncommitted working tree of that day, with the local loop in section 2; the CI numbers quoted
come from the run they name. Nothing is estimated.

## 1. The loop

Five checks, from fastest to slowest. Each one catches what the previous one cannot.

| Check | Where it runs | Catches | Cannot see |
|---|---|---|---|
| Command-line Kotlin compile of `shared` + `preview` (about 30 s) | Locally | Type errors and API misuse in all Compose UI, against the desktop Compose line | `app/`, Android resources, manifest, lint, the Android Compose artifacts |
| `core` unit tests (`cd core && ./gradlew test`) | Locally and in CI (the Android job's `Core unit tests` step, since run 7) | Tax math, formatting, DTO parsing, auth and HTTP behaviour, live repository rules, sample data against mockup values, privacy rules, link building | Anything above `core` |
| `app` JVM unit tests (`app/src/test`) | In CI through `:app:testDebugUnitTest`; locally with kotlinc + JUnit 4 against the `core` jar and `shared`'s `Route.kt` | Intent and deep-link routing, push payload decoding, notification action mapping, Watchdog Intelligence Voice result and error mapping | The Android classes those pure files feed (`MainActivity`, `AndroidVoiceSession`, the messaging service) |
| Headless renders and mockup comparison (`cd preview && ./gradlew compareScreens -Pref=reference`) | Locally and in CI | Layout, palette, type and copy drift from the approved mockups, per screen and theme | Native Android views, real data, interaction |
| GitHub Actions workflow | Every non-`[skip ci]` push | The Android compile, resources, manifest merge, lint, unsigned release build, `core` + `app` unit tests; the desktop compile, preview tests and renders | Anything that needs a device (section 7) |

## 2. Local compile

The environment this branch was written in had no Android SDK, so the day-to-day compile is the Kotlin
command-line compiler, not Gradle. The scripts that drive it live outside the repository (a scratch tools folder);
this is what they do, so the loop can be rebuilt anywhere:

- `core` is built to a jar with Gradle (`gradle jar` in `core/`), which works anywhere with a JDK. If `core` does
  not compile at that moment (another engineer mid-edit), the last good jar is used and the script says so.
- `shared/src/main/kotlin` and `preview/src/main/kotlin` are compiled together with kotlinc 2.1.10
  (`K2JVMCompiler`) and the Compose compiler plugin, `-jvm-target 17` and the same `-opt-in` flags as the Gradle
  builds, against the Compose Multiplatform 1.7.3 desktop jars, Ktor 3.1.3, the kotlinx libraries and the `core`
  jar, all fetched from Maven Central. The `androidx.lifecycle` runtime classes come from a small hand-written stub
  set (`ViewModel`, `ViewModelStore`, `ViewModelStoreOwner`, `Lifecycle`, `LifecycleRegistry`, `LifecycleOwner`,
  `LifecycleObserver`, `ViewModelProvider`, `CreationExtras`), with the real `lifecycle-runtime-compose`,
  `lifecycle-viewmodel-compose`, `lifecycle-viewmodel-savedstate` desktop 2.8.4 and `savedstate-desktop` 1.2.2
  artifacts alongside them for the Compose integration. About 30 s for the whole tree.
- With the compile green, `preview/src/test/kotlin` is compiled the same way and run with the JUnit Platform
  console launcher (`-Dwatchdog.referenceDir=preview/reference`), and the harness (`ScreenshotsKt`) is run
  directly for renders and comparisons (`compare <ids>` writes `compare-<id>-<theme>[-full].jpg` composites and
  prints the similarity table).
- The pure-Kotlin half of `app` (`navigation/IntentRoutes.kt`, `navigation/RouteNames.kt`, `push/PushPayload.kt`,
  `push/NotificationActions.kt`, `voice/VoiceRecognition.kt`, plus `shared`'s `Route.kt`) is compiled with kotlinc
  against the `core` jar, then `app/src/test` is compiled and run with JUnit 4.13.2 (`JUnitCore`) from
  `watchdogandroid/app`, so `PushPayloadTest`'s guard on `push-sender/index.ts` finds the repository root. No
  Android SDK is involved; only files without `android.*` imports take part.

What it covers: every line of Compose UI type-checks against the desktop Compose line, so screen and component
work never waits for CI to find a missing import or a wrong parameter, and the routing, push and voice mapping
logic is tested without an emulator.

What it cannot cover, and therefore what CI is for:

- The Android classes of the `app` module. Anything with `android.*`, MapLibre, CameraX, ML Kit, Credential
  Manager, Firebase, DataStore or `SpeechRecognizer` is compiled only by the Android job.
- Android resources and the manifest. CI run 1 failed in resource merging on a `.txt` license file under
  `shared/src/main/res/font`; no JVM compile can see that.
- Lint (`:app:lintDebug`), R8 and the unsigned release build.
- Gradle configuration errors. CI run 1 also failed because Compose Desktop rejected `packageVersion = "0.1.0"`
  for the DMG target; a compiler never evaluates `build.gradle.kts`.
- Differences between the Android Compose artifacts (BOM 2024.12.01) and Compose Multiplatform 1.7.3. The two
  expose the same API, but only the Android job compiles `shared` against the Android line.
- Anything compiled against a stub instead of the real library. The preview job in CI compiles against the real
  `org.jetbrains.androidx.lifecycle` artifacts and is the check that counts.

Result for this pass: `shared` + `preview` compile exit 0; preview tests compile exit 0; `app` pure-Kotlin compile
exit 0 and `app` tests compile exit 0.

## 3. Core unit tests

`core/src/test/kotlin` runs on JUnit 5 through `cd core && ./gradlew test` (Windows: `.\gradlew.bat test`).
Test classes and what they pin down:

| Class | Tests | Covers |
|---|---|---|
| `WatchdogConfigTest` | 5 | Clean root-level `www.watchdogindex.com` links (agent page from the vanity slug, onboarding, dashboard, property), a different site origin, typographic apostrophes in exception copy |
| `math/TaxMathTest` | 16 | Monthly cost, price check, holds-up floor, appeal deadline, score bands, accessibility label |
| `format/FormatTest` | 6 | Money, compact money, numbers, percentages, rates, areas |
| `api/SupabaseAuthClientTest` | 9 run (10 written, see below) | OTP send and verify, refresh, `invalid_grant`, proactive refresh, dead refresh token, sign-out, bodyless 401/403, email normalisation and typo copy |
| `api/WatchdogHttpTest` | 8 | Headers per base, the single 401-refresh-retry, timeouts, error mapping |
| `api/AccountApiTest` | 4 | Agent, Free and Developer plan reads, the `has_watchdog_plan` gate, zero entitlement rows meaning a bad token |
| `api/AlertsApiTest` | 3 | Push registration payload and heartbeats, preference mirroring to the registration and the per-pin rows, a missing push function as a plain error |
| `api/FarmApiTest` | 3 | The workspace asks for no owner data; no farm DTO declares an owner, mailing, postal or zip field; hydrate drops owner and mailing keys at parse time |
| `api/IntelligenceApiTest` | 2 | Non-JSON 502 maps by status; a JSON 429 keeps its reset time; an unreadable 200 is a friendly error |
| `api/PropertyApiTest`, `api/PropertyMapperTest` | 13, 10 | The `/api/watchdog-property` contract fixture (`core/src/test/resources/watchdog-property-sample.json`), 401/404/429/503 paths, no owner, mailing, zip or storage-key field decodable, mapping to `PropertyDetail` |
| `api/ListingLinksTest` | 5 | Zillow, Realtor.com and Redfin link parsing, sign QR payloads, non-property links |
| `model/FarmModelTest` | 4 | MapLibre zoom offset and round trip, metres per dp on the 256 dp tile convention, callout line, client filter keys |
| `repo/LiveAlertsRepositoryTest` | 7 | Category switches patch only existing per-pin rows in chunks of 100, the Monday email row, failure and cancellation leave nothing half-saved, the launch heartbeat carries no preference fields |
| `repo/LiveDigestRepositoryTest` | 4 | Week rebuild rules from `property_update_events`, bill-year titles, the Monday window, done marks |
| `repo/LiveIntelligenceRepositoryTest` | 2 | A failed analyst run is not retried for an hour; an Agent plan without the add-on gets the digest brief and is told which features need it |
| `repo/LivePropertyRepositoryTest`, `repo/LiveScanRepositoryTest` | 2, 3 | Saved and watched mean the right rows; a resolved scan knows whether the home is saved; history refreshes saved flags in one request |
| `repo/LiveSettingsRepositoryTest` | 4 | Stored settings are the first value a collector sees, restore loads them at launch, updates merge, defaults and unknown theme names |
| `sample/SampleRepositoriesTest` | 16 | Sample values equal the mockup values, including derived figures |
| `sample/SamplePrivacyTest` | 4 | No owner wording or owner fields anywhere in the sample set or models; no seller predictions outside the two disclaimers; every channel's `fullDescription` carries the note |

Counts for this pass (`gradle --no-daemon cleanTest test`, summed over the 21 files in `core/build/test-results/test`):
**130 tests, 0 failures, 0 errors, 0 skipped.**

The sources hold 131 `@Test` methods. The one that does not run is
`SupabaseAuthClientTest.verify posts type email and parses the session`: its expression body ends in
`assertFailsWith<WatchdogException> { … }`, so the method's inferred return type is `WatchdogException`
(`javap` on the compiled class shows it), and JUnit Jupiter treats only `void` methods as tests, silently. A
trailing `Unit` (or a block body) makes it run; that is a source change for the next code pass, not a doc fix.

Other JVM tests: `app/src/test` has 39 tests, all passing locally under JUnit 4 (`IntentRoutesTest` 16,
`NotificationActionsTest` 7, `PushPayloadTest` 9, `VoiceRecognitionTest` 7); CI runs them through
`:app:testDebugUnitTest`. `preview/src/test` has 19 tests (`ScreenCatalogTest` 5, `DesktopFontsTest` 2,
`FarmMapGeometryTest` 10, `SmokeRenderTest` 2); this pass: 17 successful, 2 aborted, 0 failed, the two aborted
being the smoke renders, which skip with an assumption on a machine where the Skiko renderer cannot initialise
(they run in CI). `shared/src/test` is empty.

## 4. Headless render comparison

### What is rendered

`preview/src/main/kotlin/com/watchdogindex/agent/preview/Screenshots.kt` renders every entry of
`shared/.../ui/preview/ScreenCatalog.kt` on a fresh `SampleAppGraph` inside an `ImageComposeScene` at the mockup
frame, 412 x 892 dp at 2.625 px/dp (1081 x 2342 px), in light and dark, with reduced motion on and the 24 dp
bottom gesture allowance the mockups assume. The Marketing frame is rendered with the true cost share sheet open
and the Scan frame with the lookup already resolved, because that is what the mockups show (`PreviewState`).

A screen loads its data in a coroutine, so each frame is rendered repeatedly, 50 ms apart, until two consecutive
renders are pixel-identical, at least 600 ms have passed (the sample repositories answer after 150 ms per call)
and the scene has no pending invalidations; after 3 s the frame is written anyway and marked as not settled. No
frame in this pass was marked as not settled.

For the five screens whose mockup scrolls (today, property, clients, intelligence, settings) a second, full-height
frame is rendered exactly as tall as the reference `-full` capture (pixel height converted through the 412 dp
width), so full-page comparisons are one to one. Scan and Marketing have no `-full` capture because their mockups
fit the frame; with a reference folder in use the harness renders only the 892 dp frame for them.

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
  layout, and the 1x reference is upscaled 2.625x, which softens its edges against the crisp render. Every
  composite in this pass shows that glyph-edge haze on every line of text; it is the floor under all the numbers.
- A single layout shift cascades. One line wrapping differently moves everything below it and every moved row
  counts as different, so a small copy or spacing change can cost many points. The heat map and the composite
  show whether a low number is a shift or a real difference.
- Full frames are as good as the reference height. The catalog's `fullHeightDp` is only the fallback when no
  reference folder is used.
- The farm map is compared for layout, palette and chrome only. The desktop map is a drawn stand-in (section 8),
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

Certifying run: local, 2026-09-30, commit `605716c` plus that day's working tree (`wd-render.sh compare` over all
ten catalog ids; render exit 0, 30 frames written, none unsettled). **Average over 30 frames: 83.5%. Lowest: 3.8%**
(notifications dark, by construction: see the notes). The second number column is CI run 8 (commit `f4d4888`,
the last push-triggered run; its preview job log carries the same table), so the movement since is visible.

| Screen | Theme | Frame | This pass | CI run 8 | Notes |
|---|---|---|---|---|---|
| welcome | light | 892 dp | 82.6% | 82.6% | Passkey button hidden by policy; see the screen notes |
| welcome | dark | 892 dp | 82.6% | 82.6% | Same |
| today | light | 892 dp | 90.9% | 91.0% | |
| today | light | full 1322 dp | 90.4% | 90.4% | |
| today | dark | 892 dp | 91.1% | 91.2% | |
| today | dark | full 1322 dp | 90.6% | 90.6% | |
| property | light | 892 dp | 90.5% | 90.5% | |
| property | light | full 2072 dp | 89.3% | 89.3% | |
| property | dark | 892 dp | 90.9% | 90.9% | |
| property | dark | full 2072 dp | 88.8% | 88.8% | |
| scan | light | 892 dp | 89.7% | 89.8% | Resolved paste lookup; no full capture |
| scan | dark | 892 dp | 90.2% | 90.4% | |
| clients | light | 892 dp | 89.2% | 89.7% | |
| clients | light | full 1033 dp | 88.9% | 89.4% | |
| clients | dark | 892 dp | 89.3% | 89.8% | |
| clients | dark | full 1033 dp | 88.7% | 89.2% | |
| farm | light | 892 dp | 67.3% | 67.3% | Drawn map stand-in; layout and chrome only |
| farm | dark | 892 dp | 70.9% | 70.9% | Same |
| marketing | light | 892 dp | 90.5% | 87.2% | Share sheet open; no full capture |
| marketing | dark | 892 dp | 91.2% | 89.2% | |
| intelligence | light | 892 dp | 87.3% | 84.6% | |
| intelligence | light | full 1106 dp | 87.4% | 85.0% | |
| intelligence | dark | 892 dp | 87.2% | 84.6% | |
| intelligence | dark | full 1106 dp | 87.2% | 84.8% | |
| notifications | light | 892 dp | 39.2% | 39.2% | In-app card only; the mockup is the system shade |
| notifications | dark | 892 dp | 3.8% | 3.8% | Same, and the mockup shade is light |
| settings | light | 892 dp | 92.4% | 92.4% | |
| settings | light | full 1034 dp | 92.8% | 92.8% | |
| settings | dark | 892 dp | 92.4% | 92.5% | |
| settings | dark | full 1034 dp | 92.7% | 92.8% | |
| **Average** | | | **83.5%** | **83.1%** | |

Reference heights (1x captures, so px = dp): today 1322, property 2072, clients 1033, intelligence 1106,
settings 1034.

Against the working baseline handed to this pass (welcome 82.6/82.6, today 90.9/90.4/91.1/90.6, property
90.5/89.3/90.9/88.8, scan 89.7/90.2, clients 89.2/88.9/89.3/88.7, farm 67.3/70.9, marketing 90.5/91.3,
notifications 39.2/3.8, settings 92.4/92.8/92.5/92.8) every frame is within 0.1 points. The baseline's
"intelligence about 89-90" was not a measured value: the two measured points are CI run 8 at 84.6-85.0 and
commit `c02a58c` (the sweep before this one) rebuilt from a clean copy of that commit, its own `core` jar
included, at 87.4 / 87.5 / 87.3 / 87.2, identical to this pass. So intelligence has not dropped; it rose 2.6-2.7
points at `c02a58c` (the brief card's Voice row geometry, the shared composer and modal sheet) and has not moved
since. Clients sits 0.4-0.5 points under run 8 on all four frames; that movement landed at `c02a58c` too (its
clean rebuild renders 89.3 / 88.9 / 89.3 / 88.7, where the sweep replaced the screen's private pieces with the
shared chips, rows and sheet), and the composites show it at the unselected filter chips' border (now `muted`,
section 8) and in glyph haze, nothing structural. Scan (-0.1 / -0.2) and settings dark (-0.1) moved at `605716c`
with the `muted` segmented-control border and off-switch ring, inside the 0.5-point allowance.

What still differs from the mockup, screen by screen, read off the composites of this pass:

- **welcome**: the mockup shows "Use a passkey" under "Continue with email"; the render hides it (no WebAuthn on
  the backend), so the email button and the two footer lines sit lower than in the reference. Everything else is
  glyph-edge haze plus the phone bezel corners and the punch-hole that belong to the mockup frame, not to a screen.
- **today**: glyph-edge haze on every line and the bezel corners; the summary card, task rows, change rows, the
  Intelligence teaser and the FAB are in place in both frames. Nothing structural.
- **property**: the 30 sp bill (`$11,284`) and the value-line labels show glyph-advance drift (Skia's tabular
  figures land a pixel or two off Chromium's), and the Home grid values sit about 2 px lower; the dial, rate bars,
  value line, sales rows, ROBUST bars and the action area match. The full frame carries the same small offsets
  down the 2072 px page.
- **scan**: the same glyph-advance drift on the large numbers (`$12,980`, `$849,000`, `57 /100`); the segmented
  control's `muted` border differs from the mockup's outline colour by design; tiles, verdict box and buttons
  match. Rendered in the resolved paste state the mockup shows.
- **clients**: glyph-edge haze, the unselected filter chips' `muted` border (design, section 8), and the bezel;
  the checkup card, chips, five rows, chips and FAB all match, and the full frame's sixth row peeks under the
  FAB in both.
- **farm**: the drawn desktop map: 420 small parcels where the mockup draws about 80 large ones, street labels and
  the callout in different places, no water curve under the sheet (section 8). The overlay (search bar, layer
  chips, "Draw area" FAB), the sold dot, the legend, the three stat tiles, the two notes, the seller disclaimer and
  the navigation bar match.
- **marketing**: the share sheet's fourth target reads "Show link" with a link icon where the mockup says "QR code"
  with a QR glyph (design, section 8); "a month at $449,000" and the `$3,388` total show glyph-advance drift; the
  campaign cards, sheet header, true cost card, bars, agent footer and the contact-card switch match in both
  themes (the dark card keeps its white footer as the mockup does).
- **intelligence**: the word "Intelligence" is drawn with the AA text stops where the mockup uses the bright
  border stops (design, section 8); the brief card closes a few px earlier than the mockup's, so "Ask a follow-up"
  and, in the full frame, the three follow-up rows sit about 6-8 px higher (one shift, cascading); the composer's
  mic glyph is offset by a few px inside its FAB. Text, numbered items, sources and the Voice row are otherwise in
  place.
- **notifications**: the reference is the Android notification shade (clock, quick settings tiles, the grouped
  Watchdog notification, "Manage" and "Clear all"); the render is the in-app Alerts screen (top bar, the grouped
  card, the "Alert switches" card). Only the notification card's copy overlaps, hence 39.2% in light. The mockup
  shade is light in both themes while the dark render's page is navy, hence 3.8% in dark. Both by construction.
- **settings**: glyph-edge haze only; the off switch's `muted` border and thumb differ from the mockup's outline
  colour by design; the profile row, section labels, switches, quiet hours, theme and (full frame) the Account
  section match.

## 6. CI run history for this branch

Workflow `Watchdog Android build` (`.github/workflows/watchdog-android-build.yml`). Runs are numbered by GitHub;
the interim `[skip ci]` snapshots between these commits started no run.

| Run | Commit | Result | What happened |
|---|---|---|---|
| 1 | `da257e3` project foundation | failed (both jobs) | Android job: `mergeDebugResources` rejected `shared/src/main/res/font/OFL-PlusJakartaSans.txt` ("file name must end with .xml, .ttf, .ttc or .otf"). Preview job: Gradle configuration failed, "Illegal version for 'Dmg': '0.1.0' is not a valid version" from Compose Desktop's `packageVersion`. |
| 2 | `cf83d48` components, sample data, harness, Android shell | failed (Android job) | The font license moved to `shared/FONT-LICENSE.txt` and `packageVersion` became `1.0.0`, so the preview job passed (tests, renders and comparison). The Android job failed in `:app:compileDebugKotlin`: `MainActivity.kt:50-51`, a line starting with `!restored` was parsed as a continuation of the previous `!is` expression ("Argument type mismatch: actual type is 'kotlin.Unit', but 'kotlin.Boolean' was expected", then syntax errors). |
| 3 | `0106508` screens, live data layer, property route, push server | cancelled | Cancelled by the next push; the workflow still had `cancel-in-progress: true`. |
| 4 | `a738dad` fix splash keep-on-screen condition | green | The condition is now a named value (`stillWaiting`). Both jobs passed. |
| 5 | `b5a0983` work-in-progress snapshot | green | Also switched `cancel-in-progress` to `false` so later runs finish. |
| 6 | `73b024e` foundation review follow-ups | green | |
| 7 | `48d9553` README, verification notes, core tests in CI | green | First run with the `Core unit tests` step in the Android job. |
| 8 | `f4d4888` all ten screens built, reviewed and fixed | green | The preview job's similarity table is the "CI run 8" column in section 5 (average 83.1%). Last push-triggered run at the time of this pass; `c02a58c` and `605716c` carried `[skip ci]`. |
| 9+ | the certification commit and later | run 9+: see Actions | Not recorded here: check the workflow's runs for branch `claude/charming-thompson-clws7b` at `https://github.com/johnscafide/njtaxrelief/actions/workflows/watchdog-android-build.yml` and copy the result and the similarity table into this file. |

Run links: `https://github.com/johnscafide/njtaxrelief/actions/runs/<id>` with ids 36637264584 (1), 36646025043
(2), 36646383792 (3), 36646635825 (4), 36647100991 (5), 36649317542 (6), 36721171451 (7), 36730952239 (8).

## 7. Checks that still need a device

None of these can be exercised on the desktop or in the workflow. Each needs a phone or emulator and, where noted,
a backend piece that does not exist yet.

| Check | What to look at | Depends on |
|---|---|---|
| Camera QR scan | `app/android/ScanCameraView.kt`: CameraX preview with an ML Kit analyzer limited to QR codes; the camera binds only while the composable is on screen; repeated reads are debounced; the camera permission notice inside the Scan screen (`scan_camera_*` strings) and the paste fallback. No location is requested: the QR rider carries the PIN and `ScanViewModel` sends no coordinates | A device with a camera and a sign QR |
| Sharesheet | `AndroidPlatformServices.share`: text plus a PNG card through the `FileProvider` at `cacheDir/shared_cards` with a preview thumbnail; the share target intent filter opens Scan from a shared listing link | A device |
| Passkeys | `Passkeys.kt` (Credential Manager) is wired but `BuildConfig.PASSKEYS_ENABLED` is false and the Welcome button is hidden | WebAuthn endpoints on the backend, then flip the flag in `app/build.gradle.kts` |
| MapLibre farm map | `FarmMapView.kt`: OpenFreeMap Liberty basemap (`https://tiles.openfreemap.org/styles/liberty`), GeoJSON parcels coloured by score band, sold dots, boundary, selection and draw mode; the dark-mode dimming layer; tile loading and the `MapZoom` offset against the drawn desktop map | A device with network access; live parcels also need the farm functions |
| FCM registration | `PushRegistrar` and `WatchdogMessagingService`: token registration through `push-device-register` (`register` on first contact, `heartbeat` on launch with no preference fields), channels from `AlertChannel`, action buttons, the summary notification | `app/google-services.json`, the push migration applied, both push functions deployed, `push_settings.enabled = true` |
| Notification taps and actions | `MainActivity.consumeLaunchIntent`: a tap or an action button clears the alert it came from (action buttons do not auto-cancel), "Call client" with a number starts the dialer, the route opens once signed in, an intent replayed from Recents is ignored; "Later" through `NotificationActionReceiver` dismisses without opening the app; a push the system rendered itself delivers its data map as bare extras (`PushPayload` fallback keys) | A device receiving a real push (above) |
| Watchdog Intelligence Voice | `app/android/AndroidVoiceSession.kt` over `android.speech.SpeechRecognizer`: `isRecognitionAvailable` with the manifest `<queries>` entry, the `RECORD_AUDIO` prompt at the first tap (never at launch), partial results kept so "no match" or a speech timeout after speech still asks the question, the listening ring and "Tap to stop" on the composer FAB, every error ending in one of `VoiceRecognition`'s sentences, the transcript sent like a typed question | A device with a recognition service (the desktop has none: `NoVoiceSession`) |
| IME insets | `IntelligenceScreen.keyboardInsets()`: the composer stays above the soft keyboard on device (`WindowInsets.ime` union the gesture inset, `adjustResize` in the manifest) while the harness, which provides `LocalBottomChromeInsets`, never applies it; the same for the Welcome, Search, Scan, Marketing and Farm fields' keyboards and action keys | A device with a soft keyboard |
| App Links | The `https://www.watchdogindex.com` intent filters with `autoVerify` | `/.well-known/assetlinks.json` published on the `www` host with the signing certificate's SHA-256 |
| Session persistence | `DataStoreSessionStore`; `backup_rules.xml` and `data_extraction_rules.xml` exclude the session file from backups; the corruption handler replaces an undecodable file once | A device, sign in, restart, restore from backup |
| System behaviour | Edge to edge with bar icons and the window background following the app theme (not only the system theme), predictive back, the splash held until session restore (2.5 s cap), reduced motion when the animator scale is 0, notification permission prompt on API 33+ | A device |

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
- **Marketing's fourth share target** reads "Show link" with a link icon, not "QR code" with a QR glyph. The app
  does not draw a QR code; the QR for a card is generated on its web page, and the dialog behind the target shows
  the link as text and offers that page, so the target is labelled for what it does (`ShareTargets(qrLabel,
  qrIcon)`).
- **The word "Intelligence" as text** uses the AA text stops (`Spectrum.textStops`, at least 4.5:1 on white and the
  light page; `textStopsOnDark` on the dark theme's own surfaces), not the bright border stops the mockup's CSS
  puts on the text (cyan is 2.7:1 on white). The rotating border keeps the bright stops.
- **Unselected and off states are `muted`, not `mOutline`**: the unselected filter chip border, the segmented
  control's border and dividers, the off switch's border and thumb, the outlined button border and `WdRadioButton`'s
  ring. `mOutline` is under 2:1 on the page in both themes and a control whose boundary is its only visual needs
  3:1 (WCAG 1.4.11). Light `mHigh` is likewise lifted six units (#e4e0d7 to #e9e5dd) so the `muted` search and
  composer hints reach 4.6:1; six units is inside the comparison's tolerance.
- **The brief card's Voice row** (`BriefCard`) puts the 56 dp mic and its text 26 dp under the separator,
  top-aligned, as measured on the 2x mockup captures rather than read off the CSS summary; against the 1x
  reference it lands a few px higher, which is the small shift visible in the intelligence composites.

## 9. Brand and privacy sweep

Grep over the whole `watchdogandroid` tree and `supabase/functions/push-*`, this pass (counts are reported, not
fixed; none is a customer-facing violation):

| Term | Hits | Where |
|---|---|---|
| "ROBUST Score" | 4 | All prohibitions: `Docs/design-spec.md`, `Docs/ARCHITECTURE.md`, `README.md`, and the `VoiceRecognitionTest` assertion that no Voice sentence contains it |
| "Intel" as a standalone word | 3 | All prohibitions: `Docs/ARCHITECTURE.md`, the `VoiceRecognitionTest` regex, a comment in `LiveIntelligenceRepositoryTest`; none in shipped strings |
| `owner_name` | 6 | `FarmApi.kt` KDoc stating the field is never declared; `SamplePrivacyTest`'s forbidden-word regex; `PropertyApiTest` and `FarmApiTest` feeding the field in to prove it is dropped |
| "mailing" | 26 | Docs and KDoc stating owner mailing fields are never read; tests proving it; `push-sender/index.ts` and the `push-device-register` README saying no mailing field is ever part of a push; the `SiteLinks.postcardStudio` KDoc and `ListingLinks` ("a mailing campaign link"); one user-facing string, `MarketingScreen.kt`'s "campaign's proof, mailing date, opens and replies", which is a postcard campaign's mailing date, not an owner's address |
| Straight apostrophes in string literals under `shared/src/main/kotlin` | 0 | Every user-facing apostrophe in `shared` is typographic. (Outside `shared`: one in `app/src/main/res/values/strings.xml`, `notification_summary_text`, `clients\' homes`.) |
