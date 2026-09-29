package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.HomeFacts
import com.watchdogindex.agent.core.model.NearbySale
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.SalesNearby
import com.watchdogindex.agent.core.model.ScoreCard
import com.watchdogindex.agent.core.model.TaxCard
import com.watchdogindex.agent.core.model.ValueCheck
import kotlinx.datetime.LocalDate
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Builds a full [PropertyDetail] from a handful of inputs by running the same [TaxMath] the website runs, and
 * invents plausible inputs for PINs the sample set does not know. Nothing here ever produces an owner name:
 * a property is its address, its parcel and its public numbers.
 */
object SampleProperties {

    const val SOURCES =
        "Sources: NJ MOD-IV tax list, NJ Division of Taxation rates, 2026 Chapter 123 ratios, SR1A deed sales. A screening check, not an appraisal."

    /** The inputs a property page needs. Everything else on the page is derived. */
    data class Seed(
        val summary: PropertySummary,
        val town: SampleTown,
        val assessed: Int,
        /** The bill on the state tax list (the newest closed year). */
        val bill: Int,
        val salesMedian: Int?,
        val salesCount: Int,
        val sales: List<NearbySale>,
        val lastSoldPrice: Int?,
        val lastSoldYear: Int?,
        val facts: HomeFacts,
        val robust: List<RobustDimension>,
        val coveragePercent: Int,
        /** Fixed score-card sentence; when null a sentence is written from the numbers. */
        val explanation: String? = null,
        val salesSinceLabel: String = "since January",
        val salesSinceShortLabel: String = "since Jan 2026",
    )

    fun detail(seed: Seed, isSaved: Boolean = false, isWatched: Boolean = false): PropertyDetail {
        val town = seed.town
        val score = seed.summary.score ?: TaxMath.compositeScore(seed.robust) ?: 50
        val billYear = TaxMath.billYear(seed.bill.toDouble(), seed.assessed.toDouble(), town.rates)
        val billYearLabel = billYear.year ?: (town.latestYear - 1)
        val nextYearBill = billYear.current?.amount?.roundToInt()
        val tax = TaxCard(
            billYear = billYearLabel,
            bill = seed.bill,
            billSourceLabel = "$billYearLabel bill on the state tax list",
            nextYear = town.latestYear,
            nextYearBill = nextYearBill,
            townName = town.shortName,
            townMedian = town.medianBill,
            rateHistory = town.rateHistory,
            rateTrendLabel = TaxMath.rateTrendLabel(town.rateHistory),
        )
        val holds = TaxMath.holdsUp(seed.assessed.toDouble(), town.ratioPercent, town.upperPercent)
        val valueCheck = holds?.let { h ->
            val floor = h.floorRounded
            val implied = h.impliedRounded
            val anchors = listOfNotNull(floor, implied, seed.salesMedian)
            val lo = (((anchors.min() - 50_000) / 100_000) * 100_000).coerceAtLeast(0)
            var hi = ((anchors.max() + 20_000 + 99_999) / 100_000) * 100_000
            if (hi <= lo) hi = lo + 100_000
            ValueCheck(
                assessed = seed.assessed,
                impliedValue = implied,
                ratioPercent = town.ratioPercent,
                holdsUpAbove = floor,
                salesMedian = seed.salesMedian,
                salesCount = seed.salesCount,
                salesSinceLabel = seed.salesSinceLabel,
                rangeMin = lo,
                rangeMax = hi,
                verdict = TaxMath.valueVerdict(floor, seed.salesMedian, seed.salesCount, seed.salesSinceLabel),
            )
        }
        val coverage = seed.coveragePercent.coerceIn(0, 100)
        val confidence = TaxMath.confidenceFor(coverage)
        val explanation = seed.explanation ?: explain(seed, valueCheck, coverage, confidence)
        return PropertyDetail(
            summary = seed.summary,
            score = ScoreCard(score, TaxMath.verdictFor(score), explanation, coverage, confidence),
            tax = tax,
            valueCheck = valueCheck,
            sales = SalesNearby(seed.salesCount, seed.salesSinceShortLabel, seed.salesMedian, seed.sales, seed.lastSoldPrice, seed.lastSoldYear),
            facts = seed.facts,
            robust = seed.robust,
            sources = SOURCES,
            isSaved = isSaved,
            isWatched = isWatched,
        )
    }

