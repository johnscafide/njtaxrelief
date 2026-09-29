# Watchdog Agent App — Android mockup CSS to Jetpack Compose (Material 3) specification

Source of truth: the approved mockup HTML (`artifact-1afaad30-…-4ed4.html`), Android frames only
(`.scr.and`, 412 × 892 dp). Reference renders: `ref/android-<screen>-{light,dark}[-full].png` at 2× (824 px = 412 dp).
The sticky review-board page bar is hidden in those renders; it is not part of any screen.

Conventions used in this document

- CSS `px` inside the frames equals Android `dp` (dimensions) and `sp` (type) one to one. No scaling.
- `em` letter-spacing is converted to sp for the size at which it is used (`.07em` at 12sp = 0.84sp).
- Line heights are given as the CSS multiplier and the resulting sp. Anything that does not set its own
  `line-height` inherits the frame default of **1.4** (`.scr{font-size:15px;line-height:1.4}`).
- Font is **Plus Jakarta Sans** (`--f-ui`) everywhere in the app frames. Only the Android status bar and the
  notification-shade mock use **Roboto** (`--f-and`). Set `includeFontPadding = false` / `LineHeightStyle.Trim.None`
  so CSS line boxes and Compose line boxes agree.
- Icons are **Material Symbols Rounded**, `wght 400, GRAD 0, opsz 24, FILL 0` unless marked *filled* (`.ms.f` → `FILL 1`).
  Default glyph size is 22dp (`.ms{font-size:22px}`); components below state their own size where they override it.
- Token names in `WdColor.*` are suggestions for a Kotlin color scheme object; keep the CSS var in a comment.
- Card content width is a recurring number: 412 − 2·16 (margins) − 2·18 (padding) = **344dp**.
  List containers (`.rows`) are 380dp wide (378 inside the 1dp border); row content width is 350dp.

---

## 1. Color tokens

All values are read from the `.scr{…}` (light) and `.scr.dark{…}` (dark) blocks, plus `:root` for the spectrum and
Intelligence tokens (those do **not** change with theme).

### 1.1 Surfaces

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-bg` | `#f3f1ec` | `#0b1426` | `WdColor.background` |
| `--a-surface` | `#ffffff` | `#131f37` | `WdColor.surface` |
| `--a-line` | `#e3dfd6` | `#22304d` | `WdColor.line` (1dp card/list border) |
| `--a-sep` | `rgba(20,33,61,.10)` | `rgba(255,255,255,.09)` | `WdColor.separator` |

### 1.2 Ink

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-ink` | `#14213d` | `#eef2fa` | `WdColor.ink` |
| `--a-ink-2` | `#34425e` | `#c9d2e3` | `WdColor.ink2` |
| `--a-muted` | `#5d6678` | `#9ea9bf` | `WdColor.muted` |
| `--a-red` | `#c4322b` | `#ff6b61` | `WdColor.red` (badge; not used on Android frames) |

### 1.3 Navy

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-navy` | `#0e2248` | `#1b2e57` | `WdColor.navy` |
| `--a-on-navy` | `#ffffff` | `#ffffff` | `WdColor.onNavy` |
| `--a-on-navy-2` | `rgba(255,255,255,.78)` | `rgba(255,255,255,.76)` | `WdColor.onNavyMuted` |

### 1.4 Gold, teal, link

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-gold` | `#b8972a` | `#d4b24a` | `WdColor.gold` |
| `--a-teal` | `#0f8b8d` | `#3cc3c4` | `WdColor.teal` |
| `--a-link` | `#1456a0` | `#8fbaf6` | `WdColor.link` |

### 1.5 Tints (sky, sand, mint, good, warn)

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-sky` | `#e3edfb` | `#162a4a` | `WdColor.sky` |
| `--a-sky-ink` | `#1456a0` | `#a9c8f5` | `WdColor.onSky` |
| `--a-sand` | `#f6efd9` | `#2a2515` | `WdColor.sand` |
| `--a-sand-ink` | `#7a5d0c` | `#e6c872` | `WdColor.onSand` |
| `--a-mint` | `#dff1ec` | `#10302b` | `WdColor.mint` |
| `--a-mint-ink` | `#0f6e5c` | `#80d7c3` | `WdColor.onMint` |
| `--a-good-bg` | `#e1f3ea` | `#113024` | `WdColor.goodContainer` |
| `--a-good-ink` | `#1d6843` | `#8fdcb0` | `WdColor.onGood` |
| `--a-warn-bg` | `#fdf1dc` | `#33270f` | `WdColor.warnContainer` |
| `--a-warn-ink` | `#83560a` | `#f0c36b` | `WdColor.onWarn` |

### 1.6 Fill, primary, tint

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--a-fill` | `rgba(20,33,61,.06)` | `rgba(255,255,255,.07)` | `WdColor.fill` |
| `--a-fill-2` | `rgba(20,33,61,.12)` | `rgba(255,255,255,.14)` | `WdColor.fill2` |
| `--a-primary` | `#0e2248` | `#e3eaf7` | `WdColor.primary` (filled button, switch-on track) |
| `--a-on-primary` | `#ffffff` | `#0e2248` | `WdColor.onPrimary` |
| `--a-tint` | `#e4e8f0` | `rgba(255,255,255,.10)` | `WdColor.tint` (tonal button / pill) |
| `--a-on-tint` | `#0e2248` | `#eef2fa` | `WdColor.onTint` |

### 1.7 Glass, shadow, dial track, spark, switch

| CSS var | Light | Dark | Kotlin | Note |
|---|---|---|---|---|
| `--a-glass` | `rgba(255,255,255,.76)` | `rgba(36,49,78,.70)` | `WdColor.glass` | iOS only; unused on Android frames |
| `--a-glass-edge` | `rgba(255,255,255,.95)` | `rgba(255,255,255,.12)` | `WdColor.glassEdge` | iOS only |
| `--a-shadow` | `rgba(14,34,72,.16)` | `rgba(0,0,0,.45)` | `WdColor.shadow` | FAB, sheet, chip.el, msearch overlay, .pc |
| `--a-dial-track` | `rgba(255,255,255,.17)` | `rgba(255,255,255,.16)` | `WdColor.dialTrack` | |
| `--a-spark` | `#1456a0` | `#8fbaf6` | `WdColor.spark` | current-year bar |
| `--a-spark-2` | `#a9c3ea` | `#34507e` | `WdColor.spark2` | prior-year bars |
| `--a-switch` | `#0f8b8d` | `#2fb3b4` | `WdColor.switchOn` | iOS switch only (Android uses primary) |
| `--a-switch-off` | `rgba(20,33,61,.16)` | `rgba(255,255,255,.20)` | `WdColor.switchOff` | iOS switch only |

### 1.8 Material containers (Android only)

| CSS var | Light | Dark | Kotlin | Used by |
|---|---|---|---|---|
| `--m-container` | `#ece8e0` | `#111c32` | `WdColor.m3Container` | nav bar, bottom action area, composer bar |
| `--m-high` | `#e4e0d7` | `#18253f` | `WdColor.m3ContainerHigh` | search bar, composer field, switch-off track |
| `--m-ind` | `#d8e3f4` | `#263d68` | `WdColor.m3Indicator` | nav indicator, selected chip/segment |
| `--m-on-ind` | `#0e2248` | `#dce7fb` | `WdColor.m3OnIndicator` | |
| `--m-outline` | `#bfb8aa` | `#3c4a69` | `WdColor.m3Outline` | chips, segmented, outlined button, sheet handle, switch |
| `--m-fab` | `#0e2248` | `#e3eaf7` | `WdColor.m3Fab` | |
| `--m-on-fab` | `#ffffff` | `#0e2248` | `WdColor.m3OnFab` | |

### 1.9 Map

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--map-land` | `#eeebe4` | `#0f192c` | `WdColor.mapLand` |
| `--map-road` | `#ffffff` | `#1f2c47` | `WdColor.mapRoad` |
| `--map-case` | `#dcd6ca` | `#1a2640` | `WdColor.mapCasing` |
| `--map-park` | `#d5e7cd` | `#12281f` | `WdColor.mapPark` |
| `--map-water` | `#c7dbef` | `#10233f` | `WdColor.mapWater` |
| `--map-out` | `#dbd6cb` | `#18233b` | `WdColor.mapOutside` (parcels outside the farm) |
| `--map-bound` | `#0e2248` | `#b9cdf0` | `WdColor.mapBoundary` |
| `--map-label` | `#5d6678` | `#8d99b0` | `WdColor.mapLabel` |
| `--map-1` (0–39) | `#5fb3ae` | `#1d5f63` | `WdColor.mapScore1` |
| `--map-2` (40–54) | `#2f9a97` | `#1f7d80` | `WdColor.mapScore2` |
| `--map-3` (55–69) | `#0f7f82` | `#2a9d9d` | `WdColor.mapScore3` |
| `--map-4` (70–84) | `#0b5f68` | `#4fc0bd` | `WdColor.mapScore4` |
| `--map-5` (85+) | `#083f4c` | `#8fe0d8` | `WdColor.mapScore5` |
| `--map-dot` | `#b8972a` | `#e3c46a` | `WdColor.mapSoldDot` |

Note the scale reverses direction in dark: light goes light→dark teal for low→high; dark goes dark→bright teal.

### 1.10 Scrim

| CSS var | Light | Dark | Kotlin |
|---|---|---|---|
| `--scrim` | `rgba(14,34,72,.30)` | `rgba(0,0,0,.50)` | `WdColor.scrim` |

### 1.11 Theme-independent tokens (from `:root`)

| CSS var | Value | Kotlin | Used by |
|---|---|---|---|
| `--spec-1` | `#0aaeb8` | `WdColor.spectrum1` | `.iw` word gradient stop 0% |
| `--spec-2` | `#2478ff` | `WdColor.spectrum2` | `.iw` 34%; conic 90° |
| `--spec-3` | `#7857ff` | `WdColor.spectrum3` | `.iw` 67%; conic 170° |
| `--spec-4` | `#e84bc4` | `WdColor.spectrum4` | `.iw` 100%; conic 260° |
| `--spec-b` | `#15b7c9` | `WdColor.spectrumBorder` | conic 0° and 360° |
| `--intel-surface` | `#ffffff` | `WdColor.intelSurface` | `.intel` background, both themes |
| `--intel-ink` | `#14213d` | `WdColor.intelInk` | `.intel` text color |
| `--intel-muted` | `#5d6678` | `WdColor.intelMuted` | (design-system band only) |

