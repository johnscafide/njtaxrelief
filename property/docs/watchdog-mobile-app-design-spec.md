# Watchdog Agent App: design and build spec (iOS and Android)

This is the handoff brief for designing and building the Watchdog agent app. It describes the approved concept mockups (September 2026) in words, so a designer or developer can work from this file alone.

- **Approved mockups:** https://claude.ai/artifact/4LEC3gje96oVqoV5crPmPr. They show ten screens on iPhone and Android in light and dark, plus the design system.
- **Product:** Watchdog, New Jersey property intelligence. Production site: https://www.watchdogindex.com.
- **Audience:** New Jersey real estate agents on the Agent plan and above.
- **Status:** approved concept. Nothing is built yet.

---

## 1. What the app is for

Agents work their clients and farm from the car, the curb and the kitchen table at an open house. The website's Agent Desk already does the work. The app puts the parts that matter on the move in the agent's pocket:

1. **Who should I call this week, and why?** This is the Monday digest as a living screen.
2. **What's the story on this house?** Look up any NJ property in seconds, or scan a For Sale sign.
3. **Send something useful under my name.** Tax checkups, postcards, email updates and the buyer true cost card.
4. **Tell me when something changes.** Push alerts tied to specific homes.

Every screen runs on data Watchdog already has. The app is a new front end on the existing backend, not a new product.

### Principles

- **Answer first.** Each screen opens with the one number or sentence the agent needs, then the detail.
- **Native on each platform.** Brand colors, type and cards are shared. Navigation, sheets, buttons, switches and lists follow each platform: iOS Human Interface Guidelines with Liquid Glass bars, and Android Material 3.
- **Plain language.** Write like a helpful colleague and avoid jargon. Every number says where it came from.
- **Privacy is a feature.** See section 7. This is non-negotiable.

---

## 2. Platforms and frames

| | iOS | Android |
|---|---|---|
| Design frame | iPhone 393 × 852 pt | Pixel 412 × 892 dp |
| Design language | HIG, Liquid Glass toolbars and tab bar | Material 3, edge to edge |
| Minimum touch target | 44 × 44 pt | 48 × 48 dp (chips are 32 dp tall with a 48 dp hit area) |
| Sign-in | Email code or passkey (system sheet) | Email code or passkey (Credential Manager) |
| Share | System share sheet with a custom preview | Android Sharesheet with a rich preview and a Copy action |
| Themes | Light and dark. Follows the system, with an override in Settings. | Same |

Sign-in uses the same account as the Agent Desk on the website: Supabase Auth with the six-digit email code already used on the site. Nothing is set up twice.

---

## 3. Navigation

**Tabs:** Today · Clients · Farm · Marketing.

- **iOS:** a floating glass tab bar with the four tabs, plus **Search** as its own button. Large titles, and toolbar buttons in glass.
- **Android:** a navigation bar with the four destinations, a search bar at the top of Today, and an extended FAB for **Scan**.

Pushed screens are Property detail, Watchdog Intelligence, Alerts and Settings. Scan opens as a sheet (iOS) or a full-screen camera or paste flow (Android).

---

## 4. Screens

Each screen lists its job, its content from top to bottom, the platform notes, and the data it uses. The sample data in the mockups is illustrative: the addresses, figures, agent and brokerage are fictional.

### 01 · Welcome and sign in (first run)
- **Job:** an agent decides in the first minute whether the app is for them.
- **Content:**
  - who it's for (NJ agents) and what Watchdog watches (assessments, tax bills, deeds, permits)
  - three setup steps: add past clients, draw a farm, turn on the Monday email
  - sign in with email or a passkey
- **iOS:** the navy header runs under the status bar. Capsule buttons. The passkey opens the system sign-in sheet.
- **Android:** edge to edge, with filled and outlined Material buttons. Credential Manager handles the passkey.
- **Data:** Supabase Auth, same project as the site.

