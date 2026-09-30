package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray

/**
 * The property row and the searches around it.
 *
 * - `GET {siteOrigin}/api/watchdog-property?pin=` and `?address=&lat=&lon=&price=`: the authenticated JSON route
 *   (`api/watchdog-property.js`; Docs/BACKEND-CHANGES.md "the property row as JSON"). Headers `Authorization:
 *   Bearer <access token>` and `Accept: application/json` are added by the HTTP layer. What the route answers:
 *   - 401 `{error:'Sign in again.'}`;
 *   - 400 `{error:'Unknown property.'}` for a bad `pin` or neither parameter, and 400 `{error:'Not a New Jersey
 *     street address.'}` for an `address` that does not parse (no house number);
 *   - 404 `{error:'Not found on the New Jersey tax list.'}`, with `alternatives` for address lookups;
 *   - 429 `{error:'Daily lookup limit reached. It resets at midnight UTC.'}` with `Retry-After: <seconds to UTC
 *     midnight>` (a plain number of seconds, never a timestamp; kept in [QuotaException.retryAfterSeconds]);
 *   - 503 `{error:'Watchdog is unavailable right now. Try again in a minute.'}` with `Retry-After: 60`;
 *   - `HEAD` answers 200 with headers only once the input and token checks pass: no lookup, no usage row.
 *   Errors from outside the function (Vercel's own 502/504 pages) are `text/html`, not JSON; [parse] reads every
 *   error body null-tolerantly and maps those by status alone.
 * - `GET {siteOrigin}/api/agent-property-search?q=&limit=` (site-api-contracts.md 3.6): Bearer + Agent plan;
 *   `rows[].zip` and `rows[].city` are never declared in the DTO, so they are dropped at parse time (MUST NOT DISPLAY).
 * - `GET {siteOrigin}/api/watchdog-true-cost?q=` (3.2): anonymous address search, `[{pin,address,town,county}]`.
 * - `GET {siteOrigin}/api/property-imagery?lat=&lon=` (3.5): the aerial photo fallback.
 */
class PropertyApi(private val site: SiteApi) {

    // ------------------------------------------------------------------ DTOs (the 7.3 contract)

    @Serializable
    data class Response(
        val ok: Boolean = true,
        val confident: Boolean = true,
        val alternatives: List<Alternative> = emptyList(),
        val property: Row,
        @SerialName("photo_url") val photoUrl: String? = null,
        val derived: DerivedBlock? = null,
    )

    @Serializable
    data class Alternative(val pin: String, val address: String? = null, val town: String? = null)

    /** The `get_public_property_page` row. `zip` and `photo_path` are never present and never declared. */
    @Serializable
    data class Row(
        @SerialName("pams_pin") val pamsPin: String,
        val address: String = "",
        val town: String = "",
        val county: String = "",
        val block: String? = null,
        val lot: String? = null,
        val qualifier: String? = null,
        @SerialName("prop_class") val propClass: String? = null,
        @SerialName("year_built") val yearBuilt: Double? = null,
        val acres: Double? = null,
        @SerialName("dwelling_units") val dwellingUnits: Double? = null,
        @SerialName("building_desc") val buildingDesc: String? = null,
        @SerialName("land_value") val landValue: Double? = null,
        @SerialName("improvement_value") val improvementValue: Double? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
        @SerialName("last_sale_price") val lastSalePrice: Double? = null,
        @SerialName("last_sale_date") val lastSaleDate: String? = null,
        @SerialName("last_sale_year") val lastSaleYear: Double? = null,
        @SerialName("source_synced_at") val sourceSyncedAt: String? = null,
        val lat: Double? = null,
        val lon: Double? = null,
        val score: Score? = null,
        @SerialName("town_compare") val townCompare: TownCompare? = null,
        val neighbors: List<Neighbor> = emptyList(),
        @SerialName("recent_sales") val recentSales: List<RecentSale> = emptyList(),
        @SerialName("sales_summary") val salesSummary: SalesSummary? = null,
        @SerialName("alerts_enabled") val alertsEnabled: Boolean = false,
    )

    /** `components` values are bare integers in the contract, but an object with a `score` key is tolerated (the RPC's mixed shape). */
    @Serializable
    data class Score(
        val score: Double? = null,
        val verdict: String? = null,
        val confidence: String? = null,
        @SerialName("evidence_coverage") val evidenceCoverage: Double? = null,
        @SerialName("model_version") val modelVersion: String? = null,
        @SerialName("computed_at") val computedAt: String? = null,
        val source: String? = null,
        val components: Map<String, JsonElement>? = null,
    ) {
        fun component(key: String): Int? {
            val v = components?.get(key) ?: return null
            val n = when (v) {
                is JsonObject -> v.num("score")
                else -> v.doubleOrNull()
            } ?: return null
            if (!n.isFinite()) return null
            return n.coerceIn(0.0, 100.0).let { Math.round(it).toInt() }
        }
    }

