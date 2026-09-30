package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.math.TaxMath
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.LocalDate
import kotlinx.serialization.descriptors.elementNames
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The app's side of the `GET /api/watchdog-property` contract. The fixture is the exact success body the route's
 * own contract test prints (`WATCHDOG_PROPERTY_SAMPLE=1 node property/tests/watchdog-property-json-contract.mjs`,
 * checked in as `src/test/resources/watchdog-property-sample.json`), so a change on either side shows up here.
 */
class PropertyApiTest {

    private val sample: String = checkNotNull(PropertyApiTest::class.java.getResource("/watchdog-property-sample.json")) {
        "watchdog-property-sample.json is missing from src/test/resources"
    }.readText()

    private val config = WatchdogConfig(supabaseUrl = "https://supabase.test", supabaseAnonKey = "anon-key", siteOrigin = "https://site.test")
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json; charset=utf-8")

    private fun decode(text: String): PropertyApi.Response = WatchdogHttp.json.decodeFromString(PropertyApi.Response.serializer(), text)

    // ------------------------------------------------------------------ decoding the route's body

    @Test
    fun `the route's sample body decodes to the contract`() {
        val response = decode(sample)
        val row = response.property
        assertTrue(response.ok)
        assertTrue(response.confident, "a pin lookup has no confident flag; the default is true")
        assertEquals(emptyList(), response.alternatives)
        assertEquals("0904_9_20", row.pamsPin)
        assertEquals("102 GRANT AVE", row.address)
        assertEquals("HARRISON TOWN", row.town)
        assertEquals("HUDSON", row.county)
        assertEquals(424300.0, row.assessedValue)
        assertEquals(9954.08, row.lastYearTax)
        assertEquals(40.7357, row.lat)
        assertEquals(-74.1724, row.lon)
        assertEquals("https://example.supabase.co/storage/v1/object/sign/property-photos/a.jpg?token=t", response.photoUrl)

        val score = assertNotNull(row.score)
        assertEquals(78.0, score.score)
        assertEquals("Favorable tax position", score.verdict)
        assertEquals("robust_public_cache", score.source)
        assertEquals(
            listOf(60, 100, 86, 69, null, 45),
            listOf("recourse", "fairness", "burden", "uniformity", "stability", "trajectory").map { score.component(it) },
            "components are the route's bare integers, with null kept as null",
        )

        val derived = assertNotNull(response.derived)
        assertEquals("/nj/harrison-town/102-grant-ave/0904_9_20", derived.display?.propertyPath)
        assertEquals(derived.display?.propertyPath, Derived.propertyPath(row.town, row.address, row.pamsPin), "the app builds the same public path as the site")
        assertEquals(2024, derived.bill?.year?.toInt())
        assertEquals(2025, derived.bill?.current?.year?.toInt())
        assertEquals(10115.31, derived.bill?.current?.amount)
        assertEquals(false, derived.bill?.current?.generalRateOnly)
        assertEquals(2026, derived.chapter123?.taxYear?.toInt())
        assertEquals(69.39, derived.chapter123?.ratio)
        assertEquals(531704.0, derived.holdsUp?.floor)
        assertNull(derived.priceCheck, "no price was sent, so there is no price check")
        assertEquals("May 1 if your town revalues that year", derived.nextDeadline?.note)
        assertEquals("https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20", derived.links?.property)
        assertFalse(derived.links?.trueCost.orEmpty().contains("/property/"), "public links are clean root-level URLs")
    }

    @Test
    fun `no owner, mailing, zip or storage-key field can be decoded or shown`() {
        val forbidden = listOf("zip", "photo_path", "owner", "mailing")
        for (descriptor in listOf(PropertyApi.Row.serializer().descriptor, PropertyApi.Neighbor.serializer().descriptor, PropertyApi.RecentSale.serializer().descriptor, PropertyApi.AgentSearchRow.serializer().descriptor)) {
            for (name in descriptor.elementNames) {
                assertFalse(forbidden.any { name.lowercase().contains(it) }, "${descriptor.serialName} declares '$name'")
            }
        }
        val lower = sample.lowercase()
        for (word in listOf("\"zip\"", "photo_path", "owner", "mailing", "07105")) assertFalse(lower.contains(word), "the route's sample body contains $word")

        // Even if a server ever sent such a key, the DTO drops it at parse time and the screen model never sees it.
        val withStray = sample.replaceFirst("\"pams_pin\": \"0904_9_20\"", "\"pams_pin\": \"0904_9_20\", \"zip\": \"07105\", \"owner_name\": \"X\"")
        val detail = PropertyMapper(today = { LocalDate(2026, 9, 29) }).detail(decode(withStray))
        val text = detail.toString().lowercase()
        for (word in listOf("07105", "owner", "mailing")) assertFalse(text.contains(word), "the screen model carries $word")
    }

