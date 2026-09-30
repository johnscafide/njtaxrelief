package com.watchdogindex.agent.ui.screens.farm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The pickers the Farm screen opens over the map. */
enum class FarmPicker { Farms, Layers }

/** The map layer chips and picker rows, in [MapLayer] order. */
val MapLayer.label: String
    get() = when (this) {
        MapLayer.Score -> "Score"
        MapLayer.Residential -> "Residential"
        MapLayer.SoldIn12Months -> "Sold in 12 mo"
        MapLayer.Permits -> "Permits"
    }

/** What each layer shows, for the layer picker; every one names its public source. */
val MapLayer.description: String
    get() = when (this) {
        MapLayer.Score -> "Every parcel colored by Watchdog Score"
        MapLayer.Residential -> "Homes only, colored by Watchdog Score (MOD-IV class 2)"
        MapLayer.SoldIn12Months -> "Deeds recorded in the last 12 months (SR-1A)"
        MapLayer.Permits -> "Permits filed in the last 90 days"
    }

/** The Farm tab: the agent's farms, the one on the map with its parcels and neighborhood totals, and the map's own state. */
sealed interface FarmUiState {
    data object Loading : FarmUiState

    data class Ready(
        val farms: List<Farm>,
        /** The farm on the map; null when the agent has not drawn one yet (the empty state). */
        val farm: Farm?,
        /** Every parcel of [farm] (the Score layer), which the map colors per the chosen layer. */
        val parcels: List<MapParcel> = emptyList(),
        /** The repository's parcels for the chosen layer; merged over [parcels] so fresher flags win. */
        val layerParcels: List<MapParcel> = emptyList(),
        val layer: MapLayer = MapLayer.Score,
        val stats: FarmStats? = null,
        /** The parcel the map outlines with its callout. */
        val selectedPin: String? = null,
        /**
         * The home the map opens on at street level: the first of the agent's known homes inside the farm.
         * Taps move [selectedPin], never this, so selecting a parcel does not pan the map.
         */
        val spotlightPin: String? = null,
        /** True once the agent tapped a parcel; the sheet then shows the parcel row with its Open button. */
        val calloutOpen: Boolean = false,
        /** Where the agent panned the map to; null until then, so the screen frames the spotlight home or the farm. */
        val center: LatLng? = null,
        val zoom: Double? = null,
        val sheetExpanded: Boolean = false,
        val picker: FarmPicker? = null,
        val drawing: Boolean = false,
        val drawPoints: List<LatLng> = emptyList(),
        /** The name dialog after "Done" while drawing. */
        val naming: Boolean = false,
        val newFarmName: String = "",
        val creating: Boolean = false,
        val loadingLayer: Boolean = false,
        /** A one-line message for the snackbar; cleared by [FarmViewModel.clearNotice]. */
        val notice: String? = null,
    ) : FarmUiState {
        /** What the map draws: all parcels, with the layer's own records replacing their Score-layer twins. */
        val mapParcels: List<MapParcel>
            get() = if (layer == MapLayer.Score || layerParcels.isEmpty()) {
                parcels
            } else {
                val fresh = layerParcels.associateBy { it.pin }
                parcels.map { fresh[it.pin] ?: it }
            }

        val selectedParcel: MapParcel? get() = selectedPin?.let { pin -> mapParcels.firstOrNull { it.pin == pin } }

        val spotlightParcel: MapParcel? get() = spotlightPin?.let { pin -> parcels.firstOrNull { it.pin == pin } }

        /** Homes with a deed in the last 12 months, for the expanded sheet; neighborhood facts, never a prediction. */
        val recentDeeds: List<MapParcel> get() = mapParcels.filter { it.soldInLast12Months && it.residential }.take(8)
    }

    data class Error(val userMessage: String) : FarmUiState
}

