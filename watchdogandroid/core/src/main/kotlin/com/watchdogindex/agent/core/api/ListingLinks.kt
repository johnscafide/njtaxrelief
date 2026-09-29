package com.watchdogindex.agent.core.api

import java.net.URI
import java.net.URLDecoder

/**
 * Turns what the agent pastes or scans into something the property route can look up. Two families:
 *
 * 1. Listing links (Zillow, Realtor.com, Redfin), parsed exactly as the browser extension's content script does
 *    (`extension/content.js:25-38`): only the detail-page shapes, and the address comes from the URL slug alone.
 *    - Zillow  `/homedetails/<num-street-town>-NJ-<zip>/<zpid>_zpid/`  -> "143 Harding Rd Red Bank NJ" (the slug
 *      does not separate street from town, so neither does the extension)
 *    - Realtor `/realestateandhomes-detail/<street>_<City>_NJ_<zip>_<id>` -> "12 Maple Ave, Haddonfield, NJ"
 *    - Redfin  `/NJ/<City>/<street>-<zip>/home/<id>`                     -> "143 Harding Rd, Red Bank, NJ"
 *    Plain text that contains one of those URLs is accepted too (a share sheet often adds words around the link).
 *
 * 2. Sign QR payloads, per the Scan research (gap-answers.md "Scan screen research" 2b): a Watchdog property or
 *    true-cost/checkup/home link carrying a PAMS PIN, a bare PIN, or a listing URL. Agent portal, open-house,
 *    campaign, marketing-track and report links are recognised as "not a property".
 */
object ListingLinks {

    enum class Site { Zillow, Realtor, Redfin }

    /** A listing address the way the extension sends it, plus the parts the slug gave away. */
    data class ListingAddress(
        val site: Site,
        /** The exact string to send as `?address=`: "143 Harding Rd Red Bank NJ" or "12 Maple Ave, Haddonfield, NJ". */
        val address: String,
        val houseNumber: String,
        /** Street words (Zillow slugs run the town into the street, so this may include the town). */
        val street: String,
        val town: String?,
        val state: String = "NJ",
        val zip: String?,
        val url: String,
    ) {
        /** "143 Harding Rd, Red Bank, NJ 07701" when the parts are known, else the extension string. */
        val display: String
            get() = if (town != null) listOfNotNull("$street, $town, $state", zip).joinToString(" ") else listOfNotNull(address, zip).joinToString(" ")
    }

    /** What a scanned or pasted payload turned out to be. */
    sealed interface Payload {
        /** A Watchdog link or bare PIN. [agentSlug] is preserved so attribution survives into the checkup/true-cost links. */
        data class Pin(val pin: String, val agentSlug: String?, val source: String) : Payload
        data class Listing(val listing: ListingAddress) : Payload
        /** Free text that looks like a street address (starts with a house number). */
        data class Address(val text: String) : Payload
        /** A Watchdog link that is not a property (agent page, open house, campaign, tracking, report). */
        data class NotAProperty(val reason: String, val url: String) : Payload
        data object Unrecognized : Payload
    }

    private val URL_IN_TEXT = Regex("(?:https?://|www\\.)[^\\s<>\"']+|(?:\\b(?:zillow|realtor|redfin|watchdogindex|njpropertytaxrelief)\\.com/[^\\s<>\"']+)", RegexOption.IGNORE_CASE)
    private val ZILLOW_SLUG = Regex("^(\\d[\\w-]*?)-NJ-(\\d{5})$", RegexOption.IGNORE_CASE)
    private val WATCHDOG_HOSTS = setOf("www.watchdogindex.com", "watchdogindex.com", "njpropertytaxrelief.com", "www.njpropertytaxrelief.com")

    /** `words()` from the extension: dashes become spaces, runs of whitespace collapse. */
    fun words(s: String?): String = (s ?: "").replace('-', ' ').replace(Regex("\\s+"), " ").trim()

    /** The first URL inside a block of text, normalised with a scheme; null when there is none. */
    fun findUrl(text: String): String? {
        val hit = URL_IN_TEXT.find(text)?.value?.trimEnd('.', ',', ')', ']') ?: return null
        return if (hit.startsWith("http", ignoreCase = true)) hit else "https://$hit"
    }

