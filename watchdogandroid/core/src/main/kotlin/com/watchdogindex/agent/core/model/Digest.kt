package com.watchdogindex.agent.core.model

import kotlinx.datetime.LocalDate

enum class ChangeKind { TaxBill, Permit, Sale, Town, Assessment, Deadline }

enum class Relationship { PastClient, Sphere, Farm, Watching }

enum class TaskActionKind { Review, Call, Open, Send }

data class TaskAction(val kind: TaskActionKind, val label: String?, val phone: String? = null, val route: String? = null)

data class AgentTask(
    val id: String,
    /** "Send 12 tax checkups" */
    val title: String,
    /** "Final 2026 bills are out · appeals due Apr 1" */
    val subtitle: String,
    val action: TaskAction,
    val done: Boolean = false,
)

data class PropertyChange(
    val id: String,
    val kind: ChangeKind,
    /** "2026 bill up $612" */
    val title: String,
    /** "27 Hamilton St, Harrison · Past client" */
    val subtitle: String,
    val pin: PamsPin?,
    val relationship: Relationship?,
    val tile: TileTint,
    /** Material Symbols name: receipt_long, construction, account_balance, sell */
    val icon: String,
    val sourceNote: String? = null,
)

data class IntelligenceTeaser(val text: String)

data class WeekDigest(
    val weekStart: LocalDate,
    /** "This week · since Sep 21" */
    val periodLabel: String,
    /** "Monday, September 28" */
    val dateLabel: String,
    val total: Int,
    val taxBills: Int,
    val permits: Int,
    val sales: Int,
    val town: Int,
    val needsYouCount: Int,
    val tasks: List<AgentTask>,
    val changes: List<PropertyChange>,
    val teaser: IntelligenceTeaser?,
)
