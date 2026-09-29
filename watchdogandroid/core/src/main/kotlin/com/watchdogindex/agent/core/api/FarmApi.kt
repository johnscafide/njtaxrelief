package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.model.LatLng
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Farms and the parcels inside them (gap-answers.md "Farm map contract"):
 *
 * - A farm is an `agent_dynamic_lists` row; a map-drawn one has `scope_type 'polygon'`, `scope_value 'Map
 *   selection'` and `criteria.polygon.rings[0]` as closed `[lng, lat]` pairs. `last_count` is its home count.
 * - Its pins come from the materialized membership table `agent_dynamic_list_properties` (owner-readable), or,
 *   when nothing is materialized yet, by paging `farm-map-query` with the polygon (quota-limited, so pages are capped).
 * - Points and deed facts come from `workbench-hydrate` (`records[].lat/lon`, `deed_date`, `last_sale_price`,
 *   `sales_code`). Its `owner_name`, `mailing_*` and `zip` fields are never declared in the DTO, so they are
 *   dropped when the JSON is parsed. No function returns parcel outlines.
 * - Scores come from the public RPC `get_public_realtime_watchdog_scores` (100 pins per call).
 * - `farm-workspace` adds `last_deed_year` per pin and the CRM match counts; `owner_name`, `owner_mails_elsewhere`
 *   and `postal_city` are not read.
 */
class FarmApi(private val rest: SupabaseRest, private val edge: EdgeFunctions) {

    @Serializable
    data class ListRow(
        val id: String,
        val name: String? = null,
        @SerialName("scope_type") val scopeType: String? = null,
        @SerialName("scope_value") val scopeValue: String? = null,
        val criteria: JsonObject? = null,
        val monitored: Boolean? = null,
        @SerialName("last_count") val lastCount: Double? = null,
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    ) {
        /** The saved ring as points; `[lng, lat]` pairs become [LatLng]. Empty for town/county/ZIP farms. */
        val ring: List<LatLng>
            get() {
                val rings = criteria?.obj("polygon")?.arr("rings") ?: return emptyList()
                val first = rings.firstOrNull() as? JsonArray ?: return emptyList()
                return first.mapNotNull { p ->
                    val pair = p as? JsonArray ?: return@mapNotNull null
                    val lon = pair.getOrNull(0)?.doubleOrNull() ?: return@mapNotNull null
                    val lat = pair.getOrNull(1)?.doubleOrNull() ?: return@mapNotNull null
                    LatLng(lat, lon)
                }
            }
    }

    /** A `farm-map-query` record. `zip` is the owner's mailing ZIP in the source data and is not declared. */
    @Serializable
    data class MapRecord(
        @SerialName("pams_pin") val pamsPin: String,
        val address: String? = null,
        val town: String? = null,
        val county: String? = null,
        val block: String? = null,
        val lot: String? = null,
        @SerialName("prop_class") val propClass: String? = null,
        @SerialName("year_built") val yearBuilt: Double? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
        @SerialName("last_sale_price") val lastSalePrice: Double? = null,
    )

    @Serializable
    data class MapPage(
        val plan: String? = null,
        val count: Double? = null,
        @SerialName("accessible_count") val accessibleCount: Double? = null,
        @SerialName("capacity_limited") val capacityLimited: Boolean = false,
        val records: List<MapRecord> = emptyList(),
        val offset: Double? = null,
        @SerialName("next_offset") val nextOffset: Double? = null,
        @SerialName("has_more") val hasMore: Boolean = false,
        val source: String? = null,
    )

    /** A `workbench-hydrate` record with only the public parcel fields. Owner and mailing fields are never read. */
    @Serializable
    data class HydrateRecord(
        @SerialName("pams_pin") val pamsPin: String,
        val address: String? = null,
        val town: String? = null,
        val county: String? = null,
        @SerialName("prop_class") val propClass: String? = null,
        @SerialName("year_built") val yearBuilt: Double? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
        @SerialName("last_sale_price") val lastSalePrice: Double? = null,
        @SerialName("last_sale_year") val lastSaleYear: Double? = null,
        @SerialName("deed_date") val deedDate: String? = null,
        @SerialName("sales_code") val salesCode: String? = null,
        val lat: Double? = null,
        val lon: Double? = null,
    )

    data class Workspace(val lastDeedYear: Map<String, Int>, val crmMatched: Int, val crmPendingReview: Int)

    suspend fun lists(): List<ListRow> {
        val rows = rest.select("agent_dynamic_lists", "id,name,scope_type,scope_value,criteria,monitored,last_count,created_at,updated_at", order = "created_at.asc", limit = 200, feature = "farms")
        return DigestApi.decode(rows, ListRow.serializer())
    }

    suspend fun list(id: String): ListRow? =
        rest.maybeSingle("agent_dynamic_lists", "id,name,scope_type,scope_value,criteria,monitored,last_count,created_at,updated_at", listOf("id" to "eq.$id"), feature = "farms")
            ?.let { runCatching { WatchdogHttp.json.decodeFromJsonElement(ListRow.serializer(), it) }.getOrNull() }

