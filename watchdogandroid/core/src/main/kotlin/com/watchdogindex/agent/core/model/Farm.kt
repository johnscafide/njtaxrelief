package com.watchdogindex.agent.core.model

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
