package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.AccountApi
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.DigestApi
import com.watchdogindex.agent.core.api.IntelligenceApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.AnalystAnswer
import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.BriefItem
import com.watchdogindex.agent.core.model.FollowUp
import com.watchdogindex.agent.core.repo.IntelligenceRepository
import kotlinx.datetime.toLocalDateTime

/**
 * The weekly brief and the analyst (gap-answers.md "Weekly Watchdog Intelligence brief" 7):
 *
 * 1. A saved brief (`intelligence_saved_briefs`) less than a week old is shown as-is.
 * 2. Otherwise, when the plan can run the analyst (Pro or higher, or Agent with the add-on active), the
 *    "30-second professional brief" is requested over the sphere's pins and saved server-side.
 * 3. Otherwise the brief is built from this week's top three public-record changes, and the `forLabel` says so.
 * The plan gate stays on the server: the app only decides whether to make the call.
 */
class LiveIntelligenceRepository(private val ctx: LiveContext, private val digest: LiveDigestRepository) : IntelligenceRepository {

    private var sessionId: String? = null

    override suspend fun brief(): Brief {
        val account = runCatching { ctx.account() }.getOrNull()
        val first = account?.displayName?.substringBefore(' ')?.takeIf { it.isNotBlank() }
        val today = ctx.today()
        val forBase = listOfNotNull(first?.let { "For $it" }, Format.longDate(today)).joinToString(" · ")

        runCatching { ctx.intelligence.savedBrief() }.getOrNull()?.let { saved ->
            val age = Derived.parseInstant(saved.createdAt)?.let { (ctx.now() - it).inWholeHours } ?: Long.MAX_VALUE
            if (age < 7 * 24 && saved.response.conclusion.isNotBlank()) return briefFrom(saved.response, forBase, saved.createdAt)
        }

        val eligible = runCatching { canRunAnalyst(account?.planTier) }.getOrDefault(false)
        if (eligible) {
            val pins = ctx.spherePins()
            if (pins.isNotEmpty()) {
                val result = runCatching { ctx.intelligence.ask(IntelligenceApi.BRIEF_PROMPT, pins, saveBrief = true) }.getOrNull()
                val response = result?.response
                if (result != null && result.ok && result.status != "failed" && result.status != "refused" && response != null && response.conclusion.isNotBlank()) {
                    return briefFrom(response, forBase, null)
                }
            }
        }
        return digestBrief(forBase, eligible)
    }

    private suspend fun canRunAnalyst(planTier: String?): Boolean {
        if (AccountApi.rank(planTier) >= 2) return true
        if (planTier == "agent") return runCatching { ctx.intelligence.voiceStatus().addonActive }.getOrDefault(false)
        return false
    }

    private fun briefFrom(response: IntelligenceApi.AnalystResponse, forBase: String, createdAt: String?): Brief {
        val items = if (response.cards.isNotEmpty()) {
            response.cards.take(3).map { card ->
                BriefItem(
                    lead = "${Derived.titleCase(card.address ?: card.pamsPin ?: "A property")}: ${card.priority ?: "review"} priority.",
                    text = listOfNotNull(card.reason, card.also).joinToString(" ").let { if (it.isNotBlank()) " $it" else "" },
                    source = response.sourceLabels().firstOrNull() ?: "Watchdog Intelligence, public records",
                )
            }
        } else {
            val evidence = response.texts(response.evidence)
            listOf(BriefItem(response.conclusion, "", response.sourceLabels().firstOrNull() ?: "Watchdog Intelligence, public records")) +
                evidence.take(2).mapIndexed { i, text -> BriefItem(text, "", response.sourceLabels().getOrNull(i + 1) ?: "Public records") }
        }
        val words = (response.conclusion + " " + items.joinToString(" ") { it.lead + it.text }).split(Regex("\\s+")).size
        val minutes = maxOf(1, Math.round(words / 200.0).toInt())
        val time = Derived.parseInstant(createdAt)?.toLocalDateTime(Derived.NEW_JERSEY)?.let { Format.time12h(it.hour, it.minute) } ?: Format.time12h(8)
        return Brief(
            kicker = "Watchdog Intelligence brief",
            timeLabel = "$time · $minutes min read",
            listenLabel = null,
            heading = if (items.size >= 3) "Three things worth your time this week" else "Worth your time this week",
            items = items,
            followUps = DEFAULT_FOLLOW_UPS,
            forLabel = forBase,
        )
    }

