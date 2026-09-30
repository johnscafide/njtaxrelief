package com.watchdogindex.agent.ui.screens.alerts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogLogo
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.KeyValueRow
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.minTouchTarget
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.topSeparator
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import kotlinx.coroutines.launch

/*
 * Alerts (spec §4.9 documents the Android notification shade; this is the in-app list of the same alerts).
 * One grouped card in the shade's shape (28 dp radius, "Watchdog · now" header with the 20 dp mark, items
 * separated by 1 dp lines, link-colored action pills), a card explaining which Settings switch controls which
 * alert, and, when notifications are not allowed, a banner that asks. The clock and quick-settings tiles are
 * system UI and are not drawn. Colors follow the app theme: the fixed light shade colors belong to the OS.
 */

/** `.pb-sm`: 110 dp of scroll padding under the last card on screens without a navigation bar (86 + the 24 dp gesture inset). */
private val scrollBottomGap = 86.dp

@Composable
fun AlertsScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { AlertsViewModel(graph.repos, graph.platform) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    val notice = (state as? AlertsUiState.Ready)?.notice
    LaunchedEffect(notice) {
        if (notice != null) {
            snackbar.showSnackbar(notice)
            vm.clearNotice()
        }
    }

    val openSettings = { navigator.open(Route.Settings) }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            WatchdogTopBar(
                title = "Alerts",
                modifier = Modifier.padding(top = statusBarAllowance()),
                onBack = navigator::back,
                actions = listOf(TopBarAction(icon = WdIcons.Settings, contentDescription = "Settings", onClick = openSettings)),
            )
        },
    ) { inner ->
        val direction = LocalLayoutDirection.current
        val contentPadding = PaddingValues(
            start = inner.calculateStartPadding(direction),
            end = inner.calculateEndPadding(direction),
            top = inner.calculateTopPadding(),
            bottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding() + scrollBottomGap,
        )
        when (val s = state) {
            AlertsUiState.Loading -> AlertsSkeleton(contentPadding)
            is AlertsUiState.Error -> AlertsError(s.userMessage, contentPadding, onRetry = vm::load)
            is AlertsUiState.Ready -> LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
                if (!s.permissionGranted) {
                    item(key = "permission") {
                        PermissionBanner(onTurnOn = vm::requestPermission, onSystemSettings = platform::openNotificationSettings)
                    }
                }
                item(key = "group") {
                    NotificationGroup(
                        notifications = s.notifications,
                        expanded = s.expanded,
                        onToggleExpanded = vm::toggleExpanded,
                        onAction = { notification, action ->
                            when (action.kind) {
                                NotificationActionKind.OpenBrief -> navigator.open(Route.Intelligence)
                                NotificationActionKind.ViewFarm -> navigator.open(Route.Farm)
                                NotificationActionKind.SendCheckups -> navigator.open(Route.Clients)
                                NotificationActionKind.Later -> vm.dismiss(notification.id)
                                NotificationActionKind.Open -> navigator.open(notification.pin?.let { Route.Property(it) } ?: Route.Intelligence)
                                NotificationActionKind.CallClient -> scope.launch {
                                    val phone = vm.phoneFor(notification.pin)
                                    val pin = notification.pin
                                    when {
                                        phone != null -> platform.dial(phone)
                                        pin != null -> navigator.open(Route.Property(pin))
                                        else -> navigator.open(Route.Clients)
                                    }
                                }
                            }
                        },
                    )
                }
                item(key = "switches") { AlertSwitchesCard(preferences = s.preferences, onSettings = openSettings) }
            }
        }
    }
}

/**
 * The grouped notification card (`.ngroup`): 28 dp radius surface; header row (padding 14 16 4) with the
 * 20 dp Watchdog mark, "Watchdog · now" in 12 sp and the collapse chevron; then one item per alert.
 */
