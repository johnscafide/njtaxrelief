package com.watchdogindex.agent.navigation

import com.watchdogindex.agent.ui.nav.Route

/**
 * Turns an incoming intent into a [Route]. Everything here is plain Kotlin (no android.net.Uri) so the
 * mapping is unit-tested on the JVM; MainActivity feeds it the intent's action, data string, shared text and
 * the notification extras.
 *
 * Recognised inputs:
 * - ACTION_SEND text/plain: the first http(s) link in the text opens Scan (a shared listing); text without a
 *   link is passed through as the Scan input so the paste field is pre-filled.
 * - https://www.watchdogindex.com/nj/<town>/<address>/<pin>: the last path segment that is a PAMS PIN.
 * - /true-cost?pin=, /checkup?pin=: the PIN in the query. /scan?url= opens Scan with that link.
 * - watchdog://property/<pin>, watchdog://scan?url=, watchdog://<tab or screen>, watchdog://search?q=.
 * - Notification extras: `pin` and/or `route` (see [fromExtras] for the accepted route words, which include the
 *   server-side names `pulse` and `agent-desk` from the push proposal).
 */
object IntentRoutes {
    const val ACTION_SEND = "android.intent.action.SEND"
    const val ACTION_VIEW = "android.intent.action.VIEW"

    /** Notification / deep-link extras understood by MainActivity. */
    const val EXTRA_PIN = "com.watchdogindex.agent.extra.PIN"
    const val EXTRA_ROUTE = "com.watchdogindex.agent.extra.ROUTE"

    /** A PAMS PIN: four-digit county-town code, underscore, block/lot with dots, ampersands, underscores or dashes. */
    val PIN_REGEX = Regex("^\\d{4}_[0-9A-Za-z.&_-]{1,70}$")

    private val WATCHDOG_HOSTS = setOf("www.watchdogindex.com", "watchdogindex.com")
    private val URL_IN_TEXT = Regex("https?://[^\\s<>\"']+", RegexOption.IGNORE_CASE)

    /**
     * The single entry point MainActivity uses. Returns null when the intent is a plain launch or nothing in it
     * maps to a screen (the app then opens normally).
     */
    fun parse(action: String?, dataString: String?, sharedText: String?, extraPin: String?, extraRoute: String?): Route? {
        fromExtras(extraPin, extraRoute)?.let { return it }
        return when (action) {
            ACTION_SEND -> fromSharedText(sharedText)
            ACTION_VIEW -> dataString?.let { fromLink(it) }
            else -> dataString?.let { fromLink(it) }
        }
    }

