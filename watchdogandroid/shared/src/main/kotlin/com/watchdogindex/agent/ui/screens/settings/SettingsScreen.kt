package com.watchdogindex.agent.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.QuietHours
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.KeyValueRow
import com.watchdogindex.agent.ui.components.SettingsDivider
import com.watchdogindex.agent.ui.components.SettingsProfileRow
import com.watchdogindex.agent.ui.components.SettingsRow
import com.watchdogindex.agent.ui.components.SettingsSectionLabel
import com.watchdogindex.agent.ui.components.SettingsTrailing
import com.watchdogindex.agent.ui.components.SourcesNote
import com.watchdogindex.agent.ui.components.TabularText
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route

/*
 * Settings (`S.settings.android`, spec §3.47 / §4.10): top bar, profile row, divider, then the "Monday email",
 * "Alerts" and "App" sections exactly as the mockup lists them, followed by "Account" (plan, email, sign out)
 * and the privacy footer. `.scroll.pb-sm`: bottom padding 110 (no navigation bar).
 */

/** The mockup's status bar allowance, used when the host draws no status bar (the desktop preview). */
private val MockupStatusBarHeight = 40.dp

/** `.pb-sm` is 110 on the mockup device, whose gesture area is 24; the rest scales with the real inset. */
private val ScrollBottomBeyondChrome = 86.dp

private const val AGENT_DESK_URL = "https://www.watchdogindex.com/dashboard"

@Composable
fun SettingsScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { SettingsViewModel(graph.repos) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val snackbar = remember { SnackbarHostState() }

    val ready = state as? SettingsUiState.Ready
    LaunchedEffect(ready?.signedOut) {
        if (ready?.signedOut == true) navigator.open(Route.Welcome)
    }
    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }

    Scaffold(
        containerColor = c.bg,
        contentWindowInsets = WindowInsets(0.dp),
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(top = statusBarTopPadding())) {
            WatchdogTopBar(
                title = "Settings",
                onBack = navigator::back,
                actions = listOf(TopBarAction(WdIcons.Search, "Search", onClick = { navigator.open(Route.Search()) })),
            )
            when (val s = state) {
                SettingsUiState.Loading -> Box(Modifier.fillMaxSize())
                is SettingsUiState.Error -> Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(text = s.userMessage, color = c.ink, style = t.body)
                    WdPrimaryButton(label = "Try again", onClick = vm::load, small = true)
                }
                is SettingsUiState.Ready -> {
                    val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
                    SettingsList(
                        ready = s,
                        contentPadding = PaddingValues(bottom = ScrollBottomBeyondChrome + chromeBottom),
                        vm = vm,
                    )
                    SettingsDialogs(ready = s, vm = vm, onOpenAgentDesk = { platform.openUrl(AGENT_DESK_URL) })
                }
            }
        }
    }
}

