package com.watchdogindex.agent.ui.screens.farm

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.MapZoom
import com.watchdogindex.agent.core.model.ScoreBands
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.calloutLine
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.FarmMapState
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.platform.PlatformServices
import com.watchdogindex.agent.ui.components.BottomSheetHandle
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.FilterChipsRow
import com.watchdogindex.agent.ui.components.IconTile
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SheetSurface
import com.watchdogindex.agent.ui.components.TabularText
import com.watchdogindex.agent.ui.components.WatchdogFab
import com.watchdogindex.agent.ui.components.WatchdogNavigationBar
import com.watchdogindex.agent.ui.components.WatchdogSearchBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdOutlinedButton
import com.watchdogindex.agent.ui.components.WdOutlinedField
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.iconByName
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.topSeparator
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.Tab
import kotlin.math.abs

/*
 * Farm (tab), spec §4.6: the platform map fills the screen; over it sit the elevated farm picker (top 48),
 * the layer chips (top 110), the "Draw area" FAB and the farm sheet resting on the navigation bar with the
 * score legend, the three neighborhood tiles, the turnover notes and FarmStats.NOT_A_SELLER_PREDICTION.
 * Every figure is a neighborhood total from public records; no single home is ever called a likely seller.
 */

/** How far the FAB overlaps the sheet's top edge: `.fab` bottom 476 against the sheet's top at 376 (y 360–416). */
private val fabSheetOverlap = 40.dp

/** The sheet keeps the mockup's 30 dp under its content (24 dp gesture allowance + SheetSurface's 6 dp) on every platform. */
private val sheetBottomInsets = WindowInsets(bottom = 24.dp)

/** A default view of New Jersey for an agent with no farm yet. */
private val newJersey = LatLng(40.0583, -74.4057)
private const val NEW_JERSEY_ZOOM = 8.0

/*
 * Zoom convention: core's MapZoom. FarmMapState.zoom, Farm.zoom and STREET_ZOOM are Web Mercator zooms over 256 dp
 * tiles (the convention both repositories author and the desktop map projects with); the Android map adapter
 * (app/FarmMapView) converts to and from MapLibre's 512 px-tile zoom at its boundary with MapZoom.toMapLibre and
 * MapZoom.fromMapLibre, so this screen never sees MapLibre's numbers.
 */

/** Street level, where an 18 m lot is about 28 dp wide as in the mockup's map, for opening on the spotlight home. */
private const val STREET_ZOOM = 17.5

/** Room kept above the spotlight home for the map's callout (46 dp box, 8 dp pointer, 6 dp gap). */
private val calloutAllowance = 60.dp

@Composable
fun FarmScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { FarmViewModel(graph.repos) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }
    val ready = state as? FarmUiState.Ready

    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = { WatchdogNavigationBar(selected = Tab.Farm, onSelect = navigator::switchTab) },
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(bottom = inner.calculateBottomPadding())) {
            when (val s = state) {
                FarmUiState.Loading -> FarmSkeleton()
                is FarmUiState.Error -> FarmError(s.userMessage, onRetry = vm::load)
                is FarmUiState.Ready -> FarmContent(
                    state = s,
                    vm = vm,
                    platform = platform,
                    onOpenProperty = { pin -> navigator.open(Route.Property(pin)) },
                )
            }
        }
    }

    if (ready != null) {
        when (ready.picker) {
            FarmPicker.Farms -> FarmPickerSheet(ready, vm)
            FarmPicker.Layers -> LayerPickerSheet(ready, vm)
            null -> Unit
        }
        if (ready.naming) NameFarmDialog(ready, vm)
    }
}

// ---------------------------------------------------------------------- map and overlays

