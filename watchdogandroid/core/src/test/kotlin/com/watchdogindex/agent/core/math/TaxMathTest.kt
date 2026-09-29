package com.watchdogindex.agent.core.math

import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.RatePoint
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.VerdictKind
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TaxMathTest {

    private val cherryHillRates = mapOf(2020 to 3.877, 2021 to 3.951, 2022 to 4.046, 2023 to 4.118, 2024 to 4.212, 2025 to 4.300, 2026 to 4.470)
    private val cherryHillHistory = cherryHillRates.entries.sortedBy { it.key }.map { RatePoint(it.key, it.value) }

    // ---------------------------------------------------------------- true cost card

    @Test
    fun `true cost card reproduces the mockup lines`() {
        // $449,000, 20% down, 6.5% over 30 years, tax $11,730 a year, insurance $1,680 a year.
        val m = TaxMath.monthlyCost(TrueCostInputs(449_000, 20.0, 6.5, 30, 1_680, 0), annualTax = 11_730)
        assertEquals(359_200.0, m.loan, 0.001)
        assertEquals(89_800.0, m.cashDown, 0.001)
        assertEquals(2_270, m.principalAndInterestRounded)
        assertEquals(978, m.taxRounded)
        assertEquals(140, m.insuranceRounded)
        assertEquals(0, m.hoaRounded)
        assertEquals(3_388, m.totalRounded)
    }

    @Test
    fun `zero rate divides the loan evenly and zero loan has no payment`() {
        val zeroRate = TaxMath.monthlyCost(price = 360_000.0, downPercent = 0.0, ratePercent = 0.0, termYears = 30, annualTax = 0.0)
        assertEquals(1_000.0, zeroRate.principalAndInterest, 0.001)
        val cash = TaxMath.monthlyCost(price = 360_000.0, downPercent = 100.0, ratePercent = 6.5, termYears = 30, annualTax = 12_000.0, monthlyHoa = 250.0)
        assertEquals(0.0, cash.principalAndInterest)
        assertEquals(1_250.0, cash.total, 0.001)
    }

    // ---------------------------------------------------------------- holds up

    @Test
    fun `sample town facts reproduce the mockup value check to the nearest hundred`() {
        // Cherry Hill 2026: ratio 61.20, Chapter 123 upper limit 1.15 x 61.20 = 70.38.
        val h = assertNotNull(TaxMath.holdsUp(262_400.0, 61.20, TaxMath.chapter123UpperLimit(61.20)))
        assertEquals(70.38, h.limitPercent, 0.0001)
        assertEquals(428_800, h.impliedRounded)
        assertEquals(372_800, h.floorRounded)
    }

    @Test
    fun `documented formula with a whole-number ratio and the limit the mockup implies`() {
        // The strict NJ rule on a 61% ratio gives 70.15% and a floor of $374,055; the mockup's $372,800 corresponds to a
        // limit of 70.386% (262,400 / 372,800). The sample uses 61.20 / 70.38, which rounds to the mockup figures.
        val strict = assertNotNull(TaxMath.holdsUp(262_400.0, 61.0, TaxMath.chapter123UpperLimit(61.0)))
        assertEquals(70.15, strict.limitPercent, 0.0001)
        assertEquals(374_055.6, strict.floor, 0.1)
        assertEquals(430_163.9, strict.implied, 0.1)
        val impliedLimit = 262_400.0 / 372_800.0 * 100
        assertEquals(70.386, impliedLimit, 0.001)
        val exact = assertNotNull(TaxMath.holdsUp(262_400.0, 61.194, impliedLimit))
        assertEquals(372_800.0, exact.floor, 0.5)
    }

    @Test
    fun `upper limit is capped at 100 percent and missing facts give null`() {
        val capped = assertNotNull(TaxMath.holdsUp(624_600.0, 90.19, 103.72))
        assertEquals(100.0, capped.limitPercent)
        assertEquals(624_600.0, capped.floor, 0.001)
        assertNull(TaxMath.holdsUp(0.0, 61.2, 70.38))
        assertNull(TaxMath.holdsUp(262_400.0, null, 70.38))
        assertNull(TaxMath.holdsUp(262_400.0, 61.2, 0.0))
        assertEquals(100.0, TaxMath.chapter123UpperLimit(95.0))
        assertEquals(52.02, TaxMath.chapter123LowerLimit(61.2), 0.0001)
    }

    @Test
    fun `value verdict wording matches the mockup`() {
        val good = TaxMath.valueVerdict(372_800, 455_000, 7, "since January")
        assertEquals(VerdictKind.Good, good.kind)
        assertEquals("Holds up at today’s prices", good.title)
        assertEquals("Seven similar homes nearby sold for a median \$455,000 since January, well above \$372,800.", good.body)

        val warn = TaxMath.valueVerdict(400_000, 380_000, 4, "since January")
        assertEquals(VerdictKind.Warn, warn.kind)
        assertTrue(warn.body.startsWith("Four similar homes nearby sold for a median \$380,000 since January, below \$400,000."))

        val neutral = TaxMath.valueVerdict(400_000, null, 0, "since January")
        assertEquals(VerdictKind.Neutral, neutral.kind)
    }

    // ---------------------------------------------------------------- price check

    @Test
    fun `Red Bank listing is low tax for its price with the mockup numbers`() {
        // 2026 bill at the new rate: 12,980 x 2.134 / 2.078 = 13,329.80. Ratio 90.19, rate 2.134 per $100.
        val facts = assertNotNull(TaxMath.priceCheck(849_000.0, 624_600.0, 13_329.80, 90.19, TaxMath.chapter123UpperLimit(90.19), 2.134))
        assertEquals(16_340, facts.typicalTax!!.roundToInt())
        assertEquals(false, facts.overLimit)
        assertEquals(100.0, facts.limitPercent)
        val verdict = TaxMath.priceVerdict(facts, "Red Bank")
        assertEquals(PriceCheckKind.LowTaxForPrice, verdict.kind)
        assertEquals("Low tax for this price", verdict.title)
        assertEquals(16_340, verdict.expectedTax)
        assertEquals(
            "Homes that sell near \$849,000 in Red Bank usually pay about \$16,340. A town-wide revaluation could move this bill toward that.",
            verdict.body,
        )
        // The 2025 bill on the list gives the same verdict.
        assertEquals(PriceCheckKind.LowTaxForPrice, TaxMath.priceVerdict(TaxMath.priceCheck(849_000.0, 624_600.0, 12_980.0, 90.19, 100.0, 2.134), "Red Bank").kind)
    }

    @Test
    fun `price check branches follow the site thresholds`() {
        val inLine = TaxMath.priceVerdict(TaxMath.priceCheck(500_000.0, 300_000.0, 13_400.0, 61.2, 70.38, 4.47), "Cherry Hill")
        assertEquals(PriceCheckKind.InLine, inLine.kind)
        assertEquals("In line for this price", inLine.title)

        val high = TaxMath.priceVerdict(TaxMath.priceCheck(500_000.0, 300_000.0, 16_500.0, 61.2, 70.38, 4.47), "Cherry Hill")
        assertEquals(PriceCheckKind.HighTaxForPrice, high.kind)
        assertEquals("On the high side for this price", high.title)

        val over = TaxMath.priceVerdict(TaxMath.priceCheck(300_000.0, 262_400.0, 11_284.0, 61.2, 70.38, 4.47), "Cherry Hill")
        assertEquals("Assessed high for this price", over.title)
        assertEquals(TaxMath.ASSESSED_HIGH_TITLE, over.title)
        assertEquals(PriceCheckKind.HighTaxForPrice, over.kind)

        val noPrice = TaxMath.priceVerdict(TaxMath.priceCheck(0.0, 262_400.0, 11_284.0, 61.2, 70.38, 4.47), "Cherry Hill")
        assertEquals(PriceCheckKind.Unknown, noPrice.kind)
        assertEquals("Add the price", noPrice.title)

        val noFacts = TaxMath.priceVerdict(TaxMath.priceCheck(500_000.0, 262_400.0, 11_284.0, null, null, null), "Cherry Hill")
        assertEquals("Comparison not available", noFacts.title)
        assertNull(noFacts.expectedTax)
    }

    @Test
    fun `price check tone follows the site and assessed high is good news for the buyer`() {
        fun tone(price: Double, assessed: Double, tax: Double, ratio: Double?, upper: Double?, rate: Double?, town: String) =
            TaxMath.priceCheckTone(TaxMath.priceVerdict(TaxMath.priceCheck(price, assessed, tax, ratio, upper, rate), town))
        // Above the Chapter 123 limit: the site's tone is 'good' (appeal after closing), never a warning.
        assertEquals(VerdictKind.Good, tone(300_000.0, 262_400.0, 11_284.0, 61.2, 70.38, 4.47, "Cherry Hill"))
        assertEquals(VerdictKind.Good, tone(500_000.0, 300_000.0, 13_400.0, 61.2, 70.38, 4.47, "Cherry Hill"))
        assertEquals(VerdictKind.Warn, tone(500_000.0, 300_000.0, 16_500.0, 61.2, 70.38, 4.47, "Cherry Hill"))
        assertEquals(VerdictKind.Warn, tone(849_000.0, 624_600.0, 12_980.0, 90.19, 100.0, 2.134, "Red Bank"))
        assertEquals(VerdictKind.Neutral, tone(0.0, 262_400.0, 11_284.0, 61.2, 70.38, 4.47, "Cherry Hill"))
        assertEquals(VerdictKind.Neutral, tone(500_000.0, 262_400.0, 11_284.0, null, null, null, "Cherry Hill"))
        assertEquals(VerdictKind.Neutral, TaxMath.priceCheckTone(TaxMath.priceVerdict(null, "Cherry Hill")))
    }

    // ---------------------------------------------------------------- bill year and rates

    @Test
    fun `bill year finds 2025 and scales to the 2026 rate`() {
        val by = TaxMath.billYear(11_284.0, 262_400.0, cherryHillRates)
        assertEquals(2025, by.year)
        val current = assertNotNull(by.current)
        assertEquals(2026, current.year)
        assertEquals(11_730.11, current.amount, 0.001)
        assertEquals(false, current.generalRateOnly)
        assertEquals("2025 tax bill", TaxMath.taxLabel(by))
        assertEquals("2026 at new rate", TaxMath.nextYearLabel(current))
    }

    @Test
    fun `bill year falls back to a general-rate estimate when nothing matches`() {
        val by = TaxMath.billYear(9_000.0, 262_400.0, cherryHillRates)
        assertNull(by.year)
        val current = assertNotNull(by.current)
        assertTrue(current.generalRateOnly)
        assertEquals(11_729.28, current.amount, 0.001)
        assertEquals("Latest annual tax", TaxMath.taxLabel(by))
        assertEquals("2026 estimate", TaxMath.nextYearLabel(current))
        assertNull(TaxMath.billYear(0.0, 262_400.0, cherryHillRates).current)
    }

    @Test
    fun `rate trend label compounds over the whole history and the site window over six points`() {
        assertEquals("+2.4% a year since 2020", TaxMath.rateTrendLabel(cherryHillHistory))
        val site = assertNotNull(TaxMath.rateChange(cherryHillHistory))
        assertEquals(2021, site.from.year)
        assertEquals(2026, site.to.year)
        assertEquals(2.5, site.perYearPercent, 0.05)
        assertNull(TaxMath.rateChange(cherryHillHistory.take(2)))
    }

    @Test
    fun `rate trend series stops at a gap or a revaluation jump`() {
        val series = mapOf(2019 to 2.9, 2021 to 3.0, 2022 to 3.05, 2023 to 3.1, 2024 to 4.6, 2025 to 4.7, 2026 to 4.8)
        val kept = TaxMath.rateTrend(series)
        // 2024 to 2023 is a 0.67 ratio: revaluation jump, so only 2024-2026 survive.
        assertEquals(listOf(2024, 2025, 2026), kept.map { it.year })
        val gap = TaxMath.rateTrend(mapOf(2019 to 2.9, 2021 to 3.0, 2022 to 3.05))
        assertEquals(listOf(2021, 2022), gap.map { it.year })
    }

    // ---------------------------------------------------------------- appeal deadline

    @Test
    fun `appeal deadline rolls to next year after April 1 and to May 1 in a revaluation year`() {
        val fromSeptember = TaxMath.nextDeadline(LocalDate(2026, 9, 28))
        assertEquals("April 1, 2027", fromSeptember.label)
        assertEquals("Apr 1", fromSeptember.shortLabel)
        assertEquals(TaxMath.REVALUATION_DEADLINE_NOTE, fromSeptember.note)

        assertEquals("April 1, 2026", TaxMath.nextDeadline(LocalDate(2026, 3, 15)).label)
        // The deadline day itself still counts (the site's cutoff is the end of that day).
        assertEquals("April 1, 2026", TaxMath.nextDeadline(LocalDate(2026, 4, 1)).label)
        assertEquals("April 1, 2027", TaxMath.nextDeadline(LocalDate(2026, 4, 2)).label)

        val reval = TaxMath.nextDeadline(LocalDate(2026, 4, 15), revaluationYears = setOf(2026))
        assertEquals("May 1, 2026", reval.label)
        assertEquals("", reval.note)
        assertEquals("April 1, 2027", TaxMath.nextDeadline(LocalDate(2026, 5, 2), revaluationYears = setOf(2026)).label)
        assertEquals("May 1, 2027", TaxMath.nextDeadline(LocalDate(2026, 9, 28), revaluationYears = setOf(2027)).label)

        // UTC arithmetic: 2026-04-01T23:30Z is still April 1.
        assertEquals("April 1, 2026", TaxMath.nextDeadline(Instant.parse("2026-04-01T23:30:00Z")).label)
        assertEquals("April 1, 2027", TaxMath.nextDeadline(Instant.parse("2026-04-02T00:30:00Z")).label)
    }

    // ---------------------------------------------------------------- score

    @Test
    fun `verdicts follow the backend thresholds with the app wording`() {
        assertEquals("Strong tax position", TaxMath.verdictFor(85))
        assertEquals("Strong tax position", TaxMath.verdictFor(80))
        assertEquals("Favorable tax position", TaxMath.verdictFor(72))
        assertEquals("Favorable tax position", TaxMath.verdictFor(65))
        assertEquals("Mixed tax position", TaxMath.verdictFor(57))
        assertEquals("Mixed tax position", TaxMath.verdictFor(50))
        assertEquals("Pressured tax position", TaxMath.verdictFor(40))
        assertEquals("Highly pressured tax position", TaxMath.verdictFor(20))
        assertEquals("Typical or mixed tax position", TaxMath.backendVerdict(57))
        assertEquals("Mixed tax position", TaxMath.displayVerdict("Typical or mixed tax position"))
        assertEquals("Favorable tax position", TaxMath.displayVerdict("Favorable tax position"))
        assertEquals("Watchdog Score 72 out of 100, favorable tax position", TaxMath.scoreAccessibilityLabel(72, "Favorable tax position"))
    }

    @Test
    fun `bands confidence and composite`() {
        assertEquals(listOf(0, 1, 2, 3, 4), listOf(39, 54, 69, 84, 85).map { TaxMath.bandIndex(it) })
        assertEquals("70–84", TaxMath.bandLabel(72))
        assertNull(TaxMath.bandLabel(null))
        assertEquals("high", TaxMath.confidenceFor(92))
        assertEquals("medium", TaxMath.confidenceFor(60))
        assertEquals("low", TaxMath.confidenceFor(59))
        val dims = listOf(
            RobustDimension('R', "Recourse", 78), RobustDimension('O', "Overassessment", 81), RobustDimension('B', "Burden", 58),
            RobustDimension('U', "Uniformity", 70), RobustDimension('S', "Stability", 76), RobustDimension('T', "Trajectory", 63),
        )
        // The mockup's illustrative dimensions weigh to 70 under the backend weights; the mockup's headline 72 comes from the backend.
        assertEquals(70, TaxMath.compositeScore(dims))
        assertEquals(100, TaxMath.evidenceCoverage(dims))
        assertEquals(70, TaxMath.evidenceCoverage(dims.filter { it.letter != 'O' && it.letter != 'T' }))
        assertNull(TaxMath.compositeScore(emptyList()))
        assertEquals(372_800, TaxMath.roundToHundred(372_833.2))
        assertEquals(428_800, TaxMath.roundToHundred(428_758.2))
    }
}