### 1.12 Hard-coded colors that never swap with theme

`#0e2248` (mic button, brief list numerals, `.wp-h`, `.pc-t`, `.shh .th`, `.tc`, `.qs .on`), `#ffffff` on those,
`#b8972a` (true-cost gold rules), `#f6efd9`/`#0e2248` (`.pc-b`), `#0f8b8d` (`.tg1`, `.tc-ag .a`), `#1456a0` (`.tg2`,
shade action text), `#14213d`/`#5d6678` (`.tc-ag` text), `#e3c46a` (`.wel-for`), `rgba(255,255,255,.14)` (navy card
dividers, `.tc-l` track), `rgba(255,255,255,.72/.74/.76/.8)` (secondary text on fixed navy), `#050505` (punch hole),
welcome hero gradient `#0e2248 → #11306a`, logo gradient `#0d3185 → #064bcf (55%) → #1780ff`, and every notification-shade
color in §3.40.

---

## 2. Typography

Family: Plus Jakarta Sans (weights 400/500/600/700/800 are loaded). All values sp. `lh` = line height.
"inherits" = 1.4 × size. Letter spacing (`ls`) 0 unless stated.

### 2.1 Headers and labels

| Selector | Size | lh | Weight | ls | Transform | Color | Notes |
|---|---|---|---|---|---|---|---|
| `.sb.and` | 14 | 1 | 500 | 0 | — | `ink` (`#fff` with `.light`) | **Roboto** |
| `.mtitle` | 22 | 1.2 → 26.4 | 700 | 0 | — | `ink` | single line, ellipsis |
| `.mhl` | 30 | 1.2 → 36 | 800 | −.02em → −0.6 | — | `ink` | page headline ("Today") |
| `.eb` | 13 | inherits → 18.2 | 700 | .06em → 0.78 | uppercase | `muted` | eyebrow date |
| `.lt-sub` | 15 | inherits → 21 | 500 | 0 | — | `muted` | "For Alex · Monday…" |
| `.ch` | 12 | 1.3 → 15.6 | 700 | .07em → 0.84 | uppercase | `muted`; navy card `onNavyMuted`; sky `onSky`; sand `onSand`; mint `onMint` | card label |
| `.sh h4` | 20 | 1.2 → 24 | 800 | −.015em → −0.3 | — | `ink` | section header |
| `.lnk` | 15 | inherits → 21 | 700 | 0 | — | `link` | text link / trailing action |
| `.msec` | 14 | inherits → 19.6 | 800 | 0 | — | `link` | settings section label |
| `.src` | 12 | 1.5 → 18 | 400 | 0 | — | `muted` | sources footnote |
| `.msup` | 12 | 1.45 → 17.4 | 400 | 0 | — | `muted` | field supporting text |

### 2.2 Lists and rows

| Selector | Size | lh | Weight | ls | Color | Notes |
|---|---|---|---|---|---|---|
| `.row b` | 15 | 1.3 → 19.5 | 700 | 0 | `ink` | row title |
| `.row small` | 13 | 1.35 → 17.55 | 500 | 0 | `muted` | margin-top 2 |
| `.row.q span` | 15 | inherits → 21 | 600 | 0 | `ink` | follow-up prompt |
| `.tka` | 14 | inherits | 700 | 0 | `onTint` | task pill text |
| `.nx` | 14 | inherits → 19.6 | 700 | 0 | `link`; `.nx.q` 600 `muted` | client next action |
| `.cl-top b` | = `.row b` | | | | | ellipsis, single line |
| `.mli b` | 16 | inherits → 22.4 | 700 | 0 | `ink` | settings row title |
| `.mli small` | 14 | 1.35 → 18.9 | 400 | 0 | `muted` | margin-top 2 |
| `.kv` | 14 | inherits → 19.6 | 400 | 0 | `ink` (`.kv.m` → `muted`) | key-value line |
| `.kv b` | 15 | inherits → 21 | 700 | 0 | `ink` (`.kv.m` → `muted`) | tabular numerals |
| `.kv small` | 12 | inherits → 16.8 | 400 | 0 | `muted` | block under key |
| `.sale` | 14 | inherits → 19.6 | 400 | 0 | `ink` | |
| `.sale span:nth-child(2)` | 13 | inherits | 400 | 0 | `muted` | date column |
| `.sale b` | 14 | inherits | 700 | 0 | `ink` | tabular |
| `.facts span` | 12 | inherits → 16.8 | 600 | 0 | `muted` | |
| `.facts b` | 15 | inherits → 21 | 700 | 0 | `ink` | |
| `.rb div` | 13 | inherits → 18.2 | 600 | 0 | `ink` | label column |
| `.rb i` | 13 | — | 800 | 0 | `#ffffff` | letter tile |
| `.rb b` | 13 | inherits | 600 (inherits) | 0 | `ink` | right aligned, tabular |
| `.turn div` | 13 | 1.4 → 18.2 | 400 | 0 | `ink2`; `b` → `ink` (700) | |
| `.fnote` | 12 | 1.4 → 16.8 | 400 | 0 | `muted` | |

### 2.3 Chips, buttons, controls

| Selector | Size | lh | Weight | ls | Color |
|---|---|---|---|---|---|
| `.chip` | 12 | inherits (height fixed 26) | 700 | 0 | per variant (§3.11) |
| `.btn` | 16 | inherits (min-height 48) | 700 | 0 | per variant |
| `.btn.sm` | 15 | | 700 | 0 | |
| `.mchip` | 14 | (height 32) | 700 | 0 | `ink2`; `.on` `m3OnIndicator` |
| `.mseg span` | 14 | (height 48) | 700 | 0 | `ink2`; `.on` `m3OnIndicator` |
| `.mtabs span` | 14 | (height 48) | 700 | 0 | `muted`; `.on` `ink` |
| `.fab` | 15 | (height 56) | 700 | 0 | `m3OnFab` |
| `.nv` | 12 | inherits | 600; `.on` 800 | 0 | `muted`; `.on` `ink` |
| `.play` | 14 | (min-height 44) | 700 | 0 | `onTint` (fixed `#0e2248` inside `.intel`) |
| `.avatar` | 15 (40dp variant 14) | — | 800 | .02em → 0.30 (0.28 at 14) | `#ffffff` |
| `.mfield label` | 12 | inherits | 700 | 0 | `ink` |
| `.mfield .val` | 15 | inherits | 500 | 0 | `ink` |
| `.msearch` | 16 | inherits | 500 | 0 | `muted` (farm override: `ink` 700) |
| `.composer.m .fld` | 16 | inherits | 500 | 0 | `muted` |
| `.optrow` | 14 | inherits → 19.6 | 700 | 0 | `ink` |
| `.optrow small` | 12 | inherits | 500 | 0 | `muted` |
| `.readbox` | 13 | inherits | 400 | 0 | `ink2`; `b` `ink` (defined, **unused** on any screen) |

### 2.4 Summary / numbers

| Selector | Size | lh | Weight | ls | Color |
|---|---|---|---|---|---|
| `.big` | 46 | 1 → 46 | 800 | −.04em → −1.84 | `onNavy`; 2dp `gold` underline, padding-bottom 5 |
| `.sum-l` | 16 | 1.35 → 21.6 | 600 | 0 | `onNavy` |
| `.sum-grid b` | 19 | inherits → 26.6 | 800 | 0 | `onNavy` |
| `.sum-grid span` | 12 | inherits → 16.8 | 600 | 0 | `onNavyMuted` |
| `.lead` | 30 | 1.05 → 31.5 | 800 | −.03em → −0.9 | `ink` |
| `.subl` | 13 | inherits → 18.2 | 500 | 0 | `muted` |
| `.d-num` | 38 | 1 → 38 | 800 | −.04em → −1.52 | `onNavy` |
| `.d-num small` | 12 | 1 (inherited from `.d-num`) | 700 | 0 | `onNavyMuted` |
| `.verdict-t` | 19 | 1.2 → 22.8 | 800 | −.01em → −0.19 | `onNavy` |
| `.score p` | 13 | 1.45 → 18.85 | 400 | 0 | `onNavyMuted` |
| `.score .sfoot` | 12 | inherits → 16.8 | 600 | 0 | `onNavyMuted` |
| `.spark-l` | 12 | inherits → 16.8 | 700 | 0 | `onSky` |
| `.spark text` / `.vline text` | 12 SVG units (≈13.8 at 344dp width) | — | 600; `.lab`/`.strong` 800 | 0 | `muted`; `.lab`/`.strong` `ink` |
| `.vd` | 13 | 1.45 → 18.85 | 400 | 0 | `onGood` / `onWarn` |
| `.vd b` | 14 | 1.45 | 700 | 0 | inherit |
| `.phead h3` | 30 | 1.1 → 33 | 800 | −.03em → −0.9 | `ink` |
| `.phead p` | 14 | 1.45 → 20.3 | 500 | 0 | `muted` |
| `.stile .n` | 30 | 1 → 30 | 800 | −.03em → −0.9 | `#fff` on navy; 2dp `gold` underline, padding-bottom 3 |
| `.stile .n small` | 12 | 1 | 700 | 0 | `onNavyMuted` |
| `.stile .v` | 12 | inherits → 16.8 | 700 | 0 | `onNavyMuted` |
| `.stile .t` | 22 | 1.1 → 24.2 | 800 | −.02em → −0.44 | `ink` |
| `.stile .kv` | 12 | inherits | 400 | 0 | `ink` |
| `.stile .kv b` | 13 | inherits | 700 | 0 | `ink` |
| `.price span` | 13 | inherits | 600 | 0 | `onSand` |
| `.price b` | 19 | inherits | 800 | 0 | `ink` |
| `.price small` | 12 | inherits | 500 | 0 | `muted` |
| `.lhead h4` | 21 | 1.15 → 24.15 | 800 | −.02em → −0.42 | `ink` (iOS only) |
| `.fstats b` | 22 | inherits → 30.8 | 800 | −.02em → −0.44 | `ink` |
| `.fstats span` | 12 | 1.3 → 15.6 | 600 | 0 | `muted` |
| `.fsheet h4` | 20 | inherits → 28 | 800 | −.015em → −0.3 | `ink` |
| `.fsheet .top p` | 13 | inherits → 18.2 | 500 | 0 | `muted` |
| `.lg-h` | 12 | inherits → 16.8 | 700 | 0 | `muted` |
| `.lg-l` | 12 | inherits → 16.8 | 600 | 0 | `muted`, centered, tabular |
| `.season-h` | 19 | 1.2 → 22.8 | 800 | −.01em → −0.19 | `ink` |
| `.season p` | 14 | 1.45 → 20.3 | 400 | 0 | `ink2` |
| `.season-top` | (icon 20) | | | | `onSand` |