@Composable
private fun FarmContent(
    state: FarmUiState.Ready,
    vm: FarmViewModel,
    platform: PlatformServices,
    onOpenProperty: (String) -> Unit,
) {
    val farm = state.farm
    val top = statusBarAllowance()
    val density = LocalDensity.current
    // The sheet's height decides where the visible part of the map is, so the spotlight home can sit in its middle.
    var sheetHeightPx by remember { mutableIntStateOf(0) }
    val sheetModifier = Modifier.onSizeChanged { sheetHeightPx = it.height }
    // The cameras this screen handed the map. A platform map reports its camera back once it settles (MapLibre's
    // onIdle), and that echo must not count as the agent panning, or the first frame's centre would be frozen
    // before the sheet has measured. Only a camera the screen did not supply is a pan.
    val supplied = remember { SuppliedCameras() }
    // Stable callbacks, so the map's pointer handlers are not restarted on every recomposition.
    val onParcelTap = remember(vm) { { parcel: MapParcel -> vm.onParcelTap(parcel) } }
    val onMapMoved = remember(vm, supplied) {
        { center: LatLng, zoom: Double -> if (!supplied.contains(center, zoom)) vm.onMapMoved(center, zoom) }
    }
    val onDrawPoint = remember(vm) { { point: LatLng -> vm.addDrawPoint(point) } }
    val chipsShown = farm != null && !state.drawing
    val mapDescription = buildString {
        val name = farm?.name ?: "New Jersey"
        append(
            when (state.layer) {
                MapLayer.Score -> "Farm map of $name with parcels colored by Watchdog Score"
                MapLayer.Residential -> "Farm map of $name with homes colored by Watchdog Score"
                MapLayer.SoldIn12Months -> "Farm map of $name highlighting homes sold in the last 12 months"
                MapLayer.Permits -> "Farm map of $name highlighting homes with a permit in the last 90 days"
            },
        )
        if (state.drawing) append(". Drawing a new area: tap to add a corner")
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val maxSheetHeight = maxHeight * 0.82f
        // Until the agent pans, the map opens on the spotlight home at street level, framed in the clear strip
        // between the chips and the sheet with room for its callout; without one it frames the whole farm the
        // way the repository describes it.
        // The strip is only known once the sheet has measured; before that the farm's own view is shown, so the
        // map is never framed against an empty strip.
        val spotlight = state.spotlightParcel?.takeIf { sheetHeightPx > 0 }
        val zoom = state.zoom ?: if (spotlight != null) STREET_ZOOM else farm?.zoom ?: NEW_JERSEY_ZOOM
        val center = state.center
            ?: spotlight?.let { parcel ->
                val stripTop = top + if (chipsShown) 62.dp + 48.dp else 8.dp + WatchdogDimens.searchBarHeight
                val stripBottom = maxHeight - with(density) { sheetHeightPx.toDp() }
                val target = (stripTop + stripBottom) / 2 + calloutAllowance / 2
                framedCenter(parcel.centroid(), zoom, northOfCentreDp = maxHeight / 2 - target)
            }
            ?: farm?.center
            ?: newJersey
        SideEffect { supplied.record(center, zoom) }
        val mapState = FarmMapState(
            center = center,
            zoom = zoom,
            boundary = farm?.boundary.orEmpty(),
            parcels = state.mapParcels,
            layer = state.layer,
            selectedPin = state.selectedPin,
            onParcelTap = onParcelTap,
            onMapMoved = onMapMoved,
            drawing = state.drawing,
            drawPoints = state.drawPoints,
            onDrawPoint = onDrawPoint,
        )
        platform.FarmMap(mapState, Modifier.fillMaxSize().semantics { contentDescription = mapDescription })

        // Farm picker in the elevated search bar's clothes (`.msearch` overlay, top 48). Its visible text names the
        // farm; the description also says what the bar does, since the component has no click label of its own.
        val pickerDescription = if (farm != null) {
            "Farm: ${farm.name}, ${Format.number(farm.homes)} homes. Change farm"
        } else {
            "No farm yet. Draw your farm"
        }
        WatchdogSearchBar(
            hint = if (farm != null) "${farm.name} · ${Format.number(farm.homes)} homes" else "No farm yet",
            onClick = { if (state.farms.isNotEmpty()) vm.openPicker(FarmPicker.Farms) else vm.startDrawing() },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(start = 16.dp, end = 16.dp, top = top + 8.dp)
                .semantics { contentDescription = pickerDescription },
            leadingIcon = WdIcons.Map,
            emphasized = true,
            elevated = true,
            trailing = if (farm != null) {
                { WdIconButton(icon = WdIcons.Layers, contentDescription = "Map layers", onClick = { vm.openPicker(FarmPicker.Layers) }) }
            } else {
                null
            },
        )
        // Layer chips (`.mchips` at top 110): the 48 dp row starts 8 dp higher so the 32 dp chips sit at 110.
        if (chipsShown) {
            FilterChipsRow(
                options = MapLayer.entries.map { it.label },
                selectedIndex = state.layer.ordinal,
                onSelect = { index -> vm.setLayer(MapLayer.entries[index]) },
                modifier = Modifier.align(Alignment.TopCenter).padding(top = top + 62.dp),
                elevatedUnselected = true,
            )
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
            val overSheet = state.drawing || farm != null
            Box(Modifier.fillMaxWidth().zIndex(1f)) {
                if (state.drawing) {
                    WatchdogFab(
                        icon = WdIcons.Check,
                        label = "Done",
                        onClick = vm::finishDrawing,
                        modifier = Modifier.align(Alignment.TopEnd).padding(end = 16.dp).offset(y = fabSheetOverlap),
                        contentDescription = "Done drawing",
                    )
                } else {
                    WatchdogFab(
                        icon = WdIcons.Draw,
                        label = "Draw area",
                        onClick = vm::startDrawing,
                        modifier = Modifier.align(Alignment.TopEnd).padding(end = 16.dp).offset(y = if (overSheet) fabSheetOverlap else 0.dp),
                    )
                }
            }
            when {
                state.drawing -> DrawingSheet(state, vm, modifier = sheetModifier)
                farm == null -> EmptyFarmCard(modifier = sheetModifier)
                else -> FarmSheet(state = state, farm = farm, vm = vm, onOpenProperty = onOpenProperty, maxHeight = maxSheetHeight, modifier = sheetModifier)
            }
        }
    }
}

