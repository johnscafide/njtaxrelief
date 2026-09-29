package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AnalystAnswer
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.ClientsOverview
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.NextAction
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.TurnoverNote
import com.watchdogindex.agent.core.model.WeekDigest
import com.watchdogindex.agent.core.repo.AlertsRepository
import com.watchdogindex.agent.core.repo.AuthRepository
import com.watchdogindex.agent.core.repo.ClientsRepository
import com.watchdogindex.agent.core.repo.DigestRepository
import com.watchdogindex.agent.core.repo.FarmRepository
import com.watchdogindex.agent.core.repo.IntelligenceRepository
import com.watchdogindex.agent.core.repo.KeyValueStore
import com.watchdogindex.agent.core.repo.MarketingRepository
import com.watchdogindex.agent.core.repo.PropertyRepository
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.core.repo.ScanRepository
import com.watchdogindex.agent.core.repo.SettingsRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt

/**
 * Every repository, served from [SampleData] with the behaviour of the real thing: a short delay per call,
 * search that filters, state that changes when the agent saves, watches, sends or snoozes, and preferences that
 * survive through the [KeyValueStore]. Previews, screenshots, tests and the app's demo mode all run on this.
 *
 * State lives in `MutableStateFlow`s and a `Mutex` guards the one-time load from the store, so it is safe to
 * call from any coroutine. Set [latencyMillis] to 0 to make calls immediate.
 */
