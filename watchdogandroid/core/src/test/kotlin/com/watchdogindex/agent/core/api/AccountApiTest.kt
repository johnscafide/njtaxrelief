package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import io.ktor.http.HttpMethod
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AccountApiTest {

    private fun server(entitlement: String, hasPlan: String, profile: String = """[{"id":"user-1","display_name":null,"full_name":"Alex Moreno","vanity_slug":"alex-moreno","avatar_url":null,"pro_agent":{"brokerage_name":"Northfield & Main Realty","business_phone":"(732) 555-0148","brokerage_address":"1 Main St"}}]"""): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/rest/v1/rpc/get_my_entitlement") { json(entitlement) }
        server.on(HttpMethod.Post, "/rest/v1/rpc/has_watchdog_plan") { json(hasPlan) }
        server.on(HttpMethod.Get, "/rest/v1/profiles") { json(profile) }
        server.on(HttpMethod.Get, "/auth/v1/user") { json("""{"id":"user-1","email":"agent@example.com","created_at":"2026-01-02T00:00:00Z","user_metadata":{"full_name":"Alexandra Moreno","watchdog_profile":{"preferred_name":"Alex","phone":"(732) 555-0100"}}}""") }
        return server
    }

    @Test
    fun `an active agent plan reads as the Agent label and the server's gate answer`() = runBlocking {
        val server = server(
            """[{"plan_tier":"agent","profession":"real_estate","subscription_status":"active","current_period_end":"2026-10-28T00:00:00Z","account_role":"user","billing_tier":"agent","property_capacity":25}]""",
            "true",
        )
        val client = TestConfig.client(server)
        val api = AccountApi(SupabaseRest(client, TestConfig.config), SupabaseAuthClient(client, TestConfig.config))
        val account = api.account(TestConfig.session)
        assertEquals("Agent", account.planLabel)
        assertEquals("agent", account.planTier)
        assertEquals("active", account.subscriptionStatus)
        assertTrue(account.isAgentPlan)
        assertEquals("Alex", account.displayName, "preferred_name wins, as on the account hero")
        assertEquals("Northfield & Main Realty", account.brokerage)
        assertEquals("(732) 555-0148", account.phone)
        assertEquals("alex-moreno", account.vanitySlug)
        assertEquals("agent@example.com", account.email)
        val plan = server.requestsTo("/rest/v1/rpc/has_watchdog_plan").single().json()!!
        assertEquals("agent", plan.str("required_plan"))
        val select = server.requestsTo("/rest/v1/profiles").single().param("select")!!
        assertEquals("id,display_name,full_name,vanity_slug,pro_agent,avatar_url", select)
        assertFalse(select.contains("legal") || select.contains("mailing"), "the member's legal and mailing columns are never selected")
    }

    @Test
    fun `a free account is Free and not an agent even when the profile looks complete`() = runBlocking {
        val server = server("""[{"plan_tier":"standard","profession":"homeowner","subscription_status":"none","current_period_end":null,"account_role":"user","billing_tier":null,"property_capacity":null}]""", "false")
        val client = TestConfig.client(server)
        val api = AccountApi(SupabaseRest(client, TestConfig.config), SupabaseAuthClient(client, TestConfig.config))
        val account = api.account(TestConfig.session)
        assertEquals("Free", account.planLabel)
        assertFalse(account.isAgentPlan)
    }

    @Test
    fun `a developer reads as Developer and passes the gate`() = runBlocking {
        val server = server("""[{"plan_tier":"developer","profession":"homeowner","subscription_status":"active","current_period_end":null,"account_role":"developer","billing_tier":"developer","property_capacity":null}]""", "true")
        val client = TestConfig.client(server)
        val api = AccountApi(SupabaseRest(client, TestConfig.config), SupabaseAuthClient(client, TestConfig.config))
        val account = api.account(TestConfig.session)
        assertEquals("Developer", account.planLabel)
        assertTrue(account.isAgentPlan)
        assertEquals("Pro+", AccountApi.planLabel("pro_plus"))
        assertEquals(3, AccountApi.rank("pro+"))
    }

    @Test
    fun `zero entitlement rows means the token is bad, not a free plan`() = runBlocking {
        val server = server("[]", "false")
        val client = TestConfig.client(server)
        val api = AccountApi(SupabaseRest(client, TestConfig.config), SupabaseAuthClient(client, TestConfig.config))
        assertFailsWith<NotSignedInException> { api.account(TestConfig.session) }
        Unit
    }
}
