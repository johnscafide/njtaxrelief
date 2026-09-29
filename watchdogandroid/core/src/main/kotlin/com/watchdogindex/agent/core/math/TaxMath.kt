package com.watchdogindex.agent.core.math

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.PriceCheck
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.RatePoint
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.ScoreBands
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.ValueVerdict
import com.watchdogindex.agent.core.model.VerdictKind
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.roundToInt

/**
 * The website's tax math, ported line for line from the Node routes documented in
 * `site-api-contracts.md` section 4 (`api/watchdog-true-cost.js`, `api/watchdog-checkup.js`,
 * `api/watchdog-property-page.js`). Money is in dollars, percentages are whole percent (61.2 means 61.2%),
 * tax rates are dollars per $100 of assessed value. Anything that departs from the site says so in a comment.
 */
object TaxMath {

    // ------------------------------------------------------------------ monthly cost (site 4.2)

    /** One month of owning a listing. [hoa] is monthly on input and output; tax and insurance are annual on input. */
    data class MonthlyCost(
        val loan: Double,
        val cashDown: Double,
        val principalAndInterest: Double,
        val tax: Double,
        val insurance: Double,
        val hoa: Double,
        val total: Double,
    ) {
        val principalAndInterestRounded: Int get() = principalAndInterest.roundToInt()
        val taxRounded: Int get() = tax.roundToInt()
        val insuranceRounded: Int get() = insurance.roundToInt()
        val hoaRounded: Int get() = hoa.roundToInt()

        /** The site rounds the true total, not the sum of the rounded lines, so the lines can differ from it by $1. */
        val totalRounded: Int get() = total.roundToInt()
    }

    /**
     * Standard amortization: payment = L·r / (1 − (1+r)^−n) with r the monthly rate and n the number of
     * payments; a 0% rate divides the loan evenly. [annualTax] and [annualInsurance] are per year, [monthlyHoa] per month.
     */
    fun monthlyCost(
        price: Double,
        downPercent: Double,
        ratePercent: Double,
        termYears: Int,
        annualTax: Double,
        annualInsurance: Double = 0.0,
        monthlyHoa: Double = 0.0,
    ): MonthlyCost {
        val loan = maxOf(0.0, price * (1 - downPercent / 100))
        val r = ratePercent / 100 / 12
        val n = termYears * 12
        val pi = if (loan > 0) {
            if (r > 0) loan * r / (1 - (1 + r).pow(-n.toDouble())) else loan / n
        } else 0.0
        val tax = annualTax / 12
        val ins = annualInsurance / 12
        return MonthlyCost(loan, price - loan, pi, tax, ins, monthlyHoa, pi + tax + ins + monthlyHoa)
    }

    fun monthlyCost(inputs: TrueCostInputs, annualTax: Int): MonthlyCost = monthlyCost(
        price = inputs.price.toDouble(),
        downPercent = inputs.downPercent,
        ratePercent = inputs.ratePercent,
        termYears = inputs.termYears,
        annualTax = annualTax.toDouble(),
        annualInsurance = inputs.annualInsurance.toDouble(),
        monthlyHoa = inputs.monthlyHoa.toDouble(),
    )

    /** The site's note when the buyer puts down less than 20%. */
    const val MORTGAGE_INSURANCE_NOTE = "With less than 20% down, lenders usually add mortgage insurance, not shown here."

    // ------------------------------------------------------------------ price check (site 4.3)

    /**
     * The raw comparison behind the listing price check. [typicalTax] is what a home selling at this price
     * usually pays in the town (price × ratio × rate), [gap] is the listing's bill minus that, [assessedPercent]
     * is the assessment as a share of the price and [overLimit] says whether it exceeds the Chapter 123 upper limit.
     */
    data class PriceCheckFacts(
        val price: Double,
        val typicalTax: Double?,
        val gap: Double?,
        val assessedPercent: Double?,
        val limitPercent: Double?,
        val overLimit: Boolean?,
    )