// ---------------------------------------------------------------------- the farm sheet

/** Running total of a sheet drag, kept out of composition state so the deltas do not recompose the sheet. */
private class DragTotal {
    var value: Float = 0f
}

/** Drag the sheet up to expand it, down to collapse it (48 dp, or a flick). */
@Composable
private fun sheetDrag(expanded: Boolean, onExpand: () -> Unit, onCollapse: () -> Unit): Modifier {
    val total = remember { DragTotal() }
    val density = LocalDensity.current
    val threshold = with(density) { WatchdogDimens.touchTarget.toPx() }
    val fling = with(density) { 1000.dp.toPx() }
    return Modifier.draggable(
        state = rememberDraggableState { delta -> total.value += delta },
        orientation = Orientation.Vertical,
        onDragStarted = { total.value = 0f },
        onDragStopped = { velocity ->
            if (total.value < -threshold || velocity < -fling) {
                if (!expanded) onExpand()
            } else if (total.value > threshold || velocity > fling) {
                if (expanded) onCollapse()
            }
        },
    )
}

/**
 * The farm sheet (`.sheet.and.fsheet`): handle, name and town line, the score legend, the three tiles,
 * the turnover notes and the note that Watchdog never labels a home as a likely seller. Tapping the title
 * or dragging up expands it with the recent deeds and a farm switch; the handle closes it again.
 *
 * The content scrolls whenever it is taller than the sheet, expanded or not, so on a short phone, with large
 * text or with the tapped parcel's row showing, the note at the tail stays reachable. When it fits, the scroll
 * is off and a drag anywhere on the sheet expands it as before.
 */