/** "Score 72 · tax $11,284"; stores and unscored parcels say so instead of showing a blank. */
fun MapParcel.calloutLine(): String {
    val scoreText = score?.let { "Score $it" } ?: if (residential) "Not scored yet" else "Not a home"
    val taxText = taxBill?.let { " · tax ${Format.money(it)}" } ?: ""
    return scoreText + taxText
}

class FarmViewModel(private val repos: Repositories) : ViewModel() {
    private val _state = MutableStateFlow<FarmUiState>(FarmUiState.Loading)
    val state: StateFlow<FarmUiState> = _state.asStateFlow()

    private var loadJob: Job? = null
    private var layerJob: Job? = null

    init {
        load()
    }

    /** Loads the farms and opens the first one (or the one already on screen) with its parcels and totals. */
    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val previous = _state.value as? FarmUiState.Ready
            if (previous == null) _state.value = FarmUiState.Loading
            try {
                val farms = repos.farm.farms()
                val farm = farms.firstOrNull { it.id == previous?.farm?.id } ?: farms.firstOrNull()
                _state.value = if (farm == null) {
                    FarmUiState.Ready(farms = farms, farm = null)
                } else {
                    openFarm(farm, farms, previous)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                fail(e.userMessage, previous)
            } catch (e: Exception) {
                fail("Your farm could not be loaded. Try again.", previous)
            }
        }
    }

    private fun fail(message: String, previous: FarmUiState.Ready?) {
        _state.value = previous?.copy(notice = message, creating = false) ?: FarmUiState.Error(message)
    }

    /**
     * The state for a farm: its Score-layer parcels and totals, fetched together, and the parcel the map opens
     * on. That spotlight is the first of the agent's known homes (the empty search, which lists them) inside the
     * farm; when there is none the map opens with nothing outlined.
     */
    private suspend fun openFarm(farm: Farm, farms: List<Farm>, previous: FarmUiState.Ready?): FarmUiState.Ready = coroutineScope {
        val parcels = async { repos.farm.parcels(farm.id, MapLayer.Score) }
        val stats = async { repos.farm.stats(farm.id) }
        val known = async {
            try {
                repos.properties.search("")
            } catch (e: WatchdogException) {
                emptyList()
            }
        }
        val all = parcels.await()
        val pins = all.mapTo(HashSet()) { it.pin }
        val keepSelection = previous?.farm?.id == farm.id
        val spotlight = if (keepSelection) previous?.spotlightPin else known.await().firstOrNull { it.pin in pins }?.pin
        FarmUiState.Ready(
            farms = farms,
            farm = farm,
            parcels = all,
            layerParcels = all,
            layer = MapLayer.Score,
            stats = stats.await(),
            selectedPin = if (keepSelection) previous?.selectedPin?.takeIf { it in pins } else spotlight?.takeIf { it in pins },
            spotlightPin = (if (keepSelection) previous?.spotlightPin else spotlight)?.takeIf { it in pins },
            calloutOpen = keepSelection && (previous?.calloutOpen ?: false),
            // Null until the agent pans: the screen then frames the spotlight home, or the whole farm.
            center = if (keepSelection) previous?.center else null,
            zoom = if (keepSelection) previous?.zoom else null,
            sheetExpanded = keepSelection && (previous?.sheetExpanded ?: false),
        )
    }

    private inline fun updateReady(transform: (FarmUiState.Ready) -> FarmUiState.Ready) {
        _state.update { s -> if (s is FarmUiState.Ready) transform(s) else s }
    }

    // ------------------------------------------------------------------ farm and layer

    fun selectFarm(farm: Farm) {
        val current = _state.value as? FarmUiState.Ready ?: return
        if (current.farm?.id == farm.id) {
            _state.value = current.copy(picker = null)
            return
        }
        layerJob?.cancel()
        _state.value = current.copy(picker = null, loadingLayer = true)
        viewModelScope.launch {
            try {
                val opened = openFarm(farm, current.farms, previous = null)
                _state.value = opened.copy(notice = null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(loadingLayer = false, notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(loadingLayer = false, notice = "That farm could not be opened. Try again.") }
            }
        }
    }

    /** A chip or picker row: the map recolors at once; the layer's records follow from the repository. */
    fun setLayer(layer: MapLayer) {
        val current = _state.value as? FarmUiState.Ready ?: return
        val farm = current.farm ?: return
        if (current.layer == layer && !current.loadingLayer) {
            if (current.picker != null) _state.value = current.copy(picker = null)
            return
        }
        layerJob?.cancel()
        _state.value = current.copy(layer = layer, picker = null, loadingLayer = layer != MapLayer.Score, layerParcels = if (layer == MapLayer.Score) current.parcels else current.layerParcels)
        if (layer == MapLayer.Score) return
        layerJob = viewModelScope.launch {
            try {
                val fresh = repos.farm.parcels(farm.id, layer)
                updateReady { if (it.layer == layer && it.farm?.id == farm.id) it.copy(layerParcels = fresh, loadingLayer = false) else it }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(loadingLayer = false, notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(loadingLayer = false, notice = "That layer could not be loaded. Try again.") }
            }
        }
    }

    // ------------------------------------------------------------------ map

    fun onParcelTap(parcel: MapParcel) = updateReady {
        if (it.drawing) it else it.copy(selectedPin = parcel.pin, calloutOpen = true)
    }

    fun dismissCallout() = updateReady { it.copy(selectedPin = null, calloutOpen = false) }

    fun onMapMoved(center: LatLng, zoom: Double) = updateReady { it.copy(center = center, zoom = zoom) }

    fun toggleSheet() = updateReady { it.copy(sheetExpanded = !it.sheetExpanded) }

    fun collapseSheet() = updateReady { it.copy(sheetExpanded = false) }

    fun expandSheet() = updateReady { it.copy(sheetExpanded = true) }

    fun openPicker(picker: FarmPicker) = updateReady { it.copy(picker = picker) }

    fun closePicker() = updateReady { it.copy(picker = null) }

    // ------------------------------------------------------------------ drawing a new area

    /** "Draw area": taps on the map add corners until "Done". */
    fun startDrawing() = updateReady {
        it.copy(drawing = true, drawPoints = emptyList(), naming = false, picker = null, calloutOpen = false, sheetExpanded = false)
    }

    fun addDrawPoint(point: LatLng) = updateReady { if (it.drawing) it.copy(drawPoints = it.drawPoints + point) else it }

    fun undoDrawPoint() = updateReady { it.copy(drawPoints = it.drawPoints.dropLast(1)) }

    fun cancelDrawing() = updateReady { it.copy(drawing = false, drawPoints = emptyList(), naming = false, newFarmName = "") }

    /** "Done": asks for a name once the outline has three corners. */
    fun finishDrawing() = updateReady {
        if (it.drawPoints.size < 3) it.copy(notice = "Tap at least three corners around the neighborhood first") else it.copy(naming = true)
    }

    fun setNewFarmName(name: String) = updateReady { it.copy(newFarmName = name) }

    fun dismissNaming() = updateReady { it.copy(naming = false) }

    /** Creates the farm from the drawn outline and opens it. */
    fun createFarm() {
        val current = _state.value as? FarmUiState.Ready ?: return
        if (current.creating || current.drawPoints.size < 3) return
        val name = current.newFarmName.trim()
        _state.value = current.copy(creating = true)
        viewModelScope.launch {
            try {
                val farm = repos.farm.createFarm(name, current.drawPoints)
                val farms = repos.farm.farms()
                val opened = openFarm(farm, farms, previous = null)
                _state.value = opened.copy(
                    notice = "${farm.name} added: ${Format.count(farm.homes, "home")} in ${farm.town}",
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(creating = false, naming = false, notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(creating = false, naming = false, notice = "The farm could not be created. Try again.") }
            }
        }
    }

    fun clearNotice() = updateReady { if (it.notice != null) it.copy(notice = null) else it }
}
