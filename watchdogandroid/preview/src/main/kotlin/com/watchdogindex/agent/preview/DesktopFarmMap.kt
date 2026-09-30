package com.watchdogindex.agent.preview

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.ScoreBands
import com.watchdogindex.agent.core.model.calloutLine
import com.watchdogindex.agent.design.WatchdogColors
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.platform.FarmMapState
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sinh

/*
 * The desktop farm map: a Canvas drawing in the style of the approved mockup's map (Docs/mockup-css-to-compose.md
 * section 3.40) so the Farm screen's layout can be checked without MapLibre. Parcels are projected with Web
 * Mercator at the state's zoom around its centre; the street grid, the grey parcels around the farm and the
 * park block are derived from the parcels' own geometry (gaps between blocks are streets, the block pitch
 * continues outward), so nothing here is tied to one sample farm. Colours are the theme's map tokens.
 */

/** Web Mercator: world coordinates in [0, 1] and the pixel size of the world at a zoom level (256 dp tiles). */
object WebMercator {
    private const val MAX_LAT = 85.05112878

    fun worldX(lon: Double): Double = (lon + 180.0) / 360.0

    fun worldY(lat: Double): Double {
        val s = sin(lat.coerceIn(-MAX_LAT, MAX_LAT) * PI / 180.0)
        return 0.5 - ln((1 + s) / (1 - s)) / (4 * PI)
    }

    fun lonOf(worldX: Double): Double = worldX * 360.0 - 180.0

    fun latOf(worldY: Double): Double = atan(sinh(PI * (1 - 2 * worldY))) * 180.0 / PI

    /** Pixels across the whole world at [zoom] on a screen of [density] px per dp. */
    fun worldPixels(zoom: Double, density: Float): Double = 256.0 * 2.0.pow(zoom) * density

    /** Ground metres per screen pixel at [lat]. */
    fun metresPerPixel(lat: Double, zoom: Double, density: Float): Double =
        156_543.03392 * cos(lat * PI / 180.0) / (2.0.pow(zoom) * density)
}

/** Screen projection for one frame: Mercator at [zoom] around [center], shifted by the current [pan] in pixels. */
class MapProjection(
    val center: LatLng,
    val zoom: Double,
    val density: Float,
    val size: Size,
    val pan: Offset = Offset.Zero,
) {
    private val scale = WebMercator.worldPixels(zoom, density)
    private val cx = WebMercator.worldX(center.lon)
    private val cy = WebMercator.worldY(center.lat)
    val metresPerPixel: Double = WebMercator.metresPerPixel(center.lat, zoom, density)

    fun toScreen(p: LatLng): Offset = Offset(
        ((WebMercator.worldX(p.lon) - cx) * scale).toFloat() + size.width / 2f + pan.x,
        ((WebMercator.worldY(p.lat) - cy) * scale).toFloat() + size.height / 2f + pan.y,
    )

    fun toLatLng(s: Offset): LatLng = LatLng(
        lat = WebMercator.latOf(cy + (s.y - size.height / 2f - pan.y) / scale),
        lon = WebMercator.lonOf(cx + (s.x - size.width / 2f - pan.x) / scale),
    )

    /** The geographic centre currently in the middle of the screen (differs from [center] while panned). */
    fun visibleCenter(): LatLng = toLatLng(Offset(size.width / 2f, size.height / 2f))
}

/**
 * A metre frame around [origin] rotated by [thetaRad] (counter-clockwise from east) so the farm's street grid
 * is axis-aligned: local x runs along the streets, local y points to the north-ish side. Equirectangular is
 * exact enough over a neighbourhood.
 */
class LocalFrame(val origin: LatLng, val thetaRad: Double) {
    private val mPerDegLat = 111_320.0
    private val mPerDegLon = mPerDegLat * cos(origin.lat * PI / 180.0)
    private val c = cos(thetaRad)
    private val s = sin(thetaRad)

    fun toLocal(p: LatLng): Offset {
        val ex = (p.lon - origin.lon) * mPerDegLon
        val ny = (p.lat - origin.lat) * mPerDegLat
        return Offset((ex * c + ny * s).toFloat(), (-ex * s + ny * c).toFloat())
    }

    fun toLatLng(l: Offset): LatLng {
        val ex = l.x * c - l.y * s
        val ny = l.x * s + l.y * c
        return LatLng(origin.lat + ny / mPerDegLat, origin.lon + ex / mPerDegLon)
    }
}

/** A street label: [name] drawn along a street that runs horizontally (axis y) or vertically (axis x) in the local frame. */
data class StreetLabel(val name: String, val horizontal: Boolean, val line: Float, val along: Float)

/**
 * The street pattern of a farm in its [frame]: interior and perimeter street centre lines, the block pitch used
 * to continue the grid outward, the typical parcel size and where the street names go. Derived once from a full
 * parcel set and reused while a layer shows only some parcels.
 */
