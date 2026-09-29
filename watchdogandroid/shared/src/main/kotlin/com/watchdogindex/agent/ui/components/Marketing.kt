package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.CampaignKind
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.design.WatchdogDimens
import com.watchdogindex.agent.design.WatchdogLogo
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/*
 * Marketing: campaign cards, the buyer true cost card and the share sheet pieces. The true cost card,
 * postcard thumb and the Messages/Mail targets keep their fixed colors in dark mode (FixedInk), because
 * they are artwork the agent sends, not app chrome.
 */

/**
 * Postcard thumbnail (`.pc`): 66 dp tall, 12 dp radius, soft shadow; fixed-navy top row with a 16 dp logo
 * and 12 sp 800 text, fixed-sand bottom row with navy 12 sp 800 text.
 */
@Composable
fun PostcardThumb(top: String, bottom: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    val c = WatchdogTheme.colors
    val style = WatchdogTheme.type.body.sized(12, FontWeight.ExtraBold, 16.8)
    Column(
        modifier = modifier
            .height(66.dp)
            .shadow(elevation = 3.dp, shape = shape, ambientColor = c.shadow, spotColor = c.shadow)
            .clip(shape),
    ) {
        Row(
            modifier = Modifier.weight(1f).fillMaxWidth().background(FixedInk.navy).padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WatchdogLogo(size = 16.dp, cornerRadius = 4.dp, contentDescription = null)
            Text(text = top, color = FixedInk.onNavy, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(
            modifier = Modifier.weight(1f).fillMaxWidth().background(FixedInk.sand).padding(horizontal = 8.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(text = bottom, color = FixedInk.navy, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Email thumbnail (`.em`): 66 dp sky tile with the 30 dp mark_email_read icon. */
@Composable
fun EmailThumb(modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    Box(
        modifier = modifier.height(66.dp).clip(RoundedCornerShape(12.dp)).background(c.sky),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = WdIcons.MarkEmailRead, contentDescription = null, modifier = Modifier.size(30.dp), tint = c.skyInk)
    }
}

/**
 * Campaign card (`.card.camp`): plain card with 12 dp padding, a 106 dp thumbnail column ([PostcardThumb]
 * or [EmailThumb]), 15 sp 800 title, 13 sp muted subtitle and the status chip.
 */
@Composable
fun CampaignCard(c: Campaign, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Plain, modifier = modifier, contentPadding = PaddingValues(12.dp), onClick = onClick) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.width(106.dp)) {
                when (c.kind) {
                    CampaignKind.Postcard -> PostcardThumb(
                        top = c.thumbTop ?: c.title,
                        bottom = c.thumbBottom ?: "",
                        modifier = Modifier.fillMaxWidth(),
                    )
                    CampaignKind.Email -> EmailThumb(modifier = Modifier.fillMaxWidth())
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = c.title, color = colors.ink, style = t.body.sized(15, FontWeight.ExtraBold, 18.75))
                Text(text = c.subtitle, modifier = Modifier.padding(top = 2.dp), color = colors.muted, style = t.rowSupport)
                StatusChipView(chip = c.status, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

/**
 * The buyer true cost card (`.tc`): fixed navy, 24 dp radius. Label row with a 20 dp logo and "TRUE COST
 * CARD", 16 sp 800 address, the 34 sp monthly total with a 2 dp gold underline next to "a month at
 * $449,000", one 6 dp gold bar per cost line on a white-14% track, and the white agent footer with a 36 dp
 * teal avatar, "Prepared by <name>" and "brokerage · town". Identical in both themes.
 */
@Composable
fun TrueCostCardView(card: TrueCostCard, modifier: Modifier = Modifier) {
    val t = WatchdogTheme.type
    val total = card.monthlyTotal.coerceAtLeast(1)
    val lines = buildList {
        add(Triple(card.mortgageLabel, card.monthlyMortgage, card.monthlyMortgage / total.toFloat()))
        add(Triple("Property tax", card.monthlyTax, card.monthlyTax / total.toFloat()))
        if (card.monthlyInsurance > 0) add(Triple("Home insurance", card.monthlyInsurance, card.monthlyInsurance / total.toFloat()))
        if (card.monthlyHoa > 0) add(Triple("HOA", card.monthlyHoa, card.monthlyHoa / total.toFloat()))
    }
    Column(modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(WatchdogDimens.cardRadius)).background(FixedInk.navy)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                WatchdogLogo(size = 20.dp, cornerRadius = 5.dp, contentDescription = null)
                Text(
                    text = "TRUE COST CARD",
                    modifier = Modifier.semantics { contentDescription = "True cost card" },
                    color = FixedInk.onNavyMuted,
                    style = t.body.sized(12, FontWeight.Bold, 16.8, em(12, 0.06)),
                )
            }
            Text(text = card.address, modifier = Modifier.padding(top = 6.dp), color = FixedInk.onNavy, style = t.body.sized(16, FontWeight.ExtraBold, 22.4))
            Row(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Column(modifier = Modifier.width(IntrinsicSize.Min)) {
                    TabularText(
                        text = formatMoney(card.monthlyTotal),
                        style = t.body.sized(34, FontWeight.ExtraBold, 34.0, em(34, -0.04)),
                        color = FixedInk.onNavy,
                    )
                    Spacer(Modifier.height(4.dp))
                    Box(Modifier.fillMaxWidth().height(2.dp).background(FixedInk.gold))
                }
                Text(
                    text = "a month at ${formatMoney(card.inputs.price)}",
                    modifier = Modifier.padding(bottom = 5.dp),
                    color = FixedInk.onNavyMuted2,
                    style = t.body.sized(13, FontWeight.Normal),
                )
            }
            Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                lines.forEach { (label, value, fraction) -> TrueCostLine(label = label, value = value, fraction = fraction) }
            }
        }
        val agent = card.agent
        if (agent != null) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.size(36.dp).clip(CircleShape).background(FixedInk.teal),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = agent.initials, color = Color.White, style = t.body.sized(13, FontWeight.ExtraBold, 13.0))
                }
                Column {
                    Text(text = "Prepared by ${agent.name}", color = FixedInk.ink, style = t.body.sized(13, FontWeight.ExtraBold))
                    Text(
                        text = listOfNotNull(agent.brokerage.takeIf { it.isNotBlank() }, agent.town).joinToString(" · "),
                        color = FixedInk.muted,
                        style = t.body.sized(12, FontWeight.SemiBold),
                    )
                }
            }
        }
    }
}

