package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.FarmApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.TurnoverNote
import com.watchdogindex.agent.core.repo.FarmRepository
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Farms from `agent_dynamic_lists`, parcels from the membership table or `farm-map-query`, points and deed facts
 * from `workbench-hydrate`, scores from the public score RPC (gap-answers.md "Farm map contract" 11).
 *
 * Honest limits carried into the models: no function returns parcel outlines, so each [MapParcel.ring] is a
 * marker-sized square around the parcel centroid (draw it as a dot); no farm-wide permit source exists, so
 * `permitInLast90Days` is always false and `FarmStats.permitsIn90Days` is 0; turnover is neighborhood-level only.
 */
class LiveFarmRepository(private val ctx: LiveContext) : FarmRepository {

    private data class Loaded(val at: Instant, val parcels: List<MapParcel>, val soldPrices: List<Int>, val town: String?)

    private val loaded = HashMap<String, Loaded>()
    private var lists: Pair<Instant, List<FarmApi.ListRow>>? = null

    private suspend fun listRows(): List<FarmApi.ListRow> {
        lists?.let { (at, rows) -> if ((ctx.now() - at).inWholeSeconds < CACHE_SECONDS) return rows }
        val rows = ctx.farm.lists()
        lists = ctx.now() to rows
        return rows
    }

    override suspend fun farms(): List<Farm> = listRows().map { farm(it) }

    private fun farm(row: FarmApi.ListRow): Farm {
        val ring = row.ring
        val center = if (ring.isNotEmpty()) LatLng(ring.sumOf { it.lat } / ring.size, ring.sumOf { it.lon } / ring.size) else LatLng(40.06, -74.50)
        val extent = if (ring.isNotEmpty()) maxOf(ring.maxOf { it.lat } - ring.minOf { it.lat }, (ring.maxOf { it.lon } - ring.minOf { it.lon }) * 0.77) else 1.0
        val zoom = when {
            ring.isEmpty() -> 8.0
            extent < 0.004 -> 17.0
            extent < 0.008 -> 16.0
            extent < 0.02 -> 15.0
            extent < 0.05 -> 14.0
            else -> 12.0
        }
        val created = Derived.parseInstant(row.createdAt)?.toLocalDateTime(Derived.NEW_JERSEY)?.date
        val town = loaded[row.id]?.town
            ?: row.criteria?.let { c -> (c["town"] ?: c["place_label"] ?: c["municipality"])?.let { it.toString().trim('"') } }?.takeIf { it.isNotBlank() }
            ?: row.scopeValue?.takeIf { it.isNotBlank() && it != "Map selection" }
            ?: "Map farm"
        return Farm(
            id = row.id,
            name = row.name?.takeIf { it.isNotBlank() } ?: "Map-drawn farm",
            town = town,
            homes = row.lastCount?.toInt() ?: loaded[row.id]?.parcels?.size ?: 0,
            sinceLabel = created?.let { "your farm since ${Format.shortMonth(it)}" },
            center = center,
            zoom = zoom,
            boundary = ring,
        )
    }

    override suspend fun parcels(farmId: String, layer: MapLayer): List<MapParcel> {
        val all = load(farmId).parcels
        return when (layer) {
            MapLayer.Score -> all
            MapLayer.Residential -> all.filter { it.residential }
            MapLayer.SoldIn12Months -> all.filter { it.soldInLast12Months }
            MapLayer.Permits -> all.filter { it.permitInLast90Days }
        }
    }

