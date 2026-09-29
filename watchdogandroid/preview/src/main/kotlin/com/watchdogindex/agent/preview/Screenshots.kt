package com.watchdogindex.agent.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.watchdogindex.agent.app.SampleAppGraph
import com.watchdogindex.agent.design.WatchdogDarkColors
import com.watchdogindex.agent.design.WatchdogLightColors
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.preview.CatalogEntry
import com.watchdogindex.agent.ui.preview.CatalogScreen
import com.watchdogindex.agent.ui.preview.ScreenCatalog
import org.jetbrains.skia.EncodedImageFormat
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import java.util.Locale
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.stream.FileImageOutputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.system.exitProcess

/*
 * README: the screenshot harness.
 *
 * Renders every screen in ScreenCatalog on the sample data set, headlessly, at the Pixel frame the mockups use
 * (412 x 892 dp at 2.625 px/dp), in light and dark, and optionally compares the renders with the approved mockup
 * renders produced by tools/render-mockups.mjs.
 *
 *   ScreenshotsKt render  <outDir> [ids] [refDir]   writes <id>-<light|dark>.png, plus <id>-<theme>-full.png for
 *                                                   entries with fullHeightDp (the whole scrolling page)
 *   ScreenshotsKt compare <outDir> [ids] <refDir>   renders as above, then for each frame loads
 *                                                   <refDir>/android-<id>-<theme>[-full].png, prints
 *                                                   "<id> <theme> similarity 93.1%" and a coarse text heat map of
 *                                                   where the render differs, writes compare-<id>-<theme>.jpg
 *                                                   (reference | render | diff, red where different) and ends
 *                                                   with a summary table
 *
 * From Gradle (preview/):  ./gradlew renderScreens [-Pscreens=today,farm]        -> build/screens
 *                          ./gradlew compareScreens -Pref=reference [-Pscreens=…] -> build/compare
 * ids is a comma list of catalog ids; empty means every screen. refDir defaults to ./reference in compare mode.
 *
 * A screen loads its data in a coroutine, so each frame is rendered repeatedly (50 ms apart, up to 3 s) until two
 * consecutive renders are pixel-identical, at least 600 ms have passed (the sample data answers after 150 ms per
 * call) and the scene has no pending invalidations. Similarity counts pixels
 * whose largest channel difference is at most 24 of 255, after scaling the reference to the render size.
 * Render mode always exits 0. Compare mode exits 1 only when a screen could not be rendered at all; visual
 * differences are reported, never fatal (the comparison is report-only until the baseline is stable).
 */

private const val SETTLE_MILLIS = 3_000L
private const val FRAME_MILLIS = 50L
/**
 * Two identical frames are not proof the data has arrived: the sample repositories answer after 150 ms and a
 * screen may chain a few calls, so a static loading state could repeat itself first. Nothing counts as settled
 * before this much time has passed.
 */
private const val MIN_SETTLE_MILLIS = 600L
private const val CHANNEL_TOLERANCE = 24
private const val HEAT_COLUMNS = 24
private const val HEAT_MAX_ROWS = 48