@Composable
private fun NotificationGroup(
    notifications: List<AppNotification>,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onAction: (AppNotification, NotificationAction) -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(WatchdogDimens.sheetRadius)
    val timeLabel = notifications.firstOrNull()?.timeLabel ?: "now"
    Column(
        modifier = Modifier
            .cardMargin()
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .border(1.dp, c.line, shape),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WatchdogLogo(size = 20.dp, cornerRadius = 10.dp, contentDescription = null)
            Text(
                text = "Watchdog · $timeLabel",
                modifier = Modifier.weight(1f),
                color = c.muted,
                style = t.caption.sized(12, FontWeight.Medium, 16.8),
            )
            if (notifications.size > 1) {
                ExpandToggle(expanded = expanded, count = notifications.size, onClick = onToggleExpanded)
            }
        }
        if (notifications.isEmpty()) {
            EmptyItem()
        } else {
            val shown = if (expanded) notifications else notifications.take(1)
            shown.forEachIndexed { index, notification ->
                NotificationItem(
                    notification = notification,
                    first = index == 0,
                    onAction = { action -> onAction(notification, action) },
                )
            }
            if (!expanded && notifications.size > 1) {
                CollapsedFooter(more = notifications.size - 1, onClick = onToggleExpanded)
            }
        }
    }
}

/** The 20 dp chevron of the shade's group header, with a 48 dp touch box overflowing it so the header keeps its height. */
@Composable
private fun ExpandToggle(expanded: Boolean, count: Int, onClick: () -> Unit) {
    val c = WatchdogTheme.colors
    Box(modifier = Modifier.size(20.dp), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .requiredSize(WatchdogDimens.touchTarget)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = if (expanded) "Collapse $count alerts" else "Expand $count alerts" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (expanded) WdIcons.ExpandLess else WdIcons.ExpandMore,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = c.ink2,
            )
        }
    }
}

/**
 * One alert (`.nitem`): padding 8 16 14 (12 above with a 1 dp line after the first), 15 sp title, 14 sp body
 * and the action pills. The pill row is 48 dp tall for the touch targets while the pills draw at 40 dp, so it
 * starts 2 dp lower and the item ends 4 dp sooner than the shade's numbers; the visible geometry is the same.
 */
@Composable
private fun NotificationItem(notification: AppNotification, first: Boolean, onAction: (NotificationAction) -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (first) Modifier else Modifier.topSeparator(c.separator))
            .padding(top = if (first) 8.dp else 12.dp, bottom = if (notification.actions.isEmpty()) 14.dp else 10.dp),
    ) {
        Text(
            text = notification.title,
            modifier = Modifier.padding(horizontal = 16.dp),
            color = c.ink,
            style = t.body.sized(15, FontWeight.Medium, 19.5),
        )
        Text(
            text = notification.body,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 2.dp),
            color = c.ink2,
            style = t.body.sized(14, FontWeight.Normal, 19.6),
        )
        if (notification.actions.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                notification.actions.forEach { action ->
                    ActionPill(label = action.label, onClick = { onAction(action) })
                }
            }
        }
    }
}

/** A shade action (`.nact`): 40 dp tall, 20 dp radius, padding 0 12, 14 sp 500 in the link color, inside a 48 dp target. */
@Composable
private fun ActionPill(label: String, onClick: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Box(
        modifier = Modifier
            .minTouchTarget()
            .clip(RoundedCornerShape(20.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 40.dp)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = c.link,
            style = t.body.sized(14, FontWeight.Medium, 19.6),
            maxLines = 1,
            softWrap = false,
        )
    }
}

@Composable
private fun CollapsedFooter(more: Int, onClick: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .topSeparator(c.separator)
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = WatchdogDimens.touchTarget)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(text = if (more == 1) "1 more alert" else "$more more alerts", color = c.link, style = t.body.sized(14, FontWeight.Medium, 19.6))
    }
}

