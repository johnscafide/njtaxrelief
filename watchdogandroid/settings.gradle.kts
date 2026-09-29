// Watchdog for Android. Open this folder in Android Studio.
// The desktop preview and screenshot harness in ./preview is a separate Gradle build on purpose:
// it compiles the same shared sources against Compose for Desktop, so it never needs the Android SDK.
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Watchdog"
includeBuild("core")
include(":app")
include(":shared")
