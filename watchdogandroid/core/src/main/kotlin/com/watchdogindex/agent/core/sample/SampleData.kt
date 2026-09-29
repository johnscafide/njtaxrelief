package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AgentCard
import com.watchdogindex.agent.core.model.AgentTask
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.BriefItem
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.CampaignKind
import com.watchdogindex.agent.core.model.ChangeKind
import com.watchdogindex.agent.core.model.CheckupSeason
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.FollowUp
import com.watchdogindex.agent.core.model.HomeFacts
import com.watchdogindex.agent.core.model.IntelligenceTeaser
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.NearbySale
import com.watchdogindex.agent.core.model.NextAction
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PriceCheck
import com.watchdogindex.agent.core.model.PropertyChange
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.TaskAction
import com.watchdogindex.agent.core.model.TaskActionKind
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.TurnoverNote
import com.watchdogindex.agent.core.model.WeekDigest
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.math.roundToInt

/**
 * The fictional data set behind the approved mockups (September 2026). Screenshots of the app are compared with
 * the mockups, so every address, number and sentence here is the one the mockups show. Derived figures (next
 * year's bill, the implied value and holds-up floor, the true cost card, the price check) are computed with
 * [TaxMath] from the town facts in [SampleTowns] rather than typed in, and the tests assert they land on the
 * mockup values. The agent, brokerage, clients, contacts and homes are invented; none of it is a real record,
 * and nothing carries an owner name.
 */
object SampleData {

    /** The sample lives on Monday, September 28, 2026 at 9:30 in New Jersey. */
    val today: LocalDate = LocalDate(2026, 9, 28)
    val weekStart: LocalDate = LocalDate(2026, 9, 21)
    val nowUtc: Instant = LocalDateTime(2026, 9, 28, 13, 30, 0).toInstant(TimeZone.UTC)

    const val SITE_ORIGIN = "https://www.watchdogindex.com"
    const val AGENT_SLUG = "alex-moreno"

    // ------------------------------------------------------------------ account

    val account = Account(
        userId = "sample-agent-0001",
        email = "alex.moreno@northfieldmain.example",
        displayName = "Alex Moreno",
        brokerage = "Northfield & Main Realty",
        planLabel = "Agent plan",
        planTier = "agent",
        subscriptionStatus = "active",
        isAgentPlan = true,
        vanitySlug = AGENT_SLUG,
        phone = "(732) 555-0148",
    )

    val session = AuthSession(
        accessToken = "sample-access-token",
        refreshToken = "sample-refresh-token",
        expiresAtEpochSeconds = nowUtc.epochSeconds + 3_600,
        userId = account.userId,
        email = account.email,
    )

    val agentCard = AgentCard(
        name = account.displayName,
        brokerage = account.brokerage!!,
        town = "Red Bank",
        phone = account.phone,
        email = account.email,
    )

    // ------------------------------------------------------------------ farms

    const val BIRCHWOOD_FARM_ID = "farm-birchwood-park"
    const val GLENDORA_FARM_ID = "farm-glendora"

    private val birchwoodStreets = listOf("Queen Anne Rd", "Birchwood Dr", "Ashbrook Rd", "Laurel Ln", "Heritage Rd", "Sheffield Rd", "Coventry Ln")

    /** Seven sales in Birchwood Park since June, median $455,000, the ones the farm sheet and brief talk about. */
    val birchwoodRecentSales: List<NearbySale> = listOf(
        NearbySale("22 Birchwood Dr", "Sep 2026", 468_000),
        NearbySale("57 Queen Anne Rd", "Sep 2026", 512_000),
        NearbySale("12 Heritage Rd", "Sep 2026", 389_000),
        NearbySale("40 Laurel Ln", "Aug 2026", 455_000),
        NearbySale("9 Ashbrook Rd", "Jul 2026", 441_500),
        NearbySale("51 Queen Anne Rd", "Jun 2026", 472_000),
        NearbySale("19 Sheffield Rd", "Jun 2026", 438_000),
    )