    private suspend fun load(farmId: String): Loaded {
        loaded[farmId]?.let { if ((ctx.now() - it.at).inWholeSeconds < CACHE_SECONDS) return it }
        val row = listRows().firstOrNull { it.id == farmId } ?: ctx.farm.list(farmId) ?: throw WatchdogException("Unknown farm $farmId", userMessage = "That farm is no longer available.")
        val today = ctx.today()
        val yearAgo = today.minus(365, DateTimeUnit.DAY)

        var pins = runCatching { ctx.farm.materializedPins(farmId) }.getOrDefault(emptyList())
        val fromQuery = HashMap<String, FarmApi.MapRecord>()
        if (pins.isEmpty() && row.ring.size >= 4) {
            var offset = 0
            var pages = 0
            while (pages < MAX_PAGES) {
                val page = ctx.farm.mapQuery(row.ring, offset = offset)
                page.records.forEach { fromQuery[it.pamsPin] = it }
                pages += 1
                val next = page.nextOffset?.toInt()
                if (!page.hasMore || next == null || next <= offset || page.records.isEmpty()) break
                offset = next
            }
            pins = fromQuery.keys.toList()
        }
        if (pins.isEmpty()) {
            val empty = Loaded(ctx.now(), emptyList(), emptyList(), null)
            loaded[farmId] = empty
            return empty
        }

        val records = ctx.farm.hydrate(pins).associateBy { it.pamsPin }
        val scores = runCatching { ctx.farm.scores(pins) }.getOrDefault(emptyMap())
        val soldPrices = ArrayList<Int>()
        val parcels = pins.mapNotNull { pin ->
            val rec = records[pin]
            val lat = rec?.lat ?: return@mapNotNull null
            val lon = rec.lon ?: return@mapNotNull null
            val query = fromQuery[pin]
            val propClass = rec.propClass ?: query?.propClass
            val deedDate = Derived.parseDeedDate(rec.deedDate, today)
            val price = rec.lastSalePrice ?: query?.lastSalePrice
            val sold = deedDate != null && deedDate >= yearAgo && (price ?: 0.0) >= 1000 && rec.salesCode.isNullOrBlank()
            if (sold) price?.let { soldPrices += it.roundToInt() }
            MapParcel(
                pin = pin,
                address = Derived.titleCase(rec.address ?: query?.address),
                ring = markerSquare(lat, lon),
                score = scores[pin],
                taxBill = (rec.lastYearTax ?: query?.lastYearTax)?.roundToInt(),
                soldInLast12Months = sold,
                permitInLast90Days = false,
                residential = propClass?.trim()?.startsWith("2") == true,
            )
        }
        val town = records.values.firstNotNullOfOrNull { it.town }?.let { Derived.townName(it) } ?: fromQuery.values.firstNotNullOfOrNull { it.town }?.let { Derived.townName(it) }
        val result = Loaded(ctx.now(), parcels, soldPrices, town)
        loaded[farmId] = result
        return result
    }

    override suspend fun stats(farmId: String): FarmStats {
        val data = load(farmId)
        val homes = data.parcels.filter { it.residential }.ifEmpty { data.parcels }
        val scores = homes.mapNotNull { it.score }.sorted()
        val sold = homes.count { it.soldInLast12Months }
        val median = data.soldPrices.sorted().let { if (it.isEmpty()) null else it[it.size / 2] }
        val notes = ArrayList<TurnoverNote>()
        if (homes.isNotEmpty()) {
            notes += TurnoverNote("trending_up", "${Format.count(sold, "sale")} in 12 months", " across ${Format.count(homes.size, "home")}, from public deed records")
            if (median != null) notes += TurnoverNote("sell", "Median ${Format.money(median)}", " for the homes that sold in the last 12 months")
        }
        return FarmStats(
            medianScore = scores.takeIf { it.isNotEmpty() }?.let { it[it.size / 2] },
            salesIn12Months = sold,
            salesPercent = if (homes.isEmpty()) null else (sold * 1000.0 / homes.size).roundToInt() / 10.0,
            permitsIn90Days = 0,
            turnover = notes,
        )
    }

    override suspend fun createFarm(name: String, boundary: List<LatLng>): Farm {
        if (boundary.size < 3) throw WatchdogException("Boundary too small", userMessage = "Draw at least three points around the neighborhood.")
        val ring = if (boundary.first() == boundary.last()) boundary else boundary + boundary.first()
        val count = runCatching { ctx.farm.mapQuery(ring, offset = 0, limit = 1).count?.toInt() }.getOrNull()
        val created = ctx.farm.createPolygonList(ctx.userId(), name.trim().ifEmpty { "Map-drawn farm" }, ring, count)
        lists = null
        return farm(created)
    }

    companion object {
        const val CACHE_SECONDS = 600
        /** Each page costs one request in the five-minute quota window, so a farm load never takes more than this many. */
        const val MAX_PAGES = 8
        private const val HALF_SIDE_DEGREES = 0.00006

        /** A roughly 13 m square around the centroid, since no source returns the parcel outline. */
        fun markerSquare(lat: Double, lon: Double): List<LatLng> {
            val dLon = HALF_SIDE_DEGREES / maxOf(0.2, Math.cos(Math.toRadians(lat)))
            return listOf(
                LatLng(lat - HALF_SIDE_DEGREES, lon - dLon),
                LatLng(lat - HALF_SIDE_DEGREES, lon + dLon),
                LatLng(lat + HALF_SIDE_DEGREES, lon + dLon),
                LatLng(lat + HALF_SIDE_DEGREES, lon - dLon),
                LatLng(lat - HALF_SIDE_DEGREES, lon - dLon),
            )
        }

        internal fun close(a: Double, b: Double) = abs(a - b) < 1e-9
    }
}
