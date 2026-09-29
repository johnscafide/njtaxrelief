package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.Relationship
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Clients are `agent_farm_properties` rows with `relationship in ('past_client','sphere')` (agent-desk-web-reference.md
 * 2.2-2.4; gap-answers.md "Clients rows"). The table stores the home, the agent's own CRM reference and the
 * relationship; it has no name, phone, year or "sent" column, and the app never adds one.
 *
 * Checkup "sent" and "snoozed" live in `agent_opportunity_actions` under the key `<pin or address>:checkup`
 * with the note `WATCHDOG_CHECKUP|<seasonYear>` (decision D2 in the clients gap answer), the same ledger the desk
 * uses for Watch/Snooze/Dismiss, so the two front ends never disagree.
 *
 * Imports mirror the desk's CSV path: match addresses through `agent-contact-intelligence` (Agent plan, 50 per
 * call; names never leave the request), then upsert in chunks of 100 on `(user_id, address)` with `source:'csv'`.
 */
class ClientsApi(private val rest: SupabaseRest, private val edge: EdgeFunctions) {

    @Serializable
    data class ActionRow(
        @SerialName("opportunity_key") val opportunityKey: String,
        @SerialName("pams_pin") val pamsPin: String? = null,
        @SerialName("action_state") val actionState: String? = null,
        val outcome: String? = null,
        @SerialName("snoozed_until") val snoozedUntil: String? = null,
        val note: String? = null,
        @SerialName("touched_at") val touchedAt: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    ) {
        val snoozed: Instant? get() = Derived.parseInstant(snoozedUntil)
        val season: Int? get() = note?.removePrefix(CHECKUP_NOTE_PREFIX)?.takeIf { note.startsWith(CHECKUP_NOTE_PREFIX) }?.toIntOrNull()
    }

    /** One matched contact from `agent-contact-intelligence`; only the parcel id and match kind are kept. */
    data class Match(val ref: String, val kind: String, val pin: String?)

    suspend fun clientRows(): List<DigestApi.FarmRow> {
        val rows = rest.select("agent_farm_properties", DigestApi.FARM_SELECT, listOf("relationship" to "in.(past_client,sphere)"), order = "address.asc", limit = 1000, feature = "clients")
        return DigestApi.decode(rows, DigestApi.FarmRow.serializer())
    }

    /** The desk's action ledger rows for checkups (`*:checkup`) and watched/snoozed states. */
    suspend fun actions(): List<ActionRow> {
        val rows = rest.select("agent_opportunity_actions", "opportunity_key,pams_pin,action_state,outcome,snoozed_until,note,touched_at,updated_at", order = "updated_at.desc", limit = 2000, feature = "clients")
        return DigestApi.decode(rows, ActionRow.serializer())
    }

    /** Pins the agent's CRM already links to a parcel (verified links only), from `get_my_crm_property_overview`. Empty when the RPC is not available. */
    suspend fun crmLinkedPins(): Set<String> {
        val overview = rest.rpc("get_my_crm_property_overview", feature = "CRM links").asJsonObjectOr()
        if (overview.bool("allowed") == false) return emptySet()
        val pins = HashSet<String>()
        for (key in listOf("on_dashboard", "ready_to_add")) {
            overview.arr(key)?.forEach { item -> (item as? JsonObject)?.str("pams_pin")?.let { pins += it } }
        }
        return pins
    }

    suspend fun recordCheckupSent(userId: String, key: String, pin: String?, seasonYear: Int, now: Instant) {
        upsertAction(userId, key, pin, buildJsonObject {
            put("action_state", "completed")
            put("outcome", "touch")
            put("touched_at", now.toString())
            put("note", "$CHECKUP_NOTE_PREFIX$seasonYear")
        }, now)
    }

