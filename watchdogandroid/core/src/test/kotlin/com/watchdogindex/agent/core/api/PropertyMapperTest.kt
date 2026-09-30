package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.VerdictKind
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PropertyMapperTest {
    private val mapper = PropertyMapper { LocalDate(2026, 9, 28) }
    private val response = WatchdogHttp.json.decodeFromString(PropertyApi.Response.serializer(), PropertyFixture.json)

    @Test
    fun `summary uses the derived display strings`() {
        val s = mapper.summary(response)
        assertEquals("0904_9_20", s.pin)
        assertEquals("102 Grant Ave", s.address)
        assertEquals("Harrison Town", s.town)
        assertEquals("Hudson County", s.county)
        assertEquals("Block 9, Lot 20", s.blockLot)
        assertEquals(78, s.score)
        assertEquals(9954, s.taxBill)
        assertEquals("Class 2 · Residential", s.propertyClassLabel)
        assertEquals(40.7449, s.lat)
    }

    @Test
    fun `detail maps the score card and the ROBUST dimensions in order`() {
        val d = mapper.detail(response)
        val score = assertNotNull(d.score)
        assertEquals(78, score.score)
        assertEquals("Favorable tax position", score.verdict)
        assertEquals(85, score.coveragePercent)
        assertEquals("high", score.confidence)
        assertTrue(score.explanation.contains("Evidence coverage 85%, high confidence."), score.explanation)
        assertEquals(listOf('R', 'O', 'B', 'U', 'T'), d.robust.map { it.letter }, "stability is null in the row and is dropped")
        assertEquals(listOf("Recourse", "Overassessment", "Burden", "Uniformity", "Trajectory"), d.robust.map { it.name })
        assertEquals(listOf(60, 100, 86, 69, 45), d.robust.map { it.score }, "a {score: 100} object and bare numbers both read")
    }

    @Test
    fun `detail maps the tax card from bill and rate trend`() {
        val tax = assertNotNull(mapper.detail(response).tax)
        assertEquals(2024, tax.billYear)
        assertEquals(9954, tax.bill)
        assertEquals("2024 bill on the state tax list", tax.billSourceLabel)
        assertEquals(2025, tax.nextYear)
        assertEquals(10115, tax.nextYearBill)
        assertEquals("Harrison", tax.townName)
        assertEquals(10828, tax.townMedian)
        assertEquals(6, tax.rateHistory.size)
        assertEquals(2.384, tax.rateHistory.last().ratePer100)
        assertTrue(tax.rateTrendLabel!!.endsWith("a year since 2020"), tax.rateTrendLabel!!)
    }

    @Test
    fun `detail maps the value check from holds_up chapter123 and the sales summary`() {
        val vc = assertNotNull(mapper.detail(response).valueCheck)
        assertEquals(424300, vc.assessed)
        assertEquals(531700, vc.holdsUpAbove)
        assertEquals(611500, vc.impliedValue)
        assertEquals(69.39, vc.ratioPercent)
        assertEquals(585000, vc.salesMedian)
        assertEquals(3, vc.salesCount)
        assertEquals("since January", vc.salesSinceLabel)
        assertEquals(400_000, vc.rangeMin)
        assertEquals(700_000, vc.rangeMax)
        assertEquals(VerdictKind.Good, vc.verdict.kind)
        assertEquals("Holds up at today’s prices", vc.verdict.title)
    }

    @Test
    fun `detail maps nearby sales facts and sources`() {
        val d = mapper.detail(response)
        val sales = assertNotNull(d.sales)
        assertEquals(3, sales.count)
        assertEquals("since Jan 2026", sales.sinceLabel)
        assertEquals("88 Grant Ave", sales.sales.first().address)
        assertEquals("Jun 2026", sales.sales.first().monthLabel)
        assertEquals(585000, sales.sales.first().price)
        assertNull(sales.lastSoldPrice)
        assertEquals("2 · Residential", d.facts.propertyClass)
        assertEquals(1900, d.facts.built)
        assertEquals("2 SF 2 FAM", d.facts.style, "the raw MOD-IV description; there is no decoder")
        assertNull(d.facts.livingAreaSqFt, "no living-area source exists for the app")
        assertEquals(0.0574, d.facts.lotAcres)
        assertEquals("9", d.facts.block)
        assertEquals("20", d.facts.lot)
        assertEquals("Sources: NJ MOD-IV tax list, NJ Division of Taxation rates, 2026 Chapter 123 ratios, SR1A deed sales, town tax percentiles, Watchdog Score (ROBUST-v1). A screening check, not an appraisal.", d.sources)
        assertNull(d.imageUrl)
    }

    @Test
    fun `nearby sales carry the whole since phrase, and none without a first sale date`() {
        // SalesNearby.sinceLabel is appended verbatim by the card ("7 similar sales since Jan 2026"), so it owns the "since".
        assertTrue(mapper.detail(response).sales!!.sinceLabel.startsWith("since "))
        val marker = "\"first_date\": \"2026-01-14\", "
        assertTrue(PropertyFixture.json.contains(marker), "fixture drifted: sales_summary.first_date not found")
        val noFirstDate = WatchdogHttp.json.decodeFromString(PropertyApi.Response.serializer(), PropertyFixture.json.replace(marker, ""))
        val d = mapper.detail(noFirstDate)
        assertEquals("", assertNotNull(d.sales).sinceLabel, "nothing to append: the card then reads '3 similar sales'")
        assertNull(assertNotNull(d.valueCheck).salesSinceLabel)
    }

    @Test
    fun `scan result computes the price check locally when the server sent none`() {
        val scan = mapper.scanResult(response, listPrice = 650_000, priceSourceLabel = "From the pasted link", matchLabel = "Zillow listing · parcel matched")
        assertEquals(78, scan.score)
        assertEquals("Favorable tax position", scan.verdict)
        assertEquals(2024, scan.taxBillYear)
        assertEquals(9954, scan.taxBill)
        assertEquals(2025, scan.nextYear)
        assertEquals(10115, scan.nextYearBill)
        assertEquals(650_000, scan.listPrice)
        val check = assertNotNull(scan.priceCheck)
        assertEquals(PriceCheckKind.InLine, check.kind)
        assertEquals("In line for this price", check.title)
        assertTrue(check.expectedTax!! in 10_700..10_800, "typical bill = price × ratio × rate: ${check.expectedTax}")
        assertNull(mapper.scanResult(response, null, "Add the list price", null).priceCheck)
        // The saved flag is the repository's to supply; the mapper defaults it to false and passes it through.
        assertFalse(scan.isSaved)
        assertTrue(mapper.scanResult(response, null, "Add the list price", null, isSaved = true).isSaved)
    }

    @Test
    fun `scan result prefers the server's price check`() {
        val withCheck = WatchdogHttp.json.decodeFromString(PropertyApi.Response.serializer(), PropertyFixture.withPriceCheck(650_000))
        val scan = mapper.scanResult(withCheck, 650_000, "From the pasted link", null)
        assertEquals(PriceCheckKind.InLine, scan.priceCheck!!.kind)
        assertEquals(10753, scan.priceCheck!!.expectedTax)
        assertTrue(scan.priceCheck!!.body.startsWith("Homes that sell near"))
    }

    @Test
    fun `the api sends the right query and maps not found with alternatives`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Get, PropertyApi.PROPERTY_PATH) { req ->
            when {
                req.param("pin") == PropertyFixture.PIN -> json(PropertyFixture.json)
                req.param("address") != null -> json("""{"error":"Not found on the New Jersey tax list. New construction and some condos are not listed yet.","alternatives":[{"pin":"0904_9_21","address":"104 Grant Ave","town":"Harrison Town"}]}""", HttpStatusCode.NotFound)
                else -> json("""{"error":"Unknown property."}""", HttpStatusCode.BadRequest)
            }
        }
        val api = PropertyApi(SiteApi(TestConfig.client(server), TestConfig.config))
        val byPin = api.byPin(PropertyFixture.PIN, price = 650_000)
        assertEquals("102 GRANT AVE", byPin.property.address)
        val req = server.requests.last()
        assertEquals("650000", req.param("price"))
        assertEquals("Bearer access-1", req.headers["Authorization"])
        val notFound = assertFailsWith<PropertyApi.NotFoundException> { api.byAddress("999 Nowhere St, Harrison, NJ", 40.7, -74.1) }
        assertEquals("0904_9_21", notFound.alternatives.single().pin)
        assertEquals("40.7", server.requests.last().param("lat"))
        assertFailsWith<WatchdogException> { api.byPin("not-a-pin") }
        Unit
    }
}
