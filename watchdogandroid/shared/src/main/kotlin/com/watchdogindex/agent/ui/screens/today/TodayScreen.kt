package com.watchdogindex.agent.ui.screens.today

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.PropertyChange
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.model.TaskAction
import com.watchdogindex.agent.core.model.TaskActionKind
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.Avatar
import com.watchdogindex.agent.ui.components.AvatarSizeSmall
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.IntelligenceTeaserCard
import com.watchdogindex.agent.ui.components.PropertyChangeRow
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SummaryCard
import com.watchdogindex.agent.ui.components.TaskRow
import com.watchdogindex.agent.ui.components.WatchdogFab
import com.watchdogindex.agent.ui.components.WatchdogNavigationBar
import com.watchdogindex.agent.ui.components.WatchdogSearchBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.listMargin
import com.watchdogindex.agent.ui.components.overflowTouchTarget
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.statusBarAllowance
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.Tab

/*
 * Today (the Home tab), spec §4.2: search bar with the account avatar, the date eyebrow and "Today", the
 * navy summary card, "Needs you" tasks, "Top changes", the Watchdog Intelligence teaser, the "Scan listing"
 * FAB and the navigation bar. The scroll padding is the mockup's 40 (status bar) / 128 (nav bar + 24).
 */

private const val SEARCH_HINT = "Search any NJ address"

/** The mockup's 24 dp gap between the last card and the navigation bar (`.scroll` bottom 128 = 104 + 24). */
private val scrollBottomGap = 24.dp

@Composable
fun TodayScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { TodayViewModel(graph.repos) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }

    val notice = (state as? TodayUiState.Ready)?.notice
    LaunchedEffect(notice) {
        if (notice != null) {
            snackbar.showSnackbar(notice)
            vm.clearNotice()
        }
    }

    val openSearch = { navigator.open(Route.Search()) }
    val openSettings = { navigator.open(Route.Settings) }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = { WatchdogNavigationBar(selected = Tab.Today, onSelect = navigator::switchTab) },
        floatingActionButton = {
            WatchdogFab(icon = WdIcons.QrCodeScanner, label = "Scan listing", onClick = { navigator.open(Route.Scan()) })
        },
    ) { inner ->
        val direction = LocalLayoutDirection.current
        val contentPadding = PaddingValues(
            start = inner.calculateStartPadding(direction),
            end = inner.calculateEndPadding(direction),
            top = statusBarAllowance(),
            bottom = inner.calculateBottomPadding() + scrollBottomGap,
        )
        when (val s = state) {
            TodayUiState.Loading -> TodaySkeleton(contentPadding, onSearch = openSearch, onAccount = openSettings)
            is TodayUiState.Error -> TodayError(s.userMessage, contentPadding, onRetry = vm::load, onSearch = openSearch, onAccount = openSettings)
            is TodayUiState.Ready -> PullToRefreshBox(
                isRefreshing = s.refreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                TodayContent(
                    state = s,
                    contentPadding = contentPadding,
                    onSearch = openSearch,
                    onAccount = openSettings,
                    onToggleTask = vm::setTaskDone,
                    onToggleAllTasks = vm::toggleAllTasks,
                    onToggleAllChanges = vm::toggleAllChanges,
                    onTaskAction = { action ->
                        val phone = action.phone
                        if (action.kind == TaskActionKind.Call && phone != null) platform.dial(phone) else navigator.open(action.route())
                    },
                    onChange = { change -> navigator.open(change.route()) },
                    onIntelligence = { navigator.open(Route.Intelligence) },
                )
            }
        }
    }
}

