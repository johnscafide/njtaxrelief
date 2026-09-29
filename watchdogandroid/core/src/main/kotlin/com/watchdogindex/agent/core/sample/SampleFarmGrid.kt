package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapParcel
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Deterministic pseudo-random numbers (a port of the mulberry32 generator the mockup HTML uses), so the sample
 * farm renders identically on every machine and in every screenshot run.
 */
internal class Mulberry32(seed: Int) {
    private var a: Int = seed

    /** Uniform in [0, 1). */
    fun next(): Double {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
        return (t xor (t ushr 14)).toUInt().toDouble() / 4294967296.0
    }

    fun nextInt(bound: Int): Int = (next() * bound).toInt().coerceIn(0, bound - 1)
}

/**
 * Describes a farm laid out like the mockup map: a street grid rotated a few degrees, blocks of two rows of five
 * parcels, and horizontal streets named from north to south. Distances are metres; the grid is centred on
 * [center] and rotated [rotationDegrees] counter-clockwise from east, so streets climb to the north-east the way
 * the mockup's `rotate(-16)` does in screen space.
 */
data class FarmGridSpec(
    val district: String,
    val center: LatLng,
    val rotationDegrees: Double = 16.0,
    val blockCols: Int,
    val blockRows: Int,
    /** Names of the east-west streets, north to south; needs blockRows + 1 entries. */
    val streets: List<String>,
    /** Whole part of the first block row's block number; row `br` is "${blockBase + br}.${11 + bc}". */
    val blockBase: Int,
    val seed: Int,
    val parcelWidthM: Double = 18.0,
    val parcelDepthM: Double = 36.0,
    val streetWidthM: Double = 12.0,
    /** Centre and amplitude of the smooth score field; noise of ±14 is added on top and the result is clamped to 30..95. */
    val scoreBase: Double = 62.0,
    val scoreAmplitude: Double = 17.0,
    /** General rate per $100 used to turn an invented assessment into a tax bill. */
    val ratePer100: Double,
    val assessedRange: IntRange,
    /** How many residential parcels carry a deed in the last 12 months / a permit in the last 90 days. */
    val soldCount: Int,
    val permitCount: Int,
    /** Addresses that must be among the sold parcels (recent deeds the rest of the sample talks about). */
    val forcedSold: Set<String> = emptySet(),
    /** Addresses that must carry a recent permit (the digest mentions them). */
    val forcedPermits: Set<String> = emptySet(),
    /** The parcel the mockup shows selected, with its fixed score and bill. */
    val selectedAddress: String? = null,
    val selectedScore: Int = 72,
    val selectedTaxBill: Int = 11_284,
    /** Number of parcels at the end of the grid that are stores rather than homes (they have no score). */
    val commercialCount: Int = 0,
) {
    init {
        require(streets.size == blockRows + 1) { "streets must name every east-west street: blockRows + 1 entries" }
    }
}

class FarmGrid(val parcels: List<MapParcel>, val boundary: List<LatLng>) {
    private val byAddress = parcels.associateBy { it.address.lowercase() }
    private val byPin = parcels.associateBy { it.pin }

    fun byAddress(address: String): MapParcel? = byAddress[address.trim().lowercase()]

    fun byPin(pin: String): MapParcel? = byPin[pin]

    val homes: Int get() = parcels.count { it.residential }

    /** Centre of a parcel's ring, for a property's lat/lon. */
    fun centerOf(parcel: MapParcel): LatLng {
        val pts = parcel.ring.dropLast(1)
        return LatLng(pts.sumOf { it.lat } / pts.size, pts.sumOf { it.lon } / pts.size)
    }
}

/** Builds the parcel geometry, scores, deeds and permits for a [FarmGridSpec]. Same spec, same output. */
object SampleFarmGrid {
    private const val METRES_PER_DEGREE_LAT = 111_320.0
    private const val PARCELS_ACROSS = 5
    private const val PARCELS_DEEP = 2