class StreetGrid(
    val frame: LocalFrame,
    /** Street width in metres (the gap between neighbouring blocks). */
    val streetWidth: Float,
    /** Local x of every north-south street through the farm, ascending, perimeter included. */
    val xLines: List<Float>,
    /** Local y of every east-west street through the farm, ascending, perimeter included. */
    val yLines: List<Float>,
    val pitchX: Float,
    val pitchY: Float,
    val parcelWidth: Float,
    val parcelDepth: Float,
    /** Local bounds of the farm's parcels. */
    val farmBounds: Rect,
    val boundary: List<Offset>,
    val labels: List<StreetLabel>,
) {
    /** Street lines (interior ones first, then the pattern continued outward) covering [range] of local x. */
    fun xLinesCovering(range: ClosedFloatingPointRange<Float>): List<Float> = extend(xLines, pitchX, range)

    fun yLinesCovering(range: ClosedFloatingPointRange<Float>): List<Float> = extend(yLines, pitchY, range)

    private fun extend(lines: List<Float>, pitch: Float, range: ClosedFloatingPointRange<Float>): List<Float> {
        if (lines.isEmpty() || pitch <= 0f) return emptyList()
        val out = ArrayList<Float>()
        var v = lines.first() - pitch
        while (v > range.start - pitch) { out += v; v -= pitch }
        out.reverse()
        out += lines
        v = lines.last() + pitch
        while (v < range.endInclusive + pitch) { out += v; v += pitch }
        return out
    }

    /** True when [p] (local) lies inside the farm boundary. */
    fun insideBoundary(p: Offset): Boolean = pointInPolygon(p, boundary)

    companion object {
        /** How much of the boundary the parcels must cover for a parcel list to count as the full farm. */
        const val DENSE_COVERAGE = 0.35

        /** Builds the grid from a full parcel set, or null when the parcels are too few or too sparse to trust. */
        fun derive(parcels: List<MapParcel>, boundary: List<LatLng>): StreetGrid? {
            if (parcels.size < 4) return null
            val origin = polygonCentroid(boundary) ?: ringCentroid(parcels.first().ring)
            val frame = LocalFrame(origin, gridAngle(parcels, LocalFrame(origin, 0.0)))

            val rects = parcels.map { p -> boundsOf(p.ring.map(frame::toLocal)) }
            val widths = rects.map { it.width }.sorted()
            val depths = rects.map { it.height }.sorted()
            val parcelWidth = widths[widths.size / 2]
            val parcelDepth = depths[depths.size / 2]
            if (parcelWidth <= 0f || parcelDepth <= 0f) return null

            val boundaryLocal = boundary.map(frame::toLocal)
            val boundaryArea = polygonArea(boundaryLocal)
            val parcelArea = rects.sumOf { (it.width * it.height).toDouble() }
            if (boundaryArea > 0 && parcelArea / boundaryArea < DENSE_COVERAGE) return null

            val farmBounds = boundsOf(rects.flatMap { listOf(it.topLeft, it.bottomRight) })
            val xSpans = mergeSpans(rects.map { it.left to it.right }, parcelWidth * 0.08f + 0.3f)
            val ySpans = mergeSpans(rects.map { it.top to it.bottom }, parcelDepth * 0.08f + 0.3f)
            val gaps = (spanGaps(xSpans) + spanGaps(ySpans)).sorted()
            val streetWidth = if (gaps.isNotEmpty()) gaps[gaps.size / 2] else DEFAULT_STREET_M
            val xLines = streetLines(xSpans, streetWidth)
            val yLines = streetLines(ySpans, streetWidth)
            val pitchX = medianOrDefault(xSpans.map { it.second - it.first }, parcelWidth * 5f) + streetWidth
            val pitchY = medianOrDefault(ySpans.map { it.second - it.first }, parcelDepth * 2f) + streetWidth

            val labels = deriveLabels(parcels, rects, xLines, yLines, streetWidth)
            return StreetGrid(frame, streetWidth, xLines, yLines, pitchX, pitchY, parcelWidth, parcelDepth, farmBounds, boundaryLocal, labels)
        }

        private const val DEFAULT_STREET_M = 12f

        /**
         * The street grid's rotation, counter-clockwise from east in (-45°, 45°]: a length-weighted circular mean
         * of every parcel edge with the 90° symmetry of a rectangular grid folded in (angles are multiplied by
         * four before averaging). One edge is not enough: coordinates rounded to a metre or so tilt a single
         * 18 m edge by a few tenths of a degree, and across a 700 m farm that shears the blocks by metres.
         */
        fun gridAngle(parcels: List<MapParcel>, plain: LocalFrame): Double {
            var sumSin = 0.0
            var sumCos = 0.0
            for (parcel in parcels) {
                val ring = parcel.ring.map(plain::toLocal)
                for (i in 0 until ring.size - 1) {
                    val e = ring[i + 1] - ring[i]
                    val length = e.getDistance().toDouble()
                    if (length <= 0.0) continue
                    val folded = 4.0 * atan2(e.y.toDouble(), e.x.toDouble())
                    sumSin += length * sin(folded)
                    sumCos += length * cos(folded)
                }
            }
            if (sumSin == 0.0 && sumCos == 0.0) return 0.0
            var theta = atan2(sumSin, sumCos) / 4.0
            theta -= (theta / (PI / 2)).roundToInt() * (PI / 2)
            return theta
        }

        private fun medianOrDefault(values: List<Float>, default: Float): Float {
            if (values.isEmpty()) return default
            val s = values.sorted()
            return s[s.size / 2]
        }

        /** Merges overlapping or touching intervals (within [eps]) and returns them ascending. */
        fun mergeSpans(spans: List<Pair<Float, Float>>, eps: Float): List<Pair<Float, Float>> {
            val sorted = spans.sortedBy { it.first }
            val out = ArrayList<Pair<Float, Float>>()
            for (s in sorted) {
                val last = out.lastOrNull()
                if (last != null && s.first <= last.second + eps) {
                    out[out.lastIndex] = last.first to max(last.second, s.second)
                } else {
                    out += s
                }
            }
            return out
        }

        private fun spanGaps(spans: List<Pair<Float, Float>>): List<Float> =
            spans.zipWithNext { a, b -> b.first - a.second }.filter { it > 0f }

        /**
         * Street centre lines for merged block spans: one in each gap that is about one street wide, one along
         * each edge of a wider gap (open land between), and one along the outside of the first and last block.
         */
        private fun streetLines(spans: List<Pair<Float, Float>>, streetWidth: Float): List<Float> {
            if (spans.isEmpty()) return emptyList()
            val half = streetWidth / 2f
            val out = ArrayList<Float>()
            out += spans.first().first - half
            for ((a, b) in spans.zipWithNext()) {
                val gap = b.first - a.second
                if (gap <= streetWidth * 1.6f) {
                    out += (a.second + b.first) / 2f
                } else {
                    out += a.second + half
                    out += b.first - half
                }
            }
            out += spans.last().second + half
            return out
        }

        /**
         * Street names from the parcels' addresses: each parcel fronts the street its number belongs to, so the
         * street line is the block edge (top or bottom, left or right) of that parcel plus half a street, and
         * the value most parcels of a street agree on, that is also a real street line, is where the name goes.
         */
        private fun deriveLabels(
            parcels: List<MapParcel>,
            rects: List<Rect>,
            xLines: List<Float>,
            yLines: List<Float>,
            streetWidth: Float,
        ): List<StreetLabel> {
            val half = streetWidth / 2f
            val tolerance = max(streetWidth * 0.5f, 1f)
            val byStreet = HashMap<String, MutableList<Rect>>()
            parcels.forEachIndexed { i, p ->
                val name = streetNameOf(p.address) ?: return@forEachIndexed
                byStreet.getOrPut(name) { ArrayList() } += rects[i]
            }
            fun nearestLine(lines: List<Float>, v: Float): Float? = lines.minByOrNull { abs(it - v) }?.takeIf { abs(it - v) <= tolerance }

            val out = ArrayList<StreetLabel>()
            for ((name, list) in byStreet) {
                if (list.size < 3) continue
                val yVotes = HashMap<Float, Int>()
                val xVotes = HashMap<Float, Int>()
                for (r in list) {
                    // Local y grows northward, so the street "above" a parcel is at its bottom edge plus half a street
                    // in screen terms; both edges are tried and only real street lines collect votes.
                    listOf(r.top - half, r.bottom + half).forEach { v -> nearestLine(yLines, v)?.let { yVotes[it] = (yVotes[it] ?: 0) + 1 } }
                    listOf(r.left - half, r.right + half).forEach { v -> nearestLine(xLines, v)?.let { xVotes[it] = (xVotes[it] ?: 0) + 1 } }
                }
                val bestY = yVotes.maxByOrNull { it.value }
                val bestX = xVotes.maxByOrNull { it.value }
                val horizontal = (bestY?.value ?: 0) >= (bestX?.value ?: 0)
                val best = (if (horizontal) bestY else bestX) ?: continue
                if (best.value < list.size * 0.6) continue
                val centers = list.map { if (horizontal) it.center.x else it.center.y }.sorted()
                out += StreetLabel(name, horizontal, best.key, centers[centers.size / 2])
            }
            return out.sortedBy { it.line }
        }

        /** "36 Birchwood Dr" -> "Birchwood Dr"; null when the address has no leading house number. */
        fun streetNameOf(address: String): String? {
            val trimmed = address.trim()
            val space = trimmed.indexOf(' ')
            if (space <= 0) return null
            val number = trimmed.substring(0, space)
            if (number.none { it.isDigit() }) return null
            return trimmed.substring(space + 1).trim().ifEmpty { null }
        }

        fun boundsOf(points: List<Offset>): Rect {
            var l = Float.POSITIVE_INFINITY; var t = Float.POSITIVE_INFINITY
            var r = Float.NEGATIVE_INFINITY; var b = Float.NEGATIVE_INFINITY
            for (p in points) { l = min(l, p.x); t = min(t, p.y); r = max(r, p.x); b = max(b, p.y) }
            return Rect(l, t, r, b)
        }

        fun ringCentroid(ring: List<LatLng>): LatLng {
            val pts = if (ring.size > 1 && ring.first() == ring.last()) ring.dropLast(1) else ring
            return LatLng(pts.sumOf { it.lat } / pts.size, pts.sumOf { it.lon } / pts.size)
        }

        fun polygonCentroid(ring: List<LatLng>): LatLng? = if (ring.size >= 3) ringCentroid(ring) else null

        /** Shoelace area in local units. */
        fun polygonArea(points: List<Offset>): Double {
            if (points.size < 3) return 0.0
            var sum = 0.0
            for (i in points.indices) {
                val a = points[i]
                val b = points[(i + 1) % points.size]
                sum += a.x.toDouble() * b.y - b.x.toDouble() * a.y
            }
            return abs(sum) / 2
        }

        /** Even-odd ray casting. */
        fun pointInPolygon(p: Offset, polygon: List<Offset>): Boolean {
            if (polygon.size < 3) return false
            var inside = false
            var j = polygon.lastIndex
            for (i in polygon.indices) {
                val a = polygon[i]
                val b = polygon[j]
                if ((a.y > p.y) != (b.y > p.y)) {
                    val x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x
                    if (p.x < x) inside = !inside
                }
                j = i
            }
            return inside
        }
    }
}