@Composable
private fun TodayContent(
    state: TodayUiState.Ready,
    contentPadding: PaddingValues,
    onSearch: () -> Unit,
    onAccount: () -> Unit,
    onToggleTask: (taskId: String, done: Boolean) -> Unit,
    onToggleAllTasks: () -> Unit,
    onToggleAllChanges: () -> Unit,
    onTaskAction: (TaskAction) -> Unit,
    onChange: (PropertyChange) -> Unit,
    onIntelligence: () -> Unit,
) {
    val digest = state.digest
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "search") { SearchRow(initials = state.initials, onSearch = onSearch, onAccount = onAccount) }
        item(key = "head") { PageHead(dateLabel = digest.dateLabel) }
        item(key = "summary") { SummaryCard(digest = digest, modifier = Modifier.cardMargin()) }

        item(key = "needs-you") {
            val showingAll = state.showAllTasks && state.hasMoreTasks
            ExpandableSectionHeader(
                title = "Needs you",
                linkLabel = if (showingAll) "Show fewer" else "${digest.needsYouCount} this week",
                linkContentDescription = when {
                    showingAll -> "Show fewer tasks"
                    state.hasMoreTasks -> "Show all ${digest.tasks.size} tasks"
                    else -> null
                },
                onLink = if (state.hasMoreTasks) onToggleAllTasks else null,
            )
        }
        item(key = "tasks") {
            val tasks = state.visibleTasks
            if (tasks.isEmpty()) {
                RowList(modifier = Modifier.listMargin()) {
                    WdRow(title = "Nothing needs you this week", supporting = "New tasks land here on Monday morning.", icon = WdIcons.TaskAlt, trailing = null)
                }
            } else {
                RowList(items = tasks, modifier = Modifier.listMargin(), dividerInset = 54.dp) { task ->
                    TaskRow(
                        task = task,
                        onToggle = { done -> onToggleTask(task.id, done) },
                        onAction = { onTaskAction(task.action) },
                    )
                }
            }
        }

        item(key = "top-changes") {
            val showingAll = state.showAllChanges && state.hasMoreChanges
            ExpandableSectionHeader(
                title = "Top changes",
                linkLabel = if (showingAll) "Show fewer" else "See all ${digest.total}",
                linkContentDescription = when {
                    showingAll -> "Show fewer changes"
                    state.hasMoreChanges -> "Show all ${digest.changes.size} changes"
                    else -> null
                },
                onLink = if (state.hasMoreChanges) onToggleAllChanges else null,
            )
        }
        item(key = "changes") {
            val changes = state.visibleChanges
            if (changes.isEmpty()) {
                RowList(modifier = Modifier.listMargin()) {
                    WdRow(title = "No changes this week", supporting = "Tax bills, permits, sales and town notices appear here.", icon = WdIcons.ReceiptLong, trailing = null)
                }
            } else {
                RowList(items = changes, modifier = Modifier.listMargin()) { change ->
                    PropertyChangeRow(change = change, onClick = { onChange(change) })
                }
            }
        }

        val teaser = digest.teaser
        if (teaser != null) {
            item(key = "intelligence") {
                IntelligenceTeaserCard(
                    text = teaser.text,
                    onAsk = onIntelligence,
                    onReadBrief = onIntelligence,
                    modifier = Modifier.cardMargin(),
                )
            }
        }
    }
}

/** The search bar (`.msearch`, margin 8 16 0) with the 40 dp account avatar as its trailing control. */
@Composable
private fun SearchRow(initials: String?, onSearch: () -> Unit, onAccount: () -> Unit) {
    WatchdogSearchBar(
        hint = SEARCH_HINT,
        onClick = onSearch,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp),
        trailing = { AccountAvatar(initials = initials, onClick = onAccount) },
    )
}

/**
 * The avatar drawn at its mockup size (40 dp) with a 48 dp touch box overflowing it, the same trick the task
 * tick uses, so the search bar keeps its 56 dp height. Null initials draw the loading placeholder.
 */
@Composable
private fun AccountAvatar(initials: String?, onClick: () -> Unit) {
    val c = WatchdogTheme.colors
    Box(modifier = Modifier.size(AvatarSizeSmall), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .requiredSize(WatchdogDimens.touchTarget)
                .clip(CircleShape)
                .clickable(onClick = onClick)
                .clearAndSetSemantics {
                    role = Role.Button
                    contentDescription = if (initials.isNullOrEmpty()) "Account and settings" else "Account $initials, settings"
                },
            contentAlignment = Alignment.Center,
        ) {
            if (initials == null) {
                Box(Modifier.size(AvatarSizeSmall).clip(CircleShape).background(c.fill2))
            } else {
                Avatar(initials = initials, size = AvatarSizeSmall)
            }
        }
    }
}

/** Page head (`.mhead`): 22 dp above, the upper-case 13 sp eyebrow (padding 0 20, 4 below) and the 30 sp headline. */
@Composable
private fun PageHead(dateLabel: String?) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxWidth().padding(top = 22.dp)) {
        if (dateLabel != null) {
            Text(
                text = dateLabel.uppercase(),
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 4.dp).semantics { contentDescription = dateLabel },
                color = c.muted,
                style = t.eyebrow,
            )
        } else {
            SkeletonBlock(width = 168.dp, height = 13.dp, radius = 6.dp, modifier = Modifier.padding(start = 20.dp, top = 3.dp, bottom = 6.dp))
        }
        Text(text = "Today", modifier = Modifier.padding(horizontal = 20.dp), color = c.ink, style = t.headline)
    }
}

