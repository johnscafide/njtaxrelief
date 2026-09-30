package com.watchdogindex.agent.ui.screens.clients

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.platform.PlatformServices
import com.watchdogindex.agent.ui.components.BottomSheetHandle
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.CheckupSeasonCard
import com.watchdogindex.agent.ui.components.ClientRowView
import com.watchdogindex.agent.ui.components.FilterChipsRow
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.components.OptionRow
import com.watchdogindex.agent.ui.components.ReadBox
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.WatchdogFab
import com.watchdogindex.agent.ui.components.WatchdogNavigationBar
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.topSeparator
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.Tab

/*
 * Clients (tab), spec §4.5: the top bar ("Clients", search and tune), the checkup season banner, the filter
 * chips, the client rows and the "Add clients" FAB over the navigation bar. Scroll padding is the mockup's
 * 40 (status bar) at the top and, at the bottom, the nav bar plus room for the FAB (see [scrollBottomGap]).
 * Rows lead with the home and the agent's CRM reference; no owner
 * name is ever shown. Every next-action line acts: Call dials, Send records the checkup and drafts the
 * email with its link, Mail and Edit open the mail composer, and a swipe snoozes a row until Monday.
 */

/**
 * Room under the last row for the extended FAB, which Scaffold floats 16 dp above the navigation bar: 16 dp
 * of gap, the 56 dp button and 16 dp more, so the last row's next-action line is never left behind it. The
 * mockup's `.scroll` bottom (128 = 104 + 24) is smaller, but its 24 dp would end the list under the FAB.
 */
private val scrollBottomGap = 16.dp + WatchdogDimens.fabHeight + 16.dp

/** `.mchips` padding-top 14 minus the 8 dp of slack above a 32 dp chip in its 48 dp row. */
private val chipsTopPadding = 6.dp

/** `.rows` margin-top 10 minus the 8 dp of slack below the chips. */
private val listTopPadding = 2.dp

/**
 * [initialFilter] is the chip the route asks for (`Route.Clients(filter)`); the list opens on it, and a new filter
 * arriving on the same screen (the Android host replaces the arguments of the Clients entry already on top)
 * re-selects it once. Null leaves the tab on its own state.
 */
@Composable
fun ClientsScreen(navigator: Navigator, initialFilter: ClientFilter? = null) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { ClientsViewModel(graph.repos, initialFilter) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }
    val ready = state as? ClientsUiState.Ready

    LaunchedEffect(initialFilter) { vm.requestFilter(initialFilter) }
    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }
    LaunchedEffect(ready?.emailDraft) {
        val draft = ready?.emailDraft ?: return@LaunchedEffect
        platform.composeEmail(null, draft.subject, draft.body)
        vm.clearEmailDraft()
    }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = { WatchdogNavigationBar(selected = Tab.Clients, onSelect = navigator::switchTab) },
        floatingActionButton = {
            WatchdogFab(icon = WdIcons.PersonAdd, label = "Add clients", onClick = { vm.openSheet(ClientsSheet.AddClients) })
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
            ClientsUiState.Loading -> ClientsSkeleton(contentPadding)
            is ClientsUiState.Error -> ClientsError(s.userMessage, contentPadding, onRetry = vm::load)
            is ClientsUiState.Ready -> PullToRefreshBox(
                isRefreshing = s.refreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                ClientsContent(
                    state = s,
                    contentPadding = contentPadding,
                    vm = vm,
                    onOpen = { row -> row.pin?.let { navigator.open(Route.Property(it)) } ?: navigator.open(Route.Search(row.address)) },
                    onNextAction = { row -> runNextAction(row, vm, platform, navigator) },
                )
            }
        }
    }

    if (ready != null) {
        when (ready.sheet) {
            ClientsSheet.ReviewCheckups -> ReviewCheckupsSheet(ready, onSend = vm::sendAllReadyCheckups, onDismiss = vm::closeSheet)
            ClientsSheet.AddClients -> AddClientsSheet(ready, vm = vm, onDismiss = vm::closeSheet)
            ClientsSheet.SortFilter -> SortFilterSheet(ready, vm = vm, onDismiss = vm::closeSheet)
            null -> Unit
        }
    }
}

