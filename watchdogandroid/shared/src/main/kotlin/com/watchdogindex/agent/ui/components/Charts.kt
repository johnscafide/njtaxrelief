package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.math.TaxMath
import com.watchdogindex.agent.core.model.HomeFacts
import com.watchdogindex.agent.core.model.RatePoint
import com.watchdogindex.agent.core.model.RobustDimension
import com.watchdogindex.agent.core.model.SalesNearby
import com.watchdogindex.agent.core.model.ScoreCard
import com.watchdogindex.agent.core.model.TaxCard
import com.watchdogindex.agent.core.model.Tint
import com.watchdogindex.agent.core.model.ValueCheck
import com.watchdogindex.agent.core.model.WeekDigest
import com.watchdogindex.agent.design.WatchdogTheme
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * The data cards of Today and Property detail. Charts are drawn on Canvas in the mockup SVG's unit space
 * (300 units wide) scaled to the card's content width, so proportions match the reference renders at any
 * width. Every chart carries a spoken description; the numbers themselves are in the card text.
 */


/**
 * The Watchdog Score dial: 118 dp, round-capped stroke of 9 SVG units (8.85 dp at 118 dp, scaled with the
 * dial like the arc), track in dialTrack, gold value arc starting at 135 degrees and sweeping
 * 270 * score/100, with the number (38 sp) and "of 100" (12 sp) inside.
 * Reads as "Watchdog Score 72 out of 100, favorable tax position" (core's [TaxMath.scoreAccessibilityLabel]).
 */
@Composable
fun ScoreDial(
    score: Int,
    verdict: String,
    modifier: Modifier = Modifier,
    dialSize: Dp = 118.dp,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val clamped = score.coerceIn(0, 100)
    val description = TaxMath.scoreAccessibilityLabel(clamped, verdict)
    val track = c.dialTrack
    val gold = c.gold
    Box(
        modifier = modifier.size(dialSize).clearAndSetSemantics {
            contentDescription = description
            role = Role.Image
        },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            // The SVG circle has radius 52 in a 120 box, so the arc diameter is 104/120 of the dial.
            val diameter = this.size.minDimension * (104f / 120f)
            val topLeft = Offset((this.size.width - diameter) / 2f, (this.size.height - diameter) / 2f)
            val arc = Size(diameter, diameter)
            // The SVG stroke is 9 units of the same 120-unit box, so it scales with the arc: 8.85 dp at 118 dp.
            val stroke = Stroke(width = 9f * this.size.minDimension / 120f, cap = StrokeCap.Round)
            drawArc(color = track, startAngle = 135f, sweepAngle = 270f, useCenter = false, topLeft = topLeft, size = arc, style = stroke)
            if (clamped > 0) {
                drawArc(
                    color = gold,
                    startAngle = 135f,
                    sweepAngle = 270f * clamped / 100f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arc,
                    style = stroke,
                )
            }
        }
        // `.d-num`: 38 sp on a `line-height: 1` box, then `small` 4 below, also on a 12 sp line-height-1 box.
        Column(modifier = Modifier.padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            LineBox(t.dialNumber.lineHeight) { TabularText(text = clamped.toString(), style = t.dialNumber, color = c.onNavy) }
            LineBox(t.dialCaption.fontSize, modifier = Modifier.padding(top = 4.dp)) { Text(text = "of 100", color = c.onNavy2, style = t.dialCaption) }
        }
    }
}

/**
 * Score card (`.card.navy.score`): dial on the left, "WATCHDOG SCORE" label, 19 sp verdict and 13 sp
 * explanation on the right, and the fixed footer "The Watchdog Score, powered by the ROBUST Framework."
 * below a 1 dp white-14% divider: the grid's 4 dp row gap and the footer's 10 dp margin above the line,
 * the line itself and 10 dp of padding below it (CSS borders take space; [topSeparator] does not).
 */
@Composable
fun ScoreCardView(score: ScoreCard, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Navy, modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ScoreDial(score = score.score, verdict = score.verdict)
            Column(modifier = Modifier.weight(1f)) {
                CardLabel("Watchdog Score")
                Text(text = score.verdict, modifier = Modifier.padding(top = 4.dp), color = c.onNavy, style = t.verdict)
                Text(
                    text = score.explanation,
                    modifier = Modifier.padding(top = 6.dp),
                    color = c.onNavy2,
                    style = t.body.sized(13, FontWeight.Normal, 18.85),
                )
            }
        }
        Text(
            text = ScoreCard.FOOTER,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp)
                .topSeparator(FixedInk.navyDivider)
                .padding(top = 11.dp),
            color = c.onNavy2,
            style = t.caption.sized(12, FontWeight.SemiBold, 16.8),
        )
    }
}

