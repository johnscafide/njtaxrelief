package com.watchdogindex.agent.ui.screens.property

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.ActionSpec
import com.watchdogindex.agent.ui.components.BottomActionArea
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.FactsCardView
import com.watchdogindex.agent.ui.components.RobustCardView
import com.watchdogindex.agent.ui.components.SalesCardView
import com.watchdogindex.agent.ui.components.ScoreCardView
import com.watchdogindex.agent.ui.components.SourcesNote
import com.watchdogindex.agent.ui.components.StatusChipView
import com.watchdogindex.agent.ui.components.TaxCardView
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.ValueCheckCardView
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.statusBarAllowance
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route

/*
 * Property detail (`S.property.android`, spec §3.21-3.29 / §4.3): a pushed screen with its own top bar
 * (back, bookmark_add, share, more_vert), the property header, then the score, tax, value check, sales,
 * home facts and ROBUST cards exactly as the components draw them, the sources note, and the pinned bottom
 * action area. `.scroll.pb-act`: the content ends 168 under the top of the action area (146 + 22).
 */

/** `.pb-act` is 168 on the mockup device, whose action area is 146: the content clears it by this much. */
private val ScrollBottomBeyondActions = 22.dp

@Composable
fun PropertyScreen(pin: String, navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel(key = "property/$pin") { PropertyViewModel(graph.repos, platform, pin) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }

    val ready = state as? PropertyUiState.Ready
    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (ready != null) {
                BottomActionArea(
                    primary = ActionSpec("Share true cost card", vm::shareTrueCost, WdIcons.Share),
                    secondaryLeft = ActionSpec("Send tax checkup", vm::sendCheckup, WdIcons.Send),
                    secondaryRight = ActionSpec(
                        label = if (ready.saved) "Saved to client" else "Save to client",
                        onClick = vm::toggleSaved,
                        icon = if (ready.saved) WdIcons.BookmarkAddFill else WdIcons.BookmarkAdd,
                    ),
                )
            }
        },
    ) { inner ->
        // The content scrolls under the action area, so only its bottom padding comes from the Scaffold.
        val contentPadding = PaddingValues(bottom = inner.calculateBottomPadding() + ScrollBottomBeyondActions)
        Column(modifier = Modifier.fillMaxSize().padding(top = statusBarAllowance())) {
            PropertyTopBar(ready = ready, vm = vm, onBack = navigator::back)
            when (val s = state) {
                PropertyUiState.Loading -> PropertySkeleton(contentPadding)
                is PropertyUiState.NotFound -> PropertyNotFound(
                    pin = s.pin,
                    contentPadding = contentPadding,
                    onSearch = { navigator.open(Route.Search()) },
                    onBack = navigator::back,
                )
                is PropertyUiState.Error -> PropertyError(userMessage = s.userMessage, contentPadding = contentPadding, onRetry = vm::load)
                is PropertyUiState.Ready -> PropertyContent(detail = s.detail, contentPadding = contentPadding)
            }
        }
    }
}

/**
 * The top bar (`.mbar`): back, an empty title, bookmark_add (filled once saved), share and more_vert. The
 * more_vert menu is anchored to a 48 dp box over the last action, so the dropdown opens under that button.
 */
@Composable
private fun PropertyTopBar(ready: PropertyUiState.Ready?, vm: PropertyViewModel, onBack: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val actions = if (ready == null) {
        emptyList()
    } else {
        listOf(
            TopBarAction(
                icon = if (ready.saved) WdIcons.BookmarkAddFill else WdIcons.BookmarkAdd,
                contentDescription = if (ready.saved) "Saved to your clients. Remove" else "Save to client",
                onClick = vm::toggleSaved,
            ),
            TopBarAction(WdIcons.Share, "Share this home", vm::shareLink),
            TopBarAction(WdIcons.MoreVert, "More options", vm::openMenu),
        )
    }
    Box(modifier = Modifier.fillMaxWidth()) {
        WatchdogTopBar(title = "", onBack = onBack, actions = actions)
        if (ready != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 4.dp, top = (WatchdogDimens.appBarHeight - WatchdogDimens.touchTarget) / 2)
                    .size(WatchdogDimens.touchTarget),
            ) {
                DropdownMenu(expanded = ready.menuOpen, onDismissRequest = vm::closeMenu) {
                    DropdownMenuItem(
                        text = { Text(text = if (ready.watched) "Stop watching this home" else "Watch this home", color = c.ink, style = t.body) },
                        onClick = vm::toggleWatched,
                        leadingIcon = {
                            Icon(
                                imageVector = if (ready.watched) WdIcons.VisibilityFill else WdIcons.Visibility,
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                                tint = c.ink2,
                            )
                        },
                        trailingIcon = if (ready.watched) {
                            { Icon(imageVector = WdIcons.Check, contentDescription = "Watching", modifier = Modifier.size(20.dp), tint = c.teal) }
                        } else {
                            null
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(text = "Open on the web", color = c.ink, style = t.body) },
                        onClick = vm::openOnWeb,
                        leadingIcon = { Icon(imageVector = WdIcons.OpenInNew, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.ink2) },
                    )
                }
            }
        }
    }
}

