// Watchdog core: pure Kotlin (no Android, no Compose). Models, tax math, formatting, API clients,
// repositories and the sample data set. Built on its own (`./gradlew test`) and included by both the
// Android build and the desktop preview as a composite build.
pluginManagement { repositories { gradlePluginPortal(); mavenCentral() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { mavenCentral() }
}
rootProject.name = "core"
