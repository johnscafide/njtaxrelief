package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ChangeKind
import com.watchdogindex.agent.core.model.PropertyChange
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.TileTint
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.roundToInt

/**
 * The tables behind "this week" and the rules that turn their rows into reasons, ported from the digest sender
 * (`agent-opportunity-digest/index.ts`, edge-function-contracts.md 2.1) and the Agent Desk (`agent-desk.js`,
 * agent-desk-web-reference.md 1.4). The sender itself is cron-only, so the app rebuilds the same list:
 *
 * - `property_update_events` (own rows; `select` and `update (read_at)` only)
 * - `agent_farm_properties` and `saved_properties` (the sphere: farm ∪ saved, de-duplicated by pin or address)
 *
 * Only the eight weighted event types count; `source_refresh`, `score_change` and `system` are routine and hidden.
 * Payload keys are read by name; unknown payload keys are never rendered.
 */
class DigestApi(private val rest: SupabaseRest) {

    @Serializable
    data class EventRow(
        val id: Long? = null,
        @SerialName("pams_pin") val pamsPin: String? = null,
        @SerialName("event_type") val eventType: String = "",
        val severity: String? = null,
        val title: String? = null,
        val summary: String? = null,
        @SerialName("source_url") val sourceUrl: String? = null,
        @SerialName("occurred_at") val occurredAt: String? = null,
        val payload: JsonObject? = null,
        @SerialName("marker_id") val markerId: String? = null,
        @SerialName("old_value") val oldValue: String? = null,
        @SerialName("new_value") val newValue: String? = null,
        @SerialName("delta_numeric") val deltaNumeric: Double? = null,
        @SerialName("read_at") val readAt: String? = null,
    ) {
        val occurred: Instant? get() = Derived.parseInstant(occurredAt)
        val pin: String? get() = (pamsPin ?: payload?.str("pams_pin"))?.trim()?.takeIf { it.isNotEmpty() }
        val payloadAddress: String? get() = (payload?.str("property_address") ?: payload?.str("address"))?.trim()?.takeIf { it.isNotEmpty() }
        val payloadTown: String? get() = payload?.str("municipality")?.trim()?.takeIf { it.isNotEmpty() }
    }

    @Serializable
    data class FarmRow(
        val id: String,
        @SerialName("pams_pin") val pamsPin: String? = null,
        @SerialName("contact_ref") val contactRef: String? = null,
        val address: String = "",
        val municipality: String? = null,
        val county: String? = null,
        val relationship: String = "farm",
        val source: String? = null,
        @SerialName("match_status") val matchStatus: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
    )

    @Serializable
    data class SavedRow(
        val id: String? = null,
        @SerialName("pams_pin") val pamsPin: String? = null,
        val address: String? = null,
        val town: String? = null,
        val county: String? = null,
        val kind: String? = null,
        val assessed: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
    )

    /** One home the agent watches, from either table. Never carries a person's name. */
    data class SphereHome(val pin: String?, val address: String, val town: String?, val relationship: String, val contactRef: String?, val farmRowId: String?) {
        val key: String get() = pin?.lowercase() ?: address.trim().lowercase()
        val model: Relationship get() = relationshipOf(relationship)
    }

    class Sphere(val farm: List<FarmRow>, val saved: List<SavedRow>) {
        val homes: Map<String, SphereHome>
        private val byAddress: Map<String, SphereHome>

        init {
            val map = LinkedHashMap<String, SphereHome>()
            for (row in farm) {
                val home = SphereHome(row.pamsPin?.trim()?.takeIf { it.isNotEmpty() }, row.address, row.municipality, row.relationship, row.contactRef, row.id)
                map.putIfAbsent(home.key, home)
            }
            for (row in saved) {
                val address = row.address?.trim().orEmpty()
                val pin = row.pamsPin?.trim()?.takeIf { it.isNotEmpty() }
                if (pin == null && address.isEmpty()) continue
                val home = SphereHome(pin, address, row.town, if (row.kind == "home") "claimed_home" else "watchlist", null, null)
                map.putIfAbsent(home.key, home)
            }
            homes = map
            byAddress = map.values.filter { it.address.isNotBlank() }.associateBy { it.address.trim().lowercase() }
        }

