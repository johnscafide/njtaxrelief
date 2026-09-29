package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.ClientsApi
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.DigestApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.CheckupSeason
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.ClientsOverview
import com.watchdogindex.agent.core.model.NextAction
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.core.repo.ClientsRepository
import kotlinx.datetime.Instant
import kotlinx.datetime.Month
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The Clients tab from `agent_farm_properties` rows (gap-answers.md "Clients rows"). Rows lead with the home and
 * the agent's own CRM reference; there is no year, phone or owner name anywhere in the source, so
 * `relationshipYear` is null and `phone` is null.
 *
 * Chip precedence (app rule, the web has no single-chip concept): an event in the last seven days, then
 * "Checkup ready", then "Watching". "Sent" and "Snoozed" come from the desk's action ledger (D2).
 */
class LiveClientsRepository(private val ctx: LiveContext) : ClientsRepository {

    /** What the share sheet needs for one checkup: the public link and the note the desk writes. */
    data class CheckupShare(val link: String, val note: String)

    private data class Built(val rows: List<ClientRow>, val readyRowIds: Set<String>, val sources: Map<String, DigestApi.FarmRow>)

    override suspend fun overview(filter: ClientFilter, query: String): ClientsOverview {
        val built = build()
        val q = query.trim().lowercase()
        val rows = built.rows.filter { row ->
            val inFilter = when (filter) {
                ClientFilter.All -> true
                ClientFilter.PastClients -> row.relationship == Relationship.PastClient
                ClientFilter.Sphere -> row.relationship == Relationship.Sphere
                ClientFilter.CheckupReady -> row.checkupReady
            }
            inFilter && (q.isEmpty() || "${row.address} ${row.town} ${row.crmRef ?: ""}".lowercase().contains(q))
        }
        val ready = built.readyRowIds.size
        return ClientsOverview(
            all = built.rows.size,
            pastClients = built.rows.count { it.relationship == Relationship.PastClient },
            sphere = built.rows.count { it.relationship == Relationship.Sphere },
            checkupsReady = ready,
            season = season(ready),
            rows = rows,
        )
    }

