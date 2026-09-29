package com.watchdogindex.agent.core.model

enum class AlertChannel(val id: String, val title: String, val description: String) {
    ClientHomeChanges("client_home_changes", "Client home changes", "Tax bills, assessments and permits"),
    FarmSalesAndDeeds("farm_sales_deeds", "Farm sales and deeds", "New deeds in your farm"),
    TownRatesAndRevaluations("town_rates_revaluations", "Town rates and revaluations", "Rate changes and revaluation notices"),
    AppealDeadlines("appeal_deadlines", "Appeal deadlines", "30 and 7 days before"),
    MondayBrief("monday_brief", "Monday brief", "Your top ten changes, Mondays at 8:00 AM");

    companion object {
        /** Carried into every channel description, as the privacy rules require. */
        const val NOT_A_SELLER_PREDICTION = "Property changes are not seller predictions."
    }
}

data class QuietHours(val startHour: Int, val endHour: Int) {
    /** "9 PM to 7 AM" */
    val label: String get() = "${hour(startHour)} to ${hour(endHour)}"
    /** "9 PM–7 AM" */
    val shortLabel: String get() = "${hour(startHour)}–${hour(endHour)}"
    private fun hour(h: Int): String = when {
        h == 0 -> "12 AM"; h < 12 -> "$h AM"; h == 12 -> "12 PM"; else -> "${h - 12} PM"
    }
}

data class AlertPreferences(
    val mondayEmail: Boolean = true,
    val mondayNotification: Boolean = true,
    /** "Mondays, 8:00 AM" */
    val deliveryLabel: String = "Mondays at 8:00 AM",
    val timeZone: String = "America/New_York",
    val channels: Map<AlertChannel, Boolean> = mapOf(
        AlertChannel.ClientHomeChanges to true,
        AlertChannel.FarmSalesAndDeeds to true,
        AlertChannel.TownRatesAndRevaluations to false,
        AlertChannel.AppealDeadlines to true,
    ),
    val quietHours: QuietHours = QuietHours(21, 7),
)

enum class NotificationActionKind { OpenBrief, CallClient, ViewFarm, SendCheckups, Later, Open }

data class NotificationAction(val kind: NotificationActionKind, val label: String)

data class AppNotification(
    val id: String,
    val channel: AlertChannel,
    val title: String,
    val body: String,
    /** "now", "7:41 AM", "Sun" */
    val timeLabel: String,
    val pin: PamsPin?,
    val actions: List<NotificationAction>,
)