    /** A shared listing link (or, failing a link, the shared text itself) opens Scan. */
    fun fromSharedText(text: String?): Route.Scan {
        val clean = text?.trim().orEmpty()
        if (clean.isEmpty()) return Route.Scan(null)
        val url = URL_IN_TEXT.find(clean)?.value?.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}')
        return Route.Scan(url ?: clean)
    }

    /** Maps a web or custom-scheme link to a route; null when it is not a link the app can show. */
    fun fromLink(raw: String): Route? {
        val link = parseLink(raw) ?: return null
        return when (link.scheme) {
            "https", "http" -> fromWebLink(link)
            "watchdog" -> fromCustomScheme(link)
            else -> null
        }
    }

    /**
     * Notification extras. [pin] alone opens the property; [route] words: today, clients, farm, marketing,
     * property (needs a pin), scan, intelligence, brief, alerts, settings, search, and the server names
     * pulse (a property event, needs a pin, otherwise the alerts list), agent-desk and digest (Today).
     */
    fun fromExtras(pin: String?, route: String?): Route? {
        val cleanPin = pin?.trim()?.takeIf { isPin(it) }
        val word = route?.trim()?.lowercase()?.removePrefix("/")?.substringBefore('?')?.substringBefore('/')
        return when (word) {
            null, "" -> cleanPin?.let { Route.Property(it) }
            "property", "nj", "true-cost", "checkup" -> cleanPin?.let { Route.Property(it) }
            "pulse" -> cleanPin?.let { Route.Property(it) } ?: Route.Alerts
            "today", "home", "digest", "agent-desk" -> Route.Today
            "clients", "checkups" -> Route.Clients
            "farm" -> Route.Farm
            "marketing" -> Route.Marketing
            "scan" -> Route.Scan(null)
            "intelligence", "brief" -> Route.Intelligence
            "alerts", "notifications" -> Route.Alerts
            "settings" -> Route.Settings
            "search" -> Route.Search("")
            else -> cleanPin?.let { Route.Property(it) }
        }
    }

    fun isPin(value: String?): Boolean = value != null && PIN_REGEX.matches(value)

    private fun fromWebLink(link: ParsedLink): Route? {
        if (link.host !in WATCHDOG_HOSTS) return null
        val segments = link.segments
        val first = segments.firstOrNull()?.lowercase()
        val queryPin = link.query["pin"]?.trim()?.takeIf { isPin(it) }
        return when (first) {
            "nj" -> {
                // /nj/<town>/<address>/<pin>; the PIN is always the last segment on property pages.
                val pin = segments.lastOrNull { isPin(it) } ?: queryPin
                pin?.let { Route.Property(it) }
            }
            "true-cost", "checkup" -> queryPin?.let { Route.Property(it) }
            "scan" -> Route.Scan(link.query["url"]?.trim()?.takeIf { it.isNotEmpty() })
            "property" -> (segments.getOrNull(1)?.takeIf { isPin(it) } ?: queryPin)?.let { Route.Property(it) }
            "search" -> Route.Search(link.query["q"]?.trim().orEmpty())
            else -> queryPin?.let { Route.Property(it) }
        }
    }

    private fun fromCustomScheme(link: ParsedLink): Route? {
        // watchdog://<target>/<args>: the "host" is the target word.
        val target = link.host.ifEmpty { link.segments.firstOrNull().orEmpty() }.lowercase()
        val args = if (link.host.isEmpty()) link.segments.drop(1) else link.segments
        return when (target) {
            "property", "nj" -> (args.lastOrNull { isPin(it) } ?: link.query["pin"]?.takeIf { isPin(it) })?.let { Route.Property(it) }
            "scan" -> Route.Scan(link.query["url"]?.trim()?.takeIf { it.isNotEmpty() })
            "search" -> Route.Search(link.query["q"]?.trim().orEmpty())
            else -> fromExtras(link.query["pin"], target)
        }
    }

    /** A minimal URL split: scheme, host (lower-cased, no port or userinfo), decoded path segments, decoded query. */
    internal data class ParsedLink(val scheme: String, val host: String, val segments: List<String>, val query: Map<String, String>)

    internal fun parseLink(raw: String): ParsedLink? {
        val trimmed = raw.trim()
        val schemeEnd = trimmed.indexOf(':')
        if (schemeEnd <= 0) return null
        val scheme = trimmed.substring(0, schemeEnd).lowercase()
        if (scheme.any { !(it.isLetterOrDigit() || it == '+' || it == '-' || it == '.') }) return null
        var rest = trimmed.substring(schemeEnd + 1).substringBefore('#')
        var host = ""
        if (rest.startsWith("//")) {
            rest = rest.substring(2)
            val end = rest.indexOfAny(charArrayOf('/', '?'))
            if (end < 0) { host = rest; rest = "" } else { host = rest.substring(0, end); rest = rest.substring(end) }
        }
        host = host.substringAfterLast('@').substringBefore(':').lowercase()
        val path = rest.substringBefore('?')
        val queryText = if (rest.contains('?')) rest.substringAfter('?') else ""
        val segments = path.split('/').filter { it.isNotEmpty() }.map { percentDecode(it, plusIsSpace = false) }
        val query = LinkedHashMap<String, String>()
        for (pair in queryText.split('&')) {
            if (pair.isEmpty()) continue
            val key = percentDecode(pair.substringBefore('='), plusIsSpace = true)
            val value = percentDecode(pair.substringAfter('=', ""), plusIsSpace = true)
            if (key.isNotEmpty() && !query.containsKey(key)) query[key] = value
        }
        return ParsedLink(scheme, host, segments, query)
    }
}
