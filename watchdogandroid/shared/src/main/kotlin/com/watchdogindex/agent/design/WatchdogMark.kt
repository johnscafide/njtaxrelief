package com.watchdogindex.agent.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.min

/**
 * The Watchdog mark: the white dog silhouette on the blue gradient tile, taken from the repository's
 * brand SVG (viewBox 950 x 946). [cornerRadius] rounds the tile the way the mockups do (logo tiles use a
 * quarter-of-size radius).
 */
object WatchdogMark {
    const val VIEWPORT_WIDTH = 950f
    const val VIEWPORT_HEIGHT = 946f

    /** Tile gradient: #0d3185 -> #064bcf (55%) -> #1780ff, top-left to bottom-right. */
    val gradientStops = listOf(0f to Color(0xFF0D3185), 0.55f to Color(0xFF064BCF), 1f to Color(0xFF1780FF))

    const val DOG_PATH =
        "M456.00,116.00 L369.00,258.00 L357.00,297.00 L350.00,341.00 L300.00,426.00 L266.00,499.00 L237.00,578.00 " +
            "L213.00,667.00 L227.00,680.00 L267.00,709.00 L341.00,755.00 L418.00,794.00 L488.00,822.00 L491.00,820.00 " +
            "L488.00,797.00 L475.00,753.00 L452.00,708.00 L417.00,653.00 L403.00,617.00 L399.00,589.00 L400.00,558.00 " +
            "L413.00,505.00 L417.00,504.00 L414.00,526.00 L416.00,567.00 L425.00,599.00 L435.00,621.00 L465.00,667.00 " +
            "L514.00,727.00 L546.00,773.00 L550.00,775.00 L597.00,730.00 L597.00,725.00 L555.00,621.00 L536.00,618.00 " +
            "L519.00,619.00 L517.00,616.00 L551.00,593.00 L594.00,576.00 L707.00,571.00 L716.00,568.00 L755.00,540.00 " +
            "L762.00,532.00 L792.00,458.00 L792.00,450.00 L788.00,445.00 L669.00,399.00 L663.00,394.00 L658.00,385.00 " +
            "L650.00,346.00 L646.00,338.00 L633.00,327.00 L572.00,290.00 L579.00,185.00 L578.00,141.00 L573.00,141.00 " +
            "L494.00,261.00 L492.00,263.00 L483.00,262.00 L478.00,256.00 L471.00,169.00 L462.00,116.00Z" +
            "M613.00,402.00 L593.00,408.00 L549.00,389.00 L545.00,385.00 L598.00,373.00 L602.00,376.00Z"

    fun dogPath(): Path = PathParser().parsePathString(DOG_PATH).toPath().apply { fillType = PathFillType.EvenOdd }
}

/** Draws the Watchdog mark as a square tile of [size] with rounded corners. */
@Composable
fun WatchdogLogo(size: Dp, modifier: Modifier = Modifier, cornerRadius: Dp = size / 4, contentDescription: String? = "Watchdog") {
    val path = remember { WatchdogMark.dogPath() }
    val semantics = if (contentDescription == null) modifier else modifier.semantics { this.contentDescription = contentDescription }
    Canvas(semantics.size(size)) {
        val r = cornerRadius.toPx()
        val tile = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, 0f, this@Canvas.size.width, this@Canvas.size.height, androidx.compose.ui.geometry.CornerRadius(r, r))) }
        drawPath(tile, Brush.linearGradient(*WatchdogMark.gradientStops.toTypedArray(), start = Offset.Zero, end = Offset(this.size.width, this.size.height)))
        val s = min(this.size.width / WatchdogMark.VIEWPORT_WIDTH, this.size.height / WatchdogMark.VIEWPORT_HEIGHT)
        translate((this.size.width - WatchdogMark.VIEWPORT_WIDTH * s) / 2f, (this.size.height - WatchdogMark.VIEWPORT_HEIGHT * s) / 2f) {
            scale(s, s, pivot = Offset.Zero) { drawPath(path, Color.White) }
        }
    }
}