    fun priceCheck(
        price: Double,
        assessed: Double,
        tax: Double,
        ratioPercent: Double?,
        upperPercent: Double?,
        ratePer100: Double?,
    ): PriceCheckFacts? {
        if (!(price > 0)) return null
        var typical: Double? = null
        var gap: Double? = null
        if ((ratioPercent ?: 0.0) > 0 && (ratePer100 ?: 0.0) > 0) {
            typical = price * (ratioPercent!! / 100) * (ratePer100!! / 100)
            if (tax > 0) gap = tax - typical
        }
        val assessedPct = if (assessed > 0) assessed / price * 100 else null
        var limit: Double? = null
        var over: Boolean? = null
        if (assessedPct != null && (upperPercent ?: 0.0) > 0) {
            limit = minOf(upperPercent!!, 100.0)
            over = assessedPct > limit
        }
        return PriceCheckFacts(price, typical, gap, assessedPct, limit, over)
    }

    /** Titles are the site's exact strings; the 15% corridor around the typical bill is the site's threshold. */
    const val PRICE_CHECK_CORRIDOR = 0.15

    /**
     * Turns the facts into the card the app shows. Titles are the site's exact verdict strings. The body copy for
     * "Low tax for this price" is the approved mockup sentence; the other bodies follow the same voice because the
     * contract document quotes only the titles.
     *
     * "Assessed high for this price" (assessment above the Chapter 123 limit) is GOOD news for a buyer: the site
     * (`verdictText` in `api/watchdog-true-cost.js`) gives it tone `good` because the assessment can be appealed after
     * closing. The model has no kind for it yet, so it travels as [PriceCheckKind.HighTaxForPrice] with the title
     * [ASSESSED_HIGH_TITLE]; the UI must not colour that title as a warning. Use [priceCheckTone] for the box tone
     * rather than switching on the kind, until [PriceCheckKind] gains an `AssessedHigh` entry.
     */
    fun priceVerdict(facts: PriceCheckFacts?, town: String): PriceCheck {
        if (facts == null) {
            return PriceCheck(
                PriceCheckKind.Unknown,
                "Add the price",
                "Add the list price to compare the tax with what similar homes in $town pay.",
                null,
            )
        }
        val typical = facts.typicalTax
        val expected = typical?.roundToInt()
        if (facts.overLimit == true) {
            return PriceCheck(
                PriceCheckKind.HighTaxForPrice,
                ASSESSED_HIGH_TITLE,
                "The assessment is ${Format.fixed(facts.assessedPercent!!, 0)}% of this price, above $town’s Chapter 123 limit of " +
                    "${Format.fixed(facts.limitPercent!!, 0)}%. At this price the assessment could be appealed.",
                expected,
            )
        }
        if (typical != null && typical > 0 && facts.gap != null) {
            val share = facts.gap / typical
            val lead = "Homes that sell near ${Format.money(facts.price)} in $town usually pay about ${Format.money(typical)}."
            return when {
                share < -PRICE_CHECK_CORRIDOR -> PriceCheck(
                    PriceCheckKind.LowTaxForPrice,
                    "Low tax for this price",
                    "$lead A town-wide revaluation could move this bill toward that.",
                    expected,
                )
                share > PRICE_CHECK_CORRIDOR -> PriceCheck(
                    PriceCheckKind.HighTaxForPrice,
                    "On the high side for this price",
                    "$lead This bill runs above that, so the assessment is worth a second look.",
                    expected,
                )
                else -> PriceCheck(
                    PriceCheckKind.InLine,
                    "In line for this price",
                    "$lead This bill is within 15% of that.",
                    expected,
                )
            }
        }
        return PriceCheck(
            PriceCheckKind.Unknown,
            "Comparison not available",
            "$town’s ratio or tax rate is not on file yet, so there is nothing to compare this price with.",
            null,
        )
    }

    /** The site's exact title for an assessment above the Chapter 123 limit. See [priceCheckTone]. */
    const val ASSESSED_HIGH_TITLE = "Assessed high for this price"

    /**
     * The tone a verdict box should use for a price check, as the site colours it: "In line" and "Assessed high"
     * are good for the buyer (the second because the assessment can be appealed after closing), "Low tax" and
     * "On the high side" are warnings, and no comparison is neutral. "Assessed high" shares
     * [PriceCheckKind.HighTaxForPrice] with "On the high side" until the model gains an `AssessedHigh` kind, so it is
     * told apart by [ASSESSED_HIGH_TITLE], which only [priceVerdict] produces. Screens should call this instead of
     * switching on [PriceCheck.kind] themselves.
     */
    fun priceCheckTone(check: PriceCheck): VerdictKind = when {
        check.title == ASSESSED_HIGH_TITLE -> VerdictKind.Good
        check.kind == PriceCheckKind.InLine -> VerdictKind.Good
        check.kind == PriceCheckKind.LowTaxForPrice || check.kind == PriceCheckKind.HighTaxForPrice -> VerdictKind.Warn
        else -> VerdictKind.Neutral
    }