    /**
     * 7 block columns by 6 block rows of 2 × 5 parcels: 420 parcels, 412 homes plus a strip of eight stores. 21 homes
     * (5.1%) sold in the last 12 months, matching the farm sheet; 9 carry permits.
     */
    val birchwoodGrid: FarmGrid = SampleFarmGrid.generate(
        FarmGridSpec(
            district = SampleTowns.cherryHill.district,
            center = LatLng(39.9052, -75.0004),
            rotationDegrees = 16.0,
            blockCols = 7,
            blockRows = 6,
            streets = birchwoodStreets,
            blockBase = 285,
            seed = 20260928,
            scoreBase = 62.5,
            ratePer100 = SampleTowns.cherryHill.rates.getValue(2025),
            assessedRange = 205_000..335_000,
            soldCount = 21,
            permitCount = 9,
            forcedSold = birchwoodRecentSales.map { it.address }.toSet(),
            forcedPermits = setOf("48 Ashbrook Rd"),
            selectedAddress = "36 Birchwood Dr",
            selectedScore = 72,
            selectedTaxBill = 11_284,
            commercialCount = 8,
        ),
    )

    val birchwoodFarm = Farm(
        id = BIRCHWOOD_FARM_ID,
        name = "Birchwood Park",
        town = SampleTowns.cherryHill.town,
        homes = birchwoodGrid.homes,
        sinceLabel = "your farm since Aug",
        center = LatLng(39.9052, -75.0004),
        zoom = 15.6,
        boundary = birchwoodGrid.boundary,
    )

    val birchwoodStats = FarmStats(
        medianScore = 63,
        salesIn12Months = 21,
        salesPercent = 5.1,
        permitsIn90Days = 9,
        turnover = listOf(
            TurnoverNote("trending_up", "7 sales since June", " at a median ${Format.money(455_000)}, up 6% on last year"),
            TurnoverNote("sell", "Deed recorded Sep 18:", " 22 Birchwood Dr, ${Format.money(468_000)}"),
        ),
    )

    /** The second, smaller farm in Gloucester Township that the brief's revaluation item refers to: 38 homes. */
    val glendoraGrid: FarmGrid = SampleFarmGrid.generate(
        FarmGridSpec(
            district = SampleTowns.gloucesterTwp.district,
            center = LatLng(39.8412, -75.0731),
            rotationDegrees = -9.0,
            blockCols = 2,
            blockRows = 2,
            streets = listOf("Evesham Rd", "Highland Ave", "Chestnut Ave"),
            blockBase = 1803,
            seed = 20260901,
            scoreBase = 52.0,
            scoreAmplitude = 12.0,
            ratePer100 = SampleTowns.gloucesterTwp.rates.getValue(2025),
            assessedRange = 150_000..240_000,
            soldCount = 2,
            permitCount = 1,
            commercialCount = 2,
        ),
    )

    val glendoraFarm = Farm(
        id = GLENDORA_FARM_ID,
        name = "Glendora",
        town = SampleTowns.gloucesterTwp.town,
        homes = glendoraGrid.homes,
        sinceLabel = "your farm since May",
        center = LatLng(39.8412, -75.0731),
        zoom = 16.4,
        boundary = glendoraGrid.boundary,
    )

    val glendoraStats = FarmStats(
        medianScore = 51,
        salesIn12Months = 2,
        salesPercent = 5.3,
        permitsIn90Days = 1,
        turnover = listOf(
            TurnoverNote("trending_up", "2 sales since June", " at a median ${Format.money(338_000)}, up 4% on last year"),
            TurnoverNote("account_balance", "Revaluation set for 2027:", " 38 homes assessed below 80% of recent nearby sale prices"),
        ),
    )

    val farms: List<Farm> = listOf(birchwoodFarm, glendoraFarm)

    fun grid(farmId: String): FarmGrid? = when (farmId) {
        BIRCHWOOD_FARM_ID -> birchwoodGrid
        GLENDORA_FARM_ID -> glendoraGrid
        else -> null
    }

    fun stats(farmId: String): FarmStats? = when (farmId) {
        BIRCHWOOD_FARM_ID -> birchwoodStats
        GLENDORA_FARM_ID -> glendoraStats
        else -> null
    }

    // ------------------------------------------------------------------ properties

    const val BIRCHWOOD_PIN: PamsPin = "0409_285.14_9"
    const val HARDING_PIN: PamsPin = "1340_76_12"
    const val HAMILTON_PIN: PamsPin = "0905_112_7"
    const val LAUREL_PIN: PamsPin = "0415_1803.02_5"
    const val SPRING_PIN: PamsPin = "1340_44_3"
    const val KRESSON_PIN: PamsPin = "0409_431_14"
    const val HARRISON_AVE_PIN: PamsPin = "0905_88_21"
    const val CLEVELAND_PIN: PamsPin = "0905_97_4"
    const val PROSPECT_PIN: PamsPin = "1340_58_9"

