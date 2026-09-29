package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.FollowUp
import com.watchdogindex.agent.design.IntelligenceInk
import com.watchdogindex.agent.design.IntelligenceName
import com.watchdogindex.agent.design.Spectrum
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons
import com.watchdogindex.agent.design.intelligenceSurface

/*
 * Watchdog Intelligence surfaces. The brand signature is fixed: the rotating spectrum border sits on the
 * OUTER card only (Modifier.intelligenceSurface), the surface stays white in dark mode with the fixed
 * light ink (IntelligenceInk), only the word "Intelligence" carries the spectrum (IntelligenceName), and
 * the name is never put in a pill. Anything built here inherits that automatically.
 */

/** Product name style inside Intelligence surfaces (`.it-k`, `.ib-voice b`): 15 sp 800. */
@Composable
private fun productNameStyle() = WatchdogTheme.type.body.sized(15, FontWeight.ExtraBold, 21.0)

/**
 * The Intelligence card (`.intel`): the rotating spectrum border, white surface in both themes, fixed
 * light ink for everything inside, 16x18 padding and the soft fixed shadow. Margin is the caller's.
 */
@Composable
fun IntelligenceCard(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = WatchdogDimens.cardPaddingH, vertical = WatchdogDimens.cardPaddingV),
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(WatchdogDimens.cardRadius)
    // CSS: box-shadow 0 14px 34px rgba(30,57,91,.10), the same in both themes.
    val shadow = FixedInk.intelligenceShadow.copy(alpha = .35f)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(elevation = 10.dp, shape = shape, clip = false, ambientColor = shadow, spotColor = shadow)
            .intelligenceSurface(shape = shape),
    ) {
        IntelligenceInk {
            CompositionLocalProvider(LocalContentColor provides Spectrum.ink) {
                Column(modifier = Modifier.fillMaxWidth().padding(contentPadding), content = content)
            }
        }
    }
}

/**
 * The 44 dp (or 56 dp) navy mic circle with the filled mic icon. Interactive when [onClick] is set and
 * announced as [contentDescription]; decorative (no semantics) when null so an enclosing control can
 * carry the label.
 */
@Composable
fun MicButton(
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    contentDescription: String = "Ask Watchdog Intelligence Voice",
) {
    val base = modifier.size(size).clip(CircleShape).background(FixedInk.navy)
    val interactive = if (onClick != null) {
        base.clickable(role = Role.Button, onClick = onClick).semantics { this.contentDescription = contentDescription }
    } else {
        base
    }
    Box(modifier = interactive, contentAlignment = Alignment.Center) {
        Icon(imageVector = WdIcons.MicFill, contentDescription = null, modifier = Modifier.size(24.dp), tint = FixedInk.onNavy)
    }
}

/** Listen pill (`.play`): 44 dp tonal pill with the filled play icon and a 14 sp 700 label such as "Listen 1:52". */
@Composable
fun ListenPill(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(c.tint)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(start = 10.dp, end = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = WdIcons.PlayArrowFill, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.onTint)
        Text(text = label, color = c.onTint, style = WatchdogTheme.type.body.sized(14, FontWeight.Bold), maxLines = 1, softWrap = false)
    }
}

/**
 * The Today teaser (`.intel` teaser): "Watchdog Intelligence" (spectrum word), the 16 sp 600 sentence,
 * and a footer with the 44 dp mic + "Ask by voice" as one control and "Read the brief >" as a link.
 */
@Composable
fun IntelligenceTeaserCard(
    text: String,
    onAsk: () -> Unit,
    onReadBrief: () -> Unit,
    modifier: Modifier = Modifier,
    askLabel: String = "Ask by voice",
    briefLabel: String = "Read the brief",
) {
    val t = WatchdogTheme.type
    IntelligenceCard(modifier = modifier) {
        IntelligenceName(style = productNameStyle(), color = Spectrum.ink)
        Text(
            text = text,
            modifier = Modifier.padding(top = 4.dp),
            color = Spectrum.ink,
            style = t.body.sized(16, FontWeight.SemiBold, 23.2),
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(22.dp))
                    .clickable(role = Role.Button, onClick = onAsk)
                    .semantics(mergeDescendants = true) { contentDescription = "$askLabel, Watchdog Intelligence Voice" }
                    .padding(end = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MicButton(onClick = null)
                Text(text = askLabel, color = Spectrum.ink2, style = t.body.sized(14, FontWeight.Bold))
            }
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier.clickable(role = Role.Button, onClick = onReadBrief),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = briefLabel, color = Spectrum.link, style = t.sectionLink, maxLines = 1)
                Icon(imageVector = WdIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(22.dp), tint = Spectrum.link)
            }
        }
    }
}

/**
 * The Monday brief card (`.intel` on the Intelligence screen): kicker and time with the [ListenPill],
 * 21 sp heading, numbered items (24 dp navy circles, bold lead, 12 sp source line) separated by 1 dp
 * lines, and the "Watchdog Intelligence Voice" row with the 56 dp mic.
 */