    // ------------------------------------------------------------------ holds-up floor (site 4.7)

    /**
     * [floor] is the lowest market value at which the assessment is still within the town's Chapter 123 upper
     * limit; [implied] is the market value the town's average ratio says the assessment matches.
     */
    data class HoldsUp(val floor: Double, val implied: Double, val limitPercent: Double, val ratioPercent: Double) {
        /** The property page shows both figures to the nearest $100. */
        val floorRounded: Int get() = roundToHundred(floor)
        val impliedRounded: Int get() = roundToHundred(implied)
    }

    fun holdsUp(assessed: Double, ratioPercent: Double?, upperPercent: Double?): HoldsUp? {
        if (!(assessed > 0) || !((ratioPercent ?: 0.0) > 0) || !((upperPercent ?: 0.0) > 0)) return null
        val limit = minOf(upperPercent!!, 100.0)
        return HoldsUp(
            floor = assessed / (limit / 100),
            implied = assessed / (ratioPercent!! / 100),
            limitPercent = limit,
            ratioPercent = ratioPercent,
        )
    }

    /**
     * New Jersey's Chapter 123 corridor: the upper limit is the average ratio plus 15% of itself, never above
     * 100%. The state table publishes these to two decimals; use the published figure when you have it.
     */
    fun chapter123UpperLimit(ratioPercent: Double): Double = minOf(ratioPercent * 1.15, 100.0)

    fun chapter123LowerLimit(ratioPercent: Double): Double = ratioPercent * 0.85

    fun roundToHundred(value: Double): Int = (value / 100.0).roundToInt() * 100

    /**
     * The value-check verdict under the value line. [floor] is the rounded holds-up figure. "Well above" needs the
     * sales median at least 10% over the floor; fewer than three sales gives a neutral verdict.
     */
    fun valueVerdict(floor: Int, salesMedian: Int?, salesCount: Int, salesSinceLabel: String?): ValueVerdict {
        val since = salesSinceLabel?.let { " $it" } ?: ""
        if (salesMedian == null || salesCount < 3) {
            return ValueVerdict(
                VerdictKind.Neutral,
                "Not enough nearby sales",
                "Fewer than three similar homes sold nearby$since, so the value line has no anchor yet.",
            )
        }
        val homes = "${Format.countWord(salesCount)} similar homes nearby sold for a median ${Format.money(salesMedian)}$since"
        return when {
            salesMedian >= floor * 1.10 -> ValueVerdict(VerdictKind.Good, "Holds up at today’s prices", "$homes, well above ${Format.money(floor)}.")
            salesMedian >= floor -> ValueVerdict(VerdictKind.Good, "Holds up at today’s prices", "$homes, above ${Format.money(floor)}.")
            else -> ValueVerdict(
                VerdictKind.Warn,
                "May not hold up at today’s prices",
                "$homes, below ${Format.money(floor)}. Worth a tax checkup.",
            )
        }
    }

    // ------------------------------------------------------------------ rate trend (site 4.5)

    data class RateChange(val from: RatePoint, val to: RatePoint, val perYearPercent: Double)

    /**
     * The site's `rateChange`: needs at least three points, looks at the last [window] (six on the site) and
     * returns the compound yearly change from the first to the last of those.
     */
    fun rateChange(points: List<RatePoint>, window: Int = 6): RateChange? {
        if (points.size < 3) return null
        val pts = points.takeLast(window)
        val a = pts.first()
        val b = pts.last()
        val years = b.year - a.year
        if (!(years > 0 && a.ratePer100 > 0)) return null
        return RateChange(a, b, ((b.ratePer100 / a.ratePer100).pow(1.0 / years) - 1) * 100)
    }

    /**
     * "+2.4% a year since 2020": the label under the tax card's rate bars. It compounds over the whole history the
     * card draws (all seven bars on the mockup), not the site's six-point window, so the label and the bars agree.
     */
    fun rateTrendLabel(points: List<RatePoint>): String? {
        val change = rateChange(points, window = points.size) ?: return null
        return "${Format.signedPercent(change.perYearPercent, 1)} a year since ${change.from.year}"
    }