    @Test
    fun `the mapper builds the Property screen from the sample`() {
        val response = decode(sample)
        val detail = PropertyMapper(today = { LocalDate(2026, 9, 29) }).detail(response)

        assertEquals("102 Grant Ave", detail.summary.address)
        assertEquals("Harrison Town", detail.summary.town)
        assertEquals("Hudson County", detail.summary.county)
        assertEquals("Class 2 · Residential", detail.summary.propertyClassLabel)
        assertEquals(78, detail.summary.score)
        assertEquals(9954, detail.summary.taxBill)

        val score = assertNotNull(detail.score)
        assertEquals(78, score.score)
        assertEquals(85, score.coveragePercent)
        assertEquals("high", score.confidence)

        assertEquals(listOf('R', 'O', 'B', 'U', 'T'), detail.robust.map { it.letter }, "the null Stability part is left out, never shown as zero")
        assertEquals(listOf(60, 100, 86, 69, 45), detail.robust.map { it.score })

        val tax = assertNotNull(detail.tax)
        assertEquals(2024, tax.billYear)
        assertEquals(9954, tax.bill)
        assertEquals(2025, tax.nextYear)
        assertEquals(10115, tax.nextYearBill)
        assertEquals(10828, tax.townMedian)
        assertEquals("Harrison", tax.townName)
        assertEquals(2020, tax.rateHistory.first().year)
        assertEquals(2025, tax.rateHistory.last().year)

        val value = assertNotNull(detail.valueCheck)
        assertEquals(424300, value.assessed)
        assertEquals(TaxMath.roundToHundred(531704.0), value.holdsUpAbove, "the route's floor, rounded the way the screen shows it")
        assertEquals(TaxMath.roundToHundred(611471.0), value.impliedValue)
        assertEquals(700000, value.salesMedian)
        assertEquals(69, value.salesCount)

        val sales = assertNotNull(detail.sales)
        assertEquals(69, sales.count)
        assertEquals(700000, sales.median)
        assertEquals(listOf("134 Grant Ave"), sales.sales.map { it.address })
        assertEquals(775000, sales.sales.single().price)

        assertEquals(1900, detail.facts.built)
        assertEquals("2 SF 2 FAM", detail.facts.style)
        assertEquals("9", detail.facts.block)
        assertEquals("20", detail.facts.lot)
        assertNull(detail.facts.livingAreaSqFt, "living area has no public source in the row")

        assertEquals(response.photoUrl, detail.imageUrl)
        assertTrue(detail.sources.contains("2026 Chapter 123 ratios"), detail.sources)
        assertTrue(detail.sources.contains("Watchdog Score (ROBUST-v1)"), detail.sources)
    }