/** Keeps the last full-farm grid for a boundary so the Sold and Permits layers, which list fewer parcels, still get streets. */
private class GridMemory {
    private var grid: StreetGrid? = null
    private var boundary: List<LatLng>? = null

    fun update(parcels: List<MapParcel>, boundary: List<LatLng>): StreetGrid? {
        if (this.boundary != boundary) { grid = null; this.boundary = boundary }
        StreetGrid.derive(parcels, boundary)?.let { grid = it }
        return grid
    }
}

/** How a parcel is painted on a layer: its score band, or the grey "outside" tone when the layer hides it. */
fun parcelBand(parcel: MapParcel, layer: MapLayer): Int? {
    val band = ScoreBands.bandIndex(parcel.score)
    return when (layer) {
        MapLayer.Score -> band
        MapLayer.Residential -> if (parcel.residential) band else null
        MapLayer.SoldIn12Months -> if (parcel.soldInLast12Months) band else null
        MapLayer.Permits -> if (parcel.permitInLast90Days) band else null
    }
}

/** True when the layer shows the gold sold dot on this parcel. */
fun showsSoldDot(parcel: MapParcel, layer: MapLayer): Boolean =
    parcel.soldInLast12Months && (layer == MapLayer.Score || layer == MapLayer.SoldIn12Months)