### 02 · Today (Home tab)
- **Job:** before the agent has parked the car, answer who to call this week and why.
- **Content:**
  1. Search and Scan at the top (looking up a house is the most common action).
  2. The count of changes this week.
  3. Tasks that need a tap (e.g. "Send 12 checkups", "Call about a bill that rose $612").
  4. Each change as a row: the home, the relationship, and the public-record reason.
  5. An entry to the Watchdog Intelligence brief.
- **iOS:** large title with toolbar buttons in glass, and a floating tab bar with a separate Search button.
- **Android:** search bar at the top, an extended FAB for Scan, and a navigation bar.
- **Data:**
  - Monday digest (`agent-opportunity-digest`)
  - client and farm changes (`agent-contact-intelligence`, `farm-intelligence-scan`)
  - tax checkups (`/api/watchdog-checkup`)

### 03 · Property detail
- **Job:** the screen pulled up on a doorstep or across a kitchen table.
- **Content:**
  1. The **Watchdog Score** (0–100) dial and its verdict. Always name it "The Watchdog Score, powered by the ROBUST Framework". Never call it a "ROBUST Score".
  2. This year's tax bill, and next year's at the new rate.
  3. Value check: whether the assessment holds up at today's prices. The value line shows the price the assessment needs against what similar homes sold for.
  4. Nearby sales, home facts, and the ROBUST breakdown.
  5. Pinned actions: Share true cost card, Send checkup, Save/Watch.
- **iOS:** glass back and share buttons. The action bar floats above the home indicator, and the tab bar hides on push.
- **Android:** top app bar with a back arrow, and a bottom action area with filled and tonal buttons. Predictive back returns to the list.
- **Data:**
  - score (`workbench-score` and its precomputed public cache: every NJ property with an assessment has one)
  - markers (`workbench-hydrate`)
  - public page data (`/api/watchdog-property-page`)
  - photos (`/api/property-imagery`)

### 04 · Scan a listing
- **Job:** agents meet listings on the street and in text threads more than in a browser. This screen brings the browser extension's panel to the phone.
- **Content:**
  - camera mode: read the sign's QR rider and confirm the parcel by the phone's location
  - paste mode: a Zillow, Realtor.com or Redfin link
  - result: the price check (is the tax in line for the price, or likely to move after a revaluation?), the score, and a link to Property detail
- **iOS:** camera mode. The result opens in a medium-detent sheet so the sign stays in view.
- **Android:** paste mode, and links shared from a listing app land here through the Android share target.
- **Both platforms** get both modes.
- **Data:** `/api/watchdog-extension` (same service as the Chrome extension v1.1), plus `/api/watchdog-true-cost`.

### 05 · Clients (tab)
- **Job:** give the agent a real reason to reach past clients.
- **Content:**
  - Each row leads with the **home**, then the relationship and the agent's own CRM reference. Never a public-record owner name.
  - A status chip for what changed ("Bill up $612", "Checkup ready", "Permit filed", "Watching").
  - The next action.
  - After final bills go out, a checkup banner gathers every ready checkup into one send.
- **iOS:** segmented control for the three lists. Swipe a row to send or snooze.
- **Android:** filter chips for the lists, and an extended FAB to add clients from contacts or a CSV.
- **Data:** agent contacts and CRM links (`agent-contact-intelligence`) and checkups (`/api/watchdog-checkup`).

### 06 · Farm (tab)
- **Job:** a farm is the neighborhood an agent wants to be known in.
- **Content:**
  - A map with every parcel colored by Watchdog Score, and gold dots for homes sold in the last 12 months.
  - A bottom sheet with neighborhood-level turnover from public deed records: sales, prices and permits.
  - **Watchdog never tags a single home as a likely seller.**
- **iOS:** map under glass controls, like Apple Maps. The sheet has medium and large detents.
- **Android:** floating search bar and chips over the map, a standard bottom sheet, and a FAB to draw a new area.
- **Data:** `farm-map-query`, `farm-workspace`, `farm-intelligence-scan`.

