package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.core.model.CheckupSeason
import com.watchdogindex.agent.core.model.PriceCheck
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.core.model.ValueVerdict
import com.watchdogindex.agent.core.model.VerdictKind
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogLogo
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/** The tint of the enclosing [WdCard]; [CardLabel] and nested components read it. */
val LocalCardTint = compositionLocalOf { Tint.Plain }

/** The label ink of the enclosing [WdCard] (`.ch` color per tint). Unspecified outside a card, which means muted. */
val LocalCardLabelColor = compositionLocalOf { Color.Unspecified }

/**
 * The mockup card (`.card`): 24 dp radius, 16x18 padding, no elevation. Plain cards get the 1 dp line
 * border; Navy/Sky/Sand/Mint cards are filled and borderless. The caller adds the margin
 * ([Modifier.cardMargin]). Content color follows the tint (white on navy, ink elsewhere) and
 * [CardLabel] picks up the matching label ink automatically.
 */
@Composable
fun WdCard(
    tint: Tint = Tint.Plain,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = WatchdogDimens.cardPaddingH, vertical = WatchdogDimens.cardPaddingV),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = tint.colors()
    val shape = RoundedCornerShape(WatchdogDimens.cardRadius)
    var surface = modifier.fillMaxWidth().clip(shape).background(palette.container)
    if (tint == Tint.Plain) surface = surface.border(1.dp, palette.border, shape)
    if (onClick != null) surface = surface.clickable(role = Role.Button, onClick = onClick)
    CompositionLocalProvider(
        LocalCardTint provides tint,
        LocalCardLabelColor provides palette.label,
        LocalContentColor provides palette.content,
    ) {
        Column(modifier = surface.padding(contentPadding), content = content)
    }
}

/** Card label (`.ch`): 12 sp, 700, tracked, upper case, in the card's label ink. Announced in its original case. */
@Composable
fun CardLabel(text: String, modifier: Modifier = Modifier, color: Color = LocalCardLabelColor.current) {
    val resolved = if (color.isSpecified) color else WatchdogTheme.colors.muted
    Text(
        text = text.uppercase(),
        modifier = modifier.semantics { contentDescription = text },
        color = resolved,
        style = WatchdogTheme.type.cardLabel,
    )
}

/** Section header (`.sh`): 20 sp 800 title and an optional 15 sp 700 link, baseline aligned, padding 24 20 0. */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    linkLabel: String? = null,
    onLink: (() -> Unit)? = null,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = WatchdogDimens.sectionTop),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = title, modifier = Modifier.weight(1f).alignByBaseline(), color = c.ink, style = t.sectionTitle)
        if (linkLabel != null) {
            val link = if (onLink != null) Modifier.clickable(role = Role.Button, onClick = onLink) else Modifier
            Text(
                text = linkLabel,
                modifier = Modifier.alignByBaseline().then(link),
                color = c.link,
                style = t.sectionLink,
                maxLines = 1,
            )
        }
    }
}

/**
 * Key-value line (`.kv`): 14 sp label (with an optional 12 sp muted sublabel under it) and a 15 sp 700
 * tabular value, baseline aligned, 5 dp vertical padding. [muted] greys both sides (`.kv.m`).
 */
@Composable
fun KeyValueRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    sublabel: String? = null,
    muted: Boolean = false,
    valueStyle: TextStyle = WatchdogTheme.type.kvValue,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val color = if (muted) c.muted else LocalContentColor.current
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f).alignBy(FirstBaseline)) {
            Text(text = label, color = color, style = t.kvLabel)
            if (sublabel != null) {
                Text(text = sublabel, color = c.muted, style = t.caption.sized(12, FontWeight.Normal, 16.8))
            }
        }
        TabularText(text = value, modifier = Modifier.alignByBaseline(), style = valueStyle, color = color, maxLines = 1)
    }
}

/** Sources footnote (`.src`): 12 sp / 18 muted, padding 18 22. */
@Composable
fun SourcesNote(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 18.dp),
        color = WatchdogTheme.colors.muted,
        style = WatchdogTheme.type.caption.copy(fontWeight = FontWeight.Normal),
    )
}