fun main(args: Array<String>) {
    if (System.getProperty("java.awt.headless") == null) System.setProperty("java.awt.headless", "true")
    val mode = args.getOrNull(0)?.lowercase(Locale.ROOT) ?: "render"
    if (mode != "render" && mode != "compare") {
        System.err.println("Unknown mode '$mode'. Usage: render|compare <outDir> [ids] [refDir]")
        exitProcess(2)
    }
    val outDir = File(args.getOrNull(1)?.takeIf { it.isNotBlank() } ?: "build/screens").absoluteFile
    val ids = args.getOrNull(2).orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() }
    val refDir = args.getOrNull(3)?.takeIf { it.isNotBlank() }?.let { File(it).absoluteFile }
        ?: if (mode == "compare") File("reference").absoluteFile else null

    val entries = selectEntries(ids)
    if (entries.isEmpty()) {
        System.err.println("No screens selected. Known ids: ${ScreenCatalog.entries.joinToString { it.id }}")
        exitProcess(2)
    }
    if (mode == "compare" && (refDir == null || !refDir.isDirectory)) {
        System.err.println("Reference directory not found: $refDir (pass -Pref=<dir> or run from preview/ with ./reference present)")
        exitProcess(2)
    }
    outDir.mkdirs()

    val fontFamily = DesktopFonts.plusJakartaSans()
    val results = ArrayList<FrameResult>()
    for (entry in entries) {
        for (dark in listOf(false, true)) {
            val theme = if (dark) "dark" else "light"
            val heights = listOfNotNull(ScreenCatalog.HEIGHT_DP, entry.fullHeightDp?.takeIf { it > ScreenCatalog.HEIGHT_DP })
            for (heightDp in heights) {
                val full = heightDp != ScreenCatalog.HEIGHT_DP
                val name = "${entry.id}-$theme" + if (full) "-full" else ""
                val started = System.currentTimeMillis()
                val frame = try {
                    ScreenRenderer.render(entry, dark, heightDp, fontFamily)
                } catch (t: Throwable) {
                    System.err.println("$name FAILED to render: $t")
                    t.printStackTrace()
                    results += FrameResult(entry, theme, full, null, null)
                    continue
                }
                File(outDir, "$name.png").writeBytes(frame.png)
                val took = System.currentTimeMillis() - started
                println("$name rendered ${frame.width}x${frame.height} in $took ms" + if (frame.settled) "" else " (did not settle within ${SETTLE_MILLIS} ms)")

                var similarity: Double? = null
                if (mode == "compare" && refDir != null) {
                    val refFile = File(refDir, "android-$name.png")
                    if (!refFile.isFile) {
                        println("${entry.id} $theme${if (full) " full" else ""} no reference at ${refFile.path}")
                    } else {
                        val comparison = ScreenComparer.compare(frame, refFile)
                        similarity = comparison.similarity
                        println("${entry.id} $theme${if (full) " full" else ""} similarity ${"%.1f".format(Locale.ROOT, comparison.similarity)}%")
                        comparison.heatMap.forEach { println("    $it") }
                        ScreenComparer.writeComposite(comparison, File(outDir, "compare-$name.jpg"))
                    }
                }
                results += FrameResult(entry, theme, full, frame, similarity)
            }
        }
    }

    if (mode == "compare") printSummary(results)
    val failed = results.count { it.frame == null }
    println("Done: ${results.size - failed} frames written to $outDir" + if (failed > 0) ", $failed failed" else "")
    exitProcess(if (mode == "compare" && failed > 0) 1 else 0)
}

private fun selectEntries(ids: List<String>): List<CatalogEntry> {
    if (ids.isEmpty()) return ScreenCatalog.entries
    val known = ScreenCatalog.entries.associateBy { it.id }
    val unknown = ids.filter { it !in known }
    if (unknown.isNotEmpty()) System.err.println("Unknown screen ids ignored: $unknown. Known: ${known.keys.joinToString()}")
    return ids.mapNotNull { known[it] }
}

private class FrameResult(val entry: CatalogEntry, val theme: String, val full: Boolean, val frame: RenderedFrame?, val similarity: Double?)

private fun printSummary(results: List<FrameResult>) {
    println()
    println("Screen          Theme  Frame        Similarity")
    println("--------------  -----  -----------  ----------")
    for (r in results) {
        val frameLabel = if (r.full) "full ${r.entry.fullHeightDp} dp" else "${ScreenCatalog.HEIGHT_DP} dp"
        val value = when {
            r.frame == null -> "render failed"
            r.similarity == null -> "no reference"
            else -> "%.1f%%".format(Locale.ROOT, r.similarity)
        }
        println("%-14s  %-5s  %-11s  %s".format(Locale.ROOT, r.entry.id, r.theme, frameLabel, value))
    }
    val measured = results.mapNotNull { it.similarity }
    if (measured.isNotEmpty()) {
        println()
        println("Average similarity over ${measured.size} frames: %.1f%%  (lowest %.1f%%)".format(Locale.ROOT, measured.average(), measured.min()))
    }
}

/** One rendered frame: ARGB pixels for comparison and the PNG bytes Skia encoded. */
class RenderedFrame(
    val id: String,
    val theme: String,
    val full: Boolean,
    val width: Int,
    val height: Int,
    val pixels: IntArray,
    val png: ByteArray,
    val settled: Boolean,
)

/** Owns the ViewModels and a resumed lifecycle for one headless scene, since ImageComposeScene provides neither. */
private class HarnessOwner : ViewModelStoreOwner, LifecycleOwner {
    override val viewModelStore: ViewModelStore = ViewModelStore()
    private val registry: LifecycleRegistry = LifecycleRegistry.createUnsafe(this)
    override val lifecycle: Lifecycle get() = registry

