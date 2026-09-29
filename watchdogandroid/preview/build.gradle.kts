import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Compose for Desktop 1.7.3 pairs with the Android build's Compose BOM 2024.12.01 (Compose 1.7 / Material 3 1.3).
plugins {
    kotlin("jvm") version "2.1.10"
    id("org.jetbrains.compose") version "1.7.3"
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.10"
    kotlin("plugin.serialization") version "2.1.10"
}

val sharedRoot = rootDir.resolve("../shared/src/main")

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.addAll(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi",
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
        )
    }
}
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

sourceSets {
    main {
        kotlin.srcDir(sharedRoot.resolve("kotlin"))
        // Fonts ship once, in the Android library's res/font; the preview loads the same files by name.
        resources.srcDir(sharedRoot.resolve("res/font"))
    }
}

dependencies {
    implementation("com.watchdogindex.agent:core")
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.foundation)
    implementation(compose.ui)
    implementation(compose.components.resources)
    implementation("org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("org.jetbrains.androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
    implementation("io.ktor:ktor-client-core:3.1.3")
    implementation("io.ktor:ktor-client-java:3.1.3")
    implementation("io.ktor:ktor-client-content-negotiation:3.1.3")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.1.3")
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
}

compose.desktop {
    application {
        mainClass = "com.watchdogindex.agent.preview.PreviewAppKt"
        nativeDistributions {
            targetFormats(TargetFormat.Msi, TargetFormat.Dmg, TargetFormat.Deb)
            packageName = "WatchdogPreview"
            packageVersion = "0.1.0"
        }
    }
}

// ./gradlew renderScreens  -> build/screens/<screen>-<theme>.png for every catalog entry
// ./gradlew compareScreens -> build/compare/<screen>-<theme>.png (reference | rendered | diff), needs -Pref=<dir>
tasks.register<JavaExec>("renderScreens") {
    group = "verification"
    description = "Render every screen in the catalog to PNG at Pixel size (412 x 892 dp, 2.625x)."
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.watchdogindex.agent.preview.ScreenshotsKt")
    systemProperty("java.awt.headless", "true")
    args("render", layout.buildDirectory.dir("screens").get().asFile.absolutePath, (project.findProperty("screens") ?: "").toString())
}
tasks.register<JavaExec>("compareScreens") {
    group = "verification"
    description = "Render and compare against reference PNGs in -Pref=<dir> (files named android-<screen>-<theme>.png)."
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.watchdogindex.agent.preview.ScreenshotsKt")
    systemProperty("java.awt.headless", "true")
    args("compare", layout.buildDirectory.dir("compare").get().asFile.absolutePath, (project.findProperty("screens") ?: "").toString(), (project.findProperty("ref") ?: "").toString())
}
tasks.withType<Test>().configureEach { useJUnitPlatform(); systemProperty("java.awt.headless", "true") }
