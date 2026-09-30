package com.watchdogindex.agent.ui.screens.scan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.TileTint
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.FixedInk
import com.watchdogindex.agent.ui.components.InfoPanel
import com.watchdogindex.agent.ui.components.ReadBox
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SegmentOption
import com.watchdogindex.agent.ui.components.SupportingText
import com.watchdogindex.agent.ui.components.TabularText
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.VerdictBox
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdIconButton
import com.watchdogindex.agent.ui.components.WdModalSheet
import com.watchdogindex.agent.ui.components.WdOutlinedField
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.WdRoundTonalIconButton
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdSegmentedButtons
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.statusBarAllowance
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.preview.LocalPreviewState

/*
 * Scan a listing (`S.scan.android`, spec §3.32-3.36 / §4.4): close + title + history in the top bar, the
 * Camera | Paste link segments, and either the camera (QR on a For Sale sign) or the pasted-link field with
 * its supporting text. A resolved lookup is the result panel (`.wpanel`): navy header, score and tax tiles,
 * the sand list-price row, the price-check verdict and the True cost card / Full page / save row. In paste
 * mode the panel sits inline; from the camera it opens as a bottom sheet. `.scroll.pb-sm`: bottom 110.
 */

private const val SUPPORTING_TEXT = "Works with Zillow, Realtor.com and Redfin links. Share a listing to Watchdog from those apps to skip this step."

/** `.pb-sm` is 110 on the mockup device, whose gesture area is 24; the rest scales with the real inset. */
private val ScrollBottomBeyondChrome = 86.dp

/** The navy score tile's fixed column in the `.duo` grid (118 / 1fr). */
private val ScoreTileWidth = 118.dp

/**
 * The mockup's `line-height: 1` number rows, as a multiplier a hair above 1: the desktop text engine treats a
 * line height at or below the font size as unset and falls back to the font's own 1.26 line, which would make
 * the score tile 8 dp taller than the mockup; 1.003 keeps the box at the type size on both platforms.
 */
private const val UnitLineHeight = 1.003

/** `.detect` sits 300 dp down the mockup frame; the camera area starts 172 dp down (bar, segments, 12 dp gap). */
private val DetectPillTop = 128.dp

@Composable
fun ScanScreen(initialUrl: String?, navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val previewState = LocalPreviewState.current
    val presetResolved = remember { previewState?.scanResolved == true }
    val vm = screenViewModel(key = "scan/${initialUrl.orEmpty()}") { ScanViewModel(graph.repos, platform, initialUrl, presetResolved) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }

    val ready = state as? ScanUiState.Ready
    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }

    val openProperty = { result: ScanResult -> navigator.open(Route.Property(result.property.pin)) }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner).padding(top = statusBarAllowance())) {
            WatchdogTopBar(
                title = "Scan a listing",
                onBack = navigator::back,
                backIcon = WdIcons.Close,
                backDescription = "Close",
                actions = if (ready != null) listOf(TopBarAction(WdIcons.History, "Scan history", vm::openHistory)) else emptyList(),
            )
            when (val s = state) {
                ScanUiState.Loading -> Box(Modifier.fillMaxSize())
                is ScanUiState.Error -> ScanFatalError(userMessage = s.userMessage, onClose = navigator::back)
                is ScanUiState.Ready -> {
                    WdSegmentedButtons(
                        // The component swaps the selected segment's icon for the check; the options keep their own icons.
                        options = listOf(SegmentOption("Camera", WdIcons.PhotoCamera), SegmentOption("Paste link", WdIcons.Link)),
                        selectedIndex = if (s.mode == ScanMode.Camera) 0 else 1,
                        onSelect = { index -> vm.setMode(if (index == 0) ScanMode.Camera else ScanMode.Paste) },
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp),
                    )
                    when (s.mode) {
                        ScanMode.Paste -> PasteMode(state = s, vm = vm, onFullPage = openProperty)
                        ScanMode.Camera -> CameraMode(state = s, vm = vm, onFullPage = openProperty)
                    }
                }
            }
        }
    }

    if (ready != null && ready.historyOpen) {
        HistorySheet(state = ready, onDismiss = vm::closeHistory, onPick = vm::showHistoryItem)
    }
}