    init {
        registry.currentState = Lifecycle.State.RESUMED
    }

    fun close() {
        registry.currentState = Lifecycle.State.DESTROYED
        viewModelStore.clear()
    }
}

object ScreenRenderer {
    /**
     * Renders [entry] in the given theme at [heightDp] tall on a fresh sample graph, waiting for the screen's data
     * to arrive as described in the file header.
     */
    fun render(entry: CatalogEntry, dark: Boolean, heightDp: Int, fontFamily: FontFamily): RenderedFrame {
        val density = ScreenCatalog.DENSITY
        val width = (ScreenCatalog.WIDTH_DP * density).roundToInt()
        val height = (heightDp * density).roundToInt()
        // A new graph per frame: nothing an earlier screen toggled leaks into the next render.
        val graph = SampleAppGraph(DesktopPlatformServices(), fontFamily)
        val owner = HarnessOwner()
        // The theme's page colour behind the screen, as the Android window background would be: screens paint
        // their own Scaffold, so this only shows through where a screen leaves nothing, and it keeps the
        // renders opaque for the PNGs and the JPEG composites.
        val page = if (dark) WatchdogDarkColors.bg else WatchdogLightColors.bg
        val scene = ImageComposeScene(width = width, height = height, density = Density(density)) {
            CompositionLocalProvider(
                LocalViewModelStoreOwner provides owner,
                LocalLifecycleOwner provides owner,
                LocalBottomChromeInsets provides WindowInsets(bottom = 24.dp),
            ) {
                Box(Modifier.fillMaxSize().background(page)) {
                    CatalogScreen(entry, graph, dark)
                }
            }
        }
        try {
            val start = System.nanoTime()
            var previous: IntArray? = null
            var settled = false
            var image = scene.render(0L)
            var pixels = readPixels(image, width, height)
            while (true) {
                val elapsedMillis = (System.nanoTime() - start) / 1_000_000
                // State written from the sample repositories' coroutines reaches the scene through snapshot
                // apply notifications; flushing them before asking about invalidations keeps the check honest
                // whichever thread wrote the state.
                Snapshot.sendApplyNotifications()
                val unchanged = previous != null && pixels.contentEquals(previous)
                if (unchanged && elapsedMillis >= MIN_SETTLE_MILLIS && !scene.hasInvalidations()) {
                    settled = true
                    break
                }
                if (elapsedMillis >= SETTLE_MILLIS) break
                Thread.sleep(FRAME_MILLIS)
                previous = pixels
                Snapshot.sendApplyNotifications()
                image = scene.render(System.nanoTime() - start)
                pixels = readPixels(image, width, height)
            }
            val png = image.encodeToData(EncodedImageFormat.PNG)?.bytes ?: error("Skia could not encode the render as PNG")
            return RenderedFrame(entry.id, if (dark) "dark" else "light", heightDp != ScreenCatalog.HEIGHT_DP, width, height, pixels, png, settled)
        } finally {
            scene.close()
            owner.close()
        }
    }

    private fun readPixels(image: org.jetbrains.skia.Image, width: Int, height: Int): IntArray {
        val buffer = IntArray(width * height)
        image.toComposeImageBitmap().readPixels(buffer)
        return buffer
    }
}

/** The outcome of comparing one render with its reference. */
class Comparison(
    val frame: RenderedFrame,
    val reference: BufferedImage,
    /** Percentage of pixels within [CHANNEL_TOLERANCE] on every channel. */
    val similarity: Double,
    /** Per-pixel largest channel difference, 0..255. */
    val difference: IntArray,
    val heatMap: List<String>,
)

object ScreenComparer {
    fun compare(frame: RenderedFrame, referenceFile: File): Comparison {
        val loaded = ImageIO.read(referenceFile) ?: error("Not an image: $referenceFile")
        val reference = fitTo(loaded, frame.width, frame.height)
        val refPixels = IntArray(frame.width * frame.height)
        reference.getRGB(0, 0, frame.width, frame.height, refPixels, 0, frame.width)
        val difference = IntArray(refPixels.size)
        var similar = 0
        for (i in refPixels.indices) {
            val a = refPixels[i]
            val b = frame.pixels[i]
            val d = maxOf(
                abs(((a shr 16) and 255) - ((b shr 16) and 255)),
                abs(((a shr 8) and 255) - ((b shr 8) and 255)),
                abs((a and 255) - (b and 255)),
            )
            difference[i] = d
            if (d <= CHANNEL_TOLERANCE) similar++
        }
        val similarity = similar * 100.0 / refPixels.size
        return Comparison(frame, reference, similarity, difference, heatMap(difference, frame.width, frame.height))
    }

