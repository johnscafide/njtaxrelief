package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.api.StoredLocalAlerts
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.repo.PropertyRepository
import kotlinx.datetime.Instant
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

/**
 * Property detail, search, saved and watched (gap-answers.md "Property row contract" 7.3, 8):
 *
 * - `detail(pin)` reads the JSON property route once and caches it briefly; the photo falls back to the NJ aerial
 *   from `/api/property-imagery` when the row has coordinates and no homeowner photo.
 * - Saved = a `saved_properties` row for the pin (written through `rpc save_property` with `kind:'watch'`, the
 *   validated path the site uses; this is also what makes the change producers watch the home).
 * - Watched = a `property_alert_preferences` row that is not paused. Watching also saves, because events are only
 *   produced for saved homes.
 * - Search tries the Agent-plan route and falls back to the public address search when the plan says no.
 */
class LivePropertyRepository(private val ctx: LiveContext) : PropertyRepository {

    private val cache = LinkedHashMap<String, Pair<Instant, PropertyApi.Response>>()
    private var agentSearchAllowed: Boolean? = null

    suspend fun fetch(pin: PamsPin, price: Int? = null): PropertyApi.Response {
        if (price == null) {
            synchronized(cache) { cache[pin]?.let { (at, response) -> if ((ctx.now() - at).inWholeSeconds < CACHE_SECONDS) return response } }
        }
        val response = ctx.property.byPin(pin, price)
        if (price == null) synchronized(cache) {
            cache[pin] = ctx.now() to response
            while (cache.size > 40) cache.remove(cache.keys.first())
        }
        return response
    }

    override suspend fun search(query: String): List<PropertySummary> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        if (agentSearchAllowed != false) {
            try {
                val rows = ctx.property.agentSearch(q)
                agentSearchAllowed = true
                if (rows.isNotEmpty() || q.length < 4) return rows.map { it.toSummary() }
            } catch (e: PlanRequiredException) {
                agentSearchAllowed = false
            }
        }
        return ctx.property.publicSearch(q).map { row ->
            PropertySummary(row.pin, row.address, row.town, Derived.countyName(row.county), Format.parsePin(row.pin)?.let { Format.blockLot(it.block, it.lot, it.qualifier) } ?: "", null, null, "Property")
        }
    }

    private fun PropertyApi.AgentSearchRow.toSummary() = PropertySummary(
        pin = pamsPin,
        address = Derived.titleCase(address),
        town = Derived.townName(town),
        county = Derived.countyName(county),
        blockLot = Format.blockLot(block ?: "", lot ?: "", qualifier),
        score = null,
        taxBill = lastYearTax?.roundToInt(),
        propertyClassLabel = Derived.classLabel(propClass)?.let { "Class $propClass · $it" } ?: propClass?.let { "Class $it" } ?: "Property",
    )

    override suspend fun detail(pin: PamsPin): PropertyDetail {
        val response = fetch(pin)
        val row = response.property
        val saved = runCatching { isSaved(pin) }.getOrDefault(false)
        val watched = runCatching { isWatched(pin) }.getOrDefault(false)
        val image = response.photoUrl ?: if (row.lat != null && row.lon != null) {
            runCatching { ctx.property.imagery(row.lat, row.lon)?.aerial?.imageUrl }.getOrNull()
        } else null
        return ctx.mapper.detail(response, isSaved = saved, isWatched = watched, imageUrl = image)
    }

    suspend fun isSaved(pin: PamsPin): Boolean =
        ctx.rest.select("saved_properties", "pams_pin", listOf("pams_pin" to "eq.$pin"), limit = 1, feature = "saved homes").isNotEmpty()

    suspend fun isWatched(pin: PamsPin): Boolean {
        val row = ctx.rest.maybeSingle("property_alert_preferences", "paused", listOf("pams_pin" to "eq.$pin"), feature = "alerts") ?: return false
        return row["paused"]?.toString() != "true"
    }

    override suspend fun setSaved(pin: PamsPin, saved: Boolean) {
        if (saved) {
            saveProperty(pin)
        } else {
            ctx.rest.delete("saved_properties", listOf("pams_pin" to "eq.$pin", "kind" to "eq.watch"), feature = "saved homes")
        }
    }

    /** `rpc save_property({p})` with the current assessment and bill, so the change producers have something to diff. */
    suspend fun saveProperty(pin: PamsPin) {
        val row = fetch(pin).property
        val payload = buildJsonObject {
            put("p", buildJsonObject {
                put("kind", "watch")
                put("pams_pin", pin)
                put("address", row.address)
                put("town", row.town)
                put("county", row.county)
                if (row.block != null) put("block", row.block)
                if (row.lot != null) put("lot", row.lot)
                row.assessedValue?.let { put("assessed", it.roundToInt()) }
                row.lastYearTax?.let { put("last_year_tax", it) }
            })
        }
        ctx.rest.rpc("save_property", payload, feature = "saved homes")
    }

    override suspend fun setWatched(pin: PamsPin, watched: Boolean) {
        val userId = ctx.userId()
        if (watched) runCatching { saveProperty(pin) }
        val local = ctx.store.readJson<StoredLocalAlerts>(LiveKeys.LOCAL_ALERTS) ?: StoredLocalAlerts()
        val channels = local.channelMap()
        val homeChanges = channels[AlertChannel.ClientHomeChanges] ?: true
        val deadlines = channels[AlertChannel.AppealDeadlines] ?: true
        ctx.alerts.savePinPreferences(userId, listOf(pin), alertTax = homeChanges, alertAssessment = homeChanges, alertScore = homeChanges, alertDeadline = deadlines, paused = !watched, now = ctx.now())
    }

    /** `https://www.watchdogindex.com/checkup?pin=<pin>&agent=<slug>`, the link the agent sends under their own name. */
    override suspend fun checkupLink(pin: PamsPin): String {
        val slug = runCatching { ctx.account().vanitySlug }.getOrNull()
        return "${ctx.config.siteOrigin}/checkup?pin=${java.net.URLEncoder.encode(pin, "UTF-8")}" + (slug?.let { "&agent=${java.net.URLEncoder.encode(it, "UTF-8")}" } ?: "")
    }

    companion object {
        const val CACHE_SECONDS = 300
    }
}