    private val birchwoodParcel = birchwoodGrid.byAddress("36 Birchwood Dr")!!
    private val birchwoodLocation = birchwoodGrid.centerOf(birchwoodParcel)

    val birchwoodSummary = PropertySummary(
        pin = BIRCHWOOD_PIN,
        address = "36 Birchwood Dr",
        town = SampleTowns.cherryHill.town,
        county = SampleTowns.cherryHill.county,
        blockLot = Format.blockLot("285.14", "9"),
        score = 72,
        taxBill = 11_284,
        propertyClassLabel = "Class 2 residential",
        farmName = birchwoodFarm.name,
        lat = birchwoodLocation.lat,
        lon = birchwoodLocation.lon,
    )

    val birchwoodRobust: List<RobustDimension> = listOf(
        RobustDimension('R', "Recourse", 78),
        RobustDimension('O', "Overassessment", 81),
        RobustDimension('B', "Burden", 58),
        RobustDimension('U', "Uniformity", 70),
        RobustDimension('S', "Stability", 76),
        RobustDimension('T', "Trajectory", 63),
    )

    val birchwoodSeed = SampleProperties.Seed(
        summary = birchwoodSummary,
        town = SampleTowns.cherryHill,
        assessed = 262_400,
        bill = 11_284,
        salesMedian = 455_000,
        salesCount = 7,
        sales = birchwoodRecentSales.filter { it.address in setOf("22 Birchwood Dr", "9 Ashbrook Rd", "51 Queen Anne Rd") },
        lastSoldPrice = 312_000,
        lastSoldYear = 2014,
        facts = HomeFacts("2 · Residential", 1962, "2-story colonial", 1_980, 0.28, "285.14", "9"),
        robust = birchwoodRobust,
        coveragePercent = 92,
    )

    val birchwoodDetail: PropertyDetail = SampleProperties.detail(birchwoodSeed)

    val hardingSummary = PropertySummary(
        pin = HARDING_PIN,
        address = "143 Harding Rd",
        town = SampleTowns.redBank.town,
        county = SampleTowns.redBank.county,
        blockLot = Format.blockLot("76", "12"),
        score = 57,
        taxBill = 12_980,
        propertyClassLabel = "Class 2 residential",
        lat = 40.3489,
        lon = -74.0742,
    )

    const val HARDING_ASSESSED = 624_600
    const val HARDING_LIST_PRICE = 849_000

    val hardingSeed = SampleProperties.Seed(
        summary = hardingSummary,
        town = SampleTowns.redBank,
        assessed = HARDING_ASSESSED,
        bill = 12_980,
        salesMedian = 705_000,
        salesCount = 5,
        sales = listOf(
            NearbySale("88 Harding Rd", "Aug 2026", 712_000),
            NearbySale("17 Waverly Pl", "Jul 2026", 689_000),
            NearbySale("202 Branch Ave", "May 2026", 735_000),
        ),
        lastSoldPrice = 455_000,
        lastSoldYear = 2015,
        facts = HomeFacts("2 · Residential", 1928, "2-story colonial", 2_140, 0.21, "76", "12"),
        robust = listOf(
            RobustDimension('R', "Recourse", 55),
            RobustDimension('O', "Overassessment", 61),
            RobustDimension('B', "Burden", 48),
            RobustDimension('U', "Uniformity", 62),
            RobustDimension('S', "Stability", 66),
            RobustDimension('T', "Trajectory", 52),
        ),
        coveragePercent = 88,
        explanation = "The assessment holds up at today’s prices, but the bill is low for the asking price and could move at a revaluation. Evidence coverage 88%, high confidence.",
    )

    val hardingDetail: PropertyDetail = SampleProperties.detail(hardingSeed)

    private fun clientHome(pin: PamsPin, address: String, town: SampleTown, block: String, lot: String, score: Int, taxBill: Int, lat: Double, lon: Double) =
        PropertySummary(pin, address, town.town, town.county, Format.blockLot(block, lot), score, taxBill, "Class 2 residential", null, lat, lon)

