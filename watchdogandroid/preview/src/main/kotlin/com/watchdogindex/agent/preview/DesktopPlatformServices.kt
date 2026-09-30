package com.watchdogindex.agent.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogDarkColors
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.FarmMapState
import com.watchdogindex.agent.platform.Haptic
import com.watchdogindex.agent.platform.PlatformServices
import java.awt.Desktop
import java.awt.GraphicsEnvironment
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.io.File
import java.net.URI
import java.net.URLEncoder
import java.nio.file.Files

/**
 * [PlatformServices] for the desktop preview. There is no share sheet, dialer or camera on a desktop, so the
 * actions do the nearest honest thing: text goes to the system clipboard, links open in the default browser and
 * mail client through [Desktop], and everything is logged to stdout so a person driving the preview can see
 * what the app tried to do. Every AWT call is guarded for headless JVMs (the screenshot harness runs with
 * `java.awt.headless=true`) and never throws into the UI.
 *
 * [parkLabel] is the name the stylised farm map writes on its decorative park block, as the mockup does with
 * "Birchwood Park". It is drawn text that describes no data, so only the screenshot harness sets it (it renders
 * the sample farm the mockup shows); the interactive window leaves it null.
 */
class DesktopPlatformServices(private val parkLabel: String? = null) : PlatformServices {

    override fun share(title: String, text: String, url: String?, imagePngBytes: ByteArray?) {
        val body = buildString {
            append(text)
            if (!url.isNullOrBlank()) append('\n').append(url)
        }
        setClipboard(body)
        log("share \"$title\": copied ${body.length} characters to the clipboard" + if (url != null) " ($url)" else "")
        if (imagePngBytes != null) {
            runCatching {
                val file = Files.createTempFile("watchdog-share-", ".png").toFile()
                file.writeBytes(imagePngBytes)
                log("share image written to ${file.absolutePath}")
                desktopAction(Desktop.Action.OPEN) { it.open(file) }
            }.onFailure { log("share image could not be written: ${it.message}") }
        }
    }

    override fun copyToClipboard(label: String, text: String) {
        setClipboard(text)
        log("copied $label to the clipboard")
    }

    override fun openUrl(url: String) {
        val opened = desktopAction(Desktop.Action.BROWSE) { it.browse(URI(url)) }
        log(if (opened) "opened $url" else "cannot open a browser here; link: $url")
        if (!opened) setClipboard(url)
    }

    override fun dial(phoneNumber: String) {
        val opened = desktopAction(Desktop.Action.BROWSE) { it.browse(URI("tel:" + phoneNumber.filter { !it.isWhitespace() })) }
        log(if (opened) "dial $phoneNumber handed to the system" else "no dialer here; number copied: $phoneNumber")
        if (!opened) setClipboard(phoneNumber)
    }

    override fun composeEmail(to: String?, subject: String, body: String) {
        val uri = URI("mailto:" + (to ?: "") + "?subject=" + encode(subject) + "&body=" + encode(body))
        val opened = desktopAction(Desktop.Action.MAIL) { it.mail(uri) }
        log(if (opened) "email draft opened for ${to ?: "(no recipient)"}" else "no mail client here; body copied")
        if (!opened) setClipboard("$subject\n\n$body")
    }

    override fun composeSms(phoneNumber: String?, body: String) {
        val uri = URI("sms:" + (phoneNumber ?: "") + "?body=" + encode(body))
        val opened = desktopAction(Desktop.Action.BROWSE) { it.browse(uri) }
        log(if (opened) "text message handed to the system" else "no messaging app here; text copied")
        if (!opened) setClipboard(body)
    }

    /** No camera on the desktop: the Scan screen opens in paste mode. */
    override val hasCamera: Boolean = false

    /** Credential Manager passkeys are Android-only; the Welcome button stays hidden. */
    override val supportsPasskeys: Boolean = false

    override suspend fun requestNotificationPermission(): Boolean = true

    /**
     * True: a desktop has no notification switch that could be off, and false would make the Alerts screen show a
     * "notifications are off" note whose remedy (the Android system settings) does not exist here. The renders
     * then show the screen in the state the mockup shows.
     */
    override fun notificationsEnabled(): Boolean = true

    override fun openNotificationSettings() {
        log("notification settings are a system screen on Android; nothing to open here")
    }

    override fun haptic(kind: Haptic) {
        // Desktops have no vibrator; intentionally silent.
    }

    @Composable
    override fun FarmMap(state: FarmMapState, modifier: Modifier) {
        DesktopFarmMap(state, modifier, parkLabel = parkLabel)
    }

    /**
     * Stand-in for the CameraX preview. Only reachable if a screen ignores [hasCamera]; it says so instead of
     * pretending to scan. Dark in both themes like a real viewfinder, so it uses the dark palette's tokens.
     */
    @Composable
    override fun ScanCamera(onQr: (String) -> Unit, torch: Boolean, modifier: Modifier) {
        Column(
            modifier = modifier.fillMaxSize().background(WatchdogDarkColors.bg).padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = WdIcons.NoPhotography,
                contentDescription = null,
                tint = WatchdogDarkColors.muted,
                modifier = Modifier.size(40.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "No camera on this computer",
                style = WatchdogTheme.type.rowTitle,
                color = WatchdogDarkColors.ink,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Paste the listing link or the address instead. On a phone this is the live viewfinder that reads the QR code on a For Sale sign.",
                style = WatchdogTheme.type.supporting,
                color = WatchdogDarkColors.muted,
                textAlign = TextAlign.Center,
            )
        }
    }

    // ------------------------------------------------------------------ helpers

    private fun log(message: String) {
        println("[watchdog preview] $message")
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8).replace("+", "%20")

    private fun setClipboard(text: String) {
        if (GraphicsEnvironment.isHeadless()) return
        runCatching { Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null) }
            .onFailure { log("clipboard unavailable: ${it.message}") }
    }

    /** Runs [block] with the AWT desktop when the action is supported; false when it is not or it failed. */
    private fun desktopAction(action: Desktop.Action, block: (Desktop) -> Unit): Boolean {
        if (GraphicsEnvironment.isHeadless() || !Desktop.isDesktopSupported()) return false
        val desktop = Desktop.getDesktop()
        if (!desktop.isSupported(action)) return false
        return runCatching { block(desktop) }.onFailure { log("${action.name.lowercase()} failed: ${it.message}") }.isSuccess
    }

    companion object {
        /** Where [share] drops images, for people looking for them. */
        val shareDirectory: File get() = File(System.getProperty("java.io.tmpdir"))
    }
}
