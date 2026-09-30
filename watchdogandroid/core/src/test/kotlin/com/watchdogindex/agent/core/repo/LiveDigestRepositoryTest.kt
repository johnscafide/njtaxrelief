package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.TestConfig
import com.watchdogindex.agent.core.model.ChangeKind
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.TaskActionKind
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Rebuilds the week from a fixture event set on Wednesday, September 30, 2026. Eleven homes have qualifying events;
 * the top list keeps ten, one per home; routine refreshes and homes outside the sphere never count.
 */
class LiveDigestRepositoryTest {

    private fun event(id: Int, type: String, pin: String?, occurred: String, delta: Double? = null, severity: String = "info", source: Boolean = true, payloadAddress: String? = null, title: String? = null) = buildString {
        append("{\"id\":$id,\"pams_pin\":${pin?.let { "\"$it\"" } ?: "null"},\"event_type\":\"$type\",\"severity\":\"$severity\",")
        append("\"title\":\"${title ?: "$type changed"}\",\"summary\":\"Watchdog recorded a sourced before-and-after change.\",")
        append("\"source_url\":${if (source) "\"https://www.nj.gov/treasury/taxation/lpt/statdata.shtml\"" else "null"},\"occurred_at\":\"$occurred\",")
        append("\"payload\":{${payloadAddress?.let { "\"property_address\":\"$it\",\"municipality\":\"GLOUCESTER TWP\"" } ?: ""}},")
        append("\"marker_id\":${if (type == "tax_change") "\"property.last_year_tax\"" else "null"},\"old_value\":null,\"new_value\":null,\"delta_numeric\":${delta ?: "null"},\"read_at\":null}")
    }

    private val farmPins = (1..6).map { "0409_285.14_$it" }

    private val events = listOf(
        event(1, "tax_change", "0905_112_7", "2026-09-29T10:00:00Z", delta = 612.0, severity = "action"),
        event(2, "tax_change", "0905_112_7", "2026-09-28T10:00:00Z", delta = 612.0, severity = "action", source = false),
        event(3, "assessment_change", "0905_112_7", "2026-09-28T09:00:00Z", delta = 4200.0, severity = "action", source = false),
        event(4, "permit_change", "1340_44_3", "2026-09-29T12:00:00Z", severity = "action", title = "Kitchen permit filed"),
        event(5, "deed_change", "0409_285.14_9", "2026-09-29T08:00:00Z", severity = "action", title = "Deed recorded"),
        event(6, "municipal_change", null, "2026-09-29T07:00:00Z", severity = "action", payloadAddress = "5 LAUREL CT", title = "Revaluation set for 2027"),
        event(7, "source_refresh", "0905_112_7", "2026-09-30T06:00:00Z"),
        event(8, "tax_change", "9999_1_1", "2026-09-30T06:00:00Z", delta = 900.0, severity = "action"),
        event(9, "tax_change", "0905_97_4", "2026-09-29T11:00:00Z", delta = 388.0, source = false),
        event(20, "tax_change", "0905_112_7", "2026-09-20T10:00:00Z", delta = 50.0, severity = "action"),
    ) + farmPins.mapIndexed { i, pin -> event(10 + i, "deed_change", pin, "2026-09-28T1${i}:00:00Z", severity = "action", title = "Deed recorded") }

    private val farmRows = """[
      {"id":"f-hamilton","pams_pin":"0905_112_7","contact_ref":"CRM-104","address":"27 HAMILTON ST","municipality":"HARRISON TOWN","relationship":"past_client","source":"csv","match_status":"matched"},
      {"id":"f-spring","pams_pin":"1340_44_3","contact_ref":"CRM-212","address":"61 SPRING ST","municipality":"RED BANK BORO","relationship":"sphere","source":"csv","match_status":"matched"},
      {"id":"f-laurel","pams_pin":null,"contact_ref":"CRM-131","address":"5 Laurel Ct","municipality":"GLOUCESTER TWP","relationship":"past_client","source":"csv","match_status":"pending"},
      {"id":"f-b9","pams_pin":"0409_285.14_9","contact_ref":null,"address":"36 BIRCHWOOD DR","municipality":"CHERRY HILL TWP","relationship":"farm","source":"manual","match_status":"matched"}
      ${farmPins.mapIndexed { i, pin -> ",{\"id\":\"f-b$i\",\"pams_pin\":\"$pin\",\"contact_ref\":null,\"address\":\"${10 + i} BIRCHWOOD DR\",\"municipality\":\"CHERRY HILL TWP\",\"relationship\":\"farm\",\"source\":\"manual\",\"match_status\":\"matched\"}" }.joinToString("")}
    ]"""

    private val savedRows = """[{"id":"s1","pams_pin":"0905_97_4","address":"14 CLEVELAND AVE","town":"HARRISON TOWN","kind":"watch","assessed":210000,"last_year_tax":5531}]"""

    private fun server(): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/rest/v1/property_update_events") { req ->
            assertTrue(req.param("occurred_at")!!.startsWith("gte.2026-09-28T04:00:00Z"), "since Monday 00:00 New Jersey time: ${req.param("occurred_at")}")
            val since = req.param("occurred_at")!!.removePrefix("gte.")
            json("[" + events.filter { Regex("\"occurred_at\":\"([^\"]+)\"").find(it)!!.groupValues[1] >= since }.joinToString(",") + "]")
        }
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { json(farmRows) }
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { json(savedRows) }
        server.on(HttpMethod.Post, "/rest/v1/rpc/marketing_studio_bootstrap") { json("""{"code":"P0001","message":"Marketing Studio requires Agent or higher"}""", HttpStatusCode.BadRequest) }
        return server
    }

    @Test
    fun `this week keeps ten homes with one reason each and counts every grouped change`() = runBlocking {
        val server = server()
        val set = TestConfig.liveSet(server)
        val week = set.digest.thisWeek()

        assertEquals(LocalDate(2026, 9, 28), week.weekStart)
        assertEquals("This week · since Sep 28", week.periodLabel)
        assertEquals("Wednesday, September 30", week.dateLabel)
        assertEquals(10, week.changes.size)
        assertEquals(10, week.changes.map { it.pin ?: it.subtitle }.distinct().size, "one reason per home")
        assertTrue(week.changes.none { it.pin == "0905_97_4" }, "the eleventh, lowest-scoring home is cut")
        assertTrue(week.changes.none { it.pin == "9999_1_1" }, "events outside the sphere never count")

        val hamilton = week.changes.first()
        assertEquals("0905_112_7", hamilton.pin)
        assertEquals(ChangeKind.TaxBill, hamilton.kind)
        assertEquals("Tax bill up $612", hamilton.title)
        assertEquals("27 Hamilton St, Harrison Town · Past client", hamilton.subtitle)
        assertEquals(Relationship.PastClient, hamilton.relationship)
        assertEquals("receipt_long", hamilton.icon)
        assertEquals("NJ Division of Taxation and municipal tax records", hamilton.sourceNote)

        val laurel = week.changes.first { it.subtitle.startsWith("5 Laurel Ct") }
        assertEquals(ChangeKind.Town, laurel.kind)
        assertEquals("Revaluation set for 2027", laurel.title)

        assertEquals(12, week.total, "grouped reasons: 2 tax, 1 assessment, 1 permit, 7 deeds, 1 town")
        assertEquals(2, week.taxBills)
        assertEquals(1, week.permits)
        assertEquals(7, week.sales)
        assertEquals(1, week.town)

        val call = assertNotNull(week.tasks.firstOrNull { it.action.kind == TaskActionKind.Call })
        assertEquals("Call about 27 Hamilton St", call.title)
        assertEquals("Past client · tax bill up $612", call.subtitle)
        assertEquals("property/0905_112_7", call.action.route)
        assertTrue(week.tasks.none { it.id == "task-send-checkups" }, "the checkup-season task is a February rule")
        assertTrue(week.tasks.none { it.id.startsWith("task-approve") }, "a marketing plan denial drops the task quietly")
        assertEquals(1, week.needsYouCount)
        assertEquals("Tax bill up $612 at 27 Hamilton St, Harrison Town. Two homes in your sphere have new tax bills this week.", week.teaser!!.text)
    }

    @Test
    fun `the brief window starts on Monday, and on a Monday covers the week that just ended`() {
        assertEquals(LocalDate(2026, 9, 28), com.watchdogindex.agent.core.api.Derived.digestWeekStart(kotlinx.datetime.Instant.parse("2026-09-30T14:00:00Z")))
        assertEquals(LocalDate(2026, 9, 21), com.watchdogindex.agent.core.api.Derived.digestWeekStart(kotlinx.datetime.Instant.parse("2026-09-28T13:30:00Z")), "Monday, September 28 reads since Sep 21")
        assertEquals(LocalDate(2026, 9, 21), com.watchdogindex.agent.core.api.Derived.digestWeekStart(kotlinx.datetime.Instant.parse("2026-09-28T02:00:00Z")), "still Sunday night in New Jersey")
    }

    @Test
    fun `done marks persist on the device and reset with the week`() = runBlocking {
        val store = InMemoryKeyValueStore()
        val set = TestConfig.liveSet(server(), store)
        val before = set.digest.thisWeek()
        val task = before.tasks.first()
        set.digest.markTaskDone(task.id, true)
        val after = set.digest.thisWeek()
        assertTrue(after.tasks.first { it.id == task.id }.done)
        assertEquals(before.needsYouCount - 1, after.needsYouCount)
        assertTrue(store.snapshot().keys.any { it.contains("digest_done_tasks") })
        set.digest.markTaskDone(task.id, false)
        assertEquals(before.needsYouCount, set.digest.thisWeek().needsYouCount)
    }
}
