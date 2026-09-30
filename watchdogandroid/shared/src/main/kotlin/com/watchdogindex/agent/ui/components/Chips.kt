package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/** Status chip (`.chip`): 26 dp tall, 13 dp radius, 0x10 padding, 12 sp 700, optional 16 dp icon, toned by meaning. */
@Composable
fun StatusChipView(chip: StatusChip, modifier: Modifier = Modifier) {
    val (container, ink) = chip.tone.colors()
    val icon = chip.icon?.let { WdIcons.byName(it) }
    Row(
        modifier = modifier
            .height(WatchdogDimens.chipHeight)
            .clip(RoundedCornerShape(13.dp))
            .background(container)
            .padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = ink)
        }
        Text(text = chip.label, color = ink, style = WatchdogTheme.type.chip, maxLines = 1, softWrap = false)
    }
}

/**
 * Material filter chip as the mockups draw it (`.mchip`): 32 dp tall, 8 dp radius, 1 dp border, 14 sp 700
 * ink2; selected = indicator fill with a leading 18 dp check; [elevated] unselected = surface with a soft
 * shadow (the Farm overlay). Reserves a 48 dp touch target, so the chip sits in a 48 dp tall box.
 * The chips in the app pick one option, so [role] defaults to a radio button; pass [Role.Checkbox] for a
 * multi-select filter. The unselected border is `muted`, not the mockup's `mOutline`, which is 1.75:1 on the
 * page (2.1 dark) where a control's boundary needs 3:1 (WCAG 1.4.11); muted is 5.1:1 light and 7.8:1 dark.
 */
@Composable
fun WdFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    elevated: Boolean = false,
    icon: ImageVector? = null,
    role: Role = Role.RadioButton,
) {
    val c = WatchdogTheme.colors
    val shape = RoundedCornerShape(8.dp)
    val container = when {
        selected -> c.mIndicator
        elevated -> c.surface
        else -> c.bg
    }
    val content = if (selected) c.mOnIndicator else c.ink2
    val leading = if (selected) WdIcons.Check else icon
    var m = modifier.minTouchTarget().height(32.dp)
    if (!selected && elevated) m = m.shadow(elevation = 2.dp, shape = shape, ambientColor = c.shadow, spotColor = c.shadow)
    m = m.clip(shape).background(container)
    if (!selected && !elevated) m = m.border(1.dp, c.muted, shape)
    m = m
        .selectable(selected = selected, role = role, onClick = onClick)
        .padding(start = if (leading != null) 10.dp else 14.dp, end = 14.dp)
    Row(modifier = m, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (leading != null) {
            Icon(imageVector = leading, contentDescription = null, modifier = Modifier.size(18.dp), tint = content)
        }
        Text(
            text = label,
            color = content,
            style = WatchdogTheme.type.body.sized(14, FontWeight.Bold),
            maxLines = 1,
            softWrap = false,
        )
    }
}

/**
 * Horizontally scrolling filter chips (`.mchips`): 8 dp gaps, 16 dp side padding inside the scroller.
 * The row is 48 dp tall with the 32 dp chips centred; to match the mockup's 14 dp gap above the chips,
 * give the row 6 dp of top padding. One option is selected at a time, so the row is a selectable group.
 */
@Composable
fun FilterChipsRow(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    elevatedUnselected: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp),
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .selectableGroup()
            .horizontalScroll(rememberScrollState())
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEachIndexed { index, label ->
            WdFilterChip(
                label = label,
                selected = index == selectedIndex,
                onClick = { onSelect(index) },
                elevated = elevatedUnselected,
            )
        }
    }
}

/** One segment of [WdSegmentedButtons]. The icon is replaced by a check while selected. */
@Immutable
data class SegmentOption(val label: String, val icon: ImageVector? = null)

/**
 * Segmented buttons (`.mseg`): equal columns, 48 dp tall, 24 dp radius, 1 dp border with 1 dp dividers;
 * the selected segment is indicator-filled with a leading check, 14 sp 700. Border and dividers are `muted`
 * for the same reason as the chips': they are the unselected segments' only boundary, and `mOutline` is
 * under 3:1 on the page in both themes.
 */
@Composable
fun WdSegmentedButtons(
    options: List<SegmentOption>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val shape = RoundedCornerShape(WatchdogDimens.buttonRadius)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(WatchdogDimens.buttonHeight)
            .clip(shape)
            .border(1.dp, c.muted, shape),
    ) {
        options.forEachIndexed { index, option ->
            if (index > 0) {
                Box(Modifier.width(1.dp).fillMaxHeight().background(c.muted))
            }
            val selected = index == selectedIndex
            val content = if (selected) c.mOnIndicator else c.ink2
            val icon = if (selected) WdIcons.Check else option.icon
            Row(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(if (selected) c.mIndicator else Color.Transparent)
                    .selectable(selected = selected, role = Role.RadioButton, onClick = { onSelect(index) }),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (icon != null) {
                    Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = content)
                }
                Text(
                    text = option.label,
                    color = content,
                    style = WatchdogTheme.type.body.sized(14, FontWeight.Bold),
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}
