package com.watchdogindex.agent.core.model

enum class CampaignKind { Postcard, Email }

data class Campaign(
    val id: String,
    val kind: CampaignKind,
    /** "Birchwood Park fall update" */
    val title: String,
    /** "Postcard · 412 homes · mails Oct 6" */
    val subtitle: String,
    val status: StatusChip,
    /** Postcard thumb: top line "Fall 2026", bottom line "Median $455K". */
    val thumbTop: String? = null,
    val thumbBottom: String? = null,
)

data class AgentCard(
    val name: String,
    val brokerage: String,
    val town: String?,
    val phone: String?,
    val email: String?,
) {
    val initials: String get() = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
}

data class TrueCostInputs(
    val price: Int,
    val downPercent: Double = 20.0,
    val ratePercent: Double = 6.5,
    val termYears: Int = 30,
    val annualInsurance: Int = 0,
    val monthlyHoa: Int = 0,
)

/** The buyer true cost card: the real monthly cost of a listing, property tax included. */
data class TrueCostCard(
    val pin: PamsPin,
    /** "36 Birchwood Dr, Cherry Hill" */
    val address: String,
    val inputs: TrueCostInputs,
    val annualTax: Int,
    val monthlyMortgage: Int,
    val monthlyTax: Int,
    val monthlyInsurance: Int,
    val monthlyHoa: Int,
    val monthlyTotal: Int,
    val agent: AgentCard?,
    /** Public share link on www.watchdogindex.com (/true-cost?pin=...&agent=...). */
    val shareUrl: String,
) {
    val mortgageLabel: String get() = "Mortgage · ${inputs.termYears} yrs at ${formatRate(inputs.ratePercent)}%"

    private fun formatRate(r: Double): String = if (r == r.toLong().toDouble()) r.toLong().toString() else r.toString()
}

enum class MarketingTab { Campaigns, Cards, MyPage }