/**
 * The map composable behind [DesktopPlatformServices.FarmMap]. Drag pans (reported through
 * [FarmMapState.onMapMoved] when the drag ends), a tap selects the parcel under the pointer, and while
 * [FarmMapState.drawing] taps add vertices to the new area instead.
 *
 * [contentDescription] replaces the layer-derived description when the caller knows more, such as the farm's
 * name (the design's semantics line: "Farm map of Birchwood Park with parcels colored by Watchdog Score").
 * [parkLabel] names the decorative park block the way the mockup does ("Birchwood Park"). It is drawn text only
 * and comes from no data, so it stays null unless the farm on screen is known to be the mockup's.
 */
@Composable
fun DesktopFarmMap(
    state: FarmMapState,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    parkLabel: String? = null,
) {
    val colors = WatchdogTheme.colors
    val type = WatchdogTheme.type
    val measurer = rememberTextMeasurer()
    val memory = remember { GridMemory() }
    val grid = remember(memory, state.parcels, state.boundary) { memory.update(state.parcels, state.boundary) }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    // Local pan in pixels on top of the state's centre; resets when the owner moves the map itself.
    var pan by remember(state.center, state.zoom) { mutableStateOf(Offset.Zero) }

    val labelStyle = type.chip.copy(letterSpacing = 0.24.sp)
    // The mockup's park label: 12 sp bold without the street labels' tracking.
    val parkLabelStyle = type.chip
    val calloutTitle = type.supporting.copy(fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 17.sp)
    val calloutBody = type.caption.copy(fontWeight = FontWeight.SemiBold, lineHeight = 16.sp)

    val soldCount = state.parcels.count { it.soldInLast12Months }
    val permitCount = state.parcels.count { it.permitInLast90Days }
    // Says what the layer shows, so a screen reader hears what the eye sees: the grey homes of the Sold and
    // Permits layers are not "colored by Watchdog Score", and the gold dots only appear on Score and Sold.
    val description = contentDescription ?: when (state.layer) {
        MapLayer.Score -> "Farm map with parcels colored by Watchdog Score" +
            if (soldCount > 0) ", $soldCount sold in the last 12 months" else ""
        MapLayer.Residential -> "Farm map with homes colored by Watchdog Score"
        MapLayer.SoldIn12Months -> "Farm map highlighting $soldCount homes sold in the last 12 months"
        MapLayer.Permits -> "Farm map highlighting $permitCount homes with a permit in the last 90 days"
    }

    // Pointer handlers and the draw pass must agree on the projection, so both build it from the same inputs;
    // [densityScale] is the px-per-dp of the scope that asks (PointerInputScope and DrawScope are both a Density).
    fun projectionAt(densityScale: Float): MapProjection = MapProjection(
        center = state.center,
        zoom = state.zoom,
        density = densityScale,
        size = Size(canvasSize.width.toFloat(), canvasSize.height.toFloat()),
        pan = pan,
    )

    Canvas(
        modifier = modifier
            .onSizeChanged { canvasSize = it }
            // Both descriptions end on the same layout node (Canvas adds none of its own) and the outer modifier
            // is applied last, so a description the Farm screen sets on the modifier it passes replaces this one.
            .semantics { this.contentDescription = description }
            .pointerInput(state.parcels, state.drawing, state.onParcelTap, state.onDrawPoint) {
                detectTapGestures { tap ->
                    val p = projectionAt(density)
                    if (state.drawing) {
                        state.onDrawPoint?.invoke(p.toLatLng(tap))
                    } else {
                        val hit = state.parcels.lastOrNull { parcel ->
                            StreetGrid.pointInPolygon(tap, parcel.ring.map(p::toScreen))
                        }
                        if (hit != null) state.onParcelTap(hit)
                    }
                }
            }
            .pointerInput(state.onMapMoved, state.center, state.zoom) {
                detectDragGestures(
                    onDragEnd = {
                        val moved = state.onMapMoved
                        if (moved != null) moved(projectionAt(density).visibleCenter(), state.zoom)
                    },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        pan += dragAmount
                    },
                )
            },
    ) {
        drawFarmMap(state, grid, projectionAt(density), colors, measurer, labelStyle, calloutTitle, calloutBody, parkLabel, parkLabelStyle)
    }
}

