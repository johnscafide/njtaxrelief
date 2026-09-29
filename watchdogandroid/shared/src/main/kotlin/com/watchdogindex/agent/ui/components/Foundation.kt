package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.design.Spectrum
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import kotlin.math.abs
import kotlin.math.roundToLong

/*
 * Shared helpers for the component library: margins, touch targets, separators, tabular text,
 * the palette mappings for the core model enums, the fixed colors the mockups never swap with the theme,
 * and the small number formatters the cards need. Screens use these through the components; they
 * rarely need them directly.
 */

/** Card margin from the mockups: 16 dp on both sides and 16 dp above (`.card{margin:16px 16px 0}`). */
fun Modifier.cardMargin(): Modifier = padding(start = 16.dp, end = 16.dp, top = 16.dp)

/** List container margin: `.rows{margin:10px 16px 0}`. */
fun Modifier.listMargin(): Modifier = padding(start = 16.dp, end = 16.dp, top = 10.dp)

/**
 * Reserves the 48 dp Material touch target around a smaller control without changing how the control is
 * drawn. Compose already expands the hit area of small pointer-input nodes to 48 dp; this additionally
 * reserves the space so neighbouring targets cannot overlap.
 */
fun Modifier.minTouchTarget(): Modifier = minimumInteractiveComponentSize()

/** A 1 dp separator along the top edge, starting [inset] from the start edge (the mockups' `border-top`). */
fun Modifier.topSeparator(color: Color, inset: Dp = 0.dp): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    val y = stroke / 2f
    drawLine(color, Offset(inset.toPx(), y), Offset(size.width, y), strokeWidth = stroke)
}

/** A 1 dp separator along the bottom edge. */
fun Modifier.bottomSeparator(color: Color, inset: Dp = 0.dp): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    val y = size.height - stroke / 2f
    drawLine(color, Offset(inset.toPx(), y), Offset(size.width, y), strokeWidth = stroke)
}

/** A 1 dp separator along the start edge (the summary grid's column dividers). */
fun Modifier.startSeparator(color: Color): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    val x = stroke / 2f
    drawLine(color, Offset(x, 0f), Offset(x, size.height), strokeWidth = stroke)
}

/**
 * Bottom chrome (navigation bar, action area, composer, sheets) pads itself with these insets so it clears
 * the gesture bar. Null means "use the platform's [WindowInsets.navigationBars]"; the desktop preview
 * provides `WindowInsets(bottom = 24.dp)` here to reproduce the mockups' 24 dp gesture allowance.
 */
val LocalBottomChromeInsets = staticCompositionLocalOf<WindowInsets?> { null }

/** The insets bottom chrome should apply: [LocalBottomChromeInsets] when set, otherwise the system navigation bar. */
@Composable
fun bottomChromeInsets(): WindowInsets = LocalBottomChromeInsets.current ?: WindowInsets.navigationBars

/** Text with tabular figures, for money, counts and scores so columns line up. */
@Composable
fun TabularText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    textAlign: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    Text(
        text = text,
        modifier = modifier,
        color = color,
        textAlign = textAlign,
        maxLines = maxLines,
        overflow = overflow,
        softWrap = maxLines > 1,
        style = style.copy(fontFeatureSettings = "tnum"),
    )
}

/** Letter spacing given in CSS em, converted to sp for [size]. */
internal fun em(size: Int, em: Double): TextUnit = (size * em).sp

/**
 * Derives a mockup text style from a token: same family and line-height behaviour, new size, weight,
 * line height and tracking. The token set covers the recurring styles; one-off CSS selectors use this.
 */
internal fun TextStyle.sized(
    size: Int,
    weight: FontWeight,
    lineHeight: Double = size * 1.4,
    tracking: TextUnit = TextUnit.Unspecified,
    tabular: Boolean = false,
): TextStyle = copy(
    fontSize = size.sp,
    fontWeight = weight,
    lineHeight = lineHeight.sp,
    letterSpacing = tracking,
    fontFeatureSettings = if (tabular) "tnum" else fontFeatureSettings,
)

/**
 * Colors the approved mockups keep identical in light and dark (spec §1.12): the Intelligence mic and brief
 * numerals, result panel headers, postcard thumbs, the true cost card and the share targets. Everything
 * else comes from [WatchdogTheme.colors].
 */
