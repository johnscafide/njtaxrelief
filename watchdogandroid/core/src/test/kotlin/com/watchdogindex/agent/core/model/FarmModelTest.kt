package com.watchdogindex.agent.core.model

import com.watchdogindex.agent.core.sample.SampleData
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** The map's pure helpers: the zoom convention and its MapLibre conversion, and the parcel callout line. */
class FarmModelTest {

    @Test
    fun `MapLibre zoom is one level lower for the same scale and round-trips`() {
        assertEquals(1.0, MapZoom.MAPLIBRE_ZOOM_OFFSET)
        assertEquals(kotlin.math.log2(MapZoom.MAPLIBRE_TILE_PX / MapZoom.TILE_DP), MapZoom.MAPLIBRE_ZOOM_OFFSET)
        assertEquals(15.0, MapZoom.toMapLibre(16.0))
        assertEquals(16.0, MapZoom.fromMapLibre(15.0))
        // The sample farm's authored zoom and the Farm screen's street zoom.
        assertEquals(14.6, MapZoom.toMapLibre(SampleData.birchwoodFarm.zoom), 1e-9)
        assertEquals(16.5, MapZoom.toMapLibre(17.5), 1e-9)
        listOf(8.0, 12.0, 15.6, 17.5).forEach { z -> assertEquals(z, MapZoom.fromMapLibre(MapZoom.toMapLibre(z)), 1e-12) }
    }

    @Test
    fun `metres per dp follow the 256 dp tile convention`() {
        // 156 543 · cos(40°) / 2^16 ≈ 1.83 m per dp near 40N, and every level halves it.
        val z16 = MapZoom.metresPerDp(16.0, 39.9)
        assertTrue(abs(z16 - 1.83) < 0.02, "expected about 1.83 m per dp at zoom 16 near 40N, got $z16")
        assertEquals(z16 / 2, MapZoom.metresPerDp(17.0, 39.9), 1e-9)
        assertEquals(156_543.03392, MapZoom.metresPerDp(0.0, 0.0), 0.01)
        // The same ground scale MapLibre draws at its zoom 15 with 512 px tiles: 40 075 016 · cos(lat) / (512 · 2^15).
        val mapLibre15 = 2 * Math.PI * 6_378_137.0 * Math.cos(Math.toRadians(39.9)) / (512 * Math.pow(2.0, 15.0))
        assertEquals(mapLibre15, MapZoom.metresPerDp(MapZoom.fromMapLibre(15.0), 39.9), 1e-9)
    }

    @Test
    fun `callout line reads like the mockup`() {
        val selected = assertNotNull(SampleData.birchwoodGrid.byPin(SampleData.BIRCHWOOD_PIN))
        assertEquals("36 Birchwood Dr", selected.address)
        assertEquals("Score 72 · tax $11,284", selected.calloutLine())
        val store = SampleData.birchwoodGrid.parcels.first { !it.residential }
        assertTrue(store.calloutLine().startsWith("Not a home"), store.calloutLine())
        val unscored = selected.copy(score = null)
        assertEquals("Not scored yet · tax $11,284", unscored.calloutLine())
        assertEquals("Score 72", selected.copy(taxBill = null).calloutLine())
        assertEquals("Not a home", store.copy(taxBill = null, score = null).calloutLine())
    }

    @Test
    fun `client filters map to and from the web's filter keys`() {
        assertEquals("checkup", ClientFilter.CheckupReady.key)
        assertEquals(ClientFilter.CheckupReady, ClientFilter.fromKey("checkup"))
        assertEquals(ClientFilter.CheckupReady, ClientFilter.fromKey(" Checkups "))
        assertEquals(ClientFilter.PastClients, ClientFilter.fromKey("past"))
        assertEquals(ClientFilter.PastClients, ClientFilter.fromKey("past-clients"))
        assertEquals(ClientFilter.Sphere, ClientFilter.fromKey("sphere"))
        assertEquals(ClientFilter.All, ClientFilter.fromKey("all"))
        ClientFilter.entries.forEach { f -> assertEquals(f, ClientFilter.fromKey(f.key)); assertEquals(f, ClientFilter.fromKey(f.name)) }
        assertEquals(null, ClientFilter.fromKey(null))
        assertEquals(null, ClientFilter.fromKey(""))
        assertEquals(null, ClientFilter.fromKey("sellers"))
        assertEquals(ClientFilter.entries.size, ClientFilter.entries.map { it.key }.toSet().size, "keys are unique")
    }
}