@Composable
private fun FarmSheet(
    state: FarmUiState.Ready,
    farm: Farm,
    vm: FarmViewModel,
    onOpenProperty: (String) -> Unit,
    maxHeight: Dp,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val expanded = state.sheetExpanded
    val drag = sheetDrag(expanded = expanded, onExpand = vm::expandSheet, onCollapse = vm::collapseSheet)
    SheetSurface(modifier = modifier.heightIn(max = maxHeight).then(drag), windowInsets = sheetBottomInsets) {
        BottomSheetHandle(onDismiss = if (expanded) vm::collapseSheet else null, dismissLabel = "Show less")
        val scroll = rememberScrollState()
        Column(
            modifier = Modifier
                .weight(1f, fill = false)
                .verticalScroll(scroll, enabled = expanded || scroll.maxValue > 0),
        ) {
            val selected = state.selectedParcel
            if (state.calloutOpen && selected != null) {
                SelectedParcelRow(parcel = selected, onOpen = { onOpenProperty(selected.pin) }, onDismiss = vm::dismissCallout)
                Spacer(Modifier.height(8.dp))
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button, onClickLabel = if (expanded) "Show less" else "Show more", onClick = vm::toggleSheet),
            ) {
                Text(text = farm.name, color = c.ink, style = t.sectionTitle.copy(lineHeight = 28.sp))
                Text(
                    text = listOfNotNull(farm.town, "${Format.number(farm.homes)} homes", farm.sinceLabel).joinToString(" · "),
                    modifier = Modifier.padding(top = 2.dp),
                    color = c.muted,
                    style = t.supporting.sized(13, FontWeight.Medium, 18.2),
                )
            }
            // "Loading Permits…" / "Opening Elm Ridge…" while the repository answers; announced as it appears.
            val loadingLine = state.loadingLine
            if (loadingLine != null) {
                Text(
                    text = loadingLine,
                    modifier = Modifier.padding(top = 4.dp).semantics { liveRegion = LiveRegionMode.Polite },
                    color = c.muted,
                    style = t.caption.sized(12, FontWeight.SemiBold, 16.8),
                )
            }
            ScoreLegend(modifier = Modifier.padding(top = 12.dp))
            val stats = state.stats
            if (stats != null) {
                StatTiles(stats = stats, modifier = Modifier.padding(top = 12.dp))
                TurnoverNotes(stats = stats, modifier = Modifier.padding(top = 12.dp))
                Text(
                    text = stats.note,
                    modifier = Modifier.padding(top = 6.dp),
                    color = c.muted,
                    style = t.caption.sized(12, FontWeight.Normal, 16.8),
                )
            } else {
                Box(
                    Modifier
                        .padding(top = 12.dp)
                        .fillMaxWidth()
                        .height(82.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(c.fill)
                        .semantics { contentDescription = "Loading neighborhood totals" },
                )
            }
            if (expanded) {
                ExpandedFarmDetails(state = state, vm = vm, onOpenProperty = onOpenProperty)
            }
        }
    }
}

/** The parcel the agent tapped: home, address, "Score 72 · tax $11,284", Open and a dismiss. */
@Composable
private fun SelectedParcelRow(parcel: MapParcel, onOpen: () -> Unit, onDismiss: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.fill)
            .padding(start = 10.dp, end = 2.dp, top = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(tint = TileTint.Sky, icon = WdIcons.Home)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = parcel.address, color = c.ink, style = t.rowTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
            TabularText(text = parcel.calloutLine(), modifier = Modifier.padding(top = 2.dp), style = t.rowSupport, color = c.muted, maxLines = 1)
        }
        WdTonalButton(label = "Open", onClick = onOpen, small = true)
        WdIconButton(icon = WdIcons.Close, contentDescription = "Dismiss ${parcel.address}", onClick = onDismiss)
    }
}