/**
 * Rate bars (`.spark`): 22-unit bars with 16-unit gaps from x 24 on a 300 x 84 unit canvas, 4-unit top
 * radii, prior years in spark2 and the last year in spark, the last rate labelled above its bar and the
 * first and last years below. Heights are round(rate / max * 40).
 */
@Composable
fun SparkBars(
    points: List<RatePoint>,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    highlightLast: Boolean = true,
) {
    val c = WatchdogTheme.colors
    val measurer = rememberTextMeasurer()
    val labelBase = WatchdogTheme.type.caption
    val described = if (contentDescription != null) {
        modifier.semantics {
            this.contentDescription = contentDescription
            role = Role.Image
        }
    } else {
        modifier
    }
    Canvas(described.fillMaxWidth().aspectRatio(300f / 84f)) {
        if (points.isEmpty()) return@Canvas
        val s = this.size.width / 300f
        val n = points.size
        val barWidth = 22f
        // 38 units between bar starts for the seven-year history; closer together if there are more points.
        val step = if (n <= 1) 0f else min(38f, (300f - 24f - barWidth - 24f) / (n - 1))
        val maxRate = points.maxOf { it.ratePer100 }.takeIf { it > 0.0 } ?: 1.0
        // 12 SVG units, scaled with the chart (about 13.8 at the 344 dp card width), kept in sp.
        val fontSize = (12f * s).toDp().value.sp
        val plain = labelBase.copy(fontSize = fontSize, fontWeight = FontWeight.SemiBold, color = c.muted, lineHeight = TextUnit.Unspecified)
        val strong = plain.copy(fontWeight = FontWeight.ExtraBold, color = c.ink)

        points.forEachIndexed { i, point ->
            val h = (point.ratePer100 / maxRate * 40.0).roundToInt().toFloat().coerceAtLeast(1f)
            val x = 24f + i * step
            val color = if (highlightLast && i == n - 1) c.spark else c.spark2
            drawRoundRect(
                color = color,
                topLeft = Offset(x * s, (64f - h) * s),
                size = Size(barWidth * s, h * s),
                cornerRadius = CornerRadius(4f * s, 4f * s),
            )
            // Bottom corners are square: a plain rect covers the lowest 5 units.
            val flat = min(5f, h)
            drawRect(color = color, topLeft = Offset(x * s, (64f - flat) * s), size = Size(barWidth * s, flat * s))
        }

        val firstCenter = (24f + barWidth / 2f) * s
        val lastCenter = (24f + (n - 1) * step + barWidth / 2f) * s
        val value = measurer.measure(Format.ratePer100(points.last().ratePer100), strong)
        drawText(value, topLeft = Offset(lastCenter - value.size.width / 2f, 18f * s - value.firstBaseline))
        val firstYear = measurer.measure(points.first().year.toString(), plain)
        drawText(firstYear, topLeft = Offset(firstCenter - firstYear.size.width / 2f, 80f * s - firstYear.firstBaseline))
        if (n > 1) {
            val lastYear = measurer.measure(points.last().year.toString(), plain)
            drawText(lastYear, topLeft = Offset(lastCenter - lastYear.size.width / 2f, 80f * s - lastYear.firstBaseline))
        }
    }
}

/**
 * Property tax card (`.card.sky`): "PROPERTY TAX", the bill as the 30 sp lead, its source line, next
 * year's bill at the new rate, the town median (muted), then the rate history header and [SparkBars].
 */
