# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.watchdogindex.agent.**$$serializer { *; }
-keepclassmembers class com.watchdogindex.agent.** { *** Companion; }
-keepclasseswithmembers class com.watchdogindex.agent.** { kotlinx.serialization.KSerializer serializer(...); }
# Ktor / OkHttp
# Ktor discovers engines through ServiceLoader; keep the OkHttp container so a minified release build still finds it.
-keep class io.ktor.client.HttpClientEngineContainer
-keep class io.ktor.client.engine.okhttp.OkHttpEngineContainer { *; }
-keep class * implements io.ktor.client.HttpClientEngineContainer { *; }
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-dontwarn okhttp3.**
-dontwarn okio.**
# MapLibre
-keep class org.maplibre.android.** { *; }
-dontwarn org.maplibre.android.**