private fun DrawScope.drawFarmMap(
    state: FarmMapState,
    grid: StreetGrid?,
    p: MapProjection,
    colors: WatchdogColors,
    measurer: TextMeasurer,
    labelStyle: TextStyle,
    calloutTitle: TextStyle,
    calloutBody: TextStyle,
    parkLabel: String?,
    parkLabelStyle: TextStyle,
) {
    drawRect(colors.mapLand)
    val landStroke = 2.dp.toPx()

    if (grid != null) drawStreetsAndSurroundings(grid, p, colors, landStroke, parkLabel, measurer, parkLabelStyle)

    // Farm parcels from their real rings.
    val rings = state.parcels.map { parcel -> parcel.ring.map(p::toScreen) }
    state.parcels.forEachIndexed { i, parcel ->
        val ring = rings[i]
        val band = parcelBand(parcel, state.layer)
        val fill = if (band != null) colors.mapBands[band] else colors.mapOut
        val path = polygonPath(ring)
        drawPath(path, fill)
        drawPath(path, colors.mapLand, style = Stroke(width = min(landStroke, shortestEdge(ring) * 0.2f), join = StrokeJoin.Round))
    }

    // Farm boundary: 2.5 dp line with a 5% tint inside.
    if (state.boundary.size >= 3) {
        val boundaryPath = polygonPath(state.boundary.map(p::toScreen))
        drawPath(boundaryPath, colors.mapBound, alpha = 0.05f)
        drawPath(boundaryPath, colors.mapBound, style = Stroke(width = 2.5.dp.toPx(), join = StrokeJoin.Round))
    }

    // Gold dots for homes sold in the last 12 months.
    val dotRadius = 5.dp.toPx()
    state.parcels.forEachIndexed { i, parcel ->
        if (!showsSoldDot(parcel, state.layer)) return@forEachIndexed
        val c = centroid(rings[i])
        drawCircle(colors.mapDot, dotRadius, c)
        drawCircle(colors.mapLand, dotRadius, c, style = Stroke(width = landStroke))
    }

    // Selected parcel outline.
    val selectedIndex = state.selectedPin?.let { pin -> state.parcels.indexOfFirst { it.pin == pin } } ?: -1
    if (selectedIndex >= 0) {
        drawPath(polygonPath(rings[selectedIndex]), colors.ink, style = Stroke(width = 3.5.dp.toPx(), join = StrokeJoin.Round))
    }

    if (grid != null) drawStreetLabels(grid, p, colors, measurer, labelStyle)

    if (state.drawing) drawNewArea(state.drawPoints.map(p::toScreen), colors)

    if (selectedIndex >= 0) {
        drawCallout(state.parcels[selectedIndex], rings[selectedIndex], colors, measurer, calloutTitle, calloutBody)
    }
}

