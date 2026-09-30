package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.ui.nav.Tab

/*
 * App chrome: avatar, search bar, top app bar, navigation bar, FAB and the bottom action area.
 * Bottom chrome pads itself with [bottomChromeInsets] so it clears the gesture bar on device; the desktop
 * preview provides LocalBottomChromeInsets to reproduce the mockups' 24 dp allowance.
 */

/** Avatar (`.avatar`): navy circle, 2 dp inset gold ring, white 800 initials (15 sp; 14 sp at 40 dp). */
@Composable
fun Avatar(initials: String, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    val c = WatchdogTheme.colors
    val textSize = if (size < 44.dp) 14 else 15
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(c.navy)
            .border(2.dp, c.gold, CircleShape)
            .semantics { contentDescription = "Account $initials" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            color = c.onNavy,
            style = WatchdogTheme.type.body.sized(textSize, FontWeight.ExtraBold, textSize.toDouble(), em(textSize, 0.02)),
            maxLines = 1,
            softWrap = false,
        )
    }
}

/**
 * Search bar (`.msearch`): 56 dp, 28 dp radius, container-high fill, 22 dp leading icon, 16 sp hint,
 * 18 dp start and 6 dp end padding, an optional trailing [Avatar] or icon button. [emphasized] draws the
 * text in ink 700 and [elevated] switches to a surface fill with a soft shadow (the Farm overlay).
 */
@Composable
fun WatchdogSearchBar(
    hint: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector = WdIcons.Search,
    emphasized: Boolean = false,
    elevated: Boolean = false,
    trailing: @Composable (() -> Unit)? = null,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(28.dp)
    var m = modifier.fillMaxWidth().height(WatchdogDimens.searchBarHeight)
    if (elevated) m = m.shadow(elevation = 4.dp, shape = shape, ambientColor = c.shadow, spotColor = c.shadow)
    m = m
        .clip(shape)
        .background(if (elevated) c.surface else c.mHigh)
        .clickable(role = Role.Button, onClick = onClick)
        .padding(start = 18.dp, end = 6.dp)
    val ink = if (emphasized) c.ink else c.muted
    Row(modifier = m, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = leadingIcon, contentDescription = null, modifier = Modifier.size(22.dp), tint = ink)
        Text(
            text = hint,
            modifier = Modifier.weight(1f),
            color = ink,
            style = if (emphasized) t.searchHint.copy(fontWeight = FontWeight.Bold) else t.searchHint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        trailing?.invoke()
    }
}

/** A trailing action of [WatchdogTopBar]: a 48 dp icon button. */
@Immutable
data class TopBarAction(val icon: ImageVector, val contentDescription: String, val onClick: () -> Unit)

/**
 * Top app bar (`.mbar`): 64 dp, transparent, 4 dp side padding and gaps, 48 dp icon buttons, 22 sp 700
 * title (x = 60 with a back button, 8 without). No elevation or divider.
 */
@Composable
fun WatchdogTopBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    actions: List<TopBarAction> = emptyList(),
    backIcon: ImageVector = WdIcons.ArrowBack,
    backDescription: String = "Back",
) {
    WatchdogTopBar(
        title = AnnotatedString(title),
        modifier = modifier,
        onBack = onBack,
        actions = actions,
        backIcon = backIcon,
        backDescription = backDescription,
    )
}

/** [WatchdogTopBar] with a styled title, e.g. `Intelligence.productName()` for the spectrum word. */
@Composable
fun WatchdogTopBar(
    title: AnnotatedString,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    actions: List<TopBarAction> = emptyList(),
    backIcon: ImageVector = WdIcons.ArrowBack,
    backDescription: String = "Back",
) {
    val c = WatchdogTheme.colors
    Row(
        modifier = modifier.fillMaxWidth().height(WatchdogDimens.appBarHeight).padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            WdIconButton(icon = backIcon, contentDescription = backDescription, onClick = onBack)
        }
        Text(
            text = title,
            modifier = Modifier.weight(1f).padding(start = 4.dp),
            color = c.ink,
            style = WatchdogTheme.type.appBarTitle,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        actions.forEach { action ->
            WdIconButton(icon = action.icon, contentDescription = action.contentDescription, onClick = action.onClick)
        }
    }
}

/**
 * The top bar with an inline search field in place of the title (`.mbar` while a screen's search action is
 * open): a back button that closes the search, the 16 sp field showing [placeholder] until there is text,
 * and a clear button while there is. The field takes focus when the bar appears and is announced as
 * [fieldDescription]; with [onSearch] the keyboard's action key is Search and runs it. Same 64 dp frame and
 * 4 dp gutters as [WatchdogTopBar], so swapping the two does not move the content below.
 */
@Composable
fun SearchTopBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClose: () -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    fieldDescription: String = placeholder,
    closeDescription: String = "Close search",
    clearDescription: String = "Clear search",
    onSearch: (() -> Unit)? = null,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(
        modifier = modifier.fillMaxWidth().height(WatchdogDimens.appBarHeight).padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WdIconButton(icon = WdIcons.ArrowBack, contentDescription = closeDescription, onClick = onClose)
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier
                .weight(1f)
                .padding(start = 4.dp)
                .focusRequester(focus)
                .semantics { contentDescription = fieldDescription },
            textStyle = t.searchHint.copy(color = c.ink),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = if (onSearch != null) ImeAction.Search else ImeAction.Default),
            keyboardActions = KeyboardActions(onSearch = { onSearch?.invoke() }),
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                Box {
                    if (query.isEmpty()) {
                        Text(text = placeholder, color = c.muted, style = t.searchHint, maxLines = 1)
                    }
                    inner()
                }
            },
        )
        if (query.isNotEmpty()) {
            WdIconButton(icon = WdIcons.Cancel, contentDescription = clearDescription, onClick = { onQueryChange("") })
        }
    }
}

