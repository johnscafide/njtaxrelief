package com.watchdogindex.agent.core.model

enum class NextActionKind { Call, Send, Mail, Edit, None }

data class NextAction(val kind: NextActionKind, val label: String, val phone: String? = null)

/**
 * A client or sphere contact, always led by the HOME. Rows never show a public-record owner name;
 * the agent's own CRM reference identifies the person.
 */
data class ClientRow(
    val id: String,
    val pin: PamsPin?,
    /** "27 Hamilton St" */
    val address: String,
    /** "Harrison" */
    val town: String,
    val relationship: Relationship,
    val relationshipYear: Int?,
    /** "CRM-104" */
    val crmRef: String?,
    val status: StatusChip?,
    val nextAction: NextAction,
    val tile: TileTint,
    val checkupReady: Boolean = false,
) {
    /** "Harrison · Past client, 2019 · CRM-104" */
    val metaLine: String
        get() = listOfNotNull(
            town,
            when (relationship) {
                Relationship.PastClient -> if (relationshipYear != null) "Past client, $relationshipYear" else "Past client"
                Relationship.Sphere -> "Sphere"
                Relationship.Farm -> "Farm"
                Relationship.Watching -> "Watching"
            },
            crmRef,
        ).joinToString(" · ")
}

/** The Clients tab's chips. [key] is the web's `?filter=` value (`clients?filter=checkup`), the one routes and deep links carry. */
enum class ClientFilter(val key: String) {
    All("all"),
    PastClients("past"),
    Sphere("sphere"),
    CheckupReady("checkup");

    companion object {
        /**
         * The filter a route or link names, or null for a missing or unknown key (the screen then opens on its own
         * state). Accepts the web keys, the enum names and the plural "checkups" the notification route words use.
         */
        fun fromKey(key: String?): ClientFilter? {
            val k = key?.trim()?.lowercase()?.replace('-', '_') ?: return null
            if (k.isEmpty()) return null
            return entries.firstOrNull { it.key == k || it.name.lowercase() == k } ?: when (k) {
                "checkups", "checkup_ready", "ready" -> CheckupReady
                "past_clients", "past_client", "pastclients" -> PastClients
                else -> null
            }
        }
    }
}

data class CheckupSeason(
    /** "12 tax checkups ready to send" */
    val title: String,
    val body: String,
    val ctaLabel: String,
    val readyCount: Int,
    /** "April 1, 2027" */
    val appealDeadline: String,
)

data class ClientsOverview(
    val all: Int,
    val pastClients: Int,
    val sphere: Int,
    val checkupsReady: Int,
    val season: CheckupSeason?,
    val rows: List<ClientRow>,
)

/** One row of a CSV import: the app matches each to a parcel. */
data class ClientImportRow(val address: String, val town: String, val relationship: Relationship, val year: Int?, val crmRef: String?)