    suspend fun snoozeCheckup(userId: String, key: String, pin: String?, now: Instant, days: Int = 7) {
        upsertAction(userId, key, pin, buildJsonObject {
            put("action_state", "snoozed")
            put("snoozed_until", Instant.fromEpochSeconds(now.epochSeconds + days * 86_400L).toString())
        }, now)
    }

    private suspend fun upsertAction(userId: String, key: String, pin: String?, values: JsonObject, now: Instant) {
        val row = buildJsonObject {
            put("user_id", userId)
            put("opportunity_key", key)
            if (pin != null) put("pams_pin", pin)
            put("updated_at", now.toString())
            values.forEach { (k, v) -> put(k, v) }
        }
        rest.upsert("agent_opportunity_actions", JsonArray(listOf(row)), onConflict = "user_id,opportunity_key", feature = "clients", returning = false)
    }

    /**
     * Matches addresses to parcels with the agent's own CRM references. Only `ref`, `address`, `city` and
     * `state` are sent; the function echoes `ref` and returns the parcel id when it is confident.
     */
    suspend fun matchAddresses(rows: List<ClientImportRow>): Map<String, Match> {
        val out = HashMap<String, Match>()
        rows.chunked(50).forEachIndexed { chunkIndex, chunk ->
            val body = buildJsonObject {
                put("action", "analyze")
                put("contacts", buildJsonArray {
                    chunk.forEachIndexed { i, row ->
                        add(buildJsonObject {
                            put("ref", "row-${chunkIndex * 50 + i}")
                            put("address", row.address.trim().take(220))
                            put("city", row.town.trim().take(100))
                            put("state", "NJ")
                        })
                    }
                })
            }
            val response = edge.post("agent-contact-intelligence", body, feature = "address matching")
            response.arr("results")?.forEach { item ->
                val r = item as? JsonObject ?: return@forEach
                val ref = r.str("ref") ?: return@forEach
                val match = r.obj("match")
                out[ref] = Match(ref, match?.str("kind") ?: "no_match", match?.str("property_id"))
            }
        }
        return out
    }

    /** The desk's import write: chunks of 100, upsert on `(user_id, address)`. Returns the number of rows written. */
    suspend fun importRows(userId: String, rows: List<ClientImportRow>, matches: Map<String, Match>, now: Instant): Int {
        val payload = rows.mapIndexedNotNull { i, row ->
            val address = row.address.trim()
            if (address.length < 3) return@mapIndexedNotNull null
            val match = matches["row-$i"]
            val pin = match?.takeIf { it.kind == "match" }?.pin
            buildJsonObject {
                put("user_id", userId)
                put("address", address.take(240))
                put("municipality", row.town.trim().takeIf { it.isNotEmpty() })
                put("pams_pin", pin)
                put("contact_ref", row.crmRef?.trim()?.takeIf { it.isNotEmpty() })
                put("relationship", relationshipValue(row.relationship))
                put("source", "csv")
                put("match_status", if (pin != null) "matched" else if (match?.kind == "ambiguous") "needs_review" else "pending")
                put("updated_at", now.toString())
            }
        }
        var written = 0
        for (chunk in payload.chunked(100)) {
            rest.upsert("agent_farm_properties", JsonArray(chunk), onConflict = "user_id,address", feature = "client import", returning = false)
            written += chunk.size
        }
        return written
    }

    companion object {
        const val CHECKUP_NOTE_PREFIX = "WATCHDOG_CHECKUP|"

        /** The desk's `propertyKey`: the pin, else the lowercased address. */
        fun propertyKey(pin: String?, address: String): String = pin?.trim()?.takeIf { it.isNotEmpty() } ?: address.trim().lowercase()

        fun checkupKey(pin: String?, address: String): String = "${propertyKey(pin, address)}:checkup"

        fun relationshipValue(r: Relationship): String = when (r) {
            Relationship.PastClient -> "past_client"
            Relationship.Sphere -> "sphere"
            Relationship.Farm -> "farm"
            Relationship.Watching -> "watchlist"
        }
    }
}
