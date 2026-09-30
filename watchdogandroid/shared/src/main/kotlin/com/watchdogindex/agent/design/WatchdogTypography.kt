package com.watchdogindex.agent.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Text styles from the approved mockups (Plus Jakarta Sans). Sizes are the mockup's CSS px, which map one to
 * one to sp on the 412 dp Android frame. Nothing in the app goes below 12 sp. Money and scores use tabular
 * figures ([tabular]).
 */
@Immutable
data class WatchdogTypography(
    /** Material 3 headline: screen titles such as "Today", "Clients" (30/36, 800). */
    val headline: TextStyle,
    /** Top app bar title (22, 700). */
    val appBarTitle: TextStyle,
    /** Eyebrow above a headline, all caps (13, 700, muted). */
    val eyebrow: TextStyle,
    /** Section title such as "Needs you" (20/24, 800). */
    val sectionTitle: TextStyle,
    /** Trailing link next to a section title, e.g. "See all 10" (15, 700, link). */
    val sectionLink: TextStyle,
    /** Card label, all caps (12, 700, tracking .07em). */
    val cardLabel: TextStyle,
    /** Row title (15, 700). */
    val rowTitle: TextStyle,
    /** Row supporting line (13, 500, muted). */
    val rowSupport: TextStyle,
    /** Body and supporting text (15/21, 500). */
    val body: TextStyle,
    /** Supporting text (13, 500). */
    val supporting: TextStyle,
    /** Small print, sources (12, 500). */
    val caption: TextStyle,
    /** Buttons (16, 700) and small buttons (15, 700). */
    val button: TextStyle,
    val buttonSmall: TextStyle,
    /** Status chip (12, 700). */
    val chip: TextStyle,
    /**
     * Key/value rows (`.kv`): label (14 / 19.6, 400) and value (15 / 21, 700, tabular). Both inherit the frame's
     * 1.4 line height at their own size, which is what gives the row its 31 dp pitch.
     */
    val kvLabel: TextStyle,
    val kvValue: TextStyle,
    /** Card lead number such as "$11,284" (30, 800). */
    val lead: TextStyle,
    /** The big weekly count "10" (46, 800). */
    val big: TextStyle,
    /** Score dial number (38, 800) and its "of 100" (12, 700). */
    val dialNumber: TextStyle,
    val dialCaption: TextStyle,
    /** Score verdict (19, 800). */
    val verdict: TextStyle,
    /** Property header address (30, 800) and its subline (14, 500). */
    val propertyTitle: TextStyle,
    /** Stat tiles (`.stile .t`: 22 / 24.2, 800) and summary-grid numbers (`.sum-grid b`: 19 / 26.6, 800). */
    val stat: TextStyle,
    val statSmall: TextStyle,
    /** Navigation bar label (12, 600 / 800 when selected). */
    val navLabel: TextStyle,
    val navLabelSelected: TextStyle,
    /** Search bar hint (16, 500). */
    val searchHint: TextStyle,
    /** Settings row title (16, 700), subtitle (14, 500) and section label (14, 800, link). */
    val settingTitle: TextStyle,
    val settingSubtitle: TextStyle,
    val settingSection: TextStyle,
    /** Watchdog Intelligence brief: heading (21 / 25.2, 800), items (15 / 21.75, 500), source line (12 / 16.8, 600). */
    val briefHeading: TextStyle,
    val briefItem: TextStyle,
    val briefSource: TextStyle,
    /** Welcome hero: product name (28, 800), for-line (13, 700 caps), headline (25, 800), lede (15, 500). */
    val welcomeName: TextStyle,
    val welcomeFor: TextStyle,
    val welcomeHeadline: TextStyle,
    val welcomeLede: TextStyle,
    /** Material outlined text field: label (12, 700) and value (15, 500). */
    val fieldLabel: TextStyle,
    val fieldValue: TextStyle,
)

/** Letter spacing given in CSS em, converted to sp for the style's own size. */
private fun em(size: TextUnit, em: Double): TextUnit = (size.value * em).sp

private val centered = LineHeightStyle(alignment = LineHeightStyle.Alignment.Center, trim = LineHeightStyle.Trim.None)