    /*
     * Client homes. The tax bill here is the 2025 bill on the state list, and the property page derives next year's
     * bill from it with [TaxMath.billYear] (the bill scaled by the town's 2025 → 2026 rate change). Where a chip,
     * task or digest title says "bill up $X", the 2025 bill is chosen so that scaling lands on exactly X:
     * Harrison 2.612 → 2.795 turns 8,729 into 9,341 (+$612, the figure the mockups show everywhere) and 5,531 into
     * 5,919 (+$388); Gloucester Twp 4.201 → 4.312 turns 7,940 into 8,150 (+$210). A test checks every bill-change
     * title against the page it opens.
     */
    val hamiltonSummary = clientHome(HAMILTON_PIN, "27 Hamilton St", SampleTowns.harrison, "112", "7", 61, 8_729, 40.7449, -74.1563)
    val laurelSummary = clientHome(LAUREL_PIN, "5 Laurel Ct", SampleTowns.gloucesterTwp, "1803.02", "5", 66, 7_940, 39.8301, -75.0622)
    val springSummary = clientHome(SPRING_PIN, "61 Spring St", SampleTowns.redBank, "44", "3", 74, 10_366, 40.3512, -74.0691)
    val kressonSummary = clientHome(KRESSON_PIN, "418 Kresson Rd", SampleTowns.cherryHill, "431", "14", 69, 12_212, 39.8873, -74.9841)
    val harrisonAveSummary = clientHome(HARRISON_AVE_PIN, "402 Harrison Ave", SampleTowns.harrison, "88", "21", 58, 8_744, 40.7431, -74.1520)
    val clevelandSummary = clientHome(CLEVELAND_PIN, "14 Cleveland Ave", SampleTowns.harrison, "97", "4", 63, 5_531, 40.7466, -74.1541)
    val prospectSummary = clientHome(PROSPECT_PIN, "31 Prospect Ave", SampleTowns.redBank, "58", "9", 71, 13_105, 40.3462, -74.0775)

    /** Homes the sample knows by name: the two mockup pages plus every client home and farm parcel. */
    val properties: List<PropertySummary> = listOf(
        birchwoodSummary, hardingSummary, hamiltonSummary, laurelSummary, springSummary, kressonSummary,
        harrisonAveSummary, clevelandSummary, prospectSummary,
    )

    fun parcelSummary(farm: Farm, grid: FarmGrid, parcelPin: PamsPin): PropertySummary? {
        val parcel = grid.byPin(parcelPin) ?: return null
        val parts = Format.parsePin(parcel.pin)
        val town = SampleTowns.byName(farm.town) ?: SampleTowns.cherryHill
        val center = grid.centerOf(parcel)
        return PropertySummary(
            pin = parcel.pin,
            address = parcel.address,
            town = town.town,
            county = town.county,
            blockLot = parts?.let { Format.blockLot(it.block, it.lot) } ?: parcel.pin,
            score = parcel.score,
            taxBill = parcel.taxBill,
            propertyClassLabel = if (parcel.residential) "Class 2 residential" else "Class 4A commercial",
            farmName = farm.name,
            lat = center.lat,
            lon = center.lon,
        )
    }

    /** Every searchable home: the named properties first, then the farm parcels. */
    val searchableProperties: List<PropertySummary> by lazy {
        val known = properties.map { it.pin }.toSet()
        properties + farms.flatMap { farm ->
            val grid = grid(farm.id) ?: return@flatMap emptyList<PropertySummary>()
            grid.parcels.filter { it.pin !in known }.mapNotNull { parcelSummary(farm, grid, it.pin) }
        }
    }

    private val seedsByPin: Map<PamsPin, SampleProperties.Seed> = mapOf(
        BIRCHWOOD_PIN to birchwoodSeed,
        HARDING_PIN to hardingSeed,
    )

    /** The full page for any PIN: the two hand-built pages, a farm parcel or a client home, or an invented one. */
    fun seed(pin: PamsPin): SampleProperties.Seed {
        seedsByPin[pin]?.let { return it }
        val summary = searchableProperties.firstOrNull { it.pin == pin }
        val invented = SampleProperties.invent(pin)
        if (summary == null) return invented
        val town = SampleTowns.byName(summary.town) ?: invented.town
        val bill = summary.taxBill ?: invented.bill
        val rate = town.rates.getValue(town.latestYear - 1)
        val assessed = (bill / rate * 100).roundToInt() / 100 * 100
        val parts = Format.parsePin(pin)
        return invented.copy(
            summary = summary,
            town = town,
            assessed = assessed,
            bill = bill,
            facts = invented.facts.copy(
                propertyClass = if (summary.propertyClassLabel.contains("4A")) "4A · Commercial" else invented.facts.propertyClass,
                block = parts?.block ?: invented.facts.block,
                lot = parts?.lot ?: invented.facts.lot,
            ),
        )
    }

