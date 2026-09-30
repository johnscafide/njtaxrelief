package com.watchdogindex.agent.ui.screens.marketing

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.SiteLinks
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.CampaignKind
import com.watchdogindex.agent.core.model.MarketingTab
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.platform.PlatformServices
import com.watchdogindex.agent.ui.components.CampaignCard
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.components.OptionRow
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SectionHeader
import com.watchdogindex.agent.ui.components.ShareSheetHeader
import com.watchdogindex.agent.ui.components.ShareTargets
import com.watchdogindex.agent.ui.components.SourcesNote
import com.watchdogindex.agent.ui.components.SupportingText
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.TrueCostCardView
import com.watchdogindex.agent.ui.components.WatchdogFab
import com.watchdogindex.agent.ui.components.WatchdogNavigationBar
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdModalSheet
import com.watchdogindex.agent.ui.components.WdOutlinedField
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomSeparator
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.listMargin
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.statusBarAllowance
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Tab
import com.watchdogindex.agent.ui.preview.LocalPreviewState
import kotlinx.coroutines.launch

/*
 * Marketing (tab), spec §4.7: the top bar ("Marketing", search and more), the three-tab row, and per tab the
 * campaign cards, the true cost cards or the agent's public page, with the navigation bar and the "New card"
 * FAB. Campaigns are designed and sent in the web studio and only tracked here, so a campaign opens on the web.
 * The true cost share sheet is a modal sheet over the tab: share header, the card itself, the four share
 * targets and the contact card switch. Scroll padding is the mockup's 128 below (nav bar + 24). Every site URL
 * (the studio, the agent's portal, the profile page) comes from core's SiteLinks through the graph's config.
 */

/** The mockup's 24 dp between the last card and the navigation bar (`.scroll` bottom 128 = 104 + 24). */
private val scrollBottomGap = 24.dp

@Composable
fun MarketingScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    // Read once: the harness presets the open share sheet the approved mockup shows; the app has no preview state.
    val preview = LocalPreviewState.current
    val initialSheetPin = remember { preview?.openTrueCostSheetPin }
    val vm = screenViewModel { MarketingViewModel(graph.repos, initialSheetPin) }
    val links = graph.config.links
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }
    val ready = state as? MarketingUiState.Ready

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
        topBar = {
            MarketingHeader(
                tab = ready?.tab ?: MarketingTab.Campaigns,
                onTab = vm::selectTab,
                onSearch = vm::focusCardSearch,
                menuOpen = ready?.menuOpen == true,
                onMenuOpen = vm::setMenuOpen,
                onOpenStudio = { platform.openUrl(links.postcardStudio) },
                onRefresh = vm::refresh,
            )
        },
        bottomBar = { WatchdogNavigationBar(selected = Tab.Marketing, onSelect = navigator::switchTab) },
        floatingActionButton = {
            WatchdogFab(icon = WdIcons.ReceiptLong, label = "New card", onClick = vm::focusCardSearch)
        },
    ) { inner ->
        val direction = LocalLayoutDirection.current
        // While the address field's keyboard is up it covers the navigation bar, so the results scroll clear of the keyboard instead.
        val keyboardBottom = keyboardInsets().asPaddingValues().calculateBottomPadding()
        val contentPadding = PaddingValues(
            start = inner.calculateStartPadding(direction),
            end = inner.calculateEndPadding(direction),
            top = inner.calculateTopPadding(),
            bottom = maxOf(inner.calculateBottomPadding(), keyboardBottom) + scrollBottomGap,
        )
        when (val s = state) {
            MarketingUiState.Loading -> MarketingSkeleton(contentPadding)
            is MarketingUiState.Error -> MarketingError(s.userMessage, contentPadding, onRetry = vm::load)
            is MarketingUiState.Ready -> when (s.tab) {
                MarketingTab.Campaigns -> CampaignsTab(
                    campaigns = s.campaigns,
                    contentPadding = contentPadding,
                    siteLabel = links.label,
                    onCampaign = { platform.openUrl(it.studioUrl(links)) },
                    onOpenStudio = { platform.openUrl(links.postcardStudio) },
                )
                MarketingTab.Cards -> CardsTab(
                    state = s,
                    contentPadding = contentPadding,
                    onQuery = vm::setCardQuery,
                    onFocusConsumed = vm::consumeFocusRequest,
                    onProperty = { vm.openTrueCost(it.pin) },
                    onCard = { vm.openTrueCost(it.pin) },
                )
                MarketingTab.MyPage -> MyPageTab(
                    account = s.account,
                    links = links,
                    contentPadding = contentPadding,
                    onCopy = { url ->
                        platform.copyToClipboard("Your Watchdog page", url)
                        vm.notify("Link copied")
                    },
                    onOpen = platform::openUrl,
                )
            }
        }
    }

    ready?.sheet?.let { sheet ->
        TrueCostSheet(
            sheet = sheet,
            platform = platform,
            siteLabel = links.label,
            onDismiss = vm::closeSheet,
            onQrOpen = { vm.setQrOpen(true) },
            onQrClose = { vm.setQrOpen(false) },
            onInclude = vm::setIncludeContactCard,
            onRetry = vm::retryCard,
        )
    }
}