/** Builds the Watchdog type scale for [family]. Pass the bundled Plus Jakarta Sans family on device. */
fun watchdogTypography(family: FontFamily): WatchdogTypography {
    fun style(size: Int, weight: FontWeight, line: Double = size * 1.4, tracking: TextUnit = TextUnit.Unspecified, tabular: Boolean = false) = TextStyle(
        fontFamily = family,
        fontWeight = weight,
        fontSize = size.sp,
        lineHeight = line.sp,
        letterSpacing = tracking,
        lineHeightStyle = centered,
        fontFeatureSettings = if (tabular) "tnum" else null,
    )
    return WatchdogTypography(
        headline = style(30, FontWeight.ExtraBold, 36.0, em(30.sp, -0.02)),
        appBarTitle = style(22, FontWeight.Bold, 26.4),
        eyebrow = style(13, FontWeight.Bold, 18.2, em(13.sp, 0.06)),
        sectionTitle = style(20, FontWeight.ExtraBold, 24.0, em(20.sp, -0.015)),
        sectionLink = style(15, FontWeight.Bold, 21.0),
        cardLabel = style(12, FontWeight.Bold, 15.6, em(12.sp, 0.07)),
        rowTitle = style(15, FontWeight.Bold, 19.5),
        rowSupport = style(13, FontWeight.Medium, 17.55),
        body = style(15, FontWeight.Medium, 21.0),
        supporting = style(13, FontWeight.Medium, 18.85),
        caption = style(12, FontWeight.Medium, 18.0),
        button = style(16, FontWeight.Bold, 20.0),
        buttonSmall = style(15, FontWeight.Bold, 19.0),
        chip = style(12, FontWeight.Bold, 16.0),
        kvLabel = style(14, FontWeight.Normal, 19.6),
        kvValue = style(15, FontWeight.Bold, 21.0, tabular = true),
        lead = style(30, FontWeight.ExtraBold, 31.5, em(30.sp, -0.03), tabular = true),
        big = style(46, FontWeight.ExtraBold, 46.0, em(46.sp, -0.04), tabular = true),
        dialNumber = style(38, FontWeight.ExtraBold, 38.0, em(38.sp, -0.04), tabular = true),
        dialCaption = style(12, FontWeight.Bold, 14.0),
        verdict = style(19, FontWeight.ExtraBold, 22.8, em(19.sp, -0.01)),
        propertyTitle = style(30, FontWeight.ExtraBold, 33.0, em(30.sp, -0.03)),
        stat = style(22, FontWeight.ExtraBold, 26.0, em(22.sp, -0.02), tabular = true),
        statSmall = style(19, FontWeight.ExtraBold, 26.6, tabular = true),
        navLabel = style(12, FontWeight.SemiBold, 16.0),
        navLabelSelected = style(12, FontWeight.ExtraBold, 16.0),
        searchHint = style(16, FontWeight.Medium, 22.0),
        settingTitle = style(16, FontWeight.Bold, 21.0),
        settingSubtitle = style(14, FontWeight.Normal, 18.9),
        settingSection = style(14, FontWeight.ExtraBold, 18.0),
        briefHeading = style(21, FontWeight.ExtraBold, 25.2, em(21.sp, -0.015)),
        briefItem = style(15, FontWeight.Medium, 21.75),
        briefSource = style(12, FontWeight.SemiBold, 16.8),
        welcomeName = style(28, FontWeight.ExtraBold, 33.0, em(28.sp, -0.02)),
        welcomeFor = style(13, FontWeight.Bold, 18.0, em(13.sp, 0.07)),
        welcomeHeadline = style(25, FontWeight.ExtraBold, 29.5, em(25.sp, -0.02)),
        welcomeLede = style(15, FontWeight.Medium, 22.5),
        fieldLabel = style(12, FontWeight.Bold, 16.0),
        fieldValue = style(15, FontWeight.Medium, 21.0),
    )
}

val LocalWatchdogTypography = staticCompositionLocalOf { watchdogTypography(FontFamily.SansSerif) }

/** The app's font family. Provided by the Android app (res/font) and the desktop preview (resources). */
val LocalWatchdogFontFamily = staticCompositionLocalOf<FontFamily> { FontFamily.SansSerif }