    @Test
    fun `an address body that is not confident decodes with its alternatives`() {
        val body = """
            {"ok":true,
             "property":{"pams_pin":"0904_9_20","address":"102 GRANT AVE","town":"HARRISON TOWN","county":"HUDSON","score":null,
                         "neighbors":[],"recent_sales":[],"sales_summary":{"count":0,"median":null,"first_date":null,"last_date":null},"alerts_enabled":false},
             "photo_url":null,
             "derived":{"display":{"address":"102 Grant Ave","town":"Harrison Town","county":"Hudson","class_label":null,"property_path":"/nj/harrison-town/102-grant-ave/0904_9_20"},
                        "bill":{"year":null,"label":"Latest annual tax","current":null},
                        "rate_trend":null,"rate_change":null,"chapter123":null,"revalued_2026":false,"holds_up":null,"town_compare_text":null,
                        "next_deadline":{"date":"April 1, 2027","note":"May 1 if your town revalues that year"},"price_check":null,
                        "links":{"property":"https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20","true_cost":"https://www.watchdogindex.com/true-cost?pin=0904_9_20","checkup":"https://www.watchdogindex.com/checkup?pin=0904_9_20"}},
             "confident":false,
             "alternatives":[{"pin":"1210_116_2","address":"102 Grant Ave","town":"Middlesex Borough"}],
             "a_new_server_field":{"anything":true}}
        """.trimIndent()
        val response = decode(body)
        assertFalse(response.confident)
        assertEquals(listOf(PropertyApi.Alternative("1210_116_2", "102 Grant Ave", "Middlesex Borough")), response.alternatives)
        assertNull(response.property.score)
        assertNull(response.derived?.chapter123)
        assertEquals("Latest annual tax", response.derived?.bill?.label)

        val detail = PropertyMapper(today = { LocalDate(2026, 9, 29) }).detail(response)
        assertNull(detail.score)
        assertNull(detail.valueCheck, "nothing to derive: no value check is invented")
        assertEquals(emptyList(), detail.robust)
    }

    // ------------------------------------------------------------------ the HTTP layer around it

    private class Fake(val engine: MockEngine, val api: PropertyApi)

    private fun fake(token: String? = "tok", refresher: TokenRefresher? = null, handler: MockRequestHandler): Fake {
        val engine = MockEngine(handler)
        val client = WatchdogHttp.create(engine, config, TokenProvider { token }, refresher)
        return Fake(engine, PropertyApi(SiteApi(client, config)))
    }

    @Test
    fun `a 401 is retried once with the refreshed token`() = runBlocking {
        val refreshed = mutableListOf<String>()
        val f = fake(token = "stale", refresher = TokenRefresher { stale -> refreshed += stale; "fresh" }) { request ->
            if (request.headers[HttpHeaders.Authorization] == "Bearer fresh") respond(sample, HttpStatusCode.OK, jsonHeaders)
            else respond("""{"error":"Sign in again."}""", HttpStatusCode.Unauthorized, jsonHeaders)
        }
        val response = f.api.byPin("0904_9_20")
        assertEquals("0904_9_20", response.property.pamsPin)
        assertEquals(listOf("stale"), refreshed, "the refresher is told which token failed")
        assertEquals(2, f.engine.requestHistory.size, "one retry, no more")
        assertEquals(listOf("Bearer stale", "Bearer fresh"), f.engine.requestHistory.map { it.headers[HttpHeaders.Authorization] })
        for (request in f.engine.requestHistory) {
            assertNull(request.headers["apikey"], "site routes never get the Supabase anon key")
            assertEquals("https://site.test/api/watchdog-property?pin=0904_9_20", request.url.toString())
            assertEquals("Watchdog-Android/${WatchdogHttp.DEFAULT_APP_VERSION} (Android)", request.headers[HttpHeaders.UserAgent])
        }
    }

    @Test
    fun `a 401 that cannot be refreshed is Not signed in`() = runBlocking {
        val f = fake(token = "stale", refresher = TokenRefresher { null }) { respond("""{"error":"Sign in again."}""", HttpStatusCode.Unauthorized, jsonHeaders) }
        val e = assertFailsWith<NotSignedInException> { f.api.byPin("0904_9_20") }
        assertEquals("Sign in to continue.", e.userMessage)
        assertEquals(1, f.engine.requestHistory.size, "no retry without a new token")
    }

    @Test
    fun `a 404 carries the closest listings`() = runBlocking {
        val f = fake { respond("""{"error":"Not found on the New Jersey tax list.","alternatives":[{"pin":"0904_9_20","address":"102 Grant Ave","town":"Harrison Town"},{"pin":"0904_9_99","address":"102 Grant St","town":"Harrison Town"}]}""", HttpStatusCode.NotFound, jsonHeaders) }
        val e = assertFailsWith<PropertyApi.NotFoundException> { f.api.byAddress("7 Nowhere Rd, Harrison, NJ", lat = 40.7359, lon = -74.1726) }
        assertEquals("Not found on the New Jersey tax list.", e.userMessage)
        assertEquals(listOf("0904_9_20", "0904_9_99"), e.alternatives.map { it.pin })
        val url = f.engine.requestHistory.single().url
        assertEquals("7 Nowhere Rd, Harrison, NJ", url.parameters["address"])
        assertEquals("40.7359", url.parameters["lat"])
        assertEquals("-74.1726", url.parameters["lon"])
        assertNull(url.parameters["price"], "no price, no price parameter")
    }