    private suspend fun build(): Built {
        val now = ctx.now()
        val today = now.toLocalDateTime(Derived.NEW_JERSEY).date
        val seasonYear = TaxMath.nextDeadline(today).date.year
        val farmRows = ctx.clients.clientRows()
        val actions = runCatching { ctx.clients.actions() }.getOrDefault(emptyList()).associateBy { it.opportunityKey }
        val weekAgo = Instant.fromEpochSeconds(now.epochSeconds - 7 * 86_400L)
        val events = runCatching { ctx.digest.events(weekAgo, limit = 500) }.getOrDefault(emptyList())
        val crmPins = runCatching { ctx.clients.crmLinkedPins() }.getOrDefault(emptySet())
        val sphere = DigestApi.Sphere(farmRows, emptyList())

        val bestEvent = HashMap<String, Pair<DigestApi.EventRow, Int>>()
        for (event in events) {
            if (event.eventType !in DigestApi.WEIGHTS) continue
            val home = sphere.match(event) ?: continue
            val score = DigestApi.deskScore(event, home.relationship, now)
            val existing = bestEvent[home.key]
            if (existing == null || score > existing.second || (score == existing.second && (event.occurred ?: Instant.DISTANT_PAST) > (existing.first.occurred ?: Instant.DISTANT_PAST))) {
                bestEvent[home.key] = event to score
            }
        }

        val ready = HashSet<String>()
        val rows = farmRows.map { row ->
            val pin = row.pamsPin?.trim()?.takeIf { it.isNotEmpty() }
            val key = ClientsApi.propertyKey(pin, row.address)
            val relationship = DigestApi.relationshipOf(row.relationship)
            val checkup = actions[ClientsApi.checkupKey(pin, row.address)]
            val sentThisSeason = checkup?.actionState == "completed" && checkup.season == seasonYear
            val snoozedUntil = checkup?.takeIf { it.actionState == "snoozed" }?.snoozed?.takeIf { it > now }
            val watched = actions.values.any { it.pamsPin != null && it.pamsPin == pin && it.actionState == "watched" }
            val isReady = pin != null && (relationship == Relationship.PastClient || relationship == Relationship.Sphere) && !sentThisSeason && snoozedUntil == null
            val event = bestEvent[key]?.first
            val (chip, action, tile) = when {
                event != null -> eventChip(event)
                snoozedUntil != null -> Triple(StatusChip("Snoozed", Tone.Neutral, "snooze"), NextAction(NextActionKind.None, "Snoozed until ${Format.monthDay(snoozedUntil.toLocalDateTime(Derived.NEW_JERSEY).date)}"), TileTint.Fill)
                sentThisSeason -> {
                    val sentDate = Derived.parseInstant(checkup?.touchedAt)?.toLocalDateTime(Derived.NEW_JERSEY)?.date
                    val label = if (sentDate == today) "Checkup sent today" else sentDate?.let { "Checkup sent ${Format.monthDay(it)}" } ?: "Checkup sent"
                    Triple(StatusChip("Checkup sent", Tone.Good, "send"), NextAction(NextActionKind.None, label), TileTint.Mint)
                }
                isReady -> Triple(StatusChip("Checkup ready", Tone.Good), NextAction(NextActionKind.Send, "Send tax checkup"), TileTint.Mint)
                pin == null -> Triple(StatusChip("Needs a match", Tone.Warn), NextAction(NextActionKind.Edit, "Match this home to a parcel"), TileTint.Fill)
                else -> Triple(StatusChip("Watching", Tone.Neutral), NextAction(NextActionKind.None, if (watched) "On your watching list" else "Nothing new this week"), TileTint.Fill)
            }
            if (isReady) ready += row.id
            ClientRow(
                id = row.id,
                pin = pin,
                address = Derived.titleCase(row.address),
                town = row.municipality?.let { Derived.titleCase(it) } ?: "",
                relationship = relationship,
                relationshipYear = null,
                crmRef = row.contactRef?.trim()?.takeIf { it.isNotEmpty() } ?: if (pin != null && pin in crmPins) "In your CRM" else null,
                status = chip,
                nextAction = action,
                tile = tile,
                checkupReady = isReady,
            )
        }
        return Built(rows, ready, farmRows.associateBy { it.id })
    }

    /** The chip and next action for the best event of the week (gap-answers.md "Clients rows" sections 3 and 6). */
    private fun eventChip(event: DigestApi.EventRow): Triple<StatusChip, NextAction, TileTint> {
        val delta = event.deltaNumeric?.roundToInt()
        return when (event.eventType) {
            "tax_change" -> when {
                delta != null && delta > 0 -> Triple(StatusChip("Bill up ${Format.money(delta)}", Tone.Warn), NextAction(NextActionKind.Call, "Call about the new bill"), TileTint.Sky)
                delta != null && delta < 0 -> Triple(StatusChip("Bill down ${Format.money(abs(delta))}", Tone.Sky), NextAction(NextActionKind.Call, "Call about the new bill"), TileTint.Sky)
                else -> Triple(StatusChip("Tax bill changed", Tone.Warn), NextAction(NextActionKind.Call, "Call about the new bill"), TileTint.Sky)
            }
            "permit_change" -> Triple(StatusChip("Permit activity", Tone.Sky), NextAction(NextActionKind.Mail, "Send a renovation note"), TileTint.Sand)
            else -> Triple(StatusChip(DigestApi.TYPE_LABELS[event.eventType] ?: "Record changed", Tone.Sky), NextAction(NextActionKind.None, "Review what changed"), TileTint.Sand)
        }
    }

