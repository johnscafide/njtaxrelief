# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.watchdogindex.agent.**$$serializer { *; }
-keepclassmembers class com.watchdogindex.agent.** { *** Companion; }
-keepclasseswithmembers class com.watchdogindex.agent.** { kotlinx.serialization.KSerializer serializer(...); }
# Ktor / OkHttp
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-dontwarn okhttp3.**
-dontwarn okio.**
# MapLibre
-keep class org.maplibre.android.** { *; }
-dontwarn org.maplibre.android.**
