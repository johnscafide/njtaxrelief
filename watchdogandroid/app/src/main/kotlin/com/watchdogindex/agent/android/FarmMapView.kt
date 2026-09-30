package com.watchdogindex.agent.android

import android.content.Context
import android.graphics.PointF
import android.util.Log
import android.view.Gravity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.watchdogindex.agent.R
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.MapZoom
import com.watchdogindex.agent.core.model.ScoreBands
import com.watchdogindex.agent.design.WatchdogColors
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.platform.FarmMapState
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.BackgroundLayer
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon
import kotlin.math.abs
import org.maplibre.android.geometry.LatLng as MapLatLng

/*
 * The farm map on MapLibre. Basemap: OpenFreeMap Liberty, the same tiles the website's farm map uses. On top
 * of it, from the FarmMapState:
 *   - a GeoJSON source of parcel polygons (properties: pin, address, score, band, sold, permit, residential)
 *   - a FillLayer colored per layer: Score bands from WatchdogTheme.colors.mapBands, residential / sold /
 *     permit highlights on the other layers, everything else mapOut
 *   - a LineLayer for parcel edges (2-unit mapLand, as the mockup's parcel strokes), a CircleLayer of gold dots
 *     ringed in mapLand at sold parcels (Score and Sold layers)
 *   - the farm boundary (mapBound 2.5 stroke over a 5% mapBound fill), the selected parcel outline (ink 3.5)
 *     and the polygon being drawn in draw mode. Widths follow Docs/mockup-css-to-compose.md section 3.40.
 * In dark mode a translucent BackgroundLayer under the parcels dims the light basemap toward mapLand.
 *
 * Zoom: FarmMapState.zoom (and Farm.zoom, and the Farm screen's street zoom) is a Web Mercator zoom over 256 dp
 * tiles, core's MapZoom convention; MapLibre counts 512 px tiles and runs one level lower for the same scale. This
 * adapter is the only place that converts: MapZoom.toMapLibre on the way into the camera, MapZoom.fromMapLibre
 * on the way back out through onMapMoved, so shared code never sees MapLibre's numbers.
 *
 * Everything that touches the map is behind null checks: the style loads asynchronously, and the composable
 * may leave before it does.
 */

private const val STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
private const val TAG = "FarmMap"

private const val SRC_PARCELS = "watchdog-parcels"
private const val SRC_SOLD = "watchdog-sold"
private const val SRC_BOUNDARY = "watchdog-boundary"
private const val SRC_DRAW = "watchdog-draw"
private const val LAYER_DIM = "watchdog-dim"
private const val LAYER_PARCEL_FILL = "watchdog-parcel-fill"
private const val LAYER_PARCEL_LINE = "watchdog-parcel-line"
private const val LAYER_SOLD = "watchdog-sold-dots"
private const val LAYER_BOUNDARY_FILL = "watchdog-boundary-fill"
private const val LAYER_BOUNDARY = "watchdog-boundary-line"
private const val LAYER_SELECTED = "watchdog-selected-line"
private const val LAYER_DRAW_FILL = "watchdog-draw-fill"
private const val LAYER_DRAW_LINE = "watchdog-draw-line"
private const val LAYER_DRAW_POINTS = "watchdog-draw-points"

private const val PROP_PIN = "pin"
private const val PROP_ADDRESS = "address"
private const val PROP_SCORE = "score"
private const val PROP_BAND = "band"
private const val PROP_SOLD = "sold"
private const val PROP_PERMIT = "permit"
private const val PROP_RESIDENTIAL = "residential"

/** ARGB ints for the map, derived from the theme tokens so both themes match the mockups. */
private data class MapPalette(
    val isDark: Boolean,
    val bands: List<Int>,
    val out: Int,
    val road: Int,
    val bound: Int,
    val dot: Int,
    val land: Int,
    val surface: Int,
    val ink: Int,
) {
    companion object {
        fun from(c: WatchdogColors) = MapPalette(
            isDark = c.isDark,
            bands = c.mapBands.map { it.toArgb() },
            out = c.mapOut.toArgb(),
            road = c.mapRoad.toArgb(),
            bound = c.mapBound.toArgb(),
            dot = c.mapDot.toArgb(),
            land = c.mapLand.toArgb(),
            surface = c.surface.toArgb(),
            ink = c.ink.toArgb(),
        )
    }
}

/** Process-wide MapLibre initialisation; getInstance is idempotent but this keeps it to one call. */
private object MapLibreInit {
    @Volatile private var done = false
    fun ensure(context: Context) {
        if (done) return
        synchronized(this) {
            if (done) return
            try { MapLibre.getInstance(context.applicationContext) } catch (e: Throwable) { Log.w(TAG, "MapLibre init failed", e) }
            done = true
        }
    }
}