    fun detail(pin: PamsPin): PropertyDetail = SampleProperties.detail(seed(pin))

    fun checkupUrl(pin: PamsPin): String = "$SITE_ORIGIN/checkup?pin=$pin&agent=$AGENT_SLUG"

    fun trueCostShareUrl(pin: PamsPin): String = "$SITE_ORIGIN/true-cost?pin=$pin&agent=$AGENT_SLUG"

    // ------------------------------------------------------------------ Today digest

    val teaser = IntelligenceTeaser("Harrison’s 2026 rate rose 7%. Nine past clients’ bills went up, and their checkups are ready.")

    private const val HAMILTON_PHONE = "(973) 555-0134"

    val tasks: List<AgentTask> = listOf(
        AgentTask(
            id = "task-send-checkups",
            title = "Send 12 tax checkups",
            subtitle = "Final 2026 bills are out · appeals due ${TaxMath.nextDeadline(today).shortLabel}",
            action = TaskAction(TaskActionKind.Review, "Review", route = "clients?filter=checkup"),
        ),
        AgentTask(
            id = "task-call-hamilton",
            title = "Call about 27 Hamilton St",
            subtitle = "Past client · 2026 bill up ${Format.money(612)}",
            action = TaskAction(TaskActionKind.Call, null, phone = HAMILTON_PHONE, route = "property/$HAMILTON_PIN"),
        ),
        AgentTask(
            id = "task-approve-postcard",
            title = "Approve the fall postcard",
            subtitle = "Birchwood Park · ${Format.number(412)} homes · ${Format.mails(LocalDate(2026, 10, 6))}",
            action = TaskAction(TaskActionKind.Open, "Open", route = "marketing"),
        ),
        AgentTask(
            id = "task-renovation-note",
            title = "Send a renovation note to 61 Spring St",
            subtitle = "Sphere · kitchen permit filed Sep 24",
            action = TaskAction(TaskActionKind.Send, "Send", route = "property/$SPRING_PIN"),
        ),
        AgentTask(
            id = "task-anniversary-card",
            title = "Write an anniversary card for 418 Kresson Rd",
            subtitle = "Past client, 2016 · 10 years Oct 7",
            action = TaskAction(TaskActionKind.Open, "Open", route = "property/$KRESSON_PIN"),
        ),
    )

    private val birchwood22Pin = birchwoodGrid.byAddress("22 Birchwood Dr")!!.pin
    private val queenAnne57Pin = birchwoodGrid.byAddress("57 Queen Anne Rd")!!.pin
    private val heritage12Pin = birchwoodGrid.byAddress("12 Heritage Rd")!!.pin
    private val ashbrook48Pin = birchwoodGrid.byAddress("48 Ashbrook Rd")!!.pin

