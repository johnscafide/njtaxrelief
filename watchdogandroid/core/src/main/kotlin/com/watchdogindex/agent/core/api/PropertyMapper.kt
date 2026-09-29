package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.HomeFacts
import com.watchdogindex.agent.core.model.NearbySale
import com.watchdogindex.agent.core.model.PriceCheck
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.RatePoint
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.SalesNearby
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.ScoreCard
import com.watchdogindex.agent.core.model.TaxCard
import com.watchdogindex.agent.core.model.ValueCheck
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt

/**
 * Turns the property route's JSON into the screen models. Every number is the one the row carries or the one
 * `TaxMath` derives from it; nothing is invented. The row never carries owner names or mailing fields, and the
 * mapper never adds them.
 */
class PropertyMapper(private val today: () -> LocalDate = { Clock.System.now().toLocalDateTime(Derived.NEW_JERSEY).date }) {

    /** The ROBUST letters in order with the names the app shows; `fairness` is the row's key for Overassessment. */
    private val dimensions = listOf(
        Triple('R', "Recourse", "recourse"),
        Triple('O', "Overassessment", "fairness"),
        Triple('B', "Burden", "burden"),
        Triple('U', "Uniformity", "uniformity"),
        Triple('S', "Stability", "stability"),
        Triple('T', "Trajectory", "trajectory"),
    )

    fun summary(response: PropertyApi.Response): PropertySummary {
        val row = response.property
        val display = response.derived?.display
        val address = display?.address?.takeIf { it.isNotBlank() } ?: Derived.titleCase(row.address)
        val town = display?.town?.takeIf { it.isNotBlank() } ?: Derived.townName(row.town)
        val county = Derived.countyName(display?.county ?: row.county)
        val classLabel = display?.classLabel ?: Derived.classLabel(row.propClass)
        return PropertySummary(
            pin = row.pamsPin,
            address = address,
            town = town,
            county = county,
            blockLot = Format.blockLot(row.block ?: "", row.lot ?: "", row.qualifier),
            score = row.score?.score?.roundToInt(),
            taxBill = row.lastYearTax?.roundToInt(),
            propertyClassLabel = when {
                classLabel != null && !row.propClass.isNullOrBlank() -> "Class ${row.propClass} · $classLabel"
                classLabel != null -> classLabel
                !row.propClass.isNullOrBlank() -> "Class ${row.propClass}"
                else -> "Property"
            },
            lat = row.lat,
            lon = row.lon,
        )
    }