@Composable
private fun SettingsList(ready: SettingsUiState.Ready, contentPadding: PaddingValues, vm: SettingsViewModel) {
    val account = ready.account
    val prefs = ready.preferences
    val planLine = listOfNotNull(account.planLabel, account.brokerage).joinToString(" · ")
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "profile") {
            SettingsProfileRow(initials = account.initials, name = account.displayName, subtitle = planLine, onClick = vm::openAccount)
            SettingsDivider()
        }

        item(key = "monday") { SettingsSectionLabel("Monday email") }
        item(key = "monday-email") {
            SettingsRow(
                icon = WdIcons.Mail,
                title = "Email me my top ten",
                subtitle = prefs.deliveryLabel,
                trailing = SettingsTrailing.Switch(checked = prefs.mondayEmail, onCheckedChange = vm::setMondayEmail),
            )
        }
        item(key = "monday-notification") {
            SettingsRow(
                icon = WdIcons.Notifications,
                title = "Also send it as a notification",
                trailing = SettingsTrailing.Switch(checked = prefs.mondayNotification, onCheckedChange = vm::setMondayNotification),
            )
        }

        item(key = "alerts") { SettingsSectionLabel("Alerts") }
        item(key = "alerts-client") {
            ChannelRow(WdIcons.ReceiptLong, AlertChannel.ClientHomeChanges, prefs.channels, subtitle = AlertChannel.ClientHomeChanges.description, vm = vm)
        }
        item(key = "alerts-farm") {
            ChannelRow(WdIcons.Sell, AlertChannel.FarmSalesAndDeeds, prefs.channels, subtitle = AlertChannel.FarmSalesAndDeeds.description, vm = vm)
        }
        item(key = "alerts-town") {
            // The mockup gives this row no subtitle.
            ChannelRow(WdIcons.AccountBalance, AlertChannel.TownRatesAndRevaluations, prefs.channels, subtitle = null, vm = vm)
        }
        item(key = "alerts-appeal") {
            ChannelRow(WdIcons.Gavel, AlertChannel.AppealDeadlines, prefs.channels, subtitle = AlertChannel.AppealDeadlines.description, vm = vm)
        }
        item(key = "alerts-quiet") {
            SettingsRow(icon = WdIcons.Bedtime, title = "Quiet hours", subtitle = prefs.quietHours.label, onClick = vm::openQuietHours)
        }

        item(key = "app") { SettingsSectionLabel("App") }
        item(key = "app-theme") {
            SettingsRow(icon = WdIcons.DarkMode, title = "Theme", subtitle = ready.settings.themeMode.label(), onClick = vm::openTheme)
        }

        item(key = "account") { SettingsSectionLabel("Account") }
        item(key = "account-plan") {
            SettingsRow(
                icon = WdIcons.AccountCircle,
                title = account.planLabel,
                subtitle = account.email,
                trailing = SettingsTrailing.Chevron,
                onClick = vm::openAccount,
            )
        }
        item(key = "account-signout") {
            SettingsRow(
                icon = WdIcons.Logout,
                title = if (ready.signingOut) "Signing out…" else "Sign out",
                subtitle = "You can sign back in with the same email.",
                onClick = if (ready.signingOut) null else vm::signOut,
            )
        }
        item(key = "footer") { SourcesNote(AlertChannel.NOT_A_SELLER_PREDICTION) }
    }
}

@Composable
private fun ChannelRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    channel: AlertChannel,
    channels: Map<AlertChannel, Boolean>,
    subtitle: String?,
    vm: SettingsViewModel,
) {
    SettingsRow(
        icon = icon,
        title = channel.title,
        subtitle = subtitle,
        trailing = SettingsTrailing.Switch(
            checked = channels[channel] ?: false,
            onCheckedChange = { on -> vm.setChannel(channel, on) },
        ),
    )
}