### 07 · Marketing (tab)
- **Job:** turn the data into something the agent sends under their own name. The whole Marketing area is available on the Agent plan.
- **Content:**
  - postcards and email updates, with status and results
  - the buyer **true cost card**: one tap shares a listing's real monthly cost, property tax included, with the agent's contact card, through the phone's share sheet
- **iOS:** system share sheet with a custom preview of the card.
- **Android:** Sharesheet with a rich preview and a Copy action.
- **Data:** `pcm-postcard-studio` (Postcard Studio), the newsletter studio, `/api/watchdog-true-cost`.

### 08 · Watchdog Intelligence (brief and Voice)
- **Job:** read the week's changes and write the short version an agent wants from an assistant: three things, with numbers and sources. **Watchdog Intelligence Voice** takes follow-up questions while the agent drives.
- **Brand rule:**
  - The rotating cyan → blue → violet → magenta border sits **only on the outer briefing card**, and the card stays a white surface even in dark mode.
  - In the product name, only the word **Intelligence** gets the spectrum color. "Watchdog" stays in the normal text color.
  - Never put the name in a pill or capsule.
  - Respect reduced motion: no rotation, show a static border.
- **iOS:** pushed full screen from Today. The composer floats in glass above the home indicator.
- **Android:** the top app bar keeps the full product name. The mic is a FAB-sized control.
- **Data:** `intelligence-brief`, `intelligence-analyst`, `intelligence-property-context`. For Voice, use the platform speech APIs on the device (the free in-browser voice is what the site uses today).

### 09 · Alerts (notifications)
- **Job:** the reason the app belongs on a phone.
- **Content:**
  - Each alert fires when something changed for a specific home, and says what changed in the notification itself, so the agent can decide without opening the app.
  - The Monday brief lands at 8:00 AM local, the same time as the email.
- **iOS:** grouped on the Lock Screen. A long press shows Send checkup and Open.
- **Android:** a notification group with action buttons. Channels match the alert switches in Settings.
- **Data:** `property-alert-sender`, and the digest preferences behind the Monday email (on by default, weekday Monday, 8 AM America/New_York).

### 10 · Settings
- **Content:**
  - Mirrors the Agent Desk. The Monday email is on by default and one switch turns it off.
  - One switch per alert type, so an agent can keep deed alerts and silence town news.
  - Quiet hours, the theme override (System, Light or Dark), account and plan, and sign out.
- **iOS:** inset grouped list with teal switches.
- **Android:** Material list with section headers. Switches show a check when on.

### Dark mode
- Keep the board look in dark: the navy score card and the tinted tax, value and sales cards, with colors tuned for a dark ground rather than inverted.
- Gold and teal are lifted so the score arc, bars and value line stay readable on navy.
- Status tints drop to deep tones so white text stays on top.
- The Watchdog Intelligence card stays white.

---

## 5. Design system

### Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| bg (Paper) | `#f3f1ec` | `#0b1426` | App background |
| ink | `#14213d` | `#eef2fa` | Primary text |
| ink-2 | `#34425e` | `#c9d2e3` | Secondary text |
| muted | `#5d6678` | `#9ea9bf` | Supporting text |
| line | `#e3dfd6` | `#22304d` | Dividers |
| navy | `#0e2248` | `#1b2e57` | Headers, score card, primary |
| primary / on-primary | `#0e2248` / `#ffffff` | `#e3eaf7` / `#0e2248` | Filled buttons |
| gold | `#b8972a` | `#d4b24a` | Score arc, key numbers |
| teal | `#0f8b8d` | (lifted) | Map scale, switches |
| sky / sky-ink | `#e3edfb` / `#1456a0` | `#162a4a` / `#a9c8f5` | Tax cards |
| sand / sand-ink | `#f6efd9` / `#7a5d0c` | `#2a2515` / `#e6c872` | Value check, checkups |
| mint / mint-ink | `#dff1ec` / `#0f6e5c` | `#10302b` / `#80d7c3` | Sales |
| good-bg / good-ink | `#e1f3ea` / `#1d6843` | `#113024` / `#8fdcb0` | Positive status |
| red | `#c4322b` | `#ff6b61` | Increases, warnings |
| link | `#1456a0` | `#8fbaf6` | Links |
| glass | `rgba(255,255,255,.76)` | `rgba(36,49,78,.7)` | iOS glass bars |
| Spectrum | `#0aaeb8 → #2478ff → #7857ff → #e84bc4` | same | **Watchdog Intelligence only** |

