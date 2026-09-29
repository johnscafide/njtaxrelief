package com.watchdogindex.agent.core.model

/** A PAMS PIN, the statewide parcel id, e.g. "0409_285.14_9" (county-town code, block, lot). */
typealias PamsPin = String

data class PropertySummary(
    val pin: PamsPin,
    /** "36 Birchwood Dr" */
    val address: String,
    /** "Cherry Hill Twp" */
    val town: String,
    /** "Camden County" */
    val county: String,
    /** "Block 285.14, Lot 9" */
    val blockLot: String,
    val score: Int?,
    val taxBill: Int?,
    val propertyClassLabel: String,
    val farmName: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
)

data class ScoreCard(
    /** 0..100 */
    val score: Int,
    /** "Favorable tax position" */
    val verdict: String,
    /** One or two plain sentences under the verdict. */
    val explanation: String,
    val coveragePercent: Int?,
    val confidence: String?,
) {
    companion object {
        const val FOOTER = "The Watchdog Score, powered by the ROBUST Framework."
    }
}

data class RatePoint(val year: Int, val ratePer100: Double)

data class TaxCard(
    val billYear: Int,
    val bill: Int,
    val billSourceLabel: String,
    val nextYear: Int,
    val nextYearBill: Int?,
    val townName: String,
    val townMedian: Int?,
    val rateHistory: List<RatePoint>,
    /** "+2.4% a year since 2020" */
    val rateTrendLabel: String?,
)

enum class VerdictKind { Good, Warn, Neutral }

data class ValueVerdict(val kind: VerdictKind, val title: String, val body: String)

data class ValueCheck(
    val assessed: Int,
    /** Market value the town ratio implies. */
    val impliedValue: Int,
    /** Town average ratio in percent, e.g. 61. */
    val ratioPercent: Double,
    /** Lowest market value at which the assessment still holds up (Chapter 123 upper limit). */
    val holdsUpAbove: Int,
    val salesMedian: Int?,
    val salesCount: Int,
    /** "since January" */
    val salesSinceLabel: String?,
    /** Axis range for the value line, e.g. 300_000..500_000 */
    val rangeMin: Int,
    val rangeMax: Int,
    val verdict: ValueVerdict,
)

data class NearbySale(val address: String, val monthLabel: String, val price: Int)

data class SalesNearby(
    val count: Int,
    /** "since Jan 2026" */
    val sinceLabel: String,
    val median: Int?,
    val sales: List<NearbySale>,
    val lastSoldPrice: Int?,
    val lastSoldYear: Int?,
)

data class HomeFacts(
    val propertyClass: String,
    val built: Int?,
    val style: String?,
    val livingAreaSqFt: Int?,
    val lotAcres: Double?,
    val block: String,
    val lot: String,
)

data class RobustDimension(val letter: Char, val name: String, val score: Int)

data class PropertyDetail(
    val summary: PropertySummary,
    val score: ScoreCard?,
    val tax: TaxCard?,
    val valueCheck: ValueCheck?,
    val sales: SalesNearby?,
    val facts: HomeFacts,
    val robust: List<RobustDimension>,
    /** "Sources: NJ MOD-IV tax list, ..." */
    val sources: String,
    val imageUrl: String? = null,
    val isSaved: Boolean = false,
    val isWatched: Boolean = false,
)
