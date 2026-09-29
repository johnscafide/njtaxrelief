package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme

/** Sheet drag handle (`.handle`): 32x4 outline pill, centred, 14 dp above and below. */
@Composable
fun BottomSheetHandle(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(width = 32.dp, height = 4.dp).background(WatchdogTheme.colors.mOutline, RoundedCornerShape(2.dp)))
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
