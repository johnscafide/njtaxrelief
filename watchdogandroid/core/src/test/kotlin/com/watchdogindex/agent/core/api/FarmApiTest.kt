package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import io.ktor.http.HttpMethod
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.json.JsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The farm calls never ask for, declare or keep owner data (ARCHITECTURE.md privacy rule). */
class FarmApiTest {

    private fun api(server: FakeServer): FarmApi {
        val client = TestConfig.client(server)
        return FarmApi(SupabaseRest(client, TestConfig.config), EdgeFunctions(client, TestConfig.config))
    }

    @Test
    fun `workspace asks the server for no owner data and keeps only deed years and CRM counts`() = runBlocking {
        val server = FakeServer()
        // The function would answer owner fields when asked; the app never asks, and never reads them either.
        server.on(HttpMethod.Post, "/functions/v1/farm-workspace") { req ->
            val pins = (req.json()!!["pams_pins"] as JsonArray).size
            json("""{"ok":true,"properties":{"0409_285.14_9":{"owner_name":"WITHHELD OWNER","last_deed_year":2014,"owner_mails_elsewhere":true,"postal_city":"ELSEWHERE, PA"}},"crm":{"matched":$pins,"pending_review":1},"privacy":{"owner_mailing_address_returned":false}}""")
        }
        val pins = (1..300).map { "0409_285.14_$it" }
        val workspace = api(server).workspace(pins)

        val calls = server.requestsTo("/functions/v1/farm-workspace")
        assertEquals(2, calls.size, "250 pins per call")
        for (call in calls) {
            val body = call.json()!!
            assertEquals(false, body.bool("owners"), "owner data is refused at the request: ${call.body}")
            assertEquals(true, body.bool("crm"))
        }
        assertEquals(listOf(250, 50), calls.map { (it.json()!!["pams_pins"] as JsonArray).size })

        assertEquals(mapOf("0409_285.14_9" to 2014), workspace.lastDeedYear)
        assertEquals(300, workspace.crmMatched)
        assertEquals(2, workspace.crmPendingReview)
        val text = workspace.toString().lowercase()
        for (word in listOf("owner", "withheld", "elsewhere", "postal")) assertFalse(text.contains(word), "the workspace carries $word")
    }

    @Test
    fun `no farm DTO declares an owner, mailing, postal or zip field`() {
        val forbidden = listOf("owner", "mailing", "postal", "zip")
        for (descriptor in listOf(FarmApi.ListRow.serializer().descriptor, FarmApi.MapRecord.serializer().descriptor, FarmApi.HydrateRecord.serializer().descriptor, FarmApi.MapPage.serializer().descriptor)) {
            for (name in descriptor.elementNames) {
                assertFalse(forbidden.any { name.lowercase().contains(it) }, "${descriptor.serialName} declares '$name'")
            }
        }
        val workspaceFields = FarmApi.Workspace::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue(workspaceFields.isNotEmpty())
        for (name in workspaceFields) assertFalse(forbidden.any { name.contains(it) }, "Workspace declares '$name'")
    }

    @Test
    fun `hydrate drops owner and mailing keys at parse time`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/functions/v1/workbench-hydrate") {
            json("""{"records":[{"pams_pin":"0409_285.14_9","address":"36 BIRCHWOOD DR","town":"CHERRY HILL TWP","lat":39.9,"lon":-75.0,"deed_date":"2014-06-02","owner_name":"WITHHELD OWNER","mailing_address":"1 ELSEWHERE RD","zip":"19000"}]}""")
        }
        val records = api(server).hydrate(listOf("0409_285.14_9"))
        assertEquals(1, records.size)
        assertEquals("2014-06-02", records.single().deedDate)
        val text = records.toString().lowercase()
        for (word in listOf("owner", "withheld", "elsewhere", "19000")) assertFalse(text.contains(word), "a hydrate record carries $word")
    }
}