### 2.5 Welcome

| Selector | Size | lh | Weight | ls | Color |
|---|---|---|---|---|---|
| `.wel-name` | 28 | inherits → 39.2 | 800 | −.02em → −0.56 | `#ffffff` |
| `.wel-for` | 13 | inherits → 18.2 | 700 | .07em → 0.91 | `#e3c46a`, uppercase |
| `.wel-h` | 25 | 1.18 → 29.5 | 800 | −.02em → −0.5 | `#ffffff` |
| `.wel-p` | 15 | 1.5 → 22.5 | 400 | 0 | `rgba(255,255,255,.8)` |
| `.wel-sh` | 17 | inherits → 23.8 | 800 | 0 | `ink` |
| `.steps i` | 14 | — | 800 | 0 | `#ffffff` on `navy` |
| `.steps b` | 15 | inherits → 21 | 700 | 0 | `ink` |
| `.steps span` | 13 | inherits → 18.2 | 400 | 0 | `muted` |
| `.wel-fine` | 13 | inherits → 18.2 | 400 | 0 | `muted`, centered; contains `.lnk` |

### 2.6 Intelligence

| Selector | Size | lh | Weight | ls | Color (fixed light values inside `.intel`) |
|---|---|---|---|---|---|
| `.it-k` | 15 | inherits → 21 | 800 | 0 | `#14213d` |
| `.it-t` | 16 | 1.45 → 23.2 | 600 | 0 | `#14213d` |
| `.it-f .it-l` | 14 | inherits | 700 | 0 | `#34425e` |
| `.ib-k` | 13 | inherits → 18.2 | 800 | .06em → 0.78 | `#5d6678`, uppercase |
| `.ib-time` | 13 | inherits | 500 | 0 | `#5d6678` |
| `.ib-h` | 21 | 1.2 → 25.2 | 800 | −.015em → −0.315 | `#14213d` |
| `.ib-list li` | 15 | 1.45 → 21.75 | 400; `b` 700 | 0 | `#34425e`; `b` `#14213d` |
| `.ib-list li::before` | 13 | — | 800 | 0 | `#ffffff` on `#0e2248` |
| `.ib-src` | 12 | inherits → 16.8 | 600 | 0 | `#5d6678` |
| `.ib-voice b` | 15 | inherits | 800 | 0 | `#14213d` |
| `.ib-voice span.d` | 13 | inherits | 400 | 0 | `#5d6678` |
| `.iw` | inherit | inherit | inherit | inherit | horizontal gradient text (§3.20) |

### 2.7 Marketing / share

| Selector | Size | lh | Weight | ls | Color |
|---|---|---|---|---|---|
| `.camp b` | 15 | 1.25 → 18.75 | 800 | 0 | `ink` |
| `.camp small` | 13 | inherits | 500 | 0 | `muted` |
| `.pc-t`, `.pc-b` | 12 | — | 800 | 0 | `#fff` on `#0e2248`; `#0e2248` on `#f6efd9` |
| `.shh b` | 15 | 1.25 → 18.75 | 800 | 0 | `ink` |
| `.shh small` | 12 | inherits | 600 | 0 | `muted` |
| `.tc-top` | 12 | inherits | 700 | .06em → 0.72 | `rgba(255,255,255,.74)`, uppercase |
| `.tc-addr` | 16 | inherits → 22.4 | 800 | 0 | `#ffffff` |
| `.tc-tot b` | 34 | 1 → 34 | 800 | −.04em → −1.36 | `#ffffff`; 2dp `#b8972a` underline |
| `.tc-tot span` | 13 | inherits | 400 | 0 | `rgba(255,255,255,.76)` |
| `.tc-l div` | 13 | inherits → 18.2 | 400; `b` 700 | 0 | `#ffffff` |
| `.tc-ag b` | 13 | inherits | 800 | 0 | `#14213d` |
| `.tc-ag small` | 12 | inherits | 600 | 0 | `#5d6678` |
| `.tc-ag span.a` | 13 | — | 800 | 0 | `#ffffff` on `#0f8b8d` |
| `.targets div` | 12 | inherits → 16.8 | 600 | 0 | `ink2` |

### 2.8 Notification shade (Roboto, fixed colors)

| Selector | Size | lh | Weight | Color |
|---|---|---|---|---|
| `.sh-clock b` | 44 | 1 | 400 | `#1a1c22` |
| `.sh-clock span` | 14 | inherits | 500 | `#44474f` |
| `.qs div` | 14 | 1.2 | 500 | `#1a1c22`; `.on` `#ffffff` |
| `.qs small` | 12 | 1.2 | 500 | 80% opacity of parent |
| `.ngh` | 12 | inherits | 500 | `#44474f` |
| `.nitem b` | 15 | 1.3 | 500 | `#1a1c22` |
| `.nitem p` | 14 | 1.4 | 400 | `#44474f` |
| `.nact span` | 14 | inherits | 500 | `#1456a0` |
| `.sh-foot span` | 14 | inherits | 500 | `#1a1c22` |

Smallest type anywhere: 12sp. Nothing below the 12sp floor.

---

## 3. Component specs

Sizes dp; radii dp; "L/D" = light/dark.

### 3.1 Status bar (`.sb.and`)
- Absolute top, full width, **height 40**, z 25. Padding `2 20 0 24` (time at x=24, icons end at x=412−20).
- Roboto 500 14sp; color `ink`. Background `background` (default) or transparent (`.clear`). `.light` forces `#ffffff` text.
- Right cluster `.sb-i`: gap 6; wifi 16×16, signal 15×15, battery 10×16 SVG glyphs in `currentColor`. Time text "9:30".
- Android modes per screen: welcome `clear light`; farm `clear`; notifications `clear`; all others default.
- Compose: go edge-to-edge and let the system draw the status bar; match icon/text tone (dark icons on light, light icons on dark). The 40dp is the mockup allowance; use `WindowInsets.statusBars` in code.

### 3.2 Punch hole (`.punch`) and gesture bar (`.gbar`)
- `.punch`: 14×14 circle, `#050505`, top 13, horizontally centered. Device hardware; not drawn by the app.
- `.gbar`: 108×4, radius 2, bottom 9, centered, `ink` at 85% opacity. System gesture handle; app draws nothing, keeps navigation bar transparent.

### 3.3 Scroll container (`.scroll`)
- Fills the screen; vertical scroll; no scrollbar.
- Android padding: **top 40, bottom 128** (default, clears the 104 nav bar + 24).
- `.pb-act` → bottom **168** (clears the 146 action area + 22). `.pb-sm` → bottom **110** (no nav bar).

### 3.4 Top app bar (`.mbar`)
- Row, height **64**, padding `0 4`, gap 4, no background (sits on `background`), no elevation/divider.
- `.mib` icon button: **48×48**, radius 24, color `ink`, icon **24**.
- `.mtitle`: weight 1, padding-left 4, 22sp/700/lh 26.4, ellipsis. Title x = 60 with a leading icon, x = 8 without one (mockup value; tighter than the M3 default of 16).
- Trailing actions: successive 48dp buttons, gap 4, last one ends 4dp from the right edge.

### 3.5 Search bar (`.msearch`)
- Row, margin `8 16 0` (width 380), **height 56**, radius **28**, padding `0 6 0 18`, gap 14.
- Background `m3ContainerHigh`; text `muted` 16sp/500; leading icon 22 (`search`), trailing `.avatar` **40×40** (14sp).
- Farm overlay variant (inline style): `position:absolute; top:40` (+8 margin → top edge at **48dp**), left/right margins 16, z 26, background **`surface`**, shadow `0 2 8 shadow`; content: `map` icon 22, text **`ink` 700 16sp** "Birchwood Park · 412 homes", trailing `.mib` 48×48 with `layers` icon 24.

### 3.6 Page head (`.mhead`, `.eb`, `.mhl`)
- `.mhead` padding-top 22. `.eb` block, padding `0 20`, padding-bottom 4 inside `.mhead`. `.mhl` padding `0 20`.

### 3.7 Card (`.card`) and tints
- Margin `16 16 0`; padding `16 18`; radius **24**; background `surface`; border **1dp `line`** (plain card only).
- `.navy`: background `navy`, border transparent, text `onNavy`.
- `.sky` / `.sand` / `.mint`: backgrounds `sky`/`sand`/`mint`, border transparent, text `ink`.
- No elevation on any card.

### 3.8 Card label (`.ch`)
- 12sp/700/lh 15.6/ls 0.84/uppercase; color rules in §2.1. Display block (its own line).

### 3.9 Section header (`.sh`)
- Row, baseline-aligned, space-between, gap 12, padding `24 20 0`. Left `h4` 20sp/800; right `.lnk` 15sp/700 `link`.

