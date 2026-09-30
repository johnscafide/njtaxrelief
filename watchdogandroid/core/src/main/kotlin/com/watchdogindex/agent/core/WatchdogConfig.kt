package com.watchdogindex.agent.core

import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.model.Account
import java.net.URLEncoder

/**
 * Backend endpoints. The app is a new front end on the existing Watchdog backend: the production Supabase
 * project shared with the website and the site's own API routes on www.watchdogindex.com. The anon key is the
 * project's publishable client key (it is also in the website's JavaScript); it grants nothing without a user
 * session or row-level policies. Never put a service-role key here.
 */
data class WatchdogConfig(
    val supabaseUrl: String = PRODUCTION_SUPABASE_URL,
    val supabaseAnonKey: String = PRODUCTION_SUPABASE_ANON_KEY,
    val siteOrigin: String = PRODUCTION_SITE_ORIGIN,
) {
    val functionsBase: String get() = "$supabaseUrl/functions/v1"
    val restBase: String get() = "$supabaseUrl/rest/v1"
    val authBase: String get() = "$supabaseUrl/auth/v1"

    /** The public site pages this configuration links to (the agent's portal, the studio, the profile page). */
    val links: SiteLinks = SiteLinks(siteOrigin)

    companion object {
        const val PRODUCTION_SITE_ORIGIN = "https://www.watchdogindex.com"
        const val PRODUCTION_SUPABASE_URL = "https://uvkvaxljhhngydvlrzom.supabase.co"
        /** The publishable client key the production web clients send as `apikey`; the legacy JWT anon key is not used. */
        const val PRODUCTION_SUPABASE_ANON_KEY = "sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa"
        val Production = WatchdogConfig()
    }
}

/**
 * The public Watchdog pages the app links to or prints, on one site origin. Public Watchdog URLs are clean and
 * root-level (`/agent/<slug>`, `/account/professional-profile`, `/onboarding`, `/dashboard`, `/nj/<town>/<address>/<pin>`),
 * never under the `/property/` implementation tree, and never with a trailing slash, so every link a screen builds
 * comes from here rather than from a constant of its own.
 */
class SiteLinks(val origin: String) {
    private val base: String = origin.trimEnd('/')

    /** "watchdogindex.com": the site the way copy names it (no scheme, no `www.`). */
    val label: String = base.removePrefix("https://").removePrefix("http://").removePrefix("www.")

    /** Where a new agent creates their account on the web: the Welcome screen's "Create an account". */
    val onboarding: String = "$base/onboarding"

    /** The Agent Desk, the web home of a signed-in agent (the Settings screen's "Open on the web"). */
    val dashboard: String = "$base/dashboard"

    /** Where the agent chooses their vanity link: the professional profile page is the one that edits the slug. */
    val professionalProfile: String = "$base/account/professional-profile"

    /** The postcard studio, where mailing campaigns are designed and sent (the app only tracks them). */
    val postcardStudio: String = "$base/marketing-studio/postcards"

    /** The newsletter studio, the email campaigns' home. */
    val newsletterStudio: String = "$base/newsletter-studio"

    /** The agent's public portal, `/agent/<slug>`, the address the web page shares (`/agents/` is the trial landing page). */
    fun agentPage(slug: String): String = "$base/agent/${encodeSlug(slug)}"

    /** [agentPage] for a signed-in account, or null until the agent has chosen a vanity link. */
    fun agentPage(account: Account): String? = account.vanitySlug?.trim()?.takeIf { it.isNotEmpty() }?.let { agentPage(it) }

    /** "watchdogindex.com/agent/alex-moreno": the portal address as the My page tab prints it. */
    fun agentPageLabel(slug: String): String = "$label/agent/${encodeSlug(slug)}"

    /**
     * The public property page for a PIN alone: the site's short form `/nj/property/<pin>`, which the site answers
     * with a permanent redirect to the canonical `/nj/<town>/<address>/<pin>` (`api/watchdog-property-page.js`;
     * the web's own "copy link" builds this same short form). Prefer the overload with the town and address, which
     * lands on the canonical page directly, whenever a row or summary is at hand.
     */
    fun property(pin: String): String = "$base/nj/property/${URLEncoder.encode(pin.trim(), "UTF-8")}"

    /**
     * The canonical public property page, `/nj/<town-slug>/<address-slug>/<pin>`, the URL the property route's
     * `derived.links.property` and the web page share; [town] and [address] may be the raw MOD-IV strings or the
     * display ones. Falls back to [property] for a PIN when either is blank.
     */
    fun property(pin: String, town: String?, address: String?): String =
        if (town.isNullOrBlank() || address.isNullOrBlank()) property(pin) else base + Derived.propertyPath(town, address, pin.trim())

    private fun encodeSlug(slug: String): String = URLEncoder.encode(slug.trim().trim('/'), "UTF-8")
}

/** Thrown by repositories for anything the UI should show as a friendly error. */
open class WatchdogException(message: String, cause: Throwable? = null, val userMessage: String = message) : Exception(message, cause)
class NotSignedInException : WatchdogException("Not signed in", userMessage = "Sign in to continue.")
class PlanRequiredException(val feature: String) : WatchdogException("Agent plan required for $feature", userMessage = "This is part of the Agent plan.")
class NetworkException(cause: Throwable? = null) : WatchdogException("Network error", cause, "Can’t reach Watchdog right now. Check your connection and try again.")
