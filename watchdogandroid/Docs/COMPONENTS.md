# Watchdog shared UI components

Package `com.watchdogindex.agent.ui.components` (module `shared`, directory
`shared/src/main/kotlin/com/watchdogindex/agent/ui/components/`). Every value comes from
`Docs/mockup-css-to-compose.md` §3; the CSS selector is named in each KDoc. Components take plain values
or core models (`com.watchdogindex.agent.core.model.*`), never repositories. Colors are
`WatchdogTheme.colors.*`, text is `WatchdogTheme.type.*` (one-off mockup styles are derived from a token
with `sized(...)`), icons are `WdIcons.*`. Margins are the caller's: use `Modifier.cardMargin()` /
`Modifier.listMargin()`.

Conventions

- Every icon-only control takes a `contentDescription`. Buttons and icon buttons are 48 dp; chips are 32 dp
  inside a 48 dp reserved target (`Modifier.minTouchTarget()`); controls the mockup draws smaller than 48 dp
  (task pills, listen pill, mic, section and teaser links, the client next-action line, the share sheet's
  round button, the sheet handle) sit on a 48 dp click and accessibility node that overflows their drawn
  bounds (`Modifier.overflowTouchTarget()`, or `requiredHeight`/`requiredSize` where the size is fixed), so
  rows keep their mockup height.
- Numbers come from core's `com.watchdogindex.agent.core.format.Format` (`money`, `moneyCompact(lowercase = true)`
  for the value line's "$373k", `number`, `percent`, `ratePer100`, `sqFt`, `acres`); the components define no
  formatters of their own, so a card and a screen can never round the same figure differently.
- Bordered containers keep the CSS border inside the box the way `border-box` does: `WdCard` (plain or
  filled), `RowList` / `RowListSegment` and `InfoPanel` inset their content 1 dp on every side whether or
  not a line is drawn, and `IntelligenceCard` insets by its 2 dp spectrum border. A card is therefore 2 dp
  taller than padding plus content, card content is 342 dp wide on the 412 dp frame (what the charts scale
  to), and list rows start 1 dp in from the container edge (text at x 31, separators from x 67).
- Bottom chrome (`WatchdogNavigationBar`, `BottomActionArea`, `IntelligenceComposer`, `SheetSurface`,
  `WdModalSheet`) pads itself with `bottomChromeInsets()`: `LocalBottomChromeInsets` when provided, otherwise
  `WindowInsets.navigationBars`. The desktop preview should provide
  `LocalBottomChromeInsets provides WindowInsets(bottom = 24.dp)` at its root to reproduce the mockups'
  24 dp gesture allowance (nav bar 104 dp, action area 146 dp, composer 98 dp, sheets padded 30 dp).
- The top inset is `statusBarAllowance()` (alias `statusBarTopPadding()`): the real status bar on device,
  the mockups' 40 dp wherever `LocalBottomChromeInsets` is provided (preview, screenshot harness). Screens
  should call it rather than carry a private copy.
- One-line numbers the mockup sets on a `line-height: 1` box (the 46 sp weekly count, the 38 sp dial
  number and its 12 sp caption, the 34 sp true cost total) are pinned to that box with the internal
  `LineBox(lineHeight) { … }`, because the desktop harness keeps the font's natural height for a line height
  at or under the font size while Android and the browser shrink it.
- Text on Intelligence surfaces is drawn with the fixed light ink (`Spectrum.*`) via `IntelligenceInk`;
  never restyle it per theme.

## Foundation.kt