    /** Pins of the newest complete generation of a saved farm; empty when it has not been materialized. */
    suspend fun materializedPins(listId: String): List<String> {
        val rows = rest.select("agent_dynamic_list_properties", "pams_pin,generation", listOf("dynamic_list_id" to "eq.$listId"), order = "generation.desc", limit = 5000, feature = "farm parcels")
        var latest: Double? = null
        val pins = ArrayList<String>()
        for (row in rows) {
            val o = row as? JsonObject ?: continue
            val gen = o.num("generation") ?: 0.0
            if (latest == null) latest = gen
            if (gen != latest) break
            o.str("pams_pin")?.let { pins += it }
        }
        return pins.distinct()
    }

    /** One page of parcels inside a polygon. Rings are `[lng, lat]`, closed. The server clamps `limit` to the plan's rows per request. */
    suspend fun mapQuery(ring: List<LatLng>, offset: Int = 0, limit: Int = 250, propertyClasses: List<String> = emptyList()): MapPage {
        val body = buildJsonObject {
            put("polygon", buildJsonObject { put("rings", buildJsonArray { add(ringJson(ring)) }) })
            put("property_classes", buildJsonArray { propertyClasses.forEach { add(JsonPrimitive(it)) } })
            put("filters", buildJsonObject { })
            put("limit", limit)
            put("offset", offset)
        }
        val response = edge.post("farm-map-query", body, feature = "farm map")
        return WatchdogHttp.json.decodeFromJsonElement(MapPage.serializer(), response)
    }

    /** Centroids and deed facts for up to 1000 pins. `marker_ids` is empty on purpose: markers are not needed here. */
    suspend fun hydrate(pins: List<String>): List<HydrateRecord> {
        val out = ArrayList<HydrateRecord>()
        for (chunk in pins.distinct().chunked(1000)) {
            val body = buildJsonObject {
                put("pams_pins", buildJsonArray { chunk.forEach { add(JsonPrimitive(it)) } })
                put("marker_ids", buildJsonArray { })
            }
            val response = edge.post("workbench-hydrate", body, feature = "farm map")
            out += DigestApi.decode(response.arr("records") ?: JsonArray(emptyList()), HydrateRecord.serializer())
        }
        return out
    }

    /** Watchdog Scores, 100 pins per call; null when the cache has no ROBUST-v1 row for a parcel. */
    suspend fun scores(pins: List<String>): Map<String, Int?> {
        val out = HashMap<String, Int?>()
        for (chunk in pins.distinct().chunked(100)) {
            val body = buildJsonObject { put("p_rows", buildJsonArray { chunk.forEach { add(buildJsonObject { put("pams_pin", it) }) } }) }
            val rows = rest.rpc("get_public_realtime_watchdog_scores", body, feature = "scores") as? JsonArray ?: continue
            for (row in rows) {
                val o = row as? JsonObject ?: continue
                val pin = o.str("pams_pin") ?: continue
                out[pin] = o.num("watchdog_score")?.let { Math.round(it).toInt() }
            }
        }
        return out
    }

    /** Deed years and CRM match counts for up to 250 pins per call. Owner fields are not read. */
    suspend fun workspace(pins: List<String>): Workspace {
        val years = HashMap<String, Int>()
        var matched = 0
        var pending = 0
        for (chunk in pins.distinct().chunked(250)) {
            val body = buildJsonObject {
                put("pams_pins", buildJsonArray { chunk.forEach { add(JsonPrimitive(it)) } })
                put("owners", true)
                put("crm", true)
            }
            val response = edge.post("farm-workspace", body, feature = "farm")
            response.obj("properties")?.forEach { (pin, v) -> (v as? JsonObject)?.int("last_deed_year")?.let { years[pin] = it } }
            response.obj("crm")?.let { crm ->
                matched += crm.int("matched") ?: 0
                pending += crm.int("pending_review") ?: 0
            }
        }
        return Workspace(years, matched, pending)
    }

    /** Saves a map-drawn farm the way the web Farm Map does (`farm-map.js:21`). Returns the new row. */
    suspend fun createPolygonList(userId: String, name: String, ring: List<LatLng>, lastCount: Int?, propertyClasses: List<String> = listOf("2")): ListRow {
        val row = buildJsonObject {
            put("user_id", userId)
            put("name", name)
            put("scope_type", "polygon")
            put("scope_value", "Map selection")
            put("criteria", buildJsonObject {
                put("property_classes", buildJsonArray { propertyClasses.forEach { add(JsonPrimitive(it)) } })
                put("filters", buildJsonObject { })
                put("intelligence_filters", buildJsonObject { })
                put("polygon", buildJsonObject { put("rings", buildJsonArray { add(ringJson(ring)) }) })
            })
            put("monitored", true)
            if (lastCount != null) put("last_count", lastCount)
        }
        val inserted = rest.insert("agent_dynamic_lists", JsonArray(listOf(row)), feature = "farms")
        val created = inserted.firstOrNull() as? JsonObject ?: throw com.watchdogindex.agent.core.WatchdogException("Farm insert returned no row", userMessage = "The farm could not be saved. Please try again.")
        return WatchdogHttp.json.decodeFromJsonElement(ListRow.serializer(), created)
    }

    companion object {
        /** Points become `[lng, lat]` pairs with the first point repeated last, as the web's `latLngsToRing` does. */
        fun ringJson(ring: List<LatLng>): JsonArray {
            val closed = if (ring.size >= 2 && ring.first() == ring.last()) ring else ring + ring.first()
            return buildJsonArray { closed.forEach { add(buildJsonArray { add(JsonPrimitive(it.lon)); add(JsonPrimitive(it.lat)) }) } }
        }
    }
}
