package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.core.model.AgentTask
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.PropertyChange
import com.watchdogindex.agent.core.model.TaskAction
import com.watchdogindex.agent.core.model.TaskActionKind
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/**
 * List container (`.rows`): surface, 24 dp radius, 1 dp line border, children clipped. Rows inside draw
 * no separators of their own; use the `items` overload or [RowSeparator] between rows.
 */
@Composable
fun RowList(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = WatchdogTheme.colors
    val shape = RoundedCornerShape(WatchdogDimens.cardRadius)
    Column(
        modifier = modifier.fillMaxWidth().clip(shape).background(c.surface).border(1.dp, c.line, shape),
        content = content,
    )
}

/**
 * [RowList] that lays out [items] with a 1 dp separator drawn along the top edge of every row after the
 * first, inset [dividerInset] from the start (66 dp for tile rows, 54 dp for task and follow-up rows).
 * The separator is drawn inside the row so row heights stay at their minimum.
 */
@Composable
fun <T> RowList(
    items: List<T>,
    modifier: Modifier = Modifier,
    dividerInset: Dp = 66.dp,
    row: @Composable (T) -> Unit,
) {
    val separator = WatchdogTheme.colors.separator
    RowList(modifier) {
        items.forEachIndexed { index, item ->
            if (index == 0) {
                row(item)
            } else {
                Box(Modifier.fillMaxWidth().topSeparator(separator, dividerInset)) { row(item) }
            }
        }
    }
}

/** A standalone 1 dp separator inset from the start, for hand-built lists. */
@Composable
fun RowSeparator(inset: Dp = 66.dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(start = inset).heightIn(min = 1.dp).background(WatchdogTheme.colors.separator))
}

/** Square icon tile (`.tile`): 40 dp, 12 dp radius, 22 dp icon, tinted by meaning. */
@Composable
fun IconTile(
    tint: TileTint,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    size: Dp = WatchdogDimens.tileSize,
    radius: Dp = WatchdogDimens.tileRadius,
    iconSize: Dp = 22.dp,
) {
    val (container, ink) = tint.colors()
    Box(
        modifier = modifier.size(size).clip(RoundedCornerShape(radius)).background(container),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(iconSize), tint = ink)
    }
}

/** The trailing chevron used by list rows: `chevron_right` 22 dp, muted. */
@Composable
fun RowChevron(modifier: Modifier = Modifier) {
    Icon(
        imageVector = WdIcons.ChevronRight,
        contentDescription = null,
        modifier = modifier.size(22.dp),
        tint = WatchdogTheme.colors.muted,
    )
}

/**
 * List row (`.row`): 40 dp tile column, title (15 sp 700) and supporting line (13 sp 500 muted), trailing
 * slot (chevron by default), min height 66, padding 11x14, 12 dp gaps. Pass [tile] with [icon] for the
 * tinted tile; [icon] alone draws a bare 22 dp icon in the 40 dp column.
 */
@Composable
fun WdRow(
    title: String,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    tile: TileTint? = null,
    icon: ImageVector? = null,
    onClick: (() -> Unit)? = null,
    minHeight: Dp = WatchdogDimens.rowMinHeight,
    trailing: @Composable (() -> Unit)? = { RowChevron() },
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val click = if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(click)
            .heightIn(min = minHeight)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (tile != null) {
            IconTile(tint = tile, icon = icon ?: WdIcons.Home)
        } else if (icon != null) {
            Box(Modifier.size(WatchdogDimens.tileSize), contentAlignment = Alignment.Center) {
                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.ink2)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = c.ink, style = t.rowTitle)
            if (supporting != null) {
                Text(text = supporting, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.rowSupport)
            }
        }
        trailing?.invoke()
    }
}

/** A "Top changes" row: tinted tile with the change's Material Symbols icon, title, subtitle and chevron. */
@Composable
fun PropertyChangeRow(change: PropertyChange, onClick: () -> Unit, modifier: Modifier = Modifier) {
    WdRow(
        title = change.title,
        modifier = modifier,
        supporting = change.subtitle,
        tile = change.tile,
        icon = iconByName(change.icon, WdIcons.ReceiptLong),
        onClick = onClick,
    )
}

