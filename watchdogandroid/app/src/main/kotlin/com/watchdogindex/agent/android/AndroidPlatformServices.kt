package com.watchdogindex.agent.android

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ShareCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.watchdogindex.agent.R
import com.watchdogindex.agent.platform.FarmMapState
import com.watchdogindex.agent.platform.Haptic
import com.watchdogindex.agent.platform.PlatformServices
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.lang.ref.WeakReference
import com.watchdogindex.agent.android.FarmMap as MapLibreFarmMap
import com.watchdogindex.agent.android.ScanCamera as CameraXScanCamera

/**
 * [PlatformServices] on Android: Sharesheet, clipboard, dialer, mail and SMS intents, notification permission,
 * haptics, and the MapLibre farm map and CameraX scanner composables. Built once by WatchdogApplication with the
 * application context; MainActivity calls [attach] / [detach] so intents that need a task (share, dial) start
 * from the foreground activity and the notification permission prompt has a result registry to use.
 */
class AndroidPlatformServices(context: Context) : PlatformServices {
    private val app: Context = context.applicationContext
    private var activityRef: WeakReference<ComponentActivity>? = null
    private var notificationLauncher: ActivityResultLauncher<String>? = null
    private var pendingNotificationResult: CompletableDeferred<Boolean>? = null

    private val activity: ComponentActivity? get() = activityRef?.get()

    /**
     * Call from MainActivity.onCreate. Registers the notification permission launcher on the activity's result
     * registry under a fixed key, so a result still pending from a destroyed activity (the system dialog was up
     * during a configuration change) is delivered to this registration and completes the request that is waiting.
     */
    fun attach(activity: ComponentActivity) {
        activityRef = WeakReference(activity)
        notificationLauncher?.unregister()
        notificationLauncher = activity.activityResultRegistry.register(
            NOTIFICATION_PERMISSION_KEY,
            ActivityResultContracts.RequestPermission(),
        ) { granted -> pendingNotificationResult?.complete(granted); pendingNotificationResult = null }
    }

    /**
     * Call from MainActivity.onDestroy. A request still waiting is left open: the activity may only be recreated,
     * and the next [attach] receives its real result. It completes on that result, or with false when a new request
     * supersedes it ([requestNotificationPermission]).
     */
    fun detach(activity: ComponentActivity) {
        if (activityRef?.get() !== activity) return
        notificationLauncher?.unregister()
        notificationLauncher = null
        activityRef = null
    }

    // Sharing and intents