/**
 * The soft keyboard's inset on device. Nothing where the harness provides the chrome insets: there is no
 * keyboard there, and ARCHITECTURE.md keeps the desktop clear of the IME inset (the same gate as
 * `statusBarAllowance()`).
 */
@Composable
private fun keyboardInsets(): WindowInsets = if (LocalBottomChromeInsets.current == null) WindowInsets.ime else WindowInsets(0, 0, 0, 0)

// ---------------------------------------------------------------------- header

/** The pinned header: status bar allowance, the top bar with its overflow menu, and the tab row. */
@Composable
private fun MarketingHeader(
    tab: MarketingTab,
    onTab: (MarketingTab) -> Unit,
    onSearch: () -> Unit,
    menuOpen: Boolean,
    onMenuOpen: (Boolean) -> Unit,
    onOpenStudio: () -> Unit,
    onRefresh: () -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxWidth().background(c.bg)) {
        Spacer(Modifier.height(statusBarAllowance()))
        Box(modifier = Modifier.fillMaxWidth()) {
            WatchdogTopBar(
                title = "Marketing",
                actions = listOf(
                    TopBarAction(WdIcons.Search, "Search an address for a true cost card", onSearch),
                    TopBarAction(WdIcons.MoreVert, "More options") { onMenuOpen(true) },
                ),
            )
            Box(modifier = Modifier.align(Alignment.TopEnd).padding(end = 4.dp)) {
                DropdownMenu(expanded = menuOpen, onDismissRequest = { onMenuOpen(false) }) {
                    DropdownMenuItem(
                        text = { Text(text = "Open the marketing studio", color = c.ink, style = t.body) },
                        leadingIcon = { Icon(imageVector = WdIcons.OpenInNew, contentDescription = null, tint = c.ink2) },
                        onClick = {
                            onMenuOpen(false)
                            onOpenStudio()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(text = "Refresh", color = c.ink, style = t.body) },
                        leadingIcon = { Icon(imageVector = WdIcons.Refresh, contentDescription = null, tint = c.ink2) },
                        onClick = onRefresh,
                    )
                }
            }
        }
        MarketingTabs(selected = tab, onSelect = onTab)
    }
}

private val MarketingTab.label: String
    get() = when (this) {
        MarketingTab.Campaigns -> "Campaigns"
        MarketingTab.Cards -> "Cards"
        MarketingTab.MyPage -> "My page"
    }

/**
 * The tab row (`.mtabs`): three equal 48 dp tabs, 14 sp 700 (muted; ink when selected), a 1 dp line below
 * and, under the selected tab, a 3 dp ink indicator spanning the middle 44% that sits on the line.
 */
