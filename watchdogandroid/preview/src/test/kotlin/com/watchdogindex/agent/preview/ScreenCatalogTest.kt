package com.watchdogindex.agent.preview

import com.watchdogindex.agent.ui.preview.ScreenCatalog
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The catalog is the contract between the renderer and the reference renders: every id must be unique, safe as
 * a file name and present in preview/reference as android-<id>-<theme>.png (plus -full for scrolling screens).
 */
class ScreenCatalogTest {

    @Test
    fun idsAreUniqueAndFileSafe() {
        val ids = ScreenCatalog.entries.map { it.id }
        assertEquals(ids.size, ids.toSet().size, "duplicate catalog ids: ${ids.groupBy { it }.filter { it.value.size > 1 }.keys}")
        val fileSafe = Regex("^[a-z][a-z0-9-]*$")
        ids.forEach { assertTrue(fileSafe.matches(it), "catalog id '$it' must be lower-case letters, digits and dashes") }
        assertTrue(ScreenCatalog.entries.all { it.title.isNotBlank() }, "every catalog entry needs a title")
    }

    @Test
    fun frameMatchesThePixelMockupFrame() {
        assertEquals(412, ScreenCatalog.WIDTH_DP)
        assertEquals(892, ScreenCatalog.HEIGHT_DP)
        assertEquals(2.625f, ScreenCatalog.DENSITY)
        ScreenCatalog.entries.forEach { entry ->
            val full = entry.fullHeightDp ?: return@forEach
            assertTrue(full > ScreenCatalog.HEIGHT_DP, "${entry.id}: fullHeightDp ($full) must be taller than the frame")
        }
    }

    @Test
    fun idsMatchTheReferenceRenders() {
        val dir = referenceDirectory()
        val missing = ArrayList<String>()
        for (entry in ScreenCatalog.entries) {
            for (theme in listOf("light", "dark")) {
                val names = listOfNotNull("android-${entry.id}-$theme.png", entry.fullHeightDp?.let { "android-${entry.id}-$theme-full.png" })
                names.filterNot { File(dir, it).isFile }.forEach { missing += it }
            }
        }
        assertTrue(missing.isEmpty(), "reference renders missing in ${dir.path}: $missing (run node tools/render-mockups.mjs)")

        // And nothing in the folder is orphaned: every rendered screen has a catalog entry.
        val ids = ScreenCatalog.entries.map { it.id }.toSet()
        val orphaned = dir.listFiles { _, name -> name.startsWith("android-") && name.endsWith("-light.png") }.orEmpty()
            .map { it.name.removePrefix("android-").removeSuffix("-light.png") }
            .filter { it !in ids }
        assertTrue(orphaned.isEmpty(), "reference renders without a catalog entry: $orphaned")
    }

    private fun referenceDirectory(): File {
        val candidates = listOfNotNull(
            System.getProperty("watchdog.referenceDir")?.let(::File),
            File("reference"),
            File("preview/reference"),
            File("../preview/reference"),
        )
        return candidates.firstOrNull { it.isDirectory }
            ?: fail("preview/reference not found from ${File(".").absolutePath}; run the tests from the preview directory or set -Dwatchdog.referenceDir")
    }
}
