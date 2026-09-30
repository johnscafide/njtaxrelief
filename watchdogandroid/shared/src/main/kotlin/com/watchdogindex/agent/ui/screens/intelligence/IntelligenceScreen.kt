package com.watchdogindex.agent.ui.screens.intelligence

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.core.model.ChatTurn
import com.watchdogindex.agent.design.Intelligence
import com.watchdogindex.agent.design.IntelligenceName
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.BriefCard
import com.watchdogindex.agent.ui.components.CardLabel
import com.watchdogindex.agent.ui.components.FollowUpRow
import com.watchdogindex.agent.ui.components.IntelligenceComposer
import com.watchdogindex.agent.ui.components.RowList
import com.watchdogindex.agent.ui.components.SectionHeader
import com.watchdogindex.agent.ui.components.TopBarAction
import com.watchdogindex.agent.ui.components.WatchdogTopBar
import com.watchdogindex.agent.ui.components.WdCard
import com.watchdogindex.agent.ui.components.WdModalSheet
import com.watchdogindex.agent.ui.components.WdRow
import com.watchdogindex.agent.ui.components.WdTonalButton
import com.watchdogindex.agent.ui.components.cardMargin
import com.watchdogindex.agent.ui.components.listMargin
import com.watchdogindex.agent.ui.components.overflowTouchTarget
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.statusBarAllowance
import com.watchdogindex.agent.ui.nav.Navigator

/*
 * Watchdog Intelligence (pushed), spec §4.8: the top bar with the product name (only "Intelligence" in
 * spectrum) and a history action, "For Alex · Monday, September 28", the Monday brief in its Intelligence
 * surface, "Ask a follow-up" with the prompt rows, the conversation below it and the pinned composer whose
 * mic starts Watchdog Intelligence Voice. Scroll padding is the mockup's 128 below (composer 98 + 30).
 */

private const val COMPOSER_HINT = "Ask about a home, client or town"

/** The mockup's gap between the last row and the composer (`.scroll` bottom 128 = composer 98 + 30). */
private val scrollBottomGap = 30.dp

/** Bubbles stop short of the far edge so a question and an answer read as two sides. */
private val bubbleMaxWidth = 332.dp

@Composable
fun IntelligenceScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val voice = LocalVoiceSession.current
    val vm = screenViewModel { IntelligenceViewModel(graph.repos) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val snackbar = remember { SnackbarHostState() }
    val ready = state as? IntelligenceUiState.Ready

    LaunchedEffect(ready?.notice) {
        val notice = ready?.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        vm.clearNotice()
    }
    // Leaving the screen while listening stops the recognizer; its onFinished then clears the listening state.
    DisposableEffect(voice) { onDispose { voice.stop() } }

    /** Every mic on the screen: starts Watchdog Intelligence Voice, or stops it while it is listening. */
    val toggleVoice: () -> Unit = {
        when {
            ready == null -> Unit
            ready.listening -> voice.stop()
            !voice.available -> vm.notify(NoVoiceSession.UNAVAILABLE_MESSAGE)
            else -> {
                vm.setListening(true)
                voice.start(
                    onTranscript = { vm.ask(it) },
                    onFinished = { error ->
                        vm.setListening(false)
                        if (error != null) vm.notify(error)
                    },
                )
            }
        }
    }

    Scaffold(
        containerColor = c.bg,
        contentColor = c.ink,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Column(modifier = Modifier.fillMaxWidth().background(c.bg)) {
                Spacer(Modifier.height(statusBarAllowance()))
                WatchdogTopBar(
                    title = Intelligence.productName(),
                    onBack = navigator::back,
                    actions = listOf(TopBarAction(WdIcons.History, "History of your questions") { vm.setHistoryOpen(true) }),
                )
            }
        },
        bottomBar = {
            // The composer appears with the brief: while the skeleton or the error card shows there is nothing to
            // ask against, and a visible but inert mic would be a dead control.
            if (ready != null) {
                IntelligenceComposer(
                    hint = COMPOSER_HINT,
                    onMic = toggleVoice,
                    value = ready.draft,
                    onValueChange = vm::setDraft,
                    onSend = vm::sendDraft,
                    listening = ready.listening,
                )
            }
        },
    ) { inner ->
        val direction = LocalLayoutDirection.current
        val contentPadding = PaddingValues(
            start = inner.calculateStartPadding(direction),
            end = inner.calculateEndPadding(direction),
            top = inner.calculateTopPadding(),
            bottom = inner.calculateBottomPadding() + scrollBottomGap,
        )
        when (val s = state) {
            IntelligenceUiState.Loading -> IntelligenceSkeleton(contentPadding)
            is IntelligenceUiState.Error -> IntelligenceError(s.userMessage, contentPadding, onRetry = vm::load)
            is IntelligenceUiState.Ready -> IntelligenceContent(
                state = s,
                contentPadding = contentPadding,
                onListen = { vm.listen(platform::openUrl) },
                onVoice = toggleVoice,
                onAsk = vm::ask,
                onRetry = vm::retry,
            )
        }
    }

    if (ready?.historyOpen == true) {
        HistorySheet(
            questions = ready.questions,
            onAsk = { question ->
                vm.setHistoryOpen(false)
                vm.ask(question)
            },
            onDismiss = { vm.setHistoryOpen(false) },
        )
    }
}