/** What the next-action line does per kind. Nothing is a dead link: a call without a number opens the home. */
private fun runNextAction(row: ClientRow, vm: ClientsViewModel, platform: PlatformServices, navigator: Navigator) {
    val next = row.nextAction
    when (next.kind) {
        NextActionKind.Call -> {
            val phone = next.phone
            if (phone != null) platform.dial(phone) else row.pin?.let { navigator.open(Route.Property(it)) }
        }
        NextActionKind.Send -> vm.sendCheckup(row)
        NextActionKind.Mail -> platform.composeEmail(
            null,
            "About ${row.address}",
            "Hi,\n\nI keep an eye on ${row.address} in ${row.town} and saw some news worth passing on. Happy to talk it through whenever suits you.\n\n",
        )
        NextActionKind.Edit -> platform.composeEmail(
            null,
            "Happy anniversary at ${row.address}",
            "Hi,\n\nHappy home anniversary at ${row.address}! I hope ${row.town} has been good to you. If you ever want a fresh look at the home’s taxes or value, I’m glad to help.\n\n",
        )
        NextActionKind.None -> Unit
    }
}

// ---------------------------------------------------------------------- content

@Composable
private fun ClientsContent(
    state: ClientsUiState.Ready,
    contentPadding: PaddingValues,
    vm: ClientsViewModel,
    onOpen: (ClientRow) -> Unit,
    onNextAction: (ClientRow) -> Unit,
) {
    val rows = state.visibleRows
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "bar") {
            if (state.searchOpen) {
                SearchTopBar(query = state.query, onQueryChange = vm::setQuery, onClose = { vm.setSearchOpen(false) })
            } else {
                WatchdogTopBar(
                    title = "Clients",
                    actions = listOf(
                        TopBarAction(WdIcons.Search, "Search clients") { vm.setSearchOpen(true) },
                        TopBarAction(WdIcons.Tune, "Sort and filter") { vm.openSheet(ClientsSheet.SortFilter) },
                    ),
                )
            }
        }
        val season = state.overview.season
        if (season != null) {
            item(key = "season") {
                CheckupSeasonCard(season = season, onCta = { vm.openSheet(ClientsSheet.ReviewCheckups) }, modifier = Modifier.cardMargin())
            }
        }
        item(key = "chips") {
            FilterChipsRow(
                options = state.chipLabels,
                selectedIndex = state.filter.ordinal,
                onSelect = { index -> vm.setFilter(ClientFilter.entries[index]) },
                modifier = Modifier.padding(top = chipsTopPadding),
            )
        }
        if (rows.isEmpty()) {
            item(key = "empty") {
                RowList(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = listTopPadding)) {
                    WdRow(
                        title = if (state.query.isNotEmpty()) "No homes match “${state.query}”" else "No homes here yet",
                        supporting = when {
                            state.query.isNotEmpty() -> "Search by street, town or CRM reference."
                            state.onlyWithNews -> "Nothing new this week in this group."
                            else -> "Add clients from your contacts or a CSV."
                        },
                        icon = WdIcons.Group,
                        trailing = null,
                    )
                }
            }
        } else {
            // One lazy item per home, drawn as one continuous `.rows` container (rounded top on the first,
            // rounded bottom on the last), so a 146-row list never composes all at once.
            itemsIndexed(items = rows, key = { _, row -> row.id }) { index, row ->
                RowListSegment(
                    first = index == 0,
                    last = index == rows.lastIndex,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = if (index == 0) listTopPadding else 0.dp),
                ) {
                    SnoozableClientRow(
                        row = row,
                        onClick = { onOpen(row) },
                        onNextAction = { onNextAction(row) },
                        onSnooze = { vm.snooze(row) },
                    )
                }
            }
        }
    }
}

/**
 * A client row that swipes from the end to snooze until Monday; quiet rows have nothing to snooze and do not
 * swipe. The swipe is gesture-only, so the same snooze is offered as an accessibility action on the row for
 * TalkBack and switch access.
 */
@Composable
private fun SnoozableClientRow(row: ClientRow, onClick: () -> Unit, onNextAction: () -> Unit, onSnooze: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val snoozable = row.nextAction.kind != NextActionKind.None
    val rowModifier = if (snoozable) {
        Modifier.semantics {
            customActions = listOf(
                CustomAccessibilityAction(label = "Snooze until Monday") {
                    onSnooze()
                    true
                },
            )
        }
    } else {
        Modifier
    }
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) onSnooze()
            // The row springs back either way; the reload shows it as snoozed.
            false
        },
    )
    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Row(
                modifier = Modifier.fillMaxSize().background(c.tint).padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = WdIcons.Snooze, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.onTint)
                Spacer(Modifier.width(8.dp))
                Text(text = "Snooze until Monday", color = c.onTint, style = t.body.sized(14, FontWeight.Bold))
            }
        },
        modifier = Modifier.fillMaxWidth(),
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = snoozable,
    ) {
        Box(Modifier.fillMaxWidth().background(c.surface)) {
            // The action rides on the row's own click node, so it is listed with the row, not on an empty node.
            ClientRowView(row = row, onClick = onClick, onNextAction = onNextAction, modifier = rowModifier)
        }
    }
}