**Watchdog Score map scale** uses one hue, darker for higher, with five bands: 0–39, 40–54, 55–69, 70–84, 85+.

### Type (Plus Jakarta Sans; system chrome keeps the platform face)

| Style | Size / line | Weight |
|---|---|---|
| Large title (iOS) | 32 / 38 | 800 |
| Headline (Material 3) | 30 / 36 | 800 |
| Section title | 20 / 24 | 800 |
| Row title and button | 15–16 | 700 |
| Body and supporting | 15 / 21 | 500 |
| Card label | 12, all caps, light tracking | 700 |

Nothing in the app goes below **12 px**. Use tabular numbers for money and scores.

### Shape and components
- **Cards:** 24 px radius, flat, and tinted by meaning (sky for tax, sand for value, mint for sales). No heavy shadows.
- **Status chips:** "Bill up $612", "Checkup ready", "Permit filed", "Watching".
- **Buttons:** capsules on iOS; filled and tonal on Android.
- **Score dial:** a gold arc on a navy card, with the number and verdict inside.

---

## 6. Accessibility
- Touch targets meet the minimums in section 2.
- Support Dynamic Type (iOS) and font scaling (Android) without clipping.
- VoiceOver and TalkBack labels on every control. The score reads as "Watchdog Score 72 out of 100, strong".
- Respect Reduce Motion, which turns off the rotating Intelligence border.
- Color is never the only signal: chips carry text, and map bands have a legend.
- Contrast is AA or better in both themes.

---

## 7. Privacy and trust rules (non-negotiable)
- **Never show or store owner names or owner mailing addresses** (including the owner's mailing ZIP). Rows lead with the home and the agent's own CRM reference.
- **Never label a single home as a likely seller.** Farm turnover is neighborhood-level only. Carry the "not a seller prediction" note into every notification channel description.
- Every number cites its public source: MOD-IV, the SR-1A deed record, the county board, NJDEP and so on.
- Billing follows the website's existing plan gates. The app never bypasses them.
- Camera and location are used only for sign scanning, with clear purpose strings.

---

## 8. Before anyone writes code
1. **Prototype test:** put a clickable prototype of Today, Property and Scan in five agents' hands during a real week. Watch where they reach for search versus the camera.
2. **Share targets on both platforms:** a listing link shared from any app should open straight into the scan result. This is the fastest route to daily use.
3. **Widgets and Lock Screen:** a "This week" widget with the change count and the top change, and a checkup-season Live Activity in February.
4. **Store review readiness:** camera and location purpose strings, privacy nutrition labels, and the "not a seller prediction" note.

## 9. Suggested build approach
- One shared codebase is fine (React Native/Expo or Flutter) **if** it renders native navigation, sheets, switches and share sheets on each platform. Otherwise build native: SwiftUI and Jetpack Compose.
- Backend: the existing Supabase project and edge functions (listed per screen above), plus the site's `/api/*` routes on www.watchdogindex.com. The only new server work is push notification registration and delivery (APNs and FCM) hooked into the existing alert sender.
- Auth redirect URLs for the app must be added to the approved list in Supabase. Don't change the shared Site URL, which also serves NJPropertyTaxRelief.com.
