package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Watchdog Intelligence (gap-answers.md "Weekly Watchdog Intelligence brief"; site-api-contracts.md 3.10-3.11):
 *
 * - `POST {siteOrigin}/api/watchdog-intelligence-analyst` `{prompt, session_id?, context?, command_confirmation?}`.
 *   The route classifies the prompt under the command policy first (403 prohibited, 409 confirmation required),
 *   then forwards to the `intelligence-analyst` edge function, which gates on Pro or higher, or Agent with the
 *   Watchdog Intelligence add-on (403 `{error, minimum_plan:'pro', feature_key:'watchdog_intelligence'}`).
 * - `intelligence_saved_briefs` (owner-readable): the last "30-second professional brief" the analyst saved.
 * - `POST {siteOrigin}/api/watchdog-intelligence-voice` `{action:'status'}`: never 403s and reports `addon_active`,
 *   the one place an Agent-plan account can learn whether the add-on is on.
 */
class IntelligenceApi(private val site: SiteApi, private val rest: SupabaseRest) {

    /** The analyst's `response` object; `cards` only exist for the model-run tool. */
    @Serializable
    data class AnalystResponse(
        val conclusion: String = "",
        val cards: List<Card> = emptyList(),
        val evidence: List<JsonElement> = emptyList(),
        @SerialName("missing_evidence") val missingEvidence: List<JsonElement> = emptyList(),
        val caveats: List<JsonElement> = emptyList(),
        @SerialName("suggested_actions") val suggestedActions: List<String> = emptyList(),
        val sources: List<JsonElement> = emptyList(),
    ) {
        fun sourceLabels(): List<String> = sources.mapNotNull { s ->
            when (s) {
                is JsonObject -> s.str("label") ?: s.str("title") ?: s.str("url")
                is JsonPrimitive -> s.contentOrNullSafe()
                else -> null
            }
        }.filter { it.isNotBlank() }.distinct()

        fun texts(list: List<JsonElement>): List<String> = list.mapNotNull { e ->
            when (e) {
                is JsonObject -> e.str("text") ?: e.str("label") ?: e.str("title")
                is JsonPrimitive -> e.contentOrNullSafe()
                else -> null
            }
        }.filter { it.isNotBlank() }
    }

    @Serializable
    data class Card(
        @SerialName("pams_pin") val pamsPin: String? = null,
        val address: String? = null,
        val score: Double? = null,
        val confidence: Double? = null,
        @SerialName("evidence_coverage") val evidenceCoverage: Double? = null,
        val priority: String? = null,
        val reason: String? = null,
        val also: String? = null,
        val gap: String? = null,
        @SerialName("confidence_label") val confidenceLabel: String? = null,
    )

    @Serializable
    data class AnalystResult(
        val ok: Boolean = true,
        @SerialName("session_id") val sessionId: String? = null,
        val status: String? = null,
        @SerialName("provider_status") val providerStatus: String? = null,
        val response: AnalystResponse? = null,
        @SerialName("access_path") val accessPath: String? = null,
    )

    data class SavedBrief(val response: AnalystResponse, val propertyCount: Int, val createdAt: String?)

    data class VoiceStatus(val enabled: Boolean, val eligible: Boolean, val addonActive: Boolean, val plan: String?, val packaging: String?)

    /** Asks the analyst. Plan, policy and limit answers become friendly exceptions; refusals and tool failures come back as results. */
    suspend fun ask(prompt: String, pins: List<String>, sessionId: String? = null, saveBrief: Boolean = false, confirmation: String? = null): AnalystResult {
        val body = buildJsonObject {
            put("prompt", prompt.trim().take(1800))
            if (sessionId != null) put("session_id", sessionId)
            if (confirmation != null) put("command_confirmation", confirmation)
            put("context", buildJsonObject {
                put("pams_pins", buildJsonArray { pins.take(100).forEach { add(JsonPrimitive(it)) } })
                put("profession", "agent")
                if (saveBrief) put("save_brief", true)
            })
        }
        val response = site.post("/api/watchdog-intelligence-analyst", body)
        val status = response.status.value
        val json = response.jsonBody()
        val obj = json as? JsonObject
        when (status) {
            in 200..299 -> return WatchdogHttp.json.decodeFromJsonElement(AnalystResult.serializer(), json)
            401 -> throw NotSignedInException()
            403 -> {
                if (obj?.containsKey("command_policy") == true) {
                    throw WatchdogException("Blocked by command policy", userMessage = obj.str("message") ?: "Watchdog will not run that command.")
                }
                throw PlanRequiredException("Watchdog Intelligence")
            }
            409 -> throw WatchdogHttp.failure(status, obj, feature = "Watchdog Intelligence")
            429 -> throw WatchdogHttp.failure(status, obj, feature = "Watchdog Intelligence")
            else -> throw WatchdogHttp.failure(status, obj, feature = "Watchdog Intelligence")
        }
    }

    /** The saved brief row, or null when the account never completed a brief. */
    suspend fun savedBrief(): SavedBrief? {
        val row = rest.maybeSingle("intelligence_saved_briefs", "payload,property_count,created_at", emptyList(), feature = "brief") ?: return null
        val response = row.obj("payload")?.obj("response") ?: return null
        val parsed = runCatching { WatchdogHttp.json.decodeFromJsonElement(AnalystResponse.serializer(), response) }.getOrNull() ?: return null
        return SavedBrief(parsed, row.int("property_count") ?: 0, row.str("created_at"))
    }

    suspend fun voiceStatus(): VoiceStatus {
        val obj = site.postJson("/api/watchdog-intelligence-voice", buildJsonObject { put("action", "status") }, feature = "Watchdog Intelligence Voice")
        return VoiceStatus(
            enabled = obj.bool("enabled") ?: false,
            eligible = obj.bool("eligible") ?: false,
            addonActive = obj.bool("addon_active") ?: false,
            plan = obj.str("plan"),
            packaging = obj.str("packaging"),
        )
    }

    companion object {
        const val BRIEF_PROMPT = "Give me a 30-second professional brief."

        /** The web's upsell copy for an Agent account without the add-on. */
        const val ADD_ON_COPY = "Your Agent plan can use Watchdog Intelligence when the Watchdog Intelligence add-on is active. It is included with Pro+ and Teams."
    }
}

private fun JsonPrimitive.contentOrNullSafe(): String? = if (isString) content else content.takeIf { it != "null" }
