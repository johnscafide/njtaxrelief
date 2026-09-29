package com.watchdogindex.agent.preview

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.sample.SampleData
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The map's geometry without a canvas: projection round trips and the street grid derived from the sample farm. */
class FarmMapGeometryTest {

    private val grid = SampleData.birchwoodGrid
    private val farm = SampleData.birchwoodFarm

    @Test
    fun mercatorRoundTrips() {
        val p = MapProjection(farm.center, farm.zoom, 2.625f, Size(1081f, 2341f))
        val screenCenter = p.toScreen(farm.center)
        assertNear(1081f / 2, screenCenter.x, 0.01f)
        assertNear(2341f / 2, screenCenter.y, 0.01f)
        val back = p.toLatLng(Offset(200f, 900f))
        val again = p.toScreen(back)
        assertNear(200f, again.x, 0.01f)
        assertNear(900f, again.y, 0.01f)
        // North is up: a point further north lands higher on the screen.
        assertTrue(p.toScreen(LatLng(farm.center.lat + 0.001, farm.center.lon)).y < screenCenter.y)
        // Panning moves the visible centre by the same distance in the opposite direction.
        val panned = MapProjection(farm.center, farm.zoom, 2.625f, Size(1081f, 2341f), pan = Offset(100f, 0f))
        assertTrue(panned.visibleCenter().lon < farm.center.lon)
    }

    @Test
    fun metresPerPixelFollowsTheZoom() {
        val z16 = WebMercator.metresPerPixel(39.9, 16.0, 1f)
        val z17 = WebMercator.metresPerPixel(39.9, 17.0, 1f)
        assertNear(z16 / 2, z17, 1e-6)
        assertTrue(z16 in 1.5..2.0, "about 1.83 m per dp at zoom 16 near 40N, got $z16")
    }

    @Test
    fun derivesTheStreetGridOfTheSampleFarm() {
        val streets = assertNotNull(StreetGrid.derive(grid.parcels, farm.boundary), "the full farm must produce a grid")
        // 7 block columns and 6 block rows: 8 north-south and 7 east-west street lines, perimeter included.
        assertEquals(8, streets.xLines.size, "north-south streets: ${streets.xLines}")
        assertEquals(7, streets.yLines.size, "east-west streets: ${streets.yLines}")
        assertNear(12f, streets.streetWidth, 1f)
        assertNear(18f, streets.parcelWidth, 1f)
        assertNear(36f, streets.parcelDepth, 1f)
        assertNear(102f, streets.pitchX, 2f)
        assertNear(84f, streets.pitchY, 2f)
        val ascendingX = streets.xLines.zipWithNext().all { (a, b) -> a < b }
        assertTrue(ascendingX && streets.yLines.zipWithNext().all { (a, b) -> a < b })
        // The boundary hugs the perimeter streets' centre lines, so its local bounds match the outer lines.
        val bounds = StreetGrid.boundsOf(streets.boundary)
        assertNear(streets.xLines.first(), bounds.left, 1f)
        assertNear(streets.xLines.last(), bounds.right, 1f)
        assertTrue(streets.insideBoundary(Offset(0f, 0f)))
        assertTrue(!streets.insideBoundary(Offset(bounds.right + 50f, 0f)))
    }

    @Test
    fun extendsTheGridOutwardAtTheBlockPitch() {
        val streets = assertNotNull(StreetGrid.derive(grid.parcels, farm.boundary))
        val lines = streets.xLinesCovering(-2000f..2000f)
        assertTrue(lines.size > streets.xLines.size)
        assertTrue(lines.first() < -2000f && lines.last() > 2000f)
        lines.zipWithNext().forEach { (a, b) -> assertNear(streets.pitchX, b - a, 2f) }
    }