@Composable
fun TaxCardView(tax: TaxCard, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Sky, modifier = modifier) {
        CardLabel("Property tax")
        TabularText(text = Format.money(tax.bill), modifier = Modifier.padding(top = 6.dp), style = t.lead, color = c.ink)
        Text(
            text = tax.billSourceLabel,
            modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
            color = c.muted,
            style = t.supporting.sized(13, FontWeight.Medium, 18.2),
        )
        tax.nextYearBill?.let { KeyValueRow(label = "${tax.nextYear} at the new rate", value = Format.money(it)) }
        tax.townMedian?.let { KeyValueRow(label = "${tax.townName} median", value = Format.money(it), muted = true) }
        if (tax.rateHistory.isNotEmpty()) {
            val first = tax.rateHistory.first()
            val last = tax.rateHistory.last()
            val verb = if (last.ratePer100 >= first.ratePer100) "rose" else "fell"
            val headerStyle = t.caption.sized(12, FontWeight.Bold, 16.8)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp)
                    .topSeparator(c.separator)
                    .padding(top = 11.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(text = "Town rate per \$100", modifier = Modifier.weight(1f), color = c.skyInk, style = headerStyle)
                    tax.rateTrendLabel?.let { Text(text = it, color = c.skyInk, style = headerStyle, maxLines = 1) }
                }
                SparkBars(
                    points = tax.rateHistory,
                    modifier = Modifier.padding(top = 6.dp),
                    contentDescription = "${tax.townName} general tax rate $verb from ${Format.ratePer100(first.ratePer100)} in ${first.year} " +
                        "to ${Format.ratePer100(last.ratePer100)} in ${last.year}",
                )
            }
        }
    }
}

/**
 * Value line (`.vline`) on a 300 x 64 unit canvas: fill2 track, holds-up segment from the floor in
 * goodInk at 32%, a 2.5-unit floor marker, a 2-unit implied-value marker, and the navy sales-median dot
 * ringed in sand. Labels: range start (top left), "Sales $455k" above the dot, "Holds up above $373k"
 * under the floor, range end (bottom right).
 */
@Composable
fun ValueLine(v: ValueCheck, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val measurer = rememberTextMeasurer()
    val labelBase = WatchdogTheme.type.caption
    val median: Int? = v.salesMedian
    val description = buildString {
        append("The assessment holds up above ${Format.money(v.holdsUpAbove)}.")
        if (median != null) append(" Similar homes nearby sold for a median of ${Format.money(median)}.")
    }
    Canvas(
        modifier
            .fillMaxWidth()
            .aspectRatio(300f / 64f)
            .semantics {
                contentDescription = description
                role = Role.Image
            },
    ) {
        val s = this.size.width / 300f
        val range = (v.rangeMax - v.rangeMin).toFloat().takeIf { it > 0f } ?: 1f
        fun xOf(value: Int): Float = (8f + (value - v.rangeMin) / range * 284f).coerceIn(8f, 292f)
        val floorX = xOf(v.holdsUpAbove)
        val impliedX = xOf(v.impliedValue)
        val medianX = if (median != null) xOf(median) else null

        drawRoundRect(color = c.fill2, topLeft = Offset(8f * s, 26f * s), size = Size(284f * s, 10f * s), cornerRadius = CornerRadius(5f * s, 5f * s))
        drawRoundRect(
            color = c.goodInk.copy(alpha = .32f),
            topLeft = Offset(floorX * s, 26f * s),
            size = Size((292f - floorX) * s, 10f * s),
            cornerRadius = CornerRadius(5f * s, 5f * s),
        )
        drawRoundRect(color = c.goodInk, topLeft = Offset((floorX - 1f) * s, 20f * s), size = Size(2.5f * s, 22f * s), cornerRadius = CornerRadius(1f * s, 1f * s))
        drawRoundRect(color = c.ink2, topLeft = Offset((impliedX - 1f) * s, 24f * s), size = Size(2f * s, 14f * s), cornerRadius = CornerRadius(1f * s, 1f * s))
        if (medianX != null) {
            val center = Offset(medianX * s, 31f * s)
            drawCircle(color = c.navy, radius = 7f * s, center = center)
            drawCircle(color = c.sand, radius = 7f * s, center = center, style = Stroke(width = 2.5f * s))
        }

        val fontSize = (12f * s).toDp().value.sp
        val plain = labelBase.copy(fontSize = fontSize, fontWeight = FontWeight.SemiBold, color = c.muted, lineHeight = TextUnit.Unspecified)
        val strong = plain.copy(fontWeight = FontWeight.ExtraBold, color = c.ink)
        val width = this.size.width
        fun centered(x: Float, textWidth: Int): Float = (x - textWidth / 2f).coerceIn(0f, (width - textWidth).coerceAtLeast(0f))

        val start = measurer.measure(Format.moneyCompact(v.rangeMin, lowercase = true), plain)
        drawText(start, topLeft = Offset(8f * s, 13f * s - start.firstBaseline))
        val end = measurer.measure(Format.moneyCompact(v.rangeMax, lowercase = true), plain)
        drawText(end, topLeft = Offset(292f * s - end.size.width, 58f * s - end.firstBaseline))
        if (medianX != null && median != null) {
            val sales = measurer.measure("Sales ${Format.moneyCompact(median, lowercase = true)}", strong)
            drawText(sales, topLeft = Offset(centered(medianX * s, sales.size.width), 13f * s - sales.firstBaseline))
        }
        val floor = measurer.measure("Holds up above ${Format.moneyCompact(v.holdsUpAbove, lowercase = true)}", plain)
        drawText(floor, topLeft = Offset(centered(floorX * s, floor.size.width), 58f * s - floor.firstBaseline))
    }
}