@Composable
private fun MarketingTabs(selected: MarketingTab, onSelect: (MarketingTab) -> Unit) {
    val c = WatchdogTheme.colors
    val style = WatchdogTheme.type.body.sized(14, FontWeight.Bold, 19.6)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp)
            .height(49.dp)
            .bottomSeparator(c.line)
            .selectableGroup(),
    ) {
        MarketingTab.entries.forEach { tab ->
            val on = tab == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .selectable(selected = on, role = Role.Tab, onClick = { onSelect(tab) }),
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(48.dp), contentAlignment = Alignment.Center) {
                    Text(text = tab.label, color = if (on) c.ink else c.muted, style = style, maxLines = 1, softWrap = false)
                }
                if (on) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth(0.44f)
                            .height(3.dp)
                            .background(c.ink, RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------- Campaigns

private fun Campaign.studioUrl(links: SiteLinks): String = when (kind) {
    CampaignKind.Postcard -> links.postcardStudio
    CampaignKind.Email -> links.newsletterStudio
}

@Composable
private fun CampaignsTab(
    campaigns: List<Campaign>,
    contentPadding: PaddingValues,
    siteLabel: String,
    onCampaign: (Campaign) -> Unit,
    onOpenStudio: () -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        if (campaigns.isEmpty()) {
            item(key = "empty") {
                RowList(modifier = Modifier.cardMargin()) {
                    WdRow(
                        title = "No campaigns yet",
                        supporting = "Postcards and emails you send from the studio are tracked here.",
                        tile = TileTint.Sky,
                        icon = WdIcons.Campaign,
                        trailing = null,
                    )
                }
            }
        }
        items(campaigns, key = { it.id }) { campaign ->
            CampaignCard(c = campaign, onClick = { onCampaign(campaign) }, modifier = Modifier.cardMargin())
        }
        item(key = "studio") { StudioCard(siteLabel = siteLabel, onOpenStudio = onOpenStudio) }
        item(key = "sources") {
            SourcesNote("Home counts come from the NJ MOD-IV tax list for each farm. Opens and replies come from the newsletter studio.")
        }
    }
}

/** Explains that campaigns are built on the web and tracked here, with a way into the studio. */
@Composable
private fun StudioCard(siteLabel: String, onOpenStudio: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(modifier = Modifier.cardMargin()) {
        CardLabel("Built on the web")
        Text(text = "Campaigns start in the studio", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
        Text(
            text = "Postcards and emails are designed and sent from the marketing studio on $siteLabel. This tab tracks each " +
                "campaign’s proof, mailing date, opens and replies. Tap a campaign to open it there.",
            modifier = Modifier.padding(top = 6.dp),
            color = c.ink2,
            style = t.body.sized(14, FontWeight.Normal, 20.3),
        )
        WdTonalButton(label = "Open the studio", onClick = onOpenStudio, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.OpenInNew, small = true)
    }
}

// ---------------------------------------------------------------------- Cards

@Composable
private fun CardsTab(
    state: MarketingUiState.Ready,
    contentPadding: PaddingValues,
    onQuery: (String) -> Unit,
    onFocusConsumed: () -> Unit,
    onProperty: (PropertySummary) -> Unit,
    onCard: (TrueCostCard) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(state.focusCardSearch) {
        if (state.focusCardSearch) {
            runCatching { focusRequester.requestFocus() }
            onFocusConsumed()
        }
    }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "search") {
            Column(modifier = Modifier.fillMaxWidth()) {
                // The results already follow the typing (the view model searches after a short pause), so the Search
                // key only puts the keyboard away to show them. No autofill hint on purpose: a field hinted as a postal
                // address invites the autofill service to save what is typed here, and what is typed here is a client's
                // home, not the agent's own address.
                WdOutlinedField(
                    label = "Address",
                    value = state.cardQuery,
                    onValueChange = onQuery,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp).focusRequester(focusRequester),
                    onClear = if (state.cardQuery.isNotEmpty()) ({ onQuery("") }) else null,
                    placeholder = "Street and town",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                )
                SupportingText("Any NJ home. The card shows the real monthly cost, property tax included.")
            }
        }
        if (state.cardQuery.isNotBlank()) {
            item(key = "results") {
                val results = state.cardResults
                when {
                    state.searching && results.isEmpty() -> RowList(modifier = Modifier.listMargin()) {
                        WdRow(title = "Searching…", supporting = "Looking up ${state.cardQuery.trim()}", tile = TileTint.Fill, icon = WdIcons.Search, trailing = null)
                    }
                    results.isEmpty() -> RowList(modifier = Modifier.listMargin()) {
                        WdRow(title = "No homes match", supporting = "Try the street name and the town.", tile = TileTint.Fill, icon = WdIcons.SearchOff, trailing = null)
                    }
                    else -> RowList(items = results, modifier = Modifier.listMargin()) { p ->
                        WdRow(
                            title = p.address,
                            supporting = "${p.town} · ${p.blockLot}",
                            tile = TileTint.Sky,
                            icon = WdIcons.Home,
                            onClick = { onProperty(p) },
                        )
                    }
                }
            }
        }
        item(key = "recent-header") { SectionHeader(title = "Recent cards") }
        item(key = "recent") {
            val cards = state.recentCards
            if (cards.isEmpty()) {
                RowList(modifier = Modifier.listMargin()) {
                    WdRow(
                        title = "No cards yet",
                        supporting = "Search an address above to build the first one.",
                        tile = TileTint.Navy,
                        icon = WdIcons.ReceiptLong,
                        trailing = null,
                    )
                }
            } else {
                RowList(items = cards, modifier = Modifier.listMargin()) { card ->
                    WdRow(
                        title = card.address,
                        supporting = "${Format.money(card.monthlyTotal)} a month at ${Format.money(card.inputs.price)}",
                        tile = TileTint.Navy,
                        icon = WdIcons.ReceiptLong,
                        onClick = { onCard(card) },
                    )
                }
            }
        }
        item(key = "sources") {
            SourcesNote("Property tax from the NJ MOD-IV tax list at the current NJ Division of Taxation rate. Mortgage at the card’s rate and term with 20% down; insurance is an estimate.")
        }
    }
}

