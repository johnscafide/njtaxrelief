# Watchdog for Android: architecture and build contract

This is the contract every engineer (human or agent) builds against. Read it before touching code.

## Modules

| Module | What it is | Compiles where |
|---|---|---|
| `core/` | Pure Kotlin (JVM). Domain models, tax math, formatting, sample data, API clients, repositories. No Android, no Compose. Own Gradle build, included by the other two as a composite build (`com.watchdogindex.agent:core`). | Anywhere with a JDK: `cd core && ./gradlew test` |
| `shared/` | Android library holding all Compose UI: design system, components, screens, navigation contract. Platform-neutral Compose only: **no `android.*` imports, no `R` references, no Android-only libraries.** | Android build (CI / Android Studio) and the desktop preview |
| `app/` | The Android application: activity, Navigation Compose host, MapLibre map, CameraX + ML Kit scan, Credential Manager passkeys, Sharesheet, notifications and FCM, DataStore, DI wiring. | Android build |
| `preview/` | Separate Gradle build: compiles `shared` sources against Compose for Desktop 1.7.3, opens the app in a window (`./gradlew run`), renders every screen to PNG (`./gradlew renderScreens`) and compares against reference renders (`compareScreens`). Needs no Android SDK. | Anywhere with a JDK 17+ |

Versions: Kotlin 2.1.10, Compose BOM 2024.12.01 (Compose 1.7 / Material 3 1.3) on Android and Compose Multiplatform 1.7.3 on desktop, AGP 8.10.1, min SDK 26, target/compile SDK 36. The two Compose lines expose the same API; shared code must only use APIs present in both (avoid `PlatformTextStyle`, `Modifier.imePadding` edge cases, Android-only previews annotations in shared files).

## Package layout

```
core:   com.watchdogindex.agent.core
          WatchdogConfig.kt      backend URLs, anon key, exceptions
          model/                 Account, Property, Digest, Client, Scan, Farm, Marketing, Intelligence, Alerts, Settings, Ui
          repo/Repositories.kt   repository interfaces + Repositories + KeyValueStore
          math/                  TaxMath (monthly cost, price check, holds-up floor, appeal deadline, score bands)
          format/                Money, dates, compact numbers
          sample/                SampleData (the mockups' fictional data set) and SampleRepositories
          api/                   Ktor clients: SupabaseAuthClient, EdgeFunctions, SiteApi, DTOs and mappers
          session/               SessionStore, TokenRefresher
          repo/live/             Live* repository implementations
shared: com.watchdogindex.agent
          design/                WatchdogColors, WatchdogTypography, WatchdogTheme, Intelligence, WatchdogMark, icons/WdIcons
          platform/              PlatformServices interface, FarmMapState, LocalPlatformServices
          app/                   AppGraph, LocalAppGraph, WatchdogApp root, screenViewModel helper, SampleAppGraph
          ui/nav/                Route, Tab, Navigator, ScreenHost
          ui/components/         reusable components (see COMPONENTS.md written by the components author)
          ui/screens/<screen>/   XScreen.kt (entry composable with the fixed signature in ScreenHost), XViewModel.kt, XUiState
          ui/preview/            ScreenCatalog (what the harness renders)
app:    com.watchdogindex.agent  MainActivity, WatchdogApplication, android/* implementations
preview: com.watchdogindex.agent.preview  PreviewApp (window), DesktopPlatformServices, DesktopFonts, Screenshots
```

## Fixed signatures

- Screen entry points (do not rename; `ScreenHost` calls them): `WelcomeScreen(navigator)`, `TodayScreen(navigator)`, `ClientsScreen(navigator)`, `FarmScreen(navigator)`, `MarketingScreen(navigator)`, `PropertyScreen(pin, navigator)`, `ScanScreen(initialUrl, navigator)`, `IntelligenceScreen(navigator)`, `AlertsScreen(navigator)`, `SettingsScreen(navigator)`, `SearchScreen(query, navigator)`.
- Screens get everything through `LocalAppGraph.current` (repositories, platform, font) and `LocalPlatformServices.current`. ViewModels: `val vm = screenViewModel { TodayViewModel(LocalAppGraph.current.repos) }` (capture the graph in a `val` first; `LocalAppGraph.current` is a composable read).
- Tab screens draw their own `Scaffold` with the shared navigation bar and FAB; pushed screens draw their own top app bar.
- `Repositories` (core) is the only way to data. Every method throws `WatchdogException`; ViewModels turn that into a friendly state (`userMessage`).
- Sample data lives in `core/sample`. `SampleRepositories` must reproduce the approved mockups exactly (same addresses, numbers and strings), because screenshots are compared against the mockups.

## Design rules (non-negotiable)

- Match the mockups. Values come from `Docs/mockup-css-to-compose.md` (dp/sp per component) and the reference renders under `Docs/mockups/` and `preview/reference/`.
- Tokens only: colors via `WatchdogTheme.colors.*`, text styles via `WatchdogTheme.type.*`, icons via `WdIcons.*` (Material Symbols Rounded). No hard-coded hex in screens except the fixed Intelligence and notification-shade colors already in `design/`.
- Watchdog Intelligence: rotating spectrum border on the OUTER surface only (`Modifier.intelligenceSurface()`), the surface stays white in dark mode (`IntelligenceInk { }` for its text), only the word "Intelligence" in spectrum (`IntelligenceName(...)`; as text it uses the AA stops `Spectrum.textStops`, or `textStopsOnDark` on the dark theme's own surfaces, while the bright stops stay on the border), never a pill or capsule, static under reduced motion. The product is "Watchdog Intelligence" (never "Intel").
- Score naming: "The Watchdog Score, powered by the ROBUST Framework." Never "ROBUST Score".
- Privacy: never show or store owner names or owner mailing addresses. Rows lead with the home and the agent's CRM reference. Never label a single home as a likely seller; farm turnover is neighborhood-level and the note `FarmStats.NOT_A_SELLER_PREDICTION` travels with it, as does `AlertChannel.NOT_A_SELLER_PREDICTION` in every notification channel description.
- Every number cites its public source (MOD-IV, SR-1A deeds, NJ Division of Taxation rates, Chapter 123 ratios, county board, NJDEP).
- Accessibility: 48 dp touch targets (chips are 32 dp tall inside a 48 dp hit area), nothing under 12 sp, `contentDescription` on every icon-only control, the score reads "Watchdog Score 72 out of 100, favorable tax position", color never the only signal, AA contrast in both themes.
- Plan gates stay server-side. The app never unlocks Agent features on its own; it shows the upgrade state the backend reports.

## Verification

- `core`: `./gradlew test` locally and in CI.
- `preview`: `./gradlew test renderScreens` compiles all shared UI for the desktop and writes `build/screens/*.png`; `compareScreens -Pref=<dir>` writes side-by-side composites and prints a similarity score per screen.
- Android: `.github/workflows/watchdog-android-build.yml` assembles debug and release, runs unit tests and lint, and uploads APKs.
- Browser-level certification of the website is Playwright; for the app, the desktop renders plus the mockup reference renders (`tools/render-mockups.mjs`) are the visual evidence, and CI runs the headless comparison against `preview/reference/` on every push, uploading the renders and composites as workflow artifacts (nothing is committed back).