/** Roads on the block grid, grey parcels outside the farm, and a park block east of it, named when [parkLabel] is given. */
private fun DrawScope.drawStreetsAndSurroundings(
    grid: StreetGrid,
    p: MapProjection,
    colors: WatchdogColors,
    landStroke: Float,
    parkLabel: String?,
    measurer: TextMeasurer,
    parkLabelStyle: TextStyle,
) {
    val frame = grid.frame
    // Visible area in the local frame, padded by a block so partially visible blocks are drawn whole.
    val corners = listOf(Offset.Zero, Offset(size.width, 0f), Offset(size.width, size.height), Offset(0f, size.height))
        .map { frame.toLocal(p.toLatLng(it)) }
    val view = StreetGrid.boundsOf(corners)
    val xs = grid.xLinesCovering((view.left - grid.pitchX)..(view.right + grid.pitchX))
    val ys = grid.yLinesCovering((view.top - grid.pitchY)..(view.bottom + grid.pitchY))
    if (xs.size < 2 || ys.size < 2) return
    fun screen(x: Float, y: Float): Offset = p.toScreen(frame.toLatLng(Offset(x, y)))

    // Parcel pixel size decides how much detail is worth drawing.
    val pxPerMetre = (1.0 / p.metresPerPixel).toFloat()
    val parcelPx = min(grid.parcelWidth, grid.parcelDepth) * pxPerMetre
    val casingWidth = grid.streetWidth * pxPerMetre
    val roadWidth = casingWidth * 10f / 14f
    val half = grid.streetWidth / 2f
    val x0 = xs.first(); val x1 = xs.last(); val y0 = ys.first(); val y1 = ys.last()

    // Park: the block column just east of the farm, the two block rows nearest the farm's middle.
    val eastLines = xs.filter { it > grid.farmBounds.right + half * 0.5f }
    val park: Rect? = if (eastLines.size >= 2) {
        val rowLines = ys.zipWithNext()
        val middle = grid.farmBounds.center.y
        val nearest = rowLines.sortedBy { abs((it.first + it.second) / 2f - middle) }.take(2)
        if (nearest.size == 2) {
            val top = min(nearest[0].first, nearest[1].first) + half
            val bottom = max(nearest[0].second, nearest[1].second) - half
            Rect(eastLines[0] + half, top, eastLines[1] - half, bottom)
        } else null
    } else null

    // Casings, then roads, so crossings read as one surface.
    for (x in xs) drawLine(colors.mapCase, screen(x, y0), screen(x, y1), strokeWidth = casingWidth, cap = StrokeCap.Butt)
    for (y in ys) drawLine(colors.mapCase, screen(x0, y), screen(x1, y), strokeWidth = casingWidth, cap = StrokeCap.Butt)
    for (x in xs) drawLine(colors.mapRoad, screen(x, y0), screen(x, y1), strokeWidth = roadWidth, cap = StrokeCap.Butt)
    for (y in ys) drawLine(colors.mapRoad, screen(x0, y), screen(x1, y), strokeWidth = roadWidth, cap = StrokeCap.Butt)

    if (park != null) {
        drawLocalRoundRect(park, frame, p, colors.mapPark, 6.dp.toPx())
        if (parkLabel != null) drawParkLabel(parkLabel, park, frame, p, colors, measurer, parkLabelStyle)
    }

    // Grey parcels in every block outside the farm.
    val cols = ((grid.pitchX - grid.streetWidth) / grid.parcelWidth).roundToInt().coerceAtLeast(1)
    val rows = ((grid.pitchY - grid.streetWidth) / grid.parcelDepth).roundToInt().coerceAtLeast(1)
    val stroke = min(landStroke, parcelPx * 0.2f)
    for ((xa, xb) in xs.zipWithNext()) {
        for ((ya, yb) in ys.zipWithNext()) {
            val block = Rect(xa + half, ya + half, xb - half, yb - half)
            if (block.width <= 0f || block.height <= 0f) continue
            if (grid.insideBoundary(block.center)) continue
            if (park != null && park.overlaps(block)) continue
            if (!block.overlaps(view)) continue
            if (parcelPx < 3f) {
                drawLocalQuad(block, frame, p, colors.mapOut, null, 0f)
                continue
            }
            val cw = block.width / cols
            val ch = block.height / rows
            for (ci in 0 until cols) for (ri in 0 until rows) {
                val cell = Rect(block.left + ci * cw, block.top + ri * ch, block.left + (ci + 1) * cw, block.top + (ri + 1) * ch)
                drawLocalQuad(cell, frame, p, colors.mapOut, colors.mapLand, stroke)
            }
        }
    }
}