        fun match(event: EventRow): SphereHome? {
            event.pin?.lowercase()?.let { homes[it]?.let { h -> return h } }
            event.payloadAddress?.lowercase()?.let { byAddress[it]?.let { h -> return h } }
            return null
        }

        val pins: List<String> get() = homes.values.mapNotNull { it.pin }.distinct()
    }

    /** A qualifying, grouped event: the best event for a `<home>:<event_type>` pair. */
    data class Reason(val event: EventRow, val home: SphereHome, val score: Int, val combined: Int)

    // ------------------------------------------------------------------ reads

    suspend fun events(since: Instant?, limit: Int = 500, pin: String? = null): List<EventRow> {
        val filters = mutableListOf<Pair<String, String>>()
        if (since != null) filters += "occurred_at" to "gte.$since"
        if (pin != null) filters += "pams_pin" to "eq.$pin"
        val rows = rest.select("property_update_events", EVENT_SELECT, filters, order = "occurred_at.desc", limit = limit, feature = "changes")
        return decode(rows, EventRow.serializer())
    }

    suspend fun farmRows(relationships: List<String>? = null, limit: Int = 1000): List<FarmRow> {
        val filters = mutableListOf<Pair<String, String>>()
        if (relationships != null) filters += "relationship" to "in.(${relationships.joinToString(",")})"
        val rows = rest.select("agent_farm_properties", FARM_SELECT, filters, order = "address.asc", limit = limit, feature = "clients")
        return decode(rows, FarmRow.serializer())
    }

    suspend fun savedRows(limit: Int = 1000): List<SavedRow> {
        val rows = rest.select("saved_properties", "id,pams_pin,address,town,county,kind,assessed,last_year_tax", order = "created_at.desc", limit = limit, feature = "saved homes")
        return decode(rows, SavedRow.serializer())
    }

    suspend fun sphere(): Sphere = Sphere(farmRows(), savedRows())

    suspend fun markRead(ids: List<Long>, at: Instant) {
        if (ids.isEmpty()) return
        rest.update("property_update_events", buildJsonObject { put("read_at", at.toString()) }, listOf("id" to "in.(${ids.joinToString(",")})"), feature = "alerts")
    }

    // ------------------------------------------------------------------ rules

    /** The eight qualifying types with the sender's weights; everything else is routine and never a reason. */
    fun qualify(events: List<EventRow>, sphere: Sphere, now: Instant): List<Reason> {
        val grouped = LinkedHashMap<String, Reason>()
        val counts = HashMap<String, Int>()
        for (event in events) {
            if (event.eventType !in WEIGHTS) continue
            val home = sphere.match(event) ?: continue
            val key = "${home.key}:${event.eventType}"
            val score = digestScore(event, now)
            counts[key] = (counts[key] ?: 0) + 1
            val existing = grouped[key]
            if (existing == null || score > existing.score || (score == existing.score && (event.occurred ?: Instant.DISTANT_PAST) > (existing.event.occurred ?: Instant.DISTANT_PAST))) {
                grouped[key] = Reason(event, home, score, 0)
            }
        }
        return grouped.map { (key, r) -> r.copy(combined = counts[key] ?: 1) }
    }

    /** Sort by score, keep the best reason per home, cut at [limit] (ten in the email). */
    fun top(reasons: List<Reason>, limit: Int = 10): List<Reason> {
        val seen = HashSet<String>()
        return reasons.sortedWith(compareByDescending<Reason> { it.score }.thenByDescending { it.event.occurred ?: Instant.DISTANT_PAST })
            .filter { seen.add(it.home.key) }
            .take(limit)
    }

