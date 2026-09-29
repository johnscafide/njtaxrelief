package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme

/** Running total of a handle drag, kept out of composition state so the deltas do not recompose the sheet. */
private class DragTally {
    var total: Float = 0f
}

/**
 * Sheet drag handle (`.handle`): 32x4 outline pill centred in a 32 dp strip (14 dp above and below), so
 * the sheet keeps its mockup height. The strip carries a full-width 48 dp drag and tap area that overflows
 * it by 8 dp on each side. With [onDismiss] set, tapping the handle or dragging it down closes the sheet
 * and the handle is announced as [dismissLabel]; without it the handle is decorative.
 */
@Composable
fun BottomSheetHandle(
    modifier: Modifier = Modifier,
    onDismiss: (() -> Unit)? = null,
    dismissLabel: String = "Close",
) {
    val gesture = if (onDismiss != null) {
        val tally = remember { DragTally() }
        val density = LocalDensity.current
        // Dragging down by the target's height, or flicking down at 1000 dp/s, dismisses.
        val threshold = with(density) { WatchdogDimens.touchTarget.toPx() }
        val flingVelocity = with(density) { 1000.dp.toPx() }
        Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onDismiss,
            )
            .semantics { contentDescription = dismissLabel }
            .draggable(
                state = rememberDraggableState { delta -> tally.total += delta },
                orientation = Orientation.Vertical,
                onDragStarted = { tally.total = 0f },
                onDragStopped = { velocity -> if (tally.total > threshold || velocity > flingVelocity) onDismiss() },
            )
    } else {
        Modifier
    }
    Box(modifier = modifier.fillMaxWidth().height(32.dp), contentAlignment = Alignment.Center) {
        // The 48 dp area overflows the 32 dp strip on purpose, like the task tick's box.
        Box(
            modifier = Modifier.fillMaxWidth().requiredHeight(WatchdogDimens.touchTarget).then(gesture),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(width = 32.dp, height = 4.dp).background(WatchdogTheme.colors.mOutline, RoundedCornerShape(2.dp)))
        }
    }
}

/**
 * Standard bottom sheet surface (`.sheet.and`): surface color, 28 dp top radius, soft shadow, side
 * padding 16 and 6 dp plus the bottom inset below the content (the mockup's 30). Put a
 * [BottomSheetHandle] first in [content].
 */
@Composable
fun SheetSurface(
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = bottomChromeInsets(),
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = WatchdogTheme.colors
    val shape = RoundedCornerShape(topStart = WatchdogDimens.sheetRadius, topEnd = WatchdogDimens.sheetRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(elevation = 12.dp, shape = shape, clip = false, ambientColor = c.shadow, spotColor = c.shadow)
            .clip(shape)
            .background(c.surface)
            .windowInsetsPadding(windowInsets)
            .padding(start = 16.dp, end = 16.dp, bottom = 6.dp),
        content = content,
    )
}

/** Full-screen scrim (`.dim`) under a sheet. [onDismiss] makes a tap on it close the sheet, without a ripple. */
@Composable
fun Scrim(modifier: Modifier = Modifier, onDismiss: (() -> Unit)? = null) {
    val dismiss = if (onDismiss != null) {
        Modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClickLabel = "Dismiss",
            onClick = onDismiss,
        )
    } else {
        Modifier
    }
    Box(modifier.fillMaxSize().background(WatchdogTheme.colors.scrim).then(dismiss))
}