### 3.10 List container (`.rows`) and row (`.row`)
- `.rows`: margin `10 16 0`; radius 24; background `surface`; border 1dp `line`; clip children.
- `.row`: grid **40 / 1fr / auto**, column gap 12, vertically centered, **min-height 66**, padding `11 14`.
- Separator between rows: 1dp `separator`, from **x = 66** (14 + 40 + 12) to the right edge, drawn at the top of every row after the first.
- Trailing `.chev`: `chevron_right` 22, `muted`.
- `.row.tk` (task): grid **28 / 1fr / auto**; separator inset **54**. Leading `.tick` **24×24** circle, 2dp border `fill2`, no fill. Trailing `.tka` pill: min **44×44**, padding `0 14`, radius 22, background `tint`, text `onTint` 14sp/700, or icon 20 (`call`).
- `.row.q` (follow-up): grid **28 / 1fr / auto**; **min-height 56**; separator inset 54; leading icon 22 in `link`; middle text 15sp/600; trailing chevron.
- `.row.cl` (client): grid **40 / 1fr** (no trailing column), items aligned to top, padding `12 14`. Content column: `.cl-top` row (space-between, gap 8; title ellipsis; `.chip` on the right), `small` meta, `.nx` next-action row (gap 6, margin-top 6, min-height 28, icon 18, 14sp/700 `link`; `.nx.q` = `muted` 600, no icon). Separator inset 66 as for `.row`.

### 3.11 Tiles and chips
- `.tile`: **40×40**, radius **12**, icon 22. `t-sky` (`sky`/`onSky`), `t-sand` (`sand`/`onSand`), `t-mint` (`mint`/`onMint`), `t-navy` (`navy`/`#ffffff`), `t-fill` (`fill`/`ink2`).
- `.chip`: inline row, gap 4, **height 26**, padding `0 10`, radius **13**, 12sp/700, no wrap; icon **16**.
  `c-warn` (`warnContainer`/`onWarn`), `c-good` (`goodContainer`/`onGood`), `c-sky` (`sky`/`onSky`), `c-neutral` (`fill`/`ink2`).

### 3.12 Buttons (`.btn`)
- Row, centered, gap 8, padding `0 20`, **min-height 48**, radius **24**, 16sp/700, icon **20**, no wrap.
- `.primary`: `primary`/`onPrimary` (light: navy/white; dark: `#e3eaf7`/`#0e2248`).
- `.tint`: `tint`/`onTint` (tonal).
- `.outl`: transparent, text `ink`, **1dp `m3Outline`** border.
- `.sm`: min-height 48 (Android), 15sp, padding `0 16`.
- `.lbtns .rnd`: 48×48 circle, padding 0, tonal.

### 3.13 Key-value line (`.kv`)
- Row, space-between, baseline, gap 12, padding `5 0`; key 14sp; value `b` 15sp/700 tabular, no wrap; `small` under key 12sp `muted`. `.kv.m` greys both sides.

### 3.14 `.lead` / `.subl`
- `.lead` margin-top 6, 30sp/800/lh 31.5. `.subl` margin `2 0 8`, 13sp/500 `muted`.

### 3.15 Summary card (`.card.navy.sum`)
- Content: vertical grid, gap 12.
- `.sum-main`: row, bottom-aligned, gap 14. `.big` "10" 46sp with padding-bottom 5 and **2dp `gold` bottom border** (underline spans the glyph box width). `.sum-l` 16sp/600, padding-bottom 6, wraps.
- `.sum-grid`: 4 equal columns (344/4 = 86 each), top border 1dp `rgba(255,255,255,.14)`, padding-top 10. Each cell: `b` 19sp/800 over `span` 12sp/600 `onNavyMuted`, row gap 1. Columns 2–4: padding-left 12 and a 1dp `rgba(255,255,255,.14)` left border.

### 3.16 Intelligence card (`.intel`)
- Margin `16 16 0`; padding `16 18`; radius **24**; **2dp border**; shadow `0 14 34 rgba(30,57,91,.10)`.
- Surface **`#ffffff` in both themes** (`--intel-surface`). Text `#14213d`.
- Border: conic gradient centered on the card, angle animated: stops `#15b7c9 0°`, `#2478ff 90°`, `#7857ff 170°`, `#e84bc4 260°`, `#15b7c9 360°`; rotation **360° per 7s, linear, infinite**. Implement with `Brush.sweepGradient` on a rounded-rect stroke (draw a 24-radius rounded rect filled with the sweep brush, then the white surface inset 2dp with radius 22), rotating the brush via `rotate(angle)` in `drawWithContent`.
- Token overrides inside the card (ignore theme): `ink #14213d`, `ink2 #34425e`, `muted #5d6678`, `separator rgba(20,33,61,.10)`, `link #1456a0`, `fill rgba(20,33,61,.06)`, `tint #e4e8f0`, `onTint #0e2248`.
- Teaser variant contents: `.it-k` "Watchdog Intelligence" (word in `.iw`), `.it-t` body, `.it-f` footer row (gap 10, margin-top 12): `.mic` 44 circle `#0e2248` with filled `mic` 24 in white, `.it-l` "Ask by voice", then right-aligned `.lnk` "Read the brief" + `chevron_right` 22 (gap 2).

### 3.17 Spectrum word (`.iw`)
- Text filled with a horizontal linear gradient: `#0aaeb8` 0%, `#2478ff` 34%, `#7857ff` 67%, `#e84bc4` 100%, measured across the word's own box. Inherits font. Compose: `SpanStyle(brush = Brush.horizontalGradient(colorStops))` on the word only. Only the word "Intelligence" gets it; "Watchdog" stays in the surrounding text color. Never a pill or box.

### 3.18 Mic and play controls
- `.mic`: **44×44** circle, `#0e2248`, icon filled `mic` **24** white. `.mic.lg`: **56×56**.
- `.play`: row, gap 4, **min-height 44**, padding `0 14 0 10`, radius 22, `tint`/`onTint` (fixed `#e4e8f0`/`#0e2248` inside `.intel`), 14sp/700, leading filled `play_arrow` 22.

### 3.19 Brief internals (`.ib-*`)
- `.ib-top`: row, space-between, centered, gap 10. Left column: `.ib-k`, `.ib-time` (block, margin-top 2). Right: `.play`.
- `.ib-h`: margin-top 8.
- `.ib-list`: margin-top 10. Item: padding `12 0 12 34`, 15sp/lh 21.75 `#34425e`, bold lead in `#14213d`; numeral badge **24×24** circle `#0e2248`, white 13sp/800, at x 0, y 12 (top-aligned with first line). Items after the first: top border 1dp `rgba(20,33,61,.10)`. `.ib-src` block, margin-top 4, 12sp/600 `#5d6678`.
- `.ib-voice`: grid **56 / 1fr**, gap 12, centered, margin-top 6, padding-top 14, top border 1dp separator. Left `.mic.lg`; right `b` "Watchdog Intelligence Voice" (word in `.iw`) over `.d` 13sp (margin-top 1).

### 3.20 Composer bar (`.composer.m`)
- Absolute bottom, full width, z 30, background `m3Container`, no border/shadow; padding **12 16 30**; row, gap 10, centered. Total height **98**.
- `.fld`: weight 1, **height 56**, radius **28**, padding `0 18`, background `m3ContainerHigh`, placeholder `muted` 16sp/500.
- `.fab.sq`: **56×56**, radius 16, `m3Fab`/`m3OnFab`, filled `mic` 24, **no shadow** (static inside the bar).

### 3.21 Property header (`.phead`, `.ptags`)
- Padding `4 20 0`. `h3` 30sp/800/lh 33/ls −0.9; `p` margin-top 6, 14sp/500 `muted`; `.ptags` wrap row, gap 8, margin-top 12, holding `.chip`s.

### 3.22 Score card (`.card.navy.score`)
- Grid **118 / 1fr**, column gap 16, row gap 4, rows vertically centered. Text column width 344 − 118 − 16 = 210.
- Dial `.dial`: **118×118**. SVG viewBox 120 → scale 0.9833. Path `M23.23 96.77 A52 52 0 1 1 96.77 96.77`: center (60,60), radius 52, from the bottom-left point at **135°** sweeping **270° clockwise** to 45° (90° gap at the bottom). Stroke width 9 units → **8.85dp**, round caps. Track color `dialTrack`; value color `gold` with `stroke-dasharray "72 100"` on `pathLength 100` → the value arc covers **72% of 270° = 194.4°** from the same start. Compose: `drawArc(startAngle = 135f, sweepAngle = 270f)` then `drawArc(135f, 194.4f)`, `Stroke(8.85.dp, cap = Round)`, arc rect = 102.3dp square centered (radius 51.1dp).
- `.d-num` overlays the dial, centered, padding-top 4: "72" 38sp/800/ls −1.52, then `small` "of 100" 12sp/700 `onNavyMuted`, margin-top 4.
- Right column: `.ch` "Watchdog Score", `.verdict-t` (margin-top 4), `p` (margin-top 6).
- `.sfoot` spans both columns: margin-top 10, padding-top 10, top border 1dp `rgba(255,255,255,.14)`, 12sp/600 `onNavyMuted`.

### 3.23 Rate bars (`.spark`)
- Margin-top 10, padding-top 10, top border 1dp `separator`. `.spark-l` row space-between gap 8, 12sp/700 `onSky`: "Town rate per $100" / "+2.4% a year since 2020".
- SVG viewBox **300 × 84**, width 100% (= 344dp → scale **1.1467**; height 96.3dp), margin-top 6. Draw in a 300-unit space and scale uniformly, text included.
- Bars: `w 22`, `gap 16`, `x0 24`, baseline `base 64`, `H 40`, max 4.470. Rates 2020–2026: 3.877, 3.951, 4.046, 4.118, 4.212, 4.300, 4.470 → heights `round(r/4.47*40)` = **35, 35, 36, 37, 38, 38, 40**. Bar i: x = 24 + i·38 (24, 62, 100, 138, 176, 214, 252), y = 64 − h, top corners `rx 4`, bottom squared (a second 5-tall rect at y 59). Colors: last bar `spark`, others `spark2`.
- Labels: `.lab` "$4.470" 800 `ink`, centered on x 263, baseline y 18; "2020" centered x 35 and "2026" centered x 263, baseline y 80, 600 `muted`, font-size 12 units (≈13.8sp rendered).
- In dp at 344 width: bar 25.2 wide, gap 18.3, heights 40.1/40.1/41.3/42.4/43.6/43.6/45.9, baseline at 73.4.

