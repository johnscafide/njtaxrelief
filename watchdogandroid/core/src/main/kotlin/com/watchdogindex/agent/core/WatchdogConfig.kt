package com.watchdogindex.agent.core

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

    companion object {
        const val PRODUCTION_SITE_ORIGIN = "https://www.watchdogindex.com"
        const val PRODUCTION_SUPABASE_URL = "https://uvkvaxljhhngydvlrzom.supabase.co"
        const val PRODUCTION_SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2a3ZheGxqaGhuZ3lkdmxyem9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Mzg0NjYsImV4cCI6MjA5NzIxNDQ2Nn0.5rTHWQk_4VXDChiU0wOW2BXmTNO-oYjBhUQzFtmA1Wg"
        val Production = WatchdogConfig()
    }
}

/** Thrown by repositories for anything the UI should show as a friendly error. */
open class WatchdogException(message: String, cause: Throwable? = null, val userMessage: String = message) : Exception(message, cause)
class NotSignedInException : WatchdogException("Not signed in", userMessage = "Sign in to continue.")
class PlanRequiredException(val feature: String) : WatchdogException("Agent plan required for $feature", userMessage = "This is part of the Agent plan.")
class NetworkException(cause: Throwable? = null) : WatchdogException("Network error", cause, "Can't reach Watchdog right now. Check your connection and try again.")