    fun detail(response: PropertyApi.Response, isSaved: Boolean = false, isWatched: Boolean = false, imageUrl: String? = response.photoUrl): PropertyDetail {
        val row = response.property
        val derived = response.derived
        val summary = summary(response)
        val shortTown = Derived.shortTownName(summary.town)
        val todayDate = today()

        val ratePoints = derived?.rateTrend?.points.orEmpty().mapNotNull { p -> p.year?.let { y -> p.rate?.let { r -> RatePoint(y.toInt(), r) } } }
        val latestRateYear = derived?.rateTrend?.latest?.year?.toInt() ?: ratePoints.lastOrNull()?.year
        val bill = derived?.bill
        val current = bill?.current
        val billYear = bill?.year?.toInt()
        val tax = row.lastYearTax?.let { taxAmount ->
            val nextYear = current?.year?.toInt() ?: latestRateYear ?: (billYear?.plus(1) ?: todayDate.year)
            TaxCard(
                billYear = billYear ?: nextYear - 1,
                bill = taxAmount.roundToInt(),
                billSourceLabel = if (billYear != null) "$billYear bill on the state tax list" else "Latest annual tax on the state tax list",
                nextYear = nextYear,
                nextYearBill = current?.amount?.roundToInt(),
                townName = shortTown,
                townMedian = row.townCompare?.medianTax?.roundToInt(),
                rateHistory = ratePoints,
                rateTrendLabel = TaxMath.rateTrendLabel(ratePoints),
            )
        }

        val assessed = row.assessedValue?.roundToInt()
        val holds = derived?.holdsUp?.let { h ->
            val ratio = h.ratio ?: derived.chapter123?.ratio
            val upper = h.limit ?: derived.chapter123?.upper
            if (row.assessedValue != null && ratio != null && upper != null) TaxMath.holdsUp(row.assessedValue, ratio, upper) else null
        } ?: derived?.chapter123?.let { c -> if (row.assessedValue != null) TaxMath.holdsUp(row.assessedValue, c.ratio, c.upper) else null }
        val salesCount = row.salesSummary?.count?.toInt() ?: 0
        val salesMedian = row.salesSummary?.median?.roundToInt()
        val firstSale = Derived.parseDate(row.salesSummary?.firstDate)
        val sinceLabel = Derived.sinceLabel(firstSale, todayDate)
        val valueCheck = if (holds != null && assessed != null) {
            val floor = derived?.holdsUp?.floor?.let { TaxMath.roundToHundred(it) } ?: holds.floorRounded
            val implied = derived?.holdsUp?.implied?.let { TaxMath.roundToHundred(it) } ?: holds.impliedRounded
            val (lo, hi) = Derived.valueLineRange(listOfNotNull(floor, implied, salesMedian))
            ValueCheck(
                assessed = assessed,
                impliedValue = implied,
                ratioPercent = holds.ratioPercent,
                holdsUpAbove = floor,
                salesMedian = salesMedian,
                salesCount = salesCount,
                salesSinceLabel = sinceLabel,
                rangeMin = lo,
                rangeMax = hi,
                verdict = TaxMath.valueVerdict(floor, salesMedian, salesCount, sinceLabel),
            )
        } else null

        val sales = row.salesSummary?.let { s ->
            SalesNearby(
                count = salesCount,
                sinceLabel = firstSale?.let { Format.sinceMonthYear(it) } ?: "",
                median = salesMedian,
                sales = row.recentSales.filter { it.pamsPin != null && (it.price ?: 0.0) > 0 }.map { sale ->
                    NearbySale(
                        address = Derived.titleCase(sale.address),
                        monthLabel = Derived.parseDate(sale.date)?.let { Format.monthYear(it) } ?: "",
                        price = sale.price!!.roundToInt(),
                    )
                },
                lastSoldPrice = row.lastSalePrice?.takeIf { it > 0 }?.roundToInt(),
                lastSoldYear = row.lastSaleYear?.toInt() ?: Derived.parseDate(row.lastSaleDate)?.year,
            )
        }

        val facts = HomeFacts(
            propertyClass = Derived.classLine(row.propClass, derived?.display?.classLabel),
            built = row.yearBuilt?.toInt()?.takeIf { it > 1700 },
            // The raw MOD-IV building description ("2 SF 2 FAM"): there is no decoder, so it is shown as received.
            style = row.buildingDesc?.trim()?.takeIf { it.isNotEmpty() },
            // Living area has no source in the row (SR-1A evidence is Pro-gated), so it is never filled from live data.
            livingAreaSqFt = null,
            lotAcres = row.acres?.takeIf { it > 0 },
            block = row.block ?: "",
            lot = row.lot ?: "",
        )

        val robust = row.score?.let { s -> dimensions.mapNotNull { (letter, name, key) -> s.component(key)?.let { RobustDimension(letter, name, it) } } } ?: emptyList()

        val score = row.score?.score?.let { raw ->
            val value = raw.roundToInt().coerceIn(0, 100)
            val coverage = row.score.evidenceCoverage?.roundToInt()?.coerceIn(0, 100)
            val confidence = row.score.confidence?.lowercase() ?: coverage?.let { TaxMath.confidenceFor(it) }
            val verdict = row.score.verdict?.takeIf { it.isNotBlank() }?.let { TaxMath.displayVerdict(it) } ?: TaxMath.verdictFor(value)
            val holdsUp = valueCheck?.let { vc -> if (vc.salesMedian == null || vc.salesCount < 3) null else vc.salesMedian >= vc.holdsUpAbove }
            val median = row.townCompare?.medianTax
            val billShare = if (median != null && median > 0 && row.lastYearTax != null) (row.lastYearTax - median) / median else null
            ScoreCard(value, verdict, Derived.scoreExplanation(holdsUp, billShare, coverage, confidence), coverage, confidence)
        }

        return PropertyDetail(
            summary = summary,
            score = score,
            tax = tax,
            valueCheck = valueCheck,
            sales = sales,
            facts = facts,
            robust = robust,
            sources = sources(row, derived),
            imageUrl = imageUrl,
            isSaved = isSaved,
            isWatched = isWatched,
        )
    }

