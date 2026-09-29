package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.MarketingApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.AgentCard
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.CampaignKind
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.repo.MarketingRepository
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt

/**
 * Campaigns from Postcard Studio and Email Updates, and the buyer true cost card computed with `TaxMath` from the
 * property route's numbers (site-api-contracts.md 4.2, 5.4). Email stats show the open rate only: no reply count
 * exists anywhere (gap-answers.md "Mockup values with no data source" 2).
 */
class LiveMarketingRepository(private val ctx: LiveContext) : MarketingRepository {

    override suspend fun campaigns(): List<Campaign> {
        var planDenied = 0
        val postcards = try {
            ctx.marketing.postcardCampaigns().map { postcard(it) }
        } catch (e: PlanRequiredException) {
            planDenied += 1; emptyList()
        } catch (e: WatchdogException) {
            emptyList()
        }
        val emails = try {
            ctx.marketing.emailBroadcasts().map { email(it) }
        } catch (e: PlanRequiredException) {
            planDenied += 1; emptyList()
        } catch (e: WatchdogException) {
            emptyList()
        }
        if (planDenied == 2) throw PlanRequiredException("Marketing")
        return postcards + emails
    }

    private fun postcard(c: MarketingApi.CampaignRow): Campaign {
        val label = MarketingApi.campaignStatusLabel(c.status)
        val tone = when (label) { "Approved" -> Tone.Good; "Mailed" -> Tone.Sky; else -> Tone.Neutral }
        val homes = c.audienceCount?.toInt()
        return Campaign(
            id = "postcard-${c.id}",
            kind = CampaignKind.Postcard,
            title = c.name?.takeIf { it.isNotBlank() } ?: "Untitled postcard",
            subtitle = listOfNotNull("Postcard", homes?.let { "${Format.number(it)} homes" }, label.lowercase()).joinToString(" · "),
            status = StatusChip(label, tone),
        )
    }

    private fun email(b: MarketingApi.Broadcast): Campaign {
        val date = Derived.parseInstant(b.sendAt ?: b.createdAt)?.toLocalDateTime(Derived.NEW_JERSEY)?.date
        val recipients = b.stats?.recipients?.toInt()
        val statusWord = MarketingApi.BROADCAST_STATUS_LABELS[b.status ?: ""] ?: (b.status ?: "Draft").replaceFirstChar { it.uppercaseChar() }
        val when_ = when (b.status) {
            "sent", "sending" -> date?.let { Format.sent(it) }
            "scheduled" -> date?.let { "scheduled ${Format.monthDay(it)}" }
            else -> null
        }
        val chip = if (b.stats != null && b.stats.openRate != null && (b.status == "sent" || b.status == "sending")) {
            StatusChip("${MarketingApi.percentLabel(b.stats.openRate)} opened", Tone.Good)
        } else {
            StatusChip(statusWord, if (b.status == "error") Tone.Warn else Tone.Neutral)
        }
        return Campaign(
            id = "email-${b.id}",
            kind = CampaignKind.Email,
            title = b.subject?.takeIf { it.isNotBlank() } ?: "Email update",
            subtitle = listOfNotNull("Email", recipients?.let { "${Format.number(it)} contacts" } ?: b.target?.get("label")?.toString()?.trim('"')?.takeIf { it.isNotBlank() }, when_).joinToString(" · "),
            status = chip,
        )
    }

    /**
     * The true cost card. The annual tax is the bill scaled to the newest rate when the bill's year is known, else the
     * bill on file (`api/watchdog-true-cost.js:241-243`). Without inputs the price starts at the market value the
     * town ratio implies (rounded to the thousand); the agent edits it. Insurance is never prefilled.
     */
    override suspend fun trueCostCard(pin: PamsPin, inputs: TrueCostInputs?, includeContactCard: Boolean): TrueCostCard {
        val response = ctx.property.byPin(pin, inputs?.price?.takeIf { it > 0 })
        val row = response.property
        val derived = response.derived
        val defaultPrice = (derived?.holdsUp?.implied ?: row.lastSalePrice ?: 0.0).let { (it / 1000).roundToInt() * 1000 }
        val resolved = inputs ?: TrueCostInputs(price = defaultPrice)
        if (resolved.price <= 0) throw WatchdogException("No price", userMessage = "Add the asking price to build the card.")
        val current = derived?.bill?.current
        val latestRate = derived?.rateTrend?.latest?.rate
        val bill = when {
            (row.lastYearTax ?: 0.0) > 0 -> row.lastYearTax!!
            row.assessedValue != null && latestRate != null -> row.assessedValue * latestRate / 100
            else -> 0.0
        }
        val annualTax = if (current != null && !current.generalRateOnly && current.amount != null) current.amount else bill
        val monthly = TaxMath.monthlyCost(resolved, annualTax.roundToInt())
        val summary = ctx.mapper.summary(response)
        val account = if (includeContactCard) runCatching { ctx.account() }.getOrNull() else null
        val agent = account?.let {
            AgentCard(
                name = it.displayName,
                brokerage = it.brokerage ?: "",
                town = null,
                phone = it.phone,
                email = it.email,
            )
        }
        return TrueCostCard(
            pin = pin,
            address = "${summary.address}, ${Derived.shortTownName(summary.town)}",
            inputs = resolved,
            annualTax = annualTax.roundToInt(),
            monthlyMortgage = monthly.principalAndInterestRounded,
            monthlyTax = monthly.taxRounded,
            monthlyInsurance = monthly.insuranceRounded,
            monthlyHoa = monthly.hoaRounded,
            monthlyTotal = monthly.totalRounded,
            agent = agent,
            shareUrl = shareUrl(pin, resolved, account?.vanitySlug),
        )
    }

    /** `https://www.watchdogindex.com/true-cost?pin=&price=&down=&rate=&term=&ins=&hoa=&agent=`, empty values omitted. */
    fun shareUrl(pin: PamsPin, inputs: TrueCostInputs, slug: String?): String {
        val params = LinkedHashMap<String, String>()
        params["pin"] = pin
        if (inputs.price > 0) params["price"] = inputs.price.toString()
        params["down"] = trim(inputs.downPercent)
        params["rate"] = trim(inputs.ratePercent)
        params["term"] = inputs.termYears.toString()
        if (inputs.annualInsurance > 0) params["ins"] = inputs.annualInsurance.toString()
        if (inputs.monthlyHoa > 0) params["hoa"] = inputs.monthlyHoa.toString()
        if (!slug.isNullOrBlank()) params["agent"] = slug
        return "${ctx.config.siteOrigin}/true-cost?" + params.entries.joinToString("&") { (k, v) -> "$k=${java.net.URLEncoder.encode(v, "UTF-8")}" }
    }

    private fun trim(value: Double): String = if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()
}
