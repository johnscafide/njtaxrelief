# Watchdog for Android

The native Android app for Watchdog (New Jersey property intelligence, https://www.watchdogindex.com), built for
agents on the Agent plan and above. It is a new front end on the existing backend: the production Supabase
project the website uses and the site's own `/api/*` routes. Screens: Welcome and sign-in, Today (the Monday
digest as a living screen), Clients, Farm, Marketing, Property detail, Scan a listing, Search, Watchdog
Intelligence (with Watchdog Intelligence Voice), Alerts and Settings. Jetpack Compose with Material 3, Kotlin 2.1.10, Android Gradle Plugin 8.10.1, Gradle 8.14.3,
min SDK 26 (Android 8.0), compile and target SDK 36 (Android 16). The approved design is `Docs/design-spec.md`
and the mockup page under `Docs/mockups/`.

## Module map

| Module | What it is | Builds where |
|---|---|---|
| `core/` | Pure Kotlin (JVM). Models, tax math, formatting, API clients, session handling, repository interfaces, the `Live*` and `Sample*` repositories. Its own Gradle build, pulled into the other two as a composite build (`includeBuild("core")`). | Any JDK: `cd core && ./gradlew test` |
| `shared/` | Android library with all Compose UI: design tokens, components, the ten screens, navigation contract, the screen catalog the harness renders. Platform-neutral Compose only: no `android.*` imports, no `R` references. | Android build and the desktop preview (which compiles the same source files) |
| `app/` | The Android application: single activity, Navigation Compose host, deep links and share target, DataStore, Sharesheet, MapLibre farm map, CameraX + ML Kit QR scan, Credential Manager hook, Watchdog Intelligence Voice over `android.speech.SpeechRecognizer`, notification channels and FCM. | Android build only |
| `preview/` | Separate Gradle build that compiles `shared/src/main` against Compose Multiplatform 1.7.3 for the desktop: a phone-sized window, a headless screenshot renderer and the mockup comparison. Needs no Android SDK. | Any JDK 17+ |
| `Docs/` | `design-spec.md`, `mockups/`, `mockup-css-to-compose.md`, `ARCHITECTURE.md` (the contract), `COMPONENTS.md`, `BACKEND-CHANGES.md`, `VERIFICATION.md`. | |
| `tools/` | `render-mockups.mjs`: renders the mockup page to the reference PNGs in `preview/reference/` with Playwright. | Node with Playwright |

Package roots: `com.watchdogindex.agent.core` (core), `com.watchdogindex.agent` (shared and app),
`com.watchdogindex.agent.preview` (preview). `Docs/ARCHITECTURE.md` lists the packages and the fixed screen
signatures.

## Opening the project on Windows

Requirements

- Android Studio that supports AGP 8.10: Meerkat Feature Drop (2024.3.2) or newer. Install the Android 16
  (API 36) platform; build-tools 36.0.0 is what CI uses.
- JDK 17 or newer. CI builds with Temurin 17. Android Studio's bundled runtime is fine.
- Network access to Google Maven (`dl.google.com`) and Maven Central. `settings.gradle.kts` declares `google()`
  and `mavenCentral()` and fails on project-level repositories. The desktop preview can point
  `WATCHDOG_MAVEN_MIRROR` at a mirror when Google Maven is not reachable; the Android build has no such switch.

Steps

1. **File > Open** and choose this `watchdogandroid` folder, not the repository root. `settings.gradle.kts` here
   is the Android project; it includes `:app` and `:shared` and the `core` composite build.
2. Let Gradle sync. Nothing else needs to be configured.
3. Run the **app** configuration on an emulator or a phone (API 26 or newer). Debug builds get the application id
   `com.watchdogindex.agent.debug` (`applicationIdSuffix`), so they install beside a release build.

Command line (PowerShell, from `watchdogandroid`)

```powershell
.\gradlew.bat :app:assembleDebug        # APK under app\build\outputs\apk\debug\
.\gradlew.bat :app:installDebug         # build and install on the connected device or emulator
.\gradlew.bat :shared:testDebugUnitTest :app:testDebugUnitTest
.\gradlew.bat :app:lintDebug
.\gradlew.bat :app:assembleRelease      # unsigned unless a keystore is configured
```

Gradle wrappers are checked in for all three builds: `watchdogandroid/gradlew` and `gradlew.bat`,
`core/gradlew` and `gradlew.bat`, `preview/gradlew` and `gradlew.bat`. All three pin Gradle 8.14.3.