@Composable
private fun IntelligenceContent(
    state: IntelligenceUiState.Ready,
    contentPadding: PaddingValues,
    onListen: () -> Unit,
    onVoice: () -> Unit,
    onAsk: (String) -> Unit,
    onRetry: (Int) -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val brief = state.brief
    val listState = rememberLazyListState()

    // A new question, answer or failure brings the conversation into view. The index comes from the same state
    // the list is built from: four fixed items, the header, then the turns, each failed question's bubble and the
    // thinking bubble.
    val lastIndex = if (state.hasConversation) {
        4 + state.turns.size + state.failed.size + (if (state.pending.isNotEmpty()) 1 else 0)
    } else {
        -1
    }
    LaunchedEffect(lastIndex) {
        if (lastIndex >= 0) listState.animateScrollToItem(lastIndex)
    }

    LazyColumn(modifier = Modifier.fillMaxSize(), state = listState, contentPadding = contentPadding) {
        item(key = "for") {
            // `.lt-sub` (padding 0 20 0 on this screen): 15 sp 500 muted.
            Text(text = brief.forLabel, modifier = Modifier.padding(horizontal = 20.dp), color = c.muted, style = t.body.sized(15, FontWeight.Medium, 21.0))
        }
        item(key = "brief") {
            BriefCard(
                brief = brief,
                onListen = onListen,
                onVoice = onVoice,
                modifier = Modifier.cardMargin(),
            )
        }
        item(key = "follow-up-header") { SectionHeader(title = "Ask a follow-up") }
        item(key = "follow-ups") {
            RowList(items = state.followUps, modifier = Modifier.listMargin(), dividerInset = 54.dp) { followUp ->
                FollowUpRow(followUp = followUp, onClick = { onAsk(followUp.text) })
            }
        }
        if (state.hasConversation) {
            item(key = "conversation-header") { SectionHeader(title = "Your questions") }
            state.turns.forEachIndexed { index, turn ->
                item(key = "turn-$index") { ChatBubble(turn) }
                val failure = state.failed[index]
                if (failure != null) {
                    item(key = "failed-$index") { FailedBubble(message = failure, onRetry = { onRetry(index) }) }
                }
            }
            if (state.pending.isNotEmpty()) {
                item(key = "thinking") { ThinkingBubble() }
            }
        }
    }
}

// ---------------------------------------------------------------------- conversation