    @Serializable
    data class TownCompare(
        val peers: Double? = null,
        @SerialName("median_tax") val medianTax: Double? = null,
        @SerialName("median_assessed") val medianAssessed: Double? = null,
        @SerialName("share_paying_less") val sharePayingLess: Double? = null,
        @SerialName("refreshed_at") val refreshedAt: String? = null,
    )

    @Serializable
    data class Neighbor(
        @SerialName("pams_pin") val pamsPin: String? = null,
        val address: String? = null,
        val town: String? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
    )

    @Serializable
    data class RecentSale(
        @SerialName("pams_pin") val pamsPin: String? = null,
        val address: String? = null,
        val town: String? = null,
        val price: Double? = null,
        val date: String? = null,
        @SerialName("year_built") val yearBuilt: Double? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("same_street") val sameStreet: Boolean = false,
    )

    @Serializable
    data class SalesSummary(
        val count: Double? = null,
        val median: Double? = null,
        @SerialName("first_date") val firstDate: String? = null,
        @SerialName("last_date") val lastDate: String? = null,
    )

    @Serializable
    data class DerivedBlock(
        val display: Display? = null,
        val bill: Bill? = null,
        @SerialName("rate_trend") val rateTrend: RateTrend? = null,
        @SerialName("rate_change") val rateChange: RateChange? = null,
        val chapter123: Chapter123? = null,
        @SerialName("revalued_2026") val revalued2026: Boolean = false,
        @SerialName("holds_up") val holdsUp: HoldsUp? = null,
        @SerialName("town_compare_text") val townCompareText: String? = null,
        @SerialName("next_deadline") val nextDeadline: Deadline? = null,
        @SerialName("price_check") val priceCheck: PriceCheckBlock? = null,
        val links: Links? = null,
    )

    @Serializable
    data class Display(
        val address: String? = null,
        val town: String? = null,
        val county: String? = null,
        @SerialName("class_label") val classLabel: String? = null,
        @SerialName("property_path") val propertyPath: String? = null,
    )

    @Serializable
    data class Bill(val year: Double? = null, val label: String? = null, val current: CurrentBill? = null)

    @Serializable
    data class CurrentBill(val year: Double? = null, val amount: Double? = null, @SerialName("general_rate_only") val generalRateOnly: Boolean = false)

    @Serializable
    data class RatePoint(val year: Double? = null, val rate: Double? = null)

    @Serializable
    data class RateTrend(
        val points: List<RatePoint> = emptyList(),
        val latest: RatePoint? = null,
        val first: RatePoint? = null,
        @SerialName("cut_at_reval") val cutAtReval: Boolean = false,
    )

    @Serializable
    data class RateChange(@SerialName("from_year") val fromYear: Double? = null, @SerialName("to_year") val toYear: Double? = null, @SerialName("per_year_pct") val perYearPct: Double? = null)

    @Serializable
    data class Chapter123(val district: String? = null, @SerialName("tax_year") val taxYear: Double? = null, val ratio: Double? = null, val lower: Double? = null, val upper: Double? = null)

    @Serializable
    data class HoldsUp(val floor: Double? = null, val implied: Double? = null, val limit: Double? = null, val ratio: Double? = null)

    @Serializable
    data class Deadline(val date: String? = null, val note: String? = null)

    @Serializable
    data class PriceCheckBlock(val verdict: String? = null, @SerialName("expected_tax") val expectedTax: Double? = null, val text: String? = null)

    @Serializable
    data class Links(val property: String? = null, @SerialName("true_cost") val trueCost: String? = null, val checkup: String? = null)

    /** A row of `/api/agent-property-search`. `zip`, `city` and every permit/municipal sub-object are ignored on purpose. */
    @Serializable
    data class AgentSearchRow(
        @SerialName("pams_pin") val pamsPin: String,
        val address: String = "",
        val town: String = "",
        val county: String = "",
        val block: String? = null,
        val lot: String? = null,
        val qualifier: String? = null,
        @SerialName("prop_class") val propClass: String? = null,
        @SerialName("year_built") val yearBuilt: Double? = null,
        @SerialName("assessed_value") val assessedValue: Double? = null,
        @SerialName("last_year_tax") val lastYearTax: Double? = null,
    )

    @Serializable
    data class PublicSearchRow(val pin: String, val address: String = "", val town: String = "", val county: String = "")

    @Serializable
    data class Imagery(val aerial: ImageryShot? = null, val street: ImageryShot? = null)

    @Serializable
    data class ImageryShot(@SerialName("image_url") val imageUrl: String? = null, val attribution: String? = null, @SerialName("captured_year") val capturedYear: Double? = null, val provider: String? = null)