    /** The fallback: the week's top three reasons with their sources; the label says where it came from. */
    private suspend fun digestBrief(forBase: String, eligible: Boolean): Brief {
        val week = runCatching { digest.thisWeek() }.getOrNull()
        val reasons = ctx.digest.top(digest.lastReasons, 3)
        val items = reasons.map { r ->
            val change = ctx.digest.change(r)
            BriefItem(
                lead = "${change.title}.",
                text = " ${change.subtitle}." + (r.event.summary?.takeIf { it.isNotBlank() && !it.startsWith("Watchdog recorded") }?.let { " $it" } ?: ""),
                source = change.sourceNote ?: "Public records",
            )
        }
        val note = if (eligible) "built from this week’s public-record changes" else "built from this week’s public-record changes · the written brief and Voice need the Watchdog Intelligence add-on"
        return Brief(
            kicker = "Monday brief",
            timeLabel = "${Format.time12h(8)} · ${maxOf(1, items.size / 2)} min read",
            listenLabel = null,
            heading = when {
                items.isEmpty() -> "Nothing new in your sphere this week"
                items.size >= 3 -> "Three things worth your time this week"
                else -> "Worth your time this week"
            },
            items = items,
            followUps = DEFAULT_FOLLOW_UPS,
            forLabel = "$forBase · $note" + (week?.let { "" } ?: ""),
        )
    }

    override suspend fun ask(question: String): AnalystAnswer {
        val q = question.trim()
        if (q.isEmpty()) return AnalystAnswer("Ask about a home, a client or a town and I’ll answer from the public record.", emptyList(), DEFAULT_FOLLOW_UPS)
        val pins = ctx.spherePins()
        val result = try {
            ctx.intelligence.ask(q, pins, sessionId = sessionId)
        } catch (e: PlanRequiredException) {
            throw WatchdogException("Intelligence plan gate", e, IntelligenceApi.ADD_ON_COPY)
        }
        sessionId = result.sessionId ?: sessionId
        val response = result.response ?: return AnalystAnswer("Watchdog did not return an answer. Please try again.", emptyList(), DEFAULT_FOLLOW_UPS)
        val text = buildString {
            append(response.conclusion.ifBlank { "Watchdog could not complete that request." })
            if (result.status == "failed") {
                response.texts(response.missingEvidence).firstOrNull()?.let { append("\n\n").append(it) }
            } else {
                response.cards.take(3).forEach { c ->
                    append("\n\n").append(Derived.titleCase(c.address ?: c.pamsPin ?: ""))
                    c.score?.let { append(": ").append(Math.round(it)).append(" out of 100") }
                    c.reason?.let { append(". ").append(it) }
                }
            }
        }
        val followUps = response.suggestedActions.mapNotNull { SUGGESTED[it] }.ifEmpty { DEFAULT_FOLLOW_UPS }
        return AnalystAnswer(text, response.sourceLabels(), followUps)
    }

    companion object {
        val DEFAULT_FOLLOW_UPS = listOf(
            FollowUp("chat_bubble", "Which clients should I call first?"),
            FollowUp("edit", "What changed in my farm this week?"),
            FollowUp("compare_arrows", "Which homes look overassessed?"),
        )
        private val SUGGESTED = mapOf(
            "review_evidence" to FollowUp("chat_bubble", "Show me the evidence"),
            "watch_property" to FollowUp("edit", "Watch this property"),
            "create_report" to FollowUp("compare_arrows", "Draft a report"),
        )
    }
}
