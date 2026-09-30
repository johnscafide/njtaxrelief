package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.api.DigestApi
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredDoneTasks
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.bestEffort
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.AgentTask
import com.watchdogindex.agent.core.model.ChangeKind
import com.watchdogindex.agent.core.model.IntelligenceTeaser
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.TaskAction
import com.watchdogindex.agent.core.model.TaskActionKind
import com.watchdogindex.agent.core.model.WeekDigest
import com.watchdogindex.agent.core.repo.DigestRepository
import kotlinx.datetime.Month
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt

/**
 * Rebuilds the week the way the Monday email is built (edge-function-contracts.md 2.1; gap-answers.md
 * "property_update_events producer contract" 6): events since Monday 00:00 in New Jersey (on a Monday, the week
 * that just ended, see `Derived.digestWeekStart`) for the sphere, the
 * eight qualifying types, the sender's weights, grouped per `<home>:<type>`, the best reason per home, ten at most.
 * Counts by tile are taken from the grouped reasons, not only the top ten.
 *
 * Tasks: the February checkup-season task (the sender's rule), a "call about" task for the largest bill increase
 * on a past client, and an "approve the postcard" task when a postcard campaign has an unapproved proof (one cheap
 * RPC plus at most two status calls; any failure there simply drops the task). Done marks live on the device and
 * reset each week.
 */
class LiveDigestRepository(private val ctx: LiveContext) : DigestRepository {

    /** The last rebuilt reasons, for other repositories that want the same list without a second round trip. */
    @Volatile var lastReasons: List<DigestApi.Reason> = emptyList()
        private set

    override suspend fun thisWeek(): WeekDigest {
        val now = ctx.now()
        val today = now.toLocalDateTime(Derived.NEW_JERSEY).date
        val weekStart = Derived.digestWeekStart(now)
        val since = Derived.startOfDay(weekStart)

        val sphere = ctx.digest.sphere()
        val events = ctx.digest.events(since, limit = 500)
        val reasons = ctx.digest.qualify(events, sphere, now)
        val top = ctx.digest.top(reasons, 10)
        lastReasons = reasons

        val changes = top.map { ctx.digest.change(it) }
        val kinds = reasons.map { DigestApi.kindFor(it.event.eventType) }

        val tasks = ArrayList<AgentTask>()
        val deadline = TaxMath.nextDeadline(today)
        val ready = sphere.farm.count { (it.relationship == "past_client" || it.relationship == "sphere") && !it.pamsPin.isNullOrBlank() }
        if (today.month == Month.FEBRUARY && ready > 0) {
            tasks += AgentTask(
                id = "task-send-checkups",
                title = "Send ${Format.count(ready, "tax checkup")}",
                subtitle = "New assessments are out · appeals due ${deadline.shortLabel}",
                action = TaskAction(TaskActionKind.Review, "Review", route = "clients?filter=checkup"),
            )
        }
        reasons.filter { it.event.eventType == "tax_change" && (it.event.deltaNumeric ?: 0.0) > 0 && it.home.model == Relationship.PastClient }
            .maxByOrNull { it.event.deltaNumeric ?: 0.0 }
            ?.let { best ->
                tasks += AgentTask(
                    id = "task-call-${best.home.key}",
                    title = "Call about ${Derived.titleCase(best.home.address)}",
                    // "Past client · 2026 bill up $612": the same words as the change list, lowercased after the dot.
                    subtitle = "Past client · ${DigestApi.taxBillTitle(best.event).replaceFirstChar { it.lowercase() }}",
                    action = TaskAction(TaskActionKind.Call, null, phone = null, route = best.home.pin?.let { "property/$it" }),
                )
            }
        tasks += postcardTasks()

        val done = doneIds(weekStart.toString())
        val teaser = top.firstOrNull()?.let { first ->
            val change = ctx.digest.change(first)
            val where = change.subtitle.substringBefore(" · ")
            val extra = when {
                kinds.count { it == ChangeKind.TaxBill } > 1 -> " ${Format.countWord(kinds.count { it == ChangeKind.TaxBill })} homes in your sphere have new tax bills this week."
                reasons.size > 1 -> " ${Format.countWord(reasons.size)} changes in your clients’ homes and farm this week."
                else -> ""
            }
            IntelligenceTeaser("${change.title} at $where.$extra")
        }

        return WeekDigest(
            weekStart = weekStart,
            periodLabel = "This week · ${Format.since(weekStart)}",
            dateLabel = Format.longDate(today),
            total = reasons.size,
            taxBills = kinds.count { it == ChangeKind.TaxBill },
            permits = kinds.count { it == ChangeKind.Permit },
            sales = kinds.count { it == ChangeKind.Sale },
            town = kinds.count { it == ChangeKind.Town },
            needsYouCount = tasks.count { it.id !in done },
            tasks = tasks.map { it.copy(done = it.id in done) },
            changes = changes,
            teaser = teaser,
        )
    }

    /** One RPC, then at most two status calls; a plan denial or any other failure just means no marketing task. */
    private suspend fun postcardTasks(): List<AgentTask> {
        val campaigns = bestEffort { ctx.marketing.postcardCampaigns() } ?: return emptyList()
        val candidates = campaigns
            .filter { it.status !in setOf("completed", "mailed", "delivered", "canceled") }
            .sortedByDescending { it.updatedAt ?: "" }
            .take(2)
        val tasks = ArrayList<AgentTask>()
        for (campaign in candidates) {
            val status = bestEffort { ctx.marketing.postcardStatus(campaign.id) } ?: continue
            if (!status.needsApproval) continue
            val homes = status.recipients?.valid?.toInt() ?: campaign.audienceCount?.toInt()
            tasks += AgentTask(
                id = "task-approve-${campaign.id}",
                title = "Approve the ${campaign.name?.takeIf { it.isNotBlank() } ?: "postcard"} proof",
                subtitle = listOfNotNull(homes?.let { "${Format.number(it)} homes" }, "proof ready to check").joinToString(" · "),
                action = TaskAction(TaskActionKind.Open, "Open", route = "marketing"),
            )
        }
        return tasks
    }

    private suspend fun doneIds(week: String): Set<String> {
        val stored = ctx.store.readJson<StoredDoneTasks>(LiveKeys.DONE_TASKS) ?: return emptySet()
        return if (stored.weekStart == week) stored.ids else emptySet()
    }

    override suspend fun markTaskDone(taskId: String, done: Boolean) {
        val week = Derived.digestWeekStart(ctx.now()).toString()
        val current = doneIds(week)
        val next = if (done) current + taskId else current - taskId
        ctx.store.writeJson(LiveKeys.DONE_TASKS, StoredDoneTasks(week, next))
    }
}