    /** The property route said "not found"; [alternatives] are the near misses for an address lookup. */
    class NotFoundException(message: String, val alternatives: List<Alternative>) : WatchdogException("Property not found", userMessage = message)

    // ------------------------------------------------------------------ calls

    suspend fun byPin(pin: String, price: Int? = null): Response {
        if (!Derived.PIN_REGEX.matches(pin)) throw WatchdogException("Bad pin $pin", userMessage = "Unknown property.")
        return parse(site.get(PROPERTY_PATH, mapOf("pin" to pin, "price" to price?.toString())))
    }

    /** Resolves a listing address the way the extension route does; `lat`/`lon` only break ties within 250 m. */
    suspend fun byAddress(address: String, lat: Double? = null, lon: Double? = null, price: Int? = null): Response {
        val clean = address.replace(Regex("\\s+"), " ").trim().take(160)
        if (clean.isEmpty() || !clean.first().isDigit()) throw WatchdogException("Bad address", userMessage = "Not a New Jersey street address.")
        val params = mapOf(
            "address" to clean,
            "lat" to lat?.takeIf { it.isFinite() }?.toString(),
            "lon" to lon?.takeIf { it.isFinite() }?.toString(),
            "price" to price?.toString(),
        )
        return parse(site.get(PROPERTY_PATH, params))
    }

    private suspend fun parse(response: HttpResponse): Response {
        val status = response.status.value
        if (status in 200..299) {
            val element = response.jsonBody()
            return runCatching { WatchdogHttp.json.decodeFromJsonElement(Response.serializer(), element) }
                .getOrElse { throw WatchdogException("Bad property JSON: ${it.message}", it, "Watchdog sent back a property record the app could not read.") }
        }
        // Read null-tolerantly: a gateway page is text or HTML and must still reach the status mapping below.
        val text = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
        val body = WatchdogHttp.parseJsonOrNull(text) as? JsonObject
        if (status == 404) {
            val alternatives = body?.arr("alternatives")?.mapNotNull { alt ->
                (alt as? JsonObject)?.let { a -> a.str("pin")?.let { Alternative(it, a.str("address"), a.str("town")) } }
            } ?: emptyList()
            throw NotFoundException(body?.str("error") ?: "Not found on the New Jersey tax list.", alternatives)
        }
        if (status == 401) throw NotSignedInException()
        // The route's 429 says when the day turns in Retry-After (seconds), so it travels with the exception.
        throw WatchdogHttp.failure(status, body, rawText = text, feature = "property lookup", retryAfter = response.headers[HttpHeaders.RetryAfter])
    }

    /** Agent-plan address search. Throws [PlanRequiredException] on 403 so the caller can fall back to the public search. */
    suspend fun agentSearch(query: String, limit: Int = 8): List<AgentSearchRow> {
        val q = query.trim().take(120)
        if (q.length < 3) return emptyList()
        val response = site.get("/api/agent-property-search", mapOf("q" to q, "limit" to limit.coerceIn(1, 12).toString()))
        if (response.status.value == 403) throw PlanRequiredException("property search")
        WatchdogHttp.expectOk(response, "property search")
        val rows = (response.jsonBody() as? JsonObject)?.arr("rows") ?: JsonArray(emptyList())
        return rows.mapNotNull { runCatching { WatchdogHttp.json.decodeFromJsonElement(AgentSearchRow.serializer(), it) }.getOrNull() }
    }

    /** Anonymous search: needs four characters starting with a digit, otherwise the route answers `[]`. */
    suspend fun publicSearch(query: String): List<PublicSearchRow> {
        val q = query.trim().take(120)
        if (q.length < 4 || !q.first().isDigit()) return emptyList()
        val response = site.get("/api/watchdog-true-cost", mapOf("q" to q))
        if (response.status.value == 503) return emptyList()
        WatchdogHttp.expectOk(response, "address search")
        val element = response.jsonBody()
        val array = runCatching { element.jsonArray }.getOrNull() ?: return emptyList()
        return array.mapNotNull { runCatching { WatchdogHttp.json.decodeFromJsonElement(PublicSearchRow.serializer(), it) }.getOrNull() }
    }

    /** The aerial photo for a parcel. Null when the coordinates are outside New Jersey or the route is down. */
    suspend fun imagery(lat: Double, lon: Double): Imagery? {
        val response = site.get("/api/property-imagery", mapOf("lat" to lat.toString(), "lon" to lon.toString(), "street" to "0"))
        if (response.status.value !in 200..299) return null
        return runCatching { WatchdogHttp.json.decodeFromJsonElement(Imagery.serializer(), response.jsonBody()) }.getOrNull()
    }

    companion object {
        const val PROPERTY_PATH = "/api/watchdog-property"
    }
}
