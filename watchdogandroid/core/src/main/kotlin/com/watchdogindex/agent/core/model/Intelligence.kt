package com.watchdogindex.agent.core.model

data class BriefItem(
    /** "Harrison's 2026 rate rose 7%." */
    val lead: String,
    /** " Nine past clients' bills went up between $380 and $640. Their tax checkups are ready to send." */
    val text: String,
    /** "NJ Division of Taxation, 2026 rates" */
    val source: String,
)

data class FollowUp(
    /** Material Symbols name: chat_bubble, edit, compare_arrows */
    val icon: String,
    val text: String,
)

data class Brief(
    /** "Monday brief" */
    val kicker: String,
    /** "8:00 AM · 2 min read" */
    val timeLabel: String,
    /** "Listen 1:52" */
    val listenLabel: String?,
    /** "Three things worth your time this week" */
    val heading: String,
    val items: List<BriefItem>,
    val followUps: List<FollowUp>,
    /** "For Alex · Monday, September 28" */
    val forLabel: String,
    val audioUrl: String? = null,
)

data class AnalystAnswer(val text: String, val sources: List<String>, val suggestedFollowUps: List<FollowUp> = emptyList())

data class ChatTurn(val fromAgent: Boolean, val text: String, val sources: List<String> = emptyList())