// ---------------------------------------------------------------------- paste mode

@Composable
private fun PasteMode(state: ScanUiState.Ready, vm: ScanViewModel, onFullPage: (ScanResult) -> Unit) {
    val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = ScrollBottomBeyondChrome + chromeBottom),
    ) {
        // `.mfield` margin-top 18 is to the box; the field keeps 8 dp above the box for its floating label.
        WdOutlinedField(
            label = "Listing link",
            value = state.url,
            onValueChange = vm::onUrlChange,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp),
            onClear = if (state.url.isNotEmpty()) vm::clearUrl else null,
            placeholder = "Paste a listing link",
        )
        SupportingText(SUPPORTING_TEXT)
        val result = state.result
        val error = state.error
        when {
            state.resolving -> ResolvingPanel()
            error != null -> ScanErrorBox(error = error, onRetry = vm::retry, onDismiss = vm::clearUrl)
            result != null -> ScanResultPanel(
                result = result,
                saved = state.saved,
                onTrueCost = vm::shareTrueCost,
                onFullPage = { onFullPage(result) },
                onToggleSaved = vm::toggleSaved,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp),
            )
        }
    }
}

/** A quiet block in the panel's shape while the lookup runs. */
@Composable
private fun ResolvingPanel() {
    Box(
        modifier = Modifier
            .padding(start = 16.dp, end = 16.dp, top = 14.dp)
            .fillMaxWidth()
            .height(300.dp)
            .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
            .background(WatchdogTheme.colors.fill)
            .semantics { contentDescription = "Looking up the listing" },
    )
}

/**
 * Unsupported link, not found, network: a read box with the reason and the right way out. An unreadable link
 * is dismissed ([onDismiss]): "Clear the link" empties the paste field, "Scan again" ([fromCamera]) puts the
 * error away so the next sign's code is read. The other kinds run the same lookup again ([onRetry]).
 */
@Composable
private fun ScanErrorBox(
    error: ScanError,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    fromCamera: Boolean = false,
) {
    val dismissLabel = if (fromCamera) "Scan again" else "Clear the link"
    val dismissIcon = if (fromCamera) WdIcons.QrCodeScanner else WdIcons.Cancel
    val (icon, action, onAction) = when (error.kind) {
        ScanErrorKind.UnsupportedLink -> Triple(WdIcons.Link, dismissLabel, onDismiss)
        ScanErrorKind.NotFound -> Triple(WdIcons.SearchOff, "Try again", onRetry)
        ScanErrorKind.Network -> Triple(WdIcons.CloudOff, "Try again", onRetry)
        ScanErrorKind.Other -> Triple(WdIcons.Error, "Try again", onRetry)
    }
    Column(modifier = modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp)) {
        ReadBox(icon = icon, text = error.message)
        WdTonalButton(
            label = action,
            onClick = onAction,
            modifier = Modifier.padding(top = 10.dp),
            icon = if (error.kind == ScanErrorKind.UnsupportedLink) dismissIcon else WdIcons.Refresh,
            small = true,
        )
    }
}

// ---------------------------------------------------------------------- camera mode

/**
 * The live camera with QR detection filling the area under the segments, a torch toggle and a stop button
 * over it, the detect pill once a sign's code resolves, and the result as a bottom sheet. Without a camera
 * the area explains itself and offers the paste field instead.
 */