/**
 * Task row (`.row.tk`): 24 dp ring tick in a 28 dp column, title and subtitle, trailing 44 dp tonal pill
 * with the action label or a call icon. Separator inset for these rows is 54 dp.
 * The tick's touch box is 48 dp and overflows its column on purpose so the row stays 66 dp tall.
 */
@Composable
fun TaskRow(
    task: AgentTask,
    onToggle: (Boolean) -> Unit,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = WatchdogDimens.rowMinHeight)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .requiredSize(48.dp)
                    .clip(CircleShape)
                    .toggleable(value = task.done, role = Role.Checkbox, onValueChange = onToggle)
                    .semantics { contentDescription = task.title },
                contentAlignment = Alignment.Center,
            ) {
                val ring = if (task.done) {
                    Modifier.background(c.primary, CircleShape)
                } else {
                    Modifier.border(2.dp, c.fill2, CircleShape)
                }
                Box(modifier = Modifier.size(24.dp).then(ring), contentAlignment = Alignment.Center) {
                    if (task.done) {
                        Icon(imageVector = WdIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp), tint = c.onPrimary)
                    }
                }
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = task.title, color = c.ink, style = t.rowTitle)
            Text(text = task.subtitle, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.rowSupport)
        }
        TaskPill(action = task.action, onClick = onAction)
    }
}

/** The task row's trailing pill (`.tka`): min 44x44, 22 dp radius, tonal; label 14 sp 700 or a 20 dp call icon. */
@Composable
fun TaskPill(action: TaskAction, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val isCall = action.kind == TaskActionKind.Call
    val label = action.label
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .widthIn(min = 44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(c.tint)
            .clickable(role = Role.Button, onClick = onClick)
            .then(if (label != null && !isCall) Modifier.padding(horizontal = 14.dp) else Modifier),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isCall) {
            Icon(
                imageVector = WdIcons.Call,
                contentDescription = label ?: "Call",
                modifier = Modifier.size(20.dp),
                tint = c.onTint,
            )
        } else {
            Text(
                text = label ?: action.kind.name,
                color = c.onTint,
                style = t.body.sized(14, FontWeight.Bold),
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

/**
 * Client row (`.row.cl`): 40 dp home tile, address and status chip on one line (address ellipsized),
 * meta line (town, relationship, CRM reference) and the next-action line (18 dp icon, 14 sp 700 link;
 * muted 600 with no icon when there is nothing new). Never shows an owner name.
 */
@Composable
fun ClientRowView(
    row: ClientRow,
    onClick: () -> Unit,
    onNextAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = WatchdogDimens.rowMinHeight)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        IconTile(tint = row.tile, icon = WdIcons.Home)
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = row.address,
                    modifier = Modifier.weight(1f),
                    color = c.ink,
                    style = t.rowTitle,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                row.status?.let { StatusChipView(it) }
            }
            Text(text = row.metaLine, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.rowSupport)
            val next = row.nextAction
            val actionable = next.kind != NextActionKind.None
            val icon = when (next.kind) {
                NextActionKind.Call -> WdIcons.Call
                NextActionKind.Send -> WdIcons.Send
                NextActionKind.Mail -> WdIcons.Mail
                NextActionKind.Edit -> WdIcons.Edit
                NextActionKind.None -> null
            }
            val click = if (actionable) Modifier.clickable(role = Role.Button, onClick = onNextAction) else Modifier
            Row(
                modifier = Modifier.padding(top = 6.dp).heightIn(min = 28.dp).then(click),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (icon != null) {
                    Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.link)
                }
                Text(
                    text = next.label,
                    color = if (actionable) c.link else c.muted,
                    style = t.body.sized(14, if (actionable) FontWeight.Bold else FontWeight.SemiBold),
                )
            }
        }
    }
}