/** `.lg`: "Watchdog Score" / gold dot "Sold in the last 12 months", the five 12 dp bands, the band labels. */
@Composable
private fun ScoreLegend(modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val header = t.body.sized(12, FontWeight.Bold, 16.8)
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "Watchdog Score", color = c.muted, style = header)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(c.mapDot))
                Text(text = "Sold in the last 12 months", color = c.muted, style = header)
            }
        }
        val bands = c.mapBands
        val labels = ScoreBands.labels
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp)
                .semantics { contentDescription = "Score bands from ${labels.first()} to ${labels.last()}" },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            bands.forEachIndexed { index, color ->
                val shape = when (index) {
                    0 -> RoundedCornerShape(topStart = 6.dp, bottomStart = 6.dp, topEnd = 2.dp, bottomEnd = 2.dp)
                    bands.lastIndex -> RoundedCornerShape(topStart = 2.dp, bottomStart = 2.dp, topEnd = 6.dp, bottomEnd = 6.dp)
                    else -> RoundedCornerShape(2.dp)
                }
                Box(Modifier.weight(1f).height(12.dp).clip(shape).background(color))
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            labels.forEach { label ->
                TabularText(
                    text = label,
                    modifier = Modifier.weight(1f),
                    style = t.body.sized(12, FontWeight.SemiBold, 16.8),
                    color = c.muted,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
    }
}

/** `.fstats`: three equal fill tiles, 22 sp value over a 12 sp label. */
@Composable
private fun StatTiles(stats: FarmStats, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StatTile(
            value = stats.medianScore?.toString() ?: "—",
            label = if (stats.medianScore != null) "Median score" else "No score yet",
            modifier = Modifier.weight(1f),
        )
        StatTile(
            value = Format.number(stats.salesIn12Months),
            label = "Sales in 12 mo" + (stats.salesPercent?.let { " · ${Format.percent(it, 1)}" } ?: ""),
            modifier = Modifier.weight(1f),
        )
        StatTile(value = Format.number(stats.permitsIn90Days), label = "Permits in 90 days", modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(c.fill)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) {},
    ) {
        TabularText(text = value, style = t.stat.copy(lineHeight = 30.8.sp), color = c.ink, maxLines = 1)
        Text(text = label, color = c.muted, style = t.caption.sized(12, FontWeight.SemiBold, 15.6))
    }
}

/** `.turn`: teal 20 dp icon, bold lead and the rest of the note; 1 dp separators between rows. */
@Composable
private fun TurnoverNotes(stats: FarmStats, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = modifier.fillMaxWidth()) {
        stats.turnover.forEachIndexed { index, note ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (index == 0) Modifier else Modifier.topSeparator(c.separator))
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                // A 24 dp column as tall as the first text line; the 20 dp glyph overflows it by 1 dp, so a
                // one-line note stays 18.2 dp tall as in the mockup.
                Box(Modifier.width(24.dp).height(18.dp), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = iconByName(note.icon, WdIcons.TrendingUp),
                        contentDescription = null,
                        modifier = Modifier.requiredSize(20.dp),
                        tint = c.teal,
                    )
                }
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(color = c.ink, fontWeight = FontWeight.Bold)) { append(note.lead) }
                        append(note.text)
                    },
                    modifier = Modifier.weight(1f),
                    color = c.ink2,
                    style = t.supporting.sized(13, FontWeight.Normal, 18.2),
                )
            }
        }
    }
}

/** Below the fold once the sheet is expanded: the recent deeds (public SR-1A records) and a way to switch farms. */
@Composable
private fun ExpandedFarmDetails(state: FarmUiState.Ready, vm: FarmViewModel, onOpenProperty: (String) -> Unit) {
    val deeds = state.recentDeeds
    CardLabel(text = "Recent deeds · SR-1A deed sales", modifier = Modifier.padding(top = 18.dp))
    RowList(modifier = Modifier.padding(top = 8.dp)) {
        if (deeds.isEmpty()) {
            WdRow(title = "No deeds in the last 12 months", supporting = "New deeds appear here as the county records them.", icon = WdIcons.Sell, trailing = null)
        } else {
            deeds.forEachIndexed { index, parcel ->
                Box(Modifier.fillMaxWidth().then(if (index == 0) Modifier else Modifier.topSeparator(WatchdogTheme.colors.separator, 66.dp))) {
                    WdRow(
                        title = parcel.address,
                        supporting = parcel.calloutLine(),
                        tile = TileTint.Sky,
                        icon = WdIcons.Sell,
                        onClick = { onOpenProperty(parcel.pin) },
                    )
                }
            }
        }
    }
    WdTonalButton(
        label = "Switch farm",
        onClick = { vm.openPicker(FarmPicker.Farms) },
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        icon = WdIcons.Map,
    )
}