    @Test
    fun namesEveryStreetFromTheAddresses() {
        val streets = assertNotNull(StreetGrid.derive(grid.parcels, farm.boundary))
        val names = streets.labels.map { it.name }
        listOf("Queen Anne Rd", "Birchwood Dr", "Ashbrook Rd", "Laurel Ln", "Heritage Rd", "Sheffield Rd", "Coventry Ln").forEach {
            assertTrue(it in names, "missing street label $it in $names")
        }
        assertTrue(streets.labels.all { it.horizontal }, "the sample's streets all run east-west")
        // Each label sits on one of the derived street lines, ordered north to south by name.
        streets.labels.forEach { label -> assertTrue(streets.yLines.any { abs(it - label.line) < 0.5f }, "${label.name} is not on a street line") }
        val queenAnne = streets.labels.first { it.name == "Queen Anne Rd" }
        val coventry = streets.labels.first { it.name == "Coventry Ln" }
        assertTrue(queenAnne.line > coventry.line, "Queen Anne Rd is the northernmost street")
    }

    @Test
    fun sparseLayersDoNotProduceAGrid() {
        val sold = grid.parcels.filter { it.soldInLast12Months }
        assertTrue(sold.isNotEmpty())
        assertNull(StreetGrid.derive(sold, farm.boundary), "21 scattered parcels must not be mistaken for a full farm")
        assertNull(StreetGrid.derive(emptyList(), farm.boundary))
    }

    @Test
    fun layersDecideWhichParcelsKeepTheirBand() {
        val selected = assertNotNull(grid.byPin(SampleData.BIRCHWOOD_PIN))
        assertEquals(3, parcelBand(selected, MapLayer.Score), "72 is the 70-84 band")
        assertEquals(3, parcelBand(selected, MapLayer.Residential))
        assertNull(parcelBand(selected, MapLayer.SoldIn12Months), "not sold, so grey on the sold layer")
        val store = grid.parcels.first { !it.residential }
        assertNull(parcelBand(store, MapLayer.Score), "stores have no score")
        assertNull(parcelBand(store, MapLayer.Residential))
        val sold = grid.parcels.first { it.soldInLast12Months }
        assertNotNull(parcelBand(sold, MapLayer.SoldIn12Months))
        assertTrue(showsSoldDot(sold, MapLayer.Score) && showsSoldDot(sold, MapLayer.SoldIn12Months))
        assertTrue(!showsSoldDot(sold, MapLayer.Permits))
    }

    @Test
    fun calloutReadsLikeTheMockup() {
        val selected = assertNotNull(grid.byPin(SampleData.BIRCHWOOD_PIN))
        assertEquals("36 Birchwood Dr", selected.address)
        assertEquals("Score 72 · tax $11,284", calloutLine(selected))
        val store = grid.parcels.first { !it.residential }
        assertTrue(calloutLine(store).startsWith("Not a home"))
    }

    @Test
    fun streetNamesComeFromTheHouseNumber() {
        assertEquals("Birchwood Dr", StreetGrid.streetNameOf("36 Birchwood Dr"))
        assertEquals("Queen Anne Rd", StreetGrid.streetNameOf(" 57 Queen Anne Rd "))
        assertNull(StreetGrid.streetNameOf("Birchwood Park"))
        assertNull(StreetGrid.streetNameOf("36"))
    }

    @Test
    fun pointInPolygonHandlesTheRing() {
        val square = listOf(Offset(0f, 0f), Offset(10f, 0f), Offset(10f, 10f), Offset(0f, 10f), Offset(0f, 0f))
        assertTrue(StreetGrid.pointInPolygon(Offset(5f, 5f), square))
        assertTrue(!StreetGrid.pointInPolygon(Offset(15f, 5f), square))
        assertEquals(100.0, StreetGrid.polygonArea(square), 1e-6)
    }

    private fun assertNear(expected: Float, actual: Float, tolerance: Float) =
        assertTrue(abs(expected - actual) <= tolerance, "expected $expected ± $tolerance, got $actual")

    private fun assertNear(expected: Double, actual: Double, tolerance: Double) =
        assertTrue(abs(expected - actual) <= tolerance, "expected $expected ± $tolerance, got $actual")
}
