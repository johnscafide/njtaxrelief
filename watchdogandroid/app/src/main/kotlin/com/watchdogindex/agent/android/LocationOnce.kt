package com.watchdogindex.agent.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.watchdogindex.agent.core.model.LatLng
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/*
 * One-shot location for the sign scan: after a QR read, the Scan screen attaches the phone's position to the
 * ScanInput.QrCode so the backend can confirm which parcel is in front of the agent. Location is never
 * requested at any other time and never stored by the app.
 */

/** True when either location permission is granted. */
fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/**
 * The current position with balanced power accuracy, or null when permission is missing, location is off,
 * Play services is unavailable or nothing arrives within [timeoutMillis].
 */
@SuppressLint("MissingPermission") // Checked by hasLocationPermission right above the call.
suspend fun currentLocation(context: Context, timeoutMillis: Long = 8_000L): LatLng? {
    if (!hasLocationPermission(context)) return null
    val client = LocationServices.getFusedLocationProviderClient(context.applicationContext)
    val cancellation = CancellationTokenSource()
    return try {
        val location = withTimeoutOrNull(timeoutMillis) {
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancellation.token).await()
        }
        if (location == null) { cancellation.cancel(); null } else LatLng(location.latitude, location.longitude)
    } catch (e: SecurityException) {
        null
    } catch (e: Exception) {
        // Play services missing or disabled, or the provider failed: the scan still resolves from the QR alone.
        cancellation.cancel()
        null
    }
}

/** A launcher for the one-time location prompt shown from the Scan screen; [onResult] receives whether any location permission is now granted. */
@Composable
fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        onResult(grants.values.any { it })
    }
    return remember(launcher) {
        { launcher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }
    }
}