// ---------------------------------------------------------------------- drawing, empty, loading, error

/** While drawing: how many corners so far, undo and cancel. The FAB reads "Done". */
@Composable
private fun DrawingSheet(state: FarmUiState.Ready, vm: FarmViewModel, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val corners = state.drawPoints.size
    SheetSurface(modifier = modifier, windowInsets = sheetBottomInsets) {
        BottomSheetHandle(onDismiss = vm::cancelDrawing, dismissLabel = "Cancel drawing")
        Text(text = "Draw your farm", color = c.ink, style = t.sectionTitle.copy(lineHeight = 28.sp))
        Text(
            text = when {
                corners == 0 -> "Tap the map at each corner of the neighborhood. Three corners make an area."
                corners < 3 -> "${Format.count(corners, "corner")} so far. Add ${3 - corners} more, then tap Done."
                else -> "${Format.count(corners, "corner")} drawn. Keep adding, or tap Done to name the farm."
            },
            modifier = Modifier.padding(top = 2.dp),
            color = c.muted,
            style = t.supporting.sized(13, FontWeight.Medium, 18.2),
        )
        Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WdTonalButton(
                label = "Undo corner",
                onClick = vm::undoDrawPoint,
                modifier = Modifier.weight(1f),
                icon = WdIcons.Replay,
                small = true,
                enabled = corners > 0,
            )
            WdOutlinedButton(label = "Cancel", onClick = vm::cancelDrawing, modifier = Modifier.weight(1f), small = true)
        }
    }
}

/** No farm yet: what drawing one gives the agent. The FAB above it starts the drawing. */
@Composable
private fun EmptyFarmCard(modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(modifier = modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp)) {
        CardLabel("Your farm")
        Text(text = "Draw your farm", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
        Text(
            text = "Outline a neighborhood on the map. Watchdog scores every home inside it and reports sales, permits and turnover from public records.",
            modifier = Modifier.padding(top = 6.dp),
            color = c.ink2,
            style = t.body.sized(14, FontWeight.Normal, 20.3),
        )
        Text(
            text = FarmStats.NOT_A_SELLER_PREDICTION,
            modifier = Modifier.padding(top = 10.dp),
            color = c.muted,
            style = t.caption.sized(12, FontWeight.Normal, 16.8),
        )
    }
}

/** Loading: the picker's and the sheet's silhouettes on the page color, until the farm arrives. */
@Composable
private fun FarmSkeleton() {
    val c = WatchdogTheme.colors
    Box(Modifier.fillMaxSize().background(c.bg).semantics { contentDescription = "Loading your farm" }) {
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .padding(start = 16.dp, end = 16.dp, top = statusBarAllowance() + 8.dp)
                .fillMaxWidth()
                .height(WatchdogDimens.searchBarHeight)
                .clip(RoundedCornerShape(28.dp))
                .background(c.fill2),
        )
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(412.dp)
                .clip(RoundedCornerShape(topStart = WatchdogDimens.sheetRadius, topEnd = WatchdogDimens.sheetRadius))
                .background(c.surface)
                .padding(horizontal = 16.dp),
        ) {
            BottomSheetHandle()
            Box(Modifier.width(180.dp).height(20.dp).clip(RoundedCornerShape(8.dp)).background(c.fill))
            Box(Modifier.padding(top = 8.dp).width(260.dp).height(13.dp).clip(RoundedCornerShape(6.dp)).background(c.fill))
            Box(Modifier.padding(top = 24.dp).fillMaxWidth().height(12.dp).clip(RoundedCornerShape(2.dp)).background(c.fill2))
            Box(Modifier.padding(top = 32.dp).fillMaxWidth().height(82.dp).clip(RoundedCornerShape(16.dp)).background(c.fill))
        }
    }
}