@Composable
private fun CameraMode(state: ScanUiState.Ready, vm: ScanViewModel, onFullPage: (ScanResult) -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val platform = LocalPlatformServices.current
    val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 12.dp)
            .background(FixedInk.navy),
    ) {
        if (state.hasCamera) {
            platform.ScanCamera(onQr = vm::onQr, torch = state.torch, modifier = Modifier.fillMaxSize())
            // The hint gives way to the error box (below) so the two never stack at the bottom of the camera.
            if (state.error == null) {
                Text(
                    text = if (state.resolving) "Reading the sign…" else "Point the camera at the QR code on a For Sale sign",
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(start = 24.dp, end = 24.dp, bottom = 96.dp + chromeBottom)
                        .clip(RoundedCornerShape(14.dp))
                        .background(c.scrim)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    color = FixedInk.onNavy,
                    style = t.supporting,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            Column(
                modifier = Modifier.align(Alignment.Center).padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(imageVector = WdIcons.PhotoCamera, contentDescription = null, modifier = Modifier.size(40.dp), tint = FixedInk.onNavyMuted)
                Text(
                    text = "This device has no camera. Paste a listing link instead.",
                    color = FixedInk.onNavy,
                    style = t.body,
                    textAlign = TextAlign.Center,
                )
                WdTonalButton(label = "Paste link", onClick = { vm.setMode(ScanMode.Paste) }, icon = WdIcons.Link, small = true)
            }
        }
        Row(
            modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (state.hasCamera) {
                WdIconButton(
                    icon = if (state.torch) WdIcons.FlashlightOnFill else WdIcons.FlashlightOn,
                    contentDescription = if (state.torch) "Turn the torch off" else "Turn the torch on",
                    onClick = vm::toggleTorch,
                    modifier = Modifier.background(c.scrim, CircleShape),
                    tint = FixedInk.onNavy,
                )
            }
            WdIconButton(
                icon = WdIcons.Close,
                contentDescription = "Stop the camera",
                onClick = { vm.setMode(ScanMode.Paste) },
                modifier = Modifier.background(c.scrim, CircleShape),
                tint = FixedInk.onNavy,
            )
        }
        val result = state.result
        val matchLabel = result?.matchLabel
        if (matchLabel != null && !state.resolving) {
            DetectPill(label = matchLabel, modifier = Modifier.align(Alignment.TopCenter).padding(top = DetectPillTop))
        }
        val error = state.error
        if (error != null && !state.resolving) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp + chromeBottom)
                    .clip(RoundedCornerShape(16.dp))
                    .background(c.surface),
            ) {
                ScanErrorBox(
                    error = error,
                    onRetry = vm::retry,
                    onDismiss = vm::dismissError,
                    modifier = Modifier.padding(bottom = 14.dp),
                    fromCamera = true,
                )
            }
        }
    }

    val sheetResult = state.result
    if (state.sheetOpen && sheetResult != null) {
        WdModalSheet(onDismiss = vm::closeSheet) {
            Column(modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                ScanResultPanel(
                    result = sheetResult,
                    saved = state.saved,
                    onTrueCost = vm::shareTrueCost,
                    onFullPage = { onFullPage(sheetResult) },
                    onToggleSaved = vm::toggleSaved,
                )
            }
        }
    }
}

/**
 * Detect pill (`.detect`; private to this screen until it is promoted): a 34 dp pill with a 17 dp radius, white
 * at 94% over the camera image in both themes, a 20 dp teal filled check_circle, 13 sp 700 navy text and a
 * soft shadow, saying what the camera matched. Reads as one line for TalkBack.
 */
@Composable
private fun DetectPill(label: String, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(17.dp)
    Row(
        modifier = modifier
            .shadow(elevation = 6.dp, shape = shape, ambientColor = c.shadow, spotColor = c.shadow)
            .clip(shape)
            .background(FixedInk.onNavy.copy(alpha = .94f))
            .height(34.dp)
            .padding(start = 10.dp, end = 14.dp)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = WdIcons.CheckCircleFill, contentDescription = null, modifier = Modifier.size(20.dp), tint = FixedInk.teal)
        Text(text = label, color = FixedInk.navy, style = t.supporting.sized(13, FontWeight.Bold), maxLines = 1, softWrap = false)
    }
}

// ---------------------------------------------------------------------- result panel

/**
 * The result panel (`.wpanel` with `.duo`, `.stile`, `.price`, `.lbtns`): navy header with the home and
 * its county / block / lot, the score and tax tiles, the list price row, the price check and the actions.
 */
