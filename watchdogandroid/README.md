# Watchdog for Android

The native Android app for Watchdog (New Jersey property intelligence, https://www.watchdogindex.com), built for
agents on the Agent plan and above: Today (the Monday digest as a living screen), Clients, Farm, Marketing,
Property detail, Scan a listing, Watchdog Intelligence, Alerts and Settings. It is a new front end on the
existing backend (the production Supabase project and the site's `/api/*` routes). The approved design lives in
`Docs/design-spec.md` and `Docs/mockups/`.

Jetpack Compose with Material 3, Kotlin 2.1, min Android 8.0 (API 26), target Android 16 (API 36).

## Open it on Windows

1. Install Android Studio (Ladybug or newer) with the Android 16 (API 36) platform.
2. **File > Open** and pick this `watchdogandroid` folder (not the repository root). Gradle sync downloads
   everything else. The `core` module is included automatically as a composite build.
3. Run the **app** configuration on an emulator or a phone. Debug builds are signed with the debug key and
   install as `com.watchdogindex.agent.debug`, so they can sit next to a release build.

Release signing: put a `keystore.properties` next to `settings.gradle.kts` with `storeFile`, `storePassword`,
`keyAlias`, `keyPassword` (never committed), or set the `WATCHDOG_KEYSTORE_*` environment variables.

Push notifications need a Firebase project: drop `app/google-services.json` in place and rebuild. Without it
the app still builds and runs; Settings says push is not set up.

## See the screens without an emulator

`preview/` is a separate Gradle build that compiles the same shared Compose code for the desktop:

```powershell
cd preview
.\gradlew.bat run                    # opens the app in a 412 x 892 window (sample data)
.\gradlew.bat renderScreens          # writes build\screens\<screen>-<light|dark>.png for every screen
.\gradlew.bat compareScreens -Pref=reference   # side by side with the approved mockups + similarity
.\gradlew.bat test                   # unit tests that run on the desktop
```

It needs only a JDK 17+. Networks that cannot reach Google Maven can point `WATCHDOG_MAVEN_MIRROR` at a
mirror of it (a few AndroidX JVM libraries live only there).

## Layout

| Folder | Contents |
|---|---|
| `core/` | Pure Kotlin: models, tax math, formatting, API clients, repositories, the sample data set. `cd core && ./gradlew test`. |
| `shared/` | All Compose UI: design system (`design/`), components, screens, navigation contract. No Android imports. |
| `app/` | The Android app: activity and navigation, MapLibre farm map, CameraX + ML Kit sign scan, Sharesheet, notifications and FCM, DataStore. |
| `preview/` | Desktop window, screenshot renderer and mockup comparison. |
| `Docs/` | Design spec, mockups, `ARCHITECTURE.md` (the contract), `COMPONENTS.md`, `VERIFICATION.md`. |
| `tools/` | `render-mockups.mjs` renders the approved mockup page to reference PNGs with Playwright. |

## Live data versus sample data

Every repository has a `Live` implementation (real backend, signed-in agent) and a `Sample` implementation
(the fictional agent, homes and numbers from the approved mockups). Previews, screenshots and tests use the
sample set. The app uses live data once signed in; sample data never reaches a signed-in screen.

Sign-in is the same six-digit email code the Agent Desk uses on the website (Supabase Auth, same project).
Passkeys are not offered yet because the backend has no WebAuthn support; the button appears only when a
platform reports passkey support and the backend enables it.

## Privacy and trust rules

Owner names and owner mailing addresses are never requested, shown or stored. Rows lead with the home and the
agent's own CRM reference. Farm turnover is neighborhood-level only; no home is ever labelled a likely seller,
and that note travels with every notification channel description. Every number cites its public source.
Plan gates are enforced by the backend; the app never unlocks Agent features on its own.

## Continuous integration

`.github/workflows/watchdog-android-build.yml` assembles debug and release APKs, runs unit tests and lint,
compiles the desktop preview, renders every screen in light and dark, and compares the renders with the
approved mockups. APKs, reports and renders are uploaded as workflow artifacts.
