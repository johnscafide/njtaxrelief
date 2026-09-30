package com.watchdogindex.agent.navigation

import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.tab

/**
 * String routes for Navigation Compose, one per [Route]. Pure Kotlin so unit tests can run it on the JVM.
 *
 * Argument values are percent-encoded with [encode] (RFC 3986 unreserved characters pass through, everything
 * else becomes %XX), which is what Navigation's deep-link matcher decodes with Uri.decode. A PAMS PIN such as
 * "0409_285.14_9" survives untouched; a listing URL in `scan?url=` is fully escaped.
 *
 * Clients takes an optional `filter` (a [ClientFilter.key], the web's `clients?filter=checkup`); the bare
 * "clients" route still works and opens the tab on its own state.
 */
object RouteNames {
    const val WELCOME = "welcome"
    const val TODAY = "today"
    const val CLIENTS = "clients?filter={filter}"
    const val FARM = "farm"
    const val MARKETING = "marketing"
    const val PROPERTY = "property/{pin}"
    const val SCAN = "scan?url={url}"
    const val INTELLIGENCE = "intelligence"
    const val ALERTS = "alerts"
    const val SETTINGS = "settings"
    const val SEARCH = "search?q={q}"

    const val ARG_PIN = "pin"
    const val ARG_URL = "url"
    const val ARG_QUERY = "q"
    const val ARG_FILTER = "filter"

    /** The Clients tab's route without arguments, the one tab switches navigate to. */
    const val CLIENTS_BARE = "clients"

    /** The concrete route string to navigate to for [route]. */
    fun of(route: Route): String = when (route) {
        Route.Welcome -> WELCOME
        Route.Today -> TODAY
        is Route.Clients -> route.filter?.let { "$CLIENTS_BARE?$ARG_FILTER=${encode(it.key)}" } ?: CLIENTS_BARE
        Route.Farm -> FARM
        Route.Marketing -> MARKETING
        is Route.Property -> "property/${encode(route.pin)}"
        is Route.Scan -> route.initialUrl?.let { "scan?url=${encode(it)}" } ?: "scan"
        Route.Intelligence -> INTELLIGENCE
        Route.Alerts -> ALERTS
        Route.Settings -> SETTINGS
        is Route.Search -> if (route.query.isEmpty()) "search" else "search?q=${encode(route.query)}"
    }

    /** The route pattern (as registered in the NavHost) that [route] belongs to. */
    fun patternOf(route: Route): String = when (route) {
        Route.Welcome -> WELCOME
        Route.Today -> TODAY
        is Route.Clients -> CLIENTS
        Route.Farm -> FARM
        Route.Marketing -> MARKETING
        is Route.Property -> PROPERTY
        is Route.Scan -> SCAN
        Route.Intelligence -> INTELLIGENCE
        Route.Alerts -> ALERTS
        Route.Settings -> SETTINGS
        is Route.Search -> SEARCH
    }

    /** True for the four navigation-bar destinations (with or without arguments), which are navigated with the tab-switch options. */
    fun isTabRoute(route: Route): Boolean = route.tab() != null

    /** The [ClientFilter] a Clients route string carries ("clients?filter=checkup"), or null for the bare route or an unknown key. */
    fun clientFilterOf(filterArg: String?): ClientFilter? = ClientFilter.fromKey(filterArg?.let(::decode))

    private const val UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    private const val HEX = "0123456789ABCDEF"

    /** Percent-encodes [value] for use inside a route string. */
    fun encode(value: String): String {
        val out = StringBuilder(value.length + 8)
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val c = byte.toInt() and 0xFF
            if (c < 0x80 && UNRESERVED.indexOf(c.toChar()) >= 0) {
                out.append(c.toChar())
            } else {
                out.append('%').append(HEX[c shr 4]).append(HEX[c and 0x0F])
            }
        }
        return out.toString()
    }

    /** Reverses [encode]. Malformed escapes are kept literally rather than throwing. */
    fun decode(value: String): String = percentDecode(value, plusIsSpace = false)
}

/** Percent-decoding shared by [RouteNames] and [IntentRoutes]. */
internal fun percentDecode(value: String, plusIsSpace: Boolean): String {
    if (value.indexOf('%') < 0 && (!plusIsSpace || value.indexOf('+') < 0)) return value
    val bytes = java.io.ByteArrayOutputStream(value.length)
    var i = 0
    while (i < value.length) {
        val c = value[i]
        when {
            c == '%' && i + 2 < value.length -> {
                val hi = Character.digit(value[i + 1], 16)
                val lo = Character.digit(value[i + 2], 16)
                if (hi >= 0 && lo >= 0) {
                    bytes.write((hi shl 4) or lo)
                    i += 3
                } else {
                    bytes.write(c.code)
                    i++
                }
            }
            c == '+' && plusIsSpace -> { bytes.write(' '.code); i++ }
            else -> {
                val encoded = c.toString().toByteArray(Charsets.UTF_8)
                bytes.write(encoded, 0, encoded.size)
                i++
            }
        }
    }
    return bytes.toString(Charsets.UTF_8.name())
}