@Composable
private fun ScanResultPanel(
    result: ScanResult,
    saved: Boolean,
    onTrueCost: () -> Unit,
    onFullPage: () -> Unit,
    onToggleSaved: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = result.property
    val town = Derived.shortTownName(p.town)
    InfoPanel(
        title = if (town.isNotBlank()) "${p.address}, $town" else p.address,
        subtitle = listOf(p.county, p.blockLot).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null },
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ScoreTile(score = result.score, verdict = result.verdict, modifier = Modifier.width(ScoreTileWidth).fillMaxHeight())
            TaxTile(result = result, modifier = Modifier.weight(1f).fillMaxHeight())
        }
        PriceRow(listPrice = result.listPrice, sourceLabel = result.priceSourceLabel, modifier = Modifier.padding(top = 10.dp))
        result.priceCheck?.let { VerdictBox(priceCheck = it, modifier = Modifier.padding(top = 10.dp)) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WdPrimaryButton(label = "True cost card", onClick = onTrueCost, modifier = Modifier.weight(1f), icon = WdIcons.Calculate)
            WdTonalButton(label = "Full page", onClick = onFullPage)
            WdRoundTonalIconButton(
                icon = if (saved) WdIcons.BookmarkAddFill else WdIcons.BookmarkAdd,
                contentDescription = if (saved) "Saved to your clients. Remove" else "Save to client",
                onClick = onToggleSaved,
            )
        }
    }
}

/**
 * Navy score tile (`.stile.navy`): "WATCHDOG SCORE", the 30 sp score with " /100" on a 2 dp gold rule,
 * and the 12 sp verdict. Reads as one node: "Watchdog Score 57 out of 100, mixed tax position".
 */
@Composable
private fun ScoreTile(score: Int?, verdict: String?, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val verdictText = verdict ?: if (score != null) TaxMath.verdictFor(score) else "Not scored yet"
    val description = if (score != null) TaxMath.scoreAccessibilityLabel(score, verdictText) else "Watchdog Score not available yet"
    val gold = c.gold
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(c.navy)
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .clearAndSetSemantics { contentDescription = description },
    ) {
        CardLabel(text = "Watchdog Score", color = c.onNavy2)
        // `.n`: margin-top 6, a 30 dp line box, 3 dp of padding and the 2 dp gold rule under it (41 dp in all);
        // one of the six goes below so the figures sit on the mockup's baseline in both text engines.
        Row(
            modifier = Modifier
                .padding(top = 7.dp)
                .drawBehind {
                    val rule = 2.dp.toPx()
                    drawRect(color = gold, topLeft = Offset(0f, size.height - rule), size = Size(size.width, rule))
                }
                .padding(bottom = 4.dp),
        ) {
            TabularText(
                text = score?.toString() ?: "–",
                modifier = Modifier.alignByBaseline(),
                style = t.lead.sized(30, FontWeight.ExtraBold, UnitLineHeight * 30, (-0.9).sp, tabular = true),
                color = c.onNavy,
            )
            TabularText(
                text = " /100",
                modifier = Modifier.alignByBaseline(),
                style = t.caption.sized(12, FontWeight.Bold, UnitLineHeight * 12, tabular = true),
                color = c.onNavy2,
            )
        }
        Text(
            text = verdictText,
            modifier = Modifier.padding(top = 6.dp),
            color = c.onNavy2,
            style = t.caption.sized(12, FontWeight.Bold, 16.8),
        )
    }
}