    /** Parses a listing link (or text containing one). Null when it is not a Zillow/Realtor/Redfin detail page. */
    fun parseListing(text: String): ListingAddress? {
        val url = findUrl(text.trim()) ?: return null
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val host = uri.host?.lowercase() ?: return null
        val seg = (uri.path ?: "").split('/').filter { it.isNotBlank() }.map { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) }
        if (host.matches(Regex("(^|.*\\.)zillow\\.com$"))) {
            if (seg.getOrNull(0) != "homedetails") return null
            val m = ZILLOW_SLUG.find(seg.getOrNull(1) ?: return null) ?: return null
            val slug = m.groupValues[1]
            return ListingAddress(Site.Zillow, words(slug) + " NJ", slug.substringBefore('-'), words(slug), null, "NJ", m.groupValues[2], url)
        }
        if (host.matches(Regex("(^|.*\\.)realtor\\.com$"))) {
            if (seg.getOrNull(0) != "realestateandhomes-detail") return null
            val parts = (seg.getOrNull(1) ?: return null).split('_')
            if (parts.getOrNull(2) != "NJ" || !parts[0].first().isDigit()) return null
            val street = words(parts[0])
            val town = words(parts[1])
            val zip = parts.getOrNull(3)?.takeIf { it.matches(Regex("\\d{5}")) }
            return ListingAddress(Site.Realtor, "$street, $town, NJ", parts[0].substringBefore('-'), street, town, "NJ", zip, url)
        }
        if (host.matches(Regex("(^|.*\\.)redfin\\.com$"))) {
            if (!seg.getOrNull(0).equals("NJ", ignoreCase = true)) return null
            val streetZip = seg.getOrNull(2) ?: return null
            if (!streetZip.first().isDigit()) return null
            if (!(seg.getOrNull(3).equals("home", ignoreCase = true) && seg.getOrNull(4)?.all { it.isDigit() } == true)) return null
            val zip = Regex("-(\\d{5})$").find(streetZip)?.groupValues?.get(1)
            val street = words(streetZip.replace(Regex("-\\d{5}$"), ""))
            val town = words(seg[1])
            return ListingAddress(Site.Redfin, "$street, $town, NJ", streetZip.substringBefore('-'), street, town, "NJ", zip, url)
        }
        return null
    }

    /** The PAMS PIN a Watchdog URL names, or null: `/nj/<town>/<address>/<pin>`, `/nj/property/<pin>`, `?pin=`, `?pams_pin=`. */
    fun pinInWatchdogUrl(url: String): Pair<String, String?>? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val host = uri.host?.lowercase() ?: return null
        if (host !in WATCHDOG_HOSTS) return null
        val query = queryMap(uri.rawQuery)
        val agent = query["agent"]?.lowercase()?.takeIf { it.matches(Regex("^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")) }
        (query["pin"] ?: query["pams_pin"])?.let { if (Derived.PIN_REGEX.matches(it)) return it to agent }
        val seg = (uri.path ?: "").split('/').filter { it.isNotBlank() }.map { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) }
        if (seg.size in 3..4 && seg[0].equals("nj", ignoreCase = true) && Derived.PIN_REGEX.matches(seg.last())) return seg.last() to agent
        return null
    }

    /** Classifies a QR payload or pasted text. */
    fun parsePayload(raw: String): Payload {
        val text = raw.trim()
        if (text.isEmpty()) return Payload.Unrecognized
        if (Derived.PIN_REGEX.matches(text)) return Payload.Pin(text, null, "pin")
        val url = findUrl(text)
        if (url != null) {
            pinInWatchdogUrl(url)?.let { (pin, slug) -> return Payload.Pin(pin, slug, "watchdog_link") }
            parseListing(url)?.let { return Payload.Listing(it) }
            val uri = runCatching { URI(url) }.getOrNull()
            val host = uri?.host?.lowercase()
            if (host != null && host in WATCHDOG_HOSTS) {
                val path = (uri.path ?: "").lowercase()
                val query = queryMap(uri.rawQuery)
                val reason = when {
                    path.startsWith("/agent/") -> "an agent page"
                    path.startsWith("/open-house") -> "an open house sign-in"
                    query.containsKey("campaign") -> "a mailing campaign link"
                    path.contains("marketing-track") -> "a tracking link"
                    path.startsWith("/report") && query.containsKey("token") -> "a report link"
                    else -> "a Watchdog page without a property"
                }
                return Payload.NotAProperty(reason, url)
            }
            return Payload.Unrecognized
        }
        if (text.first().isDigit() && text.contains(' ')) return Payload.Address(text)
        return Payload.Unrecognized
    }

    private fun queryMap(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrBlank()) return emptyMap()
        return rawQuery.split('&').mapNotNull { pair ->
            val k = pair.substringBefore('=')
            val v = pair.substringAfter('=', "")
            if (k.isBlank()) null else runCatching { URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8") }.getOrNull()
        }.toMap()
    }
}
