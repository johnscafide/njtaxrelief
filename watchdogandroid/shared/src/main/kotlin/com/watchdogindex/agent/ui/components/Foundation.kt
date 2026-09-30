package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.design.Spectrum
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogLightColors
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/*
 * Shared helpers for the component library: margins, touch targets, separators, tabular text, the palette
 * mappings for the core model enums and the fixed colors the mockups never swap with the theme. Numbers
 * are formatted by core's com.watchdogindex.agent.core.format.Format; the components add no formatters of
 * their own, so cards and screens cannot drift apart. Screens use these through the components; they
 * rarely need them directly.
 */

/** Card margin from the mockups: 16 dp on both sides and 16 dp above (`.card{margin:16px 16px 0}`). */
fun Modifier.cardMargin(): Modifier = padding(start = 16.dp, end = 16.dp, top = 16.dp)

/** List container margin: `.rows{margin:10px 16px 0}`. */
fun Modifier.listMargin(): Modifier = padding(start = 16.dp, end = 16.dp, top = 10.dp)

/**
 * Reserves the 48 dp Material touch target around a smaller control without changing how the control is
 * drawn: the node grows to 48 dp in the layout with the control centred in it. Use it where the layout has
 * the room (chips in their 48 dp row); use [overflowTouchTarget] where it does not.
 */
fun Modifier.minTouchTarget(): Modifier = minimumInteractiveComponentSize()

/**
 * Gives a control the mockup draws smaller than 48 dp a [minSize] click and accessibility area without
 * changing the space it takes in the layout. The node measured after this modifier (put `.clickable`,
 * `.selectable` or `.toggleable` after it) is at least [minSize] wide and tall, centred on the content's
 * natural bounds, and overflows them on purpose, the same way the task tick's 48 dp box overflows its 28 dp
 * column. The natural size comes from the content's intrinsics, so the content must centre itself inside
 * the enlarged node (a `Box` with `Alignment.Center`, or a `Row` with centred arrangement and alignment).
 * Used by the 44 dp pills, the mic, text links, the client next-action line and the sheet handle.
 */
fun Modifier.overflowTouchTarget(minSize: Dp = WatchdogDimens.touchTarget): Modifier = layout { measurable, constraints ->
    val min = minSize.roundToPx()
    // What the content would measure on its own; this is the size the layout keeps.
    val naturalWidth = measurable.maxIntrinsicWidth(constraints.maxHeight).coerceIn(constraints.minWidth, constraints.maxWidth)
    val naturalHeight = measurable.minIntrinsicHeight(naturalWidth).coerceIn(constraints.minHeight, constraints.maxHeight)
    val targetWidth = maxOf(naturalWidth, min)
    val targetHeight = maxOf(naturalHeight, min)
    val placeable = measurable.measure(
        Constraints(
            minWidth = targetWidth,
            maxWidth = maxOf(constraints.maxWidth, targetWidth),
            minHeight = targetHeight,
            maxHeight = maxOf(constraints.maxHeight, targetHeight),
        ),
    )
    layout(naturalWidth, naturalHeight) {
        // Centred on the natural bounds, so a 48 dp node behind 44 dp content sticks out 2 dp on each side.
        placeable.place((naturalWidth - placeable.width) / 2, (naturalHeight - placeable.height) / 2)
    }
}

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

/**
 * The top inset a screen's first element (pinned top bar, hero, scrolling content) starts under. On device
 * this is the system status bar, which is rightly 0 when the bar is hidden. The desktop preview and the
 * screenshot harness have no status bar but provide [LocalBottomChromeInsets] to reproduce the mockups'
 * chrome allowances, so the mockups' 40 dp status bar allowance ([WatchdogDimens.statusBarAllowance]) is
 * used there too. The rule every screen converged on; screens should call this rather than carry a copy.
 */
@Composable
fun statusBarAllowance(): Dp =
    if (LocalBottomChromeInsets.current != null) WatchdogDimens.statusBarAllowance else WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

/** [statusBarAllowance] under the name the pushed screens (Welcome, Search, Settings) used for it. */
@Composable
fun statusBarTopPadding(): Dp = statusBarAllowance()

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
 * Pins a one-line text to the CSS line box it is given, centring the glyphs in it however tall the
 * platform lays the line out. The mockup's big numbers use `line-height: 1` (a 46 sp line for the 46 sp
 * count, 38 for the dial number, 12 for its caption, 34 for the true cost total); Android and the browser
 * shrink the line to that, but the desktop harness keeps the font's natural height for a line height at or
 * under the font size, which pushed the summary card 12 dp, the dial caption 5 dp and the true cost card
 * 9 dp off the reference. Glyphs may overflow the box by a few dp above and below, exactly as negative
 * half-leading does in CSS.
 */
@Composable
internal fun LineBox(lineHeight: TextUnit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val height = with(LocalDensity.current) { lineHeight.toDp() }
    Box(modifier = modifier.height(height), contentAlignment = Alignment.Center) {
        Box(modifier = Modifier.wrapContentHeight(align = Alignment.CenterVertically, unbounded = true)) { content() }
    }
}

/**
 * Colors the approved mockups keep identical in light and dark (spec §1.12): the Intelligence mic and brief
 * numerals, result panel headers, postcard thumbs, the true cost card and the share targets. Every value is
 * a design token ([Spectrum] or the light palette, which is what the mockups freeze); nothing is spelled out
 * in hex here. Everything else comes from [WatchdogTheme.colors].
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
    /** `#b8972a`: the light theme's gold, kept in dark mode for the true cost rules and bars. */
    val gold: Color = WatchdogLightColors.gold
    /** `#f6efd9`: the light theme's sand, kept in dark mode for the postcard thumb's bottom row. */
    val sand: Color = WatchdogLightColors.sand
    /** `#0f8b8d`: the light theme's teal, kept for the Messages share target and the true cost agent avatar. */
    val teal: Color = WatchdogLightColors.teal
    /** `#1456a0`: Mail share target. */
    val link: Color = Spectrum.link
    /** `#14213d` / `#5d6678`: true cost agent footer text. */
    val ink: Color = Spectrum.ink
    val muted: Color = Spectrum.muted
    /**
     * The Intelligence card shadow (CSS `0 14px 34px rgba(30,57,91,.10)`), the same in both themes: the
     * light theme's navy shadow ink, with the alpha set where it is drawn.
     */
    val intelligenceShadow: Color = WatchdogLightColors.shadow
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
