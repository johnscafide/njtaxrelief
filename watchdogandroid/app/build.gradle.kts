import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Firebase Cloud Messaging is optional at build time: the Google Services plugin is applied only when a
// google-services.json is present, so the app builds and runs (with push reported as "not set up") without it.
val hasGoogleServices = file("google-services.json").exists()
if (hasGoogleServices) apply(plugin = libs.plugins.google.services.get().pluginId)

android {
    namespace = "com.watchdogindex.agent"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.watchdogindex.agent"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("boolean", "FIREBASE_CONFIGURED", hasGoogleServices.toString())
        buildConfigField("boolean", "PASSKEYS_ENABLED", "false") // The backend has no WebAuthn yet; flip when it does.
    }

    signingConfigs {
        // Release signing reads keystore details from keystore.properties (never committed) or the
        // WATCHDOG_* environment variables in CI. Debug builds use the default debug key.
        create("release") {
            val props = Properties()
            val f = rootProject.file("keystore.properties")
            if (f.exists()) f.inputStream().use { props.load(it) }
            val store = props.getProperty("storeFile") ?: System.getenv("WATCHDOG_KEYSTORE_FILE")
            if (store != null) {
                storeFile = file(store)
                storePassword = props.getProperty("storePassword") ?: System.getenv("WATCHDOG_KEYSTORE_PASSWORD")
                keyAlias = props.getProperty("keyAlias") ?: System.getenv("WATCHDOG_KEY_ALIAS")
                keyPassword = props.getProperty("keyPassword") ?: System.getenv("WATCHDOG_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release").takeIf { it.storeFile != null }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi",
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
        )
    }
    packaging { resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/INDEX.LIST", "/META-INF/io.netty.versions.properties") }
    testOptions.unitTests.isReturnDefaultValues = true
}

dependencies {
    implementation(project(":shared"))
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    // The Ktor engine the app names explicitly in WatchdogApplication.buildHttpClient (no ServiceLoader lookup).
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.maplibre)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)
    implementation(libs.mlkit.barcode)
    implementation(libs.play.services.location)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
}