@Composable
private fun EmptyItem() {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 14.dp)) {
        Text(text = "You’re caught up", color = c.ink, style = t.body.sized(15, FontWeight.Medium, 19.5))
        Text(
            text = "New alerts about your clients’ homes and your farm land here and in your notification shade.",
            modifier = Modifier.padding(top = 2.dp),
            color = c.ink2,
            style = t.body.sized(14, FontWeight.Normal, 19.6),
        )
    }
}

/** Which switch in Settings controls which alert, with its current position, and the privacy line every channel carries. */
@Composable
private fun AlertSwitchesCard(preferences: AlertPreferences, onSettings: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(modifier = Modifier.cardMargin()) {
        CardLabel("Alert switches")
        Text(
            text = "Each alert follows a switch in Settings. Turn one off and Watchdog stops sending that kind, here and in the shade.",
            modifier = Modifier.padding(top = 6.dp),
            color = c.ink2,
            style = t.supporting,
        )
        Column(modifier = Modifier.padding(top = 6.dp)) {
            KeyValueRow(
                label = AlertChannel.MondayBrief.title,
                value = if (preferences.mondayNotification) "On" else "Off",
                sublabel = AlertChannel.MondayBrief.description,
            )
            preferences.channels.forEach { (channel, on) ->
                KeyValueRow(label = channel.title, value = if (on) "On" else "Off", sublabel = channel.description)
            }
            KeyValueRow(label = "Quiet hours", value = preferences.quietHours.label, sublabel = "Alerts wait until morning", muted = true)
        }
        Row(
            modifier = Modifier
                .padding(top = 4.dp)
                .clip(RoundedCornerShape(12.dp))
                .clickable(role = Role.Button, onClick = onSettings)
                .heightIn(min = WatchdogDimens.touchTarget)
                .padding(end = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "Change in Settings", color = c.link, style = t.sectionLink)
            Icon(imageVector = WdIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.link)
        }
        Text(text = AlertChannel.NOT_A_SELLER_PREDICTION, color = c.muted, style = t.caption)
    }
}

/** Shown when the platform reports notifications are not allowed: explains, asks, and points at the system settings. */
@Composable
private fun PermissionBanner(onTurnOn: () -> Unit, onSystemSettings: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Sand, modifier = Modifier.cardMargin()) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = WdIcons.NotificationsOff, contentDescription = null, modifier = Modifier.size(20.dp), tint = c.sandInk)
            CardLabel("Notifications are off")
        }
        Text(text = "Turn on notifications", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
        Text(
            text = "Tax bills, deeds, permits and the Monday brief stay in this list until Watchdog may notify you.",
            modifier = Modifier.padding(top = 6.dp),
            color = c.ink2,
            style = t.body.sized(14, FontWeight.Normal, 20.3),
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WdPrimaryButton(label = "Turn on notifications", onClick = onTurnOn, icon = WdIcons.Notifications, small = true)
            WdTonalButton(label = "System settings", onClick = onSystemSettings, small = true)
        }
    }
}

/** Loading: the group's silhouette and the switches card's, in the theme's fill color. */
@Composable
private fun AlertsSkeleton(contentPadding: PaddingValues) {
    val c = WatchdogTheme.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading alerts" },
    ) {
        Box(Modifier.cardMargin().fillMaxWidth().height(430.dp).clip(RoundedCornerShape(WatchdogDimens.sheetRadius)).background(c.fill))
        Box(Modifier.cardMargin().fillMaxWidth().height(260.dp).clip(RoundedCornerShape(WatchdogDimens.cardRadius)).background(c.fill))
    }
}

@Composable
private fun AlertsError(userMessage: String, contentPadding: PaddingValues, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Alerts")
            Text(text = "Your alerts didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}

/**
 * The top inset the app bar sits under. On device this is the system status bar. The desktop preview and the
 * screenshot harness have no status bar but provide [LocalBottomChromeInsets] to reproduce the mockups' chrome
 * allowances, so the mockups' 40 dp status bar allowance is used there too.
 */
@Composable
private fun statusBarAllowance(): Dp =
    if (LocalBottomChromeInsets.current != null) 40.dp else WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