@Composable
fun FarmMap(state: FarmMapState, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val palette = MapPalette.from(WatchdogTheme.colors)
    val latestState by rememberUpdatedState(state)
    val latestPalette by rememberUpdatedState(palette)
    val description = context.getString(R.string.farm_map_description)

    MapLibreInit.ensure(context)
    val density = context.resources.displayMetrics.density
    val controller = remember { FarmMapController(density) }
    val mapView = remember {
        MapView(context).also { view ->
            view.onCreate(null)
            view.getMapAsync { map -> controller.attach(map, { latestState }, { latestPalette }) }
        }
    }

    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> controller.destroy(mapView)
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            controller.destroy(mapView)
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier.semantics { contentDescription = description },
        update = { controller.apply(state, palette) },
    )
}

/** Owns the MapLibre objects for one FarmMap composable. All methods run on the main thread. */
private class FarmMapController(private val density: Float) {
    private var map: MapLibreMap? = null
    private var style: Style? = null
    private var destroyed = false
    private var stateProvider: () -> FarmMapState? = { null }
    private var paletteProvider: () -> MapPalette? = { null }

    // What has been pushed to the map already, to avoid rebuilding GeoJSON on every recomposition.
    private var appliedParcels: List<MapParcel>? = null
    private var appliedLayer: MapLayer? = null
    private var appliedPalette: MapPalette? = null
    private var appliedSelected: String? = null
    private var appliedBoundary: List<LatLng>? = null
    private var appliedDraw: Pair<Boolean, List<LatLng>>? = null
    private var appliedCamera: Triple<Double, Double, Double>? = null
    private var pendingState: FarmMapState? = null
    private var pendingPalette: MapPalette? = null

    private val clickListener = MapLibreMap.OnMapClickListener { point -> onTap(point) }
    private val idleListener = MapLibreMap.OnCameraIdleListener { onIdle() }

    fun attach(map: MapLibreMap, stateProvider: () -> FarmMapState?, paletteProvider: () -> MapPalette?) {
        if (destroyed) return
        this.map = map
        this.stateProvider = stateProvider
        this.paletteProvider = paletteProvider
        map.uiSettings.apply {
            isCompassEnabled = false
            isLogoEnabled = false
            isRotateGesturesEnabled = false
            isTiltGesturesEnabled = false
            // Keep the OpenStreetMap / OpenFreeMap attribution reachable, below the floating search bar and chips.
            isAttributionEnabled = true
            setAttributionGravity(Gravity.TOP or Gravity.START)
            setAttributionMargins((16 * density).toInt(), (184 * density).toInt(), 0, 0)
        }
        map.addOnMapClickListener(clickListener)
        map.addOnCameraIdleListener(idleListener)
        map.setStyle(Style.Builder().fromUri(STYLE_URL)) { loaded ->
            if (destroyed) return@setStyle
            style = loaded
            val palette = pendingPalette ?: paletteProvider() ?: return@setStyle
            try {
                installLayers(loaded, palette)
            } catch (e: Exception) {
                Log.w(TAG, "Could not add farm layers", e)
                return@setStyle
            }
            pendingState?.let { applyNow(it, palette) }
        }
    }

    fun apply(state: FarmMapState, palette: MapPalette) {
        pendingState = state
        pendingPalette = palette
        val s = style ?: return
        if (destroyed || !s.isFullyLoaded) return
        applyNow(state, palette)
    }

    fun destroy(mapView: MapView) {
        if (destroyed) return
        destroyed = true
        map?.removeOnMapClickListener(clickListener)
        map?.removeOnCameraIdleListener(idleListener)
        map = null
        style = null
        try { mapView.onDestroy() } catch (e: Exception) { Log.w(TAG, "MapView destroy", e) }
    }

    // Layer setup

