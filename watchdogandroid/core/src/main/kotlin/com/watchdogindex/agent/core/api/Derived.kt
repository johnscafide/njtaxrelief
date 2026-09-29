package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.format.Format
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.minus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs

/**
 * Small calculations and text rules the live data layer needs that are not (yet) in `core/math` or `core/format`:
 * the website's display helpers for the state's uppercase records (`api/watchdog-property-page.js:55-79`), the
 * MOD-IV deed-date parser the farm map needs for "sold in the last 12 months" (`workbench-hydrate/index.ts:12`),
 * the value-line axis rule the sample already uses, and the Monday week boundary in New Jersey time.
 *
 * Anything here that turns out to be shared with the sample or the UI should move into `core/format`/`core/math`
 * once those files are free; this file exists so the live layer does not edit them.
 */
object Derived {

    val NEW_JERSEY: TimeZone get() = TimeZone.of("America/New_York")

    /** The PAMS PIN syntax every site route validates: four digits, underscore, then block/lot/qualifier characters. */
    val PIN_REGEX = Regex("^\\d{4}_[0-9A-Za-z.&_-]{1,70}$")

    // ------------------------------------------------------------------ site display helpers

    private val ORDINAL = Regex("^\\d+(ST|ND|RD|TH)$", RegexOption.IGNORE_CASE)
    private val DIRECTIONS = setOf("N", "S", "E", "W", "NE", "NW", "SE", "SW")
    private val TOWN_WORDS = mapOf("TWP" to "Township", "BORO" to "Borough", "BOROUGH" to "Borough", "CITY" to "City", "TOWN" to "Town", "VILLAGE" to "Village")

    /** `titleCase`: "102 GRANT AVE" -> "102 Grant Ave"; ordinals lowercase ("1ST" -> "1st"); N/S/E/W stay uppercase; "-x" -> "-X". */
    fun titleCase(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val words = value.trim().split(Regex("\\s+")).map { w ->
            when {
                ORDINAL.matches(w) -> w.lowercase()
                w.length <= 2 && w.uppercase() in DIRECTIONS -> w.uppercase()
                else -> w.lowercase().replaceFirstChar { it.uppercaseChar() }
            }
        }
        return words.joinToString(" ").replace(Regex("-([a-z])")) { "-" + it.groupValues[1].uppercase() }
    }

    /** `townName`: "HARRISON TOWN" -> "Harrison Town", "ABERDEEN TWP" -> "Aberdeen Township". */
    fun townName(town: String?): String {
        if (town.isNullOrBlank()) return ""
        val parts = town.trim().uppercase().split(Regex("\\s+")).toMutableList()
        TOWN_WORDS[parts.last()]?.let { parts[parts.lastIndex] = it }
        return titleCase(parts.joinToString(" "))
    }

    /** "Cherry Hill Township" -> "Cherry Hill": the form medians and prose use ("Cherry Hill median"). */
    fun shortTownName(displayTown: String): String {
        val parts = displayTown.trim().split(' ').filter { it.isNotBlank() }
        if (parts.size <= 1) return displayTown.trim()
        val last = parts.last()
        val suffixes = setOf("Township", "Borough", "City", "Town", "Village", "Twp", "Boro")
        return if (last in suffixes) parts.dropLast(1).joinToString(" ") else displayTown.trim()
    }

    /** "HUDSON" -> "Hudson County". */
    fun countyName(county: String?): String {
        val clean = titleCase(county)
        if (clean.isEmpty()) return ""
        return if (clean.endsWith(" County")) clean else "$clean County"
    }

    /** The site's `slugify`: lowercase, `&` -> "and", non-alphanumerics -> "-", max 80 chars, fallback "nj". */
    fun slugify(value: String?): String {
        val s = (value ?: "").lowercase().replace("&", " and ").replace(Regex("[^a-z0-9]+"), "-").trim('-').take(80).trim('-')
        return s.ifEmpty { "nj" }
    }

    /** The canonical public path: `/nj/<town-slug>/<address-slug>/<pin>`. */
    fun propertyPath(rawTown: String, rawAddress: String, pin: String): String =
        "/nj/${slugify(townName(rawTown))}/${slugify(rawAddress)}/${java.net.URLEncoder.encode(pin, "UTF-8")}"

    /** NJ property class labels (`PROPERTY_CLASSES`, site-api-contracts.md 2.4). */
    private val PROPERTY_CLASSES = mapOf(
        "1" to "Vacant land", "2" to "Residential", "3A" to "Farm (regular)", "3B" to "Farmland (qualified)",
        "4A" to "Commercial", "4B" to "Industrial", "4C" to "Apartment", "5A" to "Railroad (Class I)", "5B" to "Railroad (Class II)",
        "6A" to "Telecommunications", "15A" to "Exempt: public school", "15B" to "Exempt: other school", "15C" to "Exempt: public property",
        "15D" to "Exempt: church and charitable", "15E" to "Exempt: cemetery", "15F" to "Exempt: other",
    )

    fun classLabel(propClass: String?): String? = propClass?.trim()?.uppercase()?.let { PROPERTY_CLASSES[it] }

    /** "2 · Residential" for the Home facts card; just the code when the label is unknown. */
    fun classLine(propClass: String?, label: String?): String {
        val code = propClass?.trim().orEmpty()
        val l = label ?: classLabel(code)
        return when {
            code.isEmpty() && l == null -> "Property"
            code.isEmpty() -> l!!
            l == null -> "Class $code"
            else -> "$code · $l"
        }
    }

    // ------------------------------------------------------------------ value line

