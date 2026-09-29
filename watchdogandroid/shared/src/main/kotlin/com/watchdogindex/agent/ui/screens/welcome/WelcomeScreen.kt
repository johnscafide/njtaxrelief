package com.watchdogindex.agent.ui.screens.welcome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.app.LocalAppGraph
import com.watchdogindex.agent.app.screenViewModel
import com.watchdogindex.agent.design.WatchdogLogo
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.ui.components.SupportingText
import com.watchdogindex.agent.ui.components.WdOutlinedButton
import com.watchdogindex.agent.ui.components.WdOutlinedField
import com.watchdogindex.agent.ui.components.WdPrimaryButton
import com.watchdogindex.agent.ui.components.bottomChromeInsets
import com.watchdogindex.agent.ui.components.sized
import com.watchdogindex.agent.ui.components.topSeparator
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/*
 * Welcome (`S.welcome.android`, spec §3.31 / §4.1): the fixed-navy hero with the 60 dp mark, the three
 * numbered steps, and the CTA block pinned to the bottom. Edge to edge, no scroll in the idle state, no
 * navigation bar. The email code flow lives inside the same screen as CTA states.
 */

/** Hero gradient `linear-gradient(170deg, #0e2248, #11306a)`: fixed in both themes (spec §1.12). */
private val HeroGradientStart = Color(0xFF0E2248)
private val HeroGradientEnd = Color(0xFF11306A)

/** `.wel-for` gold `#e3c46a`, identical in dark (spec §1.12). Not yet a FixedInk token; see the report. */
private val EyebrowGold = Color(0xFFE3C46A)

/** `.logo` ring `rgba(255,255,255,.18)` and `.wel-p` ink `rgba(255,255,255,.8)` on the fixed-navy hero. */
private val LogoRing = Color.White.copy(alpha = .18f)
private val LedeInk = Color.White.copy(alpha = .8f)

/** The mockup's status bar allowance, used when the host draws no status bar (the desktop preview). */
private val MockupStatusBarHeight = 40.dp

private const val ONBOARDING_URL = "https://www.watchdogindex.com/onboarding/"

private class WelcomeStep(val title: String, val body: String)

private val WelcomeSteps = listOf(
    WelcomeStep("Add your past clients", "From your CRM or contacts. Each is matched to a parcel."),
    WelcomeStep("Draw your farm", "Outline a neighborhood on the map."),
    WelcomeStep("Turn on the Monday email", "Your top ten changes, Mondays at 8:00 AM."),
)

@Composable
fun WelcomeScreen(navigator: Navigator) {
    val graph = LocalAppGraph.current
    val platform = LocalPlatformServices.current
    val vm = screenViewModel { WelcomeViewModel(graph.repos) }
    val state by vm.state.collectAsState()
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type

    val signedIn = (state as? WelcomeUiState.Ready)?.signedIn == true
    LaunchedEffect(signedIn) {
        // The host replaces the back stack when Today opens from Welcome.
        if (signedIn) navigator.open(Route.Today)
    }

    Scaffold(containerColor = c.bg, contentWindowInsets = WindowInsets(0.dp)) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            WelcomeHero()
            // `.wel-body`: padding 22 20 40; the 40 covers the gesture area on the mockup device, so on a
            // device with a taller navigation bar the bottom grows with it instead of sitting under it.
            val chromeBottom = bottomChromeInsets().asPaddingValues().calculateBottomPadding()
            val bodyBottom = maxOf(40.dp, chromeBottom + 16.dp)
            BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
                val minHeight = maxHeight
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = minHeight)
                        .padding(start = 20.dp, end = 20.dp, top = 22.dp, bottom = bodyBottom),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        // `.wel-sh`: 17 sp 800 ink.
                        Text(
                            text = "Start with three things",
                            color = c.ink,
                            style = t.sectionTitle.sized(17, FontWeight.ExtraBold, 23.8),
                        )
                        Column(modifier = Modifier.padding(top = 8.dp)) {
                            WelcomeSteps.forEachIndexed { index, step ->
                                StepRow(number = index + 1, step = step, separator = index > 0)
                            }
                        }
                    }
                    Column(modifier = Modifier.padding(top = 24.dp)) {
                        when (val s = state) {
                            WelcomeUiState.Loading -> Box(Modifier.fillMaxWidth().height(106.dp))
                            is WelcomeUiState.Error -> ErrorBlock(message = s.userMessage, onRetry = vm::reset)
                            is WelcomeUiState.Ready -> CtaBlock(
                                ready = s,
                                showPasskey = platform.supportsPasskeys,
                                onContinueWithEmail = vm::startEmail,
                                onPasskey = vm::signInWithPasskey,
                                onEmailChange = vm::setEmail,
                                onSendCode = vm::sendCode,
                                onBack = vm::backToStart,
                                onCodeChange = vm::setCode,
                                onVerify = vm::verifyCode,
                                onEditEmail = vm::editEmail,
                            )
                        }
                        FinePrint(onCreateAccount = { platform.openUrl(ONBOARDING_URL) })
                    }
                }
            }
        }
    }
}