@Composable
private fun SettingsDialogs(ready: SettingsUiState.Ready, vm: SettingsViewModel, onOpenAgentDesk: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    when (val dialog = ready.dialog) {
        null -> Unit
        SettingsDialog.Theme -> AlertDialog(
            onDismissRequest = vm::closeDialog,
            confirmButton = { TextButton(onClick = vm::closeDialog) { Text("Done") } },
            title = { Text(text = "Theme", style = t.sectionTitle) },
            text = {
                Column(modifier = Modifier.selectableGroup()) {
                    AppThemeMode.entries.forEach { mode ->
                        val selected = mode == ready.settings.themeMode
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .selectable(selected = selected, role = Role.RadioButton, onClick = { vm.setTheme(mode) })
                                .padding(horizontal = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = selected,
                                onClick = null,
                                colors = RadioButtonDefaults.colors(selectedColor = c.primary, unselectedColor = c.mOutline),
                            )
                            Text(text = mode.label(), color = c.ink, style = t.body)
                        }
                    }
                }
            },
            containerColor = c.surface,
            titleContentColor = c.ink,
            textContentColor = c.ink,
        )
        is SettingsDialog.QuietHours -> AlertDialog(
            onDismissRequest = vm::closeDialog,
            confirmButton = { TextButton(onClick = vm::saveQuietHours) { Text("Save") } },
            dismissButton = { TextButton(onClick = vm::closeDialog) { Text("Cancel") } },
            title = { Text(text = "Quiet hours", style = t.sectionTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Alerts that arrive between these hours wait until the morning.",
                        color = c.muted,
                        style = t.supporting,
                    )
                    HourStepper(label = "Start", hour = dialog.startHour, onEarlier = { vm.adjustQuietStart(-1) }, onLater = { vm.adjustQuietStart(1) })
                    HourStepper(label = "End", hour = dialog.endHour, onEarlier = { vm.adjustQuietEnd(-1) }, onLater = { vm.adjustQuietEnd(1) })
                    KeyValueRow(label = "Quiet from", value = QuietHours(dialog.startHour, dialog.endHour).label)
                }
            },
            containerColor = c.surface,
            titleContentColor = c.ink,
            textContentColor = c.ink,
        )
        SettingsDialog.Account -> AlertDialog(
            onDismissRequest = vm::closeDialog,
            confirmButton = { TextButton(onClick = { vm.closeDialog(); onOpenAgentDesk() }) { Text("Open the Agent Desk") } },
            dismissButton = { TextButton(onClick = vm::closeDialog) { Text("Close") } },
            title = { Text(text = ready.account.displayName, style = t.sectionTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // Stacked rather than key/value: an email address is too long to share a line with its label.
                    LabelledValue(label = "Plan", value = ready.account.planLabel)
                    LabelledValue(label = "Email", value = ready.account.email)
                    ready.account.brokerage?.let { LabelledValue(label = "Brokerage", value = it) }
                    Text(
                        text = "Plan changes and billing happen on the web. The app shows the plan the backend reports.",
                        modifier = Modifier.padding(top = 8.dp),
                        color = c.muted,
                        style = t.supporting,
                    )
                }
            },
            containerColor = c.surface,
            titleContentColor = c.ink,
            textContentColor = c.ink,
        )
    }
}

/** A 12 sp label over its value, for the account dialog. */
@Composable
private fun LabelledValue(label: String, value: String) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column {
        Text(text = label, color = c.muted, style = t.caption)
        Text(text = value, color = c.ink, style = t.kvLabel)
    }
}

/** One hour picker: label, "earlier" and "later" 48 dp buttons around the hour, announced as one control. */
@Composable
private fun HourStepper(label: String, hour: Int, onEarlier: () -> Unit, onLater: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val hourLabel = hourLabel(hour)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics { contentDescription = "$label $hourLabel" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, modifier = Modifier.weight(1f), color = c.ink, style = t.kvLabel)
        WdIconButton(icon = WdIcons.Remove, contentDescription = "$label one hour earlier", onClick = onEarlier)
        TabularText(text = hourLabel, modifier = Modifier.width(64.dp), style = t.kvValue, color = c.ink, textAlign = TextAlign.Center, maxLines = 1)
        WdIconButton(icon = WdIcons.Add, contentDescription = "$label one hour later", onClick = onLater)
    }
}

/** "9 PM", "7 AM", the same wording as [QuietHours.label]. */
private fun hourLabel(hour: Int): String = when {
    hour == 0 -> "12 AM"
    hour < 12 -> "$hour AM"
    hour == 12 -> "12 PM"
    else -> "${hour - 12} PM"
}

private fun AppThemeMode.label(): String = when (this) {
    AppThemeMode.System -> "System default"
    AppThemeMode.Light -> "Light"
    AppThemeMode.Dark -> "Dark"
}

/**
 * The system status bar height, or the mockup's 40 dp allowance where the host draws no status bar (the
 * desktop preview and the screenshot harness), so the top bar lines up with the reference frames.
 */
@Composable
private fun statusBarTopPadding(): Dp {
    val system = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    return if (system > 0.dp) system else MockupStatusBarHeight
}
