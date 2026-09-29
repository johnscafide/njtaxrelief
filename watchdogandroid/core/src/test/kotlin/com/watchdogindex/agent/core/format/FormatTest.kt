package com.watchdogindex.agent.core.format

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FormatTest {

    @Test
    fun money() {
        assertEquals("\$11,284", Format.money(11_284))
        assertEquals("\$455,000", Format.money(455_000))
        assertEquals("\$0", Format.money(0))
        assertEquals("-\$612", Format.money(-612))
        assertEquals("\$1,234,567", Format.money(1_234_567L))
        assertEquals("\$978", Format.money(977.5))
        assertEquals("\$3,388", Format.money(3_387.89))
        assertEquals("median \$455,000", Format.medianMoney(455_000))
        assertEquals("+\$612", Format.signedMoney(612))
        assertEquals("-\$380", Format.signedMoney(-380))
        assertEquals("up \$612", Format.moneyChange(612))
        assertEquals("down \$380", Format.moneyChange(-380))
        assertEquals("unchanged", Format.moneyChange(0))
    }

    @Test
    fun compactMoney() {
        assertEquals("\$455K", Format.moneyCompact(455_000))
        assertEquals("\$373k", Format.moneyCompact(372_800, lowercase = true))
        assertEquals("\$300k", Format.moneyCompact(300_000, lowercase = true))
        assertEquals("\$1.3M", Format.moneyCompact(1_250_000))
        assertEquals("\$2M", Format.moneyCompact(2_000_000))
        assertEquals("\$980", Format.moneyCompact(980))
        // The unit is picked after rounding: a $1M home never reads "$1000K".
        assertEquals("\$999K", Format.moneyCompact(999_499))
        assertEquals("\$1M", Format.moneyCompact(999_500))
        assertEquals("\$1M", Format.moneyCompact(999_600))
        assertEquals("\$1M", Format.moneyCompact(1_000_000))
        assertEquals("\$1.1M", Format.moneyCompact(1_050_000))
        assertEquals("-\$1M", Format.moneyCompact(-999_900))
    }

    @Test
    fun numbersAndPercents() {
        assertEquals("1,980", Format.number(1_980))
        assertEquals("146", Format.number(146))
        assertEquals("61%", Format.percent(61.2))
        assertEquals("5.1%", Format.percent(5.1, 1))
        assertEquals("+2.4%", Format.signedPercent(2.4005, 1))
        assertEquals("-1.0%", Format.signedPercent(-1.0, 1))
        assertEquals("\$4.470", Format.ratePer100(4.47))
        assertEquals("\$2.078", Format.ratePer100(2.078))
        assertEquals("1,980 sq ft", Format.sqFt(1_980))
        assertEquals("0.28 acres", Format.acres(0.28))
        assertEquals("1.5 acres", Format.acres(1.5))
        assertEquals("1 acre", Format.acres(1.0))
        assertEquals("4.300", Format.fixed(4.3, 3))
        assertEquals("70", Format.fixed(70.38, 0))
    }

    @Test
    fun counts() {
        assertEquals("146", Format.compactCount(146))
        assertEquals("1.2K", Format.compactCount(1_234))
        assertEquals("12K", Format.compactCount(12_345))
        assertEquals("1.3M", Format.compactCount(1_300_000))
        assertEquals("Seven", Format.countWord(7))
        assertEquals("seven", Format.countWord(7, capitalize = false))
        assertEquals("21", Format.countWord(21))
        assertEquals("1:52", Format.duration(112))
        assertEquals("0:05", Format.duration(5))
        assertEquals("12 tax checkups", Format.count(12, "tax checkup"))
        assertEquals("1 tax checkup", Format.count(1, "tax checkup"))
        assertEquals("0 sales", Format.count(0, "sale"))
        assertEquals("1,234 homes", Format.count(1_234, "home"))
        assertEquals("3 properties", Format.count(3, "property", "properties"))
    }

    @Test
    fun parcels() {
        assertEquals("Block 285.14, Lot 9", Format.blockLot("285.14", "9"))
        assertEquals("Block 285.14, Lot 9, Qual C0012", Format.blockLot("285.14", "9", "C0012"))
        assertEquals("285.14 · 9", Format.blockLotShort("285.14", "9"))
        val parts = Format.parsePin("0409_285.14_9")
        assertEquals(Format.PinParts("0409", "285.14", "9", null), parts)
        assertEquals("C0012", Format.parsePin("0409_285.14_9_C0012")?.qualifier)
        assertNull(Format.parsePin("not-a-pin"))
        assertNull(Format.parsePin("409_285_9"))
    }

    @Test
    fun dates() {
        val monday = LocalDate(2026, 9, 28)
        assertEquals("Monday, September 28", Format.longDate(monday))
        assertEquals("Monday, September 28, 2026", Format.longDateWithYear(monday))
        assertEquals("Mon, Sep 28", Format.shortDate(monday))
        assertEquals("Sep 2026", Format.monthYear(monday))
        assertEquals("since Sep 21", Format.since(LocalDate(2026, 9, 21)))
        assertEquals("since January", Format.sinceMonth(LocalDate(2026, 1, 1)))
        assertEquals("since Jan 2026", Format.sinceMonthYear(LocalDate(2026, 1, 1)))
        assertEquals("mails Oct 6", Format.mails(LocalDate(2026, 10, 6)))
        assertEquals("sent Sep 21", Format.sent(LocalDate(2026, 9, 21)))
        assertEquals("April 1, 2027", Format.monthDayYear(LocalDate(2027, 4, 1)))
        assertEquals("8:00 AM", Format.time12h(8))
        assertEquals("12:00 PM", Format.time12h(12))
        assertEquals("12:30 AM", Format.time12h(0, 30))
        assertEquals("9 PM", Format.hourLabel(21))
        assertEquals("7 AM", Format.hourLabel(7))
        assertEquals("Sunday", Format.weekday(LocalDate(2026, 9, 27)))
    }
}