@Composable
fun BriefCard(
    brief: Brief,
    onListen: () -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier,
    voiceCaption: String = "Ask a follow-up out loud, hands-free.",
) {
    val t = WatchdogTheme.type
    IntelligenceCard(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = brief.kicker.uppercase(),
                    modifier = Modifier.semantics { contentDescription = brief.kicker },
                    color = Spectrum.muted,
                    style = t.body.sized(13, FontWeight.ExtraBold, 18.2, em(13, 0.06)),
                )
                Text(
                    text = brief.timeLabel,
                    modifier = Modifier.padding(top = 2.dp),
                    color = Spectrum.muted,
                    style = t.body.sized(13, FontWeight.Medium),
                )
            }
            brief.listenLabel?.let { ListenPill(label = it, onClick = onListen) }
        }
        Text(text = brief.heading, modifier = Modifier.padding(top = 8.dp), color = Spectrum.ink, style = t.briefHeading)
        Column(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
            brief.items.forEachIndexed { index, item ->
                val divided = if (index > 0) Modifier.topSeparator(Spectrum.separator) else Modifier
                Row(
                    modifier = Modifier.fillMaxWidth().then(divided).padding(vertical = 12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier.size(24.dp).clip(CircleShape).background(FixedInk.navy),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = (index + 1).toString(),
                            color = FixedInk.onNavy,
                            style = t.body.sized(13, FontWeight.ExtraBold, 13.0),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Spectrum.ink)) { append(item.lead) }
                                append(item.text)
                            },
                            color = Spectrum.ink2,
                            style = t.briefItem.copy(fontWeight = FontWeight.Normal),
                        )
                        Text(text = item.source, modifier = Modifier.padding(top = 4.dp), color = Spectrum.muted, style = t.briefSource)
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp)
                .topSeparator(Spectrum.separator)
                .padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MicButton(onClick = onVoice, size = 56.dp, contentDescription = "Watchdog Intelligence Voice")
            Column {
                IntelligenceName(style = productNameStyle(), suffix = " Voice", color = Spectrum.ink)
                Text(
                    text = voiceCaption,
                    modifier = Modifier.padding(top = 1.dp),
                    color = Spectrum.muted,
                    style = t.body.sized(13, FontWeight.Normal),
                )
            }
        }
    }
}

/**
 * Follow-up prompt row (`.row.q`): 22 dp link-colored icon in a 28 dp column, 15 sp 600 text, chevron,
 * min height 56. Separator inset for these rows is 54 dp.
 */
@Composable
fun FollowUpRow(icon: ImageVector, text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.link)
        }
        Text(
            text = text,
            modifier = Modifier.weight(1f),
            color = c.ink,
            style = WatchdogTheme.type.body.sized(15, FontWeight.SemiBold, 21.0),
        )
        RowChevron()
    }
}

@Composable
fun FollowUpRow(followUp: FollowUp, onClick: () -> Unit, modifier: Modifier = Modifier) {
    FollowUpRow(icon = iconByName(followUp.icon, WdIcons.ChatBubble), text = followUp.text, onClick = onClick, modifier = modifier)
}

/**
 * The Material composer bar (`.composer.m`): container color, padding 12 16 (6 + inset below), a 56 dp
 * field with 28 dp radius on container-high, and the 56 dp square mic FAB without a shadow. Pass
 * [onValueChange] to make the field editable; the FAB becomes Send when there is text and [onSend] is set.
 */
@Composable
fun IntelligenceComposer(
    hint: String,
    onMic: () -> Unit,
    modifier: Modifier = Modifier,
    value: String = "",
    onValueChange: ((String) -> Unit)? = null,
    onSend: (() -> Unit)? = null,
    windowInsets: WindowInsets = bottomChromeInsets(),
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(c.mContainer)
            .windowInsetsPadding(windowInsets)
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(56.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(c.mHigh)
                .padding(horizontal = 18.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (onValueChange != null) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = t.searchHint.copy(color = c.ink),
                    singleLine = true,
                    cursorBrush = SolidColor(c.ink),
                    decorationBox = { innerTextField ->
                        Box {
                            if (value.isEmpty()) {
                                Text(text = hint, color = c.muted, style = t.searchHint, maxLines = 1)
                            }
                            innerTextField()
                        }
                    },
                )
            } else {
                Text(text = hint, color = c.muted, style = t.searchHint, maxLines = 1)
            }
        }
        // The FAB sends while there is typed text and a send handler; otherwise it is the mic.
        val send: (() -> Unit)? = onSend?.takeIf { value.isNotBlank() }
        WatchdogFab(
            icon = if (send != null) WdIcons.Send else WdIcons.MicFill,
            label = null,
            onClick = send ?: onMic,
            contentDescription = if (send != null) "Send" else "Ask Watchdog Intelligence Voice",
            elevated = false,
        )
    }
}