    private fun installLayers(style: Style, palette: MapPalette) {
        val empty = FeatureCollection.fromFeatures(emptyList())
        style.addSource(GeoJsonSource(SRC_PARCELS, empty))
        style.addSource(GeoJsonSource(SRC_SOLD, empty))
        style.addSource(GeoJsonSource(SRC_BOUNDARY, empty))
        style.addSource(GeoJsonSource(SRC_DRAW, empty))

        // Insert below the first symbol layer so street names stay readable over the parcels, as in the mockup.
        val firstSymbol = style.layers.firstOrNull { it is SymbolLayer }?.id
        fun add(layer: Layer) { if (firstSymbol != null) style.addLayerBelow(layer, firstSymbol) else style.addLayer(layer) }

        add(
            BackgroundLayer(LAYER_DIM).withProperties(
                PropertyFactory.backgroundColor(palette.land),
                PropertyFactory.backgroundOpacity(if (palette.isDark) 0.62f else 0f),
            ),
        )
        add(
            FillLayer(LAYER_PARCEL_FILL, SRC_PARCELS).withProperties(
                PropertyFactory.fillColor(fillExpression(MapLayer.Score, palette)),
                PropertyFactory.fillOpacity(1f),
                PropertyFactory.fillAntialias(true),
            ),
        )
        add(
            LineLayer(LAYER_PARCEL_LINE, SRC_PARCELS).withProperties(
                PropertyFactory.lineColor(palette.land),
                PropertyFactory.lineWidth(2f),
                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            ),
        )
        add(
            FillLayer(LAYER_BOUNDARY_FILL, SRC_BOUNDARY).withProperties(
                PropertyFactory.fillColor(palette.bound),
                PropertyFactory.fillOpacity(0.05f),
            ).also { it.setFilter(Expression.eq(Expression.geometryType(), Expression.literal("Polygon"))) },
        )
        add(
            FillLayer(LAYER_DRAW_FILL, SRC_DRAW).withProperties(
                PropertyFactory.fillColor(palette.bound),
                PropertyFactory.fillOpacity(0.12f),
                PropertyFactory.visibility(Property.NONE),
            ).also { it.setFilter(Expression.eq(Expression.geometryType(), Expression.literal("Polygon"))) },
        )
        add(
            LineLayer(LAYER_BOUNDARY, SRC_BOUNDARY).withProperties(
                PropertyFactory.lineColor(palette.bound),
                PropertyFactory.lineWidth(2.5f),
                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            ).also { it.setFilter(Expression.eq(Expression.geometryType(), Expression.literal("LineString"))) },
        )
        add(
            LineLayer(LAYER_SELECTED, SRC_PARCELS).withProperties(
                PropertyFactory.lineColor(palette.ink),
                PropertyFactory.lineWidth(3.5f),
                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            ).also { it.setFilter(Expression.literal(false)) },
        )
        add(
            CircleLayer(LAYER_SOLD, SRC_SOLD).withProperties(
                PropertyFactory.circleColor(palette.dot),
                PropertyFactory.circleRadius(5f),
                PropertyFactory.circleStrokeColor(palette.land),
                PropertyFactory.circleStrokeWidth(2f),
            ),
        )
        add(
            LineLayer(LAYER_DRAW_LINE, SRC_DRAW).withProperties(
                PropertyFactory.lineColor(palette.bound),
                PropertyFactory.lineWidth(2.5f),
                PropertyFactory.lineDasharray(arrayOf(1.5f, 1.5f)),
                PropertyFactory.visibility(Property.NONE),
            ).also { it.setFilter(Expression.eq(Expression.geometryType(), Expression.literal("LineString"))) },
        )
        add(
            CircleLayer(LAYER_DRAW_POINTS, SRC_DRAW).withProperties(
                PropertyFactory.circleColor(palette.surface),
                PropertyFactory.circleRadius(6f),
                PropertyFactory.circleStrokeColor(palette.bound),
                PropertyFactory.circleStrokeWidth(2.5f),
                PropertyFactory.visibility(Property.NONE),
            ).also { it.setFilter(Expression.eq(Expression.geometryType(), Expression.literal("Point"))) },
        )
        appliedPalette = palette
        appliedLayer = MapLayer.Score
    }

    /** The fill color per map layer. Bands drive the Score layer; the others highlight one attribute against mapOut. */
    private fun fillExpression(layer: MapLayer, p: MapPalette): Expression = when (layer) {
        MapLayer.Score -> Expression.match(
            Expression.get(PROP_BAND),
            Expression.color(p.out),
            Expression.stop(0, Expression.color(p.bands[0])),
            Expression.stop(1, Expression.color(p.bands[1])),
            Expression.stop(2, Expression.color(p.bands[2])),
            Expression.stop(3, Expression.color(p.bands[3])),
            Expression.stop(4, Expression.color(p.bands[4])),
        )
        MapLayer.Residential -> highlight(PROP_RESIDENTIAL, p.bands[2], p.out)
        MapLayer.SoldIn12Months -> highlight(PROP_SOLD, p.bands[3], p.out)
        MapLayer.Permits -> highlight(PROP_PERMIT, p.dot, p.out)
    }

    private fun highlight(property: String, on: Int, off: Int): Expression = Expression.switchCase(
        Expression.eq(Expression.get(property), Expression.literal(1)),
        Expression.color(on),
        Expression.color(off),
    )