// ---------------------------------------------------------------------- My page

/** The agent's public portal (`SiteLinks.agentPage`, `/agent/<slug>`) and, without a slug yet, the way to set it up on the web. */
@Composable
private fun MyPageTab(
    account: Account?,
    links: SiteLinks,
    contentPadding: PaddingValues,
    onCopy: (String) -> Unit,
    onOpen: (String) -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val slug = account?.vanitySlug?.takeIf { it.isNotBlank() }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
        item(key = "page") {
            WdCard(modifier = Modifier.cardMargin()) {
                CardLabel("My page")
                Text(text = account?.displayName ?: "Your public page", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
                val brokerage = account?.brokerage?.takeIf { it.isNotBlank() }
                if (brokerage != null) {
                    Text(text = brokerage, modifier = Modifier.padding(top = 2.dp), color = c.muted, style = t.body.sized(14, FontWeight.Medium, 19.6))
                }
                if (slug != null) {
                    val url = links.agentPage(slug)
                    Text(
                        text = links.agentPageLabel(slug),
                        modifier = Modifier.padding(top = 12.dp).semantics { contentDescription = "Your page link, $url" },
                        color = c.link,
                        style = t.body.sized(15, FontWeight.Bold, 21.0),
                    )
                    Text(
                        text = "Buyers who open your true cost cards and tax checkups land here with your contact card.",
                        modifier = Modifier.padding(top = 6.dp),
                        color = c.ink2,
                        style = t.body.sized(14, FontWeight.Normal, 20.3),
                    )
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        WdTonalButton(label = "Copy link", onClick = { onCopy(url) }, modifier = Modifier.weight(1f), icon = WdIcons.ContentCopy, small = true)
                        WdPrimaryButton(label = "Open", onClick = { onOpen(url) }, modifier = Modifier.weight(1f), icon = WdIcons.OpenInNew, small = true)
                    }
                } else {
                    Text(
                        text = if (account == null) {
                            "Your account details didn’t load, so your page link can’t be shown yet."
                        } else {
                            "Your page isn’t set up yet. Choose your link on the web and it appears here, on your cards and in your checkups."
                        },
                        modifier = Modifier.padding(top = 10.dp),
                        color = c.ink2,
                        style = t.body.sized(14, FontWeight.Normal, 20.3),
                    )
                    WdPrimaryButton(label = "Set up on the web", onClick = { onOpen(links.professionalProfile) }, modifier = Modifier.padding(top = 14.dp), icon = WdIcons.OpenInNew, small = true)
                }
            }
        }
        item(key = "contact") {
            val phone = account?.phone?.takeIf { it.isNotBlank() }
            val email = account?.email?.takeIf { it.isNotBlank() }
            if (phone != null || email != null) {
                SectionHeader(title = "On your contact card")
                RowList(modifier = Modifier.listMargin()) {
                    if (phone != null) WdRow(title = phone, supporting = "Phone", tile = TileTint.Mint, icon = WdIcons.Call, trailing = null)
                    if (email != null) WdRow(title = email, supporting = "Email", tile = TileTint.Sky, icon = WdIcons.Mail, trailing = null)
                }
            }
        }
        item(key = "sources") {
            SourcesNote("Your page shows only your own details. Homes on it cite the NJ MOD-IV tax list, NJ Division of Taxation rates and SR1A deed sales.")
        }
    }
}

