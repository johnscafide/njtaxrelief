package com.watchdogindex.agent.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.hypot

/**
 * The Watchdog Intelligence brand signature, as fixed by the brand rules:
 *  - the rotating cyan -> blue -> violet -> magenta border belongs on the OUTER Intelligence surface only;
 *  - that surface stays white even in dark mode, with fixed light-ink text colors ([Spectrum.ink] etc.);
 *  - in the product name only the word "Intelligence" carries the spectrum gradient, "Watchdog" stays in the
 *    surrounding text color;
 *  - the name is never put in a pill or capsule;
 *  - with reduced motion the border is static.
 */
object Intelligence {
    /** Horizontal text gradient for the word "Intelligence" (CSS: 0%, 34%, 67%, 100%). */
    fun wordBrush(width: Float = Float.POSITIVE_INFINITY): Brush = Brush.linearGradient(
        colorStops = arrayOf(0f to Spectrum.cyan, .34f to Spectrum.blue, .67f to Spectrum.violet, 1f to Spectrum.magenta),
        start = Offset.Zero,
        end = Offset(width, 0f),
    )

    /** The word with the spectrum treatment, to be used inside a Text via [productName]. */
    val wordStyle: SpanStyle get() = SpanStyle(brush = wordBrush())

    /** "Watchdog Intelligence" with only the second word in spectrum. [suffix] adds e.g. " Voice". */
    fun productName(suffix: String = ""): AnnotatedString = buildAnnotatedString {
        append("Watchdog ")
        withStyle(wordStyle) { append("Intelligence") }
        if (suffix.isNotEmpty()) append(suffix)
    }

    const val ROTATION_MILLIS = 7000
    val borderWidth = 2.dp
}

/**
 * Draws the rotating spectrum border and the white surface behind the content. Apply padding after this
 * modifier. [shape] defaults to the 24 dp card. Honors [LocalReducedMotion] by not rotating.
 */
fun Modifier.intelligenceSurface(
    shape: Shape = RoundedCornerShape(24.dp),
    borderWidth: Dp = Intelligence.borderWidth,
    surfaceColor: Color = Spectrum.surface,
): Modifier = composed {
    val reduced = LocalReducedMotion.current
    val angle: Float = if (reduced) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "intelligence-border")
        val a by transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(Intelligence.ROTATION_MILLIS, easing = LinearEasing), RepeatMode.Restart),
            label = "angle",
        )
        a
    }
    drawWithCache {
        val outer = shape.createOutline(size, layoutDirection, this)
        val bw = borderWidth.toPx()
        val innerSize = Size(size.width - bw * 2, size.height - bw * 2)
        val inner = shape.createOutline(innerSize, layoutDirection, this)
        val ring = Path().apply {
            addOutline(outer)
            val innerPath = Path().apply { addOutline(inner); translate(Offset(bw, bw)) }
            op(this, innerPath, androidx.compose.ui.graphics.PathOperation.Difference)
        }
        // CSS conic-gradient(from angle, cyan 0deg, blue 90deg, violet 170deg, magenta 260deg, cyan 360deg),
        // where 0deg points up. Compose sweep gradients start at 3 o'clock, hence the -90 offset.
        val sweep = Brush.sweepGradient(
            colorStops = arrayOf(0f to Spectrum.borderCyan, .25f to Spectrum.blue, .472f to Spectrum.violet, .722f to Spectrum.magenta, 1f to Spectrum.borderCyan),
            center = Offset(size.width / 2f, size.height / 2f),
        )
        val diag = hypot(size.width, size.height)
        onDrawBehind {
            clipPath(ring) {
                rotate(degrees = angle - 90f) {
                    drawRect(sweep, topLeft = Offset(size.width / 2f - diag, size.height / 2f - diag), size = Size(diag * 2, diag * 2))
                }
            }
            translate(bw, bw) { drawOutline(inner, surfaceColor) }
        }
    }
}

/** Provides the fixed light-ink colors used for anything drawn on the white Intelligence surface. */
@Composable
fun IntelligenceInk(content: @Composable () -> Unit) {
    val base = LocalWatchdogColors.current
    val onSurface = base.copy(
        isDark = false,
        ink = Spectrum.ink, ink2 = Spectrum.ink2, muted = Spectrum.muted, separator = Spectrum.separator,
        link = Spectrum.link, fill = Spectrum.fill, tint = Spectrum.tint, onTint = Spectrum.onTint, surface = Spectrum.surface,
        navy = Spectrum.navy, onNavy = Color.White,
    )
    CompositionLocalProvider(LocalWatchdogColors provides onSurface, content = content)
}

/** "Watchdog Intelligence" as inline text, never in a pill. */
@Composable
fun IntelligenceName(style: TextStyle, modifier: Modifier = Modifier, suffix: String = "", color: Color = Color.Unspecified) {
    Text(
        text = Intelligence.productName(suffix),
        style = style,
        color = color,
        modifier = modifier.semantics { contentDescription = "Watchdog Intelligence$suffix" },
    )
}

/** Small helper so callers can inset content inside [intelligenceSurface]. */
fun Modifier.intelligencePadding(): Modifier = padding(horizontal = 18.dp, vertical = 16.dp)