/** `.wel-hero`: padding 64 24 26 (the 64 is the status bar plus 24), gradient, bottom radius 28. */
@Composable
private fun WelcomeHero() {
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heroGradient(shape)
            .padding(top = statusBarTopPadding() + 24.dp, start = 24.dp, end = 24.dp, bottom = 26.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            // The product name follows as text, so the mark itself is decorative here.
            WatchdogLogo(
                size = 60.dp,
                modifier = Modifier.border(1.dp, LogoRing, RoundedCornerShape(15.dp)),
                cornerRadius = 15.dp,
                contentDescription = null,
            )
            Text(text = "Watchdog", color = Color.White, style = t.welcomeName)
        }
        Text(
            text = "FOR NEW JERSEY AGENTS AND TEAMS",
            modifier = Modifier.padding(top = 18.dp),
            color = EyebrowGold,
            style = t.welcomeFor,
        )
        Text(
            text = "Know every home in your sphere and farm before you call.",
            modifier = Modifier.padding(top = 8.dp),
            color = Color.White,
            style = t.welcomeHeadline,
        )
        // `.wel-p` is 400 in the mockup; the lede token carries 500, so the weight is adjusted here.
        Text(
            text = "Taxes, assessments, sales and permits for any New Jersey property, with the source for every number.",
            modifier = Modifier.padding(top = 10.dp),
            color = LedeInk,
            style = t.welcomeLede.copy(fontWeight = FontWeight.Normal),
        )
    }
}

/** `.steps` item: grid 30 / 1fr, gap 12, padding 10 0, 1 dp separator above every item after the first. */
@Composable
private fun StepRow(number: Int, step: WelcomeStep, separator: Boolean) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (separator) Modifier.topSeparator(c.separator) else Modifier)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(modifier = Modifier.width(30.dp)) {
            Box(
                modifier = Modifier.size(28.dp).clip(CircleShape).background(c.navy),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = number.toString(),
                    color = Color.White,
                    style = t.body.sized(14, FontWeight.ExtraBold, 14.0),
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = step.title, color = c.ink, style = t.body.sized(15, FontWeight.Bold, 21.0))
            Text(
                text = step.body,
                modifier = Modifier.padding(top = 1.dp),
                color = c.muted,
                style = t.supporting.sized(13, FontWeight.Normal, 18.2),
            )
        }
    }
}