Release signing: put a `keystore.properties` next to `settings.gradle.kts` with `storeFile`, `storePassword`,
`keyAlias` and `keyPassword` (never committed), or set `WATCHDOG_KEYSTORE_FILE`, `WATCHDOG_KEYSTORE_PASSWORD`,
`WATCHDOG_KEY_ALIAS` and `WATCHDOG_KEY_PASSWORD`. Without either, `assembleRelease` produces an unsigned APK.

Push notifications need a Firebase project. The Google Services plugin is applied only when
`app/google-services.json` exists; without the file the app builds and runs, `BuildConfig.FIREBASE_CONFIGURED`
is false, and Settings reports push as not set up.

## Running the desktop preview

`preview/` is its own Gradle build. Run it from that folder; it compiles `../shared/src/main/kotlin` and the
bundled fonts against Compose Multiplatform 1.7.3 and `../core`.

```powershell
cd preview
.\gradlew.bat run                                  # the app in a 412 x 892 window on the sample data set
.\gradlew.bat test                                 # preview unit tests (catalog, fonts, farm geometry, smoke render)
.\gradlew.bat renderScreens                        # every screen, light and dark -> build\screens\<id>-<theme>[-full].png
.\gradlew.bat renderScreens -Pscreens=today,farm   # a subset
.\gradlew.bat compareScreens -Pref=reference       # render, then compare with preview\reference -> build\compare\
```

- `run` opens the whole app, signed in, on the sample data. Escape is the back gesture. Options are read from
  system properties with environment fallbacks: `watchdog.theme` / `WATCHDOG_THEME` (`light`, `dark`, `system`)
  and `watchdog.signedIn` / `WATCHDOG_SIGNED_IN` (`false` starts on Welcome). Because the `run` task starts a
  child JVM, pass them through `JAVA_TOOL_OPTIONS`, for example `$env:JAVA_TOOL_OPTIONS="-Dwatchdog.theme=dark"`.
- `renderScreens` runs `ScreenshotsKt render` headlessly (`java.awt.headless=true`) and writes PNGs to
  `build/screens/`. `-Pscreens=` takes a comma list of catalog ids: `welcome`, `today`, `property`, `scan`,
  `clients`, `farm`, `marketing`, `intelligence`, `notifications`, `settings`.
- `compareScreens` needs `-Pref=<dir>` (use `reference`, the checked-in mockup renders). It writes the renders and
  one `compare-<id>-<theme>[-full].jpg` composite per frame (reference, render, difference) to `build/compare/`,
  prints a similarity percentage and a text heat map per frame, and ends with a summary table and the average.
  Visual differences never fail the task; it exits 1 only when a screen cannot be rendered at all.
  `Docs/VERIFICATION.md` explains how the number is computed and what it does not measure.

The preview needs only a JDK 17+ and Maven access. `preview/settings.gradle.kts` consults `WATCHDOG_MAVEN_MIRROR`
first when it is set (a path or URL), then Maven Central, then Google Maven for the few AndroidX JVM artifacts
that live only there.

## Continuous integration

`.github/workflows/watchdog-android-build.yml` runs on every push and pull request that touches
`watchdogandroid/**` or the workflow file, and on manual dispatch. Two jobs run in parallel on `ubuntu-latest`,
both on Temurin 17 with the Gradle cache (read-only off `main`). Nothing in it deploys or touches Supabase.

| Job | Steps | Artifact |
|---|---|---|
| **Assemble, test and lint (Android)** | Installs `platform-tools`, `platforms;android-36` and `build-tools;36.0.0`; validates the Gradle wrapper; `:app:assembleDebug`; `cd core && ./gradlew test` (the `Core unit tests` step); `:shared:testDebugUnitTest :app:testDebugUnitTest`; `:app:lintDebug`; `:app:assembleRelease` (unsigned). | `watchdog-android-apks` (debug and release APKs), `watchdog-android-reports` (test and lint reports) |
| **Desktop preview, tests and screen renders** | In `preview/`: `./gradlew test`, then `./gradlew compareScreens -Pref=reference`. The similarity lines and heat maps are in the job log. | `watchdog-screen-renders` (`build/screens/**` and `build/compare/**`) |

Notes

- The Android compile is verified in CI. The environment this branch was written in had no Android SDK, so
  `app/`, resources, manifest merge and lint are only checked when the workflow runs.