/** The nav bar's content height: the mockup's 104 dp minus its 24 dp gesture area, which the real inset adds back. */
private val NavBarContentHeight: Dp = 80.dp

/**
 * Navigation bar (`.nav-m`): four equal columns on the container color, each a 64x32 indicator (16 dp
 * radius, filled with mIndicator and the filled icon when selected) 12 dp from the top, a 4 dp gap and the
 * 12 sp label (600 muted; 800 ink when selected). Drawn by hand rather than with Material's NavigationBar
 * so the icon sits exactly where the mockup puts it (Material centres the stack about 2 dp lower). 80 dp
 * plus the bottom inset, which is the mockup's 104 dp with a 24 dp gesture area; every column is a
 * full-height tab target.
 */
@Composable
fun WatchdogNavigationBar(
    selected: Tab,
    onSelect: (Tab) -> Unit,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = bottomChromeInsets(),
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(c.mContainer)
            .windowInsetsPadding(windowInsets)
            .height(NavBarContentHeight)
            .selectableGroup(),
    ) {
        Tab.entries.forEach { tab ->
            val isSelected = tab == selected
            val outlined = WdIcons.byName(tab.icon) ?: WdIcons.Home
            val filled = WdIcons.byName(tab.icon + "_fill") ?: outlined
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(top = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 64.dp, height = 32.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isSelected) c.mIndicator else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isSelected) filled else outlined,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = if (isSelected) c.mOnIndicator else c.ink2,
                    )
                }
                Text(
                    text = tab.label,
                    modifier = Modifier.padding(top = 4.dp),
                    color = if (isSelected) c.ink else c.muted,
                    style = if (isSelected) t.navLabelSelected else t.navLabel,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

/**
 * Extended FAB (`.fab`): 56 dp, 16 dp radius, mFab/mOnFab, 24 dp icon and 15 sp 700 label. With a null
 * [label] it is the 56 dp square FAB (`.fab.sq`). [elevated] false removes the shadow, as inside the
 * Intelligence composer bar. Icon-only FABs need a [contentDescription].
 */
@Composable
fun WatchdogFab(
    icon: ImageVector,
    label: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = label,
    elevated: Boolean = true,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(WatchdogDimens.fabRadius)
    val elevation = if (elevated) {
        FloatingActionButtonDefaults.elevation()
    } else {
        FloatingActionButtonDefaults.elevation(defaultElevation = 0.dp, pressedElevation = 0.dp, focusedElevation = 0.dp, hoveredElevation = 0.dp)
    }
    if (label != null) {
        val described = if (contentDescription != null && contentDescription != label) {
            modifier.semantics { this.contentDescription = contentDescription }
        } else {
            modifier
        }
        ExtendedFloatingActionButton(
            text = { Text(text = label, style = t.buttonSmall, maxLines = 1, softWrap = false) },
            icon = { Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(24.dp)) },
            onClick = onClick,
            modifier = described,
            shape = shape,
            containerColor = c.mFab,
            contentColor = c.mOnFab,
            elevation = elevation,
        )
    } else {
        FloatingActionButton(
            onClick = onClick,
            modifier = modifier.size(WatchdogDimens.fabHeight),
            shape = shape,
            containerColor = c.mFab,
            contentColor = c.mOnFab,
            elevation = elevation,
        ) {
            Icon(imageVector = icon, contentDescription = contentDescription, modifier = Modifier.size(24.dp))
        }
    }
}

/** A labelled action for [BottomActionArea]. */
@Immutable
data class ActionSpec(val label: String, val onClick: () -> Unit, val icon: ImageVector? = null)

/**
 * Bottom action area (`.actbar.m`): container color, 1 dp line on top, padding 12 16 (6 + inset below),
 * a full-width primary button and two small tonal buttons in equal columns. 146 dp tall with the
 * mockup's 24 dp gesture inset.
 */
@Composable
fun BottomActionArea(
    primary: ActionSpec,
    secondaryLeft: ActionSpec,
    secondaryRight: ActionSpec,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = bottomChromeInsets(),
) {
    val c = WatchdogTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(c.mContainer)
            .topSeparator(c.line)
            .windowInsetsPadding(windowInsets)
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        WdPrimaryButton(label = primary.label, onClick = primary.onClick, modifier = Modifier.fillMaxWidth(), icon = primary.icon)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WdTonalButton(label = secondaryLeft.label, onClick = secondaryLeft.onClick, modifier = Modifier.weight(1f), icon = secondaryLeft.icon, small = true)
            WdTonalButton(label = secondaryRight.label, onClick = secondaryRight.onClick, modifier = Modifier.weight(1f), icon = secondaryRight.icon, small = true)
        }
    }
}

/** The three avatar sizes the mockups use: 40 dp in the search bar and Settings, 44 dp base, 52 dp hero. */
val AvatarSizeSmall: Dp = 40.dp
val AvatarSizeDefault: Dp = 44.dp
val AvatarSizeLarge: Dp = 52.dp