// ---------------------------------------------------------------------- loading and error

/** Loading: two campaign-shaped blocks under the pinned header. */
@Composable
private fun MarketingSkeleton(contentPadding: PaddingValues) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading your marketing" },
    ) {
        repeat(2) {
            Box(
                Modifier
                    .cardMargin()
                    .fillMaxWidth()
                    .height(90.dp)
                    .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
                    .background(WatchdogTheme.colors.fill),
            )
        }
    }
}

@Composable
private fun MarketingError(userMessage: String, contentPadding: PaddingValues, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Marketing")
            Text(text = "Your campaigns didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}

// ---------------------------------------------------------------------- true cost share sheet

private fun TrueCostCard.streetAddress(): String = address.substringBefore(',').trim()

private fun TrueCostCard.shareTitle(): String = "True cost of ${streetAddress()}"

/** The plain-text version of the card for Messages, Mail and the system share sheet; every figure cites its source. */
private fun TrueCostCard.shareText(): String = buildString {
    append("True cost of $address: ${Format.money(monthlyTotal)} a month at ${Format.money(inputs.price)}. ")
    append("$mortgageLabel ${Format.money(monthlyMortgage)}, property tax ${Format.money(monthlyTax)}")
    if (monthlyInsurance > 0) append(", home insurance ${Format.money(monthlyInsurance)}")
    if (monthlyHoa > 0) append(", HOA ${Format.money(monthlyHoa)}")
    append(". Property tax from the NJ MOD-IV tax list at the current NJ Division of Taxation rate.")
    agent?.let { append(" Prepared by ${it.name}, ${it.brokerage}.") }
}

/**
 * The true cost share sheet (`.sheet.and`, spec §4.7 items 5-6): the mockup handle, the share header with the
 * copy button, the card (tap it for the system share sheet), the four share targets and the contact card switch.
 * Its one-line feedback ("Link copied", or why a target cannot act yet) is a snackbar hosted in the sheet itself:
 * the screen's Scaffold host would draw under the modal sheet's scrim, where nobody sees it.
 */
@Composable
private fun TrueCostSheet(
    sheet: TrueCostSheetState,
    platform: PlatformServices,
    /** "watchdogindex.com", the site the share header names. */
    siteLabel: String,
    onDismiss: () -> Unit,
    onQrOpen: () -> Unit,
    onQrClose: () -> Unit,
    onInclude: (Boolean) -> Unit,
    onRetry: () -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val card = sheet.card
    val url = card?.shareUrl
    val feedback = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val notice: (String) -> Unit = { message ->
        scope.launch {
            feedback.currentSnackbarData?.dismiss()
            feedback.showSnackbar(message)
        }
    }
    /** Runs [action] with the built card, or says why the sheet cannot act yet (building, or failed with a retry above). */
    fun withCard(action: (TrueCostCard) -> Unit): () -> Unit = {
        when {
            card != null -> action(card)
            sheet.error != null -> notice("The card didn’t build. Try again above.")
            else -> notice("The card is still building")
        }
    }
    val copyLink = withCard {
        platform.copyToClipboard("True cost card link", it.shareUrl)
        notice("Link copied")
    }
    // The subtitle follows the built card: an account without a professional profile gets no agent footer even with
    // the switch on, so only while the card is still building does it follow the switch.
    val withContactCard = if (card != null) card.agent != null else sheet.includeContactCard
    WdModalSheet(onDismiss = onDismiss) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth()) {
                ShareSheetHeader(
                    title = if (card != null) card.shareTitle() else "True cost card",
                    subtitle = if (withContactCard) "$siteLabel · with your contact card" else siteLabel,
                    onTrailing = copyLink,
                )
                when {
                    card != null -> TrueCostCardView(
                        card = card,
                        modifier = Modifier
                            .padding(top = 12.dp)
                            .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
                            .clickable(role = Role.Button, onClickLabel = "Share the true cost card") {
                                platform.share(card.shareTitle(), card.shareText(), card.shareUrl)
                            },
                    )
                    sheet.error != null -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
                            .background(c.fill)
                            .padding(horizontal = 18.dp, vertical = 16.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    ) {
                        Text(text = "The card didn’t build", color = c.ink, style = t.verdict)
                        Text(text = sheet.error, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
                        WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
                    }
                    // Announced as it appears, so the wait is spoken as well as drawn.
                    else -> Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .height(262.dp)
                            .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
                            .background(c.fill)
                            .semantics {
                                contentDescription = "Building the true cost card"
                                liveRegion = LiveRegionMode.Polite
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = "Building the card…", color = c.muted, style = t.body)
                    }
                }
                // The fourth target opens [LinkDialog], which shows the card's link and offers the web page (where the
                // QR code is generated); it is labelled for that, not as a QR code the app does not draw.
                ShareTargets(
                    onMessages = withCard { platform.composeSms(null, it.shareText() + "\n" + it.shareUrl) },
                    onMail = withCard { platform.composeEmail(null, it.shareTitle(), it.shareText() + "\n\n" + it.shareUrl) },
                    onCopy = copyLink,
                    onQr = withCard { onQrOpen() },
                    modifier = Modifier.padding(top = 14.dp),
                    qrLabel = "Show link",
                    qrIcon = WdIcons.Link,
                )
                OptionRow(
                    title = "Include my contact card",
                    subtitle = "Name, brokerage, phone and email",
                    checked = sheet.includeContactCard,
                    onChecked = onInclude,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            SnackbarHost(hostState = feedback, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
    if (sheet.qrOpen && url != null) {
        LinkDialog(url = url, onDismiss = onQrClose, onOpenWeb = {
            onQrClose()
            platform.openUrl(url)
        })
    }
}

/**
 * "Show link": the card's link as text, with the way to its web page. The QR code itself lives on that page (the
 * app does not draw one), which the copy says plainly.
 */
@Composable
private fun LinkDialog(url: String, onDismiss: () -> Unit, onOpenWeb: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.surface,
        titleContentColor = c.ink,
        textContentColor = c.ink2,
        iconContentColor = c.ink,
        shape = RoundedCornerShape(28.dp),
        icon = { Icon(imageVector = WdIcons.Link, contentDescription = null) },
        title = { Text(text = "Link for this card", style = t.verdict) },
        text = {
            Column {
                Text(
                    text = "The QR code for this card is generated on the web page, so a buyer’s phone opens the same page. This is the link it opens:",
                    style = t.body.sized(14, FontWeight.Normal, 20.3),
                )
                Text(text = url, modifier = Modifier.padding(top = 10.dp), color = c.link, style = t.body.sized(13, FontWeight.SemiBold, 18.2))
            }
        },
        confirmButton = {
            TextButton(onClick = onOpenWeb) { Text(text = "Open on the web", color = c.link, style = t.buttonSmall) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(text = "Close", color = c.ink2, style = t.buttonSmall) }
        },
    )
}