- The workflow runs `core`'s own tests since run 7 (the Android job's `Core unit tests` step). Counts at the
  certification pass (`Docs/VERIFICATION.md`): `core` 130 tests, 0 failures; `app/src/test` 39 tests (intent
  routes, push payloads and actions, voice result mapping); `preview` 19 tests, of which the two smoke renders
  are skipped on a machine without a working Skiko renderer; `shared/src/test` is empty.
- Interim commits pushed while work was in flight carry `[skip ci]` in the subject. That is GitHub's built-in
  convention: a push whose head commit contains `[skip ci]` does not start push-triggered workflows. Commits meant
  to be checked do not carry it.
- `concurrency` is set per branch with `cancel-in-progress: false`, so a newer push no longer cancels a run in
  progress (it did until run 3; see `Docs/VERIFICATION.md`).

## What is real and what is sample

Every repository interface in `core/repo/Repositories.kt` has two implementations.

**Sample.** `core/sample/` is the fictional data set behind the approved mockups: the agent Alex Moreno, the
brokerage, the homes, the numbers and the sentences, exactly as the mockups show them, with derived figures
computed by `TaxMath` from `SampleTowns` rather than typed in. `SampleRepositories` serves it with the behaviour
of the real thing (a 150 ms delay per call, filtering search, state that changes when the agent saves or snoozes,
preferences that persist through a `KeyValueStore`). It drives the desktop preview window, the headless renders,
the mockup comparison and the core tests (`SampleRepositoriesTest`, `SamplePrivacyTest`). Nothing in it is a
real record and nothing carries an owner name.

**Live.** `core/repo/live/` talks to the production backend through `core/api/`:

- Supabase project `uvkvaxljhhngydvlrzom` (`WatchdogConfig.Production`; the anon key in the app is the same
  publishable key the website ships, and grants nothing without a user session).
  - Auth: the six-digit email code the Agent Desk uses (`POST /auth/v1/otp`, `/verify`,
    `/token?grant_type=refresh_token`, `/logout`, `GET /auth/v1/user`). `SessionManager` stores the session,
    refreshes it a minute before expiry and retries a 401 once after a refresh.
  - PostgREST tables, always with the user's token and row-level security: `profiles` (display fields only),
    `agent_digest_preferences`, `property_alert_preferences`, `property_update_events`, `agent_farm_properties`,
    `saved_properties`, `agent_dynamic_lists`, `agent_dynamic_list_properties`, `agent_opportunity_actions`,
    `intelligence_saved_briefs`.
  - RPCs: `has_watchdog_plan` (the one authoritative Agent gate), `get_my_entitlement`, `get_agent_usage`,
    `get_my_crm_property_overview`, `get_public_realtime_watchdog_scores`, `marketing_studio_bootstrap`,
    `save_property`.
  - Edge functions (`POST /functions/v1/<name>`): `agent-contact-intelligence`, `farm-map-query`,
    `workbench-hydrate`, `farm-workspace`, `pcm-postcard-studio`, `tmp-boldtrail-probe` (the email gateway) and
    `push-device-register` (see below).
- Site routes on `https://www.watchdogindex.com`, with the bearer token only: `GET /api/watchdog-property`
  (the property row as JSON, see below), `GET /api/agent-property-search`, `GET /api/watchdog-true-cost` (address
  search), `GET /api/property-imagery` (aerial fallback), `POST /api/watchdog-intelligence-analyst` and
  `POST /api/watchdog-intelligence-voice`.
- Watchdog Intelligence Voice is implemented on Android: `AndroidVoiceSession` (`app/android/`) listens through
  the phone's own `android.speech.SpeechRecognizer`, asks for `RECORD_AUDIO` at the first tap of the mic, keeps
  partial results so a cut-off question is still asked, and hands the recognised text to the Intelligence screen
  through `LocalVoiceSession` (`shared/ui/screens/intelligence/VoiceSession.kt`); the text is sent like a typed
  question. Every way listening can end has one plain sentence that offers typing instead (`app/voice/
  VoiceRecognition.kt`, unit-tested). A phone without a recognition service, and the desktop preview, keep
  `NoVoiceSession`, whose mic says Voice is not ready on this device. Listening has not yet been exercised on a
  phone; it is on the device list in `Docs/VERIFICATION.md`.

`WatchdogApplication` builds the live set on every launch (`LiveRepositories.create` with the OkHttp engine,
DataStore-backed session and key-value stores). A `SampleRepositories` fallback remains in that code path for a
`NotImplementedError`, which no live repository throws any more, so a phone always runs on live data: signed out
it shows Welcome, signed in it shows the agent's own data. Sample data never reaches a signed-in screen.