    // Applying state

    private fun applyNow(state: FarmMapState, palette: MapPalette) {
        val s = style ?: return
        val m = map ?: return
        try {
            if (palette != appliedPalette) restyle(s, palette)
            if (state.parcels !== appliedParcels && state.parcels != appliedParcels) {
                s.getSourceAs<GeoJsonSource>(SRC_PARCELS)?.setGeoJson(parcelCollection(state.parcels))
                s.getSourceAs<GeoJsonSource>(SRC_SOLD)?.setGeoJson(soldCollection(state.parcels))
                appliedParcels = state.parcels
            }
            if (state.layer != appliedLayer || palette != appliedPalette) {
                (s.getLayer(LAYER_PARCEL_FILL) as? FillLayer)?.setProperties(PropertyFactory.fillColor(fillExpression(state.layer, palette)))
                val dots = state.layer == MapLayer.Score || state.layer == MapLayer.SoldIn12Months
                s.getLayer(LAYER_SOLD)?.setProperties(PropertyFactory.visibility(if (dots) Property.VISIBLE else Property.NONE))
                appliedLayer = state.layer
            }
            if (state.selectedPin != appliedSelected) {
                val filter = state.selectedPin?.let { Expression.eq(Expression.get(PROP_PIN), Expression.literal(it)) } ?: Expression.literal(false)
                (s.getLayer(LAYER_SELECTED) as? LineLayer)?.setFilter(filter)
                appliedSelected = state.selectedPin
            }
            if (state.boundary != appliedBoundary) {
                s.getSourceAs<GeoJsonSource>(SRC_BOUNDARY)?.setGeoJson(boundaryCollection(state.boundary))
                appliedBoundary = state.boundary
            }
            val draw = state.drawing to state.drawPoints
            if (draw != appliedDraw) {
                s.getSourceAs<GeoJsonSource>(SRC_DRAW)?.setGeoJson(drawCollection(state.drawPoints))
                val visible = if (state.drawing || state.drawPoints.isNotEmpty()) Property.VISIBLE else Property.NONE
                for (id in listOf(LAYER_DRAW_FILL, LAYER_DRAW_LINE, LAYER_DRAW_POINTS)) s.getLayer(id)?.setProperties(PropertyFactory.visibility(visible))
                appliedDraw = draw
            }
            appliedPalette = palette
            moveCameraIfNeeded(m, state)
        } catch (e: Exception) {
            Log.w(TAG, "Applying farm map state failed", e)
        }
    }

    private fun restyle(s: Style, p: MapPalette) {
        s.getLayer(LAYER_DIM)?.setProperties(PropertyFactory.backgroundColor(p.land), PropertyFactory.backgroundOpacity(if (p.isDark) 0.62f else 0f))
        s.getLayer(LAYER_PARCEL_LINE)?.setProperties(PropertyFactory.lineColor(p.land))
        s.getLayer(LAYER_BOUNDARY_FILL)?.setProperties(PropertyFactory.fillColor(p.bound))
        s.getLayer(LAYER_BOUNDARY)?.setProperties(PropertyFactory.lineColor(p.bound))
        s.getLayer(LAYER_SELECTED)?.setProperties(PropertyFactory.lineColor(p.ink))
        s.getLayer(LAYER_SOLD)?.setProperties(PropertyFactory.circleColor(p.dot), PropertyFactory.circleStrokeColor(p.land))
        s.getLayer(LAYER_DRAW_FILL)?.setProperties(PropertyFactory.fillColor(p.bound))
        s.getLayer(LAYER_DRAW_LINE)?.setProperties(PropertyFactory.lineColor(p.bound))
        s.getLayer(LAYER_DRAW_POINTS)?.setProperties(PropertyFactory.circleColor(p.surface), PropertyFactory.circleStrokeColor(p.bound))
    }

    /** Cameras are compared and remembered in the state's (Watchdog) zoom; only the MapLibre calls see the converted value. */
    private fun moveCameraIfNeeded(m: MapLibreMap, state: FarmMapState) {
        val wanted = Triple(state.center.lat, state.center.lon, state.zoom)
        if (wanted == appliedCamera) return
        appliedCamera = wanted
        val current = m.cameraPosition
        val target = current.target
        val alreadyThere = target != null &&
            abs(target.latitude - state.center.lat) < 1e-6 &&
            abs(target.longitude - state.center.lon) < 1e-6 &&
            abs(MapZoom.fromMapLibre(current.zoom) - state.zoom) < 0.01
        if (!alreadyThere) {
            m.moveCamera(CameraUpdateFactory.newLatLngZoom(MapLatLng(state.center.lat, state.center.lon), MapZoom.toMapLibre(state.zoom)))
        }
    }