@Composable
private fun PropertyContent(detail: PropertyDetail, contentPadding: PaddingValues) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "header") { PropertyHeader(detail.summary) }
        detail.score?.let { score ->
            item(key = "score") { ScoreCardView(score = score, modifier = Modifier.cardMargin()) }
        }
        detail.tax?.let { tax ->
            item(key = "tax") { TaxCardView(tax = tax, modifier = Modifier.cardMargin()) }
        }
        detail.valueCheck?.let { value ->
            item(key = "value") { ValueCheckCardView(v = value, modifier = Modifier.cardMargin()) }
        }
        detail.sales?.let { sales ->
            item(key = "sales") { SalesCardView(s = sales, modifier = Modifier.cardMargin()) }
        }
        item(key = "facts") { FactsCardView(f = detail.facts, modifier = Modifier.cardMargin()) }
        if (detail.robust.isNotEmpty()) {
            item(key = "robust") { RobustCardView(dims = detail.robust, modifier = Modifier.cardMargin()) }
        }
        item(key = "sources") { SourcesNote(detail.sources) }
    }
}

/**
 * Property header (`.phead`, `.ptags`): padding 4 20 0, the 30 sp address, the 14 sp muted
 * "town · county · block, lot" line 6 below, and the chips 12 below (farm in sky with the map icon,
 * property class in neutral). Never an owner name.
 */
@Composable
private fun PropertyHeader(summary: PropertySummary) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 4.dp)) {
        Text(text = summary.address, color = c.ink, style = t.propertyTitle)
        Text(
            text = listOf(summary.town, summary.county, summary.blockLot).filter { it.isNotBlank() }.joinToString(" · "),
            modifier = Modifier.padding(top = 6.dp),
            color = c.muted,
            style = t.body.sized(14, FontWeight.Medium, 20.3),
        )
        FlowRow(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            summary.farmName?.let { farm ->
                StatusChipView(StatusChip(label = "$farm farm", tone = Tone.Sky, icon = "map"))
            }
            if (summary.propertyClassLabel.isNotBlank()) {
                StatusChipView(StatusChip(label = summary.propertyClassLabel, tone = Tone.Neutral))
            }
        }
    }
}

/** Loading: quiet blocks in the shapes of the header and the six cards. */
@Composable
private fun PropertySkeleton(contentPadding: PaddingValues) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading this home" },
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 4.dp)) {
            SkeletonBlock(width = 232.dp, height = 30.dp, radius = 10.dp, modifier = Modifier.padding(vertical = 1.5.dp))
            SkeletonBlock(width = 320.dp, height = 14.dp, radius = 6.dp, modifier = Modifier.padding(top = 9.dp, bottom = 3.dp))
            Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonBlock(width = 150.dp, height = WatchdogDimens.chipHeight, radius = 13.dp)
                SkeletonBlock(width = 122.dp, height = WatchdogDimens.chipHeight, radius = 13.dp)
            }
        }
        SkeletonBlock(height = 190.dp, modifier = Modifier.cardMargin())
        SkeletonBlock(height = 314.dp, modifier = Modifier.cardMargin())
        SkeletonBlock(height = 330.dp, modifier = Modifier.cardMargin())
        SkeletonBlock(height = 200.dp, modifier = Modifier.cardMargin())
        SkeletonBlock(height = 196.dp, modifier = Modifier.cardMargin())
        SkeletonBlock(height = 300.dp, modifier = Modifier.cardMargin())
    }
}

@Composable
private fun SkeletonBlock(
    height: Dp,
    modifier: Modifier = Modifier,
    width: Dp? = null,
    radius: Dp = WatchdogDimens.cardRadius,
) {
    val sized = if (width != null) modifier.width(width) else modifier.fillMaxWidth()
    Box(sized.height(height).clip(RoundedCornerShape(radius)).background(WatchdogTheme.colors.fill))
}

/** The PIN matched nothing: say so plainly and offer the address search or the way back. */
@Composable
private fun PropertyNotFound(pin: String, contentPadding: PaddingValues, onSearch: () -> Unit, onBack: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Property")
            Text(text = "We couldn’t find that home", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(
                text = "No parcel on the state tax list matches the reference $pin. It may have been merged, split or " +
                    "renumbered. Searching by address usually finds it.",
                modifier = Modifier.padding(top = 6.dp),
                color = c.ink2,
                style = t.body.sized(14, FontWeight.Normal, 20.3),
            )
            Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                WdPrimaryButton(label = "Search by address", onClick = onSearch, icon = WdIcons.Search, small = true)
                WdTonalButton(label = "Go back", onClick = onBack, small = true)
            }
        }
    }
}

/** Error: an inline card explaining the problem with a retry button. */
@Composable
private fun PropertyError(userMessage: String, contentPadding: PaddingValues, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Property")
            Text(text = "This home didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}