/** Verdict box (`.vd`): 14 dp radius, 10x12 padding, 14 sp 700 title over 13 sp body, good or warn tones. */
@Composable
fun VerdictBox(kind: VerdictKind, title: String, body: String, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val (container, ink) = when (kind) {
        VerdictKind.Good -> c.goodBg to c.goodInk
        VerdictKind.Warn -> c.warnBg to c.warnInk
        VerdictKind.Neutral -> c.fill to c.ink2
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(container)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(text = title, color = ink, style = t.body.sized(14, FontWeight.Bold, 20.3))
        Spacer(Modifier.height(2.dp))
        Text(text = body, color = ink, style = t.body.sized(13, FontWeight.Normal, 18.85))
    }
}

@Composable
fun VerdictBox(verdict: ValueVerdict, modifier: Modifier = Modifier) {
    VerdictBox(kind = verdict.kind, title = verdict.title, body = verdict.body, modifier = modifier)
}

/** The scan price check as a verdict box: "in line" reads as good, high or low tax for the price as a warning. */
@Composable
fun VerdictBox(priceCheck: PriceCheck, modifier: Modifier = Modifier) {
    val kind = when (priceCheck.kind) {
        PriceCheckKind.InLine -> VerdictKind.Good
        PriceCheckKind.LowTaxForPrice, PriceCheckKind.HighTaxForPrice -> VerdictKind.Warn
        PriceCheckKind.Unknown -> VerdictKind.Neutral
    }
    VerdictBox(kind = kind, title = priceCheck.title, body = priceCheck.body, modifier = modifier)
}

/** Read box (`.readbox`): fill container, 16 dp radius, teal 22 dp icon and 13 sp ink2 text. */
@Composable
fun ReadBox(icon: ImageVector, text: AnnotatedString, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.fill)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.teal)
        Text(text = text, color = c.ink2, style = WatchdogTheme.type.body.sized(13, FontWeight.Normal))
    }
}

@Composable
fun ReadBox(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    ReadBox(icon = icon, text = AnnotatedString(text), modifier = modifier)
}

/**
 * Result panel (`.wpanel`): 24 dp radius surface with a 1 dp line border, a fixed-navy header (26 dp logo,
 * 15 sp title, 12 sp subtitle) and a body padded 12 14 14. The scan result uses it.
 */
@Composable
fun InfoPanel(
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(WatchdogDimens.cardRadius)
    Column(modifier = modifier.fillMaxWidth().clip(shape).background(c.surface).border(1.dp, c.line, shape)) {
        Row(
            modifier = Modifier.fillMaxWidth().background(FixedInk.navy).padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WatchdogLogo(size = 26.dp, cornerRadius = 7.dp, contentDescription = null)
            Column {
                Text(text = title, color = FixedInk.onNavy, style = t.rowTitle)
                if (subtitle != null) {
                    Text(text = subtitle, color = FixedInk.onNavyFaint, style = t.caption)
                }
            }
        }
        Column(modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp), content = content)
    }
}

/**
 * Checkup season banner (`.card.sand.season`): receipt icon and "CHECKUP SEASON" label, 19 sp 800 title,
 * 14 sp body and a small primary button hugging its text.
 */
@Composable
fun CheckupSeasonCard(season: CheckupSeason, onCta: () -> Unit, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Sand, modifier = modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = WdIcons.ReceiptLong, contentDescription = null, modifier = Modifier.size(20.dp), tint = c.sandInk)
            CardLabel("Checkup season")
        }
        Text(text = season.title, modifier = Modifier.padding(top = 6.dp), color = c.ink, style = t.verdict)
        Text(text = season.body, modifier = Modifier.padding(top = 6.dp), color = c.ink2, style = t.body.sized(14, FontWeight.Normal, 20.3))
        // 6 dp grid gap plus the button's own 6 dp margin-top.
        Spacer(Modifier.height(12.dp))
        WdPrimaryButton(label = season.ctaLabel, onClick = onCta, small = true)
    }
}