/** `.wel-cta` in each of its states, vertical gap 10. */
@Composable
private fun CtaBlock(
    ready: WelcomeUiState.Ready,
    showPasskey: Boolean,
    onContinueWithEmail: () -> Unit,
    onPasskey: () -> Unit,
    onEmailChange: (String) -> Unit,
    onSendCode: () -> Unit,
    onBack: () -> Unit,
    onCodeChange: (String) -> Unit,
    onVerify: () -> Unit,
    onEditEmail: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        when (ready.step) {
            SignInStep.Start -> {
                WdPrimaryButton(
                    label = if (ready.busy) "Signing in…" else "Continue with email",
                    onClick = onContinueWithEmail,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !ready.busy,
                )
                // Passkeys need the platform's credential manager AND a WebAuthn enrolment on the backend.
                // Desktop reports false; the Android app reports false today as well because the Watchdog
                // backend has no WebAuthn endpoint yet, so this button is hidden on every current build.
                if (showPasskey) {
                    WdOutlinedButton(
                        label = "Use a passkey",
                        onClick = onPasskey,
                        modifier = Modifier.fillMaxWidth(),
                        icon = WdIcons.Passkey,
                        enabled = !ready.busy,
                    )
                }
                InlineError(ready.inlineError)
            }
            SignInStep.Email -> {
                WdOutlinedField(
                    label = "Email",
                    value = ready.email,
                    onValueChange = onEmailChange,
                    placeholder = "you@yourbrokerage.com",
                    onClear = { onEmailChange("") },
                    enabled = !ready.busy,
                )
                InlineError(ready.inlineError)
                WdPrimaryButton(
                    label = if (ready.busy) "Sending…" else "Send code",
                    onClick = onSendCode,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !ready.busy && ready.email.isNotBlank(),
                )
                WdOutlinedButton(label = "Back", onClick = onBack, modifier = Modifier.fillMaxWidth(), enabled = !ready.busy)
            }
            SignInStep.Code -> {
                Column {
                    WdOutlinedField(
                        label = "Six-digit code",
                        value = ready.code,
                        onValueChange = onCodeChange,
                        placeholder = "000000",
                        onClear = { onCodeChange("") },
                        enabled = !ready.busy,
                    )
                    SupportingText(text = "We emailed a code to ${ready.email.trim()}. It expires in ten minutes.")
                }
                InlineError(ready.inlineError)
                WdPrimaryButton(
                    label = if (ready.busy) "Signing in…" else "Sign in",
                    onClick = onVerify,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !ready.busy && ready.code.length == WelcomeViewModel.CODE_LENGTH,
                )
                WdOutlinedButton(
                    label = if (ready.resendSeconds > 0) "Resend code in ${ready.resendSeconds} s" else "Resend code",
                    onClick = onSendCode,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !ready.busy && ready.resendSeconds == 0,
                )
                TextLink(
                    label = "Use a different email",
                    onClick = onEditEmail,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
        }
    }
}

/** The friendly message under a field: icon plus text, announced politely; never color alone. */
@Composable
private fun InlineError(message: String?) {
    if (message == null) return
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = WdIcons.Error, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.red)
        Text(text = message, color = c.red, style = t.supporting)
    }
}

@Composable
private fun ErrorBlock(message: String, onRetry: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        InlineError(message)
        WdPrimaryButton(label = "Try again", onClick = onRetry, modifier = Modifier.fillMaxWidth())
    }
}

/** `.wel-fine`: two centered 13 sp muted lines, the second ending in the `.lnk` "Create an account". */
@Composable
private fun FinePrint(onCreateAccount: () -> Unit) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val fine = t.supporting.sized(13, FontWeight.Normal, 18.2)
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Same account as the Agent Desk on the web.", color = c.muted, style = fine, textAlign = TextAlign.Center)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = "New here? ", color = c.muted, style = fine)
            TextLink(label = "Create an account", onClick = onCreateAccount)
        }
    }
}

/**
 * An inline text link (`.lnk`, 15 sp 700 link color) whose 48 dp touch box overflows its 21 dp line on
 * purpose, so the fine print keeps the mockup's height while staying easy to hit.
 */
@Composable
private fun TextLink(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Box(modifier = modifier.height(21.dp), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .requiredHeight(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = label, color = c.link, style = t.sectionLink, maxLines = 1, softWrap = false)
        }
    }
}

/**
 * The system status bar height, or the mockup's 40 dp allowance where the host draws no status bar (the
 * desktop preview and the screenshot harness), so the hero lines up with the reference frames.
 */
@Composable
private fun statusBarTopPadding(): Dp {
    val system = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    return if (system > 0.dp) system else MockupStatusBarHeight
}

/** CSS `linear-gradient(170deg, …)`: the gradient line runs 170° clockwise from "to top" through the center. */
private fun Modifier.heroGradient(shape: Shape): Modifier = clip(shape).drawBehind {
    val radians = 170.0 * PI / 180.0
    val dx = sin(radians).toFloat()
    val dy = -cos(radians).toFloat()
    val length = abs(size.width * dx) + abs(size.height * dy)
    val start = Offset(center.x - dx * length / 2f, center.y - dy * length / 2f)
    val end = Offset(center.x + dx * length / 2f, center.y + dy * length / 2f)
    drawRect(brush = Brush.linearGradient(listOf(HeroGradientStart, HeroGradientEnd), start = start, end = end))
}
