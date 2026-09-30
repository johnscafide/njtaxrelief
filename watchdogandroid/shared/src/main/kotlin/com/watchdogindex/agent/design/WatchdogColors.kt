package com.watchdogindex.agent.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Watchdog color tokens, one set per theme. Names follow the approved mockups' CSS variables so a value can
 * be traced back to the design: `bg` is --a-bg (Paper), `ink` is --a-ink, `sky` is --a-sky and so on.
 * The `m*` tokens are the Material 3 container colors used by the navigation bar, search bar, chips and FAB.
 */
@Immutable
data class WatchdogColors(
    val isDark: Boolean,
    // Surfaces and text
    val bg: Color,
    val surface: Color,
    val line: Color,
    val separator: Color,
    val ink: Color,
    val ink2: Color,
    val muted: Color,
    // Brand
    val navy: Color,
    val onNavy: Color,
    val onNavy2: Color,
    val gold: Color,
    val teal: Color,
    val link: Color,
    // Meaning tints
    val sky: Color,
    val skyInk: Color,
    val sand: Color,
    val sandInk: Color,
    val mint: Color,
    val mintInk: Color,
    val goodBg: Color,
    val goodInk: Color,
    val warnBg: Color,
    val warnInk: Color,
    val red: Color,
    // Fills, buttons
    val fill: Color,
    val fill2: Color,
    val primary: Color,
    val onPrimary: Color,
    val tint: Color,
    val onTint: Color,
    // Chrome
    val glass: Color,
    val glassEdge: Color,
    val shadow: Color,
    val dialTrack: Color,
    val spark: Color,
    val spark2: Color,
    val switchOn: Color,
    val switchOff: Color,
    // Material 3 containers
    val mContainer: Color,
    val mHigh: Color,
    val mIndicator: Color,
    val mOnIndicator: Color,
    val mOutline: Color,
    val mFab: Color,
    val mOnFab: Color,
    // Farm map
    val mapLand: Color,
    val mapRoad: Color,
    val mapCase: Color,
    val mapPark: Color,
    val mapWater: Color,
    val mapOut: Color,
    val mapBound: Color,
    val mapLabel: Color,
    val map1: Color,
    val map2: Color,
    val map3: Color,
    val map4: Color,
    val map5: Color,
    val mapDot: Color,
    val scrim: Color,
) {
    /** The five Watchdog Score bands, lightest to darkest: 0-39, 40-54, 55-69, 70-84, 85+. */
    val mapBands: List<Color> get() = listOf(map1, map2, map3, map4, map5)
}

private fun rgba(r: Int, g: Int, b: Int, a: Float) = Color(r / 255f, g / 255f, b / 255f, a)

val WatchdogLightColors = WatchdogColors(
    isDark = false,
    bg = Color(0xFFF3F1EC), surface = Color(0xFFFFFFFF), line = Color(0xFFE3DFD6), separator = rgba(20, 33, 61, .10f),
    ink = Color(0xFF14213D), ink2 = Color(0xFF34425E), muted = Color(0xFF5D6678),
    navy = Color(0xFF0E2248), onNavy = Color(0xFFFFFFFF), onNavy2 = rgba(255, 255, 255, .78f),
    gold = Color(0xFFB8972A), teal = Color(0xFF0F8B8D), link = Color(0xFF1456A0),
    sky = Color(0xFFE3EDFB), skyInk = Color(0xFF1456A0), sand = Color(0xFFF6EFD9), sandInk = Color(0xFF7A5D0C),
    mint = Color(0xFFDFF1EC), mintInk = Color(0xFF0F6E5C), goodBg = Color(0xFFE1F3EA), goodInk = Color(0xFF1D6843),
    warnBg = Color(0xFFFDF1DC), warnInk = Color(0xFF83560A), red = Color(0xFFC4322B),
    fill = rgba(20, 33, 61, .06f), fill2 = rgba(20, 33, 61, .12f),
    primary = Color(0xFF0E2248), onPrimary = Color(0xFFFFFFFF), tint = Color(0xFFE4E8F0), onTint = Color(0xFF0E2248),
    glass = rgba(255, 255, 255, .76f), glassEdge = rgba(255, 255, 255, .95f), shadow = rgba(14, 34, 72, .16f),
    dialTrack = rgba(255, 255, 255, .17f), spark = Color(0xFF1456A0), spark2 = Color(0xFFA9C3EA),
    switchOn = Color(0xFF0F8B8D), switchOff = rgba(20, 33, 61, .16f),
    mContainer = Color(0xFFECE8E0), mHigh = Color(0xFFE4E0D7), mIndicator = Color(0xFFD8E3F4), mOnIndicator = Color(0xFF0E2248),
    mOutline = Color(0xFFBFB8AA), mFab = Color(0xFF0E2248), mOnFab = Color(0xFFFFFFFF),
    mapLand = Color(0xFFEEEBE4), mapRoad = Color(0xFFFFFFFF), mapCase = Color(0xFFDCD6CA), mapPark = Color(0xFFD5E7CD),
    mapWater = Color(0xFFC7DBEF), mapOut = Color(0xFFDBD6CB), mapBound = Color(0xFF0E2248), mapLabel = Color(0xFF5D6678),
    map1 = Color(0xFF5FB3AE), map2 = Color(0xFF2F9A97), map3 = Color(0xFF0F7F82), map4 = Color(0xFF0B5F68), map5 = Color(0xFF083F4C),
    mapDot = Color(0xFFB8972A), scrim = rgba(14, 34, 72, .30f),
)