    fun change(reason: Reason, id: String = "evt-${reason.event.id ?: reason.hashCode()}"): PropertyChange {
        val type = reason.event.eventType
        val home = reason.home
        val town = home.town?.let { Derived.titleCase(it) } ?: reason.event.payloadTown?.let { Derived.titleCase(it) }
        val subtitle = listOfNotNull(
            listOfNotNull(Derived.titleCase(home.address).ifEmpty { null }, town).joinToString(", ").ifEmpty { null },
            relationshipLabel(home.model),
        ).joinToString(" · ")
        return PropertyChange(
            id = id,
            kind = kindFor(type),
            title = title(reason.event),
            subtitle = subtitle,
            pin = home.pin,
            relationship = home.model,
            tile = tintFor(type),
            icon = iconFor(type),
            sourceNote = SOURCE_LABELS[type],
        )
    }

    /** Plain titles from the event's numbers and type; the producers' raw titles ("last year tax changed") are never shown. */
    fun title(event: EventRow): String {
        val delta = event.deltaNumeric?.roundToInt()
        return when (event.eventType) {
            "tax_change" -> if (delta != null && delta != 0) "Tax bill ${Format.moneyChange(delta)}" else "Tax bill changed"
            "assessment_change" -> if (delta != null && delta != 0) "Assessment ${Format.moneyChange(delta)}" else "Assessment changed"
            "deed_change" -> event.title?.takeIf { looksLikeSentence(it) } ?: "Deed recorded"
            "permit_change" -> event.title?.takeIf { looksLikeSentence(it) } ?: "Permit activity"
            "municipal_change" -> event.title?.takeIf { looksLikeSentence(it) } ?: "Town assessment update"
            "appeal_deadline" -> "Appeal deadline approaching"
            "market_change" -> if (delta != null && delta != 0) "Market estimate ${Format.moneyChange(delta)}" else "Market estimate changed"
            "evidence_change" -> "Record evidence updated"
            else -> TYPE_LABELS[event.eventType] ?: event.title ?: "Property record changed"
        }
    }

    private fun looksLikeSentence(text: String): Boolean = text.length in 6..120 && text.first().isUpperCase() && !text.endsWith(" changed") && !text.contains("saved list", ignoreCase = true)

