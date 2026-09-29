package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogTheme

/** What a [SettingsRow] shows at its end. */
@Immutable
sealed interface SettingsTrailing {
    /** A switch; the whole row toggles it. */
    data class Switch(val checked: Boolean, val onCheckedChange: (Boolean) -> Unit) : SettingsTrailing

    /** A muted value such as "9 PM to 7 AM" or "System default". */
    data class Value(val text: String) : SettingsTrailing

    /** A chevron for rows that push another screen. */
    data object Chevron : SettingsTrailing
}

/**
 * Settings row (`.mli`): 24 dp ink2 icon, 16 sp 700 title, 14 sp muted subtitle, min height 72,
 * padding 10 20, 16 dp gaps. With a [SettingsTrailing.Switch] the row itself is the toggle and announces
 * its state; otherwise [onClick] makes it a button.
 */
@Composable
fun SettingsRow(
    icon: ImageVector?,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: SettingsTrailing? = null,
    onClick: (() -> Unit)? = null,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val interaction = when {
        trailing is SettingsTrailing.Switch ->
            Modifier.toggleable(value = trailing.checked, role = Role.Switch, onValueChange = trailing.onCheckedChange)
        onClick != null -> Modifier.clickable(role = Role.Button, onClick = onClick)
        else -> Modifier
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(interaction)
            .heightIn(min = 72.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            if (icon != null) {
                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(24.dp), tint = c.ink2)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = c.ink, style = t.settingTitle)
            if (subtitle != null) {
                Text(text = subtitle, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.settingSubtitle)
            }
        }
        when (trailing) {
            is SettingsTrailing.Switch -> WdSwitch(checked = trailing.checked, onCheckedChange = null)
            is SettingsTrailing.Value -> Text(text = trailing.text, color = c.muted, style = t.settingSubtitle)
            SettingsTrailing.Chevron -> RowChevron()
            null -> Unit
        }
    }
}

/** The Settings profile row: 40 dp avatar, name and plan line, chevron, min height 84 (the `.mli` override). */
@Composable
fun SettingsProfileRow(
    initials: String,
    name: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 84.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(initials = initials, size = 40.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = name, color = c.ink, style = t.settingTitle)
            Text(text = subtitle, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.settingSubtitle)
        }
        RowChevron()
    }
}

/** Settings section label (`.msec`): 14 sp 800 in link color, padding 22 20 4. */
@Composable
fun SettingsSectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 4.dp),
        color = WatchdogTheme.colors.link,
        style = WatchdogTheme.type.settingSection,
    )
}

/** Settings divider (`.mdiv`): 1 dp separator, margin 4 20 0. */
@Composable
fun SettingsDivider(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 4.dp)
            .height(1.dp)
            .background(WatchdogTheme.colors.separator),
    )
}