Plan gates stay on the server. The app reads the plan only to decide which call to make and shows the upgrade
state the backend reports; it never unlocks Agent features on its own.

### Backend pieces on this branch that are source-only, not deployed

Nothing in this branch has been deployed or applied. In particular:

- `api/watchdog-property.js` (`GET /api/watchdog-property`, described in `Docs/BACKEND-CHANGES.md`) exists only
  on this branch. It goes live when the branch merges and the site deploys. Until then `LivePropertyRepository`
  and `LiveScanRepository`, which read it, get a 404 from production.
- `supabase/migrations/20260930090000_push_device_registrations.sql` (the `push_settings` kill switch,
  `push_device_registrations`, `push_outbox`, the `property_update_events` trigger and the pg_cron job) has not
  been applied. `push_settings.enabled` defaults to `false`; even once applied, nothing is queued until it is
  switched on by hand after the deployment checklist in `supabase/functions/push-device-register/README.md`.
- `supabase/functions/push-device-register` and `supabase/functions/push-sender` are committed source under the
  Git-first policy in `supabase/functions/DEPLOYMENT-POLICY.md` and are not in
  `supabase/functions/PRODUCTION-INVENTORY.json`. `LiveAlertsRepository` treats a missing function as a plain
  error and never blocks anything else on it.
- Passkeys: the backend has no WebAuthn endpoints. `BuildConfig.PASSKEYS_ENABLED` is `false` in
  `app/build.gradle.kts`, `LiveAuthRepository.signInWithPasskey` throws, and the Welcome button stays hidden.

## Design references

- `Docs/design-spec.md`: the approved concept in words (screens, navigation, tokens, accessibility, privacy).
- `Docs/mockups/watchdog-agent-app-mockups.html`: the approved mockup page, offline, Android frames at
  412 x 892 dp. `Docs/mockups/README.md` explains it.
- `Docs/mockup-css-to-compose.md`: the mockup CSS translated to dp/sp per component; every value in
  `shared/ui/components` cites its selector there.
- `preview/reference/`: the mockups rendered to PNG at 1x by `tools/render-mockups.mjs`, one file per screen and
  theme plus `-full` captures for the scrolling screens, and `android-screen-text.json` with the visible text.
  `preview/reference/README.md` explains the capture rules. The harness compares every render against these.
- `Docs/COMPONENTS.md`: the shared component catalog with signatures and the CSS each one reproduces.

## Privacy and brand rules the app enforces

- Owner names and owner mailing addresses (including the owner's mailing ZIP) are never requested, shown or
  stored. The DTOs in `core/api` do not declare those fields, so they are dropped when JSON is parsed; the JSON
  property route builds its response field by field. `SamplePrivacyTest` fails if any sample string or model
  field carries owner wording.
- No single home is ever labelled a likely seller. Farm turnover is neighborhood-level; the note
  `FarmStats.NOT_A_SELLER_PREDICTION` travels with farm statistics and `AlertChannel.fullDescription` carries
  `AlertChannel.NOT_A_SELLER_PREDICTION` into every notification channel description, which
  `app/push/NotificationChannels` uses verbatim.
- Every number cites its public source (MOD-IV, SR-1A deeds, NJ Division of Taxation rates, Chapter 123 ratios,
  county boards, NJDEP).
- The camera is used only to read the QR rider on a For Sale sign, and the microphone only while the agent asks
  Watchdog Intelligence Voice a question; both purpose strings are in `app/src/main/res/values/strings.xml`. No
  location permission is declared: a sign's QR rider carries the home's PIN, so the scan resolves the parcel
  without coordinates.
- Watchdog is the platform brand. The score is "The Watchdog Score, powered by the ROBUST Framework", never a
  "ROBUST Score". The product is **Watchdog Intelligence** (Watchdog Intelligence Voice, Watchdog Intelligence
  Brief); the shortened form is not used anywhere in the app. On screen, the rotating spectrum border sits on the
  outer Intelligence surface only (`Modifier.intelligenceSurface()`), the surface stays white in dark mode
  (`IntelligenceInk`), only the word "Intelligence" takes the spectrum text (`IntelligenceName`), nothing is drawn
  as a pill or capsule, and the border is static under reduced motion.
- Public Watchdog links the app shares or opens are clean root-level `https://www.watchdogindex.com` URLs.
