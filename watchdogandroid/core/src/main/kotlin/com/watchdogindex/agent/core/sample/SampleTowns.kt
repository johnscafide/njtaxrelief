package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.RatePoint

/**
 * Town-level facts the sample set runs its math on: the 2026 Chapter 123 average ratio and upper limit and the
 * general tax rate per $100 by year. These are fictional stand-ins shaped like the state tables (ratios to two
 * decimals, rates to three) and chosen so the approved mockup figures fall out of [TaxMath] exactly:
 *
 * - Cherry Hill: ratio 61.20 gives an implied value of $428,800 for a $262,400 assessment and the 70.38 upper
 *   limit (1.15 × 61.20) gives a floor of $372,800, both to the nearest $100; the 2025 rate 4.300 puts the
 *   $11,284 bill in 2025 and the 2026 rate 4.470 scales it to $11,730.
 * - Red Bank: ratio 90.19 and the 2026 rate 2.134 make a home selling at $849,000 "usually pay about $16,340".
 */
data class SampleTown(
    /** Four-digit taxing-district code, the first part of every PAMS PIN. */
    val district: String,
    val town: String,
    val county: String,
    /** Short form used in prose and medians, e.g. "Cherry Hill" for "Cherry Hill Twp". */
    val shortName: String,
    val ratioPercent: Double,
    val rates: Map<Int, Double>,
    val medianBill: Int,
    /** Year of the next town-wide revaluation or reassessment, when one is scheduled. */
    val revaluationYear: Int? = null,
    /** Typical assessment range for a Class 2 home, used when a property has to be invented for an unknown PIN. */
    val typicalAssessed: IntRange,
) {
    val upperPercent: Double get() = TaxMath.chapter123UpperLimit(ratioPercent)
    val latestYear: Int get() = rates.keys.max()
    val latestRate: Double get() = rates.getValue(latestYear)
    val rateHistory: List<RatePoint> get() = rates.entries.sortedBy { it.key }.map { RatePoint(it.key, it.value) }
    /** "Cherry Hill median" */
    val medianLabel: String get() = "$shortName median"

    fun blockLot(block: String, lot: String): String = Format.blockLot(block, lot)
}

object SampleTowns {
    val cherryHill = SampleTown(
        district = "0409",
        town = "Cherry Hill Twp",
        county = "Camden County",
        shortName = "Cherry Hill",
        ratioPercent = 61.20,
        rates = mapOf(2020 to 3.877, 2021 to 3.951, 2022 to 4.046, 2023 to 4.118, 2024 to 4.212, 2025 to 4.300, 2026 to 4.470),
        medianBill = 9_960,
        typicalAssessed = 190_000..340_000,
    )

    val redBank = SampleTown(
        district = "1340",
        town = "Red Bank",
        county = "Monmouth County",
        shortName = "Red Bank",
        ratioPercent = 90.19,
        rates = mapOf(2020 to 1.905, 2021 to 1.938, 2022 to 1.972, 2023 to 2.011, 2024 to 2.046, 2025 to 2.078, 2026 to 2.134),
        medianBill = 11_420,
        typicalAssessed = 380_000..820_000,
    )

    /** Harrison's 2026 general rate rose 7%, the change behind the Monday brief's first item. */
    val harrison = SampleTown(
        district = "0905",
        town = "Harrison",
        county = "Hudson County",
        shortName = "Harrison",
        ratioPercent = 45.31,
        rates = mapOf(2020 to 2.301, 2021 to 2.348, 2022 to 2.402, 2023 to 2.471, 2024 to 2.540, 2025 to 2.612, 2026 to 2.795),
        medianBill = 10_140,
        typicalAssessed = 260_000..460_000,
    )

    /** Gloucester Township revalues for 2027, which moves its appeal deadline that year to May 1. */
    val gloucesterTwp = SampleTown(
        district = "0415",
        town = "Gloucester Twp",
        county = "Camden County",
        shortName = "Gloucester Twp",
        ratioPercent = 78.42,
        rates = mapOf(2020 to 3.744, 2021 to 3.812, 2022 to 3.905, 2023 to 4.021, 2024 to 4.118, 2025 to 4.201, 2026 to 4.312),
        medianBill = 8_760,
        revaluationYear = 2027,
        typicalAssessed = 150_000..260_000,
    )

    val haddonfield = SampleTown(
        district = "0417",
        town = "Haddonfield",
        county = "Camden County",
        shortName = "Haddonfield",
        ratioPercent = 84.15,
        rates = mapOf(2020 to 3.221, 2021 to 3.268, 2022 to 3.301, 2023 to 3.354, 2024 to 3.402, 2025 to 3.455, 2026 to 3.512),
        medianBill = 15_880,
        typicalAssessed = 380_000..720_000,
    )

    val fairHaven = SampleTown(
        district = "1316",
        town = "Fair Haven",
        county = "Monmouth County",
        shortName = "Fair Haven",
        ratioPercent = 88.72,
        rates = mapOf(2020 to 1.845, 2021 to 1.872, 2022 to 1.901, 2023 to 1.940, 2024 to 1.975, 2025 to 2.004, 2026 to 2.041),
        medianBill = 14_210,
        typicalAssessed = 520_000..980_000,
    )

    val middletown = SampleTown(
        district = "1332",
        town = "Middletown Twp",
        county = "Monmouth County",
        shortName = "Middletown",
        ratioPercent = 82.64,
        rates = mapOf(2020 to 1.988, 2021 to 2.021, 2022 to 2.055, 2023 to 2.094, 2024 to 2.130, 2025 to 2.168, 2026 to 2.207),
        medianBill = 10_980,
        typicalAssessed = 360_000..740_000,
    )

    val voorhees = SampleTown(
        district = "0434",
        town = "Voorhees Twp",
        county = "Camden County",
        shortName = "Voorhees",
        ratioPercent = 66.05,
        rates = mapOf(2020 to 3.512, 2021 to 3.578, 2022 to 3.641, 2023 to 3.720, 2024 to 3.803, 2025 to 3.880, 2026 to 3.962),
        medianBill = 10_620,
        typicalAssessed = 200_000..380_000,
    )

    val all: List<SampleTown> = listOf(cherryHill, redBank, harrison, gloucesterTwp, haddonfield, fairHaven, middletown, voorhees)

    private val byDistrict = all.associateBy { it.district }
    private val byName = all.flatMap { t -> listOf(t.town.lowercase() to t, t.shortName.lowercase() to t) }.toMap()

    fun byDistrict(district: String): SampleTown? = byDistrict[district]

    fun byName(name: String): SampleTown? = byName[name.trim().lowercase()]

    /** A town for any district code: the known one, or a deterministic pick so invented properties stay plausible. */
    fun forDistrict(district: String): SampleTown = byDistrict[district] ?: all[stableIndex(district, all.size)]

    internal fun stableIndex(key: String, size: Int): Int {
        var h = 7
        for (ch in key) h = (h * 31 + ch.code) and 0x7fffffff
        return h % size
    }
}