val WatchdogDarkColors = WatchdogColors(
    isDark = true,
    bg = Color(0xFF0B1426), surface = Color(0xFF131F37), line = Color(0xFF22304D), separator = rgba(255, 255, 255, .09f),
    ink = Color(0xFFEEF2FA), ink2 = Color(0xFFC9D2E3), muted = Color(0xFF9EA9BF),
    navy = Color(0xFF1B2E57), onNavy = Color(0xFFFFFFFF), onNavy2 = rgba(255, 255, 255, .76f),
    gold = Color(0xFFD4B24A), teal = Color(0xFF3CC3C4), link = Color(0xFF8FBAF6),
    sky = Color(0xFF162A4A), skyInk = Color(0xFFA9C8F5), sand = Color(0xFF2A2515), sandInk = Color(0xFFE6C872),
    mint = Color(0xFF10302B), mintInk = Color(0xFF80D7C3), goodBg = Color(0xFF113024), goodInk = Color(0xFF8FDCB0),
    warnBg = Color(0xFF33270F), warnInk = Color(0xFFF0C36B), red = Color(0xFFFF6B61),
    fill = rgba(255, 255, 255, .07f), fill2 = rgba(255, 255, 255, .14f),
    primary = Color(0xFFE3EAF7), onPrimary = Color(0xFF0E2248), tint = rgba(255, 255, 255, .10f), onTint = Color(0xFFEEF2FA),
    glass = rgba(36, 49, 78, .70f), glassEdge = rgba(255, 255, 255, .12f), shadow = rgba(0, 0, 0, .45f),
    dialTrack = rgba(255, 255, 255, .16f), spark = Color(0xFF8FBAF6), spark2 = Color(0xFF34507E),
    switchOn = Color(0xFF2FB3B4), switchOff = rgba(255, 255, 255, .20f),
    mContainer = Color(0xFF111C32), mHigh = Color(0xFF18253F), mIndicator = Color(0xFF263D68), mOnIndicator = Color(0xFFDCE7FB),
    mOutline = Color(0xFF3C4A69), mFab = Color(0xFFE3EAF7), mOnFab = Color(0xFF0E2248),
    mapLand = Color(0xFF0F192C), mapRoad = Color(0xFF1F2C47), mapCase = Color(0xFF1A2640), mapPark = Color(0xFF12281F),
    mapWater = Color(0xFF10233F), mapOut = Color(0xFF18233B), mapBound = Color(0xFFB9CDF0), mapLabel = Color(0xFF8D99B0),
    map1 = Color(0xFF1D5F63), map2 = Color(0xFF1F7D80), map3 = Color(0xFF2A9D9D), map4 = Color(0xFF4FC0BD), map5 = Color(0xFF8FE0D8),
    mapDot = Color(0xFFE3C46A), scrim = rgba(0, 0, 0, .50f),
)

/**
 * Watchdog Intelligence spectrum. These four colors are reserved for the Intelligence brand signature:
 * the rotating border on the outer Intelligence surface and the word "Intelligence" in the product name.
 * They are the same in light and dark.
 */
object Spectrum {
    val cyan = Color(0xFF0AAEB8)
    val blue = Color(0xFF2478FF)
    val violet = Color(0xFF7857FF)
    val magenta = Color(0xFFE84BC4)
    /** Slightly brighter cyan used at the start/end of the rotating border. */
    val borderCyan = Color(0xFF15B7C9)
    /** Fixed ink for text sitting on the always-white Intelligence surface. */
    val surface = Color(0xFFFFFFFF)
    val ink = Color(0xFF14213D)
    val ink2 = Color(0xFF34425E)
    val muted = Color(0xFF5D6678)
    val separator = rgba(20, 33, 61, .10f)
    val fill = rgba(20, 33, 61, .06f)
    val tint = Color(0xFFE4E8F0)
    val onTint = Color(0xFF0E2248)
    val link = Color(0xFF1456A0)
    val navy = Color(0xFF0E2248)
}

/**
 * The Welcome hero's fixed colors (spec §1.12 and §3.31), identical in light and dark like [Spectrum]: the
 * `linear-gradient(170deg, #0e2248, #11306a)` behind the brand and the `#e3c46a` gold of the "For New Jersey
 * agents and teams" eyebrow (`.wel-for`). Nothing else in the app uses these two values, so they live here
 * rather than in the theme palettes.
 */
object WelcomeHero {
    /** `#0e2248`: the gradient start, the same fixed navy as the Intelligence mic and the true cost card. */
    val gradientStart: Color = Spectrum.navy
    /** `#11306a`: the gradient end. */
    val gradientEnd = Color(0xFF11306A)
    /** `#e3c46a`: the eyebrow gold (also the dark palette's map dot, by coincidence of value, not of meaning). */
    val gold = Color(0xFFE3C46A)
}

val LocalWatchdogColors = staticCompositionLocalOf { WatchdogLightColors }