/** A question (agent, tinted, at the end) or an answer (surface with a line border, at the start, sources under it). */
@Composable
private fun ChatBubble(turn: ChatTurn) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = if (turn.fromAgent) {
        RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 6.dp)
    } else {
        RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 6.dp, bottomEnd = 20.dp)
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp),
        horizontalArrangement = if (turn.fromAgent) Arrangement.End else Arrangement.Start,
    ) {
        val surface = if (turn.fromAgent) Modifier.background(c.tint, shape) else Modifier.background(c.surface, shape).border(1.dp, c.line, shape)
        Column(
            modifier = Modifier
                .widthIn(max = bubbleMaxWidth)
                .clip(shape)
                .then(surface)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .semantics(mergeDescendants = true) {
                    if (turn.fromAgent) contentDescription = "You asked: " + turn.text
                },
        ) {
            if (!turn.fromAgent) IntelligenceName(style = t.body.sized(12, FontWeight.Bold, 16.0), color = c.muted)
            Text(
                text = turn.text,
                modifier = if (turn.fromAgent) Modifier else Modifier.padding(top = 4.dp),
                color = if (turn.fromAgent) c.onTint else c.ink,
                style = if (turn.fromAgent) t.body.sized(15, FontWeight.SemiBold, 21.0) else t.briefItem.copy(fontWeight = FontWeight.Normal),
            )
            if (turn.sources.isNotEmpty()) {
                Text(
                    text = "Sources: " + turn.sources.joinToString(" · "),
                    modifier = Modifier.padding(top = 6.dp),
                    color = c.muted,
                    style = t.briefSource,
                )
            }
        }
    }
}

@Composable
private fun ThinkingBubble() {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 6.dp, bottomEnd = 20.dp)
    Row(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp)) {
        Text(
            text = "Reading the public record…",
            modifier = Modifier
                .clip(shape)
                .background(c.surface)
                .border(1.dp, c.line, shape)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .semantics { contentDescription = "Watchdog Intelligence is answering" },
            color = c.muted,
            style = t.body,
        )
    }
}

/** A friendly failure in the conversation with a "Try again" link on a 48 dp target. */
@Composable
private fun FailedBubble(message: String, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 6.dp, bottomEnd = 20.dp)
    Row(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp)) {
        Column(
            modifier = Modifier
                .widthIn(max = bubbleMaxWidth)
                .clip(shape)
                .background(c.warnBg)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Text(text = message, color = c.warnInk, style = t.body.sized(14, FontWeight.Medium, 20.3))
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .overflowTouchTarget()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = onRetry),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "Try again", color = c.warnInk, style = t.sectionLink)
            }
        }
    }
}

// ---------------------------------------------------------------------- history

/** The history action: this session's questions, newest first; tapping one asks it again. */
@Composable
private fun HistorySheet(questions: List<String>, onAsk: (String) -> Unit, onDismiss: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdModalSheet(onDismiss = onDismiss) {
        Text(text = "History", modifier = Modifier.padding(start = 4.dp, top = 4.dp, bottom = 10.dp), color = c.ink, style = t.sectionTitle)
        val recent = questions.asReversed().distinct()
        if (recent.isEmpty()) {
            RowList {
                WdRow(
                    title = "No questions yet",
                    supporting = "Questions you ask this session appear here.",
                    icon = WdIcons.History,
                    trailing = null,
                )
            }
        } else {
            RowList(items = recent, dividerInset = 54.dp) { question ->
                FollowUpRow(icon = WdIcons.History, text = question, onClick = { onAsk(question) })
            }
        }
    }
}

// ---------------------------------------------------------------------- loading and error

/** Loading: the for-line and the brief card as quiet blocks under the pinned top bar. */
@Composable
private fun IntelligenceSkeleton(contentPadding: PaddingValues) {
    val c = WatchdogTheme.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding)
            .semantics { contentDescription = "Loading your brief" },
    ) {
        Box(Modifier.padding(start = 20.dp, top = 3.dp).height(15.dp).widthIn(min = 220.dp).clip(RoundedCornerShape(6.dp)).background(c.fill))
        Box(Modifier.cardMargin().fillMaxWidth().height(590.dp).clip(RoundedCornerShape(WatchdogDimens.cardRadius)).background(c.fill))
    }
}

@Composable
private fun IntelligenceError(userMessage: String, contentPadding: PaddingValues, onRetry: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding)) {
        WdCard(modifier = Modifier.cardMargin()) {
            CardLabel("Monday brief")
            Text(text = "Your brief didn’t load", modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
            Text(text = userMessage, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
            WdTonalButton(label = "Try again", onClick = onRetry, modifier = Modifier.padding(top = 12.dp), icon = WdIcons.Refresh, small = true)
        }
    }
}
