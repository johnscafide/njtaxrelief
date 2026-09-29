package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AuthSession
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The signed-in agent's own account: plan, profile and display name. Implements auth-and-account.md sections 6-9
 * and the live plan contract in gap-answers.md ("Live plan and entitlement contract"):
 *
 * - `rpc get_my_entitlement()` for display (plan tier already collapsed by status; developers read `developer`).
 * - `rpc has_watchdog_plan({required_plan:'agent'})` as the one authoritative Agent gate.
 * - `profiles` select of `display_name, full_name, vanity_slug, pro_agent, avatar_url` only. The `legal_*` and
 *   `mailing_*` columns are the member's own ANCHOR data and are never selected here.
 * - `GET /auth/v1/user` for `user_metadata.watchdog_profile.preferred_name` and `user_metadata.full_name`.
 */
class AccountApi(private val rest: SupabaseRest, private val auth: SupabaseAuthClient) {

    /** One row of `get_my_entitlement`. `billingTier`/`propertyCapacity` only exist on the live definition. */
    data class Entitlement(
        val planTier: String,
        val profession: String?,
        val subscriptionStatus: String,
        val currentPeriodEnd: String?,
        val accountRole: String,
        val billingTier: String?,
        val propertyCapacity: Int?,
    ) {
        /** The web's client rule (`access-guard.js:91-97`), kept only as a local hint; the server answer wins. */
        val looksLikeAgentPlan: Boolean
            get() = accountRole == "developer" || (subscriptionStatus in ACTIVE_STATUSES && planTier in AGENT_TIERS)
    }

    /** The agent's own profile row, minus everything the app must never read. */
    data class Profile(val displayName: String?, val fullName: String?, val vanitySlug: String?, val avatarUrl: String?, val proAgent: JsonObject?)

    /** `get_agent_usage()`: the plan name the quota trigger enforces and the capacity meters (never hard-code these numbers). */
    data class Usage(val plan: String, val limits: Map<String, Int>, val usage: Map<String, Int>, val remaining: Map<String, Int>)

    /** Zero rows means `auth.uid()` was null: the token is bad, not that the user is on the free plan. */
    suspend fun entitlement(): Entitlement {
        val rows = rest.rpc("get_my_entitlement", feature = "account") as? JsonArray
        val row = rows?.firstOrNull() as? JsonObject ?: throw NotSignedInException()
        return Entitlement(
            planTier = row.str("plan_tier") ?: "standard",
            profession = row.str("profession"),
            subscriptionStatus = row.str("subscription_status") ?: "none",
            currentPeriodEnd = row.str("current_period_end"),
            accountRole = row.str("account_role") ?: "user",
            billingTier = row.str("billing_tier"),
            propertyCapacity = row.int("property_capacity"),
        )
    }

    /** The server rule the agent tables' RLS uses; `required` is `agent`, `pro`, `pro_plus` or `teams`. */
    suspend fun hasPlan(required: String = "agent"): Boolean {
        val result = rest.rpc("has_watchdog_plan", buildJsonObject { put("required_plan", required) }, feature = "plan check")
        return result.boolOrNull() ?: false
    }

    suspend fun profile(userId: String): Profile? {
        val row = rest.maybeSingle("profiles", "id,display_name,full_name,vanity_slug,pro_agent,avatar_url", listOf("id" to "eq.$userId"), feature = "profile") ?: return null
        return Profile(row.str("display_name"), row.str("full_name"), row.str("vanity_slug"), row.str("avatar_url"), row.obj("pro_agent"))
    }

    suspend fun usage(): Usage {
        val obj = rest.rpc("get_agent_usage", feature = "plan capacity").asJsonObjectOr()
        fun ints(key: String) = obj.obj(key)?.mapNotNull { (k, v) -> v.intOrNull()?.let { k to it } }?.toMap() ?: emptyMap()
        return Usage(obj.str("plan") ?: "standard", ints("limits"), ints("usage"), ints("remaining"))
    }

    /** Everything the Account model needs, in the order the web resolves names (auth-and-account.md 7). */
    suspend fun account(session: AuthSession): Account {
        val entitlement = entitlement()
        val agent = runCatching { hasPlan("agent") }.getOrElse { if (it is NotSignedInException) throw it else entitlement.looksLikeAgentPlan }
        val profile = runCatching { profile(session.userId) }.getOrNull()
        val user = runCatching { auth.getUser(session.accessToken) }.getOrNull()
        val metadata = user?.obj("user_metadata")
        val watchdogProfile = metadata?.obj("watchdog_profile")
        val email = user?.str("email")?.takeIf { it.isNotBlank() } ?: session.email
        val displayName = listOfNotNull(
            watchdogProfile?.str("preferred_name"),
            profile?.displayName,
            profile?.fullName,
            metadata?.str("full_name"),
            metadata?.str("name"),
        ).map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: email.substringBefore('@').ifEmpty { "Watchdog agent" }
        val proAgent = profile?.proAgent
        return Account(
            userId = user?.str("id") ?: session.userId,
            email = email,
            displayName = displayName,
            brokerage = proAgent?.str("brokerage_name")?.takeIf { it.isNotBlank() },
            planLabel = planLabel(entitlement.planTier),
            planTier = entitlement.planTier,
            subscriptionStatus = entitlement.subscriptionStatus,
            isAgentPlan = agent,
            vanitySlug = profile?.vanitySlug?.takeIf { it.isNotBlank() },
            phone = proAgent?.str("business_phone")?.takeIf { it.isNotBlank() } ?: watchdogProfile?.str("phone")?.takeIf { it.isNotBlank() },
        )
    }

    companion object {
        val ACTIVE_STATUSES = setOf("active", "trialing", "past_due")
        val AGENT_TIERS = setOf("agent", "pro", "pro_plus", "pro+", "teams", "developer")

        /** The web's plan labels (`account.js:13-29`): Free, Agent, Pro, Pro+, Teams, Developer. */
        fun planLabel(planTier: String?): String = when (planTier?.lowercase()) {
            null, "", "standard" -> "Free"
            "agent" -> "Agent"
            "pro" -> "Pro"
            "pro_plus", "pro+" -> "Pro+"
            "teams" -> "Teams"
            "developer" -> "Developer"
            else -> planTier.replaceFirstChar { it.uppercaseChar() }
        }

        /** Rank order shared by every server gate: standard 0, agent 1, pro 2, pro_plus 3, teams 4, developer 5. */
        fun rank(planTier: String?): Int = when (planTier?.lowercase()) {
            "agent" -> 1; "pro" -> 2; "pro_plus", "pro+" -> 3; "teams" -> 4; "developer" -> 5; else -> 0
        }
    }
}

/** Thrown when a feature needs a plan the account does not have and the server said so before any data moved. */
class PlanGateException(feature: String) : WatchdogException("Plan gate: $feature", userMessage = "This is part of the Agent plan.")