    /**
     * The axis range for the value line: round the lowest anchor down to the hundred thousand below (minus $50k of
     * air) and the highest up to the hundred thousand above (plus $20k of air), never less than $100k wide. This is
     * the rule the sample set already draws with, so live and sample screens look the same.
     */
    fun valueLineRange(anchors: List<Int>): Pair<Int, Int> {
        val clean = anchors.filter { it > 0 }
        if (clean.isEmpty()) return 0 to 100_000
        val lo = (((clean.min() - 50_000) / 100_000) * 100_000).coerceAtLeast(0)
        var hi = ((clean.max() + 20_000 + 99_999) / 100_000) * 100_000
        if (hi <= lo) hi = lo + 100_000
        return lo to hi
    }

    // ------------------------------------------------------------------ dates

    /**
     * MOD-IV `DEED_DATE` strings, in the order the hydrate function tries them: `YYMMDD`, `MMDDYY`, `YYYYMMDD`,
     * `MMDDYYYY`, then a bare four-digit year. Calendar-invalid dates and dates after [today] are rejected; a
     * two-digit year is placed in 2000+ unless that lands in the future, then 1900+.
     */
    fun parseDeedDate(raw: String?, today: LocalDate): LocalDate? {
        val digits = raw?.filter { it.isDigit() } ?: return null
        fun valid(y: Int, m: Int, d: Int): LocalDate? {
            if (y !in 1800..today.year || m !in 1..12 || d !in 1..31) return null
            val date = runCatching { LocalDate(y, m, d) }.getOrNull() ?: return null
            return if (date > today) null else date
        }
        fun century(yy: Int): Int = if (2000 + yy > today.year) 1900 + yy else 2000 + yy
        when (digits.length) {
            6 -> {
                valid(century(digits.substring(0, 2).toInt()), digits.substring(2, 4).toInt(), digits.substring(4, 6).toInt())?.let { return it }
                valid(century(digits.substring(4, 6).toInt()), digits.substring(0, 2).toInt(), digits.substring(2, 4).toInt())?.let { return it }
            }
            8 -> {
                valid(digits.substring(0, 4).toInt(), digits.substring(4, 6).toInt(), digits.substring(6, 8).toInt())?.let { return it }
                valid(digits.substring(4, 8).toInt(), digits.substring(0, 2).toInt(), digits.substring(2, 4).toInt())?.let { return it }
            }
        }
        val year = Regex("(19|20)\\d{2}").find(raw)?.value?.toIntOrNull() ?: return null
        return if (year <= today.year) LocalDate(year, 1, 1) else null
    }

    /** Monday 00:00 in New Jersey for the week containing [now]. */
    fun weekStart(now: Instant, zone: TimeZone = NEW_JERSEY): LocalDate {
        var date = now.toLocalDateTime(zone).date
        while (date.dayOfWeek != DayOfWeek.MONDAY) date = date.minus(1, DateTimeUnit.DAY)
        return date
    }

    fun startOfDay(date: LocalDate, zone: TimeZone = NEW_JERSEY): Instant = date.atStartOfDayIn(zone)

    fun parseInstant(text: String?): Instant? = text?.let { runCatching { Instant.parse(it) }.getOrNull() ?: runCatching { LocalDateTime.parse(it).let { ldt -> ldt.toInstantUtc() } }.getOrNull() }

    private fun LocalDateTime.toInstantUtc(): Instant = this.toInstant(TimeZone.UTC)

    fun parseDate(text: String?): LocalDate? = text?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    /** "since January" when the first sale is this year, otherwise "since Jan 2025". */
    fun sinceLabel(firstDate: LocalDate?, today: LocalDate): String? = firstDate?.let {
        if (it.year == today.year) Format.sinceMonth(it) else Format.sinceMonthYear(it)
    }

    /** "now", "7:41 AM" (today), "Sun" (this week), else "Sep 21", the way the notification list labels time. */
    fun relativeTimeLabel(at: Instant, now: Instant, zone: TimeZone = NEW_JERSEY): String {
        val seconds = (now - at).inWholeSeconds
        if (seconds < 90) return "now"
        val local = at.toLocalDateTime(zone)
        val today = now.toLocalDateTime(zone).date
        return when {
            local.date == today -> Format.time12h(local.hour, local.minute)
            (today.toEpochDays() - local.date.toEpochDays()) < 7 -> Format.weekday(local.date).take(3)
            else -> Format.monthDay(local.date)
        }
    }

    // ------------------------------------------------------------------ score card text

    /**
     * One or two plain sentences under the verdict, written from the numbers the row actually has: whether the
     * assessment holds up against nearby sales, how the bill sits against the town median, then the coverage line.
     */
    fun scoreExplanation(holdsUp: Boolean?, billShareOfMedian: Double?, coveragePercent: Int?, confidence: String?): String {
        val first = when {
            holdsUp == false -> "The assessment is above its limit at today’s prices, so a tax checkup is worth sending."
            billShareOfMedian == null -> if (holdsUp == true) "The assessment holds up at today’s prices." else "Built from the public record for this parcel."
            abs(billShareOfMedian) <= 0.20 -> if (holdsUp == true) "The assessment holds up and the bill tracks the town." else "The bill tracks the town."
            billShareOfMedian > 0.20 -> if (holdsUp == true) "The assessment holds up, but the bill runs above the town median." else "The bill runs above the town median."
            else -> if (holdsUp == true) "The assessment holds up and the bill sits below the town median." else "The bill sits below the town median."
        }
        val coverage = coveragePercent?.let { " Evidence coverage $it%" + (confidence?.let { c -> ", $c confidence" } ?: "") + "." } ?: ""
        return first + coverage
    }
}
