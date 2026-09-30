package com.watchdogindex.agent.core.model

import com.watchdogindex.agent.core.format.Format
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow

data class LatLng(val lat: Double, val lon: Double)

data class Farm(
    val id: String,
    /** "Birchwood Park" */
    val name: String,
    /** "Cherry Hill Twp" */
    val town: String,
    val homes: Int,
    /** "your farm since Aug" */
    val sinceLabel: String?,
    val center: LatLng,
    val zoom: Double,
    val boundary: List<LatLng>,
)

enum class MapLayer { Score, Residential, SoldIn12Months, Permits }

data class MapParcel(
    val pin: PamsPin,
    val address: String,
    val ring: List<LatLng>,
    val score: Int?,
    val taxBill: Int?,
    val soldInLast12Months: Boolean,
    val permitInLast90Days: Boolean,
    val residential: Boolean,
)

data class TurnoverNote(
    /** Material Symbols name: trending_up, sell */
    val icon: String,
    /** "7 sales since June" (bold lead) */
    val lead: String,
    /** " at a median $455,000, up 6% on last year" */
    val text: String,
)

/** Neighborhood-level totals only. Watchdog never labels a single home as a likely seller. */
data class FarmStats(
    val medianScore: Int?,
    val salesIn12Months: Int,
    val salesPercent: Double?,
    val permitsIn90Days: Int,
    val turnover: List<TurnoverNote>,
    val note: String = NOT_A_SELLER_PREDICTION,
) {
    companion object {
        const val NOT_A_SELLER_PREDICTION = "Neighborhood totals from public records. Watchdog never labels a home as a likely seller."
    }
}

/** The five Watchdog Score map bands: 0-39, 40-54, 55-69, 70-84, 85+. */
object ScoreBands {
    val labels = listOf("0–39", "40–54", "55–69", "70–84", "85+")
    fun bandIndex(score: Int?): Int? = score?.let { s -> when { s < 40 -> 0; s < 55 -> 1; s < 70 -> 2; s < 85 -> 3; else -> 4 } }
}

/**
 * "Score 72 · tax $11,284": the line under a parcel's address in the map callout, the farm sheet's tapped-parcel
 * row and its recent-deeds rows. Stores and unscored parcels say so instead of showing a blank. One function for
 * every surface, so no map and no sheet can word or round the same parcel differently.
 */
fun MapParcel.calloutLine(): String {
    val scoreText = score?.let { "Score $it" } ?: if (residential) "Not scored yet" else "Not a home"
    val taxText = taxBill?.let { " · tax ${Format.money(it)}" } ?: ""
    return scoreText + taxText
}

/**
 * The zoom convention every Watchdog map value is authored in, and the conversion to MapLibre's.
 *
 * [Farm.zoom], the shared `FarmMapState.zoom` and the Farm screen's street zoom are Web Mercator zooms over
 * 256 dp tiles: at zoom z one dp covers 2π · 6 378 137 · cos(lat) / (256 · 2^z) metres. That is what
 * LiveFarmRepository's extent table means when it puts a 670 m farm at 16 (which fills a 412 dp screen only over
 * 256 dp tiles), what the sample farms' 15.6 and 16.4 mean, and what the desktop map projects with. MapLibre GL
 * counts 512 px tiles, so its zoom runs one level lower for the same ground scale (its 15 shows what this
 * convention's 16 shows). The Android map adapter converts at its boundary, [toMapLibre] going in and
 * [fromMapLibre] on the way back, so shared and core code never see MapLibre's numbers.
 */
object MapZoom {
    /** The tile size the Watchdog zoom convention is defined over, in dp. */
    const val TILE_DP = 256.0

    /** The tile size MapLibre GL's zoom is defined over, in px. */
    const val MAPLIBRE_TILE_PX = 512.0

    /** log2(512 / 256): how many levels lower MapLibre's zoom is than this convention's for the same scale. */
    const val MAPLIBRE_ZOOM_OFFSET = 1.0

    private const val EARTH_CIRCUMFERENCE_M = 2 * PI * 6_378_137.0

    /** A Watchdog zoom as MapLibre's camera zoom. */
    fun toMapLibre(zoom: Double): Double = zoom - MAPLIBRE_ZOOM_OFFSET

    /** MapLibre's camera zoom as a Watchdog zoom (for reporting the camera back to the shared UI). */
    fun fromMapLibre(mapLibreZoom: Double): Double = mapLibreZoom + MAPLIBRE_ZOOM_OFFSET

    /** Ground metres per dp at [lat] and [zoom] in the Watchdog convention (156 543 · cos(lat) / 2^zoom). */
    fun metresPerDp(zoom: Double, lat: Double): Double = EARTH_CIRCUMFERENCE_M * cos(lat * PI / 180.0) / (TILE_DP * 2.0.pow(zoom))
}