private fun DrawScope.drawLocalQuad(r: Rect, frame: LocalFrame, p: MapProjection, fill: Color, strokeColor: Color?, stroke: Float) {
    val path = polygonPath(
        listOf(
            p.toScreen(frame.toLatLng(Offset(r.left, r.top))),
            p.toScreen(frame.toLatLng(Offset(r.right, r.top))),
            p.toScreen(frame.toLatLng(Offset(r.right, r.bottom))),
            p.toScreen(frame.toLatLng(Offset(r.left, r.bottom))),
        ),
    )
    drawPath(path, fill)
    if (strokeColor != null && stroke > 0f) drawPath(path, strokeColor, style = Stroke(width = stroke, join = StrokeJoin.Round))
}

/** A rounded rectangle given in the local frame: drawn axis-aligned after rotating the canvas to the frame's angle. */
private fun DrawScope.drawLocalRoundRect(r: Rect, frame: LocalFrame, p: MapProjection, fill: Color, radius: Float) {
    val centerScreen = p.toScreen(frame.toLatLng(r.center))
    val right = p.toScreen(frame.toLatLng(Offset(r.center.x + 1f, r.center.y)))
    val up = p.toScreen(frame.toLatLng(Offset(r.center.x, r.center.y + 1f)))
    val pxPerMetre = (right - centerScreen).getDistance()
    val angle = atan2((right - centerScreen).y, (right - centerScreen).x) * 180f / PI.toFloat()
    val w = r.width * pxPerMetre
    val h = r.height * (up - centerScreen).getDistance()
    rotate(degrees = angle, pivot = centerScreen) {
        drawRoundRect(fill, topLeft = Offset(centerScreen.x - w / 2f, centerScreen.y - h / 2f), size = Size(w, h), cornerRadius = CornerRadius(radius, radius))
    }
}

/**
 * The park's name in the mint ink, centred in the block and turned a quarter further than the grid so it reads
 * top to bottom along the block's long side, as the mockup's `rotate(90)` label does. Skipped when the block is
 * too small for the text at this zoom rather than spilling onto the streets.
 */
private fun DrawScope.drawParkLabel(
    text: String,
    park: Rect,
    frame: LocalFrame,
    p: MapProjection,
    colors: WatchdogColors,
    measurer: TextMeasurer,
    style: TextStyle,
) {
    val center = p.toScreen(frame.toLatLng(park.center))
    val east = p.toScreen(frame.toLatLng(Offset(park.center.x + 1f, park.center.y))) - center
    val pxPerMetre = east.getDistance()
    val angle = atan2(east.y, east.x) * 180f / PI.toFloat()
    val layout = measurer.measure(text = text, style = style)
    val inset = 6.dp.toPx()
    // After the extra quarter turn the text's length lies along the park's local height.
    if (layout.size.width > park.height * pxPerMetre - 2 * inset || layout.size.height > park.width * pxPerMetre - 2 * inset) return
    rotate(degrees = angle + 90f, pivot = center) {
        drawText(layout, color = colors.mintInk, topLeft = Offset(center.x - layout.size.width / 2f, center.y - layout.size.height / 2f))
    }
}

/** Street names along their streets, 12 sp bold in the label colour with a road-coloured halo, rotated with the grid. */
private fun DrawScope.drawStreetLabels(grid: StreetGrid, p: MapProjection, colors: WatchdogColors, measurer: TextMeasurer, style: TextStyle) {
    val frame = grid.frame
    val halo = Stroke(width = 4.dp.toPx(), join = StrokeJoin.Round)
    val margin = 8.dp.toPx()
    for (label in grid.labels) {
        val local = if (label.horizontal) Offset(label.along, label.line) else Offset(label.line, label.along)
        // Reading direction: along +x for east-west streets, downward (-y, south) for north-south ones.
        val ahead = if (label.horizontal) Offset(local.x + 1f, local.y) else Offset(local.x, local.y - 1f)
        val center = p.toScreen(frame.toLatLng(local))
        val dir = p.toScreen(frame.toLatLng(ahead)) - center
        if (center.x < -margin || center.y < -margin || center.x > size.width + margin || center.y > size.height + margin) continue
        val layout = measurer.measure(text = label.name, style = style)
        val topLeft = Offset(center.x - layout.size.width / 2f, center.y - layout.size.height / 2f)
        val angle = atan2(dir.y, dir.x) * 180f / PI.toFloat()
        rotate(degrees = angle, pivot = center) {
            drawText(layout, color = colors.mapRoad, topLeft = topLeft, drawStyle = halo)
            drawText(layout, color = colors.mapLabel, topLeft = topLeft)
        }
    }
}

