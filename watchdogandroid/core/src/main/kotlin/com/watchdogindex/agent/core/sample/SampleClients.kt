package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.NextAction
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone

/**
 * Fills the client list out to the mockup's totals: 146 contacts, 58 past clients, 88 sphere, 12 checkups ready.
 * Rows are homes plus the agent's own CRM reference; there is no person's name anywhere in a row. Generation is
 * deterministic so the list is identical on every run.
 */
internal object SampleClients {

    private val quiet = NextAction(NextActionKind.None, "Nothing new this week")
    private val sendCheckup = NextAction(NextActionKind.Send, "Send tax checkup")

    private class HarrisonBill(val address: String, val pin: String, val year: Int, val up: Int, val phone: String)

    /** Eight more Harrison past clients whose 2026 bills rose between $380 and $640 (27 Hamilton St is the ninth). */
    private val harrisonBills = listOf(
        HarrisonBill("14 Cleveland Ave", SampleData.CLEVELAND_PIN, 2018, 388, "(973) 555-0119"),
        HarrisonBill("9 Sussex St", "0905_63_11", 2022, 402, "(973) 555-0162"),
        HarrisonBill("118 Bergen St", "0905_141_2", 2015, 455, "(973) 555-0177"),
        HarrisonBill("41 Davis Ave", "0905_120_18", 2020, 470, "(973) 555-0141"),
        HarrisonBill("77 Warren St", "0905_101_6", 2017, 590, "(973) 555-0128"),
        HarrisonBill("230 Jersey St", "0905_155_9", 2023, 512, "(973) 555-0193"),
        HarrisonBill("16 Grant Ave", "0905_72_14", 2016, 548, "(973) 555-0156"),
        HarrisonBill("52 Kingsland Ave", "0905_133_3", 2021, 640, "(973) 555-0107"),
    )

    private class Quiet(val town: SampleTown, val streets: List<String>)

    private val quietTowns = listOf(
        Quiet(SampleTowns.cherryHill, listOf("Kresson Rd", "Chapel Ave", "Brace Rd", "Covered Bridge Rd", "Kings Hwy", "Springdale Rd")),
        Quiet(SampleTowns.redBank, listOf("Branch Ave", "Leroy Pl", "Wallace St", "River Rd", "Hudson Ave", "Locust Ave")),
        Quiet(SampleTowns.middletown, listOf("Kings Hwy", "Navesink River Rd", "Oak Hill Rd", "Chapel Hill Rd", "Harmony Rd")),
        Quiet(SampleTowns.fairHaven, listOf("Ridge Rd", "Hance Rd", "Fair Haven Rd", "Buttonwood Dr", "Willow St")),
        Quiet(SampleTowns.haddonfield, listOf("Warwick Rd", "Lake St", "Chews Landing Rd", "Grove St", "Hopkins Ln")),
        Quiet(SampleTowns.voorhees, listOf("Colonial Ave", "Burnt Mill Rd", "Cooper Rd", "Somerdale Rd", "Haddonfield-Berlin Rd")),
        Quiet(SampleTowns.gloucesterTwp, listOf("Erial Rd", "Blackwood-Clementon Rd", "Little Gloucester Rd", "Hider Ln")),
        Quiet(SampleTowns.harrison, listOf("Frank E Rodgers Blvd", "Harrison Ave", "Cross St", "Bergen St")),
    )

    fun generate(visible: List<ClientRow>): List<ClientRow> {
        val reserved = visible.mapNotNull { it.crmRef?.removePrefix("CRM-")?.toIntOrNull() }.toMutableSet()
        var nextCrm = 1
        fun crm(): String {
            while (nextCrm in reserved) nextCrm++
            reserved += nextCrm
            return "CRM-" + nextCrm.toString().padStart(3, '0')
        }
        val rng = Mulberry32(146)
        val out = ArrayList<ClientRow>(141)

        for (h in harrisonBills) {
            val ref = crm()
            out += ClientRow(
                id = "client-${ref.removePrefix("CRM-")}",
                pin = h.pin,
                address = h.address,
                town = SampleTowns.harrison.shortName,
                relationship = Relationship.PastClient,
                relationshipYear = h.year,
                crmRef = ref,
                status = StatusChip("Bill up ${Format.money(h.up)}", Tone.Warn),
                nextAction = NextAction(NextActionKind.Call, "Call about the new bill", h.phone),
                tile = TileTint.Sky,
                checkupReady = true,
            )
        }

        // Two more checkups outside Harrison.
        listOf(
            Triple("212 Chews Landing Rd", SampleTowns.gloucesterTwp, 2020) to "0415_11402_8",
            Triple("7 Colonial Ave", SampleTowns.voorhees, 2018) to "0434_150.01_22",
        ).forEach { (home, pin) ->
            val (address, town, year) = home
            val ref = crm()
            out += ClientRow("client-${ref.removePrefix("CRM-")}", pin, address, town.shortName, Relationship.PastClient, year, ref, StatusChip("Checkup ready", Tone.Good), sendCheckup, TileTint.Mint, checkupReady = true)
        }

        // A sphere contact whose home sold this week.
        run {
            val ref = crm()
            out += ClientRow(
                id = "client-${ref.removePrefix("CRM-")}",
                pin = SampleData.PROSPECT_PIN,
                address = "31 Prospect Ave",
                town = SampleTowns.redBank.shortName,
                relationship = Relationship.Sphere,
                relationshipYear = null,
                crmRef = ref,
                status = StatusChip("Sold Sep 24", Tone.Neutral, "sell"),
                nextAction = NextAction(NextActionKind.Mail, "Send a congratulations note"),
                tile = TileTint.Fill,
            )
        }

        // Past clients with nothing new this week.
        repeat(45) { i ->
            val q = quietTowns[i % quietTowns.size]
            val street = q.streets[(i / quietTowns.size) % q.streets.size]
            val number = 4 + rng.nextInt(400)
            val ref = crm()
            out += ClientRow(
                id = "client-${ref.removePrefix("CRM-")}",
                pin = "${q.town.district}_${200 + i}_${1 + rng.nextInt(28)}",
                address = "$number $street",
                town = q.town.shortName,
                relationship = Relationship.PastClient,
                relationshipYear = 2009 + rng.nextInt(16),
                crmRef = ref,
                status = null,
                nextAction = quiet,
                tile = TileTint.Fill,
            )
        }

        // Sphere contacts; every ninth home is being watched.
        repeat(85) { i ->
            val q = quietTowns[(i + 3) % quietTowns.size]
            val street = q.streets[(i / quietTowns.size + 1) % q.streets.size]
            val number = 2 + rng.nextInt(600)
            val ref = crm()
            val watching = i % 9 == 4
            out += ClientRow(
                id = "client-${ref.removePrefix("CRM-")}",
                pin = "${q.town.district}_${400 + i}_${1 + rng.nextInt(28)}",
                address = "$number $street",
                town = q.town.shortName,
                relationship = Relationship.Sphere,
                relationshipYear = null,
                crmRef = ref,
                status = if (watching) StatusChip("Watching", Tone.Neutral) else null,
                nextAction = quiet,
                tile = TileTint.Fill,
            )
        }
        return out
    }
}
