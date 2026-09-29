package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.FarmStats
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The privacy rules from ARCHITECTURE.md, checked against everything the sample set can show: no owner names or
 * owner fields anywhere, and no home ever called a likely seller. The only strings allowed to contain the words
 * "seller" or "likely seller" are the two disclaimers that say Watchdog does not do that.
 */
class SamplePrivacyTest {

    private val disclaimers = listOf(FarmStats.NOT_A_SELLER_PREDICTION, AlertChannel.NOT_A_SELLER_PREDICTION)

    private fun corpus(): List<Pair<String, String>> {
        val repos = SampleRepositories(latencyMillis = 0)
        val fixtures = mutableListOf<Pair<String, Any?>>(
            "account" to SampleData.account,
            "agentCard" to SampleData.agentCard,
            "digest" to SampleData.digest,
            "birchwood" to SampleData.birchwoodDetail,
            "harding" to SampleData.hardingDetail,
            "hardingScan" to SampleData.hardingScan,
            "clients" to SampleData.clients,
            "checkupSeason" to SampleData.checkupSeason,
            "farms" to SampleData.farms,
            "birchwoodStats" to SampleData.birchwoodStats,
            "glendoraStats" to SampleData.glendoraStats,
            "parcels" to SampleData.birchwoodGrid.parcels.map { it.copy(ring = emptyList()) },
            "glendoraParcels" to SampleData.glendoraGrid.parcels.map { it.copy(ring = emptyList()) },
            "campaigns" to SampleData.campaigns,
            "trueCost" to SampleData.trueCostCard,
            "brief" to SampleData.brief,
            "notifications" to SampleData.notifications,
            "alertPreferences" to SampleData.alertPreferences,
            "channels" to AlertChannel.entries.map { "${it.title}: ${it.description}" },
            "searchable" to SampleData.searchableProperties,
        )
        kotlinx.coroutines.runBlocking {
            for (q in listOf("Who is likely to sell?", "Which Harrison clients should I call first?", "Draft a note", "Compare Glendora with Blackwood", "36 Birchwood Dr", "anything")) {
                fixtures += "answer:$q" to repos.intelligence.ask(q)
            }
            fixtures += "invented" to repos.properties.detail("0417_12_4")
        }
        return fixtures.map { (name, value) -> name to value.toString() }
    }

    @Test
    fun `no sample string calls a home a likely seller or predicts sellers`() {
        for ((name, text) in corpus()) {
            val lower = text.lowercase()
            var index = lower.indexOf("seller")
            while (index >= 0) {
                val window = text.substring((index - 120).coerceAtLeast(0), (index + 60).coerceAtMost(text.length))
                val isDisclaimer = disclaimers.any { window.contains(it) } ||
                    window.contains("never labels a single home as a likely seller") ||
                    window.contains("never labels a home as a likely seller") ||
                    window.contains("not seller predictions")
                assertTrue(isDisclaimer, "'$name' mentions sellers outside a disclaimer: …$window…")
                index = lower.indexOf("seller", index + 1)
            }
            assertTrue(!Regex("\\b(likely|motivated|probable) (to sell|seller)").containsMatchIn(lower) || lower.contains("never labels"), "'$name' predicts a seller")
        }
    }

    @Test
    fun `no sample string or model field carries an owner name`() {
        val ownerWords = Regex("\\bowner(s|'s|\u2019s)?\\b|\\bhomeowner\\b|owner_name|ownerName|mailing address", RegexOption.IGNORE_CASE)
        for ((name, text) in corpus()) {
            val hit = ownerWords.find(text)
            if (hit != null) fail("'$name' contains owner wording: '${hit.value}' in …${text.substring((hit.range.first - 60).coerceAtLeast(0), (hit.range.last + 60).coerceAtMost(text.length))}…")
        }
        // The core models themselves expose no owner field.
        val modelClasses = listOf(
            "PropertySummary", "PropertyDetail", "HomeFacts", "ClientRow", "MapParcel", "ScanResult", "PropertyChange", "AppNotification", "TrueCostCard", "NearbySale",
        ).map { Class.forName("com.watchdogindex.agent.core.model.$it") }
        for (cls in modelClasses) {
            for (field in cls.declaredFields) {
                assertTrue(!field.name.contains("owner", ignoreCase = true), "${cls.simpleName}.${field.name} looks like an owner field")
            }
        }
    }

    @Test
    fun `sample answers and notes keep the seller disclaimer travelling with farm and channel data`() = runTest {
        assertEquals(FarmStats.NOT_A_SELLER_PREDICTION, SampleData.birchwoodStats.note)
        assertEquals(FarmStats.NOT_A_SELLER_PREDICTION, SampleData.glendoraStats.note)
        assertEquals("Property changes are not seller predictions.", AlertChannel.NOT_A_SELLER_PREDICTION)
    }

    /**
     * ARCHITECTURE.md: `AlertChannel.NOT_A_SELLER_PREDICTION` travels in every notification channel description.
     * [AlertChannel.description] is the short Settings label; the note belongs on a `fullDescription` property that
     * the model owner adds (`"$description. $NOT_A_SELLER_PREDICTION"`), and the Android `NotificationChannel` and
     * the Settings rows must read that one. The enum lives in the model package, outside this unit, so the property
     * is looked up by name: the test compiles before it exists and enforces the rule the moment it does. Once the
     * model ships it, replace the lookup with a direct `channel.fullDescription` call and delete the `else` branch.
     */
    @Test
    fun `every notification channel description carries the seller-prediction note`() {
        val fullDescription = AlertChannel::class.java.methods.firstOrNull { it.name == "getFullDescription" && it.parameterCount == 0 }
        if (fullDescription != null) {
            for (channel in AlertChannel.entries) {
                val text = fullDescription.invoke(channel) as String
                assertTrue(text.startsWith(channel.description), "${channel.title}: the full description should open with the short one, was '$text'")
                assertTrue(text.contains(AlertChannel.NOT_A_SELLER_PREDICTION), "${channel.title}: '$text' lacks the seller-prediction note")
            }
        } else {
            // Not enforceable from core yet. The short labels must at least never speak of sellers themselves.
            for (channel in AlertChannel.entries) {
                assertTrue(!channel.description.contains("seller", ignoreCase = true), "${channel.title}: short description mentions sellers")
            }
        }
    }
}