/** One cost line of the true cost card (`.tc-l`): label and tabular value, then the 6 dp gold bar. */
@Composable
private fun TrueCostLine(label: String, value: Int, fraction: Float) {
    val t = WatchdogTheme.type
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(text = label, modifier = Modifier.weight(1f), color = FixedInk.onNavy, style = t.body.sized(13, FontWeight.Normal, 18.2))
            TabularText(text = formatMoney(value), style = t.body.sized(13, FontWeight.Bold, 18.2), color = FixedInk.onNavy)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(FixedInk.navyDivider),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(FixedInk.gold, RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp)),
            )
        }
    }
}

/**
 * Share sheet header (`.shh`): 48 dp fixed-navy tile with the 26 dp logo, 15 sp 800 title, 12 sp muted
 * subtitle, and a 44 dp round fill button (copy link by default), with a 1 dp separator below.
 */
@Composable
fun ShareSheetHeader(
    title: String,
    subtitle: String,
    onTrailing: () -> Unit,
    modifier: Modifier = Modifier,
    trailingIcon: ImageVector = WdIcons.ContentCopy,
    trailingDescription: String = "Copy link",
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier.fillMaxWidth().bottomSeparator(c.separator).padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(FixedInk.navy),
            contentAlignment = Alignment.Center,
        ) {
            WatchdogLogo(size = 26.dp, cornerRadius = 6.dp, contentDescription = null)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = c.ink, style = t.body.sized(15, FontWeight.ExtraBold, 18.75), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(text = subtitle, color = c.muted, style = t.body.sized(12, FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(c.fill)
                .clickable(role = Role.Button, onClick = onTrailing),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = trailingIcon, contentDescription = trailingDescription, modifier = Modifier.size(22.dp), tint = c.ink2)
        }
    }
}

/**
 * Share targets (`.targets`): four equal columns with 56 dp circles and 28 dp icons: Messages (fixed
 * teal), Mail (fixed link blue), Copy link and QR code (fill2 with ink icons), 12 sp 600 labels below.
 */
@Composable
fun ShareTargets(
    onMessages: () -> Unit,
    onMail: () -> Unit,
    onCopy: () -> Unit,
    onQr: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ShareTarget(label = "Messages", icon = WdIcons.ChatBubbleFill, container = FixedInk.teal, tint = Color.White, onClick = onMessages, modifier = Modifier.weight(1f))
        ShareTarget(label = "Mail", icon = WdIcons.MailFill, container = FixedInk.link, tint = Color.White, onClick = onMail, modifier = Modifier.weight(1f))
        ShareTarget(label = "Copy link", icon = WdIcons.Link, container = c.fill2, tint = c.ink, onClick = onCopy, modifier = Modifier.weight(1f))
        ShareTarget(label = "QR code", icon = WdIcons.QrCode2, container = c.fill2, tint = c.ink, onClick = onQr, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun ShareTarget(
    label: String,
    icon: ImageVector,
    container: Color,
    tint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(container)
                .clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = label, modifier = Modifier.size(28.dp), tint = tint)
        }
        Text(
            text = label,
            color = WatchdogTheme.colors.ink2,
            style = WatchdogTheme.type.body.sized(12, FontWeight.SemiBold, 16.8),
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

/**
 * Option row (`.optrow`): fill container, 18 dp radius, min height 52, 14 sp 700 title with a 12 sp muted
 * subtitle and a trailing switch. The whole row toggles and announces its state.
 */
@Composable
fun OptionRow(
    title: String,
    subtitle: String?,
    checked: Boolean,
    onChecked: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(c.fill)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChecked)
            .heightIn(min = 52.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = c.ink, style = t.body.sized(14, FontWeight.Bold))
            if (subtitle != null) {
                Text(text = subtitle, color = c.muted, style = t.body.sized(12, FontWeight.Medium))
            }
        }
        WdSwitch(checked = checked, onCheckedChange = null)
    }
}
