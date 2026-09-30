package com.watchdogindex.agent.ui.screens.farm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.Farm
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

class FarmViewModel(private val repos: Repositories) : ViewModel() {
    private val _state = MutableStateFlow<FarmUiState>(FarmUiState.Loading)
    val state: StateFlow<FarmUiState> = _state.asStateFlow()

    private var loadJob: Job? = null
    private var layerJob: Job? = null
    private var farmJob: Job? = null

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

    /** A picker row: the current farm stays on screen, with the sheet saying which one is opening, until the new one lands. */
    fun selectFarm(farm: Farm) {
        val current = _state.value as? FarmUiState.Ready ?: return
        if (current.farm?.id == farm.id) {
            _state.value = current.copy(picker = null)
            return
        }
        layerJob?.cancel()
        farmJob?.cancel()
        _state.value = current.copy(picker = null, openingFarm = farm.name)
        farmJob = viewModelScope.launch {
            try {
                val opened = openFarm(farm, current.farms, previous = null)
                _state.value = opened.copy(notice = null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(openingFarm = null, notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(openingFarm = null, notice = "That farm could not be opened. Try again.") }
            }
        }
    }

    /**
     * A chip or picker row: the map recolors at once from the parcels it already has (their sold and permit
     * flags come with the Score layer), and the layer's own records replace them when the repository answers.
     * The previous layer's records are dropped the moment the layer changes.
     */
    fun setLayer(layer: MapLayer) {
        val current = _state.value as? FarmUiState.Ready ?: return
        val farm = current.farm ?: return
        if (current.layer == layer && !current.loadingLayer) {
            if (current.picker != null) _state.value = current.copy(picker = null)
            return
        }
        layerJob?.cancel()
        _state.value = current.copy(layer = layer, picker = null, loadingLayer = layer != MapLayer.Score, layerParcels = current.parcels)
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

    /** The agent panned or zoomed; from here on the map stays where they left it. The screen filters out the map echoing its own camera. */
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

    /** A one-line message for the snackbar from the screen (for example when no home sits at the centre of the map). */
    fun notify(message: String) = updateReady { it.copy(notice = message) }

    fun clearNotice() = updateReady { if (it.notice != null) it.copy(notice = null) else it }
}