    @Test
    fun `a 429 keeps the Retry-After seconds apart from a reset timestamp`() = runBlocking {
        val f = fake { respond("""{"error":"Daily lookup limit reached. It resets at midnight UTC."}""", HttpStatusCode.TooManyRequests, headersOf(HttpHeaders.ContentType to listOf("application/json; charset=utf-8"), HttpHeaders.RetryAfter to listOf("42371"))) }
        val e = assertFailsWith<QuotaException> { f.api.byPin("0904_9_20") }
        assertEquals("Daily lookup limit reached. It resets at midnight UTC.", e.userMessage, "the server's plain sentence is shown as-is")
        assertEquals(42371, e.retryAfterSeconds)
        assertNull(e.resetAt, "a number of seconds is never passed off as a timestamp")
        assertNull(e.limit)
    }

    @Test
    fun `a 503 shows the server's sentence`() = runBlocking {
        val f = fake { respond("""{"error":"Watchdog is unavailable right now. Try again in a minute."}""", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType to listOf("application/json; charset=utf-8"), HttpHeaders.RetryAfter to listOf("60"))) }
        val e = assertFailsWith<HttpFailureException> { f.api.byPin("0904_9_20") }
        assertEquals(503, e.status)
        assertEquals("Watchdog is unavailable right now. Try again in a minute.", e.userMessage)
    }

    @Test
    fun `a bad pin or address is refused before any request`() = runBlocking {
        val f = fake { respond(sample, HttpStatusCode.OK, jsonHeaders) }
        assertEquals("Unknown property.", assertFailsWith<WatchdogException> { f.api.byPin("0904'; drop") }.userMessage)
        assertEquals("Not a New Jersey street address.", assertFailsWith<WatchdogException> { f.api.byAddress("Grant Ave, Harrison, NJ") }.userMessage)
        assertEquals(0, f.engine.requestHistory.size)
    }

    @Test
    fun `an unreadable body is a friendly error, not a crash`() = runBlocking {
        val f = fake { respond("<html>Gateway timeout</html>", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/html")) }
        val e = assertFailsWith<WatchdogException> { f.api.byPin("0904_9_20") }
        assertIs<WatchdogException>(e)
        assertTrue(e.userMessage.contains("could not read"), e.userMessage)
    }

    @Test
    fun `a non-JSON 502 page maps by status to a retryable server failure`() = runBlocking {
        val f = fake { respond("<!DOCTYPE html><html><body>502: Bad gateway</body></html>", HttpStatusCode.BadGateway, headersOf(HttpHeaders.ContentType, "text/html; charset=utf-8")) }
        val e = assertFailsWith<HttpFailureException> { f.api.byPin("0904_9_20") }
        assertEquals(502, e.status)
        assertNull(e.code)
        assertNull(e.serverError, "an HTML page is never shown or logged as the server's error text")
        assertEquals("Watchdog could not reach the property intelligence service. Please try again.", e.userMessage)
        assertFalse(e.userMessage.contains("could not read"), "a platform error page is a server failure, not an unreadable answer")
    }

    @Test
    fun `a text 503 and a text 429 still reach their branches with Retry-After`() = runBlocking {
        val f = fake { request ->
            if (request.url.parameters["pin"] == "0904_9_20") respond("Service Unavailable", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType to listOf("text/plain"), HttpHeaders.RetryAfter to listOf("60")))
            else respond("Too Many Requests", HttpStatusCode.TooManyRequests, headersOf(HttpHeaders.ContentType to listOf("text/plain"), HttpHeaders.RetryAfter to listOf("120")))
        }
        val unavailable = assertFailsWith<HttpFailureException> { f.api.byPin("0904_9_20") }
        assertEquals(503, unavailable.status)
        assertFalse(unavailable is QuotaException)
        val limited = assertFailsWith<QuotaException> { f.api.byPin("0904_9_21") }
        assertEquals(120, limited.retryAfterSeconds, "the Retry-After seconds survive a body that is not JSON")
        assertNull(limited.resetAt)
    }
}
