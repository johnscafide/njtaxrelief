package com.watchdogindex.agent.core.format

import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.isoDayNumber
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Display formatting for the app. Everything here is deterministic and locale-independent (US English,
 * the only language the product ships in), so previews, screenshots and tests render the same strings
 * on every machine. Money is always whole dollars with thousands separators, matching the website.
 */
object Format {

    // ---------------------------------------------------------------- money

    /** "$11,284". Negative amounts read "-$612". */
    fun money(amount: Long): String = (if (amount < 0) "-" else "") + "$" + group(abs(amount))

    fun money(amount: Int): String = money(amount.toLong())

    /** Rounds to whole dollars first, half up, the way the website's `money()` helper does. */
    fun money(amount: Double): String = money(amount.roundToLong())

    /**
     * Compact money for tight spaces: "$455K", "$1.3M", "$980". Rounds to the nearest thousand, so
     * $372,800 reads "$373K". The unit is chosen after rounding: anything from $999,500 up is millions, so a
     * $1M home reads "$1M", never "$1000K". [lowercase] gives the value-line style used on the property page ("$455k").
     */
    fun moneyCompact(amount: Long, lowercase: Boolean = false): String {
        val sign = if (amount < 0) "-" else ""
        val v = abs(amount)
        val body = when {
            v >= 999_500 -> trimZeros(fixed(v / 1_000_000.0, 1)) + "M"
            v >= 1_000 -> ((v + 500) / 1_000).toString() + "K"
            else -> v.toString()
        }
        val text = sign + "$" + body
        return if (lowercase) text.lowercase() else text
    }

    fun moneyCompact(amount: Int, lowercase: Boolean = false): String = moneyCompact(amount.toLong(), lowercase)

    /** "median $455,000" */
    fun medianMoney(amount: Int): String = "median ${money(amount)}"

    /** "+$612" / "-$380" / "$0" */
    fun signedMoney(delta: Int): String = when {
        delta > 0 -> "+" + money(delta)
        delta < 0 -> money(delta)
        else -> money(0)
    }

    /** "up $612" / "down $380" / "unchanged", the wording used in chips and digest titles. */
    fun moneyChange(delta: Int): String = when {
        delta > 0 -> "up ${money(delta)}"
        delta < 0 -> "down ${money(-delta)}"
        else -> "unchanged"
    }

    // ---------------------------------------------------------------- numbers

    /** "1,980" */
    fun number(value: Long): String = (if (value < 0) "-" else "") + group(abs(value))

    fun number(value: Int): String = number(value.toLong())

    /** Fixed decimals, half up, never localized: fixed(4.47, 3) == "4.470". */
    fun fixed(value: Double, decimals: Int): String =
        BigDecimal(value.toString()).setScale(decimals, RoundingMode.HALF_UP).toPlainString()

    /** "61%" or, with decimals, "5.1%". */
    fun percent(value: Double, decimals: Int = 0): String = fixed(value, decimals) + "%"

    /** "+2.4%" / "-1.0%" */
    fun signedPercent(value: Double, decimals: Int = 1): String {
        val text = fixed(value, decimals)
        return (if (value > 0 && !text.startsWith("-")) "+" else "") + text + "%"
    }

    /** Tax rate per $100 of assessed value, three decimals like the state table: "$4.470". */
    fun ratePer100(rate: Double): String = "$" + fixed(rate, 3)

    /** "1,980 sq ft" */
    fun sqFt(value: Int): String = number(value) + " sq ft"

    /** "0.28 acres", "1.5 acres", "1 acre". */
    fun acres(value: Double): String {
        val text = trimZeros(fixed(value, 2))
        return text + if (text == "1") " acre" else " acres"
    }

    /** Compact counts for badges and tabs: "146", "1.2K", "12K", "1.3M". */
    fun compactCount(value: Int): String = when {
        value >= 1_000_000 -> trimZeros(fixed(value / 1_000_000.0, 1)) + "M"
        value >= 10_000 -> (value / 1_000).toString() + "K"
        value >= 1_000 -> trimZeros(fixed(value / 1_000.0, 1)) + "K"
        else -> value.toString()
    }

    /** Small counts in prose read as words: countWord(7) == "Seven". Above twelve, digits. */
    fun countWord(value: Int, capitalize: Boolean = true): String {
        val word = WORDS.getOrNull(value) ?: return value.toString()
        return if (capitalize) word.replaceFirstChar { it.uppercaseChar() } else word
    }

    /**
     * A count with its noun in the right number: count(12, "tax checkup") == "12 tax checkups", count(1, "sale") ==
     * "1 sale", count(0, "sale") == "0 sales". Pass [plural] for nouns that do not just take an "s".
     */
    fun count(value: Int, singular: String, plural: String = singular + "s"): String =
        "${number(value)} ${if (value == 1) singular else plural}"