    /** "The assessment holds up and the bill tracks the town. Evidence coverage 92%, high confidence." */
    private fun explain(seed: Seed, valueCheck: ValueCheck?, coverage: Int, confidence: String): String {
        val median = seed.town.medianBill
        val billShare = (seed.bill - median).toDouble() / median
        val holds = valueCheck?.let { vc -> vc.salesMedian == null || vc.salesMedian >= vc.holdsUpAbove } ?: true
        val first = when {
            !holds -> "The assessment is above its limit at today’s prices, so a tax checkup is worth sending."
            abs(billShare) <= 0.20 -> "The assessment holds up and the bill tracks the town."
            billShare > 0.20 -> "The assessment holds up, but the bill runs above the town median."
            else -> "The assessment holds up and the bill sits below the town median."
        }
        return "$first Evidence coverage $coverage%, $confidence confidence."
    }

    // ------------------------------------------------------------------ invented properties

    private val STREETS = listOf(
        "Maple Ave", "Oak Ln", "Chestnut St", "Highland Ave", "Park Pl", "Mill Rd", "Ridge Rd", "Cedar Ter",
        "Willow Way", "Lakeview Dr", "Colonial Ave", "Orchard St", "Meadow Ln", "Hillside Ave", "Forest Dr",
    )
    private val STYLES = listOf("2-story colonial", "Ranch", "Split level", "Cape Cod", "Bi-level", "Townhouse")
    private val MONTHS_2026 = listOf(LocalDate(2026, 9, 1), LocalDate(2026, 7, 1), LocalDate(2026, 6, 1), LocalDate(2026, 4, 1))

    /**
     * A plausible Class 2 home for any PIN, stable across calls: the district picks the town, the block and lot
     * make the address, and everything else comes from a generator seeded by the PIN.
     */
    fun invent(pin: String): Seed {
        val parts = Format.parsePin(pin) ?: Format.PinParts(pin.take(4).padEnd(4, '0'), pin.filter { it.isLetterOrDigit() }.ifEmpty { "1" }, "1", null)
        val town = SampleTowns.forDistrict(parts.district)
        val rng = Mulberry32(stableHash(pin))
        val street = STREETS[rng.nextInt(STREETS.size)]
        val number = 3 + rng.nextInt(240)
        val address = "$number $street"
        val assessed = (town.typicalAssessed.first + rng.next() * (town.typicalAssessed.last - town.typicalAssessed.first)).toInt() / 100 * 100
        val billYearRate = town.rates.getValue(town.latestYear - 1)
        val bill = (assessed * billYearRate / 100).roundToInt()
        val score = 38 + rng.nextInt(54)
        val robust = listOf('R' to "Recourse", 'O' to "Overassessment", 'B' to "Burden", 'U' to "Uniformity", 'S' to "Stability", 'T' to "Trajectory")
            .map { (letter, name) -> RobustDimension(letter, name, (score + (rng.next() - 0.5) * 24).roundToInt().coerceIn(20, 98)) }
        val implied = assessed / (town.ratioPercent / 100)
        val salesCount = 3 + rng.nextInt(7)
        val salesMedian = ((implied * (0.96 + rng.next() * 0.22)) / 1_000).roundToInt() * 1_000
        val sales = (0 until 3).map { i ->
            NearbySale(
                address = "${5 + rng.nextInt(180)} ${STREETS[rng.nextInt(STREETS.size)]}",
                monthLabel = Format.monthYear(MONTHS_2026[i]),
                price = ((salesMedian * (0.9 + rng.next() * 0.2)) / 500).roundToInt() * 500,
            )
        }
        val summary = PropertySummary(
            pin = pin,
            address = address,
            town = town.town,
            county = town.county,
            blockLot = Format.blockLot(parts.block, parts.lot, parts.qualifier),
            score = score,
            taxBill = bill,
            propertyClassLabel = "Class 2 residential",
        )
        return Seed(
            summary = summary,
            town = town,
            assessed = assessed,
            bill = bill,
            salesMedian = salesMedian,
            salesCount = salesCount,
            sales = sales,
            lastSoldPrice = ((implied * (0.55 + rng.next() * 0.25)) / 1_000).roundToInt() * 1_000,
            lastSoldYear = 2006 + rng.nextInt(16),
            facts = HomeFacts(
                propertyClass = "2 · Residential",
                built = 1948 + rng.nextInt(52),
                style = STYLES[rng.nextInt(STYLES.size)],
                livingAreaSqFt = (1_350 + rng.nextInt(1_500)) / 10 * 10,
                lotAcres = (14 + rng.nextInt(40)) / 100.0,
                block = parts.block,
                lot = parts.lot,
            ),
            robust = robust,
            coveragePercent = 70 + rng.nextInt(31),
        )
    }

    internal fun stableHash(text: String): Int {
        var h = 0x2545F491
        for (ch in text) h = (h xor ch.code) * 16777619
        return h
    }
}