    // Interaction

    private fun onTap(point: MapLatLng): Boolean {
        val state = stateProvider() ?: return false
        val tapped = LatLng(point.latitude, point.longitude)
        if (state.drawing) {
            state.onDrawPoint?.invoke(tapped)
            return true
        }
        val m = map ?: return false
        val screen: PointF = m.projection.toScreenLocation(point)
        val features: List<Feature> = try { m.queryRenderedFeatures(screen, LAYER_PARCEL_FILL) } catch (e: Exception) { emptyList() }
        val pin = features.firstOrNull { it.hasProperty(PROP_PIN) }?.getStringProperty(PROP_PIN) ?: return false
        val parcel = state.parcels.firstOrNull { it.pin == pin } ?: return false
        state.onParcelTap(parcel)
        return true
    }

    private fun onIdle() {
        val state = stateProvider() ?: return
        val callback = state.onMapMoved ?: return
        val position = map?.cameraPosition ?: return
        val target = position.target ?: return
        val center = LatLng(target.latitude, target.longitude)
        // Reported back in the state's convention, so the Farm screen's "camera I supplied" check and its next
        // FarmMapState compare like with like.
        val zoom = MapZoom.fromMapLibre(position.zoom)
        appliedCamera = Triple(center.lat, center.lon, zoom)
        callback(center, zoom)
    }

    // GeoJSON

    private fun parcelCollection(parcels: List<MapParcel>): FeatureCollection {
        val features = parcels.mapNotNull { parcel ->
            val ring = closedRing(parcel.ring) ?: return@mapNotNull null
            Feature.fromGeometry(Polygon.fromLngLats(listOf(ring))).apply {
                addStringProperty(PROP_PIN, parcel.pin)
                addStringProperty(PROP_ADDRESS, parcel.address)
                addNumberProperty(PROP_SCORE, parcel.score ?: -1)
                addNumberProperty(PROP_BAND, ScoreBands.bandIndex(parcel.score) ?: -1)
                addNumberProperty(PROP_SOLD, if (parcel.soldInLast12Months) 1 else 0)
                addNumberProperty(PROP_PERMIT, if (parcel.permitInLast90Days) 1 else 0)
                addNumberProperty(PROP_RESIDENTIAL, if (parcel.residential) 1 else 0)
            }
        }
        return FeatureCollection.fromFeatures(features)
    }

    private fun soldCollection(parcels: List<MapParcel>): FeatureCollection {
        val features = parcels.filter { it.soldInLast12Months && it.ring.isNotEmpty() }.map { parcel ->
            val lat = parcel.ring.sumOf { it.lat } / parcel.ring.size
            val lon = parcel.ring.sumOf { it.lon } / parcel.ring.size
            Feature.fromGeometry(Point.fromLngLat(lon, lat)).apply { addStringProperty(PROP_PIN, parcel.pin) }
        }
        return FeatureCollection.fromFeatures(features)
    }

    /** The boundary as a Polygon (for the 5% fill) and a LineString (for the stroke); the layers filter by geometry type. */
    private fun boundaryCollection(boundary: List<LatLng>): FeatureCollection {
        val ring = closedRing(boundary) ?: return FeatureCollection.fromFeatures(emptyList())
        return FeatureCollection.fromFeatures(
            listOf(
                Feature.fromGeometry(Polygon.fromLngLats(listOf(ring))),
                Feature.fromGeometry(LineString.fromLngLats(ring)),
            ),
        )
    }

    private fun drawCollection(points: List<LatLng>): FeatureCollection {
        val features = ArrayList<Feature>()
        val coords = points.map { Point.fromLngLat(it.lon, it.lat) }
        coords.forEach { features.add(Feature.fromGeometry(it)) }
        if (coords.size >= 2) features.add(Feature.fromGeometry(LineString.fromLngLats(coords + coords.first())))
        closedRing(points)?.let { features.add(Feature.fromGeometry(Polygon.fromLngLats(listOf(it)))) }
        return FeatureCollection.fromFeatures(features)
    }

    /** A GeoJSON ring: at least three points, first repeated last. Null when there is nothing to draw. */
    private fun closedRing(points: List<LatLng>): List<Point>? {
        if (points.size < 3) return null
        val ring = points.map { Point.fromLngLat(it.lon, it.lat) }
        val first = ring.first()
        val last = ring.last()
        return if (first.latitude() == last.latitude() && first.longitude() == last.longitude()) ring else ring + first
    }
}