/** Sky tax tile (`.stile.sky`): "PROPERTY TAX", the 22 sp bill, "<year> bill", and next year's bill at the new rate. */
@Composable
private fun TaxTile(result: ScanResult, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(c.sky)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        CardLabel(text = "Property tax", color = c.skyInk)
        val bill = result.taxBill
        TabularText(
            text = if (bill != null) Format.money(bill) else "–",
            modifier = Modifier.padding(top = 6.dp),
            style = t.stat.sized(22, FontWeight.ExtraBold, 24.2, (-0.44).sp, tabular = true),
            color = if (bill != null) c.ink else c.muted,
        )
        Text(
            text = if (bill != null) "${result.taxBillYear} bill" else "No bill on the tax list yet",
            modifier = Modifier.padding(vertical = 3.dp),
            color = c.ink,
            style = t.caption.sized(12, FontWeight.Normal, 16.8),
        )
        val next = result.nextYearBill
        if (next != null) {
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "${result.nextYear} at the new rate",
                    modifier = Modifier.weight(1f).alignByBaseline(),
                    color = c.ink,
                    style = t.caption.sized(12, FontWeight.Normal, 16.8),
                )
                TabularText(
                    text = Format.money(next),
                    modifier = Modifier.alignByBaseline(),
                    style = t.supporting.sized(13, FontWeight.Bold, 18.2, tabular = true),
                    color = c.ink,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Sand list price row (`.price`): "List price" with where it came from on the left, the 19 sp price on the right. */
@Composable
private fun PriceRow(listPrice: Int?, sourceLabel: String, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(c.sand)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f).alignBy(FirstBaseline)) {
            Text(text = "List price", color = c.sandInk, style = t.supporting.sized(13, FontWeight.SemiBold, 18.2))
            Text(text = sourceLabel, color = c.muted, style = t.caption.sized(12, FontWeight.Medium, 16.8))
        }
        TabularText(
            text = if (listPrice != null) Format.money(listPrice) else "–",
            modifier = Modifier.alignByBaseline(),
            style = t.statSmall.sized(19, FontWeight.ExtraBold, 26.6, tabular = true),
            color = if (listPrice != null) c.ink else c.muted,
            maxLines = 1,
        )
    }
}

// ---------------------------------------------------------------------- history sheet

/** Earlier scans, newest first: the home, then its score and bill. Tapping one shows it again. */
@Composable
private fun HistorySheet(state: ScanUiState.Ready, onDismiss: () -> Unit, onPick: (ScanHistoryItem) -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdModalSheet(onDismiss = onDismiss) {
        Text(
            text = "Scan history",
            modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 4.dp),
            color = c.ink,
            style = t.sectionTitle,
        )
        val items = state.history
        when {
            state.historyLoading || items == null -> Box(
                modifier = Modifier
                    .padding(top = 10.dp)
                    .fillMaxWidth()
                    .height(WatchdogDimens.rowMinHeight * 2)
                    .clip(RoundedCornerShape(WatchdogDimens.cardRadius))
                    .background(c.fill)
                    .semantics { contentDescription = "Loading scan history" },
            )
            items.isEmpty() -> ReadBox(
                icon = WdIcons.History,
                text = "Nothing scanned yet. Homes you look up from a sign or a pasted link land here.",
                modifier = Modifier.padding(top = 10.dp),
            )
            // The list is one bordered card, so it scrolls as a whole; `fill = false` lets a short list keep
            // the sheet at its content height while a long one takes the rest of the sheet and scrolls.
            else -> Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(top = 10.dp),
            ) {
                RowList(items = items) { item ->
                    val r = item.result
                    val meta = listOfNotNull(
                        r.score?.let { "Score $it" },
                        r.taxBill?.let { "${r.taxBillYear} tax ${Format.money(it)}" },
                        r.listPrice?.let { "listed at ${Format.money(it)}" },
                    ).joinToString(" · ")
                    WdRow(
                        title = "${r.property.address}, ${Derived.shortTownName(r.property.town)}",
                        supporting = meta.ifBlank { r.property.county },
                        tile = TileTint.Sky,
                        icon = WdIcons.QrCodeScanner,
                        onClick = { onPick(item) },
                    )
                }
            }
        }
        // With the sheet's own 6 dp above the gesture bar, the 16 dp the list had below it.
        Spacer(Modifier.height(10.dp))
    }
}

// ---------------------------------------------------------------------- errors and helpers

/** The screen itself could not start (nothing to do with a single lookup). */
@Composable
private fun ScanFatalError(userMessage: String, onClose: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp)) {
        ReadBox(icon = WdIcons.Error, text = userMessage)
        WdTonalButton(label = "Close", onClick = onClose, modifier = Modifier.padding(top = 10.dp), icon = WdIcons.Close, small = true)
    }
}