/**
 * One slice of a `.rows` container for a lazy list: surface fill, the 1 dp line border on the sides (and
 * the rounded top or bottom on the first or last slice) and the 66 dp-inset separator above every row
 * after the first. Stacked slices look exactly like [RowList]. Candidate for promotion to the components
 * package as a lazy-list companion of RowList.
 */
@Composable
private fun RowListSegment(first: Boolean, last: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = WatchdogTheme.colors
    val radius = WatchdogDimens.cardRadius
    val shape = RoundedCornerShape(
        topStart = if (first) radius else 0.dp,
        topEnd = if (first) radius else 0.dp,
        bottomStart = if (last) radius else 0.dp,
        bottomEnd = if (last) radius else 0.dp,
    )
    val line = c.line
    val separator = c.separator
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .drawWithContent {
                drawContent()
                // Drawn over the row like RowList's border. The rounded rect overshoots the open edges, so the
                // clip hides those sides and only the left and right lines (and the rounded end) remain.
                val stroke = 1.dp.toPx()
                val r = radius.toPx()
                val overshoot = r + stroke
                val top = if (first) stroke / 2f else -overshoot
                val bottom = if (last) size.height - stroke / 2f else size.height + overshoot
                drawRoundRect(
                    color = line,
                    topLeft = Offset(stroke / 2f, top),
                    size = Size(size.width - stroke, bottom - top),
                    cornerRadius = CornerRadius(r, r),
                    style = Stroke(width = stroke),
                )
                if (!first) {
                    drawLine(separator, Offset(66.dp.toPx(), stroke / 2f), Offset(size.width, stroke / 2f), strokeWidth = stroke)
                }
            },
    ) {
        content()
    }
}

/**
 * The top bar with the inline search field in place of the title (the search action toggles it): a back
 * button that closes the search, the 16 sp field and a clear button while there is text. The field takes
 * focus when it appears.
 */
@Composable
private fun SearchTopBar(query: String, onQueryChange: (String) -> Unit, onClose: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(
        modifier = Modifier.fillMaxWidth().height(WatchdogDimens.appBarHeight).padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WdIconButton(icon = WdIcons.ArrowBack, contentDescription = "Close search", onClick = onClose)
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier
                .weight(1f)
                .padding(start = 4.dp)
                .focusRequester(focus)
                .semantics { contentDescription = "Search clients" },
            textStyle = t.searchHint.copy(color = c.ink),
            singleLine = true,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                Box {
                    if (query.isEmpty()) {
                        Text(text = "Street, town or CRM reference", color = c.muted, style = t.searchHint, maxLines = 1)
                    }
                    inner()
                }
            },
        )
        if (query.isNotEmpty()) {
            WdIconButton(icon = WdIcons.Cancel, contentDescription = "Clear search", onClick = { onQueryChange("") })
        }
    }
}

// ---------------------------------------------------------------------- loading and error

/** Loading: the real top bar, then quiet blocks in the shapes of the banner, the chips and the list. */
@Composable
private fun ClientsSkeleton(contentPadding: PaddingValues) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading your clients" },
    ) {
        WatchdogTopBar(title = "Clients")
        SkeletonBlock(height = 210.dp, modifier = Modifier.cardMargin())
        Row(modifier = Modifier.padding(start = 16.dp, top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SkeletonBlock(width = 92.dp, height = 32.dp, radius = 8.dp)
            SkeletonBlock(width = 126.dp, height = 32.dp, radius = 8.dp)
            SkeletonBlock(width = 98.dp, height = 32.dp, radius = 8.dp)
        }
        SkeletonBlock(height = 104.dp * 5, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp))
    }
}

@Composable
private fun SkeletonBlock(height: Dp, modifier: Modifier = Modifier, width: Dp? = null, radius: Dp = WatchdogDimens.cardRadius) {
    val sized = if (width != null) modifier.width(width) else modifier.fillMaxWidth()
    Box(sized.height(height).clip(RoundedCornerShape(radius)).background(WatchdogTheme.colors.fill))
}