/**
 * Value check card (`.card.sand`): "VALUE CHECK", assessed value, the market value the town ratio implies
 * (with the ratio as a sublabel), the holds-up floor, the [ValueLine] and the verdict box.
 */
@Composable
fun ValueCheckCardView(v: ValueCheck, modifier: Modifier = Modifier) {
    WdCard(tint = Tint.Sand, modifier = modifier) {
        CardLabel("Value check")
        KeyValueRow(label = "Assessed", value = Format.money(v.assessed))
        KeyValueRow(
            label = "Matches a home worth",
            value = Format.money(v.impliedValue),
            sublabel = "town ratio ${Format.percent(v.ratioPercent)}",
        )
        KeyValueRow(label = "Assessment holds up above", value = Format.money(v.holdsUpAbove))
        ValueLine(v = v, modifier = Modifier.padding(top = 10.dp, bottom = 2.dp))
        VerdictBox(verdict = v.verdict, modifier = Modifier.padding(top = 10.dp))
    }
}

/**
 * Sales nearby card (`.card.mint`): "SALES NEARBY", the count and median as a key-value line, one row per
 * sale (address, month in muted 13 sp, tabular price) separated by 1 dp lines, and the muted
 * "This home last sold" footer. [SalesNearby.sinceLabel] is the whole phrase ("since Jan 2026", blank when
 * no first sale date is known) and is appended as is, so the line reads "7 similar sales since Jan 2026".
 */
@Composable
fun SalesCardView(s: SalesNearby, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    WdCard(tint = Tint.Mint, modifier = modifier) {
        CardLabel("Sales nearby")
        KeyValueRow(
            label = listOf(Format.count(s.count, "similar sale"), s.sinceLabel).filter { it.isNotBlank() }.joinToString(" "),
            value = s.median?.let { "median ${Format.money(it)}" } ?: "no median yet",
        )
        s.sales.forEach { sale ->
            Row(
                // `.sale`: padding 7 0 under a 1 dp border-top that takes its own row of space.
                modifier = Modifier.fillMaxWidth().topSeparator(c.separator).padding(top = 8.dp, bottom = 7.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = sale.address,
                    modifier = Modifier.weight(1f).alignByBaseline(),
                    color = c.ink,
                    style = t.body.sized(14, FontWeight.Normal),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = sale.monthLabel,
                    modifier = Modifier.alignByBaseline(),
                    color = c.muted,
                    style = t.body.sized(13, FontWeight.Normal),
                    maxLines = 1,
                )
                TabularText(
                    text = Format.money(sale.price),
                    modifier = Modifier.alignByBaseline(),
                    style = t.body.sized(14, FontWeight.Bold),
                    color = c.ink,
                    maxLines = 1,
                )
            }
        }
        val lastSold: Int? = s.lastSoldPrice
        if (lastSold != null) {
            KeyValueRow(
                label = "This home last sold",
                value = listOfNotNull(Format.money(lastSold), s.lastSoldYear?.toString()).joinToString(" · "),
                muted = true,
            )
        }
    }
}

