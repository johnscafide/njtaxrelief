package com.watchdogindex.agent.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.unit.Density
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.sample.SampleData
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.design.WatchdogLightColors
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.platform.FarmMapState
import org.junit.jupiter.api.Assumptions.assumeTrue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Proves the headless renderer works on this machine: Skiko loads, a scene renders, pixels read back. When the
 * native library cannot initialise (no supported display stack, unsupported CPU) the tests are skipped with the
 * reason rather than failing the build, since the harness itself is what is missing, not the app.
 */
class SmokeRenderTest {

    @Test
    fun rendersASolidBoxAndReadsItsPixels() {
        val red = Color(0xFFC4322B)
        val scene = openScene(64, 64) { Box(Modifier.fillMaxSize().background(red)) } ?: return
        try {
            val image = scene.render(0L)
            val pixels = IntArray(64 * 64)
            image.toComposeImageBitmap().readPixels(pixels)
            assertEquals(0xFFC4322B.toInt(), pixels[32 * 64 + 32], "centre pixel should be the box colour")
            assertEquals(64, image.width)
            assertEquals(64, image.height)
        } finally {
            scene.close()
        }
    }

    @Test
    fun drawsTheSampleFarmInScoreBandColours() {
        val grid = SampleData.birchwoodGrid
        val farm = SampleData.birchwoodFarm
        val state = FarmMapState(
            center = farm.center,
            zoom = farm.zoom,
            boundary = farm.boundary,
            parcels = grid.parcels,
            layer = MapLayer.Score,
            selectedPin = SampleData.BIRCHWOOD_PIN,
            onParcelTap = {},
        )
        val width = 412
        val height = 500
        val scene = openScene(width, height) {
            WatchdogTheme(mode = ThemeMode.Light, reducedMotion = true) {
                DesktopFarmMap(state, Modifier.fillMaxSize())
            }
        } ?: return
        try {
            // A few frames so the size-dependent parts (grid, callout) have laid out.
            scene.render(0L)
            val image = scene.render(16_000_000L)
            val pixels = IntArray(width * height)
            image.toComposeImageBitmap().readPixels(pixels)
            // Inside the farm every colour carries the boundary's 5% tint (as in the mockup), so compare with a
            // small per-channel tolerance instead of exact values.
            val bands = WatchdogLightColors.mapBands.map { it.argb() }
            val land = WatchdogLightColors.mapLand.argb()
            val dot = WatchdogLightColors.mapDot.argb()
            val bandPixels = pixels.count { p -> bands.any { near(it, p) } }
            val landPixels = pixels.count { it == land }
            assertTrue(bandPixels > width * height / 40, "expected score-band parcels on the map, found $bandPixels band pixels")
            assertTrue(landPixels > 0, "the land colour should show through between parcels")
            assertTrue(pixels.any { near(dot, it) }, "sold homes should carry a gold dot")
        } finally {
            scene.close()
        }
    }

    private fun openScene(width: Int, height: Int, content: @androidx.compose.runtime.Composable () -> Unit): ImageComposeScene? {
        return try {
            ImageComposeScene(width = width, height = height, density = Density(1f), content = content)
        } catch (t: Throwable) {
            // UnsatisfiedLinkError / ExceptionInInitializerError: Skiko's native library is unavailable here.
            assumeTrue(false, "Skipped: the Skiko renderer could not initialise on this machine ($t)")
            null
        }
    }

    private fun near(expected: Int, actual: Int, tolerance: Int = 20): Boolean {
        for (shift in listOf(16, 8, 0)) {
            if (kotlin.math.abs(((expected shr shift) and 255) - ((actual shr shift) and 255)) > tolerance) return false
        }
        return true
    }

    private fun Color.argb(): Int {
        val r = (red * 255 + 0.5f).toInt()
        val g = (green * 255 + 0.5f).toInt()
        val b = (blue * 255 + 0.5f).toInt()
        val a = (alpha * 255 + 0.5f).toInt()
        return (a shl 24) or (r shl 16) or (g shl 8) or b
    }
}