    /** "1:52" for a listen button. */
    fun duration(totalSeconds: Int): String {
        val m = totalSeconds / 60
        val s = totalSeconds % 60
        return "$m:" + s.toString().padStart(2, '0')
    }

    // ---------------------------------------------------------------- parcels

    /** "Block 285.14, Lot 9" (with a qualifier: "Block 285.14, Lot 9, Qual C0012"). */
    fun blockLot(block: String, lot: String, qualifier: String? = null): String =
        "Block $block, Lot $lot" + (qualifier?.takeIf { it.isNotBlank() }?.let { ", Qual $it" } ?: "")

    /** "285.14 · 9", the compact form in the Home facts card. */
    fun blockLotShort(block: String, lot: String): String = "$block · $lot"

    data class PinParts(val district: String, val block: String, val lot: String, val qualifier: String?)

    /**
     * Splits a PAMS PIN ("0409_285.14_9" or "0409_285.14_9_C0012") into its parts. Returns null when the
     * string is not a PIN by the site's rule (four digits, underscore, block, underscore, lot).
     */
    fun parsePin(pin: String): PinParts? {
        val parts = pin.split('_')
        if (parts.size < 3 || parts[0].length != 4 || parts[0].any { !it.isDigit() }) return null
        if (parts[1].isBlank() || parts[2].isBlank()) return null
        return PinParts(parts[0], parts[1], parts[2], parts.getOrNull(3)?.takeIf { it.isNotBlank() })
    }

    // ---------------------------------------------------------------- dates

    /** "Monday, September 28" */
    fun longDate(date: LocalDate): String = "${weekday(date)}, ${monthName(date)} ${date.dayOfMonth}"

    /** "Monday, September 28, 2026" */
    fun longDateWithYear(date: LocalDate): String = longDate(date) + ", ${date.year}"

    /** "Mon, Sep 28" */
    fun shortDate(date: LocalDate): String = "${weekday(date).take(3)}, ${monthDay(date)}"

    /** "Sep 21" */
    fun monthDay(date: LocalDate): String = "${shortMonth(date)} ${date.dayOfMonth}"

    /** "Sep 2026" */
    fun monthYear(date: LocalDate): String = "${shortMonth(date)} ${date.year}"

    /** "April 1, 2027" */
    fun monthDayYear(date: LocalDate): String = "${monthName(date)} ${date.dayOfMonth}, ${date.year}"

    /** "since Sep 21" */
    fun since(date: LocalDate): String = "since ${monthDay(date)}"

    /** "since January" */
    fun sinceMonth(date: LocalDate): String = "since ${monthName(date)}"

    /** "since Jan 2026" */
    fun sinceMonthYear(date: LocalDate): String = "since ${monthYear(date)}"

    /** "mails Oct 6" */
    fun mails(date: LocalDate): String = "mails ${monthDay(date)}"

    /** "sent Sep 21" */
    fun sent(date: LocalDate): String = "sent ${monthDay(date)}"

    /** "8:00 AM" */
    fun time12h(hour: Int, minute: Int = 0): String {
        val h = when (hour % 12) { 0 -> 12; else -> hour % 12 }
        val suffix = if (hour % 24 < 12) "AM" else "PM"
        return "$h:" + minute.toString().padStart(2, '0') + " " + suffix
    }

    /** "9 PM", the quiet-hours style. */
    fun hourLabel(hour: Int): String {
        val h = when (hour % 12) { 0 -> 12; else -> hour % 12 }
        return "$h " + if (hour % 24 < 12) "AM" else "PM"
    }

    fun weekday(date: LocalDate): String = WEEKDAYS[date.dayOfWeek.isoDayNumber - 1]

    fun weekday(day: DayOfWeek): String = WEEKDAYS[day.isoDayNumber - 1]

    fun monthName(date: LocalDate): String = MONTHS[date.monthNumber - 1]

    fun shortMonth(date: LocalDate): String = MONTHS[date.monthNumber - 1].take(3)

    // ---------------------------------------------------------------- internals

    private fun group(value: Long): String {
        val digits = value.toString()
        val out = StringBuilder()
        for ((i, ch) in digits.withIndex()) {
            if (i > 0 && (digits.length - i) % 3 == 0) out.append(',')
            out.append(ch)
        }
        return out.toString()
    }

    private fun trimZeros(text: String): String =
        if (text.contains('.')) text.trimEnd('0').trimEnd('.') else text

    private val WEEKDAYS = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    private val MONTHS = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )
    private val WORDS = listOf(
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    )
}