/** Error: a card on the page color explaining the problem, with a retry. */
@Composable
private fun FarmError(userMessage: String, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Box(Modifier.fillMaxSize().background(c.bg)) {
        WdCard(modifier = Modifier.align(Alignment.BottomCenter).padding(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
            CardLabel("Farm")
            Text(text = "Your farm didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}

// ---------------------------------------------------------------------- pickers and the name dialog

/**
 * The shared modal sheet chrome: surface, 28 dp top radius, the scrim token and the mockup handle. The Clients
 * screen carries the same wrapper; candidate for promotion to the components package as `WdModalSheet`.
 */
@Composable
private fun FarmModalSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val c = WatchdogTheme.colors
    val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = WatchdogDimens.sheetRadius, topEnd = WatchdogDimens.sheetRadius),
        containerColor = c.surface,
        contentColor = c.ink,
        scrimColor = c.scrim,
        dragHandle = { BottomSheetHandle(onDismiss = onDismiss) },
    ) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 6.dp + chromeBottom), content = content)
    }
}

/** The picker behind the search bar: every farm, the current one checked, and a way to draw another. */
@Composable
private fun FarmPickerSheet(state: FarmUiState.Ready, vm: FarmViewModel) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    FarmModalSheet(onDismiss = vm::closePicker) {
        Text(text = "Your farms", modifier = Modifier.padding(horizontal = 4.dp), color = c.ink, style = t.sectionTitle)
        Column(modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            RowList(modifier = Modifier.padding(top = 12.dp).selectableGroup()) {
                state.farms.forEachIndexed { index, farm ->
                    val selected = farm.id == state.farm?.id
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .then(if (index == 0) Modifier else Modifier.topSeparator(c.separator, 66.dp))
                            .selectable(selected = selected, role = Role.RadioButton, onClick = { vm.selectFarm(farm) }),
                    ) {
                        WdRow(
                            title = farm.name,
                            supporting = listOfNotNull(farm.town, "${Format.number(farm.homes)} homes", farm.sinceLabel).joinToString(" · "),
                            tile = TileTint.Mint,
                            icon = WdIcons.Map,
                            trailing = if (selected) {
                                { Icon(imageVector = WdIcons.Check, contentDescription = "Selected", modifier = Modifier.size(22.dp), tint = c.teal) }
                            } else {
                                null
                            },
                        )
                    }
                }
            }
        }
        WdTonalButton(
            label = "Draw a new area",
            onClick = vm::startDrawing,
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            icon = WdIcons.Draw,
        )
    }
}

/** The layers button's picker: the same four layers as the chips, each with what it shows and its source. */
@Composable
private fun LayerPickerSheet(state: FarmUiState.Ready, vm: FarmViewModel) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    FarmModalSheet(onDismiss = vm::closePicker) {
        Text(text = "Map layers", modifier = Modifier.padding(horizontal = 4.dp), color = c.ink, style = t.sectionTitle)
        RowList(modifier = Modifier.padding(top = 12.dp).selectableGroup()) {
            MapLayer.entries.forEachIndexed { index, layer ->
                val selected = layer == state.layer
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (index == 0) Modifier else Modifier.topSeparator(c.separator, 54.dp))
                        .selectable(selected = selected, role = Role.RadioButton, onClick = { vm.setLayer(layer) })
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                        RadioButton(
                            selected = selected,
                            onClick = null,
                            colors = RadioButtonDefaults.colors(selectedColor = c.primary, unselectedColor = c.mOutline),
                        )
                    }
                    Column {
                        Text(text = layer.label, color = c.ink, style = t.body.sized(15, if (selected) FontWeight.Bold else FontWeight.SemiBold))
                        Text(text = layer.description, color = c.muted, style = t.caption.sized(12, FontWeight.Medium, 16.8))
                    }
                }
            }
        }
        WdTonalButton(label = "Done", onClick = vm::closePicker, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
    }
}