    /** Ten changes since Sep 21: 3 tax bills, 2 permits, 4 sales, 1 town. The first four are the ones on the Today screen. */
    val changes: List<PropertyChange> = listOf(
        PropertyChange("chg-hamilton-bill", ChangeKind.TaxBill, "2026 bill up ${Format.money(612)}", "27 Hamilton St, Harrison · Past client", HAMILTON_PIN, Relationship.PastClient, TileTint.Sky, "receipt_long", "NJ Division of Taxation, 2026 rates"),
        PropertyChange("chg-spring-permit", ChangeKind.Permit, "Kitchen permit filed", "61 Spring St, Red Bank · Sphere", SPRING_PIN, Relationship.Sphere, TileTint.Sand, "construction", "Red Bank construction permits"),
        PropertyChange("chg-gloucester-reval", ChangeKind.Town, "Revaluation set for 2027", "Gloucester Twp · 38 homes in your farm", null, Relationship.Farm, TileTint.Mint, "account_balance", "Township notice"),
        PropertyChange("chg-birchwood-22-sale", ChangeKind.Sale, "Sold for ${Format.money(468_000)}", "22 Birchwood Dr, Cherry Hill · Farm", birchwood22Pin, Relationship.Farm, TileTint.Sky, "sell", "SR1A deed sales"),
        PropertyChange("chg-laurel-bill", ChangeKind.TaxBill, "2026 bill up ${Format.money(210)}", "5 Laurel Ct, Gloucester Twp · Past client", LAUREL_PIN, Relationship.PastClient, TileTint.Sky, "receipt_long", "NJ Division of Taxation, 2026 rates"),
        PropertyChange("chg-cleveland-bill", ChangeKind.TaxBill, "2026 bill up ${Format.money(388)}", "14 Cleveland Ave, Harrison · Past client", CLEVELAND_PIN, Relationship.PastClient, TileTint.Sky, "receipt_long", "NJ Division of Taxation, 2026 rates"),
        PropertyChange("chg-ashbrook-permit", ChangeKind.Permit, "Deck permit filed", "48 Ashbrook Rd, Cherry Hill · Farm", ashbrook48Pin, Relationship.Farm, TileTint.Sand, "construction", "Cherry Hill construction permits"),
        PropertyChange("chg-queen-anne-sale", ChangeKind.Sale, "Sold for ${Format.money(512_000)}", "57 Queen Anne Rd, Cherry Hill · Farm", queenAnne57Pin, Relationship.Farm, TileTint.Sky, "sell", "SR1A deed sales"),
        PropertyChange("chg-heritage-sale", ChangeKind.Sale, "Sold for ${Format.money(389_000)}", "12 Heritage Rd, Cherry Hill · Farm", heritage12Pin, Relationship.Farm, TileTint.Sky, "sell", "SR1A deed sales"),
        PropertyChange("chg-prospect-sale", ChangeKind.Sale, "Sold for ${Format.money(620_000)}", "31 Prospect Ave, Red Bank · Sphere", PROSPECT_PIN, Relationship.Sphere, TileTint.Sky, "sell", "SR1A deed sales"),
    )

    fun digest(doneTaskIds: Set<String> = emptySet()): WeekDigest = WeekDigest(
        weekStart = weekStart,
        periodLabel = "This week · ${Format.since(weekStart)}",
        dateLabel = Format.longDate(today),
        total = changes.size,
        taxBills = changes.count { it.kind == ChangeKind.TaxBill },
        permits = changes.count { it.kind == ChangeKind.Permit },
        sales = changes.count { it.kind == ChangeKind.Sale },
        town = changes.count { it.kind == ChangeKind.Town },
        needsYouCount = tasks.count { it.id !in doneTaskIds },
        tasks = tasks.map { it.copy(done = it.id in doneTaskIds) },
        changes = changes,
        teaser = teaser,
    )

    val digest: WeekDigest = digest(emptySet())

    // ------------------------------------------------------------------ clients

    /** April 1, 2027: the next county appeal deadline from the sample's date. */
    val appealDeadline: TaxMath.AppealDeadline = TaxMath.nextDeadline(today)

    const val CHECKUPS_READY = 12

    fun checkupSeason(readyCount: Int): CheckupSeason? = if (readyCount <= 0) null else CheckupSeason(
        title = "${Format.count(readyCount, "tax checkup")} ready to send",
        body = "Final 2026 bills are out. Each checkup shows whether the assessment holds up and the ${appealDeadline.label} appeal deadline.",
        ctaLabel = "Review and send",
        readyCount = readyCount,
        appealDeadline = appealDeadline.label,
    )

    val checkupSeason: CheckupSeason = checkupSeason(CHECKUPS_READY)!!

    private val quiet = NextAction(NextActionKind.None, "Nothing new this week")
    private val sendCheckup = NextAction(NextActionKind.Send, "Send tax checkup")

    /** The five rows on the Clients screen, in order. */
    val visibleClients: List<ClientRow> = listOf(
        ClientRow("client-104", HAMILTON_PIN, "27 Hamilton St", "Harrison", Relationship.PastClient, 2019, "CRM-104", StatusChip("Bill up ${Format.money(612)}", Tone.Warn), NextAction(NextActionKind.Call, "Call about the new bill", HAMILTON_PHONE), TileTint.Sky, checkupReady = true),
        ClientRow("client-131", LAUREL_PIN, "5 Laurel Ct", "Gloucester Twp", Relationship.PastClient, 2021, "CRM-131", StatusChip("Checkup ready", Tone.Good), sendCheckup, TileTint.Mint, checkupReady = true),
        ClientRow("client-212", SPRING_PIN, "61 Spring St", "Red Bank", Relationship.Sphere, null, "CRM-212", StatusChip("Permit filed", Tone.Sky), NextAction(NextActionKind.Mail, "Send a renovation note"), TileTint.Sand),
        ClientRow("client-088", KRESSON_PIN, "418 Kresson Rd", "Cherry Hill", Relationship.PastClient, 2016, "CRM-088", StatusChip("10 years Oct 7", Tone.Neutral, "cake"), NextAction(NextActionKind.Edit, "Write an anniversary card"), TileTint.Fill),
        ClientRow("client-247", HARRISON_AVE_PIN, "402 Harrison Ave", "Harrison", Relationship.Sphere, null, "CRM-247", StatusChip("Watching", Tone.Neutral), quiet, TileTint.Fill),
    )

