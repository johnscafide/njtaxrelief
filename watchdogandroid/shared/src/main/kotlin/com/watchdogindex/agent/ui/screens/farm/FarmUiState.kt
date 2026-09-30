package com.watchdogindex.agent.ui.screens.farm

import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel

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
        /**
         * The repository's parcels for the chosen layer; merged over [parcels] so fresher flags win. Reset to
         * [parcels] the moment the layer changes, so the map never shows the last layer's records under the new chip.
         */
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
        /** The chosen layer's records are on their way from the repository. */
        val loadingLayer: Boolean = false,
        /** The name of the farm being opened from the picker while this one is still on screen. */
        val openingFarm: String? = null,
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

        /** What the sheet's status line says while something is on its way, or null when nothing is. */
        val loadingLine: String?
            get() = when {
                openingFarm != null -> "Opening $openingFarm…"
                loadingLayer -> "Loading ${layer.label}…"
                else -> null
            }
    }

    data class Error(val userMessage: String) : FarmUiState
}