### 3.24 Value line (`.vline`)
- Margin `10 0 2`. SVG viewBox **300 × 64**, width 100% (344dp, scale 1.1467, height 73.4dp).
- X mapping: `X(k) = 8 + (k − 300)/200 × 284` for $k thousand; floor 372.8 → **111.38**, implied value 428.8 → **190.90**, median 455 → **228.10**.
- Track: rect x 8, y 26, w 284, h **10**, rx **5**, `fill2`.
- Holds-up segment: rect x 111.38, y 26, w 180.62, h 10, rx 5, `onGood` at **32% opacity**.
- Floor marker: rect x 110.38, y 20, w 2.5, h 22, rx 1, `onGood`.
- Implied-value marker: rect x 189.90, y 24, w 2, h 14, rx 1, `ink2`.
- Median dot: circle cx 228.10, cy 31, r 7, fill `navy`, stroke `sand` 2.5.
- Text (12 units, 600 `muted`; `.strong` 800 `ink`): "Sales $455k" strong, centered on 228.10, baseline 13; "Holds up above $373k" centered on 111.38, baseline 58; "$300k" at x 8 baseline 13 (start); "$500k" at x 292 baseline 58 (end).

### 3.25 Verdict boxes (`.vd`)
- Margin-top 10, padding `10 12`, radius **14**, 13sp/lh 18.85; `b` block 14sp/700, margin-bottom 2.
- `.good`: `goodContainer`/`onGood`. `.warn`: `warnContainer`/`onWarn`. Bold and body share the box color.

### 3.26 Sale rows (`.sale`)
- Grid **1fr / auto / auto**, gap 12, baseline, padding `7 0`, top border 1dp `separator`; address 14sp; date 13sp `muted`; price 700 tabular.

### 3.27 Facts grid (`.facts`)
- 2 columns, gap `12 16`, margin-top 10; each cell label 12sp/600 `muted` above value 15sp/700, row gap 1.

### 3.28 ROBUST bars (`.rb`)
- Vertical grid, gap 8, margin-top 10. Row: grid **28 / 104 / 1fr / 28**, gap 10, centered, 13sp/600.
- Letter tile `i`: **28×28**, radius **8**, `navy`, white 13sp/800.
- Bar `s`: height **8**, radius **4**, `fill2`, clipped; fill `u`: `teal`, width = value %, radius `0 4 4 0`.
- Value `b`: right-aligned tabular. Values R 78, O 81, B 58, U 70, S 76, T 63.

### 3.29 Bottom action area (`.actbar.m`)
- Absolute bottom, full width, z 30; background `m3Container`; **top border 1dp `line`**; padding **12 16 30**; vertical grid gap 8. Height **146**.
- Row 1: `.btn.primary` full width. Row 2 `.two`: 2 equal columns, gap 8, `.btn.tint.sm` each.

### 3.30 Bottom sheet (`.sheet.and`) and scrim (`.dim`)
- Absolute bottom, full width, z 30; background `surface`; text `ink`; radius **28 28 0 0**; padding **0 16 30**; shadow `0 −4 24 shadow`. Height = content.
- `.handle`: **32×4**, radius 2, `m3Outline`, margin `14 auto 14` (centered).
- `.dim`: full-screen `scrim`, z 29 (under the sheet, over everything else).

### 3.31 Welcome hero and body
- `.wel`: column filling the screen, background `background`.
- `.wel-hero` (Android): padding **64 24 26**; background `linear-gradient(170deg, #0e2248 0%, #11306a 100%)`; text white; radius **0 0 28 28**.
- `.wel-brand`: row, centered, gap 14; `.logo` **60×60**, radius **15**, 1dp ring `rgba(255,255,255,.18)`; `.wel-name`.
- `.wel-for` margin-top 18; `.wel-h` margin-top 8; `.wel-p` margin-top 10.
- `.wel-body`: weight 1, column, padding **22 20 40**. `.wel-sh`; `.steps` margin-top 8: items grid **30 / 1fr**, gap 12, padding `10 0`, 1dp `separator` between items; numeral `i` **28×28** circle `navy`, white 14sp/800; `b` then `span` (margin-top 1).
- `.wel-cta`: pushed to the bottom (margin-top auto), vertical gap 10: `.btn.primary`, `.btn.outl` (icon `passkey` 20).
- `.wel-fine`: margin-top 12, centered 13sp `muted`, two lines, second line "New here? " + `.lnk` "Create an account".
- Logo artwork: 950×946 viewBox, diagonal gradient `#0d3185 → #064bcf (55%) → #1780ff` background, white dog path (`#wd-dog`). Ship as a vector drawable; clip to the container radius.

### 3.32 Segmented buttons (`.mseg`)
- 2 equal columns, margin `8 16 0`, **height 48**, 1dp `m3Outline` border, radius **24**, clipped. Segment: centered row, gap 8, 14sp/700 `ink2`, icon 18; 1dp `m3Outline` divider between segments; `.on` = `m3Indicator`/`m3OnIndicator` with a leading `check`.

### 3.33 Outlined text field (`.mfield`, `.msup`)
- Margin `18 16 0`; padding **18 44 10 16**; **2dp `ink` border**; radius **8**; background `background`.
- Floating label: absolute at top −9, left 12, padding `0 4`, background `background`, 12sp/700 `ink`.
- Value 15sp/500, single line, ellipsis. Trailing icon (`cancel`) 22, `muted`, at right 12, vertically centered.
- `.msup` supporting text: padding `6 32 0`, 12sp/lh 17.4 `muted`.

### 3.34 Read box (`.readbox`) — defined but not used on any screen
- Row gap 10, margin `14 16 0`, padding `10 14`, radius 16, `fill`, 13sp `ink2`, icon `teal` 22, `b` `ink`.

### 3.35 Result panel (`.wpanel`, `.wp-h`, `.wp-b`)
- `.wpanel`: margin `14 16 0`, radius **24**, clipped, `surface`, 1dp `line` border.
- `.wp-h`: row, gap 10, padding `10 14`, background **`#0e2248`**, white; logo **26×26** radius 7; `b` 15sp; `small` 12sp `rgba(255,255,255,.72)`.
- `.wp-b`: padding `12 14 14`.

### 3.36 Scan result internals (`.duo`, `.stile`, `.price`, `.lbtns`)
- `.duo`: grid **118 / 1fr**, gap 10, margin-top 12.
- `.stile`: radius **20**, padding `12 14`. `.navy` (`navy`, white text; `.ch` `onNavyMuted`); `.sky` (`sky`; `.ch` `onSky`).
- Navy tile: `.ch`, `.n` "57" + `small` " /100" (inline block, margin-top 6, padding-bottom 3, 2dp `gold` underline), `.v` "Mixed tax position" (margin-top 6).
- Sky tile: `.ch`, `.t` "$12,980" (margin-top 6), `.kv` "2025 bill" (no value), `.kv` "2026 at the new rate" / `b` "$13,330" (padding `3 0`, 12sp / 13sp).
- `.price`: row, space-between, baseline, gap 10, margin-top 10, padding `12 14`, radius **18**, `sand`; left `span` 13sp/600 `onSand` + `small` 12sp `muted`; right `b` 19sp/800 `ink`.
- `.lbtns` (Android): grid **1fr / auto / 48**, gap 8, margin-top 12; `.rnd` 48×48 circle.

### 3.37 Clients: season banner, chips, FAB
- `.card.sand.season`: vertical grid gap 6; `.season-top` row gap 8 in `onSand` with icon 20 + `.ch`; `.season-h`; `p`; `.btn.primary.sm` margin-top 6, hugging content (justify start).
- `.mchips`: horizontal scroll row, gap 8, padding **14 16 0**, no scrollbar.
- `.mchip`: **height 32**, padding `0 14`, radius **8**, 1dp `m3Outline`, `ink2` 14sp/700, background `background`, icon 18, gap 6. `.on`: `m3Indicator` fill, no border, `m3OnIndicator`, padding-left 10, leading `check`. `.el`: `surface` fill, no border, shadow `0 2 6 shadow`. Provide a 48dp touch target around the 32dp chip.