/** Error: the top bar, then a card explaining the problem with a retry button. */
@Composable
private fun ClientsError(userMessage: String, contentPadding: PaddingValues, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WatchdogTopBar(title = "Clients")
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Clients")
            Text(text = "Your clients didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}

// ---------------------------------------------------------------------- sheets

/**
 * The shared modal sheet chrome: surface, 28 dp top radius, the scrim token and the mockup handle. The Farm
 * screen carries the same wrapper; candidate for promotion to the components package as `WdModalSheet`.
 */
@Composable
private fun ClientsSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val c = WatchdogTheme.colors
    val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = WatchdogDimens.sheetRadius, topEnd = WatchdogDimens.sheetRadius),
        containerColor = c.surface,
        contentColor = c.ink,
        scrimColor = c.scrim,
        dragHandle = { BottomSheetHandle(onDismiss = onDismiss) },
    ) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 6.dp + chromeBottom), content = content)
    }
}

@Composable
private fun SheetTitle(text: String) {
    Text(text = text, modifier = Modifier.padding(horizontal = 4.dp), color = WatchdogTheme.colors.ink, style = WatchdogTheme.type.sectionTitle)
}

@Composable
private fun SheetBody(text: String) {
    Text(
        text = text,
        modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 6.dp),
        color = WatchdogTheme.colors.ink2,
        style = WatchdogTheme.type.body.sized(14, FontWeight.Normal, 20.3),
    )
}

/** "Review and send": the homes whose checkups are ready, then one button that sends them all. */
@Composable
private fun ReviewCheckupsSheet(state: ClientsUiState.Ready, onSend: () -> Unit, onDismiss: () -> Unit) {
    val count = state.readyCount
    val deadline = state.overview.season?.appealDeadline
    ClientsSheet(onDismiss = onDismiss) {
        SheetTitle(if (count == 1) "Send 1 tax checkup" else "Send $count tax checkups")
        SheetBody(
            "Each checkup goes out under your name and shows whether the home’s assessment holds up" +
                (if (deadline != null) " and the $deadline appeal deadline." else " and the next appeal deadline."),
        )
        val ready = state.readyRows
        Column(modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(top = 12.dp)) {
            if (ready == null) {
                SkeletonBlock(height = WatchdogDimens.rowMinHeight * 3, modifier = Modifier.semantics { contentDescription = "Loading the ready checkups" })
            } else if (ready.isEmpty()) {
                RowList {
                    WdRow(title = "No checkups are waiting", supporting = "New ones appear when final bills are published.", icon = WdIcons.TaskAlt, trailing = null)
                }
            } else {
                RowList(items = ready) { row ->
                    WdRow(title = row.address, supporting = row.metaLine, tile = row.tile, icon = WdIcons.Home, trailing = null)
                }
            }
        }
        WdPrimaryButton(
            label = if (state.sending) "Sending…" else if (count == 1) "Send 1 checkup" else "Send $count checkups",
            onClick = onSend,
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            icon = WdIcons.Send,
            enabled = !state.sending && count > 0,
        )
        WdTonalButton(label = "Not now", onClick = onDismiss, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
    }
}

/** The FAB's sheet: pick from contacts (through the Android app) or paste a CSV with the five columns. */
@Composable
private fun AddClientsSheet(state: ClientsUiState.Ready, vm: ClientsViewModel, onDismiss: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    ClientsSheet(onDismiss = onDismiss) {
        SheetTitle("Add clients")
        SheetBody("Each home is matched to its parcel. Watchdog keeps your CRM reference and never stores an owner’s name.")
        Column(modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            RowList(modifier = Modifier.padding(top = 12.dp)) {
                WdRow(
                    title = "From contacts",
                    supporting = "Pick people on your phone; their addresses are matched",
                    tile = TileTint.Sky,
                    icon = WdIcons.Contacts,
                    onClick = { vm.setAddMode(AddClientsMode.Contacts) },
                    trailing = { ExpandChevron(expanded = state.addMode == AddClientsMode.Contacts) },
                )
                Box(Modifier.fillMaxWidth().topSeparator(c.separator, 66.dp)) {
                    WdRow(
                        title = "Upload a CSV",
                        supporting = "address, town, relationship, year, crm_ref",
                        tile = TileTint.Sand,
                        icon = WdIcons.UploadFile,
                        onClick = { vm.setAddMode(AddClientsMode.Csv) },
                        trailing = { ExpandChevron(expanded = state.addMode == AddClientsMode.Csv) },
                    )
                }
            }
            when (state.addMode) {
                AddClientsMode.Contacts -> ReadBox(
                    icon = WdIcons.Info,
                    text = "The contact picker comes with the Watchdog app on your phone: it opens the system picker and matches each address to a parcel. On this computer, paste a CSV instead.",
                    modifier = Modifier.padding(top = 12.dp),
                )
                AddClientsMode.Csv -> {
                    Text(
                        text = "One home per line, in this order: address, town, relationship (past client, sphere, farm or watching), year, crm_ref. A header line is fine; only the address and town are required.",
                        modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 12.dp),
                        color = c.muted,
                        style = t.caption.sized(12, FontWeight.Normal, 17.4),
                    )
                    CsvField(
                        value = state.csvText,
                        onValueChange = vm::setCsvText,
                        modifier = Modifier.padding(top = 12.dp),
                        enabled = !state.importing,
                    )
                    val error = state.importError
                    if (error != null) {
                        Text(
                            text = error,
                            modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 6.dp).semantics { contentDescription = "Import problem: $error" },
                            color = c.warnInk,
                            style = t.caption.sized(12, FontWeight.SemiBold, 17.4),
                        )
                    }
                    WdPrimaryButton(
                        label = if (state.importing) "Importing…" else "Import",
                        onClick = vm::importCsv,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                        icon = WdIcons.UploadFile,
                        enabled = !state.importing && state.csvText.isNotBlank(),
                    )
                }
                null -> Unit
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** The trailing chevron of an expandable row: right when collapsed, down when open. */
@Composable
private fun ExpandChevron(expanded: Boolean) {
    Icon(
        imageVector = if (expanded) WdIcons.ExpandMore else WdIcons.ChevronRight,
        contentDescription = null,
        modifier = Modifier.size(22.dp),
        tint = WatchdogTheme.colors.muted,
    )
}

/**
 * A multi-line paste box in the outlined field's clothes (2 dp ink border, 8 dp radius, 15 sp 500), since
 * the shared field is single-line. Candidate for promotion as a multi-line variant of WdOutlinedField.
 */
@Composable
private fun CsvField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(8.dp)
    Box(modifier = modifier.fillMaxWidth()) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .background(c.bg, shape)
                .border(2.dp, c.ink, shape)
                .heightIn(min = 132.dp)
                .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 12.dp)
                .semantics { contentDescription = "Pasted CSV" },
            enabled = enabled,
            textStyle = t.fieldValue.copy(color = c.ink),
            minLines = 4,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) {
                        Text(
                            text = "27 Hamilton St, Harrison, past client, 2019, CRM-104",
                            color = c.muted,
                            style = t.fieldValue,
                        )
                    }
                    inner()
                }
            },
        )
        Text(
            text = "Pasted CSV",
            modifier = Modifier.padding(start = 12.dp).background(c.bg).padding(horizontal = 4.dp),
            color = c.ink,
            style = t.fieldLabel,
            maxLines = 1,
        )
    }
}