| Signature | Draws / does |
|---|---|
| `fun Modifier.cardMargin(): Modifier` | `padding(start 16, end 16, top 16)`, the `.card` margin. |
| `fun Modifier.listMargin(): Modifier` | `padding(start 16, end 16, top 10)`, the `.rows` margin. |
| `fun Modifier.minTouchTarget(): Modifier` | `minimumInteractiveComponentSize()`: reserves 48 dp in the layout without changing the drawn size; for where there is room (chips). |
| `fun Modifier.overflowTouchTarget(minSize: Dp = 48.dp): Modifier` | Makes the node measured after it (put `.clickable` after it) at least 48 dp, centred on the content's natural bounds and overflowing them, while the layout keeps the natural size; for 44 dp pills, the mic, text links, the sheet handle. Content centres itself inside (a `Box`/`Row` with centre alignment). |
| `fun Modifier.topSeparator(color: Color, inset: Dp = 0.dp): Modifier` | 1 dp line along the top edge from `inset` (CSS `border-top`). |
| `fun Modifier.bottomSeparator(color: Color, inset: Dp = 0.dp): Modifier` | 1 dp line along the bottom edge. |
| `fun Modifier.startSeparator(color: Color): Modifier` | 1 dp line along the start edge. |
| `val LocalBottomChromeInsets: ProvidableCompositionLocal<WindowInsets?>` | Override for bottom chrome insets (null = platform navigation bars). |
| `@Composable fun bottomChromeInsets(): WindowInsets` | The insets bottom chrome applies. |
| `@Composable fun statusBarAllowance(): Dp` | The top inset a screen's first element starts under: `WatchdogDimens.statusBarAllowance` (40 dp) when `LocalBottomChromeInsets` is provided, otherwise `WindowInsets.statusBars` top padding (0 when the bar is hidden). |
| `@Composable fun statusBarTopPadding(): Dp` | The same value under the name the pushed screens (Welcome, Search, Settings) used. |
| `@Composable internal fun LineBox(lineHeight: TextUnit, modifier: Modifier = Modifier, content: @Composable () -> Unit)` | Pins one line of text to a box exactly `lineHeight` tall with the glyphs centred, overflowing above and below like CSS negative half-leading; used for every `line-height: 1` number. |
| `@Composable fun TabularText(text: String, modifier: Modifier = Modifier, style: TextStyle = LocalTextStyle.current, color: Color = Color.Unspecified, textAlign: TextAlign? = null, maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Clip)` | `Text` with `tnum` figures for money, counts and scores. |
| `object FixedInk { navy, onNavy, onNavyMuted, onNavyMuted2, onNavyFaint, navyDivider, gold, sand, teal, link, ink, muted, intelligenceShadow }` | The colors the mockups never swap with the theme (§1.12), every one a design token (`Spectrum.*` or the light palette's gold/sand/teal/shadow); no hex in this package. The Welcome hero's fixed colors are `WelcomeHero.*` in `design/WatchdogColors.kt`. |
| `data class TintColors(container, content, label, border)` / `@Composable fun Tint.colors(): TintColors` | Card palette per `Tint`. |
| `@Composable fun TileTint.colors(): Pair<Color, Color>` | Tile container and icon color. |
| `@Composable fun Tone.colors(): Pair<Color, Color>` | Chip container and text color. |
| `fun iconByName(name: String?, fallback: ImageVector): ImageVector` | Resolves a Material Symbols name from a core model. |

## Cards.kt

| Signature | Draws |
|---|---|
| `val LocalCardTint: ProvidableCompositionLocal<Tint>` / `val LocalCardLabelColor: ProvidableCompositionLocal<Color>` | Set by `WdCard`; label ink per tint. |
| `@Composable fun WdCard(tint: Tint = Tint.Plain, modifier: Modifier = Modifier, contentPadding: PaddingValues = PaddingValues(horizontal = 18.dp, vertical = 16.dp), onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit)` | `.card`: 24 dp radius, 16x18 padding after a 1 dp border inset on every side (drawn as the line border when plain, transparent when filled Navy/Sky/Sand/Mint); sets content color (onNavy on navy). |
| `@Composable fun CardLabel(text: String, modifier: Modifier = Modifier, color: Color = LocalCardLabelColor.current)` | `.ch`: 12 sp 700 upper case, tracked, tinted per card (muted outside a card). |
| `@Composable fun SectionHeader(title: String, modifier: Modifier = Modifier, linkLabel: String? = null, onLink: (() -> Unit)? = null)` | `.sh`: 20 sp 800 title, 15 sp 700 link, padding 24 20 0, baseline aligned; a clickable link sits on a 48 dp overflow node. |
| `@Composable fun KeyValueRow(label: String, value: String, modifier: Modifier = Modifier, sublabel: String? = null, muted: Boolean = false, valueStyle: TextStyle = WatchdogTheme.type.kvValue)` | `.kv`: 14 sp / 19.6 label (+12 sp sublabel), 15 sp 700 tabular value on the token's 21 dp line (`.kv b` inherits 1.4), baseline aligned, 5 dp vertical padding, so the row pitch is 31 dp. |
| `@Composable fun SourcesNote(text: String, modifier: Modifier = Modifier)` | `.src`: 12 sp muted, padding 18 22. |
| `@Composable fun VerdictBox(kind: VerdictKind, title: String, body: String, modifier: Modifier = Modifier)` | `.vd`: 14 dp radius, 10x12 padding, good/warn/neutral tones. |
| `@Composable fun VerdictBox(verdict: ValueVerdict, modifier: Modifier = Modifier)` | Same, from the value check verdict. |
| `@Composable fun VerdictBox(priceCheck: PriceCheck, modifier: Modifier = Modifier)` | Same, from the scan price check (InLine = good, low/high = warn). |
| `@Composable fun ReadBox(icon: ImageVector, text: AnnotatedString, modifier: Modifier = Modifier)` / `(icon, text: String, modifier)` | `.readbox`: fill container, 16 dp radius, teal icon, 13 sp ink2. |
| `@Composable fun InfoPanel(title: String, subtitle: String?, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit)` | `.wpanel`: surface + 1 dp line border with the content inset 1 dp inside it, fixed-navy header (26 dp logo, 15 sp title, 12 sp subtitle), body padding 12 14 14. |
| `@Composable fun CheckupSeasonCard(season: CheckupSeason, onCta: () -> Unit, modifier: Modifier = Modifier)` | Sand card: receipt icon + "CHECKUP SEASON", 19 sp 800 title, 14 sp body, small primary button. |

## Rows.kt

| Signature | Draws |
|---|---|
| `@Composable fun RowList(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit)` | `.rows`: surface, 24 dp radius, 1 dp line border with the rows inset 1 dp inside it, clipped. |
| `@Composable fun <T> RowList(items: List<T>, modifier: Modifier = Modifier, dividerInset: Dp = 66.dp, row: @Composable (T) -> Unit)` | Same, with a 1 dp separator inside the top of every row after the first (66 dp tile rows, 54 dp task/follow-up rows). |
| `@Composable fun RowSeparator(inset: Dp = 66.dp, modifier: Modifier = Modifier)` | Standalone 1 dp separator. |
| `@Composable fun RowListSegment(first: Boolean, last: Boolean, modifier: Modifier = Modifier, dividerInset: Dp = 66.dp, content: @Composable () -> Unit)` | One slice of a `.rows` container for a `LazyColumn`: surface, the side lines (rounded top on `first`, rounded bottom on `last`), the inset separator above every slice after the first, content inset 1 dp like `RowList`'s; a column of slices is indistinguishable from one list. |
| `@Composable fun IconTile(tint: TileTint, icon: ImageVector, modifier: Modifier = Modifier, size: Dp = 40.dp, radius: Dp = 12.dp, iconSize: Dp = 22.dp)` | `.tile`. |
| `@Composable fun RowChevron(modifier: Modifier = Modifier)` | `chevron_right` 22 dp muted. |
| `@Composable fun WdRow(title: String, modifier: Modifier = Modifier, supporting: String? = null, tile: TileTint? = null, icon: ImageVector? = null, onClick: (() -> Unit)? = null, minHeight: Dp = 66.dp, detail: AnnotatedString? = null, maxLines: Int = Int.MAX_VALUE, contentDescription: String? = null, trailing: @Composable (() -> Unit)? = { RowChevron() })` | `.row`: 40 / 1fr / auto, padding 11x14, 12 dp gaps, 15 sp 700 title, 13 sp 500 muted supporting line 2 dp below. Two-line variant: `detail` is a second 13 sp muted line directly under `supporting` (spans keep their own colour and weight, e.g. "Score 72" in its verdict ink beside the block/lot; the number stays the signal); `maxLines` caps and ellipsises every line (Search's result rows use 1 so long addresses share one row height); `contentDescription` is the row's single spoken description (a clickable row already merges its children; a plain row merges them here). |
| `@Composable fun PropertyChangeRow(change: PropertyChange, onClick: () -> Unit, modifier: Modifier = Modifier)` | A "Top changes" row from a `PropertyChange` (tile tint + icon name). |
| `@Composable fun TaskRow(task: AgentTask, onToggle: (Boolean) -> Unit, onAction: () -> Unit, modifier: Modifier = Modifier)` | `.row.tk`: 24 dp ring tick (48 dp touch box), title/subtitle, trailing pill. |
| `@Composable fun TaskPill(action: TaskAction, onClick: () -> Unit, modifier: Modifier = Modifier)` | `.tka`: 44 dp tonal pill with label or 20 dp call icon, on a 48 dp overflow click node. |
| `@Composable fun ClientRowView(row: ClientRow, onClick: () -> Unit, onNextAction: () -> Unit, modifier: Modifier = Modifier)` | `.row.cl`: home tile, address + chip, meta line, next-action line (link 700 on a 48 dp overflow node, or muted 600 with no icon and no action). |

## Chips.kt

| Signature | Draws |
|---|---|
| `@Composable fun StatusChipView(chip: StatusChip, modifier: Modifier = Modifier)` | `.chip`: 26 dp, 13 dp radius, 0x10 padding, 12 sp 700, 16 dp icon, warn/good/sky/neutral. |
| `@Composable fun WdFilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, elevated: Boolean = false, icon: ImageVector? = null, role: Role = Role.RadioButton)` | `.mchip`: 32 dp, 8 dp radius, outline; selected = indicator fill + check; elevated = surface + shadow; 48 dp reserved target. Radio semantics by default (single choice); pass `Role.Checkbox` for multi-select. |
| `@Composable fun FilterChipsRow(options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, elevatedUnselected: Boolean = false, contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp))` | `.mchips`: scrolling selectable group, 8 dp gaps; 48 dp tall, so add 6 dp top padding for the mockup's 14. |
| `data class SegmentOption(val label: String, val icon: ImageVector? = null)` | One segment. |
| `@Composable fun WdSegmentedButtons(options: List<SegmentOption>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier)` | `.mseg`: 48 dp, 24 dp radius, outline + dividers, selected indicator + check. |

## Buttons.kt

| Signature | Draws |
|---|---|
| `@Composable fun WdPrimaryButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, small: Boolean = false, enabled: Boolean = true)` | `.btn.primary`: 48 dp, 24 dp radius, 16 sp 700 (15 sp small), 20 dp icon. |
| `@Composable fun WdTonalButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, small: Boolean = false, enabled: Boolean = true)` | `.btn.tint`. |
| `@Composable fun WdOutlinedButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, small: Boolean = false, enabled: Boolean = true)` | `.btn.outl`: 1 dp `mOutline` border, ink text. |
| (all three, via the private `WdButtonBase` / `NoWrapLine`) | The label is one line that never wraps or clips (CSS `white-space: nowrap`): icon + label sit at their natural size with 20 dp side padding (16 small) when the button is wide enough; when it is not, they stay centred and the padding takes the squeeze down to a minimum; only then is the line scaled down uniformly, never below the 12 sp floor. Touch target, button size and semantics are unchanged, and intrinsic sizes still work. |
| `@Composable fun WdIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = WatchdogTheme.colors.ink, enabled: Boolean = true)` | `.mib`: 48 dp round target, 24 dp icon. |
| `@Composable fun WdRoundTonalIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true)` | `.btn.tint.rnd`: 48 dp tonal circle, 20 dp icon. |
| `@Composable fun WdSwitch(checked: Boolean, onCheckedChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true)` | `.sw-m`: Material 3 switch, primary track + onPrimary thumb with 18 dp check when on, outline thumb when off. Pass `null` when the row toggles. |

## Fields.kt

| Signature | Draws |
|---|---|
| `@Composable fun WdOutlinedField(label: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, trailingIcon: ImageVector? = WdIcons.Cancel, trailingDescription: String = "Clear", onClear: (() -> Unit)? = null, placeholder: String? = null, enabled: Boolean = true)` | `.mfield`: 2 dp ink border, 8 dp radius, floating 12 sp label, 15 sp single-line value, trailing 22 dp icon in a 48 dp target; the field is announced as `label`. A long value is ellipsised while the field is not focused (`.mfield .val`: nowrap + ellipsis) and scrolls once it is. |
| `@Composable fun WdOutlinedTextArea(label: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String? = null, enabled: Boolean = true, minLines: Int = 4, minHeight: Dp = 132.dp)` | The multi-line `.mfield` (paste box): same border, radius and floating label, a wrapping 15 sp 500 value from `minLines` lines up, min 132 dp, padding 18 / 20 / 12; announced as `label`. |
| `@Composable fun SupportingText(text: String, modifier: Modifier = Modifier)` | `.msup`: 12 sp muted, padding 6 32 0. |

## Charts.kt

| Signature | Draws |
|---|---|
| `@Composable fun ScoreDial(score: Int, verdict: String, modifier: Modifier = Modifier, dialSize: Dp = 118.dp)` | The dial: dialTrack track, gold arc from 135° sweeping 270·score/100 with a stroke of 9 SVG units (8.85 dp at 118 dp), 38 sp number + "of 100" on their `line-height: 1` boxes; reads `TaxMath.scoreAccessibilityLabel` ("Watchdog Score 72 out of 100, favorable tax position"). |
| `@Composable fun ScoreCardView(score: ScoreCard, modifier: Modifier = Modifier)` | Navy card: dial, "WATCHDOG SCORE", verdict, explanation, `ScoreCard.FOOTER` under a white-14% line. |
| `@Composable fun SparkBars(points: List<RatePoint>, modifier: Modifier = Modifier, contentDescription: String? = null, highlightLast: Boolean = true)` | `.spark`: 300x84-unit canvas, 22-unit bars, spark/spark2, rate label above the last bar, years below. |
| `@Composable fun TaxCardView(tax: TaxCard, modifier: Modifier = Modifier)` | Sky card: "PROPERTY TAX", 30 sp bill, source line, next-year bill, town median (muted), "Town rate per $100" / trend, `SparkBars`. |
| `@Composable fun ValueLine(v: ValueCheck, modifier: Modifier = Modifier)` | `.vline`: track, holds-up segment, floor and implied markers, navy median dot with sand ring, four labels. |
| `@Composable fun ValueCheckCardView(v: ValueCheck, modifier: Modifier = Modifier)` | Sand card: "VALUE CHECK", assessed / matches (ratio sublabel) / holds up above, `ValueLine`, `VerdictBox`. |
| `@Composable fun SalesCardView(s: SalesNearby, modifier: Modifier = Modifier)` | Mint card: "SALES NEARBY", count / median, sale rows with 1 dp lines, "This home last sold" (muted). |
| `@Composable fun FactsCardView(f: HomeFacts, modifier: Modifier = Modifier)` | Plain card: "HOME", 2-column grid of 12 sp labels over 15 sp 700 values. |
| `@Composable fun RobustCardView(dims: List<RobustDimension>, modifier: Modifier = Modifier)` | Plain card: "ROBUST FRAMEWORK", 28 dp navy letter tiles, a name column 104 dp wide or the widest name when one needs more (measured, so "Overassessment" is never ellipsised and every bar starts at one x), 8 dp teal bars, right-aligned scores. |
| `@Composable fun SummaryCard(digest: WeekDigest, modifier: Modifier = Modifier, sentence: String = "changes in your clients’ homes and your farm")` | Navy card: period label, 46 sp count (on its 46 dp `LineBox`) with gold underline + sentence, 4-column grid of `statSmall` (19 sp / 26.6) numbers over 12 sp labels with white-14% dividers. |

## Chrome.kt

| Signature | Draws |
|---|---|
| `@Composable fun Avatar(initials: String, modifier: Modifier = Modifier, size: Dp = 44.dp)` | `.avatar`: navy circle, 2 dp inset gold ring, white 800 initials (14 sp under 44 dp). `AvatarSizeSmall/Default/Large` = 40/44/52 dp. |
| `@Composable fun WatchdogSearchBar(hint: String, onClick: () -> Unit, modifier: Modifier = Modifier, leadingIcon: ImageVector = WdIcons.Search, emphasized: Boolean = false, elevated: Boolean = false, trailing: @Composable (() -> Unit)? = null)` | `.msearch`: 56 dp, 28 dp radius, container-high; `emphasized` = ink 700 text; `elevated` = surface + shadow (Farm overlay). |
| `data class TopBarAction(val icon: ImageVector, val contentDescription: String, val onClick: () -> Unit)` | A trailing 48 dp icon button. |
| `@Composable fun WatchdogTopBar(title: String, modifier: Modifier = Modifier, onBack: (() -> Unit)? = null, actions: List<TopBarAction> = emptyList(), backIcon: ImageVector = WdIcons.ArrowBack, backDescription: String = "Back")` | `.mbar`: 64 dp, transparent, 22 sp 700 title at x 60 / 8. |
| `@Composable fun WatchdogTopBar(title: AnnotatedString, ...same...)` | Same with a styled title, e.g. `Intelligence.productName()`. |
| `@Composable fun SearchTopBar(query: String, onQueryChange: (String) -> Unit, onClose: () -> Unit, placeholder: String, modifier: Modifier = Modifier, fieldDescription: String = placeholder, closeDescription: String = "Close search", clearDescription: String = "Clear search", onSearch: (() -> Unit)? = null)` | The top bar with an inline search field in place of the title: back button that closes the search, 16 sp field (focused on appearance, announced as `fieldDescription`, Search IME action when `onSearch` is set), clear button while there is text. Same 64 dp frame as `WatchdogTopBar`. |
| `@Composable fun WatchdogNavigationBar(selected: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier, windowInsets: WindowInsets = bottomChromeInsets())` | `.nav-m`: hand-built four-column bar (not Material's `NavigationBar`, whose stack sits 2 dp lower): container color, 64x32 indicator 12 dp from the top, 4 dp gap, 12 sp labels, filled icon when selected; each column is a full-height `Role.Tab` target in a selectable group; 80 dp + bottom inset. |
| `@Composable fun WatchdogFab(icon: ImageVector, label: String?, onClick: () -> Unit, modifier: Modifier = Modifier, contentDescription: String? = label, elevated: Boolean = true)` | `.fab`: extended FAB 56 dp / 16 dp radius / 15 sp 700; `label = null` gives the 56 dp square FAB; `elevated = false` removes the shadow. |
| `data class ActionSpec(val label: String, val onClick: () -> Unit, val icon: ImageVector? = null)` | An action for the area below. |
| `@Composable fun BottomActionArea(primary: ActionSpec, secondaryLeft: ActionSpec, secondaryRight: ActionSpec, modifier: Modifier = Modifier, windowInsets: WindowInsets = bottomChromeInsets())` | `.actbar.m`: container color, 1 dp line on top, full-width primary, two small tonal buttons. |

## Sheets.kt

| Signature | Draws |
|---|---|
| `@Composable fun BottomSheetHandle(modifier: Modifier = Modifier, onDismiss: (() -> Unit)? = null, dismissLabel: String = "Close")` | `.handle`: 32x4 outline pill in a 32 dp strip (14 dp above and below) with a full-width 48 dp drag/tap area overflowing it; with `onDismiss`, tap or drag down closes the sheet. |
| `@Composable fun SheetSurface(modifier: Modifier = Modifier, windowInsets: WindowInsets = bottomChromeInsets(), content: @Composable ColumnScope.() -> Unit)` | `.sheet.and` drawn in place (no scrim, no gesture): surface, 28 dp top radius, shadow, padding 0 16 (6 + inset). |
| `@Composable fun WdModalSheet(onDismiss: () -> Unit, modifier: Modifier = Modifier, windowInsets: WindowInsets = bottomChromeInsets(), content: @Composable ColumnScope.() -> Unit)` | `.sheet.and` as a Material `ModalBottomSheet`: surface + ink, 28 dp top radius, the scrim token, `BottomSheetHandle(onDismiss)` as the drag handle, content padded 16 at the sides and 6 + inset below (the mockups' 30); opens fully expanded (no partial stop) and, under `LocalReducedMotion`, appears in place instead of sliding. Material's own bottom inset is off so the inset is applied once; the status bar still pads a sheet tall enough to reach it. `onDismiss` fires for scrim, handle, back and swipe; the caller drops the sheet from composition. |
| `@Composable fun Scrim(modifier: Modifier = Modifier, onDismiss: (() -> Unit)? = null)` | `.dim`: full-screen scrim, tap to dismiss without a ripple. |

## Intelligence.kt

| Signature | Draws |
|---|---|
| `@Composable fun IntelligenceCard(modifier: Modifier = Modifier, contentPadding: PaddingValues = PaddingValues(horizontal = 18.dp, vertical = 16.dp), content: @Composable ColumnScope.() -> Unit)` | `.intel`: `Modifier.intelligenceSurface()` (rotating spectrum border, white in both themes), content inset by the 2 dp border before the padding, `IntelligenceInk`, soft fixed shadow. |
| `@Composable fun MicButton(onClick: (() -> Unit)?, modifier: Modifier = Modifier, size: Dp = 44.dp, contentDescription: String = "Ask Watchdog Intelligence Voice")` | `.mic` / `.mic.lg`: fixed-navy circle, filled mic 24 dp, on a 48 dp overflow click node when interactive; decorative when `onClick` is null. |
| `@Composable fun ListenPill(label: String, onClick: () -> Unit, modifier: Modifier = Modifier)` | `.play`: 44 dp tonal pill, filled play 22 dp, 14 sp 700, on a 48 dp overflow click node. |
| `@Composable fun IntelligenceTeaserCard(text: String, onAsk: () -> Unit, onReadBrief: () -> Unit, modifier: Modifier = Modifier, askLabel: String = "Ask by voice", briefLabel: String = "Read the brief")` | Today's teaser: product name (spectrum word), 16 sp 600 text, mic + "Ask by voice", "Read the brief >". |
| `@Composable fun BriefCard(brief: Brief, onListen: () -> Unit, onVoice: () -> Unit, modifier: Modifier = Modifier, voiceCaption: String = "Ask a follow-up out loud, hands-free.")` | The Monday brief: kicker/time + listen pill, 21 sp heading, numbered items with 24 dp navy circles and 12 sp / 16.8 sources, then the Voice row: 6 dp, the separator, and 26 dp below it the 56 dp mic and "Watchdog Intelligence Voice" top-aligned (the approved render's geometry, measured on the 2x references: the sheet's "padding-top 14" plus the grid's 12 dp gap), the card closing 16 dp under the mic. |
| `@Composable fun FollowUpRow(icon: ImageVector, text: String, onClick: () -> Unit, modifier: Modifier = Modifier)` | `.row.q`: 22 dp link icon, 15 sp 600 text, chevron, min 56 dp (separator inset 54). |
| `@Composable fun FollowUpRow(followUp: FollowUp, onClick: () -> Unit, modifier: Modifier = Modifier)` | Same from a `FollowUp` (icon by name). |
| `@Composable fun IntelligenceComposer(hint: String, onMic: () -> Unit, modifier: Modifier = Modifier, value: String = "", onValueChange: ((String) -> Unit)? = null, onSend: (() -> Unit)? = null, onFieldClick: (() -> Unit)? = null, windowInsets: WindowInsets = bottomChromeInsets(), listening: Boolean = false, micDescription: String = "Watchdog Intelligence Voice")` | `.composer.m`: container bar, 56 dp field (28 dp radius, container-high), 56 dp square mic FAB without shadow. Editable when `onValueChange` is set: the field is announced as `hint`, its IME action is Send when `onSend` is set, and the FAB is Send while there is text. Without `onValueChange` the field is a button running `onFieldClick`. `listening` (Watchdog Intelligence Voice): the FAB shows the equaliser glyph inside a 2 dp teal ring (shape, not colour alone), reads "`micDescription`, listening. Tap to stop" and runs `onMic` to stop; otherwise the mic reads `micDescription`. |

## Marketing.kt

| Signature | Draws |
|---|---|
| `@Composable fun PostcardThumb(top: String, bottom: String, modifier: Modifier = Modifier)` | `.pc`: 66 dp, 12 dp radius, fixed-navy top row with 16 dp logo, fixed-sand bottom row. |
| `@Composable fun EmailThumb(modifier: Modifier = Modifier)` | `.em`: 66 dp sky tile with 30 dp `mark_email_read`. |
| `@Composable fun CampaignCard(c: Campaign, onClick: () -> Unit, modifier: Modifier = Modifier)` | `.card.camp`: 12 dp padding, 106 dp thumb column, 15 sp 800 title, 13 sp subtitle, status chip. |
| `@Composable fun TrueCostCardView(card: TrueCostCard, modifier: Modifier = Modifier)` | `.tc`: fixed navy, 20 dp logo + "TRUE COST CARD", address, 34 sp total on its 34 dp `LineBox` with gold underline + "a month at $…", 6 dp gold bars, white agent footer (36 dp teal avatar, "Prepared by <name>", brokerage · town); 223 dp of navy plus the 56 dp footer with three cost lines. |
| `@Composable fun ShareSheetHeader(title: String, subtitle: String, onTrailing: () -> Unit, modifier: Modifier = Modifier, trailingIcon: ImageVector = WdIcons.ContentCopy, trailingDescription: String = "Copy link")` | `.shh`: 48 dp navy logo tile, title/subtitle, 44 dp round fill button on a 48 dp overflow click node, 1 dp line below. |
| `@Composable fun ShareTargets(onMessages: () -> Unit, onMail: () -> Unit, onCopy: () -> Unit, onQr: () -> Unit, modifier: Modifier = Modifier)` | `.targets`: four 56 dp circles (teal, link, fill2, fill2) with 28 dp icons and 12 sp labels; each column is one button labelled by its text. |
| `@Composable fun OptionRow(title: String, subtitle: String?, checked: Boolean, onChecked: (Boolean) -> Unit, modifier: Modifier = Modifier)` | `.optrow`: fill container, 18 dp radius, min 52 dp, title/subtitle, trailing switch; the row toggles. |

## Settings.kt

| Signature | Draws |
|---|---|
| `sealed interface SettingsTrailing { data class Switch(checked: Boolean, onCheckedChange: (Boolean) -> Unit); data class Value(text: String); data object Chevron }` | What a settings row shows at its end. |
| `@Composable fun SettingsRow(icon: ImageVector?, title: String, modifier: Modifier = Modifier, subtitle: String? = null, trailing: SettingsTrailing? = null, onClick: (() -> Unit)? = null)` | `.mli`: 24 dp ink2 icon, 16 sp 700 title, 14 sp subtitle, min 72 dp, padding 10 20; a Switch trailing makes the row the toggle. |
| `@Composable fun SettingsProfileRow(initials: String, name: String, subtitle: String, onClick: () -> Unit, modifier: Modifier = Modifier)` | The profile row: 40 dp avatar, name, plan line, chevron, min 84 dp. |
| `@Composable fun SettingsSectionLabel(text: String, modifier: Modifier = Modifier)` | `.msec`: 14 sp 800 link color, padding 22 20 4. |
| `@Composable fun SettingsDivider(modifier: Modifier = Modifier)` | `.mdiv`: 1 dp separator, margin 4 20 0. |

## Design tokens the components lean on (`design/`)

- `WatchdogTypography`: `kvValue` is 15 / **21** (`.kv b` inherits the frame's 1.4), `statSmall` is 19 / **26.6**
  (`.sum-grid b`), `briefSource` is 12 / **16.8** (`.ib-src`). The components use these tokens as they are;
  none carries a line-height override any more, so a screen that wants the same line uses the token too
  (Scan's `t.statSmall.sized(19, ExtraBold, 26.6, tabular = true)` is just `t.statSmall`).
- `WatchdogColors.kt`: `WelcomeHero { gradientStart (= Spectrum.navy), gradientEnd (#11306a), gold (#e3c46a) }`,
  the Welcome hero's fixed colors (spec §1.12 / §3.31), next to `Spectrum`. `WelcomeScreen` should read
  `WelcomeHero.gradientEnd` and `WelcomeHero.gold` instead of its literal and the dark map dot.
- `WatchdogDimens.statusBarAllowance = 40.dp`, the mockups' status bar, behind `statusBarAllowance()`.

## Promoting the screens' private copies (for the sweep)

| Private copy | Shared replacement |
|---|---|
| `statusBarAllowance()` in Today, Clients, Farm, Marketing, Property, Scan, Alerts, Intelligence; `statusBarTopPadding()` in Welcome, Search, Settings | Delete the private function and import the same name from `ui.components` (both names exist; they are the same rule). |
| `ClientsSheet(onDismiss) { … }`, `FarmModalSheet(onDismiss) { … }`, the hand-built `ModalBottomSheet` in Intelligence's history sheet and Marketing's share sheet | `WdModalSheet(onDismiss = …) { … }` (same content padding; the sheet no longer double-pads the gesture bar on device). |
| Clients `RowListSegment(first, last) { … }` | Shared `RowListSegment(first, last) { … }` (content now sits 1 dp inside the border like `RowList`, which is where the mockup's `border-box` rows start). |
| Clients `SearchTopBar(query, onQueryChange, onClose)` | `SearchTopBar(query, onQueryChange, onClose, placeholder = "Street, town or CRM reference", fieldDescription = "Search clients")`. |
| Clients `CsvField(value, onValueChange, modifier, enabled)` | `WdOutlinedTextArea(label = "Pasted CSV", value, onValueChange, modifier, placeholder = "27 Hamilton St, Harrison, past client, 2019, CRM-104", enabled = enabled)`. |
| Search `ResultRow(property, onClick)` | `WdRow(title = property.address, supporting = "${property.town} · ${property.county}", detail = <block/lot + " · " + "Score n" span in the verdict ink, bold, tnum>, tile = TileTint.Sky, icon = WdIcons.Home, onClick = onClick, maxLines = 1, contentDescription = <address, place, block/lot, "Watchdog Score n out of 100, verdict">)`. |
| Intelligence `VoiceComposer(hint, value, onValueChange, onSend, onMic, listening)` | `IntelligenceComposer(hint = hint, onMic = onMic, value = value, onValueChange = onValueChange, onSend = onSend, listening = listening)`. |
| Welcome `HeroGradientEnd = Color(0xFF11306A)`, `EyebrowGold = WatchdogDarkColors.mapDot` | `WelcomeHero.gradientEnd`, `WelcomeHero.gold` (and `WelcomeHero.gradientStart` for the start). |

## Typical screen assembly

```kotlin
// Today
WatchdogSearchBar("Search any NJ address", onClick = { navigator.open(Route.Search()) },
    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp), trailing = { Avatar(account.initials, size = 40.dp) })
SummaryCard(digest, Modifier.cardMargin())
SectionHeader("Needs you", linkLabel = "${digest.needsYouCount} this week", onLink = { })
RowList(digest.tasks, Modifier.listMargin(), dividerInset = 54.dp) { TaskRow(it, onToggle = { done -> }, onAction = { }) }
SectionHeader("Top changes", linkLabel = "See all ${digest.total}", onLink = { })
RowList(digest.changes, Modifier.listMargin()) { PropertyChangeRow(it, onClick = { navigator.open(Route.Property(it.pin!!)) }) }
digest.teaser?.let { IntelligenceTeaserCard(it.text, onAsk = { }, onReadBrief = { navigator.open(Route.Intelligence) }, Modifier.cardMargin()) }

// Property detail bottom
BottomActionArea(
    primary = ActionSpec("Share true cost card", onShare, WdIcons.Share),
    secondaryLeft = ActionSpec("Send tax checkup", onCheckup, WdIcons.Send),
    secondaryRight = ActionSpec("Save to client", onSave, WdIcons.BookmarkAdd),
)

// A picker sheet (state.sheet is set by the ViewModel, cleared by onDismiss)
if (state.sheet != null) {
    WdModalSheet(onDismiss = vm::closeSheet) {
        Text("Sort by", Modifier.padding(horizontal = 4.dp), style = WatchdogTheme.type.sectionTitle)
        RowList(options) { WdRow(title = it.label, icon = it.icon, onClick = { vm.pick(it) }, trailing = null) }
    }
}
```