    /** 146 clients: 58 past clients and 88 sphere contacts, 12 of them with a checkup ready. */
    val clients: List<ClientRow> by lazy { visibleClients + SampleClients.generate(visibleClients) }

    // ------------------------------------------------------------------ scan

    const val HARDING_LISTING_URL = "zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701"

    /**
     * The listing price check for 143 Harding Rd, from the site's math: at $849,000 in Red Bank a home usually pays
     * about $16,340 and this one pays $12,980, a 20% gap, so "Low tax for this price". The site compares the bill
     * scaled to the newest rate, as its true-cost route does.
     */
    val hardingPriceCheck: PriceCheck = run {
        val town = SampleTowns.redBank
        val currentBill = hardingDetail.tax?.nextYearBill?.toDouble() ?: 12_980.0
        TaxMath.priceVerdict(
            TaxMath.priceCheck(
                price = HARDING_LIST_PRICE.toDouble(),
                assessed = HARDING_ASSESSED.toDouble(),
                tax = currentBill,
                ratioPercent = town.ratioPercent,
                upperPercent = town.upperPercent,
                ratePer100 = town.latestRate,
            ),
            town.shortName,
        )
    }

    fun hardingScan(fromSign: Boolean): ScanResult = ScanResult(
        property = hardingSummary,
        score = 57,
        verdict = TaxMath.verdictFor(57),
        taxBillYear = 2025,
        taxBill = 12_980,
        nextYear = 2026,
        nextYearBill = hardingDetail.tax?.nextYearBill,
        listPrice = HARDING_LIST_PRICE,
        priceSourceLabel = if (fromSign) "From the sign’s listing link" else "From the pasted link",
        priceCheck = hardingPriceCheck,
        matchLabel = if (fromSign) "For Sale sign · QR read · parcel matched" else null,
    )

    val hardingScan: ScanResult = hardingScan(fromSign = false)

    // ------------------------------------------------------------------ marketing

    val campaigns: List<Campaign> = listOf(
        Campaign(
            id = "campaign-fall-2026-postcard",
            kind = CampaignKind.Postcard,
            title = "Birchwood Park fall update",
            subtitle = "Postcard · ${Format.number(412)} homes · ${Format.mails(LocalDate(2026, 10, 6))}",
            status = StatusChip("Proof ready", Tone.Warn),
            thumbTop = "Fall 2026",
            thumbBottom = "Median ${Format.moneyCompact(455_000)}",
        ),
        Campaign(
            id = "campaign-september-email",
            kind = CampaignKind.Email,
            title = "September market update",
            subtitle = "Email · ${Format.number(146)} contacts · ${Format.sent(weekStart)}",
            status = StatusChip("48% opened · 9 replies", Tone.Good),
        ),
    )

    /** $449,000 with 20% down at 6.5% over 30 years, $1,680 a year of insurance: $2,270 + $978 + $140 = $3,388 a month. */
    val trueCostInputs = TrueCostInputs(price = 449_000, downPercent = 20.0, ratePercent = 6.5, termYears = 30, annualInsurance = 1_680, monthlyHoa = 0)

    /** Default asking prices for the true cost card; other homes use their implied value. */
    fun defaultListPrice(detail: PropertyDetail): Int = when (detail.summary.pin) {
        BIRCHWOOD_PIN -> trueCostInputs.price
        HARDING_PIN -> HARDING_LIST_PRICE
        else -> ((detail.valueCheck?.impliedValue ?: (detail.tax?.bill ?: 10_000) * 40) / 1_000) * 1_000
    }