    /**
     * The site's `rateTrend`: newest year first, walk back while the years are consecutive and no revaluation jump
     * (a year-over-year ratio outside 0.7..1.3) breaks the series. Returns the kept points oldest first.
     */
    fun rateTrend(series: Map<Int, Double>): List<RatePoint> {
        val years = series.keys.filter { it > 1990 && (series[it] ?: 0.0) > 0 }.sortedDescending()
        if (years.isEmpty()) return emptyList()
        val kept = mutableListOf(years[0])
        for (i in 1 until years.size) {
            val newer = series.getValue(kept.last())
            val older = series.getValue(years[i])
            if (years[i] != kept.last() - 1 || older / newer > 1.3 || older / newer < 0.7) break
            kept += years[i]
        }
        return kept.reversed().map { RatePoint(it, series.getValue(it)) }
    }

    // ------------------------------------------------------------------ bill year (site 4.6)

    /** The newer year's bill: the real bill scaled to the new rate, or a general-rate estimate when the bill's year is unknown. */
    data class CurrentBill(val year: Int, val amount: Double, val generalRateOnly: Boolean = false)

    /** [year] is the tax year the bill on file belongs to (null when it matches no recent rate). */
    data class BillYear(val year: Int?, val current: CurrentBill?)

    /**
     * Works out which year the bill on the state list belongs to by comparing bill / assessed with the two newest
     * general rates (0.2% tolerance), then scales it to the newest rate: 11,284 at 4.300 becomes 11,730 at 4.470.
     */
    fun billYear(bill: Double, assessed: Double, series: Map<Int, Double>): BillYear {
        if (!(bill > 0) || !(assessed > 0) || series.isEmpty()) return BillYear(null, null)
        val implied = bill / assessed * 100
        val years = series.keys.filter { (series[it] ?: 0.0) > 0 }.sortedDescending()
        if (years.isEmpty()) return BillYear(null, null)
        val latest = years[0]
        val hit = years.take(2).firstOrNull { abs(implied / series.getValue(it) - 1) <= 0.002 }
        if (hit == null) {
            return BillYear(null, CurrentBill(latest, round(assessed * series.getValue(latest)) / 100.0, generalRateOnly = true))
        }
        val current = if (hit < latest) CurrentBill(latest, billAtRate(bill, series.getValue(hit), series.getValue(latest))) else null
        return BillYear(hit, current)
    }

    /** Scales a bill from one general rate to another, to the cent, as the site does. */
    fun billAtRate(bill: Double, fromRate: Double, toRate: Double): Double = round(bill * toRate / fromRate * 100) / 100.0

    fun taxLabel(billYear: BillYear): String = if (billYear.year != null) "${billYear.year} tax bill" else "Latest annual tax"

    fun nextYearLabel(current: CurrentBill): String = "${current.year} " + if (current.generalRateOnly) "estimate" else "at new rate"

    // ------------------------------------------------------------------ appeal deadline (site 4.8)

    /** [label] "April 1, 2027", [shortLabel] "Apr 1", [note] the site's caveat (empty in a revaluation year). */
    data class AppealDeadline(val date: LocalDate, val label: String, val shortLabel: String, val note: String)

    const val REVALUATION_DEADLINE_NOTE = "May 1 if your town revalues that year"

    /**
     * County tax appeals are due April 1, or May 1 in a year the town revalues or reassesses. The site does this
     * arithmetic in UTC with the cutoff at the end of the deadline day, so a check on the deadline day itself still
     * returns that year. The site hard-codes 2026 as the only revaluation year it knows; [revaluationYears] lets
     * the app pass the town's actual schedule (`setOf(2026)` reproduces the site exactly).
     */
    fun nextDeadline(nowUtc: Instant, revaluationYears: Set<Int> = emptySet()): AppealDeadline =
        nextDeadline(nowUtc.toLocalDateTime(TimeZone.UTC).date, revaluationYears)