    override fun share(title: String, text: String, url: String?, imagePngBytes: ByteArray?) {
        val host: Context = activity ?: app
        val body = if (!url.isNullOrBlank() && !text.contains(url)) "$text\n$url" else text
        val builder = ShareCompat.IntentBuilder(host)
            .setChooserTitle(app.getString(R.string.share_chooser_title))
            .setSubject(title)
            .setText(body)
        val imageUri = imagePngBytes?.let { writeSharedCard(it) }
        if (imageUri != null) builder.setType("image/png").setStream(imageUri) else builder.setType("text/plain")
        val intent = builder.intent.apply {
            putExtra(Intent.EXTRA_TITLE, title)
            if (imageUri != null) {
                // ClipData is what the Sharesheet reads for its preview thumbnail; the flag lets the chosen app read the file.
                clipData = ClipData.newUri(app.contentResolver, title, imageUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        val chooser = Intent.createChooser(intent, app.getString(R.string.share_chooser_title)).apply {
            if (imageUri != null) addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        launch(chooser)
    }

    /** Writes the card PNG under cacheDir/shared_cards (the FileProvider path in res/xml/file_paths.xml). */
    private fun writeSharedCard(bytes: ByteArray): Uri? = try {
        val dir = File(app.cacheDir, SHARED_CARDS_DIR).apply { mkdirs() }
        // Keep the folder small: anything older than an hour is a card that has already been shared.
        val cutoff = System.currentTimeMillis() - 60 * 60 * 1000L
        dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
        val file = File(dir, "watchdog-true-cost-${System.currentTimeMillis()}.png")
        file.writeBytes(bytes)
        FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
    } catch (e: Exception) {
        null
    }

    override fun copyToClipboard(label: String, text: String) {
        val clipboard = app.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
        // Android 13+ shows its own "copied" confirmation; older versions need ours.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) toast(app.getString(R.string.copied_toast))
    }

    override fun openUrl(url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
        launch(Intent(Intent.ACTION_VIEW, uri))
    }

    override fun dial(phoneNumber: String) {
        val digits = phoneNumber.trim()
        if (digits.isEmpty()) return
        launch(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(digits))))
    }

    override fun composeEmail(to: String?, subject: String, body: String) {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + (to?.let { Uri.encode(it) } ?: ""))).apply {
            if (!to.isNullOrBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        launch(intent)
    }

    override fun composeSms(phoneNumber: String?, body: String) {
        val target = phoneNumber?.trim()?.takeIf { it.isNotEmpty() }?.let { Uri.encode(it) } ?: ""
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$target")).apply { putExtra("sms_body", body) }
        launch(intent)
    }

    private fun launch(intent: Intent) {
        val a = activity
        try {
            if (a != null) a.startActivity(intent) else app.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast(app.getString(R.string.no_app_toast))
        }
    }

    private fun toast(message: String) {
        Toast.makeText(app, message, Toast.LENGTH_SHORT).show()
    }

    // Capabilities

    override val hasCamera: Boolean
        get() = app.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    /** Passkeys stay hidden until the backend supports them (BuildConfig.PASSKEYS_ENABLED) and the OS is API 28+. */
    override val supportsPasskeys: Boolean
        get() = PasskeyBridge.isAvailable

    // Notifications

    override suspend fun requestNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return NotificationManagerCompat.from(app).areNotificationsEnabled()
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return true
        val launcher = notificationLauncher ?: return false
        val deferred = CompletableDeferred<Boolean>()
        pendingNotificationResult?.complete(false)
        pendingNotificationResult = deferred
        withContext(Dispatchers.Main.immediate) { launcher.launch(Manifest.permission.POST_NOTIFICATIONS) }
        return deferred.await()
    }

    /** The app-wide system switch (which on Android 13+ also reflects POST_NOTIFICATIONS), read without prompting. */
    override fun notificationsEnabled(): Boolean = NotificationManagerCompat.from(app).areNotificationsEnabled()

    override fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, app.packageName)
        launch(intent)
    }

    // Haptics

    override fun haptic(kind: Haptic) {
        val view: View? = activity?.window?.decorView
        if (view != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val constant = when (kind) {
                Haptic.Light -> HapticFeedbackConstants.CONTEXT_CLICK
                Haptic.Success -> HapticFeedbackConstants.CONFIRM
                Haptic.Warning -> HapticFeedbackConstants.REJECT
            }
            if (view.performHapticFeedback(constant)) return
        }
        vibrate(kind)
    }

    private fun vibrate(kind: Haptic) {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        if (vibrator == null || !vibrator.hasVibrator()) return
        val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            VibrationEffect.createPredefined(
                when (kind) {
                    Haptic.Light -> VibrationEffect.EFFECT_TICK
                    Haptic.Success -> VibrationEffect.EFFECT_CLICK
                    Haptic.Warning -> VibrationEffect.EFFECT_HEAVY_CLICK
                },
            )
        } else {
            val millis = when (kind) { Haptic.Light -> 12L; Haptic.Success -> 24L; Haptic.Warning -> 40L }
            VibrationEffect.createOneShot(millis, VibrationEffect.DEFAULT_AMPLITUDE)
        }
        try { vibrator.vibrate(effect) } catch (e: Exception) { /* no VIBRATE on some builds; the action still succeeded */ }
    }

    // Composables backed by native views

    @Composable
    override fun FarmMap(state: FarmMapState, modifier: Modifier) {
        MapLibreFarmMap(state = state, modifier = modifier)
    }

    @Composable
    override fun ScanCamera(onQr: (String) -> Unit, torch: Boolean, modifier: Modifier) {
        CameraXScanCamera(onQr = onQr, torch = torch, modifier = modifier)
    }

    private companion object {
        const val NOTIFICATION_PERMISSION_KEY = "com.watchdogindex.agent.notifications"
        const val SHARED_CARDS_DIR = "shared_cards"
    }
}
