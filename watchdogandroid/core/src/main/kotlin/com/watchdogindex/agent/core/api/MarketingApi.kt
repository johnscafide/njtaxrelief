package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Campaigns from the two marketing back ends the desk uses (agent-desk-web-reference.md 5.2-5.3):
 *
 * - Postcards: `rpc marketing_studio_bootstrap()` lists the account's campaigns (it also is the Agent gate: it
 *   raises "Marketing Studio requires Agent or higher"); `pcm-postcard-studio {action:'status', campaign_id}` gives
 *   one campaign's design/proof/order state, with the order status vocabulary of `postcard-studio.js:13`.
 * - Email updates: the gateway is the edge function `tmp-boldtrail-probe` (the slot is reused; it is the
 *   newsletter provider gateway). `{action:'email.status'}` returns `recent_broadcasts[]` with Kit stats.
 */
class MarketingApi(private val rest: SupabaseRest, private val edge: EdgeFunctions) {

    @Serializable
    data class CampaignRow(
        val id: String,
        val name: String? = null,
        val goal: String? = null,
        val status: String? = null,
        @SerialName("audience_count") val audienceCount: Double? = null,
        @SerialName("payment_status") val paymentStatus: String? = null,
        @SerialName("automation_state") val automationState: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    )

    @Serializable
    data class PostcardStatus(
        val environment: String? = null,
        val campaign: CampaignRef? = null,
        val design: JsonObject? = null,
        val proof: JsonObject? = null,
        @SerialName("proof_review") val proofReview: JsonObject? = null,
        val recipients: Recipients? = null,
        val order: Order? = null,
    ) {
        /** A proof exists and nobody has approved it yet: the "approve the postcard" task. */
        val needsApproval: Boolean get() = proof != null && proofReview?.str("status") != "approved" && order == null
    }

    @Serializable
    data class CampaignRef(val id: String? = null, val name: String? = null, val status: String? = null)

    @Serializable
    data class Recipients(val total: Double? = null, val valid: Double? = null)

    @Serializable
    data class Order(
        val status: String? = null,
        @SerialName("order_id") val orderId: String? = null,
        @SerialName("recipient_count") val recipientCount: Double? = null,
        @SerialName("submitted_at") val submittedAt: String? = null,
        @SerialName("cancel_deadline") val cancelDeadline: String? = null,
        val cancelable: Boolean = false,
    )

    @Serializable
    data class Broadcast(
        val id: String,
        val status: String? = null,
        val subject: String? = null,
        @SerialName("send_at") val sendAt: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
        val stats: BroadcastStats? = null,
        @SerialName("target_definition") val target: JsonObject? = null,
    )

    @Serializable
    data class BroadcastStats(
        val recipients: Double? = null,
        @SerialName("open_rate") val openRate: Double? = null,
        @SerialName("click_rate") val clickRate: Double? = null,
        val unsubscribes: Double? = null,
    )

    /** Postcard campaigns, archived and deleted ones removed as the studio does. */
    suspend fun postcardCampaigns(): List<CampaignRow> {
        val bootstrap = try {
            rest.rpc("marketing_studio_bootstrap", feature = "Marketing Studio").asJsonObjectOr()
        } catch (e: HttpFailureException) {
            if (e.serverError?.contains("requires Agent", ignoreCase = true) == true) throw PlanRequiredException("Marketing Studio")
            throw e
        }
        val rows = DigestApi.decode(bootstrap.arr("campaigns") ?: JsonArray(emptyList()), CampaignRow.serializer())
        return rows.filter { it.status != "archived" && it.status != "deleted" }
    }

    suspend fun postcardStatus(campaignId: String): PostcardStatus {
        val response = edge.post("pcm-postcard-studio", buildJsonObject { put("action", "status"); put("campaign_id", campaignId) }, feature = "Postcard Studio")
        return WatchdogHttp.json.decodeFromJsonElement(PostcardStatus.serializer(), response)
    }

    /** Recent Kit broadcasts. A 403 means the plan does not include email updates; it is thrown as [PlanRequiredException]. */
    suspend fun emailBroadcasts(): List<Broadcast> {
        val response = edge.post("tmp-boldtrail-probe", buildJsonObject { put("action", "email.status") }, feature = "Email updates")
        return DigestApi.decode(response.arr("recent_broadcasts") ?: JsonArray(emptyList()), Broadcast.serializer())
    }

    companion object {
        /** `STATUS` from `postcard-studio.js:13`: order status -> label. */
        val ORDER_STATUS_LABELS: Map<String, String> = mapOf(
            "submitted" to "Sent to print", "pending" to "Waiting to print", "processing" to "Printing", "mailed" to "In the mail",
            "delivered" to "Delivered", "completed" to "Delivered", "canceled" to "Canceled", "failed" to "Needs attention",
            "awaiting_live_enable" to "Paid, waiting for mail launch", "awaiting_provider_credentials" to "Paid, waiting for mail launch",
            "queued" to "Queued", "submitting" to "Sending",
        )

        /** Newsletter studio status words (`#eu-words`). */
        val BROADCAST_STATUS_LABELS: Map<String, String> = mapOf(
            "draft" to "Draft in Kit", "scheduled" to "Scheduled", "sending" to "Sending", "sent" to "Sent", "canceled" to "Canceled", "error" to "Needs attention",
        )

        /** Campaign row statuses as the desk shows them; unknown values are title-cased. */
        fun campaignStatusLabel(status: String?): String = when (status?.lowercase()) {
            null, "", "draft" -> "Draft"
            "active", "approved", "ready" -> "Approved"
            "scheduled" -> "Scheduled"
            "paused" -> "Paused"
            "completed", "mailed", "delivered" -> "Mailed"
            "canceled" -> "Canceled"
            else -> status.replace('_', ' ').replaceFirstChar { it.uppercaseChar() }
        }

        /** Kit's `open_rate` is formatted as an already-percent number, as the web does (`Math.round(n*10)/10 + '%'`). */
        fun percentLabel(value: Double): String {
            val rounded = Math.round(value * 10) / 10.0
            return if (rounded == Math.floor(rounded)) "${rounded.toLong()}%" else "$rounded%"
        }
    }
}

/** The email gateway said the account is on the free plan. */
class EmailUpdatesUnavailable : WatchdogException("Email updates unavailable", userMessage = "Email updates and CRM sync are part of the Agent plan and up.")