    fun nextDeadline(today: LocalDate, revaluationYears: Set<Int> = emptySet()): AppealDeadline {
        var year = today.year
        val cutoff = if (year in revaluationYears) LocalDate(year, 5, 1) else LocalDate(year, 4, 1)
        if (today > cutoff) year += 1
        return if (year in revaluationYears) {
            val date = LocalDate(year, 5, 1)
            AppealDeadline(date, Format.monthDayYear(date), Format.monthDay(date), "")
        } else {
            val date = LocalDate(year, 4, 1)
            AppealDeadline(date, Format.monthDayYear(date), Format.monthDay(date), REVALUATION_DEADLINE_NOTE)
        }
    }

    // ------------------------------------------------------------------ Watchdog Score

    /** Verdict thresholds from the scoring function (`workbench-score`): 80, 65, 50, 35. */
    const val STRONG_FROM = 80
    const val FAVORABLE_FROM = 65
    const val MIXED_FROM = 50
    const val PRESSURED_FROM = 35

    /**
     * The verdict the app displays for a score. Thresholds are the backend's; the wording is the backend's too,
     * except that its "Typical or mixed tax position" reads "Mixed tax position" in the app (the approved mockup
     * shows a 57 as "Mixed tax position"). 72 is "Favorable tax position".
     */
    fun verdictFor(score: Int): String = when {
        score >= STRONG_FROM -> "Strong tax position"
        score >= FAVORABLE_FROM -> "Favorable tax position"
        score >= MIXED_FROM -> "Mixed tax position"
        score >= PRESSURED_FROM -> "Pressured tax position"
        else -> "Highly pressured tax position"
    }

    /** The exact string the scoring function returns for a score. */
    fun backendVerdict(score: Int): String = when {
        score >= STRONG_FROM -> "Strong tax position"
        score >= FAVORABLE_FROM -> "Favorable tax position"
        score >= MIXED_FROM -> "Typical or mixed tax position"
        score >= PRESSURED_FROM -> "Pressured tax position"
        else -> "Highly pressured tax position"
    }

    /** Maps a verdict string from the backend to the app's display wording. Unknown strings pass through. */
    fun displayVerdict(backendVerdict: String): String =
        if (backendVerdict.equals("Typical or mixed tax position", ignoreCase = true)) "Mixed tax position" else backendVerdict

    /** Confidence from evidence coverage, as the scoring function reports it: high at 85%+, medium at 60%+, else low. */
    fun confidenceFor(coveragePercent: Int): String = when {
        coveragePercent >= 85 -> "high"
        coveragePercent >= 60 -> "medium"
        else -> "low"
    }

    /** Map band 0..4 for the five score bands (0-39, 40-54, 55-69, 70-84, 85+), or null without a score. */
    fun bandIndex(score: Int?): Int? = ScoreBands.bandIndex(score)

    fun bandLabel(score: Int?): String? = bandIndex(score)?.let { ScoreBands.labels[it] }

    /** ROBUST weights by letter, from the scoring function: Burden 30, Overassessment 20, Uniformity 15, Stability 15, Trajectory 10, Recourse 10. */
    val ROBUST_WEIGHTS: Map<Char, Int> = mapOf('B' to 30, 'O' to 20, 'U' to 15, 'S' to 15, 'T' to 10, 'R' to 10)

    /**
     * Weighted composite of the dimensions present, weights renormalized when some are missing (the backend rule).
     * The app never computes the score it shows (that comes from the backend); this is for sample data and checks.
     */
    fun compositeScore(dimensions: List<RobustDimension>): Int? {
        var weightSum = 0
        var total = 0.0
        for (d in dimensions) {
            val w = ROBUST_WEIGHTS[d.letter.uppercaseChar()] ?: continue
            weightSum += w
            total += d.score * w
        }
        if (weightSum == 0) return null
        return (total / weightSum).roundToInt().coerceIn(0, 100)
    }

    /** Evidence coverage: the sum of the weights of the dimensions present. */
    fun evidenceCoverage(dimensions: List<RobustDimension>): Int =
        dimensions.mapNotNull { ROBUST_WEIGHTS[it.letter.uppercaseChar()] }.sum().coerceIn(0, 100)

    /** What a screen reader says for the dial: "Watchdog Score 72 out of 100, favorable tax position". */
    fun scoreAccessibilityLabel(score: Int, verdict: String): String =
        "Watchdog Score $score out of 100, " + verdict.replaceFirstChar { it.lowercaseChar() }
}
