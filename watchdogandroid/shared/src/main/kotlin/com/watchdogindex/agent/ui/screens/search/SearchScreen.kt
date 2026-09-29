package com.watchdogindex.agent.ui.screens.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.StatusChip
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.ui.components.RowChevron
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SourcesNote
import com.watchdogindex.agent.ui.components.StatusChipView
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.listMargin
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route

/*
 * Search (no mockup): the Today search bar made editable, with results as list rows. Rows lead with the
 * home and its public identifiers only (address, town, county, block/lot, Watchdog Score); owner details
 * never appear. Opens the property detail for a row.
 */

/** The mockup's status bar allowance, used when the host draws no status bar (the desktop preview). */
private val MockupStatusBarHeight = 40.dp

/** No navigation bar here: the `.pb-sm` 110 on the mockup device, whose gesture area is 24. */
private val ScrollBottomBeyondChrome = 86.dp

private const val SEARCH_HINT = "Search any NJ address"

@Composable
fun SearchScreen(query: String, navigator: Navigator) {
    val graph = LocalAppGraph.current
    val vm = screenViewModel { SearchViewModel(graph.repos, query) }
    val state by vm.state.collectAsState()
    val text by vm.query.collectAsState()
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) { focus.requestFocus() }

    Scaffold(containerColor = c.bg, contentWindowInsets = WindowInsets(0.dp)) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(top = statusBarTopPadding())) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                WdIconButton(icon = WdIcons.ArrowBack, contentDescription = "Back", onClick = navigator::back)
                SearchField(
                    value = text,
                    onValueChange = vm::setQuery,
                    onSearch = vm::searchNow,
                    onClear = vm::clearQuery,
                    modifier = Modifier.weight(1f).focusRequester(focus),
                )
            }
            val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
            val contentPadding = PaddingValues(bottom = ScrollBottomBeyondChrome + chromeBottom)
            when (val s = state) {
                SearchUiState.Loading -> Message(title = "Searching…", body = null)
                is SearchUiState.Error -> Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(text = s.userMessage, color = c.ink, style = t.body)
                    WdTonalButton(label = "Try again", onClick = vm::searchNow, small = true)
                }
                is SearchUiState.Ready -> when {
                    s.query.isEmpty() -> Message(
                        title = "Find a home by its address",
                        body = "Type a street and town, or a block and lot. Every result shows the home, its town and county, and its Watchdog Score where one is ready.",
                    )
                    s.results.isEmpty() -> Message(
                        title = "No homes match “${s.query}”.",
                        body = "Check the spelling, or try the street and town without the unit number.",
                    )
                    else -> LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = contentPadding) {
                        item(key = "results") {
                            RowList(items = s.results, modifier = Modifier.listMargin()) { property ->
                                ResultRow(property = property, onClick = { navigator.open(Route.Property(property.pin)) })
                            }
                        }
                        item(key = "sources") {
                            SourcesNote(
                                "Addresses, towns and block/lot from the NJ MOD-IV tax list. " +
                                    "Scores: the Watchdog Score, powered by the ROBUST Framework.",
                            )
                        }
                    }
                }
            }
        }
    }
}

/** One result: home tile, address, "town · county · block/lot", score chip when there is a score, chevron. */
@Composable
private fun ResultRow(property: PropertySummary, onClick: () -> Unit) {
    val score = property.score
    WdRow(
        title = property.address,
        supporting = "${property.town} · ${property.county} · ${property.blockLot}",
        tile = TileTint.Sky,
        icon = WdIcons.Home,
        onClick = onClick,
        trailing = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (score != null) {
                    val verdict = TaxMath.verdictFor(score)
                    StatusChipView(
                        chip = StatusChip(label = "Score $score", tone = scoreTone(score)),
                        modifier = Modifier.semantics(mergeDescendants = true) {
                            contentDescription = "Watchdog Score $score out of 100, $verdict"
                        },
                    )
                }
                RowChevron()
            }
        },
    )
}

/** Chip tone by score band: the label always carries the number, so the tone is never the only signal. */
private fun scoreTone(score: Int): Tone = when (TaxMath.bandIndex(score)) {
    3, 4 -> Tone.Good
    0, 1 -> Tone.Warn
    else -> Tone.Neutral
}

@Composable
private fun Message(title: String, body: String?) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text = title, color = c.ink, style = t.rowTitle)
        if (body != null) Text(text = body, color = c.muted, style = t.supporting)
    }
}

/**
 * The Today search bar (`.msearch`: 56 dp, 28 dp radius, container-high fill, 22 dp search icon, 16 sp text)
 * as an editable field with a clear button. `WatchdogSearchBar` is tap-only, hence this private version;
 * a candidate for promotion into the components package.
 */
@Composable
private fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .height(WatchdogDimens.searchBarHeight)
            .clip(RoundedCornerShape(28.dp))
            .background(c.mHigh)
            .padding(start = 18.dp, end = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = WdIcons.Search, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.muted)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f).semantics { contentDescription = SEARCH_HINT },
            textStyle = t.searchHint.copy(color = c.ink),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            singleLine = true,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(text = SEARCH_HINT, color = c.muted, style = t.searchHint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    inner()
                }
            },
        )
        if (value.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .size(WatchdogDimens.touchTarget)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onClear),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = WdIcons.Cancel, contentDescription = "Clear search", modifier = Modifier.size(22.dp), tint = c.muted)
            }
        } else {
            // Keeps the text from jumping when the clear button appears.
            Box(Modifier.size(WatchdogDimens.touchTarget))
        }
    }
}

/**
 * The system status bar height, or the mockup's 40 dp allowance where the host draws no status bar (the
 * desktop preview and the screenshot harness).
 */
@Composable
private fun statusBarTopPadding(): Dp {
    val system = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    return if (system > 0.dp) system else MockupStatusBarHeight
}