/** The tune action's sheet: one sort order, and a switch that hides the quiet homes. */
@Composable
private fun SortFilterSheet(state: ClientsUiState.Ready, vm: ClientsViewModel, onDismiss: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    ClientsSheet(onDismiss = onDismiss) {
        SheetTitle("Sort and filter")
        RowList(modifier = Modifier.padding(top = 12.dp).selectableGroup()) {
            ClientSort.entries.forEachIndexed { index, sort ->
                val selected = sort == state.sort
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (index == 0) Modifier else Modifier.topSeparator(c.separator, 54.dp))
                        .selectable(selected = selected, role = Role.RadioButton, onClick = { vm.setSort(sort) })
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                        RadioButton(
                            selected = selected,
                            onClick = null,
                            colors = RadioButtonDefaults.colors(selectedColor = c.primary, unselectedColor = c.mOutline),
                        )
                    }
                    Text(text = sort.label, color = c.ink, style = t.body.sized(15, if (selected) FontWeight.Bold else FontWeight.SemiBold))
                }
            }
        }
        OptionRow(
            title = "Only homes with something new",
            subtitle = "Hides homes with nothing to do this week",
            checked = state.onlyWithNews,
            onChecked = vm::setOnlyWithNews,
        )
        WdTonalButton(label = "Done", onClick = onDismiss, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
    }
}

/**
 * The top inset the scrolling content starts under. On device this is the system status bar; the desktop
 * preview and screenshot harness have no status bar but provide [LocalBottomChromeInsets] to reproduce the
 * mockups' chrome allowances, so the mockups' 40 dp status bar allowance is used there too.
 */
@Composable
private fun statusBarAllowance(): Dp =
    if (LocalBottomChromeInsets.current != null) 40.dp else WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
