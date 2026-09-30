package com.watchdogindex.agent.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel

/**
 * Everything the shared UI needs from the host platform. The Android app implements this with real
 * system services (Sharesheet, dialer, CameraX + ML Kit, Credential Manager, MapLibre, notifications);
 * the desktop preview implements it with stubs and a drawn map. Shared code never imports android.*.
 */
interface PlatformServices {
    /** Opens the system share sheet. [imagePngBytes] adds a rich preview (the true cost card). */
    fun share(title: String, text: String, url: String?, imagePngBytes: ByteArray? = null)
    fun copyToClipboard(label: String, text: String)
    fun openUrl(url: String)
    fun dial(phoneNumber: String)
    fun composeEmail(to: String?, subject: String, body: String)
    fun composeSms(phoneNumber: String?, body: String)

    /** Camera-based sign scanning: false on desktop, so the Scan screen opens in paste mode. */
    val hasCamera: Boolean
    /** Passkeys via Credential Manager: false on desktop, so the button is hidden. */
    val supportsPasskeys: Boolean

    /** Asks for notification permission if the platform needs it; returns whether alerts can be shown. */
    suspend fun requestNotificationPermission(): Boolean

    /**
     * Whether the system shows this app's notifications right now, read without prompting: false once the agent
     * has turned them off in system settings or has not granted the Android 13+ permission. Screens describe that
     * state (the Alerts screen's "notifications are off" note) and call [requestNotificationPermission] only on a
     * deliberate tap. Platforms without a notification switch report true.
     */
    fun notificationsEnabled(): Boolean = true
    fun openNotificationSettings()

    /** Vibration for actions such as a successful scan. */
    fun haptic(kind: Haptic)

    /**
     * The farm map. Android draws MapLibre with the OpenFreeMap Liberty basemap and the parcel layer;
     * the desktop preview draws a stylised map so the layout can be checked without native code.
     */
    @Composable
    fun FarmMap(state: FarmMapState, modifier: Modifier)

    /** The live camera preview with QR detection. Only called when [hasCamera] is true. */
    @Composable
    fun ScanCamera(onQr: (String) -> Unit, torch: Boolean, modifier: Modifier)
}

enum class Haptic { Light, Success, Warning }

/** What the map needs to draw. Parcels come from core (FarmRepository.parcels). */
data class FarmMapState(
    val center: LatLng,
    val zoom: Double,
    val boundary: List<LatLng>,
    val parcels: List<MapParcel>,
    val layer: MapLayer,
    val selectedPin: String?,
    val onParcelTap: (MapParcel) -> Unit,
    val onMapMoved: ((center: LatLng, zoom: Double) -> Unit)? = null,
    /** When true the user is drawing a new area; taps add vertices via [onDrawPoint]. */
    val drawing: Boolean = false,
    val drawPoints: List<LatLng> = emptyList(),
    val onDrawPoint: ((LatLng) -> Unit)? = null,
)

/** No-op services used by previews, tests and the desktop harness when nothing real is wired. */
open class NoopPlatformServices : PlatformServices {
    override fun share(title: String, text: String, url: String?, imagePngBytes: ByteArray?) {}
    override fun copyToClipboard(label: String, text: String) {}
    override fun openUrl(url: String) {}
    override fun dial(phoneNumber: String) {}
    override fun composeEmail(to: String?, subject: String, body: String) {}
    override fun composeSms(phoneNumber: String?, body: String) {}
    override val hasCamera: Boolean = false
    override val supportsPasskeys: Boolean = false
    override suspend fun requestNotificationPermission(): Boolean = true
    override fun openNotificationSettings() {}
    override fun haptic(kind: Haptic) {}
    @Composable override fun FarmMap(state: FarmMapState, modifier: Modifier) {}
    @Composable override fun ScanCamera(onQr: (String) -> Unit, torch: Boolean, modifier: Modifier) {}
}

val LocalPlatformServices = staticCompositionLocalOf<PlatformServices> { NoopPlatformServices() }
