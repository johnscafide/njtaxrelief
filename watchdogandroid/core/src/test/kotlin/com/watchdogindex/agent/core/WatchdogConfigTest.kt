package com.watchdogindex.agent.core

import com.watchdogindex.agent.core.sample.SampleData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The public site links: clean root-level WatchdogIndex URLs on the configured origin. */
class WatchdogConfigTest {

    @Test
    fun `production links are clean root-level watchdogindex URLs`() {
        val links = WatchdogConfig.Production.links
        assertEquals("https://www.watchdogindex.com", links.origin)
        assertEquals("watchdogindex.com", links.label)
        assertEquals("https://www.watchdogindex.com/agent/alex-moreno", links.agentPage("alex-moreno"))
        assertEquals("watchdogindex.com/agent/alex-moreno", links.agentPageLabel("alex-moreno"))
        assertEquals("https://www.watchdogindex.com/account/professional-profile", links.professionalProfile)
        assertEquals("https://www.watchdogindex.com/marketing-studio/postcards", links.postcardStudio)
        assertEquals("https://www.watchdogindex.com/newsletter-studio", links.newsletterStudio)
        listOf(links.agentPage("x"), links.professionalProfile, links.postcardStudio, links.newsletterStudio).forEach {
            assertTrue(!it.contains("/property/"), "public URLs are root-level: $it")
        }
    }

    @Test
    fun `agent page follows the account's vanity slug`() {
        val links = WatchdogConfig.Production.links
        assertEquals("https://www.watchdogindex.com/agent/${SampleData.AGENT_SLUG}", links.agentPage(SampleData.account))
        assertNull(links.agentPage(SampleData.account.copy(vanitySlug = null)))
        assertNull(links.agentPage(SampleData.account.copy(vanitySlug = "  ")))
        // Stray whitespace and slashes never make a double slash; anything else is escaped, never trusted raw.
        assertEquals("https://www.watchdogindex.com/agent/alex-moreno", links.agentPage(" /alex-moreno/ "))
        assertEquals("https://www.watchdogindex.com/agent/a%2Fb%3Fc", links.agentPage("a/b?c"))
    }

    @Test
    fun `links follow a different site origin`() {
        val links = WatchdogConfig(siteOrigin = "https://preview.example.test/").links
        assertEquals("preview.example.test", links.label)
        assertEquals("https://preview.example.test/agent/alex-moreno", links.agentPage("alex-moreno"))
        assertEquals("https://preview.example.test/account/professional-profile", links.professionalProfile)
    }
}
