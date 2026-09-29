// Watchdog desktop preview and screenshot harness.
// A separate Gradle build on purpose: it compiles ../shared/src/main/kotlin against Compose for Desktop,
// so it needs no Android SDK and runs anywhere a JDK 17+ runs (Windows included: .\gradlew.bat run).
// WATCHDOG_MAVEN_MIRROR: optional path or URL of a Maven repository consulted first, for networks
// that cannot reach Google Maven (a few AndroidX JVM libraries only live there).
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        System.getenv("WATCHDOG_MAVEN_MIRROR")?.takeIf { it.isNotBlank() }?.let { mirror ->
            maven { url = uri(mirror); name = "watchdogMirror" }
        }
        mavenCentral()
        google {
            content {
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
            }
        }
    }
}
rootProject.name = "watchdog-preview"
includeBuild("../core")