/** The area being drawn: dashed outline, vertex handles, and a tint once it has three points. */
private fun DrawScope.drawNewArea(points: List<Offset>, colors: WatchdogColors) {
    if (points.isEmpty()) return
    val stroke = 2.5.dp.toPx()
    if (points.size >= 3) drawPath(polygonPath(points), colors.mapBound, alpha = 0.08f)
    if (points.size >= 2) {
        val path = Path().apply {
            moveTo(points[0].x, points[0].y)
            for (i in 1 until points.size) lineTo(points[i].x, points[i].y)
        }
        drawPath(
            path,
            colors.mapBound,
            style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10.dp.toPx(), 6.dp.toPx()))),
        )
    }
    val r = 5.dp.toPx()
    for (pt in points) {
        drawCircle(colors.surface, r, pt)
        drawCircle(colors.mapBound, r, pt, style = Stroke(width = 2.dp.toPx()))
    }
}

/** The callout above the selected parcel: address in 13 sp 800, core's `MapParcel.calloutLine()` ("Score 72 · tax $11,284") in 12 sp 600. */
private fun DrawScope.drawCallout(
    parcel: MapParcel,
    ring: List<Offset>,
    colors: WatchdogColors,
    measurer: TextMeasurer,
    titleStyle: TextStyle,
    bodyStyle: TextStyle,
) {
    val title = measurer.measure(text = parcel.address, style = titleStyle)
    val body = measurer.measure(text = parcel.calloutLine(), style = bodyStyle)
    val padX = 14.dp.toPx()
    val width = max(150.dp.toPx(), max(title.size.width, body.size.width) + padX * 2)
    val height = 46.dp.toPx()
    val pointer = 8.dp.toPx()
    val anchorX = centroid(ring).x
    val top = ring.minOf { it.y }
    val bottom = top - 6.dp.toPx() - pointer
    val edge = 8.dp.toPx()
    val left = (anchorX - width / 2f).coerceIn(edge, max(edge, size.width - width - edge))
    val boxTop = bottom - height
    val radius = CornerRadius(14.dp.toPx(), 14.dp.toPx())
    val line = 1.dp.toPx()

    drawRoundRect(colors.surface, topLeft = Offset(left, boxTop), size = Size(width, height), cornerRadius = radius)
    drawRoundRect(colors.line, topLeft = Offset(left, boxTop), size = Size(width, height), cornerRadius = radius, style = Stroke(width = line))
    val tip = Path().apply {
        moveTo(anchorX - pointer, bottom - line)
        lineTo(anchorX, bottom + pointer)
        lineTo(anchorX + pointer, bottom - line)
        close()
    }
    drawPath(tip, colors.surface)
    drawPath(
        Path().apply { moveTo(anchorX - pointer, bottom); lineTo(anchorX, bottom + pointer); lineTo(anchorX + pointer, bottom) },
        colors.line,
        style = Stroke(width = line),
    )
    val textHeight = title.size.height + body.size.height
    val textTop = boxTop + (height - textHeight) / 2f
    drawText(title, color = colors.ink, topLeft = Offset(left + padX, textTop))
    drawText(body, color = colors.muted, topLeft = Offset(left + padX, textTop + title.size.height))
}

private fun polygonPath(points: List<Offset>): Path = Path().apply {
    if (points.isEmpty()) return@apply
    moveTo(points[0].x, points[0].y)
    for (i in 1 until points.size) lineTo(points[i].x, points[i].y)
    close()
}

private fun centroid(ring: List<Offset>): Offset {
    val pts = if (ring.size > 1 && ring.first() == ring.last()) ring.dropLast(1) else ring
    if (pts.isEmpty()) return Offset.Zero
    var x = 0f; var y = 0f
    for (pt in pts) { x += pt.x; y += pt.y }
    return Offset(x / pts.size, y / pts.size)
}

private fun shortestEdge(ring: List<Offset>): Float {
    var best = Float.POSITIVE_INFINITY
    for (i in 0 until ring.size - 1) {
        val d = (ring[i + 1] - ring[i]).getDistance()
        if (d > 0.01f) best = min(best, d)
    }
    return if (best.isFinite()) best else 0f
}
