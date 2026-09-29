package com.watchdogindex.agent.preview

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font

/**
 * Plus Jakarta Sans for the desktop. The Android library ships the five weights in `shared/src/main/res/font`;
 * the preview build puts that folder on the classpath as plain resources, so each file is reachable by its bare
 * name (`plus_jakarta_sans_700.ttf`). Loading goes through the byte-based desktop [Font] factory so a missing
 * file is detected up front instead of failing later inside text layout.
 */
object DesktopFonts {
    /** File weight suffix to Compose weight, the same five faces the mockups use. */
    private val faces: List<Pair<Int, FontWeight>> = listOf(
        400 to FontWeight.Normal,
        500 to FontWeight.Medium,
        600 to FontWeight.SemiBold,
        700 to FontWeight.Bold,
        800 to FontWeight.ExtraBold,
    )

    fun resourceName(weight: Int): String = "plus_jakarta_sans_$weight.ttf"

    /**
     * The bundled family, or [FontFamily.SansSerif] with a note on stderr when any face is missing from the
     * classpath. Falling back to the system font keeps the preview usable while making the mismatch obvious in
     * the renders (the mockups are set in Plus Jakarta Sans).
     */
    fun plusJakartaSans(): FontFamily {
        val fonts = ArrayList<Font>(faces.size)
        for ((weight, fontWeight) in faces) {
            val name = resourceName(weight)
            val bytes = resourceBytes(name)
            if (bytes == null) {
                System.err.println("DesktopFonts: $name is not on the classpath; falling back to the system sans-serif.")
                return FontFamily.SansSerif
            }
            fonts += Font("plus_jakarta_sans_$weight", bytes, fontWeight)
        }
        return FontFamily(fonts)
    }

    /** True when every face can be found; tests use this to explain a fallback. */
    fun isBundled(): Boolean = faces.all { (weight, _) -> resourceBytes(resourceName(weight)) != null }

    private fun resourceBytes(name: String): ByteArray? {
        val loader = Thread.currentThread().contextClassLoader ?: DesktopFonts::class.java.classLoader
        val stream = loader.getResourceAsStream(name) ?: DesktopFonts::class.java.getResourceAsStream("/$name") ?: return null
        return stream.use { it.readBytes() }
    }
}