    /** "Sources: ..." built from what the row actually used, in the sample's order, plus the screening note. */
    fun sources(row: PropertyApi.Row, derived: PropertyApi.DerivedBlock?): String {
        val parts = mutableListOf("NJ MOD-IV tax list")
        if (!derived?.rateTrend?.points.isNullOrEmpty()) parts += "NJ Division of Taxation rates"
        if (derived?.chapter123?.ratio != null) parts += "${derived.chapter123.taxYear?.toInt() ?: 2026} Chapter 123 ratios"
        if ((row.salesSummary?.count ?: 0.0) > 0 || row.recentSales.isNotEmpty()) parts += "SR1A deed sales"
        if (row.townCompare != null) parts += "town tax percentiles"
        if (row.score != null) parts += "Watchdog Score (${row.score.modelVersion ?: "ROBUST-v1"})"
        return "Sources: ${parts.joinToString(", ")}. A screening check, not an appraisal."
    }

    /**
     * The Scan result: score, this year's bill, next year's at the new rate, the list price and the price check. The
     * server's `price_check` is used when it sent one (it ran with the same math); otherwise the check is computed
     * here from the Chapter 123 ratio, the latest rate and the bill, exactly as `api/watchdog-true-cost.js` does.
     */
    fun scanResult(response: PropertyApi.Response, listPrice: Int?, priceSourceLabel: String, matchLabel: String?): ScanResult {
        val row = response.property
        val derived = response.derived
        val summary = summary(response)
        val shortTown = Derived.shortTownName(summary.town)
        val bill = derived?.bill
        val current = bill?.current
        val latestRateYear = derived?.rateTrend?.latest?.year?.toInt()
        val nextYear = current?.year?.toInt() ?: latestRateYear ?: (bill?.year?.toInt()?.plus(1) ?: today().year)
        val billYear = bill?.year?.toInt() ?: nextYear - 1
        val priceCheck: PriceCheck? = when {
            listPrice == null || listPrice <= 0 -> null
            derived?.priceCheck?.verdict != null -> PriceCheck(
                kind = priceCheckKind(derived.priceCheck.verdict),
                title = derived.priceCheck.verdict,
                body = derived.priceCheck.text ?: "",
                expectedTax = derived.priceCheck.expectedTax?.roundToInt(),
            )
            else -> {
                // The bill the check uses: the bill scaled to the new rate when the year is known, else the bill on file (site 4.2).
                val taxForCheck = if (current != null && !current.generalRateOnly && current.amount != null) current.amount else row.lastYearTax ?: 0.0
                val facts = TaxMath.priceCheck(
                    price = listPrice.toDouble(),
                    assessed = row.assessedValue ?: 0.0,
                    tax = taxForCheck,
                    ratioPercent = derived?.chapter123?.ratio,
                    upperPercent = derived?.chapter123?.upper,
                    ratePer100 = derived?.rateTrend?.latest?.rate,
                )
                TaxMath.priceVerdict(facts, shortTown)
            }
        }
        return ScanResult(
            property = summary,
            score = row.score?.score?.roundToInt(),
            verdict = row.score?.verdict?.let { TaxMath.displayVerdict(it) } ?: row.score?.score?.roundToInt()?.let { TaxMath.verdictFor(it) },
            taxBillYear = billYear,
            taxBill = row.lastYearTax?.roundToInt(),
            nextYear = nextYear,
            nextYearBill = current?.amount?.roundToInt(),
            listPrice = listPrice,
            priceSourceLabel = priceSourceLabel,
            priceCheck = priceCheck,
            matchLabel = matchLabel,
        )
    }

    companion object {
        /** The site's verdict titles map onto the app's kinds; "Assessed high" folds into HighTaxForPrice as TaxMath does. */
        fun priceCheckKind(verdict: String): PriceCheckKind = when (verdict.trim().lowercase()) {
            "low tax for this price" -> PriceCheckKind.LowTaxForPrice
            "in line for this price" -> PriceCheckKind.InLine
            "on the high side for this price", "assessed high for this price" -> PriceCheckKind.HighTaxForPrice
            else -> PriceCheckKind.Unknown
        }
    }
}
