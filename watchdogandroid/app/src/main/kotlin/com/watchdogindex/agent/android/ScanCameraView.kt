package com.watchdogindex.agent.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.watchdogindex.agent.R
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/*
 * The sign scanner: a CameraX PreviewView with an ImageAnalysis stream feeding ML Kit's barcode scanner,
 * limited to QR codes. The camera runs only while this composable is on screen (bound to its lifecycle owner)
 * and is unbound on dispose. Repeated reads of the same code are debounced so the Scan screen resolves once.
 */

private const val TAG = "ScanCamera"

fun hasCameraPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

@Composable
fun ScanCamera(onQr: (String) -> Unit, torch: Boolean, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val latestOnQr by rememberUpdatedState(onQr)
    var granted by remember { mutableStateOf(hasCameraPermission(context)) }
    var asked by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { result ->
        granted = result
        asked = true
    }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    if (!granted) {
        CameraPermissionNotice(
            asked = asked,
            onAllow = { launcher.launch(Manifest.permission.CAMERA) },
            onSettings = {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(intent) }
            },
            modifier = modifier,
        )
        return
    }

    val previewDescription = context.getString(R.string.scan_camera_preview_description)
    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    var camera by remember { mutableStateOf<Camera?>(null) }

    DisposableEffect(lifecycleOwner, previewView) {
        val executor: ExecutorService = Executors.newSingleThreadExecutor()
        val scanner: BarcodeScanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
        )
        val debounce = QrDebounce()
        val mainExecutor = ContextCompat.getMainExecutor(context)
        val providerFuture = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        var disposed = false

        providerFuture.addListener({
            if (disposed) return@addListener
            val p = try { providerFuture.get() } catch (e: Exception) { Log.w(TAG, "Camera provider unavailable", e); return@addListener }
            provider = p
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor, QrAnalyzer(scanner) { value ->
                if (debounce.accept(value)) mainExecutor.execute { if (!disposed) latestOnQr(value) }
            })
            try {
                p.unbindAll()
                camera = p.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (e: Exception) {
                Log.w(TAG, "Camera bind failed", e)
            }
        }, mainExecutor)

        onDispose {
            disposed = true
            try { provider?.unbindAll() } catch (e: Exception) { Log.w(TAG, "Camera unbind", e) }
            camera = null
            scanner.close()
            executor.shutdown()
        }
    }

    LaunchedEffect(camera, torch) {
        val c = camera ?: return@LaunchedEffect
        if (c.cameraInfo.hasFlashUnit()) {
            try { c.cameraControl.enableTorch(torch) } catch (e: Exception) { Log.w(TAG, "Torch", e) }
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = modifier.semantics { contentDescription = previewDescription },
    )
}

/** Drops repeats: the same value within 2.5 s, or any value within 800 ms of the last accepted one. */
private class QrDebounce {
    private var lastValue: String? = null
    private var lastAt = 0L

    @Synchronized
    fun accept(value: String): Boolean {
        val now = System.currentTimeMillis()
        val sameRecently = value == lastValue && now - lastAt < 2_500L
        val anyRecently = now - lastAt < 800L
        if (sameRecently || anyRecently) return false
        lastValue = value
        lastAt = now
        return true
    }
}

private class QrAnalyzer(private val scanner: BarcodeScanner, private val onValue: (String) -> Unit) : ImageAnalysis.Analyzer {
    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    override fun analyze(image: ImageProxy) {
        val media = image.image
        if (media == null) {
            image.close()
            return
        }
        val input = InputImage.fromMediaImage(media, image.imageInfo.rotationDegrees)
        scanner.process(input)
            .addOnSuccessListener { codes ->
                val value = codes.firstNotNullOfOrNull { code -> code.rawValue?.trim()?.takeIf { it.isNotEmpty() } }
                if (value != null) onValue(value)
            }
            .addOnCompleteListener { image.close() }
    }
}

/**
 * Shown in place of the preview when camera permission is missing. Plain tokens: body text on the app
 * background, a filled button to ask again and an outlined one to open system settings once the user has
 * declined (Android then no longer shows the prompt).
 */
@Composable
private fun CameraPermissionNotice(asked: Boolean, onAllow: () -> Unit, onSettings: () -> Unit, modifier: Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(c.bg)
            .padding(horizontal = WatchdogDimens.screenMargin + 8.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(R.string.scan_camera_denied_title), style = t.sectionTitle, color = c.ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(text = stringResource(R.string.scan_camera_denied_body), style = t.body, color = c.ink2, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = onAllow,
                modifier = Modifier.heightIn(min = WatchdogDimens.buttonHeight),
                shape = RoundedCornerShape(WatchdogDimens.buttonRadius),
                colors = ButtonDefaults.buttonColors(containerColor = c.primary, contentColor = c.onPrimary),
            ) { Text(stringResource(R.string.scan_camera_allow), style = t.buttonSmall) }
            if (asked) {
                Spacer(Modifier.width(12.dp))
                OutlinedButton(
                    onClick = onSettings,
                    modifier = Modifier.heightIn(min = WatchdogDimens.buttonHeight),
                    shape = RoundedCornerShape(WatchdogDimens.buttonRadius),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = c.ink),
                ) { Text(stringResource(R.string.scan_camera_settings), style = t.buttonSmall) }
            }
        }
    }
}