    fun trueCostCard(detail: PropertyDetail, inputs: TrueCostInputs?, includeContactCard: Boolean): TrueCostCard {
        val resolvedInputs = inputs ?: trueCostInputs.copy(price = defaultListPrice(detail))
        // The site feeds the newer year's bill when it has one (2026 at the new rate), else the bill on file.
        val annualTax = detail.tax?.nextYearBill ?: detail.tax?.bill ?: 0
        val monthly = TaxMath.monthlyCost(resolvedInputs, annualTax)
        val shortTown = SampleTowns.byName(detail.summary.town)?.shortName ?: detail.summary.town
        return TrueCostCard(
            pin = detail.summary.pin,
            address = "${detail.summary.address}, $shortTown",
            inputs = resolvedInputs,
            annualTax = annualTax,
            monthlyMortgage = monthly.principalAndInterestRounded,
            monthlyTax = monthly.taxRounded,
            monthlyInsurance = monthly.insuranceRounded,
            monthlyHoa = monthly.hoaRounded,
            monthlyTotal = monthly.totalRounded,
            agent = if (includeContactCard) agentCard else null,
            shareUrl = trueCostShareUrl(detail.summary.pin),
        )
    }

    val trueCostCard: TrueCostCard = trueCostCard(birchwoodDetail, trueCostInputs, includeContactCard = true)

    // ------------------------------------------------------------------ Watchdog Intelligence

    val brief = Brief(
        kicker = "Monday brief",
        timeLabel = "${Format.time12h(8)} · 2 min read",
        listenLabel = "Listen ${Format.duration(112)}",
        heading = "Three things worth your time this week",
        items = listOf(
            BriefItem(
                lead = "Harrison’s 2026 rate rose 7%.",
                text = " Nine past clients’ bills went up between ${Format.money(380)} and ${Format.money(640)}. Their tax checkups are ready to send.",
                source = "NJ Division of Taxation, 2026 rates",
            ),
            BriefItem(
                lead = "Gloucester Twp revalues for 2027.",
                text = " In your Glendora farm, 38 homes are assessed below 80% of recent nearby sale prices, so their bills may rise.",
                source = "Township notice · SR1A deed sales",
            ),
            BriefItem(
                lead = "Birchwood Park is moving.",
                text = " Seven sales since June at a median ${Format.money(455_000)}, 6% above last year.",
                source = "SR1A deed sales",
            ),
        ),
        followUps = listOf(
            FollowUp("chat_bubble", "Which Harrison clients should I call first?"),
            FollowUp("edit", "Draft a note to the nine Harrison clients"),
            FollowUp("compare_arrows", "Compare Glendora with Blackwood"),
        ),
        forLabel = "For Alex · ${Format.longDate(today)}",
    )

    // ------------------------------------------------------------------ alerts and settings

    val notifications: List<AppNotification> = listOf(
        AppNotification(
            id = "alert-monday-brief",
            channel = AlertChannel.MondayBrief,
            title = "Your Monday brief is ready",
            body = "10 changes in your clients’ homes and farm. Top: the final 2026 bill at 27 Hamilton St, Harrison rose ${Format.money(612)}.",
            timeLabel = "now",
            pin = HAMILTON_PIN,
            actions = listOf(
                NotificationAction(NotificationActionKind.OpenBrief, "Open brief"),
                NotificationAction(NotificationActionKind.CallClient, "Call client"),
            ),
        ),
        AppNotification(
            id = "alert-birchwood-deed",
            channel = AlertChannel.FarmSalesAndDeeds,
            title = "Deed recorded in Birchwood Park",
            body = "22 Birchwood Dr sold for ${Format.money(468_000)}. Seven sales in your farm since June.",
            timeLabel = "7:41 AM",
            pin = birchwood22Pin,
            actions = listOf(NotificationAction(NotificationActionKind.ViewFarm, "View farm")),
        ),
        AppNotification(
            id = "alert-checkups-ready",
            channel = AlertChannel.AppealDeadlines,
            title = "12 tax checkups are ready",
            body = "Final 2026 bills are out. Appeals are due April 1.",
            timeLabel = "Sun",
            pin = null,
            actions = listOf(
                NotificationAction(NotificationActionKind.SendCheckups, "Send checkups"),
                NotificationAction(NotificationActionKind.Later, "Later"),
            ),
        ),
    )

    /** Monday email on, notification on, client changes on, farm deeds on, town rates off, deadlines on, quiet 9 PM to 7 AM. */
    val alertPreferences: AlertPreferences = AlertPreferences()

    val appSettings: AppSettings = AppSettings(themeMode = AppThemeMode.System, hasSeenWelcome = true, extensionKeyEnabled = true)
}
