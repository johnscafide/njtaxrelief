package com.watchdogindex.agent.preview

import com.watchdogindex.agent.ui.preview.ScreenCatalog
import java.io.File
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The catalog is the contract between the renderer and the reference renders: every id must be unique, safe as
 * a file name and present in preview/reference as android-<id>-<theme>.png at the mockup frame size. The folder
 * is the evidence for full frames: a -full capture may exist only for an entry the catalog marks as scrolling
 * (fullHeightDp), must be taller than the frame, and the harness renders the full frame at the capture's height.
 * An entry that declares fullHeightDp without a capture is allowed (the harness says so and renders the frame
 * only), because the mockup, not the catalog, decides whether a screen scrolls.
 */
class ScreenCatalogTest {

    private val frameWidth = ScreenCatalog.WIDTH_DP
    private val frameHeight = ScreenCatalog.HEIGHT_DP

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
        val missing = ScreenCatalog.entries.flatMap { entry ->
            listOf("light", "dark").map { "android-${entry.id}-$it.png" }.filterNot { File(dir, it).isFile }
        }
        assertTrue(missing.isEmpty(), "reference renders missing in ${dir.path}: $missing (run node tools/render-mockups.mjs)")

        // And nothing in the folder is orphaned: every rendered screen has a catalog entry.
        val ids = ScreenCatalog.entries.map { it.id }.toSet()
        val orphaned = dir.listFiles { _, name -> name.startsWith("android-") && name.endsWith("-light.png") }.orEmpty()
            .map { it.name.removePrefix("android-").removeSuffix("-light.png") }
            .filter { it !in ids }
        assertTrue(orphaned.isEmpty(), "reference renders without a catalog entry: $orphaned")
    }

    @Test
    fun baseReferencesAreTheMockupFrame() {
        val dir = referenceDirectory()
        val wrong = ArrayList<String>()
        for (entry in ScreenCatalog.entries) {
            for (theme in listOf("light", "dark")) {
                val file = File(dir, "android-${entry.id}-$theme.png")
                if (!file.isFile) continue
                val (w, h) = size(file)
                // 1x captures are 412 x 892; a 2x folder is 824 x 1784. Either way the aspect is the frame's.
                if (w % frameWidth != 0 || h != frameHeight * (w / frameWidth)) wrong += "${file.name} is ${w}x$h"
            }
        }
        assertTrue(wrong.isEmpty(), "base references must be whole multiples of ${frameWidth}x$frameHeight: $wrong (capture by clip, not by element)")
    }

    @Test
    fun fullReferencesBelongToScrollingEntriesAndAreTaller() {
        val dir = referenceDirectory()
        val scrolling = ScreenCatalog.entries.filter { it.fullHeightDp != null }.map { it.id }.toSet()
        val fullFiles = dir.listFiles { _, name -> name.startsWith("android-") && name.endsWith("-full.png") }.orEmpty()
        val problems = ArrayList<String>()
        for (file in fullFiles) {
            val id = file.name.removePrefix("android-").removeSuffix("-full.png").substringBeforeLast('-')
            if (id !in scrolling) {
                problems += "${file.name} exists but catalog entry '$id' has no fullHeightDp"
                continue
            }
            val (w, h) = size(file)
            val heightDp = h.toDouble() * frameWidth / w
            if (heightDp <= frameHeight) problems += "${file.name} is ${w}x$h, no taller than the frame (the screen does not scroll; the tool must skip it)"
        }
        assertTrue(problems.isEmpty(), "full-height references disagree with the catalog: $problems")
        // Light and dark come in pairs: a full capture for one theme means one for the other.
        val themed = fullFiles.map { it.name.removePrefix("android-").removeSuffix("-full.png") }
        val unpaired = themed.filter { name ->
            val other = if (name.endsWith("-light")) name.removeSuffix("-light") + "-dark" else name.removeSuffix("-dark") + "-light"
            other !in themed
        }
        assertTrue(unpaired.isEmpty(), "full-height references without their other theme: $unpaired")
    }

    private fun size(file: File): Pair<Int, Int> {
        val image = ImageIO.read(file) ?: fail("${file.name} is not a readable image")
        return image.width to image.height
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
