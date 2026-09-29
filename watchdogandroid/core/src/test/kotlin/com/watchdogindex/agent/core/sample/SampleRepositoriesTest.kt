package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.model.ChangeKind
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.QuietHours
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.model.ScoreBands
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.VerdictKind
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SampleRepositoriesTest {

    // ---------------------------------------------------------------- property page

    @Test
    fun `36 Birchwood Dr page carries the mockup numbers`() = runTest {
        val repos = SampleRepositories()
        val d = repos.properties.detail(SampleData.BIRCHWOOD_PIN)
        assertEquals("36 Birchwood Dr", d.summary.address)
        assertEquals("Cherry Hill Twp", d.summary.town)
        assertEquals("Camden County", d.summary.county)
        assertEquals("Block 285.14, Lot 9", d.summary.blockLot)
        assertEquals("Birchwood Park", d.summary.farmName)
        assertEquals("Class 2 residential", d.summary.propertyClassLabel)

        val score = assertNotNull(d.score)
        assertEquals(72, score.score)
        assertEquals("Favorable tax position", score.verdict)
        assertEquals("The assessment holds up and the bill tracks the town. Evidence coverage 92%, high confidence.", score.explanation)
        assertEquals(92, score.coveragePercent)
        assertEquals("high", score.confidence)

        val tax = assertNotNull(d.tax)
        assertEquals(2025, tax.billYear)
        assertEquals(11_284, tax.bill)
        assertEquals("2025 bill on the state tax list", tax.billSourceLabel)
        assertEquals(2026, tax.nextYear)
        assertEquals(11_730, tax.nextYearBill)
        assertEquals("Cherry Hill", tax.townName)
        assertEquals(9_960, tax.townMedian)
        assertEquals(listOf(3.877, 3.951, 4.046, 4.118, 4.212, 4.300, 4.470), tax.rateHistory.map { it.ratePer100 })
        assertEquals((2020..2026).toList(), tax.rateHistory.map { it.year })
        assertEquals("+2.4% a year since 2020", tax.rateTrendLabel)

        val vc = assertNotNull(d.valueCheck)
        assertEquals(262_400, vc.assessed)
        assertEquals(428_800, vc.impliedValue)
        assertEquals(61, vc.ratioPercent.toInt())
        assertEquals(372_800, vc.holdsUpAbove)
        assertEquals(455_000, vc.salesMedian)
        assertEquals(7, vc.salesCount)
        assertEquals("since January", vc.salesSinceLabel)
        assertEquals(300_000, vc.rangeMin)
        assertEquals(500_000, vc.rangeMax)
        assertEquals(VerdictKind.Good, vc.verdict.kind)
        assertEquals("Holds up at today’s prices", vc.verdict.title)
        assertEquals("Seven similar homes nearby sold for a median \$455,000 since January, well above \$372,800.", vc.verdict.body)

        val sales = assertNotNull(d.sales)
        assertEquals(7, sales.count)
        assertEquals("since Jan 2026", sales.sinceLabel)
        assertEquals(455_000, sales.median)
        assertEquals(listOf("22 Birchwood Dr", "9 Ashbrook Rd", "51 Queen Anne Rd"), sales.sales.map { it.address })
        assertEquals(listOf("Sep 2026", "Jul 2026", "Jun 2026"), sales.sales.map { it.monthLabel })
        assertEquals(listOf(468_000, 441_500, 472_000), sales.sales.map { it.price })
        assertEquals(312_000, sales.lastSoldPrice)
        assertEquals(2014, sales.lastSoldYear)

        assertEquals("2 · Residential", d.facts.propertyClass)
        assertEquals(1962, d.facts.built)
        assertEquals("2-story colonial", d.facts.style)
        assertEquals(1_980, d.facts.livingAreaSqFt)
        assertEquals(0.28, d.facts.lotAcres)
        assertEquals("285.14", d.facts.block)
        assertEquals("9", d.facts.lot)

        assertEquals(listOf('R', 'O', 'B', 'U', 'S', 'T'), d.robust.map { it.letter })
        assertEquals(listOf("Recourse", "Overassessment", "Burden", "Uniformity", "Stability", "Trajectory"), d.robust.map { it.name })
        assertEquals(listOf(78, 81, 58, 70, 76, 63), d.robust.map { it.score })
        assertEquals(
            "Sources: NJ MOD-IV tax list, NJ Division of Taxation rates, 2026 Chapter 123 ratios, SR1A deed sales. A screening check, not an appraisal.",
            d.sources,
        )
        assertFalse(d.isSaved)
    }

    @Test
    fun `search filters by address town and pin and detail invents unknown pins`() = runTest {
        val repos = SampleRepositories()
        assertEquals("36 Birchwood Dr", repos.properties.search("36 birchwood").first().address)
        assertTrue(repos.properties.search("Birchwood").all { it.address.contains("Birchwood") || it.farmName == "Birchwood Park" })
        assertTrue(repos.properties.search("red bank").all { it.town == "Red Bank" })
        assertEquals(SampleData.HARDING_PIN, repos.properties.search("1340_76_12").single().pin)
        assertTrue(repos.properties.search("zzzz nothing").isEmpty())
        assertEquals(SampleData.properties, repos.properties.search(""))

        val unknown = repos.properties.detail("0417_12_4")
        assertEquals("0417_12_4", unknown.summary.pin)
        assertEquals("Haddonfield", unknown.summary.town)
        assertEquals("Block 12, Lot 4", unknown.summary.blockLot)
        assertNotNull(unknown.score)
        assertNotNull(unknown.tax?.nextYearBill)
        assertNotNull(unknown.valueCheck)
        assertEquals(unknown, repos.properties.detail("0417_12_4"))
        assertFailsWith<WatchdogException> { repos.properties.detail("") }
    }

    @Test
    fun `saved and watched flags round-trip`() = runTest {
        val repos = SampleRepositories()
        repos.properties.setSaved(SampleData.BIRCHWOOD_PIN, true)
        repos.properties.setWatched(SampleData.BIRCHWOOD_PIN, true)
        val d = repos.properties.detail(SampleData.BIRCHWOOD_PIN)
        assertTrue(d.isSaved)
        assertTrue(d.isWatched)
        repos.properties.setSaved(SampleData.BIRCHWOOD_PIN, false)
        assertFalse(repos.properties.detail(SampleData.BIRCHWOOD_PIN).isSaved)
        assertEquals("https://www.watchdogindex.com/checkup?pin=0409_285.14_9&agent=alex-moreno", repos.properties.checkupLink(SampleData.BIRCHWOOD_PIN))
    }

    // ---------------------------------------------------------------- Today

    @Test
    fun `digest matches the Today screen and tasks can be done`() = runTest {
        val repos = SampleRepositories()
        val digest = repos.digest.thisWeek()
        assertEquals("Monday, September 28", digest.dateLabel)
        assertEquals("This week · since Sep 21", digest.periodLabel)
        assertEquals(10, digest.total)
        assertEquals(3, digest.taxBills)
        assertEquals(2, digest.permits)
        assertEquals(4, digest.sales)
        assertEquals(1, digest.town)
        assertEquals(5, digest.needsYouCount)
        assertEquals(10, digest.changes.size)
        assertEquals(
            listOf("2026 bill up \$612", "Kitchen permit filed", "Revaluation set for 2027", "Sold for \$468,000"),
            digest.changes.take(4).map { it.title },
        )
        assertEquals(
            listOf("27 Hamilton St, Harrison · Past client", "61 Spring St, Red Bank · Sphere", "Gloucester Twp · 38 homes in your farm", "22 Birchwood Dr, Cherry Hill · Farm"),
            digest.changes.take(4).map { it.subtitle },
        )
        assertEquals(listOf("Send 12 tax checkups", "Call about 27 Hamilton St", "Approve the fall postcard"), digest.tasks.take(3).map { it.title })
        assertEquals(
            listOf("Final 2026 bills are out · appeals due Apr 1", "Past client · 2026 bill up \$612", "Birchwood Park · 412 homes · mails Oct 6"),
            digest.tasks.take(3).map { it.subtitle },
        )
        assertEquals("Harrison’s 2026 rate rose 7%. Nine past clients’ bills went up, and their checkups are ready.", digest.teaser?.text)

        repos.digest.markTaskDone("task-send-checkups", true)
        val after = repos.digest.thisWeek()
        assertTrue(after.tasks.first().done)
        assertEquals(4, after.needsYouCount)
        repos.digest.markTaskDone("task-send-checkups", false)
        assertEquals(5, repos.digest.thisWeek().needsYouCount)
    }

    // ---------------------------------------------------------------- clients

    @Test
    fun `client filters counts and checkups behave like the mockup`() = runTest {
        val repos = SampleRepositories()
        val all = repos.clients.overview()
        assertEquals(146, all.all)
        assertEquals(58, all.pastClients)
        assertEquals(88, all.sphere)
        assertEquals(12, all.checkupsReady)
        assertEquals(146, all.rows.size)
        assertEquals(listOf("27 Hamilton St", "5 Laurel Ct", "61 Spring St", "418 Kresson Rd", "402 Harrison Ave"), all.rows.take(5).map { it.address })
        assertEquals(
            listOf("Harrison · Past client, 2019 · CRM-104", "Gloucester Twp · Past client, 2021 · CRM-131", "Red Bank · Sphere · CRM-212", "Cherry Hill · Past client, 2016 · CRM-088", "Harrison · Sphere · CRM-247"),
            all.rows.take(5).map { it.metaLine },
        )
        assertEquals(listOf("Bill up \$612", "Checkup ready", "Permit filed", "10 years Oct 7", "Watching"), all.rows.take(5).map { it.status?.label })
        assertEquals(
            listOf("Call about the new bill", "Send tax checkup", "Send a renovation note", "Write an anniversary card", "Nothing new this week"),
            all.rows.take(5).map { it.nextAction.label },
        )
        assertEquals(146, all.rows.map { it.crmRef }.toSet().size, "CRM references are unique")
        assertEquals(146, all.rows.map { it.id }.toSet().size, "row ids are unique")

        val season = assertNotNull(all.season)
        assertEquals("12 tax checkups ready to send", season.title)
        assertEquals("Final 2026 bills are out. Each checkup shows whether the assessment holds up and the April 1, 2027 appeal deadline.", season.body)
        assertEquals("Review and send", season.ctaLabel)
        assertEquals("April 1, 2027", season.appealDeadline)

        assertEquals(58, repos.clients.overview(ClientFilter.PastClients).rows.size)
        assertTrue(repos.clients.overview(ClientFilter.PastClients).rows.all { it.relationship == Relationship.PastClient })
        assertEquals(88, repos.clients.overview(ClientFilter.Sphere).rows.size)
        assertEquals(12, repos.clients.overview(ClientFilter.CheckupReady).rows.size)
        assertEquals(listOf("27 Hamilton St"), repos.clients.overview(query = "hamilton").rows.map { it.address })
        assertEquals(listOf("418 Kresson Rd"), repos.clients.overview(query = "CRM-088").rows.map { it.address })
        assertEquals(9, repos.clients.overview(ClientFilter.CheckupReady, "Harrison").rows.size, "nine Harrison checkups, as the brief says")

        assertEquals(12, repos.clients.sendAllReadyCheckups())
        val after = repos.clients.overview()
        assertEquals(0, after.checkupsReady)
        assertNull(after.season)
        assertTrue(repos.clients.overview(ClientFilter.CheckupReady).rows.isEmpty())
        assertEquals("Checkup sent", after.rows.first { it.address == "5 Laurel Ct" }.status?.label)
        assertEquals(0, repos.clients.sendAllReadyCheckups())

        repos.clients.snooze("client-104")
        assertEquals("Snoozed", repos.clients.overview(query = "hamilton").rows.single().status?.label)
        assertEquals(2, repos.clients.import(listOf(ClientImportRow("10 Elm St", "Red Bank", Relationship.PastClient, 2020, "CRM-900"), ClientImportRow("4 Pine Ct", "Nowhere", Relationship.Sphere, null, null))))
        assertEquals(148, repos.clients.overview().all)
    }

    // ---------------------------------------------------------------- farm

    @Test
    fun `farm parcels honor the layer and reproduce the sheet`() = runTest {
        val repos = SampleRepositories()
        val farms = repos.farm.farms()
        assertEquals(listOf("Birchwood Park", "Glendora"), farms.map { it.name })
        val birchwood = farms.first()
        assertEquals("Cherry Hill Twp", birchwood.town)
        assertEquals(412, birchwood.homes)
        assertEquals("your farm since Aug", birchwood.sinceLabel)
        assertEquals(5, birchwood.boundary.size)
        assertEquals(birchwood.boundary.first(), birchwood.boundary.last())

        val all = repos.farm.parcels(birchwood.id, MapLayer.Score)
        assertEquals(420, all.size)
        assertEquals(412, repos.farm.parcels(birchwood.id, MapLayer.Residential).size)
        assertEquals(21, repos.farm.parcels(birchwood.id, MapLayer.SoldIn12Months).size)
        assertEquals(9, repos.farm.parcels(birchwood.id, MapLayer.Permits).size)
        assertEquals(420, all.map { it.pin }.toSet().size, "parcel pins are unique")
        assertEquals(420, all.map { it.address }.toSet().size, "parcel addresses are unique")
        val bands = all.mapNotNull { ScoreBands.bandIndex(it.score) }.toSet()
        assertEquals(setOf(0, 1, 2, 3, 4), bands, "all five score bands appear on the map")
        assertTrue(all.filter { it.residential }.all { it.score in 30..95 })
        val scores = all.mapNotNull { it.score }.sorted()
        assertTrue(scores[scores.size / 2] in 60..66, "median score near the sheet's 63, was ${scores[scores.size / 2]}")

        val selected = all.single { it.address == "36 Birchwood Dr" }
        assertEquals(SampleData.BIRCHWOOD_PIN, selected.pin)
        assertEquals(72, selected.score)
        assertEquals(11_284, selected.taxBill)
        assertEquals(5, selected.ring.size)
        assertTrue(all.single { it.address == "22 Birchwood Dr" }.soldInLast12Months)
        assertTrue(all.single { it.address == "9 Ashbrook Rd" }.soldInLast12Months)
        assertTrue(all.single { it.address == "51 Queen Anne Rd" }.soldInLast12Months)
        assertTrue(all.single { it.address == "48 Ashbrook Rd" }.permitInLast90Days)
        // Around Cherry Hill, inside the boundary box.
        assertTrue(all.all { p -> p.ring.all { it.lat in 39.89..39.92 && it.lon in -75.02..-74.98 } })
        val latRange = birchwood.boundary.minOf { it.lat }..birchwood.boundary.maxOf { it.lat }
        assertTrue(all.all { p -> p.ring.all { it.lat in latRange } })

        val stats = repos.farm.stats(birchwood.id)
        assertEquals(63, stats.medianScore)
        assertEquals(21, stats.salesIn12Months)
        assertEquals(5.1, stats.salesPercent)
        assertEquals(9, stats.permitsIn90Days)
        assertEquals(listOf("7 sales since June", "Deed recorded Sep 18:"), stats.turnover.map { it.lead })
        assertEquals(listOf(" at a median \$455,000, up 6% on last year", " 22 Birchwood Dr, \$468,000"), stats.turnover.map { it.text })
        assertEquals("Neighborhood totals from public records. Watchdog never labels a home as a likely seller.", stats.note)

        assertEquals(38, farms[1].homes)
        assertFailsWith<WatchdogException> { repos.farm.parcels("nope", MapLayer.Score) }

        val created = repos.farm.createFarm("Test farm", listOf(LatLng(39.90, -75.01), LatLng(39.90, -75.006), LatLng(39.897, -75.006), LatLng(39.897, -75.01)))
        assertEquals("Test farm", created.name)
        assertTrue(created.homes > 0)
        assertEquals(3, repos.farm.farms().size)
        assertTrue(repos.farm.parcels(created.id, MapLayer.Score).isNotEmpty())
        assertNotNull(repos.farm.stats(created.id).medianScore)
    }

    // ---------------------------------------------------------------- scan

    @Test
    fun `pasting the Zillow link resolves 143 Harding Rd with the price check`() = runTest {
        val repos = SampleRepositories()
        val r = repos.scan.resolve(ScanInput.ListingUrl(SampleData.HARDING_LISTING_URL))
        assertEquals("143 Harding Rd", r.property.address)
        assertEquals("Red Bank", r.property.town)
        assertEquals("Monmouth County", r.property.county)
        assertEquals("Block 76, Lot 12", r.property.blockLot)
        assertEquals(57, r.score)
        assertEquals("Mixed tax position", r.verdict)
        assertEquals(2025, r.taxBillYear)
        assertEquals(12_980, r.taxBill)
        assertEquals(2026, r.nextYear)
        assertEquals(13_330, r.nextYearBill)
        assertEquals(849_000, r.listPrice)
        assertEquals("From the pasted link", r.priceSourceLabel)
        val check = assertNotNull(r.priceCheck)
        assertEquals(PriceCheckKind.LowTaxForPrice, check.kind)
        assertEquals("Low tax for this price", check.title)
        assertEquals("Homes that sell near \$849,000 in Red Bank usually pay about \$16,340. A town-wide revaluation could move this bill toward that.", check.body)
        assertEquals(16_340, check.expectedTax)
        assertNull(r.matchLabel)

        val sign = repos.scan.resolve(ScanInput.QrCode("WD:0409", 40.34, -74.07))
        assertEquals("For Sale sign · QR read · parcel matched", sign.matchLabel)
        assertEquals("From the sign’s listing link", sign.priceSourceLabel)

        val other = repos.scan.resolve(ScanInput.ListingUrl("https://www.zillow.com/homedetails/418-Kresson-Rd-Cherry-Hill-NJ-08034/1234_zpid/"))
        assertEquals("418 Kresson Rd", other.property.address)
        assertEquals("Cherry Hill Twp", other.property.town)
        assertNotNull(other.listPrice)
        assertNotNull(other.priceCheck)

        val invented = repos.scan.resolve(ScanInput.ListingUrl("https://www.realtor.com/realestateandhomes-detail/12-Maple-Ave_Haddonfield_NJ_08033_M1234-56789"))
        assertEquals("12 Maple Ave", invented.property.address)
        assertEquals("Haddonfield", invented.property.town)
        assertEquals(invented.property.pin, repos.scan.resolve(ScanInput.ListingUrl("https://www.realtor.com/realestateandhomes-detail/12-Maple-Ave_Haddonfield_NJ_08033_M1234-56789")).property.pin)

        val redfin = repos.scan.resolve(ScanInput.ListingUrl("https://www.redfin.com/NJ/Red-Bank/61-Spring-St-07701/home/4455"))
        assertEquals(SampleData.SPRING_PIN, redfin.property.pin)

        val byAddress = repos.scan.resolve(ScanInput.Address("27 Hamilton St"))
        assertEquals(SampleData.HAMILTON_PIN, byAddress.property.pin)
        assertNull(byAddress.listPrice)
        assertEquals(PriceCheckKind.Unknown, byAddress.priceCheck?.kind)

        assertFailsWith<WatchdogException> { repos.scan.resolve(ScanInput.ListingUrl("  ")) }
        assertEquals(byAddress.property.pin, repos.scan.history().first().result.property.pin)
        assertTrue(repos.scan.history().size >= 4)
    }

    // ---------------------------------------------------------------- marketing

    @Test
    fun `campaigns and the true cost card match the mockup and recompute`() = runTest {
        val repos = SampleRepositories()
        val campaigns = repos.marketing.campaigns()
        assertEquals(listOf("Birchwood Park fall update", "September market update"), campaigns.map { it.title })
        assertEquals(listOf("Postcard · 412 homes · mails Oct 6", "Email · 146 contacts · sent Sep 21"), campaigns.map { it.subtitle })
        assertEquals(listOf("Proof ready", "48% opened · 9 replies"), campaigns.map { it.status.label })
        assertEquals("Fall 2026", campaigns[0].thumbTop)
        assertEquals("Median \$455K", campaigns[0].thumbBottom)

        val card = repos.marketing.trueCostCard(SampleData.BIRCHWOOD_PIN, null, includeContactCard = true)
        assertEquals("36 Birchwood Dr, Cherry Hill", card.address)
        assertEquals(449_000, card.inputs.price)
        assertEquals(11_730, card.annualTax)
        assertEquals(2_270, card.monthlyMortgage)
        assertEquals(978, card.monthlyTax)
        assertEquals(140, card.monthlyInsurance)
        assertEquals(0, card.monthlyHoa)
        assertEquals(3_388, card.monthlyTotal)
        assertEquals("Mortgage · 30 yrs at 6.5%", card.mortgageLabel)
        assertEquals("Alex Moreno", card.agent?.name)
        assertEquals("Northfield & Main Realty", card.agent?.brokerage)
        assertEquals("Red Bank", card.agent?.town)
        assertEquals("AM", card.agent?.initials)
        assertEquals("https://www.watchdogindex.com/true-cost?pin=0409_285.14_9&agent=alex-moreno", card.shareUrl)

        val plain = repos.marketing.trueCostCard(SampleData.BIRCHWOOD_PIN, TrueCostInputs(price = 500_000, downPercent = 10.0, ratePercent = 6.0, termYears = 15, annualInsurance = 2_400, monthlyHoa = 120), includeContactCard = false)
        assertNull(plain.agent)
        assertEquals(3_797, plain.monthlyMortgage)
        assertEquals(978, plain.monthlyTax)
        assertEquals(200, plain.monthlyInsurance)
        assertEquals(120, plain.monthlyHoa)
        assertEquals(5_095, plain.monthlyTotal)
        assertFailsWith<WatchdogException> { repos.marketing.trueCostCard(SampleData.BIRCHWOOD_PIN, TrueCostInputs(price = 0), true) }
    }

    // ---------------------------------------------------------------- Watchdog Intelligence

    @Test
    fun `brief matches the mockup and answers cite sources`() = runTest {
        val repos = SampleRepositories()
        val brief = repos.intelligence.brief()
        assertEquals("Monday brief", brief.kicker)
        assertEquals("8:00 AM · 2 min read", brief.timeLabel)
        assertEquals("Listen 1:52", brief.listenLabel)
        assertEquals("Three things worth your time this week", brief.heading)
        assertEquals("For Alex · Monday, September 28", brief.forLabel)
        assertEquals(listOf("Harrison’s 2026 rate rose 7%.", "Gloucester Twp revalues for 2027.", "Birchwood Park is moving."), brief.items.map { it.lead })
        assertEquals(
            listOf(
                " Nine past clients’ bills went up between \$380 and \$640. Their tax checkups are ready to send.",
                " In your Glendora farm, 38 homes are assessed below 80% of recent nearby sale prices, so their bills may rise.",
                " Seven sales since June at a median \$455,000, 6% above last year.",
            ),
            brief.items.map { it.text },
        )
        assertEquals(listOf("NJ Division of Taxation, 2026 rates", "Township notice · SR1A deed sales", "SR1A deed sales"), brief.items.map { it.source })
        assertEquals(
            listOf("Which Harrison clients should I call first?", "Draft a note to the nine Harrison clients", "Compare Glendora with Blackwood"),
            brief.followUps.map { it.text },
        )
        assertEquals(listOf("chat_bubble", "edit", "compare_arrows"), brief.followUps.map { it.icon })

        for (q in listOf("Which Harrison clients should I call first?", "Draft a note to the nine Harrison clients", "Compare Glendora with Blackwood", "Tell me about 36 Birchwood Dr", "What changed?", "Who is likely to sell in Birchwood Park?")) {
            val a = repos.intelligence.ask(q)
            assertTrue(a.text.isNotBlank(), q)
            assertTrue(a.sources.isNotEmpty(), "answer to '$q' cites sources")
        }
        val refusal = repos.intelligence.ask("Who is likely to sell in Birchwood Park?")
        assertTrue(refusal.text.contains("never labels a single home as a likely seller"))
    }

    // ---------------------------------------------------------------- auth

    @Test
    fun `auth flow signs in with any email and a six-digit code`() = runTest {
        val store = InMemoryKeyValueStore()
        val repos = SampleRepositories(store, signedIn = false)
        assertEquals(AuthState.SignedOut, repos.auth.state.value)
        assertFailsWith<NotSignedInException> { repos.auth.account() }
        assertFailsWith<WatchdogException> { repos.auth.sendCode("not an email") }

        repos.auth.sendCode("agent@example.com")
        assertEquals(AuthState.CodeSent("agent@example.com"), repos.auth.state.value)
        assertFailsWith<WatchdogException> { repos.auth.verifyCode("agent@example.com", "12345") }
        assertFailsWith<WatchdogException> { repos.auth.verifyCode("agent@example.com", "abcdef") }
        repos.auth.verifyCode("agent@example.com", "000000")
        val signedIn = assertIs<AuthState.SignedIn>(repos.auth.state.value)
        assertEquals("agent@example.com", signedIn.session.email)
        assertEquals("agent@example.com", repos.auth.account().email)
        assertEquals("Alex Moreno", repos.auth.account().displayName)
        assertEquals("AM", repos.auth.account().initials)
        assertTrue(repos.auth.account().isAgentPlan)

        // A fresh instance over the same store restores the session.
        val restored = SampleRepositories(store, signedIn = false)
        restored.auth.restore()
        assertIs<AuthState.SignedIn>(restored.auth.state.value)

        repos.auth.signOut()
        assertEquals(AuthState.SignedOut, repos.auth.state.value)
        val afterSignOut = SampleRepositories(store, signedIn = false)
        afterSignOut.auth.restore()
        assertEquals(AuthState.SignedOut, afterSignOut.auth.state.value)

        val defaultSignedIn = SampleRepositories()
        assertIs<AuthState.SignedIn>(defaultSignedIn.auth.state.value)
        defaultSignedIn.auth.verifyCode("x@y.co", "123456")
        assertIs<AuthState.SignedIn>(defaultSignedIn.auth.state.value)
        defaultSignedIn.auth.signInWithPasskey()
        assertEquals(SampleData.account.email, defaultSignedIn.auth.account().email)
    }

    // ---------------------------------------------------------------- alerts and settings

    @Test
    fun `alert preferences and settings persist through the store`() = runTest {
        val store = InMemoryKeyValueStore()
        val repos = SampleRepositories(store)
        val defaults = repos.alerts.preferences.value
        assertTrue(defaults.mondayEmail)
        assertTrue(defaults.mondayNotification)
        assertEquals("Mondays at 8:00 AM", defaults.deliveryLabel)
        assertEquals(true, defaults.channels[AlertChannel.ClientHomeChanges])
        assertEquals(true, defaults.channels[AlertChannel.FarmSalesAndDeeds])
        assertEquals(false, defaults.channels[AlertChannel.TownRatesAndRevaluations])
        assertEquals(true, defaults.channels[AlertChannel.AppealDeadlines])
        assertEquals("9 PM to 7 AM", defaults.quietHours.label)

        val changed = defaults.copy(mondayEmail = false, channels = defaults.channels + (AlertChannel.TownRatesAndRevaluations to true), quietHours = QuietHours(22, 6))
        repos.alerts.update(changed)
        assertEquals(changed, repos.alerts.preferences.value)
        assertNotNull(store.snapshot()[StoreKeys.ALERT_PREFERENCES])

        val again = SampleRepositories(store)
        again.alerts.refresh()
        assertEquals(changed, again.alerts.preferences.value)

        repos.settings.update { it.copy(themeMode = AppThemeMode.Dark) }
        assertEquals(AppThemeMode.Dark, repos.settings.settings.value.themeMode)
        val third = SampleRepositories(store)
        third.loadPersisted()
        assertEquals(AppThemeMode.Dark, third.settings.settings.value.themeMode)
        assertTrue(third.settings.settings.value.hasSeenWelcome)

        repos.alerts.registerPushToken("abc")
        assertEquals(setOf("android:abc"), repos.alerts.pushTokens.value)
        repos.alerts.unregisterPushToken("abc")
        assertTrue(repos.alerts.pushTokens.value.isEmpty())

        val recent = repos.alerts.recent()
        assertEquals(listOf("Your Monday brief is ready", "Deed recorded in Birchwood Park", "12 tax checkups are ready"), recent.map { it.title })
        assertEquals(
            listOf(
                "10 changes in your clients’ homes and farm. Top: the final 2026 bill at 27 Hamilton St, Harrison rose \$612.",
                "22 Birchwood Dr sold for \$468,000. Seven sales in your farm since June.",
                "Final 2026 bills are out. Appeals are due April 1.",
            ),
            recent.map { it.body },
        )
        assertEquals(listOf(listOf("Open brief", "Call client"), listOf("View farm"), listOf("Send checkups", "Later")), recent.map { n -> n.actions.map { it.label } })
    }

    @Test
    fun `settings header and account read as the mockup`() = runTest {
        val repos = SampleRepositories()
        val account = repos.auth.account()
        assertEquals("Alex Moreno", account.displayName)
        assertEquals("Agent plan · Northfield & Main Realty", "${account.planLabel} · ${account.brokerage}")
        assertEquals("alex-moreno", account.vanitySlug)
        assertEquals(AppThemeMode.System, repos.settings.settings.value.themeMode)
        assertEquals("System default", when (repos.settings.settings.value.themeMode) { AppThemeMode.System -> "System default"; AppThemeMode.Light -> "Light"; AppThemeMode.Dark -> "Dark" })
    }

    // ---------------------------------------------------------------- consistency between screens

    private fun dollarsIn(text: String): Int? = Regex("\\$([0-9,]+)").find(text)?.groupValues?.get(1)?.replace(",", "")?.toInt()

    @Test
    fun `every bill-change title equals the rise the property page derives`() = runTest {
        val repos = SampleRepositories()
        val bills = SampleData.changes.filter { it.kind == ChangeKind.TaxBill }
        assertEquals(3, bills.size)
        for (change in bills) {
            val pin = assertNotNull(change.pin, change.title)
            val tax = assertNotNull(repos.properties.detail(pin).tax, change.subtitle)
            val next = assertNotNull(tax.nextYearBill, change.subtitle)
            assertEquals(dollarsIn(change.title), next - tax.bill, "${change.subtitle}: '${change.title}' but the page goes ${tax.bill} -> $next")
        }
        // The $612 the Today row, the task, the Clients chip, the notification and the teaser all quote.
        val hamilton = assertNotNull(repos.properties.detail(SampleData.HAMILTON_PIN).tax)
        assertEquals(2025, hamilton.billYear)
        assertEquals(8_729, hamilton.bill)
        assertEquals(9_341, hamilton.nextYearBill)
        assertEquals(612, dollarsIn(repos.clients.overview(query = "hamilton").rows.single().status!!.label))
        assertEquals(612, dollarsIn(repos.digest.thisWeek().tasks.single { it.id == "task-call-hamilton" }.subtitle))
        assertEquals(612, dollarsIn(repos.alerts.recent().first().body.substringAfter("rose")))
        // The Clients chip for 14 Cleveland Ave says the same as its digest row, and every Harrison rise sits inside the brief's $380-$640.
        assertEquals(dollarsIn(bills.single { it.pin == SampleData.CLEVELAND_PIN }.title), dollarsIn(repos.clients.overview(query = "cleveland").rows.single().status!!.label))
        val harrisonRises = repos.clients.overview(ClientFilter.CheckupReady, "Harrison").rows.map { assertNotNull(dollarsIn(it.status!!.label), it.address) }
        assertEquals(9, harrisonRises.size)
        assertTrue(harrisonRises.all { it in 380..640 }, "Harrison rises $harrisonRises")
        assertEquals(388, harrisonRises.min(), "the brief's \$380 is the lowest rise rounded down")
        assertEquals(640, harrisonRises.max(), "the brief's \$640 is the highest rise")
    }

    @Test
    fun `checkup season and farm stats read singular with a count of one`() = runTest {
        val repos = SampleRepositories()
        val ready = repos.clients.overview(ClientFilter.CheckupReady).rows
        assertEquals(12, ready.size)
        ready.drop(1).forEach { repos.clients.sendCheckup(it.id) }
        val one = repos.clients.overview()
        assertEquals(1, one.checkupsReady)
        assertEquals("1 tax checkup ready to send", one.season?.title)
        assertEquals(1, one.season?.readyCount)
        assertEquals(1, repos.clients.sendAllReadyCheckups())
        assertNull(repos.clients.overview().season)

        // A one-block farm gets a single deed in the sample, so its stats line must not read "1 sales".
        val tiny = repos.farm.createFarm("Corner", listOf(LatLng(39.9000, -75.0100), LatLng(39.9000, -75.0095), LatLng(39.8995, -75.0095), LatLng(39.8995, -75.0100)))
        val stats = repos.farm.stats(tiny.id)
        assertEquals(1, stats.salesIn12Months)
        assertEquals("1 sale in 12 months", stats.turnover.single().lead)
        assertEquals(" across 10 homes, from public deed records", stats.turnover.single().text)
    }

    @Test
    fun `QR codes and links that carry a PAMS PIN resolve that parcel`() = runTest {
        val repos = SampleRepositories()
        val bare = repos.scan.resolve(ScanInput.QrCode(SampleData.BIRCHWOOD_PIN, 39.905, -75.0))
        assertEquals(SampleData.BIRCHWOOD_PIN, bare.property.pin)
        assertEquals("36 Birchwood Dr", bare.property.address)
        assertEquals("Cherry Hill Twp", bare.property.town)
        assertEquals(72, bare.score)
        assertEquals(2025, bare.taxBillYear)
        assertEquals(11_284, bare.taxBill)
        assertEquals(11_730, bare.nextYearBill)
        assertNull(bare.listPrice)
        assertEquals("Add the list price", bare.priceSourceLabel)
        assertEquals(PriceCheckKind.Unknown, bare.priceCheck?.kind)
        assertEquals("For Sale sign · QR read · parcel matched", bare.matchLabel)

        val page = repos.scan.resolve(ScanInput.QrCode("https://www.watchdogindex.com/p/0409_285.14_9", null, null))
        assertEquals(SampleData.BIRCHWOOD_PIN, page.property.pin)
        assertEquals("36 Birchwood Dr", page.property.address)

        val query = repos.scan.resolve(ScanInput.QrCode("https://www.watchdogindex.com/checkup?pin=0905_112_7&agent=alex-moreno", null, null))
        assertEquals(SampleData.HAMILTON_PIN, query.property.pin)
        assertEquals("27 Hamilton St", query.property.address)
        assertEquals(8_729, query.taxBill)
        assertEquals(9_341, query.nextYearBill)

        // 143 Harding Rd keeps the mockup's sign scan, list price and price check included.
        val harding = repos.scan.resolve(ScanInput.QrCode(SampleData.checkupUrl(SampleData.HARDING_PIN), null, null))
        assertEquals(SampleData.HARDING_PIN, harding.property.pin)
        assertEquals(849_000, harding.listPrice)
        assertEquals("From the sign’s listing link", harding.priceSourceLabel)
        assertEquals(PriceCheckKind.LowTaxForPrice, harding.priceCheck?.kind)
        assertEquals("For Sale sign · QR read · parcel matched", harding.matchLabel)

        // A pasted Watchdog link works the same way, without the sign wording.
        val pasted = repos.scan.resolve(ScanInput.ListingUrl("https://www.watchdogindex.com/p/0415_1803.02_5"))
        assertEquals(SampleData.LAUREL_PIN, pasted.property.pin)
        assertEquals("5 Laurel Ct", pasted.property.address)
        assertEquals("Add the list price", pasted.priceSourceLabel)
        assertNull(pasted.matchLabel)

        // A PIN the sample does not know still opens the parcel it names, in its district.
        val unknown = repos.scan.resolve(ScanInput.QrCode("0417_12_4", null, null))
        assertEquals("0417_12_4", unknown.property.pin)
        assertEquals("Haddonfield", unknown.property.town)
        assertEquals("Block 12, Lot 4", unknown.property.blockLot)
        assertEquals(unknown.property.pin, repos.scan.history().first().result.property.pin)

        // Listing links never carry a PIN, so they still go through the address parser.
        assertEquals("418 Kresson Rd", repos.scan.resolve(ScanInput.ListingUrl("https://www.zillow.com/homedetails/418-Kresson-Rd-Cherry-Hill-NJ-08034/1234_zpid/")).property.address)
        assertEquals("12 Maple Ave", repos.scan.resolve(ScanInput.QrCode("https://www.realtor.com/realestateandhomes-detail/12-Maple-Ave_Haddonfield_NJ_08033_M1234-56789", null, null)).property.address)
    }
}