class SampleRepositories(
    private val store: KeyValueStore = InMemoryKeyValueStore(),
    signedIn: Boolean = true,
    private val latencyMillis: Long = 150L,
) : Repositories {

    private val loadMutex = Mutex()
    private var loaded = false

    private suspend fun latency() {
        if (latencyMillis > 0) delay(latencyMillis)
    }

    /**
     * Reads what an earlier run stored (alert preferences, app settings, the signed-in session). Runs once;
     * `auth.restore()` and `alerts.refresh()` call it, so an app that restores its session at launch is covered.
     */
    suspend fun loadPersisted() {
        loadMutex.withLock {
            if (loaded) return
            StoredAlertPreferences.decode(store.get(StoreKeys.ALERT_PREFERENCES))?.let { alerts.preferencesState.value = it }
            StoredAppSettings.decode(store.get(StoreKeys.APP_SETTINGS))?.let { settings.settingsState.value = it }
            StoredSession.decode(store.get(StoreKeys.SESSION))?.let { auth.authState.value = AuthState.SignedIn(it) }
            loaded = true
        }
    }

    override val auth = SampleAuthRepository(signedIn)
    override val digest = SampleDigestRepository()
    override val properties = SamplePropertyRepository()
    override val scan = SampleScanRepository()
    override val clients = SampleClientsRepository()
    override val farm = SampleFarmRepository()
    override val marketing = SampleMarketingRepository()
    override val intelligence = SampleIntelligenceRepository()
    override val alerts = SampleAlertsRepository()
    override val settings = SampleSettingsRepository(signedIn)

    // ------------------------------------------------------------------ auth

    inner class SampleAuthRepository(signedIn: Boolean) : AuthRepository {
        internal val authState = MutableStateFlow<AuthState>(if (signedIn) AuthState.SignedIn(SampleData.session) else AuthState.SignedOut)
        override val state: StateFlow<AuthState> = authState.asStateFlow()

        override suspend fun sendCode(email: String) {
            latency()
            val clean = email.trim()
            if (!isEmail(clean)) throw WatchdogException("Invalid email", userMessage = "Enter the email you use for the Agent Desk.")
            authState.value = AuthState.CodeSent(clean)
        }

        /** The sample accepts "000000" and any other six-digit code. */
        override suspend fun verifyCode(email: String, code: String) {
            latency()
            val digits = code.filter { it.isDigit() }
            if (digits.length != 6 || code.trim().length != 6) {
                throw WatchdogException("Bad code", userMessage = "That code didn’t match. Check the email and try again.")
            }
            signIn(email.trim().ifEmpty { SampleData.account.email })
        }

        override suspend fun signInWithPasskey() {
            latency()
            signIn(SampleData.account.email)
        }

        override suspend fun signOut() {
            latency()
            authState.value = AuthState.SignedOut
            store.put(StoreKeys.SESSION, null)
        }

        override suspend fun account(): Account {
            latency()
            val current = authState.value as? AuthState.SignedIn ?: throw NotSignedInException()
            return SampleData.account.copy(email = current.session.email)
        }

        override suspend fun restore() {
            loadPersisted()
            if (authState.value is AuthState.Unknown) authState.value = AuthState.SignedOut
        }

        private suspend fun signIn(email: String) {
            val session = SampleData.session.copy(email = email)
            authState.value = AuthState.SignedIn(session)
            store.put(StoreKeys.SESSION, StoredSession.encode(session))
        }

        private fun isEmail(text: String): Boolean {
            val at = text.indexOf('@')
            return at > 0 && at < text.length - 1 && text.indexOf('.', at) > at + 1 && !text.any { it.isWhitespace() }
        }
    }

    // ------------------------------------------------------------------ digest

    inner class SampleDigestRepository : DigestRepository {
        private val doneTaskIds = MutableStateFlow<Set<String>>(emptySet())

        override suspend fun thisWeek(): WeekDigest {
            latency()
            return SampleData.digest(doneTaskIds.value)
        }

        override suspend fun markTaskDone(taskId: String, done: Boolean) {
            latency()
            doneTaskIds.update { if (done) it + taskId else it - taskId }
        }
    }

    // ------------------------------------------------------------------ properties

    inner class SamplePropertyRepository : PropertyRepository {
        private val saved = MutableStateFlow<Set<PamsPin>>(emptySet())
        private val watched = MutableStateFlow<Set<PamsPin>>(emptySet())

        override suspend fun search(query: String): List<PropertySummary> {
            latency()
            val q = normalize(query)
            if (q.isEmpty()) return SampleData.properties
            val tokens = q.split(' ')
            val matches = SampleData.searchableProperties.filter { p ->
                val hay = normalize("${p.address} ${p.town} ${p.county} ${p.pin} ${p.blockLot} ${p.farmName ?: ""}")
                hay.contains(q) || tokens.all { hay.contains(it) }
            }
            return matches.sortedWith(compareBy({ !normalize(it.address).startsWith(q) }, { it.address })).take(25)
        }

        override suspend fun detail(pin: PamsPin): PropertyDetail {
            latency()
            if (pin.isBlank()) throw WatchdogException("Empty PIN", userMessage = "That property could not be found.")
            return SampleProperties.detail(SampleData.seed(pin), isSaved = pin in saved.value, isWatched = pin in watched.value)
        }

        override suspend fun setSaved(pin: PamsPin, saved: Boolean) {
            latency()
            this.saved.update { if (saved) it + pin else it - pin }
        }

        override suspend fun setWatched(pin: PamsPin, watched: Boolean) {
            latency()
            this.watched.update { if (watched) it + pin else it - pin }
        }

        override suspend fun checkupLink(pin: PamsPin): String {
            latency()
            return SampleData.checkupUrl(pin)
        }
    }

    // ------------------------------------------------------------------ scan

    inner class SampleScanRepository : ScanRepository {
        private val scans = MutableStateFlow(listOf(ScanHistoryItem(SampleData.hardingScan, SampleData.nowUtc.epochSeconds - 2 * 86_400)))

        override suspend fun resolve(input: ScanInput): ScanResult {
            latency()
            val result = when (input) {
                is ScanInput.ListingUrl -> pinIn(input.url)?.let { fromPin(it, fromSign = false) } ?: fromUrl(input.url, fromSign = false)
                is ScanInput.QrCode -> {
                    // A PIN is checked first: a bare PIN contains '.', so it would otherwise be taken for a link.
                    val pin = pinIn(input.payload)
                    when {
                        pin != null -> fromPin(pin, fromSign = true)
                        looksLikeUrl(input.payload) -> fromUrl(input.payload, fromSign = true)
                        else -> SampleData.hardingScan(fromSign = true)
                    }
                }
                is ScanInput.Address -> fromAddress(input.query)
            }
            scans.update { listOf(ScanHistoryItem(result, SampleData.nowUtc.epochSeconds)) + it.filter { h -> h.result.property.pin != result.property.pin } }
            return result
        }

        override suspend fun history(): List<ScanHistoryItem> {
            latency()
            return scans.value
        }

        /**
         * The PAMS PIN a payload carries, if any: the bare PIN a sign's QR code may hold ("0409_285.14_9"), a Watchdog
         * page link ("https://www.watchdogindex.com/p/0409_285.14_9") or a query parameter ("...?pin=0409_285.14_9").
         * Anything else (Zillow, Realtor.com and Redfin links have no PIN) returns null.
         */
        private fun pinIn(payload: String): PamsPin? {
            val trimmed = payload.trim()
            if (Format.parsePin(trimmed) != null) return trimmed
            Regex("[?&]pin=([^&#]+)").find(trimmed)?.groupValues?.get(1)?.let { if (Format.parsePin(it) != null) return it }
            return trimmed.split('/', '?', '&', '#', '=').firstOrNull { Format.parsePin(it) != null }
        }

        /** The parcel a PIN names, with no list price until the agent adds one. 143 Harding Rd keeps the mockup's sign scan. */
        private fun fromPin(pin: PamsPin, fromSign: Boolean): ScanResult {
            if (pin == SampleData.HARDING_PIN) return SampleData.hardingScan(fromSign)
            val seed = SampleData.seed(pin)
            return scanResult(
                seed,
                SampleProperties.detail(seed),
                listPrice = null,
                priceSourceLabel = "Add the list price",
                matchLabel = if (fromSign) "For Sale sign · QR read · parcel matched" else null,
            )
        }

        private fun looksLikeUrl(text: String) = text.contains('/') || text.contains('.')

        private fun fromUrl(url: String, fromSign: Boolean): ScanResult {
            val clean = url.trim()
            if (clean.isEmpty()) throw WatchdogException("Empty link", userMessage = "Paste a Zillow, Realtor.com or Redfin link.")
            if (clean.contains("harding", ignoreCase = true)) return SampleData.hardingScan(fromSign)
            val slug = listingSlug(clean) ?: throw WatchdogException("No address in link", userMessage = "That link has no address in it. Try the listing’s share link.")
            val known = SampleData.searchableProperties.firstOrNull { normalize(it.address) == normalize(slug.address) && (slug.town == null || normalize(it.town).startsWith(normalize(slug.town))) }
            val pin = known?.pin ?: inventedPin(slug.town, slug.address)
            val seed = SampleData.seed(pin).let { s -> if (known == null) s.copy(summary = s.summary.copy(address = slug.address)) else s }
            val detail = SampleProperties.detail(seed)
            val listPrice = ((detail.valueCheck?.impliedValue ?: seed.assessed) * 1.06 / 1_000).roundToInt() * 1_000
            return scanResult(seed, detail, listPrice, if (fromSign) "From the sign’s listing link" else "From the pasted link", if (fromSign) "For Sale sign · QR read · parcel matched" else null)
        }

        private fun fromAddress(query: String): ScanResult {
            val q = normalize(query)
            if (q.isEmpty()) throw WatchdogException("Empty address", userMessage = "Type an address to look up.")
            val known = SampleData.searchableProperties.firstOrNull { normalize("${it.address} ${it.town}").contains(q) || normalize(it.address) == q }
            val pin = known?.pin ?: inventedPin(null, query)
            val seed = SampleData.seed(pin).let { s -> if (known == null) s.copy(summary = s.summary.copy(address = query.trim())) else s }
            val detail = SampleProperties.detail(seed)
            return scanResult(seed, detail, listPrice = null, priceSourceLabel = "Add the list price", matchLabel = "Address matched to a parcel")
        }

        private fun scanResult(seed: SampleProperties.Seed, detail: PropertyDetail, listPrice: Int?, priceSourceLabel: String, matchLabel: String?): ScanResult {
            val town = seed.town
            val currentBill = detail.tax?.nextYearBill?.toDouble() ?: seed.bill.toDouble()
            val facts = listPrice?.let {
                TaxMath.priceCheck(it.toDouble(), seed.assessed.toDouble(), currentBill, town.ratioPercent, town.upperPercent, town.latestRate)
            }
            return ScanResult(
                property = detail.summary,
                score = detail.score?.score,
                verdict = detail.score?.verdict,
                taxBillYear = detail.tax?.billYear ?: (town.latestYear - 1),
                taxBill = seed.bill,
                nextYear = town.latestYear,
                nextYearBill = detail.tax?.nextYearBill,
                listPrice = listPrice,
                priceSourceLabel = priceSourceLabel,
                priceCheck = TaxMath.priceVerdict(facts, town.shortName),
                matchLabel = matchLabel,
            )
        }

        /**
         * Pulls the address and town out of a listing link. Zillow: ".../homedetails/143-Harding-Rd-Red-Bank-NJ-07701/...";
         * Realtor.com: ".../realestateandhomes-detail/12-Maple-Ave_Haddonfield_NJ_08033_M1234-56789"; Redfin:
         * ".../NJ/Red-Bank/143-Harding-Rd-07701/home/123". Everything from the "NJ" marker on is dropped.
         */
        private fun listingSlug(url: String): ListingSlug? {
            val path = url.substringAfter("://", url).substringAfter('/', "").substringBefore('?')
            val segments = path.split('/').filter { it.isNotBlank() }
            val index = segments.indexOfFirst { it.first().isDigit() && (it.contains('-') || it.contains('_')) }
            if (index < 0) return null
            var tokens = segments[index].split('-', '_').filter { it.isNotBlank() }
            tokens = tokens.takeWhile { !it.equals("NJ", ignoreCase = true) }.dropLastWhile { it.all(Char::isDigit) }
            if (tokens.size < 2) return null
            val suffixes = setOf("st", "rd", "ave", "dr", "ct", "ln", "pl", "way", "ter", "blvd", "cir", "hwy", "pike", "trl")
            val suffixIndex = tokens.indices.firstOrNull { i -> i > 0 && tokens[i].lowercase() in suffixes } ?: -1
            val addressTokens = if (suffixIndex > 0) tokens.take(suffixIndex + 1) else tokens.take(3)
            var townTokens = tokens.drop(addressTokens.size)
            if (townTokens.isEmpty() && index > 0) {
                // Redfin puts the town in the segment before the address.
                val previous = segments[index - 1]
                if (previous.all { it.isLetter() || it == '-' || it == '_' } && !previous.equals("NJ", ignoreCase = true)) townTokens = previous.split('-', '_').filter { it.isNotBlank() }
            }
            return ListingSlug(addressTokens.joinToString(" ") { it.replaceFirstChar(Char::uppercaseChar) }, townTokens.takeIf { it.isNotEmpty() }?.joinToString(" "))
        }

        private fun inventedPin(town: String?, address: String): PamsPin {
            val district = town?.let { SampleTowns.byName(it)?.district } ?: SampleTowns.all[SampleTowns.stableIndex(address, SampleTowns.all.size)].district
            val h = abs(SampleProperties.stableHash(normalize(address)))
            return "${district}_${10 + h % 900}_${1 + (h / 900) % 40}"
        }
    }

    // ------------------------------------------------------------------ clients

    inner class SampleClientsRepository : ClientsRepository {
        private val rows = MutableStateFlow(SampleData.clients)
        private var importCount = 0

        override suspend fun overview(filter: ClientFilter, query: String): ClientsOverview {
            latency()
            val all = rows.value
            val q = normalize(query)
            val filtered = all.filter { row ->
                val inFilter = when (filter) {
                    ClientFilter.All -> true
                    ClientFilter.PastClients -> row.relationship == Relationship.PastClient
                    ClientFilter.Sphere -> row.relationship == Relationship.Sphere
                    ClientFilter.CheckupReady -> row.checkupReady
                }
                inFilter && (q.isEmpty() || normalize("${row.address} ${row.town} ${row.crmRef ?: ""}").contains(q))
            }
            val ready = all.count { it.checkupReady }
            return ClientsOverview(
                all = all.size,
                pastClients = all.count { it.relationship == Relationship.PastClient },
                sphere = all.count { it.relationship == Relationship.Sphere },
                checkupsReady = ready,
                season = SampleData.checkupSeason(ready),
                rows = filtered,
            )
        }

        override suspend fun sendCheckup(clientId: String) {
            latency()
            rows.update { list -> list.map { if (it.id == clientId) sent(it) else it } }
        }

        override suspend fun sendAllReadyCheckups(): Int {
            latency()
            val count = rows.value.count { it.checkupReady }
            rows.update { list -> list.map { if (it.checkupReady) sent(it) else it } }
            return count
        }

        override suspend fun snooze(clientId: String) {
            latency()
            rows.update { list ->
                list.map {
                    if (it.id == clientId) it.copy(status = StatusChip("Snoozed", Tone.Neutral, "snooze"), nextAction = NextAction(NextActionKind.None, "Snoozed until next Monday"), checkupReady = false) else it
                }
            }
        }

        override suspend fun import(rows: List<ClientImportRow>): Int {
            latency()
            val added = rows.map { row ->
                importCount += 1
                val town = SampleTowns.byName(row.town)
                ClientRow(
                    id = "client-import-$importCount",
                    pin = town?.let { "${it.district}_${600 + importCount}_1" },
                    address = row.address.trim(),
                    town = town?.shortName ?: row.town.trim(),
                    relationship = row.relationship,
                    relationshipYear = row.year,
                    crmRef = row.crmRef?.trim()?.takeIf { it.isNotEmpty() },
                    status = StatusChip(if (town != null) "Matched to a parcel" else "Needs a match", if (town != null) Tone.Good else Tone.Warn),
                    nextAction = NextAction(NextActionKind.None, "Nothing new this week"),
                    tile = TileTint.Fill,
                )
            }
            this.rows.update { it + added }
            return added.size
        }

        private fun sent(row: ClientRow): ClientRow = row.copy(
            status = StatusChip("Checkup sent", Tone.Good, "send"),
            nextAction = NextAction(NextActionKind.None, "Checkup sent today"),
            checkupReady = false,
        )
    }

    // ------------------------------------------------------------------ farm

    inner class SampleFarmRepository : FarmRepository {
        private val farms = MutableStateFlow(SampleData.farms)
        private val grids = MutableStateFlow<Map<String, FarmGrid>>(SampleData.farms.associate { it.id to SampleData.grid(it.id)!! })
        private var created = 0

        override suspend fun farms(): List<Farm> {
            latency()
            return farms.value
        }

        override suspend fun parcels(farmId: String, layer: MapLayer): List<MapParcel> {
            latency()
            val grid = grids.value[farmId] ?: throw WatchdogException("Unknown farm $farmId", userMessage = "That farm is no longer available.")
            return when (layer) {
                MapLayer.Score -> grid.parcels
                MapLayer.Residential -> grid.parcels.filter { it.residential }
                MapLayer.SoldIn12Months -> grid.parcels.filter { it.soldInLast12Months }
                MapLayer.Permits -> grid.parcels.filter { it.permitInLast90Days }
            }
        }

        override suspend fun stats(farmId: String): FarmStats {
            latency()
            SampleData.stats(farmId)?.let { return it }
            val grid = grids.value[farmId] ?: throw WatchdogException("Unknown farm $farmId", userMessage = "That farm is no longer available.")
            val homes = grid.parcels.filter { it.residential }
            val scores = homes.mapNotNull { it.score }.sorted()
            val sold = homes.count { it.soldInLast12Months }
            return FarmStats(
                medianScore = scores.takeIf { it.isNotEmpty() }?.let { it[it.size / 2] },
                salesIn12Months = sold,
                salesPercent = if (homes.isEmpty()) null else (sold * 1000.0 / homes.size).roundToInt() / 10.0,
                permitsIn90Days = homes.count { it.permitInLast90Days },
                turnover = listOf(TurnoverNote("trending_up", "${Format.count(sold, "sale")} in 12 months", " across ${Format.count(homes.size, "home")}, from public deed records")),
            )
        }

        override suspend fun createFarm(name: String, boundary: List<LatLng>): Farm {
            latency()
            if (boundary.size < 3) throw WatchdogException("Boundary too small", userMessage = "Draw at least three points around the neighborhood.")
            val cleanName = name.trim().ifEmpty { "New farm" }
            created += 1
            val center = LatLng(boundary.sumOf { it.lat } / boundary.size, boundary.sumOf { it.lon } / boundary.size)
            val metresPerDegLon = 111_320.0 * cos(center.lat * PI / 180)
            val widthM = (boundary.maxOf { it.lon } - boundary.minOf { it.lon }) * metresPerDegLon
            val heightM = (boundary.maxOf { it.lat } - boundary.minOf { it.lat }) * 111_320.0
            val cols = (widthM / 102).roundToInt().coerceIn(1, 8)
            val rows = (heightM / 84).roundToInt().coerceIn(1, 8)
            // A drawn farm has no parcel feed in the sample, so it gets an invented grid in Cherry Hill's district.
            val town = SampleTowns.cherryHill
            val grid = SampleFarmGrid.generate(
                FarmGridSpec(
                    district = town.district,
                    center = center,
                    rotationDegrees = 0.0,
                    blockCols = cols,
                    blockRows = rows,
                    streets = (0..rows).map { "${ORDINALS[it % ORDINALS.size]} Ave" },
                    blockBase = 900 + created,
                    seed = 5_000 + created,
                    ratePer100 = town.rates.getValue(town.latestYear - 1),
                    assessedRange = town.typicalAssessed,
                    soldCount = (cols * rows * 10 * 0.05).roundToInt(),
                    permitCount = (cols * rows * 10 * 0.02).roundToInt(),
                ),
            )
            val farm = Farm(
                id = "farm-created-$created",
                name = cleanName,
                town = town.town,
                homes = grid.homes,
                sinceLabel = "your farm since ${Format.shortMonth(SampleData.today)}",
                center = center,
                zoom = 16.0,
                boundary = if (boundary.first() == boundary.last()) boundary else boundary + boundary.first(),
            )
            grids.update { it + (farm.id to grid) }
            farms.update { it + farm }
            return farm
        }
    }

    // ------------------------------------------------------------------ marketing

    inner class SampleMarketingRepository : MarketingRepository {
        override suspend fun campaigns(): List<Campaign> {
            latency()
            return SampleData.campaigns
        }

        override suspend fun trueCostCard(pin: PamsPin, inputs: TrueCostInputs?, includeContactCard: Boolean): TrueCostCard {
            latency()
            if (inputs != null && inputs.price <= 0) throw WatchdogException("No price", userMessage = "Add the asking price to build the card.")
            return SampleData.trueCostCard(properties.detail(pin), inputs, includeContactCard)
        }
    }

    // ------------------------------------------------------------------ Watchdog Intelligence

    inner class SampleIntelligenceRepository : IntelligenceRepository {
        override suspend fun brief(): Brief {
            latency()
            return SampleData.brief
        }

        /** Canned answers in the analyst's voice: a conclusion with numbers, and the public sources behind it. */
        override suspend fun ask(question: String): AnalystAnswer {
            latency()
            val q = question.lowercase()
            val followUps = SampleData.brief.followUps
            return when {
                q.isBlank() -> AnalystAnswer("Ask about a home, a client or a town and I’ll answer from the public record.", emptyList(), followUps)
                listOf("likely to sell", "likely seller", "who will sell", "motivated", "going to sell", "distress").any { it in q } -> AnalystAnswer(
                    "Watchdog doesn’t predict which homes will sell, and it never labels a single home as a likely seller. " +
                        "What it can show is neighborhood turnover from public deed records: Birchwood Park had 21 sales in the last 12 months, 5.1% of its 412 homes, seven of them since June at a median ${Format.money(455_000)}.",
                    listOf("SR1A deed sales", "NJ MOD-IV tax list"),
                    followUps,
                )
                "harrison" in q && ("call" in q || "first" in q) -> AnalystAnswer(
                    "Start with the three Harrison past clients whose 2026 bills rose the most: 52 Kingsland Ave (up ${Format.money(640)}), 27 Hamilton St (up ${Format.money(612)}) and 77 Warren St (up ${Format.money(590)}). " +
                        "Harrison’s general rate rose 7% for 2026, so the bill is the reason to call, and each of the nine has a tax checkup ready with the ${SampleData.appealDeadline.label} appeal deadline.",
                    listOf("NJ Division of Taxation, 2026 rates", "NJ MOD-IV tax list", "Your CRM references"),
                    followUps.drop(1),
                )
                "draft" in q || "note" in q -> AnalystAnswer(
                    "Here is a note you can send under your name:\n\n" +
                        "Hi, it’s Alex at Northfield & Main. Harrison’s 2026 tax rate went up 7% and your bill rose with it. I ran a free tax checkup on your home: it shows whether the assessment holds up at today’s prices and what the ${SampleData.appealDeadline.label} appeal deadline means for you. Want me to send it over?",
                    listOf("NJ Division of Taxation, 2026 rates", "Watchdog tax checkup"),
                    followUps.filter { "Harrison" !in it.text },
                )
                "glendora" in q || "blackwood" in q || "compare" in q -> AnalystAnswer(
                    "Glendora, your Gloucester Twp farm: 38 homes, median Watchdog Score 51, two sales since June at a median ${Format.money(338_000)}, and 38 homes assessed below 80% of recent nearby sale prices. " +
                        "Blackwood, also in Gloucester Twp, revalues on the same 2027 schedule; its recent sales run about 4% higher and its assessments sit at the same 78% ratio. Both farms’ bills may rise after the revaluation, Glendora’s a little more.",
                    listOf("SR1A deed sales", "Township notice", "2026 Chapter 123 ratios"),
                    followUps.take(2),
                )
                "birchwood" in q || "36 " in q -> AnalystAnswer(
                    "36 Birchwood Dr scores 72, a favorable tax position. The 2025 bill is ${Format.money(11_284)} and the 2026 bill at the new rate is ${Format.money(11_730)}, against a Cherry Hill median of ${Format.money(9_960)}. " +
                        "Seven similar homes sold nearby for a median ${Format.money(455_000)} since January, well above the ${Format.money(372_800)} the assessment needs to hold up.",
                    listOf("NJ MOD-IV tax list", "NJ Division of Taxation rates", "2026 Chapter 123 ratios", "SR1A deed sales"),
                    followUps,
                )
                else -> AnalystAnswer(
                    "From the public record this week: Harrison’s 2026 rate is up 7%, which moved nine past clients’ bills; Gloucester Twp has set a 2027 revaluation that touches 38 homes in your Glendora farm; and Birchwood Park has seven sales since June at a median ${Format.money(455_000)}. Ask about any of them for the detail.",
                    listOf("NJ Division of Taxation, 2026 rates", "Township notice", "SR1A deed sales"),
                    followUps,
                )
            }
        }
    }

    // ------------------------------------------------------------------ alerts

    inner class SampleAlertsRepository : AlertsRepository {
        internal val preferencesState = MutableStateFlow(SampleData.alertPreferences)
        override val preferences: StateFlow<AlertPreferences> = preferencesState.asStateFlow()
        private val tokens = MutableStateFlow<Set<String>>(emptySet())

        /** Push tokens registered in this process, for tests and debugging. */
        val pushTokens: StateFlow<Set<String>> = tokens.asStateFlow()

        override suspend fun refresh() {
            latency()
            loadPersisted()
            StoredAlertPreferences.decode(store.get(StoreKeys.ALERT_PREFERENCES))?.let { preferencesState.value = it }
        }

        override suspend fun update(preferences: AlertPreferences) {
            latency()
            loadPersisted()
            preferencesState.value = preferences
            store.put(StoreKeys.ALERT_PREFERENCES, StoredAlertPreferences.encode(preferences))
        }

        override suspend fun registerPushToken(token: String, platform: String) {
            latency()
            if (token.isBlank()) throw WatchdogException("Empty push token")
            tokens.update { it + "$platform:$token" }
        }

        override suspend fun unregisterPushToken(token: String) {
            latency()
            tokens.update { set -> set.filterNot { it.endsWith(":$token") }.toSet() }
        }

        override suspend fun recent(): List<AppNotification> {
            latency()
            return SampleData.notifications
        }
    }

    // ------------------------------------------------------------------ settings

    inner class SampleSettingsRepository(signedIn: Boolean) : SettingsRepository {
        internal val settingsState = MutableStateFlow(if (signedIn) SampleData.appSettings else AppSettings())
        override val settings: StateFlow<AppSettings> = settingsState.asStateFlow()

        override suspend fun update(transform: (AppSettings) -> AppSettings) {
            loadPersisted()
            val next = transform(settingsState.value)
            settingsState.value = next
            store.put(StoreKeys.APP_SETTINGS, StoredAppSettings.encode(next))
        }
    }

    companion object {
        private val ORDINALS = listOf("First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth")

        private fun normalize(text: String): String = text.lowercase().replace(Regex("[^a-z0-9._]+"), " ").trim().replace(Regex(" +"), " ")

        /** Convenience for previews and tests: a sample graph with no artificial delay. */
        fun immediate(store: KeyValueStore = InMemoryKeyValueStore(), signedIn: Boolean = true): SampleRepositories =
            SampleRepositories(store, signedIn, latencyMillis = 0L)
    }
}

/** The address and town read out of a listing link (Kotlin does not allow a nested class inside an inner class). */
private class ListingSlug(val address: String, val town: String?)
