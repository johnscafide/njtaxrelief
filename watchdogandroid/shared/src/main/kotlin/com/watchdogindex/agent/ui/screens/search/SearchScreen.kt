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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.core.model.Tone
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SourcesNote
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.colors
import com.watchdogindex.agent.ui.components.listMargin
import com.watchdogindex.agent.ui.components.statusBarTopPadding
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route

/*
 * Search (no mockup): the Today search bar made editable, with results as list rows. Rows lead with the
 * home and its public identifiers only (address, town, county, block/lot, Watchdog Score); owner details
 * never appear. Opens the property detail for a row.
 */

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
    // Autofocus once the field is laid out: requesting focus before its node is attached throws, and the
    // headless preview runs the first effects before attachment.
    var fieldAttached by remember { mutableStateOf(false) }
    LaunchedEffect(fieldAttached) { if (fieldAttached) focus.requestFocus() }

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
                    focusRequester = focus,
                    onFieldAttached = { fieldAttached = true },
                    modifier = Modifier.weight(1f),
                )
            }
            SearchingStrip(searching = (state as? SearchUiState.Ready)?.searching == true)
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
                        // One item: the repositories stop at 25 (sample) and 12 (live) homes and the view model
                        // caps at MAX_RESULTS, so the rounded list container can be composed whole.
                        item(key = "results") {
                            RowList(items = s.results, modifier = Modifier.listMargin()) { property ->
                                ResultRow(property = property, onClick = { navigator.open(Route.Property(property.pin)) })
                            }
                        }
                        if (s.truncated) {
                            item(key = "truncated") {
                                SourcesNote("Showing the first ${SearchViewModel.MAX_RESULTS} matches. Add the town, or a block and lot, to narrow it down.")
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

/**
 * One result as the shared two-line `WdRow`: "town · county" and "block/lot · Score n" under the address, every
 * line ellipsised to one so rows share one height instead of wrapping mid phrase. The full identifier line from
 * the property header (town · county · block/lot) is about 320 dp at 13 sp, wider than any phone's row leaves
 * next to a tile and chevron, and a trailing score chip would leave under 190 dp even at 412 dp, so the score
 * joins the second line as text the way the farm mockup's home row reads ("Score 72 · tax $11,284"). The
 * score's ink follows its verdict; the number is the signal, and the row's single spoken description carries
 * the verdict with it, so nothing is read twice.
 */
@Composable
private fun ResultRow(property: PropertySummary, onClick: () -> Unit) {
    val score = property.score
    val verdict = score?.let { TaxMath.verdictFor(it) }
    val (_, scoreInk) = (score?.let { scoreTone(it) } ?: Tone.Neutral).colors()
    val placeLine = "${property.town} · ${property.county}"
    val parcelLine = buildAnnotatedString {
        append(property.blockLot)
        if (score != null) {
            append(" · ")
            withStyle(SpanStyle(color = scoreInk, fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum")) {
                append("Score $score")
            }
        }
    }
    val description = buildString {
        append(property.address).append(", ").append(placeLine).append(", ").append(property.blockLot)
        if (score != null) append(". Watchdog Score ").append(score).append(" out of 100, ").append(verdict)
    }
    WdRow(
        title = property.address,
        supporting = placeLine,
        detail = parcelLine,
        tile = TileTint.Sky,
        icon = WdIcons.Home,
        onClick = onClick,
        maxLines = 1,
        contentDescription = description,
    )
}

/**
 * Score tone on the verdict's own thresholds ([TaxMath.verdictFor]: favorable from 65, mixed from 50), so the
 * colour never contradicts the spoken verdict. The label always carries the number, so the tone is never the
 * only signal. A candidate for core TaxMath or the components, so every score in the app agrees.
 */
private fun scoreTone(score: Int): Tone = when {
    score >= TaxMath.FAVORABLE_FROM -> Tone.Good
    score < TaxMath.MIXED_FROM -> Tone.Warn
    else -> Tone.Neutral
}

/** A 2 dp progress strip under the field while a newer search runs over the results already on screen. */
@Composable
private fun SearchingStrip(searching: Boolean) {
    val c = WatchdogTheme.colors
    // Always 4 dp tall so the results do not jump when the strip appears.
    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(4.dp), contentAlignment = Alignment.Center) {
        if (searching) {
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .semantics { contentDescription = "Updating results" },
                color = c.primary,
                trackColor = c.fill,
            )
        }
    }
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
    focusRequester: FocusRequester,
    onFieldAttached: () -> Unit,
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
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onGloballyPositioned { onFieldAttached() }
                // The field's own label; the drawn placeholder below is cleared so the hint is spoken once.
                .semantics { contentDescription = SEARCH_HINT },
            textStyle = t.searchHint.copy(color = c.ink),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            singleLine = true,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(
                            text = SEARCH_HINT,
                            modifier = Modifier.clearAndSetSemantics { },
                            color = c.muted,
                            style = t.searchHint,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
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