/** After "Done": the new farm's name, then FarmRepository.createFarm with the drawn corners. */
@Composable
private fun NameFarmDialog(state: FarmUiState.Ready, vm: FarmViewModel) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val name = state.newFarmName
    AlertDialog(
        onDismissRequest = vm::dismissNaming,
        confirmButton = {
            TextButton(onClick = vm::createFarm, enabled = name.isNotBlank() && !state.creating) {
                Text(text = if (state.creating) "Creating…" else "Create farm", color = c.link, style = t.buttonSmall)
            }
        },
        dismissButton = {
            TextButton(onClick = vm::dismissNaming, enabled = !state.creating) {
                Text(text = "Back", color = c.link, style = t.buttonSmall)
            }
        },
        title = { Text(text = "Name this farm", color = c.ink, style = t.verdict) },
        text = {
            Column {
                Text(
                    text = "${Format.count(state.drawPoints.size, "corner")} drawn. The name shows on the map and in your Monday email.",
                    color = c.ink2,
                    style = t.body.sized(14, FontWeight.Normal, 20.3),
                )
                WdOutlinedField(
                    label = "Farm name",
                    value = name,
                    onValueChange = vm::setNewFarmName,
                    modifier = Modifier.padding(top = 12.dp),
                    onClear = if (name.isNotEmpty()) {
                        { vm.setNewFarmName("") }
                    } else {
                        null
                    },
                    placeholder = "Neighborhood name",
                    enabled = !state.creating,
                )
            }
        },
        containerColor = c.surface,
        titleContentColor = c.ink,
        textContentColor = c.ink2,
    )
}

/** The middle of a parcel's ring (the closing point dropped), for centring the map on it. */
private fun MapParcel.centroid(): LatLng {
    val points = if (ring.size > 1 && ring.first() == ring.last()) ring.dropLast(1) else ring
    if (points.isEmpty()) return LatLng(0.0, 0.0)
    return LatLng(points.sumOf { it.lat } / points.size, points.sumOf { it.lon } / points.size)
}

/**
 * The map centre that puts [anchor] [northOfCentreDp] above the middle of the map at [zoom] (in core's MapZoom
 * convention): the centre sits that far south, so the anchor lands in the middle of the strip the sheet leaves
 * visible.
 */
private fun framedCenter(anchor: LatLng, zoom: Double, northOfCentreDp: Dp): LatLng {
    val deltaLat = northOfCentreDp.value * MapZoom.metresPerDp(zoom, anchor.lat) / 111_320.0
    return LatLng(anchor.lat - deltaLat, anchor.lon)
}

/**
 * The last few cameras the screen handed the map, so a map that reports one of them back (MapLibre's idle
 * after `moveCamera`, or a drag that ended where it began) is not taken for a pan. Tolerances match the
 * Android adapter's own "already there" test. Kept out of composition state: recording it is a side effect
 * of composing, and reading it happens in a map callback.
 */
private class SuppliedCameras {
    private val recent = ArrayDeque<Pair<LatLng, Double>>()

    fun record(center: LatLng, zoom: Double) {
        if (recent.lastOrNull()?.let { matches(it, center, zoom) } == true) return
        recent.addLast(center to zoom)
        while (recent.size > 4) recent.removeFirst()
    }

    fun contains(center: LatLng, zoom: Double): Boolean = recent.any { matches(it, center, zoom) }

    private fun matches(camera: Pair<LatLng, Double>, center: LatLng, zoom: Double): Boolean =
        abs(camera.first.lat - center.lat) < 1e-6 && abs(camera.first.lon - center.lon) < 1e-6 && abs(camera.second - zoom) < 0.01
}

/**
 * The top inset the overlays start under. On device this is the system status bar; the desktop preview and
 * screenshot harness have no status bar but provide [LocalBottomChromeInsets] to reproduce the mockups'
 * chrome allowances, so the mockups' 40 dp status bar allowance is used there too.
 */
@Composable
private fun statusBarAllowance(): Dp =
    if (LocalBottomChromeInsets.current != null) 40.dp else WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