    /** Bilinear resample when the reference was captured at another scale (1x or 2x versus the 2.625x render). */
    private fun fitTo(image: BufferedImage, width: Int, height: Int): BufferedImage {
        if (image.width == width && image.height == height && image.type == BufferedImage.TYPE_INT_RGB) return image
        val out = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val g = out.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.drawImage(image, 0, 0, width, height, null)
        g.dispose()
        return out
    }

    /**
     * A coarse picture of where the render differs, for the job log: [HEAT_COLUMNS] cells across, square cells
     * unless the frame is so tall that more than [HEAT_MAX_ROWS] rows would be needed. Each cell shows the share
     * of its pixels beyond tolerance: ' ' under 2%, '.' under 10%, ':' under 30%, '+' under 60%, '#' otherwise.
     */
    fun heatMap(difference: IntArray, width: Int, height: Int): List<String> {
        val cellW = max(1, width / HEAT_COLUMNS)
        val cols = (width + cellW - 1) / cellW
        val cellH = max(cellW, (height + HEAT_MAX_ROWS - 1) / HEAT_MAX_ROWS)
        val rows = (height + cellH - 1) / cellH
        val lines = ArrayList<String>(rows + 2)
        lines += "+" + "-".repeat(cols) + "+"
        for (r in 0 until rows) {
            val sb = StringBuilder("|")
            for (c in 0 until cols) {
                var bad = 0
                var total = 0
                val yEnd = min(height, (r + 1) * cellH)
                val xEnd = min(width, (c + 1) * cellW)
                for (y in r * cellH until yEnd) {
                    val row = y * width
                    for (x in c * cellW until xEnd) {
                        total++
                        if (difference[row + x] > CHANNEL_TOLERANCE) bad++
                    }
                }
                val share = if (total == 0) 0.0 else bad.toDouble() / total
                sb.append(
                    when {
                        share < 0.02 -> ' '
                        share < 0.10 -> '.'
                        share < 0.30 -> ':'
                        share < 0.60 -> '+'
                        else -> '#'
                    },
                )
            }
            lines += sb.append('|').toString()
        }
        lines += "+" + "-".repeat(cols) + "+"
        return lines
    }

    /** reference | render | difference, side by side, as a JPEG at quality 0.85. */
    fun writeComposite(comparison: Comparison, file: File) {
        val w = comparison.frame.width
        val h = comparison.frame.height
        val gap = 8
        val out = BufferedImage(w * 3 + gap * 2, h, BufferedImage.TYPE_INT_RGB)
        val g = out.createGraphics()
        g.color = java.awt.Color(0x14213D)
        g.fillRect(0, 0, out.width, out.height)
        g.drawImage(comparison.reference, 0, 0, null)
        g.dispose()
        out.setRGB(w + gap, 0, w, h, comparison.frame.pixels, 0, w)
        val heat = IntArray(w * h)
        for (i in heat.indices) {
            val d = comparison.difference[i]
            if (d > CHANNEL_TOLERANCE) {
                // Red, stronger the larger the difference.
                val strength = 140 + (115 * min(255, d) / 255)
                heat[i] = (0xFF shl 24) or (strength shl 16) or (0x20 shl 8) or 0x20
            } else {
                // Matching pixels fade to a light grey rendition of the render so the layout stays readable.
                val p = comparison.frame.pixels[i]
                val lum = (((p shr 16) and 255) * 299 + ((p shr 8) and 255) * 587 + (p and 255) * 114) / 1000
                val v = 200 + lum * 55 / 255
                heat[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
            }
        }
        out.setRGB((w + gap) * 2, 0, w, h, heat, 0, w)
        writeJpeg(out, file, 0.85f)
    }

    private fun writeJpeg(image: BufferedImage, file: File, quality: Float) {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val param = writer.defaultWriteParam.apply {
            compressionMode = ImageWriteParam.MODE_EXPLICIT
            compressionQuality = quality
        }
        file.parentFile?.mkdirs()
        FileImageOutputStream(file).use { stream ->
            writer.output = stream
            writer.write(null, IIOImage(image, null, null), param)
        }
        writer.dispose()
    }
}
