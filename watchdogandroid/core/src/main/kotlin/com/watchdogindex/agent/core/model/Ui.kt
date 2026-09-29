package com.watchdogindex.agent.core.model

/** Card tint by meaning: sky for tax, sand for value checks and checkups, mint for sales, navy for the score. */
enum class Tint { Plain, Navy, Sky, Sand, Mint }

/** Small square icon tile tint used on rows. */
enum class TileTint { Sky, Sand, Mint, Navy, Fill }

/** Status chip tone. Chips always carry text; color is never the only signal. */
enum class Tone { Warn, Good, Sky, Neutral }

/** A status chip such as "Bill up $612". [icon] is a Material Symbols name, e.g. "cake". */
data class StatusChip(val label: String, val tone: Tone, val icon: String? = null)

/** Where a number came from, shown under cards and in briefs. */
data class SourceNote(val text: String)