/**
 * The shared `SectionHeader` (`.sec`) with one addition: the link can carry an accessible name that differs
 * from its visible label. "5 this week" and "See all 10" expand their list inline, so a screen reader should
 * hear what activating them does ("Show all 5 tasks, button"), not the count read as a button. The geometry
 * is the shared header's: padding 20 / [WatchdogDimens.sectionTop], 12 dp gap, baseline-aligned 21 dp link
 * with a 48 dp node overflowing it, 8 dp ripple radius. Candidate for a `linkContentDescription` parameter
 * on `SectionHeader` itself, after which this copy goes away.
 */
@Composable
private fun ExpandableSectionHeader(
    title: String,
    linkLabel: String?,
    linkContentDescription: String?,
    onLink: (() -> Unit)?,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = WatchdogDimens.sectionTop),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = title, modifier = Modifier.weight(1f).alignByBaseline(), color = c.ink, style = t.sectionTitle)
        if (linkLabel != null) {
            val link = if (onLink != null) {
                // The description replaces the merged label; `clearAndSetSemantics` sits after `clickable`
                // so the click action and role stay while the child text's semantics are dropped.
                val named = if (linkContentDescription != null) {
                    Modifier.clearAndSetSemantics {
                        role = Role.Button
                        contentDescription = linkContentDescription
                    }
                } else {
                    Modifier
                }
                Modifier
                    .overflowTouchTarget()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = onLink)
                    .then(named)
            } else {
                Modifier
            }
            Box(modifier = Modifier.alignByBaseline().then(link), contentAlignment = Alignment.Center) {
                Text(text = linkLabel, color = c.link, style = t.sectionLink, maxLines = 1)
            }
        }
    }
}

/** Loading: the chrome that needs no data, then quiet blocks in the shapes of the summary card and the two lists. */
@Composable
private fun TodaySkeleton(contentPadding: PaddingValues, onSearch: () -> Unit, onAccount: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading this week" },
    ) {
        SearchRow(initials = null, onSearch = onSearch, onAccount = onAccount)
        PageHead(dateLabel = null)
        SkeletonBlock(height = 178.dp, modifier = Modifier.cardMargin())
        SkeletonHeader()
        SkeletonBlock(height = WatchdogDimens.rowMinHeight * 3, modifier = Modifier.listMargin())
        SkeletonHeader()
        SkeletonBlock(height = WatchdogDimens.rowMinHeight * 4, modifier = Modifier.listMargin())
    }
}

@Composable
private fun SkeletonHeader() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = WatchdogDimens.sectionTop),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        SkeletonBlock(width = 128.dp, height = 20.dp, radius = 8.dp)
        SkeletonBlock(width = 84.dp, height = 15.dp, radius = 6.dp, modifier = Modifier.padding(top = 3.dp))
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

/** Error: the same head, then an inline card explaining the problem with a retry button. */
@Composable
private fun TodayError(
    userMessage: String,
    contentPadding: PaddingValues,
    onRetry: () -> Unit,
    onSearch: () -> Unit,
    onAccount: () -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        SearchRow(initials = "", onSearch = onSearch, onAccount = onAccount)
        PageHead(dateLabel = null)
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("This week")
            Text(text = "Your week didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}

/**
 * Where a task's trailing pill goes. Prefers the route the digest names ("clients?filter=checkup" opens Clients on
 * the Checkup ready chip, as the web does); falls back on the action kind, where "Review" means the checkups.
 */
private fun TaskAction.route(): Route {
    val named = route.orEmpty().removePrefix("/")
    return when {
        named.startsWith("property/") -> Route.Property(named.removePrefix("property/").substringBefore('?'))
        named.startsWith("clients") -> Route.Clients(ClientFilter.fromKey(named.queryValue("filter")))
        named.startsWith("marketing") -> Route.Marketing
        named.startsWith("farm") -> Route.Farm
        named.startsWith("intelligence") -> Route.Intelligence
        named.startsWith("scan") -> Route.Scan()
        else -> when (kind) {
            TaskActionKind.Review -> Route.Clients(ClientFilter.CheckupReady)
            TaskActionKind.Open -> Route.Marketing
            TaskActionKind.Send -> Route.Clients()
            TaskActionKind.Call -> Route.Clients()
        }
    }
}

/** The value of [key] in a route string's query ("clients?filter=checkup" → "checkup"), or null when it is not there. */
private fun String.queryValue(key: String): String? =
    substringAfter('?', "").split('&').firstOrNull { it.substringBefore('=') == key }?.substringAfter('=', "")?.takeIf { it.isNotEmpty() }

/** A "Top changes" row opens the home when it has a PIN; a town-wide change opens the farm it touches, or a search. */
private fun PropertyChange.route(): Route {
    val pin = pin
    return when {
        pin != null -> Route.Property(pin)
        relationship == Relationship.Farm -> Route.Farm
        else -> Route.Search(subtitle.substringBefore(" ·"))
    }
}
