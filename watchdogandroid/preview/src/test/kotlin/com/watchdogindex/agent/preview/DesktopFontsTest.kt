package com.watchdogindex.agent.preview

import androidx.compose.ui.text.font.FontFamily
import kotlin.test.Test
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** The five Plus Jakarta Sans faces ship with the shared module and must be on the preview classpath. */
class DesktopFontsTest {

    @Test
    fun theBundledFacesAreOnTheClasspath() {
        assertTrue(DesktopFonts.isBundled(), "plus_jakarta_sans_{400,500,600,700,800}.ttf must be resources (shared/src/main/res/font)")
        listOf(400, 500, 600, 700, 800).forEach { assertTrue(DesktopFonts.resourceName(it).endsWith("_$it.ttf")) }
    }

    @Test
    fun loadsTheFamilyRatherThanFallingBack() {
        val family = DesktopFonts.plusJakartaSans()
        assertNotEquals(FontFamily.SansSerif, family, "the bundled family should load; SansSerif means a face was missing")
    }
}