    companion object {
        const val EVENT_SELECT = "id,pams_pin,event_type,severity,title,summary,source_url,occurred_at,payload,marker_id,old_value,new_value,delta_numeric,read_at"
        const val FARM_SELECT = "id,pams_pin,contact_ref,address,municipality,county,relationship,source,match_status,updated_at,created_at"

        /** `eventWeights` from the digest sender. */
        val WEIGHTS: Map<String, Int> = mapOf(
            "appeal_deadline" to 30, "assessment_change" to 27, "tax_change" to 25, "permit_change" to 23,
            "deed_change" to 22, "evidence_change" to 22, "market_change" to 20, "municipal_change" to 18,
        )

        /** The desk's type labels (`agent-desk.js:14-22`). */
        val TYPE_LABELS: Map<String, String> = mapOf(
            "assessment_change" to "Assessment changed materially",
            "tax_change" to "Annual property tax changed",
            "appeal_deadline" to "Assessment-review deadline is approaching",
            "permit_change" to "Permit lifecycle changed",
            "deed_change" to "Recorded transfer activity changed",
            "market_change" to "Verified nearby sales moved",
            "municipal_change" to "Municipal assessment context changed",
            "evidence_change" to "Chapter 123 evidence changed",
        )

        val SOURCE_LABELS: Map<String, String> = mapOf(
            "assessment_change" to "NJ Division of Taxation MOD-IV property assessment records",
            "tax_change" to "NJ Division of Taxation and municipal tax records",
            "appeal_deadline" to "NJ Division of Taxation appeal guidance",
            "permit_change" to "NJ Department of Community Affairs construction permit data",
            "deed_change" to "NJ Division of Taxation MOD-IV/SR1A records",
            "market_change" to "NJ Division of Taxation SR1A verified sales",
            "municipal_change" to "NJ Division of Taxation and municipal notices",
            "evidence_change" to "NJ Division of Taxation equalization and verified-sale records",
        )

        /**
         * The four tiles map to the four honest types (gap-answers.md "property_update_events producer contract" 6):
         * tax bills = tax_change, permits = permit_change, sales = deed_change, town = municipal_change. The market
         * estimate and evidence types have no tile and fold into Assessment for the list.
         */
        fun kindFor(type: String): ChangeKind = when (type) {
            "tax_change" -> ChangeKind.TaxBill
            "permit_change" -> ChangeKind.Permit
            "deed_change" -> ChangeKind.Sale
            "municipal_change" -> ChangeKind.Town
            "appeal_deadline" -> ChangeKind.Deadline
            else -> ChangeKind.Assessment
        }

        /** Material Symbols names the row tiles draw. */
        fun iconFor(type: String): String = when (kindFor(type)) {
            ChangeKind.TaxBill -> "receipt_long"
            ChangeKind.Permit -> "construction"
            ChangeKind.Sale -> "sell"
            ChangeKind.Town -> "account_balance"
            ChangeKind.Deadline -> "event"
            ChangeKind.Assessment -> "request_quote"
        }

        fun tintFor(type: String): TileTint = when (kindFor(type)) {
            ChangeKind.TaxBill, ChangeKind.Sale -> TileTint.Sky
            ChangeKind.Permit, ChangeKind.Assessment -> TileTint.Sand
            ChangeKind.Town -> TileTint.Mint
            ChangeKind.Deadline -> TileTint.Navy
        }

        fun relationshipOf(raw: String?): Relationship = when (raw) {
            "past_client" -> Relationship.PastClient
            "sphere" -> Relationship.Sphere
            "farm" -> Relationship.Farm
            else -> Relationship.Watching
        }

        fun relationshipLabel(r: Relationship): String = when (r) {
            Relationship.PastClient -> "Past client"
            Relationship.Sphere -> "Sphere"
            Relationship.Farm -> "Farm"
            Relationship.Watching -> "Watching"
        }

        /** The sender's `score()`: weight + freshness (25/20/12) + source (25/17) + severity (25/16), capped at 100. */
        fun digestScore(event: EventRow, now: Instant): Int {
            val weight = WEIGHTS[event.eventType] ?: 8
            val ageDays = event.occurred?.let { (now - it).inWholeHours / 24.0 } ?: 999.0
            val freshness = if (ageDays <= 7) 25 else if (ageDays <= 30) 20 else 12
            val source = if (!event.sourceUrl.isNullOrBlank()) 25 else 17
            val severity = if (event.severity == "action") 25 else 16
            return minOf(100, weight + freshness + source + severity)
        }

        /** The desk's `touch_score` (freshness 25 + magnitude 30 + evidence 25 + relationship 20), for chip precedence. */
        fun deskScore(event: EventRow, relationship: String?, now: Instant): Int {
            val rel = when (relationship) { "past_client", "claimed_home" -> 20; "sphere" -> 17; "watchlist" -> 15; "farm" -> 10; else -> 15 }
            val url = event.sourceUrl ?: ""
            val evidence = when {
                url.contains("nj.gov") || url.contains(".gov/") -> 25
                url.isNotBlank() -> 21
                else -> 17
            }
            val delta = event.deltaNumeric
            val old = event.oldValue?.toDoubleOrNull()
            val magnitude = when {
                delta != null && old != null && old != 0.0 -> minOf(30, 12 + (minOf(1.0, abs(delta) / abs(old)) * 18).roundToInt())
                delta != null -> minOf(30, 14 + (log10(abs(delta) + 1) * 4).roundToInt())
                event.severity == "action" -> 26
                event.severity == "important" -> 21
                else -> 15
            }
            val ageDays = event.occurred?.let { (now - it).inWholeHours / 24.0 } ?: 999.0
            val freshness = when {
                ageDays <= 7 -> 25; ageDays <= 30 -> 21; ageDays <= 90 -> 16; ageDays <= 180 -> 11; else -> 6
            }
            return freshness + magnitude + evidence + rel
        }

        fun <T> decode(rows: JsonArray, serializer: kotlinx.serialization.KSerializer<T>): List<T> =
            rows.mapNotNull { runCatching { WatchdogHttp.json.decodeFromJsonElement(serializer, it) }.getOrNull() }
    }
}
