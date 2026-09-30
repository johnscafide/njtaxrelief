package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import kotlin.math.roundToInt

/*
 * Buttons follow the mockup's `.btn` rather than Material's Button defaults: 48 dp min height, 24 dp
 * radius, 16 sp 700 (15 sp for the small variant), 20 dp icon, 8 dp gap, 20 dp side padding (16 small).
 * The label is one line that never wraps or clips (CSS `white-space: nowrap`): see [NoWrapLine].
 */

@Composable
private fun WdButtonBase(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier,
    container: Color,
    content: Color,
    border: Color?,
    icon: ImageVector?,
    small: Boolean,
    enabled: Boolean,
) {
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(WatchdogDimens.buttonRadius)
    val style = if (small) t.buttonSmall else t.button
    var m = modifier
        .heightIn(min = WatchdogDimens.buttonHeight)
        .alpha(if (enabled) 1f else .5f)
        .clip(shape)
        .background(container)
    if (border != null) m = m.border(1.dp, border, shape)
    m = m.clickable(enabled = enabled, role = Role.Button, onClick = onClick)
    NoWrapLine(
        modifier = m,
        sidePadding = if (small) 16.dp else 20.dp,
        minScale = MinButtonFontSize.value / style.fontSize.value,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = content)
            }
            Text(text = label, color = content, style = style, maxLines = 1, softWrap = false)
        }
    }
}

/** The app's type floor: a button label is never drawn smaller than this. */
private val MinButtonFontSize = 12.sp

/** The least side padding a squeezed label keeps before the line starts to scale. */
private val MinButtonSidePadding = 8.dp

/**
 * One line that never wraps or clips, the way the mockup's `white-space: nowrap` buttons behave on their
 * frame: the content sits at its natural size with [sidePadding] each side when the button is wide enough;
 * when it is not, it stays centred and the padding takes the squeeze (the "Send tax checkup" label spills
 * 1 dp into its 16 dp padding at 412 dp, as it does in the mockup); and only when even
 * [MinButtonSidePadding] is not enough is the whole line scaled down uniformly, never below [minScale]
 * (the 12 sp floor), so a long label on a narrow screen shrinks a little instead of losing letters. The
 * touch target, the button's size and the semantics are unchanged; a plain [Layout], so parents may still
 * ask for intrinsic sizes.
 */
@Composable
private fun NoWrapLine(modifier: Modifier, sidePadding: Dp, minScale: Float, content: @Composable () -> Unit) {
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val pad = sidePadding.roundToPx()
        val minPad = MinButtonSidePadding.roundToPx()
        // Natural size: an unbounded width, so the label reports its full single-line width.
        val line = measurables.first().measure(Constraints(maxHeight = constraints.maxHeight))
        val wanted = line.width + 2 * pad
        val width = if (constraints.hasBoundedWidth) constraints.constrainWidth(wanted) else maxOf(wanted, constraints.minWidth)
        val room = (width - 2 * minPad).coerceAtLeast(0)
        val scale = if (line.width <= room) 1f else maxOf(minScale, room.toFloat() / line.width)
        val height = constraints.constrainHeight(line.height)
        layout(width, height) {
            val x = ((width - line.width * scale) / 2f).roundToInt()
            val y = (height - line.height) / 2
            if (scale == 1f) {
                line.placeRelative(x, y)
            } else {
                line.placeRelativeWithLayer(x, y) {
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0f, 0.5f)
                }
            }
        }
    }
}

/** Filled button (`.btn.primary`): primary on onPrimary (navy/white in light, pale/navy in dark). */
@Composable
fun WdPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    small: Boolean = false,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    WdButtonBase(label, onClick, modifier, c.primary, c.onPrimary, null, icon, small, enabled)
}

/** Tonal button (`.btn.tint`): tint container with onTint text. */
@Composable
fun WdTonalButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    small: Boolean = false,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    WdButtonBase(label, onClick, modifier, c.tint, c.onTint, null, icon, small, enabled)
}

/** Outlined button (`.btn.outl`): transparent, ink text, 1 dp Material outline. */
@Composable
fun WdOutlinedButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    small: Boolean = false,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    WdButtonBase(label, onClick, modifier, Color.Transparent, c.ink, c.mOutline, icon, small, enabled)
}

/** Icon button (`.mib`): 48 dp round target, 24 dp icon in ink. [contentDescription] is required: there is no label. */
@Composable
fun WdIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = WatchdogTheme.colors.ink,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .size(WatchdogDimens.touchTarget)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(24.dp).alpha(if (enabled) 1f else .5f),
            tint = tint,
        )
    }
}

/** Round tonal icon button (`.btn.tint.rnd`): 48 dp circle, tint container, 20 dp onTint icon. */
@Composable
fun WdRoundTonalIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    Box(
        modifier = modifier
            .size(WatchdogDimens.touchTarget)
            .alpha(if (enabled) 1f else .5f)
            .clip(CircleShape)
            .background(c.tint)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = contentDescription, modifier = Modifier.size(20.dp), tint = c.onTint)
    }
}

/**
 * Material 3 switch styled per the mockup (`.sw-m`): 52x32 track with a 2 dp outline, 16 dp outline thumb
 * when off; primary track, 24 dp onPrimary thumb with an 18 dp check when on. Pass null for
 * [onCheckedChange] when an enclosing row is the toggle (the switch then only displays state).
 */
@Composable
fun WdSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        thumbContent = if (checked) {
            { Icon(imageVector = WdIcons.Check, contentDescription = null, modifier = Modifier.size(18.dp)) }
        } else {
            null
        },
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedThumbColor = c.onPrimary,
            checkedTrackColor = c.primary,
            checkedBorderColor = c.primary,
            checkedIconColor = c.primary,
            uncheckedThumbColor = c.mOutline,
            uncheckedTrackColor = c.mHigh,
            uncheckedBorderColor = c.mOutline,
            uncheckedIconColor = c.mHigh,
        ),
    )
}