/** Home facts card (`.card` + `.facts`): "HOME" and a two-column grid of 12 sp labels over 15 sp 700 values. */
@Composable
fun FactsCardView(f: HomeFacts, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val cells: List<Pair<String, String>> = listOf(
        "Class" to f.propertyClass,
        "Built" to (f.built?.toString() ?: "Not on file"),
        "Style" to (f.style ?: "Not on file"),
        "Living area" to (f.livingAreaSqFt?.let { Format.sqFt(it) } ?: "Not on file"),
        "Lot" to (f.lotAcres?.let { Format.acres(it) } ?: "Not on file"),
        "Block and lot" to "${f.block} · ${f.lot}",
    )
    WdCard(tint = Tint.Plain, modifier = modifier) {
        CardLabel("Home")
        Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            cells.chunked(2).forEach { pair ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    pair.forEach { (label, value) ->
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = label, color = c.muted, style = t.caption.sized(12, FontWeight.SemiBold, 16.8))
                            Text(text = value, modifier = Modifier.padding(top = 1.dp), color = c.ink, style = t.body.sized(15, FontWeight.Bold, 21.0))
                        }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * ROBUST Framework card (`.rb`): one row per dimension with a 28 dp navy letter tile (8 dp radius),
 * a name column at 13 sp 600 (the mockup's 104 dp, or the longest name when one needs more: CSS lets
 * "Overassessment" spill a hair past 104 where Compose would ellipsise it), an 8 dp teal bar on a fill2
 * track taking the remaining width, and the right-aligned score. Every bar starts at the same x.
 */
@Composable
fun RobustCardView(dims: List<RobustDimension>, modifier: Modifier = Modifier) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val rowStyle = t.body.sized(13, FontWeight.SemiBold, 18.2)
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val nameWidth = remember(dims, rowStyle, density, measurer) {
        val widest = dims.maxOfOrNull { measurer.measure(it.name, rowStyle, softWrap = false, maxLines = 1).size.width } ?: 0
        with(density) { (widest + 1).toDp() }.coerceAtLeast(104.dp)
    }
    WdCard(tint = Tint.Plain, modifier = modifier) {
        CardLabel("ROBUST Framework")
        Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            dims.forEach { d ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(c.navy),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = d.letter.toString(), color = c.onNavy, style = t.body.sized(13, FontWeight.ExtraBold, 13.0))
                    }
                    Text(
                        text = d.name,
                        modifier = Modifier.width(nameWidth),
                        color = c.ink,
                        style = rowStyle,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(c.fill2),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(d.score.coerceIn(0, 100) / 100f)
                                .fillMaxHeight()
                                .background(c.teal, RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)),
                        )
                    }
                    TabularText(
                        text = d.score.toString(),
                        modifier = Modifier.width(28.dp),
                        style = rowStyle,
                        color = c.ink,
                        textAlign = TextAlign.End,
                    )
                }
            }
        }
    }
}

/**
 * The weekly summary (`.card.navy.sum`): "THIS WEEK · SINCE SEP 21", the 46 sp count with a 2 dp gold
 * underline beside the sentence, then a four-column grid (tax bills, permits, sales, town) with 1 dp
 * white-14% dividers.
 */
@Composable
fun SummaryCard(
    digest: WeekDigest,
    modifier: Modifier = Modifier,
    sentence: String = "changes in your clients’ homes and your farm",
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val cells = listOf(
        digest.taxBills to "Tax bills",
        digest.permits to "Permits",
        digest.sales to "Sales",
        digest.town to "Town",
    )
    WdCard(tint = Tint.Navy, modifier = modifier) {
        CardLabel(digest.periodLabel)
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            // The underline spans the glyph box, so the column shrinks to the number's own width; `.big` is
            // 46 sp on a `line-height: 1` box.
            Column(modifier = Modifier.width(IntrinsicSize.Min)) {
                LineBox(t.big.lineHeight) { TabularText(text = Format.number(digest.total), style = t.big, color = c.onNavy) }
                Spacer(Modifier.height(5.dp))
                Box(Modifier.fillMaxWidth().height(2.dp).background(c.gold))
            }
            Text(
                text = sentence,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp),
                color = c.onNavy,
                style = t.body.sized(16, FontWeight.SemiBold, 21.6),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .topSeparator(FixedInk.navyDivider)
                .padding(top = 11.dp),
        ) {
            cells.forEachIndexed { index, (count, label) ->
                val divided = if (index > 0) Modifier.startSeparator(FixedInk.navyDivider).padding(start = 12.dp) else Modifier
                Column(modifier = Modifier.weight(1f).then(divided)) {
                    // `.sum-grid b`: 19 sp on the inherited 1.4 line (26.6), which is the statSmall token.
                    TabularText(text = Format.number(count), style = t.statSmall, color = c.onNavy)
                    Text(text = label, modifier = Modifier.padding(top = 1.dp), color = c.onNavy2, style = t.caption.sized(12, FontWeight.SemiBold, 16.8))
                }
            }
        }
    }
}