### 3.38 Extended FAB (`.fab`) and square FAB (`.fab.sq`)
- Absolute right 16, z 31; row, gap 12, **height 56**, padding **0 20 0 16**, radius **16**, `m3Fab`/`m3OnFab`, 15sp/700, icon 24, shadow `0 8 18 shadow`.
- `.sq`: width 56, padding 0, centered icon. Inside `.composer.m` the shadow is removed.
- Bottom offsets: Today/Clients `bottom:120` (FAB occupies y 716–772; 16dp above the nav bar), Farm `bottom:476` (y 360–416, overlapping the sheet's top edge).

### 3.39 Navigation bar (`.nav-m`)
- Absolute bottom, full width, z 30; 4 equal columns; **height 104**; padding **12 0 24**; background `m3Container`; no top border.
- `.nv`: column, centered, gap 4, 12sp/600 `muted`. `.ind` **64×32**, radius 16, icon 24 in `ink2`.
- `.nv.on`: label `ink` 800; indicator `m3Indicator` with icon `m3OnIndicator`, icon **filled**.
- Destinations: `home` Today, `group` Clients, `map` Farm, `campaign` Marketing.

### 3.40 Farm overlays and sheet (`.fsheet`)
- Map SVG fills the screen (`preserveAspectRatio slice`, viewBox 400×880), rotated −16° about (200,440). Layers bottom→top: land, water (`mapWater` stroke 14, round), road casings (`mapCasing` 14 wide) then roads (`mapRoad` 10 wide) on a 6×10 block grid, park rect (`mapPark`, rx 6) with label "Birchwood Park" 12/700 `onMint` rotated 90°, parcels (27.2×63 units, rx 2, 2-unit `mapLand` stroke; classes `mapScore1..5` inside the farm, `mapOutside` elsewhere), farm boundary (rect 306×566, rx 4, `mapBoundary` stroke 2.5, fill 5%), sold dots (r 5 `mapSoldDot`, 2-unit `mapLand` stroke), selected parcel (`ink` stroke 3.5, rx 3), street labels (12/700 `mapLabel`, ls 0.24, 4-unit `mapRoad` halo). Callout (unrotated): 150×46 rect rx 14, `surface` fill, `line` stroke, 8-unit pointer; "36 Birchwood Dr" 13/800 `ink`; "Score 72 · tax $11,284" 12/600 `muted`. Real app: use the map SDK; match the colors and the 5-band scale.
- Overlays: `.msearch` overlay at top 48 (§3.5); `.mchips` absolute at **top 110**, padding-top 0 (padding `0 16`), z 26; FAB at bottom 476; `.sheet.and.fsheet` at **bottom 104** (resting on the nav bar); nav bar.
- Sheet contents: `.handle`; `.top` row (title `h4`, `p` margin-top 2); `.lg` legend (margin-top 12): `.lg-h` row space-between 12sp/700 `muted` with right item = 10dp `mapSoldDot` circle ringed 2dp `surface` + "Sold in the last 12 months"; `.lg-bar` 5 equal bands, gap 2, margin-top 6, **height 12**, radius 2 (first `6 2 2 6`, last `2 6 6 2`), colors `mapScore1..5`; `.lg-l` 5 centered labels 12sp/600 `muted`, margin-top 4: "0–39", "40–54", "55–69", "70–84", "85+".
- `.fstats`: 3 equal tiles, gap 8, margin-top 12; tile padding `10 12`, radius **16**, `fill`; `b` 22sp/800, `span` 12sp/600 `muted`.
- `.turn`: margin-top 12; row grid **24 / 1fr**, gap 10, top-aligned, padding `8 0`, 13sp `ink2` with bold in `ink`; icon 20 `teal`; 1dp `separator` between rows.
- `.fnote`: margin-top 6, 12sp `muted`.

### 3.41 Campaign cards (`.card.camp`)
- Grid **106 / 1fr**, gap 14, centered, padding **12** (overrides the card's 16×18).
- `.pc` postcard thumb: **height 66**, radius **12**, clipped, 2 equal rows, shadow `0 2 8 shadow`. `.pc-t`: `#0e2248`, white 12sp/800, row gap 6, padding `0 8`, logo 16×16 radius 4, "Fall 2026". `.pc-b`: `#f6efd9`, `#0e2248` 12sp/800, padding `0 8`, "Median $455K".
- `.em` email thumb: height 66, radius 12, `sky`/`onSky`, centered icon **30** (`mark_email_read`).
- Right column: `b`, `small` (margin-top 2), `.chip` (margin-top 8).

### 3.42 Share header (`.shh`) and close button (`.xbtn`)
- Grid **48 / 1fr / 44**, gap 12, centered, padding-bottom 12, bottom border 1dp `separator`.
- `.th`: 48×48, radius 12, `#0e2248`, logo 26×26 radius 6 centered.
- `.xbtn`: **44×44** circle, `fill`, icon 22 `ink2` (`content_copy` on Android).

### 3.43 True cost card (`.tc`)
- Margin-top 12; radius **24**; clipped; background **`#0e2248`**; white text (both themes).
- `.tc-in` padding `14 16 12`: `.tc-top` row gap 8 with logo 20×20 radius 5 + "True cost card"; `.tc-addr` margin-top 6; `.tc-tot` row bottom-aligned gap 8 margin-top 8: `b` "$3,388" 34sp with padding-bottom 4 and **2dp `#b8972a`** underline, `span` "a month at $449,000" padding-bottom 5.
- `.tc-l` margin-top 10, gap 6; each line grid **1fr / auto** (label, value) gap `2 10`, 13sp, then a full-width bar `i` **height 6**, radius 3, `rgba(255,255,255,.14)`, fill `s` `#b8972a` radius `0 3 3 0` at **67% / 29% / 4%**.
- `.tc-ag` footer: grid **36 / 1fr**, gap 10, centered, padding `10 16`, background **`#ffffff`**, text `#14213d`; avatar `.a` 36 circle `#0f8b8d` white 13sp/800 "AM"; `b` 13sp/800; `small` 12sp/600 `#5d6678`.

### 3.44 Share targets (`.targets`)
- 4 equal columns, gap 8, margin-top 14, centered text 12sp/600 `ink2`; each cell column gap 6.
- Android circle **56×56** (radius 50%), icon **28**. `tg1` `#0f8b8d`/white filled `chat_bubble` "Messages"; `tg2` `#1456a0`/white filled `mail` "Mail"; `tg3` `fill2`/`ink` `link` "Copy link"; `tg4` `fill2`/`ink` `qr_code_2` "QR code".

### 3.45 Option row (`.optrow`)
- Row, space-between, centered, gap 12, margin-top 12, padding `10 14`, **min-height 52**, radius **18**, `fill`, 14sp/700; `small` block 12sp/500 `muted`; trailing `.sw-m`.

### 3.46 Material switch (`.sw-m`)
- Track **52×32**, radius 16, **2dp `m3Outline`** border, fill `m3ContainerHigh`.
- Off thumb: **16×16** circle `m3Outline` at inset (6,6).
- On: track and border `primary`; thumb **24×24** circle `onPrimary` at (2,22); `check` icon **18** in `primary` drawn over the thumb (icon box at top 5, left 25).
- Dark: track `#e3eaf7`, thumb `#0e2248`, check `#e3eaf7`.

### 3.47 Settings rows (`.mli`, `.msec`, `.mdiv`)
- `.mli`: grid **24 / 1fr / auto**, gap 16, centered, **min-height 72**, padding `10 20`; icon 24 `ink2`; `b` 16sp/700; `small` 14sp `muted` margin-top 2.
- Profile row override: min-height **84**, columns **40 / 1fr / auto**, `.avatar` 40×40 14sp, trailing `chevron_right` 22 `muted`.
- `.msec`: padding `22 20 4`, 14sp/800 `link`.
- `.mdiv`: 1dp `separator`, margin `4 20 0`.

### 3.48 Avatar (`.avatar`)
- Circle, `navy` fill, white 800 initials with 0.3sp tracking, **2dp inset `gold` ring** (`box-shadow: inset 0 0 0 2px`). Base 44×44/15sp; 40×40/14sp in the search bar and settings.

### 3.49 Notification shade mock (Android alerts screen; fixed system colors, Roboto)
- `.shade` backdrop: `linear-gradient(180deg, #0c1c3f, #173b86)`.
- `.shade-in`: full screen, padding `48 14 0`, background `rgba(236,239,246,.92)`, text `#1a1c22`.
- `.sh-clock`: row space-between bottom-aligned, padding `0 10`; "9:30" 44/400; "Mon, Sep 28" 14/500 `#44474f` padding-bottom 6.
- `.qs` quick tiles: 2 columns gap 8 margin-top 16; tile row gap 10, **height 64**, padding `0 16`, radius **32**, `#dde2ec`, 14/500 lh 1.2; `small` 12 at 80% opacity; `.on` `#0e2248`/white. Icons 22: filled `wifi` (on), `bluetooth`, `do_not_disturb_on`, `flashlight_on`.
- `.ngroup`: margin-top 16, radius **28**, `#fbfbfe`, clipped.
- `.ngh`: row gap 8, padding `14 16 4`, 12/500 `#44474f`; logo 20 circle; trailing `expand_less` 20 pushed right.
- `.nitem`: padding `8 16 14`; subsequent items top border 1dp `#e3e5ec` and padding-top 12; `b` 15/500 lh 1.3; `p` 14/400 lh 1.4 `#44474f` margin-top 2.
- `.nact`: row gap 4 margin-top 6; action min-height 40, padding `0 12` (first has no left padding), radius 20, 14/500 `#1456a0`.
- `.sh-foot`: row space-between margin-top 14 padding `0 6`; buttons min-height 40, padding `0 16`, radius 20, `#dde2ec`, 14/500 `#1a1c22`.
- This screen documents the notification design (group, channels, actions); it is rendered by the OS, not by Compose.

---

## 4. Screen-by-screen layout (Android, top to bottom)

Icon names are Material Symbols; "(filled)" marks `FILL 1`. Text is verbatim from the HTML. Unless noted the screen is
`background`-colored with the default status bar.

### 4.1 Welcome (`S.welcome.android`) — fills the screen, no scroll, no nav bar
Status bar: transparent, white text.
1. `.wel-hero` (padding 64 24 26, gradient, bottom radius 28)
   - `.wel-brand`: logo 60 + "Watchdog"
   - `.wel-for`: "For New Jersey agents and teams"
   - `.wel-h`: "Know every home in your sphere and farm before you call."
   - `.wel-p`: "Taxes, assessments, sales and permits for any New Jersey property, with the source for every number."
2. `.wel-body` (padding 22 20 40)
   - `.wel-sh`: "Start with three things"
   - `.steps`: 1 "Add your past clients" / "From your CRM or contacts. Each is matched to a parcel."; 2 "Draw your farm" / "Outline a neighborhood on the map."; 3 "Turn on the Monday email" / "Your top ten changes, Mondays at 8:00 AM."
   - `.wel-cta` (bottom-anchored): `.btn.primary` "Continue with email"; `.btn.outl` `passkey` "Use a passkey"
   - `.wel-fine`: "Same account as the Agent Desk on the web." ⏎ "New here? " + link "Create an account"
3. Gesture bar.

### 4.2 Today (`S.today.android`) — `.scroll` padding 40 0 128
1. `.msearch` (y 48–104): `search`, "Search any NJ address", avatar "AM"
2. `.mhead`: `.eb` "Monday, September 28"; `.mhl` "Today"
3. `.card.navy.sum`: `.ch` "This week · since Sep 21"; `.big` "10" + `.sum-l` "changes in your clients’ homes and your farm"; grid 3 "Tax bills", 2 "Permits", 4 "Sales", 1 "Town"
4. `.sh`: "Needs you" / link "5 this week"
5. `.rows` tasks (`.row.tk`):
   - tick; "Send 12 tax checkups" / "Final 2026 bills are out · appeals due Apr 1"; `.tka` "Review"
   - tick; "Call about 27 Hamilton St" / "Past client · 2026 bill up $612"; `.tka` icon `call`
   - tick; "Approve the fall postcard" / "Birchwood Park · 412 homes · mails Oct 6"; `.tka` "Open"
6. `.sh`: "Top changes" / link "See all 10"
7. `.rows` changes (`.row` with tile + chevron):
   - `t-sky` `receipt_long`; "2026 bill up $612" / "27 Hamilton St, Harrison · Past client"
   - `t-sand` `construction`; "Kitchen permit filed" / "61 Spring St, Red Bank · Sphere"
   - `t-mint` `account_balance`; "Revaluation set for 2027" / "Gloucester Twp · 38 homes in your farm"
   - `t-sky` `sell`; "Sold for $468,000" / "22 Birchwood Dr, Cherry Hill · Farm"
8. `.intel` teaser: "Watchdog **Intelligence**"; "Harrison’s 2026 rate rose 7%. Nine past clients’ bills went up, and their checkups are ready."; footer mic (filled `mic`) + "Ask by voice" … link "Read the brief" `chevron_right`
9. Overlays: `.fab` `bottom:120px` `qr_code_scanner` "Scan listing"; `.nav-m` with Today active (`home` filled).

### 4.3 Property (`S.property.android`) — `.scroll.pb-act` padding 40 0 168
1. `.mbar`: `arrow_back`; empty title; actions `bookmark_add`, `share`, `more_vert`
2. `.phead`: "36 Birchwood Dr"; "Cherry Hill Twp · Camden County · Block 285.14, Lot 9"; `.ptags`: chip `c-sky` `map` "Birchwood Park farm"; chip `c-neutral` "Class 2 residential"
3. `.card.navy.score`: dial 72; `.ch` "Watchdog Score"; `.verdict-t` "Favorable tax position"; p "The assessment holds up and the bill tracks the town. Evidence coverage 92%, high confidence."; `.sfoot` "The Watchdog Score, powered by the ROBUST Framework."
4. `.card.sky` tax: `.ch` "Property tax"; `.lead` "$11,284"; `.subl` "2025 bill on the state tax list"; `.kv` "2026 at the new rate" / "$11,730"; `.kv.m` "Cherry Hill median" / "$9,960"; `.spark` (§3.23)
5. `.card.sand` value: `.ch` "Value check"; `.kv` "Assessed" / "$262,400"; `.kv` "Matches a home worth" + small "town ratio 61%" / "$428,800"; `.kv` "Assessment holds up above" / "$372,800"; `.vline` (§3.24); `.vd.good` "Holds up at today’s prices" + "Seven similar homes nearby sold for a median $455,000 since January, well above $372,800."
6. `.card.mint` sales: `.ch` "Sales nearby"; `.kv` "7 similar sales since Jan 2026" / "median $455,000"; `.sale` "22 Birchwood Dr" · "Sep 2026" · "$468,000"; "9 Ashbrook Rd" · "Jul 2026" · "$441,500"; "51 Queen Anne Rd" · "Jun 2026" · "$472,000"; `.kv.m` "This home last sold" / "$312,000 · 2014"
7. `.card` facts: `.ch` "Home"; grid Class "2 · Residential"; Built "1962"; Style "2-story colonial"; Living area "1,980 sq ft"; Lot "0.28 acres"; Block and lot "285.14 · 9"
8. `.card` ROBUST: `.ch` "ROBUST Framework"; bars R Recourse 78; O Overassessment 81; B Burden 58; U Uniformity 70; S Stability 76; T Trajectory 63
9. `.src`: "Sources: NJ MOD-IV tax list, NJ Division of Taxation rates, 2026 Chapter 123 ratios, SR1A deed sales. A screening check, not an appraisal."
10. `.actbar.m` (fixed): `.btn.primary` `share` "Share true cost card"; `.two`: `.btn.tint.sm` `send` "Send tax checkup", `.btn.tint.sm` `bookmark_add` "Save to client". No nav bar.

### 4.4 Scan (`S.scan.android`) — `.scroll.pb-sm` padding 40 0 110, no nav bar
1. `.mbar`: `close`; "Scan a listing"; action `history`
2. `.mseg`: [`photo_camera` "Camera"] [`check` "Paste link" **on**]
3. `.mfield`: label "Listing link"; value "zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701"; trailing `cancel`
4. `.msup`: "Works with Zillow, Realtor.com and Redfin links. Share a listing to Watchdog from those apps to skip this step."
5. `.wpanel`: `.wp-h` logo + "143 Harding Rd, Red Bank" / "Monmouth County · Block 76, Lot 12"; `.wp-b`:
   - `.duo`: navy `.stile` (`.ch` "Watchdog Score"; "57" + " /100"; "Mixed tax position") | sky `.stile` (`.ch` "Property tax"; "$12,980"; kv "2025 bill"; kv "2026 at the new rate" / "$13,330")
   - `.price`: "List price" + small "From the pasted link" / "$849,000"
   - `.vd.warn`: "Low tax for this price" + "Homes that sell near $849,000 in Red Bank usually pay about $16,340. A town-wide revaluation could move this bill toward that."
   - `.lbtns`: `.btn.primary` `calculate` "True cost card"; `.btn.tint` "Full page"; `.btn.tint.rnd` `bookmark_add`

### 4.5 Clients (`S.clients.android`) — `.scroll` padding 40 0 128
1. `.mbar`: no leading icon; "Clients" (x 8); actions `search`, `tune`
2. `.card.sand.season`: `receipt_long` + `.ch` "Checkup season"; `.season-h` "12 tax checkups ready to send"; p "Final 2026 bills are out. Each checkup shows whether the assessment holds up and the April 1, 2027 appeal deadline."; `.btn.primary.sm` "Review and send"
3. `.mchips`: `.on` `check` "All 146"; "Past clients 58"; "Sphere 88"; "Checkup ready 12" (scrolls horizontally; the last chip is clipped at the right edge)
4. `.rows` (`.row.cl`):
   - `t-sky` `home`; "27 Hamilton St"; chip `c-warn` "Bill up $612"; "Harrison · Past client, 2019 · CRM-104"; `.nx` `call` "Call about the new bill"
   - `t-mint` `home`; "5 Laurel Ct"; chip `c-good` "Checkup ready"; "Gloucester Twp · Past client, 2021 · CRM-131"; `.nx` `send` "Send tax checkup"
   - `t-sand` `home`; "61 Spring St"; chip `c-sky` "Permit filed"; "Red Bank · Sphere · CRM-212"; `.nx` `mail` "Send a renovation note"
   - `t-fill` `home`; "418 Kresson Rd"; chip `c-neutral` `cake` "10 years Oct 7"; "Cherry Hill · Past client, 2016 · CRM-088"; `.nx` `edit` "Write an anniversary card"
   - `t-fill` `home`; "402 Harrison Ave"; chip `c-neutral` "Watching"; "Harrison · Sphere · CRM-247"; `.nx.q` "Nothing new this week"
5. Overlays: `.fab` `bottom:120px` `person_add` "Add clients"; `.nav-m` Clients active (`group` filled).

### 4.6 Farm (`S.farm.android`) — `.fill.farm`, no scroll
Status bar transparent (`ink` text over the map).
1. Map (§3.40) with street labels "Queen Anne Rd", "Birchwood Dr", "Ashbrook Rd", "Laurel Ln", "Heritage Rd" (rotated), park "Birchwood Park", callout "36 Birchwood Dr" / "Score 72 · tax $11,284"
2. `.msearch` overlay (top 48, `surface`, shadow): `map`; "Birchwood Park · 412 homes" (`ink` 700); `.mib` `layers`
3. `.mchips` overlay (top 110): `.on` `check` "Score"; `.el` "Residential"; `.el` "Sold in 12 mo"; `.el` "Permits"
4. `.fab` `bottom:476px` `draw` "Draw area"
5. `.sheet.and.fsheet` `bottom:104px`: handle; "Birchwood Park" / "Cherry Hill Twp · 412 homes · your farm since Aug"; legend ("Watchdog Score" … dot "Sold in the last 12 months"; 5 bands; "0–39" "40–54" "55–69" "70–84" "85+"); `.fstats` "63" "Median score" | "21" "Sales in 12 mo · 5.1%" | "9" "Permits in 90 days"; `.turn` `trending_up` "**7 sales since June** at a median $455,000, up 6% on last year"; `sell` "**Deed recorded Sep 18:** 22 Birchwood Dr, $468,000"; `.fnote` "Neighborhood totals from public records. Watchdog never labels a home as a likely seller."
6. `.nav-m` Farm active (`map` filled).

### 4.7 Marketing (`S.marketing.android`) — `.scroll` padding 40 0 128, share sheet open
1. `.mbar`: no leading icon; "Marketing"; actions `search`, `more_vert`
2. `.mtabs` (3 equal, 48 tall, bottom border 1dp `line`, margin-top 4): "Campaigns" **on** (3dp `ink` indicator spanning the middle 44% of the tab, radius 3 3 0 0), "Cards", "My page"
3. `.card.camp`: `.pc` ("Fall 2026" with logo / "Median $455K"); "Birchwood Park fall update"; "Postcard · 412 homes · mails Oct 6"; chip `c-warn` "Proof ready"
4. `.card.camp`: `.em` `mark_email_read`; "September market update"; "Email · 146 contacts · sent Sep 21"; chip `c-good` "48% opened · 9 replies"
5. `.dim` scrim over the page.
6. `.sheet.and` (content-sized, ≈574dp tall): handle; `.shh` thumb + "True cost of 36 Birchwood Dr" / "watchdogindex.com · with your contact card" + `.xbtn` `content_copy`; `.tc` (§3.43: "True cost card"; "36 Birchwood Dr, Cherry Hill"; "$3,388" "a month at $449,000"; "Mortgage · 30 yrs at 6.5%" $2,270 67%; "Property tax" $978 29%; "Home insurance" $140 4%; footer "AM" "Prepared by Alex Moreno" / "Northfield & Main Realty · Red Bank"); `.targets` Messages / Mail / Copy link / QR code; `.optrow` "Include my contact card" + small "Name, brokerage, phone and email" + `.sw-m` on.
No nav bar is visible behind the sheet in this state (the mockup omits it).

### 4.8 Intelligence (`S.intelligence.android`) — `.scroll` padding 40 0 128
1. `.mbar`: `arrow_back`; "Watchdog **Intelligence**" (spectrum word in the title); action `history`
2. `.lt-sub` (inline `padding-top:0` → padding 0 20 0): "For Alex · Monday, September 28"
3. `.intel` brief: `.ib-top` ("Monday brief"; "8:00 AM · 2 min read"; `.play` filled `play_arrow` "Listen 1:52"); `.ib-h` "Three things worth your time this week"; `.ib-list`:
   1. "**Harrison’s 2026 rate rose 7%.** Nine past clients’ bills went up between $380 and $640. Their tax checkups are ready to send." src "NJ Division of Taxation, 2026 rates"
   2. "**Gloucester Twp revalues for 2027.** In your Glendora farm, 38 homes are assessed below 80% of recent nearby sale prices, so their bills may rise." src "Township notice · SR1A deed sales"
   3. "**Birchwood Park is moving.** Seven sales since June at a median $455,000, 6% above last year." src "SR1A deed sales"
   `.ib-voice`: mic lg (filled `mic`); "Watchdog **Intelligence** Voice" / "Ask a follow-up out loud, hands-free."
4. `.sh`: "Ask a follow-up" (no trailing link)
5. `.rows` (`.row.q`): `chat_bubble` "Which Harrison clients should I call first?"; `edit` "Draft a note to the nine Harrison clients"; `compare_arrows` "Compare Glendora with Blackwood"; each with chevron
6. `.composer.m` (fixed bottom, 98 tall): field "Ask about a home, client or town"; `.fab.sq` filled `mic`. No nav bar.

### 4.9 Notifications (`S.notifications.android`) — `.fill.shade`, no scroll
Status bar transparent (`ink` text).
1. `.shade-in`: `.sh-clock` "9:30" / "Mon, Sep 28"
2. `.qs`: `.on` filled `wifi` "Internet" / "Home"; `bluetooth` "Bluetooth" / "Off"; `do_not_disturb_on` "Do Not Disturb" / "Off"; `flashlight_on` "Flashlight" / "Off"
3. `.ngroup`: `.ngh` logo "Watchdog · now" `expand_less`;
   - "Your Monday brief is ready" / "10 changes in your clients’ homes and farm. Top: the final 2026 bill at 27 Hamilton St, Harrison rose $612." actions "Open brief", "Call client"
   - "Deed recorded in Birchwood Park" / "22 Birchwood Dr sold for $468,000. Seven sales in your farm since June." action "View farm"
   - "12 tax checkups are ready" / "Final 2026 bills are out. Appeals are due April 1." actions "Send checkups", "Later"
4. `.sh-foot`: "Manage" / "Clear all"

### 4.10 Settings (`S.settings.android`) — `.scroll.pb-sm` padding 40 0 110, no nav bar
1. `.mbar`: `arrow_back`; "Settings"; action `search`
2. Profile `.mli` (min-height 84, 40/1fr/auto): avatar 40 "AM"; "Alex Moreno" / "Agent plan · Northfield & Main Realty"; `chevron_right`
3. `.mdiv`
4. `.msec` "Monday email"; `.mli` `mail` "Email me my top ten" / "Mondays at 8:00 AM" switch on; `.mli` `notifications` "Also send it as a notification" switch on
5. `.msec` "Alerts"; `.mli` `receipt_long` "Client home changes" / "Tax bills, assessments and permits" on; `sell` "Farm sales and deeds" / "New deeds in your farm" on; `account_balance` "Town rates and revaluations" **off**; `gavel` "Appeal deadlines" / "30 and 7 days before" on; `bedtime` "Quiet hours" / "9 PM to 7 AM" (no control)
6. `.msec` "App"; `.mli` `dark_mode` "Theme" / "System default" (no control)

### 4.11 Icon inventory for Android frames
`search`, `qr_code_scanner`, `call`, `receipt_long`, `construction`, `account_balance`, `sell`, `chevron_right`, `mic` (filled),
`home` (filled when active), `group` (filled when active), `map` (filled when active; outlined in chips/search), `campaign`
(filled when active), `arrow_back`, `bookmark_add`, `share`, `more_vert`, `send`, `close`, `history`, `photo_camera`,
`check`, `cancel`, `calculate`, `tune`, `person_add`, `cake`, `mail` (filled in share targets; outlined in settings/next
action), `edit`, `layers`, `draw`, `trending_up`, `mark_email_read`, `content_copy`, `chat_bubble` (filled in share
targets; outlined in follow-ups), `link`, `qr_code_2`, `play_arrow` (filled), `compare_arrows`, `notifications`, `gavel`,
`bedtime`, `dark_mode`, `passkey`, `wifi` (filled), `bluetooth`, `do_not_disturb_on`, `flashlight_on`, `expand_less`.

---

## 5. Dark mode deltas beyond token swaps

1. **Watchdog Intelligence card stays white.** `.intel` keeps `#ffffff` surface, the same conic border, the same shadow,
   and forces light-theme ink tokens inside (`#14213d`, `#34425e`, `#5d6678`, separator `rgba(20,33,61,.1)`, link
   `#1456a0`, fill `rgba(20,33,61,.06)`, tint `#e4e8f0`/`#0e2248`). The `.play` pill and follow-up link inside it therefore
   look identical in both themes. The rows list *below* the card ("Ask a follow-up") does follow the dark tokens.
2. **Primary flips to a light fill.** `primary` becomes `#e3eaf7` with `#0e2248` content, so filled buttons, the extended
   FAB (`m3Fab`), the square composer FAB and the on-state switch all render light-on-dark. Do not keep them navy in dark.
3. **Fixed-navy surfaces do not lighten.** `.mic`, brief numerals, `.wp-h`, `.pc-t`, `.shh .th`, `.tc`, `.tc-ag` (white
   footer), share targets `tg1`/`tg2`, the welcome hero gradient and the `#e3c46a` eyebrow are identical in dark. Only
   `.card.navy`, `.stile.navy`, `.tile.t-navy`, `.rb i`, `.steps i` and `.avatar` use the themed `navy` (`#1b2e57`).
4. **Map palette direction reverses** (§1.9) so the legend must read the theme tokens, not a fixed ramp. The selected
   parcel outline uses `ink` (light in dark); the boundary uses `mapBoundary` (`#b9cdf0`).
5. **On-image chrome.** Status bar over the welcome hero is white in both themes (`.light`). On Farm the status bar text is
   `ink` (dark on light map, light on dark map). The gesture bar is `ink` at 85%. `.onimg` (white gesture bar) is iOS-only.
6. **Notification shade mock keeps its fixed light system colors in dark**, so the `ink`-colored status bar time becomes
   near-invisible in the dark render. Treat this as a mockup artifact: the OS owns both surfaces.
7. **Elevation.** `shadow` becomes `rgba(0,0,0,.45)`; the FAB, elevated chips, farm search bar, sheets and postcard thumb
   get visibly stronger shadows in dark. `.intel` keeps its fixed `rgba(30,57,91,.1)` shadow.
8. `.vline` median dot ring uses `sand` (`#2a2515` in dark) on the navy dot; the tax spark uses `spark2 #34507e` for prior
   years. `.sw-m` off track uses `m3ContainerHigh #18253f` with a `#3c4a69` border and thumb.
9. Tonal buttons (`tint`) become `rgba(255,255,255,.10)` with `#eef2fa` text; `.tka`, `.play` (outside `.intel`) and
   `.btn.tint` follow. Outlined button border is `#3c4a69`.

---

## 6. Motion and accessibility notes

- **Intelligence border rotation**: `@keyframes wd-spin` animates the conic angle 0°→360° over **7s, linear, infinite**.
  `@media (prefers-reduced-motion: reduce)` sets `animation: none` (border stays at 0°: `#15b7c9` at the top-center,
  proceeding clockwise). In Compose read `LocalAccessibilityManager`/`Settings.Global.ANIMATOR_DURATION_SCALE` (or the
  platform "Remove animations" setting) and freeze the sweep brush when animations are disabled.
- **Spectrum word fallback**: `@media (forced-colors: active)` replaces the gradient text with `CanvasText` and removes
  the background. Provide a plain `ink`-colored fallback when high-contrast/forced-colors accessibility is active, in
  print, and in `contentDescription` (always the literal words "Watchdog Intelligence").
- **Touch targets**: minimum 48dp on Android. Icon buttons 48; buttons 48; FAB 56; task pills ≥44 (give them a 48dp
  touch area); chips are 32dp tall and must expose a 48dp hit area; switch 52×32 inside a 48dp target; share targets 56;
  sheet handle needs a 48dp drag area; ticks (24) need a 48dp touch area.
- **Type floor**: 12sp is the smallest size used anywhere in the app frames (labels, sources, legend). Do not go below it
  and keep sp (user font scaling) on.
- **Semantics from the markup**: dial has `role="img"` "Watchdog Score 72 out of 100"; spark `aria-label` "Cherry Hill
  general tax rate rose from $3.877 in 2020 to $4.470 in 2026"; value line "The assessment holds up above $372,800.
  Similar homes nearby sold for a median of $455,000."; map "Farm map of Birchwood Park with parcels colored by Watchdog
  Score"; mic controls "Watchdog Intelligence Voice". Icons are `aria-hidden` (decorative) wherever text accompanies them.
- **Focus**: page-level `:focus-visible` is a 2dp accent outline with 3dp offset and 6dp radius; use Material focus
  indication with the same visibility.
- **Status/gesture chrome**: the app is edge-to-edge; status-bar and navigation-bar backgrounds are transparent and the
  content applies `WindowInsets` (mockup allowances: 40 top, 104 nav bar, 24 gesture inset inside the nav bar).
- **Brand rules preserved in the mockup**: the rotating border belongs to the outer Intelligence card only; only the word
  "Intelligence" carries the spectrum; no pills or boxes around the words; "Watchdog Intelligence" is the only product
  name used ("Watchdog Intelligence Voice" for the mic).
