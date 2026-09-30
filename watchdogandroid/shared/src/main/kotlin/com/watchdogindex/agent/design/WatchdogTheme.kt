package com.watchdogindex.agent.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

/** Theme override from Settings: follow the system, or force light or dark. */
enum class ThemeMode { System, Light, Dark }

/** True when the platform asks for reduced motion; the Intelligence border then stays still. */
val LocalReducedMotion = staticCompositionLocalOf { false }

/** Spacing, radii and sizes shared by every screen, straight from the mockups. */
object WatchdogDimens {
    val screenMargin = 16.dp
    val cardRadius = 24.dp
    val cardPaddingV = 16.dp
    val cardPaddingH = 18.dp
    val cardGap = 16.dp
    val sectionTop = 24.dp
    val rowMinHeight = 66.dp
    val tileSize = 40.dp
    val tileRadius = 12.dp
    val chipHeight = 26.dp
    val buttonHeight = 48.dp
    val buttonRadius = 24.dp
    val touchTarget = 48.dp
    val navBarHeight = 104.dp
    val fabHeight = 56.dp
    val fabRadius = 16.dp
    val searchBarHeight = 56.dp
    val appBarHeight = 64.dp
    val sheetRadius = 28.dp
    /** The mockups' status bar allowance (`.scr.and .scroll{padding-top:40px}`), used where there is no real status bar. */
    val statusBarAllowance = 40.dp
}

object WatchdogTheme {
    val colors: WatchdogColors
        @Composable @ReadOnlyComposable get() = LocalWatchdogColors.current
    val type: WatchdogTypography
        @Composable @ReadOnlyComposable get() = LocalWatchdogTypography.current
    val fontFamily: FontFamily
        @Composable @ReadOnlyComposable get() = LocalWatchdogFontFamily.current
}

private fun materialScheme(c: WatchdogColors): ColorScheme {
    val base = if (c.isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = c.primary,
        onPrimary = c.onPrimary,
        primaryContainer = c.tint,
        onPrimaryContainer = c.onTint,
        secondary = c.teal,
        onSecondary = c.onNavy,
        secondaryContainer = c.mIndicator,
        onSecondaryContainer = c.mOnIndicator,
        tertiary = c.gold,
        onTertiary = c.navy,
        tertiaryContainer = c.sand,
        onTertiaryContainer = c.sandInk,
        background = c.bg,
        onBackground = c.ink,
        surface = c.bg,
        onSurface = c.ink,
        surfaceVariant = c.mHigh,
        onSurfaceVariant = c.muted,
        surfaceContainerLowest = c.surface,
        surfaceContainerLow = c.bg,
        surfaceContainer = c.mContainer,
        surfaceContainerHigh = c.mHigh,
        surfaceContainerHighest = c.mHigh,
        surfaceBright = c.surface,
        surfaceDim = c.mContainer,
        surfaceTint = c.primary,
        outline = c.mOutline,
        outlineVariant = c.line,
        error = c.red,
        onError = c.onNavy,
        errorContainer = c.warnBg,
        onErrorContainer = c.warnInk,
        scrim = c.scrim,
        inverseSurface = c.navy,
        inverseOnSurface = c.onNavy,
        inversePrimary = c.gold,
    )
}

/**
 * Applies Watchdog colors, type and shapes and the matching Material 3 scheme.
 * [mode] comes from Settings; [fontFamily] is the bundled Plus Jakarta Sans on device.
 */
@Composable
fun WatchdogTheme(
    mode: ThemeMode = ThemeMode.System,
    fontFamily: FontFamily = LocalWatchdogFontFamily.current,
    reducedMotion: Boolean = LocalReducedMotion.current,
    content: @Composable () -> Unit,
) {
    val dark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val colors = if (dark) WatchdogDarkColors else WatchdogLightColors
    val type = remember(fontFamily) { watchdogTypography(fontFamily) }
    val scheme = remember(colors) { materialScheme(colors) }
    val m3Type = remember(type) {
        Typography(
            displayLarge = type.big, displayMedium = type.lead, displaySmall = type.dialNumber,
            headlineLarge = type.headline, headlineMedium = type.propertyTitle, headlineSmall = type.briefHeading,
            titleLarge = type.appBarTitle, titleMedium = type.sectionTitle, titleSmall = type.rowTitle,
            bodyLarge = type.body, bodyMedium = type.kvLabel, bodySmall = type.supporting,
            labelLarge = type.button, labelMedium = type.chip, labelSmall = type.caption,
        )
    }
    val shapes = remember {
        Shapes(
            extraSmall = RoundedCornerShape(8.dp),
            small = RoundedCornerShape(12.dp),
            medium = RoundedCornerShape(16.dp),
            large = RoundedCornerShape(24.dp),
            extraLarge = RoundedCornerShape(28.dp),
        )
    }
    CompositionLocalProvider(
        LocalWatchdogColors provides colors,
        LocalWatchdogTypography provides type,
        LocalWatchdogFontFamily provides fontFamily,
        LocalReducedMotion provides reducedMotion,
    ) {
        MaterialTheme(colorScheme = scheme, typography = m3Type, shapes = shapes, content = content)
    }
}