    fun generate(spec: FarmGridSpec): FarmGrid {
        val rng = Mulberry32(spec.seed)
        val pitchX = PARCELS_ACROSS * spec.parcelWidthM + spec.streetWidthM
        val pitchY = PARCELS_DEEP * spec.parcelDepthM + spec.streetWidthM
        val width = spec.blockCols * pitchX - spec.streetWidthM
        val height = spec.blockRows * pitchY - spec.streetWidthM
        val x0 = -width / 2
        val yTop = height / 2
        val projector = Projector(spec.center, spec.rotationDegrees)

        data class Draft(
            val pin: String,
            val address: String,
            val ring: List<LatLng>,
            var score: Int?,
            var taxBill: Int,
            var residential: Boolean,
            var sold: Boolean = false,
            var permit: Boolean = false,
        )

        val drafts = ArrayList<Draft>(spec.blockCols * spec.blockRows * PARCELS_ACROSS * PARCELS_DEEP)
        for (br in 0 until spec.blockRows) {
            for (bc in 0 until spec.blockCols) {
                val block = "${spec.blockBase + br}.${11 + bc}"
                val left = x0 + bc * pitchX
                val top = yTop - br * pitchY
                for (r in 0 until PARCELS_DEEP) {
                    for (c in 0 until PARCELS_ACROSS) {
                        val px = left + c * spec.parcelWidthM
                        val py = top - r * spec.parcelDepthM
                        val cx = px + spec.parcelWidthM / 2
                        val cy = py - spec.parcelDepthM / 2
                        // North half faces the street above the block with odd numbers; south half faces the
                        // street below with even numbers. Lots run 1-5 on the north side, 7-11 on the south, so
                        // "36 Birchwood Dr" is block 285.14, lot 9 (top block row, fourth block, south half).
                        val street = if (r == 0) spec.streets[br] else spec.streets[br + 1]
                        val number = 2 * (bc * PARCELS_ACROSS + c) + if (r == 0) 1 else 2
                        val lot = if (r == 0) c + 1 else 7 + c
                        val ring = listOf(
                            projector.toLatLng(px, py),
                            projector.toLatLng(px + spec.parcelWidthM, py),
                            projector.toLatLng(px + spec.parcelWidthM, py - spec.parcelDepthM),
                            projector.toLatLng(px, py - spec.parcelDepthM),
                        ).let { it + it.first() }
                        val smooth = spec.scoreBase + spec.scoreAmplitude * sin(cx / 53.0 + 1.1) * cos(cy / 76.0)
                        val score = (smooth + (rng.next() - 0.5) * 28).roundToInt().coerceIn(30, 95)
                        val assessed = (spec.assessedRange.first + rng.next() * (spec.assessedRange.last - spec.assessedRange.first)).toInt() / 100 * 100
                        val tax = (assessed * spec.ratePer100 / 100).roundToInt()
                        drafts += Draft("${spec.district}_${block}_$lot", "$number $street", ring, score, tax, residential = true)
                    }
                }
            }
        }

        // The last parcels of the grid are a strip of stores: no Watchdog Score, higher bills, not homes.
        for (i in 0 until spec.commercialCount.coerceAtMost(drafts.size)) {
            val d = drafts[drafts.size - 1 - i]
            d.residential = false
            d.score = null
            d.taxBill = d.taxBill * 3
        }

        val selected = spec.selectedAddress?.let { addr -> drafts.firstOrNull { it.address.equals(addr, ignoreCase = true) } }
        selected?.let {
            it.score = spec.selectedScore
            it.taxBill = spec.selectedTaxBill
            it.residential = true
        }

        val homes = drafts.filter { it.residential && it !== selected }
        val forcedSold = spec.forcedSold.map(String::lowercase).toSet()
        val forcedPermits = spec.forcedPermits.map(String::lowercase).toSet()
        homes.filter { it.address.lowercase() in forcedSold }.forEach { it.sold = true }
        pickRandom(homes.filter { !it.sold }, spec.soldCount - homes.count { it.sold }, rng).forEach { it.sold = true }
        homes.filter { it.address.lowercase() in forcedPermits }.forEach { it.permit = true }
        pickRandom(homes.filter { !it.permit }, spec.permitCount - homes.count { it.permit }, rng).forEach { it.permit = true }

        val margin = spec.streetWidthM / 2
        val boundary = listOf(
            projector.toLatLng(x0 - margin, yTop + margin),
            projector.toLatLng(x0 + width + margin, yTop + margin),
            projector.toLatLng(x0 + width + margin, yTop - height - margin),
            projector.toLatLng(x0 - margin, yTop - height - margin),
        ).let { it + it.first() }

        val parcels = drafts.map {
            MapParcel(
                pin = it.pin,
                address = it.address,
                ring = it.ring,
                score = it.score,
                taxBill = it.taxBill,
                soldInLast12Months = it.sold,
                permitInLast90Days = it.permit,
                residential = it.residential,
            )
        }
        return FarmGrid(parcels, boundary)
    }

    private fun <T> pickRandom(from: List<T>, count: Int, rng: Mulberry32): List<T> {
        if (count <= 0 || from.isEmpty()) return emptyList()
        val pool = from.toMutableList()
        val out = ArrayList<T>(count)
        while (out.size < count && pool.isNotEmpty()) {
            out += pool.removeAt(rng.nextInt(pool.size))
        }
        return out
    }

    /** Rotates local metres about the origin and shifts them to latitude/longitude around the centre. */
    private class Projector(private val center: LatLng, rotationDegrees: Double) {
        private val theta = rotationDegrees * PI / 180
        private val cosT = cos(theta)
        private val sinT = sin(theta)
        private val metresPerDegreeLon = METRES_PER_DEGREE_LAT * cos(center.lat * PI / 180)

        fun toLatLng(x: Double, y: Double): LatLng {
            val rx = x * cosT - y * sinT
            val ry = x * sinT + y * cosT
            return LatLng(
                lat = round6(center.lat + ry / METRES_PER_DEGREE_LAT),
                lon = round6(center.lon + rx / metresPerDegreeLon),
            )
        }

        private fun round6(v: Double): Double = (v * 1_000_000).roundToInt() / 1_000_000.0
    }
}