    /** Shown whenever checkups are ready (the web card is always on); February gets the digest's wording. */
    private fun season(ready: Int): CheckupSeason? {
        if (ready <= 0) return null
        val today = ctx.today()
        val deadline = TaxMath.nextDeadline(today)
        val body = if (today.month == Month.FEBRUARY) {
            "New assessments are out and appeals are due ${deadline.label}. Send each past client their checkup from your own email or CRM."
        } else {
            "Each checkup shows whether the assessment holds up and the ${deadline.label} appeal deadline."
        }
        return CheckupSeason(
            title = "${Format.count(ready, "tax checkup")} ready to send",
            body = body,
            ctaLabel = "Review and send",
            readyCount = ready,
            appealDeadline = deadline.label,
        )
    }

    /** The link and note for one client's checkup; the UI opens the share sheet, Watchdog never sends the email. */
    suspend fun checkupShare(clientId: String): CheckupShare {
        val row = ctx.clients.clientRows().firstOrNull { it.id == clientId } ?: throw WatchdogException("Unknown client", userMessage = "That client is no longer in your list.")
        val pin = row.pamsPin?.trim()?.takeIf { it.isNotEmpty() } ?: throw WatchdogException("No parcel", userMessage = "Match this home to a parcel before sending a checkup.")
        val account = runCatching { ctx.account() }.getOrNull()
        val slug = account?.vanitySlug
        val link = "${ctx.config.siteOrigin}/checkup?pin=${java.net.URLEncoder.encode(pin, "UTF-8")}" + (slug?.let { "&agent=${java.net.URLEncoder.encode(it, "UTF-8")}" } ?: "")
        val name = account?.displayName?.takeIf { it.isNotBlank() }
        val note = "Hi! I put together a quick property tax checkup for ${Derived.titleCase(row.address)}: your assessment, how it compares with your town, and the appeal deadline.\n\n$link\n\nHappy to help if anything looks off." + (name?.let { "\n\n$it" } ?: "")
        return CheckupShare(link, note)
    }

    /** Records the send in the desk's ledger for this appeal season; the message itself goes from the agent's own email. */
    override suspend fun sendCheckup(clientId: String) {
        val row = ctx.clients.clientRows().firstOrNull { it.id == clientId } ?: throw WatchdogException("Unknown client", userMessage = "That client is no longer in your list.")
        record(row)
    }

    override suspend fun sendAllReadyCheckups(): Int {
        val built = build()
        var count = 0
        for (id in built.readyRowIds) {
            val row = built.sources[id] ?: continue
            record(row)
            count += 1
        }
        return count
    }

    private suspend fun record(row: DigestApi.FarmRow) {
        val pin = row.pamsPin?.trim()?.takeIf { it.isNotEmpty() }
        val seasonYear = TaxMath.nextDeadline(ctx.today()).date.year
        ctx.clients.recordCheckupSent(ctx.userId(), ClientsApi.checkupKey(pin, row.address), pin, seasonYear, ctx.now())
    }

    override suspend fun snooze(clientId: String) {
        val row = ctx.clients.clientRows().firstOrNull { it.id == clientId } ?: throw WatchdogException("Unknown client", userMessage = "That client is no longer in your list.")
        val pin = row.pamsPin?.trim()?.takeIf { it.isNotEmpty() }
        ctx.clients.snoozeCheckup(ctx.userId(), ClientsApi.checkupKey(pin, row.address), pin, ctx.now())
    }

    /**
     * Matches each address to a parcel (Agent plan) and writes the rows the way the desk import does. A row's
     * `year` has no column to land in and is not persisted (gap-answers.md "Clients rows" 4).
     */
    override suspend fun import(rows: List<ClientImportRow>): Int {
        val clean = rows.filter { it.address.trim().length >= 3 }.take(1000)
        if (clean.isEmpty()) throw WatchdogException("No rows", userMessage = "Add at least one address to import.")
        val matches = try {
            ctx.clients.matchAddresses(clean)
        } catch (e: PlanRequiredException) {
            throw e
        } catch (e: WatchdogException) {
            emptyMap()
        }
        return ctx.clients.importRows(ctx.userId(), clean, matches, ctx.now())
    }
}