object FixedInk {
    /** `#0e2248`: mic, brief numerals, `.wp-h`, `.pc-t`, `.shh .th`, `.tc`. */
    val navy: Color = Spectrum.navy
    val onNavy: Color = Color.White
    /** `rgba(255,255,255,.74)`: true cost card label. */
    val onNavyMuted: Color = Color.White.copy(alpha = .74f)
    /** `rgba(255,255,255,.76)`: true cost "a month at" line. */
    val onNavyMuted2: Color = Color.White.copy(alpha = .76f)
    /** `rgba(255,255,255,.72)`: result panel subtitle. */
    val onNavyFaint: Color = Color.White.copy(alpha = .72f)
    /** `rgba(255,255,255,.14)`: dividers on navy cards and the true cost track. */
    val navyDivider: Color = Color.White.copy(alpha = .14f)
    /** `#b8972a`: true cost rules and bars (the light gold, in both themes). */
    val gold: Color = Color(0xFFB8972A)
    /** `#f6efd9` / `#0e2248`: postcard thumb bottom row. */
    val sand: Color = Color(0xFFF6EFD9)
    /** `#0f8b8d`: Messages share target and the true cost agent avatar. */
    val teal: Color = Color(0xFF0F8B8D)
    /** `#1456a0`: Mail share target. */
    val link: Color = Spectrum.link
    /** `#14213d` / `#5d6678`: true cost agent footer text. */
    val ink: Color = Spectrum.ink
    val muted: Color = Spectrum.muted
    /** `rgba(30,57,91,.10)`: the Intelligence card shadow, the same in both themes. */
    val intelligenceShadow: Color = Color(0xFF1E395B)
}

/** Container, content and label colors for a card [Tint]. */
@Immutable
data class TintColors(val container: Color, val content: Color, val label: Color, val border: Color)

@Composable
@ReadOnlyComposable
fun Tint.colors(): TintColors {
    val c = WatchdogTheme.colors
    return when (this) {
        Tint.Plain -> TintColors(container = c.surface, content = c.ink, label = c.muted, border = c.line)
        Tint.Navy -> TintColors(container = c.navy, content = c.onNavy, label = c.onNavy2, border = Color.Transparent)
        Tint.Sky -> TintColors(container = c.sky, content = c.ink, label = c.skyInk, border = Color.Transparent)
        Tint.Sand -> TintColors(container = c.sand, content = c.ink, label = c.sandInk, border = Color.Transparent)
        Tint.Mint -> TintColors(container = c.mint, content = c.ink, label = c.mintInk, border = Color.Transparent)
    }
}

/** Container and icon colors for a row [TileTint]. */
@Composable
@ReadOnlyComposable
fun TileTint.colors(): Pair<Color, Color> {
    val c = WatchdogTheme.colors
    return when (this) {
        TileTint.Sky -> c.sky to c.skyInk
        TileTint.Sand -> c.sand to c.sandInk
        TileTint.Mint -> c.mint to c.mintInk
        TileTint.Navy -> c.navy to Color.White
        TileTint.Fill -> c.fill to c.ink2
    }
}

/** Container and text colors for a status chip [Tone]. */
@Composable
@ReadOnlyComposable
fun Tone.colors(): Pair<Color, Color> {
    val c = WatchdogTheme.colors
    return when (this) {
        Tone.Warn -> c.warnBg to c.warnInk
        Tone.Good -> c.goodBg to c.goodInk
        Tone.Sky -> c.sky to c.skyInk
        Tone.Neutral -> c.fill to c.ink2
    }
}

/** Resolves a Material Symbols name carried by a core model ("receipt_long", "mic_fill") to an icon. */
fun iconByName(name: String?, fallback: ImageVector): ImageVector = name?.let { WdIcons.byName(it) } ?: fallback

/** "1,980" */
fun formatCount(value: Int): String {
    val digits = abs(value).toString()
    val grouped = StringBuilder()
    digits.forEachIndexed { index, ch ->
        if (index > 0 && (digits.length - index) % 3 == 0) grouped.append(',')
        grouped.append(ch)
    }
    return if (value < 0) "-$grouped" else grouped.toString()
}

/** "$11,284" */
fun formatMoney(value: Int): String = (if (value < 0) "-$" else "$") + formatCount(abs(value))

/** "$373k" for 372,800: whole thousands, used on the value line. */
fun formatThousands(value: Int): String = "$" + (value / 1000.0).roundToLong() + "k"

/** Fixed decimals without java.text: 4.47 with 3 decimals is "4.470"; trimZeros turns 61.0 into "61". */
fun formatDecimal(value: Double, decimals: Int, trimZeros: Boolean = false): String {
    var factor = 1L
    repeat(decimals) { factor *= 10 }
    val scaled = (abs(value) * factor).roundToLong()
    val whole = scaled / factor
    var fraction = if (decimals == 0) "" else (scaled % factor).toString().padStart(decimals, '0')
    if (trimZeros) fraction = fraction.trimEnd('0')
    val sign = if (value < 0 && scaled != 0L) "-" else ""
    return if (fraction.isEmpty()) "$sign$whole" else "$sign$whole.$fraction"
}

/** "$4.470": a general tax rate per $100 of assessed value. */
fun formatRate(ratePer100: Double): String = "$" + formatDecimal(ratePer100, 3)

/** "61%" or "5.1%". */
fun formatPercent(value: Double): String = formatDecimal(value, 1, trimZeros = true) + "%"
